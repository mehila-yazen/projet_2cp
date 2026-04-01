from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from src.Database.models import Base


DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "Database" / "database.db"


def build_sqlite_url(db_path: str | Path | None = None) -> str:
    target = Path(db_path) if db_path is not None else DEFAULT_DB_PATH
    return f"sqlite:///{target.resolve()}"


def create_sqlite_engine(db_path: str | Path | None = None):
    return create_engine(
        build_sqlite_url(db_path),
        connect_args={"check_same_thread": False},
        future=True,
    )


def create_session_factory(engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


engine = create_sqlite_engine()
SessionLocal = create_session_factory(engine)


def init_database() -> None:
    Base.metadata.create_all(bind=engine)
    _migrate_matiere_unique_constraint()


def _migrate_matiere_unique_constraint() -> None:
    """Migrate `matiere` uniqueness from `code` to `(code, title, coefficient)` for SQLite."""
    with engine.begin() as conn:
        index_rows = conn.execute(text("PRAGMA index_list('matiere')")).mappings().all()
        has_triplet_unique = any(
            str(row.get("name") or "") == "ux_matiere_code_title_coefficient" for row in index_rows
        )
        has_code_unique = any(int(row.get("unique") or 0) == 1 for row in index_rows if str(row.get("name") or "") != "ux_matiere_code_title_coefficient")

        if has_triplet_unique and not has_code_unique:
            return

        conn.execute(text("PRAGMA foreign_keys=OFF"))

        conn.execute(text("DROP TABLE IF EXISTS matiere_new"))
        conn.execute(
            text(
                """
                CREATE TABLE matiere_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    code VARCHAR NOT NULL,
                    title VARCHAR NOT NULL,
                    coefficient FLOAT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT ck_matiere_coefficient CHECK (coefficient > 0)
                )
                """
            )
        )

        conn.execute(
            text(
                """
                INSERT INTO matiere_new (id, code, title, coefficient, created_at, updated_at)
                SELECT id, code, title, coefficient, created_at, updated_at
                FROM matiere
                """
            )
        )

        conn.execute(text("DROP TABLE matiere"))
        conn.execute(text("ALTER TABLE matiere_new RENAME TO matiere"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_matiere_code ON matiere(code)"))
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ux_matiere_code_title_coefficient ON matiere(code, title, coefficient)"
            )
        )

        conn.execute(text("PRAGMA foreign_keys=ON"))


@contextmanager
def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
