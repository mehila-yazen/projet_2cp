from sqlalchemy import (
	CheckConstraint,
	Column,
	Date,
	DateTime,
	Float,
	ForeignKey,
	Index,
	Integer,
	String,
	Text,
	text,
)
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.sql import func


Base = declarative_base()


class AnneeUniversitaire(Base):
	__tablename__ = "annee_universitaire"
	__table_args__ = (CheckConstraint("date_fin > date_debut", name="ck_annee_dates"),)

	id = Column(Integer, primary_key=True, autoincrement=True)
	annee = Column(String, nullable=False, unique=True)
	date_debut = Column(Date, nullable=False)
	date_fin = Column(Date, nullable=False)
	created_at = Column(DateTime, server_default=func.current_timestamp())
	updated_at = Column(DateTime, server_default=func.current_timestamp())

	formations = relationship("Formation", back_populates="annee_universitaire")


class Programme(Base):
	__tablename__ = "programme"

	id = Column(Integer, primary_key=True, autoincrement=True)
	code = Column(String, nullable=False, unique=True)
	titre = Column(String, nullable=False)
	doctorat = Column(Integer, default=0)
	created_at = Column(DateTime, server_default=func.current_timestamp())
	updated_at = Column(DateTime, server_default=func.current_timestamp())

	formations = relationship("Formation", back_populates="programme")
	periodes = relationship("PeriodeProgramme", back_populates="programme")


class Etudiant(Base):
	__tablename__ = "etudiant"
	__table_args__ = (
		CheckConstraint("sexe IN ('M', 'F', 'Autre')", name="ck_etudiant_sexe"),
	)

	id = Column(Integer, primary_key=True, autoincrement=True)
	nom = Column(String, nullable=False)
	prenom = Column(String, nullable=False)
	matricule = Column(String, nullable=False, unique=True)
	sexe = Column(String)
	date_naissance = Column(Date)
	lieu_naissance = Column(String)
	nom_soundex = Column(String)
	prenom_soundex = Column(String)
	nom_metaphone = Column(String)
	prenom_metaphone = Column(String)
	nom_trigram = Column(String)
	prenom_trigram = Column(String)
	matricule_normalise = Column(String)
	matricule_prefixes = Column(String)
	created_at = Column(DateTime, server_default=func.current_timestamp())
	updated_at = Column(DateTime, server_default=func.current_timestamp())

	inscriptions = relationship("Inscription", back_populates="etudiant")
	recherche_logs = relationship("RechercheNameLog", back_populates="etudiant")
	variations = relationship("VariationNom", back_populates="etudiant")


class Formation(Base):
	__tablename__ = "formation"
	__table_args__ = (
		Index("idx_formation_programme", "programme_id"),
		Index("idx_formation_annee", "annee_univ_id"),
		CheckConstraint("programme_id IS NOT NULL", name="ck_formation_programme_nn"),
		CheckConstraint("annee_univ_id IS NOT NULL", name="ck_formation_annee_nn"),
	)

	id = Column(Integer, primary_key=True, autoincrement=True)
	programme_id = Column(Integer, ForeignKey("programme.id", ondelete="RESTRICT"), nullable=False)
	annee_univ_id = Column(
		Integer,
		ForeignKey("annee_universitaire.id", ondelete="RESTRICT"),
		nullable=False,
	)
	created_at = Column(DateTime, server_default=func.current_timestamp())
	updated_at = Column(DateTime, server_default=func.current_timestamp())

	programme = relationship("Programme", back_populates="formations")
	annee_universitaire = relationship("AnneeUniversitaire", back_populates="formations")
	groupes = relationship("Groupe", back_populates="formation")
	inscriptions = relationship("Inscription", back_populates="formation")


Index("ux_formation_programme_annee", Formation.programme_id, Formation.annee_univ_id, unique=True)


class Groupe(Base):
	__tablename__ = "groupe"

	id = Column(Integer, primary_key=True, autoincrement=True)
	code = Column(String, nullable=False)
	formation_id = Column(Integer, ForeignKey("formation.id", ondelete="CASCADE"), nullable=False)
	created_at = Column(DateTime, server_default=func.current_timestamp())
	updated_at = Column(DateTime, server_default=func.current_timestamp())

	formation = relationship("Formation", back_populates="groupes")
	inscriptions = relationship("Inscription", back_populates="groupe")
	inscriptions_periode = relationship("InscriptionPeriode", back_populates="groupe")


Index("idx_groupe_formation", Groupe.formation_id)
Index("ux_groupe_code_formation", Groupe.code, Groupe.formation_id, unique=True)


class Matiere(Base):
	__tablename__ = "matiere"
	__table_args__ = (CheckConstraint("coefficient > 0", name="ck_matiere_coefficient"),)

	id = Column(Integer, primary_key=True, autoincrement=True)
	code = Column(String, nullable=False, unique=True)
	title = Column(String, nullable=False)
	coefficient = Column(Float, nullable=False)
	created_at = Column(DateTime, server_default=func.current_timestamp())
	updated_at = Column(DateTime, server_default=func.current_timestamp())

	modules = relationship("Module", back_populates="matiere")


class PeriodeProgramme(Base):
	__tablename__ = "periode_programme"

	id = Column(Integer, primary_key=True, autoincrement=True)
	libelle = Column(String, nullable=False)
	ordre = Column(Integer, nullable=False)
	programme_id = Column(Integer, ForeignKey("programme.id", ondelete="CASCADE"), nullable=False)
	created_at = Column(DateTime, server_default=func.current_timestamp())
	updated_at = Column(DateTime, server_default=func.current_timestamp())

	programme = relationship("Programme", back_populates="periodes")
	modules = relationship("Module", back_populates="periode")
	inscriptions_periode = relationship("InscriptionPeriode", back_populates="periode_programme")


Index("idx_periode_programme", PeriodeProgramme.programme_id)
Index("ux_periode_programme_libelle_programme", PeriodeProgramme.libelle, PeriodeProgramme.programme_id, unique=True)


class Module(Base):
	__tablename__ = "module"

	id = Column(Integer, primary_key=True, autoincrement=True)
	matiere_id = Column(Integer, ForeignKey("matiere.id", ondelete="RESTRICT"), nullable=False)
	periode_id = Column(Integer, ForeignKey("periode_programme.id", ondelete="CASCADE"), nullable=False)
	coefficient = Column(Float)
	created_at = Column(DateTime, server_default=func.current_timestamp())
	updated_at = Column(DateTime, server_default=func.current_timestamp())

	matiere = relationship("Matiere", back_populates="modules")
	periode = relationship("PeriodeProgramme", back_populates="modules")
	resultats = relationship("Resultat", back_populates="module")


Index("idx_module_matiere", Module.matiere_id)
Index("idx_module_periode", Module.periode_id)
Index("ux_module_matiere_periode", Module.matiere_id, Module.periode_id, unique=True)


class Inscription(Base):
	__tablename__ = "inscription"

	id = Column(Integer, primary_key=True, autoincrement=True)
	etudiant_id = Column(Integer, ForeignKey("etudiant.id", ondelete="CASCADE"), nullable=False)
	formation_id = Column(Integer, ForeignKey("formation.id", ondelete="RESTRICT"), nullable=False)
	groupe_id = Column(Integer, ForeignKey("groupe.id", ondelete="RESTRICT"), nullable=False)
	moy = Column(Float)
	rachat = Column(Integer, default=0)
	rattrapage = Column(Integer, default=0)
	rang = Column(Integer)
	decisionJury = Column(String)
	observation = Column(Text)
	date_inscription = Column(DateTime, server_default=func.current_timestamp())
	created_at = Column(DateTime, server_default=func.current_timestamp())
	updated_at = Column(DateTime, server_default=func.current_timestamp())

	etudiant = relationship("Etudiant", back_populates="inscriptions")
	formation = relationship("Formation", back_populates="inscriptions")
	groupe = relationship("Groupe", back_populates="inscriptions")
	periodes = relationship("InscriptionPeriode", back_populates="inscription")


Index("idx_inscription_etudiant", Inscription.etudiant_id)
Index("idx_inscription_formation", Inscription.formation_id)
Index("idx_inscription_groupe", Inscription.groupe_id)
Index("ux_inscription_etudiant_formation", Inscription.etudiant_id, Inscription.formation_id, unique=True)


class InscriptionPeriode(Base):
	__tablename__ = "inscription_periode"

	id = Column(Integer, primary_key=True, autoincrement=True)
	inscription_id = Column(Integer, ForeignKey("inscription.id", ondelete="CASCADE"), nullable=False)
	periodepgm_id = Column(Integer, ForeignKey("periode_programme.id", ondelete="RESTRICT"), nullable=False)
	groupe_id = Column(Integer, ForeignKey("groupe.id", ondelete="RESTRICT"), nullable=False)
	moy = Column(Float)
	created_at = Column(DateTime, server_default=func.current_timestamp())
	updated_at = Column(DateTime, server_default=func.current_timestamp())

	inscription = relationship("Inscription", back_populates="periodes")
	periode_programme = relationship("PeriodeProgramme", back_populates="inscriptions_periode")
	groupe = relationship("Groupe", back_populates="inscriptions_periode")
	resultats = relationship("Resultat", back_populates="inscription_periode")


Index("idx_inscription_periode_inscription", InscriptionPeriode.inscription_id)
Index("idx_inscription_periode_periodepgm", InscriptionPeriode.periodepgm_id)
Index("idx_inscription_periode_groupe", InscriptionPeriode.groupe_id)
Index(
	"ux_inscription_periode_inscription_periodepgm",
	InscriptionPeriode.inscription_id,
	InscriptionPeriode.periodepgm_id,
	unique=True,
)


class Resultat(Base):
	__tablename__ = "resultat"
	__table_args__ = (
		CheckConstraint("moy >= 0 AND moy <= 20", name="ck_resultat_moy"),
		CheckConstraint("note_cc >= 0 AND note_cc <= 20", name="ck_resultat_note_cc"),
		CheckConstraint("note_exam >= 0 AND note_exam <= 20", name="ck_resultat_note_exam"),
	)

	id = Column(Integer, primary_key=True, autoincrement=True)
	inscriptionPer_id = Column(
		Integer,
		ForeignKey("inscription_periode.id", ondelete="CASCADE"),
		nullable=False,
	)
	module_id = Column(Integer, ForeignKey("module.id", ondelete="RESTRICT"), nullable=False)
	moy = Column(Float)
	note_cc = Column(Float)
	note_exam = Column(Float)
	created_at = Column(DateTime, server_default=func.current_timestamp())
	updated_at = Column(DateTime, server_default=func.current_timestamp())

	inscription_periode = relationship("InscriptionPeriode", back_populates="resultats")
	module = relationship("Module", back_populates="resultats")


Index("idx_resultat_inscriptionper", Resultat.inscriptionPer_id)
Index("idx_resultat_module", Resultat.module_id)
Index("ux_resultat_inscriptionper_module", Resultat.inscriptionPer_id, Resultat.module_id, unique=True)


class RechercheNameLog(Base):
	__tablename__ = "recherche_name_log"

	id = Column(Integer, primary_key=True, autoincrement=True)
	etudiant_id = Column(Integer, ForeignKey("etudiant.id", ondelete="SET NULL"), nullable=True)
	terme_recherche = Column(String, nullable=False)
	terme_normalise = Column(String)
	type_recherche = Column(String)
	resultats_trouves = Column(Integer, default=0)
	correction_utilisateur = Column(Integer, default=0)
	date_recherche = Column(DateTime, server_default=func.current_timestamp())

	etudiant = relationship("Etudiant", back_populates="recherche_logs")


Index("idx_recherche_log_etudiant", RechercheNameLog.etudiant_id)
Index("idx_recherche_log_date", RechercheNameLog.date_recherche)
Index("idx_recherche_log_terme", RechercheNameLog.terme_normalise)


class VariationNom(Base):
	__tablename__ = "variation_nom"

	id = Column(Integer, primary_key=True, autoincrement=True)
	etudiant_id = Column(Integer, ForeignKey("etudiant.id", ondelete="CASCADE"), nullable=False)
	nom_canonique = Column(String, nullable=False)
	variation = Column(String, nullable=False)
	frequence = Column(Integer, default=1)
	derniere_utilisation = Column(DateTime, server_default=func.current_timestamp())
	created_at = Column(DateTime, server_default=func.current_timestamp())

	etudiant = relationship("Etudiant", back_populates="variations")


Index("idx_variation_etudiant", VariationNom.etudiant_id)
Index("idx_variation_variation", VariationNom.variation)
Index("idx_variation_frequence", VariationNom.frequence.desc())
Index("ux_variation_nom_etudiant_variation", VariationNom.etudiant_id, VariationNom.variation, unique=True)


Index("idx_etudiant_nom", Etudiant.nom)
Index("idx_etudiant_prenom", Etudiant.prenom)
Index("idx_etudiant_nom_prenom", Etudiant.nom, Etudiant.prenom)
Index("idx_etudiant_matricule_prefix", Etudiant.matricule)
Index("idx_etudiant_matricule_lower", text("LOWER(matricule)"))
Index("idx_etudiant_matricule_normalise", Etudiant.matricule_normalise)
Index("idx_etudiant_matricule_suffix", text("SUBSTR(matricule, -4)"))
Index(
	"idx_etudiant_matricule_numeric",
	text("CAST(CASE WHEN matricule GLOB '[0-9]*' THEN matricule ELSE NULL END AS INTEGER)"),
	sqlite_where=text("matricule GLOB '[0-9]*'"),
)
Index("idx_etudiant_matricule_nom", Etudiant.matricule, Etudiant.nom)
Index("idx_etudiant_matricule_prenom", Etudiant.matricule, Etudiant.prenom)
Index("idx_etudiant_nom_soundex", Etudiant.nom_soundex)
Index("idx_etudiant_prenom_soundex", Etudiant.prenom_soundex)
Index("idx_etudiant_nom_metaphone", Etudiant.nom_metaphone)
Index("idx_etudiant_prenom_metaphone", Etudiant.prenom_metaphone)
Index("idx_etudiant_nom_trigram", Etudiant.nom_trigram)
Index("idx_etudiant_prenom_trigram", Etudiant.prenom_trigram)


def init_db(engine):
	Base.metadata.create_all(bind=engine)
