from dataclasses import asdict, dataclass
from datetime import datetime


@dataclass(slots=True)
class Formation:
    id: int | None = None
    programme_id: int | None = None
    annee_univ_id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "Formation":
        return cls(**data)
