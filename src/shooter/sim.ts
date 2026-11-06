// Simulación pura del shooter (2D en el plano XZ). Sin Three.js ni DOM: se puede testear
// y la misma lógica corre en el navegador (un jugador) y en el servidor (multijugador).

export type EnemyType = 'chaser' | 'tank' | 'gunner';
export type PickupType = 'health' | 'rapid' | 'coins';
export type WeaponId = 'pistola' | 'subfusil' | 'escopeta' | 'lanzallamas' | 'francotirador' | 'granadas' | 'cohetes';
export type ToolId = 'torreta' | 'mina' | 'escudo' | 'barricada';
export type BulletKind = 'bala' | 'perdigon' | 'fuego' | 'rayo' | 'granada' | 'cohete' | 'enemiga';
export type ObstacleKind = 'rock' | 'tree' | 'crate' | 'sandbag' | 'barricade';
export type ItemId = WeaponId | ToolId | 'botiquin' | 'armadura' | 'botas' | 'municion' | 'iman' | 'regeneracion' | 'dron';
export type Phase = 'fight' | 'shop';

export interface Input { moveX: number; moveZ: number; aimX: number; aimZ: number; fire: boolean }
export interface Player {
  id: string; name: string; color: number; alive: boolean; coins: number; score: number; kills: number; input: Input;
  x: number; z: number; angle: number; hp: number; maxHp: number; cooldown: number; invuln: number; rapid: number;
  weapon: WeaponId; owned: WeaponId[]; tools: Record<ToolId, number>;
  speedLvl: number; armorLvl: number; dmgLvl: number; magnet: number; regen: number; regenT: number; drones: number; droneCd: number;
  shield: number; moving: boolean;
}
export interface Bullet {
  id: number; kind: BulletKind; x: number; z: number; vx: number; vz: number; life: number; maxLife: number;
  enemy: boolean; dmg: number; blast: number; pierce: number; hits: number[]; owner: string | null;
}
export interface Mine { id: number; x: number; z: number; arm: number; owner: string }
export interface Enemy { id: number; type: EnemyType; x: number; z: number; hp: number; maxHp: number; speed: number; r: number; cooldown: number; flash: number; side: number; sideT: number; ax: number; az: number; stuckT: number }
export interface Pickup { id: number; type: PickupType; x: number; z: number; life: number }
export interface Obstacle { id: number; kind: ObstacleKind; x: number; z: number; r: number; hp: number; rot: number }
export interface Turret { id: number; x: number; z: number; angle: number; cooldown: number; life: number; owner: string }
// pid = jugador al que se refiere el evento (para que cada cliente sepa si es suyo)
export type GameEvent =
  | { kind: 'shoot'; pid: string; weapon: WeaponId } | { kind: 'hit'; x: number; z: number }
  | { kind: 'kill'; x: number; z: number; type: EnemyType; coins: number; pid: string | null } | { kind: 'hurt'; pid: string }
  | { kind: 'pickup'; pid: string; type: PickupType } | { kind: 'wave'; wave: number } | { kind: 'gameover' }
  | { kind: 'enemyShoot' } | { kind: 'explosion'; x: number; z: number; r: number }
  | { kind: 'crate'; x: number; z: number } | { kind: 'waveCleared'; bonus: number }
  | { kind: 'tool'; pid: string; tool: ToolId } | { kind: 'regen'; pid: string } | { kind: 'blocked'; x: number; z: number }
  | { kind: 'down'; pid: string } | { kind: 'join'; pid: string } | { kind: 'leave'; pid: string };

export interface World {
  arena: number; // medio lado del campo cuadrado
  players: Player[];
  bullets: Bullet[]; enemies: Enemy[]; pickups: Pickup[]; obstacles: Obstacle[]; turrets: Turret[]; mines: Mine[];
  phase: Phase;
  wave: number; toSpawn: number; spawnTimer: number;
  score: number; over: boolean; time: number; // score = puntos del equipo
  events: GameEvent[];
  nextId: number;
  rand: () => number;
}

export const PLAYER_R = 0.6;
const PLAYER_SPEED = 9;
const ENEMY_BULLET_SPEED = 13;

export interface WeaponStats {
  name: string; cooldown: number; dmg: number; speed: number; pellets: number; spread: number; life: number;
  blast: number; pierce: number; kind: BulletKind;
}
const W = (name: string, cooldown: number, dmg: number, speed: number, life: number, o: Partial<WeaponStats> = {}): WeaponStats =>
  ({ name, cooldown, dmg, speed, life, pellets: 1, spread: 0.03, blast: 0, pierce: 0, kind: 'bala', ...o });
export const WEAPONS: Record<WeaponId, WeaponStats> = {
  pistola: W('Pistola', 0.28, 2, 30, 0.9),
  subfusil: W('Subfusil', 0.085, 1, 34, 0.8, { spread: 0.12 }),
  escopeta: W('Escopeta', 0.6, 2, 28, 0.42, { pellets: 6, spread: 0.5, kind: 'perdigon' }),
  lanzallamas: W('Lanzallamas', 0.045, 0.5, 13, 0.4, { spread: 0.35, pierce: 3, kind: 'fuego' }),
  francotirador: W('Francotirador', 0.9, 9, 70, 0.7, { spread: 0, pierce: 4, kind: 'rayo' }),
  granadas: W('Lanzagranadas', 0.8, 5, 18, 0.75, { spread: 0, blast: 3.2, kind: 'granada' }),
  cohetes: W('Lanzacohetes', 1.15, 10, 24, 1.3, { spread: 0, blast: 4.5, kind: 'cohete' }),
};
export const WEAPON_ORDER: WeaponId[] = ['pistola', 'subfusil', 'escopeta', 'lanzallamas', 'francotirador', 'granadas', 'cohetes'];
export const TOOL_ORDER: ToolId[] = ['torreta', 'mina', 'escudo', 'barricada'];

export type ShopKind = 'arma' | 'mejora' | 'equipo';
export interface ShopItem { id: ItemId; name: string; desc: string; price: number; max?: number; kind: ShopKind }
export const SHOP: ShopItem[] = [
  { id: 'subfusil', name: 'Subfusil', desc: 'Dispara muy rápido', price: 60, kind: 'arma' },
  { id: 'escopeta', name: 'Escopeta', desc: '6 perdigones, corto alcance', price: 90, kind: 'arma' },
  { id: 'lanzallamas', name: 'Lanzallamas', desc: 'Chorro de fuego que atraviesa', price: 120, kind: 'arma' },
  { id: 'francotirador', name: 'Francotirador', desc: 'Mucho daño, atraviesa 4 enemigos', price: 140, kind: 'arma' },
  { id: 'granadas', name: 'Lanzagranadas', desc: 'Explota y daña en área', price: 160, kind: 'arma' },
  { id: 'cohetes', name: 'Lanzacohetes', desc: 'Explosión enorme', price: 220, kind: 'arma' },
  { id: 'botiquin', name: 'Botiquín', desc: 'Recupera 2 de vida', price: 20, kind: 'mejora' },
  { id: 'armadura', name: 'Armadura', desc: '+1 de vida máxima', price: 50, max: 3, kind: 'mejora' },
  { id: 'botas', name: 'Botas', desc: '+12% de velocidad', price: 40, max: 2, kind: 'mejora' },
  { id: 'municion', name: 'Munición pesada', desc: '+30% de daño', price: 70, max: 2, kind: 'mejora' },
  { id: 'iman', name: 'Imán', desc: 'Atrae monedas y objetos', price: 40, max: 1, kind: 'mejora' },
  { id: 'regeneracion', name: 'Regeneración', desc: '+1 de vida cada 15 s', price: 80, max: 1, kind: 'mejora' },
  { id: 'dron', name: 'Dron escolta', desc: 'Te sigue y dispara solo', price: 90, max: 2, kind: 'mejora' },
  { id: 'torreta', name: 'Torreta', desc: 'Dispara sola durante 30 s', price: 50, max: 3, kind: 'equipo' },
  { id: 'mina', name: 'Mina', desc: 'Explota cuando pasa un robot', price: 25, max: 5, kind: 'equipo' },
  { id: 'escudo', name: 'Escudo', desc: '5 s sin recibir daño', price: 45, max: 3, kind: 'equipo' },
  { id: 'barricada', name: 'Barricada', desc: 'Muro de sacos que para balas', price: 30, max: 3, kind: 'equipo' },
];

const STATS: Record<EnemyType, { hp: number; speed: number; r: number; score: number; coins: number }> = {
  chaser: { hp: 3, speed: 5, r: 0.6, score: 10, coins: 3 },
  tank: { hp: 14, speed: 2.6, r: 1.05, score: 30, coins: 10 },
  gunner: { hp: 5, speed: 3.6, r: 0.7, score: 20, coins: 6 },
};

export const PLAYER_COLORS = [0x5d7a3e, 0x3e6ea8, 0xb5532f, 0x8a4fae, 0x2f9a8f, 0xc9a227, 0xb03a6a, 0x6b6b6b];
export const IDLE: Input = { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, fire: false };

export function newWorld(rand: () => number = Math.random, withObstacles = true, players: { id: string; name: string }[] = [{ id: 'p1', name: 'Tú' }]): World {
  const w: World = {
    arena: 30, players: [],
    bullets: [], enemies: [], pickups: [], obstacles: [], turrets: [], mines: [],
    phase: 'fight', wave: 0, toSpawn: 0, spawnTimer: 1.5,
    score: 0, over: false, time: 0, events: [], nextId: 1, rand,
  };
  for (const p of players) addPlayer(w, p.id, p.name);
  if (withObstacles) generateObstacles(w);
  return w;
}

function spawnPoint(w: World, i: number): [number, number] {
  if (i === 0) return [0, 0];
  const a = (i / 8) * Math.PI * 2;
  return [Math.cos(a) * 2.5, Math.sin(a) * 2.5];
}

export function addPlayer(w: World, id: string, name: string): Player {
  const used = new Set(w.players.map((p) => p.color));
  const color = PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[w.players.length % PLAYER_COLORS.length];
  const [x, z] = spawnPoint(w, w.players.length);
  const p: Player = {
    id, name, color, alive: true, coins: 0, score: 0, kills: 0, input: { ...IDLE },
    x, z, angle: Math.PI, hp: 5, maxHp: 5, cooldown: 0, invuln: 2, rapid: 0,
    weapon: 'pistola', owned: ['pistola'], tools: { torreta: 0, mina: 0, escudo: 0, barricada: 0 },
    speedLvl: 0, armorLvl: 0, dmgLvl: 0, magnet: 0, regen: 0, regenT: 0, drones: 0, droneCd: 0, shield: 0, moving: false,
  };
  w.players.push(p);
  w.events.push({ kind: 'join', pid: id });
  return p;
}

export function removePlayer(w: World, id: string) {
  w.players = w.players.filter((p) => p.id !== id);
  w.events.push({ kind: 'leave', pid: id });
}

export const getPlayer = (w: World, pid?: string): Player => (pid ? w.players.find((p) => p.id === pid) : undefined) ?? w.players[0];
const alivePlayers = (w: World) => w.players.filter((p) => p.alive);

/** Campo de batalla: rocas, árboles, cajas (destructibles) y muros de sacos terreros. */
export function generateObstacles(w: World) {
  const lim = w.arena - 3;
  const free = (x: number, z: number, r: number) =>
    Math.hypot(x, z) > 6 + r && w.obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r + 1.6);
  const place = (kind: ObstacleKind, r: number, hp: number, tries = 40) => {
    for (let t = 0; t < tries; t++) {
      const x = (w.rand() * 2 - 1) * lim, z = (w.rand() * 2 - 1) * lim;
      if (free(x, z, r)) {
        const o = { id: w.nextId++, kind, x, z, r, hp, rot: w.rand() * Math.PI * 2 };
        w.obstacles.push(o);
        return o;
      }
    }
    return null;
  };
  for (let i = 0; i < 6; i++) {
    // Muro de sacos: 4 segmentos alineados
    const start = place('sandbag', 0.75, Infinity);
    if (!start) continue;
    const ux = Math.cos(start.rot), uz = Math.sin(start.rot);
    for (let k = 1; k < 4; k++) {
      const x = start.x + ux * k * 1.4, z = start.z + uz * k * 1.4;
      if (Math.abs(x) < lim && Math.abs(z) < lim && Math.hypot(x, z) > 6)
        w.obstacles.push({ id: w.nextId++, kind: 'sandbag', x, z, r: 0.75, hp: Infinity, rot: start.rot });
    }
  }
  for (let i = 0; i < 12; i++) place('rock', 0.9 + w.rand() * 0.9, Infinity);
  for (let i = 0; i < 16; i++) place('tree', 0.7, Infinity);
  for (let i = 0; i < 10; i++) place('crate', 0.65, 4);
}

export const waveSize = (wave: number, players = 1) => Math.round((4 + wave * 3) * (1 + 0.5 * (Math.max(1, players) - 1)));
export const waveBonus = (wave: number) => 10 + wave * 5;

function pickType(w: World): EnemyType {
  const r = w.rand();
  if (w.wave >= 3 && r < 0.2) return 'gunner';
  if (w.wave >= 2 && r < 0.4) return 'tank';
  return 'chaser';
}

export function spawnEnemy(w: World, type: EnemyType, x?: number, z?: number): Enemy {
  const s = STATS[type];
  if (x === undefined || z === undefined) {
    const t = (w.rand() * 2 - 1) * w.arena, side = Math.floor(w.rand() * 4), e = w.arena - 1;
    [x, z] = side === 0 ? [t, -e] : side === 1 ? [t, e] : side === 2 ? [-e, t] : [e, t];
  }
  const speed = type === 'chaser' ? Math.min(8, s.speed + w.wave * 0.25) : s.speed;
  const hp = s.hp + (type === 'tank' ? Math.floor(w.wave / 3) * 3 : 0) + Math.floor(w.wave / 4);
  const en: Enemy = { id: w.nextId++, type, x, z, hp, maxHp: hp, speed, r: s.r, cooldown: 1 + w.rand() * 1.5, flash: 0, side: 0, sideT: 0, ax: x, az: z, stuckT: 0 };
  w.enemies.push(en);
  return en;
}

// ---------- Tienda ----------

const isTool = (id: ItemId): id is ToolId => (TOOL_ORDER as string[]).includes(id);

export function owns(w: World, id: ItemId, pid?: string): number {
  const p = getPlayer(w, pid);
  if (isTool(id)) return p.tools[id];
  switch (id) {
    case 'armadura': return p.armorLvl;
    case 'botas': return p.speedLvl;
    case 'municion': return p.dmgLvl;
    case 'iman': return p.magnet;
    case 'regeneracion': return p.regen;
    case 'dron': return p.drones;
    case 'botiquin': return 0;
    default: return p.owned.includes(id) ? 1 : 0;
  }
}

/** Por qué no se puede comprar (o null si se puede). */
export function cannotBuy(w: World, id: ItemId, pid?: string): string | null {
  const item = SHOP.find((s) => s.id === id);
  if (!item) return 'No existe';
  const p = getPlayer(w, pid);
  const n = owns(w, id, p.id);
  if (item.kind === 'arma' && n) return 'Comprada';
  if (item.max !== undefined && n >= item.max) return 'Al máximo';
  if (id === 'botiquin' && p.hp >= p.maxHp) return 'Vida llena';
  if (p.coins < item.price) return 'Faltan monedas';
  return null;
}

export function buy(w: World, id: ItemId, pid?: string): boolean {
  const p = getPlayer(w, pid);
  if (cannotBuy(w, id, p.id)) return false;
  p.coins -= SHOP.find((s) => s.id === id)!.price;
  if (isTool(id)) { p.tools[id]++; return true; }
  switch (id) {
    case 'botiquin': p.hp = Math.min(p.maxHp, p.hp + 2); break;
    case 'armadura': p.armorLvl++; p.maxHp++; p.hp++; break;
    case 'botas': p.speedLvl++; break;
    case 'municion': p.dmgLvl++; break;
    case 'iman': p.magnet++; break;
    case 'regeneracion': p.regen++; break;
    case 'dron': p.drones++; break;
    default: p.owned.push(id); p.weapon = id; // equipa el arma nueva
  }
  return true;
}

export function selectWeapon(w: World, id: WeaponId, pid?: string) {
  const p = getPlayer(w, pid);
  if (p.owned.includes(id)) p.weapon = id;
}

/** Usa una herramienta del inventario en la posición del jugador. */
export function useTool(w: World, id: ToolId, pid?: string): boolean {
  const p = getPlayer(w, pid);
  if (!p.alive || p.tools[id] <= 0 || w.phase !== 'fight' || w.over) return false;
  if (id === 'escudo' && p.shield > 0) return false;
  p.tools[id]--;
  const sx = Math.sin(p.angle), sz = Math.cos(p.angle);
  switch (id) {
    case 'torreta': w.turrets.push({ id: w.nextId++, x: p.x, z: p.z, angle: p.angle, cooldown: 0, life: 30, owner: p.id }); break;
    case 'mina': w.mines.push({ id: w.nextId++, x: p.x, z: p.z, arm: 1, owner: p.id }); break;
    case 'escudo': p.shield = 5; break;
    case 'barricada':
      // 3 segmentos perpendiculares a donde miras, 2,4 m por delante
      for (let k = -1; k <= 1; k++) {
        const x = p.x + sx * 2.4 + sz * k * 1.4, z = p.z + sz * 2.4 - sx * k * 1.4;
        if (Math.abs(x) < w.arena - 1 && Math.abs(z) < w.arena - 1)
          w.obstacles.push({ id: w.nextId++, kind: 'barricade', x, z, r: 0.75, hp: 18, rot: Math.atan2(sx, -sz) });
      }
      break;
  }
  w.events.push({ kind: 'tool', pid: p.id, tool: id });
  return true;
}

/** Posición del dron i (giran alrededor del jugador). */
export function dronePos(w: World, i: number, p: Player = w.players[0]): [number, number] {
  const a = w.time * 1.8 + (i * Math.PI * 2) / Math.max(1, p.drones);
  return [p.x + Math.cos(a) * 1.9, p.z + Math.sin(a) * 1.9];
}

/** Empieza la siguiente oleada. Los jugadores caídos vuelven con la vida llena. */
export function nextWave(w: World) {
  if (w.over) return;
  w.players.forEach((p, i) => {
    if (p.alive) return;
    const [x, z] = spawnPoint(w, i);
    Object.assign(p, { alive: true, hp: p.maxHp, invuln: 2, x, z, shield: 0, rapid: 0 });
  });
  w.phase = 'fight';
  w.wave++;
  w.toSpawn = waveSize(w.wave, w.players.length);
  w.spawnTimer = 1.2;
  w.events.push({ kind: 'wave', wave: w.wave });
}

// ---------- Simulación ----------

/** ¿Hay línea de visión entre dos puntos? (ningún obstáculo corta el segmento) */
export function lineOfSight(w: World, x1: number, z1: number, x2: number, z2: number): boolean {
  const dx = x2 - x1, dz = z2 - z1, len2 = dx * dx + dz * dz || 1;
  for (const o of w.obstacles) {
    const t = Math.max(0, Math.min(1, ((o.x - x1) * dx + (o.z - z1) * dz) / len2));
    if (Math.hypot(x1 + dx * t - o.x, z1 + dz * t - o.z) < o.r) return false;
  }
  return true;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function pushOut(o: { x: number; z: number }, r: number, obstacles: Obstacle[]) {
  for (const ob of obstacles) {
    const dx = o.x - ob.x, dz = o.z - ob.z, d = Math.hypot(dx, dz), min = r + ob.r;
    if (d < min) {
      const ux = d ? dx / d : 1, uz = d ? dz / d : 0;
      o.x = ob.x + ux * min; o.z = ob.z + uz * min;
    }
  }
}

function fire(w: World, owner: string | null, x: number, z: number, angle: number, st: WeaponStats, dmgMul: number, rapid: boolean, muzzle = 0.9) {
  for (let k = 0; k < st.pellets; k++) {
    const off = st.pellets > 1 ? (k / (st.pellets - 1) - 0.5) * st.spread : (w.rand() - 0.5) * st.spread * (rapid ? 1.5 : 1);
    const a = angle + off + (st.pellets > 1 ? (w.rand() - 0.5) * 0.06 : 0);
    const life = st.life * (st.kind === 'fuego' ? 0.75 + w.rand() * 0.5 : 1);
    w.bullets.push({ id: w.nextId++, kind: st.kind, x: x + Math.sin(angle) * muzzle, z: z + Math.cos(angle) * muzzle,
      vx: Math.sin(a) * st.speed, vz: Math.cos(a) * st.speed, life, maxLife: life, enemy: false,
      dmg: st.dmg * dmgMul, blast: st.blast, pierce: st.pierce, hits: [], owner });
  }
}
const SENTRY = { ...W('Torreta', 0.35, 1.5, 30, 0.9), spread: 0.05 };

function nearestEnemy(w: World, x: number, z: number, range: number, needSight = false): Enemy | null {
  let best: Enemy | null = null, bd = range;
  for (const e of w.enemies) {
    const d = Math.hypot(e.x - x, e.z - z);
    if (d < bd && (!needSight || lineOfSight(w, x, z, e.x, e.z))) { bd = d; best = e; }
  }
  return best;
}

function damageEnemy(w: World, e: Enemy, dmg: number, owner: string | null, kx = 0, kz = 0) {
  if (e.hp <= 0) return;
  e.hp -= dmg; e.flash = 0.08;
  e.x += kx; e.z += kz;
  w.events.push({ kind: 'hit', x: e.x, z: e.z });
  if (e.hp <= 0) kill(w, e, owner);
}

function explode(w: World, b: { x: number; z: number; blast: number; dmg: number; owner: string | null }) {
  w.events.push({ kind: 'explosion', x: b.x, z: b.z, r: b.blast });
  for (const e of w.enemies) {
    const d = Math.hypot(e.x - b.x, e.z - b.z);
    if (d < b.blast + e.r) {
      const k = d ? 0.8 / d : 0;
      damageEnemy(w, e, b.dmg, b.owner, (e.x - b.x) * k, (e.z - b.z) * k);
    }
  }
  for (const o of w.obstacles) if (o.kind === 'crate' && Math.hypot(o.x - b.x, o.z - b.z) < b.blast + o.r) hitObstacle(w, o, b.dmg);
}

function hitObstacle(w: World, o: Obstacle, dmg: number) {
  if ((o.kind !== 'crate' && o.kind !== 'barricade') || o.hp <= 0) return;
  o.hp -= dmg;
  if (o.hp <= 0 && o.kind === 'barricade') w.events.push({ kind: 'crate', x: o.x, z: o.z });
  else if (o.hp <= 0) {
    w.events.push({ kind: 'crate', x: o.x, z: o.z });
    const r = w.rand();
    const type: PickupType = r < 0.45 ? 'coins' : r < 0.75 ? 'health' : 'rapid';
    w.pickups.push({ id: w.nextId++, type, x: o.x, z: o.z, life: 15 });
  }
}

/** Mueve y orienta a un jugador. El cliente multijugador la usa también para predecir su propio movimiento. */
export function movePlayer(w: World, p: Player, inp: Input, dt: number) {
  const lim = w.arena - PLAYER_R;
  let mx = inp.moveX, mz = inp.moveZ;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const speed = PLAYER_SPEED * (1 + p.speedLvl * 0.12);
  p.x = clamp(p.x + mx * speed * dt, -lim, lim);
  p.z = clamp(p.z + mz * speed * dt, -lim, lim);
  pushOut(p, PLAYER_R, w.obstacles);
  p.moving = ml > 0.15;
  if (Math.hypot(inp.aimX, inp.aimZ) > 0.15) p.angle = Math.atan2(inp.aimX, inp.aimZ);
  else if (ml > 0.15) p.angle = Math.atan2(mx, mz);
}

/**
 * Avanza la simulación. `input` se aplica al primer jugador (modo un jugador / tests);
 * en multijugador cada jugador usa su propio `p.input`, que el servidor actualiza.
 */
export function step(w: World, input: Input | null, dt: number): void {
  w.events.length = 0;
  if (w.over || w.phase === 'shop') return;
  w.time += dt;
  if (input && w.players[0]) w.players[0].input = input;
  const lim = w.arena - PLAYER_R;

  // --- Jugadores ---
  for (const p of w.players) {
    if (!p.alive) continue;
    const inp = p.input;
    movePlayer(w, p, inp, dt);
    p.cooldown -= dt; p.invuln -= dt; p.rapid -= dt; p.shield -= dt;
    if (p.regen > 0 && p.hp < p.maxHp) {
      p.regenT += dt;
      if (p.regenT >= 15) { p.regenT = 0; p.hp++; w.events.push({ kind: 'regen', pid: p.id }); }
    } else p.regenT = 0;

    if (inp.fire && p.cooldown <= 0) {
      const st = WEAPONS[p.weapon];
      p.cooldown = st.cooldown * (p.rapid > 0 ? 0.5 : 1);
      fire(w, p.id, p.x, p.z, p.angle, st, 1 + p.dmgLvl * 0.3, p.rapid > 0);
      w.events.push({ kind: 'shoot', pid: p.id, weapon: p.weapon });
    }

    // Drones escolta
    p.droneCd -= dt;
    if (p.drones > 0 && p.droneCd <= 0) {
      p.droneCd = 0.55 / p.drones;
      const i = Math.floor(w.time / (0.55 / p.drones)) % p.drones;
      const [x, z] = dronePos(w, i, p);
      const target = nearestEnemy(w, x, z, 11, true);
      if (target) fire(w, p.id, x, z, Math.atan2(target.x - x, target.z - z), { ...SENTRY, dmg: 1.2 }, 1 + p.dmgLvl * 0.3, false, 0.3);
    }
  }

  // --- Torretas ---
  for (const t of w.turrets) {
    t.life -= dt; t.cooldown -= dt;
    const target = nearestEnemy(w, t.x, t.z, 13, true);
    if (target) {
      t.angle = Math.atan2(target.x - t.x, target.z - t.z);
      if (t.cooldown <= 0) { t.cooldown = 0.35; fire(w, t.owner, t.x, t.z, t.angle, SENTRY, 1, false); }
    }
  }
  w.turrets = w.turrets.filter((t) => t.life > 0);

  // --- Minas ---
  for (const m of w.mines) {
    m.arm -= dt;
    if (m.arm > 0) continue;
    if (w.enemies.some((e) => Math.hypot(e.x - m.x, e.z - m.z) < e.r + 0.8)) {
      m.arm = -999;
      explode(w, { x: m.x, z: m.z, blast: 3.5, dmg: 12, owner: m.owner });
    }
  }
  w.mines = w.mines.filter((m) => m.arm > -999);

  // --- Oleadas ---
  w.spawnTimer -= dt;
  if (w.wave === 0 && w.spawnTimer <= 0) nextWave(w);
  else if (w.toSpawn > 0 && w.spawnTimer <= 0) {
    spawnEnemy(w, pickType(w));
    w.toSpawn--;
    w.spawnTimer = Math.max(0.3, 1.2 - w.wave * 0.08);
  }

  // --- Enemigos: cada robot va a por el jugador vivo más cercano ---
  const living = alivePlayers(w);
  for (const e of w.enemies) {
    e.flash -= dt;
    let p = living[0];
    if (!p) break;
    for (const q of living) if (Math.hypot(q.x - e.x, q.z - e.z) < Math.hypot(p.x - e.x, p.z - e.z)) p = q;
    const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 1;
    let dir = 1;
    if (e.type === 'gunner') {
      // Mantiene la distancia, pero solo se planta si te ve (si no, busca ángulo).
      const sees = lineOfSight(w, e.x, e.z, p.x, p.z);
      dir = d > 11 || !sees ? 1 : d < 8 ? -1 : 0;
      e.cooldown -= dt;
      if (e.cooldown <= 0 && d < 18 && sees) {
        e.cooldown = 1.8;
        w.bullets.push({ id: w.nextId++, kind: 'enemiga', x: e.x, z: e.z, vx: (dx / d) * ENEMY_BULLET_SPEED, vz: (dz / d) * ENEMY_BULLET_SPEED,
          life: 2, maxLife: 2, enemy: true, dmg: 1, blast: 0, pierce: 0, hits: [], owner: null });
        w.events.push({ kind: 'enemyShoot' });
      }
    }
    // Rodear obstáculos: si hay uno delante, desviarse hacia un lado.
    let ux = (dx / d) * dir, uz = (dz / d) * dir;
    // Si hay algo delante, rodearlo por un lado y mantener ese lado hasta pasarlo
    // (si no, las piezas de un muro empujan en sentidos opuestos y se anulan).
    let sx = 0, sz = 0, block = 0, nearest = Infinity, nearestCross = 0;
    if (dir !== 0) for (const o of w.obstacles) {
      const ox = o.x - e.x, oz = o.z - e.z, od = Math.hypot(ox, oz), clear = od - o.r - e.r;
      if (clear > 2.2 || od === 0) continue;
      if ((ox * ux + oz * uz) / od < 0.2) continue; // no está delante
      block = Math.max(block, 1.8 * (1 - Math.max(0, clear) / 2.2) + 0.4);
      if (od < nearest) { nearest = od; nearestCross = ox * uz - oz * ux; }
    }
    if (block > 0) {
      if (e.side === 0) e.side = nearestCross > 0 ? 1 : -1;
      e.sideT = 0.6;
      sx = (e.side > 0 ? -uz : uz) * block; sz = (e.side > 0 ? ux : -ux) * block;
    } else if ((e.sideT -= dt) <= 0) e.side = 0;
    // Atascado en un rincón: cambia de lado y lo mantiene un rato.
    e.stuckT += dt;
    if (e.stuckT > 0.75) {
      if (dir !== 0 && d > e.r + PLAYER_R + 0.6 && Math.hypot(e.x - e.ax, e.z - e.az) < 0.6) {
        e.side = e.side === 0 ? (w.rand() < 0.5 ? 1 : -1) : -e.side;
        e.sideT = 1.5;
        const bx = e.side > 0 ? -uz : uz, bz = e.side > 0 ? ux : -ux;
        sx = bx * 2.2; sz = bz * 2.2;
      }
      e.stuckT = 0; e.ax = e.x; e.az = e.z;
    }
    ux += sx; uz += sz;
    const n = Math.hypot(ux, uz) || 1;
    e.x += (ux / n) * e.speed * Math.abs(dir) * dt;
    e.z += (uz / n) * e.speed * Math.abs(dir) * dt;
  }
  for (let i = 0; i < w.enemies.length; i++)
    for (let j = i + 1; j < w.enemies.length; j++) {
      const a = w.enemies[i], b = w.enemies[j];
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.r + b.r;
      if (d > 0 && d < min) {
        const push = (min - d) / 2, ux = dx / d, uz = dz / d;
        a.x -= ux * push; a.z -= uz * push; b.x += ux * push; b.z += uz * push;
      }
    }
  for (const e of w.enemies) {
    pushOut(e, e.r, w.obstacles);
    e.x = clamp(e.x, -w.arena + e.r, w.arena - e.r);
    e.z = clamp(e.z, -w.arena + e.r, w.arena - e.r);
  }

  // --- Balas ---
  for (const b of w.bullets) {
    b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
    if (b.kind === 'fuego') { b.vx *= 1 - 2.2 * dt; b.vz *= 1 - 2.2 * dt; } // el fuego frena
    if (Math.abs(b.x) > w.arena || Math.abs(b.z) > w.arena) b.life = 0;
    // Las balas propias atraviesan tus barricadas; las enemigas las dañan.
    const ob = w.obstacles.find((o) => o.hp > 0 && !(o.kind === 'barricade' && !b.enemy) && Math.hypot(b.x - o.x, b.z - o.z) < o.r);
    if (ob && b.life > 0) {
      b.life = 0;
      if (b.blast) explode(w, b);
      else if (b.enemy) { hitObstacle(w, ob, 1); w.events.push({ kind: 'blocked', x: b.x, z: b.z }); }
      else hitObstacle(w, ob, b.dmg);
      continue;
    }
    if (b.life <= 0) { if (b.blast) explode(w, b); continue; }
    if (b.enemy) {
      const hitP = living.find((p) => p.alive && Math.hypot(b.x - p.x, b.z - p.z) < PLAYER_R + 0.25);
      if (hitP) { b.life = 0; hurt(w, hitP); }
      continue;
    }
    for (const e of w.enemies) {
      if (e.hp <= 0 || b.hits.includes(e.id) || Math.hypot(b.x - e.x, b.z - e.z) > e.r + 0.2) continue;
      if (b.blast) { b.life = 0; explode(w, b); break; }
      b.hits.push(e.id);
      damageEnemy(w, e, b.dmg, b.owner, b.vx * 0.005, b.vz * 0.005);
      if (b.pierce-- <= 0) { b.life = 0; break; }
    }
  }
  w.bullets = w.bullets.filter((b) => b.life > 0);
  w.obstacles = w.obstacles.filter((o) => o.hp > 0);

  // --- Contacto ---
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    for (const p of living) {
      if (!p.alive) continue;
      const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
      if (d < e.r + PLAYER_R) {
        hurt(w, p);
        const ux = d ? dx / d : 1, uz = d ? dz / d : 0;
        p.x = clamp(p.x + ux * 1.2, -lim, lim); p.z = clamp(p.z + uz * 1.2, -lim, lim);
        pushOut(p, PLAYER_R, w.obstacles);
      }
    }
  }
  w.enemies = w.enemies.filter((e) => e.hp > 0);

  // --- Recogibles ---
  for (const k of w.pickups) {
    k.life -= dt;
    for (const p of living) {
      if (!p.alive || k.life <= 0) continue;
      const kd = Math.hypot(k.x - p.x, k.z - p.z);
      if (p.magnet && kd < 9 && kd > 0) { const v = Math.min(kd, 14 * dt); k.x += ((p.x - k.x) / kd) * v; k.z += ((p.z - k.z) / kd) * v; }
      if (Math.hypot(k.x - p.x, k.z - p.z) < (p.magnet ? 2 : 1.3)) {
        k.life = 0;
        if (k.type === 'health') p.hp = Math.min(p.maxHp, p.hp + 1);
        else if (k.type === 'rapid') p.rapid = 6;
        else p.coins += 15;
        w.events.push({ kind: 'pickup', pid: p.id, type: k.type });
      }
    }
  }
  w.pickups = w.pickups.filter((k) => k.life > 0);

  // --- Fin de oleada → tienda ---
  if (!w.over && w.wave > 0 && w.toSpawn === 0 && w.enemies.length === 0) {
    const bonus = waveBonus(w.wave);
    for (const p of w.players) p.coins += bonus;
    w.phase = 'shop';
    w.bullets = w.bullets.filter((b) => !b.enemy);
    w.events.push({ kind: 'waveCleared', bonus });
  }
}

function hurt(w: World, p: Player) {
  if (!p.alive || p.invuln > 0 || p.shield > 0 || w.over) return;
  p.hp--; p.invuln = 1;
  w.events.push({ kind: 'hurt', pid: p.id });
  if (p.hp <= 0) {
    p.alive = false;
    w.events.push({ kind: 'down', pid: p.id });
    if (!w.players.some((q) => q.alive)) { w.over = true; w.events.push({ kind: 'gameover' }); }
  }
}

function kill(w: World, e: Enemy, owner: string | null) {
  const s = STATS[e.type];
  const pts = s.score * Math.max(1, w.wave);
  w.score += pts;
  const killer = owner ? w.players.find((p) => p.id === owner) : undefined;
  if (killer) { killer.coins += s.coins; killer.score += pts; killer.kills++; }
  w.events.push({ kind: 'kill', x: e.x, z: e.z, type: e.type, coins: s.coins, pid: killer?.id ?? null });
  const chance = e.type === 'tank' ? 0.3 : 0.06;
  if (w.rand() < chance) w.pickups.push({ id: w.nextId++, type: w.rand() < 0.5 ? 'health' : 'rapid', x: e.x, z: e.z, life: 10 });
}
