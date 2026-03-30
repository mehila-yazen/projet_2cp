from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine
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
