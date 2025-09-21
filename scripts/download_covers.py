#!/usr/bin/env python3
"""
Download IGDB cover images into a single global folder so the same cover is
never downloaded twice, even if it appears in multiple lists.

Flow per list:
1) Build cover codes from the most recent source CSVs listed in about.csv.
2) For each code and requested size(s), ensure the file exists in the global
   covers/ directory (download once). No per-list copies are created.

Usage examples:
- All lists, both sizes:        python scripts/download_covers.py
- Single list:                  python scripts/download_covers.py --list best_games_of_all_time
- Only big size:                python scripts/download_covers.py --size big
- Overwrite existing files:     python scripts/download_covers.py --force
- Custom covers dir:            python scripts/download_covers.py --covers-dir covers
"""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import json
import os
import re
import sys
import urllib.request
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


IGDB_BASE = "https://images.igdb.com/igdb/image/upload"
TIMESTAMP_RE = re.compile(r" - (\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.csv$")


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def lists_root() -> Path:
    return repo_root() / 'list'


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
    with_ts = [p for p in files if parse_timestamp_from_filename(p.name)]
    if with_ts:
        return max(with_ts, key=lambda p: parse_timestamp_from_filename(p.name))
    return max(files, key=lambda p: p.stat().st_mtime)


def base_title(title: str) -> str:
    title = (title or '').strip()
    m = re.match(r"^(.*)\s+\((\d{4})\)$", title)
    return (m.group(1) if m else title).strip()


def build_cover_map_from_sources(list_dir: Path) -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    # Prefer per-source subfolders
    source_dirs = [p for p in list_dir.iterdir() if p.is_dir()]
    picks: List[Path] = []
    if source_dirs:
        for sdir in sorted(source_dirs, key=lambda p: p.name.lower()):
            latest = latest_csv_in_dir(sdir)
            if latest is not None:
                picks.append(latest)
    if not picks:
        files = [p for p in list_dir.iterdir() if p.is_file() and p.suffix.lower() == '.csv']
        files = [p for p in files if p.name.lower() not in {'aggregated-list.csv', 'about.csv'}]
        groups: Dict[str, List[Path]] = {}
        for f in files:
            stem = f.name[:-4]
            if ' - ' in stem:
                src = stem.split(' - ', 1)[0]
                groups.setdefault(src, []).append(f)
        for paths in groups.values():
            with_ts = [p for p in paths if parse_timestamp_from_filename(p.name)]
            chosen = max(with_ts, key=lambda p: parse_timestamp_from_filename(p.name)) if with_ts else max(paths, key=lambda p: p.stat().st_mtime)
            picks.append(chosen)
    for p in picks:
        with p.open('r', encoding='utf-8', newline='') as f:
            reader = csv.DictReader(f)
            for row in reader:
                title = base_title(row.get('Title', ''))
                code = (row.get('CoverImageId', '') or '').strip()
                if title and code and title not in mapping:
                    mapping[title] = code
    return mapping


def load_cover_map(list_dir: Path) -> Dict[str, str]:
    # Simpler: always build from the latest source CSVs
    return build_cover_map_from_sources(list_dir)


def build_url(code: str, size: str) -> str:
    variant = 't_cover_small' if size == 'small' else 't_cover_big'
    return f"{IGDB_BASE}/{variant}/{code}.jpg"


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def ensure_file(url: str, dest_path: Path, force: bool, timeout: int = 25) -> str:
    # Return: 'skipped' | 'downloaded'
    if dest_path.exists() and not force:
        return 'skipped'
    ensure_parent(dest_path)
    req = urllib.request.Request(url, headers={'User-Agent': 'open-data/cover-downloader'})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = resp.read()
    dest_path.write_bytes(data)
    return 'downloaded'


def tasks_for_list(codes: Iterable[str], sizes: List[str], covers_dir: Path) -> List[Tuple[str, Path]]:
    tasks: List[Tuple[str, Path]] = []
    for code in codes:
        for size in sizes:
            url = build_url(code, size)
            dest = covers_dir / f"{code}_{'small' if size=='small' else 'big'}.jpg"
            tasks.append((url, dest))
    return tasks


def process_list(list_dir: Path, sizes: List[str], force: bool, parallel: int, covers_dir: Path) -> Tuple[int, int]:
    covers = load_cover_map(list_dir)
    if not covers:
        return (0, 0)
    tasks = tasks_for_list(covers.values(), sizes, covers_dir)
    downloaded = skipped = 0
    if parallel <= 1:
        for url, dpath in tasks:
            try:
                res = ensure_file(url, dpath, force)
                if res == 'downloaded':
                    downloaded += 1
                else:
                    skipped += 1
            except Exception:
                pass
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=parallel) as ex:
            futs = {ex.submit(ensure_file, url, dpath, force): (url, dpath) for url, dpath in tasks}
            for fut in concurrent.futures.as_completed(futs):
                try:
                    res = fut.result()
                    if res == 'downloaded':
                        downloaded += 1
                    else:
                        skipped += 1
                except Exception:
                    pass
    return downloaded, skipped


def main() -> None:
    parser = argparse.ArgumentParser(description='Download IGDB covers with a global folder')
    parser.add_argument('--root', default=str(lists_root()), help='Root folder containing lists (default: list)')
    parser.add_argument('--list', dest='single', help='Single list name to process (folder name under root)')
    parser.add_argument('--size', choices=['big', 'small', 'both'], default='both', help='Cover size to download')
    parser.add_argument('--force', action='store_true', help='Overwrite existing files in covers dir')
    parser.add_argument('--parallel', type=int, default=12, help='Number of parallel downloads')
    parser.add_argument('--covers-dir', default=str(repo_root() / 'covers'), help='Global covers directory')
    args = parser.parse_args()

    root = Path(args.root)
    if not root.exists() or not root.is_dir():
        print(f"Invalid root: {root}", file=sys.stderr)
        sys.exit(1)

    sizes = ['small', 'big'] if args.size == 'both' else [args.size]
    covers_dir = Path(args.covers_dir)
    covers_dir.mkdir(parents=True, exist_ok=True)

    targets: List[Path] = []
    if args.single:
        targets = [root / args.single]
    else:
        targets = sorted([p for p in root.iterdir() if p.is_dir()], key=lambda p: p.name.lower())

    total_d = total_s = 0
    for list_dir in targets:
        if not list_dir.exists() or not list_dir.is_dir():
            print(f"Skip missing directory: {list_dir}")
            continue
        d, s = process_list(list_dir, sizes, args.force, args.parallel, covers_dir)
        total_d += d; total_s += s
        print(f"{list_dir.name}: downloaded {d}, skipped {s}")

    print(f"All done. Downloaded: {total_d}, skipped: {total_s}")


if __name__ == '__main__':
    main()
