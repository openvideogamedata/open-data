using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace OpenData.Console.Lists.best_games_of_all_time.Digitaltrends.Scripts
{
    public class GameEntry
    {
        public int Position { get; set; }
        public string Title { get; set; } = string.Empty;
    }

    public class DigitaltrendsScraper
    {
        private readonly string _url = "https://www.digitaltrends.com/gaming/50-best-games-of-all-time/";
        private readonly HttpClient _client;

        public DigitaltrendsScraper()
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
            using var response = await _client.GetAsync(_url);
            response.EnsureSuccessStatusCode();
            var html = await response.Content.ReadAsStringAsync();

            var results = new List<GameEntry>();

            foreach (Match m in Regex.Matches(html, "<(?:(?:h2)|(?:h3)|(?:p))[^>]*>(?<text>.*?)</(?:h2|h3|p)>", RegexOptions.Singleline | RegexOptions.IgnoreCase))
            {
                var text = StripHtml(m.Groups["text"].Value).Trim();
                var match = Regex.Match(text, "^(?<pos>\\d+)\\.\\s*(?<title>.+)$");
                if (match.Success && int.TryParse(match.Groups["pos"].Value, out int pos))
                {
                    results.Add(new GameEntry
                    {
                        Position = pos,
                        Title = match.Groups["title"].Value.Trim()
                    });
                }
            }

            return results.OrderBy(e => e.Position).ToList();
        }

        private static string StripHtml(string value)
        {
            return Regex.Replace(value, "<.*?>", string.Empty);
        }
    }
}
