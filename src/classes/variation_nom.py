from dataclasses import asdict, dataclass
from datetime import datetime


@dataclass(slots=True)
class VariationNom:
    id: int | None = None
    etudiant_id: int | None = None
    nom_canonique: str = ""
    variation: str = ""
    frequence: int = 1
    derniere_utilisation: datetime | None = None
    created_at: datetime | None = None

    def __post_init__(self) -> None:
        if self.frequence < 1:
            raise ValueError("frequence must be at least 1")

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "VariationNom":
        return cls(**data)
