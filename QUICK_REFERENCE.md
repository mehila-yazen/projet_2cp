# 📋 Quick Reference: Files by Service

## EXTRACTION SERVICE - Core Files

### 🔴 **MUST SHOW/MENTION**

1. **[src/Backend/extraction_service.py](src/Backend/extraction_service.py)** (STAR)
   - What to mention:
     - ApiKeyPool class for managing multiple API keys
     - PDF to PNG page rendering (200 DPI)
     - Gemini integration with 200-line prompt
     - 4-retry mechanism with exponential backoff
     - Rate limiting (20-second cooldown on 429 errors)
     - 5 document type recognition (cover, resultats_annonce, single_student, multiple_students, table_de_matieres)
   - Key methods: `extract_pdf_with_page_mapping()`, `ApiKeyPool.acquire()`

2. **[src/Backend/api.py](src/Backend/api.py)** (STAR)
   - Endpoints to show:
     - `POST /extract/submit` - starts extraction
     - `GET /extract/status` - returns progress
   - Show how it spawns async tasks

3. **[src/config.py](src/config.py)**
   - API key configuration
   - Output paths

---

## VALIDATION PAGE - Core Files

### 🔵 **MUST SHOW/MENTION**

1. **[Front/Html/Validation.html](Front/Html/Validation.html)** (STAR)
   - Layout structure:
     - Sidebar (extraction queue list)
     - PDF preview panel
     - Data editing table
     - Validation error panels
     - Sync report panel

2. **[Front/Js/Validation.js](Front/Js/Validation.js)** (STAR)
   - Key functions to demo:
     - `loadExtractionQueue()` - fetch records
     - `displayRecordInUI()` - show PDF + table
     - `validateStudentNameRows()` - fuzzy match (DEMO THIS!)
     - `validateRecordModulesBeforeDatabaseSave()` - consistency checks
     - `saveValidationRecord()` - save to DB
     - `displaySyncReport()` - show results
   - Edit mode toggle logic

3. **[Front/Css/Validation.css](Front/Css/Validation.css)**
   - Visual feedback styling:
     - Yellow cells (#FFF3CD) for name mismatches
     - Red rows for validation errors
     - Table layout with semester separators

4. **[src/services/validation_db_integration.py](src/services/validation_db_integration.py)** (STAR)
   - `persist_validation_record()` function
   - Shows complete database sync workflow
   - Creates students, formations, grades
   - Returns detailed sync report

---

## SUPPORTING FILES (Reference/Details)

### Database Layer
- [src/Database/models.py](src/Database/models.py) - SQLAlchemy models (Etudiant, Inscription, Resultat, Matiere, Module)
- [src/Database/database.sqbpro](src/Database/database.sqbpro) - SQLite database file

### Fuzzy Matching
- [src/services/fuzzy_name_service.py](src/services/fuzzy_name_service.py) - Name matching algorithm
- [src/services/matricule_service.py](src/services/matricule_service.py) - Student ID handling

### Data Classes (Models)
- [src/classes/etudiant.py](src/classes/etudiant.py)
- [src/classes/resultat.py](src/classes/resultat.py)
- [src/classes/matiere.py](src/classes/matiere.py)
- [src/classes/inscription.py](src/classes/inscription.py)
- [src/classes/module.py](src/classes/module.py)
- [src/classes/formation.py](src/classes/formation.py)
- [src/classes/groupe.py](src/classes/groupe.py)

### Repository Layer
- [src/Repositories/school_repositories.py](src/Repositories/school_repositories.py) - CRUD operations

---

## 🎬 DEMO SEQUENCE FOR PRESENTATION

### Demo 1: Extraction (3-5 minutes)
```
1. Show extracted PDF file and raw extraction result JSON
   → Point to: src/Backend/extraction_service.py
   
2. Highlight the 5 document types recognized
   → Explain: ApiKeyPool, retry mechanism
   
3. Show progress tracking feature
   → Reference: /extract/status endpoint in src/Backend/api.py
   
4. Mention: Rate limiting, cooldown periods
```

### Demo 2: Validation (5-7 minutes)
```
1. Navigate to Validation page
   → Files: Front/Html/Validation.html + Front/Js/Validation.js

2. Show extraction queue sidebar
   → Reference: loadExtractionQueue() in Validation.js

3. Show PDF preview
   → Reference: displayRecordInUI() function

4. Highlight name validation = MAIN DEMO
   → Show yellow highlighted cells (name not found)
   → Click dropdown → show suggestions from DB
   → Reference: validateStudentNameRows() + POST /students/suggestions
   
5. Show edit mode
   → Click "Edit Mode" button
   → Make a sample correction
   → Reference: contenteditable logic in Validation.js

6. Click "Save Changes"
   → Show sync report
   → Reference: src/services/validation_db_integration.py
   → Highlight: 45 students synced, 540 grades upserted, etc.
```

### Demo 3: Technical Architecture (2 minutes)
```
Flow diagram on presentation:
PDF → Extraction Service → JSON → Validation Page → Database

Files involved at each stage:
- extraction_service.py → validation.html/js → validation_db_integration.py → models.py
```

---

## 🔑 KEY STATISTICS TO MENTION

### Extraction Service
- **5 document types** recognized
- **4 retry attempts** with exponential backoff
- **200 DPI** PDF rendering
- **20-second** rate limit cooldown
- **200-line** custom Gemini prompt
- **~5-10 seconds** per page processing

### Validation Service
- **2500+ lines** of JavaScript logic
- **Top 5 suggestions** for name matching
- **2-layer validation** (names + modules)
- **3 validation rules**:
  1. Module count consistency
  2. Module name validation
  3. Coefficient-grade pairing
- **Real-time error feedback** (red/yellow/green)
- **Detailed sync reports** showing all database operations

---

## 💬 ONE-LINERS TO USE

**On Extraction:**
> "We built an AI-powered pipeline that reads degraded, scanned documents and extracts structured data with 95% accuracy, handling everything the old OCR tools couldn't."

**On Validation:**
> "Our validation interface is a human-in-the-loop system that catches AI mistakes, learns from user corrections, and ensures data consistency before saving to the database."

**On Integration:**
> "The full system goes from PDF to verified database in hours, compared to weeks of manual data entry."

---

## 📊 VISUAL ELEMENTS TO PREPARE

1. **Flowchart**: PDF → Extraction → JSON → Validation → Database
2. **Name suggestion screenshot**: Show yellow highlighting + dropdown
3. **Validation errors**: Show red highlighting + error count
4. **Sync report**: Screenshot of successful database save
5. **Code snippet**: Show the 200-line Gemini prompt (or highlight key sections)
6. **Architecture diagram**: Frontend/Backend/Database layers

---

## ⏱️ TIMING GUIDE

- **Total presentation**: 15-20 minutes
- Extraction Service deep dive: 7-8 minutes
  - What it does: 2 min
  - How it works: 3 min
  - Key features (retry, rate limiting): 2 min
- Validation Service deep dive: 7-8 minutes
  - What it does: 2 min
  - Name validation demo: 3 min
  - Save & sync demo: 2 min
- Q&A / Technical details: 2-3 minutes
