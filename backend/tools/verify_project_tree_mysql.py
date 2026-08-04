"""Verify project/tree migration behavior against a disposable MySQL database."""

from __future__ import annotations

import asyncio
import os
import re
import subprocess
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import Settings

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def require_test_database(database_name: str) -> None:
    if not re.fullmatch(r"[A-Za-z0-9_]+", database_name):
        raise RuntimeError("Test database name contains unsafe characters")
    if not database_name.endswith("_test"):
        raise RuntimeError("Refusing to operate on a database without the _test suffix")


def run_alembic(database_url: str, *arguments: str) -> None:
    environment = os.environ.copy()
    environment["DATABASE_URL"] = database_url
    subprocess.run(
        [sys.executable, "-m", "alembic", *arguments],
        cwd=BACKEND_ROOT,
        env=environment,
        check=True,
    )


async def assert_integrity_error(connection, statement: str, values: dict[str, object]) -> None:
    transaction = await connection.begin_nested()
    try:
        await connection.execute(text(statement), values)
    except DBAPIError:
        await transaction.rollback()
    else:
        await transaction.rollback()
        raise AssertionError("Expected MySQL to reject the invalid row")


async def verify_constraints_and_cascades(database_url: str) -> None:
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(
                text(
                    "INSERT INTO users (id, login_name, password_hash) "
                    "VALUES ('user-1', 'mysql-verifier', 'unused')"
                )
            )
            await connection.execute(
                text(
                    "INSERT INTO workspaces (id, owner_user_id, name) "
                    "VALUES ('workspace-1', 'user-1', 'Verifier')"
                )
            )
            await connection.execute(
                text(
                    "INSERT INTO projects (id, workspace_id, name, status) "
                    "VALUES ('project-1', 'workspace-1', 'Renovation', 'planning')"
                )
            )
            await connection.execute(
                text(
                    "INSERT INTO nodes "
                    "(id, project_id, parent_id, sibling_scope, name, normalized_name, sort_order) "
                    "VALUES "
                    "('root-1', 'project-1', NULL, '__root__', 'Appliances', 'appliances', 0), "
                    "('child-1', 'project-1', 'root-1', 'root-1', 'Fridge', 'fridge', 0)"
                )
            )

            await assert_integrity_error(
                connection,
                "INSERT INTO projects (id, workspace_id, name, status) "
                "VALUES ('project-invalid', 'workspace-1', 'Invalid', 'unknown')",
                {},
            )
            await assert_integrity_error(
                connection,
                "INSERT INTO nodes "
                "(id, project_id, parent_id, sibling_scope, name, normalized_name, sort_order) "
                "VALUES ('root-duplicate', 'project-1', NULL, '__root__', "
                "'APPLIANCES', 'appliances', 1)",
                {},
            )

            await connection.execute(
                text(
                    "INSERT INTO nodes "
                    "(id, project_id, parent_id, sibling_scope, name, normalized_name, sort_order) "
                    "VALUES ('child-same-name', 'project-1', 'root-1', 'root-1', "
                    "'Appliances', 'appliances', 1)"
                )
            )
            await connection.execute(
                text("DELETE FROM projects WHERE id = 'project-1'")
            )
            remaining_nodes = await connection.scalar(
                text("SELECT COUNT(*) FROM nodes WHERE project_id = 'project-1'")
            )
            if remaining_nodes != 0:
                raise AssertionError("Project deletion did not cascade to nodes")
    finally:
        await engine.dispose()


async def table_names(database_url: str, database_name: str) -> list[str]:
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as connection:
            names = (
                await connection.execute(
                    text(
                        "SELECT table_name FROM information_schema.tables "
                        "WHERE table_schema = :database_name ORDER BY table_name"
                    ),
                    {"database_name": database_name},
                )
            ).scalars().all()
            if names == ["alembic_version"]:
                version_rows = await connection.scalar(
                    text("SELECT COUNT(*) FROM alembic_version")
                )
                if version_rows == 0:
                    await connection.execute(text("DROP TABLE alembic_version"))
                    return []
            return list(names)
    finally:
        await engine.dispose()


async def main() -> None:
    configured_url = make_url(Settings().DATABASE_URL)
    if not configured_url.drivername.startswith("mysql"):
        raise RuntimeError("This verifier requires a MySQL DATABASE_URL")
    if configured_url.database is None:
        raise RuntimeError("DATABASE_URL must name a database")
    default_test_database = f"{configured_url.database.removesuffix('_test')}_pytest_test"
    test_database = os.environ.get("PROJECT_TREE_TEST_DATABASE", default_test_database)
    require_test_database(test_database)

    test_url = configured_url.set(database=test_database).render_as_string(hide_password=False)
    existing_tables = await table_names(test_url, test_database)
    if existing_tables:
        raise RuntimeError(
            f"Refusing destructive verification: {test_database} contains "
            f"{len(existing_tables)} tables"
        )

    downgraded = False
    try:
        run_alembic(test_url, "upgrade", "head")
        await verify_constraints_and_cascades(test_url)
        run_alembic(test_url, "downgrade", "base")
        downgraded = True
    finally:
        remaining_tables = await table_names(test_url, test_database)
        if remaining_tables and not downgraded:
            run_alembic(test_url, "downgrade", "base")
            remaining_tables = await table_names(test_url, test_database)

    if remaining_tables:
        raise AssertionError(f"Downgrade left {len(remaining_tables)} tables behind")

    print(
        "PASS: MySQL upgrade, constraints, cascades, and downgrade restored the empty "
        f"test database ({test_database})"
    )


if __name__ == "__main__":
    asyncio.run(main())
