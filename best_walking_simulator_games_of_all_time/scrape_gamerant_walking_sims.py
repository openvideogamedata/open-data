import csv
import re
from datetime import datetime
import requests
from bs4 import BeautifulSoup

URL = 'https://gamerant.com/best-walking-simulators/'


def fetch_games(url=URL):
    response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    response.raise_for_status()
    soup = BeautifulSoup(response.text, 'html.parser')
    entries = []
    for heading in soup.find_all(['h2', 'h3']):
        text = heading.get_text(separator=' ', strip=True)
        m = re.match(r'(\d+)\.?\s*(.*)', text)
        if not m:
            continue
        pos = int(m.group(1))
        title_part = m.group(2)
        # Remove year in parentheses if present
        title = re.sub(r'\(\d{4}\)$', '', title_part).strip()
        entries.append((pos, title))
    if not entries:
        raise ValueError('Could not find any game entries in the page')
    entries.sort(key=lambda x: x[0])
    return entries


def write_csv(entries):
    now = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    out_path = f'gamerant - {now}.csv'
    total = len(entries)
    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow([
            'Position',
            'Title',
            'ReleaseDate',
            'ExternalId',
            'Score',
            'GameId',
            'CoverImageId'
        ])
        for position, title in entries:
            score = total - position + 1
            writer.writerow([position, title, '', '', score, '', ''])
    print(f'Written {out_path} with {total} entries')


def main():
    entries = fetch_games()
    write_csv(entries)


if __name__ == '__main__':
    main()
