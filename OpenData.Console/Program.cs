namespace OpenData.Console;

using System;
using System.IO;
using System.Threading.Tasks;
using OpenData.Console.Lists.best_games_of_all_time.IGN.SCripts;
using OpenData.Console.Lists.best_games_of_all_time.Digitaltrends.Scripts;

internal class Program
{
    static async Task Main(string[] args)
    {
        if (args.Length > 0 && args[0].Equals("digitaltrends", StringComparison.OrdinalIgnoreCase))
        {
            var scraper = new DigitaltrendsScraper();
            var results = await scraper.GetDataAsync();

            var fileName = $"digitaltrends - {DateTime.Now:yyyy-MM-dd_HH-mm-ss}.csv";
            var path = Path.Combine("Lists", "best_games_of_all_time", fileName);
            await using var writer = new StreamWriter(path);
            await writer.WriteLineAsync("Position,Title");
            foreach (var entry in results)
            {
                var title = entry.Title.Replace("\"", "\"\"");
                await writer.WriteLineAsync($"{entry.Position},\"{title}\"");
            }

            Console.WriteLine($"Wrote {fileName}");
        }
        else
        {
            var scraper = new IGNScraper();
            var results = await scraper.GetDataAsync();

            foreach (var entry in results)
            {
                Console.WriteLine($"{entry.Position}. {entry.Title}");
            }
        }
    }
}
