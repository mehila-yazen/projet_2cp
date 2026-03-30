from dataclasses import asdict, dataclass
from datetime import datetime


@dataclass(slots=True)
class Inscription:
	id: int | None = None
	etudiant_id: int | None = None
	formation_id: int | None = None
	groupe_id: int | None = None
	moy: float | None = None
	rachat: bool = False
	rattrapage: bool = False
	rang: int | None = None
	decisionJury: str | None = None
	observation: str | None = None
	date_inscription: datetime | None = None
	created_at: datetime | None = None
	updated_at: datetime | None = None

	def __post_init__(self) -> None:
		if self.moy is not None and not (0 <= self.moy <= 20):
			raise ValueError("moy must be between 0 and 20")

	def to_dict(self) -> dict:
		return asdict(self)

	@classmethod
	def from_dict(cls, data: dict) -> "Inscription":
		return cls(**data)
