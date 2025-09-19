// Lê ?name=<pasta> e renderiza aggregated-list.csv como tabela

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

// CSV parser simples com suporte a campos entre aspas
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
  // último campo/linha
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function renderTable(containerHead, containerBody, data) {
  if (!data || !data.length) return;
  const [header, ...rows] = data;
  const trHead = document.createElement('tr');
  header.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    trHead.appendChild(th);
  });
  containerHead.innerHTML = '';
  containerHead.appendChild(trHead);

  const frag = document.createDocumentFragment();
  rows.forEach(cols => {
    const tr = document.createElement('tr');
    cols.forEach((c, idx) => {
      const td = document.createElement('td');
      td.textContent = c;
      // alinhamento de números simples
      if (/^\d+(?:[\.,]\d+)?$/.test(c)) td.style.textAlign = 'right';
      if (idx === 0) td.style.fontWeight = '600';
      tr.appendChild(td);
    });
    frag.appendChild(tr);
  });
  containerBody.innerHTML = '';
  containerBody.appendChild(frag);
}

async function loadCSV() {
  const name = getParam('name');
  const pageTitle = document.getElementById('page-title');
  const status = document.getElementById('status');
  const table = document.getElementById('data-table');
  const thead = document.getElementById('table-head');
  const tbody = document.getElementById('table-body');
  const pathEl = document.getElementById('csv-path');

  if (!name) {
    status.textContent = 'Parâmetro ?name= não informado.';
    return;
  }
  pageTitle.textContent = humanize(name);

  const csvPath = `list/${encodeURIComponent(name)}/aggregated-list.csv`;
  pathEl.textContent = csvPath;
  try {
    const res = await fetch(csvPath, { headers: { 'Accept': 'text/csv, */*' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const data = parseCSV(text);
    renderTable(thead, tbody, data);
    status.textContent = `${data.length - 1} itens`;
    table.hidden = false;
  } catch (err) {
    console.error(err);
    status.textContent = 'Falha ao carregar o CSV. Verifique o caminho ou servidor local.';
  }
}

loadCSV();

