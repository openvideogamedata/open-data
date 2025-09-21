// Home page script
// - Lists all available lists under `list/`
// - Shows mini covers for the top 4 games (local covers with external fallback)
// - Shows source count (how many source CSVs in about.csv)
// - Redirects to cards page when `?name=` is provided

// ==========================
// Utilities
// ==========================
function getQueryParam(paramName) {
  const params = new URLSearchParams(location.search);
  return params.get(paramName) || '';
}

function humanizeListName(listFolderName) {
  return listFolderName
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = '';
  let row = [];
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i++];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
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

function convertRowsToObjects(rows) {
  if (!rows || !rows.length) return [];
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((col, i) => [col, r[i] ?? ''])));
}

function removeYearSuffix(title) {
  const match = /^(.*)\s+\((\d{4})\)$/.exec(title || '');
  return (match ? match[1] : (title || '')).trim();
}

function buildIgdbSmallCoverUrl(coverCode) {
  return `https://images.igdb.com/igdb/image/upload/t_cover_small/${coverCode}.jpg`;
}

// ==========================
// Redirect to cards when `?name=` is provided
// ==========================
(function redirectToCardsIfNeeded() {
  try {
    const listName = getQueryParam('name');
    if (listName) {
      location.replace(`list-cards.html?name=${encodeURIComponent(listName)}`);
    }
  } catch (_) { /* ignore */ }
})();

// ==========================
// Data loading
// ==========================
async function fetchCsvAsObjects(url) {
  const response = await fetch(url, { headers: { 'Accept': 'text/csv, */*' } });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return convertRowsToObjects(parseCsv(await response.text()));
}

async function loadListNames() {
  for (const manifestUrl of ['list/_manifest.json', 'list/manifest.json']) {
    try {
      const response = await fetch(manifestUrl, { headers: { 'Accept': 'application/json' } });
      if (response.ok) {
        const json = await response.json();
        if (json && Array.isArray(json.lists)) return json.lists;
      }
    } catch (_) { /* ignore and fall back */ }
  }
  try {
    const response = await fetch('list/', { headers: { 'Accept': 'text/html, */*' } });
    if (!response.ok) throw new Error('Cannot list directory');
    const html = await response.text();
    const dom = new DOMParser().parseFromString(html, 'text/html');
    const names = Array.from(dom.querySelectorAll('a[href]'))
      .map((a) => a.getAttribute('href'))
      .filter(Boolean)
      .filter((href) => href.endsWith('/'))
      .map((href) => decodeURIComponent(href))
      .map((href) => href.replace(/\/$/, ''))
      .map((href) => href.split('/').filter(Boolean).pop())
      .filter(Boolean);
    return Array.from(new Set(names));
  } catch (_) {
    return [];
  }
}

async function loadSourceCount(listName) {
  try {
    const aboutUrl = `list/${encodeURIComponent(listName)}/about.csv`;
    const response = await fetch(aboutUrl, { headers: { 'Accept': 'text/csv, */*' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const rows = parseCsv(await response.text());
    return Math.max(0, rows.length - 1);
  } catch (_) {
    return null;
  }
}

async function loadTopCoverCodes(listName, limit = 4) {
  const aggregatedRows = await fetchCsvAsObjects(`list/${encodeURIComponent(listName)}/aggregated-list.csv`);
  const desiredTitles = aggregatedRows.slice(0, limit).map((o) => removeYearSuffix(o.Title || ''));
  if (!desiredTitles.length) return new Map();

  let aboutRows = [];
  try { aboutRows = await fetchCsvAsObjects(`list/${encodeURIComponent(listName)}/about.csv`); } catch (_) { return new Map(); }
  const relativePaths = aboutRows.map((r) => r.GeneratedCsvPath).filter(Boolean);

  const codeByTitle = new Map();
  for (const rel of relativePaths) {
    if (codeByTitle.size >= desiredTitles.length) break;
    const relStr = String(rel);
    const candidates = [
      `list/${encodeURIComponent(listName)}/${relStr.split('/').map(encodeURIComponent).join('/')}`,
    ];
    if (!relStr.includes('/')) {
      const dashIndex = relStr.indexOf(' - ');
      if (dashIndex > 0) {
        const sourceFolder = relStr.slice(0, dashIndex);
        candidates.push(`list/${encodeURIComponent(listName)}/${encodeURIComponent(sourceFolder)}/${encodeURIComponent(relStr)}`);
      }
    }
    for (const url of candidates) {
      if (codeByTitle.size >= desiredTitles.length) break;
      try {
        const rows = await fetchCsvAsObjects(url);
        rows.forEach((obj) => {
          const titleKey = removeYearSuffix(obj.Title || '');
          const coverCode = (obj.CoverImageId || '').trim();
          if (titleKey && coverCode && desiredTitles.includes(titleKey) && !codeByTitle.has(titleKey)) {
            codeByTitle.set(titleKey, coverCode);
          }
        });
      } catch (_) { /* try next candidate */ }
    }
  }
  return codeByTitle;
}

// ==========================
// Rendering
// ==========================
function createGroupedListItem(listName, categoryName) {
  const listItem = document.createElement('li');
  listItem.className = 'list-item';
  listItem.dataset.name = listName.toLowerCase();
  listItem.dataset.group = categoryName;

  const anchor = document.createElement('a');
  anchor.href = `list-cards.html?name=${encodeURIComponent(listName)}`;
  anchor.textContent = humanizeListName(listName);

  const pathInfo = document.createElement('small');
  pathInfo.textContent = `list/${listName}/aggregated-list.csv`;

  const sourceCountInfo = document.createElement('small');
  sourceCountInfo.className = 'source-count';
  sourceCountInfo.textContent = 'Sources: ...';

  const miniCovers = document.createElement('div');
  miniCovers.className = 'mini-covers';
  miniCovers.style.display = 'flex';
  miniCovers.style.gap = '6px';
  miniCovers.style.marginTop = '8px';

  listItem.appendChild(anchor);
  listItem.appendChild(pathInfo);
  listItem.appendChild(sourceCountInfo);
  listItem.appendChild(miniCovers);

  (async () => {
    const count = await loadSourceCount(listName);
    sourceCountInfo.textContent = count == null ? 'Sources: -' : `Sources: ${count}`;
    const coverCodes = await loadTopCoverCodes(listName, 4);
    miniCovers.innerHTML = '';
    for (const [title, code] of coverCodes.entries()) {
      const img = document.createElement('img');
      img.src = `covers/${code}_small.jpg`;
      img.onerror = function () { this.onerror = null; this.src = buildIgdbSmallCoverUrl(code); };
      img.alt = title;
      img.title = title;
      img.width = 56;
      img.height = 76;
      img.style.borderRadius = '8px';
      img.style.objectFit = 'cover';
      miniCovers.appendChild(img);
    }
  })();

  return listItem;
}

function createSimpleListItem(listName) {
  const listItem = document.createElement('li');
  listItem.className = 'list-item';
  listItem.dataset.name = listName.toLowerCase();

  const anchor = document.createElement('a');
  anchor.href = `list-cards.html?name=${encodeURIComponent(listName)}`;
  anchor.textContent = humanizeListName(listName);

  const pathInfo = document.createElement('small');
  pathInfo.textContent = `list/${listName}/aggregated-list.csv`;

  const sourceCountInfo = document.createElement('small');
  sourceCountInfo.className = 'source-count';
  sourceCountInfo.textContent = 'Sources: ...';

  listItem.appendChild(anchor);
  listItem.appendChild(pathInfo);
  listItem.appendChild(sourceCountInfo);

  (async () => {
    const count = await loadSourceCount(listName);
    sourceCountInfo.textContent = count == null ? 'Sources: -' : `Sources: ${count}`;
  })();

  return listItem;
}

function categorizeListName(listFolderName) {
  if (listFolderName === 'best_games_of_all_time') return 'Geral';
  if (/^most_anticipated_games_of_/i.test(listFolderName)) return 'Anticipados';
  if (/^best_.*_of_\d{4}$/i.test(listFolderName)) return 'Anuais';
  if (/^best_games_of_the_/i.test(listFolderName) || /(pc|mobile|vr|steam_deck)/i.test(listFolderName) || /best_games_of_(master_system|meta_quest_2|meta_quest_3)$/i.test(listFolderName)) return 'Plataformas';
  if (/(action_adventure|fighting|grand_strategy|rpg|rts|survival_horror|walking_simulator|narrative|open[-_]?world|indie)/i.test(listFolderName)) return 'Generos';
  return 'Outros';
}

// ==========================
// Page flow
// ==========================
async function initializeHomePage() {
  const statusEl = document.getElementById('h-status');
  const groupsContainer = document.getElementById('groups');
  const listContainer = document.getElementById('lists');
  const summaryEl = document.getElementById('summary');
  const searchInput = document.getElementById('search');
  try {
    let listNames = await loadListNames();
    if (!listNames.length) throw new Error('Nenhuma lista encontrada');
    listNames = listNames.sort((a, b) => a.localeCompare(b));
    statusEl.textContent = '';
    summaryEl.textContent = `Encontradas ${listNames.length} listas`;

    if (groupsContainer) {
      const categoryOrder = ['Geral', 'Generos', 'Plataformas', 'Anuais', 'Anticipados', 'Outros'];
      const categoryMap = new Map(categoryOrder.map((k) => [k, []]));
      listNames.forEach((name) => { const cat = categorizeListName(name); if (!categoryMap.has(cat)) categoryMap.set(cat, []); categoryMap.get(cat).push(name); });
      const fragment = document.createDocumentFragment();
      for (const [category, items] of categoryMap.entries()) {
        if (!items.length) continue;
        const section = document.createElement('section'); section.className = 'group'; section.dataset.group = category;
        const h2 = document.createElement('h2'); h2.className = 'group-title'; h2.textContent = category + ' ';
        const smallCount = document.createElement('small'); smallCount.textContent = `(${items.length})`; h2.appendChild(smallCount);
        const ul = document.createElement('ul'); ul.className = 'list-grid group-grid';
        items.forEach((name) => ul.appendChild(createGroupedListItem(name, category)));
        section.appendChild(h2); section.appendChild(ul); fragment.appendChild(section);
      }
      groupsContainer.innerHTML = '';
      groupsContainer.appendChild(fragment);
      groupsContainer.classList.add('loaded');
    } else if (listContainer) {
      const fragment = document.createDocumentFragment();
      listNames.forEach((name) => fragment.appendChild(createSimpleListItem(name)));
      listContainer.innerHTML = '';
      listContainer.appendChild(fragment);
    }

    if (searchInput) {
      const total = listNames.length;
      const doFilter = () => {
        const query = searchInput.value.trim().toLowerCase();
        let visible = 0;
        const scope = groupsContainer || listContainer;
        if (!scope) return;
        scope.querySelectorAll('.list-item').forEach((li) => {
          const hit = !query || li.dataset.name.includes(query);
          li.style.display = hit ? '' : 'none';
          if (hit) visible++;
        });
        if (groupsContainer) {
          groupsContainer.querySelectorAll('.group').forEach((sec) => {
            const items = Array.from(sec.querySelectorAll('.list-item'));
            const visibleInSection = items.filter((li) => li.style.display !== 'none').length;
            sec.style.display = visibleInSection ? '' : 'none';
            const countEl = sec.querySelector('.group-title small');
            if (countEl) countEl.textContent = `(${visibleInSection}/${items.length})`;
          });
        }
        summaryEl.textContent = `${visible} de ${total} listas`;
      };
      searchInput.addEventListener('input', doFilter);
      doFilter();
    }
  } catch (err) {
    console.error(err);
    if (groupsContainer) { groupsContainer.classList.add('loaded'); groupsContainer.innerHTML = ''; }
    const msg = 'Nao foi possivel carregar as listas. Em hospedagens estaticas (GitHub Pages), adicione ".nojekyll" na raiz e gere um manifesto em list/_manifest.json (ou list/manifest.json).';
    document.getElementById('h-status').textContent = msg;
  }
}

initializeHomePage();

