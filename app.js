// ============================================================
// Boston → Japan Flight Tracker
// Loads CSVs from /data/, renders stats + charts, compares runs.
// ============================================================

const PALETTE = {
  ink:        '#1A1F3A',
  inkLight:   '#2A325E',
  cream:      '#F5EFE0',
  creamSoft:  '#EBE3D0',
  crimson:    '#C8344B',
  crimsonSoft:'#E85A6F',
  gold:       '#D4A857',
  sage:       '#7A9270',
  slate:      '#5A6378',
  greenDeal:  '#2E7D5B',
  redDeal:    '#C13B3B',
};

const DEST_NAMES = {
  NRT: 'Tokyo Narita',
  HND: 'Tokyo Haneda',
  KIX: 'Osaka Kansai',
  NGO: 'Nagoya Chubu',
};

let currentRun  = null;
let previousRun = null;
let runs        = [];   // manifest

// ============================================================
// Boot
// ============================================================
async function boot() {
  try {
    const manifestResp = await fetch('data/manifest.json');
    if (!manifestResp.ok) throw new Error('manifest.json not found');
    const manifest = await manifestResp.json();
    runs = manifest.runs.sort((a, b) => b.date.localeCompare(a.date));

    if (runs.length === 0) {
      showError('No data files found. Add a CSV to /data/ and update manifest.json.');
      return;
    }

    setupSelectors();

    // Load most recent + previous (if available)
    currentRun  = await loadRun(runs[0]);
    previousRun = runs[1] ? await loadRun(runs[1]) : null;

    renderAll();
  } catch (err) {
    console.error(err);
    showError(`Failed to load data: ${err.message}`);
  }
}

function setupSelectors() {
  const cur  = document.getElementById('run-selector');
  const cmp  = document.getElementById('compare-selector');

  runs.forEach((r, i) => {
    const opt = document.createElement('option');
    opt.value = r.file;
    opt.textContent = formatRunLabel(r);
    cur.appendChild(opt);

    const opt2 = opt.cloneNode(true);
    cmp.appendChild(opt2);
  });

  // Add "no comparison" option
  const noCmp = document.createElement('option');
  noCmp.value = '';
  noCmp.textContent = '— no comparison —';
  cmp.appendChild(noCmp);

  if (runs[1]) cmp.value = runs[1].file;
  else cmp.value = '';

  cur.addEventListener('change', async () => {
    const sel = runs.find(r => r.file === cur.value);
    currentRun = await loadRun(sel);
    renderAll();
  });
  cmp.addEventListener('change', async () => {
    if (cmp.value === '') {
      previousRun = null;
    } else {
      const sel = runs.find(r => r.file === cmp.value);
      previousRun = await loadRun(sel);
    }
    renderAll();
  });
}

function formatRunLabel(run) {
  const d = new Date(run.date);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` +
         (run.label ? ` — ${run.label}` : '');
}

async function loadRun(meta) {
  const resp = await fetch(`data/${meta.file}`);
  if (!resp.ok) throw new Error(`Could not load ${meta.file}`);
  const text = await resp.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });

  const rows = parsed.data
    .filter(r => r.price_usd && r.departure_date)
    .map(r => ({
      ...r,
      price_usd:    parseFloat(r.price_usd),
      price_per_day_usd: parseFloat(r.price_per_day_usd) || parseFloat(r.price_usd) / 14,
      out_stops:    parseInt(r.out_stops)  || 0,
      in_stops:     parseInt(r.in_stops)   || 0,
      is_nonstop:   r.is_nonstop === 'True',
    }));

  return {
    meta,
    rows,
    stats: computeStats(rows),
  };
}

// ============================================================
// Stats
// ============================================================
function computeStats(rows) {
  if (rows.length === 0) return null;

  const prices = rows.map(r => r.price_usd);
  const cheapest = rows.reduce((a, b) => a.price_usd < b.price_usd ? a : b);
  const priciest = rows.reduce((a, b) => a.price_usd > b.price_usd ? a : b);

  const byMonth   = groupBy(rows, 'month_name');
  const byDow     = groupBy(rows, 'day_of_week');
  const byDest    = groupBy(rows, 'destination_code');

  const monthMin  = {};
  const monthMean = {};
  for (const [m, rs] of Object.entries(byMonth)) {
    monthMin[m]  = Math.min(...rs.map(r => r.price_usd));
    monthMean[m] = mean(rs.map(r => r.price_usd));
  }

  const dowMean = {};
  for (const [d, rs] of Object.entries(byDow)) {
    dowMean[d] = mean(rs.map(r => r.price_usd));
  }

  const destStats = {};
  for (const [code, rs] of Object.entries(byDest)) {
    destStats[code] = {
      n: rs.length,
      min: Math.min(...rs.map(r => r.price_usd)),
      mean: mean(rs.map(r => r.price_usd)),
      max: Math.max(...rs.map(r => r.price_usd)),
      cheapest_row: rs.reduce((a, b) => a.price_usd < b.price_usd ? a : b),
    };
  }

  // Cheapest month and most expensive month
  const monthEntries = Object.entries(monthMean);
  const cheapestMonth = monthEntries.reduce((a, b) => a[1] < b[1] ? a : b);
  const priciestMonth = monthEntries.reduce((a, b) => a[1] > b[1] ? a : b);

  // Best day of week
  const dowEntries = Object.entries(dowMean);
  const cheapestDow = dowEntries.reduce((a, b) => a[1] < b[1] ? a : b);

  // Date range
  const dates = rows.map(r => r.departure_date).sort();

  return {
    n: rows.length,
    cheapest, priciest,
    mean: mean(prices),
    median: median(prices),
    stdev: stdev(prices),
    monthMin, monthMean,
    dowMean,
    destStats,
    cheapestMonth, priciestMonth, cheapestDow,
    dateRange: { start: dates[0], end: dates[dates.length-1] },
    uniqueDates: new Set(rows.map(r => r.departure_date)).size,
  };
}

const mean = a => a.reduce((s,x) => s+x, 0) / a.length;
const median = a => {
  const s = [...a].sort((x,y) => x-y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid-1] + s[mid]) / 2;
};
const stdev = a => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s,x) => s + (x-m)**2, 0) / (a.length - 1));
};
const groupBy = (rows, key) => {
  return rows.reduce((acc, r) => {
    const k = r[key];
    if (!acc[k]) acc[k] = [];
    acc[k].push(r);
    return acc;
  }, {});
};

// ============================================================
// Render — top level
// ============================================================
function renderAll() {
  if (!currentRun) return;
  renderHeader();
  renderStatGrid();
  renderChanges();
  renderMonthChart();
  renderDowChart();
  renderDestGrid();
  renderDeals();
}

function renderHeader() {
  const s = currentRun.stats;
  const d = new Date(currentRun.meta.date);
  const dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  document.getElementById('header-date').textContent = dateStr.toUpperCase();
  document.getElementById('footer-date').textContent = dateStr;

  const heroStats = document.getElementById('hero-stats');
  const dests = Object.keys(s.destStats).length;
  heroStats.innerHTML = `
    <span class="stat-num">${s.n.toLocaleString()}</span>
    <span class="stat-label">itineraries</span>
    <span class="divider">·</span>
    <span class="stat-num">${dests}</span>
    <span class="stat-label">airports</span>
    <span class="divider">·</span>
    <span class="stat-num">${s.uniqueDates}</span>
    <span class="stat-label">departure dates</span>
  `;
}

// ============================================================
// Render — stat grid (5 takeaway cards)
// ============================================================
function renderStatGrid() {
  const s = currentRun.stats;
  const grid = document.getElementById('stat-grid');

  const swing = ((s.priciest.price_usd - s.cheapest.price_usd) / s.cheapest.price_usd * 100).toFixed(0);
  const monthSavings = (s.priciestMonth[1] - s.cheapestMonth[1]).toFixed(0);
  const monthSavingsPct = ((s.priciestMonth[1] - s.cheapestMonth[1]) / s.priciestMonth[1] * 100).toFixed(0);

  const cards = [
    {
      num: `$${Math.round(s.cheapest.price_usd).toLocaleString()}`,
      label: 'CHEAPEST FOUND',
      sub: `${s.cheapest.departure_date} → ${s.cheapest.return_date}<br>${s.cheapest.destination_code} · ${s.cheapest.out_airlines.split(',')[0]}`,
      color: PALETTE.crimson,
    },
    {
      num: `$${Math.round(s.mean).toLocaleString()}`,
      label: 'AVERAGE PRICE',
      sub: `Median $${Math.round(s.median).toLocaleString()}<br>σ $${Math.round(s.stdev).toLocaleString()}`,
      color: PALETTE.ink,
    },
    {
      num: `$${Math.round(s.priciest.price_usd).toLocaleString()}`,
      label: 'MOST EXPENSIVE',
      sub: `${s.priciest.departure_date} → ${s.priciest.return_date}<br>${s.priciest.destination_code} · ${s.priciest.out_airlines.split(',')[0]}`,
      color: PALETTE.slate,
    },
    {
      num: `${swing}%`,
      label: 'PRICE SWING',
      sub: `Cheapest vs.<br>most expensive`,
      color: PALETTE.gold,
    },
    {
      num: s.cheapestMonth[0].slice(0, 4),
      label: 'BEST MONTH',
      sub: `Avg $${Math.round(s.cheapestMonth[1]).toLocaleString()}<br>${monthSavingsPct}% below ${s.priciestMonth[0]}`,
      color: PALETTE.sage,
    },
  ];

  grid.innerHTML = cards.map(c => `
    <div class="stat-card" style="--accent: ${c.color}">
      <div class="num">${c.num}</div>
      <div class="label">${c.label}</div>
      <div class="sub">${c.sub}</div>
    </div>
  `).join('');
}

// ============================================================
// Render — comparison vs previous run
// ============================================================
function renderChanges() {
  const section = document.getElementById('changes-section');
  if (!previousRun || !currentRun) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  const cur  = currentRun.stats;
  const prev = previousRun.stats;

  const dateLabel = formatDeltaDays(currentRun.meta.date, previousRun.meta.date);
  document.getElementById('changes-headline').textContent =
    `What's changed in ${dateLabel}.`;

  // Build 4 change cards
  const cards = [
    {
      label: 'CHEAPEST PRICE',
      now:   cur.cheapest.price_usd,
      then:  prev.cheapest.price_usd,
      format: 'currency',
    },
    {
      label: 'AVERAGE PRICE',
      now:   cur.mean,
      then:  prev.mean,
      format: 'currency',
    },
    {
      label: 'MOST EXPENSIVE',
      now:   cur.priciest.price_usd,
      then:  prev.priciest.price_usd,
      format: 'currency',
    },
    {
      label: 'ITINERARIES FOUND',
      now:   cur.n,
      then:  prev.n,
      format: 'number',
    },
  ];

  const grid = document.getElementById('change-grid');
  grid.innerHTML = cards.map(c => {
    const delta = c.now - c.then;
    const deltaPct = (delta / c.then) * 100;
    const cls = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'flat');
    const arrow = delta > 0 ? '↑' : (delta < 0 ? '↓' : '→');
    const fmt = c.format === 'currency'
      ? v => `$${Math.round(v).toLocaleString()}`
      : v => Math.round(v).toLocaleString();

    return `
      <div class="change-card ${cls}">
        <div class="label">${c.label}</div>
        <div class="delta">${arrow} ${fmt(Math.abs(delta))}</div>
        <div class="from-to">
          ${fmt(c.then)} → <strong>${fmt(c.now)}</strong>
          (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)
        </div>
      </div>
    `;
  }).join('');

  // Movers tables — biggest drops/hikes for matching (date, airport) pairs
  const { drops, hikes } = computeMovers(currentRun.rows, previousRun.rows);

  document.getElementById('drops-table').innerHTML = renderMoversTable(drops, 'down');
  document.getElementById('hikes-table').innerHTML = renderMoversTable(hikes, 'up');
}

function computeMovers(curRows, prevRows) {
  // Build prev lookup keyed by (departure_date, destination_code)
  const prevMap = new Map();
  prevRows.forEach(r => {
    prevMap.set(`${r.departure_date}|${r.destination_code}`, r);
  });

  const matched = [];
  curRows.forEach(cr => {
    const pr = prevMap.get(`${cr.departure_date}|${cr.destination_code}`);
    if (pr) {
      matched.push({
        cur: cr,
        prev: pr,
        delta: cr.price_usd - pr.price_usd,
      });
    }
  });

  matched.sort((a, b) => a.delta - b.delta);

  return {
    drops: matched.slice(0, 5),                           // most negative deltas
    hikes: matched.slice(-5).reverse(),                   // most positive deltas
  };
}

function renderMoversTable(rows, dir) {
  if (rows.length === 0) {
    return `<tr><td style="text-align:center;color:#999;padding:20px;">No matching dates between scans</td></tr>`;
  }
  return rows.map(m => `
    <tr>
      <td>
        <div style="font-weight:600">${m.cur.departure_date}</div>
        <div style="font-size:11px;color:#777">${m.cur.destination_code} · ${m.cur.out_airlines.split(',')[0]}</div>
      </td>
      <td>
        <div class="price-old">$${Math.round(m.prev.price_usd).toLocaleString()}</div>
        <div class="price-new">$${Math.round(m.cur.price_usd).toLocaleString()}</div>
      </td>
      <td class="delta-cell delta-${dir}">
        ${m.delta >= 0 ? '+' : ''}$${Math.round(m.delta).toLocaleString()}
      </td>
    </tr>
  `).join('');
}

function formatDeltaDays(d1, d2) {
  const ms  = Math.abs(new Date(d1) - new Date(d2));
  const days = Math.round(ms / 86_400_000);
  if (days === 0) return 'no time';
  if (days === 1) return '1 day';
  if (days < 14)  return `${days} days`;
  if (days < 60)  return `${Math.round(days/7)} weeks`;
  return `${Math.round(days/30)} months`;
}

// ============================================================
// Render — month chart
// ============================================================
let monthChartInstance = null;
function renderMonthChart() {
  const s = currentRun.stats;
  const monthOrder = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
  const labels = monthOrder.filter(m => s.monthMean[m] !== undefined);
  const meanData = labels.map(m => Math.round(s.monthMean[m]));
  const minData  = labels.map(m => Math.round(s.monthMin[m]));

  // Compute headline
  if (s.priciestMonth[0] !== s.cheapestMonth[0]) {
    const diff = Math.round(s.priciestMonth[1] - s.cheapestMonth[1]);
    document.getElementById('month-headline').textContent =
      `${s.cheapestMonth[0]} is $${diff} cheaper than ${s.priciestMonth[0]}.`;
  }

  const ctx = document.getElementById('month-chart').getContext('2d');
  if (monthChartInstance) monthChartInstance.destroy();

  monthChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Average price', data: meanData, backgroundColor: PALETTE.ink,     borderRadius: 2 },
        { label: 'Cheapest found', data: minData, backgroundColor: PALETTE.crimson, borderRadius: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'Inter', size: 12 } } },
        tooltip: {
          callbacks: { label: ctx => `${ctx.dataset.label}: $${ctx.raw.toLocaleString()}` },
        },
      },
      scales: {
        y: {
          ticks: { callback: v => `$${v.toLocaleString()}`, color: PALETTE.slate },
          grid: { color: PALETTE.creamSoft },
        },
        x: {
          ticks: { color: PALETTE.slate },
          grid: { display: false },
        },
      },
    },
  });
}

// ============================================================
// Render — day-of-week chart
// ============================================================
let dowChartInstance = null;
function renderDowChart() {
  const s = currentRun.stats;
  const dowOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const labels = dowOrder.filter(d => s.dowMean[d] !== undefined);
  const data   = labels.map(d => Math.round(s.dowMean[d]));

  // Headline
  const dowEntries = Object.entries(s.dowMean);
  const cheap = dowEntries.reduce((a,b) => a[1] < b[1] ? a : b);
  const exp   = dowEntries.reduce((a,b) => a[1] > b[1] ? a : b);
  document.getElementById('dow-headline').textContent =
    `${cheap[0]} wins. ${exp[0]} loses.`;

  const ctx = document.getElementById('dow-chart').getContext('2d');
  if (dowChartInstance) dowChartInstance.destroy();

  // Color the cheapest day differently
  const colors = labels.map(l => l === cheap[0] ? PALETTE.crimson : PALETTE.ink);

  dowChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Average price',
        data,
        backgroundColor: colors,
        borderRadius: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => `Avg: $${ctx.raw.toLocaleString()}` },
        },
      },
      scales: {
        y: {
          ticks: { callback: v => `$${v.toLocaleString()}`, color: PALETTE.slate },
          grid: { color: PALETTE.creamSoft },
          beginAtZero: false,
        },
        x: { ticks: { color: PALETTE.slate }, grid: { display: false } },
      },
    },
  });
}

// ============================================================
// Render — destination grid
// ============================================================
function renderDestGrid() {
  const s = currentRun.stats;
  const grid = document.getElementById('dest-grid');

  // Sort destinations by cheapest price (ascending)
  const sorted = Object.entries(s.destStats).sort((a, b) => a[1].min - b[1].min);

  grid.innerHTML = sorted.map(([code, st], i) => {
    const accent = i === 0 ? PALETTE.crimson :
                   i === sorted.length - 1 ? PALETTE.slate :
                   PALETTE.gold;
    return `
      <div class="dest-card" style="--accent: ${accent}">
        <div class="code">${code}</div>
        <div class="name">${DEST_NAMES[code] || code}</div>
        <div class="from-row">
          <span class="from">From</span>
          <span class="from-price">$${Math.round(st.min).toLocaleString()}</span>
        </div>
        <div class="meta">Avg $${Math.round(st.mean).toLocaleString()} · ${st.n} found</div>
      </div>
    `;
  }).join('');
}

// ============================================================
// Render — top 10 deals
// ============================================================
function renderDeals() {
  const sorted = [...currentRun.rows].sort((a, b) => a.price_usd - b.price_usd).slice(0, 10);
  const list = document.getElementById('deal-list');

  list.innerHTML = sorted.map((r, i) => {
    const stops = r.out_stops === 0 ? 'Nonstop' :
      `${r.out_stops} stop${r.out_stops > 1 ? 's' : ''}` +
      (r.out_layovers ? ` · ${r.out_layovers}` : '');
    const dow = new Date(r.departure_date).toLocaleDateString('en-US', { weekday: 'short' });
    return `
      <a href="${r.booking_url}" target="_blank" rel="noopener">
        <div class="deal-row">
          <div class="rank ${i === 0 ? 'top' : ''}">#${i+1}</div>
          <div class="price">$${Math.round(r.price_usd).toLocaleString()}</div>
          <div>
            <div class="dates">${r.departure_date}  →  ${r.return_date}</div>
            <div class="dates-sub">${dow} · 14 days</div>
          </div>
          <div class="dest-code">${r.destination_code}</div>
          <div>
            <div class="airline">${r.out_airlines.split(',')[0].trim()}</div>
            <div class="airline-sub">Out: ${stops} · ${r.out_duration || ''}</div>
          </div>
          <div class="per-day">
            <span class="num">$${Math.round(r.price_usd / 14)}</span>
            <span class="label">per day</span>
          </div>
        </div>
      </a>
    `;
  }).join('');
}

// ============================================================
// Errors
// ============================================================
function showError(msg) {
  const banner = document.createElement('div');
  banner.className = 'error-banner';
  banner.textContent = msg;
  document.body.insertBefore(banner, document.body.firstChild);
}

// Boot
boot();
