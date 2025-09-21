#!/usr/bin/env python3
"""
Lista interativamente as listas em `list/` e, após a seleção do usuário,
regera os arquivos `aggregated-list.csv` e `about.csv` usando sempre o CSV mais
recente de cada fonte (preservando histórico, mas usando só o último arquivo).

Detecção de fontes:
- Se houver subpastas em `list/<lista>/` (ex.: `ign`, `gamesradar+`), cada uma
  é uma fonte e o script escolhe o CSV mais recente dentro de cada subpasta.
- Caso contrário, o script agrupa os arquivos `*.csv` do topo por nome de
  fonte inferido pelo padrão "<fonte> - <timestamp>.csv" e escolhe o mais
  recente de cada grupo.

Formato de saída:
- `aggregated-list.csv` com colunas: Position,Title,TotalScore,ListsAppeared
- `about.csv` com colunas: SourceName,SourceURL,SourceId,GeneratedCsvPath
  - SourceName/URL/Id são preservados do `about.csv` anterior quando possível;
    se ausentes, preenche com o nome da fonte e campos vazios para URL e Id.
  - GeneratedCsvPath usa o caminho relativo dentro da pasta da lista
    (ex.: `ign/ign - 2025-01-17_20-08-18.csv`).
"""

from __future__ import annotations

import csv
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


TIMESTAMP_RE = re.compile(r" - (\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.csv$")


@dataclass
class SourcePick:
    name: str                 # nome da fonte (ex.: 'ign', 'gamesradar+')
    csv_path: Path            # caminho absoluto do csv escolhido


def script_root_list_dir() -> Path:
    return Path(__file__).resolve().parent.parent / 'list'


def parse_source_from_filename(filename: str) -> Optional[str]:
    name = Path(filename).name
    if not name.lower().endswith('.csv'):
        return None
    stem = name[:-4]
    if ' - ' in stem:
        return stem.split(' - ', 1)[0].strip()
    return None


def parse_timestamp_from_filename(filename: str) -> Optional[Tuple[int, int, int, int, int, int]]:
    m = TIMESTAMP_RE.search(filename)
    if not m:
        return None
    return tuple(int(x) for x in m.groups())  # type: ignore[return-value]


def latest_csv_in_dir(dir_path: Path) -> Optional[Path]:
    files = [p for p in dir_path.iterdir() if p.is_file() and p.suffix.lower() == '.csv']
    files = [p for p in files if p.name.lower() not in {'aggregated-list.csv', 'about.csv'}]
    if not files:
        return None

    def sort_key(p: Path):
        ts = parse_timestamp_from_filename(p.name)
        # Prioriza arquivos com timestamp; senão usa mtime
        return (1, ts) if ts else (0, tuple())  # primário: tem timestamp

    # Primeiro, filtre os que têm timestamp válido
    with_ts = [p for p in files if parse_timestamp_from_filename(p.name)]
    if with_ts:
        return max(with_ts, key=lambda p: parse_timestamp_from_filename(p.name))
    # fallback por mtime
    return max(files, key=lambda p: p.stat().st_mtime)


def pick_sources_for_list(list_dir: Path) -> List[SourcePick]:
    # Caso 1: subpastas por fonte
    source_dirs = [p for p in list_dir.iterdir() if p.is_dir()]
    picks: List[SourcePick] = []
    if source_dirs:
        for sdir in sorted(source_dirs, key=lambda p: p.name.lower()):
            latest = latest_csv_in_dir(sdir)
            if latest is None:
                continue
            picks.append(SourcePick(name=sdir.name, csv_path=latest))
        if picks:
            return picks

    # Caso 2: CSVs no topo (sem subpastas)
    files = [p for p in list_dir.iterdir() if p.is_file() and p.suffix.lower() == '.csv']
    files = [p for p in files if p.name.lower() not in {'aggregated-list.csv', 'about.csv'}]
    groups: Dict[str, List[Path]] = defaultdict(list)
    for f in files:
        src = parse_source_from_filename(f.name)
        if not src:
            continue
        groups[src].append(f)
    for src_name, paths in groups.items():
        # Escolher o mais recente por timestamp no nome; fallback mtime
        with_ts = [p for p in paths if parse_timestamp_from_filename(p.name)]
        if with_ts:
            chosen = max(with_ts, key=lambda p: parse_timestamp_from_filename(p.name))
        else:
            chosen = max(paths, key=lambda p: p.stat().st_mtime)
        picks.append(SourcePick(name=src_name, csv_path=chosen))
    # Ordena por nome para determinismo
    picks.sort(key=lambda x: x.name.lower())
    return picks


def read_source_rows(csv_path: Path) -> Iterable[Dict[str, str]]:
    with csv_path.open('r', encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        for r in reader:
            yield r


def aggregate_rows(rows: Iterable[Dict[str, str]]) -> List[Dict[str, object]]:
    agg: Dict[str, Dict[str, object]] = {}
    for r in rows:
        title = r.get('Title', '').strip()
        if not title:
            continue
        # Score pode vir como string/float/int — normaliza para int
        score_val = r.get('Score', '0')
        try:
            score = int(float(score_val))
        except Exception:
            score = 0
        entry = agg.setdefault(title, {'TotalScore': 0, 'ListsAppeared': 0, 'ReleaseYear': None, 'SeenSources': set()})
        entry['TotalScore'] = int(entry['TotalScore']) + score
        # Conta aparições por arquivo de origem; usa título como proxy de presença
        # O chamador garante unicidade por fonte.
        src_marker = r.get('SourceFile') or ''
        if src_marker not in entry['SeenSources']:
            entry['SeenSources'].add(src_marker)
            entry['ListsAppeared'] = int(entry['ListsAppeared']) + 1
        if entry['ReleaseYear'] is None:
            date = r.get('ReleaseDate', '')
            year = (date.split('-')[0] if date else '').strip()
            entry['ReleaseYear'] = year or ''

    out: List[Dict[str, object]] = []
    for title, data in agg.items():
        year = str(data.get('ReleaseYear') or '').strip()
        disp_title = f"{title} ({year})" if year else title
        out.append({
            'Title': disp_title,
            'TotalScore': int(data['TotalScore']),
            'ListsAppeared': int(data['ListsAppeared']),
        })
    out.sort(key=lambda x: x['TotalScore'], reverse=True)
    # Adiciona Position
    for i, row in enumerate(out, start=1):
        row['Position'] = i
    return out


def write_aggregated(list_dir: Path, agg_rows: List[Dict[str, object]]) -> Path:
    out_path = list_dir / 'aggregated-list.csv'
    with out_path.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['Position', 'Title', 'TotalScore', 'ListsAppeared'])
        writer.writeheader()
        for row in agg_rows:
            writer.writerow({
                'Position': row['Position'],
                'Title': row['Title'],
                'TotalScore': row['TotalScore'],
                'ListsAppeared': row['ListsAppeared'],
            })
    return out_path


def load_existing_about(list_dir: Path) -> Dict[str, Dict[str, str]]:
    about_path = list_dir / 'about.csv'
    if not about_path.exists():
        return {}
    out: Dict[str, Dict[str, str]] = {}
    with about_path.open('r', encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        for r in reader:
            name = r.get('SourceName', '').strip()
            if name:
                out[name.lower()] = r
    return out


def write_about(list_dir: Path, picks: List[SourcePick]) -> Path:
    prev = load_existing_about(list_dir)
    rows: List[Dict[str, str]] = []
    for p in picks:
        key = p.name.strip().lower()
        base = prev.get(key, {})
        rel_path = p.csv_path.relative_to(list_dir).as_posix()
        rows.append({
            'SourceName': base.get('SourceName', p.name),
            'SourceURL': base.get('SourceURL', ''),
            'SourceId': base.get('SourceId', ''),
            'GeneratedCsvPath': rel_path,
        })
    rows.sort(key=lambda r: r['SourceName'].lower())
    out_path = list_dir / 'about.csv'
    with out_path.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['SourceName', 'SourceURL', 'SourceId', 'GeneratedCsvPath'])
        writer.writeheader()
        for r in rows:
            writer.writerow(r)
    return out_path


def list_available_lists(root: Path) -> List[Path]:
    return sorted([p for p in root.iterdir() if p.is_dir()], key=lambda p: p.name.lower())


def prompt_choice(options: List[Path]) -> Optional[int]:
    print('Listas disponíveis:')
    for i, p in enumerate(options, start=1):
        print(f"[{i}] {p.name}")
    while True:
        choice = input('Digite o número da lista (ou q para sair): ').strip()
        if choice.lower() in {'q', 'quit', 'exit'}:
            return None
        if not choice.isdigit():
            print('Entrada inválida. Tente novamente.')
            continue
        idx = int(choice)
        if not (1 <= idx <= len(options)):
            print('Número fora do intervalo. Tente novamente.')
            continue
        return idx - 1


def main() -> None:
    root = script_root_list_dir()
    if not root.exists():
        print(f"Erro: pasta 'list' não encontrada em {root}", file=sys.stderr)
        sys.exit(1)

    lists = list_available_lists(root)
    if not lists:
        print('Nenhuma lista encontrada.')
        sys.exit(0)

    idx = prompt_choice(lists)
    if idx is None:
        print('Cancelado.')
        return
    list_dir = lists[idx]

    picks = pick_sources_for_list(list_dir)
    if not picks:
        print(f"Nenhuma fonte encontrada em {list_dir}.")
        return

    # Lê linhas das fontes escolhidas; anota o nome do arquivo como marcador
    combined_rows: List[Dict[str, str]] = []
    for p in picks:
        for r in read_source_rows(p.csv_path):
            r = dict(r)
            r['SourceFile'] = p.csv_path.name
            combined_rows.append(r)

    agg_rows = aggregate_rows(combined_rows)
    agg_path = write_aggregated(list_dir, agg_rows)
    about_path = write_about(list_dir, picks)

    print(f"Gerado: {agg_path}")
    print(f"Gerado: {about_path}")


if __name__ == '__main__':
    main()

