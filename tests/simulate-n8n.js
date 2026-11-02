// Simula a Meta: envia webhooks assinados ao n8n (com DRY_RUN=true)
// e confere o resultado na tabela events.
// Uso (na raiz do projeto): node tests/simulate-n8n.js
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const N8N = process.env.N8N_URL || 'http://127.0.0.1:5678/webhook/ig';
const COMPOSE = ['compose', '-f', 'infra/docker-compose.yml'];

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

async function enviar(igsid, texto, payload, seq) {
  const agora = Date.now();
  const message = { mid: `sim-${igsid}-${seq}-${agora}`, text: texto };
  if (payload) message.quick_reply = { payload };
  const corpo = JSON.stringify({
    object: 'instagram',
    entry: [{
      id: IG_ACCOUNT_ID,
      time: agora,
      messaging: [{ sender: { id: igsid }, recipient: { id: IG_ACCOUNT_ID }, timestamp: agora, message }],
    }],
  });
  const assinatura = 'sha256=' + crypto.createHmac('sha256', IG_APP_SECRET).update(corpo).digest('hex');
  const r = await fetch(N8N, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': assinatura },
    body: corpo,
  });
  if (!r.ok) throw new Error(`webhook respondeu HTTP ${r.status}`);
}

async function aguardar(h, quantos, limiteMs = 20000) {
  const ini = Date.now();
  while (Date.now() - ini < limiteMs) {
    if (Number(sql(`SELECT count(*) FROM events WHERE user_hash='${h}'`)) >= quantos) return true;
    await dormir(300);
  }
  return false;
}

async function percorrer(caminho) {
  const igsid = `sim-${caminho.id}`;
  const h = hash(igsid);
  const esperado = [['message', '']];
  caminho.clicks.forEach((c, i) => {
    const ultimo = i === caminho.clicks.length - 1;
    esperado.push([ultimo ? (caminho.terminal === 'HANDOFF' ? 'handoff' : 'end') : 'choice', c]);
  });

  await enviar(igsid, 'oi', null, 0);
  if (!(await aguardar(h, 1))) return { falhas: ['o n8n não registrou o evento inicial'], lat: [] };
  for (let i = 0; i < caminho.clicks.length; i++) {
    await dormir(400); // deixa a sessão ser gravada antes do próximo clique
    const c = caminho.clicks[i];
    await enviar(igsid, c.slice(0, 20), c, i + 1);
    if (!(await aguardar(h, i + 2))) return { falhas: [`sem evento após o clique "${c}"`], lat: [] };
  }

  const linhas = sql(`SELECT event, coalesce(detail,''), coalesce(latency_ms,0) FROM events WHERE user_hash='${h}' ORDER BY id`)
    .split('\n').filter(Boolean).map((l) => l.split('|'));
  const falhas = [];
  if (linhas.length !== esperado.length) falhas.push(`esperava ${esperado.length} eventos, houve ${linhas.length}`);
  esperado.forEach(([ev, det], i) => {
    const l = linhas[i];
    if (!l || l[0] !== ev || l[1] !== det) falhas.push(`evento ${i + 1}: esperado ${ev}/"${det}", obtido ${l ? `${l[0]}/"${l[1]}"` : '(nenhum)'}`);
  });
  return { falhas, lat: linhas.map((l) => Number(l[2])) };
}

(async () => {
  const dry = docker(['exec', '-T', 'n8n', 'sh', '-c', 'echo $DRY_RUN']);
  if (dry !== 'true') {
    console.error(`DRY_RUN do n8n é "${dry}". Mude para true no infra/.env e rode "docker compose up -d" na pasta infra.`);
    process.exit(2);
  }

  const paths = JSON.parse(fs.readFileSync('tests/paths.json', 'utf8'));
  let ok = 0;
  const latencias = [];
  for (const c of paths) {
    let r;
    try { r = await percorrer(c); } catch (e) { r = { falhas: [e.message], lat: [] }; }
    latencias.push(...r.lat);
    if (!r.falhas.length) ok++;
    console.log(`${r.falhas.length ? 'FALHOU' : 'ok    '} #${String(c.id).padStart(2)} ${c.clicks.join(' > ')}`);
    r.falhas.forEach((f) => console.log(`        - ${f}`));
  }

  latencias.sort((a, b) => a - b);
  const media = Math.round(latencias.reduce((a, b) => a + b, 0) / (latencias.length || 1));
  const p95 = latencias[Math.floor(latencias.length * 0.95)] || 0;
  console.log(`\n${ok}/${paths.length} caminhos OK pelo n8n`);
  console.log(`Latência por mensagem: média ${media} ms | p95 ${p95} ms | máx ${latencias[latencias.length - 1] || 0} ms | n=${latencias.length}`);

  // limpa os dados falsos
  sql("DELETE FROM events WHERE user_hash IN (" + paths.map((c) => `'${hash('sim-' + c.id)}'`).join(',') + ")");
  sql("DELETE FROM sessions WHERE igsid LIKE 'sim-%'");
  sql("DELETE FROM processed_mids WHERE mid LIKE 'sim-%'");
  process.exit(ok === paths.length ? 0 : 1);
})();