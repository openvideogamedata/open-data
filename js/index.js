// Descobre subpastas em `list/` dinamicamente e cria links.

function humanize(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

async function fetchDirectoryListing(path) {
  const res = await fetch(path, { headers: { 'Accept': 'text/html, */*' } });
  if (!res.ok) throw new Error(`Falha ao listar ${path}: ${res.status}`);
  const text = await res.text();
  // Tenta extrair <a href="subdir/"> de um index HTML (ex.: python -m http.server)
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const anchors = Array.from(doc.querySelectorAll('a[href]'));
  const dirs = anchors
    .map(a => a.getAttribute('href'))
    .filter(h => !!h)
    .filter(h => h.endsWith('/'))
    .map(h => decodeURIComponent(h))
    .filter(h => h !== '/' && h !== '../' && h !== './')
    .map(h => h.replace(/\/$/, ''));

  // Normaliza: se links são absolutos, mantém apenas o nome final.
  const names = dirs.map(h => h.split('/').filter(Boolean).pop()).filter(Boolean);
  // Remove duplicados
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
  const listEl = document.getElementById('lists');
  try {
    let names = [];
    try {
      names = await fetchDirectoryListing('list/');
    } catch (_) {
      // se não houver index de diretório, tenta manifesto
      names = await fetchManifestFallback('list/');
    }

    // só mantém diretórios que têm aggregated-list.csv (heurística: confiar no padrão)
    // Como não podemos testar cada um sem custo, deixamos links diretos.
    if (!names.length) throw new Error('Nenhuma lista encontrada');

    status.textContent = `Encontradas ${names.length} listas`;
    const frag = document.createDocumentFragment();
    names.sort((a,b) => a.localeCompare(b)).forEach(name => {
      const li = document.createElement('li');
      li.className = 'list-item';

      const a = document.createElement('a');
      a.href = `list.html?name=${encodeURIComponent(name)}`;
      a.textContent = humanize(name);

      const small = document.createElement('small');
      small.textContent = `list/${name}/aggregated-list.csv`;

      li.appendChild(a);
      li.appendChild(small);
      frag.appendChild(li);
    });
    listEl.innerHTML = '';
    listEl.appendChild(frag);
  } catch (err) {
    console.error(err);
    const msg = 'Não foi possível carregar as listas. ' +
      'Em hospedagens estáticas (GitHub Pages), adicione ".nojekyll" na raiz e ' +
      'gere um manifesto em list/_manifest.json (ou list/manifest.json).';
    document.getElementById('status').textContent = msg;
  }
}

loadLists();
