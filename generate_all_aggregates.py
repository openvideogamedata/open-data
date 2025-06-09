import csv
import os
from collections import defaultdict
from pathlib import Path

BASE_DIR = Path(__file__).parent


def read_rows(folder):
    rows = []
    for name in sorted(os.listdir(folder)):
        if name.endswith('.csv') and name != 'about.csv' and not name.startswith('aggregated'):
            path = os.path.join(folder, name)
            with open(path, newline='', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for r in reader:
                    score = int(float(r['Score']))
                    rows.append({'Title': r['Title'],
                                 'Score': score,
                                 'ReleaseDate': r['ReleaseDate'],
                                 'SourceFile': name})
    return rows


def aggregate_rows(rows):
    agg = defaultdict(lambda: {'TotalScore': 0, 'Sources': set(), 'ReleaseYear': None})
    for r in rows:
        title = r['Title']
        entry = agg[title]
        entry['TotalScore'] += r['Score']
        entry['Sources'].add(r['SourceFile'])
        if not entry['ReleaseYear']:
            entry['ReleaseYear'] = r['ReleaseDate'].split('-')[0]
    agg_rows = []
    for title, data in agg.items():
        agg_rows.append({'Title': f"{title} ({data['ReleaseYear']})",
                         'TotalScore': data['TotalScore'],
                         'ListsAppeared': len(data['Sources'])})
    agg_rows.sort(key=lambda x: x['TotalScore'], reverse=True)
    return agg_rows


def write_aggregated(folder, rows):
    path = os.path.join(folder, 'aggregated-list.csv')
    with open(path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['Position', 'Title', 'TotalScore', 'ListsAppeared'])
        writer.writeheader()
        for i, row in enumerate(rows, start=1):
            writer.writerow({'Position': i, **row})
    return path


def main():
    all_rows = []
    for name in sorted(os.listdir(BASE_DIR)):
        d = os.path.join(BASE_DIR, name)
        if os.path.isdir(d) and os.path.isfile(os.path.join(d, 'about.csv')):
            rows = read_rows(d)
            if rows:
                agg_rows = aggregate_rows(rows)
                write_aggregated(d, agg_rows)
                all_rows.extend(rows)
    if all_rows:
        agg_all = aggregate_rows(all_rows)
        write_aggregated(BASE_DIR, agg_all)


if __name__ == '__main__':
    main()
