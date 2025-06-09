using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Text.RegularExpressions;
using HtmlAgilityPack;

public class GamerantScraper
{
    private const string Url = "https://gamerant.com/best-walking-simulators/";

    public static List<(int Position, string Title)> FetchGames(string url = Url)
    {
        var handler = new HttpClientHandler
        {
            AutomaticDecompression = System.Net.DecompressionMethods.GZip | System.Net.DecompressionMethods.Deflate
        };
        using var client = new HttpClient(handler);
        client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0");
        var html = client.GetStringAsync(url).Result;

        var doc = new HtmlDocument();
        doc.LoadHtml(html);

        var entries = new List<(int, string)>();
        foreach (var heading in doc.DocumentNode.SelectNodes("//h2|//h3") ?? new HtmlNodeCollection(null))
        {
            var text = heading.InnerText.Trim();
            var match = Regex.Match(text, @"^(\d+)\.?\s*(.*)");
            if (!match.Success)
                continue;
            if (!int.TryParse(match.Groups[1].Value, out int pos))
                continue;
            var titlePart = match.Groups[2].Value.Trim();
            var title = Regex.Replace(titlePart, @"\(\d{4}\)$", string.Empty).Trim();
            entries.Add((pos, title));
        }

        if (entries.Count == 0)
            throw new Exception("Could not find any game entries in the page");

        entries.Sort((a, b) => a.Item1.CompareTo(b.Item1));
        return entries;
    }

    public static void WriteCsv(List<(int Position, string Title)> entries)
    {
        var now = DateTime.Now.ToString("yyyy-MM-dd_HH-mm-ss");
        var outPath = $"gamerant - {now}.csv";
        var total = entries.Count;

        using var writer = new StreamWriter(outPath, false, System.Text.Encoding.UTF8);
        writer.WriteLine("Position,Title,ReleaseDate,ExternalId,Score,GameId,CoverImageId");
        foreach (var (position, title) in entries)
        {
            var score = total - position + 1;
            writer.WriteLine($"{position},{Escape(title)},,,{score},,");
        }
        Console.WriteLine($"Written {outPath} with {total} entries");
    }

    private static string Escape(string value)
    {
        if (value.Contains(",") || value.Contains("\"") || value.Contains("\n"))
            return "\"" + value.Replace("\"", "\"\"") + "\"";
        return value;
    }

    public static void Main(string[] args)
    {
        var entries = FetchGames();
        WriteCsv(entries);
    }
}
