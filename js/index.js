// Descobre subpastas em `list/`, agrupa em categorias e cria links.

function humanize(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function categorize(name) {
  if (name === 'best_games_of_all_time') return 'Geral';
  if (/^most_anticipated_games_of_/i.test(name)) return 'Anticipados';
  if (/^best_.*_of_\d{4}$/i.test(name)) return 'Anuais';
  if (/^best_games_of_the_/i.test(name) ||
      /(pc|mobile|vr|steam_deck)/i.test(name) ||
      /best_games_of_(master_system|meta_quest_2|meta_quest_3)$/i.test(name)) {
    return 'Plataformas';
  }
  if (/(action_adventure|fighting|grand_strategy|rpg|rts|survival_horror|walking_simulator|narrative|open[-_]?world|indie)/i.test(name)) {
    return 'Gêneros';
  }
  return 'Outros';
}

async function fetchDirectoryListing(path) {
  const res = await fetch(path, { headers: { 'Accept': 'text/html, */*' } });
  if (!res.ok) throw new Error(`Falha ao listar ${path}: ${res.status}`);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const anchors = Array.from(doc.querySelectorAll('a[href]'));
  const dirs = anchors
    .map(a => a.getAttribute('href'))
    .filter(h => !!h)
    .filter(h => h.endsWith('/'))
    .map(h => decodeURIComponent(h))
    .filter(h => h !== '/' && h !== '../' && h !== './')
    .map(h => h.replace(/\/$/, ''));
  const names = dirs.map(h => h.split('/').filter(Boolean).pop()).filter(Boolean);
  return Array.from(new Set(names));
}

async function fetchManifestFallback(path) {
  const base = path.replace(/\/$/, '');
  const candidates = ['/_manifest.json', '/manifest.json'];
  let lastErr = null;
  for (const suffix of candidates) {
    try {
      const url = base + suffix;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      const json = await res.json();
      if (!Array.isArray(json?.lists)) { lastErr = new Error('Manifesto inválido'); continue; }
      return json.lists;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Manifesto não encontrado');
}

async function loadLists() {
  const status = document.getElementById('status');
  const groupsEl = document.getElementById('groups');
  const summaryEl = document.getElementById('summary');
  const searchEl = document.getElementById('search');
  try {
    let names = [];
    try {
      names = await fetchDirectoryListing('list/');
    } catch (_) {
      names = await fetchManifestFallback('list/');
    }

    if (!names.length) throw new Error('Nenhuma lista encontrada');

    status.textContent = '';
    summaryEl.textContent = `Encontradas ${names.length} listas`;

    const order = ['Geral', 'Gêneros', 'Plataformas', 'Anuais', 'Anticipados', 'Outros'];
    const groups = new Map(order.map(k => [k, []]));
    names.sort((a,b) => a.localeCompare(b)).forEach(name => {
      const cat = categorize(name);
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(name);
    });

    const frag = document.createDocumentFragment();
    for (const [cat, items] of groups.entries()) {
      if (!items.length) continue;
      const section = document.createElement('section');
      section.className = 'group';
      section.dataset.group = cat;

      const h2 = document.createElement('h2');
      h2.className = 'group-title';
      h2.textContent = cat + ' ';
      const smallCount = document.createElement('small');
      smallCount.textContent = `(${items.length})`;
      h2.appendChild(smallCount);

      const ul = document.createElement('ul');
      ul.className = 'list-grid group-grid';

      items.forEach(name => {
        const li = document.createElement('li');
        li.className = 'list-item';
        li.dataset.name = name.toLowerCase();
        li.dataset.group = cat;

        const a = document.createElement('a');
        a.href = `list.html?name=${encodeURIComponent(name)}`;
        a.innerHTML = `<span class="emoji">📂</span>${humanize(name)}`;

        const small = document.createElement('small');
        small.textContent = `list/${name}/aggregated-list.csv`;

        li.appendChild(a);
        li.appendChild(small);
        ul.appendChild(li);
      });

      section.appendChild(h2);
      section.appendChild(ul);
      frag.appendChild(section);
    }
    groupsEl.innerHTML = '';
    groupsEl.appendChild(frag);

    // Filtro de busca por texto e atualização de contadores por grupo
    if (searchEl) {
      const total = names.length;
      const doFilter = () => {
        const q = searchEl.value.trim().toLowerCase();
        let visible = 0;
        groupsEl.querySelectorAll('.list-item').forEach(li => {
          const hit = !q || li.dataset.name.includes(q);
          li.style.display = hit ? '' : 'none';
          if (hit) visible++;
        });
        groupsEl.querySelectorAll('.group').forEach(sec => {
          const items = Array.from(sec.querySelectorAll('.list-item'));
          const visibleInSec = items.filter(li => li.style.display !== 'none').length;
          sec.style.display = visibleInSec ? '' : 'none';
          const countEl = sec.querySelector('.group-title small');
          if (countEl) countEl.textContent = `(${visibleInSec}/${items.length})`;
        });
        summaryEl.textContent = `${visible} de ${total} listas`;
      };
      searchEl.addEventListener('input', doFilter);
      doFilter();
    }
  } catch (err) {
    console.error(err);
    const msg = 'Não foi possível carregar as listas. ' +
      'Em hospedagens estáticas (GitHub Pages), adicione ".nojekyll" na raiz e ' +
      'gere um manifesto em list/_manifest.json (ou list/manifest.json).';
    document.getElementById('status').textContent = msg;
  }
}

loadLists();

