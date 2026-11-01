#!/usr/bin/env node
/**
 * Valida flow/flow.json e gera todos os caminhos ponta a ponta.
 *
 * Uso:
 *   node tests/generate-paths.js [flow.json] [produtos.json] [--expect 28] [--out tests/paths.json]
 *
 * Saída: resumo no console + arquivo JSON com os caminhos (cliques do usuário).
 * Código de saída 1 se qualquer verificação falhar (serve para o CI do GitHub).
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  if (i === -1) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const EXPECT = Number(opt('--expect', '28'));
const OUT = opt('--out', path.join(__dirname, 'paths.json'));
const flowFile = args[0] || path.join(__dirname, '..', 'flow', 'flow.json');
const prodFile = args[1] || path.join(__dirname, '..', 'flow', 'produtos.json');

const MAX_LABEL = 20;   // limite de caracteres do botão (VERIFICAR na API atual)
const MAX_OPTIONS = 13; // limite de botões por mensagem (VERIFICAR na API atual)

const errors = [];
const warns = [];
const err = (m) => errors.push(m);

const flow = JSON.parse(fs.readFileSync(flowFile, 'utf8'));
const produtos = JSON.parse(fs.readFileSync(prodFile, 'utf8'));
delete produtos._nota;
const nodes = flow.nodes || {};

// ---------- 1. Verificações estruturais ----------
if (!nodes[flow.start]) err(`"start" aponta para nó inexistente: ${flow.start}`);

for (const [id, n] of Object.entries(nodes)) {
  const kinds = ['options', 'next', 'marker'].filter((k) => n[k] !== undefined);
  if (kinds.length !== 1) err(`${id}: deve ter exatamente um entre options/next/marker (tem: ${kinds.join(', ') || 'nenhum'})`);
  if (!n.text || !n.text.trim()) err(`${id}: texto vazio`);

  if (n.options) {
    if (n.options.length > MAX_OPTIONS) err(`${id}: ${n.options.length} botões (máx. ${MAX_OPTIONS})`);
    const seen = new Set();
    for (const o of n.options) {
      if (o.label.length > MAX_LABEL) err(`${id}: rótulo "${o.label}" tem ${o.label.length} caracteres (máx. ${MAX_LABEL})`);
      if (seen.has(o.label)) err(`${id}: rótulo duplicado "${o.label}"`);
      seen.add(o.label);
      if (!nodes[o.next]) err(`${id}: botão "${o.label}" aponta para nó inexistente "${o.next}"`);
    }
  }
  if (n.next !== undefined && !nodes[n.next]) err(`${id}: next aponta para nó inexistente "${n.next}"`);
  if (n.marker !== undefined && !['HANDOFF', 'END'].includes(n.marker)) err(`${id}: marker inválido "${n.marker}"`);
  if (n.produto !== undefined && !produtos[n.produto]) err(`${id}: produto "${n.produto}" não existe em produtos.json`);
}

// nós inalcançáveis
const reachable = new Set();
(function walk(id) {
  if (reachable.has(id) || !nodes[id]) return;
  reachable.add(id);
  const n = nodes[id];
  (n.options || []).forEach((o) => walk(o.next));
  if (n.next) walk(n.next);
})(flow.start);
for (const id of Object.keys(nodes)) if (!reachable.has(id)) err(`${id}: nó inalcançável a partir de "${flow.start}"`);

// produtos nunca recomendados
const usados = new Set(Object.values(nodes).map((n) => n.produto).filter(Boolean));
for (const p of Object.keys(produtos)) if (!usados.has(p)) err(`produto "${p}" existe em produtos.json mas nenhum nó o recomenda`);

// ---------- 2. Enumeração de caminhos (busca em profundidade) ----------
const paths = [];
function dfs(id, clicks, produto, visiting) {
  const n = nodes[id];
  if (!n) return;
  if (visiting.includes(id)) { err(`ciclo detectado: ${[...visiting, id].join(' -> ')}`); return; }
  const here = [...visiting, id];
  const prod = n.produto || produto;

  if (n.marker) {
    paths.push({ clicks, terminal: n.marker, produto: prod || null, nodes: here });
    return;
  }
  if (n.options) {
    for (const o of n.options) dfs(o.next, [...clicks, o.label], prod, here);
  } else if (n.next) {
    dfs(n.next, clicks, prod, here);
  }
}
if (nodes[flow.start]) dfs(flow.start, [], null, []);

// ---------- 3. Verificações de resultado ----------
const unique = new Set(paths.map((p) => p.clicks.join(' > ')));
if (unique.size !== paths.length) err('há caminhos duplicados (mesma sequência de cliques)');
if (paths.length !== EXPECT) err(`esperava ${EXPECT} caminhos, encontrei ${paths.length}`);

const folhas = Object.entries(nodes).filter(([, n]) => n.produto).length;
if (folhas !== Object.keys(produtos).length) warns.push(`${folhas} nós de recomendação vs ${Object.keys(produtos).length} produtos`);

for (const p of paths) {
  if (p.terminal === 'HANDOFF' && p.clicks.length > 0 && p.nodes.includes('SITE') && !p.produto) {
    err(`caminho "${p.clicks.join(' > ')}" chega ao SITE sem produto definido`);
  }
}

// ---------- 4. Relatório ----------
const porTerminal = paths.reduce((a, p) => ((a[p.terminal] = (a[p.terminal] || 0) + 1), a), {});
const porProduto = paths.reduce((a, p) => ((a[p.produto || '(sem produto)'] = (a[p.produto || '(sem produto)'] || 0) + 1), a), {});

console.log(`Fluxo: ${path.relative(process.cwd(), flowFile)}`);
console.log(`Nós: ${Object.keys(nodes).length} | Menus: ${Object.values(nodes).filter((n) => n.options).length} | Recomendações: ${folhas} | Terminais: ${Object.values(nodes).filter((n) => n.marker).length}`);
console.log(`Caminhos ponta a ponta: ${paths.length} (esperado: ${EXPECT})`);
console.log('Por desfecho:', JSON.stringify(porTerminal));
console.log('Por produto :', JSON.stringify(porProduto));
console.log(`Profundidade máxima de cliques: ${Math.max(...paths.map((p) => p.clicks.length))}`);

fs.writeFileSync(OUT, JSON.stringify(paths.map((p, i) => ({ id: i + 1, ...p })), null, 2));
console.log(`Caminhos gravados em ${path.relative(process.cwd(), OUT)}`);

warns.forEach((w) => console.warn('AVISO:', w));
if (errors.length) {
  console.error(`\n${errors.length} ERRO(S):`);
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\nOK: fluxo válido.');
