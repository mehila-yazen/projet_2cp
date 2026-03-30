from dataclasses import asdict, dataclass
from datetime import date, datetime


@dataclass(slots=True)
class Etudiant:
	id: int | None = None
	nom: str = ""
	prenom: str = ""
	matricule: str | None = None
	sexe: str | None = None
	date_naissance: date | None = None
	lieu_naissance: str | None = None
	nom_soundex: str | None = None
	prenom_soundex: str | None = None
	nom_metaphone: str | None = None
	prenom_metaphone: str | None = None
	nom_trigram: str | None = None
	prenom_trigram: str | None = None
	matricule_normalise: str | None = None
	matricule_prefixes: str | None = None
	created_at: datetime | None = None
	updated_at: datetime | None = None

	def __post_init__(self) -> None:
		if self.sexe is not None and self.sexe not in {"M", "F", "Autre"}:
			raise ValueError("sexe must be one of: 'M', 'F', 'Autre'")

	@property
	def full_name(self) -> str:
		return f"{self.nom} {self.prenom}".strip()

	def to_dict(self) -> dict:
		return asdict(self)

	@classmethod
	def from_dict(cls, data: dict) -> "Etudiant":
		return cls(**data)
