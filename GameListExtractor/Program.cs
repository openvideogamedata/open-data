using System.Net.Http;

namespace GameListExtractor;

class Program
{
    static async Task Main(string[] args)
    {
        if (args.Length == 0)
        {
            Console.WriteLine("Usage: GameListExtractor <list url>");
            return;
        }

        var apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY");
        if (string.IsNullOrEmpty(apiKey))
        {
            Console.WriteLine("Set the OPENAI_API_KEY environment variable.");
            return;
        }

        var url = args[0];

        using var httpClient = new HttpClient();
        try
        {
            Console.WriteLine($"Fetching HTML from {url}...");
            var html = await httpClient.GetStringAsync(url);
            var service = new ChatGPTService(httpClient, apiKey);
            Console.WriteLine("Requesting extraction from ChatGPT...");
            var result = await service.GetCsvFromHtmlAsync(html);
            if (string.IsNullOrWhiteSpace(result))
            {
                Console.WriteLine("No data returned.");
                return;
            }

            const string fileName = "games.csv";
            await File.WriteAllTextAsync(fileName, result);
            Console.WriteLine($"CSV saved to {fileName}:");
            Console.WriteLine(result);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
        }
    }
}
