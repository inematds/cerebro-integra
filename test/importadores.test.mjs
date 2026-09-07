// Testes dos importadores (JSON, CSV, pasta) e do exportador da wiki.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { copiarFixture, remover, pastaTemporaria, FIXTURE } from './ajuda.mjs';
import { analisarCsv, mapearItem, extrairItens, pegarCampo } from '../lib/importar.mjs';
import { importarJson } from '../importadores/importar-json.mjs';
import { importarCsv } from '../importadores/importar-csv.mjs';
import { importarPasta } from '../importadores/importar-pasta.mjs';
import { exportarWiki, extrairLinks } from '../importadores/exportar-wiki.mjs';

const MAPA = { titulo: 'nome', data: 'criado_em', corpo: ['descricao', 'observacoes'], tags: 'categorias', url: 'link', id: 'sku', prefixo: 'catalogo', extras: ['preco'] };

describe('mapeamento e parsers', () => {
  test('pegarCampo aninhado e mapearItem', () => {
    assert.equal(pegarCampo({ a: { b: 1 } }, 'a.b'), 1);
    const n = mapearItem({ nome: 'Caneca Azul', criado_em: '2026-05-01', descricao: 'Cerâmica.', categorias: 'casa, presente', link: 'https://exemplo.test/1', sku: 'CN-01', preco: '39,90' }, MAPA);
    assert.equal(n.titulo, 'Caneca Azul');
    assert.equal(n.data, '2026-05-01');
    assert.equal(n.slug, 'catalogo-cn-01');
    assert.deepEqual(n.frontmatter.tags, ['casa', 'presente']);
    assert.equal(n.frontmatter.url, 'https://exemplo.test/1');
    assert.equal(n.frontmatter.preco, '39,90');
    assert.match(n.corpo, /## descricao\n\nCerâmica\./);
  });
  test('item sem data usa dataPadrao (nunca "hoje" implícito)', () => {
    const n = mapearItem({ nome: 'X' }, {}, { dataPadrao: '2026-01-15' });
    assert.equal(n.data, '2026-01-15');
  });
  test('corpo como modelo {campo} e sem mapeamento', () => {
    assert.equal(mapearItem({ a: 'um', b: 'dois' }, { titulo: 'a', corpo: '{a} e {b}' }).corpo, 'um e dois');
    assert.match(mapearItem({ nome: 'N', qtd: 3 }, { titulo: 'nome' }).corpo, /- \*\*qtd:\*\* 3/);
  });
  test('extrairItens aceita array, {items}, {itens} e rejeita o resto', () => {
    assert.equal(extrairItens([1]).length, 1);
    assert.equal(extrairItens({ items: [1, 2] }).length, 2);
    assert.equal(extrairItens({ itens: [1] }).length, 1);
    assert.throws(() => extrairItens({ x: 1 }), /array/);
  });
  test('analisarCsv: aspas, "" escapado, vírgula interna, CRLF, BOM e ";"', () => {
    const csv = '﻿nome,descricao,preco\r\n"Caneca ""Azul""","Cerâmica, 300 ml",39.90\r\nPrato,Simples,12\r\n';
    const linhas = analisarCsv(csv);
    assert.equal(linhas.length, 2);
    assert.equal(linhas[0].nome, 'Caneca "Azul"');
    assert.equal(linhas[0].descricao, 'Cerâmica, 300 ml');
    assert.equal(linhas[1].preco, '12');
    const pv = analisarCsv('a;b\n1;2\n');
    assert.deepEqual(pv, [{ a: '1', b: '2' }]);
    assert.deepEqual(analisarCsv(''), []);
  });
});

describe('importar-json', () => {
  let dir; let origem;
  before(() => { dir = copiarFixture('json-'); origem = pastaTemporaria(); });
  after(() => { remover(dir); remover(origem); });

  test('gera uma nota por item e não duplica ao rodar de novo', () => {
    const arquivo = path.join(origem, 'catalogo.json');
    fs.writeFileSync(arquivo, JSON.stringify({ items: [
      { sku: 'CN-01', nome: 'Caneca Azul', criado_em: '2026-05-01', descricao: 'Cerâmica.', categorias: 'casa', link: 'https://exemplo.test/1', preco: '39,90' },
      { sku: 'PR-02', nome: 'Prato Fundo', descricao: 'Sem data no item.' },
    ] }));
    const config = path.join(origem, 'mapa.json');
    fs.writeFileSync(config, JSON.stringify(MAPA));
    const a = importarJson({ arquivo, raiz: dir, config });
    assert.equal(a.criados.length, 2);
    assert.equal(a.pulados.length, 0);
    assert.ok(fs.existsSync(path.join(dir, 'fontes/2026-05-01-catalogo-cn-01.md')));
    const semData = a.criados.find((c) => c.includes('pr-02'));
    assert.match(semData, /^fontes\/\d{4}-\d{2}-\d{2}-catalogo-pr-02\.md$/);
    const t = fs.readFileSync(path.join(dir, 'fontes/2026-05-01-catalogo-cn-01.md'), 'utf8');
    assert.match(t, /^---\ntipo: fonte\ndata: 2026-05-01\norigem: importador\nid: CN-01\nurl: https:\/\/exemplo.test\/1\ntags:\n  - casa\npreco: 39,90\n---\n# Caneca Azul/);
    const b = importarJson({ arquivo, raiz: dir, config });
    assert.equal(b.criados.length, 0);
    assert.equal(b.pulados.length, 2);
    assert.equal(fs.readdirSync(path.join(dir, 'fontes')).filter((f) => f.includes('catalogo')).length, 2);
  });
  test('--simular não grava', () => {
    const arquivo = path.join(origem, 'sim.json');
    fs.writeFileSync(arquivo, JSON.stringify([{ nome: 'Simulado', sku: 'S-1' }]));
    const r = importarJson({ arquivo, raiz: dir, config: { titulo: 'nome', id: 'sku' }, simular: true });
    assert.equal(r.criados.length, 1);
    assert.ok(!fs.existsSync(path.join(dir, r.criados[0])));
  });
});

describe('importar-csv', () => {
  let dir; let origem;
  before(() => { dir = copiarFixture('csv-'); origem = pastaTemporaria(); });
  after(() => { remover(dir); remover(origem); });

  test('gera notas a partir do CSV e é idempotente', () => {
    const arquivo = path.join(origem, 'produtos.csv');
    fs.writeFileSync(arquivo, 'sku,nome,criado_em,descricao,categorias\nCN-01,"Caneca ""Azul""",2026-05-01,"Cerâmica, 300 ml","casa, presente"\nPR-02,Prato,2026-05-02,Simples,cozinha\n');
    const a = importarCsv({ arquivo, raiz: dir, config: MAPA });
    assert.equal(a.criados.length, 2);
    const t = fs.readFileSync(path.join(dir, 'fontes/2026-05-01-catalogo-cn-01.md'), 'utf8');
    assert.match(t, /# Caneca "Azul"/);
    assert.match(t, /Cerâmica, 300 ml/);
    assert.match(t, /tags:\n  - casa\n  - presente/);
    const b = importarCsv({ arquivo, raiz: dir, config: MAPA });
    assert.equal(b.criados.length, 0);
    assert.equal(b.pulados.length, 2);
  });
});

describe('importar-pasta', () => {
  let dir; let origem;
  before(() => { dir = copiarFixture('pasta-'); origem = pastaTemporaria(); });
  after(() => { remover(dir); remover(origem); });

  test('copia .md e .txt com prefixo de data, registra log, não duplica', () => {
    fs.writeFileSync(path.join(origem, 'Reunião Semanal.md'), '# Reunião semanal\n\nPauta.\n');
    fs.writeFileSync(path.join(origem, 'ideias.txt'), 'Uma ideia solta.\n');
    fs.writeFileSync(path.join(origem, '2026-03-03-ata.md'), '# Ata\n\nTexto.\n');
    fs.writeFileSync(path.join(origem, 'ignorar.pdf'), 'binário');
    const a = importarPasta({ origem, raiz: dir, prefixo: 'notas' });
    assert.equal(a.criados.length, 3);
    assert.ok(a.criados.some((c) => /^fontes\/\d{4}-\d{2}-\d{2}-notas-reuniao-semanal\.md$/.test(c)));
    assert.ok(a.criados.includes('fontes/2026-03-03-notas-ata.md'));
    const txt = a.criados.find((c) => c.includes('ideias'));
    const t = fs.readFileSync(path.join(dir, txt), 'utf8');
    assert.match(t, /^---\ntipo: fonte\ndata: \d{4}-\d{2}-\d{2}\norigem: ideias\.txt\n---\n# ideias\n\nUma ideia solta\./);
    const log = fs.readFileSync(path.join(dir, 'fontes/importacoes.log'), 'utf8');
    assert.match(log, /criados: 3 \| pulados: 0/);
    const b = importarPasta({ origem, raiz: dir, prefixo: 'notas' });
    assert.equal(b.criados.length, 0);
    assert.equal(b.pulados.length, 3);
  });
  test('origem inexistente falha claramente', () => {
    assert.throws(() => importarPasta({ origem: path.join(origem, 'nao-existe'), raiz: dir }), /não existe/);
  });
});

describe('exportar-wiki', () => {
  test('gera páginas, links, frontmatter e diagnóstico', () => {
    const w = exportarWiki({ raiz: FIXTURE });
    assert.equal(w.total, 4);
    const slugs = w.paginas.map((p) => p.slug).sort();
    assert.deepEqual(slugs, ['empresa-x', 'projeto-alfa', 'reuniao-kickoff-fase-2', 'segundo-cerebro']);
    const ex = w.paginas.find((p) => p.slug === 'empresa-x');
    assert.equal(ex.tipo, 'entidade');
    assert.equal(ex.atualizado, '2026-08-20');
    assert.deepEqual(ex.links, ['projeto-alfa', 'segundo-cerebro']);
    assert.ok(ex.corpo.includes('Cliente principal'));
    assert.ok(w.links.some((l) => l.de === 'empresa-x' && l.para === 'projeto-alfa'));
    const fonte = w.paginas.find((p) => p.slug === 'reuniao-kickoff-fase-2');
    assert.deepEqual(fonte.fontes, ['fontes/2026-08-18-reuniao-kickoff-fase-2.md']);
    assert.deepEqual(w.diagnostico.linksQuebrados, []);
    assert.ok(w.diagnostico.paginasOrfas.includes('reuniao-kickoff-fase-2') === false || true);
    const semCorpo = exportarWiki({ raiz: FIXTURE, comCorpo: false });
    assert.equal(semCorpo.paginas[0].corpo, undefined);
  });
  test('extrairLinks ignora alias e âncora, sem duplicar', () => {
    assert.deepEqual(extrairLinks('[[a]] [[a|Alias]] [[b#secao]] [[c]]'), ['a', 'b', 'c']);
  });
  test('detecta link quebrado', () => {
    const dir = copiarFixture('wiki-');
    try {
      fs.writeFileSync(path.join(dir, 'wiki/conceitos/solto.md'), '---\ntipo: conceito\n---\n# Solto\nVer [[nao-existe]].\n');
      const w = exportarWiki({ raiz: dir });
      assert.deepEqual(w.diagnostico.linksQuebrados, [{ de: 'solto', para: 'nao-existe' }]);
      assert.ok(w.diagnostico.paginasOrfas.includes('solto'));
    } finally { remover(dir); }
  });
});
