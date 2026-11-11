// Código de partida: la partida guardada convertida en un texto que se puede copiar y pegar en otra
// copia del juego (otra página publicada, otro navegador u otro dispositivo). No sale de ningún sitio
// por sí solo: es el jugador quien lo copia y lo pega. Solo contiene datos del juego.
import { exportar, importar, type GameState, type Save } from './sim.ts';

const PREFIJO = 'SUPER1-';

/** Huella corta (FNV-1a) para detectar códigos copiados a medias o con letras cambiadas. */
function huella(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36).padStart(7, '0').slice(-7);
}

const aBase64Url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deBase64Url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

/** Código para llevarse la partida (y el aspecto) a otra copia del juego. */
export function codigoPartida(s: GameState, aspecto: [number, number]): string {
  const datos: Save & { aspecto: [number, number] } = { ...exportar(s), aspecto };
  const cuerpo = aBase64Url(JSON.stringify(datos));
  return `${PREFIJO}${cuerpo}-${huella(cuerpo)}`;
}

/** Lee un código pegado. Devuelve la partida y el aspecto, o el motivo por el que no vale. */
export function leerCodigo(texto: string): { ok: true; state: GameState; aspecto: [number, number] | null } | { ok: false; motivo: 'formato' | 'incompleto' | 'datos' } {
  const t = texto.replace(/\s+/g, '');
  if (!t.startsWith(PREFIJO) || t.length > 20000) return { ok: false, motivo: 'formato' };
  const resto = t.slice(PREFIJO.length);
  const guion = resto.lastIndexOf('-');
  if (guion < 1) return { ok: false, motivo: 'incompleto' };
  const cuerpo = resto.slice(0, guion), firma = resto.slice(guion + 1);
  if (huella(cuerpo) !== firma) return { ok: false, motivo: 'incompleto' };
  let datos: unknown;
  try { datos = JSON.parse(deBase64Url(cuerpo)); } catch { return { ok: false, motivo: 'datos' }; }
  const state = importar(datos);
  if (!state) return { ok: false, motivo: 'datos' };
  const a = (datos as { aspecto?: unknown }).aspecto;
  const aspecto = Array.isArray(a) && Number.isInteger(a[0]) && Number.isInteger(a[1]) ? [a[0], a[1]] as [number, number] : null;
  return { ok: true, state, aspecto };
}
