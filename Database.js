/* ═══════════════════════════════════════════════════
   DATABASE PAGE — Database.js
   ═══════════════════════════════════════════════════ */

/* ── DATA ── */
var dbData = {
  spec: [
    { code: 'AH',  name: 'Architecture des Systèmes',  diploma: 'Ingénieur', capacity: 30 },
    { code: 'IH',  name: 'Intelligence Artificielle',  diploma: 'Ingénieur', capacity: 30 },
    { code: 'TRC', name: 'Télécommunications',          diploma: 'Ingénieur', capacity: 25 },
    { code: 'OI',  name: 'Optimisation Industrielle',   diploma: 'Ingénieur', capacity: 25 }
  ],
 mod: [
   { 
      subject: 'MAT101', 
      period: 'Semester 1', 
      category: 'Fundamental', 
         coeff: 3 ,
      credits: 6
   
    },
    
    { 
      subject: 'INF101', 
     period: 'Semester 1', 
      category: 'Core', 
       coeff: 4 ,
      credits: 7
     
    },
    { 
      subject: 'PHY101', 
      period: 'Semester 2', 
      category: 'Fundamental', 
      coeff: 2 ,
      credits: 4
      
    }
   
  ]
};

/* ── TAB SWITCH ── */
function switchTab(tab) {
  document.getElementById('panelSpec').style.display = tab === 'spec' ? 'block' : 'none';
  document.getElementById('panelMod').style.display  = tab === 'mod'  ? 'block' : 'none';
  document.getElementById('tabSpec').classList.toggle('active', tab === 'spec');
  document.getElementById('tabMod').classList.toggle('active',  tab === 'mod');
}

/* ── RENDER TABLE ── */
function renderSpec(data) {
  var tbody = document.getElementById('specTbody');
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="db-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 15h8M9 9h.01M15 9h.01"/></svg>No specializations found.</div></td></tr>';
    return;
  }
  tbody.innerHTML = data.map(function(s, i) {
    return '<tr>' +
      '<td class="td-code">' + s.code + '</td>' +
      '<td class="td-name">' + s.name + '</td>' +
      '<td class="td-diploma">' + s.diploma + '</td>' +
      '<td class="td-cap">' + s.capacity + ' students</td>' +
      '<td class="td-actions">' +
        '<button class="action-edit" onclick="openEditModal(\'spec\',' + dbData.spec.indexOf(s) + ')" title="Edit">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#155DFC" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        '</button>' +
        '<button class="action-del" onclick="confirmDelete(' + dbData.spec.indexOf(s) + ',\'spec\')" title="Delete">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E7000B" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
        '</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function renderMod(data) {
  var tbody = document.getElementById('modTbody');
  if (!tbody) return;
  
  tbody.innerHTML = data.map(function(m) {
    var realIdx = dbData.mod.indexOf(m);
    return '<tr>' +
      '<td class="subject">' + m.subject + '</td>' +
      '<td>' + m.period + '</td>' +
      '<td><span class="badge ' + m.category.toLowerCase() + '">' + m.category + '</span></td>' +
      '<td>' + m.coeff + '</td>' +
      '<td>' + m.credits + '</td>' +
      '<td class="td-actions">' +
        '<button class="action-edit" onclick="openEditModal(\'mod\',' + realIdx + ')" title="Edit">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#155DFC" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        '</button>' +
        '<button class="action-del" onclick="confirmDelete(' + realIdx + ',\'mod\')" title="Delete">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E7000B" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
        '</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

/* ── SAVE EDIT ── */
function saveEdit(type, idx) {
  var item = dbData[type][idx];
  if (type === 'spec') {
    item.code = document.getElementById('fm_code').value;
    item.name = document.getElementById('fm_name').value;
    item.diploma = document.getElementById('fm_diploma').value;
    item.capacity = parseInt(document.getElementById('fm_cap').value) || 0;
    renderSpec(dbData.spec);
  } else {
    item.subject = document.getElementById('fm_subject').value;
    item.period = document.getElementById('fm_period').value;
    item.category = document.getElementById('fm_category').value;
    item.coeff = parseInt(document.getElementById('fm_coeff').value) || 0;
    item.credits = parseInt(document.getElementById('fm_credits').value) || 0;
    renderMod(dbData.mod);
  }
  closeModal();
  showToast('Modifications enregistrées !');
}

/* ── SEARCH / FILTER ── */
function filterTable(type) {
  if (type === 'spec') {
    var q = document.getElementById('specSearch').value.toLowerCase().trim();
    var filtered = q ? dbData.spec.filter(function(s) {
      return s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.diploma.toLowerCase().includes(q);
    }) : dbData.spec;
    renderSpec(filtered);
  } else {
    var q = document.getElementById('modSearch').value.toLowerCase().trim();
    var filtered = q ? dbData.mod.filter(function(m) {
      return m.subject.toLowerCase().includes(q) || m.period.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
    }) : dbData.mod;
    renderMod(filtered);
  }
}

/* ── ADD MODAL ── */
function openAddModal(type) {
  var isSpec = type === 'spec';
  var html = modalHeader(isSpec ? 'Add New Specialization' : 'Add New Module');

  if (isSpec) {
    html += '<div class="db-form-group"><label>Code</label><input id="fm_code" type="text" placeholder="e.g. GL" /></div>' +
            '<div class="db-form-group"><label>Name</label><input id="fm_name" type="text" placeholder="Full name..." /></div>' +
            '<div class="db-form-group"><label>Diploma</label><select id="fm_diploma"><option>Ingénieur</option><option>Licence</option><option>Master</option></select></div>' +
            '<div class="db-form-group"><label>Capacity (students)</label><input id="fm_cap" type="number" min="1" max="200" placeholder="e.g. 30" /></div>';
  } else {
    html += '<div class="db-form-group"><label>Subject Code</label><input id="fm_subject" type="text" placeholder="e.g. BDD101" /></div>' +
            '<div class="db-form-group"><label>Period</label><select id="fm_period"><option>Semester 1</option><option>Semester 2</option><option>Semester 3</option><option>Semester 4</option></select></div>' +
            '<div class="db-form-group"><label>Category</label><select id="fm_category"><option>Fundamental</option><option>Core</option><option>Methodology</option></select></div>' +
            '<div class="db-form-group"><label>Coefficient</label><input id="fm_coeff" type="number" min="1" max="10" placeholder="e.g. 3" /></div>' +
            '<div class="db-form-group"><label>Credits</label><input id="fm_credits" type="number" min="1" max="30" placeholder="e.g. 4" /></div>';
  }

  html += '<div class="db-modal-btns">' +
    '<button class="db-modal-cancel" onclick="closeModal()">Cancel</button>' +
    '<button class="db-modal-save" onclick="saveAdd(\'' + type + '\')">Add</button>' +
  '</div>';
  openModal(html);
}

function saveAdd(type) {
  if (type === 'spec') {
    var obj = {
      code: document.getElementById('fm_code').value.toUpperCase(),
      name: document.getElementById('fm_name').value,
      diploma: document.getElementById('fm_diploma').value,
      capacity: parseInt(document.getElementById('fm_cap').value) || 0
    };
    dbData.spec.push(obj);
    renderSpec(dbData.spec);
  } else {
    var obj = {
      subject: document.getElementById('fm_subject').value.toUpperCase(),
      period: document.getElementById('fm_period').value,
      category: document.getElementById('fm_category').value,
      coeff: parseInt(document.getElementById('fm_coeff').value) || 0,
      credits: parseInt(document.getElementById('fm_credits').value) || 0
    };
    dbData.mod.push(obj);
    renderMod(dbData.mod);
  }
  closeModal();
  showToast('Added successfully!');
}
/* ── EDIT MODAL ── */
function openEditModal(type, idx) {
  var item = dbData[type][idx];
  if (!item) return;
  var isSpec = (type === 'spec');
  var html = modalHeader(isSpec ? 'Modifier Spécialité' : 'Modifier Module');

  if (isSpec) {
    html += '<div class="db-form-group"><label>Code</label><input id="fm_code" type="text" value="' + item.code + '" /></div>' +
            '<div class="db-form-group"><label>Nom</label><input id="fm_name" type="text" value="' + item.name + '" /></div>' +
            '<div class="db-form-group"><label>Diplôme</label><input id="fm_diploma" type="text" value="' + item.diploma + '" /></div>' +
            '<div class="db-form-group"><label>Capacité</label><input id="fm_cap" type="number" value="' + item.capacity + '" /></div>';
  } else {
    html += '<div class="db-form-group"><label>Subject</label><input id="fm_subject" type="text" value="' + item.subject + '" /></div>' +
            '<div class="db-form-group"><label>Period</label><input id="fm_period" type="text" value="' + item.period + '" /></div>' +
            '<div class="db-form-group"><label>Category</label><select id="fm_category">' +
              '<option' + (item.category === 'Fundamental' ? ' selected' : '') + '>Fundamental</option>' +
              '<option' + (item.category === 'Core' ? ' selected' : '') + '>Core</option>' +
              '<option' + (item.category === 'Methodology' ? ' selected' : '') + '>Methodology</option>' +
            '</select></div>' +
            '<div class="db-form-group"><label>Coefficient</label><input id="fm_coeff" type="number" value="' + item.coeff + '" /></div>' +
            '<div class="db-form-group"><label>Credits</label><input id="fm_credits" type="number" value="' + item.credits + '" /></div>';
  }

  html += '<div class="db-modal-btns">' +
            '<button onclick="closeModal()">Annuler</button>' +
            '<button class="db-modal-save" onclick="saveEdit(\'' + type + '\',' + idx + ')">Enregistrer</button>' +
          '</div>';
  openModal(html);
}


/* ── DELETE CONFIRM ── */
function confirmDelete(idx, type) {
  var targetArray = (type === 'spec') ? dbData.spec : dbData.mod;
  var itemName = targetArray[idx] ? (targetArray[idx].name || targetArray[idx].subject || targetArray[idx].code) : '';
  if (confirm("Êtes-vous sûr de vouloir supprimer : " + itemName + " ?")) {
    targetArray.splice(idx, 1);
    if (type === 'spec') renderSpec(dbData.spec);
    else renderMod(dbData.mod);
    showToast('Entry deleted.');
  }
}

function doDelete(idx, type) {
  dbData[type].splice(idx, 1);
  if (type === 'spec') renderSpec(dbData.spec);
  else                  renderMod(dbData.mod);
  closeModal();
  showToast('Entry deleted.');
}

/* ── FILTER MODAL ── */
function openFilterModal() {
  /* Détecte l'onglet actif */
  var isSpec = document.getElementById('tabSpec').classList.contains('active');
  if (isSpec) openFilterSpec(); else openFilterMod();
}

/* Filtre Spécialisations */
function openFilterSpec() {
  var html = modalHeader('Filter — Specializations') +
    '<div class="db-form-group"><label>Diploma Type</label><select id="ff_diploma"><option value="">All</option><option>Ingénieur</option><option>Licence</option><option>Master</option></select></div>' +
    '<div class="db-form-group"><label>Capacity</label><select id="ff_cap"><option value="">All</option><option value="25">≤ 25 students</option><option value="30">≤ 30 students</option></select></div>' +
    '<div class="db-modal-btns">' +
      '<button class="db-modal-cancel" onclick="renderSpec(dbData.spec);closeModal()">Reset</button>' +
      '<button class="db-modal-save" onclick="applyFilterSpec()">Apply</button>' +
    '</div>';
  openModal(html);
}

function applyFilterSpec() {
  var diploma = document.getElementById('ff_diploma').value;
  var capMax  = parseInt(document.getElementById('ff_cap').value) || Infinity;
  var filtered = dbData.spec.filter(function(s) {
    return (!diploma || s.diploma === diploma) && s.capacity <= capMax;
  });
  renderSpec(filtered);
  closeModal();
}

/* Filtre Modules */
function openFilterMod() {
  var periods = [''].concat([...new Set(dbData.mod.map(function(m){ return m.period; }))]);
  var html = modalHeader('Filter — Modules') +
    '<div class="db-form-group"><label>Period</label><select id="ff_period">' +
      periods.map(function(p){ return '<option value="' + p + '">' + (p || 'All') + '</option>'; }).join('') +
    '</select></div>' +
    '<div class="db-form-group"><label>Category</label><select id="ff_category"><option value="">All</option><option>Fundamental</option><option>Core</option><option>Methodology</option></select></div>' +
    '<div class="db-form-group"><label>Coefficient min</label><input id="ff_coeff_min" type="number" min="0" placeholder="e.g. 2" /></div>' +
    '<div class="db-form-group"><label>Credits min</label><input id="ff_credits_min" type="number" min="0" placeholder="e.g. 4" /></div>' +
    '<div class="db-modal-btns">' +
      '<button class="db-modal-cancel" onclick="renderMod(dbData.mod);closeModal()">Reset</button>' +
      '<button class="db-modal-save" onclick="applyFilterMod()">Apply</button>' +
    '</div>';
  openModal(html);
}

function applyFilterMod() {
  var period      = document.getElementById('ff_period').value;
  var category    = document.getElementById('ff_category').value;
  var coeffMin    = parseInt(document.getElementById('ff_coeff_min').value)  || 0;
  var creditsMin  = parseInt(document.getElementById('ff_credits_min').value) || 0;
  var filtered = dbData.mod.filter(function(m) {
    return (!period   || m.period   === period) &&
           (!category || m.category === category) &&
           m.coeff   >= coeffMin &&
           m.credits >= creditsMin;
  });
  renderMod(filtered);
  closeModal();
}

/* ── TOAST NOTIFICATION ── */
function showToast(msg) {
  var old = document.getElementById('dbToast');
  if (old) old.remove();
  var t = document.createElement('div');
  t.id = 'dbToast';
  t.style.cssText = 'position:fixed;bottom:32px;right:32px;background:#02112a;color:#fff;padding:14px 22px;border-radius:12px;font-size:14px;font-weight:500;font-family:Inter,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.22);z-index:99999;opacity:0;transform:translateY(10px);transition:all .25s ease;';
  t.textContent = '✓  ' + msg;
  document.body.appendChild(t);
  requestAnimationFrame(function() { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
  setTimeout(function() {
    t.style.opacity = '0'; t.style.transform = 'translateY(10px)';
    setTimeout(function() { if (t.parentNode) t.remove(); }, 300);
  }, 2500);
}

/* ── DATE ── */
document.addEventListener('DOMContentLoaded', function() {
  var days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var now    = new Date();
  var el     = document.getElementById('currentDate');
  if (el) el.textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();

  /* Sidebar toggle */
  var toggleBtn = document.getElementById('sidebarToggle');
  var sidebar   = document.getElementById('sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', function() {
      sidebar.classList.toggle('collapsed');
    });
    /* ESI icon click → expand */
    var esiIcon = sidebar.querySelector('.esi');
    if (esiIcon) {
      esiIcon.addEventListener('click', function() {
        sidebar.classList.remove('collapsed');
      });
    }
  }

  /* Ripple effect */
  document.addEventListener('click', function(e) {
    var t = e.target.closest('button, .nav-item, .db-tab');
    if (!t) return;
    var old = t.querySelector('.ripple-circle');
    if (old) old.remove();
    var rect = t.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height) * 1.8;
    var x = (e.clientX - rect.left) - size / 2;
    var y = (e.clientY - rect.top)  - size / 2;
    var c = document.createElement('span');
    c.className = 'ripple-circle';
    c.style.cssText = 'position:absolute;border-radius:50%;pointer-events:none;width:' + size + 'px;height:' + size + 'px;left:' + x + 'px;top:' + y + 'px;background:rgba(255,255,255,0.28);transform:scale(0);transition:transform .45s ease,opacity .45s ease;opacity:1;z-index:9;';
    t.style.position = t.style.position || 'relative';
    t.style.overflow = 'hidden';
    t.appendChild(c);
    requestAnimationFrame(function() { c.style.transform = 'scale(1)'; c.style.opacity = '0'; });
    setTimeout(function() { if (c.parentNode) c.remove(); }, 500);
  });
});