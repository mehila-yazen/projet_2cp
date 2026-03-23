
/* Date */
  var days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var now = new Date();
  var el = document.getElementById('headerDate');
  if (el) el.textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();

// ── NAV ACTIVE ────────────────────────────────────────
function setActive(el) {
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.remove('active');
    const svg = n.querySelector('svg');
    if (svg) {
      if (svg.getAttribute('fill') && svg.getAttribute('fill') !== 'none') svg.setAttribute('fill', '#266FA3');
      if (svg.getAttribute('stroke') && svg.getAttribute('stroke') !== 'none') svg.setAttribute('stroke', '#266FA3');
      svg.querySelectorAll('path, circle, ellipse, line, polyline, rect, polygon').forEach(child => {
        if (child.getAttribute('stroke') && child.getAttribute('stroke') !== 'none') child.setAttribute('stroke', '#266FA3');
        if (child.getAttribute('fill') && child.getAttribute('fill') !== 'none') child.setAttribute('fill', '#266FA3');
      });
    }
  });
  el.classList.add('active');
  const svg = el.querySelector('svg');
  if (svg) {
    if (svg.getAttribute('fill') && svg.getAttribute('fill') !== 'none') svg.setAttribute('fill', 'white');
    if (svg.getAttribute('stroke') && svg.getAttribute('stroke') !== 'none') svg.setAttribute('stroke', 'white');
    svg.querySelectorAll('path, circle, ellipse, line, polyline, rect, polygon').forEach(child => {
      if (child.getAttribute('stroke') && child.getAttribute('stroke') !== 'none') child.setAttribute('stroke', 'white');
      if (child.getAttribute('fill') && child.getAttribute('fill') !== 'none') child.setAttribute('fill', 'white');
    });
  }
}

// ── SIDEBAR ───────────────────────────────────────────
document.getElementById('collapseBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
});

const sidebar = document.getElementById('sidebar');
const logo = document.querySelector('.sidebar-logo .esi svg');
if (logo && sidebar) {
  logo.addEventListener('click', () => {
    if (sidebar.classList.contains('collapsed')) sidebar.classList.remove('collapsed');
  });
}

// Init: apply active icon color on load
(function() {
  const activeItem = document.querySelector('.nav-item.active');
  if (activeItem) setActive(activeItem);
})();

// ── PAGINATION + QUEUE (completed extractions) ────────
const EXTRACTIONS_STORAGE_KEY = 'completedExtractions';
const queueList = document.getElementById('queueList');

let currentPage = 1;
let totalPages = 1;
let activeDocumentIndex = 0;
let extractionDocuments = [];

function getApiClient() {
  return window.ArchiveApiClient || null;
}

function toUiDocument(item) {
  const pages = Array.isArray(item?.pages) ? item.pages : [];
  return {
    id: item.id || `${item.batch_id || 'batch'}::${item.file_name || item.fileName || Date.now()}`,
    fileName: item.file_name || item.fileName || 'Unnamed PDF',
    totalPages: Number(item.total_pages || item.totalPages || pages.length || 0),
    okPages: Number(item.ok_pages || item.okPages || 0),
    failedPages: Number(item.failed_pages || item.failedPages || 0),
    pages: pages.map(page => ({
      pageNumber: Number(page.page_number || page.pageNumber || 0),
      status: page.status || 'unknown',
      imagePath: page.image_path || page.imagePath || '',
      result: page.result || null,
      error: page.error || null
    }))
  };
}

function readCompletedExtractions() {
  try {
    const raw = localStorage.getItem(EXTRACTIONS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(toUiDocument) : [];
  } catch {
    return [];
  }
}

function writeCompletedExtractions(items) {
  localStorage.setItem(EXTRACTIONS_STORAGE_KEY, JSON.stringify(items));
}

async function fetchCompletedFromBackend() {
  const client = getApiClient();
  if (!client) return [];
  const payload = await client.getCompletedExtractions(200);
  const records = Array.isArray(payload?.records) ? payload.records : [];
  return records.map(toUiDocument);
}

function getDocumentPages(documentRecord) {
  if (!documentRecord || !Array.isArray(documentRecord.pages)) return [];
  return documentRecord.pages.slice().sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));
}

function updatePageHeader() {
  const pageLabel = document.getElementById('pageLabel');
  const pageInfo = document.getElementById('pageInfo');
  const activeDoc = extractionDocuments[activeDocumentIndex];
  const name = activeDoc?.fileName ? ` — ${activeDoc.fileName}` : '';
  if (pageLabel) pageLabel.textContent = 'PDF Preview — Page ' + currentPage + name;
  if (pageInfo) pageInfo.textContent = 'Page ' + currentPage + ' / ' + totalPages;
}

function normalizeImagePathToUrl(imagePath) {
  if (!imagePath) return '';
  let normalized = String(imagePath).replace(/\\/g, '/');
  const tmpIndex = normalized.toLowerCase().indexOf('/tmp/');
  if (tmpIndex >= 0) normalized = normalized.slice(tmpIndex + 1);
  if (!normalized.startsWith('tmp/')) {
    const idx = normalized.toLowerCase().indexOf('tmp/');
    if (idx >= 0) normalized = normalized.slice(idx);
  }
  return normalized.startsWith('tmp/') ? `/${normalized}` : '';
}

function renderPagePreview(pageResult) {
  const imageEl = document.getElementById('pagePreviewImage');
  if (!imageEl) return;

  const url = normalizeImagePathToUrl(pageResult?.imagePath);
  if (!url) {
    imageEl.removeAttribute('src');
    imageEl.style.display = 'none';
    return;
  }

  imageEl.src = url;
  imageEl.style.display = 'block';
}

function renderCurrentPageResult() {
  const activeDoc = extractionDocuments[activeDocumentIndex];
  const pages = getDocumentPages(activeDoc);
  const pageResult = pages[currentPage - 1] || null;

  const host = document.getElementById('pageResultJson') || document.getElementById('ocrResult') || document.getElementById('pageResult');
  renderPagePreview(pageResult);
  
  if (!host) return;

  if (!pageResult) {
    host.textContent = 'No extracted result for this page.';
    renderDynamicTable(null);
    return;
  }

  const extractedData = pageResult.result || {};

  // Display JSON in the text area
  host.textContent = JSON.stringify(
    {
      page_number: pageResult.pageNumber,
      status: pageResult.status,
      extracted: extractedData,
      error: pageResult.error
    },
    null,
    2
  );

  // Render dynamic table based on data structure
  renderDynamicTable(extractedData);
}

// ── DYNAMIC TABLE RENDERING ──────────────────────────────
function renderDynamicTable(data) {
  const tableBody = document.getElementById('tableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '';

  if (!data || typeof data !== 'object') {
    tableBody.innerHTML = '<tr><td colspan="20" style="text-align:center;padding:20px;color:#666;">No data to display</td></tr>';
    return;
  }

  const type = data.type;

  if (type === 'cover') {
    renderCoverTable(data, tableBody);
  } else if (type === 'resultats_annonce') {
    renderResultsAnnounceTable(data, tableBody);
  } else if (type === 'single_student') {
    renderSingleStudentTable(data, tableBody);
  } else if (type === 'multiple_students') {
    renderMultipleStudentsTable(data, tableBody);
  } else if (type === 'table_de_matieres') {
    renderTableDeMatiereTable(data, tableBody);
  } else {
    renderUnknownTable(data, tableBody);
  }
}

function renderCoverTable(data, tableBody) {
  const rows = `
    <tr>
      <td colspan="20" style="text-align:center;padding:30px;color:#666;">
        <strong>Cover Page</strong><br>
        Section: ${data.sectionCode || 'N/A'}<br>
        Year: ${data.annee || 'N/A'}<br>
        ${data.error ? `<span style="color:red;">Error: ${data.error}</span>` : ''}
      </td>
    </tr>
  `;
  tableBody.innerHTML = rows;
}

function renderResultsAnnounceTable(data, tableBody) {
  const students = data.students || [];
  if (students.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="20" style="text-align:center;padding:20px;color:#666;">No students in results announcement</td></tr>';
    return;
  }

  let html = '';
  students.forEach(student => {
    const decisionColor = getDecisionColor(student.decision);
    html += `
      <tr>
        <td>${student.nom || ''}</td>
        <td>${student.prenom || ''}</td>
        <td colspan="18" style="background-color:${decisionColor};color:white;font-weight:500;">${student.decision || 'N/A'}</td>
      </tr>
    `;
  });
  tableBody.innerHTML = html;
}

function renderSingleStudentTable(data, tableBody) {
  const student = data.student || {};
  const modules = data.modules || [];
  const summary = data.summary || {};

  let html = `
    <tr>
      <td colspan="3">${student.name || 'N/A'}</td>
      <td colspan="17" style="color:#666;font-size:13px;">
        Matricule: ${student.matricule || 'N/A'} | Section: ${data.sectionCode || 'N/A'} | Year: ${student.year || 'N/A'}
      </td>
    </tr>
  `;

  // Modules table
  if (modules.length > 0) {
    html += '<tr style="background:#f0f0f0;border-top:2px solid #ddd;"><td colspan="20" style="padding:8px;font-weight:600;">Modules</td></tr>';
    modules.forEach(mod => {
      html += `
        <tr>
          <td colspan="3">${mod.name || ''}</td>
          <td>S1: ${mod.note_s1 ?? 'N/A'}</td>
          <td>S2: ${mod.note_s2 ?? 'N/A'}</td>
          <td colspan="15"></td>
        </tr>
      `;
    });
  }

  // Summary
  if (Object.keys(summary).length > 0) {
    html += '<tr style="background:#f0f0f0;border-top:2px solid #ddd;"><td colspan="20" style="padding:8px;font-weight:600;">Summary</td></tr>';
    html += `
      <tr>
        <td colspan="3">S1 Average: ${summary.semestre1_moyenne ?? 'N/A'}</td>
        <td colspan="3">S2 Average: ${summary.semestre2_moyenne ?? 'N/A'}</td>
        <td colspan="3">General Average: ${summary.general_moyenne ?? 'N/A'}</td>
        <td colspan="11"></td>
      </tr>
    `;
  }

  tableBody.innerHTML = html;
}

function renderMultipleStudentsTable(data, tableBody) {
  const students = data.students || [];
  if (students.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="20" style="text-align:center;padding:20px;color:#666;">No students in table</td></tr>';
    return;
  }

  // Extract all unique module codes
  const moduleSet = new Set();
  students.forEach(s => {
    (s.modules || []).forEach(m => moduleSet.add(m.code || m.name));
  });
  const modules = Array.from(moduleSet);

  let html = '';
  students.forEach((student, idx) => {
    const decision = student.decisionDeJuin || '';
    const decisionColor = getDecisionColor(decision);

    html += `
      <tr style="background:#f9f9f9;">
        <td>${student.nom || ''}</td>
        <td>${student.prenom || ''}</td>
        <td>${student.matricule || 'N/A'}</td>
        <td>S1</td>
        ${modules.map(code => {
          const mod = (student.modules || []).find(m => (m.code || m.name) === code);
          return `<td>${mod?.noteS1 ?? ''}</td>`;
        }).join('')}
        <td>${student.moyenne?.S1 ?? ''}</td>
        <td>${student.rang?.S1 ?? ''}</td>
        <td rowspan="2" style="background-color:${decisionColor};color:white;font-weight:500;vertical-align:middle;">${decision}</td>
        <td rowspan="2">${student.noteDeStage ?? ''}</td>
        <td rowspan="2">${student.decisionFinaleDuConseil || ''}</td>
      </tr>
      <tr>
        <td colspan="3"></td>
        <td>S2</td>
        ${modules.map(code => {
          const mod = (student.modules || []).find(m => (m.code || m.name) === code);
          return `<td>${mod?.noteS2 ?? ''}</td>`;
        }).join('')}
        <td>${student.moyenne?.S2 ?? ''}</td>
        <td>${student.rang?.S2 ?? ''}</td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;
}

function renderTableDeMatiereTable(data, tableBody) {
  const matieres = data.matieres || [];
  if (matieres.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="20" style="text-align:center;padding:20px;color:#666;">No subjects in table</td></tr>';
    return;
  }

  let html = '<tr style="background:#f0f0f0;border-bottom:2px solid #ddd;"><td colspan="20" style="padding:8px;font-weight:600;">Subject Averages</td></tr>';
  matieres.forEach(mat => {
    html += `
      <tr>
        <td>${mat.abrev || ''}</td>
        <td>${mat.libelle || ''}</td>
        <td>Coef S1: ${mat.coef?.S1 ?? ''}</td>
        <td>Coef S2: ${mat.coef?.S2 ?? ''}</td>
        <td>S1 Avg: ${mat.moyenne?.S1 ?? ''}</td>
        <td>S2 Avg: ${mat.moyenne?.S2 ?? ''}</td>
        <td>Annual Avg: ${mat.moyenne?.annuel ?? ''}</td>
        <td colspan="13"></td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;
}

function renderUnknownTable(data, tableBody) {
  tableBody.innerHTML = `
    <tr>
      <td colspan="20" style="text-align:center;padding:20px;color:#666;">
        Unknown data type<br>
        ${data.error ? `<span style="color:red;">Error: ${data.error}</span>` : 'No type specified'}
      </td>
    </tr>
  `;
}

function getDecisionColor(decision) {
  if (!decision) return '#cccccc';
  const lower = decision.toLowerCase();
  if (lower.includes('admis')) return '#16a34a';
  if (lower.includes('elimin')) return '#dc2626';
  if (lower.includes('rattrapage')) return '#ea580c';
  if (lower.includes('conditionnel')) return '#2563eb';
  return '#8b8b8b';
}

// ── EXTRACT STUDENTS FOR VALIDATION ──────────────────────
function extractStudentsFromPageResult() {
  const activeDoc = extractionDocuments[activeDocumentIndex];
  const pages = getDocumentPages(activeDoc);
  const pageResult = pages[currentPage - 1] || null;

  if (!pageResult || !pageResult.result) {
    return [];
  }

  const data = pageResult.result;
  const students = [];

  if (data.type === 'single_student' && data.student) {
    students.push({
      nom: data.student.name || '',
      prenom: '',
      matricule: data.student.matricule || null,
      sexe: null,
      date_naissance: null,
      lieu_naissance: null,
      is_first_year: false,
      _source: 'single_student'
    });
  } else if (data.type === 'multiple_students' && data.students) {
    data.students.forEach(s => {
      students.push({
        nom: s.nom || '',
        prenom: s.prenom || '',
        matricule: s.matricule || null,
        sexe: null,
        date_naissance: null,
        lieu_naissance: null,
        is_first_year: false,
        _source: 'multiple_students'
      });
    });
  } else if (data.type === 'resultats_annonce' && data.students) {
    data.students.forEach(s => {
      students.push({
        nom: s.nom || '',
        prenom: s.prenom || '',
        matricule: null,
        sexe: null,
        date_naissance: null,
        lieu_naissance: null,
        is_first_year: false,
        decision: s.decision || null,
        _source: 'resultats_annonce'
      });
    });
  }

  return students;
}

// ── EDIT MODE TOGGLE ──────────────────────────
let editMode = false;
let currentPageStudents = [];

function toggleEditMode() {
  editMode = !editMode;
  const btn = document.getElementById('editBtn');
  const banner = document.getElementById('editBanner');
  const saveBtn = document.getElementById('saveChangesBtn');

  if (editMode) {
    currentPageStudents = extractStudentsFromPageResult();
    if (currentPageStudents.length === 0) {
      alert('No students found on this page to edit');
      editMode = false;
      return;
    }

    if (btn) {
      btn.style.background = '#2563eb';
      btn.style.color = 'white';
      document.getElementById('editBtnLabel').textContent = 'Cancel Edit';
    }
    if (banner) banner.style.display = 'flex';

    showEditForm(currentPageStudents);

    if (saveBtn) saveBtn.style.display = 'inline-flex';
  } else {
    if (btn) {
      btn.style.background = '';
      btn.style.color = '';
      document.getElementById('editBtnLabel').textContent = 'Edit Mode';
    }
    if (banner) banner.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'none';

    hideEditForm();
  }
}

function showEditForm(students) {
  const tableBody = document.getElementById('tableBody');
  if (!tableBody) return;

  let html = '';

  students.forEach((student, idx) => {
    html += `
      <tr class="student-form-row">
        <td>
          <input type="text" class="form-input" value="${student.nom || ''}" 
                 data-student-idx="${idx}" data-field="nom" 
                 placeholder="Last Name" />
        </td>
        <td>
          <input type="text" class="form-input" value="${student.prenom || ''}" 
                 data-student-idx="${idx}" data-field="prenom" 
                 placeholder="First Name" />
        </td>
        <td>
          <input type="text" class="form-input" value="${student.matricule || ''}" 
                 data-student-idx="${idx}" data-field="matricule" 
                 placeholder="Matricule" />
        </td>
        <td colspan="2">
          <input type="date" class="form-input" value="${student.date_naissance || ''}" 
                 data-student-idx="${idx}" data-field="date_naissance" 
                 placeholder="Date of Birth" />
        </td>
        <td colspan="2">
          <input type="text" class="form-input" value="${student.lieu_naissance || ''}" 
                 data-student-idx="${idx}" data-field="lieu_naissance" 
                 placeholder="Place of Birth" />
        </td>
        <td colspan="2">
          <select class="form-input" data-student-idx="${idx}" data-field="sexe">
            <option value="">— Gender —</option>
            <option value="M" ${student.sexe === 'M' ? 'selected' : ''}>Male</option>
            <option value="F" ${student.sexe === 'F' ? 'selected' : ''}>Female</option>
          </select>
        </td>
        <td colspan="8" style="text-align:center;color:#666;font-size:12px;">Edit fields above, then click Save</td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;

  // Add event listeners
  document.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.studentIdx);
      const field = e.target.dataset.field;
      if (currentPageStudents[idx]) {
        currentPageStudents[idx][field] = e.target.value || null;
      }
    });
  });
}

function hideEditForm() {
  renderCurrentPageResult();
}

// ── SAVE TO BACKEND ──────────────────────────
async function saveValidatedStudents() {
  if (!editMode || currentPageStudents.length === 0) {
    alert('No students to save');
    return;
  }

  // Get academic year from metadata or ask user
  const meta = document.getElementById('metaBox');
  const metaYear = document.getElementById('meta-year')?.textContent || '';
  const anneeUniv = metaYear || prompt('Enter academic year (e.g., 1974-1975):');

  if (!anneeUniv) {
    alert('Academic year is required');
    return;
  }

  // Verify required fields
  const invalid = currentPageStudents.filter(s => !s.nom || !s.prenom);
  if (invalid.length > 0) {
    alert('Last Name and First Name are required for all students');
    return;
  }

  const saveBtn = document.getElementById('saveChangesBtn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Saving...';
  }

  try {
    const payload = {
      annee_univ: anneeUniv,
      students: currentPageStudents.map(s => ({
        nom: s.nom,
        prenom: s.prenom,
        matricule: s.matricule || null,
        sexe: s.sexe || null,
        date_naissance: s.date_naissance || null,
        lieu_naissance: s.lieu_naissance || null,
        is_first_year: s.is_first_year || false,
      }))
    };

    const response = await fetch(getApiClient().getBaseUrl() + '/verify/students/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Save failed');
    }

    const result = await response.json();

    // Show success message
    const message = `✓ Saved: ${result.saved_count} students created/updated${result.failed_count > 0 ? `, ${result.failed_count} errors` : ''}`;
    alert(message);

    // Exit edit mode
    editMode = false;
    toggleEditMode();

  } catch (error) {
    alert(`Error saving: ${error.message}`);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '✓ Save Changes';
    }
  }
}

function selectDocument(index) {
  activeDocumentIndex = index;
  const selected = extractionDocuments[index];
  const pages = getDocumentPages(selected);
  totalPages = Math.max(1, Number(selected?.totalPages || pages.length || 1));
  currentPage = 1;
  document.querySelectorAll('.queue-item').forEach((item, itemIndex) => {
    item.classList.toggle('active', itemIndex === index);
  });
  updatePageHeader();
  renderCurrentPageResult();
}

function renderQueue(documents) {
  if (!queueList) return;
  queueList.innerHTML = '';

  documents.forEach((doc, index) => {
    const title = doc.fileName || `Document ${index + 1}`;
    const subtitle = `${doc.okPages || 0}/${doc.totalPages || 0} pages processed`;
    const item = document.createElement('div');
    item.className = 'queue-item' + (index === 0 ? ' active' : '');
    item.innerHTML = `<div class="queue-item-title">${title}</div><div class="queue-item-sub">${subtitle}</div>`;
    item.onclick = () => selectDocument(index);
    queueList.appendChild(item);
  });
}

async function initializeExtractionQueue() {
  let documents = [];

  try {
    documents = await fetchCompletedFromBackend();
    if (documents.length) {
      writeCompletedExtractions(documents);
    }
  } catch {
    documents = [];
  }

  if (!documents.length) {
    documents = readCompletedExtractions();
  }

  if (!documents.length) {
    documents = [
      { fileName: 'Document 1', okPages: 45, totalPages: 45, pages: [] },
      { fileName: 'Document 2', okPages: 45, totalPages: 45, pages: [] },
      { fileName: 'Document 3', okPages: 45, totalPages: 45, pages: [] }
    ];
  }

  extractionDocuments = documents;
  renderQueue(extractionDocuments);
  selectDocument(0);
}

function changePage(dir) {
  currentPage = Math.max(1, Math.min(totalPages, currentPage + dir));
  updatePageHeader();
  renderCurrentPageResult();
}

initializeExtractionQueue();

// ── BASE DE DONNÉES DE RÉFÉRENCE ──────────────────────
// Simule la BDD réelle (noms et prénoms enregistrés)
const DB_LAST_NAMES = new Set([
  'BELKACEM','BENALI','KADDOUR','MEZIANE','BRAHIM','BOUDIAF','CHEBLI','DRICI',
  'FERHAT','GHOZALI','HAMDANI','IDIR','KHELIF','LARBI','MANSOURI','NACER',
  'OUKIL','RAHMANI','SAID','TLEMCANI','YAHIA','ZERROUK','AMRANI','BOUKHARI',
  'CHERIF','DJABALLAH','FELLAH','GUENDOUZ','HAMDI','IGHIL','KHALED','LAIB',
  'MADANI','NOUAR','OUALI','ROUABAH','SAHRAOUI','TOUMI','YAHI','ZIANI',
  'BENHAMOUDA','BENSALEM','MEBARKI','BOUAZZA','BENABBAS','AOUADI','BOUCHERIT',
  'LADACI','BERBER','BOUSSAID','BOUMEDIENE','MAMMERI','HADDAD','AISSAOUI'
]);

const DB_FIRST_NAMES = new Set([
  'Mohammed','Fatima','Amine','Sarah','Yacine','Amina','Karim','Nadia',
  'Sofiane','Samira','Bilal','Houria','Djamel','Naima','Hichem','Sonia',
  'Adel','Meriem','Riad','Leila','Omar','Aicha','Walid','Lynda','Samir',
  'Kheira','Mourad','Rachida','Fares','Malika','Tarek','Zahia','Mehdi',
  'Djamila','Ilyas','Widad','Hakim','Sabrina','Nassim','Farida','Youssef',
  'Hafida','Hamza','Selma','Rachid','Wafa','Aziz','Chafia','Abdelkader',
  'Zohra','Abderrahmane','Halima','Salim','Radhia','Lotfi','Ferroudja'
]);

// Vérifie si un nom existe dans la BDD (insensible à la casse)
function existsInDB(value, dbSet) {
  return dbSet.has(value) || [...dbSet].some(n => n.toUpperCase() === value.toUpperCase());
}

// ── ALGORITHME DE SIMILARITÉ ──────────────────────────

// Distance de Levenshtein
function levenshtein(a, b) {
  a = a.toUpperCase(); b = b.toUpperCase();
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1}, (_,i) => Array.from({length:n+1}, (_,j) => i===0?j:j===0?i:0));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++) {
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1]
      : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  }
  return dp[m][n];
}

// Score de similarité 0–100
function similarity(a, b) {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 100 : Math.round((1 - dist / maxLen) * 100);
}

// Trouve les N noms les plus proches dans la BDD
function findSimilarNames(input, dbSet, topN = 5) {
  const results = [...dbSet].map(name => ({
    name,
    score: similarity(input, name)
  }));
  results.sort((a, b) => b.score - a.score);
  return results.filter(r => r.score >= 30).slice(0, topN);
}

// ── GESTION DES DROPDOWNS ─────────────────────────────
let activeDropdown = null;

function closeAllDropdowns() {
  if (activeDropdown) {
    activeDropdown.classList.remove('open');
    activeDropdown = null;
  }
}

// ── CONSTRUCTION D'UNE CELLULE NOM/PRÉNOM ─────────────
function buildNameCell(value, type /* 'last' | 'first' */) {
  const dbSet   = type === 'last' ? DB_LAST_NAMES : DB_FIRST_NAMES;
  const found   = existsInDB(value, dbSet);   // ✅ existe en BDD → normal
  const flagged = !found;                      // ❌ introuvable → suggestions

  const wrapper = document.createElement('div');
  wrapper.className = 'cell-box-wrapper';

  const cell = document.createElement('div');
  cell.className = 'cell-box' + (flagged ? ' flagged' : '');
  cell.textContent = value;
  cell.dataset.original = value;
  cell.dataset.type = type;

  wrapper.appendChild(cell);

  if (flagged) {
    const suggestions = findSimilarNames(value, dbSet);

    const dropdown = document.createElement('div');
    dropdown.className = 'suggestion-dropdown';

    // En-tête
    const header = document.createElement('div');
    header.className = 'suggestion-header';
    header.textContent = type === 'last' ? '🔍 Noms similaires en BDD' : '🔍 Prénoms similaires en BDD';
    dropdown.appendChild(header);

    // Valeur extraite par OCR
    const origRow = document.createElement('div');
    origRow.className = 'suggestion-original';
    origRow.innerHTML = `⚠️ Lu par OCR : <span>${value}</span> — introuvable en BDD`;
    dropdown.appendChild(origRow);

    // Liste des suggestions
    if (suggestions.length > 0) {
      suggestions.forEach(s => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        const scoreClass = s.score >= 70 ? 'high' : s.score >= 50 ? 'medium' : '';
        item.innerHTML = `
          <span>${s.name}</span>
          <span class="suggestion-score ${scoreClass}">${s.score}%</span>
        `;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          cell.textContent = s.name;
          cell.classList.remove('flagged');
          cell.dataset.corrected = s.name;
          dropdown.classList.remove('open');
          activeDropdown = null;
          cell.style.background = '#DCFCE7';
          cell.style.border = '1.5px solid #16A34A';
          cell.style.color = '#166534';
          setTimeout(() => {
            cell.style.background = '';
            cell.style.border = '';
            cell.style.color = '';
          }, 1500);
        });
        dropdown.appendChild(item);
      });
    } else {
      const none = document.createElement('div');
      none.className = 'suggestion-none';
      none.textContent = 'Aucune correspondance en BDD';
      dropdown.appendChild(none);
    }

    // Option : conserver
    const keepBtn = document.createElement('div');
    keepBtn.className = 'suggestion-keep';
    keepBtn.textContent = '✕ Conserver la valeur extraite';
    keepBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('open');
      activeDropdown = null;
    });
    dropdown.appendChild(keepBtn);

    wrapper.appendChild(dropdown);

    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown.classList.contains('open')) {
        dropdown.classList.remove('open');
        activeDropdown = null;
      } else {
        closeAllDropdowns();
        dropdown.classList.add('open');
        activeDropdown = dropdown;
      }
    });
  }

  return wrapper;
}

document.addEventListener('click', closeAllDropdowns);

// ── DONNÉES ÉTUDIANTS ─────────────────────────────────
// Noms avec erreurs OCR typiques : lettre substituée (pas de ?, *)
const students = [
  // BELKACEM → OCR lit BELKACEN (C→N en fin de mot)
  {lastName:'BELKACEN', firstName:'Mohammed', matricule:'19740001',
   s1:[14.5,13,15.5,12,16,14,15,13.5], s1Avg:14.20, s1Rank:2,
   s2:[15,14.5,16,13.5,15.5,14.5,15.5,14], s2Avg:14.80, s2Rank:1,
   annualAvg:14.50, annualRank:1, juneDecision:'Admis',
   stageEligible:'Yes', stageGrade:16.5, finalDecision:'Admis', diploma:'Engineer'},
  // BENALI → correct, existe en BDD
  {lastName:'BENALI', firstName:'Fatirna', matricule:'19740002',
   s1:[13,12.5,14,11.5,15,13,14,12.5], s1Avg:13.20, s1Rank:5,
   s2:[14,13,15,12.5,14.5,13.5,14.5,13], s2Avg:13.70, s2Rank:3,
   annualAvg:13.45, annualRank:3, juneDecision:'Admis',
   stageEligible:'Yes', stageGrade:15, finalDecision:'Admis', diploma:'Engineer'},
  // KADDOUR → OCR lit KADDAUR
  {lastName:'KADDAUR', firstName:'Amine', matricule:'19740003',
   s1:[12,11,13.5,10.5,14,12,13,11.5], s1Avg:12.20, s1Rank:8,
   s2:[13.5,12,14,11.5,13.5,12.5,13.5,12], s2Avg:12.80, s2Rank:6,
   annualAvg:12.50, annualRank:6, juneDecision:'Admis avec rachat',
   stageEligible:'Yes', stageGrade:13.5, finalDecision:'Admis', diploma:'License'},
  // MEZIANE → correct
  {lastName:'MEZIANE', firstName:'Sarah', matricule:'19740004',
   s1:[15.5,14,16,13.5,17,15,16,14.5], s1Avg:15.20, s1Rank:1,
   s2:[16,15,16.5,14.5,16.5,15.5,16.5,15], s2Avg:15.70, s2Rank:1,
   annualAvg:15.45, annualRank:1, juneDecision:'Admis',
   stageEligible:'Yes', stageGrade:17.5, finalDecision:'Admis', diploma:'Engineer'},
  // BRAHIM → correct, Yacine → OCR lit Yacîne (î→i invisible)
  {lastName:'BRAHIM', firstName:'Yacîne', matricule:'19740005',
   s1:[11,10.5,12.5,9.5,13,11,12,10.5], s1Avg:11.20, s1Rank:12,
   s2:[12,11,13,10.5,12.5,11.5,12.5,11], s2Avg:11.70, s2Rank:10,
   annualAvg:11.45, annualRank:10, juneDecision:'Rattrapage',
   stageEligible:'No', stageGrade:null, finalDecision:'Eliminé', diploma:'License'},
  // HAMDANI → OCR lit HAMDAWI
  {lastName:'HAMDAWI', firstName:'Karim', matricule:'19740006',
   s1:[14.5,13,15.5,12,16,14,15,13.5], s1Avg:14.20, s1Rank:2,
   s2:[15,14.5,16,13.5,15.5,14.5,15.5,14], s2Avg:14.80, s2Rank:1,
   annualAvg:14.50, annualRank:1, juneDecision:'Admis',
   stageEligible:'Yes', stageGrade:16.5, finalDecision:'Admis', diploma:'Engineer'},
  // CHERIF → correct, Sofiane correct
  {lastName:'CHERIF', firstName:'Sofiane', matricule:'19740007',
   s1:[13,12.5,14,11.5,15,13,14,12.5], s1Avg:13.20, s1Rank:5,
   s2:[14,13,15,12.5,14.5,13.5,14.5,13], s2Avg:13.70, s2Rank:3,
   annualAvg:13.45, annualRank:3, juneDecision:'Admis',
   stageEligible:'Yes', stageGrade:15, finalDecision:'Admis', diploma:'Engineer'},
  // MANSOURI → OCR lit MANSAURI
  {lastName:'MANSAURI', firstName:'Meriem', matricule:'19740008',
   s1:[12,11,13.5,10.5,14,12,13,11.5], s1Avg:12.20, s1Rank:8,
   s2:[13.5,12,14,11.5,13.5,12.5,13.5,12], s2Avg:12.80, s2Rank:6,
   annualAvg:12.50, annualRank:6, juneDecision:'Admis avec rachat',
   stageEligible:'Yes', stageGrade:13.5, finalDecision:'Admis', diploma:'License'},
  // RAHMANI → OCR lit RAHMONI
  {lastName:'RAHMONI', firstName:'Nadia', matricule:'19740009',
   s1:[15.5,14,16,13.5,17,15,16,14.5], s1Avg:15.20, s1Rank:1,
   s2:[16,15,16.5,14.5,16.5,15.5,16.5,15], s2Avg:15.70, s2Rank:1,
   annualAvg:15.45, annualRank:1, juneDecision:'Admis',
   stageEligible:'Yes', stageGrade:17.5, finalDecision:'Admis', diploma:'Engineer'},
  // ZERROUK correct, Omar correct
  {lastName:'ZERROUK', firstName:'Omar', matricule:'19740010',
   s1:[11,10.5,12.5,9.5,13,11,12,10.5], s1Avg:11.20, s1Rank:12,
   s2:[12,11,13,10.5,12.5,11.5,12.5,11], s2Avg:11.70, s2Rank:10,
   annualAvg:11.45, annualRank:10, juneDecision:'Rattrapage',
   stageEligible:'No', stageGrade:null, finalDecision:'Eliminé', diploma:'License'},
];

function decisionClass(d) {
  if (!d) return '';
  const l = d.toLowerCase();
  if (l.includes('avec rachat')) return 'decision-avec-rachat';
  if (l.includes('admis')) return 'decision-admis';
  if (l.includes('elimin') || l.includes('éliminé')) return 'decision-elimine';
  if (l.includes('rattrapage')) return 'decision-rattrapage';
  return '';
}

const chevron = `<svg width="9" height="5" viewBox="0 0 9 5" fill="none" opacity="0.5"><path d="M1 1L4.5 4.5L8 1" stroke="#1F1F82" stroke-width="1.2"/></svg>`;

const tbody = document.getElementById('tableBody');
students.forEach(s => {
  const tr1 = document.createElement('tr');

  // Last name cell
  const tdLastName = document.createElement('td');
  tdLastName.setAttribute('rowspan','2');
  tdLastName.style.verticalAlign = 'middle';
  tdLastName.style.position = 'relative';
  tdLastName.appendChild(buildNameCell(s.lastName, 'last'));

  // First name cell
  const tdFirstName = document.createElement('td');
  tdFirstName.setAttribute('rowspan','2');
  tdFirstName.style.verticalAlign = 'middle';
  tdFirstName.style.position = 'relative';
  tdFirstName.appendChild(buildNameCell(s.firstName, 'first'));

  tr1.appendChild(tdLastName);
  tr1.appendChild(tdFirstName);
  tr1.insertAdjacentHTML('beforeend', `
    <td rowspan="2" style="vertical-align:middle;text-align:center;"><span style="color:#083A83;font-size:11px;">${s.matricule}</span></td>
    <td class="cell-sem">S1</td>
    ${s.s1.map(g=>`<td><div class="cell-box">${g}</div></td>`).join('')}
    <td class="cell-avg" style="vertical-align:middle;text-align:center;">${s.s1Avg.toFixed(2)}</td>
    <td class="cell-rank" style="vertical-align:middle;text-align:center;">${s.s1Rank}</td>
    <td class="cell-annual-avg" rowspan="2">${s.annualAvg.toFixed(2)}</td>
    <td class="cell-annual-rank" rowspan="2">${s.annualRank}</td>
    <td rowspan="2" style="vertical-align:middle;">
      <div class="decision-box ${decisionClass(s.juneDecision)}">${s.juneDecision}${chevron}</div>
    </td>
    <td rowspan="2" style="vertical-align:middle;">
      <div class="stage-box">${s.stageEligible}${chevron}</div>
      ${s.stageGrade ? `<div class="stage-grade">${s.stageGrade}</div>` : ''}
    </td>
    <td rowspan="2" style="vertical-align:middle;">
      <div class="decision-box ${decisionClass(s.finalDecision)}">${s.finalDecision}${chevron}</div>
    </td>
    <td rowspan="2" style="vertical-align:middle;">
      <div class="diploma-box">${s.diploma}${chevron}</div>
    </td>
  `);
  tbody.appendChild(tr1);

  const tr2 = document.createElement('tr');
  tr2.innerHTML = `
    <td class="cell-sem">S2</td>
    ${s.s2.map(g=>`<td><div class="cell-box">${g}</div></td>`).join('')}
    <td class="cell-avg" style="text-align:center;">${s.s2Avg.toFixed(2)}</td>
    <td class="cell-rank" style="text-align:center;">${s.s2Rank}</td>
  `;
  tbody.appendChild(tr2);
});

// ── EDIT MODE ─────────────────────────────────────────
let isEditMode = false;

function toggleEditMode() {
  isEditMode = !isEditMode;
  const btn       = document.getElementById('editBtn');
  const btnLabel  = document.getElementById('editBtnLabel');
  const banner    = document.getElementById('editBanner');
  const tableRows = document.querySelectorAll('#tableBody tr');

  if (isEditMode) {
    // ── Activer Edit Mode ──
    btn.classList.add('active');
    btnLabel.textContent = 'Save Changes';
    banner.classList.add('visible');

    // Métadonnées → inputs
    convertMetaToInput('meta-year',  'text');
    convertMetaToInput('meta-level', 'text');
    convertMetaToInput('meta-spec',  'text');
    convertMetaToSelect('meta-system', ['Semester System','Annual System','Module System']);

    // Tableau → inputs (toutes colonnes)
    tableRows.forEach(tr => {
      tr.classList.add('edit-mode');
      tr.querySelectorAll('td').forEach(td => {

        // 1. Notes dans cell-box (numériques)
        td.querySelectorAll('.cell-box:not(.flagged)').forEach(box => {
          if (box.querySelector('input,select')) return;
          const val = box.textContent.trim();
          if (!isNaN(parseFloat(val)) && isFinite(val)) {
            const inp = makeInput(val, 'edit-input grade-input', '46px', 'center');
            box.innerHTML = ''; box.appendChild(inp);
          }
        });

        // 2. Noms/prénoms non flaggés
        td.querySelectorAll('.cell-box-wrapper .cell-box:not(.flagged)').forEach(box => {
          if (box.querySelector('input,select')) return;
          const val = box.textContent.trim();
          if (val && isNaN(parseFloat(val))) {
            const inp = makeInput(val, 'edit-input name-input', '100%', 'left');
            box.innerHTML = ''; box.appendChild(inp);
          }
        });

        // 3. Matricule
        td.querySelectorAll('span[style*="083A83"]').forEach(span => {
          if (span.querySelector('input')) return;
          const val = span.textContent.trim();
          const inp = makeInput(val, 'edit-input', '72px', 'center');
          span.innerHTML = ''; span.appendChild(inp);
        });

        // 4. Avg (S1 / S2) — cell-avg
        if (td.classList.contains('cell-avg') && !td.querySelector('input')) {
          const val = td.textContent.trim();
          if (val) { td.innerHTML = ''; td.appendChild(makeInput(val, 'edit-input grade-input', '50px', 'center')); }
        }

        // 5. Rank (S1 / S2) — cell-rank
        if (td.classList.contains('cell-rank') && !td.querySelector('input')) {
          const val = td.textContent.trim();
          if (val) { td.innerHTML = ''; td.appendChild(makeInput(val, 'edit-input grade-input', '36px', 'center')); }
        }

        // 6. Annual Avg — cell-annual-avg
        if (td.classList.contains('cell-annual-avg') && !td.querySelector('input')) {
          const val = td.textContent.trim();
          if (val) { td.innerHTML = ''; td.appendChild(makeInput(val, 'edit-input grade-input', '50px', 'center')); }
        }

        // 7. Annual Rank — cell-annual-rank
        if (td.classList.contains('cell-annual-rank') && !td.querySelector('input')) {
          const val = td.textContent.trim();
          if (val) { td.innerHTML = ''; td.appendChild(makeInput(val, 'edit-input grade-input', '36px', 'center')); }
        }

        // 8. June Decision & Final Decision — decision-box
        td.querySelectorAll('.decision-box').forEach(box => {
          if (box.querySelector('input,select')) return;
          const val = box.textContent.replace(/\s+/g,' ').trim();
          const sel = makeSelect(['Admis','Admis avec rachat','Rattrapage','Eliminé'], val, 'edit-input', '100%');
          box.innerHTML = ''; box.appendChild(sel);
        });

        // 9. Stage eligible — stage-box
        td.querySelectorAll('.stage-box').forEach(box => {
          if (box.querySelector('input,select')) return;
          const val = box.textContent.replace(/\s+/g,' ').trim();
          const sel = makeSelect(['Yes','No'], val, 'edit-input', '56px');
          box.innerHTML = ''; box.appendChild(sel);
        });

        // 10. Stage grade — stage-grade
        td.querySelectorAll('.stage-grade').forEach(box => {
          if (box.querySelector('input')) return;
          const val = box.textContent.trim();
          if (val) { box.innerHTML = ''; box.appendChild(makeInput(val, 'edit-input grade-input', '46px', 'center')); }
        });

        // 11. Diploma — diploma-box
        td.querySelectorAll('.diploma-box').forEach(box => {
          if (box.querySelector('input,select')) return;
          const val = box.textContent.replace(/\s+/g,' ').trim();
          const sel = makeSelect(['Engineer','License','Master'], val, 'edit-input', '100%');
          box.innerHTML = ''; box.appendChild(sel);
        });

      });
    });

  } else {
    // ── Sauvegarder & quitter Edit Mode ──
    btn.classList.remove('active');
    btnLabel.textContent = 'Edit Mode';
    banner.classList.remove('visible');

    // Sauvegarder métadonnées
    saveMetaFromInput('meta-year');
    saveMetaFromInput('meta-level');
    saveMetaFromInput('meta-spec');
    saveMetaFromSelect('meta-system');

    // Sauvegarder toutes les cellules du tableau
    tableRows.forEach(tr => {
      tr.classList.remove('edit-mode');

      tr.querySelectorAll('input.edit-input').forEach(inp => {
        inp.parentElement.textContent = inp.value || inp.dataset.original || '';
      });

      // Restaurer les selects avec leur style visuel
      tr.querySelectorAll('.decision-box select.edit-input').forEach(sel => {
        const val = sel.value;
        const box = sel.parentElement;
        box.innerHTML = `${val}${chevron}`;
        box.className = 'decision-box ' + decisionClass(val);
      });
      tr.querySelectorAll('.stage-box select.edit-input').forEach(sel => {
        const val = sel.value;
        const box = sel.parentElement;
        box.innerHTML = `${val}${chevron}`;
      });
      tr.querySelectorAll('.diploma-box select.edit-input').forEach(sel => {
        const val = sel.value;
        const box = sel.parentElement;
        box.innerHTML = `${val}${chevron}`;
      });
    });

    // Flash confirmation vert
    const rightCol = document.querySelector('.right-col');
    rightCol.style.transition = 'box-shadow 0.3s';
    rightCol.style.boxShadow = '0 0 0 2px #16A34A, 0 8px 28px rgba(22,163,74,0.15)';
    setTimeout(() => { rightCol.style.boxShadow = ''; }, 1200);
  }
}

// ── HELPERS INPUT / SELECT ─────────────────────────────
function makeInput(val, cls, width, align) {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = val;
  inp.dataset.original = val;
  inp.className = cls;
  inp.style.width = width;
  inp.style.textAlign = align;
  return inp;
}

function makeSelect(options, currentVal, cls, width) {
  const sel = document.createElement('select');
  sel.className = cls;
  sel.style.width = width;
  // trouver la meilleure correspondance (insensible casse / partielle)
  const match = options.find(o => currentVal.toLowerCase().includes(o.toLowerCase())) || options[0];
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt; o.textContent = opt;
    if (opt === match) o.selected = true;
    sel.appendChild(o);
  });
  return sel;
}

function convertMetaToInput(id, type) {
  const el = document.getElementById(id);
  if (!el) return;
  const val = el.textContent.trim();
  el.classList.add('editing');
  el.innerHTML = '';
  const inp = document.createElement('input');
  inp.type = type; inp.value = val; inp.dataset.original = val;
  el.appendChild(inp);
}

function convertMetaToSelect(id, options) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = el.querySelector('span') ? el.querySelector('span').textContent.trim() : options[0];
  el.classList.add('editing');
  el.innerHTML = '';
  el.appendChild(makeSelect(options, current, '', '100%'));
}

function saveMetaFromInput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const inp = el.querySelector('input');
  el.classList.remove('editing');
  el.textContent = inp ? inp.value : el.textContent;
}

function saveMetaFromSelect(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const sel = el.querySelector('select');
  const val = sel ? sel.value : 'Semester System';
  el.classList.remove('editing');
  el.innerHTML = `<span>${val}</span>
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" opacity="0.5">
      <path d="M1 1L5 5L9 1" stroke="#3D3D45" stroke-width="1.5"/>
    </svg>`;
}

