#!/usr/bin/env node
// Exporta a wiki/ do cérebro para um único JSON: páginas, frontmatter,
// links [[slug]] e diagnóstico (links quebrados, páginas órfãs).
// Serve para alimentar uma busca externa, um site estático ou um painel.
//
// Uso:
//   node importadores/exportar-wiki.mjs [--cerebro DIR] [--saida wiki.json] [--sem-corpo]
//
// Sem --saida, imprime o JSON na saída padrão.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { localizarCerebro, carregarEnv, lerFrontmatter, extrairTitulo, listarArquivos } from '../lib/cerebro.mjs';
import { lerArgumentos } from '../lib/importar.mjs';

const LINK = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;

/** Extrai os slugs dos links [[slug]] (sem duplicar, em ordem). */
export function extrairLinks(texto) {
  const vistos = new Set();
  for (const m of texto.matchAll(LINK)) vistos.add(m[1].trim());
  return [...vistos];
}

/** Primeiro parágrafo sem título nem frontmatter, cortado em ~200 caracteres. */
function resumoDe(corpo) {
  const semTitulo = corpo.replace(/^#\s.*$/m, '').trim();
  const paragrafo = semTitulo.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith('#')) ?? '';
  const limpo = paragrafo.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a).replace(/\s+/g, ' ');
  return limpo.length > 200 ? `${limpo.slice(0, 197)}...` : limpo;
}

/** Monta o objeto de exportação da wiki. */
export function exportarWiki({ raiz, comCorpo = true } = {}) {
  const raizCerebro = localizarCerebro(raiz);
  const wikiDir = path.join(raizCerebro, 'wiki');
  if (!fs.existsSync(wikiDir)) throw new Error('Este cérebro não tem a pasta wiki/. Rode /wiki primeiro.');
  const paginas = [];
  for (const rel of listarArquivos(raizCerebro, { pasta: 'wiki' })) {
    const nome = path.basename(rel);
    if (nome === 'README.md' || nome === 'index.md' || nome === 'log.md') continue;
    const texto = fs.readFileSync(path.join(raizCerebro, rel), 'utf8');
    const { dados, corpo } = lerFrontmatter(texto);
    const slug = nome.replace(/\.(md|txt)$/i, '');
    const partes = rel.split('/');
    const pagina = {
      slug,
      caminho: rel,
      categoria: partes.length > 2 ? partes[1] : '',
      titulo: extrairTitulo(corpo, rel),
      tipo: dados.tipo ?? (partes.length > 2 ? partes[1].replace(/s$/, '') : ''),
      atualizado: dados.atualizado ?? null,
      fontes: Array.isArray(dados.fontes) ? dados.fontes : (dados.fontes ? [dados.fontes] : []),
      frontmatter: dados,
      links: extrairLinks(corpo),
      resumo: resumoDe(corpo),
    };
    if (comCorpo) pagina.corpo = corpo.trim();
    paginas.push(pagina);
  }
  const slugs = new Set(paginas.map((p) => p.slug));
  const links = [];
  const quebrados = [];
  const recebem = new Set();
  for (const p of paginas) {
    for (const alvo of p.links) {
      links.push({ de: p.slug, para: alvo });
      if (slugs.has(alvo)) recebem.add(alvo); else quebrados.push({ de: p.slug, para: alvo });
    }
  }
  const orfas = paginas.filter((p) => !recebem.has(p.slug)).map((p) => p.slug);
  return {
    geradoEm: new Date().toISOString(),
    cerebro: path.basename(raizCerebro),
    total: paginas.length,
    paginas,
    links,
    diagnostico: { linksQuebrados: quebrados, paginasOrfas: orfas },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  carregarEnv(path.join(process.cwd(), '.env'));
  const { opcoes } = lerArgumentos(process.argv.slice(2));
  try {
    const dados = exportarWiki({ raiz: opcoes.cerebro || process.env.CEREBRO_DIR, comCorpo: !opcoes['sem-corpo'] });
    const json = JSON.stringify(dados, null, 2);
    if (typeof opcoes.saida === 'string') {
      fs.writeFileSync(opcoes.saida, json);
      console.log(`exportado: ${dados.total} páginas, ${dados.links.length} links → ${opcoes.saida}`);
      if (dados.diagnostico.linksQuebrados.length) console.log(`links quebrados: ${dados.diagnostico.linksQuebrados.length}`);
    } else {
      process.stdout.write(`${json}\n`);
    }
  } catch (e) {
    console.error(`erro: ${e.message}`);
    process.exit(1);
  }
}
