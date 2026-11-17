// Protocolo de los mundos compartidos de Bloques. Lo comparten servidor y cliente: tipos y funciones puras.
import type { Game, GEvent, Look, PInput, MobKind, ModId, VerityCmd } from './game.ts';
import type { Slot } from './items.ts';

export const MAX_PLAYERS = 7;
export const TICK_HZ = 20;

export interface WorldInfo { id: string; name: string; players: number; max: number; mods: ModId[] }

export type MClientMsg =
  | { t: 'mlist' }
  | { t: 'mhost'; look?: string; mods?: unknown }
  | { t: 'mjoin'; world: string; look?: string }
  | { t: 'min'; i: unknown }
  | { t: 'mplace' } | { t: 'mcraft'; r: string } | { t: 'mslot'; s: number } | { t: 'mswap'; a: number; b: number } | { t: 'mrespawn' }
  | { t: 'mpause'; v: boolean } | { t: 'mleave' }
  | { t: 'mreport'; pid: string }
  /** Orden de Verity (ya entendida en el dispositivo: el texto escrito no se envía). */
  | { t: 'mcmd'; c: VerityCmd };

/** Jugador tal como viaja por la red. */
export interface NetP { id: string; name: string; look: Look; x: number; y: number; z: number; yaw: number; pitch: number; hp: number; alive: boolean; held: number | null; away: boolean; mine: [number, number, number, number] | null }
export interface MSnapshot {
  tick: number; time: number;
  P: NetP[];
  /** Monstruos: id, tipo, x, y, z, giro, golpeado (1/0) por cada uno. */
  M: number[];
  /** Flechas: x, y, z, vx, vy, vz. */
  A: number[];
  /** Bloques que han cambiado: índice, bloque. */
  ch: number[];
  ev: GEvent[];
  /** Lo tuyo: inventario y casilla elegida. */
  me: { inv: Slot[]; sel: number; food: number };
}

export type MServerMsg =
  | { t: 'mrooms'; rooms: WorldInfo[] }
  | { t: 'mjoined'; you: string; world: { id: string; name: string; seed: number; mods: ModId[] }; edits: number[] }
  | { t: 'ms'; s: MSnapshot }
  | { t: 'error'; msg: string } | { t: 'notice'; msg: string } | { t: 'kicked'; msg: string };

export const MOB_KINDS: MobKind[] = ['zombi', 'esqueleto', 'arana', 'sombra'];
const r2 = (v: number) => Math.round(v * 100) / 100;

export function encodeSnapshot(g: Game, tick: number, pid: string, events: GEvent[], changes: [number, number][]): MSnapshot {
  const me = g.players.find((p) => p.id === pid);
  return {
    tick, time: r2(g.time),
    P: g.players.map((p) => ({
      id: p.id, name: p.name, look: p.look, x: r2(p.body.x), y: r2(p.body.y), z: r2(p.body.z), yaw: r2(p.yaw), pitch: r2(p.pitch),
      hp: p.hp, alive: p.alive, held: p.inv[p.sel]?.id ?? null, away: p.away,
      mine: p.mine && Number.isFinite(p.mine.need) ? [p.mine.x, p.mine.y, p.mine.z, r2(Math.min(1, p.mine.t / p.mine.need))] : null,
    })),
    M: g.mobs.flatMap((m) => [m.id, MOB_KINDS.indexOf(m.kind), r2(m.body.x), r2(m.body.y), r2(m.body.z), r2(m.yaw), m.flash > 0 ? 1 : 0]),
    A: g.arrows.flatMap((a) => [r2(a.x), r2(a.y), r2(a.z), r2(a.vx), r2(a.vy), r2(a.vz)]),
    ch: changes.flat(),
    ev: events,
    me: { inv: me ? me.inv.map((s) => (s ? { ...s } : null)) : [], sel: me?.sel ?? 0, food: me?.food ?? 20 },
  };
}

/** Entrada que llega por la red: siempre acotada (nunca confiar en el cliente). */
export function clampMInput(i: unknown): PInput {
  const a = Array.isArray(i) ? i : [];
  const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0; };
  const yaw = num(a[4], -100, 100);
  return { mx: num(a[0], -1, 1), mz: num(a[1], -1, 1), jump: !!a[2], attack: !!a[3], yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)), pitch: num(a[5], -1.55, 1.55) };
}
export const isLook = (v: unknown): v is Look => v === 'coloso' || v === 'halcon';
