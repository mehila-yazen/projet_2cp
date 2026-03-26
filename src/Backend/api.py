from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime
from datetime import date
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import Body, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from src.Backend.extraction_service import extract_pdf_with_page_mapping_async
from src.Database.models import Etudiant
from src.services.database import get_session
from src.services.fuzzy_name_service import (
    apply_student_search_keys,
    rebuild_student_search_keys,
    register_selected_suggestion,
    suggest_student_candidates,
)
from src.services.matricule_service import (
    apply_pending_matricule_reconciliation,
    check_pending_cases_against_database,
    resolve_student_matricule,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_ROOT = PROJECT_ROOT / "tmp" / "uploads"
EXTRACTION_ROOT = PROJECT_ROOT / "tmp" / "extractions"
COMPLETED_EXTRACTIONS_ROOT = PROJECT_ROOT / "tmp" / "completed_extractions"


def _resolve_frontend_root() -> Path | None:
    candidates = [
        PROJECT_ROOT / "Front",
        PROJECT_ROOT / "Frontend",
    ]
    for candidate in candidates:
        if candidate.exists() and candidate.is_dir():
            return candidate
    return None


FRONTEND_ROOT = _resolve_frontend_root()
EXTRACTION_REQUEST_TIMEOUT_SECONDS = int(os.getenv("EXTRACTION_REQUEST_TIMEOUT_SECONDS", "420"))

logger = logging.getLogger(__name__)

EXTRACTION_PROGRESS_STATE: dict[str, dict[str, Any]] = {}


app = FastAPI(title="Archive Digitization API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
async def root_redirect() -> RedirectResponse:
    return RedirectResponse(url="/Html/Dashboard.html")


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return datetime.strptime(value, "%Y-%m-%d").date()


def _db_writes_enabled() -> bool:
    raw = os.getenv("ALLOW_DB_WRITES", "false").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _build_processing_progress(extraction: dict | None) -> dict:
    if not extraction:
        return {
            "processed_pages": 0,
            "failed_pages": 0,
            "total_pages": 0,
            "processed_percentage": 0.0,
            "message": "0% pages processed (0/0)",
        }

    total_pages = int(extraction.get("total_pages", 0) or 0)
    processed_pages = int(extraction.get("ok_pages", 0) or 0)
    failed_pages = int(extraction.get("failed_pages", 0) or 0)
    completed_pages = processed_pages + failed_pages

    percentage = 0.0 if total_pages == 0 else round((completed_pages / total_pages) * 100, 2)
    display_percent = int(round(percentage))

    return {
        "processed_pages": processed_pages,
        "failed_pages": failed_pages,
        "total_pages": total_pages,
        "processed_percentage": percentage,
        "message": f"{display_percent}% pages processed ({processed_pages}/{total_pages})",
    }


def _build_batch_processing_progress(results: list[dict]) -> dict:
    total_pages = 0
    processed_pages = 0
    failed_pages = 0

    for item in results:
        progress = item.get("processing_progress") or {}
        total_pages += int(progress.get("total_pages", 0) or 0)
        processed_pages += int(progress.get("processed_pages", 0) or 0)
        failed_pages += int(progress.get("failed_pages", 0) or 0)

    completed_pages = processed_pages + failed_pages
    percentage = 0.0 if total_pages == 0 else round((completed_pages / total_pages) * 100, 2)
    display_percent = int(round(percentage))

    return {
        "processed_pages": processed_pages,
        "failed_pages": failed_pages,
        "total_pages": total_pages,
        "processed_percentage": percentage,
        "message": f"{display_percent}% pages processed ({processed_pages}/{total_pages})",
    }


def _upsert_operation_progress(operation_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    existing = EXTRACTION_PROGRESS_STATE.get(operation_id, {"operation_id": operation_id})
    existing.update(patch)

    total_pages = int(existing.get("total_pages", 0) or 0)
    processed_pages = int(existing.get("processed_pages", 0) or 0)
    failed_pages = int(existing.get("failed_pages", 0) or 0)
    completed_pages = processed_pages + failed_pages
    percentage = 0.0 if total_pages == 0 else round((completed_pages / total_pages) * 100, 2)

    existing["processed_percentage"] = percentage
    existing["message"] = f"{int(round(percentage))}% pages processed ({processed_pages}/{total_pages})"
    existing["updated_at"] = datetime.now().isoformat(timespec="seconds")

    EXTRACTION_PROGRESS_STATE[operation_id] = existing
    return existing


def _make_progress_callback(operation_id: str):
    def _callback(progress: dict[str, Any]) -> None:
        _upsert_operation_progress(operation_id, progress)

    return _callback


def _is_terminal_status(status: str | None) -> bool:
    return status in {"ok", "failed"}


def _find_extraction_payload_for_saved_pdf(saved_pdf: Path) -> dict | None:
    stem = saved_pdf.stem
    candidates = sorted(
        EXTRACTION_ROOT.glob(f"{stem}_*/extraction_result.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    for path in candidates[:20]:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if Path(payload.get("file_path", "")).resolve() == saved_pdf.resolve():
                return payload
        except Exception:
            continue

    return None


def _build_result_from_extraction_payload(saved_pdf: Path, extraction: dict) -> dict:
    progress = _build_processing_progress(extraction)
    return {
        "upload": {
            "original_filename": saved_pdf.name,
            "saved_path": str(saved_pdf),
            "bytes": int(saved_pdf.stat().st_size if saved_pdf.exists() else 0),
        },
        "status": "ok",
        "extraction": extraction,
        "processing_progress": progress,
        "error": None,
    }


def _build_result_from_completed_record(saved_pdf: Path, record: dict) -> dict:
    extraction = {
        "file_path": str(saved_pdf),
        "total_pages": int(record.get("total_pages", 0) or 0),
        "ok_pages": int(record.get("ok_pages", 0) or 0),
        "failed_pages": int(record.get("failed_pages", 0) or 0),
        "pages": record.get("pages") or [],
    }
    progress = _build_processing_progress(extraction)

    return {
        "upload": {
            "original_filename": saved_pdf.name,
            "saved_path": str(saved_pdf),
            "bytes": int(saved_pdf.stat().st_size if saved_pdf.exists() else 0),
        },
        "status": "ok",
        "extraction": extraction,
        "processing_progress": progress,
        "error": None,
    }


def _find_completed_record(state: dict[str, Any]) -> dict | None:
    batch_id = state.get("batch_id")
    file_name = Path(state.get("saved_path") or "").name
    if not file_name:
        return None

    if batch_id:
        path = COMPLETED_EXTRACTIONS_ROOT / f"{batch_id}.json"
        if path.exists():
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                for record in payload.get("records") or []:
                    if str(record.get("file_name") or "").strip().lower() == file_name.lower():
                        return record
            except Exception:
                return None

    for record in _load_completed_records(limit=200):
        if str(record.get("file_name") or "").strip().lower() == file_name.lower():
            return record

    return None


def _persist_operation_completion_if_needed(operation_id: str, extraction: dict) -> None:
    state = EXTRACTION_PROGRESS_STATE.get(operation_id)
    if not state:
        return
    if state.get("completed_persisted"):
        return

    saved_path = state.get("saved_path")
    batch_id = state.get("batch_id")
    if not saved_path or not batch_id:
        return

    saved_pdf = Path(saved_path)
    result = _build_result_from_extraction_payload(saved_pdf, extraction)
    _persist_completed_batch(batch_id, [result])

    _upsert_operation_progress(
        operation_id,
        {
            "completed_persisted": True,
        },
    )


def _refresh_operation_state_from_artifacts(operation_id: str) -> dict | None:
    state = EXTRACTION_PROGRESS_STATE.get(operation_id)
    if not state:
        return None

    if state.get("status") == "completed" and state.get("completed_persisted"):
        return state

    saved_path = state.get("saved_path")
    if not saved_path:
        return state

    saved_pdf = Path(saved_path)
    extraction = _find_extraction_payload_for_saved_pdf(saved_pdf)
    if extraction:
        progress = _build_processing_progress(extraction)
        refreshed = _upsert_operation_progress(
            operation_id,
            {
                "status": "completed",
                "stage": "completed",
                "total_pages": progress.get("total_pages", 0),
                "processed_pages": progress.get("processed_pages", 0),
                "failed_pages": progress.get("failed_pages", 0),
                "error": None,
            },
        )

        _persist_operation_completion_if_needed(operation_id, extraction)
        return refreshed

    record = _find_completed_record(state)
    if not record:
        return state

    total_pages = int(record.get("total_pages", 0) or 0)
    ok_pages = int(record.get("ok_pages", 0) or 0)
    failed_pages = int(record.get("failed_pages", 0) or 0)

    refreshed = _upsert_operation_progress(
        operation_id,
        {
            "status": "completed",
            "stage": "completed",
            "total_pages": total_pages,
            "processed_pages": ok_pages,
            "failed_pages": failed_pages,
            "error": None,
            "completed_persisted": True,
        },
    )

    # Ensure legacy operations still get a completed artifact if one was not persisted yet.
    if not state.get("completed_persisted") and state.get("batch_id"):
        synthesized = _build_result_from_completed_record(saved_pdf, record)
        _persist_completed_batch(str(state.get("batch_id")), [synthesized])

    return refreshed


async def _process_uploaded_pdf(file: UploadFile, batch_dir: Path, operation_id: str | None = None) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    extension = Path(file.filename).suffix.lower()
    if extension != ".pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    file_token = uuid4().hex[:12]
    safe_name = Path(file.filename).name
    dest_dir = batch_dir / f"{file_token}"
    dest_dir.mkdir(parents=True, exist_ok=True)

    saved_pdf = dest_dir / safe_name
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    if operation_id:
        _upsert_operation_progress(
            operation_id,
            {
                "status": "processing",
                "stage": "upload_received",
                "file_name": file.filename,
                "batch_dir": str(batch_dir),
                "saved_path": str(saved_pdf),
                "total_pages": 0,
                "processed_pages": 0,
                "failed_pages": 0,
                "error": None,
            },
        )

    saved_pdf.write_bytes(file_bytes)
    logger.info("Starting extraction for file '%s' (%s bytes)", file.filename, len(file_bytes))

    try:
        extraction = await asyncio.wait_for(
            extract_pdf_with_page_mapping_async(
                saved_pdf,
                output_root=EXTRACTION_ROOT,
                progress_callback=_make_progress_callback(operation_id) if operation_id else None,
            ),
            timeout=EXTRACTION_REQUEST_TIMEOUT_SECONDS,
        )
        logger.info(
            "Extraction finished for '%s': total=%s ok=%s failed=%s",
            file.filename,
            extraction.get("total_pages", 0),
            extraction.get("ok_pages", 0),
            extraction.get("failed_pages", 0),
        )
    except TimeoutError:
        logger.error(
            "Extraction timeout for '%s' after %s seconds",
            file.filename,
            EXTRACTION_REQUEST_TIMEOUT_SECONDS,
        )
        if operation_id:
            _upsert_operation_progress(
                operation_id,
                {
                    "status": "processing",
                    "stage": "timeout_waiting",
                    "error": (
                        "Request timed out after "
                        f"{EXTRACTION_REQUEST_TIMEOUT_SECONDS} seconds, "
                        "but extraction is still running in background."
                    ),
                },
            )
        return {
            "upload": {
                "original_filename": file.filename,
                "saved_path": str(saved_pdf),
                "bytes": len(file_bytes),
            },
            "status": "processing",
            "extraction": None,
            "processing_progress": _build_processing_progress(None),
            "error": (
                "Request timed out, extraction continues in background. "
                "Keep polling operation progress."
            ),
        }
    except Exception as exc:
        logger.exception("Extraction failed for '%s': %s", file.filename, exc)
        if operation_id:
            _upsert_operation_progress(
                operation_id,
                {
                    "status": "failed",
                    "stage": "failed",
                    "error": str(exc),
                },
            )
        return {
            "upload": {
                "original_filename": file.filename,
                "saved_path": str(saved_pdf),
                "bytes": len(file_bytes),
            },
            "status": "failed",
            "extraction": None,
            "processing_progress": _build_processing_progress(None),
            "error": str(exc),
        }

    progress = _build_processing_progress(extraction)

    if operation_id:
        _upsert_operation_progress(
            operation_id,
            {
                "status": "completed",
                "stage": "completed",
                "file_name": file.filename,
                "total_pages": progress.get("total_pages", 0),
                "processed_pages": progress.get("processed_pages", 0),
                "failed_pages": progress.get("failed_pages", 0),
                "error": None,
            },
        )

    return {
        "upload": {
            "original_filename": file.filename,
            "saved_path": str(saved_pdf),
            "bytes": len(file_bytes),
        },
        "status": "ok",
        "extraction": extraction,
        "processing_progress": progress,
        "error": None,
    }


def _build_completed_record(batch_id: str, item: dict, *, processed_at: str) -> dict | None:
    extraction = item.get("extraction") or {}
    upload = item.get("upload") or {}
    file_name = upload.get("original_filename") or Path(extraction.get("file_path", "unknown.pdf")).name
    pages = extraction.get("pages") or []

    return {
        "id": f"{batch_id}::{file_name}",
        "batch_id": batch_id,
        "file_name": file_name,
        "processed_at": processed_at,
        "status": item.get("status"),
        "error": item.get("error"),
        "total_pages": int(extraction.get("total_pages", 0) or 0),
        "ok_pages": int(extraction.get("ok_pages", 0) or 0),
        "failed_pages": int(extraction.get("failed_pages", 0) or 0),
        "pages": [
            {
                "page_number": int(page.get("page_number", 0) or 0),
                "status": page.get("status"),
                "image_path": page.get("image_path"),
                "result": page.get("result"),
                "error": page.get("error"),
            }
            for page in pages
        ],
    }


def _persist_completed_batch(batch_id: str, results: list[dict]) -> None:
    COMPLETED_EXTRACTIONS_ROOT.mkdir(parents=True, exist_ok=True)
    processed_at = datetime.now().isoformat(timespec="seconds")

    records = [
        record
        for result in results
        if (record := _build_completed_record(batch_id, result, processed_at=processed_at)) is not None
    ]

    if not records:
        return

    payload = {
        "batch_id": batch_id,
        "processed_at": processed_at,
        "count": len(records),
        "records": records,
    }

    path = COMPLETED_EXTRACTIONS_ROOT / f"{batch_id}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_completed_records(limit: int = 50) -> list[dict]:
    if not COMPLETED_EXTRACTIONS_ROOT.exists():
        return []

    files = sorted(
        COMPLETED_EXTRACTIONS_ROOT.glob("*.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    records: list[dict] = []
    for file in files:
        try:
            payload = json.loads(file.read_text(encoding="utf-8"))
            batch_records = payload.get("records") or []
            for item in batch_records:
                records.append(item)
                if len(records) >= limit:
                    return records
        except Exception:
            continue

    return records


@app.post("/extract/pdf")
async def extract_pdf(file: UploadFile = File(...), operation_id: str | None = Form(default=None)) -> dict:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    batch_id = f"batch_{timestamp}_{uuid4().hex[:8]}"
    batch_dir = UPLOAD_ROOT / batch_id
    batch_dir.mkdir(parents=True, exist_ok=True)

    if operation_id:
        _upsert_operation_progress(operation_id, {"batch_id": batch_id})

    result = await _process_uploaded_pdf(file, batch_dir, operation_id=operation_id)
    if _is_terminal_status(result.get("status")):
        _persist_completed_batch(batch_id, [result])
    batch_progress = _build_batch_processing_progress([result])
    return {
        "batch_id": batch_id,
        "total_files": 1,
        "processed_files": 1 if result.get("status") == "ok" else 0,
        "failed_files": 0 if result.get("status") == "ok" else 1,
        "batch_processing_progress": batch_progress,
        "operation_id": operation_id,
        "results": [result],
    }


@app.post("/extract/pdfs")
async def extract_pdfs(files: list[UploadFile] = File(...), operation_id: str | None = Form(default=None)) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    batch_id = f"batch_{timestamp}_{uuid4().hex[:8]}"
    batch_dir = UPLOAD_ROOT / batch_id
    batch_dir.mkdir(parents=True, exist_ok=True)

    if operation_id:
        _upsert_operation_progress(operation_id, {"batch_id": batch_id})

    results: list[dict] = []
    for upload in files:
        item = await _process_uploaded_pdf(upload, batch_dir, operation_id=operation_id)
        results.append(item)

    processed = sum(1 for item in results if item.get("status") == "ok")
    failed = len(results) - processed
    terminal_results = [item for item in results if _is_terminal_status(item.get("status"))]
    if terminal_results:
        _persist_completed_batch(batch_id, terminal_results)
    batch_progress = _build_batch_processing_progress(results)

    return {
        "batch_id": batch_id,
        "total_files": len(results),
        "processed_files": processed,
        "failed_files": failed,
        "batch_processing_progress": batch_progress,
        "operation_id": operation_id,
        "results": results,
    }


@app.get("/extract/progress/{operation_id}")
async def get_extraction_progress(operation_id: str) -> dict:
    progress = _refresh_operation_state_from_artifacts(operation_id)
    if not progress:
        raise HTTPException(status_code=404, detail="Unknown operation_id")
    return progress


@app.get("/extract/completed")
async def get_completed_extractions(limit: int = Query(default=50, ge=1, le=500)) -> dict:
    records = _load_completed_records(limit=limit)
    return {
        "count": len(records),
        "records": records,
    }


@app.post("/verify/students/save")
async def save_verified_students(payload: dict = Body(...)) -> dict:
    if not _db_writes_enabled():
        raise HTTPException(
            status_code=403,
            detail="Database writes are disabled for testing. Set ALLOW_DB_WRITES=true to enable this endpoint.",
        )

    students = payload.get("students")
    annee_univ = payload.get("annee_univ")

    if not isinstance(students, list) or not students:
        raise HTTPException(status_code=400, detail="Payload must contain a non-empty students list")

    saved_items: list[dict] = []
    failed_items: list[dict] = []

    for index, item in enumerate(students):
        nom = (item.get("nom") or "").strip()
        prenom = (item.get("prenom") or "").strip()
        if not nom or not prenom:
            failed_items.append(
                {
                    "index": index,
                    "status": "failed",
                    "error": "nom and prenom are required",
                    "student": item,
                }
            )
            continue

        is_first_year = bool(item.get("is_first_year", False))

        try:
            with get_session() as db:
                matricule_info = resolve_student_matricule(
                    db,
                    nom=nom,
                    prenom=prenom,
                    annee_univ=annee_univ,
                    is_first_year=is_first_year,
                    provided_matricule=item.get("matricule"),
                    date_naissance=item.get("date_naissance"),
                    source={"payload": item, "annee_univ": annee_univ},
                )

                matricule = matricule_info["matricule"]
                existing = db.query(Etudiant).filter(Etudiant.matricule == matricule).first()

                if existing:
                    existing.nom = nom
                    existing.prenom = prenom
                    apply_student_search_keys(existing)
                    if item.get("sexe") is not None:
                        existing.sexe = item.get("sexe")
                    if item.get("lieu_naissance") is not None:
                        existing.lieu_naissance = item.get("lieu_naissance")
                    if item.get("date_naissance"):
                        existing.date_naissance = _parse_date(item.get("date_naissance"))
                    db.flush()
                    db.refresh(existing)
                    student_id = existing.id
                    action = "updated"
                else:
                    created = Etudiant(
                        nom=nom,
                        prenom=prenom,
                        matricule=matricule,
                        sexe=item.get("sexe"),
                        lieu_naissance=item.get("lieu_naissance"),
                        date_naissance=_parse_date(item.get("date_naissance")),
                    )
                    apply_student_search_keys(created)
                    db.add(created)
                    db.flush()
                    db.refresh(created)
                    student_id = created.id
                    action = "created"

            saved_items.append(
                {
                    "index": index,
                    "status": "ok",
                    "action": action,
                    "student_id": student_id,
                    "nom": nom,
                    "prenom": prenom,
                    "matricule": matricule,
                    "matricule_source": matricule_info.get("source"),
                    "needs_matricule_review": matricule_info.get("needs_review", False),
                    "pending_case": matricule_info.get("pending_case"),
                }
            )
        except Exception as exc:
            failed_items.append(
                {
                    "index": index,
                    "status": "failed",
                    "error": str(exc),
                    "student": item,
                }
            )

    return {
        "annee_univ": annee_univ,
        "total_students": len(students),
        "saved_count": len(saved_items),
        "failed_count": len(failed_items),
        "saved": saved_items,
        "failed": failed_items,
    }


@app.get("/matricules/pending/check")
async def check_pending_matricules() -> dict:
    with get_session() as db:
        report = check_pending_cases_against_database(db)
    return report


@app.post("/matricules/pending/apply")
async def apply_pending_matricules(preview: bool = Query(True)) -> dict:
    if not preview and not _db_writes_enabled():
        raise HTTPException(
            status_code=403,
            detail="Database writes are disabled for testing. Use preview=true or set ALLOW_DB_WRITES=true.",
        )

    with get_session() as db:
        report = apply_pending_matricule_reconciliation(db, preview=preview)
    return report


@app.get("/matricules/pending/conflicts")
async def get_pending_matricule_conflicts() -> dict:
    with get_session() as db:
        report = apply_pending_matricule_reconciliation(db, preview=True)

    return {
        "total_pending": report.get("total_pending", 0),
        "conflicts_count": report.get("conflicts_count", 0),
        "conflicts": report.get("conflicts", []),
    }


@app.post("/students/suggestions")
async def suggest_students(payload: dict = Body(...)) -> dict:
    nom = (payload.get("nom") or "").strip()
    prenom = (payload.get("prenom") or "").strip()
    matricule = (payload.get("matricule") or "").strip() or None
    limit = int(payload.get("limit") or 5)

    if not nom and not prenom and not matricule:
        raise HTTPException(
            status_code=400,
            detail="Provide at least one of nom, prenom, or matricule",
        )

    with get_session() as db:
        result = suggest_student_candidates(
            db,
            nom=nom,
            prenom=prenom,
            matricule=matricule,
            limit=limit,
        )

    return result


@app.post("/students/suggestions/confirm")
async def confirm_student_suggestion(payload: dict = Body(...)) -> dict:
    selected_student_id = payload.get("selected_student_id")
    searched_nom = (payload.get("searched_nom") or "").strip()
    searched_prenom = (payload.get("searched_prenom") or "").strip()
    searched_matricule = (payload.get("searched_matricule") or "").strip() or None
    result_count = int(payload.get("result_count") or 0)

    if not isinstance(selected_student_id, int):
        raise HTTPException(status_code=400, detail="selected_student_id must be an integer")
    if not searched_nom and not searched_prenom and not searched_matricule:
        raise HTTPException(
            status_code=400,
            detail="Provide searched_nom/searched_prenom/searched_matricule for learning",
        )

    try:
        with get_session() as db:
            result = register_selected_suggestion(
                db,
                selected_student_id=selected_student_id,
                searched_nom=searched_nom,
                searched_prenom=searched_prenom,
                searched_matricule=searched_matricule,
                result_count=result_count,
            )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return result


@app.post("/students/search-index/rebuild")
async def rebuild_students_search_index(batch_size: int = Query(default=500, ge=50, le=5000)) -> dict:
    if not _db_writes_enabled():
        raise HTTPException(
            status_code=403,
            detail="Database writes are disabled for testing. Set ALLOW_DB_WRITES=true to enable this endpoint.",
        )

    with get_session() as db:
        result = rebuild_student_search_keys(db, batch_size=batch_size)

    return {
        "status": "ok",
        **result,
    }


if FRONTEND_ROOT is not None:
    tmp_root = PROJECT_ROOT / "tmp"
    if tmp_root.exists():
        app.mount("/tmp", StaticFiles(directory=str(tmp_root)), name="tmp-static")

    html_dir = FRONTEND_ROOT / "Html"
    js_dir = FRONTEND_ROOT / "Js"
    css_dir = FRONTEND_ROOT / "Css"

    if html_dir.exists():
        app.mount("/Html", StaticFiles(directory=str(html_dir)), name="frontend-html")
    if js_dir.exists():
        app.mount("/Js", StaticFiles(directory=str(js_dir)), name="frontend-js")
    if css_dir.exists():
        app.mount("/Css", StaticFiles(directory=str(css_dir)), name="frontend-css")
