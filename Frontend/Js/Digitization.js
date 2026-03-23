const EXTRACTIONS_STORAGE_KEY = 'completedExtractions';
const UPLOAD_QUEUE_KEY = 'digitizationQueue';

// Track files being processed
let uploadQueue = [];

function getApiClient() {
  if (!window.ArchiveApiClient) {
    throw new Error('ArchiveApiClient is not loaded. Include ../Js/apiClient.js before Digitization.js');
  }
  return window.ArchiveApiClient;
}

/* Date */
var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var now = new Date();
var dateEl = document.getElementById('headerDate');
if (dateEl) {
  dateEl.textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();
}

// ── FILE QUEUE MANAGEMENT ────────────────────────────────
function addToQueue(fileName, fileSize, totalFiles, currentIndex) {
  const queueItem = {
    id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    fileName,
    fileSize,
    status: 'pending', // pending, processing, success, failed
    progress: 0,
    totalPages: 0,
    processedPages: 0,
    failedPages: 0,
    errorMessage: null,
    totalFiles,
    currentIndex: currentIndex + 1,
  };
  uploadQueue.push(queueItem);
  renderQueue();
  return queueItem.id;
}

function updateQueueItem(itemId, updates) {
  const item = uploadQueue.find(q => q.id === itemId);
  if (item) {
    Object.assign(item, updates);
    renderQueue();
  }
}

function renderQueue() {
  const container = document.querySelector('.recent-documents');
  if (!container) return;

  // Find the container for queue items (after the main doc-row elements)
  let queueContainer = document.getElementById('fileQueueContainer');
  if (!queueContainer) {
    queueContainer = document.createElement('div');
    queueContainer.id = 'fileQueueContainer';
    container.appendChild(queueContainer);
  }

  queueContainer.innerHTML = '';

  uploadQueue.forEach(item => {
    const statusClass = `status-${item.status}`;
    const statusText = item.status === 'pending' ? 'Pending' 
                      : item.status === 'processing' ? 'Processing' 
                      : item.status === 'success' ? 'Completed' 
                      : 'Failed';
    
    const progressHtml = item.status === 'pending' || item.status === 'processing' ? `
      <div class="progress-section">
        <div class="progress-labels"><span>${item.status === 'pending' ? 'Waiting...' : 'Processing...'}</span><span>${Math.round(item.progress)}%</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${item.progress}%"></div></div>
      </div>
    ` : '';

    const pageStats = item.status !== 'pending' ? `<div class="doc-meta">${item.processedPages}/${item.totalPages} pages processed${item.failedPages > 0 ? ` • ${item.failedPages} failed` : ''}</div>` : '';

    let actionsHtml = '';
    if (item.status === 'processing' || item.status === 'pending') {
      actionsHtml = '<div class="doc-actions"><button class="doc-btn doc-btn-outline" disabled>Processing...</button></div>';
    } else if (item.status === 'success') {
      actionsHtml = `<div class="doc-actions">
        <button class="doc-btn doc-btn-primary" onclick="goToValidation()">View Results</button>
        <button class="doc-btn doc-btn-outline" onclick="retryFile('${item.id}')">Re-process</button>
      </div>`;
    } else if (item.status === 'failed') {
      actionsHtml = `<div class="doc-actions">
        <button class="doc-btn doc-btn-danger" onclick="showError('${item.id}')">View Error</button>
        <button class="doc-btn doc-btn-primary" onclick="retryFile('${item.id}')">Retry</button>
      </div>`;
    }

    const docRow = document.createElement('div');
    docRow.className = 'doc-row file-queue-row';
    docRow.innerHTML = `
      <div class="doc-main-row">
        <div class="doc-info">
          <div class="doc-icon"><svg fill="none" stroke="#5a7898" stroke-width="1.6" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
          <div>
            <div class="doc-name">${item.fileName} <span class="file-badge">${item.currentIndex}/${item.totalFiles}</span></div>
            ${pageStats}
          </div>
        </div>
        <div class="doc-status ${statusClass}">${statusText}</div>
      </div>
      ${progressHtml}
      ${actionsHtml}
    `;
    queueContainer.appendChild(docRow);
  });
}

function showError(itemId) {
  const item = uploadQueue.find(q => q.id === itemId);
  if (item && item.errorMessage) {
    alert(`Error: ${item.errorMessage}`);
  }
}

function retryFile(itemId) {
  const item = uploadQueue.find(q => q.id === itemId);
  if (item) {
    item.status = 'pending';
    item.progress = 0;
    renderQueue();
    // TODO: Implement retry logic - re-upload this specific file
    alert(`Retry for "${item.fileName}" coming soon. For now, re-upload the file.`);
  }
}

// Progress animation
let progress = 67;
const progressBar = document.getElementById('progressBar1');
const progressLabel = document.getElementById('progLabel');
let progressIntervalId = null;

const processingDocName = document.getElementById('processingDocName');
const processingDocMeta = document.getElementById('processingDocMeta');
const processingDocStatus = document.getElementById('processingDocStatus');
const completedDocName = document.getElementById('completedDocName');
const completedDocMeta = document.getElementById('completedDocMeta');
const completedDocStatus = document.getElementById('completedDocStatus');
const viewResultsBtn = document.getElementById('viewResultsBtn');
const reprocessBtn = document.getElementById('reprocessBtn');
const viewProgressBtn = document.getElementById('viewProgressBtn');

function startProgressSimulation(startAt = 5, endAt = 95) {
  if (progressIntervalId) clearInterval(progressIntervalId);
  progress = startAt;
  setProgress(progress, `${progress}%`);
  progressIntervalId = setInterval(() => {
    progress += Math.random() * 4;
    if (progress >= endAt) {
      progress = endAt;
      setProgress(progress, `${Math.round(progress)}%`);
      return;
    }
    setProgress(progress, `${Math.round(progress)}%`);
  }, 1200);
}

function stopProgressSimulation() {
  if (progressIntervalId) {
    clearInterval(progressIntervalId);
    progressIntervalId = null;
  }
}

function setProgress(value, text) {
  const bounded = Math.max(0, Math.min(100, Number(value) || 0));
  if (progressBar) progressBar.style.width = bounded.toFixed(0) + '%';
  if (progressLabel) progressLabel.textContent = text || (bounded.toFixed(0) + '%');
}

function updateProcessingCard(fileName, message, statusClass) {
  if (processingDocName) processingDocName.textContent = fileName || 'Waiting for upload...';
  if (processingDocMeta) processingDocMeta.textContent = message || 'No active processing';
  if (processingDocStatus) {
    processingDocStatus.textContent = statusClass === 'failed' ? 'Failed' : 'Processing';
    processingDocStatus.className = `doc-status ${statusClass === 'failed' ? 'status-failed' : 'status-processing'}`;
  }
}

function updateCompletedCard(fileName, message, hasResult) {
  if (completedDocName) completedDocName.textContent = fileName || 'No completed upload yet';
  if (completedDocMeta) completedDocMeta.textContent = message || 'Upload a PDF to start';
  if (completedDocStatus) {
    completedDocStatus.textContent = hasResult ? 'Completed' : 'Pending';
    completedDocStatus.className = `doc-status ${hasResult ? 'status-completed' : 'status-pending'}`;
  }
}

function goToValidation() {
  window.location.href = '../Html/Validation.html';
}

if (viewResultsBtn) viewResultsBtn.addEventListener('click', goToValidation);
if (reprocessBtn && fileInput) reprocessBtn.addEventListener('click', () => fileInput.click());
if (viewProgressBtn) viewProgressBtn.addEventListener('click', () => {
  const top = document.querySelector('.recent-documents');
  if (top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Nav active
function setActive(element) {
  document.querySelectorAll('.nav-item').forEach(navItem => {
    navItem.classList.remove('active');
    const svg = navItem.querySelector('svg');
    if (!svg) return;
    if (svg.getAttribute('fill') && svg.getAttribute('fill') !== 'none') {
      svg.setAttribute('fill', '#266FA3');
    }
    svg.setAttribute('stroke', svg.getAttribute('stroke') !== 'none' ? '#266FA3' : 'none');
    svg.querySelectorAll('path, circle, ellipse, line, polyline, rect, polygon').forEach(child => {
      if (child.getAttribute('stroke') && child.getAttribute('stroke') !== 'none') child.setAttribute('stroke', '#266FA3');
      if (child.getAttribute('fill') && child.getAttribute('fill') !== 'none') child.setAttribute('fill', '#266FA3');
    });
  });

  element.classList.add('active');
  const activeSvg = element.querySelector('svg');
  if (!activeSvg) return;
  if (activeSvg.getAttribute('fill') && activeSvg.getAttribute('fill') !== 'none') activeSvg.setAttribute('fill', 'white');
  if (activeSvg.getAttribute('stroke') && activeSvg.getAttribute('stroke') !== 'none') activeSvg.setAttribute('stroke', 'white');
  activeSvg.querySelectorAll('path, circle, ellipse, line, polyline, rect, polygon').forEach(child => {
    if (child.getAttribute('stroke') && child.getAttribute('stroke') !== 'none') child.setAttribute('stroke', 'white');
    if (child.getAttribute('fill') && child.getAttribute('fill') !== 'none') child.setAttribute('fill', 'white');
  });
}

// Sidebar collapse
const collapseBtn = document.getElementById('collapseBtn');
const sidebar = document.getElementById('sidebar');
if (collapseBtn && sidebar) {
  collapseBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
}

const logo = document.querySelector('.sidebar-logo .esi svg');
if (logo && sidebar) {
  logo.addEventListener('click', () => {
    if (sidebar.classList.contains('collapsed')) sidebar.classList.remove('collapsed');
  });
}

(function initActiveNav() {
  const activeItem = document.querySelector('.nav-item.active');
  if (activeItem) setActive(activeItem);
})();

function readCompletedExtractions() {
  try {
    const raw = localStorage.getItem(EXTRACTIONS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCompletedExtractions(items) {
  localStorage.setItem(EXTRACTIONS_STORAGE_KEY, JSON.stringify(items));
}

function mergeCompletedExtractions(newItems) {
  const existing = readCompletedExtractions();
  const mergedMap = new Map();
  existing.forEach(item => mergedMap.set(item.id, item));
  newItems.forEach(item => mergedMap.set(item.id, item));
  const merged = Array.from(mergedMap.values()).sort((a, b) => (a.processedAt < b.processedAt ? 1 : -1));
  saveCompletedExtractions(merged);
}

function toValidationRecord(batchId, item) {
  const extraction = item.extraction || {};
  const upload = item.upload || {};
  const pages = Array.isArray(extraction.pages) ? extraction.pages : [];

  return {
    id: `${batchId}::${upload.original_filename || extraction.file_path || Date.now()}`,
    batchId,
    fileName: upload.original_filename || extraction.file_path || 'Unnamed PDF',
    processedAt: new Date().toISOString(),
    status: item.status || 'unknown',
    totalPages: Number(extraction.total_pages || 0),
    okPages: Number(extraction.ok_pages || 0),
    failedPages: Number(extraction.failed_pages || 0),
    pages: pages.map(page => ({
      pageNumber: Number(page.page_number || 0),
      status: page.status || 'unknown',
      imagePath: page.image_path || '',
      result: page.result || null,
      error: page.error || null
    }))
  };
}

async function uploadAndExtract(files) {
  return getApiClient().extractPdfs(files);
}

const fileInput = document.getElementById('fileInput');
if (fileInput) {
  fileInput.addEventListener('change', async event => {
    const selected = Array.from(event.target.files || []);
    const files = selected.filter(file => {
      if (file.type !== 'application/pdf') {
        alert('Only PDF files are allowed');
        return false;
      }
      if (file.size > 100 * 1024 * 1024) {
        alert(file.name + ' is too large (max 100MB)');
        return false;
      }
      return true;
    });

    if (!files.length) return;

    uploadQueue = []; // Clear previous queue
    const queueIds = [];

    // Add files to queue
    files.forEach((file, index) => {
      const queueId = addToQueue(file.name, file.size, files.length, index);
      queueIds.push({ queueId, file });
    });

    const firstName = files[0].name;
    updateProcessingCard(firstName, `${files.length} file(s) selected — uploading...`, 'processing');
    startProgressSimulation(8, 92);

    try {
      await getApiClient().health();
      setProgress(12, 'Uploading...');

      // Update queue items to processing
      queueIds.forEach(({ queueId }) => {
        updateQueueItem(queueId, { status: 'processing', progress: 15 });
      });

      const payload = await uploadAndExtract(files);
      setProgress(95, 'Saving results...');

      const batchId = payload.batch_id || `batch_${Date.now()}`;
      const results = Array.isArray(payload.results) ? payload.results : [];
      const completed = [];

      // Process results and update queue
      results.forEach((result, index) => {
        const queueId = queueIds[index]?.queueId;
        if (!queueId) return;

        const extraction = result.extraction || {};
        const progress = result.processing_progress || {};
        const totalPages = Number(extraction.total_pages || progress.total_pages || 0);
        const okPages = Number(extraction.ok_pages || progress.processed_pages || 0);
        const failedPages = Number(extraction.failed_pages || progress.failed_pages || 0);

        if (result.status === 'ok' && result.extraction) {
          updateQueueItem(queueId, {
            status: 'success',
            progress: 100,
            totalPages,
            processedPages: okPages,
            failedPages,
          });

          const validationRecord = toValidationRecord(batchId, result);
          completed.push(validationRecord);
        } else {
          updateQueueItem(queueId, {
            status: 'failed',
            progress: 0,
            errorMessage: result.error || 'Unknown error during extraction',
            totalPages,
            processedPages: okPages,
            failedPages,
          });
        }
      });

      if (completed.length) {
        mergeCompletedExtractions(completed);
      }

      stopProgressSimulation();
      setProgress(100, 'Done');

      const failedCount = results.length - completed.length;
      const doneLabel = `${completed.length} file(s) completed${failedCount > 0 ? `, ${failedCount} failed` : ''}`;
      updateProcessingCard(firstName, `Finished • ${doneLabel}`, failedCount > 0 && completed.length === 0 ? 'failed' : 'processing');
      updateCompletedCard(firstName, `${doneLabel} • Click "View Results"`, completed.length > 0);

      alert(`Extraction complete. ${completed.length} file(s) ready for validation${failedCount > 0 ? `, ${failedCount} failed` : ''}.`);
      fileInput.value = '';
    } catch (error) {
      stopProgressSimulation();
      setProgress(0, 'Failed');
      updateProcessingCard(firstName, `Error: ${error.message || 'Unknown error'}`, 'failed');

      // Mark all as failed
      queueIds.forEach(({ queueId }) => {
        updateQueueItem(queueId, {
          status: 'failed',
          errorMessage: error.message || 'Unknown error',
          progress: 0,
        });
      });

      alert(`Extraction failed: ${error.message || 'Unknown error'}`);
    }
  });
}
