from dataclasses import asdict, dataclass
from datetime import datetime


@dataclass(slots=True)
class RechercheNameLog:
    id: int | None = None
    etudiant_id: int | None = None
    terme_recherche: str = ""
    terme_normalise: str | None = None
    type_recherche: str | None = None
    resultats_trouves: int = 0
    correction_utilisateur: bool = False
    date_recherche: datetime | None = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "RechercheNameLog":
        return cls(**data)
