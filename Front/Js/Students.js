
var students = [
  {idx:0,  id:'79/1234', mat:'79/1234', ln:'Benali',    fn:'Adel',    dip:'Ingenieur',            spec:'AH',  form:'AH 1975-1979',  grp:'Group A', grad:'1979', jury:'Admitted'},
  {idx:1,  id:'81/323',  mat:'81/323',  ln:'Hamidi',    fn:'Walid',   dip:'Ingenieur',            spec:'IH',  form:'IH 1981-1985',  grp:'Group B', grad:'1985', jury:'Admitted'},
  {idx:2,  id:'78/425',  mat:'78/425',  ln:'Meziani',   fn:'Ranim',   dip:'Ingenieur',            spec:'TRC', form:'TRC 1978-1982', grp:'Group A', grad:'1982', jury:'Admitted'},
  {idx:3,  id:'80/567',  mat:'80/567',  ln:'Khelifi',   fn:'Sarah',   dip:'Ingenieur',            spec:'OI',  form:'OI 1980-1984',  grp:'Group C', grad:'1984', jury:'Admitted'},
  {idx:4,  id:'82/789',  mat:'82/789',  ln:'Bouaziz',   fn:'Karim',   dip:'Technicien Superieur', spec:'AH',  form:'AH 1982-1985',  grp:'Group B', grad:'1985', jury:'Retake'},
  {idx:5,  id:'77/234',  mat:'77/234',  ln:'Messaoudi', fn:'Farida',  dip:'Ingenieur',            spec:'IH',  form:'IH 1977-1981',  grp:'Group A', grad:'1981', jury:'Admitted'},
  {idx:6,  id:'76/891',  mat:'76/891',  ln:'Cherif',    fn:'Mohamed', dip:'Ingenieur',            spec:'AH',  form:'AH 1976-1980',  grp:'Group B', grad:'1980', jury:'Admitted'},
  {idx:7,  id:'83/442',  mat:'83/442',  ln:'Mansouri',  fn:'Leila',   dip:'Ingenieur',            spec:'TRC', form:'TRC 1983-1987', grp:'Group A', grad:'1987', jury:'Admitted'},
  {idx:8,  id:'79/653',  mat:'79/653',  ln:'Amrani',    fn:'Nabil',   dip:'Technicien Superieur', spec:'OI',  form:'OI 1979-1982',  grp:'Group C', grad:'1982', jury:'Admitted'},
  {idx:9,  id:'84/112',  mat:'84/112',  ln:'Belkacem',  fn:'Youssef', dip:'Ingenieur',            spec:'IH',  form:'IH 1984-1988',  grp:'Group B', grad:'1988', jury:'Admitted'},
  {idx:10, id:'75/278',  mat:'75/278',  ln:'Boukhalfa', fn:'Amina',   dip:'Ingenieur',            spec:'AH',  form:'AH 1975-1979',  grp:'Group A', grad:'1979', jury:'Admitted'},
  {idx:11, id:'81/556',  mat:'81/556',  ln:'Derouiche', fn:'Rachid',  dip:'Technicien Superieur', spec:'TRC', form:'TRC 1981-1984', grp:'Group B', grad:'1984', jury:'Retake'},
  {idx:12, id:'78/990',  mat:'78/990',  ln:'Ferhat',    fn:'Samia',   dip:'Ingenieur',            spec:'OI',  form:'OI 1978-1982',  grp:'Group C', grad:'1982', jury:'Admitted'},
  {idx:13, id:'82/335',  mat:'82/335',  ln:'Ghali',     fn:'Ahmed',   dip:'Ingenieur',            spec:'IH',  form:'IH 1982-1986',  grp:'Group A', grad:'1986', jury:'Admitted'},
  {idx:14, id:'80/774',  mat:'80/774',  ln:'Haddad',    fn:'Nassima', dip:'Technicien Superieur', spec:'AH',  form:'AH 1980-1983',  grp:'Group B', grad:'1983', jury:'Admitted'},
  {idx:15, id:'77/448',  mat:'77/448',  ln:'Ighil',     fn:'Omar',    dip:'Ingenieur',            spec:'TRC', form:'TRC 1977-1981', grp:'Group A', grad:'1981', jury:'Admitted'},
  {idx:16, id:'85/221',  mat:'85/221',  ln:'Kadi',      fn:'Selma',   dip:'Ingenieur',            spec:'OI',  form:'OI 1985-1989',  grp:'Group C', grad:'1989', jury:'Admitted'},
  {idx:17, id:'79/812',  mat:'79/812',  ln:'Larbi',     fn:'Sofiane', dip:'Ingenieur',            spec:'IH',  form:'IH 1979-1983',  grp:'Group B', grad:'1983', jury:'Retake'},
  {idx:18, id:'83/667',  mat:'83/667',  ln:'Madi',      fn:'Zineb',   dip:'Technicien Superieur', spec:'AH',  form:'AH 1983-1986',  grp:'Group A', grad:'1986', jury:'Admitted'},
  {idx:19, id:'76/534',  mat:'76/534',  ln:'Nait',      fn:'Hamza',   dip:'Ingenieur',            spec:'TRC', form:'TRC 1976-1980', grp:'Group B', grad:'1980', jury:'Admitted'},
  {idx:20, id:'84/889',  mat:'84/889',  ln:'Ouali',     fn:'Djamel',  dip:'Ingenieur',            spec:'OI',  form:'OI 1984-1988',  grp:'Group C', grad:'1988', jury:'Admitted'},
  {idx:21, id:'81/223',  mat:'81/223',  ln:'Rahmani',   fn:'Lydia',   dip:'Ingenieur',            spec:'IH',  form:'IH 1981-1985',  grp:'Group A', grad:'1985', jury:'Admitted'},
  {idx:22, id:'78/455',  mat:'78/455',  ln:'Saadi',     fn:'Bilal',   dip:'Technicien Superieur', spec:'TRC', form:'TRC 1978-1981', grp:'Group B', grad:'1981', jury:'Retake'},
  {idx:23, id:'80/998',  mat:'80/998',  ln:'Taleb',     fn:'Sabrina', dip:'Ingenieur',            spec:'AH',  form:'AH 1980-1984',  grp:'Group A', grad:'1984', jury:'Admitted'},
  {idx:24, id:'75/667',  mat:'75/667',  ln:'Yahiaoui',  fn:'Malik',   dip:'Ingenieur',            spec:'OI',  form:'OI 1975-1979',  grp:'Group C', grad:'1979', jury:'Admitted'}
];

var PAGE_SIZE = 15;
var currentPage = 0;
var filtered = students.slice();
const currentDateEl = document.getElementById('currentDate');
if (currentDateEl) {
  const now = new Date();
  currentDateEl.textContent = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
function filterTable() {
  var q = document.getElementById('searchInput').value.toLowerCase();
  var dip = document.getElementById('diplomaFilter').value;
  var spec = document.getElementById('specFilter').value;
  filtered = students.filter(function(s) {
    var matchQ = !q || s.ln.toLowerCase().indexOf(q) >= 0 || s.fn.toLowerCase().indexOf(q) >= 0 || s.mat.indexOf(q) >= 0;
    var matchD = !dip || s.dip === dip;
    var matchS = !spec || s.spec === spec;
    return matchQ && matchD && matchS;
  });
  currentPage = 0;
  renderTable();
}

function renderTable() {
  var tbody = document.getElementById('tableBody');
  var start = currentPage * PAGE_SIZE;
  var end = Math.min(start + PAGE_SIZE, filtered.length);
  var page = filtered.slice(start, end);
  document.getElementById('resultsCount').textContent = 'Showing ' + filtered.length + ' of ' + students.length + ' students';
  document.getElementById('pagInfo').textContent = (start + 1) + ' - ' + end;
  document.getElementById('prevBtn').disabled = currentPage === 0;
  document.getElementById('nextBtn').disabled = end >= filtered.length;

  tbody.innerHTML = '';
  page.forEach(function(s) {
    var badgeClass = s.jury === 'Admitted' ? 'badge-admitted' : 'badge-retake';
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="cell-id" data-idx="' + s.idx + '">' + s.id + '</span></td>' +
      '<td><span class="cell-mono">' + s.mat + '</span></td>' +
      '<td>' + s.ln + '</td>' +
      '<td>' + s.fn + '</td>' +
      '<td>' + s.dip + '</td>' +
      '<td><span class="spec-badge">' + s.spec + '</span></td>' +
      '<td><span class="cell-formation">' + s.form + '</span></td>' +
      '<td>' + s.grp + '</td>' +
      '<td>' + s.grad + '</td>' +
      '<td><span class="status-badge ' + badgeClass + '">' + s.jury + '</span></td>' +
      '<td><button class="btn-view" data-idx="' + s.idx + '"><svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#view-profile-clip)"><path d="M1.2407 7.42268C1.1906 7.28771 1.1906 7.13925 1.2407 7.00428C1.72865 5.82114 2.55692 4.80954 3.62049 4.0977C4.68405 3.38587 5.93505 3.00586 7.21485 3.00586C8.49466 3.00586 9.74564 3.38587 10.8092 4.0977C11.8728 4.80954 12.701 5.82114 13.189 7.00428C13.2391 7.13925 13.2391 7.28771 13.189 7.42268C12.701 8.60581 11.8728 9.61743 10.8092 10.3293C9.74564 11.0411 8.49466 11.4211 7.21485 11.4211C5.93505 11.4211 4.68405 11.0411 3.62049 10.3293C2.55692 9.61743 1.72865 8.60581 1.2407 7.42268Z" stroke="#0A0A0A" stroke-width="1.20229" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.21431 9.018C8.21059 9.018 9.01823 8.21035 9.01823 7.21408C9.01823 6.2178 8.21059 5.41016 7.21431 5.41016C6.21804 5.41016 5.4104 6.2178 5.4104 7.21408C5.4104 8.21035 6.21804 9.018 7.21431 9.018Z" stroke="#0A0A0A" stroke-width="1.20229" stroke-linecap="round" stroke-linejoin="round"/></g><defs><clipPath id="view-profile-clip"><rect width="14.4274" height="14.4274" fill="white"/></clipPath></defs></svg>View Profile</button></td>';
    tbody.appendChild(tr);
  });

  tbody.addEventListener('click', function(e) {
    var el = e.target.closest('[data-idx]');
    if (el) viewProfile(parseInt(el.getAttribute('data-idx')));
  });
}

function changePage(dir) {
  currentPage += dir;
  renderTable();
}

function viewProfile(idx) {
  var s = students[idx];
  if (!s) return;
  var matNum = s.mat.replace('/', '');
  document.getElementById('prof-matricule').textContent = matNum;
  document.getElementById('prof-name').textContent = s.ln + ' ' + s.fn;
  document.getElementById('prof-diploma').textContent = s.dip === 'Ingenieur' ? 'Ingenieur en Informatique' : s.dip;
  document.getElementById('prof-spec').textContent = s.spec + ' - ' + specName(s.spec);
  document.getElementById('prof-result').textContent = (s.dip === 'Ingenieur' ? 'Ingenieur en Informatique' : s.dip) + ' - ' + s.spec;
  document.getElementById('prof-year').textContent = s.grad;
  document.getElementById('page-students').classList.remove('active');
  document.getElementById('page-profile').classList.add('active');
}

function specName(code) {
  var m = {AH:'Architecture Hardware', IH:'Informatique Hardware', TRC:'Telecommunications et Reseaux', OI:'Optique et Instrumentation'};
  return m[code] || code;
}

function showStudentsList() {
  document.getElementById('page-profile').classList.remove('active');
  document.getElementById('page-students').classList.add('active');
}

function setActive(el) {
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  el.classList.add('active');
  var label = el.querySelector('.nav-label');
  if (label) {
    var page = label.textContent.trim().toLowerCase();
    if (page === 'students') {
      showStudentsList();
      document.getElementById('pageTitle').textContent = 'Students';
    } else {
      document.getElementById('pageTitle').textContent = label.textContent.trim();
    }
  }
}

(function() {
  var sidebar = document.getElementById('sidebar');
  var btn = document.getElementById('collapseBtn');
  if (btn && sidebar) {
    btn.addEventListener('click', function() {
      sidebar.classList.toggle('collapsed');
    });
  }
  var logoImg = sidebar ? sidebar.querySelector('.sidebar-logo-img') : null;
  if (logoImg && sidebar) {
    logoImg.style.cursor = 'pointer';
    logoImg.addEventListener('click', function() {
      sidebar.classList.remove('collapsed');
    });
  }
  var esi = sidebar ? sidebar.querySelector('.esi') : null;
  if (esi && sidebar) {
    esi.style.cursor = 'pointer';
    esi.addEventListener('click', function() {
      sidebar.classList.remove('collapsed');
    });
  }
})();

renderTable();