from dataclasses import asdict, dataclass
from datetime import datetime


@dataclass(slots=True)
class Module:
    id: int | None = None
    matiere_id: int | None = None
    periode_id: int | None = None
    coefficient: float | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "Module":
        return cls(**data)
