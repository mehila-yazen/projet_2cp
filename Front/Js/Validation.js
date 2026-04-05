(function () {
  var api = new window.DigitizationApiClient();
  var COMPLETED_EXTRACTIONS_STORAGE_KEY = 'completedExtractions';
  var VALIDATION_SELECTION_STORAGE_KEY = 'validationSelection';
  var records = [];
  var selectedRecordIndex = 0;
  var currentPageIndex = 0;
  var editMode = false;

  var queueList = document.getElementById('queueList');
  var pageLabel = document.getElementById('pageLabel');
  var pageInfo = document.getElementById('pageInfo');
  var tableHead = document.getElementById('tableHead');
  var tableBody = document.getElementById('tableBody');
  var dataTable = document.getElementById('dataTable');
  var metaYear = document.getElementById('meta-year');
  var metaLevel = document.getElementById('meta-level');
  var metaSpec = document.getElementById('meta-spec');
  var metaTitle = document.getElementById('meta-title');
  var editBtn = document.getElementById('editBtn');
  var editBtnLabel = document.getElementById('editBtnLabel');
  var editBanner = document.getElementById('editBanner');
  var tableActions = document.getElementById('tableActions');
  var addModuleBtn = document.getElementById('addModuleBtn');
  var addMatiereBtn = document.getElementById('addMatiereBtn');
  var previewCard = document.querySelector('.pdf-placeholder');
  var warningBox = document.querySelector('.warning-box');
  var pageExtractionInfo = document.getElementById('pageExtractionInfo');
  var zoomValueEl = document.getElementById('zoomValue');
  var syncReportPanel = document.getElementById('syncReportPanel');
  var syncReportBadge = document.getElementById('syncReportBadge');
  var syncReportMeta = document.getElementById('syncReportMeta');
  var syncReportBody = document.getElementById('syncReportBody');
  var nameValidationBox = null;
  var activeSuggestionDropdown = null;
  var latestValidationRunId = 0;
  var previewZoom = 1;
  var previewHasImage = false;
  var previewOffsetX = 0;
  var previewOffsetY = 0;
  var previewDragging = false;
  var previewDragStartX = 0;
  var previewDragStartY = 0;
  var currentPageType = 'unknown';
  var moduleValidationHighlightCount = 0;
  var moduleValidationIssuesByPageKey = {};

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
  }

  function setSyncReportStatus(kind, label) {
    if (!syncReportBadge) {
      return;
    }
    syncReportBadge.classList.remove('ok', 'error', 'pending');
    if (kind) {
      syncReportBadge.classList.add(kind);
    }
    syncReportBadge.textContent = label || 'Idle';
  }

  function buildSyncReportDetails(report) {
    if (!report || typeof report !== 'object') {
      return 'No details available.';
    }

    var lines = [];
    var base = report.created_or_updated || {};
    var programme = base.programme || {};
    var annee = base.annee_universitaire || {};
    var formation = base.formation || {};
    var periodes = base.periodes || {};

    lines.push('Core Links');
    lines.push('- Programme: #' + String(programme.id || 'N/A') + ' (' + String(programme.action || 'n/a') + ')');
    lines.push('- Annee Universitaire: #' + String(annee.id || 'N/A') + ' (' + String(annee.action || 'n/a') + ')');
    lines.push('- Formation: #' + String(formation.id || 'N/A') + ' (' + String(formation.action || 'n/a') + ')');
    lines.push('- Periode S1: #' + String((periodes.S1 && periodes.S1.id) || 'N/A') + ' (' + String((periodes.S1 && periodes.S1.action) || 'n/a') + ')');
    lines.push('- Periode S2: #' + String((periodes.S2 && periodes.S2.id) || 'N/A') + ' (' + String((periodes.S2 && periodes.S2.action) || 'n/a') + ')');

    var matiereSync = Array.isArray(report.matiere_module_sync) ? report.matiere_module_sync : [];
    lines.push('');
    lines.push('Matieres/Modules Synced: ' + String(matiereSync.length));

    var studentReport = Array.isArray(report.student_report) ? report.student_report : [];
    lines.push('Students Synced: ' + String(studentReport.length));
    studentReport.slice(0, 12).forEach(function (item, index) {
      var etudiant = item.etudiant || {};
      var inscription = item.inscription || {};
      var group = item.group || {};
      var resultats = Array.isArray(item.resultats) ? item.resultats : [];
      lines.push('');
      lines.push((index + 1) + '. ' + String(item.nom || '') + ' ' + String(item.prenom || ''));
      lines.push('   - Etudiant #' + String(etudiant.id || 'N/A') + ' (' + String(etudiant.action || 'n/a') + ')');
      lines.push('   - Groupe #' + String(group.id || 'N/A') + ' [' + String(group.code || 'N/A') + '] (' + String(group.action || 'n/a') + ')');
      lines.push('   - Inscription #' + String(inscription.id || 'N/A') + ' (' + String(inscription.action || 'n/a') + ')');
      lines.push('   - Resultats upserted: ' + String(resultats.length));
    });

    if (studentReport.length > 12) {
      lines.push('');
      lines.push('... ' + String(studentReport.length - 12) + ' more students omitted in preview ...');
    }

    return lines.join('\n');
  }

  function renderSyncReport(report, isError) {
    if (!syncReportPanel) {
      return;
    }

    var now = new Date();
    var stamp = now.toLocaleTimeString();

    if (isError) {
      setSyncReportStatus('error', 'Failed');
      if (syncReportMeta) {
        syncReportMeta.textContent = 'Last attempt: ' + stamp;
      }
      if (syncReportBody) {
        syncReportBody.textContent = 'Database sync failed.\n' + String(report || 'Unknown error');
      }
      return;
    }

    setSyncReportStatus('ok', 'Synced');
    if (syncReportMeta) {
      syncReportMeta.textContent = 'Last sync: ' + stamp + ' | Students: ' + Number((report && report.saved_students) || 0) + ' | Resultats: ' + Number((report && report.saved_resultats) || 0);
    }
    if (syncReportBody) {
      syncReportBody.textContent = buildSyncReportDetails(report);
    }
  }

  function closeActiveSuggestionDropdown() {
    if (activeSuggestionDropdown && activeSuggestionDropdown.parentNode) {
      activeSuggestionDropdown.parentNode.removeChild(activeSuggestionDropdown);
    }
    activeSuggestionDropdown = null;
  }

  function ensureNameValidationBox() {
    if (nameValidationBox && nameValidationBox.parentNode) {
      return nameValidationBox;
    }
    if (!warningBox || !warningBox.parentNode) {
      return null;
    }

    var box = document.createElement('div');
    box.id = 'nameValidationBox';
    box.style.display = 'none';
    box.style.background = '#FEE2E2';
    box.style.border = '1px solid #FCA5A5';
    box.style.borderRadius = '9px';
    box.style.padding = '7px 13px';
    box.style.fontSize = '12px';
    box.style.color = '#991B1B';
    box.style.flexShrink = '0';
    warningBox.parentNode.insertBefore(box, warningBox.nextSibling);
    nameValidationBox = box;
    return nameValidationBox;
  }

  function getPageType(page) {
    var result = page && page.result ? page.result : {};
    return String(result.type || 'unknown');
  }

  function getRecordStatusLabel(record) {
    var status = String((record && record.status) || 'unknown').toLowerCase();
    if (status === 'ok' || status === 'completed') {
      return 'Completed';
    }
    if (status === 'failed') {
      return 'Failed';
    }
    if (status === 'processing') {
      return 'Processing';
    }
    return 'Unknown';
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

  function setActive(el) {
    document.querySelectorAll('.nav-item').forEach(function (n) {
      n.classList.remove('active');
      var svg = n.querySelector('svg');
      if (svg) {
        if (svg.getAttribute('fill') && svg.getAttribute('fill') !== 'none') svg.setAttribute('fill', '#266FA3');
        if (svg.getAttribute('stroke') && svg.getAttribute('stroke') !== 'none') svg.setAttribute('stroke', '#266FA3');
        svg.querySelectorAll('path, circle, ellipse, line, polyline, rect, polygon').forEach(function (child) {
          if (child.getAttribute('stroke') && child.getAttribute('stroke') !== 'none') child.setAttribute('stroke', '#266FA3');
          if (child.getAttribute('fill') && child.getAttribute('fill') !== 'none') child.setAttribute('fill', '#266FA3');
        });
      }
    });

    el.classList.add('active');
    var activeSvg = el.querySelector('svg');
    if (activeSvg) {
      if (activeSvg.getAttribute('fill') && activeSvg.getAttribute('fill') !== 'none') activeSvg.setAttribute('fill', 'white');
      if (activeSvg.getAttribute('stroke') && activeSvg.getAttribute('stroke') !== 'none') activeSvg.setAttribute('stroke', 'white');
      activeSvg.querySelectorAll('path, circle, ellipse, line, polyline, rect, polygon').forEach(function (child) {
        if (child.getAttribute('stroke') && child.getAttribute('stroke') !== 'none') child.setAttribute('stroke', 'white');
        if (child.getAttribute('fill') && child.getAttribute('fill') !== 'none') child.setAttribute('fill', 'white');
      });
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

    var activeItem = document.querySelector('.nav-item.active');
    if (activeItem) {
      setActive(activeItem);
    }
  }

  function readLocalRecords() {
    try {
      var raw = localStorage.getItem(COMPLETED_EXTRACTIONS_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
      return [];
    }
  }

  function writeLocalRecords(nextRecords) {
    try {
      localStorage.setItem(COMPLETED_EXTRACTIONS_STORAGE_KEY, JSON.stringify(Array.isArray(nextRecords) ? nextRecords : []));
    } catch (_err) {
      // ignore storage errors
    }
  }

  function readValidationSelection() {
    try {
      var raw = window.sessionStorage.getItem(VALIDATION_SELECTION_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_err) {
      return null;
    }
  }

  function clearValidationSelection() {
    try {
      window.sessionStorage.removeItem(VALIDATION_SELECTION_STORAGE_KEY);
    } catch (_err) {
      // ignore storage errors
    }
  }

  function findRecordIndexBySelection(selection) {
    if (!selection || !records.length) {
      return -1;
    }

    var recordId = String(selection.recordId || '').trim();
    var fileName = String(selection.fileName || '').trim().toLowerCase();
    var batchId = String(selection.batchId || '').trim();

    return records.findIndex(function (record) {
      var currentId = String(record && record.id || '').trim();
      var currentFileName = String(record && record.file_name || '').trim().toLowerCase();
      var currentBatchId = String(record && record.batch_id || '').trim();

      if (recordId && currentId === recordId) {
        return true;
      }
      if (fileName && currentFileName && fileName === currentFileName) {
        return true;
      }
      if (batchId && fileName && currentBatchId === batchId && currentFileName === fileName) {
        return true;
      }
      return false;
    });
  }

  function applyRecordSelectionFromQuery() {
    if (!records.length) {
      return;
    }

    try {
      var params = new URLSearchParams(window.location.search || '');
      var requestedRecordId = String(params.get('record_id') || '').trim();
      var requestedFileName = String(params.get('file_name') || '').trim().toLowerCase();
      var matchedIndex = -1;

      if (requestedRecordId) {
        matchedIndex = records.findIndex(function (record) {
          return String(record && record.id || '') === requestedRecordId;
        });
      }

      if (matchedIndex < 0 && requestedFileName) {
        matchedIndex = records.findIndex(function (record) {
          return String(record && record.file_name || '').trim().toLowerCase() === requestedFileName;
        });
      }

      if (matchedIndex < 0 && (requestedRecordId || requestedFileName)) {
        var selection = readValidationSelection();
        if (selection) {
          matchedIndex = findRecordIndexBySelection(selection);

          if (matchedIndex < 0 && selection.record) {
            records.unshift(selection.record);
            matchedIndex = 0;
          }

          if (matchedIndex >= 0) {
            clearValidationSelection();
          }
        }
      }

      if (matchedIndex >= 0) {
        selectedRecordIndex = matchedIndex;
        currentPageIndex = 0;
      }
    } catch (_err) {
      // ignore malformed query strings
    }
  }

  async function loadRecords() {
    try {
      var response = await api.getCompletedExtractions(100);
      var backendRecords = Array.isArray(response.records) ? response.records : [];
      if (backendRecords.length) {
        records = backendRecords;
        writeLocalRecords(records);
        return;
      }
    } catch (_err) {
      // fallback below
    }
    records = readLocalRecords();
  }

  function getSelectedRecord() {
    if (!records.length) {
      return null;
    }
    if (selectedRecordIndex < 0) {
      selectedRecordIndex = 0;
    }
    if (selectedRecordIndex >= records.length) {
      selectedRecordIndex = records.length - 1;
    }
    return records[selectedRecordIndex] || null;
  }

  function getSortedPages(record) {
    var pages = Array.isArray(record && record.pages) ? record.pages.slice() : [];
    pages.sort(function (a, b) { return Number(a.page_number || 0) - Number(b.page_number || 0); });
    return pages;
  }

  function getCurrentPage() {
    var record = getSelectedRecord();
    if (!record) {
      return null;
    }
    var pages = getSortedPages(record);
    if (!pages.length) {
      return null;
    }
    if (currentPageIndex < 0) {
      currentPageIndex = 0;
    }
    if (currentPageIndex >= pages.length) {
      currentPageIndex = pages.length - 1;
    }
    return pages[currentPageIndex];
  }

  function toCleanMetaValue(value) {
    if (value == null) {
      return '';
    }
    var cleaned = String(value).trim();
    if (/^n\/?a$/i.test(cleaned)) {
      return '';
    }
    return cleaned;
  }

  function pickMetaValue(candidates) {
    for (var i = 0; i < candidates.length; i += 1) {
      var clean = toCleanMetaValue(candidates[i]);
      if (clean) {
        return clean;
      }
    }
    return '';
  }

  function emptySharedMeta() {
    return {
      year: '',
      level: '',
      spec: '',
      title: '',
    };
  }

  function mergeMissingSharedMeta(targetMeta, sourceMeta) {
    ['year', 'level', 'spec', 'title'].forEach(function (key) {
      if (!toCleanMetaValue(targetMeta[key])) {
        targetMeta[key] = toCleanMetaValue(sourceMeta[key]);
      }
    });
    return targetMeta;
  }

  function extractSharedMetaFromResult(resultObj) {
    var result = resultObj || {};
    var student = result.student || {};

    return {
      year: pickMetaValue([
        result.annee,
        result.year,
        student.year,
      ]),
      level: pickMetaValue([
        result.anneeEtude,
        result.level,
      ]),
      spec: pickMetaValue([
        result.section,
        result.option,
        result.sectionCode,
      ]),
      title: pickMetaValue([
        result.title,
        student.section,
        result.section,
        result.option,
        result.sectionCode,
      ]),
    };
  }

  function buildSharedMetaFromRecord(record) {
    var pages = getSortedPages(record);
    var groupedPages = {
      cover: [],
      multiple_students: [],
      single_student: [],
      other: [],
    };

    pages.forEach(function (page) {
      var type = String((page && page.result && page.result.type) || '').toLowerCase();
      if (type === 'cover' || type === 'first_cover') {
        groupedPages.cover.push(page);
        return;
      }
      if (type === 'multiple_students') {
        groupedPages.multiple_students.push(page);
        return;
      }
      if (type === 'single_student') {
        groupedPages.single_student.push(page);
        return;
      }
      groupedPages.other.push(page);
    });

    var sharedMeta = emptySharedMeta();
    var hasCoverPages = groupedPages.cover.length > 0;
    var priorityGroups = hasCoverPages
      ? [groupedPages.cover]
      : [
        groupedPages.multiple_students,
        groupedPages.single_student,
        groupedPages.other,
      ];

    priorityGroups.forEach(function (group) {
      group.forEach(function (page) {
        mergeMissingSharedMeta(sharedMeta, extractSharedMetaFromResult(page && page.result));
      });
    });

    return sharedMeta;
  }

  function getRecordSharedMeta(record) {
    if (!record) {
      return emptySharedMeta();
    }

    if (record.shared_meta && typeof record.shared_meta === 'object') {
      return {
        year: toCleanMetaValue(record.shared_meta.year),
        level: toCleanMetaValue(record.shared_meta.level),
        spec: toCleanMetaValue(record.shared_meta.spec),
        title: toCleanMetaValue(record.shared_meta.title),
      };
    }

    var computed = buildSharedMetaFromRecord(record);
    record.shared_meta = computed;
    return computed;
  }

  function collectSharedMetaFromUI() {
    return {
      year: toCleanMetaValue(metaYear && metaYear.textContent),
      level: toCleanMetaValue(metaLevel && metaLevel.textContent),
      spec: toCleanMetaValue(metaSpec && metaSpec.textContent),
      title: toCleanMetaValue(metaTitle && metaTitle.textContent),
    };
  }

  function setMetaElementText(el, value) {
    if (!el) {
      return;
    }
    el.textContent = value || 'N/A';
  }

  function applySharedMetaToResult(resultObj, sharedMeta) {
    var result = resultObj || {};
    result.annee = sharedMeta.year || null;
    result.anneeEtude = sharedMeta.level || null;
    result.section = sharedMeta.spec || null;
    result.title = sharedMeta.title || null;
  }

  function applySharedMetaToRecord(record, sharedMeta) {
    if (!record) {
      return;
    }

    record.shared_meta = {
      year: sharedMeta.year || '',
      level: sharedMeta.level || '',
      spec: sharedMeta.spec || '',
      title: sharedMeta.title || '',
    };

    var pages = getSortedPages(record);
    pages.forEach(function (page) {
      if (!page) {
        return;
      }
      if (!page.result || typeof page.result !== 'object') {
        page.result = {};
      }
      applySharedMetaToResult(page.result, record.shared_meta);
    });
  }

  function syncSharedMetaFromInputsToRecord() {
    if (!editMode) {
      return;
    }
    var record = getSelectedRecord();
    if (!record) {
      return;
    }
    applySharedMetaToRecord(record, collectSharedMetaFromUI());
  }

  function toTmpUrl(imagePath) {
    if (!imagePath) {
      return null;
    }
    var normalized = String(imagePath).replace(/\\/g, '/');
    var marker = '/tmp/';
    var idx = normalized.toLowerCase().indexOf(marker);
    if (idx === -1) {
      return null;
    }
    return normalized.slice(idx);
  }

  function updatePreviewZoomDisplay() {
    if (zoomValueEl) {
      zoomValueEl.textContent = Math.round(previewZoom * 100) + '%';
    }

    if (previewCard) {
      if (previewHasImage) {
        previewCard.style.backgroundSize = (previewZoom * 100) + '%';
        previewCard.style.backgroundPosition = 'calc(50% + ' + previewOffsetX + 'px) calc(50% + ' + previewOffsetY + 'px)';
        previewCard.style.cursor = previewZoom > 1 ? (previewDragging ? 'grabbing' : 'grab') : 'default';
      } else {
        previewCard.style.backgroundSize = 'contain';
        previewCard.style.backgroundPosition = 'center';
        previewCard.style.cursor = 'default';
      }
    }
  }

  function adjustPreviewZoom(delta) {
    if (!previewHasImage) {
      return;
    }
    previewZoom = Math.max(0.5, Math.min(4, previewZoom + Number(delta || 0)));
    updatePreviewZoomDisplay();
  }

  function resetPreviewZoom() {
    previewZoom = 1;
    previewOffsetX = 0;
    previewOffsetY = 0;
    updatePreviewZoomDisplay();
  }

  function renderPreview() {
    var record = getSelectedRecord();
    var page = getCurrentPage();
    var pages = record ? getSortedPages(record) : [];
    var pageNumber = page ? Number(page.page_number || (currentPageIndex + 1)) : 0;
    var pageType = page ? getPageType(page) : 'unknown';
    var pageStatus = page && page.status ? String(page.status).toUpperCase() : 'N/A';

    pageLabel.textContent = 'PDF Preview — Page ' + (pageNumber || 1) + ' (' + pageType + ')';
    pageInfo.textContent = 'Page ' + (pages.length ? (currentPageIndex + 1) : 0) + ' / ' + pages.length;

    if (warningBox) {
      warningBox.textContent = 'Page status: ' + pageStatus + ' | Type: ' + pageType + ' — verify before saving';
    }

    if (previewCard) {
      var imageUrl = page ? toTmpUrl(page.image_path) : null;
      previewHasImage = Boolean(imageUrl);
      previewCard.style.backgroundPosition = 'center';
      previewCard.style.backgroundRepeat = 'no-repeat';
      previewCard.style.backgroundImage = imageUrl ? ('url("' + imageUrl + '")') : 'none';
      if (!imageUrl) {
        previewZoom = 1;
        previewOffsetX = 0;
        previewOffsetY = 0;
      }
      updatePreviewZoomDisplay();
    }
  }

  function panPreview(deltaX, deltaY) {
    if (!previewHasImage || previewZoom <= 1) {
      return;
    }
    previewOffsetX += Number(deltaX || 0);
    previewOffsetY += Number(deltaY || 0);
    updatePreviewZoomDisplay();
  }

  function splitName(fullName) {
    var value = String(fullName || '').trim();
    if (!value) {
      return { nom: '', prenom: '' };
    }
    var tokens = value.split(/\s+/);
    if (tokens.length === 1) {
      return { nom: tokens[0], prenom: '' };
    }
    return {
      nom: tokens[0],
      prenom: tokens.slice(1).join(' '),
    };
  }

  function pickFirstNonEmpty(values) {
    for (var i = 0; i < values.length; i += 1) {
      var value = values[i];
      if (value == null) {
        continue;
      }
      if (typeof value === 'string' && !value.trim()) {
        continue;
      }
      return value;
    }
    return null;
  }

  function toFiniteNumberOrNull(value) {
    if (value == null || value === '') {
      return null;
    }
    var num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function parseStudentsFromResult(resultObj) {
    var result = resultObj || {};
    var type = result.type || 'unknown';

    if (type === 'single_student') {
      var student = result.student || {};
      var split = splitName(student.name);
      return [{
        nom: split.nom,
        prenom: split.prenom,
        matricule: student.matricule || null,
        modules: Array.isArray(result.modules) ? result.modules : [],
        decision: pickFirstNonEmpty([
          student.decisionFinaleDuConseil,
          student.decisionDeJuin,
          (result.summary && result.summary.observation),
        ]),
        avg_s1: toFiniteNumberOrNull(pickFirstNonEmpty([student.semestre1_moyenne, result.semestre1_moyenne])),
        avg_s2: toFiniteNumberOrNull(pickFirstNonEmpty([student.semestre2_moyenne, result.semestre2_moyenne])),
        annual_avg: toFiniteNumberOrNull(pickFirstNonEmpty([student.general_moyenne, result.general_moyenne])),
        rank_s1: toFiniteNumberOrNull(pickFirstNonEmpty([student.semestre1_rang, result.semestre1_rang])),
        rank_s2: toFiniteNumberOrNull(pickFirstNonEmpty([student.semestre2_rang, result.semestre2_rang])),
        annual_rank: toFiniteNumberOrNull(pickFirstNonEmpty([student.general_rang, result.general_rang])),
        decision_june: pickFirstNonEmpty([student.decisionDeJuin, (result.summary && result.summary.observation)]),
        final_decision: pickFirstNonEmpty([student.decisionFinaleDuConseil, (result.summary && result.summary.observation)]),
        stage: pickFirstNonEmpty([student.noteDeStage, student.stage, student.stageEligible, student.stage_eligible]),
        diploma: pickFirstNonEmpty([student.diploma, student.diplome]),
      }];
    }

    if (type === 'multiple_students') {
      return (Array.isArray(result.students) ? result.students : []).map(function (student) {
        var moyenne = student.moyenne || {};
        var rang = student.rang || {};
        return {
          nom: student.nom || '',
          prenom: student.prenom || '',
          matricule: student.matricule || null,
          modules: Array.isArray(student.modules) ? student.modules : [],
          decision: pickFirstNonEmpty([student.decisionFinaleDuConseil, student.decisionDeJuin, student.decision]),
          avg_s1: toFiniteNumberOrNull(pickFirstNonEmpty([moyenne.S1, moyenne.s1, moyenne.semestre1, student.semestre1_moyenne])),
          avg_s2: toFiniteNumberOrNull(pickFirstNonEmpty([moyenne.S2, moyenne.s2, moyenne.semestre2, student.semestre2_moyenne])),
          annual_avg: toFiniteNumberOrNull(pickFirstNonEmpty([moyenne.annuel, moyenne.general, student.general_moyenne])),
          rank_s1: toFiniteNumberOrNull(pickFirstNonEmpty([rang.S1, rang.s1, rang.semestre1, student.semestre1_rang])),
          rank_s2: toFiniteNumberOrNull(pickFirstNonEmpty([rang.S2, rang.s2, rang.semestre2, student.semestre2_rang])),
          annual_rank: toFiniteNumberOrNull(pickFirstNonEmpty([rang.annuel, rang.general, student.general_rang])),
          decision_june: pickFirstNonEmpty([student.decisionDeJuin, student.decision]),
          final_decision: pickFirstNonEmpty([student.decisionFinaleDuConseil, student.decision]),
          stage: pickFirstNonEmpty([student.noteDeStage, student.stage, student.stageEligible, student.stage_eligible]),
          diploma: pickFirstNonEmpty([student.diploma, student.diplome]),
        };
      });
    }

    if (type === 'resultats_annonce') {
      return (Array.isArray(result.students) ? result.students : []).map(function (student) {
        return {
          nom: student.nom || '',
          prenom: student.prenom || '',
          matricule: null,
          modules: [],
          decision: student.decision || null,
          avg_s1: null,
          avg_s2: null,
          annual_avg: null,
          rank_s1: null,
          rank_s2: null,
          annual_rank: null,
          decision_june: student.decision || null,
          final_decision: student.decision || null,
          stage: null,
          diploma: null,
        };
      });
    }

    return [];
  }

  function getModuleLabel(module, index) {
    if (!module) {
      return 'Module ' + (index + 1);
    }
    var raw = module.code || module.name || module.module || module.libelle || ('Module ' + (index + 1));
    return String(raw).replace(/\s+/g, ' ').trim();
  }

  function getModuleCoefficient(module) {
    if (!module) {
      return null;
    }
    var value = module.coef;
    if (value == null) value = module.coefficient;
    if (value == null) value = module.credit;
    if (value == null) value = module.credits;
    if (value == null) return null;
    return String(value);
  }

  function getPageModuleDefinitions(result, students) {
    var sequences = [];
    if (Array.isArray(result && result.modules)) {
      sequences.push(result.modules);
    }

    (Array.isArray(students) ? students : []).forEach(function (student) {
      if (Array.isArray(student.modules) && student.modules.length) {
        sequences.push(student.modules);
      }
    });

    var maxLength = sequences.reduce(function (maxValue, sequence) {
      return Math.max(maxValue, sequence.length);
    }, 0);

    var defs = [];
    for (var i = 0; i < maxLength; i += 1) {
      var label = '';
      var coefficient = null;
      for (var j = 0; j < sequences.length; j += 1) {
        var mod = sequences[j][i];
        if (!mod) {
          continue;
        }
        if (!label) {
          label = getModuleLabel(mod, i);
        }
        if (coefficient == null) {
          coefficient = getModuleCoefficient(mod);
        }
      }
      defs.push({
        label: label || ('Module ' + (i + 1)),
        coefficient: coefficient,
      });
    }

    return defs;
  }

  function appendHeadCell(row, className, text, options) {
    var th = document.createElement('th');
    if (className) {
      th.className = className;
    }

    var opts = options || {};
    if (opts.colSpan) {
      th.colSpan = opts.colSpan;
    }

    if (opts.style) {
      Object.keys(opts.style).forEach(function (key) {
        th.style[key] = opts.style[key];
      });
    }

    if (opts.html) {
      th.innerHTML = opts.html;
    } else {
      th.textContent = text || '';
    }

    row.appendChild(th);
  }

  function buildModuleHeaderCell(moduleDef, index) {
    var th = document.createElement('th');
    th.className = 'th-group';
    th.style.color = '#085454';
    th.style.minWidth = '52px';
    th.style.fontSize = '9.5px';
    th.dataset.moduleIndex = String(index);
    th.dataset.moduleCoefficient = moduleDef && moduleDef.coefficient != null ? String(moduleDef.coefficient) : '';

    var labelSpan = document.createElement('span');
    labelSpan.className = 'module-label';
    labelSpan.dataset.editable = '1';
    labelSpan.dataset.moduleIndex = String(index);
    labelSpan.textContent = moduleDef && moduleDef.label != null ? String(moduleDef.label) : ('Module ' + (index + 1));
    th.appendChild(labelSpan);

    if (moduleDef && moduleDef.coefficient != null) {
      var coefDiv = document.createElement('div');
      coefDiv.style.color = '#8B0101';
      coefDiv.style.fontSize = '8.5px';
      coefDiv.style.fontWeight = '700';
      coefDiv.style.marginTop = '1px';
      coefDiv.textContent = 'Coef: ' + moduleDef.coefficient;
      th.appendChild(coefDiv);
    }

    return th;
  }

  function getModuleHeaderCells() {
    if (!tableHead) {
      return [];
    }
    return Array.prototype.slice.call(tableHead.querySelectorAll('th[data-module-index]'));
  }

  function collectModuleDefinitionsFromHeader() {
    var cells = getModuleHeaderCells();
    return cells.map(function (cell, idx) {
      var labelNode = cell.querySelector('.module-label');
      var rawLabel = labelNode ? labelNode.textContent.trim() : '';
      var label = rawLabel || ('Module ' + (idx + 1));
      var coefValue = cell.dataset.moduleCoefficient;
      var coefficient = coefValue === '' || coefValue == null ? null : coefValue;
      return { label: label, coefficient: coefficient };
    });
  }

  function toResultModules(moduleDefs) {
    return (Array.isArray(moduleDefs) ? moduleDefs : []).map(function (def) {
      return {
        name: def.label || '',
        coef: def.coefficient != null ? def.coefficient : null,
      };
    });
  }

  function updateEditControlsForPage(pageType) {
    if (!addModuleBtn || !addMatiereBtn) {
      return;
    }
    var isMatieres = pageType === 'table_de_matieres';
    addModuleBtn.style.display = editMode && !isMatieres ? 'inline-flex' : 'none';
    addMatiereBtn.style.display = editMode && isMatieres ? 'inline-flex' : 'none';
    if (tableActions) {
      tableActions.classList.toggle('visible', editMode);
    }
  }

  function syncTableActionsWidth() {
    if (!tableActions || !dataTable) {
      return;
    }
    var width = dataTable.scrollWidth;
    tableActions.style.minWidth = width ? width + 'px' : '100%';
  }

  function renderTableHeader(moduleDefs) {
    if (!tableHead) {
      return;
    }

    var modules = Array.isArray(moduleDefs) ? moduleDefs : [];
    tableHead.innerHTML = '';

    var topRow = document.createElement('tr');
    appendHeadCell(topRow, 'th-group', 'Student Information', { colSpan: 3, style: { color: '#5F049C' } });
    appendHeadCell(topRow, 'th-group', 'Period', { style: { color: '#07A1A1' } });

    modules.forEach(function (moduleDef, moduleIndex) {
      topRow.appendChild(buildModuleHeaderCell(moduleDef, moduleIndex));
    });

    var avgCell = document.createElement('th');
    avgCell.className = 'th-group';
    avgCell.style.color = '#25436B';
    avgCell.style.minWidth = '64px';
    avgCell.textContent = 'Moy S1/S2';
    topRow.appendChild(avgCell);
    appendHeadCell(topRow, 'th-group', 'Rank', { style: { color: '#901684', minWidth: '38px' } });
    appendHeadCell(topRow, 'th-group', 'Annual Avg', { style: { color: '#25436B', minWidth: '58px' } });
    appendHeadCell(topRow, 'th-group', 'Annual Rank', { style: { color: '#901684', minWidth: '52px' } });
    appendHeadCell(topRow, 'th-group', 'Administrative Decisions', { colSpan: 4, style: { color: '#085454' } });
    tableHead.appendChild(topRow);

    var subRow = document.createElement('tr');
    appendHeadCell(subRow, 'th-sub', 'Last Name', { style: { color: '#0F5E9E' } });
    appendHeadCell(subRow, 'th-sub', 'First Name', { style: { color: '#0A3A81' } });
    appendHeadCell(subRow, 'th-sub', 'Matricule', { style: { color: '#840A94' } });
    appendHeadCell(subRow, 'th-sub', '');
    modules.forEach(function () {
      appendHeadCell(subRow, 'th-sub', '');
    });
    appendHeadCell(subRow, 'th-sub', '');
    appendHeadCell(subRow, 'th-sub', '');
    appendHeadCell(subRow, 'th-sub', '');
    appendHeadCell(subRow, 'th-sub', '');
    appendHeadCell(subRow, 'th-sub', 'June Decision', { style: { color: '#02112A' } });
    appendHeadCell(subRow, 'th-sub', 'Stage', { style: { color: '#02112A' } });
    appendHeadCell(subRow, 'th-sub', 'Final Decision', { style: { color: '#02112A' } });
    appendHeadCell(subRow, 'th-sub', 'Diploma', { style: { color: '#02112A' } });
    tableHead.appendChild(subRow);
  }

  function renderTableDeMatieresHeader() {
    if (!tableHead) {
      return;
    }

    tableHead.innerHTML = '';

    var row = document.createElement('tr');
    appendHeadCell(row, 'th-group', 'Abrev', { style: { color: '#0F5E9E', minWidth: '70px' } });
    appendHeadCell(row, 'th-group', 'Matiere', { style: { color: '#085454', minWidth: '220px' } });
    appendHeadCell(row, 'th-group', 'Coef S1', { style: { color: '#8B0101', minWidth: '64px' } });
    appendHeadCell(row, 'th-group', 'Coef S2', { style: { color: '#8B0101', minWidth: '64px' } });
    appendHeadCell(row, 'th-group', 'Moy S1', { style: { color: '#25436B', minWidth: '64px' } });
    appendHeadCell(row, 'th-group', 'Moy S1 (80%)', { style: { color: '#25436B', minWidth: '84px' } });
    appendHeadCell(row, 'th-group', 'Moy S2', { style: { color: '#25436B', minWidth: '64px' } });
    appendHeadCell(row, 'th-group', 'Moy S2 (80%)', { style: { color: '#25436B', minWidth: '84px' } });
    appendHeadCell(row, 'th-group', 'Moy Annuel', { style: { color: '#25436B', minWidth: '84px' } });
    appendHeadCell(row, 'th-group', 'Moy Annuel (80%)', { style: { color: '#25436B', minWidth: '102px' } });
    tableHead.appendChild(row);
  }

  function parseMatieresFromResult(resultObj) {
    var result = resultObj || {};
    return (Array.isArray(result.matieres) ? result.matieres : []).map(function (matiere) {
      var coef = matiere && matiere.coef ? matiere.coef : {};
      var moyenne = matiere && matiere.moyenne ? matiere.moyenne : {};
      return {
        abrev: matiere && matiere.abrev != null ? matiere.abrev : '',
        libelle: matiere && matiere.libelle != null ? matiere.libelle : '',
        coefS1: coef.S1,
        coefS2: coef.S2,
        moyS1: moyenne.S1,
        moyS180: moyenne.S1_80pct,
        moyS2: moyenne.S2,
        moyS280: moyenne.S2_80pct,
        moyAnnuel: moyenne.annuel,
        moyAnnuel80: moyenne.annuel_80pct,
      };
    });
  }

  function renderTableDeMatieresRows(result, pageStatus) {
    var matieres = parseMatieresFromResult(result);

    renderTableDeMatieresHeader();
    tableBody.innerHTML = '';

    if (pageExtractionInfo) {
      pageExtractionInfo.textContent = 'Extraction type: table_de_matieres | Page status: ' + pageStatus + ' | Matieres found: ' + matieres.length;
    }

    if (!matieres.length) {
      var emptyRow = document.createElement('tr');
      var emptyCell = document.createElement('td');
      emptyCell.colSpan = 10;
      emptyCell.textContent = 'No matieres found for this table_de_matieres page.';
      emptyCell.style.textAlign = 'center';
      emptyCell.style.padding = '16px';
      emptyRow.appendChild(emptyCell);
      tableBody.appendChild(emptyRow);
      return;
    }

    matieres.forEach(function (matiere, index) {
      var row = document.createElement('tr');
      row.dataset.matiereIndex = String(index);
      row.appendChild(createEditableCell(matiere.abrev, 'matiere_abrev', 'cell-matiere-abrev'));
      row.appendChild(createEditableCell(matiere.libelle, 'matiere_libelle', 'cell-matiere-libelle'));
      row.appendChild(createEditableCell(formatAcademicValue(matiere.coefS1, 2), 'matiere_coef_s1'));
      row.appendChild(createEditableCell(formatAcademicValue(matiere.coefS2, 2), 'matiere_coef_s2'));
      row.appendChild(createEditableCell(formatAcademicValue(matiere.moyS1, 2), 'matiere_moy_s1'));
      row.appendChild(createEditableCell(formatAcademicValue(matiere.moyS180, 2), 'matiere_moy_s1_80'));
      row.appendChild(createEditableCell(formatAcademicValue(matiere.moyS2, 2), 'matiere_moy_s2'));
      row.appendChild(createEditableCell(formatAcademicValue(matiere.moyS280, 2), 'matiere_moy_s2_80'));
      row.appendChild(createEditableCell(formatAcademicValue(matiere.moyAnnuel, 2), 'matiere_moy_annuel'));
      row.appendChild(createEditableCell(formatAcademicValue(matiere.moyAnnuel80, 2), 'matiere_moy_annuel_80'));
      tableBody.appendChild(row);
    });
  }

  function addMatiereRow() {
    if (!editMode) {
      return;
    }
    var page = getCurrentPage();
    if (!page || !page.result || String(page.result.type || '') !== 'table_de_matieres') {
      return;
    }
    var placeholder = tableBody.querySelector('tr:not([data-matiere-index]) td[colspan]');
    if (placeholder && placeholder.parentNode) {
      tableBody.innerHTML = '';
    }
    var index = tableBody.querySelectorAll('tr[data-matiere-index]').length;
    var row = document.createElement('tr');
    row.dataset.matiereIndex = String(index);
    row.appendChild(createEditableCell('', 'matiere_abrev', 'cell-matiere-abrev'));
    row.appendChild(createEditableCell('', 'matiere_libelle', 'cell-matiere-libelle'));
    row.appendChild(createEditableCell('', 'matiere_coef_s1'));
    row.appendChild(createEditableCell('', 'matiere_coef_s2'));
    row.appendChild(createEditableCell('', 'matiere_moy_s1'));
    row.appendChild(createEditableCell('', 'matiere_moy_s1_80'));
    row.appendChild(createEditableCell('', 'matiere_moy_s2'));
    row.appendChild(createEditableCell('', 'matiere_moy_s2_80'));
    row.appendChild(createEditableCell('', 'matiere_moy_annuel'));
    row.appendChild(createEditableCell('', 'matiere_moy_annuel_80'));
    tableBody.appendChild(row);
    applyEditMode(true);
    syncTableActionsWidth();
    refreshModuleValidationState();
  }

  function addModuleColumn() {
    if (!editMode) {
      return;
    }
    var page = getCurrentPage();
    if (!page || !page.result || String(page.result.type || '') === 'table_de_matieres') {
      return;
    }

    var moduleDefs = collectModuleDefinitionsFromHeader();
    var newIndex = moduleDefs.length;
    var newDef = { label: 'Module ' + (newIndex + 1), coefficient: null };
    moduleDefs.push(newDef);

    page.result.modules = toResultModules(moduleDefs);

    var topRow = tableHead.querySelector('tr');
    var subRow = tableHead.querySelector('tr:nth-child(2)');
    if (!topRow || !subRow) {
      renderSelectedPage();
      return;
    }

    var insertIndexTop = 2 + newIndex;
    var moduleTh = buildModuleHeaderCell(newDef, newIndex);
    topRow.insertBefore(moduleTh, topRow.children[insertIndexTop] || null);

    var subTh = document.createElement('th');
    subTh.className = 'th-sub';
    var insertIndexSub = 4 + newIndex;
    subRow.insertBefore(subTh, subRow.children[insertIndexSub] || null);

    tableBody.querySelectorAll('tr[data-student-index]').forEach(function (row) {
      var sem = String(row.dataset.sem || '').toLowerCase();
      if (!sem) {
        return;
      }
      var field = 'module_' + newIndex + '_' + sem;
      var cell = createEditableCell('', field);
      var anchor = row.querySelector('td[data-field="avg_s1"], td[data-field="avg_s2"]');
      row.insertBefore(cell, anchor || null);
    });

    applyEditMode(true);
    syncTableActionsWidth();
    refreshModuleValidationState();
  }

  function getTableColumnCount(moduleCount) {
    return 12 + Number(moduleCount || 0);
  }

  function formatModuleList(rawModules, expectedLength) {
    var modules = Array.isArray(rawModules) ? rawModules.slice() : [];
    var expected = Number(expectedLength || 0);
    while (modules.length < expected) {
      modules.push({});
    }

    return modules.map(function (module) {
      return {
        code: module.code || module.name || '',
        s1: module.noteS1 != null ? module.noteS1 : module.note_s1,
        s2: module.noteS2 != null ? module.noteS2 : module.note_s2,
      };
    });
  }

  function computeAverageFromModules(modules, semKey) {
    var values = (Array.isArray(modules) ? modules : [])
      .map(function (module) { return toFiniteNumberOrNull(module[semKey]); })
      .filter(function (num) { return num != null; });
    if (!values.length) {
      return null;
    }
    var total = values.reduce(function (acc, value) { return acc + value; }, 0);
    return total / values.length;
  }

  function formatAcademicValue(value, decimals) {
    var num = toFiniteNumberOrNull(value);
    if (num == null) {
      return '';
    }
    if (typeof decimals === 'number') {
      return num.toFixed(decimals);
    }
    return String(num);
  }

  function getStudentAcademicData(student, modules) {
    var avgS1 = toFiniteNumberOrNull(student.avg_s1);
    var avgS2 = toFiniteNumberOrNull(student.avg_s2);
    var annualAvg = toFiniteNumberOrNull(student.annual_avg);
    var rankS1 = toFiniteNumberOrNull(student.rank_s1);
    var rankS2 = toFiniteNumberOrNull(student.rank_s2);
    var annualRank = toFiniteNumberOrNull(student.annual_rank);

    if (avgS1 == null) {
      avgS1 = computeAverageFromModules(modules, 's1');
    }
    if (avgS2 == null) {
      avgS2 = computeAverageFromModules(modules, 's2');
    }
    if (annualAvg == null && (avgS1 != null || avgS2 != null)) {
      if (avgS1 != null && avgS2 != null) {
        annualAvg = (avgS1 + avgS2) / 2;
      } else {
        annualAvg = avgS1 != null ? avgS1 : avgS2;
      }
    }

    return {
      avgS1: avgS1,
      avgS2: avgS2,
      annualAvg: annualAvg,
      rankS1: rankS1,
      rankS2: rankS2,
      annualRank: annualRank,
      decisionJune: pickFirstNonEmpty([student.decision_june, student.decision]) || '',
      stage: student.stage || '',
      finalDecision: pickFirstNonEmpty([student.final_decision, student.decision]) || '',
      diploma: student.diploma || '',
    };
  }

  function renderMetadata() {
    var record = getSelectedRecord();
    var sharedMeta = getRecordSharedMeta(record);

    setMetaElementText(metaYear, sharedMeta.year);
    setMetaElementText(metaLevel, sharedMeta.level);
    setMetaElementText(metaSpec, sharedMeta.spec);
    setMetaElementText(metaTitle, sharedMeta.title);
  }

  function createEditableCell(value, field, extraClass) {
    var td = document.createElement('td');
    if (extraClass) {
      td.className = extraClass;
    }
    td.dataset.field = field;
    td.dataset.editable = '1';
    td.textContent = value == null ? '' : String(value);
    return td;
  }

  function getStudentCells(row) {
    return {
      nom: row.querySelector('td[data-field="nom"]'),
      prenom: row.querySelector('td[data-field="prenom"]'),
      matricule: row.querySelector('td[data-field="matricule"]'),
    };
  }

  function setStudentCellsMismatch(cells, message) {
    [cells.nom, cells.prenom].forEach(function (cell) {
      if (!cell) return;
      cell.style.background = '#FFF3CD';
      cell.style.borderColor = '#F59E0B';
      cell.style.cursor = 'pointer';
      cell.title = message || 'Introuvable dans la BDD';
    });
  }

  function clearStudentCellsMismatch(cells) {
    [cells.nom, cells.prenom].forEach(function (cell) {
      if (!cell) return;
      cell.style.background = '';
      cell.style.borderColor = '';
      cell.style.cursor = '';
      cell.title = '';
      cell.onclick = null;
    });
  }

  function openStudentSuggestionDropdown(anchorCell, row, suggestions) {
    if (!anchorCell) {
      return;
    }

    if (activeSuggestionDropdown && activeSuggestionDropdown.dataset.studentIndex === row.dataset.studentIndex) {
      closeActiveSuggestionDropdown();
      return;
    }

    closeActiveSuggestionDropdown();
    anchorCell.style.position = 'relative';

    var dropdown = document.createElement('div');
    dropdown.className = 'suggestion-dropdown open';
    dropdown.style.display = 'block';
    dropdown.dataset.studentIndex = row.dataset.studentIndex || '';
    dropdown.addEventListener('click', function (evt) {
      evt.stopPropagation();
    });

    var header = document.createElement('div');
    header.className = 'suggestion-header';
    header.textContent = 'Correspondances similaires (BDD)';
    dropdown.appendChild(header);

    if (!suggestions.length) {
      var none = document.createElement('div');
      none.className = 'suggestion-none';
      none.textContent = 'Aucune correspondance trouvee';
      dropdown.appendChild(none);
    } else {
      suggestions.forEach(function (candidate) {
        var item = document.createElement('div');
        item.className = 'suggestion-item';

        var left = document.createElement('span');
        left.textContent = String(candidate.full_name || ((candidate.nom || '') + ' ' + (candidate.prenom || '')).trim());
        var right = document.createElement('span');
        right.className = 'suggestion-score';
        right.textContent = String(candidate.score || 0);
        item.appendChild(left);
        item.appendChild(right);

        item.addEventListener('click', async function () {
          var cells = getStudentCells(row);
          if (cells.nom) cells.nom.textContent = candidate.nom || '';
          if (cells.prenom) cells.prenom.textContent = candidate.prenom || '';
          if (cells.matricule && !cells.matricule.textContent.trim() && candidate.matricule) {
            cells.matricule.textContent = candidate.matricule;
          }
          clearStudentCellsMismatch(cells);
          closeActiveSuggestionDropdown();

          try {
            await api.confirmStudentSuggestion({
              selected_student_id: Number(candidate.student_id),
              searched_nom: cells.nom ? cells.nom.dataset.originalNom || cells.nom.textContent.trim() : '',
              searched_prenom: cells.prenom ? cells.prenom.dataset.originalPrenom || cells.prenom.textContent.trim() : '',
              searched_matricule: cells.matricule ? cells.matricule.textContent.trim() || null : null,
              result_count: suggestions.length,
            });
          } catch (_err) {
            // non-blocking
          }
        });

        dropdown.appendChild(item);
      });
    }

    var keepBtn = document.createElement('div');
    keepBtn.className = 'suggestion-keep';
    keepBtn.textContent = 'Conserver la valeur OCR';
    keepBtn.addEventListener('click', function () {
      closeActiveSuggestionDropdown();
    });
    dropdown.appendChild(keepBtn);

    anchorCell.appendChild(dropdown);
    activeSuggestionDropdown = dropdown;
  }

  async function validateStudentNameRows() {
    var page = getCurrentPage();
    var pageType = getPageType(page);
    if (pageType === 'table_de_matieres') {
      var matieresBox = ensureNameValidationBox();
      if (matieresBox) {
        matieresBox.style.display = 'none';
      }
      return { invalidRows: 0, totalRows: 0 };
    }

    var rows = Array.prototype.slice.call(tableBody.querySelectorAll('tr[data-student-index][data-sem="S1"]'));
    if (!rows.length) {
      var noRowsBox = ensureNameValidationBox();
      if (noRowsBox) {
        noRowsBox.style.display = 'none';
      }
      return { invalidRows: 0, totalRows: 0 };
    }

    var runId = ++latestValidationRunId;
    var invalidRows = 0;

    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      var cells = getStudentCells(row);
      if (!cells.nom || !cells.prenom) {
        continue;
      }

      var nom = cells.nom.textContent.trim();
      var prenom = cells.prenom.textContent.trim();
      var matricule = cells.matricule ? cells.matricule.textContent.trim() : '';
      cells.nom.dataset.originalNom = nom;
      cells.prenom.dataset.originalPrenom = prenom;

      try {
        var response = await api.suggestStudents({
          nom: nom,
          prenom: prenom,
          matricule: matricule || null,
          limit: 5,
        });

        if (runId !== latestValidationRunId) {
          return { invalidRows: 0, totalRows: rows.length };
        }

        var suggestions = Array.isArray(response.suggestions) ? response.suggestions : [];
        var exact = suggestions.some(function (candidate) {
          return normalizeText(candidate.nom) === normalizeText(nom) &&
            normalizeText(candidate.prenom) === normalizeText(prenom);
        });

        if (exact) {
          clearStudentCellsMismatch(cells);
          continue;
        }

        invalidRows += 1;
        setStudentCellsMismatch(cells, 'Nom/prenom introuvable en base. Cliquez pour voir des suggestions.');
        [cells.nom, cells.prenom].forEach(function (cell) {
          if (!cell) return;
          cell.onclick = function (evt) {
            evt.stopPropagation();
            openStudentSuggestionDropdown(cell, row, suggestions);
          };
        });
      } catch (_err) {
        invalidRows += 1;
        setStudentCellsMismatch(cells, 'Verification BDD indisponible pour cette ligne.');
        [cells.nom, cells.prenom].forEach(function (cell) {
          if (!cell) return;
          cell.onclick = function (evt) {
            evt.stopPropagation();
            alert('Suggestions indisponibles: endpoint /students/suggestions non joignable pour le moment. Verifiez que le backend est demarre et a jour.');
          };
        });
      }
    }

    var box = ensureNameValidationBox();
    if (box) {
      if (invalidRows > 0) {
        box.style.display = 'block';
        box.textContent = invalidRows + ' etudiant(s) introuvable(s) dans la BDD. Cliquez sur les cellules Nom/Prenom en jaune pour choisir une suggestion.';
      } else {
        box.style.display = 'none';
      }
    }

    return { invalidRows: invalidRows, totalRows: rows.length };
  }

  function renderStudentsTable() {
    var page = getCurrentPage();
    var result = page && page.result ? page.result : {};
    var pageType = String(result.type || 'unknown');
    var pageStatus = page && page.status ? String(page.status) : 'unknown';

    currentPageType = pageType;
    updateEditControlsForPage(pageType);

    if (pageType === 'table_de_matieres') {
      renderTableDeMatieresRows(result, pageStatus);
      applyModuleValidationHighlightsForCurrentPage(page);
      closeActiveSuggestionDropdown();
      var tableMatieresBox = ensureNameValidationBox();
      if (tableMatieresBox) {
        tableMatieresBox.style.display = 'none';
      }
      return;
    }

    var students = parseStudentsFromResult(result);
    var moduleDefs = getPageModuleDefinitions(result, students);
    var moduleCount = moduleDefs.length;
    var genericModuleCount = moduleDefs.filter(function (def) {
      return /^Module\s+\d+$/i.test(String(def.label || '').trim());
    }).length;
    var totalColumns = getTableColumnCount(moduleCount);

    renderTableHeader(moduleDefs);
    tableBody.innerHTML = '';

    if (pageExtractionInfo) {
      pageExtractionInfo.textContent = 'Extraction type: ' + pageType + ' | Page status: ' + pageStatus + ' | Students found: ' + students.length +
        ' | Modules extracted: ' + moduleCount + (genericModuleCount ? (' (naming to review: ' + genericModuleCount + ')') : '');
    }

    if (!students.length) {
      var emptyRow = document.createElement('tr');
      var emptyCell = document.createElement('td');
      emptyCell.colSpan = totalColumns;
      if (pageType === 'table_de_matieres') {
        emptyCell.textContent = 'This page is a subject summary (table_de_matieres), not student rows.';
      } else if (pageType === 'cover') {
        emptyCell.textContent = 'This page is a cover page. No student rows to validate.';
      } else if (pageType === 'unknown') {
        emptyCell.textContent = 'Extractor returned unknown page type for this page.';
      } else {
        emptyCell.textContent = 'No student rows found for this page.';
      }
      emptyCell.style.textAlign = 'center';
      emptyCell.style.padding = '16px';
      emptyRow.appendChild(emptyCell);
      tableBody.appendChild(emptyRow);
      applyModuleValidationHighlightsForCurrentPage(page);
      return;
    }

    students.forEach(function (student, studentIndex) {
      var modules = formatModuleList(student.modules, moduleCount);
      var academic = getStudentAcademicData(student, modules);

      var rowS1 = document.createElement('tr');
      rowS1.dataset.studentIndex = String(studentIndex);
      rowS1.dataset.sem = 'S1';

      var nomCell = createEditableCell(student.nom || '', 'nom');
      nomCell.rowSpan = 2;
      nomCell.style.verticalAlign = 'middle';

      var prenomCell = createEditableCell(student.prenom || '', 'prenom');
      prenomCell.rowSpan = 2;
      prenomCell.style.verticalAlign = 'middle';

      var matriculeCell = createEditableCell(student.matricule || '', 'matricule');
      matriculeCell.rowSpan = 2;
      matriculeCell.style.verticalAlign = 'middle';

      rowS1.appendChild(nomCell);
      rowS1.appendChild(prenomCell);
      rowS1.appendChild(matriculeCell);
      rowS1.appendChild(createEditableCell('S1', 'period', 'cell-sem'));

      modules.forEach(function (module, moduleIndex) {
        rowS1.appendChild(createEditableCell(module.s1 == null ? '' : module.s1, 'module_' + moduleIndex + '_s1'));
      });

      rowS1.appendChild(createEditableCell(formatAcademicValue(academic.avgS1, 2), 'avg_s1', 'cell-avg'));
      rowS1.appendChild(createEditableCell(formatAcademicValue(academic.rankS1), 'rank_s1', 'cell-rank'));

      var annualAvg = createEditableCell(formatAcademicValue(academic.annualAvg, 2), 'annual_avg', 'cell-annual-avg');
      annualAvg.rowSpan = 2;
      var annualRank = createEditableCell(formatAcademicValue(academic.annualRank), 'annual_rank', 'cell-annual-rank');
      annualRank.rowSpan = 2;
      var juneDecision = createEditableCell(academic.decisionJune, 'decision_june');
      juneDecision.rowSpan = 2;
      var stage = createEditableCell(formatAcademicValue(academic.stage, 2), 'stage');
      stage.rowSpan = 2;
      var finalDecision = createEditableCell(academic.finalDecision, 'decision_finale');
      finalDecision.rowSpan = 2;
      var diploma = createEditableCell(academic.diploma, 'diploma');
      diploma.rowSpan = 2;

      rowS1.appendChild(annualAvg);
      rowS1.appendChild(annualRank);
      rowS1.appendChild(juneDecision);
      rowS1.appendChild(stage);
      rowS1.appendChild(finalDecision);
      rowS1.appendChild(diploma);

      var rowS2 = document.createElement('tr');
      rowS2.dataset.studentIndex = String(studentIndex);
      rowS2.dataset.sem = 'S2';
      rowS2.appendChild(createEditableCell('S2', 'period', 'cell-sem'));
      modules.forEach(function (module, moduleIndex) {
        rowS2.appendChild(createEditableCell(module.s2 == null ? '' : module.s2, 'module_' + moduleIndex + '_s2'));
      });
      rowS2.appendChild(createEditableCell(formatAcademicValue(academic.avgS2, 2), 'avg_s2', 'cell-avg'));
      rowS2.appendChild(createEditableCell(formatAcademicValue(academic.rankS2), 'rank_s2', 'cell-rank'));

      tableBody.appendChild(rowS1);
      tableBody.appendChild(rowS2);
    });

    closeActiveSuggestionDropdown();
    applyModuleValidationHighlightsForCurrentPage(page);
    validateStudentNameRows().catch(function () {
      var box = ensureNameValidationBox();
      if (box) {
        box.style.display = 'block';
        box.textContent = 'Erreur: verification BDD des noms/prenoms impossible pour le moment.';
      }
    });
  }

  function renderSelectedPage() {
    renderPreview();
    try {
      renderMetadata();
    } catch (_err) {
      // Keep the validation table visible even if metadata mapping fails.
    }
    renderStudentsTable();
    refreshModuleValidationState();
    syncTableActionsWidth();
    if (editMode) {
      applyEditMode(true);
    }
  }

  function renderQueue() {
    queueList.innerHTML = '';

    if (!records.length) {
      var empty = document.createElement('div');
      empty.className = 'queue-item active';
      empty.innerHTML = '<div class="queue-item-title">No extracted document</div><div class="queue-item-sub">Upload from Digitization first</div>';
      queueList.appendChild(empty);
      renderSelectedPage();
      return;
    }

    records.forEach(function (record, index) {
      var item = document.createElement('div');
      item.className = 'queue-item' + (index === selectedRecordIndex ? ' active' : '');

      var fileName = record.file_name || ('Document ' + (index + 1));
      var okPages = Number(record.ok_pages || 0);
      var totalPages = Number(record.total_pages || 0);
      var failedPages = Number(record.failed_pages || 0);
      var percent = totalPages > 0 ? Math.round((okPages / totalPages) * 100) : 0;
      var statusLabel = getRecordStatusLabel(record);

      item.innerHTML = '<div class="queue-item-title">' + fileName + '</div>' +
        '<div class="queue-item-sub">' + statusLabel + ' • ' + okPages + '/' + totalPages + ' ok • failed: ' + failedPages + ' (' + percent + '%)</div>';

      if (String((record && record.status) || '').toLowerCase() === 'failed') {
        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'queue-item-delete';
        deleteBtn.textContent = '×';
        deleteBtn.title = 'Supprimer ce fichier failed';
        deleteBtn.addEventListener('click', async function (evt) {
          evt.stopPropagation();
          var okDelete = confirm('Supprimer ce fichier failed de la queue ?');
          if (!okDelete) {
            return;
          }
          try {
            if (record.id) {
              await api.deleteCompletedExtraction(record.id);
            }
          } catch (_err) {
            // fallback local removal below
          }

          records.splice(index, 1);
          if (selectedRecordIndex >= records.length) {
            selectedRecordIndex = Math.max(0, records.length - 1);
          }

          try {
            localStorage.setItem('completedExtractions', JSON.stringify(records));
          } catch (_err2) {
            // ignore
          }

          renderQueue();
        });
        item.appendChild(deleteBtn);
      }

      item.addEventListener('click', function () {
        selectedRecordIndex = index;
        currentPageIndex = 0;
        renderQueue();
        renderSelectedPage();
      });

      queueList.appendChild(item);
    });

    renderSelectedPage();
  }

  function applyEditMode(enabled) {
    var editableCells = tableBody.querySelectorAll('td[data-editable="1"]');
    editableCells.forEach(function (cell) {
      cell.contentEditable = enabled ? 'true' : 'false';
      cell.classList.toggle('edit-mode', enabled);
    });

    if (tableHead) {
      var editableHeaders = tableHead.querySelectorAll('[data-editable="1"]');
      editableHeaders.forEach(function (el) {
        el.contentEditable = enabled ? 'true' : 'false';
        el.classList.toggle('editing', enabled);
      });
    }

    [metaYear, metaLevel, metaSpec, metaTitle].forEach(function (el) {
      if (!el) {
        return;
      }
      if (enabled && el && toCleanMetaValue(el.textContent) === '') {
        el.textContent = '';
      }
      el.contentEditable = enabled ? 'true' : 'false';
      el.classList.toggle('editing', enabled);
    });

    if (enabled) {
      editBtn.classList.add('active');
      editBtnLabel.textContent = 'Save Changes';
      editBanner.classList.add('visible');
    } else {
      editBtn.classList.remove('active');
      editBtnLabel.textContent = 'Edit Mode';
      editBanner.classList.remove('visible');
    }

    updateEditControlsForPage(currentPageType);
  }

  function collectStudentsFromTable() {
    var studentsByIndex = {};
    var rows = tableBody.querySelectorAll('tr[data-student-index]');
    var moduleDefs = collectModuleDefinitionsFromHeader();

    rows.forEach(function (row) {
      var studentIndex = row.dataset.studentIndex;
      if (!studentsByIndex[studentIndex]) {
        studentsByIndex[studentIndex] = {
          nom: '',
          prenom: '',
          matricule: null,
          is_first_year: false,
          avg_s1: null,
          avg_s2: null,
          annual_avg: null,
          rank_s1: null,
          rank_s2: null,
          annual_rank: null,
          decision_june: '',
          stage: '',
          final_decision: '',
          diploma: '',
          modules: {},
        };
      }

      var student = studentsByIndex[studentIndex];
      var sem = row.dataset.sem;

      row.querySelectorAll('td[data-field]').forEach(function (cell) {
        var field = cell.dataset.field;
        var value = cell.textContent.trim();

        if (field === 'nom') student.nom = value;
        if (field === 'prenom') student.prenom = value;
        if (field === 'matricule') student.matricule = value || null;
        if (field === 'avg_s1') student.avg_s1 = toFiniteNumberOrNull(value);
        if (field === 'avg_s2') student.avg_s2 = toFiniteNumberOrNull(value);
        if (field === 'annual_avg') student.annual_avg = toFiniteNumberOrNull(value);
        if (field === 'rank_s1') student.rank_s1 = toFiniteNumberOrNull(value);
        if (field === 'rank_s2') student.rank_s2 = toFiniteNumberOrNull(value);
        if (field === 'annual_rank') student.annual_rank = toFiniteNumberOrNull(value);
        if (field === 'decision_june') student.decision_june = value;
        if (field === 'stage') student.stage = value;
        if (field === 'decision_finale') student.final_decision = value;
        if (field === 'diploma') student.diploma = value;

        var moduleMatch = field.match(/^module_(\d+)_(s1|s2)$/);
        if (moduleMatch) {
          var index = moduleMatch[1];
          var targetSem = moduleMatch[2].toUpperCase();
          var num = value === '' ? null : Number(value);
          if (!studentsByIndex[studentIndex].modules[index]) {
            studentsByIndex[studentIndex].modules[index] = { S1: null, S2: null };
          }
          if (targetSem === 'S1' && sem === 'S1') {
            studentsByIndex[studentIndex].modules[index].S1 = Number.isFinite(num) ? num : null;
          }
          if (targetSem === 'S2' && sem === 'S2') {
            studentsByIndex[studentIndex].modules[index].S2 = Number.isFinite(num) ? num : null;
          }
        }
      });
    });

    return Object.keys(studentsByIndex).map(function (key) {
      var student = studentsByIndex[key];
      var modules = moduleDefs.map(function (def, index) {
        var entry = student.modules[index] || {};
        return {
          name: def.label || '',
          coef: def.coefficient != null ? def.coefficient : null,
          noteS1: entry.S1 != null ? entry.S1 : null,
          noteS2: entry.S2 != null ? entry.S2 : null,
        };
      });
      return {
        nom: student.nom,
        prenom: student.prenom,
        matricule: student.matricule,
        is_first_year: false,
        avg_s1: student.avg_s1,
        avg_s2: student.avg_s2,
        annual_avg: student.annual_avg,
        rank_s1: student.rank_s1,
        rank_s2: student.rank_s2,
        annual_rank: student.annual_rank,
        decision_june: student.decision_june || null,
        stage: student.stage || null,
        final_decision: student.final_decision || null,
        diploma: student.diploma || null,
        modules: modules,
      };
    }).filter(function (student) {
      return student.nom && student.prenom;
    });
  }

  function collectMatieresFromTable() {
    var rows = tableBody.querySelectorAll('tr[data-matiere-index]');

    return Array.prototype.slice.call(rows).map(function (row) {
      function getCellValue(field) {
        var cell = row.querySelector('td[data-field="' + field + '"]');
        return cell ? cell.textContent.trim() : '';
      }

      function toNumberOrNull(value) {
        if (value == null || value === '') {
          return null;
        }
        var normalized = String(value).replace(',', '.');
        var num = Number(normalized);
        return Number.isFinite(num) ? num : null;
      }

      return {
        abrev: getCellValue('matiere_abrev'),
        libelle: getCellValue('matiere_libelle'),
        coef: {
          S1: toNumberOrNull(getCellValue('matiere_coef_s1')),
          S2: toNumberOrNull(getCellValue('matiere_coef_s2')),
        },
        moyenne: {
          S1: toNumberOrNull(getCellValue('matiere_moy_s1')),
          S1_80pct: toNumberOrNull(getCellValue('matiere_moy_s1_80')),
          S2: toNumberOrNull(getCellValue('matiere_moy_s2')),
          S2_80pct: toNumberOrNull(getCellValue('matiere_moy_s2_80')),
          annuel: toNumberOrNull(getCellValue('matiere_moy_annuel')),
          annuel_80pct: toNumberOrNull(getCellValue('matiere_moy_annuel_80')),
        },
      };
    }).filter(function (matiere) {
      return matiere.abrev || matiere.libelle;
    });
  }

  function toAcademicNumberOrNull(value) {
    if (value == null || value === '') {
      return null;
    }
    var normalized = String(value).replace(',', '.');
    var num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  }

  function normalizeModuleAbrev(value) {
    return normalizeText(value || '').replace(/\s+/g, ' ').trim();
  }

  function getValidationPageKey(page) {
    return String(Number((page && page.page_number) || 0)) + '|' + getPageType(page);
  }

  function clearModuleValidationHighlights() {
    moduleValidationHighlightCount = 0;
    document.querySelectorAll('.module-validation-error, .module-validation-warning').forEach(function (el) {
      el.classList.remove('module-validation-error');
      el.classList.remove('module-validation-warning');
      if (el.dataset && el.dataset.validationStyleTouched === '1') {
        el.style.removeProperty('background-color');
        el.style.removeProperty('border-color');
        el.style.removeProperty('color');
        el.style.removeProperty('box-shadow');
        delete el.dataset.validationStyleTouched;
      }
      if (el.dataset && el.dataset.validationOutlineTouched === '1') {
        el.style.outline = '';
        el.style.outlineOffset = '';
        delete el.dataset.validationOutlineTouched;
      }
      if (el.dataset && el.dataset.validationTitleTouched === '1') {
        el.removeAttribute('title');
        delete el.dataset.validationTitleTouched;
      }
    });
  }

  function markValidationElementError(element, message) {
    if (!element) {
      return;
    }
    if (!element.classList.contains('module-validation-error')) {
      moduleValidationHighlightCount += 1;
    }
    element.classList.add('module-validation-error');
    element.style.setProperty('background-color', '#FEE2E2', 'important');
    element.style.setProperty('border-color', '#DC2626', 'important');
    element.style.setProperty('color', '#7F1D1D', 'important');
    element.style.setProperty('box-shadow', 'inset 0 0 0 1px rgba(220, 38, 38, 0.35)', 'important');
    element.dataset.validationStyleTouched = '1';
    element.style.outline = '2px solid #DC2626';
    element.style.outlineOffset = '-2px';
    element.dataset.validationOutlineTouched = '1';
    if (message) {
      element.title = message;
      element.dataset.validationTitleTouched = '1';
    }
  }

  function markValidationElementWarning(element, message) {
    if (!element) {
      return;
    }
    if (!element.classList.contains('module-validation-error') && !element.classList.contains('module-validation-warning')) {
      moduleValidationHighlightCount += 1;
    }
    element.classList.add('module-validation-warning');
    element.style.setProperty('background-color', '#FEF9C3', 'important');
    element.style.setProperty('border-color', '#EAB308', 'important');
    element.style.setProperty('color', '#713F12', 'important');
    element.style.setProperty('box-shadow', 'inset 0 0 0 1px rgba(202, 138, 4, 0.35)', 'important');
    element.dataset.validationStyleTouched = '1';
    element.style.outline = '2px solid #EAB308';
    element.style.outlineOffset = '-2px';
    element.dataset.validationOutlineTouched = '1';
    if (message) {
      element.title = message;
      element.dataset.validationTitleTouched = '1';
    }
  }

  function applyModuleValidationHighlightsForCurrentPage(page) {
    clearModuleValidationHighlights();

    if (!page) {
      return;
    }

    var pageKey = getValidationPageKey(page);
    var issues = moduleValidationIssuesByPageKey[pageKey] || [];

    issues.forEach(function (issue) {
      if (issue.kind === 'header-count-mismatch') {
        var labels = tableHead ? tableHead.querySelectorAll('th[data-module-index] .module-label') : [];
        if (!labels.length) {
          markValidationElementError(tableHead, issue.message);
          return;
        }
        labels.forEach(function (labelEl) {
          markValidationElementError(labelEl, issue.message);
        });
        return;
      }

      if (issue.kind === 'module-name-mismatch') {
        markValidationElementError(
          tableHead && tableHead.querySelector('th[data-module-index="' + issue.moduleIndex + '"] .module-label'),
          issue.message
        );
        return;
      }

      if (issue.kind === 'coef-intersection') {
        var semField = String(issue.sem || '').toLowerCase() === 's1' ? 's1' : 's2';
        markValidationElementError(
          tableBody && tableBody.querySelector('tr[data-student-index="' + issue.studentIndex + '"][data-sem="' + issue.sem + '"] td[data-field="module_' + issue.moduleIndex + '_' + semField + '"]'),
          issue.message
        );
        return;
      }

      if (issue.kind === 'missing-note-required') {
        var requiredSemField = String(issue.sem || '').toLowerCase() === 's1' ? 's1' : 's2';
        markValidationElementWarning(
          tableBody && tableBody.querySelector('tr[data-student-index="' + issue.studentIndex + '"][data-sem="' + issue.sem + '"] td[data-field="module_' + issue.moduleIndex + '_' + requiredSemField + '"]'),
          issue.message
        );
      }
    });
  }

  function refreshModuleValidationState() {
    var record = getSelectedRecord();
    var page = getCurrentPage();
    if (!record || !page) {
      clearModuleValidationHighlights();
      return { ok: true };
    }
    return validateRecordModulesBeforeDatabaseSave(record, page, {
      applyHighlights: true,
      suppressNoTableError: true,
    });
  }

  function buildTableMatieresMap(record, currentPage) {
    var pages = getSortedPages(record);
    var map = {};
    var ordered = [];

    pages.forEach(function (page) {
      var pageType = getPageType(page);
      if (pageType !== 'table_de_matieres') {
        return;
      }

      var matieres = [];
      if (page === currentPage) {
        matieres = collectMatieresFromTable().map(function (matiere) {
          return {
            abrev: matiere.abrev,
            coefS1: matiere && matiere.coef ? matiere.coef.S1 : null,
            coefS2: matiere && matiere.coef ? matiere.coef.S2 : null,
          };
        });
      } else {
        matieres = parseMatieresFromResult(page.result || {});
      }

      matieres.forEach(function (matiere) {
        var key = normalizeModuleAbrev(matiere.abrev);
        if (!key) {
          return;
        }

        var existing = map[key] || {
          key: key,
          abrev: String(matiere.abrev || '').trim(),
          coefS1: null,
          coefS2: null,
        };

        var coefS1 = toAcademicNumberOrNull(matiere.coefS1);
        var coefS2 = toAcademicNumberOrNull(matiere.coefS2);

        if (!map[key]) {
          ordered.push(existing);
        }

        if (existing.coefS1 == null && coefS1 != null) {
          existing.coefS1 = coefS1;
        }
        if (existing.coefS2 == null && coefS2 != null) {
          existing.coefS2 = coefS2;
        }

        map[key] = existing;
      });
    });

    return {
      ordered: ordered,
      map: map,
    };
  }

  function collectStudentSnapshotsForValidation(record, currentPage) {
    var pages = getSortedPages(record);
    var snapshots = [];

    pages.forEach(function (page) {
      var pageType = getPageType(page);
      if (pageType === 'table_de_matieres') {
        return;
      }

      var isCurrentPage = page === currentPage;
      var students = [];
      var moduleDefs = [];

      if (isCurrentPage && pageType !== 'table_de_matieres') {
        students = collectStudentsFromTable();
        moduleDefs = collectModuleDefinitionsFromHeader();
      } else {
        var result = page && page.result ? page.result : {};
        students = parseStudentsFromResult(result);
        moduleDefs = getPageModuleDefinitions(result, students);
      }

      if (!moduleDefs.length || !students.length) {
        return;
      }

      students.forEach(function (student, studentIndex) {
        var modules = [];

        if (isCurrentPage) {
          modules = (Array.isArray(student.modules) ? student.modules : []).map(function (module, moduleIndex) {
            return {
              index: moduleIndex,
              abrevRaw: module && module.name != null ? module.name : '',
              noteS1: module ? toAcademicNumberOrNull(module.noteS1) : null,
              noteS2: module ? toAcademicNumberOrNull(module.noteS2) : null,
            };
          });
        } else {
          var normalizedModules = formatModuleList(student.modules, moduleDefs.length);
          modules = normalizedModules.map(function (module, moduleIndex) {
            var def = moduleDefs[moduleIndex] || {};
            return {
              index: moduleIndex,
              abrevRaw: module && module.code ? module.code : (def.label || ''),
              noteS1: toAcademicNumberOrNull(module.s1),
              noteS2: toAcademicNumberOrNull(module.s2),
            };
          });
        }

        snapshots.push({
          page: page,
          pageNumber: Number(page.page_number || 0),
          isCurrentPage: isCurrentPage,
          studentIndex: studentIndex,
          studentName: (String(student.nom || '').trim() + ' ' + String(student.prenom || '').trim()).trim() || ('Student #' + (studentIndex + 1)),
          modules: modules,
        });
      });
    });

    return snapshots;
  }

  function validateRecordModulesBeforeDatabaseSave(record, currentPage, options) {
    var opts = options || {};
    var shouldApplyHighlights = opts.applyHighlights !== false;
    var suppressNoTableError = opts.suppressNoTableError === true;

    moduleValidationIssuesByPageKey = {};
    clearModuleValidationHighlights();

    var tableRef = buildTableMatieresMap(record, currentPage);
    var tableMap = tableRef.map;
    var tableOrdered = tableRef.ordered;
    var tableKeys = Object.keys(tableMap);
    var errors = [];
    var pageIssueSeen = {};

    function pushIssueForPage(page, issue) {
      var key = getValidationPageKey(page);
      if (!moduleValidationIssuesByPageKey[key]) {
        moduleValidationIssuesByPageKey[key] = [];
      }
      var signature = key + '|' + issue.kind + '|' + String(issue.moduleIndex || '') + '|' + String(issue.studentIndex || '') + '|' + String(issue.sem || '') + '|' + String(issue.message || '');
      if (pageIssueSeen[signature]) {
        return;
      }
      pageIssueSeen[signature] = true;
      moduleValidationIssuesByPageKey[key].push(issue);
    }

    if (!tableKeys.length) {
      if (suppressNoTableError) {
        return { ok: true };
      }
      return {
        ok: false,
        message: 'Impossible de sauvegarder: aucune matiere (abrev) detectee dans table_de_matieres.',
      };
    }

    var snapshots = collectStudentSnapshotsForValidation(record, currentPage);

    snapshots.forEach(function (snapshot) {
      var studentModules = Array.isArray(snapshot.modules) ? snapshot.modules : [];

      if (studentModules.length !== tableOrdered.length) {
        var countMessage = 'Page ' + snapshot.pageNumber + ': nombre de modules differents de table_de_matieres (' + studentModules.length + ' vs ' + tableOrdered.length + ').';
        errors.push(countMessage);
        pushIssueForPage(snapshot.page, {
          kind: 'header-count-mismatch',
          message: 'Nombre de modules different de table_de_matieres.',
        });
      }

      studentModules.forEach(function (moduleEntry) {
        var abrevKey = normalizeModuleAbrev(moduleEntry.abrevRaw);
        var hasS1 = moduleEntry.noteS1 != null;
        var hasS2 = moduleEntry.noteS2 != null;
        var tableModuleByName = abrevKey ? tableMap[abrevKey] : null;
        var tableModuleByIndex = tableOrdered[moduleEntry.index] || null;
        var tableModule = tableModuleByName || tableModuleByIndex;

        if (studentModules.length === tableOrdered.length && !tableModuleByName) {
          var expectedAbrev = tableModuleByIndex && tableModuleByIndex.abrev ? String(tableModuleByIndex.abrev) : '';
          var wrongNameMessage = 'Page ' + snapshot.pageNumber + ': nom module invalide "' + String(moduleEntry.abrevRaw || '') + '" (abrev absent de table_de_matieres' + (expectedAbrev ? ', attendu: ' + expectedAbrev : '') + ').';
          errors.push(wrongNameMessage);
          pushIssueForPage(snapshot.page, {
            kind: 'module-name-mismatch',
            moduleIndex: moduleEntry.index,
            message: 'Nom de module invalide (abrev absent de table_de_matieres' + (expectedAbrev ? ', attendu: ' + expectedAbrev : '') + ').',
          });
          return;
        }

        if (!tableModule) {
          return;
        }

        if (hasS1 && tableModule.coefS1 == null) {
          errors.push('Page ' + snapshot.pageNumber + ' - ' + snapshot.studentName + ': note S1 pour "' + tableModule.abrev + '" mais coef S1 vide dans table_de_matieres.');
          pushIssueForPage(snapshot.page, {
            kind: 'coef-intersection',
            studentIndex: snapshot.studentIndex,
            sem: 'S1',
            moduleIndex: moduleEntry.index,
            message: 'Note S1 presente alors que coef S1 est vide dans table_de_matieres.',
          });
        }

        if (!hasS1 && tableModule.coefS1 != null) {
          errors.push('Page ' + snapshot.pageNumber + ' - ' + snapshot.studentName + ': note S1 manquante pour "' + tableModule.abrev + '" alors que coef S1 est renseigne dans table_de_matieres.');
          pushIssueForPage(snapshot.page, {
            kind: 'missing-note-required',
            studentIndex: snapshot.studentIndex,
            sem: 'S1',
            moduleIndex: moduleEntry.index,
            message: 'Note S1 manquante: coef S1 existe dans table_de_matieres.',
          });
        }

        if (hasS2 && tableModule.coefS2 == null) {
          errors.push('Page ' + snapshot.pageNumber + ' - ' + snapshot.studentName + ': note S2 pour "' + tableModule.abrev + '" mais coef S2 vide dans table_de_matieres.');
          pushIssueForPage(snapshot.page, {
            kind: 'coef-intersection',
            studentIndex: snapshot.studentIndex,
            sem: 'S2',
            moduleIndex: moduleEntry.index,
            message: 'Note S2 presente alors que coef S2 est vide dans table_de_matieres.',
          });
        }

        if (!hasS2 && tableModule.coefS2 != null) {
          errors.push('Page ' + snapshot.pageNumber + ' - ' + snapshot.studentName + ': note S2 manquante pour "' + tableModule.abrev + '" alors que coef S2 est renseigne dans table_de_matieres.');
          pushIssueForPage(snapshot.page, {
            kind: 'missing-note-required',
            studentIndex: snapshot.studentIndex,
            sem: 'S2',
            moduleIndex: moduleEntry.index,
            message: 'Note S2 manquante: coef S2 existe dans table_de_matieres.',
          });
        }
      });
    });

    if (!errors.length) {
      moduleValidationIssuesByPageKey = {};
      return { ok: true };
    }

    if (shouldApplyHighlights) {
      applyModuleValidationHighlightsForCurrentPage(currentPage);
    }

    var uniqueErrors = [];
    var seen = {};
    errors.forEach(function (line) {
      if (!seen[line]) {
        seen[line] = true;
        uniqueErrors.push(line);
      }
    });

    var previewLines = uniqueErrors.slice(0, 10);
    var suffix = uniqueErrors.length > 10 ? ('\n... ' + (uniqueErrors.length - 10) + ' autre(s) erreur(s).') : '';

    return {
      ok: false,
      message: 'Sauvegarde BDD bloquee. Corrigez les champs surlignes (jaune/rouge).\n\n' + previewLines.join('\n') + suffix,
    };
  }

  function saveCurrentRecordLocally() {
    writeLocalRecords(records);
  }

  async function saveCurrentPageChanges(syncToDatabase) {
    var shouldSyncToDatabase = syncToDatabase !== false;

    if (shouldSyncToDatabase) {
      setSyncReportStatus('pending', 'Syncing...');
      var nameCheck = await validateStudentNameRows();
      if (nameCheck.invalidRows > 0) {
        var proceed = confirm(
          nameCheck.invalidRows + ' etudiant(s) ont un nom/prenom introuvable en BDD.\n' +
          'Voulez-vous enregistrer les changements quand meme ?'
        );
        if (!proceed) {
          return;
        }
      }
    }

    var page = getCurrentPage();
    var record = getSelectedRecord();
    if (!page || !page.result) {
      alert('No current page selected.');
      return;
    }

    if (!record) {
      alert('No current record selected.');
      return;
    }

    var result = page.result;
    var sharedMeta = collectSharedMetaFromUI();
    applySharedMetaToRecord(record, sharedMeta);

    if (String(result.type || '') === 'table_de_matieres') {
      result.matieres = collectMatieresFromTable();
      saveCurrentRecordLocally();
      if (shouldSyncToDatabase) {
        var tableValidation = validateRecordModulesBeforeDatabaseSave(record, page, {
          applyHighlights: true,
          suppressNoTableError: false,
        });
        if (!tableValidation.ok) {
          setSyncReportStatus('error', 'Blocked');
          if (syncReportMeta) {
            syncReportMeta.textContent = 'Validation failed before database sync';
          }
          if (syncReportBody) {
            syncReportBody.textContent = tableValidation.message;
          }
          return;
        }

        try {
          var tableSync = await api.saveValidationRecord({
            record_id: record.id || null,
            record: record,
            source: 'validation_edit',
          });
          renderSyncReport(tableSync, false);
        } catch (err) {
          renderSyncReport(err && err.message ? err.message : err, true);
        }
      } else {
        alert('Changes saved locally for table_de_matieres page. Click Validate and Save to sync to database.');
      }
      return;
    }

    var students = collectStudentsFromTable();
    result.modules = toResultModules(collectModuleDefinitionsFromHeader());
    if (!students.length) {
      var emptyProceed = confirm('No valid student rows found. Save metadata changes only?');
      if (!emptyProceed) {
        return;
      }
    } else {
      result.students = students;
    }

    saveCurrentRecordLocally();
    if (shouldSyncToDatabase) {
      var moduleValidation = validateRecordModulesBeforeDatabaseSave(record, page, {
        applyHighlights: true,
        suppressNoTableError: false,
      });
      if (!moduleValidation.ok) {
        setSyncReportStatus('error', 'Blocked');
        if (syncReportMeta) {
          syncReportMeta.textContent = 'Validation failed before database sync';
        }
        if (syncReportBody) {
          syncReportBody.textContent = moduleValidation.message;
        }
        return;
      }

      try {
        var syncReport = await api.saveValidationRecord({
          record_id: record.id || null,
          record: record,
          source: 'validation_edit',
        });
        renderSyncReport(syncReport, false);
      } catch (err) {
        renderSyncReport(err && err.message ? err.message : err, true);
      }
    } else {
      alert('Changes saved locally. Click Validate and Save to sync to database.');
    }
  }

  async function saveValidatedStudents() {
    return saveCurrentPageChanges(true);
  }

  function changePage(dir) {
    var record = getSelectedRecord();
    if (!record) {
      return;
    }

    var pages = getSortedPages(record);
    if (!pages.length) {
      return;
    }

    currentPageIndex = Math.max(0, Math.min(pages.length - 1, currentPageIndex + dir));
    renderSelectedPage();
  }

  function toggleEditMode() {
    editMode = !editMode;
    applyEditMode(editMode);
    refreshModuleValidationState();

    if (!editMode) {
      saveCurrentPageChanges(false);
    }
  }

  function setupActions() {
    var validateBtn = document.querySelector('.btn-validate');
    var rejectBtn = document.querySelector('.btn-reject');

    if (validateBtn) {
      validateBtn.addEventListener('click', function () {
        saveValidatedStudents();
      });
    }

    if (rejectBtn) {
      rejectBtn.addEventListener('click', function () {
        alert('Document rejected. Upload a corrected scan from Digitization.');
      });
    }

    if (addModuleBtn) {
      addModuleBtn.addEventListener('click', function (evt) {
        evt.preventDefault();
        addModuleColumn();
      });
    }

    if (addMatiereBtn) {
      addMatiereBtn.addEventListener('click', function (evt) {
        evt.preventDefault();
        addMatiereRow();
      });
    }

    window.addEventListener('resize', syncTableActionsWidth);

    function onValidationEditableInput() {
      refreshModuleValidationState();
    }

    if (tableBody) {
      tableBody.addEventListener('input', onValidationEditableInput);
    }
    if (tableHead) {
      tableHead.addEventListener('input', onValidationEditableInput);
    }

    [metaYear, metaLevel, metaSpec, metaTitle].forEach(function (el) {
      if (!el) {
        return;
      }
      el.addEventListener('input', syncSharedMetaFromInputsToRecord);
    });
  }

  function setupQueueScroll() {
    if (!queueList || !queueList.parentElement) {
      return;
    }
    var queueScroll = queueList.parentElement;

    queueScroll.addEventListener('wheel', function (evt) {
      var canScroll = queueScroll.scrollHeight > queueScroll.clientHeight;
      if (!canScroll) {
        return;
      }
      evt.preventDefault();
      evt.stopPropagation();
      queueScroll.scrollTop += evt.deltaY;
    }, { passive: false });
  }

  async function init() {
    document.addEventListener('click', closeActiveSuggestionDropdown);
    if (previewCard) {
      previewCard.addEventListener('wheel', function (evt) {
        if (!previewHasImage) {
          return;
        }
        evt.preventDefault();
        if (evt.ctrlKey) {
          adjustPreviewZoom(evt.deltaY < 0 ? 0.1 : -0.1);
          return;
        }
        panPreview(-evt.deltaX, -evt.deltaY);
      }, { passive: false });

      previewCard.addEventListener('mousedown', function (evt) {
        if (!previewHasImage || previewZoom <= 1) {
          return;
        }
        previewDragging = true;
        previewDragStartX = evt.clientX;
        previewDragStartY = evt.clientY;
        updatePreviewZoomDisplay();
      });

      document.addEventListener('mousemove', function (evt) {
        if (!previewDragging) {
          return;
        }
        var dx = evt.clientX - previewDragStartX;
        var dy = evt.clientY - previewDragStartY;
        previewDragStartX = evt.clientX;
        previewDragStartY = evt.clientY;
        panPreview(dx, dy);
      });

      document.addEventListener('mouseup', function () {
        if (!previewDragging) {
          return;
        }
        previewDragging = false;
        updatePreviewZoomDisplay();
      });
    }
    setDate();
    setupSidebar();
    setupActions();
    setupQueueScroll();
    await loadRecords();
    applyRecordSelectionFromQuery();
    renderQueue();
  }

  window.changePage = changePage;
  window.toggleEditMode = toggleEditMode;
  window.setActive = setActive;
  window.adjustPreviewZoom = adjustPreviewZoom;
  window.resetPreviewZoom = resetPreviewZoom;

  init();
})();
