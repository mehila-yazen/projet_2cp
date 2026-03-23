
(function () {
  var MAX_FILE_BYTES = 100 * 1024 * 1024;
  var BACKEND_CHECK_TIMEOUT = 1800;
  var idCounter = 0;

  var api = new window.DigitizationApiClient();
  var backendAvailable = false;
  var listElement = document.getElementById('recentDocumentsList');
  var fileInput = document.getElementById('fileInput');
  var dropZone = document.querySelector('.drop-zone');

  var progressIntervals = {};
  var documents = [
    {
      id: nextId(),
      name: 'Promotion_1974_Registre_1.pdf',
      pages: 45,
      uploadedAt: '2026-02-20',
      status: 'completed',
      progress: 100,
      error: null,
      source: 'seed',
    },
    {
      id: nextId(),
      name: 'Promotion_1975_Registre_2.pdf',
      pages: 52,
      uploadedAt: '2026-02-21',
      status: 'processing',
      progress: 67,
      error: null,
      source: 'seed',
    },
    {
      id: nextId(),
      name: 'Promotion_1976_Notes_Annuelles.pdf',
      pages: 38,
      uploadedAt: '2026-02-21',
      status: 'pending',
      progress: 0,
      error: null,
      source: 'seed',
    },
    {
      id: nextId(),
      name: 'Promotion_1977_Deliberations.pdf',
      pages: 41,
      uploadedAt: '2026-02-20',
      status: 'failed',
      progress: 0,
      error: 'Extraction failed on unreadable pages.',
      source: 'seed',
    }
  ];

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
  }

  function setDocumentState(docId, patch) {
    var doc = documents.find(function (item) { return item.id === docId; });
    if (!doc) {
      return;
    }

    Object.assign(doc, patch || {});
    renderDocuments();
  }

  function stopProgress(docId) {
    if (progressIntervals[docId]) {
      clearInterval(progressIntervals[docId]);
      delete progressIntervals[docId];
    }
  }

  function startProgressLoop(docId) {
    stopProgress(docId);

    progressIntervals[docId] = setInterval(function () {
      var doc = documents.find(function (item) { return item.id === docId; });
      if (!doc) {
        stopProgress(docId);
        return;
      }

      if (doc.status !== 'processing') {
        stopProgress(docId);
        return;
      }

      var increment = Math.floor(Math.random() * 6) + 1;
      var next = Math.min(90, doc.progress + increment);
      setDocumentState(docId, { progress: next });
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

    created.forEach(function (item) {
      startProgressLoop(item.doc.id);
    });

    return created;
  }

  async function uploadWithBackend(uploadItems) {
    var files = uploadItems.map(function (item) { return item.file; });
    var response;

    if (files.length === 1) {
      response = await api.extractPdf(files[0]);
    } else {
      response = await api.extractPdfs(files);
    }

    var results = Array.isArray(response.results) ? response.results : [];
    if (!results.length) {
      throw new Error('Empty response from extraction endpoint.');
    }

    uploadItems.forEach(function (uploadItem, index) {
      var result = results[index] || null;
      stopProgress(uploadItem.doc.id);

      if (!result) {
        setDocumentState(uploadItem.doc.id, {
          status: 'failed',
          progress: 0,
          error: 'No extraction result for this file.',
        });
        return;
      }

      if (result.status === 'ok') {
        var extraction = result.extraction || {};
        var progress = result.processing_progress || {};
        setDocumentState(uploadItem.doc.id, {
          pages: safePagesCount({ extraction: extraction }),
          progress: 100,
          status: 'completed',
          error: null,
          extractionSummary: {
            totalPages: extraction.total_pages || progress.total_pages || 0,
            okPages: extraction.ok_pages || progress.processed_pages || 0,
            failedPages: extraction.failed_pages || progress.failed_pages || 0,
            batchId: response.batch_id || null,
          }
        });
      } else {
        setDocumentState(uploadItem.doc.id, {
          status: 'failed',
          progress: 0,
          error: result.error || 'Extraction failed.',
        });
      }
    });
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function simulateUploadResults(uploadItems) {
    uploadItems.forEach(function (uploadItem, index) {
      var delay = 1800 + (index * 350);

      setTimeout(function () {
        stopProgress(uploadItem.doc.id);
        var success = Math.random() >= 0.2;

        if (success) {
          setDocumentState(uploadItem.doc.id, {
            pages: randomInt(10, 80),
            status: 'completed',
            progress: 100,
            error: null,
          });
        } else {
          setDocumentState(uploadItem.doc.id, {
            status: 'failed',
            progress: 0,
            error: 'Could not complete extraction in demo mode.',
          });
        }
      }, delay);
    });
  }

  async function processSelectedFiles(files) {
    var validFiles = validateFiles(files);
    if (!validFiles.length) {
      return;
    }

    var uploadItems = addUploadingDocuments(validFiles);
    showToast(validFiles.length + ' file(s) added to recent documents.', 'success');

    if (!backendAvailable) {
      simulateUploadResults(uploadItems);
      return;
    }

    try {
      await uploadWithBackend(uploadItems);
      showToast('Extraction finished for uploaded file(s).', 'success');
    } catch (err) {
      showToast((err && err.message) || 'Upload failed. Falling back to demo mode.', 'error');
      simulateUploadResults(uploadItems);
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
      setDocumentState(doc.id, {
        status: 'processing',
        progress: 8,
        error: null,
      });

      startProgressLoop(doc.id);

      setTimeout(function () {
        stopProgress(doc.id);
        setDocumentState(doc.id, {
          status: 'completed',
          progress: 100,
          error: null,
        });
        showToast(doc.name + ' reprocessed successfully.', 'success');
      }, 1700);
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
