#!/usr/bin/env node
// Importa uma planilha CSV para fontes/ (uma nota por linha).
//
// Uso:
//   node importadores/importar-csv.mjs <arquivo.csv> --config <mapa.json> [--cerebro DIR] [--simular] [--separador ";"]
//
// A primeira linha é o cabeçalho; os nomes das colunas são os campos do mapa.
// Parser próprio: aspas duplas, "" como escape, vírgula dentro de aspas, CRLF, BOM.
// Separador detectado automaticamente entre "," e ";" (ou fixado com --separador).
// Idempotente: linha cujo arquivo já existe em fontes/ é pulada.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { localizarCerebro, carregarEnv } from '../lib/cerebro.mjs';
import { importarItens, analisarCsv, lerConfiguracao, dataDoArquivo, lerArgumentos } from '../lib/importar.mjs';

/** Importa o arquivo CSV. Retorna { criados, pulados }. */
export function importarCsv({ arquivo, raiz, config, simular = false, separador }) {
  const raizCerebro = localizarCerebro(raiz);
  const itens = analisarCsv(fs.readFileSync(arquivo, 'utf8'), { separador });
  const mapa = lerConfiguracao(config);
  return importarItens(raizCerebro, itens, mapa, { dataPadrao: dataDoArquivo(arquivo), simular });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  carregarEnv(path.join(process.cwd(), '.env'));
  const { posicionais, opcoes } = lerArgumentos(process.argv.slice(2));
  if (!posicionais[0]) {
    console.error('Uso: node importadores/importar-csv.mjs <arquivo.csv> --config <mapa.json> [--cerebro DIR] [--simular] [--separador ";"]');
    process.exit(1);
  }
  try {
    const r = importarCsv({
      arquivo: posicionais[0],
      raiz: opcoes.cerebro || process.env.CEREBRO_DIR,
      config: opcoes.config,
      simular: Boolean(opcoes.simular),
      separador: typeof opcoes.separador === 'string' ? opcoes.separador : undefined,
    });
    console.log(`${opcoes.simular ? '[simulação] ' : ''}criados: ${r.criados.length} · pulados (já existiam): ${r.pulados.length}`);
    for (const c of r.criados) console.log(`  + ${c}`);
  } catch (e) {
    console.error(`erro: ${e.message}`);
    process.exit(1);
  }
}
