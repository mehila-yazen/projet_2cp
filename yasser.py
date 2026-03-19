import json
import os
import difflib
import re
import sys
import time
from pathlib import Path

from google import genai
from google.genai import types
from pdf2image import convert_from_path
from PIL import Image, ImageEnhance, ImageFilter, ImageOps


API_KEY_ENV = "GEMINI_API_KEY"
MODEL_NAME = "gemini-2.5-flash"
TARGET_YEAR = "1978-1979"

# -----------------------------
# TEST CONFIG (edit for quick local testing)
# -----------------------------
TEST_API_KEY = "AIzaSyA2LpuJ0ORMiL0rGgKpThqPR8EPwg253Rs"
TEST_PDF_PATH = "data/2 IH.pdf"
TEST_OUTPUT_FILE = "output_1978_1979_combined.json"

# PERFORMANCE CONTROLS
FAST_MODE = True
PDF_DPI = 220 if FAST_MODE else 300
MAX_PREPROCESS_VARIANTS = 2 if FAST_MODE else 5
MAX_DOCUMENT_PAGES = None  # e.g. set to 6 for quick runs
ENABLE_MODULE_RETRY = not FAST_MODE
MODULE_STOP_SCORE = 10
MODULE_MIN_ACCEPTABLE_COUNT = 8 if FAST_MODE else 10
MODULE_CODE_FUZZY_MIN_SCORE = 0.72


def require_client():
    api_key = TEST_API_KEY.strip() or os.getenv(API_KEY_ENV)
    if not api_key:
        print(f"Missing API key. Set TEST_API_KEY in code or set {API_KEY_ENV} in your environment.")
        sys.exit(1)
    return genai.Client(api_key=api_key)


def pdf_to_images(pdf_path: str, dpi: int = PDF_DPI, max_pages=None):
    images = convert_from_path(pdf_path, dpi=dpi)
    if isinstance(max_pages, int) and max_pages > 0:
        images = images[:max_pages]
    stem = Path(pdf_path).stem
    paths = []
    for idx, image in enumerate(images, start=1):
        out = Path(f"{stem}_page_{idx}.png")
        image.save(out, "PNG")
        paths.append(out)
    return paths


def build_preprocessed_variants(image_path: Path, max_variants: int = MAX_PREPROCESS_VARIANTS):
    variants = [image_path]
    created = []

    try:
        base = Image.open(image_path).convert("RGB")
    except Exception:
        return variants, created

    stem = image_path.stem
    parent = image_path.parent

    def save_variant(img, suffix):
        variant_path = parent / f"{stem}_{suffix}.png"
        img.save(variant_path, "PNG")
        variants.append(variant_path)
        created.append(variant_path)

    if len(variants) < max_variants:
        try:
            gray_auto = ImageOps.autocontrast(ImageOps.grayscale(base), cutoff=1)
            save_variant(gray_auto, "prep_gray_auto")
        except Exception:
            pass

    if len(variants) < max_variants:
        try:
            denoise_bin = ImageOps.grayscale(base).filter(ImageFilter.MedianFilter(size=3))
            denoise_bin = ImageOps.autocontrast(denoise_bin, cutoff=1)
            denoise_bin = denoise_bin.point(lambda p: 255 if p > 165 else 0)
            save_variant(denoise_bin, "prep_bin")
        except Exception:
            pass

    if len(variants) < max_variants:
        try:
            up2 = base.resize((base.width * 2, base.height * 2), Image.Resampling.LANCZOS)
            up2 = ImageOps.grayscale(up2)
            up2 = ImageEnhance.Contrast(up2).enhance(1.8)
            up2 = ImageOps.autocontrast(up2, cutoff=1)
            save_variant(up2, "prep_up2")
        except Exception:
            pass

    if len(variants) < max_variants:
        try:
            sharp = ImageEnhance.Sharpness(base).enhance(2.0)
            sharp = ImageEnhance.Contrast(sharp).enhance(1.5)
            sharp = ImageOps.grayscale(sharp)
            save_variant(sharp, "prep_sharp")
        except Exception:
            pass

    return variants, created


def cleanup_temp_images(paths):
    for path in paths:
        try:
            if path.exists():
                path.unlink()
        except Exception:
            pass


def clean_json(text: str):
    if not text:
        return None

    objs = []
    i = 0
    n = len(text)
    while i < n:
        start = text.find("{", i)
        if start == -1:
            break
        depth = 0
        in_string = False
        escape = False
        end = None
        for j in range(start, n):
            ch = text[j]
            if escape:
                escape = False
                continue
            if ch == "\\":
                if in_string:
                    escape = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = j
                    break
        if end is None:
            break
        candidate = text[start : end + 1]
        try:
            objs.append(json.loads(candidate))
        except Exception:
            pass
        i = end + 1

    if not objs:
        return None
    return objs[-1]


def as_number_or_uncertain(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)

    raw = str(value).strip()
    if raw == "":
        return None
    lowered = raw.lower()
    if lowered in {"uncertain", "illisible", "unknown", "?"}:
        return "uncertain"

    normalized = raw.replace(",", ".")
    match = re.match(r"^[-+]?\d+(\.\d+)?$", normalized)
    if match:
        try:
            return float(normalized)
        except Exception:
            return "uncertain"

    return "uncertain"


def as_natural_or_uncertain(value):
    num = as_number_or_uncertain(value)
    if num in (None, "uncertain"):
        return num
    try:
        integer = int(float(num))
    except Exception:
        return "uncertain"
    if integer < 0:
        return "uncertain"
    return integer


def as_moyenne_decimal_or_uncertain(value):
    if value is None:
        return None

    if isinstance(value, bool):
        return "uncertain"

    if isinstance(value, int):
        return "uncertain"

    if isinstance(value, float):
        return float(value)

    raw = str(value).strip()
    if raw == "":
        return None

    lowered = raw.lower()
    if lowered in {"uncertain", "illisible", "unknown", "?"}:
        return "uncertain"

    if not re.match(r"^[-+]?\d+[\.,]\d+$", raw):
        return "uncertain"

    normalized = raw.replace(",", ".")
    try:
        return float(normalized)
    except Exception:
        return "uncertain"


def normalize_code(value):
    if value is None:
        return ""
    return re.sub(r"\s+", "", str(value)).upper()


def code_similarity(left, right):
    if not left or not right:
        return 0.0

    base_score = difflib.SequenceMatcher(None, left, right).ratio()
    bonus = 0.0
    if left[0] == right[0]:
        bonus += 0.05
    if abs(len(left) - len(right)) <= 1:
        bonus += 0.03
    return min(1.0, base_score + bonus)


def best_fuzzy_code_match(source_key, candidate_keys):
    if not source_key:
        return None, 0.0

    best_key = None
    best_score = 0.0
    for candidate_key in candidate_keys:
        score = code_similarity(source_key, candidate_key)
        if score > best_score:
            best_score = score
            best_key = candidate_key
    return best_key, best_score


def as_float_or_none(value):
    if isinstance(value, (int, float)):
        return float(value)
    return None


def averages_match(s1, s2, annuel, tolerance=0.011):
    expected = (s1 + s2) / 2
    return abs(expected - annuel) <= tolerance


def fix_moyenne_consistency(moyenne):
    if not isinstance(moyenne, dict):
        return moyenne

    moyenne["S1"] = as_moyenne_decimal_or_uncertain(moyenne.get("S1"))
    moyenne["S2"] = as_moyenne_decimal_or_uncertain(moyenne.get("S2"))
    moyenne["annuel"] = as_moyenne_decimal_or_uncertain(moyenne.get("annuel"))

    s1_num = as_float_or_none(moyenne.get("S1"))
    s2_num = as_float_or_none(moyenne.get("S2"))
    annuel_num = as_float_or_none(moyenne.get("annuel"))

    if s1_num is None or s2_num is None:
        return moyenne

    computed_annuel = round((s1_num + s2_num) / 2, 2)
    if annuel_num is None:
        moyenne["annuel"] = computed_annuel
        return moyenne

    if averages_match(s1_num, s2_num, annuel_num):
        return moyenne

    moyenne["annuel"] = computed_annuel
    return moyenne


def enforce_student_summary_rules(students_payload):
    if not isinstance(students_payload, dict):
        return students_payload

    students = students_payload.get("students") if isinstance(students_payload.get("students"), list) else []
    for student in students:
        if not isinstance(student, dict):
            continue

        moyenne = student.get("moyenne") if isinstance(student.get("moyenne"), dict) else {}
        student["moyenne"] = fix_moyenne_consistency(moyenne)

        rang = student.get("rang") if isinstance(student.get("rang"), dict) else {}
        student["rang"] = {
            "S1": None,
            "S2": None,
            "annuel": as_natural_or_uncertain(rang.get("annuel")),
        }

    students_payload["students"] = students
    return students_payload


def normalize_student_payload(data):
    payload = data if isinstance(data, dict) else {}

    students = payload.get("students") if isinstance(payload.get("students"), list) else []
    normalized_students = []
    for student in students:
        if not isinstance(student, dict):
            continue

        modules = student.get("module") if isinstance(student.get("module"), list) else []
        normalized_modules = []
        for module in modules:
            if not isinstance(module, dict):
                continue
            normalized_modules.append(
                {
                    "code": module.get("code") if module.get("code") not in ("",) else "uncertain",
                    "noteS1": as_number_or_uncertain(module.get("noteS1")),
                    "noteS2": as_number_or_uncertain(module.get("noteS2")),
                }
            )

        moyenne = student.get("moyenne") if isinstance(student.get("moyenne"), dict) else {}
        rang = student.get("rang") if isinstance(student.get("rang"), dict) else {}

        normalized_students.append(
            {
                "nom": student.get("nom") if student.get("nom") not in ("",) else "uncertain",
                "prenom": student.get("prenom") if student.get("prenom") not in ("",) else "uncertain",
                "matricule": student.get("matricule") if student.get("matricule") not in ("",) else None,
                "module": normalized_modules,
                "moyenne": {
                    "S1": as_moyenne_decimal_or_uncertain(moyenne.get("S1")),
                    "S2": as_moyenne_decimal_or_uncertain(moyenne.get("S2")),
                    "annuel": as_moyenne_decimal_or_uncertain(moyenne.get("annuel")),
                },
                "rang": {
                    "S1": as_natural_or_uncertain(rang.get("S1")),
                    "S2": as_natural_or_uncertain(rang.get("S2")),
                    "annuel": as_natural_or_uncertain(rang.get("annuel")),
                },
                "decisionDeJuin": student.get("decisionDeJuin"),
                "nbrAbs": as_natural_or_uncertain(student.get("nbrAbs")),
                "noteDeStage": as_natural_or_uncertain(student.get("noteDeStage")),
                "decisionFinaleDuConseil": student.get("decisionFinaleDuConseil"),
            }
        )

    return {
        "annee": TARGET_YEAR,
        "anneeEtude": payload.get("anneeEtude"),
        "section": payload.get("section"),
        "option": payload.get("option"),
        "students": normalized_students,
        "error": payload.get("error"),
        "markdown": payload.get("markdown"),
    }


def normalize_module_table_payload(data):
    payload = data if isinstance(data, dict) else {}
    matieres = payload.get("matieres") if isinstance(payload.get("matieres"), list) else []

    normalized_matieres = []
    for matiere in matieres:
        if not isinstance(matiere, dict):
            continue
        coef = matiere.get("coef") if isinstance(matiere.get("coef"), dict) else {}
        moyenne = matiere.get("moyenne") if isinstance(matiere.get("moyenne"), dict) else {}
        normalized_matieres.append(
            {
                "abrev": matiere.get("abrev") if matiere.get("abrev") not in ("",) else "uncertain",
                "libelle": matiere.get("libelle") if matiere.get("libelle") not in ("",) else "uncertain",
                "coef": {
                    "S1": as_natural_or_uncertain(coef.get("S1")),
                    "S2": as_natural_or_uncertain(coef.get("S2")),
                },
                "moyenne": {
                    "S1": as_number_or_uncertain(moyenne.get("S1")),
                    "S1_80%": as_number_or_uncertain(moyenne.get("S1_80%")),
                    "S2": as_number_or_uncertain(moyenne.get("S2")),
                    "S2_80%": as_number_or_uncertain(moyenne.get("S2_80%")),
                    "annuel": as_number_or_uncertain(moyenne.get("annuel")),
                    "annuel_80%": as_number_or_uncertain(moyenne.get("annuel_80%")),
                },
            }
        )

    moyenne_prommo = payload.get("moyennePrommo") if isinstance(payload.get("moyennePrommo"), dict) else {}

    return {
        "matieres": normalized_matieres,
        "moyennePrommo": {
            "S1": as_number_or_uncertain(moyenne_prommo.get("S1")),
            "S1_80%": as_number_or_uncertain(moyenne_prommo.get("S1_80%")),
            "S2": as_number_or_uncertain(moyenne_prommo.get("S2")),
            "S2_80%": as_number_or_uncertain(moyenne_prommo.get("S2_80%")),
            "annuel": as_number_or_uncertain(moyenne_prommo.get("annuel")),
            "annuel_80%": as_number_or_uncertain(moyenne_prommo.get("annuel_80%")),
        },
        "error": payload.get("error"),
    }


def count_extracted_modules(modules_payload):
    if not isinstance(modules_payload, dict):
        return 0
    matieres = modules_payload.get("matieres")
    if not isinstance(matieres, list):
        return 0
    return len([m for m in matieres if isinstance(m, dict) and m.get("abrev")])


def call_model_json(client, image_path: Path, prompt: str):
    with open(image_path, "rb") as f:
        image_bytes = f.read()

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=[
            prompt,
            types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
        ],
    )
    return clean_json(response.text)


def extract_best_raw_from_variants(client, image_path: Path, prompt: str, score_fn, stop_score=None):
    variants, created = build_preprocessed_variants(image_path)
    best_raw = None
    best_score = -1

    try:
        for variant in variants:
            raw = call_model_json(client, variant, prompt)
            score = score_fn(raw)
            if score > best_score:
                best_raw = raw
                best_score = score
            if stop_score is not None and best_score >= stop_score:
                break
    finally:
        cleanup_temp_images(created)

    return best_raw


def enforce_module_note_rules(students_payload, modules_payload):
    if not isinstance(students_payload, dict):
        return students_payload
    if not isinstance(modules_payload, dict):
        return students_payload

    matieres = modules_payload.get("matieres") if isinstance(modules_payload.get("matieres"), list) else []
    if not matieres:
        return students_payload

    expected_codes = []
    coef_by_code = {}
    for matiere in matieres:
        if not isinstance(matiere, dict):
            continue
        code = matiere.get("abrev")
        key = normalize_code(code)
        if not key:
            continue
        expected_codes.append(code)
        coef = matiere.get("coef") if isinstance(matiere.get("coef"), dict) else {}
        coef_by_code[key] = {
            "S1": coef.get("S1"),
            "S2": coef.get("S2"),
        }

    students = students_payload.get("students") if isinstance(students_payload.get("students"), list) else []
    normalized_students = []
    for student in students:
        if not isinstance(student, dict):
            continue

        modules = student.get("module") if isinstance(student.get("module"), list) else []

        normalized_candidates = []
        for mod in modules:
            if not isinstance(mod, dict):
                continue
            raw_key = normalize_code(mod.get("code"))
            normalized_candidates.append((raw_key, mod))

        matched_by_expected_key = {}
        used_candidate_indexes = set()

        remaining_expected_keys = {normalize_code(code) for code in expected_codes if normalize_code(code)}

        for idx, (candidate_key, mod) in enumerate(normalized_candidates):
            if candidate_key in {"", "UNCERTAIN"}:
                continue
            if candidate_key in remaining_expected_keys:
                matched_by_expected_key[candidate_key] = mod
                remaining_expected_keys.remove(candidate_key)
                used_candidate_indexes.add(idx)

        for idx, (candidate_key, mod) in enumerate(normalized_candidates):
            if idx in used_candidate_indexes:
                continue
            if candidate_key in {"", "UNCERTAIN"}:
                continue
            if not remaining_expected_keys:
                break

            best_key, best_score = best_fuzzy_code_match(candidate_key, remaining_expected_keys)
            if best_key is None:
                continue
            if best_score < MODULE_CODE_FUZZY_MIN_SCORE:
                continue

            matched_by_expected_key[best_key] = mod
            remaining_expected_keys.remove(best_key)
            used_candidate_indexes.add(idx)

        ordered_modules = []
        for expected_code in expected_codes:
            key = normalize_code(expected_code)
            source = matched_by_expected_key.get(key, {})
            rules = coef_by_code.get(key, {"S1": None, "S2": None})

            note_s1 = as_number_or_uncertain(source.get("noteS1")) if isinstance(source, dict) else None
            note_s2 = as_number_or_uncertain(source.get("noteS2")) if isinstance(source, dict) else None

            if rules.get("S1") in (None, "uncertain"):
                note_s1 = None
            elif note_s1 is None:
                note_s1 = "uncertain"

            if rules.get("S2") in (None, "uncertain"):
                note_s2 = None
            elif note_s2 is None:
                note_s2 = "uncertain"

            ordered_modules.append(
                {
                    "code": expected_code,
                    "noteS1": note_s1,
                    "noteS2": note_s2,
                }
            )

        student["module"] = ordered_modules
        normalized_students.append(student)

    students_payload["students"] = normalized_students
    return students_payload


def extract_students_pages(client, page_paths, modules_payload):
    modules_reference = json.dumps(modules_payload.get("matieres", []), ensure_ascii=False, indent=2)
    expected_matieres = modules_payload.get("matieres") if isinstance(modules_payload.get("matieres"), list) else []
    expected_codes = [
        normalize_code(m.get("abrev"))
        for m in expected_matieres
        if isinstance(m, dict) and normalize_code(m.get("abrev"))
    ]
    expected_count = len(expected_codes)

    prompt_template = """Tu extrais des bulletins français scannés (année universitaire 1978-1979).

Contexte garanti:
- Langue du document: français.
- Les notes décimales peuvent être écrites avec un point ou une virgule.
- En cas d'incertitude de lecture, mets "uncertain".
- Tu dois retourner uniquement un JSON valide.

Table de référence des modules (OBLIGATOIRE pour aligner les colonnes et éviter shifting):
__MODULES_REFERENCE__

Règles de cohérence obligatoires avec cette table:
- L'ordre du tableau module étudiant doit suivre EXACTEMENT l'ordre des abréviations de la table ci-dessus.
- Couverture obligatoire: retourner TOUS les modules de la table de référence, sans aucune exception et sans omission.
- La longueur de `student.module` doit être exactement égale à la longueur de la table de référence.
- Si une note module est illisible, garder le module et mettre la valeur concernée à "uncertain" (ne jamais supprimer le module).
- IMPORTANT LAYOUT: `noteS1` et `noteS2` d'un module viennent du MÊME champ/carré, avec `S1` en premier puis `S2` en second.
- Verrouillage colonne module: chaque note module doit provenir de la MÊME colonne que l'abréviation du module correspondant.
- Si l'abréviation OCR du tableau étudiants est bruitée, comparer à la table de référence et choisir l'abréviation identique ou la plus proche.
- Interdiction absolue de prendre une valeur depuis la colonne d'un autre module.
- `moyenne.annuel` est dans un champ INDÉPENDANT, distinct et éloigné du champ des notes S1/S2.
- Zone moyenne à lire en priorité sur la partie DROITE du document.
- Ordre de lecture moyenne: d'abord `moyenne.annuel` (nombre décimal seul), puis 1 à 2 colonnes après un champ avec 2 lignes: ligne 1 = `moyenne.S1`, ligne 2 = `moyenne.S2`.
- Appliquer ces règles de moyenne à CHAQUE étudiant de CHAQUE page.
- RÈGLE PRIORITAIRE: `moyenne.annuel` NE DOIT JAMAIS être lue/copier depuis le bloc des moyennes semestrielles S1/S2.
- Si seul le bloc S1/S2 est lisible et que le champ annuel indépendant ne l'est pas, alors `moyenne.annuel` = "uncertain".
- Le champ de rang (souvent écrit `2eme`, `3eme`, `4eme`, etc.) est le DERNIER champ de la ligne étudiant.
- Dans ces documents, seul le rang annuel est présent: `rang.S1` = null et `rang.S2` = null.
- Le DERNIER champ entier ordinal (`2eme`, `3eme`, ...) correspond à `rang.annuel`.
- L'autre champ entier non décimal correspond à `noteDeStage` (pas un rang semestriel).
- Les moyennes S1 et S2 sont toutes les deux dans le même champ/zone « moyennes semestrielles ».
- Alignement obligatoire des semestres: `moyenne.S1` est sur la même ligne que les valeurs `noteS1` des modules (colonne différente), et `moyenne.S2` sur la même ligne que `noteS2`.
- Ne jamais inverser/permuter S1 et S2 (ni dans `moyenne`, ni dans les notes modules).
- Si un coef existe pour un semestre (S1/S2), la note du semestre correspondant doit exister.
- Si un coef n'existe pas (null), la note correspondante doit être null.
- INTERDICTION ABSOLUE DE SHIFT: ne jamais décaler les notes/valeurs d'un module vers un autre ni d'un champ vers un autre.
- Vérification moyenne annuelle: calculer `(moyenne.S1 + moyenne.S2) / 2`.
- Si le calcul n'est pas égal à `moyenne.annuel`, garder S1/S2 inchangés et corriger uniquement `moyenne.annuel` avec la formule.
- Cette correction NE DOIT JAMAIS modifier les notes des modules (`module[].noteS1`, `module[].noteS2`).

Objectif:
Extraire les informations des étudiants visibles sur la page, avec ce format EXACT:
{
  "annee": "1978-1979",
  "anneeEtude": string|null,
  "section": string|null,
  "option": string|null,
  "students": [
    {
      "nom": string|"uncertain",
      "prenom": string|"uncertain",
      "matricule": string|null,
      "module": [
        {
          "code": string|"uncertain",
          "noteS1": number|null|"uncertain",
          "noteS2": number|null|"uncertain"
        }
      ],
      "moyenne": {"S1": number|null|"uncertain", "S2": number|null|"uncertain", "annuel": number|null|"uncertain"},
      "rang": {"S1": number|null|"uncertain", "S2": number|null|"uncertain", "annuel": number|null|"uncertain"},
      "decisionDeJuin": string|null,
      "nbrAbs": number|null|"uncertain",
            "noteDeStage": integer|null|"uncertain",
      "decisionFinaleDuConseil": string|null
    }
  ],
  "error": string|null,
  "markdown": string|null
}

Contraintes:
- N'invente jamais des valeurs.
- Si vide => null.
- Si illisible/incertain => "uncertain".
- Le rang général/annuel peut être écrit sous forme ordinale (ex: "2eme", "3eme", "4eme", "5eme") : retourne uniquement l'entier dans `rang.annuel` (2, 3, 4, 5, ...).
- Dans ces documents: `rang.S1` = null et `rang.S2` = null.
- Si tu n'es pas sûr d'une valeur, mets strictement "uncertain" (ne pas deviner, ne pas décaler).
- Si la séparation/ordre S1-S2 dans le même champ n'est pas clair, mets la/les valeur(s) concernée(s) à "uncertain".
- `noteDeStage` est un nombre naturel (entier >= 0), jamais décimal, sinon "uncertain".
- Pour l'objet `moyenne`, accepter UNIQUEMENT des nombres décimaux (avec virgule ou point dans la source); ignorer les entiers/non décimaux en mettant "uncertain".
- `moyenne.annuel` est un nombre décimal (accepter virgule ou point dans la source, puis retourner un nombre JSON), sinon "uncertain".
- `moyenne.annuel` doit venir uniquement de son champ annuel indépendant (champ éloigné des S1/S2), jamais par déduction depuis S1/S2.
- Si aucun étudiant lisible sur la page: students = [] et error explique pourquoi.
- IMPORTANT: retourne UNIQUEMENT l'objet JSON, sans markdown externe.
"""
    prompt = prompt_template.replace("__MODULES_REFERENCE__", modules_reference)

    merged = {
        "annee": TARGET_YEAR,
        "anneeEtude": None,
        "section": None,
        "option": None,
        "students": [],
        "error": None,
        "markdown": None,
    }

    def student_score(raw_payload):
        if not isinstance(raw_payload, dict):
            return -1
        students = raw_payload.get("students") if isinstance(raw_payload.get("students"), list) else []
        score = len(students) * 6

        for student in students:
            if not isinstance(student, dict):
                score -= 2
                continue

            modules = student.get("module") if isinstance(student.get("module"), list) else []
            module_codes = [
                normalize_code(m.get("code"))
                for m in modules
                if isinstance(m, dict) and normalize_code(m.get("code"))
            ]
            matched_count = len(set(module_codes).intersection(expected_codes))

            if expected_count > 0:
                score += matched_count * 4
                score -= abs(len(modules) - expected_count) * 2

            moyenne = student.get("moyenne") if isinstance(student.get("moyenne"), dict) else {}
            s1_num = as_float_or_none(as_moyenne_decimal_or_uncertain(moyenne.get("S1")))
            s2_num = as_float_or_none(as_moyenne_decimal_or_uncertain(moyenne.get("S2")))
            annuel_num = as_float_or_none(as_moyenne_decimal_or_uncertain(moyenne.get("annuel")))

            if s1_num is not None:
                score += 1
            if s2_num is not None:
                score += 1
            if annuel_num is not None:
                score += 1

            if s1_num is not None and s2_num is not None and annuel_num is not None:
                if averages_match(s1_num, s2_num, annuel_num):
                    score += 3
                else:
                    score -= 1

        if raw_payload.get("anneeEtude"):
            score += 1
        if raw_payload.get("section"):
            score += 1
        if raw_payload.get("option"):
            score += 1
        if raw_payload.get("error"):
            score -= 3
        return score

    for idx, page in enumerate(page_paths, start=1):
        page_start = time.time()
        print(f"[students] page {idx}/{len(page_paths)}: {page.name}")
        raw = extract_best_raw_from_variants(client, page, prompt, student_score, stop_score=None)
        if not isinstance(raw, dict):
            print(f"[students] page {idx}: no JSON extracted ({time.time() - page_start:.1f}s)")
            continue
        normalized = normalize_student_payload(raw)
        normalized = enforce_student_summary_rules(normalized)
        if merged["anneeEtude"] is None:
            merged["anneeEtude"] = normalized.get("anneeEtude")
        if merged["section"] is None:
            merged["section"] = normalized.get("section")
        if merged["option"] is None:
            merged["option"] = normalized.get("option")
        if isinstance(normalized.get("students"), list):
            merged["students"].extend(normalized["students"])

        if normalized.get("error"):
            if merged["error"]:
                merged["error"] = f"{merged['error']} | {normalized['error']}"
            else:
                merged["error"] = normalized["error"]
        if normalized.get("markdown"):
            if merged["markdown"]:
                merged["markdown"] = f"{merged['markdown']}\n{normalized['markdown']}"
            else:
                merged["markdown"] = normalized["markdown"]
        print(f"[students] page {idx}: done in {time.time() - page_start:.1f}s")

    payload = enforce_module_note_rules(merged, modules_payload)
    payload = enforce_student_summary_rules(payload)
    return payload


def extract_modules_page(client, modules_page_path: Path):
    prompt = """Tu analyses la page TABLEAU DES MATIERES d'un bulletin français 1978-1979.

Contexte:
- Notes avec points décimaux.
- Coef est un nombre naturel.
- Si incertain, écrire "uncertain".
- Retourner uniquement un JSON valide.

Format EXACT:
{
  "matieres": [
    {
      "abrev": string|"uncertain",
      "libelle": string|"uncertain",
      "coef": {"S1": number|null|"uncertain", "S2": number|null|"uncertain"},
      "moyenne": {
        "S1": number|null|"uncertain",
        "S1_80%": number|null|"uncertain",
        "S2": number|null|"uncertain",
        "S2_80%": number|null|"uncertain",
        "annuel": number|null|"uncertain",
        "annuel_80%": number|null|"uncertain"
      }
    }
  ],
  "moyennePrommo": {
    "S1": number|null|"uncertain",
    "S1_80%": number|null|"uncertain",
    "S2": number|null|"uncertain",
    "S2_80%": number|null|"uncertain",
    "annuel": number|null|"uncertain",
    "annuel_80%": number|null|"uncertain"
  },
  "error": string|null
}

Contraintes:
- Si valeur absente: null.
- Si valeur illisible: "uncertain".
- Ne pas inventer.
- Suivre TOUTES les lignes matières du tableau, sans exception et sans omission.
- Ne jamais arrêter au milieu du tableau: inclure aussi les dernières lignes.
- Retourne UNIQUEMENT l'objet JSON.
"""

    def module_score(raw_payload):
        normalized_payload = normalize_module_table_payload(raw_payload)
        return count_extracted_modules(normalized_payload)

    print(f"[modules] extracting table from {modules_page_path.name}")
    t0 = time.time()
    raw = extract_best_raw_from_variants(
        client,
        modules_page_path,
        prompt,
        module_score,
        stop_score=MODULE_STOP_SCORE,
    )
    normalized = normalize_module_table_payload(raw)
    print(f"[modules] first pass: {count_extracted_modules(normalized)} modules in {time.time() - t0:.1f}s")

    if count_extracted_modules(normalized) > 0:
        return normalized

    if not ENABLE_MODULE_RETRY:
        return normalized

    retry_prompt = prompt + """

IMPORTANT RETRY INSTRUCTIONS:
- Cette page EST censée être le tableau des matières/coefs.
- Relis toute la largeur du tableau et retourne une liste `matieres` NON vide si des matières existent.
- `abrev` doit suivre les en-têtes colonnes des matières.
- Retourne uniquement JSON.
"""
    t1 = time.time()
    raw_retry = extract_best_raw_from_variants(
        client,
        modules_page_path,
        retry_prompt,
        module_score,
        stop_score=MODULE_STOP_SCORE,
    )
    retry_normalized = normalize_module_table_payload(raw_retry)
    print(f"[modules] retry pass: {count_extracted_modules(retry_normalized)} modules in {time.time() - t1:.1f}s")
    if count_extracted_modules(retry_normalized) > count_extracted_modules(normalized):
        return retry_normalized
    return normalized


def extract_best_modules_from_document(client, pages):
    if not pages:
        raise ValueError("Aucune page disponible pour extraire le tableau des matières.")

    preferred_index = 1 if len(pages) > 1 else 0
    visit_order = [preferred_index] + [i for i in range(len(pages)) if i != preferred_index]

    best_payload = None
    best_count = -1
    best_index = preferred_index

    for idx in visit_order:
        candidate = extract_modules_page(client, pages[idx])
        current_count = count_extracted_modules(candidate)
        if current_count > best_count:
            best_payload = candidate
            best_count = current_count
            best_index = idx
        if current_count >= MODULE_MIN_ACCEPTABLE_COUNT:
            break

    if best_count <= 0:
        raise ValueError(
            "Modules table not extracted (matieres is empty). Extraction stopped to avoid shifted grades."
        )

    return best_payload, best_index


def extract_1978_1979(pdf_path: str):
    started = time.time()
    client = require_client()
    pages = pdf_to_images(pdf_path, dpi=PDF_DPI, max_pages=MAX_DOCUMENT_PAGES)
    print(f"[init] converted PDF to {len(pages)} images at dpi={PDF_DPI}")
    if len(pages) < 2:
        raise ValueError("Le PDF doit contenir au moins 2 pages (page 1 et tableau matières page 2).")

    modules_json, modules_page_index = extract_best_modules_from_document(client, pages)
    student_pages = pages
    students_json = extract_students_pages(client, student_pages, modules_json)
    students_json = enforce_module_note_rules(students_json, modules_json)
    students_json = enforce_student_summary_rules(students_json)

    print(f"[done] full extraction completed in {time.time() - started:.1f}s")

    return students_json, modules_json


def main():
    pdf_path = TEST_PDF_PATH
    output_file = TEST_OUTPUT_FILE

    if not Path(pdf_path).exists():
        print(f"PDF not found: {pdf_path}")
        print("Edit TEST_PDF_PATH at the top of this file.")
        return

    students_json, modules_json = extract_1978_1979(pdf_path)

    combined_output = {
        "annee": TARGET_YEAR,
        "studentsData": students_json,
        "modulesTable": modules_json,
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(combined_output, f, indent=2, ensure_ascii=False)

    print(f"Combined JSON saved to {output_file}")


if __name__ == "__main__":
    main()
