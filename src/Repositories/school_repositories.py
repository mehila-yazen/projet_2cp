from sqlalchemy import func
from sqlalchemy.orm import Session

from src.Database.models import Etudiant, Inscription, Matiere, Programme
from src.Repositories.base_repository import BaseRepository


class EtudiantRepository(BaseRepository[Etudiant]):
    def __init__(self):
        super().__init__(Etudiant)

    def get_by_matricule(self, db: Session, matricule: str) -> Etudiant | None:
        return db.query(Etudiant).filter(Etudiant.matricule == matricule).first()

    def search_by_name(self, db: Session, term: str, limit: int = 20) -> list[Etudiant]:
        normalized = term.strip().lower()
        if not normalized:
            return []
        pattern = f"%{normalized}%"
        return (
            db.query(Etudiant)
            .filter(
                (func.lower(Etudiant.nom).like(pattern))
                | (func.lower(Etudiant.prenom).like(pattern))
                | (func.lower(Etudiant.matricule).like(pattern))
            )
            .order_by(Etudiant.nom.asc(), Etudiant.prenom.asc())
            .limit(limit)
            .all()
        )


class ProgrammeRepository(BaseRepository[Programme]):
    def __init__(self):
        super().__init__(Programme)

    def get_by_code(self, db: Session, code: str) -> Programme | None:
        return db.query(Programme).filter(Programme.code == code).first()


class MatiereRepository(BaseRepository[Matiere]):
    def __init__(self):
        super().__init__(Matiere)

    def get_by_code(self, db: Session, code: str) -> Matiere | None:
        return db.query(Matiere).filter(Matiere.code == code).first()


class InscriptionRepository(BaseRepository[Inscription]):
    def __init__(self):
        super().__init__(Inscription)

    def get_by_etudiant_and_formation(
        self,
        db: Session,
        etudiant_id: int,
        formation_id: int,
    ) -> Inscription | None:
        return (
            db.query(Inscription)
            .filter(
                Inscription.etudiant_id == etudiant_id,
                Inscription.formation_id == formation_id,
            )
            .first()
        )


etudiant_repository = EtudiantRepository()
programme_repository = ProgrammeRepository()
matiere_repository = MatiereRepository()
inscription_repository = InscriptionRepository()
