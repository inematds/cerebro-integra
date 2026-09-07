// Funções comuns aos importadores (JSON, CSV, pasta).
//
// Um importador lê registros de fora (catálogo, exportação de banco, planilha)
// e grava UMA nota por registro em fontes/, sem sobrescrever o que já existe.
// O mapeamento de campos vem de um arquivo de configuração JSON.
//
// Exemplo de configuração:
// {
//   "titulo": "nome",                 ← campo (ou caminho a.b.c) com o título
//   "data": "criado_em",              ← campo com a data (opcional)
//   "corpo": ["descricao", "notas"],  ← campo, lista de campos ou modelo "{campo}"
//   "tags": "categorias",             ← campo (string "a, b" ou lista)
//   "url": "link",                    ← campo com o link de origem
//   "id": "sku",                      ← campo estável para o nome do arquivo
//   "prefixo": "catalogo",            ← prefixo do slug (opcional)
//   "extras": ["preco", "estoque"],   ← campos copiados para o frontmatter
//   "dataPadrao": "2026-01-01"        ← usada quando o item não tem data
// }

import fs from 'node:fs';
import path from 'node:path';
import { gravarFonte, extrairData, slugificar, hoje } from './cerebro.mjs';

/** Lê um valor por caminho "a.b.c" num objeto. */
export function pegarCampo(obj, caminho) {
  if (!caminho || obj == null) return undefined;
  return String(caminho).split('.').reduce((acc, parte) => (acc == null ? undefined : acc[parte]), obj);
}

/** Converte qualquer valor em texto legível para Markdown. */
function textoDe(valor) {
  if (valor == null) return '';
  if (Array.isArray(valor)) return valor.map(textoDe).filter(Boolean).join(', ');
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor).trim();
}

/** Lê a configuração de mapeamento. Aceita objeto já pronto ou caminho de JSON. */
export function lerConfiguracao(config) {
  if (!config) return {};
  if (typeof config === 'object') return config;
  return JSON.parse(fs.readFileSync(config, 'utf8'));
}

/**
 * Monta o corpo a partir do mapeamento "corpo":
 * - string com "{campo}": modelo preenchido;
 * - string simples: nome do campo;
 * - lista: cada campo vira uma seção "## campo".
 * Sem mapeamento: todos os campos viram uma lista "- campo: valor".
 */
export function montarCorpo(item, mapa) {
  const m = mapa.corpo;
  if (typeof m === 'string' && m.includes('{')) {
    return m.replace(/\{([\w.]+)\}/g, (_, campo) => textoDe(pegarCampo(item, campo)));
  }
  if (typeof m === 'string') return textoDe(pegarCampo(item, m));
  if (Array.isArray(m)) {
    return m.map((campo) => {
      const v = textoDe(pegarCampo(item, campo));
      return v ? `## ${campo}\n\n${v}` : '';
    }).filter(Boolean).join('\n\n');
  }
  const usados = new Set([mapa.titulo, mapa.data, mapa.tags, mapa.url, mapa.id]);
  return Object.entries(item)
    .filter(([k]) => !usados.has(k))
    .map(([k, v]) => `- **${k}:** ${textoDe(v)}`)
    .join('\n');
}

/**
 * Transforma um item bruto em { titulo, corpo, data, slug, frontmatter }
 * pronto para gravarFonte. `dataPadrao` é usada quando o item não tem data.
 */
export function mapearItem(item, mapa = {}, { dataPadrao } = {}) {
  const titulo = textoDe(pegarCampo(item, mapa.titulo)) || textoDe(item.titulo ?? item.title ?? item.nome ?? item.name) || 'Sem título';
  const data = extrairData(pegarCampo(item, mapa.data)) ?? extrairData(mapa.dataPadrao) ?? extrairData(dataPadrao) ?? hoje();
  const id = textoDe(pegarCampo(item, mapa.id));
  const prefixo = mapa.prefixo ? `${slugificar(mapa.prefixo)}-` : '';
  const slug = `${prefixo}${slugificar(id || titulo)}`;
  const tagsBrutas = pegarCampo(item, mapa.tags);
  const tags = Array.isArray(tagsBrutas)
    ? tagsBrutas.map(textoDe).filter(Boolean)
    : textoDe(tagsBrutas).split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  const frontmatter = { origem: mapa.origem || 'importador' };
  if (id) frontmatter.id = id;
  const url = textoDe(pegarCampo(item, mapa.url));
  if (url) frontmatter.url = url;
  if (tags.length) frontmatter.tags = tags;
  for (const campo of mapa.extras ?? []) {
    const v = textoDe(pegarCampo(item, campo));
    if (v) frontmatter[campo.replace(/[^\w-]/g, '_')] = v;
  }
  return { titulo, corpo: montarCorpo(item, mapa), data, slug, frontmatter };
}

/**
 * Importa uma lista de itens para fontes/. Idempotente: item cujo arquivo já
 * existe é pulado. Retorna { criados: [...], pulados: [...] }.
 * `simular: true` só calcula, não grava.
 */
export function importarItens(raiz, itens, mapa = {}, { dataPadrao, simular = false } = {}) {
  const criados = [];
  const pulados = [];
  for (const item of itens) {
    if (item == null || typeof item !== 'object') continue;
    const nota = mapearItem(item, mapa, { dataPadrao });
    const destino = path.join(raiz, 'fontes', `${nota.data}-${nota.slug}.md`);
    if (fs.existsSync(destino)) { pulados.push(`fontes/${path.basename(destino)}`); continue; }
    if (simular) { criados.push(`fontes/${path.basename(destino)}`); continue; }
    const r = gravarFonte(raiz, nota);
    (r.criado ? criados : pulados).push(r.caminho);
  }
  return { criados, pulados };
}

/** Extrai a lista de itens de um JSON: array, {items}, {itens}, {dados}, {data}, {registros}. */
export function extrairItens(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    for (const chave of ['items', 'itens', 'dados', 'data', 'registros', 'results', 'resultados']) {
      if (Array.isArray(json[chave])) return json[chave];
    }
  }
  throw new Error('JSON precisa ser um array ou um objeto com "items" (ou itens/dados/data/registros).');
}

/**
 * Parser de CSV simples: aspas duplas, "" como escape, vírgula dentro de
 * aspas, CRLF e BOM. Separador detectado entre "," e ";" pela primeira linha.
 * Retorna lista de objetos usando a primeira linha como cabeçalho.
 */
export function analisarCsv(texto, { separador } = {}) {
  let t = String(texto ?? '');
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  const linhas = [];
  let linha = [];
  let campo = '';
  let entreAspas = false;
  const sep = separador ?? (() => {
    const primeira = t.split(/\r?\n/)[0] ?? '';
    return (primeira.split(';').length > primeira.split(',').length) ? ';' : ',';
  })();
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (entreAspas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i += 1; } else entreAspas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { entreAspas = true; continue; }
    if (c === sep) { linha.push(campo); campo = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; continue; }
    campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  const naoVazias = linhas.filter((l) => l.some((v) => v.trim() !== ''));
  if (naoVazias.length === 0) return [];
  const cabecalho = naoVazias[0].map((h) => h.trim());
  return naoVazias.slice(1).map((valores) => {
    const obj = {};
    cabecalho.forEach((h, i) => { obj[h] = (valores[i] ?? '').trim(); });
    return obj;
  });
}

/** Data (AAAA-MM-DD) da última modificação de um arquivo; estável entre execuções. */
export function dataDoArquivo(caminho) {
  try { return hoje(fs.statSync(caminho).mtime); } catch { return null; }
}

/** Analisa argumentos simples: posicionais e --chave valor / --flag. */
export function lerArgumentos(argv) {
  const posicionais = [];
  const opcoes = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const chave = a.slice(2);
      const proximo = argv[i + 1];
      if (proximo !== undefined && !proximo.startsWith('--')) { opcoes[chave] = proximo; i += 1; } else opcoes[chave] = true;
    } else posicionais.push(a);
  }
  return { posicionais, opcoes };
}
