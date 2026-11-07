// Simulación pura del shooter (2D en el plano XZ). Sin Three.js ni DOM: se puede testear.

export type EnemyType = 'chaser' | 'tank' | 'gunner';
export type PickupType = 'health' | 'rapid' | 'coins';
export type WeaponId = 'pistola' | 'subfusil' | 'fusil' | 'escopeta' | 'ametralladora' | 'lanzallamas' | 'francotirador' | 'tesla' | 'granadas' | 'cohetes';
export type ToolId = 'torreta' | 'mina' | 'escudo' | 'barricada' | 'aereo' | 'emp' | 'senuelo';
export type BuildId = 'muro' | 'pinchos' | 'torre' | 'medico';
export type BulletKind = 'bala' | 'perdigon' | 'fuego' | 'rayo' | 'tesla' | 'granada' | 'cohete' | 'enemiga';
export type ObstacleKind = 'rock' | 'tree' | 'crate' | 'sandbag' | 'barricade' | 'wall' | 'tower' | 'medic';
export type ItemId = WeaponId | ToolId | 'botiquin' | 'armadura' | 'botas' | 'municion' | 'iman' | 'regeneracion' | 'dron';
export type Phase = 'fight' | 'shop';

export interface Input { moveX: number; moveZ: number; aimX: number; aimZ: number; fire: boolean }
export interface Player {
  x: number; z: number; angle: number; hp: number; maxHp: number; cooldown: number; invuln: number; rapid: number;
  weapon: WeaponId; owned: WeaponId[]; tools: Record<ToolId, number>;
  speedLvl: number; armorLvl: number; dmgLvl: number; magnet: number; regen: number; regenT: number; drones: number; droneCd: number;
  shield: number; moving: boolean; wood: number;
}
export interface Bullet {
  id: number; kind: BulletKind; x: number; z: number; vx: number; vz: number; life: number; maxLife: number;
  enemy: boolean; dmg: number; blast: number; pierce: number; hits: number[];
}
export interface Mine { id: number; x: number; z: number; arm: number }
export interface Enemy { id: number; type: EnemyType; x: number; z: number; hp: number; maxHp: number; speed: number; r: number; cooldown: number; flash: number; side: number; sideT: number; ax: number; az: number; stuckT: number; stun: number }
export interface Pickup { id: number; type: PickupType; x: number; z: number; life: number }
export interface Obstacle { id: number; kind: ObstacleKind; x: number; z: number; r: number; hp: number; rot: number; maxHp?: number; timer?: number }
/** Trampa de pinchos: daña y frena a los robots que la pisan. Sin colisión. */
export interface Trap { id: number; x: number; z: number; r: number; rot: number }
/** Señuelo: los robots cercanos lo atacan a él en vez de a ti. */
export interface Decoy { id: number; x: number; z: number; hp: number; life: number }
/** Bombardeo programado: explota cuando el tiempo llega a 0. */
export interface Strike { id: number; x: number; z: number; t: number }
export interface Turret { id: number; x: number; z: number; angle: number; cooldown: number; life: number; tower?: number /* id del obstáculo-torre de la base */ }
export type GameEvent =
  | { kind: 'shoot'; weapon: WeaponId } | { kind: 'hit'; x: number; z: number }
  | { kind: 'kill'; x: number; z: number; type: EnemyType; coins: number } | { kind: 'hurt' }
  | { kind: 'pickup'; type: PickupType } | { kind: 'wave'; wave: number } | { kind: 'gameover' }
  | { kind: 'enemyShoot' } | { kind: 'explosion'; x: number; z: number; r: number }
  | { kind: 'crate'; x: number; z: number } | { kind: 'waveCleared'; bonus: number; wood: number }
  | { kind: 'tool'; tool: ToolId } | { kind: 'regen' } | { kind: 'blocked'; x: number; z: number }
  | { kind: 'armorBlock' } | { kind: 'chain'; points: [number, number][] } | { kind: 'emp'; x: number; z: number; r: number }
  | { kind: 'strikeMark'; x: number; z: number } | { kind: 'build'; what: BuildId; x: number; z: number } | { kind: 'structureLost'; x: number; z: number };

export interface World {
  arena: number; // medio lado del campo cuadrado
  player: Player;
  bullets: Bullet[]; enemies: Enemy[]; pickups: Pickup[]; obstacles: Obstacle[]; turrets: Turret[]; mines: Mine[];
  traps: Trap[]; decoys: Decoy[]; strikes: Strike[];
  phase: Phase;
  wave: number; toSpawn: number; spawnTimer: number;
  score: number; coins: number; over: boolean; time: number;
  events: GameEvent[];
  nextId: number;
  rand: () => number;
}

export const PLAYER_R = 0.6;
const PLAYER_SPEED = 9;
const ENEMY_BULLET_SPEED = 13;

export interface WeaponStats {
  name: string; cooldown: number; dmg: number; speed: number; pellets: number; spread: number; life: number;
  blast: number; pierce: number; kind: BulletKind; chain?: number; slow?: number;
}
const W = (name: string, cooldown: number, dmg: number, speed: number, life: number, o: Partial<WeaponStats> = {}): WeaponStats =>
  ({ name, cooldown, dmg, speed, life, pellets: 1, spread: 0.03, blast: 0, pierce: 0, kind: 'bala', ...o });
export const WEAPONS: Record<WeaponId, WeaponStats> = {
  pistola: W('Pistola', 0.28, 2, 30, 0.9),
  subfusil: W('Subfusil', 0.085, 1, 34, 0.8, { spread: 0.12 }),
  fusil: W('Fusil de asalto', 0.11, 1.6, 40, 0.85, { spread: 0.05 }),
  escopeta: W('Escopeta', 0.6, 2, 28, 0.42, { pellets: 6, spread: 0.5, kind: 'perdigon' }),
  ametralladora: W('Ametralladora', 0.05, 1, 36, 0.8, { spread: 0.2, slow: 0.6 }),
  lanzallamas: W('Lanzallamas', 0.045, 0.5, 13, 0.4, { spread: 0.35, pierce: 3, kind: 'fuego' }),
  francotirador: W('Francotirador', 0.9, 9, 70, 0.7, { spread: 0, pierce: 4, kind: 'rayo' }),
  tesla: W('Cañón Tesla', 0.55, 3.5, 45, 0.5, { spread: 0, kind: 'tesla', chain: 3 }),
  granadas: W('Lanzagranadas', 0.8, 5, 18, 0.75, { spread: 0, blast: 3.2, kind: 'granada' }),
  cohetes: W('Lanzacohetes', 1.15, 10, 24, 1.3, { spread: 0, blast: 4.5, kind: 'cohete' }),
};
export const WEAPON_ORDER: WeaponId[] = ['pistola', 'subfusil', 'fusil', 'escopeta', 'ametralladora', 'lanzallamas', 'francotirador', 'tesla', 'granadas', 'cohetes'];
export const TOOL_ORDER: ToolId[] = ['torreta', 'mina', 'escudo', 'barricada', 'aereo', 'emp', 'senuelo'];

/** Armadura: cada nivel suma vida; al nivel máximo, probabilidad de bloquear un golpe por completo. */
export const ARMOR_MAX = 3;
export const ARMOR_BLOCK_CHANCE = 0.3;

/** Construcción de la base con madera (se gana al superar oleadas). */
export interface BuildItem { id: BuildId; name: string; desc: string; wood: number }
export const BUILDS: BuildItem[] = [
  { id: 'muro', name: 'Muro de madera', desc: 'Tres tramos que frenan a los robots y paran sus balas', wood: 4 },
  { id: 'pinchos', name: 'Pinchos', desc: 'Dañan y frenan a los robots que los pisan', wood: 5 },
  { id: 'medico', name: 'Puesto médico', desc: 'Cura 1 de vida cada 6 s si estás cerca', wood: 10 },
  { id: 'torre', name: 'Torre de guardia', desc: 'Dispara sola a los robots, de forma permanente', wood: 12 },
];
export const woodReward = (wave: number) => 3 + wave;
const STRUCTURE_HP: Partial<Record<ObstacleKind, number>> = { wall: 40, tower: 35, medic: 30 };
/** Daño por segundo que hace cada robot al empujar contra una estructura de la base. */
const SIEGE_DPS: Record<EnemyType, number> = { chaser: 3, gunner: 2, tank: 8 };

export type ShopKind = 'arma' | 'mejora' | 'equipo';
export interface ShopItem { id: ItemId; name: string; desc: string; price: number; max?: number; kind: ShopKind }
export const SHOP: ShopItem[] = [
  { id: 'subfusil', name: 'Subfusil', desc: 'Dispara muy rápido', price: 60, kind: 'arma' },
  { id: 'fusil', name: 'Fusil de asalto', desc: 'Preciso, potente y automático', price: 100, kind: 'arma' },
  { id: 'escopeta', name: 'Escopeta', desc: '6 perdigones, corto alcance', price: 90, kind: 'arma' },
  { id: 'ametralladora', name: 'Ametralladora', desc: 'Lluvia de balas; te frena al disparar', price: 180, kind: 'arma' },
  { id: 'lanzallamas', name: 'Lanzallamas', desc: 'Chorro de fuego que atraviesa', price: 120, kind: 'arma' },
  { id: 'francotirador', name: 'Francotirador', desc: 'Mucho daño, atraviesa 4 enemigos', price: 140, kind: 'arma' },
  { id: 'tesla', name: 'Cañón Tesla', desc: 'El rayo salta a 3 robots cercanos', price: 200, kind: 'arma' },
  { id: 'granadas', name: 'Lanzagranadas', desc: 'Explota y daña en área', price: 160, kind: 'arma' },
  { id: 'cohetes', name: 'Lanzacohetes', desc: 'Explosión enorme', price: 220, kind: 'arma' },
  { id: 'botiquin', name: 'Botiquín', desc: 'Recupera 2 de vida', price: 20, kind: 'mejora' },
  { id: 'armadura', name: 'Armadura', desc: '+1 de vida máxima. Al nivel 3: 30% de bloquear golpes', price: 50, max: 3, kind: 'mejora' },
  { id: 'botas', name: 'Botas', desc: '+12% de velocidad', price: 40, max: 2, kind: 'mejora' },
  { id: 'municion', name: 'Munición pesada', desc: '+30% de daño', price: 70, max: 2, kind: 'mejora' },
  { id: 'iman', name: 'Imán', desc: 'Atrae monedas y objetos', price: 40, max: 1, kind: 'mejora' },
  { id: 'regeneracion', name: 'Regeneración', desc: '+1 de vida cada 15 s', price: 80, max: 1, kind: 'mejora' },
  { id: 'dron', name: 'Dron escolta', desc: 'Te sigue y dispara solo', price: 90, max: 2, kind: 'mejora' },
  { id: 'torreta', name: 'Torreta', desc: 'Dispara sola durante 30 s', price: 50, max: 3, kind: 'equipo' },
  { id: 'mina', name: 'Mina', desc: 'Explota cuando pasa un robot', price: 25, max: 5, kind: 'equipo' },
  { id: 'escudo', name: 'Escudo', desc: '5 s sin recibir daño', price: 45, max: 3, kind: 'equipo' },
  { id: 'barricada', name: 'Barricada', desc: 'Muro de sacos que para balas', price: 30, max: 3, kind: 'equipo' },
  { id: 'aereo', name: 'Ataque aéreo', desc: 'Bombardeo en línea delante de ti', price: 80, max: 2, kind: 'equipo' },
  { id: 'emp', name: 'Pulso EMP', desc: 'Paraliza 3 s a los robots cercanos', price: 60, max: 2, kind: 'equipo' },
  { id: 'senuelo', name: 'Señuelo', desc: 'Los robots lo atacan a él durante 8 s', price: 35, max: 3, kind: 'equipo' },
];

const STATS: Record<EnemyType, { hp: number; speed: number; r: number; score: number; coins: number }> = {
  chaser: { hp: 3, speed: 5, r: 0.6, score: 10, coins: 3 },
  tank: { hp: 14, speed: 2.6, r: 1.05, score: 30, coins: 10 },
  gunner: { hp: 5, speed: 3.6, r: 0.7, score: 20, coins: 6 },
};

export function newWorld(rand: () => number = Math.random, withObstacles = true): World {
  const w: World = {
    arena: 30,
    player: { x: 0, z: 0, angle: Math.PI, hp: 5, maxHp: 5, cooldown: 0, invuln: 0, rapid: 0,
      weapon: 'pistola', owned: ['pistola'], tools: { torreta: 0, mina: 0, escudo: 0, barricada: 0, aereo: 0, emp: 0, senuelo: 0 }, wood: 0,
      speedLvl: 0, armorLvl: 0, dmgLvl: 0, magnet: 0, regen: 0, regenT: 0, drones: 0, droneCd: 0, shield: 0, moving: false },
    bullets: [], enemies: [], pickups: [], obstacles: [], turrets: [], mines: [], traps: [], decoys: [], strikes: [],
    phase: 'fight', wave: 0, toSpawn: 0, spawnTimer: 1.5,
    score: 0, coins: 0, over: false, time: 0, events: [], nextId: 1, rand,
  };
  if (withObstacles) generateObstacles(w);
  return w;
}

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

export const waveSize = (wave: number) => 4 + wave * 3;
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
  const en: Enemy = { id: w.nextId++, type, x, z, hp, maxHp: hp, speed, r: s.r, cooldown: 1 + w.rand() * 1.5, flash: 0, side: 0, sideT: 0, ax: x, az: z, stuckT: 0, stun: 0 };
  w.enemies.push(en);
  return en;
}

// ---------- Tienda ----------

const isTool = (id: ItemId): id is ToolId => (TOOL_ORDER as string[]).includes(id);

export function owns(w: World, id: ItemId): number {
  const p = w.player;
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
export function cannotBuy(w: World, id: ItemId): string | null {
  const item = SHOP.find((s) => s.id === id);
  if (!item) return 'No existe';
  const n = owns(w, id);
  if (item.kind === 'arma' && n) return 'Comprada';
  if (item.max !== undefined && n >= item.max) return 'Al máximo';
  if (id === 'botiquin' && w.player.hp >= w.player.maxHp) return 'Vida llena';
  if (w.coins < item.price) return 'Faltan monedas';
  return null;
}

export function buy(w: World, id: ItemId): boolean {
  if (cannotBuy(w, id)) return false;
  const p = w.player;
  w.coins -= SHOP.find((s) => s.id === id)!.price;
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

export function selectWeapon(w: World, id: WeaponId) {
  if (w.player.owned.includes(id)) w.player.weapon = id;
}

/** Usa una herramienta del inventario en la posición del jugador. */
export function useTool(w: World, id: ToolId): boolean {
  const p = w.player;
  if (p.tools[id] <= 0 || w.phase !== 'fight' || w.over) return false;
  if (id === 'escudo' && p.shield > 0) return false;
  p.tools[id]--;
  const sx = Math.sin(p.angle), sz = Math.cos(p.angle);
  switch (id) {
    case 'torreta': w.turrets.push({ id: w.nextId++, x: p.x, z: p.z, angle: p.angle, cooldown: 0, life: 30 }); break;
    case 'mina': w.mines.push({ id: w.nextId++, x: p.x, z: p.z, arm: 1 }); break;
    case 'escudo': p.shield = 5; break;
    case 'barricada':
      // 3 segmentos perpendiculares a donde miras, 2,4 m por delante
      for (let k = -1; k <= 1; k++) {
        const x = p.x + sx * 2.4 + sz * k * 1.4, z = p.z + sz * 2.4 - sx * k * 1.4;
        if (Math.abs(x) < w.arena - 1 && Math.abs(z) < w.arena - 1)
          w.obstacles.push({ id: w.nextId++, kind: 'barricade', x, z, r: 0.75, hp: 18, rot: Math.atan2(sx, -sz) });
      }
      break;
    case 'aereo':
      // Cinco bombas en línea por delante, con un segundo de aviso (marcas en el suelo)
      for (let k = 0; k < 5; k++) {
        const d = 4 + k * 3, x = clamp(p.x + sx * d, -w.arena + 1, w.arena - 1), z = clamp(p.z + sz * d, -w.arena + 1, w.arena - 1);
        w.strikes.push({ id: w.nextId++, x, z, t: 1.2 + k * 0.15 });
        w.events.push({ kind: 'strikeMark', x, z });
      }
      break;
    case 'emp':
      for (const e of w.enemies) if (Math.hypot(e.x - p.x, e.z - p.z) < 9) { e.stun = 3; e.cooldown = Math.max(e.cooldown, 3); }
      w.events.push({ kind: 'emp', x: p.x, z: p.z, r: 9 });
      break;
    case 'senuelo':
      w.decoys.push({ id: w.nextId++, x: p.x + sx * 1.5, z: p.z + sz * 1.5, hp: 15, life: 8 });
      break;
  }
  w.events.push({ kind: 'tool', tool: id });
  return true;
}

// ---------- Construcción de la base ----------

/** Por qué no se puede construir (o null si se puede). Se construye delante del jugador. */
export function cannotBuild(w: World, id: BuildId): string | null {
  const item = BUILDS.find((b) => b.id === id);
  if (!item) return 'No existe';
  if (w.over) return 'Partida terminada';
  if (w.player.wood < item.wood) return 'Falta madera';
  if (!buildSpots(w, id).length) return 'No hay sitio';
  return null;
}

function buildSpots(w: World, id: BuildId): { x: number; z: number; r: number }[] {
  const p = w.player, sx = Math.sin(p.angle), sz = Math.cos(p.angle);
  const fits = (x: number, z: number, r: number) =>
    Math.abs(x) < w.arena - r && Math.abs(z) < w.arena - r &&
    w.obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r - 0.1) &&
    Math.hypot(p.x - x, p.z - z) > PLAYER_R + r;
  if (id === 'muro') {
    const segs = [-1, 0, 1].map((k) => ({ x: p.x + sx * 2.6 + sz * k * 1.5, z: p.z + sz * 2.6 - sx * k * 1.5, r: 0.8 }));
    return segs.filter((g) => fits(g.x, g.z, g.r));
  }
  const d = id === 'pinchos' ? 2.4 : 2.8, r = id === 'pinchos' ? 1.3 : 0.9;
  const spot = { x: p.x + sx * d, z: p.z + sz * d, r };
  if (id === 'pinchos') return Math.abs(spot.x) < w.arena - r && Math.abs(spot.z) < w.arena - r ? [spot] : [];
  return fits(spot.x, spot.z, r) ? [spot] : [];
}

/** Construye una estructura de la base delante del jugador, pagando con madera. */
export function build(w: World, id: BuildId): boolean {
  if (cannotBuild(w, id)) return false;
  const p = w.player, item = BUILDS.find((b) => b.id === id)!;
  const spots = buildSpots(w, id);
  p.wood -= item.wood;
  const rot = Math.atan2(Math.sin(p.angle), -Math.cos(p.angle));
  for (const s of spots) {
    if (id === 'pinchos') w.traps.push({ id: w.nextId++, x: s.x, z: s.z, r: s.r, rot });
    else {
      const kind: ObstacleKind = id === 'muro' ? 'wall' : id === 'torre' ? 'tower' : 'medic';
      const hp = STRUCTURE_HP[kind]!;
      const o: Obstacle = { id: w.nextId++, kind, x: s.x, z: s.z, r: s.r, hp, maxHp: hp, rot, timer: 0 };
      w.obstacles.push(o);
      if (kind === 'tower') w.turrets.push({ id: w.nextId++, x: s.x, z: s.z, angle: p.angle, cooldown: 0, life: Infinity, tower: o.id });
    }
  }
  w.events.push({ kind: 'build', what: id, x: spots[0].x, z: spots[0].z });
  return true;
}

/** Estructuras de la base (las que los robots atacan). */
const isStructure = (o: Obstacle) => o.kind === 'wall' || o.kind === 'tower' || o.kind === 'medic' || o.kind === 'barricade';

/** Posición del dron i (giran alrededor del jugador). */
export function dronePos(w: World, i: number): [number, number] {
  const a = w.time * 1.8 + (i * Math.PI * 2) / Math.max(1, w.player.drones);
  return [w.player.x + Math.cos(a) * 1.9, w.player.z + Math.sin(a) * 1.9];
}

export function nextWave(w: World) {
  if (w.over) return;
  w.phase = 'fight';
  w.wave++;
  w.toSpawn = waveSize(w.wave);
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

function fire(w: World, x: number, z: number, angle: number, st: WeaponStats, dmgMul: number, rapid: boolean, muzzle = 0.9) {
  for (let k = 0; k < st.pellets; k++) {
    const off = st.pellets > 1 ? (k / (st.pellets - 1) - 0.5) * st.spread : (w.rand() - 0.5) * st.spread * (rapid ? 1.5 : 1);
    const a = angle + off + (st.pellets > 1 ? (w.rand() - 0.5) * 0.06 : 0);
    const life = st.life * (st.kind === 'fuego' ? 0.75 + w.rand() * 0.5 : 1);
    w.bullets.push({ id: w.nextId++, kind: st.kind, x: x + Math.sin(angle) * muzzle, z: z + Math.cos(angle) * muzzle,
      vx: Math.sin(a) * st.speed, vz: Math.cos(a) * st.speed, life, maxLife: life, enemy: false,
      dmg: st.dmg * dmgMul, blast: st.blast, pierce: st.pierce, hits: [] });
  }
}
const SENTRY = { ...W('Torreta', 0.35, 1.5, 30, 0.9), spread: 0.05 };
const TOWER_GUN = { ...W('Torre', 0.45, 1.4, 34, 0.8), spread: 0.04 };

function nearestEnemy(w: World, x: number, z: number, range: number, needSight = false): Enemy | null {
  let best: Enemy | null = null, bd = range;
  for (const e of w.enemies) {
    const d = Math.hypot(e.x - x, e.z - z);
    if (d < bd && (!needSight || lineOfSight(w, x, z, e.x, e.z))) { bd = d; best = e; }
  }
  return best;
}

function damageEnemy(w: World, e: Enemy, dmg: number, kx = 0, kz = 0) {
  if (e.hp <= 0) return;
  e.hp -= dmg; e.flash = 0.08;
  e.x += kx; e.z += kz;
  w.events.push({ kind: 'hit', x: e.x, z: e.z });
  if (e.hp <= 0) kill(w, e);
}

function explode(w: World, b: { x: number; z: number; blast: number; dmg: number }) {
  w.events.push({ kind: 'explosion', x: b.x, z: b.z, r: b.blast });
  for (const e of w.enemies) {
    const d = Math.hypot(e.x - b.x, e.z - b.z);
    if (d < b.blast + e.r) {
      const k = d ? 0.8 / d : 0;
      damageEnemy(w, e, b.dmg, (e.x - b.x) * k, (e.z - b.z) * k);
    }
  }
  for (const o of w.obstacles) if (o.kind === 'crate' && Math.hypot(o.x - b.x, o.z - b.z) < b.blast + o.r) hitObstacle(w, o, b.dmg);
}

function hitObstacle(w: World, o: Obstacle, dmg: number) {
  if ((o.kind !== 'crate' && !isStructure(o)) || o.hp <= 0) return;
  o.hp -= dmg;
  if (o.hp <= 0 && isStructure(o)) w.events.push({ kind: o.kind === 'barricade' ? 'crate' : 'structureLost', x: o.x, z: o.z });
  else if (o.hp <= 0) {
    w.events.push({ kind: 'crate', x: o.x, z: o.z });
    const r = w.rand();
    const type: PickupType = r < 0.45 ? 'coins' : r < 0.75 ? 'health' : 'rapid';
    w.pickups.push({ id: w.nextId++, type, x: o.x, z: o.z, life: 15 });
  }
}

export function step(w: World, input: Input, dt: number): void {
  w.events.length = 0;
  if (w.over || w.phase === 'shop') return;
  w.time += dt;
  const p = w.player;
  const lim = w.arena - PLAYER_R;

  // --- Jugador ---
  let mx = input.moveX, mz = input.moveZ;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const slow = input.fire ? WEAPONS[p.weapon].slow ?? 1 : 1; // la ametralladora pesa: frena mientras disparas
  const speed = PLAYER_SPEED * (1 + p.speedLvl * 0.12) * slow;
  p.x = clamp(p.x + mx * speed * dt, -lim, lim);
  p.z = clamp(p.z + mz * speed * dt, -lim, lim);
  pushOut(p, PLAYER_R, w.obstacles);
  p.moving = ml > 0.15;
  if (Math.hypot(input.aimX, input.aimZ) > 0.15) p.angle = Math.atan2(input.aimX, input.aimZ);
  else if (ml > 0.15) p.angle = Math.atan2(mx, mz);
  p.cooldown -= dt; p.invuln -= dt; p.rapid -= dt; p.shield -= dt;
  if (p.regen > 0 && p.hp < p.maxHp) {
    p.regenT += dt;
    if (p.regenT >= 15) { p.regenT = 0; p.hp++; w.events.push({ kind: 'regen' }); }
  } else p.regenT = 0;

  if (input.fire && p.cooldown <= 0) {
    const st = WEAPONS[p.weapon];
    p.cooldown = st.cooldown * (p.rapid > 0 ? 0.5 : 1);
    fire(w, p.x, p.z, p.angle, st, 1 + p.dmgLvl * 0.3, p.rapid > 0);
    w.events.push({ kind: 'shoot', weapon: p.weapon });
  }

  // --- Torretas ---
  for (const t of w.turrets) {
    t.life -= dt; t.cooldown -= dt;
    if (t.tower !== undefined && !w.obstacles.some((o) => o.id === t.tower && o.hp > 0)) { t.life = 0; continue; }
    const tower = t.tower !== undefined;
    const target = nearestEnemy(w, t.x, t.z, tower ? 15 : 13, !tower); // la torre dispara por encima de la cobertura
    if (target) {
      t.angle = Math.atan2(target.x - t.x, target.z - t.z);
      if (t.cooldown <= 0) { t.cooldown = tower ? 0.45 : 0.35; fire(w, t.x, t.z, t.angle, tower ? TOWER_GUN : SENTRY, 1 + p.dmgLvl * 0.3, false, tower ? 1 : 0.9); }
    }
  }
  w.turrets = w.turrets.filter((t) => t.life > 0);

  // --- Base: puesto médico, señuelos y bombardeos ---
  for (const o of w.obstacles) {
    if (o.kind !== 'medic') continue;
    o.timer = (o.timer ?? 0) + dt;
    if (o.timer >= 6) {
      o.timer = 0;
      if (p.hp < p.maxHp && Math.hypot(p.x - o.x, p.z - o.z) < 3.2) { p.hp++; w.events.push({ kind: 'regen' }); }
    }
  }
  for (const d of w.decoys) d.life -= dt;
  w.decoys = w.decoys.filter((d) => d.life > 0 && d.hp > 0);
  for (const s of w.strikes) {
    s.t -= dt;
    if (s.t <= 0) explode(w, { x: s.x, z: s.z, blast: 3, dmg: 10 });
  }
  w.strikes = w.strikes.filter((s) => s.t > 0);

  // --- Drones escolta ---
  p.droneCd -= dt;
  if (p.drones > 0 && p.droneCd <= 0) {
    p.droneCd = 0.55 / p.drones;
    const i = Math.floor(w.time / (0.55 / p.drones)) % p.drones;
    const [x, z] = dronePos(w, i);
    const target = nearestEnemy(w, x, z, 11, true);
    if (target) fire(w, x, z, Math.atan2(target.x - x, target.z - z), { ...SENTRY, dmg: 1.2 }, 1 + p.dmgLvl * 0.3, false, 0.3);
  }

  // --- Minas ---
  for (const m of w.mines) {
    m.arm -= dt;
    if (m.arm > 0) continue;
    if (w.enemies.some((e) => Math.hypot(e.x - m.x, e.z - m.z) < e.r + 0.8)) {
      m.arm = -999;
      explode(w, { x: m.x, z: m.z, blast: 3.5, dmg: 12 });
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

  // --- Enemigos ---
  for (const e of w.enemies) {
    e.flash -= dt;
    if (e.stun > 0) { e.stun -= dt; continue; } // paralizado por el pulso EMP: ni anda ni dispara
    // Objetivo: el jugador, o un señuelo si está más cerca (y a menos de 14 m)
    let tx = p.x, tz = p.z;
    let best = Math.hypot(p.x - e.x, p.z - e.z);
    for (const dc of w.decoys) {
      const dd = Math.hypot(dc.x - e.x, dc.z - e.z);
      if (dd < 14 && dd < best + 6) { best = dd; tx = dc.x; tz = dc.z; } // el señuelo tira más que el jugador
    }
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1;
    let dir = 1;
    // Pinchos: frenan a la mitad y dañan mientras los pisa
    let spike = 1;
    for (const t of w.traps) if (Math.hypot(t.x - e.x, t.z - e.z) < t.r + e.r * 0.5) { spike = 0.5; e.hp -= 4 * dt; e.flash = 0.03; }
    if (e.hp <= 0) { kill(w, e); continue; }
    if (e.type === 'gunner') {
      // Mantiene la distancia, pero solo se planta si te ve (si no, busca ángulo).
      const sees = lineOfSight(w, e.x, e.z, tx, tz);
      dir = d > 11 || !sees ? 1 : d < 8 ? -1 : 0;
      e.cooldown -= dt;
      if (e.cooldown <= 0 && d < 18 && sees) {
        e.cooldown = 1.8;
        w.bullets.push({ id: w.nextId++, kind: 'enemiga', x: e.x, z: e.z, vx: (dx / d) * ENEMY_BULLET_SPEED, vz: (dz / d) * ENEMY_BULLET_SPEED,
          life: 2, maxLife: 2, enemy: true, dmg: 1, blast: 0, pierce: 0, hits: [] });
        w.events.push({ kind: 'enemyShoot' });
      }
    }
    // Rodear obstáculos: si hay uno delante, desviarse hacia un lado.
    let ux = (dx / d) * dir, uz = (dz / d) * dir;
    // Si hay algo delante, rodearlo por un lado y mantener ese lado hasta pasarlo
    // (si no, las piezas de un muro empujan en sentidos opuestos y se anulan).
    let sx = 0, sz = 0, block = 0, nearest = Infinity, nearestCross = 0;
    if (dir !== 0) for (const o of w.obstacles) {
      if (isStructure(o)) continue; // tus estructuras no se rodean: se atacan (defensa de la base)
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
      const sieging = w.obstacles.some((o) => isStructure(o) && Math.hypot(o.x - e.x, o.z - e.z) < o.r + e.r + 0.3);
      if (!sieging && dir !== 0 && d > e.r + PLAYER_R + 0.6 && Math.hypot(e.x - e.ax, e.z - e.az) < 0.6) {
        e.side = e.side === 0 ? (w.rand() < 0.5 ? 1 : -1) : -e.side;
        e.sideT = 1.5;
        const bx = e.side > 0 ? -uz : uz, bz = e.side > 0 ? ux : -ux;
        sx = bx * 2.2; sz = bz * 2.2;
      }
      e.stuckT = 0; e.ax = e.x; e.az = e.z;
    }
    ux += sx; uz += sz;
    const n = Math.hypot(ux, uz) || 1;
    e.x += (ux / n) * e.speed * spike * Math.abs(dir) * dt;
    e.z += (uz / n) * e.speed * spike * Math.abs(dir) * dt;
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
    if (e.hp <= 0 || e.stun > 0) continue;
    // Asedio: los robots dañan las estructuras de la base y los señuelos que tocan
    for (const o of w.obstacles) if (isStructure(o) && o.hp > 0 && Math.hypot(o.x - e.x, o.z - e.z) < o.r + e.r + 0.15) hitObstacle(w, o, SIEGE_DPS[e.type] * dt);
    for (const dc of w.decoys) if (Math.hypot(dc.x - e.x, dc.z - e.z) < e.r + 0.7) dc.hp -= SIEGE_DPS[e.type] * dt;
  }

  // --- Balas ---
  for (const b of w.bullets) {
    b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
    if (b.kind === 'fuego') { b.vx *= 1 - 2.2 * dt; b.vz *= 1 - 2.2 * dt; } // el fuego frena
    if (Math.abs(b.x) > w.arena || Math.abs(b.z) > w.arena) b.life = 0;
    // Las balas propias atraviesan tus barricadas; las enemigas las dañan.
    // (también tus muros, torres y puesto médico)
    const ob = w.obstacles.find((o) => o.hp > 0 && !(isStructure(o) && !b.enemy) && Math.hypot(b.x - o.x, b.z - o.z) < o.r);
    if (ob && b.life > 0) {
      b.life = 0;
      if (b.blast) explode(w, b);
      else if (b.enemy) { hitObstacle(w, ob, 1); w.events.push({ kind: 'blocked', x: b.x, z: b.z }); }
      else hitObstacle(w, ob, b.dmg);
      continue;
    }
    if (b.life <= 0) { if (b.blast) explode(w, b); continue; }
    if (b.enemy) {
      const dc = w.decoys.find((d) => Math.hypot(b.x - d.x, b.z - d.z) < 0.7);
      if (dc) { b.life = 0; dc.hp -= 2; continue; }
      if (Math.hypot(b.x - p.x, b.z - p.z) < PLAYER_R + 0.25) { b.life = 0; hurt(w); }
      continue;
    }
    for (const e of w.enemies) {
      if (e.hp <= 0 || b.hits.includes(e.id) || Math.hypot(b.x - e.x, b.z - e.z) > e.r + 0.2) continue;
      if (b.blast) { b.life = 0; explode(w, b); break; }
      b.hits.push(e.id);
      damageEnemy(w, e, b.dmg, b.vx * 0.005, b.vz * 0.005);
      if (b.kind === 'tesla') { chainLightning(w, e, b.dmg); b.life = 0; break; }
      if (b.pierce-- <= 0) { b.life = 0; break; }
    }
  }
  w.bullets = w.bullets.filter((b) => b.life > 0);
  w.obstacles = w.obstacles.filter((o) => o.hp > 0);

  // --- Contacto ---
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
    if (d < e.r + PLAYER_R) {
      hurt(w);
      const ux = d ? dx / d : 1, uz = d ? dz / d : 0;
      p.x = clamp(p.x + ux * 1.2, -lim, lim); p.z = clamp(p.z + uz * 1.2, -lim, lim);
      pushOut(p, PLAYER_R, w.obstacles);
    }
  }
  w.enemies = w.enemies.filter((e) => e.hp > 0);

  // --- Recogibles ---
  const grab = p.magnet ? 2 : 1.3;
  for (const k of w.pickups) {
    k.life -= dt;
    const kd = Math.hypot(k.x - p.x, k.z - p.z);
    if (p.magnet && kd < 9 && kd > 0) { const v = Math.min(kd, 14 * dt); k.x += ((p.x - k.x) / kd) * v; k.z += ((p.z - k.z) / kd) * v; }
    if (Math.hypot(k.x - p.x, k.z - p.z) < grab) {
      k.life = 0;
      if (k.type === 'health') p.hp = Math.min(p.maxHp, p.hp + 1);
      else if (k.type === 'rapid') p.rapid = 6;
      else w.coins += 15;
      w.events.push({ kind: 'pickup', type: k.type });
    }
  }
  w.pickups = w.pickups.filter((k) => k.life > 0);

  // --- Fin de oleada: abrir la tienda ---
  if (!w.over && w.wave > 0 && w.toSpawn === 0 && w.enemies.length === 0) {
    const bonus = waveBonus(w.wave), wood = woodReward(w.wave);
    w.coins += bonus;
    p.wood += wood;
    w.phase = 'shop';
    w.bullets = w.bullets.filter((b) => !b.enemy);
    w.strikes = [];
    w.events.push({ kind: 'waveCleared', bonus, wood });
  }
}

/** Cañón Tesla: el rayo salta del primer robot a los más cercanos, perdiendo fuerza en cada salto. */
function chainLightning(w: World, first: Enemy, dmg: number) {
  const hit = new Set([first.id]);
  const points: [number, number][] = [[first.x, first.z]];
  let from = first, power = dmg;
  for (let k = 0; k < (WEAPONS.tesla.chain ?? 0); k++) {
    let next: Enemy | null = null, bd = 5.5;
    for (const e of w.enemies) {
      if (e.hp <= 0 || hit.has(e.id)) continue;
      const d = Math.hypot(e.x - from.x, e.z - from.z);
      if (d < bd) { bd = d; next = e; }
    }
    if (!next) break;
    power *= 0.8;
    hit.add(next.id);
    points.push([next.x, next.z]);
    damageEnemy(w, next, power);
    from = next;
  }
  w.events.push({ kind: 'chain', points });
}

function hurt(w: World) {
  const p = w.player;
  if (p.invuln > 0 || p.shield > 0 || w.over) return;
  if (p.armorLvl >= ARMOR_MAX && w.rand() < ARMOR_BLOCK_CHANCE) {
    p.invuln = 0.4; // breve margen para que un mismo choque no cuente varias veces
    w.events.push({ kind: 'armorBlock' });
    return;
  }
  p.hp--; p.invuln = 1;
  w.events.push({ kind: 'hurt' });
  if (p.hp <= 0) { w.over = true; w.events.push({ kind: 'gameover' }); }
}

function kill(w: World, e: Enemy) {
  const s = STATS[e.type];
  w.score += s.score * Math.max(1, w.wave);
  w.coins += s.coins;
  w.events.push({ kind: 'kill', x: e.x, z: e.z, type: e.type, coins: s.coins });
  const chance = e.type === 'tank' ? 0.3 : 0.06;
  if (w.rand() < chance) w.pickups.push({ id: w.nextId++, type: w.rand() < 0.5 ? 'health' : 'rapid', x: e.x, z: e.z, life: 10 });
}
