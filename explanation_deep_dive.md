# Deep Dive Implementation Report

This document is the expanded technical report requested after explanation.md. It is intentionally exhaustive and written as an engineering handoff.

---

## 1) Executive Overview

Over the course of the session, the project was transformed from a mostly script-first skeleton into a layered backend architecture that supports:

1. Multipage PDF extraction through a FastAPI backend.
2. Batch upload handling with per-file and batch-level progress reporting.
3. Human verification save flow with matricule resolution.
4. Deferred matricule reconciliation with preview/apply controls.
5. Conflict-only retrieval for admin/manual review queues.

The implementation now has clear layers:

- Data model layer: SQLAlchemy ORM models aligned to schema.
- Domain class layer: dataclass entities in src/classes.
- Data access layer: repositories + generic CRUD.
- Service layer: database session management, extraction orchestration, matricule logic.
- API layer: upload/extract/verify/reconcile endpoints.

---

## 2) Chronological Change Log by User Request

## 2.1 Request: fill in models.py based on .sqbpro

### Action
- Parsed SQL schema content embedded in src/Database/database.sqbpro.
- Filled src/Database/models.py with SQLAlchemy declarative models.

### Why
- database.sqbpro (DB Browser project XML) contained authoritative SQL DDL.
- ORM needed for backend save/query functionality and relational navigation.

### Key Additions

#### Base
- Base = declarative_base()

#### Tables implemented
- AnneeUniversitaire
- Programme
- Etudiant
- Formation
- Groupe
- Matiere
- PeriodeProgramme
- Module
- Inscription
- InscriptionPeriode
- Resultat
- RechercheNameLog
- VariationNom

#### Constraints implemented
- Date ordering check (academic year end > start)
- Value checks (sexe enum-like constraint)
- Numeric bounds checks for grades
- Positive coefficient checks
- Uniqueness constraints for multiple business keys

#### Indexes implemented
- Standard column indexes
- Composite indexes
- Expression indexes for matricule search helpers (lower/suffix/numeric expression)
- Partial index behavior for numeric-only matricule variants

#### Relationships implemented
- Bidirectional relationship mappings using back_populates across relevant entities.

#### Helper
- init_db(engine): create all tables from metadata.

---

## 2.2 Request: fill classes package

### Action
- Added dataclass definitions in src/classes for previously empty files.

### Initial files filled
- etudiant.py
- inscription.py
- matiere.py
- programme.py
- __init__.py exports

### Why
- You asked for class compatibility with schema and package import usability.
- Empty placeholders had no runtime value.

### Design Notes
- Chosen implementation: dataclasses with slots to keep lightweight object models.
- Added helper methods to_dict/from_dict for straightforward serialization.
- Added minimal domain guard checks where low risk and high value:
  - Sexe allowed set validation in Etudiant.
  - Coefficient positivity in Matiere.
  - Grade range check in Inscription.

---

## 2.3 Request: add missing classes for full schema compatibility

### Action
Created additional class files:
- annee_universitaire.py
- formation.py
- groupe.py
- periode_programme.py
- module.py
- inscription_periode.py
- resultat.py
- recherche_name_log.py
- variation_nom.py

Updated package exports in src/classes/__init__.py.

### Why
- The domain class layer was incomplete relative to ORM/schema.

### Result
- src/classes now mirrors the schema footprint, reducing future impedance mismatch.

---

## 2.4 Request: repositories and services layer

### Action
Created service and repository foundation.

### Files added
- src/services/database.py
- src/services/__init__.py
- src/Repositories/base_repository.py
- src/Repositories/school_repositories.py
- src/Repositories/__init__.py

### Why
- Transition from ad-hoc script operations to reusable backend architecture.

### Detailed Breakdown

#### src/services/database.py

Purpose: centralize DB connectivity/session lifecycle.

Functions:
- build_sqlite_url(db_path=None)
  - Constructs sqlite URL from path or default DB file.
- create_sqlite_engine(db_path=None)
  - Creates SQLAlchemy engine with SQLite threading compatibility.
- create_session_factory(engine)
  - Returns configured sessionmaker.
- init_database()
  - Calls Base.metadata.create_all.
- get_session()
  - Context manager with commit/rollback/close behavior.
- get_db()
  - Generator helper style used commonly in dependency injection contexts.

Globals:
- engine
- SessionLocal

#### src/Repositories/base_repository.py

Purpose: shared generic CRUD.

Methods:
- create
- get_by_id
- list (limit/offset)
- update (attribute-safe)
- delete

#### src/Repositories/school_repositories.py

Purpose: entity-specific query methods.

Classes:
- EtudiantRepository
  - get_by_matricule
  - search_by_name (case-insensitive on nom/prenom/matricule)
- ProgrammeRepository
  - get_by_code
- MatiereRepository
  - get_by_code
- InscriptionRepository
  - get_by_etudiant_and_formation

Also exposed singleton instances for immediate use.

#### Dependency update
- Added SQLAlchemy to requirements1.txt.

---

## 2.5 Request: initialize src/Database/__init__.py

### Action
- Re-exported models, Base, and init_db.

### Why
- Improve package-level import ergonomics.

---

## 2.6 Core extraction backend request (multipage + FastAPI integration + key limits + busy errors)

This was the largest feature set.

### Action
Created src/Backend/extraction_service.py and later wired API usage.

### Why
- Existing extract.py handled one image/page and was script-centric.
- Your backend needed file-path input, multipage output, and operational resilience.

### Detailed Functional Design

#### Constants
- DEFAULT_MODEL
- DEFAULT_DPI
- DEFAULT_MAX_RETRIES_PER_PAGE
- DEFAULT_KEY_COOLDOWN_SECONDS

#### Prompt
- Embedded extraction prompt adapted from your existing extraction script rules.

#### ApiKeyPool design

Data structure:
- _ApiKeyState dataclass
  - key
  - client
  - cooldown_until
  - failures

Class:
- ApiKeyPool
  - from_environment:
    - reads GEMINI_API_KEYS (comma-separated) first
    - fallback GEMINI_API_KEY
  - acquire:
    - round-robin over keys not in cooldown
    - waits minimal time when all are cooling down
  - mark_success:
    - reset failure/cooldown
  - mark_transient_failure:
    - backoff and jitter assignment

Reasoning:
- distribute requests across keys
- reduce hard-stop on per-key rate limits
- improve throughput continuity under provider throttling

#### Parsing and normalization helpers
- _clean_json
- _coerce_number
- _postprocess
- _validate
- _is_transient_error

Reasoning:
- model output can be noisy or malformed
- keep shape and numeric values stable for downstream verification and save

#### PDF rendering helper
- _render_pdf_pages(pdf_path, output_dir, dpi)

Behavior:
- convert all pages to images
- deterministic page filenames page_0001.png etc.

#### Per-page extraction
- _extract_one_page(image_path, key_pool, model, max_retries)

Behavior:
- retries by page
- transient error detection for busy/rate/quota-like failures
- attaches metadata per page for observability

#### Main extraction function
- extract_pdf_with_page_mapping(file_path, output_root, model, dpi, max_retries_per_page)

Return payload includes:
- run directories
- total/ok/failed page counts
- pages list with image path + status + extracted result/error

#### Async wrapper
- extract_pdf_with_page_mapping_async(...)
  - runs sync workload via asyncio.to_thread

Reasoning:
- avoid blocking FastAPI event loop with CPU/I/O heavy operations.

---

## 2.7 FastAPI API module creation and integration

### Action
Created src/Backend/api.py and exported app.

### Endpoints added (initially)
- GET /health
- POST /extract/pdf

### Upload endpoint behavior
- validates filename and extension
- stores file under tmp/uploads
- invokes extraction service
- returns extraction payload

### Additional setup
- requirements updated:
  - fastapi
  - uvicorn
  - python-multipart
- README run instructions updated.

---

## 2.8 Multi-file upload support

### Action
Refactored API to support batch processing.

### Key internal helper
- _process_uploaded_pdf(file, batch_dir)

Purpose:
- isolate per-file logic and reuse in both single and multi endpoints.

### Endpoints
- POST /extract/pdf
  - still available for compatibility
  - now wrapped in batch-shaped response
- POST /extract/pdfs
  - accepts files: list[UploadFile]
  - processes all files in one request scope

### Response contract (batch)
- batch_id
- total_files
- processed_files
- failed_files
- results[]

Each result:
- upload metadata
- status
- extraction
- error

Reasoning:
- your verification step needs grouped file outputs for one upload operation.

---

## 2.9 Per-file progress percentages

### Action
Added progress builder in API:
- _build_processing_progress(extraction)

### Fields added per file
- processed_pages
- failed_pages
- total_pages
- processed_percentage
- message

### Why
- explicit user requirement for percentage-based status, example 18/20 => 90%.

---

## 2.10 Batch-level progress percentages

### Action
Added:
- _build_batch_processing_progress(results)
- batch_processing_progress in endpoint responses

### Why
- dashboard-level global progress indicator across all files in batch.

---

## 2.11 README API contract examples

### Action
Added sample payloads in README for:
- /extract/pdfs
- /extract/pdf

### Why
- reduce frontend integration ambiguity and mapping overhead.

---

## 2.12 Matricule service design and implementation

### Action
Created src/services/matricule_service.py and exported functions via src/services/__init__.py.

### Problem solved
- Missing matricule logic for first-year and non-first-year students.
- Need to persist unresolved non-first-year cases.
- Need to revisit unresolved cases later when historical data grows.

### Detailed Function Reference

#### _normalize_text(value)
- lowercases and normalizes whitespace.
- Used for stable name matching.

#### _safe_token(value, length)
- strips non-alphanumeric and uppercases.
- Used in generated matricule components.

#### _year_token(annee_univ)
- extracts 2-digit year token.
- fallback current year when missing/unparseable.

#### _matricule_exists(db, matricule)
- DB existence check.

#### _generate_unique_matricule(...)
- formats generated IDs:
  - TMP-YY-XXXXX-SUFFIX for temporary
  - ETU-YY-XXXXX-SUFFIX for first-year permanent generation
- retries randomness and fallback.

#### _find_existing_matricule(...)
- exact normalized name lookup (optional birth-date narrowing).
- returns existing matricule if found.

#### append_pending_matricule_case(...)
- writes JSON line record into tmp/pending_matricules.jsonl.
- stores metadata and source payload snapshot.

#### resolve_student_matricule(...)
Main decision engine:

1) if provided matricule exists => use provided
2) else if not first-year:
   - attempt history lookup
   - if found => use history
   - if not => generate temporary and append pending case
3) else first-year => generate permanent-style ETU matricule

Return includes:
- matricule
- source indicator
- needs_review flag
- pending_case details when applicable

#### load_pending_matricule_cases(...)
- reads pending JSONL safely.

#### check_pending_cases_against_database(...)
- scans pending entries, checks current DB for improved match opportunities.
- returns matches and unresolved lists.

---

## 2.13 Verification save flow API integration

### Action in src/Backend/api.py
Added:
- POST /verify/students/save
- GET /matricules/pending/check

### POST /verify/students/save details

Input:
- annee_univ
- students list (verified data from UI)

Per student:
- validates nom/prenom
- calls resolve_student_matricule
- upserts Etudiant by resolved matricule
- returns structured status result

Return includes:
- total_students
- saved_count
- failed_count
- saved[]
- failed[]

Saved item includes:
- action (created/updated)
- student_id
- resolved matricule
- matricule source
- needs review
- pending case if generated temporary

Reasoning:
- directly operationalize human verification stage into DB persistence.

---

## 2.14 Reconciliation preview/apply support

### Action in matricule service
Added:
- _write_pending_cases(cases, pending_file)
- apply_pending_matricule_reconciliation(db, preview=True|False)

### apply_pending_matricule_reconciliation behavior

For each pending case:
- try to find current better matricule via _find_existing_matricule

Classifies into:
- updates
- conflicts
- unchanged

Conflict scenarios implemented:
- temporary student record not found
- found real matricule already assigned to another student

If preview=False:
- updates temporary student matricule to new one
- marks pending case resolved with timestamps/metadata
- rewrites pending JSONL file

### API endpoint added
- POST /matricules/pending/apply?preview=true|false

Why:
- Safe dry-run before irreversible updates.

---

## 2.15 Conflicts-only endpoint for manual queue

### Action
Added endpoint:
- GET /matricules/pending/conflicts

Behavior:
- runs reconciliation in preview mode
- returns only conflict subset and summary

Why:
- You asked specifically for manual queue-focused endpoint.
- UI can consume this directly without filtering full report payload.

---

## 3) Current API Surface (Deep Contract Summary)

## 3.1 GET /health
Response:
- status: ok

## 3.2 POST /extract/pdf
Input:
- multipart form-data
- field: file

Output:
- batch metadata (single-file batch)
- batch_processing_progress
- results[0] with per-file extraction + processing_progress

## 3.3 POST /extract/pdfs
Input:
- multipart form-data
- field: files (multiple)

Output:
- batch metadata
- batch_processing_progress
- results[] one entry per file

## 3.4 POST /verify/students/save
Input JSON:
- annee_univ
- students[]

Output:
- total/saved/failed counts
- saved[] and failed[] details

## 3.5 GET /matricules/pending/check
Output:
- total_pending
- matches_found
- unresolved_count
- matches[]
- unresolved[]

## 3.6 POST /matricules/pending/apply?preview=true|false
Output:
- preview flag
- updates/conflicts/unchanged summaries and lists

## 3.7 GET /matricules/pending/conflicts
Output:
- total_pending
- conflicts_count
- conflicts[]

---

## 4) Data Storage Behavior and Operational Notes

## 4.1 Temporary filesystem usage
- Uploads: tmp/uploads
- Extraction artifacts: tmp/extractions
- Pending matricule queue: tmp/pending_matricules.jsonl

Implication:
- Suitable for local/dev.
- Not durable on ephemeral cloud runtimes unless mapped to persistent volume/object storage.

## 4.2 Database usage
- Current DB default: SQLite file in src/Database/database.db.
- Service scaffolding supports future engine abstraction migration.

## 4.3 Pending queue format
- JSON Lines (one JSON object per line)
- Easy append and line-by-line processing
- Rewrite step occurs during apply reconciliation to mark resolved entries

---

## 5) Conflict Taxonomy (as currently implemented)

1) temporary_student_not_found
- Pending case references TMP matricule, but no student row currently has it.
- Likely causes:
  - student deleted manually
  - matricule changed externally
  - stale pending entry

2) real_matricule_already_assigned
- Found target real matricule belongs to a different student row.
- Auto-update blocked to avoid duplicate identity collisions.

---

## 6) Validation, Tooling, and Quality Controls Applied During Session

Across implementation steps:
- Repeated static error checks on modified files using IDE diagnostics.
- Fixed typing mismatch in generator-return annotations.
- Avoided introducing unrelated refactors.
- Kept endpoints additive to preserve previous compatibility where feasible.

---

## 7) Important Caveats and Future Hardening

## 7.1 Matching quality for names
- Current history matching is strict normalized equality on nom/prenom.
- OCR character-drop substitutions are not yet integrated into this resolution path.
- You already planned phonetic/fuzzy search; should be integrated next.

## 7.2 Date handling
- save endpoint parses date_naissance expecting YYYY-MM-DD.
- Non-conforming date strings will fail unless normalized prior to save.

## 7.3 Concurrency and long-running extraction
- Current extraction endpoints process in-request.
- For large jobs, recommended migration:
  - async task queue (RQ/Celery/Arq)
  - job status endpoints
  - polling/websocket progress

## 7.4 JSONL pending file scalability
- Works for MVP.
- For scale and concurrency, move pending cases into dedicated DB table.

---

## 8) Full File Impact Inventory

## 8.1 Added
- src/Backend/extraction_service.py
- src/Backend/api.py
- src/services/database.py
- src/services/matricule_service.py
- src/services/__init__.py
- src/Repositories/base_repository.py
- src/Repositories/school_repositories.py
- src/Repositories/__init__.py
- src/classes/annee_universitaire.py
- src/classes/formation.py
- src/classes/groupe.py
- src/classes/periode_programme.py
- src/classes/module.py
- src/classes/inscription_periode.py
- src/classes/resultat.py
- src/classes/recherche_name_log.py
- src/classes/variation_nom.py
- explanation.md
- explanation_deep_dive.md

## 8.2 Filled/updated existing files
- src/Database/models.py
- src/Database/__init__.py
- src/classes/etudiant.py
- src/classes/inscription.py
- src/classes/matiere.py
- src/classes/programme.py
- src/classes/__init__.py
- src/Backend/__init__.py
- requirements1.txt
- README.md

---

## 9) Practical End-to-End Flow Now Available

1. Upload one or many PDFs:
   - POST /extract/pdf or /extract/pdfs
2. Get page extraction outputs with progress metadata.
3. Present to human verification UI.
4. Send verified student data to:
   - POST /verify/students/save
5. For unresolved non-first-year matricules:
   - cases are queued in pending JSONL
6. Later reconcile:
   - Preview: POST /matricules/pending/apply?preview=true
   - Apply: POST /matricules/pending/apply?preview=false
7. For manual admin queue:
   - GET /matricules/pending/conflicts

---

## 10) Why each major design choice was made

- Keep single-file endpoint while adding multi-file endpoint:
  - avoids breaking existing clients.
- Add both per-file and batch progress:
  - supports granular and global UX indicators.
- Add preview mode for reconciliation:
  - reduces risk of accidental destructive updates.
- Keep pending in JSONL initially:
  - fast MVP, no migration overhead early.
- Use key pool with cooldown/backoff:
  - maximize availability under provider limits.

---

## 11) Suggested next steps (ordered)

1) Implement fuzzy/phonetic-assisted identity matching in matricule history search.
2) Add pagination/filtering for conflicts endpoint.
3) Persist extraction batch metadata for reload/retry behavior.
4) Move pending queue from JSONL to DB table.
5) Introduce async job runner for long extraction batches.
6) Add authentication/authorization around admin reconciliation endpoints.

---

## 12) If you want a code-level appendix

A further appendix can be generated with:
- per-function signatures and parameter dictionaries
- endpoint example request/response for every route
- failure matrix by endpoint
- migration playbook: local tmp -> object storage + managed DB
