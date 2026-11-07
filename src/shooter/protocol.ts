// Protocolo de red del modo cooperativo en línea. Lo comparten servidor y cliente: solo tipos y funciones puras.
import { ENEMY_RADIUS } from './sim.ts';
import type {
  World, Player, Enemy, Bullet, Pickup, Obstacle, Turret, Mine, Trap, Decoy, Strike, GameEvent, Input,
  EnemyType, BulletKind, PickupType, ObstacleKind, WeaponId, ItemId, ToolId, BuildId, Phase,
} from './sim.ts';

export const MAX_PLAYERS = 8;
export const SIM_HZ = 60;
export const SNAPSHOT_EVERY = 3; // 60 / 3 = 20 instantáneas por segundo
export const SHOP_SECONDS = 30;
export const RESTART_SECONDS = 8;
/** Denuncias de jugadores distintos necesarias para retirar a alguien de la sala. */
export const REPORTS_TO_KICK = 3;
/** En salas públicas nunca basta una sola denuncia: así nadie puede echar a otro estando solos los dos. */
export const MIN_REPORTS_PUBLIC = 2;

/**
 * Denuncias necesarias para retirar a un jugador de una sala con `players` jugadores (él incluido).
 * Privada: los demás jugadores bastan si son menos de 3 (es su partida con gente que conocen).
 * Pública: al menos 2 denuncias; si no hay tantos jugadores, no se retira a nadie (queda bloquear y salir).
 */
export function reportsToKick(players: number, isPublic: boolean): number {
  const others = Math.max(1, players - 1);
  return isPublic ? Math.max(MIN_REPORTS_PUBLIC, Math.min(REPORTS_TO_KICK, others)) : Math.min(REPORTS_TO_KICK, others);
}

export interface RoomInfo { id: string; name: string; players: number; max: number; wave: number; main: boolean }
export type ReportReason = 'nombre' | 'conducta';

export type ClientMsg =
  | { t: 'list' }
  | { t: 'join'; room?: string; code?: string; main?: boolean; name: string; character?: string }
  | { t: 'create'; roomName: string; public: boolean; name: string; character?: string }
  | { t: 'in'; i: [number, number, number, number, number] }
  | { t: 'buy'; id: ItemId } | { t: 'weapon'; id: WeaponId } | { t: 'tool'; id: ToolId } | { t: 'build'; id: BuildId }
  | { t: 'ready' } | { t: 'leave' }
  | { t: 'report'; pid: string; reason: ReportReason };

export type ServerMsg =
  | { t: 'rooms'; rooms: RoomInfo[] }
  | { t: 'joined'; you: string; room: { id: string; name: string; code: string | null; public: boolean } }
  | { t: 's'; s: Snapshot }
  | { t: 'error'; msg: string }
  | { t: 'notice'; msg: string }
  | { t: 'kicked'; msg: string };

const ENEMY_T: EnemyType[] = ['chaser', 'tank', 'gunner', 'kamikaze', 'dron', 'jefe'];
const BULLET_K: BulletKind[] = ['bala', 'perdigon', 'fuego', 'rayo', 'tesla', 'granada', 'cohete', 'enemiga'];
const PICKUP_T: PickupType[] = ['health', 'rapid', 'coins'];
const OBST_K: ObstacleKind[] = ['rock', 'tree', 'crate', 'sandbag', 'barricade', 'wall', 'tower', 'medic'];

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Jugador tal como viaja por la red (sin entrada ni temporizadores internos). */
export type NetPlayer = Omit<Player, 'input' | 'cooldown' | 'regenT' | 'droneCd'> & { ready: boolean };

export interface Snapshot {
  tick: number; time: number; wave: number; phase: Phase; toSpawn: number; over: boolean; score: number;
  shopLeft: number; restartLeft: number;
  P: NetPlayer[];
  E: number[]; B: number[]; K: number[]; T: number[]; M: number[]; Tr: number[]; D: number[]; S: number[];
  O?: number[]; // obstáculos: solo cuando cambian (o cada pocos segundos)
  ev: GameEvent[];
}

export function encode(w: World, tick: number, extra: { ready: Set<string>; shopLeft: number; restartLeft: number; events: GameEvent[]; withObstacles: boolean }): Snapshot {
  const P: NetPlayer[] = w.players.map((p) => ({
    id: p.id, name: p.name, color: p.color, alive: p.alive, character: p.character, coins: p.coins, score: p.score, kills: p.kills, wood: p.wood,
    x: r2(p.x), z: r2(p.z), angle: r2(p.angle), hp: p.hp, maxHp: p.maxHp, invuln: r1(p.invuln), rapid: r1(p.rapid),
    weapon: p.weapon, owned: p.owned, tools: p.tools, speedLvl: p.speedLvl, armorLvl: p.armorLvl, dmgLvl: p.dmgLvl,
    magnet: p.magnet, regen: p.regen, drones: p.drones, shield: r1(p.shield), moving: p.moving, ready: extra.ready.has(p.id),
  }));
  const E: number[] = [];
  for (const e of w.enemies) E.push(e.id, ENEMY_T.indexOf(e.type), r2(e.x), r2(e.z), r1(e.hp), e.maxHp, e.flash > 0 ? 1 : 0, e.stun > 0 ? 1 : 0);
  const B: number[] = [];
  for (const b of w.bullets) B.push(b.id, BULLET_K.indexOf(b.kind), r2(b.x), r2(b.z), r1(b.vx), r1(b.vz), r2(b.life), r2(b.maxLife));
  const K: number[] = [];
  for (const k of w.pickups) K.push(k.id, PICKUP_T.indexOf(k.type), r2(k.x), r2(k.z), r1(k.life));
  const T: number[] = [];
  for (const t of w.turrets) T.push(t.id, r2(t.x), r2(t.z), r2(t.angle), Number.isFinite(t.life) ? r1(t.life) : -1, t.tower ?? -1);
  const M: number[] = [];
  for (const m of w.mines) M.push(m.id, r2(m.x), r2(m.z), r1(m.arm));
  const Tr: number[] = [];
  for (const t of w.traps) Tr.push(t.id, r2(t.x), r2(t.z), r2(t.r), r2(t.rot));
  const D: number[] = [];
  for (const d of w.decoys) D.push(d.id, r2(d.x), r2(d.z), r1(d.life));
  const S: number[] = [];
  for (const s of w.strikes) S.push(s.id, r2(s.x), r2(s.z), r2(s.t));
  const snap: Snapshot = {
    tick, time: r2(w.time), wave: w.wave, phase: w.phase, toSpawn: w.toSpawn, over: w.over, score: w.score,
    shopLeft: Math.ceil(extra.shopLeft), restartLeft: Math.ceil(extra.restartLeft), P, E, B, K, T, M, Tr, D, S, ev: extra.events,
  };
  if (extra.withObstacles) {
    const O: number[] = [];
    for (const o of w.obstacles) O.push(o.id, OBST_K.indexOf(o.kind), r2(o.x), r2(o.z), r2(o.r), Number.isFinite(o.hp) ? r1(o.hp) : -1, r2(o.rot), o.maxHp ?? 0);
    snap.O = O;
  }
  return snap;
}

const idle = (): Input => ({ moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, fire: false });

/** Convierte una instantánea en un World que el renderizador entiende. */
export function decode(s: Snapshot, prev: World | null): World {
  const players: Player[] = s.P.map((p) => ({ ...p, input: idle(), cooldown: 0, regenT: 0, droneCd: 0 }));
  const enemies: Enemy[] = [];
  for (let i = 0; i < s.E.length; i += 8) {
    const type = ENEMY_T[s.E[i + 1]];
    enemies.push({ id: s.E[i], type, x: s.E[i + 2], z: s.E[i + 3], hp: s.E[i + 4], maxHp: s.E[i + 5], flash: s.E[i + 6] ? 0.05 : 0, stun: s.E[i + 7] ? 1 : 0,
      speed: 0, r: ENEMY_RADIUS[type], cooldown: 0, side: 0, sideT: 0, ax: 0, az: 0, stuckT: 0 });
  }
  const bullets: Bullet[] = [];
  for (let i = 0; i < s.B.length; i += 8) {
    const kind = BULLET_K[s.B[i + 1]];
    bullets.push({ id: s.B[i], kind, x: s.B[i + 2], z: s.B[i + 3], vx: s.B[i + 4], vz: s.B[i + 5], life: s.B[i + 6], maxLife: s.B[i + 7],
      enemy: kind === 'enemiga', dmg: 0, blast: 0, pierce: 0, hits: [], owner: null });
  }
  const pickups: Pickup[] = [];
  for (let i = 0; i < s.K.length; i += 5) pickups.push({ id: s.K[i], type: PICKUP_T[s.K[i + 1]], x: s.K[i + 2], z: s.K[i + 3], life: s.K[i + 4] });
  const turrets: Turret[] = [];
  for (let i = 0; i < s.T.length; i += 6)
    turrets.push({ id: s.T[i], x: s.T[i + 1], z: s.T[i + 2], angle: s.T[i + 3], life: s.T[i + 4] < 0 ? Infinity : s.T[i + 4], tower: s.T[i + 5] < 0 ? undefined : s.T[i + 5], cooldown: 0, owner: '', dmgMul: 1 });
  const mines: Mine[] = [];
  for (let i = 0; i < s.M.length; i += 4) mines.push({ id: s.M[i], x: s.M[i + 1], z: s.M[i + 2], arm: s.M[i + 3], owner: '' });
  const traps: Trap[] = [];
  for (let i = 0; i < s.Tr.length; i += 5) traps.push({ id: s.Tr[i], x: s.Tr[i + 1], z: s.Tr[i + 2], r: s.Tr[i + 3], rot: s.Tr[i + 4], owner: '' });
  const decoys: Decoy[] = [];
  for (let i = 0; i < s.D.length; i += 4) decoys.push({ id: s.D[i], x: s.D[i + 1], z: s.D[i + 2], life: s.D[i + 3], hp: 1 });
  const strikes: Strike[] = [];
  for (let i = 0; i < s.S.length; i += 4) strikes.push({ id: s.S[i], x: s.S[i + 1], z: s.S[i + 2], t: s.S[i + 3], owner: '' });
  let obstacles: Obstacle[] = prev?.obstacles ?? [];
  if (s.O) {
    obstacles = [];
    for (let i = 0; i < s.O.length; i += 8)
      obstacles.push({ id: s.O[i], kind: OBST_K[s.O[i + 1]], x: s.O[i + 2], z: s.O[i + 3], r: s.O[i + 4], hp: s.O[i + 5] < 0 ? Infinity : s.O[i + 5], rot: s.O[i + 6], maxHp: s.O[i + 7] || undefined });
  }
  const w = {
    arena: 30, players, enemies, bullets, pickups, obstacles, turrets, mines, traps, decoys, strikes,
    phase: s.phase, wave: s.wave, toSpawn: s.toSpawn, spawnTimer: 0, score: s.score, over: s.over, time: s.time,
    events: s.ev, nextId: 0, rand: Math.random,
    get player() { return this.players[0]; },
    get coins() { return this.players[0]?.coins ?? 0; },
    set coins(_v: number) { /* en línea las monedas las decide el servidor */ },
  };
  return w as World;
}

/** Entrada que llega por la red: siempre acotada (nunca confiar en el cliente). */
export function clampInput(i: unknown): Input {
  const a = Array.isArray(i) ? i : [];
  const f = (v: unknown, lim: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(-lim, Math.min(lim, n)) : 0; };
  return { moveX: f(a[0], 1), moveZ: f(a[1], 1), aimX: f(a[2], 100), aimZ: f(a[3], 100), fire: !!a[4] };
}
