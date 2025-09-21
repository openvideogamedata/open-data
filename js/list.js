// Render a list page as game cards with IGDB covers

function getParam(name) {
  const p = new URLSearchParams(window.location.search);
  return p.get(name) || '';
}

function humanize(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Basic CSV parser with quoted fields support
function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  while (i < text.length) {
    const ch = text[i++];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch === '\r') { /* ignore */ }
      else { field += ch; }
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

function renderCards(rootEl, aggregated, coverMap) {
  let ul = document.getElementById('game-grid'); if (!ul) { ul = document.createElement('ul'); ul.id = 'game-grid'; ul.className = 'list-grid'; rootEl.appendChild(ul); } ul.innerHTML = '';

  const frag = document.createDocumentFragment();
  aggregated.forEach(row => {
    const li = document.createElement('li');
    li.className = 'list-item game-card';

    const title = row.Title || '';
    const plainTitle = baseTitle(title);
    const coverId = coverMap.get(plainTitle) || '';

    const coverWrap = document.createElement('div');
    coverWrap.className = 'cover-wrap';
    if (coverId) {
      const img = document.createElement('img');
      img.className = 'game-card-cover';
      img.src = buildCoverSrc(coverId);
      img.alt = title;
      img.title = title;
      img.width = 166;
      img.height = 224;
      img.loading = 'lazy';
      img.decoding = 'async';
      coverWrap.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'game-card-cover placeholder';
      ph.setAttribute('aria-hidden','true');
      coverWrap.appendChild(ph);
    }
    li.appendChild(coverWrap);
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

    frag.appendChild(li);
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

  if (!name) {
    if (status) status.textContent = 'Parametro ?name= nao informado.';
    return;
  }
  if (pageTitle) pageTitle.textContent = humanize(name);

  const csvPath = `list/${encodeURIComponent(name)}/aggregated-list.csv`;
  if (pathEl) pathEl.textContent = csvPath;
  try {
    const res = await fetch(csvPath, { headers: { 'Accept': 'text/csv, */*' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const dataRows = parseCSV(text);
    const aggregated = rowsToObjects(dataRows);

    // Build title -> cover id map using latest source CSVs from about.csv
    const coverMap = new Map();
    try {
      const aboutRes = await fetch(`list/${encodeURIComponent(name)}/about.csv`, { headers: { 'Accept': 'text/csv, */*' } });
      if (aboutRes.ok) {
        const aboutText = await aboutRes.text();
        const aboutRows = rowsToObjects(parseCSV(aboutText));
        const relPaths = aboutRows.map(r => r.GeneratedCsvPath).filter(Boolean);
        await Promise.all(relPaths.map(async rel => {
          try {
            const parts = rel.split('/').map(encodeURIComponent).join('/');
            const url = `list/${encodeURIComponent(name)}/${parts}`;
            const r = await fetch(url, { headers: { 'Accept': 'text/csv, */*' } });
            let okRes = r;
            if (!r.ok) {
              // Fallback: if rel looks like "Source - timestamp.csv" but file lives in a subfolder named after source
              const dashIdx = rel.indexOf(' - ');
              if (dashIdx > 0 && !rel.includes('/')) {
                const srcFolder = rel.slice(0, dashIdx);
                const url2 = `list/${encodeURIComponent(name)}/${encodeURIComponent(srcFolder)}/${encodeURIComponent(rel)}`;
                const r2 = await fetch(url2, { headers: { 'Accept': 'text/csv, */*' } });
                if (!r2.ok) return;
                okRes = r2;
              } else {
                return;
              }
            }
            const t = await okRes.text();
            const rows = rowsToObjects(parseCSV(t));
            rows.forEach(obj => {
              const tTitle = (obj.Title || '').trim();
              const cid = (obj.CoverImageId || '').trim();
              if (tTitle && cid && !coverMap.has(tTitle)) {
                coverMap.set(tTitle, cid);
              }
            });
          } catch (_) { /* ignore */ }
        }));
      }
    } catch (_) { /* ignore about.csv issues */ }

    const section = gridSection || document.body;
    // Render cards by default
    renderCards(section, aggregated, coverMap);
    // Render table (hidden initially)
    if (tableEl && thead && tbody) {
      renderTableFromObjects(thead, tbody, aggregated);
      if (tableWrap) tableWrap.hidden = true;
    }

    // Toggle button to switch views
    const toggleBtn = document.getElementById('toggle-view');
    if (toggleBtn) {
      let mode = 'cards';
      const gridEl = document.getElementById('game-grid');
      const setMode = (m) => {
        mode = m;
        const showCards = (mode === 'cards');
        if (gridEl) {
          gridEl.hidden = !showCards;
          gridEl.style.display = showCards ? '' : 'none';
        }
        if (tableWrap) {
          tableWrap.hidden = showCards;
          tableWrap.style.display = showCards ? 'none' : '';
        }
        toggleBtn.textContent = showCards ? 'Switch to list view' : 'Switch to cards view';
      };
      setMode('cards');
      toggleBtn.addEventListener('click', () => setMode(mode === 'cards' ? 'table' : 'cards'));
    }

    if (status) status.textContent = `${aggregated.length} itens`;
  } catch (err) {
    console.error(err);
    if (status) status.textContent = 'Falha ao carregar os dados.';
  }
}

loadPage();
