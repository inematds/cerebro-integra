// Testes do núcleo (lib/cerebro.mjs).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { copiarFixture, remover, FIXTURE } from './ajuda.mjs';
import {
  normalizar, slugificar, lerFrontmatter, localizarCerebro, resolverCaminhoSeguro,
  lerPagina, buscar, lerContexto, lerPrioridades, listarProjetos, lerConexoes,
  registrarDecisao, gravarFonte, registrarExecucao, listarRotinas, carregarEnv,
  listarArquivos, extrairData,
} from '../lib/cerebro.mjs';

describe('utilidades de texto', () => {
  test('normalizar remove acentos e caixa', () => {
    assert.equal(normalizar('  Decisão  Ágil '), 'decisao agil');
  });
  test('slugificar gera nome de arquivo seguro', () => {
    assert.equal(slugificar('Reunião de Kickoff: fase 2!'), 'reuniao-de-kickoff-fase-2');
    assert.equal(slugificar('   '), 'sem-titulo');
  });
  test('lerFrontmatter lê chaves e listas', () => {
    const { dados, corpo } = lerFrontmatter('---\ntipo: fonte\nfontes:\n  - a.md\n  - b.md\n---\n# Título\ncorpo');
    assert.equal(dados.tipo, 'fonte');
    assert.deepEqual(dados.fontes, ['a.md', 'b.md']);
    assert.ok(corpo.startsWith('# Título'));
  });
  test('extrairData aceita ISO, DD/MM/AAAA e rejeita lixo', () => {
    assert.equal(extrairData('2026-03-05T10:00:00Z'), '2026-03-05');
    assert.equal(extrairData('05/03/2026'), '2026-03-05');
    assert.equal(extrairData('sem data'), null);
  });
});

describe('localizar e ler', () => {
  test('localizarCerebro aceita caminho explícito e sobe a partir de subpasta', () => {
    assert.equal(localizarCerebro(FIXTURE), FIXTURE);
    assert.equal(localizarCerebro(undefined, { env: {}, cwd: path.join(FIXTURE, 'wiki', 'entidades') }), FIXTURE);
    assert.equal(localizarCerebro(undefined, { env: { CEREBRO_DIR: FIXTURE }, cwd: '/' }), FIXTURE);
  });
  test('localizarCerebro falha com pasta que não é cérebro', () => {
    assert.throws(() => localizarCerebro('/'), /não parece um cérebro|não existe/);
  });
  test('lerPagina lê um arquivo relativo', () => {
    const p = lerPagina(FIXTURE, 'contexto/prioridades.md');
    assert.equal(p.titulo, 'Prioridades do trimestre');
    assert.equal(p.frontmatter.tipo, 'contexto');
    assert.match(p.conteudo, /projeto-alfa/);
  });
  test('bloqueia path traversal: "..", absoluto, codificado e link simbólico', () => {
    assert.throws(() => resolverCaminhoSeguro(FIXTURE, '../package.json'), /fora do cérebro/);
    assert.throws(() => resolverCaminhoSeguro(FIXTURE, 'wiki/../../package.json'), /fora do cérebro/);
    assert.throws(() => resolverCaminhoSeguro(FIXTURE, '/etc/passwd'), /absoluto/);
    assert.throws(() => resolverCaminhoSeguro(FIXTURE, '%2e%2e/package.json'), /fora do cérebro/);
    assert.throws(() => lerPagina(FIXTURE, '../package.json'), /fora do cérebro/);
    const dir = copiarFixture('trav-');
    try {
      fs.symlinkSync('/etc', path.join(dir, 'fuga'));
      assert.throws(() => resolverCaminhoSeguro(dir, 'fuga/hostname'), /fora do cérebro/);
    } finally { remover(dir); }
  });
  test('só lê .md e .txt', () => {
    assert.throws(() => lerPagina(FIXTURE, 'fontes/README.md.bak'), /\.md ou \.txt|não encontrado/);
  });
  test('arquivo inexistente tem código NAO_ENCONTRADO', () => {
    try { lerPagina(FIXTURE, 'nao/existe.md'); assert.fail('deveria lançar'); } catch (e) { assert.equal(e.codigo, 'NAO_ENCONTRADO'); }
  });
  test('listarArquivos ignora pastas de sistema', () => {
    const lista = listarArquivos(FIXTURE);
    assert.ok(lista.includes('contexto/prioridades.md'));
    assert.ok(lista.every((a) => !a.startsWith('.') && !a.includes('node_modules')));
  });
});

describe('busca', () => {
  test('encontra sem acento e ordena por relevância', () => {
    const r = buscar(FIXTURE, 'catalogo');
    assert.ok(r.length >= 2);
    assert.ok(r.every((x) => x.caminho && x.titulo && typeof x.pontos === 'number' && x.trecho));
    for (let i = 1; i < r.length; i += 1) assert.ok(r[i - 1].pontos >= r[i].pontos);
  });
  test('exige todos os termos', () => {
    const r = buscar(FIXTURE, 'kickoff catálogo');
    assert.ok(r.length >= 1);
    assert.ok(r.some((x) => x.caminho.includes('kickoff')));
    assert.equal(buscar(FIXTURE, 'kickoff zzzzinexistente').length, 0);
  });
  test('respeita limite e pasta', () => {
    assert.equal(buscar(FIXTURE, 'projeto', { limite: 1 }).length, 1);
    const soWiki = buscar(FIXTURE, 'projeto', { pasta: 'wiki' });
    assert.ok(soWiki.length > 0 && soWiki.every((x) => x.caminho.startsWith('wiki/')));
  });
  test('consulta vazia retorna vazio', () => {
    assert.deepEqual(buscar(FIXTURE, '   '), []);
  });
});

describe('contexto, prioridades, projetos, conexões', () => {
  test('lerContexto traz os quatro campos', () => {
    const c = lerContexto(FIXTURE);
    assert.match(c.sobreMim, /consultor/i);
    assert.match(c.sobreOTrabalho, /Consultoria/);
    assert.match(c.prioridades, /fase 2/);
    assert.match(c.mapaDeRotas, /contexto\/prioridades\.md/);
  });
  test('lerPrioridades extrai os itens numerados e ignora "Não é prioridade"', () => {
    const p = lerPrioridades(FIXTURE);
    assert.equal(p.itens.length, 3);
    assert.match(p.itens[0], /fase 2/);
    assert.ok(!p.itens.some((i) => /Trocar de ferramenta/.test(i)));
  });
  test('listarProjetos lê projetos/<nome>/README.md', () => {
    const p = listarProjetos(FIXTURE);
    assert.equal(p.length, 1);
    assert.equal(p[0].nome, 'projeto-alfa');
    assert.equal(p[0].estado, 'em andamento');
  });
  test('lerConexoes lê a tabela', () => {
    const c = lerConexoes(FIXTURE);
    assert.equal(c.length, 7);
    assert.equal(c[0].dominio, 'Receita / finanças');
    assert.equal(c[0].mecanismo, 'não conectado');
  });
  test('listarRotinas lê as rotinas ativas', () => {
    const r = listarRotinas(FIXTURE);
    assert.equal(r.length, 1);
    assert.equal(r[0].id, 'importar-catalogo');
  });
});

describe('escrita', () => {
  let dir;
  before(() => { dir = copiarFixture('escrita-'); });
  after(() => remover(dir));

  test('registrarDecisao anexa no formato do kit', () => {
    const r = registrarDecisao(dir, { titulo: 'Usar API local', decisao: 'O site consulta a API.', porque: 'Evita duplicar dados.', data: '2026-09-07' });
    assert.equal(r.data, '2026-09-07');
    const t = fs.readFileSync(path.join(dir, 'decisoes/registro.md'), 'utf8');
    assert.match(t, /## 2026-09-07: Usar API local\n\n\*\*Decisão:\*\* O site consulta a API\.\n\n\*\*Por quê:\*\* Evita duplicar dados\./);
    assert.match(t, /\*\*Alternativas consideradas:\*\*/);
    assert.match(t, /## 2026-08-18: Catálogo passa a viver/); // não perdeu o que existia
    assert.throws(() => registrarDecisao(dir, { titulo: 'x' }), /precisa de/);
  });

  test('gravarFonte cria AAAA-MM-DD-slug.md e não sobrescreve', () => {
    const a = gravarFonte(dir, { titulo: 'Nota de teste', corpo: 'primeira versão', data: '2026-09-07' });
    assert.equal(a.criado, true);
    assert.equal(a.caminho, 'fontes/2026-09-07-nota-de-teste.md');
    const b = gravarFonte(dir, { titulo: 'Nota de teste', corpo: 'segunda versão', data: '2026-09-07' });
    assert.equal(b.criado, false);
    assert.equal(b.caminho, a.caminho);
    const t = fs.readFileSync(path.join(dir, a.caminho), 'utf8');
    assert.match(t, /primeira versão/);
    assert.ok(!t.includes('segunda versão'));
    assert.match(t, /^---\ntipo: fonte\ndata: 2026-09-07\n---\n# Nota de teste/);
  });

  test('registrarExecucao insere logo após o separador da tabela (mais recente no topo)', () => {
    registrarExecucao(dir, { id: 'importar-catalogo', resultado: 'ok', saida: '3 notas', dataHora: '2026-09-06 23:00' });
    const r = registrarExecucao(dir, { id: 'importar-catalogo', resultado: 'falhou', observacao: 'timeout | rede', dataHora: '2026-09-07 23:00' });
    assert.equal(r.rotinaConhecida, true);
    const linhas = fs.readFileSync(path.join(dir, 'rotinas/registro.md'), 'utf8').split('\n');
    const iSep = linhas.findIndex((l, i) => i > linhas.findIndex((x) => x.startsWith('## Registro de execu')) && /^\|---/.test(l));
    assert.match(linhas[iSep + 1], /^\| 2026-09-07 23:00 \| importar-catalogo \| falhou \| — \| timeout \/ rede \|$/);
    assert.match(linhas[iSep + 2], /^\| 2026-09-06 23:00 \| importar-catalogo \| ok \| 3 notas \| — \|$/);
    // A tabela de rotinas ativas continua intacta.
    assert.equal(listarRotinas(dir).length, 1);
  });

  test('registrarExecucao avisa quando o ID não é conhecido', () => {
    const r = registrarExecucao(dir, { id: 'inexistente', resultado: 'ok' });
    assert.equal(r.rotinaConhecida, false);
  });

  test('carregarEnv lê .env sem sobrescrever', () => {
    const arq = path.join(dir, '.env');
    fs.writeFileSync(arq, '# comentário\nCEREBRO_PORTA=4700\nCEREBRO_TOKEN="abc"\nexport X=1\n');
    const destino = { CEREBRO_PORTA: '9999' };
    const carregadas = carregarEnv(arq, destino);
    assert.deepEqual(carregadas, ['CEREBRO_TOKEN', 'X']);
    assert.equal(destino.CEREBRO_PORTA, '9999');
    assert.equal(destino.CEREBRO_TOKEN, 'abc');
  });
});
