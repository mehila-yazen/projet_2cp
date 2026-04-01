from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from src.Database.models import (
    AnneeUniversitaire,
    Etudiant,
    Formation,
    Groupe,
    Inscription,
    InscriptionPeriode,
    Matiere,
    Module,
    PeriodeProgramme,
    Programme,
    Resultat,
)
from src.services.fuzzy_name_service import apply_student_search_keys
from src.services.matricule_service import resolve_student_matricule


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    raw = str(value).strip().replace(",", ".")
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _to_int(value: Any) -> int | None:
    num = _to_float(value)
    if num is None:
        return None
    return int(round(num))


def _split_name(full_name: str) -> tuple[str, str]:
    value = _clean_text(full_name)
    if not value:
        return "", ""
    parts = value.split()
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def _first_non_empty(*values: Any) -> Any:
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return None


def _parse_academic_year_bounds(academic_year: str) -> tuple[date, date]:
    text = _clean_text(academic_year)
    years = [int(item) for item in re.findall(r"\d{4}", text)]

    if len(years) >= 2:
        start_year, end_year = years[0], years[1]
    elif len(years) == 1:
        start_year, end_year = years[0], years[0] + 1
    else:
        today = date.today()
        start_year, end_year = today.year, today.year + 1

    if end_year <= start_year:
        end_year = start_year + 1

    return date(start_year, 1, 1), date(end_year, 12, 31)


def _find_or_create_programme(db: Session, *, code: str, titre: str) -> Programme:
    clean_code = _clean_text(code) or "UNKNOWN"
    clean_titre = _clean_text(titre) or clean_code

    programme = db.query(Programme).filter(Programme.code == clean_code).first()
    if programme:
        programme.titre = clean_titre
        programme.doctorat = 0
        db.flush()
        return programme

    programme = Programme(code=clean_code, titre=clean_titre, doctorat=0)
    db.add(programme)
    db.flush()
    return programme


def _find_or_create_annee_univ(db: Session, *, annee_label: str, academic_year: str) -> AnneeUniversitaire:
    annee = _clean_text(annee_label) or "UNKNOWN"
    date_debut, date_fin = _parse_academic_year_bounds(academic_year)

    existing = db.query(AnneeUniversitaire).filter(AnneeUniversitaire.annee == annee).first()
    if existing:
        existing.date_debut = date_debut
        existing.date_fin = date_fin
        db.flush()
        return existing

    created = AnneeUniversitaire(
        annee=annee,
        date_debut=date_debut,
        date_fin=date_fin,
    )
    db.add(created)
    db.flush()
    return created


def _find_or_create_formation(db: Session, *, programme_id: int, annee_univ_id: int) -> Formation:
    formation = (
        db.query(Formation)
        .filter(
            Formation.programme_id == programme_id,
            Formation.annee_univ_id == annee_univ_id,
        )
        .first()
    )
    if formation:
        return formation

    formation = Formation(programme_id=programme_id, annee_univ_id=annee_univ_id)
    db.add(formation)
    db.flush()
    return formation


def _find_or_create_groupe(db: Session, *, formation_id: int, code: str) -> Groupe:
    clean_code = _clean_text(code) or "1"
    groupe = (
        db.query(Groupe)
        .filter(
            Groupe.formation_id == formation_id,
            Groupe.code == clean_code,
        )
        .first()
    )
    if groupe:
        return groupe

    groupe = Groupe(code=clean_code, formation_id=formation_id)
    db.add(groupe)
    db.flush()
    return groupe


def _find_or_create_periode(db: Session, *, programme_id: int, libelle: str) -> PeriodeProgramme:
    clean_label = _clean_text(libelle).upper()
    ordre = 1 if clean_label == "S1" else 2
    periode = (
        db.query(PeriodeProgramme)
        .filter(
            PeriodeProgramme.programme_id == programme_id,
            PeriodeProgramme.libelle == clean_label,
        )
        .first()
    )
    if periode:
        periode.ordre = ordre
        db.flush()
        return periode

    periode = PeriodeProgramme(libelle=clean_label, ordre=ordre, programme_id=programme_id)
    db.add(periode)
    db.flush()
    return periode


def _build_matiere_candidates(code: str, period: str) -> list[str]:
    base = _clean_text(code) or "MATIERE"
    suffix = "S1" if period == "S1" else "S2"
    return [base, f"{base}_{suffix}"]


def _find_or_create_matiere(
    db: Session,
    *,
    code: str,
    title: str,
    coefficient: float,
    period: str,
) -> Matiere:
    clean_title = _clean_text(title) or _clean_text(code) or "Matiere"
    coef = _to_float(coefficient)
    if coef is None or coef <= 0:
        coef = 1.0

    same_triplet = (
        db.query(Matiere)
        .filter(
            Matiere.code == _clean_text(code),
            Matiere.title == clean_title,
            Matiere.coefficient == coef,
        )
        .first()
    )
    if same_triplet:
        return same_triplet

    for candidate_code in _build_matiere_candidates(code, period):
        existing = db.query(Matiere).filter(Matiere.code == candidate_code).first()
        if existing and _clean_text(existing.title) == clean_title and float(existing.coefficient) == float(coef):
            return existing

    for candidate_code in _build_matiere_candidates(code, period):
        occupied = db.query(Matiere).filter(Matiere.code == candidate_code).first()
        if occupied is None:
            created = Matiere(code=candidate_code, title=clean_title, coefficient=coef)
            db.add(created)
            db.flush()
            return created

    fallback_code = f"{_clean_text(code)}_{period}_{int(coef * 100)}"
    created = Matiere(code=fallback_code, title=clean_title, coefficient=coef)
    db.add(created)
    db.flush()
    return created


def _find_or_create_module(db: Session, *, matiere_id: int, periode_id: int, coefficient: float | None) -> Module:
    module = (
        db.query(Module)
        .filter(
            Module.matiere_id == matiere_id,
            Module.periode_id == periode_id,
        )
        .first()
    )
    if module:
        module.coefficient = _to_float(coefficient)
        db.flush()
        return module

    module = Module(matiere_id=matiere_id, periode_id=periode_id, coefficient=_to_float(coefficient))
    db.add(module)
    db.flush()
    return module


def _find_or_create_inscription(
    db: Session,
    *,
    etudiant_id: int,
    formation_id: int,
    groupe_id: int,
    moy: float | None,
    rang: int | None,
    decision_jury: str | None,
    observation: str | None,
) -> Inscription:
    inscription = (
        db.query(Inscription)
        .filter(
            Inscription.etudiant_id == etudiant_id,
            Inscription.formation_id == formation_id,
        )
        .first()
    )

    rattrapage = bool(moy is not None and moy < 10.0)

    if inscription:
        inscription.groupe_id = groupe_id
        inscription.moy = moy
        inscription.rachat = 1 if rattrapage else 0
        inscription.rattrapage = 1 if rattrapage else 0
        inscription.rang = rang
        inscription.decisionJury = _clean_text(decision_jury) or None
        inscription.observation = _clean_text(observation) or None
        db.flush()
        return inscription

    inscription = Inscription(
        etudiant_id=etudiant_id,
        formation_id=formation_id,
        groupe_id=groupe_id,
        moy=moy,
        rachat=1 if rattrapage else 0,
        rattrapage=1 if rattrapage else 0,
        rang=rang,
        decisionJury=_clean_text(decision_jury) or None,
        observation=_clean_text(observation) or None,
    )
    db.add(inscription)
    db.flush()
    return inscription


def _find_or_create_inscription_periode(
    db: Session,
    *,
    inscription_id: int,
    periode_id: int,
    groupe_id: int,
    moy: float | None,
) -> InscriptionPeriode:
    item = (
        db.query(InscriptionPeriode)
        .filter(
            InscriptionPeriode.inscription_id == inscription_id,
            InscriptionPeriode.periodepgm_id == periode_id,
        )
        .first()
    )
    if item:
        item.groupe_id = groupe_id
        item.moy = moy
        db.flush()
        return item

    item = InscriptionPeriode(
        inscription_id=inscription_id,
        periodepgm_id=periode_id,
        groupe_id=groupe_id,
        moy=moy,
    )
    db.add(item)
    db.flush()
    return item


def _upsert_resultat(db: Session, *, inscription_periode_id: int, module_id: int, moy: float | None) -> Resultat:
    item = (
        db.query(Resultat)
        .filter(
            Resultat.inscriptionPer_id == inscription_periode_id,
            Resultat.module_id == module_id,
        )
        .first()
    )
    if item:
        item.moy = moy
        db.flush()
        item._upsert_action = "updated"
        return item

    item = Resultat(inscriptionPer_id=inscription_periode_id, module_id=module_id, moy=moy)
    db.add(item)
    db.flush()
    item._upsert_action = "created"
    return item


def _upsert_etudiant_from_payload(
    db: Session,
    *,
    student_payload: dict[str, Any],
    annee_univ: str,
) -> tuple[Etudiant, dict[str, Any]]:
    nom = _clean_text(student_payload.get("nom"))
    prenom = _clean_text(student_payload.get("prenom"))
    if not nom or not prenom:
        raise ValueError("Student nom and prenom are required")

    matricule_info = resolve_student_matricule(
        db,
        nom=nom,
        prenom=prenom,
        annee_univ=annee_univ,
        is_first_year=False,
        provided_matricule=student_payload.get("matricule"),
        date_naissance=student_payload.get("date_naissance"),
        source={"student": student_payload},
    )

    matricule = matricule_info["matricule"]
    existing = db.query(Etudiant).filter(Etudiant.matricule == matricule).first()
    if existing:
        existing.nom = nom
        existing.prenom = prenom
        if student_payload.get("sexe") is not None:
            existing.sexe = student_payload.get("sexe")
        if student_payload.get("lieu_naissance") is not None:
            existing.lieu_naissance = student_payload.get("lieu_naissance")
        apply_student_search_keys(existing)
        db.flush()
        return existing, {
            "action": "updated",
            "matricule": matricule,
            "matricule_source": matricule_info.get("source"),
            "needs_matricule_review": bool(matricule_info.get("needs_review", False)),
            "pending_case": matricule_info.get("pending_case"),
        }

    created = Etudiant(
        nom=nom,
        prenom=prenom,
        matricule=matricule,
        sexe=student_payload.get("sexe"),
        lieu_naissance=student_payload.get("lieu_naissance"),
    )
    apply_student_search_keys(created)
    db.add(created)
    db.flush()
    return created, {
        "action": "created",
        "matricule": matricule,
        "matricule_source": matricule_info.get("source"),
        "needs_matricule_review": bool(matricule_info.get("needs_review", False)),
        "pending_case": matricule_info.get("pending_case"),
    }


@dataclass(slots=True)
class StudentPersistPayload:
    page_type: str
    group_code: str
    nom: str
    prenom: str
    matricule: str | None
    annual_moy: float | None
    annual_rank: int | None
    decision_jury: str | None
    observation: str | None
    s1_moy: float | None
    s2_moy: float | None
    modules: list[dict[str, Any]]


def _extract_matieres_catalog(record: dict[str, Any]) -> dict[str, dict[str, Any]]:
    pages = sorted((record.get("pages") or []), key=lambda item: int(item.get("page_number") or 0))
    catalog: dict[str, dict[str, Any]] = {}

    for page in pages:
        result = page.get("result") or {}
        if _clean_text(result.get("type")) != "table_de_matieres":
            continue

        for matiere in result.get("matieres") or []:
            code = _clean_text(matiere.get("abrev"))
            title = _clean_text(matiere.get("libelle"))
            coef = matiere.get("coef") or {}
            if not code:
                continue
            catalog[code] = {
                "title": title or code,
                "coef_s1": _to_float(coef.get("S1")),
                "coef_s2": _to_float(coef.get("S2")),
            }

    return catalog


def _extract_students(record: dict[str, Any]) -> list[StudentPersistPayload]:
    pages = sorted((record.get("pages") or []), key=lambda item: int(item.get("page_number") or 0))
    result: list[StudentPersistPayload] = []

    for page in pages:
        payload = page.get("result") or {}
        page_type = _clean_text(payload.get("type"))

        if page_type == "single_student":
            original_student = payload.get("student") or {}
            edited_students = payload.get("students") or []
            edited = edited_students[0] if edited_students else {}

            fallback_nom, fallback_prenom = _split_name(_clean_text(original_student.get("name")))
            nom = _clean_text(_first_non_empty(edited.get("nom"), fallback_nom))
            prenom = _clean_text(_first_non_empty(edited.get("prenom"), fallback_prenom))
            matricule = _clean_text(_first_non_empty(edited.get("matricule"), original_student.get("matricule"))) or None

            summary = payload.get("summary") or {}
            modules = edited.get("modules") if isinstance(edited.get("modules"), list) and edited.get("modules") else payload.get("modules") or []

            result.append(
                StudentPersistPayload(
                    page_type=page_type,
                    group_code=_clean_text(original_student.get("group")) or "1",
                    nom=nom,
                    prenom=prenom,
                    matricule=matricule,
                    annual_moy=_to_float(_first_non_empty(edited.get("annual_avg"), summary.get("general_moyenne"))),
                    annual_rank=_to_int(_first_non_empty(edited.get("annual_rank"), summary.get("general_rang"))),
                    decision_jury=_clean_text(_first_non_empty(edited.get("final_decision"), summary.get("decision"))) or None,
                    observation=_clean_text(summary.get("observation")) or None,
                    s1_moy=_to_float(_first_non_empty(edited.get("avg_s1"), summary.get("semestre1_moyenne"))),
                    s2_moy=_to_float(_first_non_empty(edited.get("avg_s2"), summary.get("semestre2_moyenne"))),
                    modules=modules,
                )
            )
            continue

        if page_type == "multiple_students":
            for student in payload.get("students") or []:
                moyenne = student.get("moyenne") or {}
                rang = student.get("rang") or {}
                metadata = student.get("metadata") or {}

                result.append(
                    StudentPersistPayload(
                        page_type=page_type,
                        group_code=_clean_text(_first_non_empty(metadata.get("sousGroupe"), "1")) or "1",
                        nom=_clean_text(student.get("nom")),
                        prenom=_clean_text(student.get("prenom")),
                        matricule=_clean_text(student.get("matricule")) or None,
                        annual_moy=_to_float(_first_non_empty(student.get("annual_avg"), moyenne.get("annuel"))),
                        annual_rank=_to_int(_first_non_empty(student.get("annual_rank"), rang.get("annuel"))),
                        decision_jury=_clean_text(_first_non_empty(student.get("final_decision"), student.get("decisionFinaleDuConseil"))) or None,
                        observation=None,
                        s1_moy=_to_float(_first_non_empty(student.get("avg_s1"), moyenne.get("S1"), moyenne.get("s1"))),
                        s2_moy=_to_float(_first_non_empty(student.get("avg_s2"), moyenne.get("S2"), moyenne.get("s2"))),
                        modules=student.get("modules") or [],
                    )
                )

    return [item for item in result if item.nom and item.prenom]


def persist_validation_record(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    record = payload.get("record") or {}
    shared_meta = record.get("shared_meta") or {}

    specialization = _clean_text(shared_meta.get("spec")) or "UNKNOWN"
    title = _clean_text(shared_meta.get("title")) or specialization
    level = _clean_text(shared_meta.get("level")) or "UNKNOWN"
    academic_year = _clean_text(shared_meta.get("year"))

    existing_programme = db.query(Programme).filter(Programme.code == (specialization or "UNKNOWN")).first()
    programme = _find_or_create_programme(db, code=specialization, titre=title)

    existing_annee = db.query(AnneeUniversitaire).filter(AnneeUniversitaire.annee == (level or "UNKNOWN")).first()
    annee_univ = _find_or_create_annee_univ(db, annee_label=level, academic_year=academic_year)

    existing_formation = (
        db.query(Formation)
        .filter(Formation.programme_id == programme.id, Formation.annee_univ_id == annee_univ.id)
        .first()
    )
    formation = _find_or_create_formation(db, programme_id=programme.id, annee_univ_id=annee_univ.id)

    existing_s1 = (
        db.query(PeriodeProgramme)
        .filter(PeriodeProgramme.programme_id == programme.id, PeriodeProgramme.libelle == "S1")
        .first()
    )
    existing_s2 = (
        db.query(PeriodeProgramme)
        .filter(PeriodeProgramme.programme_id == programme.id, PeriodeProgramme.libelle == "S2")
        .first()
    )
    periode_s1 = _find_or_create_periode(db, programme_id=programme.id, libelle="S1")
    periode_s2 = _find_or_create_periode(db, programme_id=programme.id, libelle="S2")

    matiere_catalog = _extract_matieres_catalog(record)

    created_or_updated = {
        "programme": {"id": programme.id, "action": "updated" if existing_programme else "created"},
        "annee_universitaire": {"id": annee_univ.id, "action": "updated" if existing_annee else "created"},
        "formation": {"id": formation.id, "action": "updated" if existing_formation else "created"},
        "periodes": {
            "S1": {"id": periode_s1.id, "action": "updated" if existing_s1 else "created"},
            "S2": {"id": periode_s2.id, "action": "updated" if existing_s2 else "created"},
        },
    }

    module_catalog: dict[tuple[str, str], Module] = {}
    matiere_sync_report: list[dict[str, Any]] = []
    for code, meta in matiere_catalog.items():
        title_value = _clean_text(meta.get("title")) or code
        coef_s1 = _to_float(meta.get("coef_s1"))
        coef_s2 = _to_float(meta.get("coef_s2"))

        if coef_s1 is not None:
            before_matiere = (
                db.query(Matiere)
                .filter(Matiere.code == code, Matiere.title == title_value, Matiere.coefficient == coef_s1)
                .first()
            )
            matiere_s1 = _find_or_create_matiere(
                db,
                code=code,
                title=title_value,
                coefficient=coef_s1,
                period="S1",
            )
            before_module = (
                db.query(Module)
                .filter(Module.matiere_id == matiere_s1.id, Module.periode_id == periode_s1.id)
                .first()
            )
            module_s1 = _find_or_create_module(
                db,
                matiere_id=matiere_s1.id,
                periode_id=periode_s1.id,
                coefficient=coef_s1,
            )
            module_catalog[(code, "S1")] = module_s1
            matiere_sync_report.append(
                {
                    "code": code,
                    "title": title_value,
                    "period": "S1",
                    "coefficient": coef_s1,
                    "matiere_id": matiere_s1.id,
                    "matiere_action": "updated" if before_matiere else "created",
                    "module_id": module_s1.id,
                    "module_action": "updated" if before_module else "created",
                }
            )

        if coef_s2 is not None:
            before_matiere = (
                db.query(Matiere)
                .filter(Matiere.code == code, Matiere.title == title_value, Matiere.coefficient == coef_s2)
                .first()
            )
            matiere_s2 = _find_or_create_matiere(
                db,
                code=code,
                title=title_value,
                coefficient=coef_s2,
                period="S2",
            )
            before_module = (
                db.query(Module)
                .filter(Module.matiere_id == matiere_s2.id, Module.periode_id == periode_s2.id)
                .first()
            )
            module_s2 = _find_or_create_module(
                db,
                matiere_id=matiere_s2.id,
                periode_id=periode_s2.id,
                coefficient=coef_s2,
            )
            module_catalog[(code, "S2")] = module_s2
            matiere_sync_report.append(
                {
                    "code": code,
                    "title": title_value,
                    "period": "S2",
                    "coefficient": coef_s2,
                    "matiere_id": matiere_s2.id,
                    "matiere_action": "updated" if before_matiere else "created",
                    "module_id": module_s2.id,
                    "module_action": "updated" if before_module else "created",
                }
            )

    students = _extract_students(record)

    saved_students = 0
    saved_resultats = 0
    student_reports: list[dict[str, Any]] = []

    for item in students:
        group_existing = (
            db.query(Groupe)
            .filter(Groupe.formation_id == formation.id, Groupe.code == (_clean_text(item.group_code) or "1"))
            .first()
        )
        group = _find_or_create_groupe(db, formation_id=formation.id, code=item.group_code)

        etudiant_payload = {
            "nom": item.nom,
            "prenom": item.prenom,
            "matricule": item.matricule,
        }
        etudiant, etudiant_report = _upsert_etudiant_from_payload(db, student_payload=etudiant_payload, annee_univ=level)

        inscription_existing = (
            db.query(Inscription)
            .filter(Inscription.etudiant_id == etudiant.id, Inscription.formation_id == formation.id)
            .first()
        )

        inscription = _find_or_create_inscription(
            db,
            etudiant_id=etudiant.id,
            formation_id=formation.id,
            groupe_id=group.id,
            moy=item.annual_moy,
            rang=item.annual_rank,
            decision_jury=item.decision_jury,
            observation=item.observation if item.page_type == "single_student" else None,
        )

        s1_existing = (
            db.query(InscriptionPeriode)
            .filter(
                InscriptionPeriode.inscription_id == inscription.id,
                InscriptionPeriode.periodepgm_id == periode_s1.id,
            )
            .first()
        )
        s2_existing = (
            db.query(InscriptionPeriode)
            .filter(
                InscriptionPeriode.inscription_id == inscription.id,
                InscriptionPeriode.periodepgm_id == periode_s2.id,
            )
            .first()
        )

        inscription_periode_s1 = _find_or_create_inscription_periode(
            db,
            inscription_id=inscription.id,
            periode_id=periode_s1.id,
            groupe_id=group.id,
            moy=item.s1_moy,
        )
        inscription_periode_s2 = _find_or_create_inscription_periode(
            db,
            inscription_id=inscription.id,
            periode_id=periode_s2.id,
            groupe_id=group.id,
            moy=item.s2_moy,
        )

        student_resultats: list[dict[str, Any]] = []

        for raw_module in item.modules:
            module_code = _clean_text(
                _first_non_empty(raw_module.get("code"), raw_module.get("name"), raw_module.get("module"))
            )
            if not module_code:
                continue

            catalog_meta = matiere_catalog.get(module_code) or {}
            module_title = _clean_text(
                _first_non_empty(raw_module.get("libelle"), raw_module.get("name"), catalog_meta.get("title"), module_code)
            )

            note_s1 = _to_float(_first_non_empty(raw_module.get("note_s1"), raw_module.get("noteS1")))
            note_s2 = _to_float(_first_non_empty(raw_module.get("note_s2"), raw_module.get("noteS2")))
            coef_s1 = _to_float(_first_non_empty(raw_module.get("coef_s1"), raw_module.get("coef"), catalog_meta.get("coef_s1")))
            coef_s2 = _to_float(_first_non_empty(raw_module.get("coef_s2"), raw_module.get("coef"), catalog_meta.get("coef_s2")))

            if note_s1 is not None:
                module_s1 = module_catalog.get((module_code, "S1"))
                if module_s1 is None:
                    before_matiere = (
                        db.query(Matiere)
                        .filter(
                            Matiere.code == module_code,
                            Matiere.title == module_title,
                            Matiere.coefficient == (coef_s1 if coef_s1 is not None else 1.0),
                        )
                        .first()
                    )
                    matiere_s1 = _find_or_create_matiere(
                        db,
                        code=module_code,
                        title=module_title,
                        coefficient=coef_s1 if coef_s1 is not None else 1.0,
                        period="S1",
                    )
                    before_module = (
                        db.query(Module)
                        .filter(Module.matiere_id == matiere_s1.id, Module.periode_id == periode_s1.id)
                        .first()
                    )
                    module_s1 = _find_or_create_module(
                        db,
                        matiere_id=matiere_s1.id,
                        periode_id=periode_s1.id,
                        coefficient=coef_s1,
                    )
                    module_catalog[(module_code, "S1")] = module_s1
                    matiere_sync_report.append(
                        {
                            "code": module_code,
                            "title": module_title,
                            "period": "S1",
                            "coefficient": coef_s1 if coef_s1 is not None else 1.0,
                            "matiere_id": matiere_s1.id,
                            "matiere_action": "updated" if before_matiere else "created",
                            "module_id": module_s1.id,
                            "module_action": "updated" if before_module else "created",
                        }
                    )

                resultat = _upsert_resultat(
                    db,
                    inscription_periode_id=inscription_periode_s1.id,
                    module_id=module_s1.id,
                    moy=note_s1,
                )
                saved_resultats += 1
                student_resultats.append(
                    {
                        "period": "S1",
                        "module_code": module_code,
                        "module_id": module_s1.id,
                        "inscription_periode_id": inscription_periode_s1.id,
                        "resultat_id": resultat.id,
                        "resultat_action": getattr(resultat, "_upsert_action", "updated"),
                        "moy": note_s1,
                    }
                )

            if note_s2 is not None:
                module_s2 = module_catalog.get((module_code, "S2"))
                if module_s2 is None:
                    before_matiere = (
                        db.query(Matiere)
                        .filter(
                            Matiere.code == module_code,
                            Matiere.title == module_title,
                            Matiere.coefficient == (coef_s2 if coef_s2 is not None else 1.0),
                        )
                        .first()
                    )
                    matiere_s2 = _find_or_create_matiere(
                        db,
                        code=module_code,
                        title=module_title,
                        coefficient=coef_s2 if coef_s2 is not None else 1.0,
                        period="S2",
                    )
                    before_module = (
                        db.query(Module)
                        .filter(Module.matiere_id == matiere_s2.id, Module.periode_id == periode_s2.id)
                        .first()
                    )
                    module_s2 = _find_or_create_module(
                        db,
                        matiere_id=matiere_s2.id,
                        periode_id=periode_s2.id,
                        coefficient=coef_s2,
                    )
                    module_catalog[(module_code, "S2")] = module_s2
                    matiere_sync_report.append(
                        {
                            "code": module_code,
                            "title": module_title,
                            "period": "S2",
                            "coefficient": coef_s2 if coef_s2 is not None else 1.0,
                            "matiere_id": matiere_s2.id,
                            "matiere_action": "updated" if before_matiere else "created",
                            "module_id": module_s2.id,
                            "module_action": "updated" if before_module else "created",
                        }
                    )

                resultat = _upsert_resultat(
                    db,
                    inscription_periode_id=inscription_periode_s2.id,
                    module_id=module_s2.id,
                    moy=note_s2,
                )
                saved_resultats += 1
                student_resultats.append(
                    {
                        "period": "S2",
                        "module_code": module_code,
                        "module_id": module_s2.id,
                        "inscription_periode_id": inscription_periode_s2.id,
                        "resultat_id": resultat.id,
                        "resultat_action": getattr(resultat, "_upsert_action", "updated"),
                        "moy": note_s2,
                    }
                )

        saved_students += 1
        student_reports.append(
            {
                "nom": item.nom,
                "prenom": item.prenom,
                "matricule": etudiant_report.get("matricule"),
                "page_type": item.page_type,
                "group": {
                    "id": group.id,
                    "code": group.code,
                    "action": "updated" if group_existing else "created",
                },
                "etudiant": {
                    "id": etudiant.id,
                    "action": etudiant_report.get("action"),
                    "matricule_source": etudiant_report.get("matricule_source"),
                    "needs_matricule_review": etudiant_report.get("needs_matricule_review", False),
                    "pending_case": etudiant_report.get("pending_case"),
                },
                "inscription": {
                    "id": inscription.id,
                    "action": "updated" if inscription_existing else "created",
                },
                "inscription_periodes": {
                    "S1": {
                        "id": inscription_periode_s1.id,
                        "action": "updated" if s1_existing else "created",
                        "moy": item.s1_moy,
                    },
                    "S2": {
                        "id": inscription_periode_s2.id,
                        "action": "updated" if s2_existing else "created",
                        "moy": item.s2_moy,
                    },
                },
                "resultats": student_resultats,
            }
        )

    return {
        "status": "ok",
        "programme": {
            "id": programme.id,
            "code": programme.code,
            "titre": programme.titre,
            "doctorat": bool(programme.doctorat),
        },
        "annee_universitaire": {
            "id": annee_univ.id,
            "annee": annee_univ.annee,
            "date_debut": annee_univ.date_debut.isoformat(),
            "date_fin": annee_univ.date_fin.isoformat(),
        },
        "formation_id": formation.id,
        "saved_students": saved_students,
        "saved_resultats": saved_resultats,
        "created_or_updated": created_or_updated,
        "matiere_module_sync": matiere_sync_report,
        "student_report": student_reports,
    }
