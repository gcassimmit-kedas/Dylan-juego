// Supervivencia de Bloques: jugadores (moverse, saltar, minar con su tiempo, colocar, luchar), 10 corazones,
// daño por caída, regeneración, día y noche, monstruos y muerte. Lógica pura: la ejecutan el navegador
// (un jugador, sin conexión) y el servidor (mundos compartidos, donde manda el servidor).
import { generate, spawnPoint, raycast, moveBody, bodyBlocked, isSolid, World, B, W, H, BLOCKS, type Body } from './voxel.ts';
import { newInventory, addItem, removeItem, breakTime, dropOf, attackDamage, recipeById, craft as craftInv, cannotCraft, ITEMS, HOTBAR, swapSlots, FOOD, I, type Slot, type Station } from './items.ts';
import { JUMP_SPEED } from './voxel.ts';

export const MAX_HP = 20; // 10 corazones
export const EYE = 1.62;
export const REACH = 5;
export const WALK = 4.3;
export const DAY_SECONDS = 600; // un día entero dura 10 minutos
export const STATION_RANGE = 4.5;
export const MAX_FOOD = 20;

/** Mods: cambian las reglas del mundo. Los elige quien crea el mundo; valen para todos los que entran. */
export type ModId = 'terror' | 'supervivencia' | 'heroes';
export const MODS: ModId[] = ['terror', 'supervivencia', 'heroes'];
export const isMod = (v: unknown): v is ModId => typeof v === 'string' && (MODS as string[]).includes(v);
export const MOD_INFO: Record<ModId, { name: string; desc: string }> = {
  terror: { name: 'Terror', desc: 'Noches mucho más oscuras y con niebla, el doble de monstruos y más rápidos. Algo te observa desde lejos y desaparece si lo miras.' },
  supervivencia: { name: 'Supervivencia extrema', desc: 'Tienes hambre: come manzanas o carne asada. Los monstruos pegan más y al morir pierdes todo.' },
  heroes: { name: 'Superhéroes', desc: 'Saltas muy alto, corres más, rompes y golpeas con superfuerza y no te haces daño al caer.' },
};
/** Velocidad al andar y fuerza del salto según los mods (también la usa la predicción del cliente). */
export const walkSpeed = (mods: Iterable<ModId>) => ([...mods].includes('heroes') ? WALK * 1.7 : WALK);
export const jumpSpeed = (mods: Iterable<ModId>) => ([...mods].includes('heroes') ? JUMP_SPEED * 1.75 : JUMP_SPEED);

export interface PInput { mx: number; mz: number; jump: boolean; attack: boolean; yaw: number; pitch: number }
export const IDLE: PInput = { mx: 0, mz: 0, jump: false, attack: false, yaw: 0, pitch: 0 };

export type Look = 'coloso' | 'halcon';
export interface Player {
  id: string; name: string; look: Look; body: Body; yaw: number; pitch: number;
  hp: number; alive: boolean; inv: Slot[]; sel: number; input: PInput;
  /** Bloque que está rompiendo y cuánto lleva (segundos). */
  mine: { x: number; y: number; z: number; t: number; need: number } | null;
  invuln: number; calm: number; regenT: number; attackCd: number;
  /** En el menú de pausa mientras los demás siguen: no le atacan ni recibe daño. */
  away: boolean;
  /** Hambre (mod de supervivencia): 20 = lleno. */
  food: number; foodT: number;
}
/** La sombra (mod de terror) no ataca: aparece lejos, te observa y desaparece cuando la miras. */
export type MobKind = 'zombi' | 'esqueleto' | 'arana' | 'sombra';
export interface Mob { id: number; kind: MobKind; body: Body; yaw: number; hp: number; cd: number; flash: number; wanderT: number; wx: number; wz: number; burn: number }
export interface Arrow { id: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }

export type GEvent =
  | { kind: 'break'; pid: string; x: number; y: number; z: number; b: number }
  | { kind: 'place'; pid: string; x: number; y: number; z: number; b: number }
  | { kind: 'hurt'; pid: string; dmg: number } | { kind: 'death'; pid: string } | { kind: 'respawn'; pid: string }
  | { kind: 'mobHurt'; id: number } | { kind: 'mobDie'; id: number; x: number; y: number; z: number; mob: MobKind }
  | { kind: 'swing'; pid: string } | { kind: 'craft'; pid: string; item: number } | { kind: 'shoot'; x: number; y: number; z: number }
  | { kind: 'pickup'; pid: string; item: number; n: number } | { kind: 'join'; pid: string } | { kind: 'leave'; pid: string }
  | { kind: 'eat'; pid: string; item: number } | { kind: 'vanish'; x: number; y: number; z: number; near: boolean } | { kind: 'verity'; pid: string; what: string };

const MOB: Record<MobKind, { hp: number; speed: number; dmg: number; hw: number; h: number; range: number }> = {
  zombi: { hp: 20, speed: 2.6, dmg: 3, hw: 0.3, h: 1.9, range: 1.3 },
  esqueleto: { hp: 20, speed: 2.4, dmg: 3, hw: 0.3, h: 1.95, range: 15 },
  arana: { hp: 16, speed: 4.2, dmg: 2, hw: 0.55, h: 0.9, range: 1.5 },
  sombra: { hp: 999, speed: 0, dmg: 0, hw: 0.3, h: 2.3, range: 0 },
};
export const MOB_SIZE = Object.fromEntries(Object.entries(MOB).map(([k, v]) => [k, { hw: v.hw, h: v.h }])) as Record<MobKind, { hw: number; h: number }>;

export interface Game {
  world: World; seed: number; time: number; players: Player[]; mobs: Mob[]; arrows: Arrow[];
  /** Cambios de bloques desde la generación (índice -> bloque): lo que se manda a quien entra. */
  edits: Map<number, number>;
  /** Cambios pendientes de enviar en la próxima instantánea. */
  changes: [number, number][];
  events: GEvent[]; nextId: number; rand: () => number; spawnT: number;
  mods: Set<ModId>;
}

export function newGame(seed: number, rand: () => number = Math.random, mods: ModId[] = []): Game {
  return { world: generate(seed), seed, time: DAY_SECONDS * 0.05, players: [], mobs: [], arrows: [], edits: new Map(), changes: [], events: [], nextId: 1, rand, spawnT: 3, mods: new Set(mods.filter(isMod)) };
}

/** De 0 a 1 a lo largo del día: 0 amanece, 0,25 mediodía, 0,5 anochece, 0,75 medianoche. */
export const dayPhase = (g: { time: number }) => (g.time / DAY_SECONDS) % 1;
export const isNight = (g: { time: number }) => { const p = dayPhase(g); return p > 0.52 && p < 0.98; };
/** Luz del sol de 0 (noche) a 1 (día), con amanecer y atardecer suaves. */
export const sunLight = (g: { time: number }) => Math.max(0, Math.min(1, Math.sin(dayPhase(g) * Math.PI * 2) * 3 + 0.5));

/** Punto de aparición de cada jugador: alrededor del centro, separados para no salir uno dentro del otro. */
function spawnFor(g: Game, k: number): [number, number, number] {
  const [cx, , cz] = spawnPoint(g.world);
  const a = k * 2.4, r = k ? 2.5 : 0;
  const x = Math.floor(cx + Math.cos(a) * r), z = Math.floor(cz + Math.sin(a) * r);
  return [x + 0.5, g.world.top(x, z) + 1.01, z + 0.5];
}

export function addPlayer(g: Game, id: string, name: string, look: Look = 'coloso'): Player {
  const [x, y, z] = spawnFor(g, g.players.length);
  const p: Player = {
    id, name, look, body: { x, y, z, vx: 0, vy: 0, vz: 0, onGround: false, fallFrom: y }, yaw: Math.PI, pitch: 0,
    hp: MAX_HP, alive: true, inv: newInventory(), sel: 0, input: { ...IDLE, yaw: Math.PI }, mine: null,
    invuln: 3, calm: 0, regenT: 0, attackCd: 0, away: false, food: MAX_FOOD, foodT: 0,
  };
  g.players.push(p);
  g.events.push({ kind: 'join', pid: id });
  return p;
}
export function removePlayer(g: Game, id: string) {
  g.players = g.players.filter((p) => p.id !== id);
  g.events.push({ kind: 'leave', pid: id });
}
export const getPlayer = (g: Game, id: string) => g.players.find((p) => p.id === id);
export const held = (p: Player): number | null => p.inv[p.sel]?.id ?? null;

/** Dirección de la mirada (sin, cos como en el resto del proyecto: yaw 0 mira hacia +z). */
export function lookDir(yaw: number, pitch: number): [number, number, number] {
  const c = Math.cos(pitch);
  return [Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c];
}

function setBlock(g: Game, x: number, y: number, z: number, b: number) {
  g.world.set(x, y, z, b);
  const i = World.index(x, y, z);
  g.edits.set(i, b);
  g.changes.push([i, b]);
}

/** Estaciones de crafteo que hay cerca del jugador (mesa, horno). */
export function stationsNear(g: Game, p: Player): Set<Station> {
  const s = new Set<Station>(['mano']);
  const r = Math.ceil(STATION_RANGE);
  const bx = Math.floor(p.body.x), by = Math.floor(p.body.y + 1), bz = Math.floor(p.body.z);
  for (let x = bx - r; x <= bx + r; x++) for (let y = by - r; y <= by + r; y++) for (let z = bz - r; z <= bz + r; z++) {
    const b = g.world.get(x, y, z);
    if ((b === B.Mesa || b === B.Horno) && Math.hypot(x + 0.5 - p.body.x, y + 0.5 - (p.body.y + 1), z + 0.5 - p.body.z) <= STATION_RANGE)
      s.add(b === B.Mesa ? 'mesa' : 'horno');
  }
  return s;
}

/** Fabrica una receta para un jugador (validado: materiales y estación cerca). */
export function craft(g: Game, pid: string, recipe: string): boolean {
  const p = getPlayer(g, pid), r = recipeById.get(recipe);
  if (!p || !p.alive || !r) return false;
  if (!craftInv(p.inv, r, stationsNear(g, p))) return false;
  g.events.push({ kind: 'craft', pid, item: r.out });
  return true;
}
export { cannotCraft };

export function selectSlot(g: Game, pid: string, slot: number) {
  const p = getPlayer(g, pid);
  if (p && Number.isInteger(slot) && slot >= 0 && slot < HOTBAR) { p.sel = slot; p.mine = null; }
}
export function moveSlot(g: Game, pid: string, a: number, b: number) {
  const p = getPlayer(g, pid);
  if (p) swapSlots(p.inv, a, b);
}

/** Primer monstruo que corta el rayo de la mirada antes de `max`. */
function rayMob(g: Game, ox: number, oy: number, oz: number, d: [number, number, number], max: number): { mob: Mob; dist: number } | null {
  let best: { mob: Mob; dist: number } | null = null;
  for (const m of g.mobs) {
    const s = MOB_SIZE[m.kind];
    const min = [m.body.x - s.hw, m.body.y, m.body.z - s.hw], mx = [m.body.x + s.hw, m.body.y + s.h, m.body.z + s.hw];
    let t0 = 0, t1 = max;
    const o = [ox, oy, oz];
    let ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      if (Math.abs(d[k]) < 1e-9) { if (o[k] < min[k] || o[k] > mx[k]) ok = false; continue; }
      let a = (min[k] - o[k]) / d[k], b = (mx[k] - o[k]) / d[k];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) ok = false;
    }
    if (ok && (!best || t0 < best.dist)) best = { mob: m, dist: t0 };
  }
  return best;
}

/** Coloca el bloque que lleva en la mano donde mira (validado: alcance, hueco libre, que no quede dentro de nadie). */
export function place(g: Game, pid: string): boolean {
  const p = getPlayer(g, pid);
  if (!p || !p.alive) return false;
  const item = held(p), def = item !== null ? ITEMS.get(item) : undefined;
  if (item !== null && FOOD[item]) return eat(g, p, item);
  if (!def?.block) return false;
  const d = lookDir(p.input.yaw, Math.max(-1.55, Math.min(1.55, p.input.pitch))); // la mirada más reciente
  const hit = raycast(g.world, p.body.x, p.body.y + EYE, p.body.z, d[0], d[1], d[2], REACH);
  if (!hit || !g.world.inside(hit.px, hit.py, hit.pz) || g.world.get(hit.px, hit.py, hit.pz) !== B.Aire) return false;
  const b = def.block;
  if (b === B.Antorcha && !isSolid(g.world.get(hit.px, hit.py - 1, hit.pz)) && !isSolid(g.world.get(hit.x, hit.y, hit.z))) return false;
  if (BLOCKS[b].solid) {
    g.world.set(hit.px, hit.py, hit.pz, b); // comprobar que no atrapa a nadie
    const trapped = g.players.some((q) => q.alive && bodyBlocked(g.world, q.body.x, q.body.y, q.body.z, 0.3, 1.8))
      || g.mobs.some((m) => bodyBlocked(g.world, m.body.x, m.body.y, m.body.z, MOB_SIZE[m.kind].hw, MOB_SIZE[m.kind].h));
    g.world.set(hit.px, hit.py, hit.pz, B.Aire);
    if (trapped) return false;
  }
  removeItem(p.inv, b, 1);
  setBlock(g, hit.px, hit.py, hit.pz, b);
  g.events.push({ kind: 'place', pid, x: hit.px, y: hit.py, z: hit.pz, b });
  return true;
}

/** Comer lo que se lleva en la mano: quita hambre (o, sin el mod de supervivencia, cura un poco). */
function eat(g: Game, p: Player, item: number): boolean {
  const v = FOOD[item]!;
  if (g.mods.has('supervivencia')) { if (p.food >= MAX_FOOD) return false; p.food = Math.min(MAX_FOOD, p.food + v); }
  else { if (p.hp >= MAX_HP) return false; p.hp = Math.min(MAX_HP, p.hp + Math.ceil(v / 2)); }
  removeItem(p.inv, item, 1);
  g.events.push({ kind: 'eat', pid: p.id, item });
  return true;
}

function hurt(g: Game, p: Player, dmg: number, kx = 0, kz = 0) {
  if (!p.alive || p.away || p.invuln > 0 || dmg <= 0) return;
  p.hp = Math.max(0, p.hp - dmg);
  p.invuln = 0.5; p.calm = 0;
  p.body.vx += kx; p.body.vz += kz;
  if (kx || kz) p.body.vy = Math.max(p.body.vy, 4);
  g.events.push({ kind: 'hurt', pid: p.id, dmg });
  if (p.hp <= 0) {
    p.alive = false; p.mine = null;
    if (g.mods.has('supervivencia')) p.inv.fill(null); // supervivencia extrema: al morir se pierde todo
    g.events.push({ kind: 'death', pid: p.id });
  }
}
export function respawn(g: Game, pid: string) {
  const p = getPlayer(g, pid);
  if (!p || p.alive) return;
  const [x, y, z] = spawnPoint(g.world);
  Object.assign(p.body, { x, y, z, vx: 0, vy: 0, vz: 0, onGround: false, fallFrom: y });
  Object.assign(p, { hp: MAX_HP, alive: true, invuln: 3, mine: null, calm: 0, food: MAX_FOOD, foodT: 0 });
  g.events.push({ kind: 'respawn', pid });
}

/** Mueve a un jugador según su entrada. Lo usan la simulación y la predicción del cliente. */
export function movePlayer(g: Game, p: Player, inp: PInput, dt: number): number {
  const m = Math.hypot(inp.mx, inp.mz), k = m > 1 ? 1 / m : 1;
  const v = walkSpeed(g.mods);
  return moveBody(g.world, p.body, inp.mx * k * v, inp.mz * k * v, inp.jump, dt, 0.3, 1.8, jumpSpeed(g.mods));
}

function hitMob(g: Game, m: Mob, dmg: number, fromX: number, fromZ: number, owner: string | null) {
  m.hp -= dmg; m.flash = 0.25;
  const dx = m.body.x - fromX, dz = m.body.z - fromZ, d = Math.hypot(dx, dz) || 1;
  m.body.vx += (dx / d) * 6; m.body.vz += (dz / d) * 6; m.body.vy = Math.max(m.body.vy, 5);
  g.events.push({ kind: 'mobHurt', id: m.id });
  if (m.hp <= 0) {
    g.events.push({ kind: 'mobDie', id: m.id, x: m.body.x, y: m.body.y, z: m.body.z, mob: m.kind });
    const p = owner ? getPlayer(g, owner) : undefined;
    // Botín: los esqueletos sueltan palos (sirven para craftear), las arañas y zombis a veces carbón
    if (p) {
      const loot = m.kind === 'esqueleto' ? I_PALO : m.kind === 'zombi' && g.rand() < 0.6 ? I.CarnePodrida : g.rand() < 0.4 ? I_CARBON : null;
      if (loot !== null) { addItem(p.inv, loot, 1 + Math.floor(g.rand() * 2)); g.events.push({ kind: 'pickup', pid: p.id, item: loot, n: 1 }); }
    }
  }
}
const I_PALO = 100, I_CARBON = 101;

function stepPlayer(g: Game, p: Player, dt: number) {
  p.invuln -= dt; p.attackCd -= dt; p.calm += dt;
  if (!p.alive) return;
  const inp = p.away ? { ...IDLE, yaw: p.yaw, pitch: p.pitch } : p.input;
  p.yaw = inp.yaw; p.pitch = Math.max(-1.55, Math.min(1.55, inp.pitch));
  const fall = movePlayer(g, p, inp, dt);
  const heroes = g.mods.has('heroes'), survival = g.mods.has('supervivencia');
  if (fall > 3.5 && !heroes) hurt(g, p, Math.floor(fall - 3));
  // Hambre (supervivencia extrema): baja poco a poco; con hambre no te curas y sin comida pierdes vida
  if (survival) {
    p.foodT += dt * (Math.hypot(p.body.vx, p.body.vz) > 1 ? 1.6 : 1);
    if (p.foodT >= 25) { p.foodT = 0; if (p.food > 0) p.food--; else if (p.hp > 2) { p.invuln = 0; hurt(g, p, 1); } }
  }
  // Regeneración: medio corazón cada 3 s si llevas 5 s sin recibir daño (con superhéroes, más rápido)
  const canRegen = !survival || p.food >= 16;
  if (p.hp < MAX_HP && p.calm > 5 && canRegen) {
    p.regenT += dt;
    if (p.regenT >= (heroes ? 1 : 3)) { p.regenT = 0; p.hp++; if (survival) p.food = Math.max(0, p.food - 1); }
  } else p.regenT = 0;
  // Romper bloques (manteniendo pulsado) o golpear monstruos
  if (!inp.attack) { p.mine = null; return; }
  const d = lookDir(p.yaw, p.pitch);
  const ex = p.body.x, ey = p.body.y + EYE, ez = p.body.z;
  const hit = raycast(g.world, ex, ey, ez, d[0], d[1], d[2], REACH);
  const mob = rayMob(g, ex, ey, ez, d, Math.min(3.5, hit ? hit.dist : 3.5));
  if (mob) {
    p.mine = null;
    if (p.attackCd <= 0) {
      p.attackCd = 0.55; g.events.push({ kind: 'swing', pid: p.id });
      if (mob.mob.kind === 'sombra') vanish(g, mob.mob, true);
      else hitMob(g, mob.mob, attackDamage(held(p)) * (heroes ? 2 : 1), ex, ez, p.id);
    }
    return;
  }
  if (!hit) { p.mine = null; return; }
  const b = g.world.get(hit.x, hit.y, hit.z);
  if (!p.mine || p.mine.x !== hit.x || p.mine.y !== hit.y || p.mine.z !== hit.z) p.mine = { x: hit.x, y: hit.y, z: hit.z, t: 0, need: breakTime(b, held(p)) };
  p.mine.t += dt * (heroes ? 3 : 1);
  if (p.mine.t >= p.mine.need) {
    const drop = dropOf(b, held(p));
    setBlock(g, hit.x, hit.y, hit.z, B.Aire);
    // Una antorcha sin apoyo cae con el bloque
    if (g.world.get(hit.x, hit.y + 1, hit.z) === B.Antorcha) { setBlock(g, hit.x, hit.y + 1, hit.z, B.Aire); addItem(p.inv, B.Antorcha, 1); }
    if (drop !== null) { addItem(p.inv, drop, 1); g.events.push({ kind: 'pickup', pid: p.id, item: drop, n: 1 }); }
    if (b === B.Hojas && g.rand() < 0.08) { addItem(p.inv, I.Manzana, 1); g.events.push({ kind: 'pickup', pid: p.id, item: I.Manzana, n: 1 }); }
    g.events.push({ kind: 'break', pid: p.id, x: hit.x, y: hit.y, z: hit.z, b });
    p.mine = null;
  }
}

/** ¿Está este punto a oscuras? (bajo techo y lejos de antorchas, o de noche al aire libre). */
function dark(g: Game, x: number, y: number, z: number): boolean {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  for (let dx = -5; dx <= 5; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -5; dz <= 5; dz++)
    if (g.world.get(xi + dx, yi + dy, zi + dz) === B.Antorcha) return false;
  const covered = g.world.top(xi, zi) > yi;
  return covered || isNight(g);
}

function trySpawn(g: Game) {
  const targets = g.players.filter((p) => p.alive && !p.away);
  const terror = g.mods.has('terror');
  if (!targets.length) return;
  // Terror: de noche, a veces aparece la sombra lejos de alguien, en la superficie
  if (terror && isNight(g) && !g.mobs.some((m) => m.kind === 'sombra') && g.rand() < 0.35) {
    const p = targets[Math.floor(g.rand() * targets.length)];
    const a = g.rand() * Math.PI * 2, r = 22 + g.rand() * 10;
    const x = Math.floor(p.body.x + Math.cos(a) * r), z = Math.floor(p.body.z + Math.sin(a) * r);
    if (x > 1 && z > 1 && x < W - 2 && z < W - 2) {
      const y = g.world.top(x, z) + 1;
      g.mobs.push({ id: g.nextId++, kind: 'sombra', body: { x: x + 0.5, y, z: z + 0.5, vx: 0, vy: 0, vz: 0, onGround: true, fallFrom: y }, yaw: 0, hp: 999, cd: 30, flash: 0, wanderT: 0, wx: 0, wz: 0, burn: 0 });
      return;
    }
  }
  if (g.mobs.length >= (4 + targets.length * 4) * (terror ? 2 : 1)) return;
  const p = targets[Math.floor(g.rand() * targets.length)];
  for (let t = 0; t < 10; t++) {
    const a = g.rand() * Math.PI * 2, r = 14 + g.rand() * 14;
    const x = Math.floor(p.body.x + Math.cos(a) * r), z = Math.floor(p.body.z + Math.sin(a) * r);
    if (x < 1 || z < 1 || x >= W - 1 || z >= W - 1) continue;
    // Buscar un hueco de dos bloques con suelo, cerca de la altura del jugador (cuevas) o en la superficie
    const cave = g.rand() < 0.5;
    const y0 = cave ? Math.floor(p.body.y) + Math.floor(g.rand() * 9) - 4 : g.world.top(x, z) + 1;
    if (y0 < 1 || y0 >= H - 2) continue;
    if (!isSolid(g.world.get(x, y0 - 1, z)) || g.world.get(x, y0, z) !== B.Aire || g.world.get(x, y0 + 1, z) !== B.Aire) continue;
    if (!dark(g, x, y0, z)) continue;
    const roll = g.rand();
    const kind: MobKind = roll < 0.45 ? 'zombi' : roll < 0.75 ? 'esqueleto' : 'arana';
    const s = MOB[kind];
    g.mobs.push({ id: g.nextId++, kind, body: { x: x + 0.5, y: y0, z: z + 0.5, vx: 0, vy: 0, vz: 0, onGround: false, fallFrom: y0 }, yaw: 0, hp: s.hp, cd: 1, flash: 0, wanderT: 0, wx: 0, wz: 0, burn: 0 });
    return;
  }
}

/** La sombra se esfuma (al mirarla, al acercarse o al golpearla). */
function vanish(g: Game, m: Mob, near: boolean) {
  m.hp = 0;
  g.events.push({ kind: 'vanish', x: m.body.x, y: m.body.y, z: m.body.z, near });
}
function stepShadow(g: Game, m: Mob, dt: number) {
  m.cd -= dt;
  let best = Infinity, who: Player | null = null;
  for (const p of g.players) {
    if (!p.alive || p.away) continue;
    const dx = m.body.x - p.body.x, dy = m.body.y + 1.6 - (p.body.y + EYE), dz = m.body.z - p.body.z, d = Math.hypot(dx, dy, dz);
    if (d < best) { best = d; who = p; }
    // ¿La está mirando? (ángulo pequeño entre la mirada y la dirección hacia ella)
    const [lx, ly, lz] = lookDir(p.yaw, p.pitch);
    if (d < 48 && (lx * dx + ly * dy + lz * dz) / d > 0.975) { vanish(g, m, false); return; }
  }
  if (who) m.yaw = Math.atan2(who.body.x - m.body.x, who.body.z - m.body.z);
  if (best < 7) { vanish(g, m, true); return; }
  if (m.cd <= 0 || !isNight(g)) m.hp = 0; // se va sin más
}

function stepMob(g: Game, m: Mob, dt: number) {
  if (m.kind === 'sombra') { stepShadow(g, m, dt); return; }
  const s = MOB[m.kind];
  const terror = g.mods.has('terror'), survival = g.mods.has('supervivencia');
  m.cd -= dt; m.flash -= dt;
  // Objetivo: el jugador vivo más cercano que no esté en pausa
  let tgt: Player | null = null, best = m.kind === 'arana' ? 20 : 16;
  for (const p of g.players) {
    if (!p.alive || p.away) continue;
    const d = Math.hypot(p.body.x - m.body.x, p.body.y - m.body.y, p.body.z - m.body.z);
    if (d < best) { best = d; tgt = p; }
  }
  let wx = 0, wz = 0, jump = false;
  if (tgt) {
    const dx = tgt.body.x - m.body.x, dz = tgt.body.z - m.body.z, d = Math.hypot(dx, dz) || 1;
    m.yaw = Math.atan2(dx, dz);
    const keep = m.kind === 'esqueleto' ? (d < 6 ? -1 : d > 10 ? 1 : 0) : 1;
    const fast = terror ? 1.25 : 1;
    wx = (dx / d) * s.speed * keep * fast; wz = (dz / d) * s.speed * keep * fast;
    const sees = !raycast(g.world, m.body.x, m.body.y + s.h * 0.85, m.body.z, tgt.body.x - m.body.x, tgt.body.y + EYE - m.body.y - s.h * 0.85, tgt.body.z - m.body.z, best);
    if (m.kind === 'esqueleto') {
      if (sees && m.cd <= 0 && best < s.range) {
        m.cd = 2.2;
        const ox = m.body.x, oy = m.body.y + 1.5, oz = m.body.z;
        const tx = tgt.body.x - ox, ty = tgt.body.y + 1.2 - oy, tz = tgt.body.z - oz, len = Math.hypot(tx, ty, tz) || 1;
        g.arrows.push({ id: g.nextId++, x: ox, y: oy, z: oz, vx: (tx / len) * 20, vy: (ty / len) * 20 + len * 0.18, vz: (tz / len) * 20, life: 3 });
        g.events.push({ kind: 'shoot', x: ox, y: oy, z: oz });
      }
    } else if (best < s.range + 0.3 && m.cd <= 0 && Math.abs(tgt.body.y - m.body.y) < 1.6) {
      m.cd = 1;
      hurt(g, tgt, Math.ceil(s.dmg * (survival ? 1.5 : 1)), (dx / d) * 5, (dz / d) * 5);
    }
  } else {
    // Sin nadie cerca: pasea
    m.wanderT -= dt;
    if (m.wanderT <= 0) { m.wanderT = 2 + g.rand() * 4; const a = g.rand() * Math.PI * 2; const go = g.rand() < 0.6; m.wx = go ? Math.sin(a) : 0; m.wz = go ? Math.cos(a) : 0; }
    wx = m.wx * s.speed * 0.4; wz = m.wz * s.speed * 0.4;
    if (wx || wz) m.yaw = Math.atan2(wx, wz);
  }
  // Saltar si algo le corta el paso (y la araña trepa)
  if ((wx || wz) && m.body.onGround) {
    const ax = m.body.x + Math.sign(wx) * (s.hw + 0.2), az = m.body.z + Math.sign(wz) * (s.hw + 0.2);
    if (isSolid(g.world.get(Math.floor(ax), Math.floor(m.body.y), Math.floor(m.body.z))) || isSolid(g.world.get(Math.floor(m.body.x), Math.floor(m.body.y), Math.floor(az)))) jump = true;
  }
  moveBody(g.world, m.body, wx, wz, jump, dt, s.hw, s.h);
  // Al sol, zombis y esqueletos arden
  if (m.kind !== 'arana' && !isNight(g) && g.world.top(Math.floor(m.body.x), Math.floor(m.body.z)) < m.body.y) {
    m.burn += dt;
    if (m.burn >= 1) { m.burn = 0; hitMob(g, m, 2, m.body.x, m.body.z, null); }
  }
}

/** Avanza el mundo `dt` segundos. */
export function step(g: Game, dt: number) {
  g.time += dt;
  for (const p of g.players) stepPlayer(g, p, dt);
  g.spawnT -= dt;
  if (g.spawnT <= 0) { g.spawnT = g.mods.has('terror') ? 1.2 : 2; trySpawn(g); }
  for (const m of g.mobs) stepMob(g, m, dt);
  // Se van los muertos y los que se quedan muy lejos de todos
  g.mobs = g.mobs.filter((m) => m.hp > 0 && g.players.some((p) => Math.hypot(p.body.x - m.body.x, p.body.z - m.body.z) < 48));
  for (const a of g.arrows) {
    a.vy -= 12 * dt;
    a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt; a.life -= dt;
    if (isSolid(g.world.get(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z)))) { a.life = 0; continue; }
    for (const p of g.players) {
      if (!p.alive || p.away) continue;
      if (Math.abs(a.x - p.body.x) < 0.4 && Math.abs(a.z - p.body.z) < 0.4 && a.y > p.body.y && a.y < p.body.y + 1.8) {
        a.life = 0;
        const d = Math.hypot(a.vx, a.vz) || 1;
        hurt(g, p, 3, (a.vx / d) * 3, (a.vz / d) * 3);
        break;
      }
    }
  }
  g.arrows = g.arrows.filter((a) => a.life > 0);
}

// ---------- Verity: órdenes que entiende el juego ----------

/** Lo que Verity puede hacer por un jugador. El servidor recibe solo la orden, nunca el texto que se escribió. */
export type VerityCmd =
  | { k: 'dar'; id: number; n: number } | { k: 'curar' } | { k: 'comer' } | { k: 'dia' } | { k: 'noche' } | { k: 'superficie' };
export function verityCommand(g: Game, pid: string, c: VerityCmd): boolean {
  const p = getPlayer(g, pid);
  if (!p || !p.alive || !c || typeof c !== 'object') return false;
  switch (c.k) {
    case 'dar': {
      const def = ITEMS.get(Number(c.id));
      const n = Math.max(1, Math.min(64, Math.floor(Number(c.n)) || 1));
      if (!def) return false;
      if (addItem(p.inv, def.id, n) === n) return false;
      break;
    }
    case 'curar': p.hp = MAX_HP; break;
    case 'comer': p.food = MAX_FOOD; break;
    case 'dia': g.time = Math.floor(g.time / DAY_SECONDS) * DAY_SECONDS + DAY_SECONDS * 1.08; break;
    case 'noche': g.time = Math.floor(g.time / DAY_SECONDS) * DAY_SECONDS + DAY_SECONDS * 0.6; break;
    case 'superficie': {
      const x = Math.floor(p.body.x), z = Math.floor(p.body.z);
      Object.assign(p.body, { y: g.world.top(x, z) + 1.01, vy: 0, fallFrom: g.world.top(x, z) + 1.01 });
      break;
    }
    default: return false;
  }
  g.events.push({ kind: 'verity', pid, what: c.k });
  return true;
}
