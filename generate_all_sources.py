import csv
import os

OUTPUT_FILE = 'all_sources.csv'

source_map = {}

for entry in os.listdir('.'):
    about_path = os.path.join(entry, 'about.csv')
    if os.path.isdir(entry) and os.path.exists(about_path):
        with open(about_path, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get('SourceName', '').strip()
                if not name:
                    continue
                source_map.setdefault(name, set()).add(entry)

rows = []
for name, datasets in source_map.items():
    rows.append({
        'SourceName': name,
        'Count': len(datasets),
        'Datasets': ';'.join(sorted(datasets))
    })

rows.sort(key=lambda x: (-x['Count'], x['SourceName'].lower()))

with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=['SourceName', 'Count', 'Datasets'])
    writer.writeheader()
    for row in rows:
        writer.writerow(row)

print(f'Written {OUTPUT_FILE} with {len(rows)} sources.')
