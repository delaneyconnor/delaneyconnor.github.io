const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-OE9XqlJl3nutmKHwy5lBI6WR-NpAL7Ybvo5Bia29jp_pmZ0dMQfkrl1mTJb3GfhgMZg81q-9IQwn/pub?gid=0&single=true&output=csv';

const CAT_ORDER = ['Work', 'Projects', 'Education', 'Writing', 'Graphic Design'];
const CAT_COLORS = {
  'Work':           '#00897B',
  'Projects':       '#5E35B1',
  'Education':      '#039BE5',
  'Writing':        '#E53935',
  'Graphic Design': '#FF9800',
};

const ROW_H   = 44;  // px per entry row
const LINE_Y  = 30;  // y of line within its row (space above for labels)
const CAT_GAP = 18;  // extra gap between category groups
const PAD_TOP = 24;  // canvas top padding
const LABEL_PPM_THRESHOLD = 10; // PPM at which labels appear

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

// ── Layout rows ───────────────────────────────────────────

function buildRows(data) {
  const rows = [];
  let top = PAD_TOP;
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
      rows.push({ entry, cat, top });
      top += ROW_H;
    });
  });

  return { rows, totalHeight: top + PAD_TOP };
}

// ── Render ────────────────────────────────────────────────

function render() {
  const filtered = allData.filter(d => activeFilters.has(d.category));
  const ruler    = document.getElementById('year-ruler');
  const canvas   = document.getElementById('canvas');

  if (!filtered.length) {
    ruler.innerHTML = canvas.innerHTML = '';
    return;
  }

  const allStart = filtered.map(d => toMonths(d.start_month, d.start_year));
  const allEnd   = filtered.map(d => entryEnd(d));
  const minM = Math.min(...allStart);
  const maxM = Math.max(...allEnd);
  const startY = Math.floor(minM / 12);
  const endY   = Math.ceil((maxM + 1) / 12) + 1;
  const totalM = (endY - startY) * 12;
  const W = totalM * PPM;

  const { rows, totalHeight } = buildRows(filtered);
  const showLabels = PPM >= LABEL_PPM_THRESHOLD;

  // Year ruler
  ruler.innerHTML = '';
  ruler.style.width = W + 'px';
  for (let y = startY; y <= endY; y++) {
    const left = (y * 12 - minM) * PPM;
    if (left < 0 || left > W) continue;

    const tick = el('div', 'year-tick');
    tick.style.left = left + 'px';
    tick.textContent = y;
    ruler.appendChild(tick);

    if (PPM >= 5) {
      for (let m = 1; m < 12; m++) {
        const ml = (y * 12 + m - minM) * PPM;
        if (ml >= W) break;
        const mt = el('div', 'month-tick');
        mt.style.left = ml + 'px';
        ruler.appendChild(mt);
      }
    }
  }

  // Canvas
  canvas.innerHTML = '';
  canvas.style.cssText = `width:${W}px; height:${totalHeight}px; position:relative;`;
  if (focusedEntry) canvas.classList.add('focused');

  // Vertical year grid lines
  for (let y = startY; y <= endY; y++) {
    const left = (y * 12 - minM) * PPM;
    if (left < 0 || left > W) continue;
    const line = el('div', 'grid-year');
    line.style.left = left + 'px';
    canvas.appendChild(line);
  }

  // Entry lines
  rows.forEach(({ entry, cat, top }) => {
    const startM = toMonths(entry.start_month, entry.start_year);
    const endM   = entryEnd(entry);
    const left   = (startM - minM) * PPM;
    const width  = Math.max((endM - startM + 1) * PPM, 8);
    const lineY  = top + LINE_Y;
    const color  = CAT_COLORS[entry.category] || '#888';

    const line = el('div', 'entry-line');
    line.style.cssText = `left:${left}px; width:${width}px; top:${lineY}px;`;
    if (focusedEntry === entry) line.classList.add('selected');

    // Colored endpoint circles
    const dotS = el('div', 'entry-dot dot-start');
    dotS.style.background = color;
    const dotE = el('div', 'entry-dot dot-end');
    dotE.style.background = color;

    // Label above line
    const lbl = el('span', 'entry-lbl' + (showLabels ? ' visible' : ''));
    lbl.textContent = entry.title;

    line.appendChild(dotS);
    line.appendChild(dotE);
    line.appendChild(lbl);

    line.addEventListener('click', e => { e.stopPropagation(); openFocus(entry); });
    line.addEventListener('mouseenter', e => { if (!focusedEntry) showTip(e, entry); });
    line.addEventListener('mouseleave', hideTip);

    canvas.appendChild(line);
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

// ── Focus / detail ────────────────────────────────────────

function openFocus(entry) {
  hideTip();
  focusedEntry = entry;
  render();

  const sheet = document.getElementById('detail-sheet');
  const body  = document.getElementById('sheet-body');
  const color = CAT_COLORS[entry.category] || '#000';

  const tags = (entry.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const desc = entry.long_description || entry.short_description || '';

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

  sheet.classList.add('open');
}

function closeFocus() {
  focusedEntry = null;
  document.getElementById('canvas').classList.remove('focused');
  document.getElementById('detail-sheet').classList.remove('open');
  document.querySelectorAll('.entry-line.selected').forEach(l => l.classList.remove('selected'));
}

// ── About ─────────────────────────────────────────────────

function openAbout() {
  hideTip();
  focusedEntry = null;
  document.getElementById('canvas').classList.remove('focused');

  const sheet = document.getElementById('detail-sheet');
  const body  = document.getElementById('sheet-body');

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

  sheet.classList.add('open');
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

// ── Intro sequence ────────────────────────────────────────

function runIntro() {
  return new Promise(resolve => {
    const introLine = document.getElementById('intro-line');
    const introName = document.getElementById('intro-name');
    const intro     = document.getElementById('intro');
    const app       = document.getElementById('app');

    // Expand line, fade name
    introLine.classList.add('expand');
    introName.classList.add('fade');

    // After line expands, reveal app
    setTimeout(() => {
      intro.classList.add('hidden');
      app.classList.add('visible');
      setTimeout(() => {
        intro.style.display = 'none';
        resolve();
      }, 650);
    }, 1150);
  });
}

// ── Init ──────────────────────────────────────────────────

async function init() {
  const canvasWrap = document.getElementById('canvas-wrap');
  const ruler      = document.getElementById('year-ruler');

  // Ruler scroll sync
  canvasWrap.addEventListener('scroll', () => {
    ruler.style.transform = `translateX(-${canvasWrap.scrollLeft}px)`;
  });

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

  // Sheet close button
  document.getElementById('sheet-close').addEventListener('click', closeFocus);

  // About
  document.getElementById('about-btn').addEventListener('click', openAbout);

  // Fetch data + enforce minimum 3s intro
  const [data] = await Promise.all([
    fetchData().catch(() => []),
    new Promise(r => setTimeout(r, 3000)),
  ]);
  allData = data;

  // Render hidden content, then play intro reveal
  renderFilters();
  render();
  await runIntro();
}

init();
