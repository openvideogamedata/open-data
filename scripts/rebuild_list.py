#!/usr/bin/env python3
"""
Interactively list all lists under `list/`, let the user pick one by number,
then regenerate `aggregated-list.csv` and `about.csv` using the most recent CSV
for each source (history is preserved on disk, but only the latest file per
source is used).

Source detection:
- If `list/<list>/` has subfolders (e.g., `ign`, `gamesradar+`), each folder is
  treated as a source and the newest CSV inside is selected.
- Otherwise, top-level CSVs are grouped by the inferred source name from the
  pattern "<source> - <timestamp>.csv" and the newest CSV of each group is used.

Outputs:
- `aggregated-list.csv` columns: Position, Title, TotalScore, ListsAppeared
- `about.csv` columns: SourceName, SourceURL, SourceId, GeneratedCsvPath
  - SourceName/URL/Id are preserved from an existing `about.csv` when present;
    otherwise SourceName is set from the source and URL/Id left blank.
  - GeneratedCsvPath is written relative to the list directory (e.g.,
    `ign/ign - 2025-01-17_20-08-18.csv`).
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
    name: str                 # source name (e.g., 'ign', 'gamesradar+')
    csv_path: Path            # absolute path to the chosen CSV


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

    # Prefer files with a timestamp in the filename; otherwise fall back to mtime
    with_ts = [p for p in files if parse_timestamp_from_filename(p.name)]
    if with_ts:
        return max(with_ts, key=lambda p: parse_timestamp_from_filename(p.name))
    # Fallback to mtime when no timestamped files are found
    return max(files, key=lambda p: p.stat().st_mtime)


def pick_sources_for_list(list_dir: Path) -> List[SourcePick]:
    # Case 1: source-per-subfolder
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

    # Case 2: top-level CSVs (no subfolders)
    files = [p for p in list_dir.iterdir() if p.is_file() and p.suffix.lower() == '.csv']
    files = [p for p in files if p.name.lower() not in {'aggregated-list.csv', 'about.csv'}]
    groups: Dict[str, List[Path]] = defaultdict(list)
    for f in files:
        src = parse_source_from_filename(f.name)
        if not src:
            continue
        groups[src].append(f)
    for src_name, paths in groups.items():
        # Choose the most recent by timestamp, falling back to mtime
        with_ts = [p for p in paths if parse_timestamp_from_filename(p.name)]
        if with_ts:
            chosen = max(with_ts, key=lambda p: parse_timestamp_from_filename(p.name))
        else:
            chosen = max(paths, key=lambda p: p.stat().st_mtime)
        picks.append(SourcePick(name=src_name, csv_path=chosen))
    # Sort by name for deterministic output
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
        # Score may come as string/float/int - normalize to int
        score_val = r.get('Score', '0')
        try:
            score = int(float(score_val))
        except Exception:
            score = 0
        entry = agg.setdefault(title, {'TotalScore': 0, 'ListsAppeared': 0, 'ReleaseYear': None, 'SeenSources': set()})
        entry['TotalScore'] = int(entry['TotalScore']) + score
        # Count appearances per source file; caller ensures uniqueness per source
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
    # Add Position
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
    print('Available lists:')
    for i, p in enumerate(options, start=1):
        print(f"[{i}] {p.name}")
    while True:
        choice = input('Enter the list number (or q to quit): ').strip()
        if choice.lower() in {'q', 'quit', 'exit'}:
            return None
        if not choice.isdigit():
            print('Invalid input. Please try again.')
            continue
        idx = int(choice)
        if not (1 <= idx <= len(options)):
            print('Number out of range. Please try again.')
            continue
        return idx - 1


def main() -> None:
    root = script_root_list_dir()
    if not root.exists():
        print(f"Error: 'list' folder not found at {root}", file=sys.stderr)
        sys.exit(1)

    lists = list_available_lists(root)
    if not lists:
        print('No lists found.')
        sys.exit(0)

    idx = prompt_choice(lists)
    if idx is None:
        print('Cancelled.')
        return
    list_dir = lists[idx]

    picks = pick_sources_for_list(list_dir)
    if not picks:
        print(f"No sources found in {list_dir}.")
        return

    # Read rows from the chosen sources; mark the source filename for counting
    combined_rows: List[Dict[str, str]] = []
    for p in picks:
        for r in read_source_rows(p.csv_path):
            r = dict(r)
            r['SourceFile'] = p.csv_path.name
            combined_rows.append(r)

    agg_rows = aggregate_rows(combined_rows)
    agg_path = write_aggregated(list_dir, agg_rows)
    about_path = write_about(list_dir, picks)

    print(f"Written: {agg_path}")
    print(f"Written: {about_path}")


if __name__ == '__main__':
    main()

