from dataclasses import asdict, dataclass
from datetime import datetime


@dataclass(slots=True)
class Groupe:
    id: int | None = None
    code: str = ""
    formation_id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "Groupe":
        return cls(**data)
