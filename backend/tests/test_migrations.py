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


def test_0006_backfills_applicable_conditions(tmp_path: Path) -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    database_path = tmp_path / "migration-0006.sqlite3"
    environment = {
        **os.environ,
        "DATABASE_URL": f"sqlite+aiosqlite:///{database_path}",
    }
    alembic = str(Path(sys.executable).with_name("alembic"))

    subprocess.run(
        [alembic, "upgrade", "0005_source_attachments"],
        cwd=backend_dir,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            INSERT INTO sources (id, workspace_id, source_type, title, content)
            VALUES ('source-1', 'workspace-1', 'text', '来源标题', '来源正文');

            INSERT INTO extractions (
                id, source_id, workspace_id, status, title, content,
                entry_type, applicable_conditions, sort_order
            )
            VALUES (
                'extraction-1', 'source-1', 'workspace-1', 'accepted',
                '候选标题', '候选正文', 'experience',
                '["底部散热型号", "以安装图为准"]', 0
            );

            INSERT INTO entries (
                id, workspace_id, project_id, extraction_id, entry_type,
                title, content, status
            )
            VALUES (
                'entry-1', 'workspace-1', 'project-1', 'extraction-1',
                'experience', '正式标题', '正式正文', 'archived'
            );

            INSERT INTO entries (
                id, workspace_id, project_id, entry_type, title, content, status
            )
            VALUES (
                'entry-2', 'workspace-1', 'project-1',
                'experience', '无候选标题', '无候选正文', 'archived'
            );
            """
        )
        connection.commit()

    subprocess.run(
        [alembic, "upgrade", "head"],
        cwd=backend_dir,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    with sqlite3.connect(database_path) as connection:
        rows = dict(
            connection.execute(
                "SELECT id, applicable_conditions FROM entries"
            ).fetchall()
        )
        assert rows["entry-1"] == '["底部散热型号", "以安装图为准"]'
        assert rows["entry-2"] is None

    subprocess.run(
        [alembic, "downgrade", "0005_source_attachments"],
        cwd=backend_dir,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    with sqlite3.connect(database_path) as connection:
        columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(entries)").fetchall()
        }
        assert "applicable_conditions" not in columns


def test_0019_backfills_risk_points_from_extraction(tmp_path: Path) -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    database_path = tmp_path / "migration-0019.sqlite3"
    environment = {
        **os.environ,
        "DATABASE_URL": f"sqlite+aiosqlite:///{database_path}",
    }
    alembic = str(Path(sys.executable).with_name("alembic"))

    subprocess.run(
        [alembic, "upgrade", "0018_project_summary"],
        cwd=backend_dir,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            INSERT INTO sources (id, workspace_id, source_type, title, content)
            VALUES ('source-1', 'workspace-1', 'text', '来源标题', '来源正文');

            INSERT INTO extractions (
                id, source_id, workspace_id, status, title, content,
                entry_type, risk_points, sort_order
            )
            VALUES (
                'extraction-1', 'source-1', 'workspace-1', 'accepted',
                '候选标题', '候选正文', 'parameter',
                '["散热方式不同，余量要求不同"]', 0
            );

            INSERT INTO entries (
                id, workspace_id, project_id, extraction_id, entry_type,
                title, content, status
            )
            VALUES (
                'entry-1', 'workspace-1', 'project-1', 'extraction-1',
                'parameter', '正式标题', '正式正文', 'archived'
            );

            INSERT INTO entries (
                id, workspace_id, project_id, entry_type, title, content, status
            )
            VALUES (
                'entry-2', 'workspace-1', 'project-1',
                'experience', '无候选标题', '无候选正文', 'archived'
            );
            """
        )
        connection.commit()

    subprocess.run(
        [alembic, "upgrade", "head"],
        cwd=backend_dir,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    with sqlite3.connect(database_path) as connection:
        rows = {
            row[0]: (row[1], row[2])
            for row in connection.execute(
                "SELECT id, risk_points, key_params FROM entries"
            ).fetchall()
        }
        assert rows["entry-1"] == ('["散热方式不同，余量要求不同"]', None)
        assert rows["entry-2"] == (None, None)

    subprocess.run(
        [alembic, "downgrade", "0018_project_summary"],
        cwd=backend_dir,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    with sqlite3.connect(database_path) as connection:
        columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(entries)").fetchall()
        }
        assert "risk_points" not in columns
        assert "key_params" not in columns


def test_0012_source_fingerprints_upgrade_and_downgrade(tmp_path: Path) -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    database_path = tmp_path / "migration-0012.sqlite3"
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
        sources_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(sources)").fetchall()
        }
        attachments_columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(source_attachments)"
            ).fetchall()
        }
        assert {"content_hash", "link_hash", "duplicate_of_id"} <= sources_columns
        assert "file_hash" in attachments_columns
        source_indexes = {
            row[1]
            for row in connection.execute("PRAGMA index_list(sources)").fetchall()
        }
        attachment_indexes = {
            row[1]
            for row in connection.execute(
                "PRAGMA index_list(source_attachments)"
            ).fetchall()
        }
        assert "ix_sources_workspace_content_hash" in source_indexes
        assert "ix_sources_workspace_link_hash" in source_indexes
        assert "ix_source_attachments_workspace_file_hash" in attachment_indexes

    subprocess.run(
        [alembic, "downgrade", "0011_review_merge_ignored"],
        cwd=backend_dir,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    with sqlite3.connect(database_path) as connection:
        sources_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(sources)").fetchall()
        }
        attachments_columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(source_attachments)"
            ).fetchall()
        }
        assert "content_hash" not in sources_columns
        assert "link_hash" not in sources_columns
        assert "duplicate_of_id" not in sources_columns
        assert "file_hash" not in attachments_columns
