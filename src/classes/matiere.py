from dataclasses import asdict, dataclass
from datetime import datetime


@dataclass(slots=True)
class Matiere:
	id: int | None = None
	code: str = ""
	title: str = ""
	coefficient: float = 1.0
	created_at: datetime | None = None
	updated_at: datetime | None = None

	def __post_init__(self) -> None:
		if self.coefficient <= 0:
			raise ValueError("coefficient must be greater than 0")

	def to_dict(self) -> dict:
		return asdict(self)

	@classmethod
	def from_dict(cls, data: dict) -> "Matiere":
		return cls(**data)
