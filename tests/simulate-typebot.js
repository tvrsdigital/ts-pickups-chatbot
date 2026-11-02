// Percorre os caminhos de tests/paths.json direto na API do Typebot.
// Uso: node tests/simulate-typebot.js
const fs = require('fs');

const BASE = process.env.TYPEBOT_URL || 'http://127.0.0.1:8081';
const ID = process.env.TYPEBOT_PUBLIC_ID || 'ts-pickups';

const paths = JSON.parse(fs.readFileSync('tests/paths.json', 'utf8'));
const produtos = JSON.parse(fs.readFileSync('flow/produtos.json', 'utf8'));
delete produtos._nota;

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

const textoDe = (nos) => (nos || [])
  .map((n) => (n.text !== undefined ? n.text : textoDe(n.children)))
  .join('');

const textosDe = (resp) => (resp.messages || [])
  .filter((m) => m.type === 'text')
  .map((m) => (m.content.richText || []).map((b) => textoDe(b.children)).join('\n'));

async function percorrer(caminho) {
  const t0 = Date.now();
  const falhas = [];
  let resp = await post(`${BASE}/api/v1/typebots/${ID}/startChat`, {});
  const sessao = resp.sessionId;
  let todos = textosDe(resp);

  for (const clique of caminho.clicks) {
    const opcoes = ((resp.input && resp.input.items) || []).map((i) => i.content);
    if (!opcoes.includes(clique)) {
      falhas.push(`botão "${clique}" não existe aqui. Opções: ${opcoes.join(' | ') || '(nenhuma)'}`);
      return { falhas, ms: Date.now() - t0 };
    }
    resp = await post(`${BASE}/api/v1/sessions/${sessao}/continueChat`, { message: clique });
    todos = todos.concat(textosDe(resp));
  }

  const junto = todos.join('\n');
  const marcador = caminho.terminal === 'HANDOFF' ? '[[HANDOFF]]' : '[[END]]';
  if (!junto.includes(marcador)) falhas.push(`final sem o marcador ${marcador}`);
  if (junto.includes('{{')) falhas.push('variável não resolvida ({{ ... }}) no texto');

  if (caminho.produto) {
    const prod = produtos[caminho.produto];
    if (!junto.includes(prod.url)) {
      const achados = junto.match(/https?:\/\/[^\s)]*[^\s).,;]/g) || [];
      falhas.push(`produto ${caminho.produto}: esperado ${prod.url} | encontrado: ${achados.join(', ') || '(nenhum)'}`);
    }
    if (!junto.toLowerCase().includes(String(prod.nome).toLowerCase())) {
      falhas.push(`produto ${caminho.produto}: o nome "${prod.nome}" não apareceu na recomendação`);
    }
  }
  return { falhas, ms: Date.now() - t0 };
}

(async () => {
  let ok = 0;
  const tempos = [];
  for (const c of paths) {
    let r;
    try { r = await percorrer(c); } catch (e) { r = { falhas: [e.message], ms: 0 }; }
    tempos.push(r.ms);
    if (r.falhas.length === 0) ok++;
    console.log(`${r.falhas.length ? 'FALHOU' : 'ok    '} #${String(c.id).padStart(2)} ${c.clicks.join(' > ')} (${r.ms} ms)`);
    r.falhas.forEach((f) => console.log(`        - ${f}`));
  }
  console.log(`\n${ok}/${paths.length} caminhos OK | média ${Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length)} ms por caminho`);
  process.exit(ok === paths.length ? 0 : 1);
})();