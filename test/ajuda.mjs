// Utilidades de teste: cópia temporária da fixture, sempre única por teste
// (node --test roda arquivos em paralelo).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURE = path.join(RAIZ_REPO, 'test', 'fixture');

/** Copia a fixture para uma pasta temporária e retorna o caminho. */
export function copiarFixture(prefixo = 'cerebro-') {
  const base = path.join(RAIZ_REPO, 'test', 'tmp');
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, prefixo));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

/** Remove uma pasta temporária (ignora erros). */
export function remover(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignorado */ }
}

/** Pasta temporária fora do repo (para origens de importação). */
export function pastaTemporaria(prefixo = 'origem-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
}
