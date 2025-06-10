using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace OpenData.Console.Lists.best_games_of_all_time.IGN.SCripts
{
    public class GameEntry
    {
        public int Position { get; set; }
        public string Title { get; set; } = string.Empty;
    }

    public class IGNScraper
    {
        private readonly string _url = "https://www.ign.com/articles/the-best-100-video-games-of-all-time";

        public IGNScraper() { }

        public async Task<List<GameEntry>> GetDataAsync()
        {
            var results = new List<GameEntry>();
            using var client = new HttpClient();

            string? nextUrl = _url;
            while (!string.IsNullOrEmpty(nextUrl))
            {
                var html = await client.GetStringAsync(nextUrl);

                // Extract entries in the form "<h2>1. Game Title</h2>"
                foreach (Match m in Regex.Matches(html, "<h2[^>]*>(.*?)</h2>", RegexOptions.Singleline | RegexOptions.IgnoreCase))
                {
                    var text = StripHtml(m.Groups[1].Value).Trim();
                    var match = Regex.Match(text, "^(?<pos>\\d+)\\.\\s*(?<title>.+)$");
                    if (match.Success)
                    {
                        if (int.TryParse(match.Groups["pos"].Value, out int pos))
                        {
                            results.Add(new GameEntry
                            {
                                Position = pos,
                                Title = match.Groups["title"].Value.Trim()
                            });
                        }
                    }
                }

                // Look for link to the next page
                var nextMatch = Regex.Match(html, "<a[^>]*rel=\\\"next\\\"[^>]*href=\\\"(?<url>[^\\\"]+)\\\"", RegexOptions.IgnoreCase);
                if (nextMatch.Success)
                {
                    var url = nextMatch.Groups["url"].Value;
                    nextUrl = url.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                        ? url
                        : new Uri(new Uri(_url), url).ToString();
                }
                else
                {
                    nextUrl = null;
                }
            }

            return results
                .OrderBy(e => e.Position)
                .ToList();
        }

        private static string StripHtml(string value)
        {
            return Regex.Replace(value, "<.*?>", string.Empty);
        }
    }
}
