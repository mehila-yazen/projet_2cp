(function () {
  var api = new window.DigitizationApiClient();
  var records = [];
  var selectedRecordIndex = 0;
  var currentPageIndex = 0;
  var editMode = false;

  var queueList = document.getElementById('queueList');
  var pageLabel = document.getElementById('pageLabel');
  var pageInfo = document.getElementById('pageInfo');
  var tableHead = document.getElementById('tableHead');
  var tableBody = document.getElementById('tableBody');
  var metaYear = document.getElementById('meta-year');
  var metaLevel = document.getElementById('meta-level');
  var metaSpec = document.getElementById('meta-spec');
  var metaSystem = document.getElementById('meta-system');
  var editBtn = document.getElementById('editBtn');
  var editBtnLabel = document.getElementById('editBtnLabel');
  var editBanner = document.getElementById('editBanner');
  var previewCard = document.querySelector('.pdf-placeholder');
  var warningBox = document.querySelector('.warning-box');
  var pageExtractionInfo = document.getElementById('pageExtractionInfo');
  var zoomValueEl = document.getElementById('zoomValue');
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

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
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
      var raw = localStorage.getItem('completedExtractions');
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
      return [];
    }
  }

  async function loadRecords() {
    try {
      var response = await api.getCompletedExtractions(100);
      var backendRecords = Array.isArray(response.records) ? response.records : [];
      if (backendRecords.length) {
        records = backendRecords;
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

  function renderTableHeader(moduleDefs) {
    if (!tableHead) {
      return;
    }

    var modules = Array.isArray(moduleDefs) ? moduleDefs : [];
    tableHead.innerHTML = '';

    var topRow = document.createElement('tr');
    appendHeadCell(topRow, 'th-group', 'Student Information', { colSpan: 3, style: { color: '#5F049C' } });
    appendHeadCell(topRow, 'th-group', 'Period', { style: { color: '#07A1A1' } });

    modules.forEach(function (moduleDef) {
      var th = document.createElement('th');
      th.className = 'th-group';
      th.style.color = '#085454';
      th.style.minWidth = '52px';
      th.style.fontSize = '9.5px';
      th.textContent = moduleDef.label == null ? '' : String(moduleDef.label);
      if (moduleDef.coefficient != null) {
        var coefDiv = document.createElement('div');
        coefDiv.style.color = '#8B0101';
        coefDiv.style.fontSize = '8.5px';
        coefDiv.style.fontWeight = '700';
        coefDiv.style.marginTop = '1px';
        coefDiv.textContent = 'Coef: ' + moduleDef.coefficient;
        th.appendChild(coefDiv);
      }
      topRow.appendChild(th);
    });

    appendHeadCell(topRow, 'th-group', 'Moy S1/S2', { style: { color: '#25436B', minWidth: '64px' } });
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
    var page = getCurrentPage();
    var result = page && page.result ? page.result : {};

    var year = result.annee || '';
    var level = result.anneeEtude || '';
    var spec = result.section || result.option || result.sectionCode || result.type || '';

    metaYear.textContent = year || 'N/A';
    metaLevel.textContent = level || 'N/A';
    metaSpec.textContent = spec || 'N/A';

    var systemSpan = metaSystem.querySelector('span');
    if (systemSpan) {
      systemSpan.textContent = 'Semester System';
    }
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
    var students = parseStudentsFromResult(result);
    var moduleDefs = getPageModuleDefinitions(result, students);
    var moduleCount = moduleDefs.length;
    var genericModuleCount = moduleDefs.filter(function (def) {
      return /^Module\s+\d+$/i.test(String(def.label || '').trim());
    }).length;
    var totalColumns = getTableColumnCount(moduleCount);
    var pageType = String(result.type || 'unknown');
    var pageStatus = page && page.status ? String(page.status) : 'unknown';

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
    renderMetadata();
    renderStudentsTable();
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

    [metaYear, metaLevel, metaSpec].forEach(function (el) {
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
  }

  function collectStudentsFromTable() {
    var studentsByIndex = {};
    var rows = tableBody.querySelectorAll('tr[data-student-index]');

    rows.forEach(function (row) {
      var studentIndex = row.dataset.studentIndex;
      if (!studentsByIndex[studentIndex]) {
        studentsByIndex[studentIndex] = {
          nom: '',
          prenom: '',
          matricule: null,
          is_first_year: false,
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
      return {
        nom: student.nom,
        prenom: student.prenom,
        matricule: student.matricule,
        is_first_year: false,
      };
    }).filter(function (student) {
      return student.nom && student.prenom;
    });
  }

  async function saveValidatedStudents() {
    var nameCheck = await validateStudentNameRows();
    if (nameCheck.invalidRows > 0) {
      alert('Impossible de sauvegarder: ' + nameCheck.invalidRows + ' etudiant(s) ont un nom/prenom introuvable en BDD. Corrigez-les via les suggestions.');
      return;
    }

    var students = collectStudentsFromTable();
    if (!students.length) {
      alert('No valid student rows to save.');
      return;
    }

    var payload = {
      annee_univ: metaYear.textContent.trim() || null,
      students: students,
    };

    try {
      var result = await api.saveVerifiedStudents(payload);
      alert('Saved: ' + Number(result.saved_count || 0) + ' | Failed: ' + Number(result.failed_count || 0));
    } catch (err) {
      alert((err && err.message) || 'Failed to save validated students.');
    }
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

    if (!editMode) {
      saveValidatedStudents();
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
    renderQueue();
  }

  window.changePage = changePage;
  window.toggleEditMode = toggleEditMode;
  window.setActive = setActive;
  window.adjustPreviewZoom = adjustPreviewZoom;
  window.resetPreviewZoom = resetPreviewZoom;

  init();
})();
