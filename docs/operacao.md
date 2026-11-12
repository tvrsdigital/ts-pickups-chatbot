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

## Hospedagem no servidor (ZimaOS)

Desde 12/11/2026 o robô roda 24 horas em um servidor doméstico com ZimaOS (Dell OptiPlex 3070, Intel i5 de 9ª geração, 24 GB de RAM), na pasta `/DATA/AppData/ts-pickups-chatbot`. O computador de desenvolvimento não precisa mais ficar ligado.

- **Comandos:** no servidor o usuário não está no grupo do Docker, então use `sudo docker compose ...`. Para ligar: `cd infra/typebot && sudo docker compose up -d`, depois `cd .. && sudo docker compose up -d`.
- **Endereços na rede local:** n8n em `http://<IP-do-servidor>:5678`, editor do Typebot em `:8080` e Mailpit em `:8025`. Reserve o IP do servidor no roteador, porque o `.env` do Typebot guarda esse endereço (`NEXTAUTH_URL` e `NEXT_PUBLIC_VIEWER_URL`).
- **Ajustes só do servidor (fora do Git):** `infra/docker-compose.override.yml` libera as portas do n8n e do Mailpit na rede local, e `infra/typebot/docker-compose.override.yml` declara `host.docker.internal` para o editor do Typebot conseguir enviar o e-mail de login. No Docker Desktop (Windows) esses ajustes não são necessários.
- **Um túnel por vez:** o domínio gratuito do ngrok aceita um túnel online. Para usar o robô no PC, desligue antes o `ngrok` do servidor (`sudo docker compose stop ngrok`), e o contrário.
- **Reinício automático:** todos os contêineres têm política de reinício. Testado com um reinício do servidor: os 8 contêineres voltaram sozinhos e o robô respondeu.

### Backup

O script `infra/backup.sh` roda todos os dias às 3h30 pelo `cron` do root e grava em `/media/SSD-Storage/backups/ts-pickups/` (SSD separado do disco principal): os dois bancos (`bot.sql.gz`, `typebot.sql.gz`) e o volume do n8n (`n8ndata.tgz`, com workflows e credenciais). O n8n fica parado por alguns segundos durante a cópia. Guarda os últimos 14 dias e a pasta só é acessível pelo root.

Agendar (uma vez): `(sudo crontab -l; echo "30 3 * * * /DATA/AppData/ts-pickups-chatbot/infra/backup.sh >> /DATA/AppData/backup-ts-pickups.log 2>&1") | sudo crontab -`

Para conferir: `sudo cat /DATA/AppData/backup-ts-pickups.log` e `sudo find /media/SSD-Storage/backups/ts-pickups -type f -exec ls -lh {} +`.

Restaurar o n8n: pare o contêiner e extraia o pacote no volume (`sudo docker run --rm -v ts-pickups-bot_n8ndata:/dados -v <pasta-do-backup>:/backup:ro alpine sh -c "cd /dados && tar xzf /backup/n8ndata.tgz"`). Restaurar um banco: `gunzip -c bot.sql.gz | sudo docker exec -i ts-pickups-bot-bot-db-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`, em um banco recém-criado e vazio.

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