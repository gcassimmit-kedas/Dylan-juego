// Contador de jugadores: cada aparato suma 1 la primera vez que abre el juego y nunca más.
// No se guarda ni se envía ningún identificador: el aparato solo recuerda en su almacenamiento local que ya se contó,
// y el servidor solo guarda un número total.

/** Clave del almacenamiento local que marca que este aparato ya se contó. */
export const VISIT_KEY = 'shooter.contado';

/** Dirección HTTP del contador a partir de la del WebSocket del servidor (wss://host/ws -> https://host/api/visitas). */
export function visitsUrl(wsUrl: string): string | null {
  let u: URL;
  try { u = new URL(wsUrl); } catch { return null; }
  if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return null;
  return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}/api/visitas`;
}

/** Lee el total que devuelve el servidor; null si la respuesta no es válida. */
export function parseTotal(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null;
  const n = (body as { total?: unknown }).total;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null;
}

/** Texto de la esquina: "1 jugador", "1.234 jugadores". */
export function visitsLabel(total: number): string {
  return `${total.toLocaleString('es-ES')} ${total === 1 ? 'jugador' : 'jugadores'}`;
}

/**
 * Límite en el servidor para que nadie infle el número a mano: como mucho `max` altas por dirección en cada ventana.
 * Las direcciones solo se tienen en memoria durante la ventana y nunca se escriben en disco.
 */
export function createThrottle(max: number, windowMs: number) {
  let start = 0;
  let seen = new Map<string, number>();
  return (key: string, now: number): boolean => {
    if (now - start >= windowMs) { start = now; seen = new Map(); }
    const n = seen.get(key) ?? 0;
    if (n >= max) return false;
    seen.set(key, n + 1);
    return true;
  };
}
