const fs = require('fs');
const typebot = JSON.parse(fs.readFileSync(process.argv[2] || 'flow/typebot-export.json', 'utf8'));
const MAX = 20;
let erros = 0;

for (const grupo of typebot.groups) {
  for (const bloco of grupo.blocks) {
    if (bloco.type !== 'choice input') continue;
    for (const item of bloco.items) {
      const texto = item.content || '';
      if (texto.length > MAX) {
        console.log(`${grupo.title} | "${texto}" (${texto.length} caracteres)`);
        erros++;
      }
    }
  }
}

console.log(erros ? `${erros} rótulo(s) acima de ${MAX}.` : 'OK: todos os rótulos cabem em 20 caracteres.');
process.exit(erros ? 1 : 0);