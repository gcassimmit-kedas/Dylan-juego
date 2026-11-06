// Protocolo de red compartido por el servidor y el cliente. Solo tipos y funciones puras.
import type {
  World, Player, Enemy, Bullet, Pickup, Obstacle, Turret, Mine, GameEvent, Input,
  EnemyType, BulletKind, PickupType, ObstacleKind, WeaponId, ItemId, ToolId, Phase,
} from './sim.ts';

export const MAX_PLAYERS = 8;
export const SIM_HZ = 60;
export const SNAPSHOT_EVERY = 3; // 60 / 3 = 20 instantáneas por segundo
export const SHOP_SECONDS = 30;
export const RESTART_SECONDS = 8;

export interface RoomInfo { id: string; name: string; players: number; max: number; wave: number; main: boolean }

export type ClientMsg =
  | { t: 'list' }
  | { t: 'join'; room?: string; code?: string; main?: boolean; name: string }
  | { t: 'create'; roomName: string; public: boolean; name: string }
  | { t: 'in'; i: [number, number, number, number, number] }
  | { t: 'buy'; id: ItemId } | { t: 'weapon'; id: WeaponId } | { t: 'tool'; id: ToolId }
  | { t: 'ready' } | { t: 'leave' };

export type ServerMsg =
  | { t: 'rooms'; rooms: RoomInfo[] }
  | { t: 'joined'; you: string; room: { id: string; name: string; code: string | null; public: boolean } }
  | { t: 's'; s: Snapshot }
  | { t: 'error'; msg: string };

const ENEMY_T: EnemyType[] = ['chaser', 'tank', 'gunner'];
const BULLET_K: BulletKind[] = ['bala', 'perdigon', 'fuego', 'rayo', 'granada', 'cohete', 'enemiga'];
const PICKUP_T: PickupType[] = ['health', 'rapid', 'coins'];
const OBST_K: ObstacleKind[] = ['rock', 'tree', 'crate', 'sandbag', 'barricade'];

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Jugador tal como viaja por la red (sin entrada ni temporizadores internos). */
export type NetPlayer = Omit<Player, 'input' | 'cooldown' | 'regenT' | 'droneCd'> & { ready: boolean };

export interface Snapshot {
  tick: number; time: number; wave: number; phase: Phase; toSpawn: number; over: boolean; score: number;
  shopLeft: number; restartLeft: number;
  P: NetPlayer[];
  E: number[]; B: number[]; K: number[]; T: number[]; M: number[];
  O?: number[]; // obstáculos: solo cuando cambian (o cada pocos segundos)
  ev: GameEvent[];
}

export function encode(w: World, tick: number, extra: { ready: Set<string>; shopLeft: number; restartLeft: number; events: GameEvent[]; withObstacles: boolean }): Snapshot {
  const P: NetPlayer[] = w.players.map((p) => ({
    id: p.id, name: p.name, color: p.color, alive: p.alive, coins: p.coins, score: p.score, kills: p.kills,
    x: r2(p.x), z: r2(p.z), angle: r2(p.angle), hp: p.hp, maxHp: p.maxHp, invuln: r1(p.invuln), rapid: r1(p.rapid),
    weapon: p.weapon, owned: p.owned, tools: p.tools, speedLvl: p.speedLvl, armorLvl: p.armorLvl, dmgLvl: p.dmgLvl,
    magnet: p.magnet, regen: p.regen, drones: p.drones, shield: r1(p.shield), moving: p.moving, ready: extra.ready.has(p.id),
  }));
  const E: number[] = [];
  for (const e of w.enemies) E.push(e.id, ENEMY_T.indexOf(e.type), r2(e.x), r2(e.z), r1(e.hp), e.maxHp, e.flash > 0 ? 1 : 0);
  const B: number[] = [];
  for (const b of w.bullets) B.push(b.id, BULLET_K.indexOf(b.kind), r2(b.x), r2(b.z), r1(b.vx), r1(b.vz), r2(b.life), r2(b.maxLife));
  const K: number[] = [];
  for (const k of w.pickups) K.push(k.id, PICKUP_T.indexOf(k.type), r2(k.x), r2(k.z), r1(k.life));
  const T: number[] = [];
  for (const t of w.turrets) T.push(t.id, r2(t.x), r2(t.z), r2(t.angle), r1(t.life));
  const M: number[] = [];
  for (const m of w.mines) M.push(m.id, r2(m.x), r2(m.z), r1(m.arm));
  const s: Snapshot = {
    tick, time: r2(w.time), wave: w.wave, phase: w.phase, toSpawn: w.toSpawn, over: w.over, score: w.score,
    shopLeft: Math.ceil(extra.shopLeft), restartLeft: Math.ceil(extra.restartLeft), P, E, B, K, T, M, ev: extra.events,
  };
  if (extra.withObstacles) {
    const O: number[] = [];
    for (const o of w.obstacles) O.push(o.id, OBST_K.indexOf(o.kind), r2(o.x), r2(o.z), r2(o.r), Number.isFinite(o.hp) ? r1(o.hp) : -1, r2(o.rot));
    s.O = O;
  }
  return s;
}

const idle = (): Input => ({ moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, fire: false });

/** Convierte una instantánea en un World que el renderizador entiende. */
export function decode(s: Snapshot, prev: World | null): World {
  const players: Player[] = s.P.map((p) => ({ ...p, input: idle(), cooldown: 0, regenT: 0, droneCd: 0 }));
  const enemies: Enemy[] = [];
  for (let i = 0; i < s.E.length; i += 7) {
    const type = ENEMY_T[s.E[i + 1]];
    enemies.push({ id: s.E[i], type, x: s.E[i + 2], z: s.E[i + 3], hp: s.E[i + 4], maxHp: s.E[i + 5], flash: s.E[i + 6] ? 0.05 : 0,
      speed: 0, r: type === 'tank' ? 1.05 : 0.65, cooldown: 0, side: 0, sideT: 0, ax: 0, az: 0, stuckT: 0 });
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
  for (let i = 0; i < s.T.length; i += 5) turrets.push({ id: s.T[i], x: s.T[i + 1], z: s.T[i + 2], angle: s.T[i + 3], life: s.T[i + 4], cooldown: 0, owner: '' });
  const mines: Mine[] = [];
  for (let i = 0; i < s.M.length; i += 4) mines.push({ id: s.M[i], x: s.M[i + 1], z: s.M[i + 2], arm: s.M[i + 3], owner: '' });
  let obstacles: Obstacle[] = prev?.obstacles ?? [];
  if (s.O) {
    obstacles = [];
    for (let i = 0; i < s.O.length; i += 7)
      obstacles.push({ id: s.O[i], kind: OBST_K[s.O[i + 1]], x: s.O[i + 2], z: s.O[i + 3], r: s.O[i + 4], hp: s.O[i + 5] < 0 ? Infinity : s.O[i + 5], rot: s.O[i + 6] });
  }
  return {
    arena: 30, players, enemies, bullets, pickups, obstacles, turrets, mines,
    phase: s.phase, wave: s.wave, toSpawn: s.toSpawn, spawnTimer: 0, score: s.score, over: s.over, time: s.time,
    events: s.ev, nextId: 0, rand: Math.random,
  };
}

/** Limpia lo que manda el cliente (nunca confiar en la red). */
export function sanitizeName(n: unknown): string {
  const s = String(n ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  return s || 'Soldado';
}
export function clampInput(i: unknown): Input {
  const a = Array.isArray(i) ? i : [];
  const f = (v: unknown, lim: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(-lim, Math.min(lim, n)) : 0; };
  return { moveX: f(a[0], 1), moveZ: f(a[1], 1), aimX: f(a[2], 100), aimZ: f(a[3], 100), fire: !!a[4] };
}
