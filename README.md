# Open Video Game Data

This repository hosts a collection of CSV files containing curated "best of" and "most anticipated" video game lists from a wide variety of websites. It aims to provide an easy-to-use open dataset for anyone interested in analyzing how different outlets rank video games across years, platforms and genres.

## Repository structure

Each top-level directory represents a specific ranking theme. Examples include:

- **best_games_of_1995** – lists the best games released in 1995.
- **best_games_of_the_playstation_2** – best games for the PlayStation 2 console.
- **best_rpg_games_of_all_time** – notable role-playing games across all years.
- **most_anticipated_games_of_2024** – games expected to release in 2024.

Inside each directory you will find:

1. `about.csv` – metadata describing the ranking. It contains the columns `Title`, `Year`, `Tags` and `SourceURL` indicating the primary source for that list.
2. One or more ranking CSV files named in the form `website - YYYY-MM-DD_HH-MM-SS.csv`. These files contain the scraped ranking as it appeared on that date.

The ranking files share a common structure with columns:

```
Position,Title,ReleaseDate,ExternalId,Score,GameId,CoverImageId
```

Values such as `ExternalId`, `GameId` and `CoverImageId` correspond to identifiers used by the source site or other public databases.

## Usage

All data is provided in plain CSV format for straightforward loading with tools like Python's `pandas` or spreadsheet applications. Because multiple sources are included for each ranking theme, you can compare how different publications order the same set of games or track changes over time.

Example (Python):

```python
import pandas as pd

# Load metadata for a given category
meta = pd.read_csv('best_games_of_1995/about.csv')

# Load one of the ranking lists
ranking = pd.read_csv('best_games_of_1995/wikipedia (en) - 2023-09-26_22-42-24.csv')
```

## License

The data and repository contents are distributed under the MIT License. See the `LICENSE` file for the full text.

## Contributing

Feel free to open issues or pull requests if you find any inaccuracies or would like to contribute additional rankings. Please ensure that any new data cites the original source and follows the same CSV format.


