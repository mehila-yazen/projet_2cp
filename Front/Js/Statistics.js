// ── Global Chart defaults ──
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = '#30456a';

const YEARS = [1974,1975,1976,1977,1978,1979,1980,1981,1982,1983,1984];

// Dashed grid lines like in captures
const GRID_DASHED = {
  color: 'rgba(130,120,200,0.25)',
  lineWidth: 1,
  drawBorder: false,
};
const GRID_SOLID = {
  color: 'rgba(150,171,222,0.2)',
  drawBorder: false,
};
const TICK = { font:{ size:10.5, weight:'500' }, color:'#30456a' };
const BASE_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend:{ display:false }, tooltip:{ mode:'index', intersect:false } },
};

// ── C1: Success Rate by Promotion – stacked bars, green + red ──
const chart1 = new Chart(document.getElementById('c1'), {
  type: 'bar',
  data: {
    labels: YEARS,
    datasets: [
      {
        label: 'Success Rate (%)',
        data: [2,3,5,4,6,3,4,5,3,4,2],
        backgroundColor: '#10b981',
        borderRadius: 0,
        barPercentage: 0.65,
      },
      {
        label: 'Failure Rate (%)',
        data: [98,97,95,96,94,97,96,95,97,96,98],
        backgroundColor: '#ef4444',
        borderRadius: 0,
        barPercentage: 0.65,
      }
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true, position: 'bottom',
        labels: {
          boxWidth: 12, padding: 12, font:{ size:11 },
          generateLabels(chart) {
            return chart.data.datasets.map((ds,i)=>({
              text: ds.label, fillStyle: ds.backgroundColor,
              strokeStyle: ds.backgroundColor, lineWidth:0, datasetIndex:i,
              fontColor: i===0 ? '#10b981' : '#ef4444',
            }));
          }
        }
      },
      tooltip: { mode:'index', intersect:false }
    },
    scales: {
      x: { grid:GRID_SOLID, ticks:TICK, border:{display:false} },
      y: { grid:GRID_SOLID, max:100, ticks:{ stepSize:25, ...TICK }, border:{display:false} }
    }
  }
});

// ── C2: Average Grade Trend – flat line ~11.5 ──
const chart2 = new Chart(document.getElementById('c2'), {
  type: 'line',
  data: {
    labels: YEARS,
    datasets: [{
      label: 'Avg Grade (/20)',
      data: [11.6,11.4,11.5,11.6,11.5,11.4,11.5,11.6,11.5,11.4,11.5],
      borderColor: '#4a7bff',
      backgroundColor: 'rgba(74,123,255,0.0)',
      tension: 0,
      pointRadius: 4,
      pointBackgroundColor: '#ffffff',
      pointBorderColor: '#4a7bff',
      pointBorderWidth: 1.5,
      borderWidth: 2,
    }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true, position: 'bottom',
        labels: {
          boxWidth: 12, padding: 12, font:{ size:11 },
          usePointStyle: true, pointStyle: 'line',
          color: '#4a7bff',
        }
      }
    },
    scales: {
      x: { grid:GRID_SOLID, ticks:TICK, border:{display:false} },
      y: { grid:GRID_SOLID, min:0, max:20, ticks:{ stepSize:5, ...TICK }, border:{display:false} }
    }
  }
});

// ── C3: Student Distribution – purple bars, dashed top border ──
// Register plugin to draw dashed border
const dashedBorderPlugin = {
  id: 'dashedBorder',
  afterDraw(chart) {
    if (!chart.config._dashedBorder) return;
    const { ctx, chartArea:{ left, right, top } } = chart;
    ctx.save();
    ctx.setLineDash([6,4]);
    ctx.strokeStyle = 'rgba(200,100,200,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(left, top, right-left, chart.chartArea.bottom - top);
    ctx.stroke();
    ctx.restore();
  }
};
Chart.register(dashedBorderPlugin);

const chart3 = new Chart(document.getElementById('c3'), {
  type: 'bar',
  data: {
    labels: YEARS,
    datasets:[{
      data:[920,865,910,935,905,915,950,908,960,895,933],
      backgroundColor:'#7c3aed',
      borderRadius:3,
      barPercentage:0.65,
    }]
  },
  options:{
    responsive:true, maintainAspectRatio:false,
    _dashedBorder: true,
    plugins:{ legend:{display:false} },
    scales:{
      x:{ grid:{ color:'rgba(130,120,200,0.2)', drawBorder:false, borderDash:[4,3] }, ticks:TICK, border:{display:false} },
      y:{ grid:{ color:'rgba(130,120,200,0.2)', drawBorder:false, borderDash:[4,3] }, min:0, max:1000, ticks:{ stepSize:250, ...TICK }, border:{display:false} }
    }
  }
});

// ── C4: Gender Distribution – pie, blue big + purple small slice ──
const chart4 = new Chart(document.getElementById('c4'), {
  type: 'pie',
  data: {
    labels: ['Male: 85.3%', 'Female: 14.7%'],
    datasets:[{
      data:[85.3, 14.7],
      backgroundColor:['#4a7bff','#7c3aed'],
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.9)',
      hoverOffset: 6,
    }]
  },
  options:{
    responsive:true, maintainAspectRatio:false,
    rotation: 0.04, // push the female slice further down-right
    plugins:{
      legend:{ display:false },
      tooltip:{ callbacks:{ label: ctx => ` ${ctx.label}` } }
    }
  },
  plugins:[{
    id:'pieLabels',
    afterDraw(chart){
      const {ctx} = chart;
      const meta = chart.getDatasetMeta(0);
      if(!meta || !meta.data.length) return;
      const arc0 = meta.data[0];
      const cx = arc0.x, cy = arc0.y;
      const r = arc0.outerRadius;
      ctx.save();
      ctx.font = '600 12.5px Inter';
      ctx.textBaseline = 'middle';
      const maleLabel = chart.data.labels[0];
      const femaleLabel = chart.data.labels[1];
      // Male label (left)
      ctx.fillStyle = '#4a7bff';
      ctx.textAlign = 'right';
      ctx.fillText(maleLabel, cx - r - 26, cy - 10);
      // Female label (right)
      ctx.fillStyle = '#7c3aed';
      ctx.textAlign = 'left';
      ctx.fillText(femaleLabel, cx + r + 22, cy + 10);
      ctx.restore();
    }
  }]
});

// ── C5: Grade Distribution – pink bars, dashed grid ──
const chart5 = new Chart(document.getElementById('c5'), {
  type: 'bar',
  data:{
    labels:['0-5','5-10','10-12','12-14','14-16','16-18','18-20'],
    datasets:[{
      data:[0,480,6760,2810,35,0,0],
      backgroundColor:'#e34298',
      borderRadius:4,
      barPercentage:0.68,
    }]
  },
  options:{
    responsive:true, maintainAspectRatio:false,
    _dashedBorder: true,
    plugins:{ legend:{display:false} },
    scales:{
      x:{ grid:{ color:'rgba(130,120,200,0.2)', borderDash:[4,3], drawBorder:false }, ticks:TICK, border:{display:false} },
      y:{ grid:{ color:'rgba(130,120,200,0.2)', borderDash:[4,3], drawBorder:false }, min:0, max:8000, ticks:{ stepSize:2000, ...TICK }, border:{display:false} }
    }
  }
});

// ── C6: Top 10 Modules – horizontal bar green, dashed border ──
const chart6 = new Chart(document.getElementById('c6'), {
  type: 'bar',
  data:{
    labels:['LNG201','INF201','INF401','MAT202','MAT102','MAT201','INF403','INF101','INF302','INF303'],
    datasets:[{
      data:[62.76,62.43,62.39,62.27,62.18,62.17,62.13,62.01,62.00,61.79],
      backgroundColor:'#1cb98a',
      borderRadius:3,
      barPercentage:0.72,
    }]
  },
  options:{
    indexAxis:'y',
    responsive:true, maintainAspectRatio:false,
    _dashedBorder: true,
    plugins:{ legend:{display:false} },
    scales:{
      x:{ grid:{ color:'rgba(130,120,200,0.2)', borderDash:[4,3], drawBorder:false }, min:0, max:80, ticks:{ stepSize:20, color:'#30456a', font:{ size:10.5, weight:'500' } }, border:{display:false} },
      y:{ grid:{ display:false }, ticks:{ color:'#1f355e', font:{ size:10.5, weight:'500' } }, border:{display:false} }
    }
  }
});

// ── TABLE ──
const rows=[
  ['LNG201','Anglais Technique','62.76%','37.24%','11.57/20','9.26'],
  ['INF201','Algorithmique et Programmation II','62.43%','37.57%','11.55/20','9.24'],
  ['INF401','Génie Logiciel','62.39%','37.61%','11.55/20','9.24'],
  ['MAT202','Probabilités','62.27%','37.73%','11.55/20','9.24'],
  ['MAT102','Algèbre','62.18%','37.82%','11.57/20','9.26'],
  ['MAT201','Mathématiques II','62.17%','37.83%','11.52/20','9.22'],
  ['INF403','Intelligence Artificielle','62.13%','37.87%','11.49/20','9.19'],
  ['INF101','Algorithmique et Programmation I','62.01%','37.99%','11.54/20','9.23'],
  ['INF302',"Systèmes d'Exploitation",'62%','38%','11.5/20','9.2'],
  ['INF303','Réseaux Informatiques','61.79%','38.21%','11.49/20','9.19'],
  ['INF102','Architecture des Ordinateurs','61.73%','38.27%','11.46/20','9.17'],
  ['INF404',"Projet de Fin d'Études",'61.67%','38.33%','11.49/20','9.19'],
  ['MAT301','Recherche Opérationnelle','61.64%','38.36%','11.5/20','9.2'],
  ['INF301','Bases de Données','61.57%','38.43%','11.46/20','9.17'],
  ['INF202','Structures de Données','61.53%','38.47%','11.43/20','9.14'],
  ['INF402','Compilation','61.45%','38.55%','11.41/20','9.13'],
  ['MAT101','Mathématiques I','60.6%','39.4%','11.45/20','9.16'],
];
const tb = document.getElementById('tbody');
rows.forEach(r => tb.insertAdjacentHTML('beforeend',`
  <tr>
    <td><strong>${r[0]}</strong></td>
    <td class="tn">${r[1]}</td>
    <td class="tc"><span class="badge bg">${r[2]}</span></td>
    <td class="tc"><span class="badge br">${r[3]}</span></td>
    <td class="tc" style="font-weight:500">${r[4]}</td>
    <td class="tc" style="color:#364153;font-weight:400">${r[5]}</td>
  </tr>`));

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

const promotionFilter = document.getElementById('promotionFilter');
const moduleFilter = document.getElementById('moduleFilter');
const kpiStudents = document.getElementById('kpiStudents');
const kpiSuccess = document.getElementById('kpiSuccess');
const kpiFailure = document.getElementById('kpiFailure');
const kpiAvg = document.getElementById('kpiAvg');
const kpiPromotions = document.getElementById('kpiPromotions');
const chartSuccess = chart1;
const chartAverage = chart2;
const chartStudents = chart3;
const chartGender = chart4;
const chartTopModules = chart6;

if (moduleFilter) {
  Array.from(moduleFilter.options).forEach(option => {
    if (!option.value) option.value = option.textContent.trim().slice(0, 3);
  });
}

const basePromotionData = {
  labels: [...YEARS],
  success: [...chartSuccess.data.datasets[0].data],
  failure: [...chartSuccess.data.datasets[1].data],
  average: [...chartAverage.data.datasets[0].data],
  students: [...chartStudents.data.datasets[0].data],
};
const baseGradeDistribution = [0,480,6760,2810,35,0,0];
const baseGenderDistribution = { male: 85.3, female: 14.7 };
const dashboardDistributionData = {
  grade: {
    all: {
      all: [...baseGradeDistribution],
      INF: [0,420,6480,3010,95,18,0],
      MAT: [10,620,5920,3250,160,26,4],
      LNG: [0,260,7020,2380,60,8,0],
    },
    byPromotion: {
      // Ready for later:
      // 1974: { all:[...], INF:[...], MAT:[...], LNG:[...] }
    },
  },
  gender: {
    all: {
      all: { ...baseGenderDistribution },
      INF: { male: 83.8, female: 16.2 },
      MAT: { male: 88.1, female: 11.9 },
      LNG: { male: 79.6, female: 20.4 },
    },
    byPromotion: {
      1974: { all:{ male: 84.6, female: 15.4 } },
      1975: { all:{ male: 84.9, female: 15.1 } },
      1976: { all:{ male: 85.1, female: 14.9 } },
      1977: { all:{ male: 85.4, female: 14.6 } },
      1978: { all:{ male: 85.6, female: 14.4 } },
      1979: { all:{ male: 85.3, female: 14.7 } },
      1980: { all:{ male: 85.8, female: 14.2 } },
      1981: { all:{ male: 86.0, female: 14.0 } },
      1982: { all:{ male: 86.2, female: 13.8 } },
      1983: { all:{ male: 85.7, female: 14.3 } },
      1984: { all:{ male: 85.5, female: 14.5 } },
    },
  },
};

const moduleData = rows.map(r => ({
  code: r[0],
  name: r[1],
  success: parseFloat(r[2]),
  failure: parseFloat(r[3]),
  avg: parseFloat(r[4]),
  avg80: parseFloat(r[5]),
  family: r[0].slice(0, 3),
}));

function formatPercent(value) {
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2).replace(/0$/, '')}%`;
}

function formatGrade(value) {
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded * 10) ? rounded.toFixed(1) : rounded.toFixed(2).replace(/0$/, '')}/20`;
}

function formatCompact(value) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded * 10) ? rounded.toFixed(1) : rounded.toFixed(2).replace(/0$/, '');
}

function renderRows(data) {
  tb.innerHTML = '';
  data.forEach(r => tb.insertAdjacentHTML('beforeend', `
    <tr>
      <td><strong>${r.code}</strong></td>
      <td class="tn">${r.name}</td>
      <td class="tc"><span class="badge bg">${formatPercent(r.success)}</span></td>
      <td class="tc"><span class="badge br">${formatPercent(r.failure)}</span></td>
      <td class="tc" style="font-weight:500">${formatGrade(r.avg)}</td>
      <td class="tc" style="color:#364153;font-weight:400">${formatCompact(r.avg80)}</td>
    </tr>`));
}

function getSelectedPromotionIndex() {
  const value = promotionFilter ? promotionFilter.value : 'all';
  return value === 'all' ? -1 : YEARS.indexOf(Number(value));
}

function getSelectedModuleFamily() {
  const rawValue = moduleFilter ? moduleFilter.value : 'all';
  return rawValue === 'all' ? 'all' : rawValue.slice(0, 3);
}

function getSelectedPromotionKey() {
  const index = getSelectedPromotionIndex();
  return index >= 0 ? String(YEARS[index]) : 'all';
}

function buildModuleViewData() {
  const family = getSelectedModuleFamily();
  return (family === 'all'
    ? [...moduleData]
    : moduleData.filter(item => item.family === family)
  ).map(item => ({ ...item }));
}

function buildGradeDistribution() {
  const promotionKey = getSelectedPromotionKey();
  const family = getSelectedModuleFamily();
  const promotionBucket = dashboardDistributionData.grade.byPromotion[promotionKey];

  if (promotionBucket && promotionBucket[family]) {
    return [...promotionBucket[family]];
  }

  if (promotionBucket && promotionBucket.all && family === 'all') {
    return [...promotionBucket.all];
  }

  const globalBucket = dashboardDistributionData.grade.all;
  if (globalBucket[family]) {
    return [...globalBucket[family]];
  }

  return [...globalBucket.all];
}

function buildGenderDistribution() {
  const promotionKey = getSelectedPromotionKey();
  const promotionBucket = dashboardDistributionData.gender.byPromotion[promotionKey];

  if (promotionBucket && promotionBucket.all) {
    return { ...promotionBucket.all };
  }

  return { ...dashboardDistributionData.gender.all.all };
}

function updatePromotionCharts() {
  const value = promotionFilter ? promotionFilter.value : 'all';
  const isAll = value === 'all';
  const index = getSelectedPromotionIndex();
  const labels = isAll ? [...basePromotionData.labels] : [basePromotionData.labels[index]];

  chartSuccess.data.labels = labels;
  chartSuccess.data.datasets[0].data = isAll ? [...basePromotionData.success] : [basePromotionData.success[index]];
  chartSuccess.data.datasets[1].data = isAll ? [...basePromotionData.failure] : [basePromotionData.failure[index]];
  chartSuccess.update();

  chartAverage.data.labels = labels;
  chartAverage.data.datasets[0].data = isAll ? [...basePromotionData.average] : [basePromotionData.average[index]];
  chartAverage.update();

  chartStudents.data.labels = labels;
  chartStudents.data.datasets[0].data = isAll ? [...basePromotionData.students] : [basePromotionData.students[index]];
  chartStudents.update();

  const studentsValue = isAll
    ? basePromotionData.students.reduce((sum, item) => sum + item, 0)
    : basePromotionData.students[index];

  if (kpiStudents) kpiStudents.textContent = studentsValue.toLocaleString('en-US');
  if (kpiPromotions) kpiPromotions.textContent = isAll ? String(basePromotionData.labels.length) : '1';

  chart5.data.datasets[0].data = buildGradeDistribution();
  chart5.update();

  const genderDistribution = buildGenderDistribution();
  chartGender.data.labels = [`Male: ${genderDistribution.male}%`, `Female: ${genderDistribution.female}%`];
  chartGender.data.datasets[0].data = [genderDistribution.male, genderDistribution.female];
  chartGender.update();
}

function updateModuleViews() {
  const filtered = buildModuleViewData();
  const family = getSelectedModuleFamily();
  const promotionIndex = getSelectedPromotionIndex();

  renderRows(filtered);

  const topModules = [...filtered].sort((a, b) => b.success - a.success).slice(0, 10);
  chartTopModules.data.labels = topModules.map(item => item.code);
  chartTopModules.data.datasets[0].data = topModules.map(item => item.success);
  chartTopModules.update();

  const avgSuccess = family === 'all' && promotionIndex >= 0
    ? basePromotionData.success[promotionIndex]
    : filtered.reduce((sum, item) => sum + item.success, 0) / filtered.length;
  const avgFailure = family === 'all' && promotionIndex >= 0
    ? basePromotionData.failure[promotionIndex]
    : filtered.reduce((sum, item) => sum + item.failure, 0) / filtered.length;
  const avgGrade = family === 'all' && promotionIndex >= 0
    ? basePromotionData.average[promotionIndex]
    : filtered.reduce((sum, item) => sum + item.avg, 0) / filtered.length;

  if (kpiSuccess) kpiSuccess.textContent = formatPercent(avgSuccess);
  if (kpiFailure) kpiFailure.textContent = formatPercent(avgFailure);
  if (kpiAvg) kpiAvg.textContent = formatGrade(avgGrade);

  chart5.data.datasets[0].data = buildGradeDistribution();
  chart5.update();

  const genderDistribution = buildGenderDistribution();
  chartGender.data.labels = [`Male: ${genderDistribution.male}%`, `Female: ${genderDistribution.female}%`];
  chartGender.data.datasets[0].data = [genderDistribution.male, genderDistribution.female];
  chartGender.update();
}

function applyDashboardFilters() {
  updatePromotionCharts();
  updateModuleViews();
}

if (promotionFilter) promotionFilter.addEventListener('change', applyDashboardFilters);
if (moduleFilter) moduleFilter.addEventListener('change', applyDashboardFilters);
applyDashboardFilters();

/* sidebar */
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


document.addEventListener('DOMContentLoaded', function() {
  var sidebar = document.getElementById('sidebar');
  var collapseBtn = document.getElementById('collapseBtn');
  if (collapseBtn && sidebar) {
    collapseBtn.addEventListener('click', function() {
      sidebar.classList.toggle('collapsed');
    });
  }
});

const sidebar = document.getElementById("sidebar");
const logo = document.querySelector(".sidebar-logo .esi svg");

logo.addEventListener("click", () => {
  if (sidebar.classList.contains("collapsed")) {
    sidebar.classList.remove("collapsed");
  }
});