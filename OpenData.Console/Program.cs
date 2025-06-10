namespace OpenData.Console;

using System;
using System.Threading.Tasks;
using OpenData.Console.Lists.best_games_of_all_time.IGN.SCripts;

internal class Program
{
    static async Task Main(string[] args)
    {
        var scraper = new IGNScraper();
        var results = await scraper.GetDataAsync();

        foreach (var entry in results)
        {
            Console.WriteLine($"{entry.Position}. {entry.Title}");
        }
    }
}
