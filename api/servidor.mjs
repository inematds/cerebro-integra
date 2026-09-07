#!/usr/bin/env node
// API HTTP local do cerebro-integra.
//
// Expõe o cérebro (pasta de Markdown) como JSON em 127.0.0.1, para que um
// site, um app, um fluxo n8n ou qualquer outro sistema consulte e escreva
// nele sem tocar nos arquivos diretamente.
//
// Segurança por padrão:
// - Escuta só em loopback (127.0.0.1). Mudar exige CEREBRO_HOST explícito.
// - Token opcional: com CEREBRO_TOKEN definido, exige "Authorization: Bearer".
//   Só /saude fica aberta (para monitoramento).
// - Escrita (POST) desligada: só com CEREBRO_ESCRITA=1.
// - CORS desligado: só com CEREBRO_CORS=<origem> (ou "*").
// - Corpo de POST limitado a 1 MB.
//
// Uso direto:  node api/servidor.mjs
// Uso em teste: import { criarServidor } from './api/servidor.mjs'

import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import {
  localizarCerebro, buscar, lerPagina, lerContexto, lerPrioridades,
  listarProjetos, lerConexoes, registrarDecisao, gravarFonte,
  registrarExecucao, listarRotinas, carregarEnv, versao,
} from '../lib/cerebro.mjs';

export const PORTA_PADRAO = 4650;
const LIMITE_CORPO = 1024 * 1024; // 1 MB

// Rotas documentadas, usadas por /saude e pela resposta 404.
export const ROTAS = [
  'GET /saude', 'GET /contexto', 'GET /prioridades', 'GET /buscar?q=&limite=',
  'GET /pagina?caminho=', 'GET /projetos', 'GET /conexoes', 'GET /rotinas',
  'POST /decisao', 'POST /fonte', 'POST /rotina/execucao',
];

/** Compara o token de forma constante no tempo. */
function tokenConfere(esperado, recebido) {
  if (!esperado) return true;
  if (typeof recebido !== 'string') return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Lê o corpo JSON de um POST, com limite de tamanho. */
function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamanho = 0;
    req.on('data', (c) => {
      tamanho += c.length;
      if (tamanho > LIMITE_CORPO) {
        reject(Object.assign(new Error('Corpo maior que 1 MB.'), { status: 413 }));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on('end', () => {
      const bruto = Buffer.concat(partes).toString('utf8');
      if (!bruto.trim()) return resolve({});
      try { resolve(JSON.parse(bruto)); } catch {
        reject(Object.assign(new Error('JSON inválido.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Cria (sem iniciar) o servidor HTTP.
 * opcoes: { raiz, token, escrita, cors, log }
 * Retorna o http.Server; use .listen(porta, host).
 */
export function criarServidor({ raiz, token = '', escrita = false, cors = '', log = () => {} } = {}) {
  const raizCerebro = localizarCerebro(raiz);

  const responder = (res, status, dados, extra = {}) => {
    const corpo = JSON.stringify(dados, null, 2);
    const cabecalhos = {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(corpo),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    };
    if (cors) {
      cabecalhos['Access-Control-Allow-Origin'] = cors;
      cabecalhos['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
      cabecalhos['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    }
    res.writeHead(status, cabecalhos);
    res.end(corpo);
  };

  const erro = (res, status, mensagem, extra = {}) => responder(res, status, { erro: mensagem, ...extra });

  // Manipuladores de leitura. Cada um recebe (url) e retorna o JSON.
  const leitura = {
    '/saude': () => ({
      ok: true,
      versao: versao(),
      cerebro: path.basename(raizCerebro),
      escrita: Boolean(escrita),
      tokenExigido: Boolean(token),
      rotas: ROTAS,
    }),
    '/contexto': () => lerContexto(raizCerebro),
    '/prioridades': () => lerPrioridades(raizCerebro),
    '/buscar': (url) => {
      const q = url.searchParams.get('q') ?? '';
      if (!q.trim()) throw Object.assign(new Error('Informe ?q= com os termos.'), { status: 400 });
      const limite = Number(url.searchParams.get('limite') ?? 10);
      const pasta = url.searchParams.get('pasta') ?? '';
      const resultados = buscar(raizCerebro, q, { limite, pasta });
      return { consulta: q, total: resultados.length, resultados };
    },
    '/pagina': (url) => {
      const caminho = url.searchParams.get('caminho') ?? '';
      if (!caminho) throw Object.assign(new Error('Informe ?caminho= relativo ao cérebro.'), { status: 400 });
      try {
        return lerPagina(raizCerebro, caminho);
      } catch (e) {
        throw Object.assign(new Error(e.message), { status: e.codigo === 'NAO_ENCONTRADO' ? 404 : 403 });
      }
    },
    '/projetos': () => ({ projetos: listarProjetos(raizCerebro) }),
    '/conexoes': () => ({ conexoes: lerConexoes(raizCerebro) }),
    '/rotinas': () => ({ rotinas: listarRotinas(raizCerebro) }),
  };

  // Manipuladores de escrita. Cada um recebe o corpo JSON e retorna o JSON.
  const escritaRotas = {
    '/decisao': (corpo) => ({ ok: true, ...registrarDecisao(raizCerebro, corpo) }),
    '/fonte': (corpo) => ({ ok: true, ...gravarFonte(raizCerebro, corpo) }),
    '/rotina/execucao': (corpo) => ({ ok: true, ...registrarExecucao(raizCerebro, corpo) }),
  };

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const rota = url.pathname.replace(/\/+$/, '') || '/';
    log(`${req.method} ${rota}`);

    if (req.method === 'OPTIONS') {
      if (!cors) return erro(res, 403, 'CORS desligado. Defina CEREBRO_CORS para permitir.');
      return responder(res, 204, {});
    }

    // /saude fica aberta para monitoramento; o resto exige token quando há.
    if (token && rota !== '/saude') {
      const auth = req.headers.authorization ?? '';
      const recebido = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      if (!tokenConfere(token, recebido)) return erro(res, 401, 'Token ausente ou inválido.');
    }

    try {
      if (req.method === 'GET') {
        const manipulador = leitura[rota];
        if (!manipulador) return erro(res, 404, 'Rota não encontrada.', { rotas: ROTAS });
        return responder(res, 200, manipulador(url));
      }
      if (req.method === 'POST') {
        const manipulador = escritaRotas[rota];
        if (!manipulador) return erro(res, 404, 'Rota não encontrada.', { rotas: ROTAS });
        if (!escrita) return erro(res, 403, 'Escrita desligada. Suba a API com CEREBRO_ESCRITA=1.');
        const corpo = await lerCorpo(req);
        return responder(res, 201, manipulador(corpo));
      }
      return erro(res, 405, 'Método não permitido.');
    } catch (e) {
      const status = e.status ?? (/precisa de|Informe/.test(e.message) ? 400 : 500);
      log(`erro ${status}: ${e.message}`);
      return erro(res, status, e.message);
    }
  });

  servidor.raizCerebro = raizCerebro;
  return servidor;
}

/** Ponto de entrada da linha de comando: lê .env e variáveis, sobe o servidor. */
export function iniciarPelaLinhaDeComando(env = process.env) {
  carregarEnv(path.join(process.cwd(), '.env'), env);
  const porta = Number(env.CEREBRO_PORTA ?? PORTA_PADRAO);
  const host = env.CEREBRO_HOST || '127.0.0.1';
  const servidor = criarServidor({
    raiz: env.CEREBRO_DIR,
    token: env.CEREBRO_TOKEN ?? '',
    escrita: env.CEREBRO_ESCRITA === '1',
    cors: env.CEREBRO_CORS ?? '',
    log: (m) => console.log(`[api] ${m}`),
  });
  servidor.listen(porta, host, () => {
    console.log(`[api] cérebro: ${servidor.raizCerebro}`);
    console.log(`[api] escutando em http://${host}:${porta}`);
    console.log(`[api] token: ${env.CEREBRO_TOKEN ? 'exigido' : 'não configurado'} · escrita: ${env.CEREBRO_ESCRITA === '1' ? 'ligada' : 'desligada'} · cors: ${env.CEREBRO_CORS || 'desligado'}`);
    if (host !== '127.0.0.1' && host !== 'localhost') {
      console.log('[api] AVISO: escutando fora do loopback. Use token e um proxy com HTTPS.');
    }
  });
  return servidor;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    iniciarPelaLinhaDeComando();
  } catch (e) {
    console.error(`[api] ${e.message}`);
    process.exit(1);
  }
}
