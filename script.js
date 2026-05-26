const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-OE9XqlJl3nutmKHwy5lBI6WR-NpAL7Ybvo5Bia29jp_pmZ0dMQfkrl1mTJb3GfhgMZg81q-9IQwn/pub?gid=0&single=true&output=csv';

const CAT_ORDER = ['Education', 'Research & Writing', 'Graphic Design', 'Design Strategy', 'Organizing', 'Video'];
const CAT_SHAPES = {
  'Education':          'circle',
  'Research & Writing': 'diamond',
  'Graphic Design':     'star4',
  'Design Strategy':    'star5',
  'Organizing':         'star6',
  'Video':              'square',
};
const SHAPE_SVG = {
  circle:  '<circle cx="8" cy="8" r="6" class="shape-icon"/>',
  square:  '<rect x="2.5" y="2.5" width="11" height="11" class="shape-icon"/>',
  diamond: '<polygon points="8,1 15,8 8,15 1,8" class="shape-icon"/>',
  star4:   '<polygon points="8,1.5 9.8,6.2 14.5,8 9.8,9.8 8,14.5 6.2,9.8 1.5,8 6.2,6.2" class="shape-icon"/>',
  star5:   '<polygon points="8,1.5 9.6,5.7 14.2,6 10.7,8.9 11.8,13.3 8,10.8 4.2,13.3 5.3,8.9 1.8,6 6.4,5.7" class="shape-icon"/>',
  star6:   '<polygon points="8,1.5 9.8,5 13.6,4.8 11.5,8 13.6,11.2 9.8,11 8,14.5 6.2,11 2.4,11.2 4.5,8 2.4,4.8 6.2,5" class="shape-icon"/>',
};

function makeDotEl(shape, cls) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 16 16');
  if (cls) svg.setAttribute('class', cls);
  if (shape && SHAPE_SVG[shape]) svg.innerHTML = SHAPE_SVG[shape];
  return svg;
}

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
let pendingHash   = '';
let bgImages      = [];

function toSlug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function resolveHash(hash) {
  if (!hash) return;
  if (hash === 'about') { openAbout(); return; }
  const match = allData.find(d => toSlug(d.title) === hash);
  if (match) openFocus(match);
}

// ── CSV ──────────────────────────────────────────────────

async function fetchData() {
  const res  = await fetch(CSV_URL);
  const text = await res.text();
  return parseCSV(text);
}

function parseCSV(text) {
  // Collect logical rows respecting quoted newlines
  const rows = [];
  let cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQ && text[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; cur += ch; }
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (cur) rows.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) rows.push(cur);

  const headers = splitRow(rows[0]).map(h => h.trim());
  return rows.slice(1)
    .map(line => {
      const vals = splitRow(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
      return obj;
    })
    .filter(r => r.title && (r.start_year || r.end_year));
}

function splitRow(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
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
  const hasStart = !!entry.start_year;
  const ey = (entry.end_year || '').toLowerCase();
  if (!hasStart) return `${moStr(entry.end_month)} ${entry.end_year}`;
  const s = `${moStr(entry.start_month)} ${entry.start_year}`;
  if (!ey) return `${s} – Present`;
  return `${s} – ${moStr(entry.end_month)} ${entry.end_year}`;
}

function entryStart(entry) {
  if (!entry.start_year) return toMonths(entry.end_month, entry.end_year);
  return toMonths(entry.start_month, entry.start_year);
}

// ── Build rows ────────────────────────────────────────────
// Work / Education / Writing fan above the axis; Projects / Graphic Design below

function buildRows(data, rowH) {
  const sorted = [...data].sort((a, b) =>
    entryStart(a) - entryStart(b)
  );
  const rows = sorted.map((entry, i) => ({
    entry,
    cat: entry.category,
    yOffset: -(AXIS_GAP + Math.round(rowH / 2) + i * rowH),
  }));
  const spaceAbove = sorted.length ? AXIS_GAP + rowH * sorted.length : AXIS_GAP;
  return { rows, spaceAbove, spaceBelow: PAD_V };
}

// ── Render ────────────────────────────────────────────────

function render() {
  const filtered   = allData.filter(d => activeFilters.has(d.category));
  const canvas     = document.getElementById('canvas');
  const canvasWrap = document.getElementById('canvas-wrap');

  if (!allData.length) { canvas.innerHTML = ''; return; }

  // Always use the full dataset for the time range so the axis never shifts
  const allStart = allData.map(d => entryStart(d));
  const allEnd   = allData.map(d => entryEnd(d));
  const minM   = Math.min(...allStart);
  const maxM   = Math.max(...allEnd);
  const startY = Math.floor(minM / 12) - 2; // 2 years breathing room on left
  const endY   = Math.ceil((maxM + 1) / 12) + 1;
  const W      = (endY - startY) * 12 * PPM;

  const visH  = canvasWrap.clientHeight;
  // Axis anchored near the bottom so all entries read chronologically above it
  const targetAxisY = visH - 60;

  const numEntries = filtered.length;
  const dynamicRowH = numEntries > 0
    ? Math.max(12, Math.floor((targetAxisY - AXIS_GAP - PAD_V) / numEntries))
    : ROW_H;

  const { rows, spaceAbove } = numEntries
    ? buildRows(filtered, dynamicRowH)
    : { rows: [], spaceAbove: 0 };

  // Canvas axis position must have enough room above it for all entries
  const canvasAxisY = Math.max(targetAxisY, spaceAbove + PAD_V);

  canvas.innerHTML = '';
  canvas.style.cssText = `width:${W}px; height:${canvasAxisY + 40}px; position:relative;`;
  if (focusedEntry) canvas.classList.add('focused');

  // Scroll so the axis appears at 50vh in the viewport (unless zoom is in progress)
  if (!preserveScroll) {
    canvasWrap.scrollTop = Math.max(0, canvasAxisY - targetAxisY);
  }
  preserveScroll = false;

  // Clip bg tiles to stop at the axis line
  const bgTiles = document.getElementById('bg-tiles');
  if (bgTiles) bgTiles.style.height = (canvasWrap.getBoundingClientRect().top + targetAxisY) + 'px';

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
    const startM  = entryStart(entry);
    const endM    = entryEnd(entry);
    const left    = (startM - originM) * PPM;
    const isPoint = !entry.start_year || (!entry.end_year && !entry.end_month);
    const durPx   = isPoint ? 0 : (endM - startM) * PPM;
    const width   = isPoint ? 14 : Math.max(durPx + PPM, 10);
    const top     = canvasAxisY + row.yOffset - Math.round(BAR_H / 2);
    const shape   = CAT_SHAPES[entry.category] || 'circle';

    const bar = el('div', isPoint ? 'bar point-only' : 'bar');
    bar.style.cssText = `left:${left}px; width:${width}px; top:${top}px;`;
    if (focusedEntry === entry) bar.classList.add('selected');

    if (isPoint) {
      bar.appendChild(makeDotEl(shape, 'dot dot-start'));
    } else {
      bar.appendChild(makeDotEl(shape, 'dot dot-start'));
      bar.appendChild(makeDotEl(shape, 'dot dot-end'));
    }

    const lbl = el('span', 'bar-lbl');
    lbl.textContent = entry.title;
    bar.appendChild(lbl);

    bar.addEventListener('click', e => { e.stopPropagation(); openFocus(entry); });

    const entryImgKeys = ['image_1','image_2','image_3','image_4','image_5','image_6','image_7','image_8','image_9','image_10','image_11','image_12'];
    const entryImgs = entryImgKeys.map(k => entry[k]).filter(Boolean);
    if (entryImgs.length) {
      bar.addEventListener('mouseenter', () => {
        document.querySelectorAll('#bg-tiles .bg-tile img.color').forEach(t => {
          delete t.dataset.locked;
          t.classList.remove('color', 'active');
          setTimeout(() => cycleTile(t, bgImages), 1500);
        });
        const allTiles = Array.from(document.querySelectorAll('#bg-tiles .bg-tile img'))
          .sort(() => Math.random() - 0.5);
        entryImgs.forEach((src, i) => {
          if (i >= allTiles.length) return;
          const tile = allTiles[i];
          tile.dataset.locked = '1';
          tile.classList.remove('active');
          tile.classList.add('color');
          tile.onload = () => { if (tile.dataset.locked) tile.classList.add('active'); };
          tile.src = src;
        });
      });
      bar.addEventListener('mouseleave', () => {
        const colorTile = document.querySelector('#bg-tiles .bg-tile img.color');
        if (colorTile) {
          delete colorTile.dataset.locked;
          colorTile.classList.remove('color', 'active');
          setTimeout(() => cycleTile(colorTile, bgImages), 1500);
        }
      });
    }

    canvas.appendChild(bar);
  });
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

// ── Markdown link parser ──────────────────────────────────

function parseMdLinks(text) {
  return text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="s-link">$1</a>');
}

// ── Video embed helpers ───────────────────────────────────

function getEmbedUrl(url) {
  if (!url) return null;
  // YouTube: watch?v=ID or youtu.be/ID
  const ytMatch = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  // Vimeo: vimeo.com/ID
  const vmMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vmMatch) return `https://player.vimeo.com/video/${vmMatch[1]}`;
  // Google Drive: /file/d/ID/view → /file/d/ID/preview
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  return null;
}

// ── Focus / detail sheet ──────────────────────────────────

function openFocus(entry) {
  focusedEntry = entry;

  // Zoom so the entry's duration fills ~75% of the viewport width
  const wrap     = document.getElementById('canvas-wrap');
  const startM   = entryStart(entry);
  const endM     = entryEnd(entry);
  const duration = Math.max(endM - startM + 1, 1);
  PPM = Math.max(3, Math.min(60, (wrap.clientWidth * 0.75) / duration));
  render();

  // Scroll to center the entry horizontally
  const originM  = (Math.floor(Math.min(...allData.map(d => entryStart(d))) / 12) - 2) * 12;
  const barLeft  = (startM - originM) * PPM;
  const barWidth = Math.max((endM - startM + 1) * PPM, 10);
  wrap.scrollLeft = barLeft + barWidth / 2 - wrap.clientWidth / 2;

  const body  = document.getElementById('sheet-body');
  const shape = CAT_SHAPES[entry.category] || 'circle';
  const desc  = entry.long_description || entry.short_description || '';
  const dotSvg = `<svg width="18" height="18" viewBox="0 0 16 16">${SHAPE_SVG[shape]}</svg>`;

  const textCol = `
    <div class="s-title-row">${dotSvg}<div class="s-title">${entry.title}</div></div>
    <div class="s-meta-group">
      ${entry.role         ? `<div class="s-meta">${entry.role}</div>` : ''}
      ${entry.organization ? `<div class="s-meta">${entry.organization}</div>` : ''}
      <div class="s-meta">${dateRange(entry)}</div>
      ${entry.location     ? `<div class="s-meta">${entry.location}</div>` : ''}
    </div>
    ${desc ? `<div class="s-desc">${parseMdLinks(desc).replace(/\n/g, '<br>')}</div>` : ''}
    ${entry.external_link ? `<a href="${entry.external_link}" target="_blank" rel="noopener" class="s-link">${entry.external_link_label || 'View →'}</a>` : ''}
  `;

  const imgKeys = ['image_1','image_2','image_3','image_4','image_5','image_6','image_7','image_8','image_9','image_10','image_11','image_12'];
  const embedUrl = getEmbedUrl(entry.external_link);
  const isDoc = embedUrl && embedUrl.includes('drive.google.com');
  const embedHtml = embedUrl
    ? `<div class="sheet-embed${isDoc ? ' sheet-embed--doc' : ''}"><iframe src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`
    : '';
  const imgFigures = imgKeys
    .filter(k => entry[k])
    .map(k => {
      const caption = entry[k + '_caption'] || '';
      const source  = entry[k + '_source']  || '';
      const meta = (caption || source) ? `
        <figcaption class="sheet-figcaption">
          ${caption ? `<span class="sheet-caption">${caption}</span>` : ''}
          ${source  ? `<span class="sheet-source">${source}</span>`   : ''}
        </figcaption>` : '';
      return `<figure class="sheet-figure"><img src="${entry[k]}" alt="${entry.title}">${meta}</figure>`;
    }).join('');
  const imgHtml = embedHtml + (imgFigures || (!embedHtml ? `<div class="sheet-img-placeholder"></div>` : ''));

  body.className = 'sheet-body two-col';
  body.innerHTML = `
    <div class="sheet-img-col">${imgHtml}</div>
    <div class="sheet-text-col">${textCol}</div>
  `;

  document.getElementById('detail-sheet').classList.add('open');
  document.getElementById('scrim')?.classList.add('active');
  history.replaceState(null, '', '#' + toSlug(entry.title));

  const nextBtn = document.getElementById('sheet-next');
  if (nextBtn) {
    const sorted = [...allData]
      .filter(d => activeFilters.has(d.category))
      .sort((a, b) => entryStart(a) - entryStart(b));
    const idx = sorted.findIndex(d => d.title === entry.title);
    if (idx >= 0 && sorted.length > 1) {
      const nextEntry = sorted[(idx + 1) % sorted.length];
      nextBtn.onclick = () => openFocus(nextEntry);
      nextBtn.style.display = '';
    } else {
      nextBtn.style.display = 'none';
    }
  }
}

function closeFocus() {
  focusedEntry = null;
  document.getElementById('canvas').classList.remove('focused');
  document.getElementById('detail-sheet').classList.remove('open');
  document.getElementById('scrim')?.classList.remove('active');
  document.querySelectorAll('.bar.selected').forEach(b => b.classList.remove('selected'));
  history.replaceState(null, '', location.pathname + location.search);
  if (allData.length) {
    PPM = defaultPPM();
    render();
  }
}

// Close panel without triggering its own render (caller will render after)
function dismissPanel() {
  const sheet = document.getElementById('detail-sheet');
  if (!sheet.classList.contains('open')) return;
  focusedEntry = null;
  document.getElementById('canvas').classList.remove('focused');
  sheet.classList.remove('open');
  document.getElementById('scrim')?.classList.remove('active');
  document.querySelectorAll('.bar.selected').forEach(b => b.classList.remove('selected'));
  history.replaceState(null, '', location.pathname + location.search);
  if (allData.length) {
    PPM = defaultPPM();
  }
}

// ── About ─────────────────────────────────────────────────

function openAbout() {
  focusedEntry = null;
  document.getElementById('canvas').classList.remove('focused');

  const body = document.getElementById('sheet-body');
  body.className = 'sheet-body two-col';
  body.innerHTML = `
    <div class="sheet-img-col"><img src="images/dc_headshot.png" alt="Delaney Connor"></div>
    <div class="sheet-text-col">
      <div class="about-bio">
        <p>Delaney Connor is an urban designer and community organizer whose work examines how the built environment shapes collective life. Originally from Seattle, she completed her undergraduate studies in New Orleans, where she developed interests in creative resistance and the spatial politics of displacement.</p>
        <p>She then spent several years in Bozeman, Montana, working on homelessness and legal reform—experiences that ground her commitment to research methods centering community knowledge and reciprocity.</p>
        <p>Connor is currently completing a Master's in Design and Urban Ecologies at Parsons School of Design, where her thesis examines block associations in Bedford-Stuyvesant. Her research interests include solidarity infrastructure, political subjectivity, and block-level organizing. Outside her studies, she enjoys cooking large pots of soup and exploring NYC by bicycle.</p>
      </div>
      <div class="about-links">
        <a href="mailto:delaneyconnor1@gmail.com" class="s-link">delaneyconnor1@gmail.com</a>
        <a href="https://linkedin.com/in/delaney-connor" target="_blank" rel="noopener" class="s-link">LinkedIn →</a>
      </div>
    </div>
  `;

  document.getElementById('detail-sheet').classList.add('open');
  document.getElementById('scrim')?.classList.add('active');
  history.replaceState(null, '', '#about');
}

// ── Filters ───────────────────────────────────────────────

function renderFilters() {
  const bar = document.getElementById('filter-bar');
  bar.innerHTML = '';

  const allActive = activeFilters.size === CAT_ORDER.length;
  const allBtn = makeBtn('All', null, allActive);
  allBtn.addEventListener('click', () => {
    dismissPanel();
    CAT_ORDER.forEach(c => activeFilters.add(c));
    renderFilters(); render();
  });
  bar.appendChild(allBtn);

  CAT_ORDER.forEach(cat => {
    const isolated = activeFilters.size === 1 && activeFilters.has(cat);
    const b = makeBtn(cat, CAT_SHAPES[cat], activeFilters.has(cat));
    b.addEventListener('click', () => {
      dismissPanel();
      if (isolated) {
        CAT_ORDER.forEach(c => activeFilters.add(c));
      } else {
        CAT_ORDER.forEach(c => activeFilters.delete(c));
        activeFilters.add(cat);
      }
      renderFilters(); render();
    });
    bar.appendChild(b);
  });

  // Mobile dropdown
  const dropdown = document.getElementById('filter-dropdown');
  const toggle   = document.getElementById('filter-mobile-toggle');
  const label    = document.getElementById('filter-mobile-label');
  if (!dropdown || !toggle) return;

  dropdown.innerHTML = '';

  const allActive2 = activeFilters.size === CAT_ORDER.length;
  label.textContent = allActive2 ? 'All' : (activeFilters.size === 1 ? [...activeFilters][0] : 'Filtered');

  const makeItem = (text, active, onClick) => {
    const btn = el('button', 'filter-dropdown-item' + (active ? ' active' : ''));
    btn.textContent = text;
    btn.addEventListener('click', () => {
      closeMobileDropdown();
      onClick();
    });
    dropdown.appendChild(btn);
  };

  makeItem('All', allActive2, () => {
    dismissPanel();
    CAT_ORDER.forEach(c => activeFilters.add(c));
    renderFilters(); render();
  });

  CAT_ORDER.forEach(cat => {
    const isolated = activeFilters.size === 1 && activeFilters.has(cat);
    makeItem(cat, activeFilters.has(cat), () => {
      dismissPanel();
      if (isolated) {
        CAT_ORDER.forEach(c => activeFilters.add(c));
      } else {
        CAT_ORDER.forEach(c => activeFilters.delete(c));
        activeFilters.add(cat);
      }
      renderFilters(); render();
    });
  });
}

function closeMobileDropdown() {
  const dropdown = document.getElementById('filter-dropdown');
  const toggle   = document.getElementById('filter-mobile-toggle');
  dropdown?.classList.remove('open');
  toggle?.classList.remove('open');
}

function initMobileToggle() {
  const toggle = document.getElementById('filter-mobile-toggle');
  const dropdown = document.getElementById('filter-dropdown');
  if (!toggle || !dropdown) return;
  toggle.addEventListener('click', () => {
    const isOpen = dropdown.classList.toggle('open');
    toggle.classList.toggle('open', isOpen);
  });
  // close dropdown when clicking outside
  document.addEventListener('click', e => {
    if (!toggle.contains(e.target) && !dropdown.contains(e.target)) {
      closeMobileDropdown();
    }
  });
}

function makeBtn(label, shape, active) {
  const b = el('button', 'filter-btn' + (active ? ' active' : ''));
  if (shape) b.appendChild(makeDotEl(shape, 'filter-dot'));
  const lbl = el('span', 'filter-lbl');
  lbl.textContent = label;
  b.appendChild(lbl);
  return b;
}

// ── Fit timeline to screen width ─────────────────────────

function fitToWidth(data) {
  const allStart = data.map(d => entryStart(d));
  const allEnd   = data.map(d => entryEnd(d));
  const startY   = Math.floor(Math.min(...allStart) / 12) - 2;
  const endY     = Math.ceil((Math.max(...allEnd) + 1) / 12) + 1;
  const months   = (endY - startY) * 12;
  const w        = document.getElementById('canvas-wrap').clientWidth;
  return Math.max(3, Math.min(60, w / months));
}

function isMobile() { return window.innerWidth < 768; }

function defaultPPM() {
  if (!allData.length) return 3;
  return isMobile() ? 10 : fitToWidth(allData);
}

function minPPM() {
  return defaultPPM();
}

// ── Background tiles ─────────────────────────────────────

function cycleTile(img, images) {
  if (img.dataset.locked) return;
  const src = images[Math.floor(Math.random() * images.length)];
  img.onload = () => {
    img.classList.add('active');
    setTimeout(() => {
      img.classList.remove('active');
      setTimeout(() => cycleTile(img, images), 1500);
    }, 10000 + Math.random() * 15000);
  };
  img.onerror = () => setTimeout(() => cycleTile(img, images), 2000);
  img.src = src;
}

function initBgTiles(images) {
  bgImages = images;
  const container = document.getElementById('bg-tiles');
  if (!images.length || !container) return;
  const COLS = 5;
  const size = Math.floor(window.innerWidth / COLS);
  const ROWS = Math.ceil(window.innerHeight / size) + 1;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = el('div', 'bg-tile');
      tile.style.left   = `${c * size}px`;
      tile.style.top    = `${r * size}px`;
      tile.style.width  = `${size}px`;
      tile.style.height = `${size}px`;
      const img = document.createElement('img');
      tile.appendChild(img);
      container.appendChild(tile);
      setTimeout(() => cycleTile(img, images), Math.random() * 6000);
    }
  }
}

// ── Init ──────────────────────────────────────────────────

// Zoom keeping the viewport center pinned to the same calendar position
function zoomTo(newPPM) {
  const wrap   = document.getElementById('canvas-wrap');
  const canvas = document.getElementById('canvas');
  const oldW   = parseFloat(canvas.style.width) || wrap.scrollWidth;
  const centerX = wrap.scrollLeft + wrap.clientWidth / 2;
  const ratio   = oldW > 0 ? centerX / oldW : 0.5;
  PPM = Math.max(minPPM(), newPPM);
  preserveScroll = true;
  render();
  const newW = parseFloat(canvas.style.width) || wrap.scrollWidth;
  wrap.scrollLeft = ratio * newW - wrap.clientWidth / 2;
}

function init() {
  const canvasWrap = document.getElementById('canvas-wrap');

  // Ctrl/Cmd + scroll = zoom
  canvasWrap.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const newPPM = Math.max(minPPM(), Math.min(60, PPM + (e.deltaY < 0 ? 1.5 : -1.5)));
    zoomTo(newPPM);
  }, { passive: false });

  // Click canvas background = exit focus
  canvasWrap.addEventListener('click', () => {
    if (focusedEntry) closeFocus();
  });

  document.getElementById('sheet-close').addEventListener('click', closeFocus);
  document.getElementById('about-btn').addEventListener('click', openAbout);
  initMobileToggle();

  // Fetch data as soon as the page loads
  fetchData()
    .then(data => {
      allData = data;
      PPM = defaultPPM();
      renderFilters();
      render();
      pendingHash = location.hash.slice(1);
      const imgKeys = ['image_1','image_2','image_3','image_4','image_5','image_6','image_7','image_8','image_9','image_10','image_11','image_12'];
      const imgs = data.flatMap(d => imgKeys.map(k => d[k]).filter(Boolean));
      if (imgs.length) initBgTiles(imgs);
    })
    .catch(() => { allData = []; renderFilters(); render(); });
}

// ── Text scramble ─────────────────────────────────────────

function scrambleText(el, finalText, duration) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const steps = Math.round(duration / 40);
  let frame = 0;
  const interval = setInterval(() => {
    el.textContent = finalText.split('').map((ch, i) => {
      if (ch === ' ') return ' ';
      if (frame / steps > i / finalText.replace(/ /g, '').length * 1.4) return ch;
      return chars[Math.floor(Math.random() * chars.length)];
    }).join('');
    if (frame++ >= steps) {
      el.textContent = finalText;
      clearInterval(interval);
    }
  }, 40);
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
    if (pendingHash) {
      const h = pendingHash; pendingHash = '';
      resolveHash(h);
    }
  }, 1450);
}

init();

// Scramble the intro name on load
const introNameEl = document.getElementById('intro-name');
if (introNameEl) scrambleText(introNameEl, 'DELANEY CONNOR', 1800);
