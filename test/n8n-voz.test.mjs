// Testes do fluxo n8n (JSON válido e conexões coerentes) e da ponte de voz
// (modo --texto contra a API em processo, com TTS_CMD=cat).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { RAIZ_REPO, FIXTURE } from './ajuda.mjs';
import { criarServidor } from '../api/servidor.mjs';

// spawn assíncrono: o servidor de teste vive neste processo, então um
// spawnSync travaria o event loop e o curl nunca receberia resposta.
function rodar(args, env) {
  return new Promise((resolve) => {
    const p = spawn('bash', args, { env: { ...process.env, ...env } });
    let stdout = ''; let stderr = '';
    p.stdout.on('data', (c) => { stdout += c; });
    p.stderr.on('data', (c) => { stderr += c; });
    p.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

describe('n8n/fluxo-exemplo.json', () => {
  const fluxo = JSON.parse(fs.readFileSync(path.join(RAIZ_REPO, 'n8n/fluxo-exemplo.json'), 'utf8'));
  test('tem a forma de um workflow n8n', () => {
    assert.ok(Array.isArray(fluxo.nodes) && fluxo.nodes.length >= 3);
    assert.equal(fluxo.active, false);
    assert.ok(fluxo.connections && typeof fluxo.connections === 'object');
    for (const n of fluxo.nodes) {
      for (const campo of ['id', 'name', 'type', 'typeVersion', 'position', 'parameters']) assert.ok(campo in n, `nó ${n.name} sem ${campo}`);
    }
  });
  test('toda conexão aponta para um nó existente', () => {
    const nomes = new Set(fluxo.nodes.map((n) => n.name));
    for (const [de, saidas] of Object.entries(fluxo.connections)) {
      assert.ok(nomes.has(de), `origem desconhecida: ${de}`);
      for (const lista of saidas.main) for (const alvo of lista) assert.ok(nomes.has(alvo.node), `destino desconhecido: ${alvo.node}`);
    }
  });
  test('chama /buscar e usa o token via variável de ambiente, nunca literal', () => {
    const http = fluxo.nodes.find((n) => n.type === 'n8n-nodes-base.httpRequest');
    assert.match(http.parameters.url, /\/buscar$/);
    const auth = http.parameters.headerParameters.parameters.find((p) => p.name === 'Authorization');
    assert.match(auth.value, /\$env\.CEREBRO_TOKEN/);
    assert.ok(!JSON.stringify(fluxo).match(/Bearer [A-Za-z0-9]{16,}/));
  });
});

describe('voz/voz.sh', () => {
  const script = path.join(RAIZ_REPO, 'voz/voz.sh');
  let servidor; let base;
  before(async () => {
    servidor = criarServidor({ raiz: FIXTURE, token: 'tok-voz' });
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${servidor.address().port}`;
  });
  after(() => new Promise((r) => { servidor.closeAllConnections?.(); servidor.close(r); }));

  test('sintaxe válida (bash -n)', () => {
    const r = spawnSync('bash', ['-n', script]);
    assert.equal(r.status, 0, r.stderr.toString());
  });
  test('--texto consulta a API e passa a resposta ao TTS_CMD', async () => {
    const saida = path.join(RAIZ_REPO, 'test/tmp/voz-saida.txt');
    fs.mkdirSync(path.dirname(saida), { recursive: true });
    const r = await rodar([script, '--texto', 'catálogo de produtos', '--limite', '2'], {
      CEREBRO_API: base, CEREBRO_TOKEN: 'tok-voz', TTS_CMD: 'cat > "$SAIDA_TTS"', SAIDA_TTS: saida,
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Encontrei \d+ resultados?\. 1\. /);
    assert.match(r.stderr, /\[voz\] pergunta: catálogo de produtos/);
    assert.equal(fs.readFileSync(saida, 'utf8'), r.stdout.trimEnd());
  });
  test('token errado chega como erro falado, não como travamento', async () => {
    const r = await rodar([script, '--texto', 'catálogo', '--sem-tts'], { CEREBRO_API: base, CEREBRO_TOKEN: 'errado' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Erro da API: Token/);
  });
  test('--texto com RESPONDER_CMD usa o comando em vez da API', async () => {
    const r = await rodar([script, '--texto', 'olá', '--sem-tts'], { RESPONDER_CMD: 'sed "s/^/eco: /"', CEREBRO_DIR: FIXTURE });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'eco: olá');
  });
  test('sem STT_CMD e sem --texto falha com mensagem clara', async () => {
    const env = { ...process.env };
    delete env.STT_CMD;
    const p = spawn('bash', [script], { env });
    let stderr = '';
    p.stderr.on('data', (c) => { stderr += c; });
    const status = await new Promise((res) => p.on('close', res));
    assert.equal(status, 1);
    assert.match(stderr, /Defina STT_CMD/);
  });
});
