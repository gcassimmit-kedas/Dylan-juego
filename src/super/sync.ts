// Multijugador de dos: el anfitrión simula la tienda y comparte una "foto" compacta del estado;
// el segundo jugador la dibuja y le manda sus acciones. Todo es código puro (se prueba con npm test).
// Lo que llega del otro jugador nunca se da por bueno: se valida campo a campo.
import {
  PRODUCT_IDS, PRODUCTS, MEJORAS, CAMBIO, comprarPedido, reponer, escanear, darCambio, mejorar, empezarTurno, siguienteDia,
  type GameState, type Customer, type CustomerState, type GameEvent, type ProductId, type MejoraId,
} from './sim.ts';

/** Tamaño máximo de lo que se comparte (el canal admite 4 KiB por jugador). */
export const SNAP_MAX_BYTES = 3600;

const ESTADOS: CustomerState[] = ['entrando', 'yendo', 'cogiendo', 'cola', 'saliendo', 'fuera'];
const FASES = ['preparacion', 'turno', 'resumen'] as const;

/** Evento numerado (para que el otro procese cada uno una sola vez). */
export type NumberedEvent = [number, GameEvent];
/** Resultado de una acción del invitado: [número de acción, ok, motivo]. */
export type Resultado = [number, 0 | 1, string];

export interface SnapExtra {
  /** Última acción del invitado ya procesada. */
  ack: number;
  res: Resultado[];
  ev: NumberedEvent[];
  /** `peer` del invitado admitido (para que un tercero sepa que la partida está llena). */
  g: string | null;
  /** 0 en marcha; 1 pausada por el anfitrión; 2 por el invitado. */
  pausa: number;
}

const r2 = (v: number) => Math.round(v * 100);
const lineas = (l: Partial<Record<ProductId, number>> | { product: ProductId; qty: number }[]) =>
  (Array.isArray(l) ? l.map((x) => [x.product, x.qty] as const) : (Object.entries(l) as [ProductId, number][]))
    .filter(([, q]) => q && q > 0).map(([p, q]) => `${PRODUCT_IDS.indexOf(p)}:${q}`).join(',');

function encodeCustomer(c: Customer): (number | string)[] {
  const flags = (c.andando ? 1 : 0) | (c.path.length === 0 ? 2 : 0) | (c.enfadado ? 4 : 0);
  return [c.id, r2(c.x), r2(c.z), r2(c.dir), ESTADOS.indexOf(c.estado), flags, c.caja, c.look,
    Math.round(c.paciencia * 10), Math.round(c.pacienciaMax * 10), c.pago, c.escaneados, lineas(c.cesta), lineas(c.pasados)];
}

/** Foto del estado para el otro jugador (sin semillas ni nada que no necesite para dibujar). */
export function encodeSnap(s: GameState, x: SnapExtra): Record<string, unknown> {
  return {
    v: 1,
    f: FASES.indexOf(s.fase), d: s.dia, r: Math.round(s.reloj * 10), rep: Math.round(s.reputacion),
    est: PRODUCT_IDS.map((p) => s.estantes[p]), alm: PRODUCT_IDS.map((p) => s.almacen[p]),
    of: PRODUCT_IDS.map((p) => s.ofertaRara[p] ?? -1),
    j: s.jugadores.map((j) => [j.dinero, j.ingresos, j.gastos, j.cambioDeMas]),
    k: s.cajas.map((k) => [k.abierta ? 1 : 0, k.musica ? 1 : 0, k.propinas ? 1 : 0, k.cola]),
    st: [s.stats.clientes, s.stats.atendidos, s.stats.perdidos, s.stats.cansados, s.stats.articulos, s.stats.faltas],
    md: s.mejorDia,
    c: s.clientes.map(encodeCustomer),
    ack: x.ack, res: x.res, ev: x.ev, g: x.g, pausa: x.pausa,
  };
}

// ---------- Lectura defensiva ----------

const num = (v: unknown, min: number, max: number, def = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
const int = (v: unknown, min: number, max: number, def = 0) => Math.round(num(v, min, max, def));
const arr = (v: unknown, max = 64): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);

function parseLineas(v: unknown): [ProductId, number][] {
  if (typeof v !== 'string' || v.length > 200) return [];
  const out: [ProductId, number][] = [];
  for (const part of v.split(',')) {
    const [a, b] = part.split(':');
    const p = PRODUCT_IDS[Number(a)];
    const q = Number(b);
    if (p && Number.isInteger(q) && q > 0 && q < 100) out.push([p, q]);
  }
  return out;
}

function parseEvent(e: unknown): GameEvent | null {
  if (!e || typeof e !== 'object') return null;
  const o = e as Record<string, unknown>;
  const id = int(o.id, 0, 1e9), caja = int(o.caja, 0, 1), j = int(o.j, 0, 1);
  const prod = typeof o.product === 'string' && (PRODUCT_IDS as string[]).includes(o.product) ? (o.product as ProductId) : null;
  switch (o.tipo) {
    case 'entra': case 'seVa': return { tipo: o.tipo, id };
    case 'cierre': case 'fin': return { tipo: o.tipo };
    case 'falta': return prod ? { tipo: 'falta', product: prod, id } : null;
    case 'coge': return prod ? { tipo: 'coge', product: prod, qty: int(o.qty, 1, 9), id } : null;
    case 'escanea': return prod ? { tipo: 'escanea', product: prod, id, caja } : null;
    case 'paga': return { tipo: 'paga', billete: int(o.billete, 0, 1e6), total: int(o.total, 0, 1e6), id, caja };
    case 'venta': return { tipo: 'venta', importe: int(o.importe, -1e6, 1e6), cambio: int(o.cambio, 0, 1e6), sobra: int(o.sobra, 0, 1e6), propina: int(o.propina, 0, 1e6), id, caja };
    case 'compra': return { tipo: 'compra', j, coste: int(o.coste, 0, 1e9), lineas: arr(o.lineas, 20).flatMap((l) => {
      const [p, n] = arr(l, 2);
      return typeof p === 'string' && (PRODUCT_IDS as string[]).includes(p) ? [[p as ProductId, int(n, 0, 99)] as [ProductId, number]] : [];
    }) };
    case 'mejora': return typeof o.mejora === 'string' && o.mejora in MEJORAS ? { tipo: 'mejora', j, caja, mejora: o.mejora as MejoraId } : null;
  }
  return null;
}

/**
 * Vuelca la foto del anfitrión en el estado local del invitado. Devuelve los extras, o null si
 * la foto no tiene buena forma (entonces no se toca nada).
 */
export function decodeSnap(raw: unknown, s: GameState): SnapExtra | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  const est = arr(o.est), alm = arr(o.alm), of = arr(o.of), j = arr(o.j, 2), k = arr(o.k, 2), st = arr(o.st, 6);
  if (est.length !== PRODUCT_IDS.length || alm.length !== PRODUCT_IDS.length || j.length !== 2 || k.length !== 2) return null;
  s.fase = FASES[int(o.f, 0, 2)];
  s.dia = int(o.d, 1, 1e6, 1);
  s.reloj = num(o.r, 0, 1e6) / 10;
  s.reputacion = int(o.rep, 0, 100, 50);
  PRODUCT_IDS.forEach((p, i) => {
    s.estantes[p] = int(est[i], 0, PRODUCTS[p].capacidad);
    s.almacen[p] = int(alm[i], 0, 1e6);
    const v = int(of[i], -1, 9, -1);
    if (v >= 0) s.ofertaRara[p] = v; else delete s.ofertaRara[p];
  });
  j.forEach((row, i) => {
    const [d, ing, gas, cdm] = arr(row, 4);
    Object.assign(s.jugadores[i], { dinero: int(d, -1e9, 1e9), ingresos: int(ing, -1e9, 1e9), gastos: int(gas, 0, 1e9), cambioDeMas: int(cdm, 0, 1e9) });
  });
  k.forEach((row, i) => {
    const [ab, mu, pr, cola] = arr(row, 4);
    Object.assign(s.cajas[i], { abierta: ab === 1, musica: mu === 1, propinas: pr === 1, cola: arr(cola, 12).map((v) => int(v, 0, 1e9)) });
  });
  const [cl, at, pe, ca, ar, fa] = st;
  s.stats = { clientes: int(cl, 0, 1e6), atendidos: int(at, 0, 1e6), perdidos: int(pe, 0, 1e6), cansados: int(ca, 0, 1e6), articulos: int(ar, 0, 1e6), faltas: int(fa, 0, 1e6) };
  s.mejorDia = int(o.md, -1e9, 1e9);
  const prev = new Map(s.clientes.map((c) => [c.id, c]));
  s.clientes = arr(o.c, 20).flatMap((row) => {
    const a = arr(row, 14);
    if (a.length < 14) return [];
    const id = int(a[0], 0, 1e9), flags = int(a[5], 0, 7);
    const cesta = parseLineas(a[12]).map(([product, qty]) => ({ product, qty }));
    const pasados = Object.fromEntries(parseLineas(a[13])) as Partial<Record<ProductId, number>>;
    const old = prev.get(id);
    const c: Customer = {
      id, x: num(a[1], -2000, 2000) / 100, z: num(a[2], -2000, 2000) / 100, dir: num(a[3], -700, 700) / 100,
      estado: ESTADOS[int(a[4], 0, ESTADOS.length - 1)], andando: (flags & 1) === 1,
      // El invitado no simula caminos: solo hace falta saber si ya ha llegado.
      path: (flags & 2) === 2 ? [] : [{ x: 0, z: 0 }],
      enfadado: (flags & 4) === 4, caja: int(a[6], -1, 1, -1), look: int(a[7], 0, 1e6),
      paciencia: num(a[8], 0, 1e5) / 10, pacienciaMax: Math.max(1, num(a[9], 1, 1e5, 380) / 10), pago: int(a[10], 0, 1e6),
      escaneados: int(a[11], 0, 999), cesta, pasados,
      lista: old?.lista ?? [], paso: old?.paso ?? 0, timer: 0,
    };
    return [c];
  });
  return {
    ack: int(o.ack, 0, 1e9),
    res: arr(o.res, 10).flatMap((r) => { const [n, ok, m] = arr(r, 3); return [[int(n, 0, 1e9), ok === 1 ? 1 : 0, typeof m === 'string' ? m.slice(0, 20) : ''] as Resultado]; }),
    ev: arr(o.ev, 16).flatMap((e) => { const [n, ev] = arr(e, 2); const g = parseEvent(ev); return g ? [[int(n, 0, 1e9), g] as NumberedEvent] : []; }),
    g: typeof o.g === 'string' ? o.g.slice(0, 64) : null,
    pausa: int(o.pausa, 0, 2),
  };
}

// ---------- Acciones del invitado ----------

export type Accion =
  | { n: number; t: 'reponer'; p: ProductId }
  | { n: number; t: 'comprar'; pedido: Partial<Record<ProductId, number>> }
  | { n: number; t: 'escanear'; p: ProductId }
  | { n: number; t: 'cambio'; v: number }
  | { n: number; t: 'mejorar'; m: MejoraId; k: number }
  | { n: number; t: 'empezar' }
  | { n: number; t: 'siguiente' }
  | { n: number; t: 'pausa'; v: boolean };

/** Lee una acción que manda el invitado; null si no tiene buena forma. */
export function parseAccion(raw: unknown): Accion | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const n = o.n;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 1e9) return null;
  const prod = typeof o.p === 'string' && (PRODUCT_IDS as string[]).includes(o.p) ? (o.p as ProductId) : null;
  switch (o.t) {
    case 'reponer': return prod ? { n, t: 'reponer', p: prod } : null;
    case 'escanear': return prod ? { n, t: 'escanear', p: prod } : null;
    case 'cambio': return typeof o.v === 'number' && Number.isInteger(o.v) && o.v >= 0 && o.v <= 1e6 ? { n, t: 'cambio', v: o.v } : null;
    case 'comprar': {
      if (!o.pedido || typeof o.pedido !== 'object') return null;
      const pedido: Partial<Record<ProductId, number>> = {};
      for (const [p, q] of Object.entries(o.pedido as Record<string, unknown>)) {
        if (!(PRODUCT_IDS as string[]).includes(p) || typeof q !== 'number' || !Number.isInteger(q) || q < 0 || q > 99) return null;
        pedido[p as ProductId] = q;
      }
      return { n, t: 'comprar', pedido };
    }
    case 'mejorar': return typeof o.m === 'string' && o.m in MEJORAS && (o.k === 0 || o.k === 1) ? { n, t: 'mejorar', m: o.m as MejoraId, k: o.k } : null;
    case 'empezar': case 'siguiente': return { n, t: o.t };
    case 'pausa': return typeof o.v === 'boolean' ? { n, t: 'pausa', v: o.v } : null;
  }
  return null;
}

/**
 * Aplica en el anfitrión una acción del jugador `j` (el invitado es el 1). El invitado solo puede usar
 * su propia caja. Devuelve [ok, motivo] para contárselo. La pausa la gestiona quien llama.
 */
export function aplicarAccion(s: GameState, a: Accion, j: number): [0 | 1, string] {
  switch (a.t) {
    case 'reponer': return reponer(s, a.p) > 0 ? [1, ''] : [0, 'reponer'];
    case 'comprar': { const r = comprarPedido(s, a.pedido, j); return r.ok ? [1, ''] : [0, r.motivo]; }
    case 'escanear': return escanear(s, a.p, j) ? [1, ''] : [0, 'escanear'];
    case 'cambio': { const r = darCambio(s, a.v, j); return r && r.ok ? [1, ''] : [0, r ? `falta:${r.falta}` : 'cambio']; }
    case 'mejorar': { const r = mejorar(s, a.m, a.k, j); return r.ok ? [1, ''] : [0, r.motivo]; }
    case 'empezar': { const antes = s.fase; empezarTurno(s); return s.fase !== antes ? [1, ''] : [0, 'fase']; }
    case 'siguiente': { const antes = s.fase; siguienteDia(s); return s.fase !== antes ? [1, ''] : [0, 'fase']; }
    case 'pausa': return [1, ''];
  }
}

/** Para comprobar en los tests que el cambio se puede dar siempre con lo que hay en el cajón. */
export const VALORES_CAJON = CAMBIO;
