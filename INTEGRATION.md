# INTEGRATION.md

## 1) Goal of this integration

This project integrates:

1. A browser frontend (Digitization + Validation pages)
2. A FastAPI backend (upload, extraction, progress, completed records, save verified students)
3. A SQLite database (current write path focused on `etudiant` table)
4. A file-based extraction artifact layer in `tmp/` used as the bridge between long-running AI extraction and UI state

The intent is:

- Upload PDF archive documents from the frontend
- Run page-by-page AI extraction in the backend
- Show progress live in frontend
- Persist extraction artifacts/results in `tmp/`
- Let humans validate/correct extracted students in Validation page
- Save validated students into DB safely (with matricule resolution strategy)

---

## 2) Main components and where they are

### Frontend

- API wrapper: `Front/Js/apiClient.js`
- Upload/progress UI: `Front/Js/Digitization.js`
- Validation/edit/save UI: `Front/Js/Validation.js`

### Backend

- API endpoints and orchestration: `src/Backend/api.py`
- AI extraction pipeline (PDF -> page images -> model output): `src/Backend/extraction_service.py`
- Matricule resolution and pending-case reconciliation: `src/services/matricule_service.py`
- DB session/engine utilities: `src/services/database.py`

### Database schema

- SQLAlchemy models: `src/Database/models.py`
- SQLite file (default): `src/Database/database.db`

### File artifact storage used by integration

- Uploaded PDFs: `tmp/uploads/<batch_id>/<file_token>/<filename>.pdf`
- Extraction run folders: `tmp/extractions/<pdf_stem>_<timestamp>/...`
- Completed extraction index files: `tmp/completed_extractions/<batch_id>.json`
- Pending temporary-matricule review: `tmp/pending_matricules.jsonl`

---

## 3) End-to-end flow (boring, exact sequence)

## 3.1 Digitization page load

When `Digitization.js` initializes:

1. Creates `api = new window.DigitizationApiClient()`
2. Renders local document list from browser localStorage (`digitizationDocuments`)
3. Calls backend health check (`api.health()`)
4. If backend reachable:
   - `backendAvailable = true`
   - Calls `api.getCompletedExtractions(100)` to hydrate old completed runs
5. If backend not reachable:
   - Falls back to localStorage `completedExtractions`

So even before new upload, frontend tries to show existing extraction history.

## 3.2 Upload from Digitization UI

On file selection/drop:

1. `validateFiles(...)` enforces:
   - PDF extension/type
   - max 100MB per file
2. `addUploadingDocuments(...)` creates local UI entries with initial status:
   - `status = processing`
   - `progress = 5`
3. For each file:
   - generate `operationId = op_<docId>_<timestamp>`
   - start progress polling loop (`startProgressLoop(docId, operationId)`)
   - call `api.extractPdf(file, operationId)`

## 3.3 Backend extraction request handling

Endpoint: `POST /extract/pdf` in `api.py`

1. Create `batch_id`
2. Create batch upload folder in `tmp/uploads`
3. If operation ID provided, bind batch_id into in-memory progress state
4. Call `_process_uploaded_pdf(...)`

Inside `_process_uploaded_pdf(...)`:

1. Validate filename and extension
2. Save uploaded bytes to `tmp/uploads/.../*.pdf`
3. Initialize operation progress state (`status=processing`, stage `upload_received`)
4. Execute extraction with timeout via:
   - `asyncio.wait_for(extract_pdf_with_page_mapping_async(...), timeout=EXTRACTION_REQUEST_TIMEOUT_SECONDS)`

Possible outcomes:

### Outcome A: extraction completes before timeout

- Returns `status = ok`
- Includes full extraction payload (`result.extraction`)
- Includes computed `processing_progress`
- Marks operation state `status = completed`
- Persists completed records to `tmp/completed_extractions/<batch_id>.json`

### Outcome B: request timeout but extraction keeps running

- Catches timeout and sets operation progress state:
  - `status = processing`
  - `stage = timeout_waiting`
  - `error = "Request timed out after ... but extraction is still running in background."`
- Response to frontend has:
  - `result.status = processing`
  - `result.error = "Request timed out, extraction continues in background. Keep polling..."`
- Frontend should continue polling progress endpoint

### Outcome C: hard extraction failure

- Returns `status = failed`
- Includes error message
- Operation state marked failed

## 3.4 Backend live progress mechanics

Progress is tracked in memory dictionary:

- `EXTRACTION_PROGRESS_STATE[operation_id]`

Per-page updates come from extraction service callback:

- `_make_progress_callback(operation_id)` -> `_upsert_operation_progress(...)`

`_upsert_operation_progress(...)` computes percentage using:

- completed pages = `processed_pages + failed_pages`
- percentage = `completed / total`

This means progress reflects work done, not only successful pages.

## 3.5 Recovery if timeout happened but artifacts exist later

Endpoint: `GET /extract/progress/{operation_id}` calls `_refresh_operation_state_from_artifacts(...)`.

That function now attempts recovery in this order:

1. If already completed+persisted in memory, return immediately
2. Try to find extraction payload in `tmp/extractions/**/extraction_result.json` matching saved PDF path
3. If found:
   - force operation state to `completed`
   - copy page totals into progress
   - persist completion record if needed
4. If not found, try completed extraction records in `tmp/completed_extractions/*.json`
5. If found there:
   - mark operation completed using that record

This is what prevents “stuck forever at 18% while result is actually available on disk”.

## 3.6 Frontend progress loop behavior

`startProgressLoop(...)` in `Digitization.js` polls every 900ms using `api.getExtractionProgress(operationId)`.

For each poll:

1. Read `total_pages`, `processed_pages`, `failed_pages`, `processed_percentage`
2. Update row progress bar and extraction summary
3. If backend status is `processing` and includes timeout message:
   - row `error` is updated
   - an info toast is shown once
4. If backend status is `completed`:
   - sets row status to `completed` if failed pages = 0
   - otherwise marks `failed` with partial-processing message
   - sets progress 100
   - stops polling
5. If backend status is `failed`:
   - marks failed
   - stops polling

If polling fails repeatedly (network/backend issues):

- after 8 consecutive poll failures, row becomes failed and error toast is shown

This avoids silent “nothing happened” behavior.

## 3.7 Completed extraction persistence used by frontend and validation

Backend endpoint `GET /extract/completed` returns records merged from files in:

- `tmp/completed_extractions/*.json`

Each record has:

- file-level fields: `file_name`, `status`, `total_pages`, `ok_pages`, `failed_pages`
- per-page fields: `page_number`, `status`, `image_path`, `result`, `error`

Frontend also keeps local fallback cache in browser localStorage key `completedExtractions`.

---

## 4) AI extraction JSON shape and how frontend uses it

Per page, extraction service emits one `pages[]` item with:

- `page_number`
- `status` (`ok`/`failed`)
- `image_path`
- `result` (parsed JSON output for that page)
- `error` (if page failed)

`result.type` can represent different layouts (examples handled in frontend):

- `single_student`
- `multiple_students`
- `resultats_annonce`
- other types like `cover`, `table_de_matieres`, `unknown`

Validation page does not directly send full raw AI JSON to DB.
It first transforms page `result` into editable rows, then sends reduced payload.

---

## 5) Validation page data transformation (critical DB bridge)

## 5.1 How Validation builds table rows

In `Validation.js`:

1. Loads record list from backend `GET /extract/completed` (or local fallback)
2. For selected page, reads `page.result`
3. `parseStudentsFromResult(result)` converts layout-specific structures into normalized row objects with fields:
   - `nom`, `prenom`, `matricule`, `modules`, `decision`
4. Table is rendered as editable HTML cells

## 5.2 What is actually sent to backend on save

`saveValidatedStudents()` calls `collectStudentsFromTable()`.

Important detail: even though table contains many columns/modules, current save payload keeps only:

- `nom`
- `prenom`
- `matricule`
- `is_first_year` (hardcoded false in current UI)

Then payload sent is:

```json
{
  "annee_univ": "<meta-year text or null>",
  "students": [
    {
      "nom": "...",
      "prenom": "...",
      "matricule": "... or null",
      "is_first_year": false
    }
  ]
}
```

So module grades and many table values are currently not persisted to relational tables.

---

## 6) Database writes: exact mapping from validated payload

Endpoint: `POST /verify/students/save`

Guardrail first:

- If `ALLOW_DB_WRITES` is not true-like, endpoint returns 403 and writes nothing.

For each student in payload:

1. Validate required fields:
   - `nom` non-empty
   - `prenom` non-empty
2. Resolve matricule via `resolve_student_matricule(...)`
3. Upsert into `etudiant` table by `matricule`

## 6.1 `etudiant` table columns currently affected

When a row is created:

- `nom` <- payload student.nom
- `prenom` <- payload student.prenom
- `matricule` <- resolved matricule
- `sexe` <- payload student.sexe (if provided; usually absent from current Validation payload)
- `lieu_naissance` <- payload student.lieu_naissance (if provided; usually absent)
- `date_naissance` <- parsed payload student.date_naissance (if provided; usually absent)

When a row already exists (same matricule):

- always updates `nom`, `prenom`
- conditionally updates if provided and not null:
  - `sexe`
  - `lieu_naissance`
  - `date_naissance`

## 6.2 Matricule resolution behavior

`resolve_student_matricule(...)` path:

1. If payload provided matricule -> use as-is (`source=provided`)
2. Else, if not first year:
   - try find existing by normalized `nom+prenom` (and optional date)
   - if found -> use historical matricule (`source=history`)
   - if not found -> generate temporary `TMP-...`, record pending case in `tmp/pending_matricules.jsonl` (`source=generated_temporary`)
3. Else (first year):
   - generate final `ETU-...` (`source=generated_first_year`)

## 6.3 Other tables currently NOT written by this integration path

From current frontend payload + current endpoint implementation, these are not inserted/updated during validation save:

- `inscription`
- `inscription_periode`
- `resultat`
- `module`
- `matiere`
- `groupe`
- `formation`
- `programme`
- `annee_universitaire`

They exist in schema, but current implemented save endpoint does not map AI output into them yet.

---

## 7) Frontend API functions in use (explicit list)

From `Front/Js/apiClient.js`, frontend uses these methods:

1. `health()`
   - GET `/health`
   - Used by Digitization startup connectivity check

2. `extractPdf(file, operationId)`
   - POST `/extract/pdf`
   - Used by Digitization upload flow

3. `extractPdfs(files, operationId)`
   - POST `/extract/pdfs`
   - Available in client; current Digitization flow mainly calls single-file method per file

4. `getExtractionProgress(operationId)`
   - GET `/extract/progress/{operation_id}`
   - Used by Digitization progress polling loop

5. `getCompletedExtractions(limit)`
   - GET `/extract/completed?limit=...`
   - Used by Digitization hydration and Validation queue loading

6. `saveVerifiedStudents(payload)`
   - POST `/verify/students/save`
   - Used by Validation save operation

---

## 8) Key frontend functions and what each does

## 8.1 In Digitization.js

- `validateFiles(fileList)`
  - Filters non-PDF/oversized files
- `addUploadingDocuments(files)`
  - Adds local UI rows with processing status
- `uploadWithBackend(uploadItems)`
  - Calls extraction endpoint and updates status per response
- `startProgressLoop(docId, operationId)`
  - Polls progress endpoint, updates progress bar, handles timeout/background messages and terminal states
- `persistCompletedExtractions(response, uploadItems, results)`
  - Caches completed extraction records in localStorage fallback
- `hydrateCompletedExtractionsIntoDocuments()`
  - Loads completed records from backend, fallback local
- `processSelectedFiles(files)`
  - Main orchestration for user upload action
- `checkBackendAvailability()`
  - health check + initial hydration

## 8.2 In Validation.js

- `loadRecords()`
  - Fetches completed extraction records from backend, fallback local
- `parseStudentsFromResult(resultObj)`
  - Converts AI page JSON formats into student rows
- `renderStudentsTable()`
  - Builds editable table rows per student/page
- `collectStudentsFromTable()`
  - Extracts validated student payload from edited table
- `saveValidatedStudents()`
  - Calls backend save endpoint with reduced student payload

---

## 9) Timeout/progress issues that were integrated/fixed

The following behavior is now integrated in the current code:

1. Progress percentage no longer tied only to successful pages.
   - It now counts completed work (`processed + failed`) so progress reflects real processing advancement.

2. Timeout no longer means silent dead-end.
   - Backend returns `status=processing` + explanatory error message for background continuation.
   - Frontend displays this message and keeps polling.

3. Progress endpoint can recover completion from disk artifacts.
   - Even if in-memory state did not finalize cleanly, backend checks extraction artifacts and completed records and flips operation to completed when found.

4. Polling failures are not swallowed forever.
   - Frontend now transitions to visible failure after repeated poll errors and shows an error message.

---

## 10) Practical implication for database integration today

Current production path is a two-stage persistence model:

Stage A (AI extraction persistence):

- Persisted in files under `tmp/` (`extractions` and `completed_extractions`)
- Used for preview, validation queue, page-level auditability

Stage B (validated student persistence):

- Persisted to DB only through `POST /verify/students/save`
- Currently writes/upserts `etudiant` identities and matricule decisions

So, from AI JSON to relational DB, the currently implemented direct mapping is focused on student identity fields, not full academic results tables.

If full academic import is desired, a new backend mapping layer must be added from validated module/year/decision rows into tables like `inscription`, `inscription_periode`, and `resultat`.
