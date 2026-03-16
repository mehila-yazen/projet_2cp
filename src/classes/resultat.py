from dataclasses import asdict, dataclass
from datetime import datetime


@dataclass(slots=True)
class Resultat:
    id: int | None = None
    inscriptionPer_id: int | None = None
    module_id: int | None = None
    moy: float | None = None
    note_cc: float | None = None
    note_exam: float | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        for field_name in ("moy", "note_cc", "note_exam"):
            value = getattr(self, field_name)
            if value is not None and not (0 <= value <= 20):
                raise ValueError(f"{field_name} must be between 0 and 20")

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "Resultat":
        return cls(**data)
