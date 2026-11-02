// Teste de concorrencia: varias mensagens ao mesmo tempo (exige DRY_RUN=true).
// Uso (na raiz do projeto): node tests/concurrency-n8n.js
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const N8N = process.env.N8N_URL || 'http://127.0.0.1:5678/webhook/ig';
const COMPOSE = ['compose', '-f', 'infra/docker-compose.yml'];
const QTD = Number(process.env.QTD || 20);

function lerEnv(arquivo) {
  const env = {};
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    if (!linha.trim() || linha.trim().startsWith('#')) continue;
    const i = linha.indexOf('=');
    if (i > 0) env[linha.slice(0, i).trim()] = linha.slice(i + 1).split(/\s+#/)[0].trim();
  }
  return env;
}
const { IG_APP_SECRET, IG_ACCOUNT_ID, HASH_SALT } = lerEnv('infra/.env');

const docker = (args) => execFileSync('docker', [...COMPOSE, ...args], { encoding: 'utf8' }).trim();
const sql = (q) => docker(['exec', '-T', 'bot-db', 'psql', '-U', 'bot', '-d', 'bot', '-At', '-F', '|', '-c', q]);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (igsid) => crypto.createHash('sha256').update(igsid + HASH_SALT).digest('hex');

async function enviar(igsid, mid, texto) {
  const agora = Date.now();
  const corpo = JSON.stringify({
    object: 'instagram',
    entry: [{
      id: IG_ACCOUNT_ID,
      time: agora,
      messaging: [{ sender: { id: igsid }, recipient: { id: IG_ACCOUNT_ID }, timestamp: agora, message: { mid, text: texto } }],
    }],
  });
  const assinatura = 'sha256=' + crypto.createHmac('sha256', IG_APP_SECRET).update(corpo).digest('hex');
  const r = await fetch(N8N, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': assinatura },
    body: corpo,
  });
  if (!r.ok) throw new Error('webhook respondeu HTTP ' + r.status);
}

const lista = (hs) => hs.map((h) => "'" + h + "'").join(',');

async function aguardar(hs, quantos, limiteMs = 30000) {
  const ini = Date.now();
  while (Date.now() - ini < limiteMs) {
    if (Number(sql('SELECT count(*) FROM events WHERE user_hash IN (' + lista(hs) + ')')) >= quantos) return true;
    await dormir(300);
  }
  return false;
}

(async () => {
  const dry = docker(['exec', '-T', 'n8n', 'sh', '-c', 'echo $DRY_RUN']);
  if (dry !== 'true') {
    console.error('DRY_RUN do n8n e "' + dry + '". Mude para true no infra/.env e rode "docker compose up -d" na pasta infra.');
    process.exit(2);
  }
  const falhas = [];

  // Teste A: QTD pessoas diferentes ao mesmo tempo
  const usuarios = Array.from({ length: QTD }, (_, i) => 'conc-' + i);
  const hashes = usuarios.map(hash);
  const t0 = Date.now();
  const envios = await Promise.allSettled(usuarios.map((u) => enviar(u, 'conc-mid-' + u, 'oi')));
  const httpFalhou = envios.filter((e) => e.status === 'rejected').length;
  if (httpFalhou) falhas.push('A: ' + httpFalhou + ' webhooks nao responderam 200');
  const chegou = await aguardar(hashes, QTD);
  const tempoTotal = Date.now() - t0;
  if (!chegou) falhas.push('A: nem todos os eventos foram registrados em 30 s');
  const porUsuario = sql('SELECT user_hash, count(*) FROM events WHERE user_hash IN (' + lista(hashes) + ') GROUP BY user_hash')
    .split('\n').filter(Boolean).map((l) => l.split('|'));
  const diferentesDeUm = porUsuario.filter((l) => Number(l[1]) !== 1).length;
  if (porUsuario.length !== QTD) falhas.push('A: esperava ' + QTD + ' usuarios com evento, houve ' + porUsuario.length);
  if (diferentesDeUm) falhas.push('A: ' + diferentesDeUm + ' usuarios com numero de eventos diferente de 1');
  const sessoes = Number(sql("SELECT count(*) FROM sessions WHERE igsid LIKE 'conc-%' AND igsid <> 'conc-dup'"));
  if (sessoes !== QTD) falhas.push('A: esperava ' + QTD + ' sessoes, houve ' + sessoes);
  const lat = sql('SELECT coalesce(latency_ms,0) FROM events WHERE user_hash IN (' + lista(hashes) + ') ORDER BY 1')
    .split('\n').filter(Boolean).map(Number);
  console.log((falhas.length ? 'FALHOU' : 'ok    ') + ' A: ' + QTD + ' pessoas ao mesmo tempo (' + tempoTotal + ' ms ate todos os eventos)');
  console.log('       latencia por mensagem: media ' + Math.round(lat.reduce((a, b) => a + b, 0) / (lat.length || 1)) +
    ' ms | max ' + (lat[lat.length - 1] || 0) + ' ms | n=' + lat.length);

  // Teste B: a mesma mensagem 5 vezes ao mesmo tempo
  const antes = falhas.length;
  const hDup = hash('conc-dup');
  await Promise.allSettled(Array.from({ length: 5 }, () => enviar('conc-dup', 'conc-mid-dup', 'oi')));
  await dormir(4000);
  const eventosDup = Number(sql("SELECT count(*) FROM events WHERE user_hash='" + hDup + "'"));
  const midsDup = Number(sql("SELECT count(*) FROM processed_mids WHERE mid='conc-mid-dup'"));
  if (eventosDup !== 1) falhas.push('B: esperava 1 evento, houve ' + eventosDup);
  if (midsDup !== 1) falhas.push('B: esperava 1 mid registrado, houve ' + midsDup);
  console.log((falhas.length > antes ? 'FALHOU' : 'ok    ') + ' B: mesma mensagem 5 vezes ao mesmo tempo (eventos: ' + eventosDup + ')');

  falhas.forEach((f) => console.log('       - ' + f));

  // limpa os dados falsos
  sql('DELETE FROM events WHERE user_hash IN (' + lista([...hashes, hDup]) + ')');
  sql("DELETE FROM sessions WHERE igsid LIKE 'conc-%'");
  sql("DELETE FROM processed_mids WHERE mid LIKE 'conc-%'");
  process.exit(falhas.length ? 1 : 0);
})();