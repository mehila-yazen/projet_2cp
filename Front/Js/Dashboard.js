
/* ═══════════════════════════════════════════════════
   FONCTIONS GLOBALES — accessibles depuis onclick=
   ═══════════════════════════════════════════════════ */

function setActive(el) {
  document.querySelectorAll('.nav-item').forEach(function(n) {
    n.classList.remove('active');
    var svg = n.querySelector('svg');
    if (svg) {
      if (svg.classList.contains('doc-svg')) { svg.setAttribute('fill','#266FA3'); svg.setAttribute('stroke','none'); }
      else { svg.setAttribute('stroke','#266FA3'); svg.setAttribute('fill','none'); }
    }
  });
  el.classList.add('active');
  var svg = el.querySelector('svg');
  if (svg) {
    if (svg.classList.contains('doc-svg')) { svg.setAttribute('fill','white'); svg.setAttribute('stroke','none'); }
    else { svg.setAttribute('stroke','white'); svg.setAttribute('fill','none'); }
  }
}

function openModal(html) {
  var old = document.getElementById('modalOverlay');
  if (old) old.remove();
  var overlay = document.createElement('div');
  overlay.id = 'modalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(4,31,73,0.45);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .22s ease;';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });
  overlay.innerHTML = '<div id="modalBox" style="background:#fff;border-radius:20px;padding:32px 36px;min-width:380px;max-width:520px;width:90%;box-shadow:0 24px 60px rgba(4,31,73,.22);transform:scale(.92) translateY(20px);transition:all .25s cubic-bezier(.4,0,.2,1);position:relative;">' + html + '</div>';
  document.body.appendChild(overlay);
  requestAnimationFrame(function() {
    overlay.style.opacity = '1';
    var box = document.getElementById('modalBox');
    if (box) box.style.transform = 'scale(1) translateY(0)';
  });
}

function closeModal() {
  var overlay = document.getElementById('modalOverlay');
  if (!overlay) return;
  var box = document.getElementById('modalBox');
  overlay.style.opacity = '0';
  if (box) box.style.transform = 'scale(.92) translateY(20px)';
  setTimeout(function() { if (overlay.parentNode) overlay.remove(); }, 220);
}

function modalHeader(title) {
  return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;"><div style="font-size:18px;font-weight:700;color:#02112a;">' + title + '</div><button onclick="closeModal()" style="background:rgba(4,31,73,.07);border:none;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:18px;color:#02112a;display:flex;align-items:center;justify-content:center;">✕</button></div>';
}

function viewStudent(s) {
  if (typeof s === 'string') s = JSON.parse(s);
  openModal(
    modalHeader('Student Profile') +
    '<div style="display:flex;flex-direction:column;gap:14px;">' +
      '<div style="background:linear-gradient(116deg,#3c8bc1,#70b2e9);border-radius:14px;padding:20px 24px;color:#fff;display:flex;align-items:center;gap:16px;">' +
        '<div style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;">' + s.name[0].toUpperCase() + '</div>' +
        '<div><div style="font-size:20px;font-weight:700;text-transform:capitalize;">' + s.name + '</div><div style="opacity:.85;font-size:14px;">' + s.mat + '</div></div>' +
        '<div style="margin-left:auto;text-align:right;"><div style="font-size:28px;font-weight:800;">' + s.avg + '/20</div><div style="opacity:.85;font-size:13px;">Final Average</div></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div style="background:#f8faff;border-radius:12px;padding:14px 16px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px;">PROMOTION</div><div style="font-size:15px;font-weight:600;color:#02112a;">' + s.promo + '</div></div>' +
        '<div style="background:#f8faff;border-radius:12px;padding:14px 16px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px;">RANK</div><div style="font-size:15px;font-weight:600;color:#02112a;">#' + s.rank + ' / 150</div></div>' +
        '<div style="background:#f8faff;border-radius:12px;padding:14px 16px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px;">STATUS</div><div style="font-size:13px;font-weight:600;background:#00a63e;color:#fff;padding:3px 12px;border-radius:8px;display:inline-block;">' + s.status + '</div></div>' +
        '<div style="background:#f8faff;border-radius:12px;padding:14px 16px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px;">MATRICULE</div><div style="font-size:15px;font-weight:600;color:#9810fa;">' + s.mat + '</div></div>' +
      '</div>' +
    '</div>'
  );
}

function handlePdfSelect(input) {
  var file = input.files[0];
  if (!file) return;
  var status = document.getElementById('pdfStatus');
  if (status) status.innerHTML = '<span style="color:#00a63e;font-weight:600;">✓ ' + file.name + '</span> — ready to import';
  var btn = document.getElementById('importConfirmBtn');
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
}

function simulateImport() {
  var status = document.getElementById('pdfStatus');
  var btn = document.getElementById('importConfirmBtn');
  if (status) status.innerHTML = '<span style="color:#3c8bc1;">⏳ Importing...</span>';
  if (btn) btn.disabled = true;
  setTimeout(function() {
    if (status) status.innerHTML = '<span style="color:#00a63e;font-weight:600;">✓ Import successful!</span>';
    setTimeout(closeModal, 1200);
  }, 1500);
}

function simulateGenerate() {
  var checked = [].slice.call(document.querySelectorAll('#modalBox input[type=checkbox]')).filter(function(c) { return c.checked; });
  if (!checked.length) { alert('Please select at least one report.'); return; }
  var box = document.getElementById('modalBox');
  box.innerHTML = '<div style="text-align:center;padding:20px 0;"><div style="font-size:40px;margin-bottom:16px;">📄</div><div style="font-size:17px;font-weight:700;color:#02112a;margin-bottom:8px;">Generating Report...</div><div style="background:#e5e7eb;border-radius:99px;height:6px;overflow:hidden;margin:16px 0;"><div id="progressBar" style="height:100%;background:linear-gradient(90deg,#3c8bc1,#70b2e9);width:0%;transition:width 1.2s ease;border-radius:99px;"></div></div><div id="genStatus" style="font-size:13px;color:#6b7280;">Preparing data...</div></div>';
  requestAnimationFrame(function() { var pb = document.getElementById('progressBar'); if (pb) pb.style.width = '100%'; });
  setTimeout(function() { var el = document.getElementById('genStatus'); if (el) el.textContent = 'Finalizing PDF...'; }, 600);
  setTimeout(function() {
    box.innerHTML = '<div style="text-align:center;padding:20px 0;"><div style="font-size:44px;margin-bottom:12px;">✅</div><div style="font-size:17px;font-weight:700;color:#02112a;margin-bottom:6px;">Report Ready!</div><div style="font-size:13px;color:#6b7280;margin-bottom:20px;">' + checked.length + ' report(s) generated</div><button onclick="closeModal()" style="background:linear-gradient(116deg,#3c8bc1,#70b2e9);border:none;border-radius:10px;padding:12px 32px;font-size:14px;font-weight:600;color:#fff;cursor:pointer;">Done</button></div>';
  }, 1400);
}

function searchStudents(q) {
  var res = document.getElementById('searchResults');
  if (!res) return;
  if (!q.trim()) { res.innerHTML = '<div style="text-align:center;color:#6b7280;font-size:13px;padding:20px;">Type to search...</div>'; return; }
  var allData = window._allStudentsData || [];
  var found = allData.filter(function(s) { return s.name.toLowerCase().indexOf(q.toLowerCase()) !== -1 || s.mat.indexOf(q) !== -1; });
  if (!found.length) { res.innerHTML = '<div style="text-align:center;color:#6b7280;font-size:13px;padding:20px;">No students found.</div>'; return; }
  res.innerHTML = found.slice(0, 20).map(function(s) {
    return '<div onclick=\'closeModal();setTimeout(function(){viewStudent(' + JSON.stringify(s) + ')},230)\' style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:10px;background:#f8faff;cursor:pointer;" onmouseover="this.style.background=\'#eef4ff\'" onmouseout="this.style.background=\'#f8faff\'"><div><div style="font-size:14px;font-weight:600;color:#02112a;text-transform:capitalize;">' + s.name + '</div><div style="font-size:12px;color:#9810fa;">' + s.mat + ' · ' + s.promo + '</div></div><span style="background:#9810fa;color:#fff;padding:3px 10px;border-radius:8px;font-size:13px;font-weight:700;">' + s.avg + '/20</span></div>';
  }).join('');
}

function applyBrowseFilter() {
  var q      = (document.getElementById('browseSearch') ? document.getElementById('browseSearch').value : '').toLowerCase().trim();
  var promo  = document.getElementById('browsePromo')  ? document.getElementById('browsePromo').value  : 'All Promotions';
  var status = document.getElementById('browseStatus') ? document.getElementById('browseStatus').value : 'All Status';
  var allData = window._allStudentsData || [];
  window._browseFiltered = allData.filter(function(s) {
    return (!q || s.name.toLowerCase().indexOf(q) !== -1 || s.mat.indexOf(q) !== -1) &&
           (promo  === 'All Promotions' || s.promo  === promo) &&
           (status === 'All Status'     || s.status === status);
  });
  window._browsePage = 0;
  renderBrowseTable();
}

function browsePagerNav(dir) {
  var total = Math.ceil((window._browseFiltered || []).length / 10);
  window._browsePage = Math.max(0, Math.min((window._browsePage || 0) + dir, total - 1));
  renderBrowseTable();
}

function renderBrowseTable() {
  var BROWSE_PAGE    = 10;
  var browseFiltered = window._browseFiltered || [];
  var browsePage     = window._browsePage || 0;
  var tbody   = document.getElementById('browseTbody');
  var countEl = document.getElementById('browseCount');
  var labelEl = document.getElementById('browsePageLabel');
  var prevBtn = document.getElementById('browsePrev');
  var nextBtn = document.getElementById('browseNext');
  if (!tbody) return;
  var total = Math.ceil(browseFiltered.length / BROWSE_PAGE) || 1;
  var start = browsePage * BROWSE_PAGE;
  var page  = browseFiltered.slice(start, start + BROWSE_PAGE);
  if (countEl) countEl.textContent = 'Showing ' + browseFiltered.length + ' student' + (browseFiltered.length !== 1 ? 's' : '');
  if (labelEl) labelEl.textContent = 'Page ' + (browsePage + 1) + ' / ' + total;
  if (prevBtn) prevBtn.disabled = (browsePage === 0);
  if (nextBtn) nextBtn.disabled = (browsePage >= total - 1);
  if (!page.length) { tbody.innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;color:#6b7280;font-size:13px;">No students found.</td></tr>'; return; }
  tbody.innerHTML = page.map(function(s, i) {
    var avgColor    = s.avg >= 14 ? '#9810fa' : s.avg >= 10 ? '#3c8bc1' : '#e7000b';
    var statusColor = s.status === 'Graduate' ? '#00a63e' : '#e7000b';
    return '<tr style="border-bottom:1px solid rgba(150,180,230,.18);background:' + (i%2===0?'rgba(215,225,245,.13)':'transparent') + ';"><td style="padding:9px 10px;color:#6b7280;font-size:12px;">#' + s.rank + '</td><td style="padding:9px 10px;color:#9810fa;font-weight:600;font-size:12px;">' + s.mat + '</td><td style="padding:9px 10px;color:#101828;font-weight:500;text-transform:capitalize;">' + s.name + '</td><td style="padding:9px 10px;color:#4a5565;font-size:12px;">' + s.promo + '</td><td style="padding:9px 10px;text-align:center;"><span style="background:' + avgColor + ';color:#fff;padding:3px 10px;border-radius:8px;font-weight:700;font-size:12px;">' + s.avg + '/20</span></td><td style="padding:9px 10px;text-align:center;"><span style="background:' + statusColor + ';color:#fff;padding:3px 10px;border-radius:8px;font-weight:600;font-size:11px;">' + s.status + '</span></td><td style="padding:9px 10px;text-align:center;"><button onclick=\'closeModal();setTimeout(function(){viewStudent(' + JSON.stringify(s) + ')},230)\' style="background:#fff;border:1.4px solid rgba(0,0,0,.12);border-radius:8px;padding:4px 14px;font-size:12px;font-weight:600;color:#101828;cursor:pointer;">View</button></td></tr>';
  }).join('');
}

/* ═══════════════════════════════════════════════════
   INIT — après chargement du DOM
   ═══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {

  /* Date */
  var days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var now = new Date();
  var el = document.getElementById('currentDate');
  if (el) el.textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();

  /* Ripple */
  document.addEventListener('click', function(e) {
    var t = e.target.closest('button, .nav-item, .tab-btn');
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

  /* Tabs */
  var tabsBar = document.getElementById('tabsBar');
  if (tabsBar) {
    tabsBar.addEventListener('click', function(e) {
      var btn = e.target.closest('.tab-btn');
      if (!btn) return;
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var tab     = btn.dataset.tab;
      var current = document.querySelector('.panel.active');
      var next    = document.getElementById('panel-' + tab);
      if (!next || current === next) return;
      if (current) {
        current.style.transition = 'opacity .18s ease, transform .18s ease';
        current.style.opacity    = '0';
        current.style.transform  = 'translateY(-8px)';
        setTimeout(function() {
          current.classList.remove('active');
          current.style.opacity   = '';
          current.style.transform = '';
          current.style.transition = '';
          next.classList.add('active');
        }, 180);
      } else {
        next.classList.add('active');
      }
    });
  }

  /* Sidebar collapse */
  var collapseBtn = document.getElementById('collapseBtn');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', function() {
      var sb = document.querySelector('.sidebar');
      if (sb) sb.classList.toggle('collapsed');
    });
  }

  /* ── CHART DEFAULTS ── */
  var gc = 'rgba(150,180,230,.3)';
  var tc = '#253048';
  var tooltipBase = {
    backgroundColor: 'rgba(255,255,255,.95)', titleColor: '#041f49', bodyColor: '#041f49',
    borderColor: '#c0d4f8', borderWidth: 1, padding: 10, cornerRadius: 8
  };

  function safeChart(id, config) {
    try {
      var el = document.getElementById(id);
      if (!el) return;
      if (typeof Chart === 'undefined') {
        el.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#aaa;font-size:13px;">Chart unavailable offline</div>';
        return;
      }
      return new Chart(el, config);
    } catch(e) { console.warn('Chart error:', id, e); }
  }

  /* Line Chart */
  safeChart('lineChart', {
    type: 'line',
    data: {
      labels: ['1974','1975','1976','1977','1978','1979','1980','1981','1982','1983','1984'],
      datasets: [{ label: 'Success Rate (%)', data: [1.0,1.65,0.8,1.05,1.85,0.65,1.95,0.45,1.1,1.45,1.75], borderColor: '#5b8def', borderWidth: 2.5, pointBackgroundColor: '#ffffff', pointBorderColor: '#5b8def', pointRadius: 4, pointHoverRadius: 6, pointBorderWidth: 2, fill: false, tension: 0.4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: Object.assign({}, tooltipBase, { callbacks: { label: function(ctx) { return ' ' + ctx.parsed.y + '%'; } } }) }, scales: { x: { grid: { color: gc, borderDash: [4,4] }, ticks: { color: '#8a9cc0', font: { size: 11 }, maxTicksLimit: 7 }, border: { display: false } }, y: { min: 0, max: 2, grid: { color: gc, borderDash: [4,4] }, ticks: { color: '#8a9cc0', font: { size: 11 }, stepSize: .5 }, border: { display: false } } } }
  });

  /* Donut Chart */
  safeChart('donutChart', {
    type: 'pie',
    data: { labels: ['Male','Female'], datasets: [{ data: [85,15], backgroundColor: ['#00BFFF','#ff2d9b'], borderWidth: 2, borderColor: '#ffffff', hoverOffset: 6 }] },
    options: { responsive: false, maintainAspectRatio: true, aspectRatio: 1, rotation: -215, plugins: { legend: { display: false }, tooltip: Object.assign({}, tooltipBase, { callbacks: { label: function(ctx) { return ' ' + ctx.label + ': ' + ctx.parsed + '%'; } } }) } }
  });

  /* Promo charts */
  var promoLabels4yr = ['1974-1978','1975-1979','1976-1980','1977-1981','1978-1982','1979-1983','1980-1984','1981-1985','1982-1986','1983-1987','1984-1988'];
  var promoLabelsYr  = ['1974','1975','1976','1977','1978','1979','1980','1981','1982','1983','1984'];
  var promoSuccess   = [1.0,1.2,0.9,1.05,1.3,0.7,1.8,0.5,1.1,1.4,1.6];
  var promoFailure   = [99.0,98.8,99.1,98.95,98.7,99.3,98.2,99.5,98.9,98.6,98.4];
  var promoAvgGrade  = [14.6,15.2,15.5,14.8,14.9,14.7,15.1,14.9,13.1,14.5,15.0];

  safeChart('promoSuccessChart', {
    type: 'bar',
    data: { labels: promoLabelsYr, datasets: [{ label: 'Success Rate (%)', data: promoSuccess, backgroundColor: '#22c55e', borderRadius: 3, barPercentage: 0.8, categoryPercentage: 0.9 }, { label: 'Failure Rate (%)', data: promoFailure, backgroundColor: '#ef4444', borderRadius: 3, barPercentage: 0.8, categoryPercentage: 0.9 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipBase }, scales: { x: { grid: { color: gc, borderDash: [4,4] }, ticks: { color: tc, font: { size: 11 } }, border: { display: false } }, y: { min: 0, max: 100, ticks: { color: tc, font: { size: 11 }, stepSize: 25 }, grid: { color: gc, borderDash: [4,4] }, border: { display: false } } } }
  });

  safeChart('promoFailureChart', {
    type: 'bar',
    data: { labels: promoLabels4yr, datasets: [{ label: 'Failure Rate (%)', data: [0,0,0,0,0,0,0,0,0,0,0], backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 3, barPercentage: 0.5 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipBase }, scales: { x: { grid: { color: gc, borderDash: [4,4] }, ticks: { color: tc, font: { size: 10 }, maxRotation: 45, minRotation: 45 }, border: { display: false } }, y: { min: 0, max: 4, ticks: { color: tc, font: { size: 11 }, stepSize: 1 }, grid: { color: gc, borderDash: [4,4] }, border: { display: false } } } }
  });

  safeChart('promoGradeChart', {
    type: 'line',
    data: { labels: promoLabels4yr, datasets: [{ label: 'Avg Final Grade', data: promoAvgGrade, borderColor: '#9333ea', borderWidth: 2.5, backgroundColor: 'transparent', pointBackgroundColor: '#ffffff', pointBorderColor: '#9333ea', pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7, tension: 0.35, fill: false }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipBase }, scales: { x: { grid: { color: gc, borderDash: [4,4] }, ticks: { color: tc, font: { size: 10 }, maxRotation: 45, minRotation: 45 }, border: { display: false } }, y: { min: 0, max: 20, ticks: { color: tc, font: { size: 11 }, stepSize: 5 }, grid: { color: gc, borderDash: [4,4] }, border: { display: false } } } }
  });

  /* Module charts */
  var modLabels  = ['INF101','INF102','MAT101','INF201','INF202','MAT102','PHY101','MAT201','MAT202','PHY102'];
  var modGrades  = [14.0,14.3,14.2,14.5,13.3,14.1,13.9,14.0,14.0,14.5];
  var modSuccess = [100,100,100,100,100,100,100,100,100,100];
  var modFailure = [0,0,0,0,0,0,0,0,0,0];

  safeChart('modSuccessChart', {
    type: 'bar',
    data: { labels: modLabels, datasets: [{ label: 'Success Rate (%)', data: modSuccess, backgroundColor: '#10b981', borderRadius: 4, barPercentage: 0.85, categoryPercentage: 0.9 }, { label: 'Failure Rate (%)', data: modFailure, backgroundColor: '#ef4444', borderRadius: 4, barPercentage: 0.85, categoryPercentage: 0.9 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipBase }, scales: { x: { grid: { color: gc, borderDash: [4,4] }, ticks: { color: tc, font: { size: 10 } }, border: { display: false } }, y: { min: 0, max: 100, ticks: { color: tc, font: { size: 11 }, stepSize: 25 }, grid: { color: gc, borderDash: [4,4] }, border: { display: false } } } }
  });

  safeChart('modGradeChart', {
    type: 'bar',
    data: { labels: modLabels, datasets: [{ label: 'Avg Grade', data: modGrades, backgroundColor: '#9333ea', borderRadius: 4, barPercentage: 0.85, categoryPercentage: 0.9 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipBase }, scales: { x: { grid: { color: gc, borderDash: [4,4] }, ticks: { color: tc, font: { size: 10 } }, border: { display: false } }, y: { min: 0, max: 20, ticks: { color: tc, font: { size: 11 }, stepSize: 5 }, grid: { color: gc, borderDash: [4,4] }, border: { display: false } } } }
  });

  /* Modules table */
  var modulesData = [
    { code:'SYST',  name:'System',                    students:67,  grade:14.0, success:100, failure:0, disp:2.37 },
    { code:'SFSD',  name:'Structure fichiers',         students:28,  grade:14.3, success:100, failure:0, disp:2.11 },
    { code:'ANA2',  name:'ANALYSE2',                   students:148, grade:14.2, success:100, failure:0, disp:2.30 },
    { code:'BDD',   name:'Bases de données',           students:28,  grade:14.5, success:100, failure:0, disp:2.47 },
    { code:'SYST2', name:"Systèmes d'exploitation",   students:28,  grade:13.3, success:100, failure:0, disp:2.22 },
    { code:'ALG',   name:'Algèbre',                   students:66,  grade:14.1, success:100, failure:0, disp:2.26 },
    { code:'MECA',  name:'Mecanique',                  students:91,  grade:13.9, success:100, failure:0, disp:2.26 },
    { code:'ANA3',  name:'Analyse3',                   students:40,  grade:14.0, success:100, failure:0, disp:2.51 },
    { code:'PRST',  name:'Probabilités',               students:40,  grade:14.0, success:100, failure:0, disp:2.40 },
    { code:'OOP',   name:'Object Oriented Programming',students:22,  grade:14.5, success:100, failure:0, disp:2.50 },
    { code:'OOE',   name:'Optique',                   students:22,  grade:14.3, success:100, failure:0, disp:2.64 },
    { code:'ALSDS', name:'Algorithmique',              students:22,  grade:14.1, success:100, failure:0, disp:2.48 },
    { code:'ANG2',  name:'Anglais2',                  students:80,  grade:14.0, success:100, failure:0, disp:2.17 },
    { code:'TOE',   name:"Technique d'expression",    students:30,  grade:14.3, success:100, failure:0, disp:2.27 },
    { code:'STRM',  name:'Structure machine',          students:30,  grade:14.4, success:100, failure:0, disp:2.50 }
  ];
  var modTbody = document.getElementById('modulesTableBody');
  if (modTbody) {
    modTbody.innerHTML = modulesData.map(function(m, i) {
      return '<tr style="border-bottom:1px solid rgba(150,180,230,.2);background:' + (i%2===0?'rgba(215,225,245,.13)':'transparent') + ';"><td style="padding:11px 14px;color:#2563eb;font-weight:700;">' + m.code + '</td><td style="padding:11px 14px;color:#1e293b;">' + m.name + '</td><td style="padding:11px 14px;text-align:center;color:#7c3aed;font-weight:600;">' + m.students + '</td><td style="padding:11px 14px;text-align:center;"><span style="background:#0f2044;color:#fff;padding:4px 12px;border-radius:8px;font-weight:700;font-size:13px;">' + m.grade + '/20</span></td><td style="padding:11px 14px;text-align:center;color:#16a34a;font-weight:700;">' + m.success + '%</td><td style="padding:11px 14px;text-align:center;color:#dc2626;font-weight:700;">' + m.failure + '%</td><td style="padding:11px 14px;text-align:center;color:#7c3aed;font-weight:600;">' + m.disp.toFixed(2) + '</td></tr>';
    }).join('');
  }

  /* Students data */
  var studentsData = [
    { rank:1,  mat:'79/1234', name:'Adel',    promo:'1975-1979', avg:18.0, status:'Graduate' },
    { rank:2,  mat:'81/323',  name:'Walid',   promo:'1981-1985', avg:18.0, status:'Graduate' },
    { rank:3,  mat:'78/425',  name:'Ranim',   promo:'1978-1982', avg:18.0, status:'Graduate' },
    { rank:4,  mat:'75/326',  name:'Karima',  promo:'1975-1979', avg:17.8, status:'Graduate' },
    { rank:5,  mat:'76/345',  name:'Toufik',  promo:'1976-1980', avg:17.8, status:'Graduate' },
    { rank:6,  mat:'76/268',  name:'Reda',    promo:'1976-1980', avg:17.7, status:'Graduate' },
    { rank:7,  mat:'75/001',  name:'Mohamed', promo:'1975-1979', avg:17.7, status:'Graduate' },
    { rank:8,  mat:'74/003',  name:'Hakima',  promo:'1974-1978', avg:17.7, status:'Graduate' },
    { rank:9,  mat:'77/012',  name:'Rima',    promo:'1977-1981', avg:17.7, status:'Graduate' },
    { rank:10, mat:'80/325',  name:'Widad',   promo:'1980-1984', avg:17.7, status:'Graduate' }
  ];

  var iconGold   = '<svg width="22" height="22" viewBox="0 0 23 23" fill="none"><path d="M14.7141 12.2559L16.1546 20.3623C16.1707 20.4578 16.1573 20.5559 16.1162 20.6435C16.0751 20.7311 16.0082 20.8041 15.9244 20.8527C15.8407 20.9013 15.7441 20.9232 15.6476 20.9154C15.5511 20.9076 15.4593 20.8706 15.3844 20.8092L11.9806 18.2544C11.8163 18.1316 11.6167 18.0653 11.4116 18.0653C11.2065 18.0653 11.0068 18.1316 10.8425 18.2544L7.43298 20.8082C7.35817 20.8695 7.26646 20.9065 7.17008 20.9143C7.0737 20.9221 6.97724 20.9003 6.89356 20.8518C6.80988 20.8034 6.74296 20.7306 6.70174 20.6431C6.66052 20.5556 6.64695 20.4577 6.66284 20.3623L8.10233 12.2559" stroke="#F0B100" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.4118 13.3118C14.5624 13.3118 17.1165 10.7577 17.1165 7.60709C17.1165 4.45645 14.5624 1.90234 11.4118 1.90234C8.26113 1.90234 5.70703 4.45645 5.70703 7.60709C5.70703 10.7577 8.26113 13.3118 11.4118 13.3118Z" stroke="#F0B100" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var iconSilver = '<svg width="22" height="22" viewBox="0 0 23 23" fill="none"><path d="M14.7141 12.2559L16.1546 20.3623C16.1707 20.4578 16.1573 20.5559 16.1162 20.6435C16.0751 20.7311 16.0082 20.8041 15.9244 20.8527C15.8407 20.9013 15.7441 20.9232 15.6476 20.9154C15.5511 20.9076 15.4593 20.8706 15.3844 20.8092L11.9806 18.2544C11.8163 18.1316 11.6167 18.0653 11.4116 18.0653C11.2065 18.0653 11.0068 18.1316 10.8425 18.2544L7.43298 20.8082C7.35817 20.8695 7.26646 20.9065 7.17008 20.9143C7.0737 20.9221 6.97724 20.9003 6.89356 20.8518C6.80988 20.8034 6.74296 20.7306 6.70174 20.6431C6.66052 20.5556 6.64695 20.4577 6.66284 20.3623L8.10233 12.2559" stroke="#99A1AF" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.4118 13.3118C14.5624 13.3118 17.1165 10.7577 17.1165 7.60709C17.1165 4.45645 14.5624 1.90234 11.4118 1.90234C8.26113 1.90234 5.70703 4.45645 5.70703 7.60709C5.70703 10.7577 8.26113 13.3118 11.4118 13.3118Z" stroke="#99A1AF" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var iconBronze = '<svg width="22" height="22" viewBox="0 0 23 23" fill="none"><path d="M14.7141 12.2559L16.1546 20.3623C16.1707 20.4578 16.1573 20.5559 16.1162 20.6435C16.0751 20.7311 16.0082 20.8041 15.9244 20.8527C15.8407 20.9013 15.7441 20.9232 15.6476 20.9154C15.5511 20.9076 15.4593 20.8706 15.3844 20.8092L11.9806 18.2544C11.8163 18.1316 11.6167 18.0653 11.4116 18.0653C11.2065 18.0653 11.0068 18.1316 10.8425 18.2544L7.43298 20.8082C7.35817 20.8695 7.26646 20.9065 7.17008 20.9143C7.0737 20.9221 6.97724 20.9003 6.89356 20.8518C6.80988 20.8034 6.74296 20.7306 6.70174 20.6431C6.66052 20.5556 6.64695 20.4577 6.66284 20.3623L8.10233 12.2559" stroke="#F54900" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.4118 13.3118C14.5624 13.3118 17.1165 10.7577 17.1165 7.60709C17.1165 4.45645 14.5624 1.90234 11.4118 1.90234C8.26113 1.90234 5.70703 4.45645 5.70703 7.60709C5.70703 10.7577 8.26113 13.3118 11.4118 13.3118Z" stroke="#F54900" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var stTbody = document.getElementById('studentsTableBody');
  if (stTbody) {
    stTbody.innerHTML = studentsData.map(function(s, i) {
      var medal = s.rank === 1 ? iconGold : s.rank === 2 ? iconSilver : s.rank === 3 ? iconBronze : '';
      return '<tr style="border-bottom:1px solid rgba(150,180,230,.2);background:' + (i%2===0?'rgba(215,225,245,.13)':'transparent') + ';"><td style="padding:13px 14px;"><div style="display:flex;align-items:center;gap:8px;">' + medal + '<b style="color:#101828;">#' + s.rank + '</b></div></td><td style="padding:13px 14px;color:#9810fa;font-weight:600;">' + s.mat + '</td><td style="padding:13px 14px;color:#101828;">' + s.name + '</td><td style="padding:13px 14px;color:#4a5565;">' + s.promo + '</td><td style="padding:13px 14px;text-align:center;"><span style="background:#9810fa;color:#fff;padding:4px 12px;border-radius:10px;font-weight:700;font-size:13px;">' + s.avg + '/20</span></td><td style="padding:13px 14px;text-align:center;"><span style="background:#00a63e;color:#fff;padding:4px 14px;border-radius:10px;font-weight:600;font-size:13px;">' + s.status + '</span></td><td style="padding:13px 14px;text-align:center;"><button onclick=\'viewStudent(' + JSON.stringify(s) + ')\' style="background:#fff;border:1.4px solid rgba(0,0,0,.12);border-radius:10px;padding:6px 20px;font-size:13px;font-weight:600;color:#101828;cursor:pointer;">View</button></td></tr>';
    }).join('');
  }

  /* allStudentsData (150) */
  var promos     = ['1974-1978','1975-1979','1976-1980','1977-1981','1978-1982','1979-1983','1980-1984','1981-1985','1982-1986','1983-1987','1984-1988'];
  var firstNames = ['Adel','Walid','Ranim','Karima','Toufik','Reda','Mohamed','Hakima','Rima','Widad','Samir','Nadia','Karim','Fatima','Yacine','Amira','Rachid','Salima','Bilal','Meriem','Sofiane','Asma','Khaled','Hanane','Djamel','Lynda','Farid','Sonia','Tarek','Naima','Brahim','Rania','Aziz','Yasmine','Hamza','Dalila','Omar','Houria','Fares','Leila','Anis','Sabrina','Nassim','Khadija','Lotfi','Djamila','Ryad','Lamia','Chafik','Zineb'];
  var surNames   = ['Belarbi','Meziane','Boudali','Hadj','Ferrahi','Amrani','Tebbal','Haddad','Mahmoudi','Bensalem','Cheikh','Allaoua','Zerrouk','Ouadfel','Benchikh','Tlemcani','Zaidi','Ghezali','Mekki','Rahmani'];
  var allData    = studentsData.slice();
  var usedMats   = {};
  studentsData.forEach(function(s) { usedMats[s.mat] = true; });
  var rankCnt = 11;
  for (var p = 0; p < promos.length && allData.length < 150; p++) {
    var yr = parseInt(promos[p]);
    for (var i = 0; i < 14 && allData.length < 150; i++) {
      var avg = parseFloat((10 + Math.random() * 8).toFixed(1));
      var mat = (yr % 100) + '/' + (100 + rankCnt * 7 + i);
      if (usedMats[mat]) continue;
      usedMats[mat] = true;
      allData.push({ rank: rankCnt++, mat: mat, name: firstNames[(rankCnt * 3 + i) % firstNames.length] + ' ' + surNames[(rankCnt + i) % surNames.length], promo: promos[p], avg: avg, status: avg >= 10 ? 'Graduate' : 'Non-Graduate' });
    }
  }
  allData.sort(function(a,b) { return a.rank - b.rank; });
  window._allStudentsData  = allData;
  window._browseFiltered   = allData.slice();
  window._browsePage       = 0;

  /* Browse All button */
  var browseBtn = document.getElementById('browseAllBtn');
  if (browseBtn) {
    browseBtn.addEventListener('click', function() {
      var promoOpts  = ['All Promotions','1974-1978','1975-1979','1976-1980','1977-1981','1978-1982','1979-1983','1980-1984','1981-1985','1982-1986','1983-1987','1984-1988'].map(function(p) { return '<option value="' + p + '">' + p + '</option>'; }).join('');
      var statusOpts = ['All Status','Graduate','Non-Graduate'].map(function(s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
      openModal(
        modalHeader('Browse All Students') +
        '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;"><div style="position:relative;flex:1;min-width:140px;"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" style="position:absolute;left:11px;top:50%;transform:translateY(-50%);"><circle cx="8.5" cy="8.5" r="5.5" stroke="#6b7280" stroke-width="1.6"/><path d="M14.5 14.5l3 3" stroke="#6b7280" stroke-width="1.6" stroke-linecap="round"/></svg><input id="browseSearch" type="text" placeholder="Search name or mat..." style="width:100%;padding:9px 10px 9px 34px;border:1.4px solid #d1d5db;border-radius:10px;font-size:13px;outline:none;box-sizing:border-box;" oninput="applyBrowseFilter()" onfocus="this.style.borderColor=\'#9810fa\'" onblur="this.style.borderColor=\'#d1d5db\'"/></div><select id="browsePromo" onchange="applyBrowseFilter()" style="padding:9px 10px;border:1.4px solid #d1d5db;border-radius:10px;font-size:13px;outline:none;color:#374151;background:#fff;cursor:pointer;">' + promoOpts + '</select><select id="browseStatus" onchange="applyBrowseFilter()" style="padding:9px 10px;border:1.4px solid #d1d5db;border-radius:10px;font-size:13px;outline:none;color:#374151;background:#fff;cursor:pointer;">' + statusOpts + '</select></div>' +
        '<div id="browseCount" style="font-size:12px;color:#6b7280;margin-bottom:10px;">Showing all ' + allData.length + ' students</div>' +
        '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12.5px;"><thead><tr style="border-bottom:2px solid rgba(150,180,230,.4);"><th style="padding:8px 10px;text-align:left;color:#041f49;font-weight:700;">#</th><th style="padding:8px 10px;text-align:left;color:#041f49;font-weight:700;">Mat</th><th style="padding:8px 10px;text-align:left;color:#041f49;font-weight:700;">Name</th><th style="padding:8px 10px;text-align:left;color:#041f49;font-weight:700;">Promotion</th><th style="padding:8px 10px;text-align:center;color:#041f49;font-weight:700;">Avg</th><th style="padding:8px 10px;text-align:center;color:#041f49;font-weight:700;">Status</th><th style="padding:8px 10px;text-align:center;color:#041f49;font-weight:700;"></th></tr></thead><tbody id="browseTbody"></tbody></table></div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;gap:8px;"><button id="browsePrev" onclick="browsePagerNav(-1)" style="padding:7px 18px;border:1.4px solid #d1d5db;border-radius:9px;background:#fff;font-size:13px;font-weight:600;cursor:pointer;color:#374151;">← Prev</button><span id="browsePageLabel" style="font-size:13px;color:#6b7280;"></span><button id="browseNext" onclick="browsePagerNav(1)" style="padding:7px 18px;border:1.4px solid #d1d5db;border-radius:9px;background:#fff;font-size:13px;font-weight:600;cursor:pointer;color:#374151;">Next →</button></div>'
      );
      var box = document.getElementById('modalBox');
      if (box) { box.style.maxWidth = '720px'; box.style.width = '94vw'; }
      window._browseFiltered = allData.slice();
      window._browsePage = 0;
      renderBrowseTable();
    });
  }

  /* Import PDF button */
  var importBtn = document.querySelector('.btn.btn-primary');
  if (importBtn) {
    importBtn.addEventListener('click', function() {
      openModal(
        modalHeader('Import Scanned PDF') +
        '<div id="dropZone" onclick="document.getElementById(\'pdfFileInput\').click()" style="border:2px dashed #96abde;border-radius:14px;padding:36px 20px;text-align:center;cursor:pointer;background:#f8faff;"><svg width="40" height="40" viewBox="0 0 20 20" fill="none" style="margin:0 auto 12px;display:block;"><path d="M3 13v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="#3c8bc1" stroke-width="1.6" stroke-linecap="round"/><path d="M10 3v9" stroke="#3c8bc1" stroke-width="1.6" stroke-linecap="round"/><path d="M7 6l3-3 3 3" stroke="#3c8bc1" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><div style="font-size:15px;font-weight:600;color:#02112a;margin-bottom:6px;">Drop your PDF here</div><div style="font-size:13px;color:#6b7280;">or click to browse</div><input id="pdfFileInput" type="file" accept=".pdf" style="display:none;" onchange="handlePdfSelect(this)"/></div>' +
        '<div id="pdfStatus" style="margin-top:14px;font-size:13px;color:#6b7280;text-align:center;"></div>' +
        '<div style="display:flex;gap:10px;margin-top:20px;"><button onclick="closeModal()" style="flex:1;background:#f3f4f6;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:600;color:#374151;cursor:pointer;">Cancel</button><button id="importConfirmBtn" disabled onclick="simulateImport()" style="flex:1;background:linear-gradient(116deg,#3c8bc1,#70b2e9);border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:600;color:#fff;cursor:pointer;opacity:.5;">Import</button></div>'
      );
      var dz = document.getElementById('dropZone');
      if (dz) {
        dz.addEventListener('dragover', function(e) { e.preventDefault(); dz.style.borderColor='#3c8bc1'; dz.style.background='#eef4ff'; });
        dz.addEventListener('dragleave', function() { dz.style.borderColor='#96abde'; dz.style.background='#f8faff'; });
        dz.addEventListener('drop', function(e) { e.preventDefault(); handlePdfSelect({ files: e.dataTransfer.files }); });
      }
    });
  }

  /* Search Student button */
  var searchBtns = document.querySelectorAll('.btn.btn-secondary');
  if (searchBtns[0]) {
    searchBtns[0].addEventListener('click', function() {
      openModal(
        modalHeader('Search Student') +
        '<div style="position:relative;margin-bottom:16px;"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);"><circle cx="8.5" cy="8.5" r="5.5" stroke="#6b7280" stroke-width="1.6"/><path d="M14.5 14.5l3 3" stroke="#6b7280" stroke-width="1.6" stroke-linecap="round"/></svg><input id="searchInput" type="text" placeholder="Name or Matricule..." oninput="searchStudents(this.value)" style="width:100%;padding:12px 14px 12px 40px;border:1.4px solid #d1d5db;border-radius:12px;font-size:14px;outline:none;box-sizing:border-box;" onfocus="this.style.borderColor=\'#3c8bc1\'" onblur="this.style.borderColor=\'#d1d5db\'"/></div>' +
        '<div id="searchResults" style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;"><div style="text-align:center;color:#6b7280;font-size:13px;padding:20px;">Type to search...</div></div>'
      );
      setTimeout(function() { var si = document.getElementById('searchInput'); if (si) si.focus(); }, 100);
    });
  }

  /* Generate Reports button */
  if (searchBtns[1]) {
    searchBtns[1].addEventListener('click', function() {
      var reports = [['Full Archive Report','All promotions 1974–1988'],['Promotions Summary','Success & failure rates'],['Modules Performance','Grades & dispersion'],['Top Students Ranking','Best 150 students']];
      openModal(
        modalHeader('Generate Report') +
        '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">' +
        reports.map(function(r, i) {
          return '<label style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:12px;border:1.4px solid #e5e7eb;cursor:pointer;" onmouseover="this.style.borderColor=\'#3c8bc1\';this.style.background=\'#f0f7ff\'" onmouseout="this.style.borderColor=\'#e5e7eb\';this.style.background=\'#fff\'"><input type="checkbox" id="rep' + i + '" style="width:16px;height:16px;accent-color:#3c8bc1;cursor:pointer;"/><div><div style="font-size:14px;font-weight:600;color:#02112a;">' + r[0] + '</div><div style="font-size:12px;color:#6b7280;">' + r[1] + '</div></div></label>';
        }).join('') +
        '</div><div style="display:flex;gap:10px;"><button onclick="closeModal()" style="flex:1;background:#f3f4f6;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:600;color:#374151;cursor:pointer;">Cancel</button><button onclick="simulateGenerate()" style="flex:1;background:linear-gradient(116deg,#3c8bc1,#70b2e9);border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:600;color:#fff;cursor:pointer;">Generate PDF</button></div>'
      );
    });
  }

}); // fin DOMContentLoaded
const sidebar = document.getElementById("sidebar");
const logo = document.querySelector(".sidebar-logo .esi svg");

logo.addEventListener("click", () => {
  if (sidebar.classList.contains("collapsed")) {
    sidebar.classList.remove("collapsed");
  }
});
