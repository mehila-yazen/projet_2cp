
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

// Init: apply active icon color on load
(function() {
  const activeItem = document.querySelector('.nav-item.active');
  if (activeItem) setActive(activeItem);
})();

// ── PAGINATION ────────────────────────────────────────
let currentPage = 1;
const totalPages = 45;
function changePage(dir) {
  currentPage = Math.max(1, Math.min(totalPages, currentPage + dir));
  document.getElementById('pageLabel').textContent = 'PDF Preview — Page ' + currentPage;
  document.getElementById('pageInfo').textContent = 'Page ' + currentPage + ' / ' + totalPages;
}

// ── QUEUE ─────────────────────────────────────────────
const docs = [
  {title:'Document 1', sub:'Promotion 1974'},
  {title:'Document 2', sub:'Promotion 1975'},
  {title:'Document 3', sub:'Promotion 1976'},
  {title:'Document 4', sub:'Promotion 1977'},
  {title:'Document 5', sub:'Promotion 1978'},
  {title:'Document 6', sub:'Promotion 1979'},
  {title:'Document 7', sub:'Promotion 1980'},
  {title:'Document 8', sub:'Promotion 1981'},
];
const queueList = document.getElementById('queueList');
docs.forEach((d, i) => {
  const el = document.createElement('div');
  el.className = 'queue-item' + (i===0 ? ' active' : '');
  el.innerHTML = `<div class="queue-item-title">${d.title}</div><div class="queue-item-sub">${d.sub}</div>`;
  el.onclick = () => {
    document.querySelectorAll('.queue-item').forEach(q => q.classList.remove('active'));
    el.classList.add('active');
  };
  queueList.appendChild(el);
});

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

const sidebar = document.getElementById("sidebar");
const logo = document.querySelector(".sidebar-logo .esi svg");

logo.addEventListener("click", () => {
  if (sidebar.classList.contains("collapsed")) {
    sidebar.classList.remove("collapsed");
  }
});
