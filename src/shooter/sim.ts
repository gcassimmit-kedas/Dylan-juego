// Simulación pura del shooter (2D en el plano XZ). Sin Three.js ni DOM: se puede testear.

export type EnemyType = 'chaser' | 'tank' | 'gunner';
export type PickupType = 'health' | 'rapid' | 'coins';
export type WeaponId = 'pistola' | 'subfusil' | 'escopeta' | 'granadas';
export type ObstacleKind = 'rock' | 'tree' | 'crate' | 'sandbag';
export type ItemId = WeaponId | 'botiquin' | 'armadura' | 'botas' | 'municion' | 'torreta';
export type Phase = 'fight' | 'shop';

export interface Input { moveX: number; moveZ: number; aimX: number; aimZ: number; fire: boolean }
export interface Player {
  x: number; z: number; angle: number; hp: number; maxHp: number; cooldown: number; invuln: number; rapid: number;
  weapon: WeaponId; owned: WeaponId[]; turrets: number; speedLvl: number; armorLvl: number; dmgLvl: number;
}
export interface Bullet { id: number; x: number; z: number; vx: number; vz: number; life: number; enemy: boolean; dmg: number; blast: number }
export interface Enemy { id: number; type: EnemyType; x: number; z: number; hp: number; maxHp: number; speed: number; r: number; cooldown: number; flash: number; side: number; sideT: number; ax: number; az: number; stuckT: number }
export interface Pickup { id: number; type: PickupType; x: number; z: number; life: number }
export interface Obstacle { id: number; kind: ObstacleKind; x: number; z: number; r: number; hp: number; rot: number }
export interface Turret { id: number; x: number; z: number; angle: number; cooldown: number; life: number }
export type GameEvent =
  | { kind: 'shoot'; weapon: WeaponId } | { kind: 'hit'; x: number; z: number }
  | { kind: 'kill'; x: number; z: number; type: EnemyType; coins: number } | { kind: 'hurt' }
  | { kind: 'pickup'; type: PickupType } | { kind: 'wave'; wave: number } | { kind: 'gameover' }
  | { kind: 'enemyShoot' } | { kind: 'explosion'; x: number; z: number; r: number }
  | { kind: 'crate'; x: number; z: number } | { kind: 'waveCleared'; bonus: number } | { kind: 'turret' };

export interface World {
  arena: number; // medio lado del campo cuadrado
  player: Player;
  bullets: Bullet[]; enemies: Enemy[]; pickups: Pickup[]; obstacles: Obstacle[]; turrets: Turret[];
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

export interface WeaponStats { name: string; cooldown: number; dmg: number; speed: number; pellets: number; spread: number; life: number; blast: number }
export const WEAPONS: Record<WeaponId, WeaponStats> = {
  pistola: { name: 'Pistola', cooldown: 0.28, dmg: 2, speed: 30, pellets: 1, spread: 0.03, life: 0.9, blast: 0 },
  subfusil: { name: 'Subfusil', cooldown: 0.085, dmg: 1, speed: 34, pellets: 1, spread: 0.12, life: 0.8, blast: 0 },
  escopeta: { name: 'Escopeta', cooldown: 0.6, dmg: 2, speed: 28, pellets: 6, spread: 0.5, life: 0.42, blast: 0 },
  granadas: { name: 'Lanzagranadas', cooldown: 0.8, dmg: 5, speed: 18, pellets: 1, spread: 0, life: 0.75, blast: 3.2 },
};
export const WEAPON_ORDER: WeaponId[] = ['pistola', 'subfusil', 'escopeta', 'granadas'];

export interface ShopItem { id: ItemId; name: string; desc: string; price: number; max?: number; kind: 'arma' | 'herramienta' }
export const SHOP: ShopItem[] = [
  { id: 'subfusil', name: 'Subfusil', desc: 'Dispara muy rápido', price: 60, kind: 'arma' },
  { id: 'escopeta', name: 'Escopeta', desc: '6 perdigones, corto alcance', price: 90, kind: 'arma' },
  { id: 'granadas', name: 'Lanzagranadas', desc: 'Explota y daña en área', price: 160, kind: 'arma' },
  { id: 'botiquin', name: 'Botiquín', desc: 'Recupera 2 de vida', price: 20, kind: 'herramienta' },
  { id: 'armadura', name: 'Armadura', desc: '+1 de vida máxima', price: 50, max: 3, kind: 'herramienta' },
  { id: 'botas', name: 'Botas', desc: '+12% de velocidad', price: 40, max: 2, kind: 'herramienta' },
  { id: 'municion', name: 'Munición pesada', desc: '+30% de daño', price: 70, max: 2, kind: 'herramienta' },
  { id: 'torreta', name: 'Torreta', desc: 'Dispara sola durante 30 s', price: 50, max: 3, kind: 'herramienta' },
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
      weapon: 'pistola', owned: ['pistola'], turrets: 0, speedLvl: 0, armorLvl: 0, dmgLvl: 0 },
    bullets: [], enemies: [], pickups: [], obstacles: [], turrets: [],
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
  const en: Enemy = { id: w.nextId++, type, x, z, hp, maxHp: hp, speed, r: s.r, cooldown: 1 + w.rand() * 1.5, flash: 0, side: 0, sideT: 0, ax: x, az: z, stuckT: 0 };
  w.enemies.push(en);
  return en;
}

// ---------- Tienda ----------

export function owns(w: World, id: ItemId): number {
  const p = w.player;
  switch (id) {
    case 'armadura': return p.armorLvl;
    case 'botas': return p.speedLvl;
    case 'municion': return p.dmgLvl;
    case 'torreta': return p.turrets;
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
  switch (id) {
    case 'botiquin': p.hp = Math.min(p.maxHp, p.hp + 2); break;
    case 'armadura': p.armorLvl++; p.maxHp++; p.hp++; break;
    case 'botas': p.speedLvl++; break;
    case 'municion': p.dmgLvl++; break;
    case 'torreta': p.turrets++; break;
    default: p.owned.push(id); p.weapon = id; // equipa el arma nueva
  }
  return true;
}

export function selectWeapon(w: World, id: WeaponId) {
  if (w.player.owned.includes(id)) w.player.weapon = id;
}

export function deployTurret(w: World): boolean {
  const p = w.player;
  if (p.turrets <= 0 || w.phase !== 'fight' || w.over) return false;
  p.turrets--;
  w.turrets.push({ id: w.nextId++, x: p.x, z: p.z, angle: p.angle, cooldown: 0, life: 30 });
  w.events.push({ kind: 'turret' });
  return true;
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

function fire(w: World, x: number, z: number, angle: number, stats: WeaponStats, dmgMul: number, rapid: boolean) {
  for (let k = 0; k < stats.pellets; k++) {
    const off = stats.pellets > 1 ? (k / (stats.pellets - 1) - 0.5) * stats.spread : (w.rand() - 0.5) * stats.spread * (rapid ? 1.5 : 1);
    const a = angle + off + (stats.pellets > 1 ? (w.rand() - 0.5) * 0.06 : 0);
    w.bullets.push({ id: w.nextId++, x: x + Math.sin(angle) * 0.9, z: z + Math.cos(angle) * 0.9,
      vx: Math.sin(a) * stats.speed, vz: Math.cos(a) * stats.speed, life: stats.life, enemy: false, dmg: stats.dmg * dmgMul, blast: stats.blast });
  }
}

function damageEnemy(w: World, e: Enemy, dmg: number, kx = 0, kz = 0) {
  if (e.hp <= 0) return;
  e.hp -= dmg; e.flash = 0.08;
  e.x += kx; e.z += kz;
  w.events.push({ kind: 'hit', x: e.x, z: e.z });
  if (e.hp <= 0) kill(w, e);
}

function explode(w: World, b: Bullet) {
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
  if (o.kind !== 'crate' || o.hp <= 0) return;
  o.hp -= dmg;
  if (o.hp <= 0) {
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
  const speed = PLAYER_SPEED * (1 + p.speedLvl * 0.12);
  p.x = clamp(p.x + mx * speed * dt, -lim, lim);
  p.z = clamp(p.z + mz * speed * dt, -lim, lim);
  pushOut(p, PLAYER_R, w.obstacles);
  if (Math.hypot(input.aimX, input.aimZ) > 0.15) p.angle = Math.atan2(input.aimX, input.aimZ);
  else if (ml > 0.15) p.angle = Math.atan2(mx, mz);
  p.cooldown -= dt; p.invuln -= dt; p.rapid -= dt;

  if (input.fire && p.cooldown <= 0) {
    const st = WEAPONS[p.weapon];
    p.cooldown = st.cooldown * (p.rapid > 0 ? 0.5 : 1);
    fire(w, p.x, p.z, p.angle, st, 1 + p.dmgLvl * 0.3, p.rapid > 0);
    w.events.push({ kind: 'shoot', weapon: p.weapon });
  }

  // --- Torretas ---
  for (const t of w.turrets) {
    t.life -= dt; t.cooldown -= dt;
    let best: Enemy | null = null, bd = 13;
    for (const e of w.enemies) {
      const d = Math.hypot(e.x - t.x, e.z - t.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      t.angle = Math.atan2(best.x - t.x, best.z - t.z);
      if (t.cooldown <= 0) {
        t.cooldown = 0.35;
        fire(w, t.x, t.z, t.angle, { ...WEAPONS.pistola, dmg: 1.5, spread: 0.05 }, 1, false);
      }
    }
  }
  w.turrets = w.turrets.filter((t) => t.life > 0);

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
    const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 1;
    let dir = 1;
    if (e.type === 'gunner') {
      // Mantiene la distancia, pero solo se planta si te ve (si no, busca ángulo).
      const sees = lineOfSight(w, e.x, e.z, p.x, p.z);
      dir = d > 11 || !sees ? 1 : d < 8 ? -1 : 0;
      e.cooldown -= dt;
      if (e.cooldown <= 0 && d < 18 && sees) {
        e.cooldown = 1.8;
        w.bullets.push({ id: w.nextId++, x: e.x, z: e.z, vx: (dx / d) * ENEMY_BULLET_SPEED, vz: (dz / d) * ENEMY_BULLET_SPEED, life: 2, enemy: true, dmg: 1, blast: 0 });
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
    if (Math.abs(b.x) > w.arena || Math.abs(b.z) > w.arena) b.life = 0;
    const ob = w.obstacles.find((o) => o.hp > 0 && Math.hypot(b.x - o.x, b.z - o.z) < o.r);
    if (ob && b.life > 0) {
      b.life = 0;
      if (b.blast) explode(w, b);
      else if (!b.enemy) hitObstacle(w, ob, b.dmg);
      continue;
    }
    if (b.life <= 0) { if (b.blast) explode(w, b); continue; }
    if (b.enemy) {
      if (Math.hypot(b.x - p.x, b.z - p.z) < PLAYER_R + 0.25) { b.life = 0; hurt(w); }
      continue;
    }
    for (const e of w.enemies) {
      if (e.hp <= 0 || Math.hypot(b.x - e.x, b.z - e.z) > e.r + 0.2) continue;
      b.life = 0;
      if (b.blast) explode(w, b);
      else damageEnemy(w, e, b.dmg, b.vx * 0.005, b.vz * 0.005);
      break;
    }
  }
  w.bullets = w.bullets.filter((b) => b.life > 0);
  w.obstacles = w.obstacles.filter((o) => o.hp > 0);

  // --- Contacto ---
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
    if (d < e.r + PLAYER_R) {
      if (p.invuln <= 0) hurt(w);
      const ux = d ? dx / d : 1, uz = d ? dz / d : 0;
      p.x = clamp(p.x + ux * 1.2, -lim, lim); p.z = clamp(p.z + uz * 1.2, -lim, lim);
      pushOut(p, PLAYER_R, w.obstacles);
    }
  }
  w.enemies = w.enemies.filter((e) => e.hp > 0);

  // --- Recogibles ---
  for (const k of w.pickups) {
    k.life -= dt;
    if (Math.hypot(k.x - p.x, k.z - p.z) < 1.3) {
      k.life = 0;
      if (k.type === 'health') p.hp = Math.min(p.maxHp, p.hp + 1);
      else if (k.type === 'rapid') p.rapid = 6;
      else w.coins += 15;
      w.events.push({ kind: 'pickup', type: k.type });
    }
  }
  w.pickups = w.pickups.filter((k) => k.life > 0);

  // --- Fin de oleada → tienda ---
  if (!w.over && w.wave > 0 && w.toSpawn === 0 && w.enemies.length === 0) {
    const bonus = waveBonus(w.wave);
    w.coins += bonus;
    w.phase = 'shop';
    w.bullets = w.bullets.filter((b) => !b.enemy);
    w.events.push({ kind: 'waveCleared', bonus });
  }
}

function hurt(w: World) {
  const p = w.player;
  if (p.invuln > 0 || w.over) return;
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
