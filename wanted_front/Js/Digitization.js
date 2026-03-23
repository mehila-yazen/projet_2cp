
// Date
/* Date */
  var days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var now = new Date();
  var el = document.getElementById('headerDate');
  if (el) el.textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();

// Progress animation
let prog = 67;
const bar = document.getElementById('progressBar1');
const lbl = document.getElementById('progLabel');
const iv = setInterval(() => {
  prog += Math.random() * 3;
  if (prog >= 100) { prog = 100; clearInterval(iv); }
  bar.style.width = prog.toFixed(0) + '%';
  lbl.textContent  = prog.toFixed(0) + '%';
}, 2500);

// Nav active
function setActive(el) {
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.remove('active');
    const svg = n.querySelector('svg');
    if (svg) {
      if (svg.getAttribute('fill') && svg.getAttribute('fill') !== 'none') {
        svg.setAttribute('fill', '#266FA3');
      }
      svg.setAttribute('stroke', svg.getAttribute('stroke') !== 'none' ? '#266FA3' : 'none');
      svg.querySelectorAll('path, circle, ellipse, line, polyline, rect, polygon').forEach(el => {
        if (el.getAttribute('stroke') && el.getAttribute('stroke') !== 'none') el.setAttribute('stroke', '#266FA3');
        if (el.getAttribute('fill') && el.getAttribute('fill') !== 'none') el.setAttribute('fill', '#266FA3');
      });
    }
  });
  el.classList.add('active');
  const svg = el.querySelector('svg');
  if (svg) {
    if (svg.getAttribute('fill') && svg.getAttribute('fill') !== 'none') {
      svg.setAttribute('fill', 'white');
    }
    if (svg.getAttribute('stroke') && svg.getAttribute('stroke') !== 'none') {
      svg.setAttribute('stroke', 'white');
    }
    svg.querySelectorAll('path, circle, ellipse, line, polyline, rect, polygon').forEach(child => {
      if (child.getAttribute('stroke') && child.getAttribute('stroke') !== 'none') child.setAttribute('stroke', 'white');
      if (child.getAttribute('fill') && child.getAttribute('fill') !== 'none') child.setAttribute('fill', 'white');
    });
  }
}

// Sidebar collapse
document.getElementById('collapseBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
});
 
const sidebar = document.getElementById("sidebar");
const logo = document.querySelector(".sidebar-logo .esi svg");

logo.addEventListener("click", () => {
  if (sidebar.classList.contains("collapsed")) {
    sidebar.classList.remove("collapsed");
  }
});
// Init: apply active icon color to the default active item
(function() {
  const activeItem = document.querySelector('.nav-item.active');
  if (activeItem) setActive(activeItem);
})();

// File upload
document.getElementById('fileInput').addEventListener('change', e => {
  const files = Array.from(e.target.files).filter(f => {
    if (f.type !== 'application/pdf') { alert('Only PDF files are allowed'); return false; }
    if (f.size > 100*1024*1024) { alert(f.name+' is too large (max 100MB)'); return false; }
    return true;
  });
  if (files.length) alert(files.length+' file(s) ready for upload');
});
