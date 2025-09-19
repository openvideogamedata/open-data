// Gera list/_manifest.json com os nomes das subpastas que contêm aggregated-list.csv
// Uso:
//   node scripts/generate-manifest.mjs

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const LIST_DIR = path.join(ROOT, 'list');

async function main() {
  const entries = await fs.readdir(LIST_DIR, { withFileTypes: true });
  const lists = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const sub = path.join(LIST_DIR, e.name, 'aggregated-list.csv');
    try {
      await fs.access(sub);
      lists.push(e.name);
    } catch {}
  }
  lists.sort((a,b) => a.localeCompare(b));
  const out = { generatedAt: new Date().toISOString(), lists };
  const outPath = path.join(LIST_DIR, '_manifest.json');
  await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Manifesto escrito em ${path.relative(ROOT, outPath)} com ${lists.length} listas.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

