
(function () {
  var MAX_FILE_BYTES = 100 * 1024 * 1024;
  var BACKEND_CHECK_TIMEOUT = 1800;
  var EXTRACTION_TIMEOUT_MS = 15 * 60 * 1000;
  var DOCUMENTS_STORAGE_KEY = 'digitizationDocuments';
  var COMPLETED_EXTRACTIONS_STORAGE_KEY = 'completedExtractions';
  var idCounter = 0;

  var api = new window.DigitizationApiClient();
  var backendAvailable = false;
  var listElement = document.getElementById('recentDocumentsList');
  var fileInput = document.getElementById('fileInput');
  var dropZone = document.querySelector('.drop-zone');

  var progressIntervals = {};
  function seedDocuments() {
    return [];
  }

  function normalizeDocument(raw) {
    var doc = raw || {};
    var status = doc.status || 'pending';

    return {
      id: doc.id || nextId(),
      name: doc.name || 'Unknown.pdf',
      pages: typeof doc.pages === 'number' && doc.pages > 0 ? doc.pages : 1,
      uploadedAt: doc.uploadedAt || toUploadedDate(),
      status: status,
      progress: typeof doc.progress === 'number' ? Math.max(0, Math.min(100, doc.progress)) : 0,
      error: doc.error || null,
      source: doc.source || 'upload',
      extractionSummary: doc.extractionSummary || null,
    };
  }

  function saveDocuments() {
    try {
      window.localStorage.setItem(DOCUMENTS_STORAGE_KEY, JSON.stringify(documents));
    } catch (_err) {
      // ignore storage errors
    }
  }

  function syncIdCounterFromDocuments(items) {
    items.forEach(function (doc) {
      var id = String(doc.id || '');
      var parts = id.split('_');
      var last = Number(parts[parts.length - 1]);
      if (Number.isFinite(last) && last > idCounter) {
        idCounter = last;
      }
    });
  }

  function loadDocuments() {
    try {
      var raw = window.localStorage.getItem(DOCUMENTS_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return null;
      }

      var normalized = parsed
        .map(normalizeDocument)
        .filter(function (doc) { return doc.source !== 'seed'; });
      syncIdCounterFromDocuments(normalized);
      return normalized;
    } catch (_err) {
      return null;
    }
  }

  var documents = loadDocuments() || seedDocuments();

  function buildDocumentFromCompletedRecord(record) {
    var totalPages = Number(record.total_pages || 0);
    var okPages = Number(record.ok_pages || 0);
    var failedPages = Number(record.failed_pages || 0);
    var processedPercent = totalPages > 0 ? Math.round((okPages / totalPages) * 100) : 0;
    var isCompleted = failedPages === 0 && totalPages > 0 && okPages >= totalPages;

    return {
      id: (record.id || nextId()),
      name: record.file_name || 'Unknown.pdf',
      pages: Math.max(1, totalPages || 1),
      uploadedAt: toUploadedDate(),
      status: isCompleted ? 'completed' : 'failed',
      progress: Math.max(0, Math.min(100, processedPercent)),
      error: isCompleted ? null : ('Only ' + okPages + '/' + totalPages + ' pages processed.'),
      source: 'upload',
      extractionSummary: {
        totalPages: totalPages,
        okPages: okPages,
        failedPages: failedPages,
        batchId: record.batch_id || null,
      }
    };
  }

  function mergeDocumentsFromCompletedRecords(records) {
    if (!Array.isArray(records) || !records.length) {
      return;
    }

    var changed = false;
    var indexByName = {};
    documents.forEach(function (doc, idx) {
      indexByName[String(doc.name || '').toLowerCase()] = idx;
    });

    records.forEach(function (record) {
      var fileName = String(record && record.file_name ? record.file_name : '').toLowerCase();
      if (!fileName) {
        return;
      }

      var nextDoc = buildDocumentFromCompletedRecord(record);
      var existingIndex = indexByName[fileName];

      if (typeof existingIndex === 'number') {
        documents[existingIndex] = Object.assign({}, documents[existingIndex], nextDoc, {
          id: documents[existingIndex].id || nextDoc.id,
          name: documents[existingIndex].name || nextDoc.name,
        });
        changed = true;
      } else {
        documents.unshift(nextDoc);
        indexByName[fileName] = 0;
        changed = true;
      }
    });

    if (changed) {
      renderDocuments();
    }
  }

  function nextId() {
    idCounter += 1;
    return 'doc_' + Date.now() + '_' + idCounter;
  }

  function showToast(message, tone) {
    var toast = document.createElement('div');
    toast.className = 'dig-toast ' + (tone || 'info');
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(function () {
      toast.classList.add('visible');
    });

    setTimeout(function () {
      toast.classList.remove('visible');
      setTimeout(function () {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 220);
    }, 2400);
  }

  function safePagesCount(fileOrResult) {
    if (!fileOrResult) {
      return 1;
    }

    if (typeof fileOrResult.pages === 'number' && fileOrResult.pages > 0) {
      return fileOrResult.pages;
    }

    if (fileOrResult.extraction && typeof fileOrResult.extraction.total_pages === 'number') {
      return Math.max(1, fileOrResult.extraction.total_pages);
    }

    return 1;
  }

  function fileMetaText(doc) {
    return doc.pages + ' pages • Uploaded on ' + doc.uploadedAt;
  }

  function docIconSvg(doc) {
    var failed = doc.status === 'failed';

    if (failed) {
      return '<svg fill="none" stroke="#5a7898" stroke-width="1.6" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="16"/><circle cx="12" cy="18.5" r="0.5" fill="#5a7898"/></svg>';
    }

    return '<svg fill="none" stroke="#5a7898" stroke-width="1.6" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
  }

  function statusClass(status) {
    if (status === 'completed') return 'status-completed';
    if (status === 'processing') return 'status-processing';
    if (status === 'pending') return 'status-pending';
    return 'status-failed';
  }

  function statusLabel(status) {
    if (status === 'completed') return 'Completed';
    if (status === 'processing') return 'Processing';
    if (status === 'pending') return 'Pending';
    return 'Failed';
  }

  function progressSection(doc) {
    if (doc.status !== 'processing' && doc.status !== 'pending') {
      return '';
    }

    var label = doc.status === 'processing' ? 'Processing...' : 'Waiting...';
    var pulse = doc.status === 'processing' ? 'pulsing' : '';

    return [
      '<div class="progress-section">',
      '<div class="progress-labels"><span class="' + pulse + '">' + label + '</span><span>' + doc.progress + '%</span></div>',
      '<div class="progress-track"><div class="progress-fill" style="width:' + doc.progress + '%"></div></div>',
      '</div>'
    ].join('');
  }

  function actionButtons(doc) {
    if (doc.status === 'completed') {
      return [
        '<button class="doc-btn doc-btn-primary" data-action="view-results" data-id="' + doc.id + '">View Results</button>',
        '<button class="doc-btn doc-btn-outline" data-action="reprocess" data-id="' + doc.id + '">Re-process</button>'
      ].join('');
    }

    if (doc.status === 'processing') {
      return '<button class="doc-btn doc-btn-outline" data-action="view-progress" data-id="' + doc.id + '">View Progress</button>';
    }

    if (doc.status === 'pending') {
      return '<button class="doc-btn doc-btn-outline" data-action="start" data-id="' + doc.id + '">Start Extraction</button>';
    }

    return [
      '<button class="doc-btn doc-btn-danger" data-action="view-error" data-id="' + doc.id + '">View Error</button>',
      '<button class="doc-btn doc-btn-primary" data-action="retry" data-id="' + doc.id + '">Retry</button>'
    ].join('');
  }

  function docRowHtml(doc) {
    return [
      '<div class="doc-row" data-doc-id="' + doc.id + '">',
      '<div class="doc-main-row">',
      '<div class="doc-info">',
      '<div class="doc-icon">' + docIconSvg(doc) + '</div>',
      '<div><div class="doc-name">' + escapeHtml(doc.name) + '</div><div class="doc-meta">' + fileMetaText(doc) + '</div></div>',
      '</div>',
      '<div class="doc-status ' + statusClass(doc.status) + '">' + statusLabel(doc.status) + '</div>',
      '</div>',
      progressSection(doc),
      '<div class="doc-actions">' + actionButtons(doc) + '</div>',
      '</div>'
    ].join('');
  }

  function escapeHtml(text) {
    return String(text || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderDocuments() {
    if (!listElement) {
      return;
    }

    if (!documents.length) {
      listElement.innerHTML = '<div class="doc-row"><div class="doc-empty">No documents yet. Upload a PDF to start extraction.</div></div>';
      return;
    }

    listElement.innerHTML = documents.map(docRowHtml).join('');
    saveDocuments();
  }

  function setDocumentState(docId, patch) {
    var doc = documents.find(function (item) { return item.id === docId; });
    if (!doc) {
      return;
    }

    Object.assign(doc, patch || {});
    renderDocuments();
  }

  function setUploadItemsFailed(uploadItems, reason) {
    uploadItems.forEach(function (uploadItem) {
      stopProgress(uploadItem.doc.id);
      setDocumentState(uploadItem.doc.id, {
        status: 'failed',
        progress: 0,
        error: reason || 'Extraction failed.',
      });
    });
  }

  function withTimeout(promise, timeoutMs, timeoutMessage) {
    var timeoutId = null;

    var timeoutPromise = new Promise(function (_resolve, reject) {
      timeoutId = setTimeout(function () {
        reject(new Error(timeoutMessage || 'Operation timed out.'));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(function () {
      clearTimeout(timeoutId);
    });
  }

  function stopProgress(docId) {
    if (progressIntervals[docId]) {
      clearInterval(progressIntervals[docId]);
      delete progressIntervals[docId];
    }
  }

  function startProgressLoop(docId, operationId) {
    stopProgress(docId);

    if (!operationId || !backendAvailable) {
      return;
    }

    var inFlight = false;

    progressIntervals[docId] = setInterval(function () {
      if (inFlight) {
        return;
      }

      var doc = documents.find(function (item) { return item.id === docId; });
      if (!doc) {
        stopProgress(docId);
        return;
      }

      if (doc.status !== 'processing') {
        stopProgress(docId);
        return;
      }

      inFlight = true;
      api.getExtractionProgress(operationId)
        .then(function (progress) {
          if (!progress) {
            return;
          }

          var totalPages = Number(progress.total_pages || 0);
          var processedPages = Number(progress.processed_pages || 0);
          var failedPages = Number(progress.failed_pages || 0);
          var processedPercentage = Number(progress.processed_percentage || 0);
          var nextProgress = Math.max(0, Math.min(100, Math.round(processedPercentage)));

          var patch = {
            pages: Math.max(1, totalPages || doc.pages || 1),
            progress: nextProgress,
            extractionSummary: Object.assign({}, doc.extractionSummary || {}, {
              totalPages: totalPages,
              okPages: processedPages,
              failedPages: failedPages,
            }),
          };

          if (progress.status === 'failed') {
            patch.status = 'failed';
            patch.error = progress.error || 'Extraction failed.';
            stopProgress(docId);
          } else if (progress.status === 'completed') {
            patch.status = failedPages > 0 ? 'failed' : 'completed';
            patch.error = failedPages > 0
              ? ('Only ' + processedPages + '/' + totalPages + ' pages processed. Please review failed pages in Validation.')
              : null;
            patch.progress = 100;
            stopProgress(docId);
          }

          setDocumentState(docId, patch);
        })
        .catch(function () {
          // ignore transient polling failures
        })
        .finally(function () {
          inFlight = false;
        });
    }, 900);
  }

  function toUploadedDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function validateFiles(fileList) {
    return Array.from(fileList || []).filter(function (file) {
      var lower = String(file.name || '').toLowerCase();
      var isPdf = file.type === 'application/pdf' || lower.endsWith('.pdf');

      if (!isPdf) {
        showToast('Only PDF files are allowed.', 'error');
        return false;
      }

      if (file.size > MAX_FILE_BYTES) {
        showToast(file.name + ' is too large (max 100MB).', 'error');
        return false;
      }

      return true;
    });
  }

  function addUploadingDocuments(files) {
    var created = files.map(function (file) {
      var doc = {
        id: nextId(),
        name: file.name,
        pages: 1,
        uploadedAt: toUploadedDate(),
        status: 'processing',
        progress: 5,
        error: null,
        source: 'upload',
      };

      return { doc: doc, file: file };
    });

    documents = created.map(function (item) { return item.doc; }).concat(documents);
    renderDocuments();

    return created;
  }

  async function uploadWithBackend(uploadItems) {
    var responses = await Promise.all(uploadItems.map(async function (uploadItem) {
      var operationId = 'op_' + uploadItem.doc.id + '_' + Date.now();
      startProgressLoop(uploadItem.doc.id, operationId);

      var response = await withTimeout(
        api.extractPdf(uploadItem.file, operationId),
        EXTRACTION_TIMEOUT_MS,
        'Extraction is taking too long. Please retry this file.'
      );

      var results = Array.isArray(response.results) ? response.results : [];
      var result = results[0] || null;

      if (!result) {
        setDocumentState(uploadItem.doc.id, {
          status: 'failed',
          progress: 0,
          error: 'No extraction result for this file.',
        });
        return { response: response, uploadItem: uploadItem, result: null };
      }

      if (result.status === 'ok') {
        stopProgress(uploadItem.doc.id);
        var extraction = result.extraction || {};
        var progress = result.processing_progress || {};
        var totalPages = Number(extraction.total_pages || progress.total_pages || 0);
        var processedPages = Number(progress.processed_pages || extraction.ok_pages || 0);
        var failedPages = Number(progress.failed_pages || extraction.failed_pages || 0);
        var processedPercentage = Number(progress.processed_percentage);
        if (!Number.isFinite(processedPercentage)) {
          processedPercentage = totalPages > 0 ? (processedPages / totalPages) * 100 : 0;
        }
        processedPercentage = Math.max(0, Math.min(100, Math.round(processedPercentage)));

        var isFullyCompleted = (failedPages === 0) && (totalPages > 0) && (processedPages >= totalPages);
        var status = isFullyCompleted ? 'completed' : 'failed';
        var errorMessage = isFullyCompleted
          ? null
          : ('Only ' + processedPages + '/' + totalPages + ' pages processed. Please review failed pages in Validation.');

        setDocumentState(uploadItem.doc.id, {
          pages: Math.max(1, totalPages || safePagesCount({ extraction: extraction })),
          progress: Math.max(processedPercentage, isFullyCompleted ? 100 : processedPercentage),
          status: status,
          error: errorMessage,
          extractionSummary: {
            totalPages: totalPages,
            okPages: processedPages,
            failedPages: failedPages,
            batchId: response.batch_id || null,
          }
        });
      } else if (result.status === 'processing') {
        setDocumentState(uploadItem.doc.id, {
          status: 'processing',
          error: result.error || 'Extraction is still running in background.',
        });
      } else {
        stopProgress(uploadItem.doc.id);
        setDocumentState(uploadItem.doc.id, {
          status: 'failed',
          progress: 0,
          error: result.error || 'Extraction failed.',
        });
      }

      return { response: response, uploadItem: uploadItem, result: result };
    }));

    responses.forEach(function (item) {
      if (!item || !item.response) {
        return;
      }
      persistCompletedExtractions(item.response, [item.uploadItem], [item.result]);
    });
  }

  function persistCompletedExtractions(response, uploadItems, results) {
    var batchId = response && response.batch_id ? response.batch_id : null;

    try {
      var existingRaw = window.localStorage.getItem(COMPLETED_EXTRACTIONS_STORAGE_KEY);
      var existing = existingRaw ? JSON.parse(existingRaw) : [];
      if (!Array.isArray(existing)) {
        existing = [];
      }

      var additions = [];

      uploadItems.forEach(function (uploadItem, index) {
        var result = results[index] || null;
        if (!result || !result.extraction) {
          return;
        }

        var extraction = result.extraction || {};
        var fileName = uploadItem.file && uploadItem.file.name ? uploadItem.file.name : uploadItem.doc.name;
        additions.push({
          id: (batchId || 'batch_local') + '::' + fileName,
          batch_id: batchId,
          file_name: fileName,
          processed_at: new Date().toISOString(),
          status: result.status || 'ok',
          total_pages: Number(extraction.total_pages || 0),
          ok_pages: Number(extraction.ok_pages || 0),
          failed_pages: Number(extraction.failed_pages || 0),
          pages: Array.isArray(extraction.pages) ? extraction.pages : [],
        });
      });

      if (!additions.length) {
        return;
      }

      var merged = additions.concat(existing).slice(0, 200);
      window.localStorage.setItem(COMPLETED_EXTRACTIONS_STORAGE_KEY, JSON.stringify(merged));
    } catch (_err) {
      // ignore storage errors
    }
  }

  async function hydrateCompletedExtractionsIntoDocuments() {
    var records = [];

    if (backendAvailable) {
      try {
        var response = await api.getCompletedExtractions(100);
        records = Array.isArray(response.records) ? response.records : [];
      } catch (_err) {
        records = [];
      }
    }

    if (!records.length) {
      try {
        var raw = window.localStorage.getItem(COMPLETED_EXTRACTIONS_STORAGE_KEY);
        var localRecords = raw ? JSON.parse(raw) : [];
        records = Array.isArray(localRecords) ? localRecords : [];
      } catch (_err) {
        records = [];
      }
    }

    mergeDocumentsFromCompletedRecords(records);
  }

  async function processSelectedFiles(files) {
    var validFiles = validateFiles(files);
    if (!validFiles.length) {
      return;
    }

    var uploadItems = addUploadingDocuments(validFiles);
    showToast(validFiles.length + ' file(s) added to recent documents.', 'success');

    if (!backendAvailable) {
      await checkBackendAvailability();
    }

    if (!backendAvailable) {
      setUploadItemsFailed(uploadItems, 'Backend is not reachable. Start uvicorn and try again.');
      showToast('Backend is not reachable. Start uvicorn and retry.', 'error');
      return;
    }

    try {
      await uploadWithBackend(uploadItems);
      var stillProcessing = uploadItems.some(function (item) {
        var doc = documents.find(function (candidate) { return candidate.id === item.doc.id; });
        return doc && doc.status === 'processing';
      });

      if (stillProcessing) {
        showToast('Upload accepted. Extraction is still running in background.', 'info');
      } else {
        showToast('Extraction finished for uploaded file(s).', 'success');
      }
    } catch (err) {
      setUploadItemsFailed(uploadItems, (err && err.message) || 'Upload failed.');
      showToast((err && err.message) || 'Upload failed.', 'error');
    }
  }

  async function checkBackendAvailability() {
    try {
      await Promise.race([
        api.health(),
        new Promise(function (_, reject) {
          setTimeout(function () {
            reject(new Error('timeout'));
          }, BACKEND_CHECK_TIMEOUT);
        })
      ]);

      backendAvailable = true;
      showToast('Backend connected.', 'success');
    } catch (_err) {
      backendAvailable = false;
      showToast('Backend not reachable. Demo mode enabled.', 'info');
    }

    await hydrateCompletedExtractionsIntoDocuments();
  }

  function onActionClick(event) {
    var target = event.target.closest('button[data-action][data-id]');
    if (!target) {
      return;
    }

    var docId = target.getAttribute('data-id');
    var action = target.getAttribute('data-action');
    var doc = documents.find(function (item) { return item.id === docId; });
    if (!doc) {
      return;
    }

    if (action === 'view-results') {
      var summary = doc.extractionSummary || {};
      alert(
        'File: ' + doc.name + '\n' +
        'Status: Completed\n' +
        'Pages: ' + (summary.totalPages || doc.pages) + '\n' +
        'Processed: ' + (summary.okPages || doc.pages) + '\n' +
        'Failed pages: ' + (summary.failedPages || 0)
      );
      return;
    }

    if (action === 'view-progress') {
      alert(doc.name + '\nExtraction progress: ' + doc.progress + '%');
      return;
    }

    if (action === 'view-error') {
      alert(doc.name + '\nError: ' + (doc.error || 'Unknown error'));
      return;
    }

    if (action === 'reprocess' || action === 'retry' || action === 'start') {
      showToast('Re-process requires re-uploading the PDF file.', 'info');
      if (fileInput) {
        fileInput.click();
      }
    }
  }

  function setDate() {
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var now = new Date();
    var element = document.getElementById('headerDate');

    if (element) {
      element.textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();
    }
  }

  function setupSidebar() {
    var collapseBtn = document.getElementById('collapseBtn');
    var sidebar = document.getElementById('sidebar');
    var logo = document.querySelector('.sidebar-logo .esi svg');

    if (collapseBtn && sidebar) {
      collapseBtn.addEventListener('click', function () {
        sidebar.classList.toggle('collapsed');
      });
    }

    if (logo && sidebar) {
      logo.addEventListener('click', function () {
        if (sidebar.classList.contains('collapsed')) {
          sidebar.classList.remove('collapsed');
        }
      });
    }
  }

  function setActive(el) {
    document.querySelectorAll('.nav-item').forEach(function (navItem) {
      navItem.classList.remove('active');
      var svg = navItem.querySelector('svg');

      if (svg) {
        if (svg.getAttribute('fill') && svg.getAttribute('fill') !== 'none') {
          svg.setAttribute('fill', '#266FA3');
        }

        svg.setAttribute('stroke', svg.getAttribute('stroke') !== 'none' ? '#266FA3' : 'none');
        svg.querySelectorAll('path, circle, ellipse, line, polyline, rect, polygon').forEach(function (child) {
          if (child.getAttribute('stroke') && child.getAttribute('stroke') !== 'none') {
            child.setAttribute('stroke', '#266FA3');
          }
          if (child.getAttribute('fill') && child.getAttribute('fill') !== 'none') {
            child.setAttribute('fill', '#266FA3');
          }
        });
      }
    });

    el.classList.add('active');
    var activeSvg = el.querySelector('svg');

    if (activeSvg) {
      if (activeSvg.getAttribute('fill') && activeSvg.getAttribute('fill') !== 'none') {
        activeSvg.setAttribute('fill', 'white');
      }

      if (activeSvg.getAttribute('stroke') && activeSvg.getAttribute('stroke') !== 'none') {
        activeSvg.setAttribute('stroke', 'white');
      }

      activeSvg.querySelectorAll('path, circle, ellipse, line, polyline, rect, polygon').forEach(function (child) {
        if (child.getAttribute('stroke') && child.getAttribute('stroke') !== 'none') {
          child.setAttribute('stroke', 'white');
        }
        if (child.getAttribute('fill') && child.getAttribute('fill') !== 'none') {
          child.setAttribute('fill', 'white');
        }
      });
    }
  }

  window.setActive = setActive;

  function setupUploadHandlers() {
    if (fileInput) {
      fileInput.addEventListener('change', function (event) {
        processSelectedFiles(event.target.files);
        fileInput.value = '';
      });
    }

    if (dropZone) {
      dropZone.addEventListener('drop', function (event) {
        event.preventDefault();
        dropZone.classList.remove('drag-over');
        processSelectedFiles(event.dataTransfer.files);
      });
    }
  }

  function setupActions() {
    if (!listElement) {
      return;
    }

    listElement.addEventListener('click', onActionClick);
  }

  setDate();
  setupSidebar();

  var activeItem = document.querySelector('.nav-item.active');
  if (activeItem) {
    setActive(activeItem);
  }

  renderDocuments();
  setupUploadHandlers();
  setupActions();

  documents
    .filter(function (doc) { return doc.status === 'processing'; })
    .forEach(function (doc) {
      startProgressLoop(doc.id);
    });

  checkBackendAvailability();
})();
