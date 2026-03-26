# API Client Guide for Frontend Team

This document explains the `DigitizationApiClient` available in `Front/Js/apiClient.js` and what methods you can use today.

---

## 1. Overview

The API client is a JavaScript wrapper that communicates with the FastAPI backend. It handles:
- PDF uploads and extraction
- Progress tracking for long-running operations
- Retrieval of completed extraction records
- Saving validated student data

**How to use it:**
```javascript
const api = new window.DigitizationApiClient();
// Or with custom base URL:
const api = new window.DigitizationApiClient({ baseUrl: 'http://custom-backend:8000' });
```

The client automatically uses `http://127.0.0.1:8000` as default, but respects:
1. Constructor option: `baseUrl`
2. Global variable: `window.__API_BASE_URL`
3. localStorage: `localStorage.getItem('apiBaseUrl')`

---

## 2. Available Methods

### 2.1 `health()` — Check Backend Connectivity

**Purpose:** Verify the backend is running before attempting operations.

**Signature:**
```javascript
async health() → Promise<Object>
```

**Returns:**
```javascript
{ status: "ok" }
```

**Usage example:**
```javascript
try {
  const result = await api.health();
  console.log('Backend is available:', result.status === 'ok');
} catch (err) {
  console.error('Backend unreachable:', err.message);
}
```

**When to use:**
- On page load to detect if backend is online
- Before showing/hiding backend-dependent UI elements

---

### 2.2 `extractPdf(file, operationId)` — Upload & Extract Single PDF

**Purpose:** Upload a single PDF file for AI extraction.

**Signature:**
```javascript
async extractPdf(file: File, operationId?: string) → Promise<Object>
```

**Parameters:**
- `file` (required): DOM File object from `<input type="file">` or drag-drop
- `operationId` (optional): Unique operation identifier. If provided, backend tracks progress under this ID.

**Returns:**
```javascript
{
  batch_id: "batch_20260325_224359_7d615b50",
  operation_id: "op_123_1234567890",
  total_files: 1,
  processed_files: 1,    // 1 if extraction started/succeeded
  failed_files: 0,        // 1 if extraction failed
  batch_processing_progress: {
    processed_pages: 0,
    failed_pages: 0,
    total_pages: 0,
    processed_percentage: 0,
    message: "0% pages processed (0/0)"
  },
  results: [
    {
      status: "ok" | "processing" | "failed",
      error: "..." or null,
      upload: {
        original_filename: "document.pdf",
        saved_path: "/path/to/saved.pdf",
        bytes: 1024000
      },
      extraction: { /* full extraction result */ },
      processing_progress: { /* same as batch */ }
    }
  ]
}
```

**Possible status values:**
- `"ok"` — Extraction completed successfully (check results[0].extraction for data)
- `"processing"` — Extraction is running on backend. Keep polling with `getExtractionProgress()`
- `"failed"` — Extraction failed. Check error message.

**Usage example:**
```javascript
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];
const operationId = `op_${Date.now()}`;

try {
  const response = await api.extractPdf(file, operationId);
  
  if (response.results[0].status === 'ok') {
    // Extraction is complete
    console.log('Pages extracted:', response.results[0].extraction.total_pages);
  } else if (response.results[0].status === 'processing') {
    // Start polling for progress
    console.log('Extraction running in background, keep polling...');
    startProgressLoop(operationId);
  } else if (response.results[0].status === 'failed') {
    console.error('Extraction failed:', response.results[0].error);
  }
} catch (err) {
  console.error('Request failed:', err.message);
}
```

---

### 2.3 `extractPdfs(files, operationId)` — Upload & Extract Multiple PDFs

**Purpose:** Upload multiple PDF files in one batch operation.

**Signature:**
```javascript
async extractPdfs(files: File[], operationId?: string) → Promise<Object>
```

**Parameters:**
- `files` (required): Array of File objects
- `operationId` (optional): Unique operation identifier

**Returns:**
Same structure as `extractPdf()`, but with:
- `total_files`: Number of PDFs in batch
- `processed_files`: Count of successfully extracted
- `failed_files`: Count of failed extractions
- `results`: Array with one entry per file

**Usage example:**
```javascript
const files = Array.from(document.querySelector('input[type="file"]').files);
const operationId = `batch_${Date.now()}`;

const response = await api.extractPdfs(files, operationId);
console.log(`Processed ${response.processed_files}/${response.total_files} files`);

// Check individual results
response.results.forEach((result, idx) => {
  console.log(`File ${idx}: ${result.status}`);
});
```

---

### 2.4 `getExtractionProgress(operationId)` — Poll Extraction Status

**Purpose:** Check the live progress of an ongoing extraction operation.

**Signature:**
```javascript
async getExtractionProgress(operationId: string) → Promise<Object>
```

**Parameters:**
- `operationId` (required): The operation ID from `extractPdf()` or `extractPdfs()` response

**Returns:**
```javascript
{
  operation_id: "op_123_1234567890",
  status: "processing" | "completed" | "failed",
  stage: "upload_received" | "processing" | "timeout_waiting" | "completed",
  file_name: "document.pdf",
  batch_id: "batch_20260325_224359_7d615b50",
  saved_path: "/tmp/uploads/batch_.../file.pdf",
  total_pages: 150,
  processed_pages: 45,     // successfully extracted pages
  failed_pages: 2,         // failed pages
  processed_percentage: 31.4,
  message: "31% pages processed (45/150)",
  error: null,
  updated_at: "2026-03-25T22:45:30"
}
```

**Key behavior:**
- Progress includes both successful (`processed_pages`) and failed (`failed_pages`) pages
- `processed_percentage` = (processed_pages + failed_pages) / total_pages
- Backend may return `status: "processing"` with an error message if request timed out but extraction continues in background
- If `status: "completed"`, extraction is fully done (even if some pages failed)

**Usage example (polling loop):**
```javascript
async function startProgressLoop(operationId, intervalMs = 900) {
  const maxFailures = 8;
  let consecutiveFailures = 0;

  const pollInterval = setInterval(async () => {
    try {
      const progress = await api.getExtractionProgress(operationId);
      consecutiveFailures = 0;

      // Update UI with progress
      const percent = Math.round(progress.processed_percentage);
      console.log(`${percent}% (${progress.processed_pages}/${progress.total_pages})`);
      updateProgressBar(percent);

      // Handle completion
      if (progress.status === 'completed') {
        console.log('Extraction complete!');
        clearInterval(pollInterval);
        loadExtractedData(operationId);
        return;
      }

      // Handle failure
      if (progress.status === 'failed') {
        console.error('Extraction failed:', progress.error);
        clearInterval(pollInterval);
        return;
      }

      // Handle timeout message
      if (progress.error && progress.error.includes('timeout')) {
        console.warn('Request timeout, but extraction continues...');
      }

    } catch (err) {
      consecutiveFailures++;
      console.warn(`Poll failed (${consecutiveFailures}/${maxFailures}):`, err.message);

      if (consecutiveFailures >= maxFailures) {
        console.error('Too many poll failures, stopping');
        clearInterval(pollInterval);
      }
    }
  }, intervalMs);
}
```

---

### 2.5 `getCompletedExtractions(limit)` — Retrieve Extraction History

**Purpose:** Fetch previously completed extractions from the backend.

**Signature:**
```javascript
async getCompletedExtractions(limit?: number) → Promise<Object>
```

**Parameters:**
- `limit` (optional): Max records to return. Default: 50, Max: 500

**Returns:**
```javascript
{
  count: 3,
  records: [
    {
      id: "batch_20260325_224359_7d615b50::document.pdf",
      batch_id: "batch_20260325_224359_7d615b50",
      file_name: "document.pdf",
      processed_at: "2026-03-25T22:45:30",
      status: "ok" | "failed",
      error: null,              // error message if status='failed'
      total_pages: 150,
      ok_pages: 148,
      failed_pages: 2,
      pages: [
        {
          page_number: 1,
          status: "ok" | "failed",
          image_path: "/tmp/extractions/.../page_1.png",
          result: { /* AI extraction JSON for this page */ },
          error: null
        },
        // ...more pages
      ]
    },
    // ...more records
  ]
}
```

**Page result structure (inside `pages[].result`):**
The AI extraction output varies by page layout type:
```javascript
// Example: single student layout
{
  type: "single_student",
  student: {
    nom: "Dupont",
    prenom: "Jean",
    matricule: "2020-001",
    modules: [
      { name: "Math", grade: 14, credits: 3 },
      // ...
    ],
    decision: "Admis"
  }
}

// Example: multiple students on one page
{
  type: "multiple_students",
  students: [ /* array of student objects */ ]
}

// Example: results page
{
  type: "resultats_annonce",
  announcements: [ /* ... */ ]
}

// Example: unrecognized page
{
  type: "unknown",
  raw_text: "...",
  error: "Could not parse page"
}
```

**Usage example:**
```javascript
// Load extraction history
const historyResponse = await api.getCompletedExtractions(100);
console.log(`Found ${historyResponse.count} completed extractions`);

historyResponse.records.forEach(record => {
  console.log(`${record.file_name}: ${record.ok_pages}/${record.total_pages} pages`);
  
  // Access page-by-page data
  record.pages.forEach(page => {
    if (page.status === 'ok' && page.result) {
      console.log(`Page ${page.page_number}: ${page.result.type}`);
    }
  });
});
```

---

### 2.6 `saveVerifiedStudents(payload)` — Save Validated Students to Database

**Purpose:** Send verified/corrected student data to the backend for DB persistence.

**Signature:**
```javascript
async saveVerifiedStudents(payload: Object) → Promise<Object>
```

**Parameters:**
- `payload` (required): Object with structure:
  ```javascript
  {
    annee_univ: "2024-2025" | "2025-2026" | null,
    students: [
      {
        nom: "Dupont",
        prenom: "Jean",
        matricule: "2020-001" | null,  // can be null for first-year students
        is_first_year: false
      },
      // ...
    ]
  }
  ```

**Returns:**
```javascript
{
  saved_count: 2,
  failed_count: 0,
  saved_items: [
    {
      nom: "Dupont",
      prenom: "Jean",
      matricule: "2020-001"  // resolved matricule
    }
  ],
  failed_items: [
    {
      nom: "...",
      prenom: "...",
      error: "..."
    }
  ]
}
```

**Behavior & Matricule Resolution:**
- If `matricule` is provided → Use as-is
- If `matricule` is null AND not first-year → Backend tries to find existing student by nom+prenom
  - If found → Use historical matricule
  - If not found → Generate temporary `TMP-...` and record as pending case
- If `matricule` is null AND first-year → Generate `ETU-...` matricule

**Usage example:**
```javascript
// Collect verified student rows from validation table
const studentsFromTable = [
  {
    nom: "Dupont",
    prenom: "Jean",
    matricule: "2020-001",  // corrected by human
    is_first_year: false
  },
  {
    nom: "Martin",
    prenom: "Marie",
    matricule: null,  // will be resolved by backend
    is_first_year: false
  }
];

const payload = {
  annee_univ: "2025-2026",
  students: studentsFromTable
};

try {
  const result = await api.saveVerifiedStudents(payload);
  console.log(`Saved ${result.saved_count} students`);
  
  if (result.failed_count > 0) {
    console.warn('Some students failed to save:');
    result.failed_items.forEach(item => {
      console.warn(`${item.nom} ${item.prenom}: ${item.error}`);
    });
  }
} catch (err) {
  console.error('Save request failed:', err.message);
}
```

**Important notes:**
- Backend must have `ALLOW_DB_WRITES=true` environment variable set, otherwise endpoint returns 403
- This is the only endpoint that writes to the database
- Module grades and other detailed academic data are NOT currently persisted (only student identity)

---

## 3. Error Handling Pattern

All methods can throw errors. Always wrap calls in try-catch:

```javascript
try {
  const result = await api.extractPdf(file, opId);
} catch (err) {
  // err.message contains detail from backend or network error
  console.error('Operation failed:', err.message);
}
```

The client parses backend error responses and includes `detail`, `message`, or `error` fields in the thrown Error's message.

---

## 4. Quick Feature Summary

| Feature | Method | Status |
|---------|--------|--------|
| Upload single PDF | `extractPdf()` | ✅ Ready |
| Upload multiple PDFs | `extractPdfs()` | ✅ Ready |
| Check backend online | `health()` | ✅ Ready |
| Poll extraction progress | `getExtractionProgress()` | ✅ Ready |
| Get extraction history | `getCompletedExtractions()` | ✅ Ready |
| Save validated students | `saveVerifiedStudents()` | ✅ Ready |

---

## 5. Timeout & Background Processing Behavior

If an extraction takes longer than **7 minutes** (default timeout):

1. Frontend request returns with `status: "processing"` and error message
2. Backend **continues extraction in background**
3. Frontend should **keep polling** `getExtractionProgress()`
4. When background extraction finishes, next poll will return `status: "completed"` with full results

This prevents the impression of "stuck" when extractions are actually running.

---

## 6. Local Fallback for Offline Mode

The client supports localStorage fallback:

```javascript
// Digitization.js stores completed extractions locally
localStorage.setItem('completedExtractions', JSON.stringify(records));

// If backend unavailable, Validation.js reads from localStorage
const localRecords = JSON.parse(localStorage.getItem('completedExtractions') || '[]');
```

This allows viewing previously downloaded extraction history even if backend is temporarily down.
