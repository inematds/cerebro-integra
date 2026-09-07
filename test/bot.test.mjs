// Testes do bot de Telegram sem rede: parser de comandos e handler.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { copiarFixture, remover } from './ajuda.mjs';
import {
  interpretarComando, processarMensagem, dividirMensagem, ocultarToken,
  criarClienteTelegram, responderComComando, AJUDA,
} from '../telegram/bot.mjs';

const msg = (text, extra = {}) => ({ message_id: 1, date: 1788782400, chat: { id: 111 }, text, ...extra }); // 2026-09-07 12:00 UTC

describe('interpretarComando', () => {
  test('reconhece comandos, argumentos e @bot', () => {
    assert.deepEqual(interpretarComando('/buscar catálogo fase 2'), { comando: 'buscar', args: 'catálogo fase 2' });
    assert.deepEqual(interpretarComando('/prioridades@MeuBot'), { comando: 'prioridades', args: '' });
    assert.deepEqual(interpretarComando('/start'), { comando: 'ajuda', args: '' });
    assert.deepEqual(interpretarComando('/help'), { comando: 'ajuda', args: '' });
    assert.equal(interpretarComando('/xyz').comando, 'desconhecido');
    assert.deepEqual(interpretarComando('oi, tudo bem?'), { comando: null, args: 'oi, tudo bem?' });
    assert.equal(interpretarComando('/decisao a | b | c').args, 'a | b | c');
  });
});

describe('processarMensagem', () => {
  let dir; let deps;
  before(() => { dir = copiarFixture('bot-'); deps = { raiz: dir, chatsPermitidos: new Set(['111']), escrita: true }; });
  after(() => remover(dir));

  test('ignora chats não permitidos em silêncio', async () => {
    assert.equal(await processarMensagem({ ...msg('/prioridades'), chat: { id: 999 } }, deps), null);
    assert.equal(await processarMensagem(msg('/prioridades'), { ...deps, chatsPermitidos: new Set() }), null);
  });
  test('/ajuda e comando desconhecido', async () => {
    assert.equal(await processarMensagem(msg('/start'), deps), AJUDA);
    assert.match(await processarMensagem(msg('/xyz'), deps), /Comando desconhecido/);
  });
  test('/buscar', async () => {
    const r = await processarMensagem(msg('/buscar catalogo'), deps);
    assert.match(r, /Resultados para "catalogo"/);
    assert.match(r, /fontes\/2026-08-18-reuniao-kickoff-fase-2\.md/);
    assert.equal(await processarMensagem(msg('/buscar'), deps), 'Uso: /buscar <termos>');
    assert.match(await processarMensagem(msg('/buscar zzzznada'), deps), /Nada encontrado/);
  });
  test('/prioridades e /contexto', async () => {
    const p = await processarMensagem(msg('/prioridades'), deps);
    assert.match(p, /^Prioridades:\n1\. Entregar a fase 2/);
    const c = await processarMensagem(msg('/contexto'), deps);
    assert.match(c, /Sobre mim:/);
    assert.match(c, /Sobre o trabalho:/);
  });
  test('/decisao grava; sem escrita recusa', async () => {
    const r = await processarMensagem(msg('/decisao Usar o bot | O bot registra decisões | É rápido'), deps);
    assert.match(r, /Decisão registrada em decisoes\/registro\.md: "2026-09-07: Usar o bot"/);
    assert.match(fs.readFileSync(path.join(dir, 'decisoes/registro.md'), 'utf8'), /\*\*Por quê:\*\* É rápido/);
    assert.equal(await processarMensagem(msg('/decisao só título'), deps), 'Uso: /decisao <título> | <decisão> | <porquê>');
    assert.match(await processarMensagem(msg('/decisao a | b'), { ...deps, escrita: false }), /Escrita desligada/);
  });
  test('/fonte com texto e com encaminhamento; idempotente', async () => {
    const a = await processarMensagem(msg('/fonte Ideia do dia\nTestar o bot com a equipe.'), deps);
    assert.equal(a, 'Fonte gravada: fontes/2026-09-07-ideia-do-dia.md');
    const t = fs.readFileSync(path.join(dir, 'fontes/2026-09-07-ideia-do-dia.md'), 'utf8');
    assert.match(t, /origem: telegram\n---\n# Ideia do dia\n\nIdeia do dia\nTestar o bot/);
    const b = await processarMensagem(msg('/fonte Ideia do dia\noutra'), deps);
    assert.match(b, /Já existia/);
    const enc = await processarMensagem(msg('Mensagem encaminhada de um grupo.', { forward_date: 1788782400, forward_origin: { type: 'hidden_user' } }), deps);
    assert.match(enc, /^Fonte gravada: fontes\/2026-09-07-mensagem-encaminhada-de-um-grupo\.md$/);
    assert.match(await processarMensagem(msg('/fonte'), deps), /^Uso: \/fonte/);
  });
  test('/rotina registra execução e valida uso', async () => {
    const r = await processarMensagem(msg('/rotina importar-catalogo ok 12 notas novas'), deps);
    assert.match(r, /^Execução registrada: importar-catalogo · ok · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    assert.match(fs.readFileSync(path.join(dir, 'rotinas/registro.md'), 'utf8'), /\| importar-catalogo \| ok \| registrado pelo bot \| 12 notas novas \|/);
    const aviso = await processarMensagem(msg('/rotina outra falhou'), deps);
    assert.match(aviso, /não está na tabela/);
    const uso = await processarMensagem(msg('/rotina'), deps);
    assert.match(uso, /Uso: \/rotina .*\nRotinas ativas: importar-catalogo/);
  });
  test('texto livre: RESPONDER_CMD quando existe, senão busca', async () => {
    const chamadas = [];
    const comResponder = { ...deps, responder: async (p) => { chamadas.push(p); return `resposta para: ${p}`; } };
    assert.equal(await processarMensagem(msg('qual a prioridade?'), comResponder), 'resposta para: qual a prioridade?');
    assert.deepEqual(chamadas, ['qual a prioridade?']);
    const semResponder = await processarMensagem(msg('catálogo'), deps);
    assert.match(semResponder, /Resultados para "catálogo"/);
    assert.equal(await processarMensagem(msg(''), deps), null);
  });
});

describe('utilidades do bot', () => {
  test('dividirMensagem respeita 4096 e quebras de linha', () => {
    const linhas = Array.from({ length: 300 }, (_, i) => `linha ${i} ${'x'.repeat(30)}`).join('\n');
    const partes = dividirMensagem(linhas);
    assert.ok(partes.length >= 3);
    assert.ok(partes.every((p) => p.length <= 4096));
    assert.equal(partes.join('\n'), linhas);
    assert.deepEqual(dividirMensagem(''), ['']);
  });
  test('ocultarToken esconde o token e o padrão botNNN:token', () => {
    const t = '123456:ABC-def_ghi';
    assert.equal(ocultarToken(`erro em https://api.telegram.org/bot${t}/getUpdates`, t), 'erro em https://api.telegram.org/bot***/getUpdates');
    assert.equal(ocultarToken('bot999:xyz falhou'), 'bot*** falhou');
  });
  test('cliente do Telegram com fetch falso: getUpdates, sendMessage e erro sem token', async () => {
    const chamadas = [];
    const fetchFalso = async (url, opts) => {
      chamadas.push({ url, corpo: JSON.parse(opts.body) });
      if (url.endsWith('/getUpdates')) return { json: async () => ({ ok: true, result: [{ update_id: 1 }] }) };
      if (url.endsWith('/sendMessage')) return { json: async () => ({ ok: true, result: {} }) };
      return { status: 404, json: async () => ({ ok: false, description: 'Not Found' }) };
    };
    const c = criarClienteTelegram('T0K3N', fetchFalso);
    assert.deepEqual(await c.obterAtualizacoes(5), [{ update_id: 1 }]);
    assert.equal(chamadas[0].corpo.offset, 5);
    await c.enviar(111, 'olá');
    assert.equal(chamadas[1].corpo.text, 'olá');
    await assert.rejects(c.eu(), (e) => !e.message.includes('T0K3N') && /Not Found/.test(e.message));
    const cFalha = criarClienteTelegram('T0K3N', async () => { throw new Error('falha em https://api.telegram.org/botT0K3N/x'); });
    await assert.rejects(cFalha.eu(), (e) => !e.message.includes('T0K3N'));
  });
  test('responderComComando roda o comando com a pergunta no stdin', async () => {
    const r = await responderComComando('cat', 'pergunta de teste', { cwd: process.cwd() });
    assert.equal(r, 'pergunta de teste');
    await assert.rejects(responderComComando('exit 3', 'x', { cwd: process.cwd() }), /código 3/);
  });
});
