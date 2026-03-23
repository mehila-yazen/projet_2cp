(function () {
  var api = new window.DigitizationApiClient();
  var records = [];
  var selectedRecordIndex = 0;
  var currentPageIndex = 0;
  var editMode = false;

  var queueList = document.getElementById('queueList');
  var pageLabel = document.getElementById('pageLabel');
  var pageInfo = document.getElementById('pageInfo');
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
      previewCard.style.backgroundPosition = 'center';
      previewCard.style.backgroundSize = 'contain';
      previewCard.style.backgroundRepeat = 'no-repeat';
      previewCard.style.backgroundImage = imageUrl ? ('url("' + imageUrl + '")') : 'none';
    }
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
        decision: (result.summary && result.summary.observation) || null,
      }];
    }

    if (type === 'multiple_students') {
      return (Array.isArray(result.students) ? result.students : []).map(function (student) {
        return {
          nom: student.nom || '',
          prenom: student.prenom || '',
          matricule: student.matricule || null,
          modules: Array.isArray(student.modules) ? student.modules : [],
          decision: student.decisionFinaleDuConseil || student.decisionDeJuin || null,
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
        };
      });
    }

    return [];
  }

  function formatModuleList(rawModules) {
    var modules = (Array.isArray(rawModules) ? rawModules : []).slice(0, 8);
    while (modules.length < 8) {
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

  function renderStudentsTable() {
    var page = getCurrentPage();
    var result = page && page.result ? page.result : {};
    var students = parseStudentsFromResult(result);
    var pageType = String(result.type || 'unknown');
    var pageStatus = page && page.status ? String(page.status) : 'unknown';

    tableBody.innerHTML = '';

    var infoRow = document.createElement('tr');
    var infoCell = document.createElement('td');
    infoCell.colSpan = 20;
    infoCell.style.textAlign = 'left';
    infoCell.style.padding = '8px 12px';
    infoCell.style.fontWeight = '600';
    infoCell.textContent = 'Extraction type: ' + pageType + ' | Page status: ' + pageStatus + ' | Students found: ' + students.length;
    infoRow.appendChild(infoCell);
    tableBody.appendChild(infoRow);

    if (!students.length) {
      var emptyRow = document.createElement('tr');
      var emptyCell = document.createElement('td');
      emptyCell.colSpan = 20;
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
      var modules = formatModuleList(student.modules);

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

      rowS1.appendChild(createEditableCell('', 'avg_s1', 'cell-avg'));
      rowS1.appendChild(createEditableCell('', 'rank_s1', 'cell-rank'));

      var annualAvg = createEditableCell('', 'annual_avg', 'cell-annual-avg');
      annualAvg.rowSpan = 2;
      var annualRank = createEditableCell('', 'annual_rank', 'cell-annual-rank');
      annualRank.rowSpan = 2;
      var juneDecision = createEditableCell(student.decision || '', 'decision_june');
      juneDecision.rowSpan = 2;
      var stage = createEditableCell('', 'stage');
      stage.rowSpan = 2;
      var finalDecision = createEditableCell(student.decision || '', 'decision_finale');
      finalDecision.rowSpan = 2;
      var diploma = createEditableCell('', 'diploma');
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
      rowS2.appendChild(createEditableCell('', 'avg_s2', 'cell-avg'));
      rowS2.appendChild(createEditableCell('', 'rank_s2', 'cell-rank'));

      tableBody.appendChild(rowS1);
      tableBody.appendChild(rowS2);
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

  async function init() {
    setDate();
    setupSidebar();
    setupActions();
    await loadRecords();
    renderQueue();
  }

  window.changePage = changePage;
  window.toggleEditMode = toggleEditMode;
  window.setActive = setActive;

  init();
})();
