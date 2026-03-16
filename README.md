# projet_2cp
numerisation des archives

## Requirements
- Python 3.11+
- Poppler (required by `pdf2image`)

## Python libraries
Install the libraries needed by `test.py`:
```bash
pip install -r requirements1.txt
```

## Configure API key
Windows (cmd, current session):
```cmd
set GEMINI_API_KEY=YOUR_KEY
```

Windows (persistent):
```cmd
setx GEMINI_API_KEY "YOUR_KEY"
```
Close and reopen the terminal after `setx`.

## Run
```cmd
python test.py data\yourfile.pdf --output output.json
```

## FastAPI backend (stage 1 + 2)
Install dependencies:
```cmd
pip install -r requirements1.txt
```

Run API server:
```cmd
uvicorn src.Backend.api:app --reload
```

Endpoints:
- `GET /health`
- `POST /extract/pdf` (multipart form-data with `file` as PDF)
- `POST /extract/pdfs` (multipart form-data with `files` as multiple PDFs)
- `POST /verify/students/save` (JSON payload from human verification step)
- `GET /matricules/pending/check` (find pending temporary matricules that can now be reconciled)
- `POST /matricules/pending/apply?preview=true|false` (preview or apply reconciliation)
- `GET /matricules/pending/conflicts` (fetch only conflict cases for manual review)

Batch behavior for verification workflow:
- Every request gets a `batch_id`.
- Response contains `results[]` with one extraction output per uploaded file.
- Each file item contains per-page mapped extraction data ready to show page image + JSON during human verification.
- Response now also includes `batch_processing_progress` for all uploaded files combined.
- Each file item now includes `processing_progress` with:
	- `processed_pages`, `failed_pages`, `total_pages`
	- `processed_percentage` (example: `90.0`)
	- `message` (example: `90% pages processed (18/20)`)

Sample response (`POST /extract/pdfs`):
```json
{
	"batch_id": "batch_20260316_101010_ab12cd34",
	"total_files": 2,
	"processed_files": 2,
	"failed_files": 0,
	"batch_processing_progress": {
		"processed_pages": 36,
		"failed_pages": 4,
		"total_pages": 40,
		"processed_percentage": 90.0,
		"message": "90% pages processed (36/40)"
	},
	"results": [
		{
			"upload": {
				"original_filename": "archive_1978.pdf",
				"saved_path": "tmp/uploads/batch_.../file_a/archive_1978.pdf",
				"bytes": 1450000
			},
			"status": "ok",
			"processing_progress": {
				"processed_pages": 18,
				"failed_pages": 2,
				"total_pages": 20,
				"processed_percentage": 90.0,
				"message": "90% pages processed (18/20)"
			},
			"extraction": {
				"file_path": "tmp/uploads/batch_.../file_a/archive_1978.pdf",
				"run_dir": "tmp/extractions/archive_1978_20260316_101011",
				"pages_dir": "tmp/extractions/archive_1978_20260316_101011/pages",
				"total_pages": 20,
				"ok_pages": 18,
				"failed_pages": 2,
				"pages": [
					{
						"page_number": 1,
						"image_path": "tmp/extractions/.../pages/page_0001.png",
						"status": "ok",
						"attempt": 1,
						"api_key_suffix": "A1B2",
						"result": {"type": "single student"},
						"error": null
					}
				]
			},
			"error": null
		}
	]
}
```

Sample response (`POST /extract/pdf`):
```json
{
	"batch_id": "batch_20260316_111111_ef56gh78",
	"total_files": 1,
	"processed_files": 1,
	"failed_files": 0,
	"batch_processing_progress": {
		"processed_pages": 9,
		"failed_pages": 1,
		"total_pages": 10,
		"processed_percentage": 90.0,
		"message": "90% pages processed (9/10)"
	},
	"results": [
		{
			"status": "ok",
			"processing_progress": {
				"processed_pages": 9,
				"failed_pages": 1,
				"total_pages": 10,
				"processed_percentage": 90.0,
				"message": "90% pages processed (9/10)"
			}
		}
	]
}
```

Multiple API keys for quota/rate limits:
```cmd
set GEMINI_API_KEYS=KEY_1,KEY_2,KEY_3
```
If not set, backend falls back to `GEMINI_API_KEY`.

## Matricule strategy (missing matricule cases)
Implemented helpers in [src/services/matricule_service.py](src/services/matricule_service.py).

Rules:
- If OCR provides matricule, use it.
- If matricule is missing and student is **not first year**, search existing DB by `nom + prenom` (and optional `date_naissance`).
- If still not found, generate a **temporary unique matricule** (`TMP-...`) and append case to `tmp/pending_matricules.jsonl` for later review.
- If student is **first year**, generate a final unique matricule (`ETU-...`).

Main function to call during save step:
- `resolve_student_matricule(...)`

Pending reconciliation helper:
- `check_pending_cases_against_database(...)` returns candidates where a better matricule is now found in DB after importing additional years.

Verification save endpoint payload example:
```json
{
	"annee_univ": "1978-1979",
	"students": [
		{
			"nom": "BOUBAKER",
			"prenom": "AHMED",
			"matricule": null,
			"is_first_year": false,
			"date_naissance": "1958-04-21",
			"lieu_naissance": "Tlemcen",
			"sexe": "M"
		}
	]
}
```

Behavior of `POST /verify/students/save`:
- Creates/updates `etudiant` records.
- Resolves matricule using rules (`provided`, `history`, `generated_first_year`, `generated_temporary`).
- Returns per-student status and includes `pending_case` when temporary matricule is generated.

Reconciliation apply endpoint:
- Preview mode (safe, no DB/file writes):
	- `POST /matricules/pending/apply?preview=true`
- Apply mode (updates DB + marks pending cases as resolved):
	- `POST /matricules/pending/apply?preview=false`

Response contains:
- `updates` (cases to apply / applied)
- `conflicts` (manual intervention needed)
- `unchanged` (no match yet or already aligned)

## Notes
- If you get a Poppler error, install Poppler and add it to PATH.
