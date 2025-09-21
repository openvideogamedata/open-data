// ============
// Utilities
// ============
function getParam(name) {
  const p = new URLSearchParams(window.location.search);
  return p.get(name) || '';
}

function humanize(name) {
  return name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
}

function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  while (i < text.length) {
    const ch = text[i++];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch !== '\r') { field += ch; }
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function rowsToObjects(rows) {
  if (!rows || !rows.length) return [];
  const [header, ...data] = rows;
  return data.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function baseTitle(title) {
  const m = /^(.*)\s+\((\d{4})\)$/.exec(title || '');
  return (m ? m[1] : (title || '')).trim();
}

function buildCoverSrc(coverId) {
  return `https://images.igdb.com/igdb/image/upload/t_cover_big/${coverId}.jpg`;
}

async function fetchText(url, accept) {
  const res = await fetch(url, { headers: { 'Accept': accept || '*/*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchCsvAsObjects(url) {
  const text = await fetchText(url, 'text/csv, */*');
  return rowsToObjects(parseCSV(text));
}

// ============
// Data loading
// ============
async function loadAggregated(listName) {
  const url = `list/${encodeURIComponent(listName)}/aggregated-list.csv`;
  return fetchCsvAsObjects(url);
}

async function loadAboutRows(listName) {
  const url = `list/${encodeURIComponent(listName)}/about.csv`;
  try {
    return await fetchCsvAsObjects(url);
  } catch (_) {
    return [];
  }
}

function candidateSourceUrls(listName, relPath) {
  const relStr = String(relPath);
  const direct = relStr.split('/').map(encodeURIComponent).join('/');
  const urls = [`list/${encodeURIComponent(listName)}/${direct}`];
  if (!relStr.includes(' /')) {
    const dashIdx = relStr.indexOf(' - ');
    if (dashIdx > 0 && !relStr.includes('/')) {
      const srcFolder = relStr.slice(0, dashIdx);
      const nested = `list/${encodeURIComponent(listName)}/${encodeURIComponent(srcFolder)}/${encodeURIComponent(relStr)}`;
      urls.push(nested);
    }
  }
  return urls;
}

async function buildCoverMap(listName) {
  const coverMap = new Map();
  const about = await loadAboutRows(listName);
  const relPaths = about.map(r => r.GeneratedCsvPath).filter(Boolean);
  await Promise.all(relPaths.map(async rel => {
    const tries = candidateSourceUrls(listName, rel);
    for (const url of tries) {
      try {
        const rows = await fetchCsvAsObjects(url);
        rows.forEach(obj => {
          const tTitle = baseTitle((obj.Title || '').trim());
          const cid = (obj.CoverImageId || '').trim();
          if (tTitle && cid && !coverMap.has(tTitle)) coverMap.set(tTitle, cid);
        });
        break;
      } catch (_) { /* try next candidate */ }
    }
  }));
  return coverMap;
}

// ============
// Rendering
// ============
function ensureGrid(rootEl) {
  let ul = document.getElementById('game-grid');
  if (!ul) {
    ul = document.createElement('ul');
    ul.id = 'game-grid';
    ul.className = 'list-grid';
    rootEl.appendChild(ul);
  }
  ul.innerHTML = '';
  return ul;
}

function createCoverElement(coverId, title) {
  const wrap = document.createElement('div');
  wrap.className = 'cover-wrap';
  if (coverId) {
    const img = document.createElement('img');
    img.className = 'game-card-cover';
    img.src = `covers/${coverId}_big.jpg`;
    img.onerror = function () {
      if (img.dataset.fallback !== '1') { img.dataset.fallback = '1'; img.src = buildCoverSrc(coverId); }
    };
    img.alt = title;
    img.title = title;
    img.width = 166; img.height = 224;
    img.loading = 'lazy'; img.decoding = 'async';
    wrap.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'game-card-cover placeholder';
    ph.setAttribute('aria-hidden','true');
    wrap.appendChild(ph);
  }
  return wrap;
}

function createCard(row, coverId) {
  const li = document.createElement('li');
  li.className = 'list-item game-card';

  const title = row.Title || '';
  li.appendChild(createCoverElement(coverId, title));

  const badge = document.createElement('span');
  badge.className = 'badge-pos';
  badge.textContent = '#' + row.Position;
  li.appendChild(badge);

  const titleEl = document.createElement('div');
  titleEl.className = 'game-card-title';
  titleEl.textContent = title;
  li.appendChild(titleEl);

  const meta = document.createElement('small');
  meta.className = 'game-card-meta';
  meta.textContent = 'Score: ' + row.TotalScore + ' - Lists: ' + row.ListsAppeared;
  li.appendChild(meta);
  return li;
}

function renderCards(rootEl, aggregated, coverMap) {
  const ul = ensureGrid(rootEl);
  const frag = document.createDocumentFragment();
  aggregated.forEach(row => {
    const coverId = coverMap.get(baseTitle(row.Title || '')) || '';
    frag.appendChild(createCard(row, coverId));
  });
  ul.appendChild(frag);
}

function renderTableFromObjects(thead, tbody, aggregated) {
  thead.innerHTML = '';
  tbody.innerHTML = '';
  const header = ['Position', 'Title', 'TotalScore', 'ListsAppeared'];
  const tr = document.createElement('tr');
  header.forEach(h => { const th = document.createElement('th'); th.textContent = h; tr.appendChild(th); });
  thead.appendChild(tr);
  const frag = document.createDocumentFragment();
  aggregated.forEach(row => {
    const tr = document.createElement('tr');
    [row.Position, row.Title, row.TotalScore, row.ListsAppeared].forEach((val, idx) => {
      const td = document.createElement('td');
      td.textContent = String(val ?? '');
      if (idx === 0) td.style.fontWeight = '600';
      if (idx === 0 || idx >= 2) td.style.textAlign = 'right';
      tr.appendChild(td);
    });
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);
}

function setupToggle(toggleBtn, gridEl, tableWrap) {
  let mode = 'cards';
  const setMode = (m) => {
    mode = m;
    const showCards = (mode === 'cards');
    if (gridEl) { gridEl.hidden = !showCards; gridEl.style.display = showCards ? '' : 'none'; }
    if (tableWrap) { tableWrap.hidden = showCards; tableWrap.style.display = showCards ? 'none' : ''; }
    toggleBtn.textContent = showCards ? 'Switch to list view' : 'Switch to cards view';
  };
  setMode('cards');
  toggleBtn.addEventListener('click', () => setMode(mode === 'cards' ? 'table' : 'cards'));
}

// ============
// Page flow
// ============
async function loadPage() {
  const name = getParam('name');
  const pageTitle = document.getElementById('page-title');
  const status = document.getElementById('status');
  const pathEl = document.getElementById('csv-path');
  const tableWrap = document.getElementById('table-wrap');
  const tableEl = document.getElementById('data-table');
  const thead = document.getElementById('table-head');
  const tbody = document.getElementById('table-body');
  const gridSection = document.querySelector('main section');

  if (!name) { if (status) status.textContent = 'Parametro ?name= nao informado.'; return; }
  if (pageTitle) pageTitle.textContent = humanize(name);

  // Aggregated
  const csvPath = `list/${encodeURIComponent(name)}/aggregated-list.csv`;
  if (pathEl) pathEl.textContent = csvPath;

  try {
    const aggregated = await loadAggregated(name);

    // Covers
    const coverMap = await buildCoverMap(name);

    // Render
    const section = gridSection || document.body;
    renderCards(section, aggregated, coverMap);
    if (tableEl && thead && tbody) { renderTableFromObjects(thead, tbody, aggregated); if (tableWrap) tableWrap.hidden = true; }

    // Toggle
    const toggleBtn = document.getElementById('toggle-view');
    if (toggleBtn) setupToggle(toggleBtn, document.getElementById('game-grid'), tableWrap);

    if (status) status.textContent = `${aggregated.length} itens`;
  } catch (err) {
    console.error(err);
    if (status) status.textContent = 'Falha ao carregar os dados.';
  }
}

loadPage();
