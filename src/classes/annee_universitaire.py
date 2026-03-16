from dataclasses import asdict, dataclass
from datetime import date, datetime


@dataclass(slots=True)
class AnneeUniversitaire:
    id: int | None = None
    annee: str = ""
    date_debut: date | None = None
    date_fin: date | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        if self.date_debut and self.date_fin and self.date_fin <= self.date_debut:
            raise ValueError("date_fin must be greater than date_debut")

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "AnneeUniversitaire":
        return cls(**data)
