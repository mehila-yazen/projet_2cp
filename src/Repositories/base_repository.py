from typing import Any, Generic, TypeVar

from sqlalchemy.orm import Session


ModelType = TypeVar("ModelType")


class BaseRepository(Generic[ModelType]):
    def __init__(self, model: type[ModelType]):
        self.model = model

    def create(self, db: Session, **kwargs) -> ModelType:
        instance = self.model(**kwargs)
        db.add(instance)
        db.flush()
        db.refresh(instance)
        return instance

    def get_by_id(self, db: Session, entity_id: Any) -> ModelType | None:
        return db.get(self.model, entity_id)

    def list(self, db: Session, limit: int | None = None, offset: int = 0) -> list[ModelType]:
        query = db.query(self.model).offset(offset)
        if limit is not None:
            query = query.limit(limit)
        return query.all()

    def update(self, db: Session, entity_id: Any, **kwargs) -> ModelType | None:
        instance = self.get_by_id(db, entity_id)
        if instance is None:
            return None
        for key, value in kwargs.items():
            if hasattr(instance, key):
                setattr(instance, key, value)
        db.flush()
        db.refresh(instance)
        return instance

    def delete(self, db: Session, entity_id: Any) -> bool:
        instance = self.get_by_id(db, entity_id)
        if instance is None:
            return False
        db.delete(instance)
        db.flush()
        return True
