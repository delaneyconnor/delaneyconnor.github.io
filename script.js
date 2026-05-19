const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-OE9XqlJl3nutmKHwy5lBI6WR-NpAL7Ybvo5Bia29jp_pmZ0dMQfkrl1mTJb3GfhgMZg81q-9IQwn/pub?gid=0&single=true&output=csv';

const CAT_ORDER = ['Work', 'Projects', 'Education', 'Writing', 'Graphic Design'];
const CAT_COLORS = {
  'Work':           '#00897B',
  'Projects':       '#5E35B1',
  'Education':      '#039BE5',
  'Writing':        '#E53935',
  'Graphic Design': '#FF9800',
};

const ROW_H   = 24;
const BAR_H   = 2;
const PAD_V   = 48;
const CAT_GAP = 16;
const LABEL_THRESHOLD = 10;

let PPM           = 10;
let allData       = [];
let activeFilters = new Set(CAT_ORDER);
let focusedEntry  = null;

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

function buildRows(data) {
  const rows = [];
  let top = 0;
  let firstCat = true;

  CAT_ORDER.forEach(cat => {
    if (!activeFilters.has(cat)) return;
    const entries = data
      .filter(d => d.category === cat)
      .sort((a, b) => toMonths(a.start_month, a.start_year) - toMonths(b.start_month, b.start_year));
    if (!entries.length) return;

    if (!firstCat) top += CAT_GAP;
    firstCat = false;

    entries.forEach(entry => {
      rows.push({ type: 'entry', entry, cat, top, height: ROW_H });
      top += ROW_H;
    });
  });

  return { rows, contentHeight: top };
}

// ── Render ────────────────────────────────────────────────

function render() {
  const filtered   = allData.filter(d => activeFilters.has(d.category));
  const canvas     = document.getElementById('canvas');
  const canvasWrap = document.getElementById('canvas-wrap');

  if (!filtered.length) { canvas.innerHTML = ''; return; }

  const allStart = filtered.map(d => toMonths(d.start_month, d.start_year));
  const allEnd   = filtered.map(d => entryEnd(d));
  const minM   = Math.min(...allStart);
  const maxM   = Math.max(...allEnd);
  const startY = Math.floor(minM / 12);
  const endY   = Math.ceil((maxM + 1) / 12) + 1;
  const W      = (endY - startY) * 12 * PPM;

  const { rows, contentHeight } = buildRows(filtered);
  const visH    = canvasWrap.clientHeight;
  // Subtract half the top-bar height (32px) so the block centers at 50vh, matching the intro line
  const offsetY = Math.max(PAD_V, Math.floor((visH - contentHeight) / 2) - 32);
  const showLabels = PPM >= LABEL_THRESHOLD;

  canvas.innerHTML = '';
  canvas.style.cssText = `width:${W}px; height:${Math.max(visH, contentHeight + PAD_V * 2)}px; position:relative;`;
  if (focusedEntry) canvas.classList.add('focused');

  // Vertical year grid lines
  for (let y = startY; y <= endY; y++) {
    const left = (y * 12 - minM) * PPM;
    if (left < 0 || left > W) continue;
    const line = el('div', 'grid-year');
    line.style.left = left + 'px';
    canvas.appendChild(line);
  }

  // Year labels and month ticks, floating just above the entry block
  const tickY = Math.max(4, offsetY - 22);
  for (let y = startY; y <= endY; y++) {
    const left = (y * 12 - minM) * PPM;
    if (left < 0 || left > W) continue;
    const tick = el('div', 'year-tick');
    tick.style.left = left + 'px';
    tick.style.top  = tickY + 'px';
    tick.textContent = y;
    canvas.appendChild(tick);
    if (PPM >= 5) {
      for (let m = 1; m < 12; m++) {
        const ml = (y * 12 + m - minM) * PPM;
        if (ml >= W) break;
        const mt = el('div', 'month-tick');
        mt.style.left   = ml + 'px';
        mt.style.top    = tickY + 'px';
        mt.style.height = '8px';
        canvas.appendChild(mt);
      }
    }
  }

  // Entry rows
  rows.forEach(row => {
    const entry  = row.entry;
    const startM = toMonths(entry.start_month, entry.start_year);
    const endM   = entryEnd(entry);
    const left   = (startM - minM) * PPM;
    const width  = Math.max((endM - startM + 1) * PPM, 10);
    const top    = offsetY + row.top + Math.round((ROW_H - BAR_H) / 2);
    const color  = CAT_COLORS[entry.category] || '#888';

    const bar = el('div', 'bar');
    bar.style.cssText = `left:${left}px; width:${width}px; top:${top}px;`;
    if (focusedEntry === entry) bar.classList.add('selected');

    const dotS = el('div', 'dot dot-start');
    dotS.style.background = color;
    bar.appendChild(dotS);

    const dotE = el('div', 'dot dot-end');
    dotE.style.background = color;
    bar.appendChild(dotE);

    if (showLabels) {
      const lbl = el('span', 'bar-lbl visible');
      lbl.textContent = entry.title;
      bar.appendChild(lbl);
    }

    bar.addEventListener('click',      e => { e.stopPropagation(); openFocus(entry); });
    bar.addEventListener('mouseenter', e => { if (!focusedEntry) showTip(e, entry); });
    bar.addEventListener('mouseleave', hideTip);

    canvas.appendChild(bar);
  });
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

// ── Tooltip ───────────────────────────────────────────────

let tipEl = null;
function showTip(e, entry) {
  hideTip();
  tipEl = el('div', 'tip');
  tipEl.innerHTML =
    `<strong>${entry.title}</strong>` +
    `<span class="tip-date">${dateRange(entry)}</span>` +
    (entry.short_description ? `<span class="tip-desc">${entry.short_description}</span>` : '');
  document.body.appendChild(tipEl);
  moveTip(e);
}
function moveTip(e) {
  if (!tipEl) return;
  const x = Math.min(e.clientX + 14, window.innerWidth  - tipEl.offsetWidth  - 8);
  const y = Math.min(e.clientY + 14, window.innerHeight - tipEl.offsetHeight - 8);
  tipEl.style.left = x + 'px';
  tipEl.style.top  = y + 'px';
}
function hideTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }
document.addEventListener('mousemove', moveTip);

// ── Focus / detail sheet ──────────────────────────────────

function openFocus(entry) {
  hideTip();
  focusedEntry = entry;
  render();

  const body  = document.getElementById('sheet-body');
  const color = CAT_COLORS[entry.category] || '#000';
  const tags  = (entry.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const desc  = entry.long_description || entry.short_description || '';

  body.className = 'sheet-body';
  body.innerHTML = `
    <div class="sheet-left">
      <div class="s-cat" style="color:${color}">${entry.category.toUpperCase()}</div>
      <div class="s-title">${entry.title}</div>
      <div class="s-date">${dateRange(entry)}</div>
      ${entry.organization ? `<div class="s-org">${entry.organization}${entry.location ? ' &middot; ' + entry.location : ''}</div>` : ''}
      ${entry.role ? `<div class="s-role">${entry.role}</div>` : ''}
      ${entry.external_link ? `<a href="${entry.external_link}" target="_blank" rel="noopener" class="s-link">${entry.external_link_label || 'View →'}</a>` : ''}
    </div>
    <div class="sheet-right">
      ${desc ? `<div class="s-desc">${desc.replace(/\n/g, '<br>')}</div>` : ''}
      ${tags.length ? `<div class="s-tags">${tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
    </div>
  `;

  document.getElementById('detail-sheet').classList.add('open');
}

function closeFocus() {
  focusedEntry = null;
  document.getElementById('canvas').classList.remove('focused');
  document.getElementById('detail-sheet').classList.remove('open');
  document.querySelectorAll('.bar.selected').forEach(b => b.classList.remove('selected'));
}

// ── About ─────────────────────────────────────────────────

function openAbout() {
  hideTip();
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
  b.textContent = label;
  if (color) b.style.setProperty('--c', color);
  return b;
}

// ── Init ──────────────────────────────────────────────────

function init() {
  const canvasWrap = document.getElementById('canvas-wrap');

  // Zoom slider
  document.getElementById('zoom-slider').addEventListener('input', e => {
    PPM = +e.target.value;
    render();
  });

  // Ctrl/Cmd + scroll = zoom
  canvasWrap.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    PPM = Math.max(3, Math.min(60, PPM + (e.deltaY < 0 ? 1.5 : -1.5)));
    document.getElementById('zoom-slider').value = PPM;
    render();
  }, { passive: false });

  // Click canvas background = exit focus
  canvasWrap.addEventListener('click', () => {
    if (focusedEntry) closeFocus();
  });

  document.getElementById('sheet-close').addEventListener('click', closeFocus);
  document.getElementById('about-btn').addEventListener('click', openAbout);

  // Fetch data as soon as the page loads
  fetchData()
    .then(data => { allData = data; renderFilters(); render(); })
    .catch(() => { allData = []; renderFilters(); render(); });
}

// ── "View portfolio" — global so onclick="" attribute can call it ──

function startPortfolio() {
  document.getElementById('intro-name').classList.add('fade');
  document.getElementById('view-btn').classList.add('fade');
  document.getElementById('intro-line').classList.add('expand');

  // Timeline is centered — line stays at vertical center and becomes the axis
  setTimeout(function () {
    document.getElementById('intro').classList.add('hidden');
    document.getElementById('app').classList.add('visible');
    setTimeout(function () {
      document.getElementById('intro').style.display = 'none';
    }, 600);
  }, 900);
}

init();
