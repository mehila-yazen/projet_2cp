from __future__ import annotations

import asyncio
import json
import os
import random
import re
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from google import genai
from google.genai import types
from pdf2image import convert_from_path


DEFAULT_MODEL = "models/gemini-2.5-flash"
DEFAULT_DPI = 200
DEFAULT_MAX_RETRIES_PER_PAGE = 4
DEFAULT_KEY_COOLDOWN_SECONDS = 20

PROMPT = """
you are a text extractor of old scanned documents  that contains student informations
some documents are not clear and some fields can be empty, you have to extract the data as accurate as possible and return null for empty fields, do not replace empty fields with other values
a document page either has informtions about only one student or a big table that handle more than one student
Extract this French academic bulletin into STRICT JSON.
notes: -moyenneAnterieur is the grade of previous year
-matricule can be empty for some students, in this case return null
-notesConcours fields can be empty, return null for empty fields
-error field can be used to indicate any issues during extraction
-observation field in summary can be used to indicate any special notes or observations about the student's performance or the extraction process, it can be null if there are no observations

Return ONLY valid JSON.

Structure for one student for 1974-1975:
{
    "type":"single student",
    "student": {
        "name": "",
        "group": "",
        "section": "",
        "year": "",
        "matricule": "",
        "moyenneAnterieur": number|null
    },
    "modules": [
        {
            "name": "",
            "coef_s1": number|null,
            "note_s1": number|null,
            "coef_s2": number|null,
            "note_s2": number|null
        }
    ],
    "notesConcours": {
            "mathematique":number|null,
            "cultureGenerale":number|null,
            "testPsychologique":number|null
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

structure for multiple students for 1977-1984:
{
    "type":"multiple students",
    "annee": "...",
    "anneeEtude": "...",
    "section": "...",
    "option":"...",
    "students": [
        {
            "nom": "...",
            "prenom": "...",
            "matricule": "...",
            "module": [
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
            "decisionDeJuin": "...",
            "nbrAbs": number|null,
            "noteDeStage": number|null,
            "decisionFinaleDuConseil": "..."
        }
    ],
    "error": string|null
}

structure for tableau de matiere:
{
    "type":"table de matieres",
    "matieres":[
        {
            "abrev" : "",
            "libelle": "",
            "coef":{
                    "S1":number|null,
                    "S2":number|null
                },
            "moyenne":{
                    "S1":number|null,
                    "S1_80%":number|null,
                    "S2":number|null,
                    "S2_80%":number|null,
                    "annuel":number|null,
                    "annuel_80%":number|null
                }
        }
    ],
    "moyennePrommo":{
            "S1":number|null,
            "S1_80%":number|null,
            "S2":number|null,
            "S2_80":number|null,
            "annuel":number|null,
            "annuel_80%":number|null
        }
}

note : if you don't encounter any of these structures in the image, for example just a list of names or a cover return:
{
    "error": "unwanted page"
}
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
    images = convert_from_path(str(pdf_path), dpi=dpi)
    output_dir.mkdir(parents=True, exist_ok=True)

    page_paths: list[Path] = []
    for idx, image in enumerate(images, start=1):
        page_path = output_dir / f"page_{idx:04d}.png"
        image.save(page_path, "PNG")
        page_paths.append(page_path)
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
) -> dict[str, Any]:
    pdf_path = Path(file_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = Path(output_root) / f"{pdf_path.stem}_{timestamp}"
    pages_dir = run_dir / "pages"

    page_images = _render_pdf_pages(pdf_path, pages_dir, dpi=dpi)
    key_pool = ApiKeyPool.from_environment()

    page_results: list[dict[str, Any]] = []
    for page_number, image_path in enumerate(page_images, start=1):
        extraction = _extract_one_page(
            image_path=image_path,
            key_pool=key_pool,
            model=model,
            max_retries=max_retries_per_page,
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

    return {
        "file_path": str(pdf_path),
        "run_dir": str(run_dir),
        "pages_dir": str(pages_dir),
        "total_pages": len(page_results),
        "ok_pages": ok_count,
        "failed_pages": failed_count,
        "pages": page_results,
    }


async def extract_pdf_with_page_mapping_async(
    file_path: str | Path,
    *,
    output_root: str | Path = "tmp/extractions",
    model: str = DEFAULT_MODEL,
    dpi: int = DEFAULT_DPI,
    max_retries_per_page: int = DEFAULT_MAX_RETRIES_PER_PAGE,
) -> dict[str, Any]:
    return await asyncio.to_thread(
        extract_pdf_with_page_mapping,
        file_path,
        output_root=output_root,
        model=model,
        dpi=dpi,
        max_retries_per_page=max_retries_per_page,
    )
