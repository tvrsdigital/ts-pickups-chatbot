# Guia de operação

Como ligar, desligar e conferir o robô no dia a dia. A instalação inicial está no [README](../README.md).

## Ligar e desligar

O robô usa dois grupos de contêineres: o do projeto (n8n, banco, ngrok e Mailpit) e o do Typebot.

Ligar (na raiz do projeto):

```powershell
cd infra
docker compose up -d
cd typebot
docker compose up -d
cd ..\..
```

Desligar sem perder dados:

```powershell
cd infra
docker compose stop
cd typebot
docker compose stop
cd ..\..
```

Use `stop`, e não `down -v`. O comando `down -v` apaga os volumes, ou seja, o banco e as sessões.

Para conferir o que está rodando:

```powershell
docker ps --format "table {{.Names}}\t{{.Status}}"
```

Devem aparecer 8 contêineres: `n8n`, `bot-db`, `ngrok` e `mailpit` (projeto `ts-pickups-bot`), e `typebot-builder`, `typebot-viewer`, `typebot-db` e `typebot-redis` (projeto `typebot`).

## Modo simulado (DRY_RUN)

Com `DRY_RUN=true`, o robô processa tudo, mas **não envia** nada ao Instagram. Os testes automáticos exigem esse modo.

1. Em `infra/.env`, troque `DRY_RUN=false` por `DRY_RUN=true` (ou o inverso).
2. Recrie o n8n: `cd infra; docker compose up -d`.
3. Confira: `docker exec ts-pickups-bot-n8n-1 printenv DRY_RUN`.

Ao terminar os testes, volte para `false`. Com `true`, o robô fica sem responder aos clientes.

## Testes

Na raiz do projeto:

| Comando | Exige DRY_RUN=true |
|---|---|
| `node tests/generate-paths.js` | não |
| `node tests/check-labels.js` | não |
| `node tests/simulate-typebot.js` | não |
| `node tests/simulate-n8n.js` | sim |
| `node tests/concurrency-n8n.js` | sim |

Para salvar a saída com os acentos corretos, use `cmd /c "node tests\\simulate-typebot.js > tests\\resultado-typebot.txt"`.

## Quando chega um aviso de erro

O workflow 99-erros envia ao Telegram o workflow, o nó que falhou, o erro e o número da execução.

1. No n8n, abra **Executions** e procure o número da execução.
2. Veja o nó marcado em vermelho e a mensagem de erro.
3. Se o erro for "The service refused the connection" no nó **Typebot startChat**, o Typebot está fora do ar. Rode `docker ps` e religue: `docker start typebot-typebot-viewer-1`.
4. A mensagem que falhou não é reenviada. Peça ao cliente que escreva de novo.

## Atendimento humano

Quando o cliente escolhe **Falar com atendente**, o robô pausa por 24 horas e avisa no Telegram. Depois desse prazo, o robô volta a responder.

## Dados e segredos

- `infra/.env` guarda os segredos e não vai para o Git.
- Um workflow diário (04-retencao, às 3h) apaga os dados vencidos. Os prazos estão em [arquitetura](arquitetura.md) e na [política de privacidade](privacidade.md).