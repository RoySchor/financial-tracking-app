import sqlite3
import os
from pathlib import Path
from contextlib import contextmanager

DB_PATH = os.getenv("DB_PATH", str(Path(__file__).parent.parent / "data" / "finance.db"))
MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()


def run_migrations():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        current = conn.execute("SELECT COALESCE(MAX(version), 0) FROM schema_version").fetchone()[0]

        migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
        for f in migration_files:
            version = int(f.stem.split("_")[0])
            if version <= current:
                continue

            sql = f.read_text()
            conn.executescript(sql)
            conn.execute("INSERT INTO schema_version (version) VALUES (?)", (version,))
            conn.commit()
            print(f"Applied migration {f.name}")
