// Testes da API HTTP (api/servidor.mjs). Sobe em porta livre (0) e usa fetch.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { copiarFixture, remover } from './ajuda.mjs';
import { criarServidor } from '../api/servidor.mjs';

function subir(opcoes) {
  return new Promise((resolve) => {
    const s = criarServidor(opcoes);
    s.listen(0, '127.0.0.1', () => resolve({ servidor: s, base: `http://127.0.0.1:${s.address().port}` }));
  });
}
const fechar = (s) => new Promise((r) => { s.closeAllConnections?.(); s.close(r); });

describe('API somente leitura, sem token', () => {
  let dir; let servidor; let base;
  before(async () => { dir = copiarFixture('api-'); ({ servidor, base } = await subir({ raiz: dir })); });
  after(async () => { await fechar(servidor); remover(dir); });

  test('GET /saude', async () => {
    const r = await fetch(`${base}/saude`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.escrita, false);
    assert.equal(j.tokenExigido, false);
    assert.ok(Array.isArray(j.rotas));
  });
  test('GET /contexto e /prioridades', async () => {
    const c = await (await fetch(`${base}/contexto`)).json();
    assert.match(c.prioridades, /fase 2/);
    const p = await (await fetch(`${base}/prioridades`)).json();
    assert.equal(p.itens.length, 3);
  });
  test('GET /buscar', async () => {
    const j = await (await fetch(`${base}/buscar?q=cat%C3%A1logo&limite=2`)).json();
    assert.equal(j.consulta, 'catálogo');
    assert.equal(j.resultados.length, 2);
    const vazio = await fetch(`${base}/buscar`);
    assert.equal(vazio.status, 400);
  });
  test('GET /pagina lê e bloqueia traversal', async () => {
    const ok = await fetch(`${base}/pagina?caminho=wiki/entidades/empresa-x.md`);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).frontmatter.tipo, 'entidade');
    const fora = await fetch(`${base}/pagina?caminho=../package.json`);
    assert.equal(fora.status, 403);
    const absoluto = await fetch(`${base}/pagina?caminho=${encodeURIComponent('/etc/passwd')}`);
    assert.equal(absoluto.status, 403);
    const nada = await fetch(`${base}/pagina?caminho=nao/existe.md`);
    assert.equal(nada.status, 404);
  });
  test('GET /projetos, /conexoes, /rotinas', async () => {
    assert.equal((await (await fetch(`${base}/projetos`)).json()).projetos[0].nome, 'projeto-alfa');
    assert.equal((await (await fetch(`${base}/conexoes`)).json()).conexoes.length, 7);
    assert.equal((await (await fetch(`${base}/rotinas`)).json()).rotinas[0].id, 'importar-catalogo');
  });
  test('rota desconhecida → 404 com lista de rotas', async () => {
    const r = await fetch(`${base}/nada`);
    assert.equal(r.status, 404);
    assert.ok((await r.json()).rotas.length > 5);
  });
  test('POST sem CEREBRO_ESCRITA → 403 e nada é gravado', async () => {
    const antes = fs.readFileSync(path.join(dir, 'decisoes/registro.md'), 'utf8');
    const r = await fetch(`${base}/decisao`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: 'x', decisao: 'y' }) });
    assert.equal(r.status, 403);
    assert.equal(fs.readFileSync(path.join(dir, 'decisoes/registro.md'), 'utf8'), antes);
  });
  test('CORS desligado: OPTIONS → 403 e sem cabeçalho', async () => {
    const r = await fetch(`${base}/saude`, { method: 'OPTIONS' });
    assert.equal(r.status, 403);
    const g = await fetch(`${base}/saude`);
    assert.equal(g.headers.get('access-control-allow-origin'), null);
  });
});

describe('API com token e escrita', () => {
  let dir; let servidor; let base;
  const token = 'segredo-de-teste-123';
  const auth = { Authorization: `Bearer ${token}` };
  before(async () => { dir = copiarFixture('api-escrita-'); ({ servidor, base } = await subir({ raiz: dir, token, escrita: true, cors: 'http://localhost:3000' })); });
  after(async () => { await fechar(servidor); remover(dir); });

  test('/saude fica aberta; o resto exige token', async () => {
    assert.equal((await fetch(`${base}/saude`)).status, 200);
    assert.equal((await fetch(`${base}/contexto`)).status, 401);
    assert.equal((await fetch(`${base}/contexto`, { headers: { Authorization: 'Bearer errado' } })).status, 401);
    assert.equal((await fetch(`${base}/contexto`, { headers: auth })).status, 200);
  });
  test('POST /decisao grava', async () => {
    const r = await fetch(`${base}/decisao`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: 'Via API', decisao: 'Funciona.', porque: 'Testado.', data: '2026-09-07' }) });
    assert.equal(r.status, 201);
    assert.match(fs.readFileSync(path.join(dir, 'decisoes/registro.md'), 'utf8'), /## 2026-09-07: Via API/);
  });
  test('POST /fonte grava uma vez e é idempotente', async () => {
    const corpo = JSON.stringify({ titulo: 'Fonte via API', corpo: 'conteúdo', data: '2026-09-07' });
    const a = await (await fetch(`${base}/fonte`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: corpo })).json();
    const b = await (await fetch(`${base}/fonte`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: corpo })).json();
    assert.equal(a.criado, true);
    assert.equal(b.criado, false);
    assert.ok(fs.existsSync(path.join(dir, 'fontes/2026-09-07-fonte-via-api.md')));
  });
  test('POST /rotina/execucao registra', async () => {
    const r = await fetch(`${base}/rotina/execucao`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'importar-catalogo', resultado: 'ok', saida: '12 notas' }) });
    assert.equal(r.status, 201);
    const j = await r.json();
    assert.equal(j.rotinaConhecida, true);
    assert.match(fs.readFileSync(path.join(dir, 'rotinas/registro.md'), 'utf8'), /\| importar-catalogo \| ok \| 12 notas \|/);
  });
  test('POST com JSON inválido → 400; campos faltando → 400', async () => {
    const r = await fetch(`${base}/decisao`, { method: 'POST', headers: auth, body: '{nope' });
    assert.equal(r.status, 400);
    const f = await fetch(`${base}/decisao`, { method: 'POST', headers: auth, body: JSON.stringify({ titulo: 'só título' }) });
    assert.equal(f.status, 400);
  });
  test('CORS ligado devolve a origem', async () => {
    const r = await fetch(`${base}/saude`);
    assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.equal((await fetch(`${base}/saude`, { method: 'OPTIONS' })).status, 204);
  });
});
