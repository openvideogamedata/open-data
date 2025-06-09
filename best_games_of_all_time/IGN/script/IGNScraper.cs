using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using HtmlAgilityPack;

class IGNScraper
{
    static async Task Main()
    {
        string aboutPath = Path.Combine("..", "..", "about.csv");
        string sourceName = "IGN";

        // Locate IGN row in about.csv
        string[] lines = File.ReadAllLines(aboutPath);
        var row = lines.Skip(1).FirstOrDefault(l => l.StartsWith(sourceName + ","));
        if (row == null)
        {
            Console.Error.WriteLine("IGN entry not found in about.csv");
            return;
        }

        var parts = row.Split(',');
        string url = parts[1];
        string outputCsv = Path.Combine("..", sourceName, "data", Path.GetFileName(parts[3]));

        using var client = new HttpClient();
        var html = await client.GetStringAsync(url);

        var doc = new HtmlDocument();
        doc.LoadHtml(html);

        // Attempt to select list items containing game entries
        var items = doc.DocumentNode.SelectNodes("//ol/li") ?? doc.DocumentNode.SelectNodes("//div[contains(@class,'listElmnt')]");
        if (items == null)
        {
            Console.Error.WriteLine("Could not locate game list on the page.");
            return;
        }

        using var writer = new StreamWriter(outputCsv);
        await writer.WriteLineAsync("Position,Title,ReleaseDate,ExternalId,Score,GameId,CoverImageId");

        int position = 1;
        foreach (var item in items)
        {
            var titleNode = item.SelectSingleNode(".//h3") ?? item.SelectSingleNode(".//h2") ?? item.SelectSingleNode(".//strong") ?? item;
            string title = Regex.Replace(titleNode.InnerText.Trim(), "\\s+", " ");
            await writer.WriteLineAsync($"{position},\"{title.Replace("\"", "\"")}\",,,,,");
            position++;
        }

        Console.WriteLine($"Scraped {position - 1} games to {outputCsv}");
    }
}
