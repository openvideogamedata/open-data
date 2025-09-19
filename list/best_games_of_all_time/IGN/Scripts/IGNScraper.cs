using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
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
        private readonly HttpClient _client;
        private readonly Random _random = new();

        public IGNScraper()
        {
            var handler = new HttpClientHandler
            {
                AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate
            };

            _client = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(30)
            };

            _client.DefaultRequestHeaders.UserAgent.ParseAdd(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36");
            _client.DefaultRequestHeaders.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
            _client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en-US,en;q=0.9");
        }

        public async Task<List<GameEntry>> GetDataAsync()
        {
            var results = new List<GameEntry>();

            string? nextUrl = _url;
            while (!string.IsNullOrEmpty(nextUrl))
            {
                using var response = await _client.GetAsync(nextUrl);
                response.EnsureSuccessStatusCode();
                var html = await response.Content.ReadAsStringAsync();

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

                if (nextUrl != null)
                {
                    var delayMs = _random.Next(1000, 3000);
                    await Task.Delay(delayMs);
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
