import os
import sqlite3
import subprocess
import sys
from pathlib import Path


def test_project_tree_migration_upgrade_and_downgrade(tmp_path: Path) -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    database_path = tmp_path / "migration.sqlite3"
    environment = {
        **os.environ,
        "DATABASE_URL": f"sqlite+aiosqlite:///{database_path}",
    }
    alembic = str(Path(sys.executable).with_name("alembic"))

    subprocess.run(
        [alembic, "upgrade", "head"],
        cwd=backend_dir,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    with sqlite3.connect(database_path) as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        assert {"users", "workspaces", "auth_sessions", "projects", "nodes"} <= tables

    subprocess.run(
        [alembic, "downgrade", "0001_auth"],
        cwd=backend_dir,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    with sqlite3.connect(database_path) as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        assert "projects" not in tables
        assert "nodes" not in tables
        assert {"users", "workspaces", "auth_sessions"} <= tables
