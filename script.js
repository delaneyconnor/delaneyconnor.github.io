const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-OE9XqlJl3nutmKHwy5lBI6WR-NpAL7Ybvo5Bia29jp_pmZ0dMQfkrl1mTJb3GfhgMZg81q-9IQwn/pub?gid=0&single=true&output=csv';

const CAT_ORDER  = ['Work', 'Projects', 'Education', 'Writing', 'Graphic Design'];
const CAT_COLORS = {
  'Work':           '#00897B',
  'Projects':       '#5E35B1',
  'Education':      '#039BE5',
  'Writing':        '#E53935',
  'Graphic Design': '#FF9800',
};

const CAT_H   = 28;
const ROW_H   = 40;
const BAR_H   = 22;

let PPM            = 10; // pixels per month
let allData        = [];
let activeFilters  = new Set(CAT_ORDER);

// ── CSV ──────────────────────────────────────────────────

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

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function mo(n) { return MONTHS[(parseInt(n) || 1) - 1] || ''; }

function dateRange(entry) {
  const s = `${mo(entry.start_month)} ${entry.start_year}`;
  const ey = (entry.end_year || '').toLowerCase();
  const e = (!ey || ey === 'present') ? 'Present' : `${mo(entry.end_month)} ${entry.end_year}`;
  return `${s} – ${e}`;
}

// ── Build rows ────────────────────────────────────────────

function buildRows(data) {
  const rows = [];
  let top = 0;
  CAT_ORDER.forEach(cat => {
    if (!activeFilters.has(cat)) return;
    const entries = data.filter(d => d.category === cat);
    if (!entries.length) return;
    rows.push({ type: 'cat', cat, top, height: CAT_H });
    top += CAT_H;
    entries
      .slice()
      .sort((a, b) => toMonths(a.start_month, a.start_year) - toMonths(b.start_month, b.start_year))
      .forEach(entry => {
        rows.push({ type: 'entry', entry, cat, top, height: ROW_H });
        top += ROW_H;
      });
  });
  return { rows, totalHeight: top };
}

// ── Render ────────────────────────────────────────────────

function render() {
  const filtered = allData.filter(d => activeFilters.has(d.category));

  const ruler       = document.getElementById('year-ruler');
  const labels      = document.getElementById('row-labels');
  const canvas      = document.getElementById('canvas');

  if (!filtered.length) {
    ruler.innerHTML = labels.innerHTML = canvas.innerHTML = '';
    return;
  }

  const allStart = filtered.map(d => toMonths(d.start_month, d.start_year));
  const allEnd   = filtered.map(d => entryEnd(d));
  const minM     = Math.min(...allStart);
  const maxM     = Math.max(...allEnd);
  const startY   = Math.floor(minM / 12);
  const endY     = Math.ceil((maxM + 1) / 12) + 1;

  const totalMonths = (endY - startY) * 12;
  const W = totalMonths * PPM;

  const { rows, totalHeight } = buildRows(filtered);

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

  // Row labels
  labels.innerHTML = '';
  labels.style.height = totalHeight + 'px';
  rows.forEach(row => {
    const lb = el('div', row.type === 'cat' ? 'label-cat' : 'label-entry');
    lb.style.cssText = `top:${row.top}px; height:${row.height}px;`;
    if (row.type === 'cat') {
      lb.style.color = CAT_COLORS[row.cat];
      lb.textContent = row.cat.toUpperCase();
    } else {
      lb.textContent = row.entry.title;
      lb.title = row.entry.title;
      lb.addEventListener('click', () => openDetail(row.entry));
    }
    labels.appendChild(lb);
  });

  // Canvas
  canvas.innerHTML = '';
  canvas.style.cssText = `width:${W}px; height:${totalHeight}px; position:relative;`;

  // Vertical year grid lines
  for (let y = startY; y <= endY; y++) {
    const left = (y * 12 - minM) * PPM;
    if (left < 0 || left > W) continue;
    const line = el('div', 'grid-year');
    line.style.left = left + 'px';
    canvas.appendChild(line);
  }

  // Rows
  rows.forEach(row => {
    if (row.type === 'cat') {
      const bg = el('div', 'row-cat-bg');
      bg.style.cssText = `top:${row.top}px; height:${row.height}px;`;
      canvas.appendChild(bg);
    } else {
      const sep = el('div', 'row-sep');
      sep.style.top = (row.top + row.height - 1) + 'px';
      canvas.appendChild(sep);

      const entry  = row.entry;
      const startM = toMonths(entry.start_month, entry.start_year);
      const endM   = entryEnd(entry);
      const left   = (startM - minM) * PPM;
      const width  = Math.max((endM - startM + 1) * PPM, 4);
      const top    = row.top + Math.round((ROW_H - BAR_H) / 2);
      const color  = CAT_COLORS[entry.category] || '#888';

      const bar = el('div', 'bar');
      bar.style.cssText = `left:${left}px; width:${width}px; top:${top}px; background:${color};`;

      const lbl = el('span', 'bar-lbl');
      lbl.textContent = entry.title;
      bar.appendChild(lbl);

      bar.addEventListener('click',      () => openDetail(entry));
      bar.addEventListener('mouseenter', e  => showTip(e, entry));
      bar.addEventListener('mouseleave',     hideTip);
      canvas.appendChild(bar);
    }
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

// ── Detail panel ──────────────────────────────────────────

function openDetail(entry) {
  const panel = document.getElementById('detail-panel');
  const body  = document.getElementById('detail-body');
  const color = CAT_COLORS[entry.category] || '#000';

  const imgs = [entry.image_1, entry.image_2, entry.image_3]
    .filter(Boolean)
    .map(u => {
      const m = u.match(/\/d\/([a-zA-Z0-9_-]+)/);
      return m ? `https://drive.google.com/uc?export=view&id=${m[1]}` : u;
    });

  const tags = (entry.tags || '').split(',').map(t => t.trim()).filter(Boolean);

  body.innerHTML = `
    <div class="d-cat" style="color:${color}">${entry.category.toUpperCase()}</div>
    <h2 class="d-title">${entry.title}</h2>
    <div class="d-date">${dateRange(entry)}</div>
    ${entry.organization ? `<div class="d-meta">${entry.organization}${entry.location ? ' &middot; ' + entry.location : ''}</div>` : ''}
    ${entry.role ? `<div class="d-meta d-role">${entry.role}</div>` : '<div class="d-divider"></div>'}
    ${imgs.length ? `<div class="d-imgs">${imgs.map(s => `<img src="${s}" alt="${entry.image_alt || entry.title}" loading="lazy">`).join('')}</div>` : ''}
    ${entry.long_description
      ? `<div class="d-desc">${entry.long_description.replace(/\n/g, '<br>')}</div>`
      : entry.short_description
        ? `<div class="d-desc">${entry.short_description}</div>`
        : ''}
    ${tags.length ? `<div class="d-tags">${tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
    ${entry.external_link ? `<a href="${entry.external_link}" target="_blank" rel="noopener" class="d-link">${entry.external_link_label || 'View →'}</a>` : ''}
  `;

  panel.classList.add('open');
}

function openAbout() {
  const panel = document.getElementById('detail-panel');
  const body  = document.getElementById('detail-body');

  body.innerHTML = `
    <div class="d-cat">About</div>
    <h2 class="d-title">Delaney Connor</h2>
    <div class="d-divider"></div>
    <div class="d-about-bio">
      <p>Delaney Connor is a Master's candidate in Design and Urban Ecologies at The New School, where her research examines how public space and infrastructure can foster deeper connections, civic engagement, and self-determination.</p>
      <p>Delaney is a designer, researcher, and urban strategist dedicated to finding solutions that center community power and needs. Her work prioritizes participatory design, collective ownership, and the importance of involving voices historically excluded from the planning and decision-making process.</p>
      <p>Before moving to New York, Delaney worked in Bozeman, Montana where her work focused on social services addressing homelessness and legal reform. Originally from Seattle, Delaney's undergraduate background transpired in New Orleans where she found inspiration in the unique modes of community resilience and creative forms of resistance.</p>
      <p>Outside of her work, Delaney enjoys cooking large pots of stew and getting to know New York City by bicycle.</p>
    </div>
    <div class="d-contact-links">
      <a href="mailto:delaneyconnor1@gmail.com" class="d-link">delaneyconnor1@gmail.com</a>
      <a href="https://linkedin.com/in/delaney-connor" target="_blank" rel="noopener" class="d-link">LinkedIn →</a>
    </div>
  `;

  panel.classList.add('open');
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

async function init() {
  const canvasWrap = document.getElementById('canvas-wrap');
  const ruler      = document.getElementById('year-ruler');
  const labels     = document.getElementById('row-labels');

  // Freeze-pane scroll sync via transform
  canvasWrap.addEventListener('scroll', () => {
    ruler.style.transform  = `translateX(-${canvasWrap.scrollLeft}px)`;
    labels.style.transform = `translateY(-${canvasWrap.scrollTop}px)`;
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

  // Detail close
  document.getElementById('detail-close').addEventListener('click', () => {
    document.getElementById('detail-panel').classList.remove('open');
  });

  // About panel
  document.getElementById('about-btn').addEventListener('click', openAbout);

  // Load data
  try {
    const res  = await fetch(CSV_URL);
    const text = await res.text();
    allData    = parseCSV(text);
  } catch (err) {
    console.error('Could not load portfolio data:', err);
    allData = [];
  }

  renderFilters();
  render();
}

init();
