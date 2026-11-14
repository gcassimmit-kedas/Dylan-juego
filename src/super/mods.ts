// Mods: cambian números del juego (precios, clientes, ladrones, velocidad...). Son solo datos: nunca
// llevan código, así que no pueden romper el juego ni saltarse las normas de las tiendas (Apple 2.5.2).
// Se añaden pegando un código MOD1-..., abriendo un archivo .json o creándolos en el propio juego.
// Todo lo que llega se valida y se recorta a rangos seguros. Código puro: se prueba con npm test.

/** Lo que puede cambiar un mod. Los multiplicadores valen 1 si no se tocan. */
export interface Efecto {
  /** Precio de venta de cada producto. */
  precio: number;
  /** Lo que cuesta comprar el género (ordenador, Mayorista, Frutería). */
  coste: number;
  /** Cuántos clientes llegan. */
  clientes: number;
  /** Lo que aguantan en la cola. */
  paciencia: number;
  /** Probabilidad de ladrones (0: ninguno). */
  ladrones: number;
  /** Dinero de regalo para cada jugador al empezar cada turno. */
  bono: number;
  /** Velocidad al andar. */
  velocidad: number;
  /** Lo que cansa y ensucia trabajar (0: nunca). */
  cansancio: number;
}
export type EfectoId = keyof Efecto;

/** Rango permitido de cada efecto, paso de los deslizadores y cómo se explica. */
export const EFECTOS: Record<EfectoId, { nombre: string; min: number; max: number; paso: number; neutro: number; tipo: 'x' | 'rd' }> = {
  precio: { nombre: 'Precio de venta', min: 0.5, max: 3, paso: 0.1, neutro: 1, tipo: 'x' },
  coste: { nombre: 'Coste del género', min: 0.25, max: 2, paso: 0.05, neutro: 1, tipo: 'x' },
  clientes: { nombre: 'Clientes', min: 0.5, max: 3, paso: 0.1, neutro: 1, tipo: 'x' },
  paciencia: { nombre: 'Paciencia en la cola', min: 0.5, max: 3, paso: 0.1, neutro: 1, tipo: 'x' },
  ladrones: { nombre: 'Ladrones', min: 0, max: 3, paso: 0.1, neutro: 1, tipo: 'x' },
  bono: { nombre: 'Regalo cada día', min: 0, max: 5000, paso: 100, neutro: 0, tipo: 'rd' },
  velocidad: { nombre: 'Velocidad al andar', min: 0.5, max: 2, paso: 0.1, neutro: 1, tipo: 'x' },
  cansancio: { nombre: 'Cansancio', min: 0, max: 2, paso: 0.1, neutro: 1, tipo: 'x' },
};
export const EFECTO_IDS = Object.keys(EFECTOS) as EfectoId[];

export const NEUTRO: Efecto = Object.fromEntries(EFECTO_IDS.map((k) => [k, EFECTOS[k].neutro])) as unknown as Efecto;

export interface Mod {
  id: string;
  nombre: string;
  desc: string;
  efectos: Partial<Efecto>;
  /** Viene con el juego (no se puede borrar). */
  incluido?: boolean;
}

/** Mods que trae el juego. */
export const INCLUIDOS: Mod[] = [
  { id: 'millonario', nombre: 'Modo millonario', desc: 'Todo se vende al doble y cada día te regalan RD$2000.', efectos: { precio: 2, bono: 2000 }, incluido: true },
  { id: 'tranquila', nombre: 'Tienda tranquila', desc: 'Menos clientes, con mucha paciencia y sin ladrones.', efectos: { clientes: 0.6, paciencia: 2, ladrones: 0 }, incluido: true },
  { id: 'horapunta', nombre: 'Hora punta', desc: 'El doble de clientes, y con algo de prisa.', efectos: { clientes: 2, paciencia: 0.8 }, incluido: true },
  { id: 'peligrosa', nombre: 'Ciudad peligrosa', desc: 'Tres veces más ladrones.', efectos: { ladrones: 3 }, incluido: true },
  { id: 'ofertas', nombre: 'Proveedores en oferta', desc: 'El género cuesta un 40 % menos en todas partes.', efectos: { coste: 0.6 }, incluido: true },
  { id: 'turbo', nombre: 'Zapatillas turbo', desc: 'Andas un 60 % más rápido.', efectos: { velocidad: 1.6 }, incluido: true },
  { id: 'incansable', nombre: 'Incansable', desc: 'Trabajar no cansa ni ensucia.', efectos: { cansancio: 0 }, incluido: true },
];

const clamp = (v: number, k: EfectoId) => Math.min(EFECTOS[k].max, Math.max(EFECTOS[k].min, v));

/** Junta los mods activos: los multiplicadores se multiplican y los regalos se suman (siempre dentro de rango). */
export function combinar(mods: Mod[]): Efecto {
  const e: Efecto = { ...NEUTRO };
  for (const m of mods) for (const k of EFECTO_IDS) {
    const v = m.efectos[k];
    if (typeof v !== 'number') continue;
    e[k] = EFECTOS[k].tipo === 'rd' ? e[k] + v : e[k] * v;
  }
  for (const k of EFECTO_IDS) e[k] = clamp(e[k], k);
  return e;
}

/** Limpia un texto escrito por alguien: sin saltos de línea ni caracteres de control, y corto. */
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Valida un mod que viene de fuera. Devuelve null si no sirve (sin nombre o sin ningún efecto). */
export function validarMod(raw: unknown): Mod | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const nombre = texto(o.nombre, 32);
  const ef = o.efectos;
  if (!nombre || !ef || typeof ef !== 'object') return null;
  const efectos: Partial<Efecto> = {};
  for (const k of EFECTO_IDS) {
    const v = (ef as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const c = clamp(v, k);
      if (c !== EFECTOS[k].neutro) efectos[k] = Math.round(c * 100) / 100;
    }
  }
  if (!Object.keys(efectos).length) return null;
  return { id: 'm' + huella(nombre + JSON.stringify(efectos)), nombre, desc: texto(o.desc, 120) || describir(efectos), efectos };
}

/** Frase con lo que hace un mod. */
export function describir(e: Partial<Efecto>): string {
  const partes: string[] = [];
  for (const k of EFECTO_IDS) {
    const v = e[k];
    if (typeof v !== 'number' || v === EFECTOS[k].neutro) continue;
    const d = EFECTOS[k];
    if (d.tipo === 'rd') partes.push(`${d.nombre}: RD$${Math.round(v)}`);
    else if (v === 0) partes.push(`${d.nombre}: nada`);
    else partes.push(`${d.nombre}: x${String(Math.round(v * 100) / 100).replace('.', ',')}`);
  }
  return partes.join(' · ');
}

// ---------- Código para compartir ----------

const PREFIJO = 'MOD1-';
function huella(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36).padStart(7, '0').slice(-7);
}
const utf8 = (s: string) => String.fromCharCode(...new TextEncoder().encode(s));
const deUtf8 = (s: string) => new TextDecoder().decode(Uint8Array.from(s, (c) => c.charCodeAt(0)));
const aBase64Url = (s: string) => btoa(utf8(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deBase64Url = (s: string) => deUtf8(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)));

/** Código MOD1-... para pasar un mod a otra persona o a otra copia del juego. */
export function codigoMod(m: Mod): string {
  const cuerpo = aBase64Url(JSON.stringify({ v: 1, nombre: m.nombre, desc: m.desc, efectos: m.efectos }));
  return `${PREFIJO}${cuerpo}-${huella(cuerpo)}`;
}

/** Lee un mod pegado: un código MOD1-... o el contenido de un archivo .json. */
export function leerMod(entrada: string): { ok: true; mod: Mod } | { ok: false; motivo: 'formato' | 'incompleto' | 'datos' } {
  const t = entrada.trim();
  if (t.length > 20000) return { ok: false, motivo: 'formato' };
  let datos: unknown;
  if (t.startsWith('{')) {
    try { datos = JSON.parse(t); } catch { return { ok: false, motivo: 'datos' }; }
  } else {
    const c = t.replace(/\s+/g, '');
    if (!c.startsWith(PREFIJO)) return { ok: false, motivo: 'formato' };
    const resto = c.slice(PREFIJO.length), guion = resto.lastIndexOf('-');
    if (guion < 1) return { ok: false, motivo: 'incompleto' };
    const cuerpo = resto.slice(0, guion);
    if (huella(cuerpo) !== resto.slice(guion + 1)) return { ok: false, motivo: 'incompleto' };
    try { datos = JSON.parse(deBase64Url(cuerpo)); } catch { return { ok: false, motivo: 'datos' }; }
  }
  const mod = validarMod(datos);
  return mod ? { ok: true, mod } : { ok: false, motivo: 'datos' };
}

// ---------- Lo que se guarda en el dispositivo ----------

export interface ModsGuardados { activos: string[]; propios: Mod[] }

/** Lee lo guardado validando todo (máximo 30 mods propios). */
export function leerGuardado(raw: unknown): ModsGuardados {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const propios = (Array.isArray(o.propios) ? o.propios.slice(0, 30) : []).flatMap((m) => { const v = validarMod(m); return v ? [v] : []; });
  const ids = new Set([...INCLUIDOS, ...propios].map((m) => m.id));
  const activos = (Array.isArray(o.activos) ? o.activos : []).filter((a): a is string => typeof a === 'string' && ids.has(a));
  return { activos: [...new Set(activos)], propios };
}

/** Efecto de los mods activos (los que no existan se ignoran). */
export function efectoActivo(g: ModsGuardados): Efecto {
  const todos = [...INCLUIDOS, ...g.propios];
  return combinar(g.activos.flatMap((id) => todos.filter((m) => m.id === id)));
}

/** Lee un efecto que manda el anfitrión (multijugador): todo recortado a rango. */
export function leerEfecto(raw: unknown): Efecto {
  const a = Array.isArray(raw) ? raw : [];
  const e = { ...NEUTRO };
  EFECTO_IDS.forEach((k, i) => { const v = a[i]; if (typeof v === 'number' && Number.isFinite(v)) e[k] = clamp(v, k); });
  return e;
}
export const empaquetarEfecto = (e: Efecto) => EFECTO_IDS.map((k) => Math.round(e[k] * 100) / 100);
