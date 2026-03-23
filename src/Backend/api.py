from __future__ import annotations

import json
import os
from datetime import datetime
from datetime import date
from pathlib import Path
from uuid import uuid4

from fastapi import Body, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from src.Backend.extraction_service import extract_pdf_with_page_mapping_async
from src.Database.models import Etudiant
from src.services.database import get_session
from src.services.matricule_service import (
    apply_pending_matricule_reconciliation,
    check_pending_cases_against_database,
    resolve_student_matricule,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_ROOT = PROJECT_ROOT / "tmp" / "uploads"
EXTRACTION_ROOT = PROJECT_ROOT / "tmp" / "extractions"
COMPLETED_EXTRACTIONS_ROOT = PROJECT_ROOT / "tmp" / "completed_extractions"
FRONTEND_ROOT = PROJECT_ROOT / "Frontend"


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

    percentage = 0.0 if total_pages == 0 else round((processed_pages / total_pages) * 100, 2)
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

    percentage = 0.0 if total_pages == 0 else round((processed_pages / total_pages) * 100, 2)
    display_percent = int(round(percentage))

    return {
        "processed_pages": processed_pages,
        "failed_pages": failed_pages,
        "total_pages": total_pages,
        "processed_percentage": percentage,
        "message": f"{display_percent}% pages processed ({processed_pages}/{total_pages})",
    }


async def _process_uploaded_pdf(file: UploadFile, batch_dir: Path) -> dict:
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

    saved_pdf.write_bytes(file_bytes)

    try:
        extraction = await extract_pdf_with_page_mapping_async(
            saved_pdf,
            output_root=EXTRACTION_ROOT,
        )
    except Exception as exc:
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
    if item.get("status") != "ok":
        return None

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
async def extract_pdf(file: UploadFile = File(...)) -> dict:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    batch_id = f"batch_{timestamp}_{uuid4().hex[:8]}"
    batch_dir = UPLOAD_ROOT / batch_id
    batch_dir.mkdir(parents=True, exist_ok=True)

    result = await _process_uploaded_pdf(file, batch_dir)
    _persist_completed_batch(batch_id, [result])
    batch_progress = _build_batch_processing_progress([result])
    return {
        "batch_id": batch_id,
        "total_files": 1,
        "processed_files": 1 if result.get("status") == "ok" else 0,
        "failed_files": 0 if result.get("status") == "ok" else 1,
        "batch_processing_progress": batch_progress,
        "results": [result],
    }


@app.post("/extract/pdfs")
async def extract_pdfs(files: list[UploadFile] = File(...)) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    batch_id = f"batch_{timestamp}_{uuid4().hex[:8]}"
    batch_dir = UPLOAD_ROOT / batch_id
    batch_dir.mkdir(parents=True, exist_ok=True)

    results: list[dict] = []
    for upload in files:
        item = await _process_uploaded_pdf(upload, batch_dir)
        results.append(item)

    processed = sum(1 for item in results if item.get("status") == "ok")
    failed = len(results) - processed
    _persist_completed_batch(batch_id, results)
    batch_progress = _build_batch_processing_progress(results)

    return {
        "batch_id": batch_id,
        "total_files": len(results),
        "processed_files": processed,
        "failed_files": failed,
        "batch_processing_progress": batch_progress,
        "results": results,
    }


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


if FRONTEND_ROOT.exists():
    tmp_root = PROJECT_ROOT / "tmp"
    if tmp_root.exists():
        app.mount("/tmp", StaticFiles(directory=str(tmp_root)), name="tmp-static")
    app.mount("/", StaticFiles(directory=str(FRONTEND_ROOT)), name="frontend")
