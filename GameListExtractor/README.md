# GameListExtractor

Este exemplo em C# demonstra como utilizar a API do ChatGPT para extrair listas de jogos de uma página HTML. O programa recebe uma URL de origem, obtém o HTML e envia para o ChatGPT com o prompt:

```
Com base nesse HTML, extraia a lista dos melhores jogos, se importando com a posição de que cada jogo aparece na lista, gere como resultado um arquivo .csv com position e game_title. Se a lista não possui posições ou ranking, responda "essa lista é invalida e explique o motivo".
```

O token da API é lido da variável de ambiente `OPENAI_API_KEY`.

## Execução

```
GameListExtractor <URL-da-lista>
```

Exemplo utilizando uma das fontes deste repositório:

```
GameListExtractor https://retrododo.com/best-nes-games/
```
