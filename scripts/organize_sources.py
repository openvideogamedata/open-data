#!/usr/bin/env python3
"""
Organiza os arquivos .csv de fontes dentro de cada pasta de lista.

Para cada pasta em `list/`, cria uma subpasta com o nome da fonte (extraido do
nome do arquivo antes de " - ") e move os .csv de fontes para dentro dela.
Mantem "aggregated-list.csv" e "about.csv" no nivel raiz da lista.

Exemplo:
  list/best_games_of_2024/ign - 2025-01-17_20-08-18.csv
vira
  list/best_games_of_2024/ign/ign - 2025-01-17_20-08-18.csv

Uso:
  # Rodando na raiz do repo
  python scripts/organize_sources.py --dry-run
  python scripts/organize_sources.py

  # Ou, de dentro da pasta scripts/
  python organize_sources.py --dry-run
  python organize_sources.py
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


INVALID_WINDOWS_CHARS = '<>:"/\\|?*'


def sanitize_dirname(name: str) -> str:
    """Sanitiza o nome da pasta da fonte para ser valido no Windows.

    - Substitui caracteres invalidos por '_'
    - Remove espacos/pontos no fim
    - Evita nomes reservados (CON, PRN, etc.)
    """
    sanitized = ''.join('_' if c in INVALID_WINDOWS_CHARS else c for c in name).strip()
    sanitized = sanitized.rstrip(' .')

    reserved = {
        'CON', 'PRN', 'AUX', 'NUL',
        'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
        'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
    }
    if sanitized.upper() in reserved:
        sanitized = sanitized + '_'
    return sanitized or 'unknown_source'


def parse_source_from_filename(filename: str) -> str | None:
    """Extrai o nome da fonte a partir do padrao "<fonte> - <resto>.csv".

    Retorna None se nao conseguir inferir.
    """
    name = Path(filename).name
    if not name.lower().endswith('.csv'):
        return None
    stem = name[:-4]  # remove .csv

    # Padrao principal: "fonte - algo.csv"
    if ' - ' in stem:
        source = stem.split(' - ', 1)[0].strip()
        return source or None

    # Nao identificado
    return None


def unique_path(path: Path) -> Path:
    """Gera um caminho unico se ja existir um arquivo com o mesmo nome.

    Ex.: name.csv -> name (1).csv -> name (2).csv ...
    """
    if not path.exists():
        return path
    i = 1
    stem, suffix = path.stem, path.suffix
    while True:
        candidate = path.with_name(f"{stem} ({i}){suffix}")
        if not candidate.exists():
            return candidate
        i += 1


def process_list_dir(list_dir: Path, dry_run: bool = False) -> int:
    """Processa uma pasta de lista, movendo os .csv de fontes para subpastas.

    Retorna o numero de arquivos movidos.
    """
    moved = 0
    for item in list_dir.iterdir():
        if not item.is_file() or item.suffix.lower() != '.csv':
            continue

        name_low = item.name.lower()
        if name_low in {'aggregated-list.csv', 'about.csv'}:
            continue

        source = parse_source_from_filename(item.name)
        if not source:
            # Padrao desconhecido — nao mover para evitar erros
            print(f"SKIP: nao consegui identificar fonte para '{item}'.")
            continue

        target_dir = list_dir / sanitize_dirname(source)
        dest = unique_path(target_dir / item.name)

        if dry_run:
            print(f"DRY: {item} -> {dest}")
        else:
            target_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(str(item), str(dest))
            print(f"MOVE: {item} -> {dest}")
        moved += 1

    return moved


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            'Cria subpastas por fonte e move os .csv de fontes para dentro delas, '
            'preservando o historico. Mantem aggregated-list.csv e about.csv no topo.'
        )
    )
    # Padrao: usa a pasta 'list' relativa a este script
    default_root = (Path(__file__).resolve().parent.parent / 'list')
    parser.add_argument(
        '--root',
        default=str(default_root),
        help=f'Pasta raiz com as listas (default: {default_root})'
    )
    parser.add_argument('--dry-run', action='store_true', help='Somente mostrar o que seria movido')
    args = parser.parse_args()

    root = Path(args.root)
    if not root.exists() or not root.is_dir():
        print(f"Erro: pasta raiz invalida: {root}", file=sys.stderr)
        sys.exit(1)

    total = 0
    # Apenas subpastas imediatas de `root` representam listas
    for list_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        moved = process_list_dir(list_dir, dry_run=args.dry_run)
        if moved:
            print(f"Em '{list_dir}': {moved} arquivo(s) movidos.")
        total += moved

    if total == 0:
        print('Nenhum arquivo para mover.')
    else:
        print(f'Total movido: {total} arquivo(s).')


if __name__ == '__main__':
    main()

