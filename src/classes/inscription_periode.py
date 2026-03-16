from dataclasses import asdict, dataclass
from datetime import datetime


@dataclass(slots=True)
class InscriptionPeriode:
    id: int | None = None
    inscription_id: int | None = None
    periodepgm_id: int | None = None
    groupe_id: int | None = None
    moy: float | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "InscriptionPeriode":
        return cls(**data)
