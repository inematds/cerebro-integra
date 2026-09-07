#!/usr/bin/env node
// Copia arquivos .md e .txt de uma pasta externa para fontes/, com prefixo
// de data e registro em fontes/importacoes.log.
//
// Uso:
//   node importadores/importar-pasta.mjs <pasta-de-origem> [--cerebro DIR] [--prefixo nome] [--recursivo] [--simular]
//
// - Nome de destino: AAAA-MM-DD-<prefixo>-<slug-do-nome>.md, com a data de
//   modificação do arquivo original (estável: rodar de novo não duplica).
// - .txt vira .md com um título a partir do nome do arquivo.
// - Arquivo já existente em fontes/ é pulado (nunca sobrescreve).
// - Cada execução anexa uma linha em fontes/importacoes.log.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { localizarCerebro, carregarEnv, slugificar, montarFrontmatter, agoraFormatado, hoje } from '../lib/cerebro.mjs';
import { lerArgumentos } from '../lib/importar.mjs';

function listarOrigem(pasta, recursivo) {
  const saida = [];
  const pilha = [pasta];
  while (pilha.length) {
    const dir = pilha.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { if (recursivo) pilha.push(abs); continue; }
      if (/\.(md|txt)$/i.test(e.name)) saida.push(abs);
    }
  }
  return saida.sort();
}

/** Importa a pasta. Retorna { criados, pulados, log }. */
export function importarPasta({ origem, raiz, prefixo = '', recursivo = false, simular = false }) {
  const raizCerebro = localizarCerebro(raiz);
  const origemAbs = path.resolve(origem);
  if (!fs.existsSync(origemAbs) || !fs.statSync(origemAbs).isDirectory()) {
    throw new Error(`Pasta de origem não existe: ${origemAbs}`);
  }
  const destinoDir = path.join(raizCerebro, 'fontes');
  fs.mkdirSync(destinoDir, { recursive: true });
  const criados = [];
  const pulados = [];
  const pre = prefixo ? `${slugificar(prefixo)}-` : '';
  for (const arquivo of listarOrigem(origemAbs, recursivo)) {
    const stat = fs.statSync(arquivo);
    const base = path.basename(arquivo).replace(/\.(md|txt)$/i, '');
    // Se o nome já começa com data, ela é respeitada; senão usa a data de modificação.
    const dataNoNome = base.match(/^(\d{4}-\d{2}-\d{2})[-_ ]?(.*)$/);
    const data = dataNoNome ? dataNoNome[1] : hoje(stat.mtime);
    const nome = `${data}-${pre}${slugificar(dataNoNome ? dataNoNome[2] || base : base)}.md`;
    const destino = path.join(destinoDir, nome);
    const rel = `fontes/${nome}`;
    if (fs.existsSync(destino)) { pulados.push(rel); continue; }
    if (simular) { criados.push(rel); continue; }
    let conteudo = fs.readFileSync(arquivo, 'utf8');
    if (/\.txt$/i.test(arquivo) || !/^#\s/m.test(conteudo)) {
      const fm = montarFrontmatter({ tipo: 'fonte', data, origem: path.basename(arquivo) });
      conteudo = `${fm}\n# ${base.replace(/[-_]+/g, ' ')}\n\n${conteudo.trim()}\n`;
    }
    fs.writeFileSync(destino, conteudo, { flag: 'wx' });
    criados.push(rel);
  }
  const linhaLog = `${agoraFormatado()} | origem: ${origemAbs} | criados: ${criados.length} | pulados: ${pulados.length}${simular ? ' | simulação' : ''}`;
  if (!simular) fs.appendFileSync(path.join(destinoDir, 'importacoes.log'), `${linhaLog}\n`);
  return { criados, pulados, log: linhaLog };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  carregarEnv(path.join(process.cwd(), '.env'));
  const { posicionais, opcoes } = lerArgumentos(process.argv.slice(2));
  if (!posicionais[0]) {
    console.error('Uso: node importadores/importar-pasta.mjs <pasta> [--cerebro DIR] [--prefixo nome] [--recursivo] [--simular]');
    process.exit(1);
  }
  try {
    const r = importarPasta({
      origem: posicionais[0],
      raiz: opcoes.cerebro || process.env.CEREBRO_DIR,
      prefixo: typeof opcoes.prefixo === 'string' ? opcoes.prefixo : '',
      recursivo: Boolean(opcoes.recursivo),
      simular: Boolean(opcoes.simular),
    });
    console.log(r.log);
    for (const c of r.criados) console.log(`  + ${c}`);
  } catch (e) {
    console.error(`erro: ${e.message}`);
    process.exit(1);
  }
}
