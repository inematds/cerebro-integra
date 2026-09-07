// Núcleo compartilhado do cerebro-integra.
//
// Tudo que os adaptadores (API, bot, importadores, voz) precisam do cérebro
// passa por aqui: localizar a pasta, buscar, ler com segurança, e escrever
// nos pontos permitidos (fontes/, decisoes/registro.md, rotinas/registro.md).
//
// Regras:
// - Nenhuma dependência npm. Só módulos nativos do Node.
// - Leitura nunca sai da raiz do cérebro (bloqueio de path traversal).
// - Escrita nunca sobrescreve: fonte existente é preservada, registros são
//   anexados.
// - Nenhuma função lê variáveis de ambiente diretamente, exceto
//   `localizarCerebro` quando chamada sem argumentos. Isso mantém tudo
//   testável.

import fs from 'node:fs';
import path from 'node:path';

// Pastas ignoradas na varredura e na busca.
const PASTAS_IGNORADAS = new Set([
  'node_modules', '.git', 'apps', '.claude', '.agents', '.codex', 'dist', 'build',
]);

// Extensões que podem ser lidas e buscadas.
const EXTENSOES_LEGIVEIS = new Set(['.md', '.txt']);

// Arquivos que marcam a raiz de um cérebro.
const MARCADORES = ['AGENTS.md', 'CLAUDE.md', 'conexoes.md', 'contexto'];

// ---------------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------------

/** Remove acentos, baixa a caixa e comprime espaços. Usado na busca. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Transforma um título em slug seguro para nome de arquivo. */
export function slugificar(texto, maximo = 80) {
  const slug = normalizar(texto)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maximo)
    .replace(/-+$/g, '');
  return slug || 'sem-titulo';
}

/** Data de hoje como AAAA-MM-DD (hora local). */
export function hoje(agora = new Date()) {
  const a = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const d = String(agora.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

/** Data e hora como "AAAA-MM-DD HH:MM" (hora local). */
export function agoraFormatado(agora = new Date()) {
  const h = String(agora.getHours()).padStart(2, '0');
  const mi = String(agora.getMinutes()).padStart(2, '0');
  return `${hoje(agora)} ${h}:${mi}`;
}

/**
 * Tenta extrair uma data AAAA-MM-DD de um valor qualquer (string ISO,
 * "DD/MM/AAAA", Date). Retorna null se não conseguir.
 */
export function extrairData(valor) {
  if (!valor) return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return hoje(valor);
  const s = String(valor).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && /\d{4}/.test(s)) return hoje(d);
  return null;
}

/**
 * Lê o frontmatter YAML simples (chave: valor e listas com "- ") do início
 * de um texto Markdown. Retorna { dados, corpo }.
 */
export function lerFrontmatter(texto) {
  const dados = {};
  if (!texto.startsWith('---')) return { dados, corpo: texto };
  const fim = texto.indexOf('\n---', 3);
  if (fim === -1) return { dados, corpo: texto };
  const bloco = texto.slice(3, fim).split('\n');
  let chaveAtual = null;
  for (const linha of bloco) {
    const item = linha.match(/^\s+-\s+(.*)$/);
    if (item && chaveAtual) {
      if (!Array.isArray(dados[chaveAtual])) dados[chaveAtual] = [];
      dados[chaveAtual].push(item[1].trim());
      continue;
    }
    const par = linha.match(/^([\w-]+):\s*(.*)$/);
    if (par) {
      chaveAtual = par[1];
      const valor = par[2].trim();
      dados[chaveAtual] = valor === '' ? '' : valor;
    }
  }
  const corpo = texto.slice(fim + 4).replace(/^\n/, '');
  return { dados, corpo };
}

/** Primeiro título "# ..." de um Markdown, ou o nome do arquivo. */
export function extrairTitulo(texto, caminho = '') {
  const m = texto.match(/^#\s+(.+)$/m);
  if (m) return m[1].trim();
  return path.basename(caminho).replace(/\.(md|txt)$/i, '');
}

/** Monta um bloco de frontmatter a partir de um objeto simples. */
export function montarFrontmatter(dados) {
  const linhas = ['---'];
  for (const [chave, valor] of Object.entries(dados)) {
    if (valor === undefined || valor === null || valor === '') continue;
    if (Array.isArray(valor)) {
      if (valor.length === 0) continue;
      linhas.push(`${chave}:`);
      for (const v of valor) linhas.push(`  - ${String(v).replace(/\n/g, ' ')}`);
    } else {
      linhas.push(`${chave}: ${String(valor).replace(/\n/g, ' ')}`);
    }
  }
  linhas.push('---');
  return linhas.join('\n');
}

// ---------------------------------------------------------------------------
// Localização e leitura segura
// ---------------------------------------------------------------------------

function pareceCerebro(dir) {
  return MARCADORES.some((m) => fs.existsSync(path.join(dir, m)));
}

/**
 * Localiza a raiz do cérebro.
 * Ordem: argumento explícito → env CEREBRO_DIR → pasta atual (subindo até
 * achar um marcador). Lança erro descritivo se não encontrar.
 */
export function localizarCerebro(explicito, { env = process.env, cwd = process.cwd() } = {}) {
  const candidato = explicito || env.CEREBRO_DIR;
  if (candidato) {
    const abs = path.resolve(candidato);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      throw new Error(`Pasta do cérebro não existe: ${abs}`);
    }
    if (!pareceCerebro(abs)) {
      throw new Error(`A pasta ${abs} não parece um cérebro (falta AGENTS.md/CLAUDE.md/conexoes.md/contexto/).`);
    }
    return abs;
  }
  let dir = path.resolve(cwd);
  for (;;) {
    if (pareceCerebro(dir)) return dir;
    const pai = path.dirname(dir);
    if (pai === dir) break;
    dir = pai;
  }
  throw new Error('Cérebro não encontrado. Defina CEREBRO_DIR ou rode dentro da pasta do cérebro.');
}

/**
 * Resolve um caminho relativo dentro da raiz e garante que ele não sai dela,
 * nem por "..", nem por caminho absoluto, nem por link simbólico.
 * Retorna o caminho absoluto real. Lança erro se for inseguro.
 */
export function resolverCaminhoSeguro(raiz, caminho) {
  if (typeof caminho !== 'string' || caminho.length === 0) {
    throw new Error('Caminho vazio.');
  }
  if (caminho.includes('\0')) throw new Error('Caminho inválido.');
  const decodificado = (() => { try { return decodeURIComponent(caminho); } catch { return caminho; } })();
  if (path.isAbsolute(decodificado) || /^[a-zA-Z]:[\\/]/.test(decodificado)) {
    throw new Error('Caminho absoluto não é permitido.');
  }
  const raizReal = fs.realpathSync(raiz);
  const alvo = path.resolve(raizReal, decodificado);
  const dentro = (p) => p === raizReal || p.startsWith(raizReal + path.sep);
  if (!dentro(alvo)) throw new Error('Caminho fora do cérebro.');
  if (fs.existsSync(alvo)) {
    const real = fs.realpathSync(alvo);
    if (!dentro(real)) throw new Error('Caminho fora do cérebro.');
    return real;
  }
  return alvo;
}

/**
 * Lê um arquivo .md/.txt do cérebro com bloqueio de traversal.
 * Retorna { caminho, titulo, frontmatter, conteudo }.
 */
export function lerPagina(raiz, caminho) {
  const abs = resolverCaminhoSeguro(raiz, caminho);
  const ext = path.extname(abs).toLowerCase();
  if (!EXTENSOES_LEGIVEIS.has(ext)) throw new Error('Só arquivos .md ou .txt podem ser lidos.');
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    const erro = new Error(`Arquivo não encontrado: ${caminho}`);
    erro.codigo = 'NAO_ENCONTRADO';
    throw erro;
  }
  const conteudo = fs.readFileSync(abs, 'utf8');
  const { dados } = lerFrontmatter(conteudo);
  const relativo = path.relative(fs.realpathSync(raiz), abs).split(path.sep).join('/');
  return { caminho: relativo, titulo: extrairTitulo(conteudo, abs), frontmatter: dados, conteudo };
}

/**
 * Lista todos os arquivos legíveis do cérebro, como caminhos relativos com
 * barra normal. Ignora pastas de sistema e ocultas.
 */
export function listarArquivos(raiz, { pasta = '' } = {}) {
  const raizReal = fs.realpathSync(raiz);
  const inicio = pasta ? resolverCaminhoSeguro(raizReal, pasta) : raizReal;
  const resultado = [];
  const pilha = [inicio];
  while (pilha.length) {
    const dir = pilha.pop();
    let entradas;
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entradas) {
      if (e.name.startsWith('.') || PASTAS_IGNORADAS.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) pilha.push(abs);
      else if (e.isFile() && EXTENSOES_LEGIVEIS.has(path.extname(e.name).toLowerCase())) {
        resultado.push(path.relative(raizReal, abs).split(path.sep).join('/'));
      }
    }
  }
  return resultado.sort();
}

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------

function trechoEmVolta(conteudo, termo, largura = 160) {
  const idx = normalizar(conteudo).indexOf(termo);
  if (idx === -1) return conteudo.slice(0, largura).replace(/\s+/g, ' ').trim();
  // A normalização não muda o tamanho do texto para caracteres latinos
  // comuns, então o índice serve como aproximação boa o bastante.
  const ini = Math.max(0, idx - Math.floor(largura / 3));
  return conteudo.slice(ini, ini + largura).replace(/\s+/g, ' ').trim();
}

/**
 * Busca por termos (todos os termos, sem acento, sem caixa) em todos os .md
 * e .txt do cérebro. Pontua por ocorrências, com bônus para título e nome
 * do arquivo. Retorna até `limite` resultados ordenados por pontuação.
 */
export function buscar(raiz, consulta, { limite = 10, pasta = '' } = {}) {
  const termos = normalizar(consulta).split(' ').filter((t) => t.length > 1);
  if (termos.length === 0) return [];
  const raizReal = fs.realpathSync(raiz);
  const resultados = [];
  for (const rel of listarArquivos(raizReal, { pasta })) {
    let conteudo;
    try { conteudo = fs.readFileSync(path.join(raizReal, rel), 'utf8'); } catch { continue; }
    const texto = normalizar(conteudo);
    const titulo = extrairTitulo(conteudo, rel);
    const tituloNorm = normalizar(titulo);
    const nomeNorm = normalizar(rel);
    let pontos = 0;
    let todos = true;
    for (const termo of termos) {
      let ocorrencias = 0;
      let i = texto.indexOf(termo);
      while (i !== -1 && ocorrencias < 50) { ocorrencias += 1; i = texto.indexOf(termo, i + termo.length); }
      const noTitulo = tituloNorm.includes(termo) ? 5 : 0;
      const noNome = nomeNorm.includes(termo) ? 3 : 0;
      if (ocorrencias === 0 && !noTitulo && !noNome) { todos = false; break; }
      pontos += ocorrencias + noTitulo + noNome;
    }
    if (!todos) continue;
    resultados.push({ caminho: rel, titulo, pontos, trecho: trechoEmVolta(conteudo, termos[0]) });
  }
  resultados.sort((a, b) => b.pontos - a.pontos || a.caminho.localeCompare(b.caminho));
  const n = Math.max(1, Math.min(Number(limite) || 10, 100));
  return resultados.slice(0, n);
}

// ---------------------------------------------------------------------------
// Contexto, prioridades, projetos, conexões
// ---------------------------------------------------------------------------

function lerSeExistir(raiz, rel) {
  const abs = path.join(raiz, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
}

/** Extrai a seção "## Mapa de rotas" do manual do agente, se houver. */
export function lerMapaDeRotas(raiz) {
  const manual = lerSeExistir(raiz, 'AGENTS.md') ?? lerSeExistir(raiz, 'CLAUDE.md');
  if (!manual) return null;
  const m = manual.match(/^## Mapa de rotas[^\n]*\n([\s\S]*?)(?=^## |\s*$(?![\s\S]))/m);
  return m ? m[1].trim() : null;
}

/**
 * Contexto resumido: sobre-mim, sobre-o-trabalho, prioridades e mapa de
 * rotas. Cada campo é o texto do arquivo sem frontmatter, ou null.
 */
export function lerContexto(raiz) {
  const pegar = (rel) => {
    const t = lerSeExistir(raiz, rel);
    return t === null ? null : lerFrontmatter(t).corpo.trim();
  };
  return {
    sobreMim: pegar('contexto/sobre-mim.md'),
    sobreOTrabalho: pegar('contexto/sobre-o-trabalho.md'),
    prioridades: pegar('contexto/prioridades.md'),
    mapaDeRotas: lerMapaDeRotas(raiz),
  };
}

/**
 * Prioridades: texto e lista de itens (linhas numeradas ou com marcador
 * antes de qualquer seção "Não é prioridade").
 */
export function lerPrioridades(raiz) {
  const t = lerSeExistir(raiz, 'contexto/prioridades.md');
  if (t === null) return { texto: null, itens: [] };
  const { dados, corpo } = lerFrontmatter(t);
  const antesDoNao = corpo.split(/^##\s+n[aã]o\b/im)[0];
  const itens = [];
  for (const linha of antesDoNao.split('\n')) {
    const m = linha.match(/^\s*(?:\d+[.)]|[-*])\s+(.+)$/);
    if (m) itens.push(m[1].replace(/\*\*/g, '').trim());
  }
  return { texto: corpo.trim(), itens, atualizado: dados.atualizado ?? null };
}

/** Projetos ativos: um por subpasta de projetos/ com README.md. */
export function listarProjetos(raiz) {
  const base = path.join(raiz, 'projetos');
  if (!fs.existsSync(base)) return [];
  const projetos = [];
  for (const e of fs.readdirSync(base, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const readme = path.join(base, e.name, 'README.md');
    if (!fs.existsSync(readme)) continue;
    const texto = fs.readFileSync(readme, 'utf8');
    const { dados, corpo } = lerFrontmatter(texto);
    const estado = (corpo.match(/estado:\s*([^\n.]+)/i) || [])[1]?.trim() ?? null;
    projetos.push({
      nome: e.name,
      titulo: extrairTitulo(corpo, readme),
      estado,
      atualizado: dados.atualizado ?? null,
      caminho: `projetos/${e.name}/README.md`,
    });
  }
  return projetos.sort((a, b) => a.nome.localeCompare(b.nome));
}

/** Lê a tabela de conexoes.md como lista de objetos. */
export function lerConexoes(raiz) {
  const t = lerSeExistir(raiz, 'conexoes.md');
  if (t === null) return [];
  const linhas = t.split('\n').filter((l) => l.trim().startsWith('|'));
  if (linhas.length < 2) return [];
  const cabecalho = linhas[0].split('|').slice(1, -1).map((c) => c.trim());
  const conexoes = [];
  for (const linha of linhas.slice(1)) {
    if (/^\|\s*-{2,}/.test(linha)) continue;
    const celulas = linha.split('|').slice(1, -1).map((c) => c.trim());
    if (celulas.length < 2) continue;
    const obj = {};
    cabecalho.forEach((chave, i) => { obj[normalizar(chave).replace(/[^a-z0-9]+/g, '_')] = celulas[i] ?? ''; });
    conexoes.push(obj);
  }
  return conexoes;
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

function garantirPasta(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Anexa uma entrada em decisoes/registro.md no formato do kit.
 * Campos obrigatórios: titulo, decisao. Opcionais: porque, alternativas,
 * responsavel, data (AAAA-MM-DD; padrão hoje).
 */
export function registrarDecisao(raiz, { titulo, decisao, porque, alternativas, responsavel, data } = {}) {
  if (!titulo || !decisao) throw new Error('Decisão precisa de "titulo" e "decisao".');
  const dia = extrairData(data) ?? hoje();
  const arquivo = path.join(raiz, 'decisoes', 'registro.md');
  garantirPasta(path.dirname(arquivo));
  const limpar = (s) => String(s ?? '').replace(/\r/g, '').trim();
  const bloco = [
    `## ${dia}: ${limpar(titulo).replace(/\n/g, ' ')}`,
    '',
    `**Decisão:** ${limpar(decisao)}`,
    '',
    `**Por quê:** ${limpar(porque) || 'não informado.'}`,
    '',
    `**Alternativas consideradas:** ${limpar(alternativas) || 'não informadas.'}`,
    '',
    `**Responsável:** ${limpar(responsavel) || 'não informado.'}`,
    '',
  ].join('\n');
  const existente = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : '# Registro de decisões\n';
  const separador = existente.endsWith('\n') ? '\n' : '\n\n';
  fs.writeFileSync(arquivo, existente + separador + bloco);
  return { caminho: 'decisoes/registro.md', data: dia, titulo: limpar(titulo) };
}

/**
 * Grava uma nota em fontes/ como AAAA-MM-DD-slug.md. Nunca sobrescreve:
 * se o arquivo já existe, retorna { criado: false }.
 * Campos: titulo (obrigatório), corpo, data, slug, frontmatter (objeto extra).
 */
export function gravarFonte(raiz, { titulo, corpo = '', data, slug, frontmatter = {} } = {}) {
  if (!titulo) throw new Error('Fonte precisa de "titulo".');
  const dia = extrairData(data) ?? hoje();
  const nome = `${dia}-${slugificar(slug || titulo)}.md`;
  const pasta = path.join(raiz, 'fontes');
  garantirPasta(pasta);
  const abs = path.join(pasta, nome);
  const rel = `fontes/${nome}`;
  if (fs.existsSync(abs)) return { criado: false, caminho: rel };
  const fm = montarFrontmatter({ tipo: 'fonte', data: dia, ...frontmatter });
  const texto = `${fm}\n# ${String(titulo).replace(/\n/g, ' ').trim()}\n\n${String(corpo).replace(/\r/g, '').trim()}\n`;
  fs.writeFileSync(abs, texto, { flag: 'wx' });
  return { criado: true, caminho: rel };
}

/** IDs das rotinas ativas listadas em rotinas/registro.md. */
export function listarRotinas(raiz) {
  const t = lerSeExistir(raiz, 'rotinas/registro.md');
  if (t === null) return [];
  const secao = t.split(/^## Registro de execu/m)[0];
  const rotinas = [];
  for (const linha of secao.split('\n')) {
    if (!linha.trim().startsWith('|')) continue;
    const c = linha.split('|').slice(1, -1).map((x) => x.trim());
    if (c.length < 2 || c[0] === 'ID' || /^-+$/.test(c[0])) continue;
    rotinas.push({ id: c[0], nome: c[1] ?? '', gatilho: c[2] ?? '', mecanismo: c[3] ?? '' });
  }
  return rotinas;
}

/**
 * Registra uma execução de rotina em rotinas/registro.md, na primeira linha
 * da tabela "Registro de execuções" (mais recente no topo).
 * Campos: id, resultado ("ok" | "falhou" | texto livre), saida, observacao,
 * dataHora (padrão agora).
 */
export function registrarExecucao(raiz, { id, resultado, saida, observacao, dataHora } = {}) {
  if (!id || !resultado) throw new Error('Execução precisa de "id" e "resultado".');
  const arquivo = path.join(raiz, 'rotinas', 'registro.md');
  garantirPasta(path.dirname(arquivo));
  const celula = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim() || '—';
  const quando = dataHora || agoraFormatado();
  const linha = `| ${celula(quando)} | ${celula(id)} | ${celula(resultado)} | ${celula(saida)} | ${celula(observacao)} |`;
  let texto = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : '# Rotinas\n';
  const cabecalho = '## Registro de execuções';
  if (!texto.includes(cabecalho)) {
    texto = `${texto.replace(/\s*$/, '')}\n\n${cabecalho}\n\nMais recente no topo. Uma linha por execução.\n\n| Data e hora | ID | Resultado | Saída produzida | Observação |\n|---|---|---|---|---|\n`;
  }
  const linhas = texto.split('\n');
  const iSecao = linhas.findIndex((l) => l.startsWith(cabecalho));
  let iSeparador = -1;
  for (let i = iSecao + 1; i < linhas.length; i += 1) {
    if (/^\|\s*-{2,}/.test(linhas[i])) { iSeparador = i; break; }
    if (linhas[i].startsWith('## ')) break;
  }
  if (iSeparador === -1) {
    linhas.splice(iSecao + 1, 0, '', '| Data e hora | ID | Resultado | Saída produzida | Observação |', '|---|---|---|---|---|');
    iSeparador = iSecao + 3;
  }
  linhas.splice(iSeparador + 1, 0, linha);
  fs.writeFileSync(arquivo, linhas.join('\n'));
  const conhecida = listarRotinas(raiz).some((r) => r.id === String(id));
  return { caminho: 'rotinas/registro.md', dataHora: quando, id: String(id), rotinaConhecida: conhecida };
}

// ---------------------------------------------------------------------------
// Ambiente
// ---------------------------------------------------------------------------

/**
 * Carrega um arquivo .env simples (CHAVE=valor, # comentários) em `destino`
 * sem sobrescrever variáveis já definidas. Retorna as chaves carregadas.
 */
export function carregarEnv(caminho = path.join(process.cwd(), '.env'), destino = process.env) {
  if (!fs.existsSync(caminho)) return [];
  const carregadas = [];
  for (const bruta of fs.readFileSync(caminho, 'utf8').split('\n')) {
    const linha = bruta.trim();
    if (!linha || linha.startsWith('#')) continue;
    const m = linha.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let valor = m[2].trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    if (destino[m[1]] === undefined) { destino[m[1]] = valor; carregadas.push(m[1]); }
  }
  return carregadas;
}

/** Lê a versão do kit a partir do arquivo VERSION ao lado deste módulo. */
export function versao() {
  try {
    return fs.readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim();
  } catch {
    return '0.0.0';
  }
}
