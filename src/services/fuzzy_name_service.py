from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from src.Database.models import Etudiant, RechercheNameLog, VariationNom

_WHITESPACE_RE = re.compile(r"\s+")
_NON_ALNUM_SPACE_RE = re.compile(r"[^a-z0-9 ]")


def normalize_text(value: str | None) -> str:
	if not value:
		return ""

	no_accents = unicodedata.normalize("NFKD", value)
	no_accents = "".join(char for char in no_accents if not unicodedata.combining(char))
	lowered = no_accents.lower().strip()
	lowered = _NON_ALNUM_SPACE_RE.sub(" ", lowered)
	lowered = _WHITESPACE_RE.sub(" ", lowered)
	return lowered.strip()


def _soundex(value: str | None) -> str:
	text = normalize_text(value).replace(" ", "")
	if not text:
		return ""

	first = text[0].upper()
	mapping = {
		"b": "1",
		"f": "1",
		"p": "1",
		"v": "1",
		"c": "2",
		"g": "2",
		"j": "2",
		"k": "2",
		"q": "2",
		"s": "2",
		"x": "2",
		"z": "2",
		"d": "3",
		"t": "3",
		"l": "4",
		"m": "5",
		"n": "5",
		"r": "6",
	}

	encoded: list[str] = []
	previous = mapping.get(text[0], "")

	for char in text[1:]:
		code = mapping.get(char, "")
		if code != previous and code:
			encoded.append(code)
		previous = code

	return (first + "".join(encoded) + "000")[:4]


def _metaphone(value: str | None) -> str:
	try:
		from metaphone import doublemetaphone
	except Exception:
		return ""

	normalized = normalize_text(value)
	if not normalized:
		return ""

	primary, secondary = doublemetaphone(normalized)
	return (primary or secondary or "").upper()


def _build_trigrams(value: str | None) -> set[str]:
	normalized = normalize_text(value)
	if not normalized:
		return set()

	padded = f"  {normalized} "
	return {padded[i : i + 3] for i in range(len(padded) - 2)}


def _serialize_trigrams(trigrams: Iterable[str]) -> str:
	unique = sorted({item for item in trigrams if item})
	return "|".join(unique)


def _deserialize_trigrams(value: str | None) -> set[str]:
	if not value:
		return set()
	return {part for part in value.split("|") if part}


def _trigram_similarity(query: set[str], candidate: set[str]) -> float:
	if not query or not candidate:
		return 0.0
	overlap = len(query.intersection(candidate))
	return (2.0 * overlap) / (len(query) + len(candidate))


def build_student_search_keys(nom: str | None, prenom: str | None) -> dict[str, str]:
	nom_n = normalize_text(nom)
	prenom_n = normalize_text(prenom)
	return {
		"nom_soundex": _soundex(nom_n),
		"prenom_soundex": _soundex(prenom_n),
		"nom_metaphone": _metaphone(nom_n),
		"prenom_metaphone": _metaphone(prenom_n),
		"nom_trigram": _serialize_trigrams(_build_trigrams(nom_n)),
		"prenom_trigram": _serialize_trigrams(_build_trigrams(prenom_n)),
	}


def apply_student_search_keys(student: Etudiant) -> None:
	keys = build_student_search_keys(student.nom, student.prenom)
	student.nom_soundex = keys["nom_soundex"]
	student.prenom_soundex = keys["prenom_soundex"]
	student.nom_metaphone = keys["nom_metaphone"]
	student.prenom_metaphone = keys["prenom_metaphone"]
	student.nom_trigram = keys["nom_trigram"]
	student.prenom_trigram = keys["prenom_trigram"]


def _assemble_search_term(nom: str, prenom: str, matricule: str | None = None) -> str:
	parts = [part.strip() for part in [nom, prenom, matricule or ""] if part and part.strip()]
	return " ".join(parts)


def _find_candidate_ids(
	db: Session,
	*,
	nom_n: str,
	prenom_n: str,
	matricule_n: str,
	nom_soundex: str,
	prenom_soundex: str,
	nom_metaphone: str,
	prenom_metaphone: str,
	cap: int = 2500,
) -> list[int]:
	candidate_ids: set[int] = set()

	if nom_n:
		rows = (
			db.query(Etudiant.id)
			.filter(func.lower(Etudiant.nom).like(f"%{nom_n}%"))
			.limit(800)
			.all()
		)
		candidate_ids.update(row[0] for row in rows)

	if prenom_n:
		rows = (
			db.query(Etudiant.id)
			.filter(func.lower(Etudiant.prenom).like(f"%{prenom_n}%"))
			.limit(800)
			.all()
		)
		candidate_ids.update(row[0] for row in rows)

	if nom_soundex or prenom_soundex or nom_metaphone or prenom_metaphone:
		phonetic_filters = []
		if nom_soundex:
			phonetic_filters.append(Etudiant.nom_soundex == nom_soundex)
		if prenom_soundex:
			phonetic_filters.append(Etudiant.prenom_soundex == prenom_soundex)
		if nom_metaphone:
			phonetic_filters.append(Etudiant.nom_metaphone == nom_metaphone)
		if prenom_metaphone:
			phonetic_filters.append(Etudiant.prenom_metaphone == prenom_metaphone)

		rows = db.query(Etudiant.id).filter(or_(*phonetic_filters)).limit(1200).all()
		candidate_ids.update(row[0] for row in rows)

	if matricule_n:
		rows = (
			db.query(Etudiant.id)
			.filter(func.lower(Etudiant.matricule).like(f"%{matricule_n}%"))
			.limit(600)
			.all()
		)
		candidate_ids.update(row[0] for row in rows)

	variation_patterns = []
	if nom_n and prenom_n:
		variation_patterns.append(f"%{nom_n} {prenom_n}%")
		variation_patterns.append(f"%{prenom_n} {nom_n}%")
	if nom_n:
		variation_patterns.append(f"%{nom_n}%")
	if prenom_n:
		variation_patterns.append(f"%{prenom_n}%")

	if variation_patterns:
		rows = (
			db.query(VariationNom.etudiant_id)
			.filter(or_(*[func.lower(VariationNom.variation).like(pattern) for pattern in variation_patterns]))
			.limit(1200)
			.all()
		)
		candidate_ids.update(row[0] for row in rows)

	if not candidate_ids:
		rows = db.query(Etudiant.id).order_by(Etudiant.id.desc()).limit(2000).all()
		candidate_ids.update(row[0] for row in rows)

	if len(candidate_ids) > cap:
		return list(sorted(candidate_ids))[:cap]

	return list(candidate_ids)


def _search_history_boost_map(db: Session, normalized_term: str, candidate_ids: list[int]) -> dict[int, int]:
	if not normalized_term or not candidate_ids:
		return {}

	rows = (
		db.query(RechercheNameLog.etudiant_id, func.count(RechercheNameLog.id))
		.filter(
			RechercheNameLog.terme_normalise == normalized_term,
			RechercheNameLog.correction_utilisateur == 1,
			RechercheNameLog.etudiant_id.isnot(None),
			RechercheNameLog.etudiant_id.in_(candidate_ids),
		)
		.group_by(RechercheNameLog.etudiant_id)
		.all()
	)

	return {int(etudiant_id): int(count) for etudiant_id, count in rows if etudiant_id is not None}


def _best_variation_match(student: Etudiant, full_query: str, nom_n: str, prenom_n: str) -> tuple[float, str | None]:
	if not student.variations:
		return 0.0, None

	best_bonus = 0.0
	best_reason: str | None = None

	for variation in student.variations:
		var_norm = normalize_text(variation.variation)
		if not var_norm:
			continue

		freq_bonus = min(float(variation.frequence or 1), 5.0)
		if full_query and var_norm == full_query:
			score = 18.0 + freq_bonus
			if score > best_bonus:
				best_bonus = score
				best_reason = "historical variation exact match"
			continue

		if full_query and full_query in var_norm:
			score = 10.0 + freq_bonus
			if score > best_bonus:
				best_bonus = score
				best_reason = "historical variation partial match"
			continue

		if nom_n and prenom_n and (nom_n in var_norm or prenom_n in var_norm):
			score = 7.0 + freq_bonus
			if score > best_bonus:
				best_bonus = score
				best_reason = "historical variation token match"

	return best_bonus, best_reason


def suggest_student_candidates(
	db: Session,
	*,
	nom: str,
	prenom: str,
	matricule: str | None = None,
	limit: int = 5,
) -> dict:
	limit = max(1, min(limit, 20))

	nom_n = normalize_text(nom)
	prenom_n = normalize_text(prenom)
	matricule_n = normalize_text(matricule or "")
	full_query = normalize_text(_assemble_search_term(nom, prenom))

	query_keys = build_student_search_keys(nom_n, prenom_n)
	query_nom_trigrams = _build_trigrams(nom_n)
	query_prenom_trigrams = _build_trigrams(prenom_n)

	candidate_ids = _find_candidate_ids(
		db,
		nom_n=nom_n,
		prenom_n=prenom_n,
		matricule_n=matricule_n,
		nom_soundex=query_keys["nom_soundex"],
		prenom_soundex=query_keys["prenom_soundex"],
		nom_metaphone=query_keys["nom_metaphone"],
		prenom_metaphone=query_keys["prenom_metaphone"],
	)

	history_boost = _search_history_boost_map(db, full_query, candidate_ids)

	students = (
		db.query(Etudiant)
		.options(selectinload(Etudiant.variations))
		.filter(Etudiant.id.in_(candidate_ids))
		.all()
	)

	scored: list[dict] = []
	for student in students:
		score = 0.0
		reasons: list[str] = []

		student_nom_n = normalize_text(student.nom)
		student_prenom_n = normalize_text(student.prenom)
		student_matricule_n = normalize_text(student.matricule)

		if nom_n and prenom_n and student_nom_n == nom_n and student_prenom_n == prenom_n:
			score += 35.0
			reasons.append("exact nom+prenom")
		else:
			if nom_n and student_nom_n == nom_n:
				score += 15.0
				reasons.append("exact nom")
			if prenom_n and student_prenom_n == prenom_n:
				score += 15.0
				reasons.append("exact prenom")

		if matricule_n:
			if student_matricule_n and student_matricule_n == matricule_n:
				score += 22.0
				reasons.append("exact matricule")
			elif student_matricule_n and matricule_n in student_matricule_n:
				score += 10.0
				reasons.append("partial matricule")

		student_nom_soundex = student.nom_soundex or _soundex(student_nom_n)
		student_prenom_soundex = student.prenom_soundex or _soundex(student_prenom_n)
		student_nom_metaphone = student.nom_metaphone or _metaphone(student_nom_n)
		student_prenom_metaphone = student.prenom_metaphone or _metaphone(student_prenom_n)

		if query_keys["nom_soundex"] and query_keys["nom_soundex"] == student_nom_soundex:
			score += 8.0
			reasons.append("nom soundex")
		if query_keys["prenom_soundex"] and query_keys["prenom_soundex"] == student_prenom_soundex:
			score += 8.0
			reasons.append("prenom soundex")
		if query_keys["nom_metaphone"] and query_keys["nom_metaphone"] == student_nom_metaphone:
			score += 10.0
			reasons.append("nom metaphone")
		if query_keys["prenom_metaphone"] and query_keys["prenom_metaphone"] == student_prenom_metaphone:
			score += 10.0
			reasons.append("prenom metaphone")

		student_nom_trigrams = _deserialize_trigrams(student.nom_trigram) or _build_trigrams(student_nom_n)
		student_prenom_trigrams = _deserialize_trigrams(student.prenom_trigram) or _build_trigrams(student_prenom_n)
		nom_trigram_similarity = _trigram_similarity(query_nom_trigrams, student_nom_trigrams)
		prenom_trigram_similarity = _trigram_similarity(query_prenom_trigrams, student_prenom_trigrams)

		if nom_trigram_similarity > 0:
			score += nom_trigram_similarity * 12.0
			if nom_trigram_similarity >= 0.45:
				reasons.append(f"nom trigram {nom_trigram_similarity:.2f}")
		if prenom_trigram_similarity > 0:
			score += prenom_trigram_similarity * 12.0
			if prenom_trigram_similarity >= 0.45:
				reasons.append(f"prenom trigram {prenom_trigram_similarity:.2f}")

		variation_bonus, variation_reason = _best_variation_match(student, full_query, nom_n, prenom_n)
		if variation_bonus > 0:
			score += variation_bonus
			if variation_reason:
				reasons.append(variation_reason)

		history_count = history_boost.get(student.id, 0)
		if history_count > 0:
			bonus = min(history_count * 3.0, 9.0)
			score += bonus
			reasons.append("historical user correction")

		scored.append(
			{
				"student_id": student.id,
				"full_name": f"{student.nom} {student.prenom}".strip(),
				"nom": student.nom,
				"prenom": student.prenom,
				"matricule": student.matricule,
				"score": round(score, 2),
				"reasons": reasons[:8],
			}
		)

	ranked = sorted(scored, key=lambda item: item["score"], reverse=True)
	top = ranked[:limit]

	raw_term = _assemble_search_term(nom, prenom, matricule)
	db.add(
		RechercheNameLog(
			etudiant_id=None,
			terme_recherche=raw_term,
			terme_normalise=normalize_text(raw_term),
			type_recherche="fuzzy_suggestion",
			resultats_trouves=len(top),
			correction_utilisateur=0,
		)
	)
	db.flush()

	return {
		"query": {
			"nom": nom,
			"prenom": prenom,
			"matricule": matricule,
		},
		"total_candidates_considered": len(students),
		"suggestions": top,
	}


def register_selected_suggestion(
	db: Session,
	*,
	selected_student_id: int,
	searched_nom: str,
	searched_prenom: str,
	searched_matricule: str | None = None,
	result_count: int = 0,
) -> dict:
	student = db.query(Etudiant).filter(Etudiant.id == selected_student_id).first()
	if not student:
		raise ValueError(f"Student with id={selected_student_id} was not found")

	raw_search = _assemble_search_term(searched_nom, searched_prenom, searched_matricule)
	normalized_search = normalize_text(raw_search)
	canonical_name = normalize_text(f"{student.nom} {student.prenom}")

	variation = (
		db.query(VariationNom)
		.filter(
			VariationNom.etudiant_id == student.id,
			VariationNom.variation == normalized_search,
		)
		.first()
	)

	now = datetime.utcnow()
	if variation:
		variation.frequence = int(variation.frequence or 1) + 1
		variation.derniere_utilisation = now
	else:
		db.add(
			VariationNom(
				etudiant_id=student.id,
				nom_canonique=canonical_name,
				variation=normalized_search,
				frequence=1,
				derniere_utilisation=now,
			)
		)

	db.add(
		RechercheNameLog(
			etudiant_id=student.id,
			terme_recherche=raw_search,
			terme_normalise=normalized_search,
			type_recherche="fuzzy_suggestion_selection",
			resultats_trouves=max(0, int(result_count or 0)),
			correction_utilisateur=1,
		)
	)
	db.flush()

	return {
		"selected_student_id": student.id,
		"selected_student": {
			"nom": student.nom,
			"prenom": student.prenom,
			"matricule": student.matricule,
		},
		"variation_recorded": normalized_search,
	}


def rebuild_student_search_keys(db: Session, batch_size: int = 500) -> dict:
	batch_size = max(50, min(batch_size, 5000))
	offset = 0
	processed = 0

	while True:
		rows = (
			db.query(Etudiant)
			.order_by(Etudiant.id.asc())
			.offset(offset)
			.limit(batch_size)
			.all()
		)
		if not rows:
			break

		for student in rows:
			apply_student_search_keys(student)
			processed += 1

		db.flush()
		offset += len(rows)

	return {
		"processed_students": processed,
		"batch_size": batch_size,
	}
