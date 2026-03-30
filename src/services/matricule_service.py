from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import func
from sqlalchemy.orm import Session

from src.Database.models import Etudiant


PENDING_MATRICULES_FILE = Path("tmp/pending_matricules.jsonl")


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip().lower()


def _safe_token(value: str | None, length: int = 4) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]", "", value or "").upper()
    if not cleaned:
        return "X" * length
    return cleaned[:length].ljust(length, "X")


def _year_token(annee_univ: str | None) -> str:
    if not annee_univ:
        return datetime.now().strftime("%y")
    match = re.search(r"(\d{4})", annee_univ)
    if not match:
        return datetime.now().strftime("%y")
    return match.group(1)[-2:]


def _matricule_exists(db: Session, matricule: str) -> bool:
    return db.query(Etudiant.id).filter(Etudiant.matricule == matricule).first() is not None


def _generate_unique_matricule(
    db: Session,
    *,
    nom: str,
    prenom: str,
    annee_univ: str | None,
    temporary: bool,
) -> str:
    prefix = "TMP" if temporary else "ETU"
    year = _year_token(annee_univ)
    token = f"{_safe_token(nom, 3)}{_safe_token(prenom, 2)}"

    for _ in range(30):
        suffix = uuid4().hex[:5].upper()
        candidate = f"{prefix}-{year}-{token}-{suffix}"
        if not _matricule_exists(db, candidate):
            return candidate

    fallback = f"{prefix}-{year}-{uuid4().hex[:10].upper()}"
    if _matricule_exists(db, fallback):
        raise RuntimeError("Failed to generate a unique matricule")
    return fallback


def _find_existing_matricule(
    db: Session,
    *,
    nom: str,
    prenom: str,
    date_naissance: str | None = None,
) -> str | None:
    nom_n = _normalize_text(nom)
    prenom_n = _normalize_text(prenom)

    query = db.query(Etudiant).filter(
        func.lower(func.trim(Etudiant.nom)) == nom_n,
        func.lower(func.trim(Etudiant.prenom)) == prenom_n,
    )

    if date_naissance:
        query = query.filter(Etudiant.date_naissance == date_naissance)

    candidate = query.order_by(Etudiant.id.asc()).first()
    if candidate and candidate.matricule:
        return candidate.matricule
    return None


def append_pending_matricule_case(
    *,
    nom: str,
    prenom: str,
    generated_matricule: str,
    annee_univ: str | None,
    student_id: int | None = None,
    source: dict[str, Any] | None = None,
    pending_file: str | Path = PENDING_MATRICULES_FILE,
) -> dict[str, Any]:
    record = {
        "case_id": uuid4().hex,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "status": "pending",
        "student_id": student_id,
        "nom": nom,
        "prenom": prenom,
        "annee_univ": annee_univ,
        "generated_matricule": generated_matricule,
        "source": source or {},
    }

    target = Path(pending_file)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    return record


def resolve_student_matricule(
    db: Session,
    *,
    nom: str,
    prenom: str,
    annee_univ: str | None,
    is_first_year: bool,
    provided_matricule: str | None = None,
    date_naissance: str | None = None,
    source: dict[str, Any] | None = None,
    pending_file: str | Path = PENDING_MATRICULES_FILE,
) -> dict[str, Any]:
    normalized_input = (provided_matricule or "").strip()
    if normalized_input:
        return {
            "matricule": normalized_input,
            "source": "provided",
            "needs_review": False,
            "pending_case": None,
        }

    if not is_first_year:
        existing = _find_existing_matricule(
            db,
            nom=nom,
            prenom=prenom,
            date_naissance=date_naissance,
        )
        if existing:
            return {
                "matricule": existing,
                "source": "history",
                "needs_review": False,
                "pending_case": None,
            }

        temporary = _generate_unique_matricule(
            db,
            nom=nom,
            prenom=prenom,
            annee_univ=annee_univ,
            temporary=True,
        )
        pending = append_pending_matricule_case(
            nom=nom,
            prenom=prenom,
            generated_matricule=temporary,
            annee_univ=annee_univ,
            source=source,
            pending_file=pending_file,
        )
        return {
            "matricule": temporary,
            "source": "generated_temporary",
            "needs_review": True,
            "pending_case": pending,
        }

    generated = _generate_unique_matricule(
        db,
        nom=nom,
        prenom=prenom,
        annee_univ=annee_univ,
        temporary=False,
    )
    return {
        "matricule": generated,
        "source": "generated_first_year",
        "needs_review": False,
        "pending_case": None,
    }


def load_pending_matricule_cases(
    pending_file: str | Path = PENDING_MATRICULES_FILE,
) -> list[dict[str, Any]]:
    target = Path(pending_file)
    if not target.exists():
        return []

    cases: list[dict[str, Any]] = []
    with target.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                cases.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return cases


def check_pending_cases_against_database(
    db: Session,
    pending_file: str | Path = PENDING_MATRICULES_FILE,
) -> dict[str, Any]:
    cases = load_pending_matricule_cases(pending_file)

    matches: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []

    for case in cases:
        if case.get("status") != "pending":
            continue

        match_matricule = _find_existing_matricule(
            db,
            nom=case.get("nom", ""),
            prenom=case.get("prenom", ""),
        )

        if match_matricule and match_matricule != case.get("generated_matricule"):
            matches.append(
                {
                    "case_id": case.get("case_id"),
                    "nom": case.get("nom"),
                    "prenom": case.get("prenom"),
                    "temporary_matricule": case.get("generated_matricule"),
                    "found_matricule": match_matricule,
                    "student_id": case.get("student_id"),
                }
            )
        else:
            unresolved.append(case)

    return {
        "total_pending": len([c for c in cases if c.get("status") == "pending"]),
        "matches_found": len(matches),
        "unresolved_count": len(unresolved),
        "matches": matches,
        "unresolved": unresolved,
    }


def _write_pending_cases(cases: list[dict[str, Any]], pending_file: str | Path) -> None:
    target = Path(pending_file)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8") as handle:
        for record in cases:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def apply_pending_matricule_reconciliation(
    db: Session,
    *,
    preview: bool = True,
    pending_file: str | Path = PENDING_MATRICULES_FILE,
) -> dict[str, Any]:
    cases = load_pending_matricule_cases(pending_file)
    pending_cases = [case for case in cases if case.get("status") == "pending"]

    updates: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    unchanged: list[dict[str, Any]] = []

    for case in pending_cases:
        case_id = case.get("case_id")
        temporary_matricule = case.get("generated_matricule")
        found_matricule = _find_existing_matricule(
            db,
            nom=case.get("nom", ""),
            prenom=case.get("prenom", ""),
        )

        if not found_matricule:
            unchanged.append(
                {
                    "case_id": case_id,
                    "reason": "no_match_found",
                    "temporary_matricule": temporary_matricule,
                }
            )
            continue

        if found_matricule == temporary_matricule:
            unchanged.append(
                {
                    "case_id": case_id,
                    "reason": "already_same_matricule",
                    "temporary_matricule": temporary_matricule,
                }
            )
            continue

        temp_student = db.query(Etudiant).filter(Etudiant.matricule == temporary_matricule).first()
        if not temp_student:
            conflicts.append(
                {
                    "case_id": case_id,
                    "reason": "temporary_student_not_found",
                    "temporary_matricule": temporary_matricule,
                    "found_matricule": found_matricule,
                }
            )
            continue

        existing_real = db.query(Etudiant).filter(Etudiant.matricule == found_matricule).first()
        if existing_real and existing_real.id != temp_student.id:
            conflicts.append(
                {
                    "case_id": case_id,
                    "reason": "real_matricule_already_assigned",
                    "temporary_student_id": temp_student.id,
                    "existing_student_id": existing_real.id,
                    "temporary_matricule": temporary_matricule,
                    "found_matricule": found_matricule,
                }
            )
            continue

        update_item = {
            "case_id": case_id,
            "student_id": temp_student.id,
            "temporary_matricule": temporary_matricule,
            "new_matricule": found_matricule,
        }

        if not preview:
            temp_student.matricule = found_matricule
            case["status"] = "resolved"
            case["resolved_at"] = datetime.utcnow().isoformat() + "Z"
            case["resolved_matricule"] = found_matricule
            db.flush()

        updates.append(update_item)

    if not preview and updates:
        _write_pending_cases(cases, pending_file)

    return {
        "preview": preview,
        "total_pending": len(pending_cases),
        "updates_count": len(updates),
        "conflicts_count": len(conflicts),
        "unchanged_count": len(unchanged),
        "updates": updates,
        "conflicts": conflicts,
        "unchanged": unchanged,
    }
