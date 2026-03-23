from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import re
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from dotenv import load_dotenv
from google import genai
from google.genai import types
from pdf2image import convert_from_path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = PROJECT_ROOT / "env.env"
load_dotenv(ENV_FILE)


DEFAULT_MODEL = "models/gemini-2.5-flash"
DEFAULT_DPI = 200
DEFAULT_MAX_RETRIES_PER_PAGE = 4
DEFAULT_KEY_COOLDOWN_SECONDS = 20

logger = logging.getLogger(__name__)

PROMPT = """
You are a text extractor of old scanned documents containing student academic records.
Some documents are not clear and some fields can be empty. Extract data as accurately as possible.
Return null for empty or unreadable fields. Do not infer or replace missing values.

Return ONLY valid JSON. No explanation, no markdown, no text outside the JSON.

---

## IMPORTANT: COLUMN DISAMBIGUATION RULES

Some grade tables contain NON-MODULE columns mixed among module columns.
You MUST identify and exclude these from the modules list and place them in a dedicated field instead.

Known non-module columns by year/period:

### 1977-1978 tables (RELEVE ANNUEL FINAL, CYCLE LONG):
The table contains these columns in order:
 NOM et PRENOM N° matricule  | [SEMESTER] | [S/G] | MAT | FOR | PLI | GES | ANG | STR | ...moyennes...

- [SEMESTER] = "Semestre d'inscription" or semester indicator → NOT a module grade
  Values are typically: "1" or "2" (which semester the student attended)
- [S/G] = "Effectif / Unité" or sous-groupe indicator → NOT a module grade  
  Values are typically small integers like "1", "2", "3"

These two columns appear BEFORE the actual module grades.
Extract them separately into the student's `metadata` field, NOT into `modules`.

If you encounter columns with values that are always small integers (1-3) and do not 
correspond to any known module code, treat them as metadata columns, not module grades.

-N° matricule : Can be found as a number next to nom et prenom , or null if not found

### General rule for ALL years:
If a column header does not match a known subject abbreviation (MAT, FOR, FBR, PLI, 
GES, ANG, STR, DEC, STH, IST, STA, CBB, ASS, STK, FIP, ANA, FIC, etc.), 
do NOT include it as a module. Place it in `metadata` instead.

---

## STRUCTURE 1 — Cover page:
Used when the page is a cover/title page with a section code and no student grade data.
{
    "type": "cover",
    "sectionCode": "...",
    "annee": "...",
    "anneeEtude": "...",
    "section": "...",
    "option": "...",
    "institution": "...",
    "error": string|null
}

---

## STRUCTURE 2 — Results announcement page (admis / éliminé / non admis lists):
Used when the page contains named lists of admitted or eliminated students (not a grade table).
{
    "type": "resultats_annonce",
    "annee": "...",
    "anneeEtude": "...",
    "sectionCode": string|null,
    "students": [
        {
            "nom": "...",
            "prenom": "...",
            "decision": "admis" | "elimine" | "non_admis" | "provisoirement_elimine"
        }
    ],
    "error": string|null
}

---

## STRUCTURE 3 — Single student bulletin (1974-1975 era):
{
    "type": "single_student",
    "sectionCode": string|null,
    "student": {
        "name": "...",
        "group": "...",
        "section": "...",
        "year": "...",
        "matricule": string|null,
        "moyenneAnterieur": number|null
    },
    "modules": [
        {
            "name": "...",
            "coef_s1": number|null,
            "note_s1": number|null,
            "coef_s2": number|null,
            "note_s2": number|null
        }
    ],
    "notesConcours": {
        "mathematique": number|null,
        "cultureGenerale": number|null,
        "testPsychologique": number|null
    },
    "summary": {
        "semestre1_moyenne": number|null,
        "semestre1_rang": number|null,
        "semestre2_moyenne": number|null,
        "semestre2_rang": number|null,
        "general_moyenne": number|null,
        "general_rang": number|null,
        "observation": string|null
    },
    "error": string|null
}

---

## STRUCTURE 4 — Multiple students grade table (1977-1984 era):
{
    "type": "multiple_students",
    "sectionCode": string|null,
    "annee": "...",
    "anneeEtude": "...",
    "section": "...",
    "option": "...",
    "students": [
        {
            "nom": "...",
            "prenom": "...",
            "matricule": string|null,
            "metadata": {
                "semestre": number|null,
                "sousGroupe": number|null,
                "autresChamps": {}
            },
            "modules": [
                {
                    "code": "...",
                    "noteS1": number|null,
                    "noteS2": number|null
                }
            ],
            "moyenne": {
                "S1": number|null,
                "S2": number|null,
                "annuel": number|null
            },
            "rang": {
                "S1": number|null,
                "S2": number|null,
                "annuel": number|null
            },
            "decisionDeJuin": string|null,
            "nbrAbs": number|null,
            "noteDeStage": number|null,
            "decisionFinaleDuConseil": string|null
        }
    ],
    "error": string|null
}

---

## STRUCTURE 5 — Table de matières (subject averages summary):
{
    "type": "table_de_matieres",
    "sectionCode": string|null,
    "annee": string|null,
    "anneeEtude": string|null,
    "matieres": [
        {
            "abrev": "...",
            "libelle": "...",
            "coef": {
                "S1": number|null,
                "S2": number|null
            },
            "moyenne": {
                "S1": number|null,
                "S1_80pct": number|null,
                "S2": number|null,
                "S2_80pct": number|null,
                "annuel": number|null,
                "annuel_80pct": number|null
            }
        }
    ],
    "moyennePromotion": {
        "S1": number|null,
        "S1_80pct": number|null,
        "S2": number|null,
        "S2_80pct": number|null,
        "annuel": number|null,
        "annuel_80pct": number|null
    },
    "error": string|null
}

---

## FALLBACK — Unrecognized or irrelevant page:
{
    "type": "unknown",
    "error": "unwanted page"
}

---

## DECISION VALUE NORMALIZATION:
Always normalize these French terms to standard values:
- "Admis" → "admis"
- "Eliminé" / "Elimine" / "Eliminé(e)" → "elimine"
- "Non admis" → "non_admis"
- "Provisoirement éliminé" → "provisoirement_elimine"
- "Passage conditionnel" → "passage_conditionnel"
- "Ajourné" → "ajourne"
- Unreadable → null

---

## SECTION CODE EXTRACTION RULES:
- Look for patterns like "2-I-TRC", "1-I-TRC", "77-1I-TRC" in headers, covers, or corners
- Normalize variants like "2_I. TRC" or "2 I TRC" → "2-I-TRC"
- If not clearly visible on this page, return null
- Do not infer sectionCode from context or other pages

---

## KNOWN MODULE CODES (for reference):
MAT, FOR, FBR, FGR, PL1, PLI, GES, ANG, STR, DEC, STH, IST,
STA, CBB, ASS, STK, FIP, ANA, FIC, MEC, ELE, PHY, CHI, DES

Any column header NOT in this list and NOT a known administrative field 
should be flagged in `metadata.autresChamps` with its raw value.

## CRITICAL LAYOUT RULE — MULTI-STUDENT GRADE TABLES :

In multi-student grade tables, EACH STUDENT OCCUPIES TWO CONSECUTIVE ROWS:
  - ROW 1 (top row):    contains the SEMESTRE 1 (S1) grade for each module
  - ROW 2 (bottom row): contains the SEMESTRE 2 (S2) grade for each module



Example visual layout:
1st case
┌──────────────┬──────┬──────┬──────┬──────┬──────┐
│              │ MAT  │ FOR  │ PLI  │ GES  │ ANG  │
│ Drid         │12.25 │ 1.75 │      │ 9.00 │11.00 │  ← S1 grades (top row)
│ Khaled       │15.05 │13.79 │ 8.53 │10.00 │      │  ← S2 grades (bottom row)
└──────────────┴──────┴──────┴──────┴──────┴──────┘
2nd case
┌──────────────┬──────┬──────┬──────┬──────┬──────┐
│              │ MAT  │ FOR  │ PLI  │ GES  │ ANG  │
│ Drid  Khaled │12.25 │ 1.75 │      │ 9.00 │11.00 │  ← S1 grades (top row)
│              │15.05 │13.79 │ 8.53 │10.00 │      │  ← S2 grades (bottom row)
└──────────────┴──────┴──────┴──────┴──────┴──────┘

for each case the matricule can be next to nom et prenom or between them even under them, but in the same column as them

RULES FOR READING MODULE GRADES:
- If BOTH rows have a value for a module → noteS1 = top value, noteS2 = bottom value
- If ONLY the TOP row has a value (bottom is blank) → noteS1 = value, noteS2 = null
  (module taught in S1 only)
- If ONLY the BOTTOM row has a value (top is blank) → noteS1 = null, noteS2 = value
  (module taught in S2 only)
- NEVER assign a bottom-row value to noteS1, or a top-row value to noteS2
- NEVER shift grades horizontally — each grade belongs strictly to its column

This two-row-per-student layout is the source of most extraction errors.
Read each student's two rows completely and independently before moving to the next student.
Do NOT confuse the bottom row of one student with the top row of the next student.
""".strip()


@dataclass(slots=True)
class _ApiKeyState:
    key: str
    client: genai.Client
    cooldown_until: float = 0.0
    failures: int = 0


class ApiKeyPool:
    def __init__(self, api_keys: list[str], cooldown_seconds: int = DEFAULT_KEY_COOLDOWN_SECONDS):
        cleaned = [k.strip() for k in api_keys if k and k.strip()]
        if not cleaned:
            raise ValueError("No API keys provided. Set GEMINI_API_KEY or GEMINI_API_KEYS")
        self._states = [_ApiKeyState(key=k, client=genai.Client(api_key=k)) for k in cleaned]
        self._cooldown_seconds = cooldown_seconds
        self._cursor = 0

    @classmethod
    def from_environment(cls, cooldown_seconds: int = DEFAULT_KEY_COOLDOWN_SECONDS) -> "ApiKeyPool":
        many_keys = os.getenv("GEMINI_API_KEYS", "").strip()
        if many_keys:
            return cls(many_keys.split(","), cooldown_seconds=cooldown_seconds)
        one_key = os.getenv("GEMINI_API_KEY", "").strip()
        return cls([one_key], cooldown_seconds=cooldown_seconds)

    def acquire(self) -> _ApiKeyState:
        now = time.time()
        size = len(self._states)

        for _ in range(size):
            state = self._states[self._cursor]
            self._cursor = (self._cursor + 1) % size
            if state.cooldown_until <= now:
                return state

        soonest = min(self._states, key=lambda s: s.cooldown_until)
        sleep_seconds = max(0.0, soonest.cooldown_until - now)
        if sleep_seconds > 0:
            time.sleep(min(sleep_seconds, self._cooldown_seconds))
        return soonest

    def mark_success(self, state: _ApiKeyState) -> None:
        state.failures = 0
        state.cooldown_until = 0.0

    def mark_transient_failure(self, state: _ApiKeyState) -> None:
        state.failures += 1
        backoff = self._cooldown_seconds * (2 ** min(state.failures - 1, 3))
        jitter = random.uniform(0.0, 1.5)
        state.cooldown_until = time.time() + backoff + jitter


def _clean_json(text: str) -> dict[str, Any] | None:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group())
    except json.JSONDecodeError:
        return None


def _coerce_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    content = str(value).strip()
    if not content:
        return None
    content = content.replace(",", ".")
    match = re.match(r"^[-+]?[0-9]*\.?[0-9]+", content)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def _postprocess(data: dict[str, Any] | None) -> dict[str, Any] | None:
    if not data:
        return data

    for module in data.get("modules", []):
        for field in ["coef_s1", "coef_s2", "note_s1", "note_s2"]:
            module[field] = _coerce_number(module.get(field))

    summary = data.get("summary") or {}
    for field in ["semestre1_moyenne", "semestre2_moyenne", "general_moyenne"]:
        summary[field] = _coerce_number(summary.get(field))

    for field in ["semestre1_rang", "semestre2_rang", "general_rang"]:
        value = summary.get(field)
        if value is None:
            summary[field] = None
            continue
        try:
            summary[field] = int(float(str(value).replace(",", ".")))
        except ValueError:
            summary[field] = None

    data["summary"] = summary
    return data


def _validate(data: dict[str, Any] | None) -> bool:
    if not data:
        return False
    for module in data.get("modules", []):
        for field in ["note_s1", "note_s2"]:
            value = module.get(field)
            if value is not None and not (0 <= value <= 20):
                return False
    return True


def _is_transient_error(exc: Exception) -> bool:
    text = str(exc).lower()
    transient_markers = [
        "429",
        "503",
        "busy",
        "resource exhausted",
        "rate",
        "quota",
        "timeout",
        "temporarily unavailable",
        "try again",
    ]
    return any(marker in text for marker in transient_markers)


def _render_pdf_pages(pdf_path: Path, output_dir: Path, dpi: int = DEFAULT_DPI) -> list[Path]:
    logger.info("Rendering PDF pages for %s at %s DPI", pdf_path, dpi)
    images = convert_from_path(str(pdf_path), dpi=dpi)
    output_dir.mkdir(parents=True, exist_ok=True)

    page_paths: list[Path] = []
    for idx, image in enumerate(images, start=1):
        page_path = output_dir / f"page_{idx:04d}.png"
        image.save(page_path, "PNG")
        page_paths.append(page_path)
    logger.info("Rendered %s pages for %s", len(page_paths), pdf_path)
    return page_paths


def _extract_one_page(
    image_path: Path,
    key_pool: ApiKeyPool,
    model: str = DEFAULT_MODEL,
    max_retries: int = DEFAULT_MAX_RETRIES_PER_PAGE,
) -> dict[str, Any]:
    last_error = "unknown error"

    for attempt in range(1, max_retries + 1):
        state = key_pool.acquire()

        try:
            image_bytes = image_path.read_bytes()
            response = state.client.models.generate_content(
                model=model,
                contents=[
                    PROMPT,
                    types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
                ],
            )

            parsed = _postprocess(_clean_json(response.text))
            if _validate(parsed):
                key_pool.mark_success(state)
                return {
                    "status": "ok",
                    "attempt": attempt,
                    "api_key_suffix": state.key[-4:] if len(state.key) >= 4 else "***",
                    "result": parsed,
                    "error": None,
                }

            last_error = "model output was invalid JSON or failed validation"
            key_pool.mark_transient_failure(state)

        except Exception as exc:
            last_error = str(exc)
            if _is_transient_error(exc):
                key_pool.mark_transient_failure(state)
                time.sleep(min(2 ** (attempt - 1), 8))
                continue
            return {
                "status": "failed",
                "attempt": attempt,
                "api_key_suffix": state.key[-4:] if len(state.key) >= 4 else "***",
                "result": None,
                "error": last_error,
            }

    return {
        "status": "failed",
        "attempt": max_retries,
        "api_key_suffix": None,
        "result": None,
        "error": last_error,
    }


def extract_pdf_with_page_mapping(
    file_path: str | Path,
    *,
    output_root: str | Path = "tmp/extractions",
    model: str = DEFAULT_MODEL,
    dpi: int = DEFAULT_DPI,
    max_retries_per_page: int = DEFAULT_MAX_RETRIES_PER_PAGE,
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    pdf_path = Path(file_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")

    logger.info("Extraction pipeline started for %s", pdf_path)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = Path(output_root) / f"{pdf_path.stem}_{timestamp}"
    pages_dir = run_dir / "pages"
    run_dir.mkdir(parents=True, exist_ok=True)

    try:
        page_images = _render_pdf_pages(pdf_path, pages_dir, dpi=dpi)
        key_pool = ApiKeyPool.from_environment()

        if progress_callback is not None:
            progress_callback(
                {
                    "status": "processing",
                    "stage": "rendered",
                    "total_pages": len(page_images),
                    "processed_pages": 0,
                    "failed_pages": 0,
                    "current_page": 0,
                }
            )

        page_results: list[dict[str, Any]] = []
        processed_pages = 0
        failed_pages = 0
        for page_number, image_path in enumerate(page_images, start=1):
            logger.info("Processing page %s/%s for %s", page_number, len(page_images), pdf_path.name)
            extraction = _extract_one_page(
                image_path=image_path,
                key_pool=key_pool,
                model=model,
                max_retries=max_retries_per_page,
            )
            logger.info(
                "Page %s/%s status=%s attempts=%s",
                page_number,
                len(page_images),
                extraction.get("status"),
                extraction.get("attempt"),
            )

            if extraction.get("status") == "ok":
                processed_pages += 1
            else:
                failed_pages += 1

            if progress_callback is not None:
                progress_callback(
                    {
                        "status": "processing",
                        "stage": "extracting",
                        "total_pages": len(page_images),
                        "processed_pages": processed_pages,
                        "failed_pages": failed_pages,
                        "current_page": page_number,
                    }
                )

            page_results.append(
                {
                    "page_number": page_number,
                    "image_path": str(image_path),
                    "status": extraction["status"],
                    "attempt": extraction["attempt"],
                    "api_key_suffix": extraction["api_key_suffix"],
                    "result": extraction["result"],
                    "error": extraction["error"],
                }
            )

        ok_count = sum(1 for item in page_results if item["status"] == "ok")
        failed_count = len(page_results) - ok_count

        payload = {
            "file_path": str(pdf_path),
            "run_dir": str(run_dir),
            "pages_dir": str(pages_dir),
            "total_pages": len(page_results),
            "ok_pages": ok_count,
            "failed_pages": failed_count,
            "pages": page_results,
        }

        (run_dir / "extraction_result.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        logger.info(
            "Extraction pipeline finished for %s: total=%s ok=%s failed=%s",
            pdf_path,
            len(page_results),
            ok_count,
            failed_count,
        )

        if progress_callback is not None:
            progress_callback(
                {
                    "status": "completed",
                    "stage": "completed",
                    "total_pages": len(page_results),
                    "processed_pages": ok_count,
                    "failed_pages": failed_count,
                    "current_page": len(page_results),
                }
            )

        return payload
    except Exception as exc:
        error_payload = {
            "file_path": str(pdf_path),
            "run_dir": str(run_dir),
            "pages_dir": str(pages_dir),
            "error": str(exc),
        }
        (run_dir / "extraction_error.json").write_text(
            json.dumps(error_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        if progress_callback is not None:
            progress_callback(
                {
                    "status": "failed",
                    "stage": "failed",
                    "error": str(exc),
                }
            )
        logger.exception("Extraction pipeline crashed for %s: %s", pdf_path, exc)
        raise


async def extract_pdf_with_page_mapping_async(
    file_path: str | Path,
    *,
    output_root: str | Path = "tmp/extractions",
    model: str = DEFAULT_MODEL,
    dpi: int = DEFAULT_DPI,
    max_retries_per_page: int = DEFAULT_MAX_RETRIES_PER_PAGE,
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    return await asyncio.to_thread(
        extract_pdf_with_page_mapping,
        file_path,
        output_root=output_root,
        model=model,
        dpi=dpi,
        max_retries_per_page=max_retries_per_page,
        progress_callback=progress_callback,
    )
