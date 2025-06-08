import os
import pandas as pd

# Folder containing the CSV lists to aggregate. Update this path as needed.
DATA_FOLDER = "best_games_of_all_time"

# Collect all ranking CSV files (skip 'about.csv')
frames = []
for fname in os.listdir(DATA_FOLDER):
    if fname.endswith('.csv') and fname != 'about.csv':
        path = os.path.join(DATA_FOLDER, fname)
        df = pd.read_csv(path)
        # Keep only the columns we need and track which file the row came from
        df = df[['Title', 'Score', 'ReleaseDate']].copy()
        df['SourceFile'] = fname
        frames.append(df)

if not frames:
    raise SystemExit(f"No ranking CSV files found in {DATA_FOLDER}")

all_games = pd.concat(frames, ignore_index=True)

# Aggregate total score and number of lists each game appears in
agg = (
    all_games.groupby('Title')
    .agg(
        TotalScore=('Score', 'sum'),
        ListsAppeared=('SourceFile', 'nunique'),
        ReleaseYear=('ReleaseDate', lambda x: pd.to_datetime(x.iloc[0]).year),
    )
    .sort_values(by='TotalScore', ascending=False)
    .reset_index()
)

# Append the release year to the title, e.g. "Mario (2001)"
agg['Title'] = agg['Title'] + " (" + agg['ReleaseYear'].astype(str) + ")"

# Add a position column starting at 1
agg.insert(0, 'Position', range(1, len(agg) + 1))

# We no longer need the ReleaseYear column in the CSV
agg = agg.drop(columns=['ReleaseYear'])

output_path = os.path.join(DATA_FOLDER, 'aggregated-list.csv')
agg.to_csv(output_path, index=False)
print(f"Aggregated list written to {output_path}")
