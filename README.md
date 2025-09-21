# Open Video Game Data

This repository hosts a collection of CSV files containing curated "best of" and "most anticipated" video game lists from a wide variety of websites. It aims to provide an easy-to-use open dataset for analyzing how different outlets rank video games across years, platforms, and genres.

## Repository Structure

- The `list/` folder contains one subfolder per ranking theme. Examples:
  - `list/best_games_of_1995` — best games released in 1995
  - `list/best_games_of_the_playstation_2` — best games for the PlayStation 2
  - `list/best_rpg_games_of_all_time` — notable RPGs across years
  - `list/most_anticipated_games_of_2024` — games expected to release in 2024

Inside each `list/<theme>/` directory you will typically find:

- `about.csv` — metadata describing the sources used for the aggregated list
- `aggregated-list.csv` — the aggregated ranking built from all sources
- One or more source CSV files named like `<source> - YYYY-MM-DD_HH-MM-SS.csv`
  - Source CSVs may be kept directly in `list/<theme>/` or inside subfolders
    named after the source (e.g., `list/<theme>/ign/...`). Subfolders help
    preserve multiple historical snapshots per source.

## Data Formats

- Source CSV (per site snapshot):
  - Columns: `Position,Title,ReleaseDate,ExternalId,Score,GameId,CoverImageId`
- Aggregated list CSV (per theme):
  - Columns: `Position,Title,TotalScore,ListsAppeared`
- `about.csv` (per theme):
  - Columns: `SourceName,SourceURL,SourceId,GeneratedCsvPath`
  - `GeneratedCsvPath` is the relative path (inside the theme folder) to the
    most recent CSV used for that source.

## Usage

All data is provided in plain CSV format for straightforward loading with tools like Python's `pandas` or spreadsheet applications. Because multiple sources are included for each ranking theme, you can compare how different publications order the same set of games or track changes over time.

Example (Python):

```python
import pandas as pd

# Load metadata for a given theme
meta = pd.read_csv('list/best_games_of_1995/about.csv')

# Load one of the ranking lists (direct file or inside a source subfolder)
ranking = pd.read_csv('list/best_games_of_1995/wikipedia (en)/wikipedia (en) - 2023-09-26_22-42-24.csv')
```

## Scripts

### Rebuild a list (interactive)

Regenerate `aggregated-list.csv` and `about.csv` for a chosen list using the most recent CSV per source.

- Run from the repo root: `python scripts/rebuild_list.py`
- Or from inside `scripts/`: `python rebuild_list.py`
- The script lists all directories under `list/`. Enter a number to pick one.
- It selects the latest CSV for each source (subfolder per source or grouped by filename prefix before ` - `). "Latest" is decided by the timestamp in the filename (` - YYYY-MM-DD_HH-MM-SS.csv`), or by file modification time when no timestamp is present.
- Outputs are written to the chosen list folder: `aggregated-list.csv` and `about.csv`.

## License

The data and repository contents are distributed under the MIT License. See the `LICENSE` file for the full text.

## Contributing

Feel free to open issues or pull requests if you find any inaccuracies or would like to contribute additional rankings. Please ensure that any new data cites the original source and follows the same CSV format.

