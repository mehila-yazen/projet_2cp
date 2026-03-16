from dataclasses import asdict, dataclass
from datetime import datetime


@dataclass(slots=True)
class Programme:
	id: int | None = None
	code: str = ""
	titre: str = ""
	doctorat: bool = False
	created_at: datetime | None = None
	updated_at: datetime | None = None

	def to_dict(self) -> dict:
		return asdict(self)

	@classmethod
	def from_dict(cls, data: dict) -> "Programme":
		return cls(**data)
