#!/usr/bin/env node
// Importa um catálogo ou registros em JSON para fontes/ (uma nota por item).
//
// Uso:
//   node importadores/importar-json.mjs <arquivo.json> --config <mapa.json> [--cerebro DIR] [--simular]
//
// O JSON pode ser um array ou um objeto com "items" (ou itens/dados/data/registros).
// O mapa de campos está documentado em docs/importadores.md.
// Idempotente: item cujo arquivo já existe em fontes/ é pulado.
// Item sem data usa "dataPadrao" do mapa ou a data de modificação do JSON,
// nunca "hoje" — assim rodar amanhã não duplica nada.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { localizarCerebro, carregarEnv } from '../lib/cerebro.mjs';
import { importarItens, extrairItens, lerConfiguracao, dataDoArquivo, lerArgumentos } from '../lib/importar.mjs';

/** Importa o arquivo JSON. Retorna { criados, pulados }. */
export function importarJson({ arquivo, raiz, config, simular = false }) {
  const raizCerebro = localizarCerebro(raiz);
  const json = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const itens = extrairItens(json);
  const mapa = lerConfiguracao(config);
  return importarItens(raizCerebro, itens, mapa, { dataPadrao: dataDoArquivo(arquivo), simular });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  carregarEnv(path.join(process.cwd(), '.env'));
  const { posicionais, opcoes } = lerArgumentos(process.argv.slice(2));
  if (!posicionais[0]) {
    console.error('Uso: node importadores/importar-json.mjs <arquivo.json> --config <mapa.json> [--cerebro DIR] [--simular]');
    process.exit(1);
  }
  try {
    const r = importarJson({
      arquivo: posicionais[0],
      raiz: opcoes.cerebro || process.env.CEREBRO_DIR,
      config: opcoes.config,
      simular: Boolean(opcoes.simular),
    });
    console.log(`${opcoes.simular ? '[simulação] ' : ''}criados: ${r.criados.length} · pulados (já existiam): ${r.pulados.length}`);
    for (const c of r.criados) console.log(`  + ${c}`);
  } catch (e) {
    console.error(`erro: ${e.message}`);
    process.exit(1);
  }
}
