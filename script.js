const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-OE9XqlJl3nutmKHwy5lBI6WR-NpAL7Ybvo5Bia29jp_pmZ0dMQfkrl1mTJb3GfhgMZg81q-9IQwn/pub?gid=0&single=true&output=csv';

const CAT_ORDER = ['Work', 'Projects', 'Education', 'Writing', 'Graphic Design'];
const CAT_COLORS = {
  'Work':           '#00897B',
  'Projects':       '#5E35B1',
  'Education':      '#039BE5',
  'Writing':        '#E53935',
  'Graphic Design': '#FF9800',
};

const ROW_H   = 36;
const BAR_H   = 1;
const PAD_V   = 48;
const CAT_GAP = 14;
const AXIS_GAP = 10;  // space from axis to nearest entry
const LABEL_THRESHOLD = 10;

let PPM           = 10;
let allData       = [];
let activeFilters = new Set(CAT_ORDER);
let focusedEntry  = null;
let preserveScroll = false;

// ── CSV ──────────────────────────────────────────────────

async function fetchData() {
  const res  = await fetch(CSV_URL);
  const text = await res.text();
  return parseCSV(text);
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = splitRow(lines[0]).map(h => h.trim());
  return lines.slice(1)
    .map(line => {
      const vals = splitRow(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
      return obj;
    })
    .filter(r => r.title && r.start_year);
}

function splitRow(line) {
  const out = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else { cur += ch; }
  }
  out.push(cur);
  return out;
}

// ── Dates ─────────────────────────────────────────────────

function toMonths(month, year) {
  return parseInt(year) * 12 + (parseInt(month) || 1) - 1;
}

function entryEnd(entry) {
  const y = (entry.end_year || '').toLowerCase();
  if (!y || y === 'present') {
    const now = new Date();
    return toMonths(now.getMonth() + 1, now.getFullYear());
  }
  return toMonths(entry.end_month || 12, entry.end_year);
}

const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function moStr(n) { return MO[(parseInt(n) || 1) - 1] || ''; }

function dateRange(entry) {
  const s = `${moStr(entry.start_month)} ${entry.start_year}`;
  const ey = (entry.end_year || '').toLowerCase();
  const e = (!ey || ey === 'present') ? 'Present' : `${moStr(entry.end_month)} ${entry.end_year}`;
  return `${s} – ${e}`;
}

// ── Build rows ────────────────────────────────────────────
// Work / Education / Writing fan above the axis; Projects / Graphic Design below

function buildRows(data) {
  const sorted = [...data].sort((a, b) =>
    toMonths(a.start_month, a.start_year) - toMonths(b.start_month, b.start_year)
  );
  const rows = sorted.map((entry, i) => ({
    entry,
    cat: entry.category,
    yOffset: -(AXIS_GAP + Math.round(ROW_H / 2) + i * ROW_H),
  }));
  const spaceAbove = sorted.length ? AXIS_GAP + ROW_H * sorted.length : AXIS_GAP;
  return { rows, spaceAbove, spaceBelow: PAD_V };
}

// ── Render ────────────────────────────────────────────────

function render() {
  const filtered   = allData.filter(d => activeFilters.has(d.category));
  const canvas     = document.getElementById('canvas');
  const canvasWrap = document.getElementById('canvas-wrap');

  if (!allData.length) { canvas.innerHTML = ''; return; }

  // Always use the full dataset for the time range so the axis never shifts
  const allStart = allData.map(d => toMonths(d.start_month, d.start_year));
  const allEnd   = allData.map(d => entryEnd(d));
  const minM   = Math.min(...allStart);
  const maxM   = Math.max(...allEnd);
  const startY = Math.floor(minM / 12) - 2; // 2 years breathing room on left
  const endY   = Math.ceil((maxM + 1) / 12) + 1;
  const W      = (endY - startY) * 12 * PPM;

  const visH  = canvasWrap.clientHeight;
  // Axis anchored near the bottom so all entries read chronologically above it
  const targetAxisY = visH - 60;

  const { rows, spaceAbove, spaceBelow } = filtered.length
    ? buildRows(filtered)
    : { rows: [], spaceAbove: 0, spaceBelow: 0 };

  // Canvas axis position must have enough room above it for all entries
  const canvasAxisY = Math.max(targetAxisY, spaceAbove + PAD_V);

  canvas.innerHTML = '';
  canvas.style.cssText = `width:${W}px; height:${Math.max(visH, canvasAxisY + spaceBelow + PAD_V)}px; position:relative;`;
  if (focusedEntry) canvas.classList.add('focused');

  // Scroll so the axis appears at 50vh in the viewport (unless zoom is in progress)
  if (!preserveScroll) {
    canvasWrap.scrollTop = Math.max(0, canvasAxisY - targetAxisY);
  }
  preserveScroll = false;

  // Axis line
  const axis = el('div', 'axis-line');
  axis.style.cssText = `top:${canvasAxisY}px; width:${W}px;`;
  canvas.appendChild(axis);

  // Year labels just above the axis
  const originM = startY * 12;
  for (let y = startY; y <= endY; y++) {
    const left = (y * 12 - originM) * PPM;
    if (left > W) continue;
    const tick = el('div', 'year-tick');
    tick.style.left = left + 'px';
    tick.style.top  = (canvasAxisY + 10) + 'px';
    tick.textContent = y;
    canvas.appendChild(tick);
  }

  // Entry lines branching above and below the axis
  rows.forEach(row => {
    const entry   = row.entry;
    const startM  = toMonths(entry.start_month, entry.start_year);
    const endM    = entryEnd(entry);
    const left    = (startM - originM) * PPM;
    const isPoint = !entry.end_year && !entry.end_month;
    const durPx   = isPoint ? 0 : (endM - startM) * PPM;
    const width   = isPoint ? 14 : Math.max(durPx + PPM, 10);
    const top     = canvasAxisY + row.yOffset - Math.round(BAR_H / 2);
    const color   = CAT_COLORS[entry.category] || '#888';

    const bar = el('div', isPoint ? 'bar point-only' : 'bar');
    bar.style.cssText = `left:${left}px; width:${width}px; top:${top}px;`;
    if (focusedEntry === entry) bar.classList.add('selected');

    if (isPoint) {
      // Single dot at the event date
      const dot = el('div', 'dot dot-start');
      dot.style.background = color;
      bar.appendChild(dot);
    } else {
      const dotS = el('div', 'dot dot-start');
      dotS.style.background = color;
      bar.appendChild(dotS);

      const dotE = el('div', 'dot dot-end');
      dotE.style.background = color;
      bar.appendChild(dotE);
    }

    const lbl = el('span', 'bar-lbl lbl-below');
    lbl.textContent = entry.title;
    bar.appendChild(lbl);

    bar.addEventListener('click', e => { e.stopPropagation(); openFocus(entry); });
    canvas.appendChild(bar);
  });
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

// ── Focus / detail sheet ──────────────────────────────────

function openFocus(entry) {
  focusedEntry = entry;

  // Zoom so the entry's duration fills ~75% of the viewport width
  const wrap     = document.getElementById('canvas-wrap');
  const startM   = toMonths(entry.start_month, entry.start_year);
  const endM     = entryEnd(entry);
  const duration = Math.max(endM - startM + 1, 1);
  PPM = Math.max(3, Math.min(60, (wrap.clientWidth * 0.75) / duration));
  document.getElementById('zoom-slider').value = PPM;
  render();

  // Scroll to center the entry horizontally
  const originM  = (Math.floor(Math.min(...allData.map(d => toMonths(d.start_month, d.start_year))) / 12) - 2) * 12;
  const barLeft  = (startM - originM) * PPM;
  const barWidth = Math.max((endM - startM + 1) * PPM, 10);
  wrap.scrollLeft = barLeft + barWidth / 2 - wrap.clientWidth / 2;

  const body  = document.getElementById('sheet-body');
  const color = CAT_COLORS[entry.category] || '#000';
  const desc  = entry.long_description || entry.short_description || '';

  body.className = 'sheet-body';
  body.innerHTML = `
    <div class="s-cat" style="color:${color}">${entry.category.toUpperCase()}</div>
    <div class="s-title">${entry.title}</div>
    <div class="s-date">${dateRange(entry)}</div>
    ${entry.organization ? `<div class="s-org">${entry.organization}${entry.location ? ' &middot; ' + entry.location : ''}</div>` : ''}
    ${entry.role ? `<div class="s-role">${entry.role}</div>` : ''}
    ${entry.image_1 ? `<img src="${entry.image_1}" alt="${entry.title}" class="s-img">` : ''}
    ${desc ? `<div class="s-desc">${desc.replace(/\n/g, '<br>')}</div>` : ''}
    ${entry.external_link ? `<a href="${entry.external_link}" target="_blank" rel="noopener" class="s-link">${entry.external_link_label || 'View →'}</a>` : ''}
  `;

  document.getElementById('detail-sheet').classList.add('open');
}

function closeFocus() {
  focusedEntry = null;
  document.getElementById('canvas').classList.remove('focused');
  document.getElementById('detail-sheet').classList.remove('open');
  document.querySelectorAll('.bar.selected').forEach(b => b.classList.remove('selected'));
  if (allData.length) {
    PPM = fitToWidth(allData);
    document.getElementById('zoom-slider').value = PPM;
    render();
  }
}

// ── About ─────────────────────────────────────────────────

function openAbout() {
  focusedEntry = null;
  document.getElementById('canvas').classList.remove('focused');

  const body = document.getElementById('sheet-body');
  body.className = 'sheet-body about-mode';
  body.innerHTML = `
    <div class="about-bio">
      <p>Delaney Connor is a Master's candidate in Design and Urban Ecologies at The New School, where her research examines how public space and infrastructure can foster deeper connections, civic engagement, and self-determination.</p>
      <p>Delaney is a designer, researcher, and urban strategist dedicated to finding solutions that center community power and needs. Her work prioritizes participatory design, collective ownership, and the importance of involving voices historically excluded from the planning and decision-making process.</p>
      <p>Before moving to New York, Delaney worked in Bozeman, Montana. Originally from Seattle, her undergraduate background transpired in New Orleans where she found inspiration in the unique modes of community resilience and creative forms of resistance.</p>
    </div>
    <div class="about-links">
      <a href="mailto:delaneyconnor1@gmail.com" class="s-link">delaneyconnor1@gmail.com</a>
      <a href="https://linkedin.com/in/delaney-connor" target="_blank" rel="noopener" class="s-link">LinkedIn →</a>
    </div>
  `;

  document.getElementById('detail-sheet').classList.add('open');
}

// ── Filters ───────────────────────────────────────────────

function renderFilters() {
  const bar = document.getElementById('filter-bar');
  bar.innerHTML = '';

  const allActive = activeFilters.size === CAT_ORDER.length;
  const allBtn = makeBtn('ALL', null, allActive);
  allBtn.addEventListener('click', () => {
    CAT_ORDER.forEach(c => activeFilters.add(c));
    renderFilters(); render();
  });
  bar.appendChild(allBtn);

  CAT_ORDER.forEach(cat => {
    const b = makeBtn(cat, CAT_COLORS[cat], activeFilters.has(cat));
    b.addEventListener('click', () => {
      focusedEntry = null;
      activeFilters.has(cat) ? activeFilters.delete(cat) : activeFilters.add(cat);
      renderFilters(); render();
    });
    bar.appendChild(b);
  });
}

function makeBtn(label, color, active) {
  const b = el('button', 'filter-btn' + (active ? ' active' : ''));
  if (color) b.style.setProperty('--c', color);
  const dot = el('span', 'filter-dot');
  b.appendChild(dot);
  const lbl = el('span', 'filter-lbl');
  lbl.textContent = label;
  b.appendChild(lbl);
  return b;
}

// ── Fit timeline to screen width ─────────────────────────

function fitToWidth(data) {
  const allStart = data.map(d => toMonths(d.start_month, d.start_year));
  const allEnd   = data.map(d => entryEnd(d));
  const startY   = Math.floor(Math.min(...allStart) / 12) - 2;
  const endY     = Math.ceil((Math.max(...allEnd) + 1) / 12) + 1;
  const months   = (endY - startY) * 12;
  const w        = document.getElementById('canvas-wrap').clientWidth;
  return Math.max(3, Math.min(60, w / months));
}

// ── Init ──────────────────────────────────────────────────

// Zoom keeping the viewport center pinned to the same calendar position
function zoomTo(newPPM) {
  const wrap   = document.getElementById('canvas-wrap');
  const canvas = document.getElementById('canvas');
  const oldW   = parseFloat(canvas.style.width) || wrap.scrollWidth;
  const centerX = wrap.scrollLeft + wrap.clientWidth / 2;
  const ratio   = oldW > 0 ? centerX / oldW : 0.5;
  PPM = newPPM;
  preserveScroll = true;
  render();
  const newW = parseFloat(canvas.style.width) || wrap.scrollWidth;
  wrap.scrollLeft = ratio * newW - wrap.clientWidth / 2;
}

function init() {
  const canvasWrap = document.getElementById('canvas-wrap');

  // Zoom slider
  document.getElementById('zoom-slider').addEventListener('input', e => {
    zoomTo(+e.target.value);
  });

  // Ctrl/Cmd + scroll = zoom
  canvasWrap.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const newPPM = Math.max(3, Math.min(60, PPM + (e.deltaY < 0 ? 1.5 : -1.5)));
    document.getElementById('zoom-slider').value = newPPM;
    zoomTo(newPPM);
  }, { passive: false });

  // Click canvas background = exit focus
  canvasWrap.addEventListener('click', () => {
    if (focusedEntry) closeFocus();
  });

  document.getElementById('sheet-close').addEventListener('click', closeFocus);
  document.getElementById('about-btn').addEventListener('click', openAbout);

  // Fetch data as soon as the page loads
  fetchData()
    .then(data => {
      allData = data;
      PPM = fitToWidth(data);
      document.getElementById('zoom-slider').value = PPM;
      renderFilters();
      render();
    })
    .catch(() => { allData = []; renderFilters(); render(); });
}

// ── "View portfolio" — global so onclick="" attribute can call it ──

function startPortfolio() {
  const introLine = document.getElementById('intro-line');
  document.getElementById('intro-name').classList.add('fade');
  document.getElementById('view-btn').classList.add('fade');
  introLine.classList.add('expand');

  // After expansion, drop the line to the bottom where the axis lives
  setTimeout(() => introLine.classList.add('drop'), 900);

  // Then reveal the app (drop takes 0.5s, so 900 + 550 = 1450ms total)
  setTimeout(() => {
    document.getElementById('intro').classList.add('hidden');
    document.getElementById('app').classList.add('visible');
    setTimeout(() => {
      document.getElementById('intro').style.display = 'none';
    }, 600);
  }, 1450);
}

init();
