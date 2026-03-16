from dataclasses import asdict, dataclass
from datetime import datetime


@dataclass(slots=True)
class PeriodeProgramme:
    id: int | None = None
    libelle: str = ""
    ordre: int | None = None
    programme_id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "PeriodeProgramme":
        return cls(**data)
