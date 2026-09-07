#!/usr/bin/env node
// Bot de Telegram do cerebro-integra (Bot API, long polling, fetch puro).
//
// Comandos:
//   /buscar <termos>                       busca nos .md do cérebro
//   /prioridades                           lista contexto/prioridades.md
//   /contexto                              resumo de sobre-mim, trabalho, prioridades
//   /decisao <título> | <decisão> | <porquê>   registra em decisoes/registro.md
//   /fonte <texto>  (ou só encaminhe uma mensagem para o bot)
//                                          grava uma nota em fontes/
//   /rotina <id> <ok|falhou> [observação]  registra execução em rotinas/registro.md
//   texto livre                            RESPONDER_CMD (se houver) ou busca
//
// Segurança:
// - Só responde a chats listados em TELEGRAM_CHATS (IDs separados por vírgula).
//   Mensagens de outros chats são ignoradas em silêncio.
// - Escrita (/decisao, /fonte, /rotina) só com CEREBRO_ESCRITA=1.
// - O token nunca é impresso: toda mensagem de erro passa por `ocultarToken`.
//
// Arquitetura: `interpretarComando` e `processarMensagem` são puras (sem rede)
// e testáveis; `iniciarBot` faz o polling e chama `processarMensagem`.

import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  localizarCerebro, buscar, lerPrioridades, lerContexto, registrarDecisao,
  gravarFonte, registrarExecucao, listarRotinas, carregarEnv, hoje,
} from '../lib/cerebro.mjs';

const LIMITE_TELEGRAM = 4096;
const COMANDOS = ['buscar', 'prioridades', 'contexto', 'decisao', 'fonte', 'rotina', 'ajuda', 'start', 'help'];

export const AJUDA = [
  'Comandos do cérebro:',
  '/buscar <termos> · busca nas notas',
  '/prioridades · prioridades do trimestre',
  '/contexto · quem sou, trabalho, prioridades',
  '/decisao <título> | <decisão> | <porquê> · registra decisão',
  '/fonte <texto> · grava nota em fontes/ (ou só encaminhe uma mensagem)',
  '/rotina <id> <ok|falhou> [obs] · registra execução de rotina',
  'Texto livre: responde com o cérebro (ou com a busca).',
].join('\n');

/** Substitui o token por *** em qualquer texto (logs, erros). */
export function ocultarToken(texto, token) {
  const s = String(texto ?? '');
  const semToken = token ? s.split(token).join('***') : s;
  return semToken.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***');
}

/**
 * Interpreta o texto de uma mensagem.
 * Retorna { comando, args } — comando null para texto livre.
 * Aceita "/comando@NomeDoBot" (grupos).
 */
export function interpretarComando(texto) {
  const t = String(texto ?? '').trim();
  const m = t.match(/^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  if (!m) return { comando: null, args: t };
  const comando = m[1].toLowerCase();
  if (!COMANDOS.includes(comando)) return { comando: 'desconhecido', args: t };
  return { comando: comando === 'help' || comando === 'start' ? 'ajuda' : comando, args: (m[2] ?? '').trim() };
}

/** Formata resultados de busca para o Telegram (texto simples). */
export function formatarResultados(resultados, consulta) {
  if (!resultados.length) return `Nada encontrado para "${consulta}".`;
  const linhas = resultados.map((r, i) => `${i + 1}. ${r.titulo}\n   ${r.caminho}\n   ${r.trecho.slice(0, 140)}`);
  return `Resultados para "${consulta}":\n\n${linhas.join('\n\n')}`;
}

/** Quebra um texto em pedaços de até 4096 caracteres, de preferência em quebras de linha. */
export function dividirMensagem(texto, limite = LIMITE_TELEGRAM) {
  const partes = [];
  let resto = String(texto ?? '');
  while (resto.length > limite) {
    let corte = resto.lastIndexOf('\n', limite);
    if (corte < limite / 2) corte = limite;
    partes.push(resto.slice(0, corte));
    resto = resto.slice(corte).replace(/^\n/, '');
  }
  if (resto.length || !partes.length) partes.push(resto);
  return partes;
}

/** Título curto a partir da primeira linha de um texto. */
function tituloDe(texto) {
  const primeira = String(texto).split('\n').map((l) => l.trim()).find(Boolean) ?? 'Nota';
  const limpo = primeira.replace(/^#+\s*/, '');
  return limpo.length > 80 ? `${limpo.slice(0, 77)}...` : limpo;
}

/**
 * Executa RESPONDER_CMD com a pergunta na entrada padrão, dentro da pasta do
 * cérebro. Retorna a saída (limitada). Usado para respostas em texto livre.
 */
export function responderComComando(comando, pergunta, { cwd, timeoutMs = 120000, limite = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const filho = spawn(comando, { shell: true, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let saida = '';
    let erro = '';
    const timer = setTimeout(() => { filho.kill('SIGKILL'); reject(new Error('RESPONDER_CMD demorou demais.')); }, timeoutMs);
    filho.stdout.on('data', (c) => { if (saida.length < limite * 2) saida += c.toString(); });
    filho.stderr.on('data', (c) => { if (erro.length < 2000) erro += c.toString(); });
    filho.on('error', (e) => { clearTimeout(timer); reject(e); });
    filho.on('close', (codigo) => {
      clearTimeout(timer);
      const texto = saida.trim();
      if (codigo !== 0 && !texto) return reject(new Error(`RESPONDER_CMD saiu com código ${codigo}: ${erro.trim().slice(0, 300)}`));
      resolve(texto.length > limite ? `${texto.slice(0, limite - 3)}...` : texto);
    });
    filho.stdin.on('error', () => {});
    filho.stdin.end(pergunta);
  });
}

/**
 * Processa uma mensagem do Telegram e devolve o texto da resposta
 * (ou null para ignorar). Sem rede: tudo que precisa vem em `deps`.
 *
 * deps: {
 *   raiz,                  pasta do cérebro
 *   chatsPermitidos,       Set de IDs (string)
 *   escrita,               boolean
 *   responder,             async (pergunta) => string | undefined
 * }
 */
export async function processarMensagem(mensagem, deps) {
  const { raiz, chatsPermitidos, escrita = false, responder } = deps;
  if (!mensagem || !mensagem.chat) return null;
  const chatId = String(mensagem.chat.id);
  if (!chatsPermitidos || !chatsPermitidos.has(chatId)) return null;

  const texto = mensagem.text ?? mensagem.caption ?? '';
  const encaminhada = Boolean(mensagem.forward_origin || mensagem.forward_date || mensagem.forward_from);
  let { comando, args } = interpretarComando(texto);
  // Mensagem encaminhada sem comando vira fonte automaticamente: é o jeito
  // mais rápido de guardar algo que chegou por outro chat.
  if (comando === null && encaminhada && texto.trim()) { comando = 'fonte'; args = ''; }
  const dataMensagem = mensagem.date ? hoje(new Date(mensagem.date * 1000)) : hoje();
  const exigeEscrita = () => (escrita ? null : 'Escrita desligada. Suba o bot com CEREBRO_ESCRITA=1 para registrar.');

  try {
    switch (comando) {
      case 'ajuda':
        return AJUDA;

      case 'buscar': {
        if (!args) return 'Uso: /buscar <termos>';
        return formatarResultados(buscar(raiz, args, { limite: 5 }), args);
      }

      case 'prioridades': {
        const p = lerPrioridades(raiz);
        if (!p.texto) return 'Ainda não há contexto/prioridades.md neste cérebro.';
        return p.itens.length ? `Prioridades:\n${p.itens.map((i, n) => `${n + 1}. ${i}`).join('\n')}` : p.texto;
      }

      case 'contexto': {
        const c = lerContexto(raiz);
        const blocos = [];
        if (c.sobreMim) blocos.push(`Sobre mim:\n${c.sobreMim}`);
        if (c.sobreOTrabalho) blocos.push(`Sobre o trabalho:\n${c.sobreOTrabalho}`);
        if (c.prioridades) blocos.push(`Prioridades:\n${c.prioridades}`);
        return blocos.length ? blocos.join('\n\n') : 'Este cérebro ainda não tem contexto/. Rode /iniciar no agente.';
      }

      case 'decisao': {
        const bloqueio = exigeEscrita(); if (bloqueio) return bloqueio;
        const partes = args.split('|').map((p) => p.trim());
        if (partes.length < 2 || !partes[0] || !partes[1]) return 'Uso: /decisao <título> | <decisão> | <porquê>';
        const r = registrarDecisao(raiz, { titulo: partes[0], decisao: partes[1], porque: partes[2], responsavel: 'registrado pelo bot', data: dataMensagem });
        return `Decisão registrada em ${r.caminho}: "${r.data}: ${r.titulo}".`;
      }

      case 'fonte': {
        const bloqueio = exigeEscrita(); if (bloqueio) return bloqueio;
        const conteudo = args || (encaminhada ? texto : '');
        if (!conteudo) return 'Uso: /fonte <texto>, ou simplesmente encaminhe uma mensagem para o bot.';
        const r = gravarFonte(raiz, {
          titulo: tituloDe(conteudo),
          corpo: conteudo,
          data: dataMensagem,
          frontmatter: { origem: encaminhada ? 'telegram (encaminhada)' : 'telegram' },
        });
        return r.criado ? `Fonte gravada: ${r.caminho}` : `Já existia uma fonte com esse nome hoje: ${r.caminho}. Nada foi sobrescrito.`;
      }

      case 'rotina': {
        const bloqueio = exigeEscrita(); if (bloqueio) return bloqueio;
        const m = args.match(/^(\S+)\s+(ok|falhou)(?:\s+([\s\S]+))?$/i);
        if (!m) {
          const ids = listarRotinas(raiz).map((r) => r.id);
          return `Uso: /rotina <id> <ok|falhou> [observação]${ids.length ? `\nRotinas ativas: ${ids.join(', ')}` : ''}`;
        }
        const r = registrarExecucao(raiz, { id: m[1], resultado: m[2].toLowerCase(), saida: 'registrado pelo bot', observacao: m[3] ?? '' });
        return `Execução registrada: ${r.id} · ${m[2].toLowerCase()} · ${r.dataHora}${r.rotinaConhecida ? '' : '\n(aviso: esse ID não está na tabela de rotinas ativas)'}`;
      }

      case 'desconhecido':
        return `Comando desconhecido.\n\n${AJUDA}`;

      default: {
        // Texto livre. Com RESPONDER_CMD, o cérebro responde; sem, devolve a busca.
        if (!texto.trim()) return null;
        if (responder) {
          const resposta = await responder(texto);
          if (resposta) return resposta;
        }
        return formatarResultados(buscar(raiz, texto, { limite: 5 }), texto);
      }
    }
  } catch (e) {
    return `Não consegui: ${e.message}`;
  }
}

/** Cliente mínimo da Bot API. `fetchFn` é injetável para testes. */
export function criarClienteTelegram(token, fetchFn = fetch) {
  const base = `https://api.telegram.org/bot${token}`;
  async function chamar(metodo, corpo) {
    let resposta;
    try {
      resposta = await fetchFn(`${base}/${metodo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo ?? {}),
      });
    } catch (e) {
      throw new Error(ocultarToken(e.message, token));
    }
    const json = await resposta.json().catch(() => ({}));
    if (!json.ok) throw new Error(ocultarToken(`Telegram ${metodo}: ${json.description ?? resposta.status}`, token));
    return json.result;
  }
  return {
    obterAtualizacoes: (offset) => chamar('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] }),
    enviar: async (chatId, texto) => {
      for (const parte of dividirMensagem(texto)) {
        await chamar('sendMessage', { chat_id: chatId, text: parte, disable_web_page_preview: true });
      }
    },
    eu: () => chamar('getMe'),
  };
}

/** Loop de polling. Roda até o processo ser encerrado. */
export async function iniciarBot(env = process.env) {
  carregarEnv(path.join(process.cwd(), '.env'), env);
  const token = env.TELEGRAM_TOKEN;
  if (!token) throw new Error('Defina TELEGRAM_TOKEN (token do BotFather).');
  const chats = String(env.TELEGRAM_CHATS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!chats.length) throw new Error('Defina TELEGRAM_CHATS com pelo menos um ID de chat permitido. Sem isso o bot não sobe.');
  const raiz = localizarCerebro(env.CEREBRO_DIR);
  const escrita = env.CEREBRO_ESCRITA === '1';
  const responder = env.RESPONDER_CMD
    ? (pergunta) => responderComComando(env.RESPONDER_CMD, pergunta, { cwd: raiz })
    : undefined;
  const deps = { raiz, chatsPermitidos: new Set(chats), escrita, responder };
  const cliente = criarClienteTelegram(token);

  const eu = await cliente.eu();
  console.log(`[bot] @${eu.username} · cérebro: ${raiz}`);
  console.log(`[bot] chats permitidos: ${chats.length} · escrita: ${escrita ? 'ligada' : 'desligada'} · responder: ${env.RESPONDER_CMD ? 'RESPONDER_CMD' : 'busca'}`);

  let offset = 0;
  for (;;) {
    let atualizacoes = [];
    try {
      atualizacoes = await cliente.obterAtualizacoes(offset);
    } catch (e) {
      console.error(`[bot] erro no polling: ${ocultarToken(e.message, token)}`);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    for (const atualizacao of atualizacoes) {
      offset = atualizacao.update_id + 1;
      const mensagem = atualizacao.message;
      if (!mensagem) continue;
      try {
        const resposta = await processarMensagem(mensagem, deps);
        if (resposta) await cliente.enviar(mensagem.chat.id, resposta);
      } catch (e) {
        console.error(`[bot] erro ao responder: ${ocultarToken(e.message, token)}`);
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  iniciarBot().catch((e) => {
    console.error(`[bot] ${ocultarToken(e.message, process.env.TELEGRAM_TOKEN)}`);
    process.exit(1);
  });
}
