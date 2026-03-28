
(function () {
  var MAX_FILE_BYTES = 100 * 1024 * 1024;
  var BACKEND_CHECK_TIMEOUT = 1800;
  var EXTRACTION_TIMEOUT_MS = 20 * 60 * 1000;
  var STALE_PROCESSING_HOURS = 12;
  var DOCUMENTS_STORAGE_KEY = 'digitizationDocuments';
  var COMPLETED_EXTRACTIONS_STORAGE_KEY = 'completedExtractions';
  var VALIDATION_SELECTION_STORAGE_KEY = 'validationSelection';
  var idCounter = 0;

  var api = new window.DigitizationApiClient();
  var backendAvailable = false;
  var listElement = document.getElementById('recentDocumentsList');
  var fileInput = document.getElementById('fileInput');
  var dropZone = document.querySelector('.drop-zone');

  var progressIntervals = {};
  var recoveryIntervalId = null;
  function seedDocuments() {
    return [];
  }

  function normalizeStatusValue(rawStatus) {
    var value = String(rawStatus || '').trim().toLowerCase();

    if (!value) return 'pending';
    if (value === 'completed' || value === 'complete' || value === 'done' || value === 'success' || value === 'ok') return 'completed';
    if (value === 'processing' || value === 'running' || value === 'in_progress' || value === 'in-progress') return 'processing';
    if (value === 'pending' || value === 'queued' || value === 'waiting') return 'pending';
    if (value === 'cancelled' || value === 'canceled') return 'cancelled';
    if (value === 'failed' || value === 'error') return 'failed';

    return 'pending';
  }

  function getEffectiveStatus(doc) {
    var normalized = normalizeStatusValue(doc && doc.status);
    var summary = doc && doc.extractionSummary;

    if (normalized === 'failed' && summary) {
      var totalPages = Number(summary.totalPages || 0);
      var okPages = Number(summary.okPages || 0);
      var failedPages = Number(summary.failedPages || 0);
      if (totalPages > 0 && failedPages === 0 && okPages >= totalPages) {
        return 'completed';
      }
    }

    return normalized;
  }

  function normalizeDocument(raw) {
    var doc = raw || {};
    var status = normalizeStatusValue(doc.status);

    return {
      id: doc.id || nextId(),
      name: doc.name || 'Unknown.pdf',
      pages: typeof doc.pages === 'number' && doc.pages > 0 ? doc.pages : 1,
      uploadedAt: doc.uploadedAt || toUploadedDate(),
      status: status,
      progress: typeof doc.progress === 'number' ? Math.max(0, Math.min(100, doc.progress)) : 0,
      error: doc.error || null,
      source: doc.source || 'upload',
      operationId: doc.operationId || null,
      extractionSummary: doc.extractionSummary || null,
    };
  }

  function getCompletionPercent(totalPages, okPages, failedPages) {
    var total = Number(totalPages || 0);
    var ok = Number(okPages || 0);
    var failed = Number(failedPages || 0);
    var completed = ok + failed;
    if (total <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
  }

  function parseUploadedAtMs(uploadedAt) {
    if (!uploadedAt) {
      return null;
    }

    var raw = String(uploadedAt).trim();
    if (!raw) {
      return null;
    }

    // Legacy records may only store YYYY-MM-DD; assume end-of-day to avoid false stale marks.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      raw = raw + 'T23:59:59';
    }

    var parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.getTime();
  }

  function formatUploadedDate(uploadedAt) {
    var ts = parseUploadedAtMs(uploadedAt);
    if (ts === null) {
      return String(uploadedAt || 'unknown');
    }

    var parsed = new Date(ts);
    var yyyy = String(parsed.getFullYear());
    var mm = String(parsed.getMonth() + 1).padStart(2, '0');
    var dd = String(parsed.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  function isStaleUploadDate(uploadedAt) {
    var uploadedAtMs = parseUploadedAtMs(uploadedAt);
    if (uploadedAtMs === null) {
      return false;
    }

    var ageMs = Date.now() - uploadedAtMs;
    return ageMs > (STALE_PROCESSING_HOURS * 60 * 60 * 1000);
  }

  function expireStaleProcessingDocuments() {
    var changed = false;

    documents.forEach(function (doc) {
      if (!doc) {
        return;
      }

      if (getEffectiveStatus(doc) !== 'processing') {
        return;
      }

      if (!isStaleUploadDate(doc.uploadedAt)) {
        return;
      }

      doc.status = 'failed';
      doc.operationId = null;
      doc.error = doc.error || 'This extraction became stale and was marked as failed. Re-process to run it again.';
      changed = true;
    });

    if (changed) {
      renderDocuments();
    }
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
  expireStaleProcessingDocuments();

  function buildDocumentFromCompletedRecord(record) {
    var totalPages = Number(record.total_pages || 0);
    var okPages = Number(record.ok_pages || 0);
    var failedPages = Number(record.failed_pages || 0);
    var processedPercent = getCompletionPercent(totalPages, okPages, failedPages);
    var isCompleted = failedPages === 0 && totalPages > 0 && okPages >= totalPages;
    var explicitError = String(record && record.error || '').trim();

    return {
      id: (record.id || nextId()),
      name: record.file_name || 'Unknown.pdf',
      pages: Math.max(1, totalPages || 1),
      uploadedAt: toUploadedDate(),
      status: isCompleted ? 'completed' : 'failed',
      progress: Math.max(0, Math.min(100, processedPercent)),
      error: isCompleted ? null : (explicitError || ('Only ' + okPages + '/' + totalPages + ' pages processed.')),
      source: 'upload',
      operationId: null,
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
    var indexByRecordId = {};
    documents.forEach(function (doc, idx) {
      indexByName[String(doc.name || '').toLowerCase()] = idx;
      var id = String(doc.id || '').trim();
      if (id && id.indexOf('::') !== -1) {
        indexByRecordId[id] = idx;
      }
    });

    records.forEach(function (record) {
      var recordId = String(record && record.id ? record.id : '').trim();
      var fileName = String(record && record.file_name ? record.file_name : '').toLowerCase();
      if (!fileName) {
        return;
      }

      var nextDoc = buildDocumentFromCompletedRecord(record);
      var existingIndex = (recordId && typeof indexByRecordId[recordId] === 'number')
        ? indexByRecordId[recordId]
        : indexByName[fileName];

      if (typeof existingIndex === 'number') {
        documents[existingIndex] = Object.assign({}, documents[existingIndex], nextDoc, {
          id: nextDoc.id || documents[existingIndex].id,
          name: documents[existingIndex].name || nextDoc.name,
          operationId: null,
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
    return doc.pages + ' pages • Uploaded on ' + formatUploadedDate(doc.uploadedAt);
  }

  function docIconSvg(doc) {
    var failed = getEffectiveStatus(doc) === 'failed';

    if (failed) {
      return '<svg fill="none" stroke="#5a7898" stroke-width="1.6" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="16"/><circle cx="12" cy="18.5" r="0.5" fill="#5a7898"/></svg>';
    }

    return '<svg fill="none" stroke="#5a7898" stroke-width="1.6" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
  }

  function statusClass(status) {
    status = normalizeStatusValue(status);
    if (status === 'completed') return 'status-completed';
    if (status === 'processing') return 'status-processing';
    if (status === 'pending') return 'status-pending';
    if (status === 'cancelled') return 'status-failed';
    return 'status-failed';
  }

  function statusLabel(status) {
    status = normalizeStatusValue(status);
    if (status === 'completed') return 'Completed';
    if (status === 'processing') return 'Processing';
    if (status === 'pending') return 'Pending';
    if (status === 'cancelled') return 'Cancelled';
    return 'Failed';
  }

  function progressSection(doc) {
    var status = getEffectiveStatus(doc);
    if (status !== 'processing' && status !== 'pending') {
      return '';
    }

    var label = status === 'processing' ? 'Processing...' : 'Waiting...';
    var pulse = status === 'processing' ? 'pulsing' : '';

    return [
      '<div class="progress-section">',
      '<div class="progress-labels"><span class="' + pulse + '">' + label + '</span><span>' + doc.progress + '%</span></div>',
      '<div class="progress-track"><div class="progress-fill" style="width:' + doc.progress + '%"></div></div>',
      '</div>'
    ].join('');
  }

  function actionButtons(doc) {
    var status = getEffectiveStatus(doc);

    if (status === 'completed') {
      return [
        '<button class="doc-btn doc-btn-primary" data-action="show-results" data-id="' + doc.id + '">Show Results</button>',
        '<button class="doc-btn doc-btn-outline" data-action="reprocess" data-id="' + doc.id + '">Re-process</button>'
      ].join('');
    }

    if (status === 'processing') {
      return [
        '<button class="doc-btn doc-btn-outline" data-action="view-progress" data-id="' + doc.id + '">View Progress</button>',
        '<button class="doc-btn doc-btn-danger" data-action="cancel" data-id="' + doc.id + '">Cancel</button>'
      ].join('');
    }

    if (status === 'pending') {
      return '<button class="doc-btn doc-btn-outline" data-action="start" data-id="' + doc.id + '">Start Extraction</button>';
    }

    return [
      '<button class="doc-btn doc-btn-danger" data-action="view-error" data-id="' + doc.id + '">View Error</button>',
      '<button class="doc-btn doc-btn-primary" data-action="retry" data-id="' + doc.id + '">Retry</button>'
    ].join('');
  }

  function docRowHtml(doc) {
    var displayStatus = getEffectiveStatus(doc);

    return [
      '<div class="doc-row" data-doc-id="' + doc.id + '">',
      '<div class="doc-main-row">',
      '<div class="doc-info">',
      '<div class="doc-icon">' + docIconSvg(doc) + '</div>',
      '<div><div class="doc-name">' + escapeHtml(doc.name) + '</div><div class="doc-meta">' + fileMetaText(doc) + '</div></div>',
      '</div>',
      '<div class="doc-status ' + statusClass(displayStatus) + '">' + statusLabel(displayStatus) + '</div>',
      '</div>',
      progressSection(doc),
      (doc.error ? ('<div class="doc-meta" style="margin:6px 0 8px;color:#B42318;">' + escapeHtml(doc.error) + '</div>') : ''),
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

  function resolveRecordIdForDocument(doc) {
    var rawId = String(doc && doc.id || '').trim();
    if (rawId && rawId.indexOf('::') !== -1) {
      return rawId;
    }

    var batchId = String(doc && doc.extractionSummary && doc.extractionSummary.batchId || '').trim();
    var fileName = String(doc && doc.name || '').trim();
    if (batchId && fileName) {
      return batchId + '::' + fileName;
    }

    try {
      var raw = window.localStorage.getItem(COMPLETED_EXTRACTIONS_STORAGE_KEY);
      var records = raw ? JSON.parse(raw) : [];
      var normalizedName = fileName.toLowerCase();
      if (Array.isArray(records) && normalizedName) {
        var matched = records.find(function (record) {
          return String(record && record.file_name || '').trim().toLowerCase() === normalizedName;
        });

        if (matched) {
          var recordId = String(matched.id || '').trim();
          if (recordId) {
            return recordId;
          }

          var matchedBatchId = String(matched.batch_id || '').trim();
          if (matchedBatchId) {
            return matchedBatchId + '::' + fileName;
          }
        }
      }
    } catch (_err) {
      // ignore local storage parse errors
    }

    return rawId;
  }

  function readCompletedExtractionsFromStorage() {
    try {
      var raw = window.localStorage.getItem(COMPLETED_EXTRACTIONS_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
      return [];
    }
  }

  function writeCompletedExtractionsToStorage(records) {
    try {
      window.localStorage.setItem(
        COMPLETED_EXTRACTIONS_STORAGE_KEY,
        JSON.stringify(Array.isArray(records) ? records : [])
      );
    } catch (_err) {
      // ignore storage errors
    }
  }

  function findCompletedRecordForDocument(doc, records) {
    var list = Array.isArray(records) ? records : [];
    var fileName = String(doc && doc.name || '').trim().toLowerCase();
    var directId = String(doc && doc.id || '').trim();
    var resolvedId = String(resolveRecordIdForDocument(doc) || '').trim();
    var batchId = String(doc && doc.extractionSummary && doc.extractionSummary.batchId || '').trim();

    return list.find(function (record) {
      var recordId = String(record && record.id || '').trim();
      var recordFileName = String(record && record.file_name || '').trim().toLowerCase();
      var recordBatchId = String(record && record.batch_id || '').trim();

      if (resolvedId && recordId === resolvedId) {
        return true;
      }
      if (directId && recordId === directId) {
        return true;
      }
      if (fileName && recordFileName && fileName === recordFileName) {
        return true;
      }
      if (batchId && fileName && recordBatchId === batchId && recordFileName === fileName) {
        return true;
      }
      return false;
    }) || null;
  }

  function cacheValidationSelection(doc) {
    if (!doc) {
      return;
    }

    var records = readCompletedExtractionsFromStorage();
    var matched = findCompletedRecordForDocument(doc, records);

    var payload = {
      recordId: String(resolveRecordIdForDocument(doc) || '').trim(),
      fileName: String(doc && doc.name || '').trim(),
      batchId: String(doc && doc.extractionSummary && doc.extractionSummary.batchId || '').trim(),
      selectedAt: new Date().toISOString(),
      record: matched || null,
    };

    try {
      window.sessionStorage.setItem(VALIDATION_SELECTION_STORAGE_KEY, JSON.stringify(payload));
    } catch (_err) {
      // ignore storage errors
    }
  }

  function cacheValidationSelectionFromLegacyRow(row) {
    var rowNameEl = row ? row.querySelector('.doc-name') : null;
    var fileName = String(rowNameEl && rowNameEl.textContent || '').trim();
    if (!fileName) {
      return;
    }

    try {
      window.sessionStorage.setItem(VALIDATION_SELECTION_STORAGE_KEY, JSON.stringify({
        recordId: '',
        fileName: fileName,
        batchId: '',
        selectedAt: new Date().toISOString(),
        record: null,
      }));
    } catch (_err) {
      // ignore storage errors
    }
  }

  function buildValidationUrl(doc) {
    var validationUrl = buildValidationBaseUrl();
    var recordId = resolveRecordIdForDocument(doc);
    var fileName = String(doc && doc.name || '').trim();

    if (recordId) {
      validationUrl.searchParams.set('record_id', recordId);
    }

    if (fileName) {
      validationUrl.searchParams.set('file_name', fileName);
    }

    return validationUrl.toString();
  }

  function buildValidationUrlFromLegacyRow(row) {
    var validationUrl = buildValidationBaseUrl();
    var rowNameEl = row ? row.querySelector('.doc-name') : null;
    var fileName = String(rowNameEl && rowNameEl.textContent || '').trim();

    if (fileName) {
      validationUrl.searchParams.set('file_name', fileName);
    }

    return validationUrl.toString();
  }

  function buildValidationBaseUrl() {
    var current = new URL(window.location.href);
    if (/\/Digitization\.html$/i.test(current.pathname)) {
      current.pathname = current.pathname.replace(/Digitization\.html$/i, 'Validation.html');
    } else {
      current.pathname = '/Html/Validation.html';
    }
    current.search = '';
    current.hash = '';
    return current;
  }

  function inferActionFromButton(button) {
    var action = String(button && button.getAttribute('data-action') || '').trim().toLowerCase();
    if (action) {
      return action;
    }

    var label = String(button && button.textContent || '').trim().toLowerCase();
    if (label.indexOf('show results') !== -1) return 'show-results';
    if (label.indexOf('view results') !== -1) return 'view-results';
    if (label.indexOf('view progress') !== -1) return 'view-progress';
    if (label.indexOf('view error') !== -1) return 'view-error';
    if (label.indexOf('re-process') !== -1 || label.indexOf('reprocess') !== -1) return 'reprocess';
    if (label.indexOf('retry') !== -1) return 'retry';
    if (label.indexOf('cancel') !== -1) return 'cancel';
    if (label.indexOf('start') !== -1) return 'start';

    return '';
  }

  function resolveDocumentFromActionButton(button) {
    var directId = String(button && button.getAttribute('data-id') || '').trim();
    if (directId) {
      var byId = documents.find(function (item) { return String(item.id) === directId; });
      if (byId) {
        return byId;
      }
    }

    var row = button && button.closest('.doc-row');
    if (!row) {
      return null;
    }

    var rowDocId = String(row.getAttribute('data-doc-id') || '').trim();
    if (rowDocId) {
      var rowDoc = documents.find(function (item) { return String(item.id) === rowDocId; });
      if (rowDoc) {
        return rowDoc;
      }
    }

    var nameEl = row.querySelector('.doc-name');
    var name = String(nameEl && nameEl.textContent || '').trim().toLowerCase();
    if (!name) {
      return null;
    }

    return documents.find(function (item) {
      return String(item && item.name || '').trim().toLowerCase() === name;
    }) || null;
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
    var pollingFailures = 0;
    var timeoutNoticeShown = false;
    var pollingWarningShown = false;

    progressIntervals[docId] = setInterval(function () {
      if (inFlight) {
        return;
      }

      var doc = documents.find(function (item) { return item.id === docId; });
      if (!doc) {
        stopProgress(docId);
        return;
      }

      if (getEffectiveStatus(doc) !== 'processing') {
        stopProgress(docId);
        return;
      }

      inFlight = true;
      api.getExtractionProgress(operationId)
        .then(function (progress) {
          pollingFailures = 0;
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
            error: (progress.status === 'processing' && progress.error) ? progress.error : null,
            operationId: operationId,
            extractionSummary: Object.assign({}, doc.extractionSummary || {}, {
              totalPages: totalPages,
              okPages: processedPages,
              failedPages: failedPages,
            }),
          };

          if (progress.status === 'processing' && progress.error && !timeoutNoticeShown) {
            showToast(progress.error, 'info');
            timeoutNoticeShown = true;
          }

          if (progress.status === 'failed') {
            patch.status = 'failed';
            patch.error = progress.error || 'Extraction failed.';
            patch.operationId = null;
            stopProgress(docId);
          } else if (progress.status === 'cancelled' || progress.status === 'canceled') {
            patch.status = 'cancelled';
            patch.error = progress.error || 'Extraction cancelled by user.';
            patch.operationId = null;
            stopProgress(docId);
          } else if (progress.status === 'completed') {
            patch.status = failedPages > 0 ? 'failed' : 'completed';
            patch.error = failedPages > 0
              ? ('Only ' + processedPages + '/' + totalPages + ' pages processed. Please review failed pages in Validation.')
              : null;
            patch.progress = 100;
            patch.operationId = null;
            stopProgress(docId);
          }

          setDocumentState(docId, patch);
        })
        .catch(function (err) {
          pollingFailures += 1;
          var message = (err && err.message) || '';

          if (/unknown operation_id/i.test(message)) {
            stopProgress(docId);
            setDocumentState(docId, {
              status: 'failed',
              operationId: null,
              error: 'This operation no longer exists on the backend. Re-process to run it again.',
            });
            hydrateCompletedExtractionsIntoDocuments();
            return;
          }

          if (pollingFailures >= 8) {
            setDocumentState(docId, {
              status: 'processing',
              operationId: operationId,
              error: 'Temporary sync issue while polling progress. Still retrying...'
            });

            if (!pollingWarningShown) {
              showToast((err && err.message) || 'Temporary sync issue while polling progress. Still retrying...', 'info');
              pollingWarningShown = true;
            }
          }
        })
        .finally(function () {
          inFlight = false;
        });
    }, 900);
  }

  function toUploadedDate() {
    return new Date().toISOString();
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
        operationId: null,
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
      setDocumentState(uploadItem.doc.id, { operationId: operationId });
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
        var backendRecordId = response.batch_id ? (String(response.batch_id) + '::' + uploadItem.doc.name) : uploadItem.doc.id;
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
          id: backendRecordId,
          pages: Math.max(1, totalPages || safePagesCount({ extraction: extraction })),
          progress: Math.max(processedPercentage, isFullyCompleted ? 100 : processedPercentage),
          status: status,
          operationId: null,
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
          operationId: operationId,
          error: result.error || 'Extraction is still running in background.',
          extractionSummary: Object.assign({}, uploadItem.doc.extractionSummary || {}, {
            batchId: response.batch_id || null,
          }),
        });
        if (result.error) {
          showToast(result.error, 'info');
        }
      } else {
        stopProgress(uploadItem.doc.id);
        setDocumentState(uploadItem.doc.id, {
          status: 'failed',
          progress: 0,
          operationId: null,
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

  async function reprocessDocument(doc) {
    var recordId = resolveRecordIdForDocument(doc);
    if (!recordId || recordId.indexOf('::') === -1) {
      showToast('This document cannot be re-processed automatically. Please re-upload the PDF file.', 'info');
      if (fileInput) {
        fileInput.click();
      }
      return;
    }

    var operationId = 'op_reprocess_' + doc.id + '_' + Date.now();
    setDocumentState(doc.id, {
      status: 'processing',
      progress: 1,
      operationId: operationId,
      error: null,
    });
    startProgressLoop(doc.id, operationId);

    try {
      var response = await withTimeout(
        api.reprocessExtraction({
          record_id: recordId,
          operation_id: operationId,
        }),
        EXTRACTION_TIMEOUT_MS,
        'Re-process is taking too long. It will continue in background.'
      );

      var results = Array.isArray(response.results) ? response.results : [];
      var result = results[0] || null;
      if (!result) {
        setDocumentState(doc.id, {
          status: 'failed',
          progress: 0,
          error: 'No extraction result returned by re-process.',
        });
        stopProgress(doc.id);
        return;
      }

      if (result.status === 'ok') {
        stopProgress(doc.id);
        var extraction = result.extraction || {};
        var progress = result.processing_progress || {};
        var totalPages = Number(extraction.total_pages || progress.total_pages || doc.pages || 0);
        var processedPages = Number(progress.processed_pages || extraction.ok_pages || 0);
        var failedPages = Number(progress.failed_pages || extraction.failed_pages || 0);
        var isFullyCompleted = failedPages === 0 && totalPages > 0 && processedPages >= totalPages;

        setDocumentState(doc.id, {
          id: recordId,
          pages: Math.max(1, totalPages || doc.pages || 1),
          progress: 100,
          status: isFullyCompleted ? 'completed' : 'failed',
          operationId: null,
          error: isFullyCompleted ? null : ('Only ' + processedPages + '/' + totalPages + ' pages processed. Please review failed pages in Validation.'),
          extractionSummary: {
            totalPages: totalPages,
            okPages: processedPages,
            failedPages: failedPages,
            batchId: response.batch_id || null,
          }
        });
        showToast(isFullyCompleted ? 'Re-process completed successfully.' : 'Re-process completed with failed pages.', isFullyCompleted ? 'success' : 'info');
      } else if (result.status === 'processing') {
        setDocumentState(doc.id, {
          status: 'processing',
          operationId: operationId,
          error: result.error || 'Re-process is still running in background.',
        });
        if (result.error) {
          showToast(result.error, 'info');
        }
      } else {
        stopProgress(doc.id);
        setDocumentState(doc.id, {
          status: 'failed',
          progress: 0,
          operationId: null,
          error: result.error || 'Re-process failed.',
        });
      }

      persistCompletedExtractions(response, [{ doc: doc, file: { name: doc.name } }], [result]);
    } catch (err) {
      stopProgress(doc.id);
      setDocumentState(doc.id, {
        status: 'failed',
        progress: 0,
        operationId: null,
        error: (err && err.message) || 'Re-process failed.',
      });
      showToast((err && err.message) || 'Re-process failed.', 'error');
    }
  }

  function hasProcessingDocuments() {
    return documents.some(function (doc) {
      return doc && getEffectiveStatus(doc) === 'processing' && !!doc.operationId;
    });
  }

  function ensureProgressLoopsForProcessingDocuments() {
    if (!backendAvailable) {
      return;
    }

    documents.forEach(function (doc) {
      if (!doc) {
        return;
      }

      if (getEffectiveStatus(doc) !== 'processing' || !doc.operationId) {
        stopProgress(doc.id);
        return;
      }

      if (!progressIntervals[doc.id]) {
        startProgressLoop(doc.id, doc.operationId);
      }
    });
  }

  function startProcessingRecoveryLoop() {
    if (recoveryIntervalId) {
      clearInterval(recoveryIntervalId);
      recoveryIntervalId = null;
    }

    recoveryIntervalId = setInterval(function () {
      expireStaleProcessingDocuments();

      ensureProgressLoopsForProcessingDocuments();

      if (!backendAvailable || !hasProcessingDocuments()) {
        return;
      }

      hydrateCompletedExtractionsIntoDocuments();
    }, 8000);
  }

  function persistCompletedExtractions(response, uploadItems, results) {
    var batchId = response && response.batch_id ? response.batch_id : null;

    try {
      var existing = readCompletedExtractionsFromStorage();

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
      writeCompletedExtractionsToStorage(merged);
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
      records = readCompletedExtractionsFromStorage();
    } else {
      writeCompletedExtractionsToStorage(records);
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
      ensureProgressLoopsForProcessingDocuments();
      showToast('Backend connected.', 'success');
    } catch (_err) {
      backendAvailable = false;
      showToast('Backend not reachable. Demo mode enabled.', 'info');
    }

    await hydrateCompletedExtractionsIntoDocuments();
    ensureProgressLoopsForProcessingDocuments();
  }

  async function onActionClick(event) {
    var button = event.target.closest('button');
    if (!button || !listElement.contains(button)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    var action = inferActionFromButton(button);
    if (!action) {
      return;
    }

    var doc = resolveDocumentFromActionButton(button);

    if (action === 'show-results' || action === 'view-results') {
      if (!doc) {
        var row = button.closest('.doc-row');
        cacheValidationSelectionFromLegacyRow(row);
        window.location.assign(buildValidationUrlFromLegacyRow(row));
        return;
      }
      cacheValidationSelection(doc);
      window.location.assign(buildValidationUrl(doc));
      return;
    }

    if (!doc) {
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
      reprocessDocument(doc);
      return;
    }

    if (action === 'cancel') {
      if (!doc.operationId) {
        showToast('No running operation to cancel for this document.', 'info');
        return;
      }

      try {
        await api.cancelExtraction(doc.operationId);
        stopProgress(doc.id);
        setDocumentState(doc.id, {
          status: 'cancelled',
          operationId: null,
          error: 'Extraction cancelled by user.',
        });
        showToast('Extraction cancelled.', 'info');
      } catch (err) {
        showToast((err && err.message) || 'Unable to cancel extraction.', 'error');
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
  startProcessingRecoveryLoop();

  checkBackendAvailability();
})();
