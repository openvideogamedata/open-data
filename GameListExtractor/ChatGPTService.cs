using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace GameListExtractor;

public class ChatGPTService
{
    private readonly HttpClient _httpClient;
    private readonly string _token;

    public ChatGPTService(HttpClient httpClient, string token)
    {
        _httpClient = httpClient;
        _token = token;
    }

    public async Task<string?> GetCsvFromHtmlAsync(string html)
    {
        var requestBody = new
        {
            model = "gpt-4o", // use modern model
            messages = new[]
            {
                new { role = "system", content = "Você é um assistente que extrai listas de jogos de páginas HTML." },
                new { role = "user", content = $"Com base nesse HTML, extraia a lista dos melhores jogos, se importando com a posição de que cada jogo aparece na lista, gere como resultado um arquivo .csv com position e game_title. Se a lista não possui posições ou ranking, responda 'essa lista é invalida e explique o motivo'. HTML:\n{html}" }
            },
            temperature = 0.2
        };

        using var requestMessage = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions")
        {
            Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json")
        };
        requestMessage.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);

        using var response = await _httpClient.SendAsync(requestMessage);
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString();
    }
}
