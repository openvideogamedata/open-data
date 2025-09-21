// Descobre subpastas em `list/`, agrupa em categorias e cria links.// If a list name is provided in the query string, redirect to the cards view(function redirectToCardsIfNeeded() {  try {    const params = new URLSearchParams(window.location.search);    const name = params.get('name');    if (name) {      const target = `list-cards.html?name=${encodeURIComponent(name)}`;      window.location.replace(target);    }  } catch (_) { /* ignore */ }})();function humanize(name) {  return name    .replace(/_/g, ' ')    .replace(/\s+/g, ' ')    .trim()    .replace(/\b\w/g, c => c.toUpperCase());}function categorize(name) {  if (name === 'best_games_of_all_time') return 'Geral';  if (/^most_anticipated_games_of_/i.test(name)) return 'Anticipados';  if (/^best_.*_of_\d{4}$/i.test(name)) return 'Anuais';  if (/^best_games_of_the_/i.test(name) ||      /(pc|mobile|vr|steam_deck)/i.test(name) ||      /best_games_of_(master_system|meta_quest_2|meta_quest_3)$/i.test(name)) {    return 'Plataformas';  }  if (/(action_adventure|fighting|grand_strategy|rpg|rts|survival_horror|walking_simulator|narrative|open[-_]?world|indie)/i.test(name)) {    return 'GÃƒÂªneros';  }  return 'Outros';}
// --- Mini cover helpers for home list items ---
function csvParse(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  while (i < text.length) {
    const ch = text[i++];
    if (inQuotes) {
      if (ch === '"') { if (text[i] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else { field += ch; }
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

function stripYear(title) {
  const m = /^(.*)\s+\((\d{4})\)$/.exec(title || '');
  return (m ? m[1] : (title || '')).trim();
}

function coverUrlSmall(code) {
  return `https://images.igdb.com/igdb/image/upload/t_cover_small/${code}.jpg`;
}

async function enrichMiniCovers(name, container, limit=4) {
  try {
    const aggUrl = `list/${encodeURIComponent(name)}/aggregated-list.csv`;
    const aggRes = await fetch(aggUrl, { headers: { 'Accept': 'text/csv, */*' } });
    if (!aggRes.ok) return;
    const agg = rowsToObjects(csvParse(await aggRes.text()));
    const top = agg.slice(0, limit).map(r => stripYear(r.Title || ''));
    if (!top.length) return;

    const aboutUrl = `list/${encodeURIComponent(name)}/about.csv`;
    const aboutRes = await fetch(aboutUrl, { headers: { 'Accept': 'text/csv, */*' } });
    if (!aboutRes.ok) return;
    const about = rowsToObjects(csvParse(await aboutRes.text()));
    const relPaths = about.map(r => r.GeneratedCsvPath).filter(Boolean);

    const coverMap = new Map();
    for (const rel of relPaths) {
      try {
        const parts = rel.split('/').map(encodeURIComponent).join('/');
        let url = `list/${encodeURIComponent(name)}/${parts}`;
        let res = await fetch(url, { headers: { 'Accept': 'text/csv, */*' } });
        if (!res.ok && !rel.includes('/')) {
          const dashIdx = rel.indexOf(' - ');
          if (dashIdx > 0) {
            const srcFolder = rel.slice(0, dashIdx);
            const url2 = `list/${encodeURIComponent(name)}/${encodeURIComponent(srcFolder)}/${encodeURIComponent(rel)}`;
            const r2 = await fetch(url2, { headers: { 'Accept': 'text/csv, */*' } });
            if (r2.ok) res = r2; else continue;
          } else continue;
        }
        const rows = rowsToObjects(csvParse(await res.text()));
        rows.forEach(obj => {
          const t = (obj.Title || '').trim();
          const cid = (obj.CoverImageId || '').trim();
          const key = stripYear(t);
          if (t && cid && top.includes(key) && !coverMap.has(key)) {
            coverMap.set(key, cid);
          }
        });
        if ([...coverMap.keys()].length >= top.length) break;
      } catch (_) { /* ignore */ }
    }

    container.innerHTML = '';
    top.forEach(t => {
      const code = coverMap.get(t);
      if (!code) return;
      const img = document.createElement('img');
      img.src = coverUrlSmall(code);
      img.alt = t; img.title = t;
      img.width = 56; img.height = 76;
      img.style.borderRadius = '8px';
      img.style.objectFit = 'cover';
      container.appendChild(img);
    });
  } catch (_) { /* ignore */ }
}async function fetchDirectoryListing(path) {  const res = await fetch(path, { headers: { 'Accept': 'text/html, */*' } });  if (!res.ok) throw new Error(`Falha ao listar ${path}: ${res.status}`);  const text = await res.text();  const doc = new DOMParser().parseFromString(text, 'text/html');  const anchors = Array.from(doc.querySelectorAll('a[href]'));  const dirs = anchors    .map(a => a.getAttribute('href'))    .filter(h => !!h)    .filter(h => h.endsWith('/'))    .map(h => decodeURIComponent(h))    .filter(h => h !== '/' && h !== '../' && h !== './')    .map(h => h.replace(/\/$/, ''));  const names = dirs.map(h => h.split('/').filter(Boolean).pop()).filter(Boolean);  return Array.from(new Set(names));}async function fetchManifestFallback(path) {  const base = path.replace(/\/$/, '');  const candidates = ['/_manifest.json', '/manifest.json'];  let lastErr = null;  for (const suffix of candidates) {    try {      const url = base + suffix;      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }      const json = await res.json();      if (!Array.isArray(json?.lists)) { lastErr = new Error('Manifesto invÃƒÂ¡lido'); continue; }      return json.lists;    } catch (e) {      lastErr = e;    }  }  throw lastErr || new Error('Manifesto nÃƒÂ£o encontrado');}async function loadLists() {  const status = document.getElementById('status') || document.getElementById('h-status');  const groupsEl = document.getElementById('groups');  const listEl = document.getElementById('lists');  const summaryEl = document.getElementById('summary');  const searchEl = document.getElementById('search');  try {    let names = [];    // GitHub Pages nÃƒÂ£o lista diretÃƒÂ³rios; tente primeiro o manifesto    try {      names = await fetchManifestFallback('list/');    } catch (_) {      // Em dev local, diretÃƒÂ³rio pode estar disponÃƒÂ­vel      names = await fetchDirectoryListing('list/');    }    if (!names.length) throw new Error('Nenhuma lista encontrada');    status.textContent = '';    summaryEl.textContent = `Encontradas ${names.length} listas`;    // Se existir contÃƒÂªiner de grupos, renderiza categorias; senÃƒÂ£o, renderiza lista ÃƒÂºnica    const frag = document.createDocumentFragment();    if (groupsEl) {      const order = ['Geral', 'GÃƒÂªneros', 'Plataformas', 'Anuais', 'Anticipados', 'Outros'];      const groups = new Map(order.map(k => [k, []]));      names.sort((a,b) => a.localeCompare(b)).forEach(name => {        const cat = categorize(name);        if (!groups.has(cat)) groups.set(cat, []);        groups.get(cat).push(name);      });      for (const [cat, items] of groups.entries()) {        if (!items.length) continue;        const section = document.createElement('section');        section.className = 'group';        section.dataset.group = cat;        const h2 = document.createElement('h2');        h2.className = 'group-title';        h2.textContent = cat + ' ';        const smallCount = document.createElement('small');        smallCount.textContent = `(${items.length})`;        h2.appendChild(smallCount);        const ul = document.createElement('ul');        ul.className = 'list-grid group-grid';        items.forEach(name => {
  const li = document.createElement('li');
  li.className = 'list-item';
  li.dataset.name = name.toLowerCase();
  li.dataset.group = cat;
  const a = document.createElement('a');
  a.href = `list-cards.html?name=${encodeURIComponent(name)}`;
  a.innerHTML = `<span class="emoji">ï¿½Y"'</span>${humanize(name)}`;
  const small = document.createElement('small');
  small.textContent = `list/${name}/aggregated-list.csv`;
  li.appendChild(a);
  li.appendChild(small);
  const mini = document.createElement('div');
  mini.className = 'mini-covers';
  mini.style.display = 'flex';
  mini.style.gap = '6px';
  mini.style.marginTop = '8px';
  li.appendChild(mini);
  enrichMiniCovers(name, mini, 4);ul.appendChild(li);        });        section.appendChild(h2);        section.appendChild(ul);        frag.appendChild(section);      }      groupsEl.innerHTML = '';      groupsEl.appendChild(frag);      groupsEl.classList.add('loaded');    } else if (listEl) {      names.sort((a,b) => a.localeCompare(b)).forEach(name => {
  const li = document.createElement('li');
  li.className = 'list-item';
  li.dataset.name = name.toLowerCase();
  const a = document.createElement('a');
  a.href = `list-cards.html?name=${encodeURIComponent(name)}`;
  a.innerHTML = `<span class="emoji">�Y"'</span>${humanize(name)}`;
  const small = document.createElement('small');
  small.textContent = `list/${name}/aggregated-list.csv`;
  li.appendChild(a);
  li.appendChild(small);
  const mini = document.createElement('div');
  mini.className = 'mini-covers';
  mini.style.display = 'flex';
  mini.style.gap = '6px';
  mini.style.marginTop = '8px';
  li.appendChild(mini);
  enrichMiniCovers(name, mini, 4);
  frag.appendChild(li);
});      listEl.innerHTML = '';      listEl.appendChild(frag);    }    // Filtro de busca por texto e atualizaÃƒÂ§ÃƒÂ£o de contadores por grupo    if (searchEl) {      const total = names.length;      const doFilter = () => {        const q = searchEl.value.trim().toLowerCase();        let visible = 0;        const scope = groupsEl || listEl;        if (!scope) return;        scope.querySelectorAll('.list-item').forEach(li => {          const hit = !q || li.dataset.name.includes(q);          li.style.display = hit ? '' : 'none';          if (hit) visible++;        });        if (groupsEl) {          groupsEl.querySelectorAll('.group').forEach(sec => {            const items = Array.from(sec.querySelectorAll('.list-item'));            const visibleInSec = items.filter(li => li.style.display !== 'none').length;            sec.style.display = visibleInSec ? '' : 'none';            const countEl = sec.querySelector('.group-title small');            if (countEl) countEl.textContent = `(${visibleInSec}/${items.length})`;          });        }        summaryEl.textContent = `${visible} de ${total} listas`;      };      searchEl.addEventListener('input', doFilter);      doFilter();    }  } catch (err) {    console.error(err);    const msg = 'NÃƒÂ£o foi possÃƒÂ­vel carregar as listas. ' +      'Em hospedagens estÃƒÂ¡ticas (GitHub Pages), adicione ".nojekyll" na raiz e ' +      'gere um manifesto em list/_manifest.json (ou list/manifest.json).';    if (groupsEl) {      groupsEl.classList.add('loaded');      groupsEl.innerHTML = '';    }    document.getElementById('status').textContent = msg;  }}loadLists();