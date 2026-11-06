// Simulación pura del shooter (2D en el plano XZ). Sin Three.js ni DOM: se puede testear.

export type EnemyType = 'chaser' | 'tank' | 'gunner';
export type PickupType = 'health' | 'rapid';

export interface Input { moveX: number; moveZ: number; aimX: number; aimZ: number; fire: boolean }
export interface Player { x: number; z: number; angle: number; hp: number; maxHp: number; cooldown: number; invuln: number; rapid: number }
export interface Bullet { id: number; x: number; z: number; vx: number; vz: number; life: number; enemy: boolean }
export interface Enemy { id: number; type: EnemyType; x: number; z: number; hp: number; maxHp: number; speed: number; r: number; cooldown: number; flash: number }
export interface Pickup { id: number; type: PickupType; x: number; z: number; life: number }
export type GameEvent =
  | { kind: 'shoot' } | { kind: 'hit'; x: number; z: number }
  | { kind: 'kill'; x: number; z: number; type: EnemyType } | { kind: 'hurt' }
  | { kind: 'pickup'; type: PickupType } | { kind: 'wave'; wave: number } | { kind: 'gameover' }
  | { kind: 'enemyShoot' };

export interface World {
  arena: number; // medio lado de la arena cuadrada
  player: Player;
  bullets: Bullet[]; enemies: Enemy[]; pickups: Pickup[];
  wave: number; toSpawn: number; spawnTimer: number;
  score: number; over: boolean; time: number;
  events: GameEvent[];
  nextId: number;
  rand: () => number;
}

export const PLAYER_R = 0.6;
const PLAYER_SPEED = 9;
const BULLET_SPEED = 32;
const ENEMY_BULLET_SPEED = 13;

const STATS: Record<EnemyType, { hp: number; speed: number; r: number; score: number }> = {
  chaser: { hp: 2, speed: 5, r: 0.6, score: 10 },
  tank: { hp: 9, speed: 2.6, r: 1.05, score: 30 },
  gunner: { hp: 3, speed: 3.6, r: 0.7, score: 20 },
};

export function newWorld(rand: () => number = Math.random): World {
  return {
    arena: 20,
    player: { x: 0, z: 0, angle: 0, hp: 5, maxHp: 5, cooldown: 0, invuln: 0, rapid: 0 },
    bullets: [], enemies: [], pickups: [],
    wave: 0, toSpawn: 0, spawnTimer: 1,
    score: 0, over: false, time: 0, events: [], nextId: 1, rand,
  };
}

export const waveSize = (wave: number) => 4 + wave * 3;

function pickType(w: World): EnemyType {
  const r = w.rand();
  if (w.wave >= 3 && r < 0.2) return 'gunner';
  if (w.wave >= 2 && r < 0.4) return 'tank';
  return 'chaser';
}

export function spawnEnemy(w: World, type: EnemyType, x?: number, z?: number): Enemy {
  const s = STATS[type];
  if (x === undefined || z === undefined) {
    // Aparece en un borde aleatorio de la arena.
    const t = (w.rand() * 2 - 1) * w.arena, side = Math.floor(w.rand() * 4), e = w.arena - 1;
    [x, z] = side === 0 ? [t, -e] : side === 1 ? [t, e] : side === 2 ? [-e, t] : [e, t];
  }
  const speed = type === 'chaser' ? Math.min(8, s.speed + w.wave * 0.25) : s.speed;
  const hp = s.hp + (type === 'tank' ? Math.floor(w.wave / 3) * 2 : 0);
  const en: Enemy = { id: w.nextId++, type, x, z, hp, maxHp: hp, speed, r: s.r, cooldown: 1 + w.rand() * 1.5, flash: 0 };
  w.enemies.push(en);
  return en;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function step(w: World, input: Input, dt: number): void {
  w.events.length = 0;
  if (w.over) return;
  w.time += dt;
  const p = w.player;
  const lim = w.arena - PLAYER_R;

  // --- Jugador ---
  let mx = input.moveX, mz = input.moveZ;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  p.x = clamp(p.x + mx * PLAYER_SPEED * dt, -lim, lim);
  p.z = clamp(p.z + mz * PLAYER_SPEED * dt, -lim, lim);
  if (Math.hypot(input.aimX, input.aimZ) > 0.15) p.angle = Math.atan2(input.aimX, input.aimZ);
  else if (ml > 0.15) p.angle = Math.atan2(mx, mz);
  p.cooldown -= dt; p.invuln -= dt; p.rapid -= dt;

  if (input.fire && p.cooldown <= 0) {
    p.cooldown = p.rapid > 0 ? 0.07 : 0.16;
    const sx = Math.sin(p.angle), sz = Math.cos(p.angle);
    const spread = p.rapid > 0 ? (w.rand() - 0.5) * 0.12 : 0;
    const dx = Math.sin(p.angle + spread), dz = Math.cos(p.angle + spread);
    w.bullets.push({ id: w.nextId++, x: p.x + sx * 0.9, z: p.z + sz * 0.9, vx: dx * BULLET_SPEED, vz: dz * BULLET_SPEED, life: 1.1, enemy: false });
    w.events.push({ kind: 'shoot' });
  }

  // --- Oleadas ---
  w.spawnTimer -= dt;
  if (w.toSpawn > 0 && w.spawnTimer <= 0) {
    spawnEnemy(w, pickType(w));
    w.toSpawn--;
    w.spawnTimer = Math.max(0.3, 1.2 - w.wave * 0.08);
  } else if (w.toSpawn === 0 && w.enemies.length === 0 && w.spawnTimer <= 0) {
    w.wave++;
    w.toSpawn = waveSize(w.wave);
    w.spawnTimer = 1.5; // respiro antes de la oleada
    w.events.push({ kind: 'wave', wave: w.wave });
  }

  // --- Enemigos ---
  for (const e of w.enemies) {
    e.flash -= dt;
    const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 1;
    let dir = 1;
    if (e.type === 'gunner') {
      dir = d > 11 ? 1 : d < 8 ? -1 : 0; // mantiene la distancia
      e.cooldown -= dt;
      if (e.cooldown <= 0 && d < 18) {
        e.cooldown = 1.8;
        w.bullets.push({ id: w.nextId++, x: e.x, z: e.z, vx: (dx / d) * ENEMY_BULLET_SPEED, vz: (dz / d) * ENEMY_BULLET_SPEED, life: 2, enemy: true });
        w.events.push({ kind: 'enemyShoot' });
      }
    }
    e.x += (dx / d) * e.speed * dir * dt;
    e.z += (dz / d) * e.speed * dir * dt;
  }
  // Separación para que no se apilen
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
    e.x = clamp(e.x, -w.arena + e.r, w.arena - e.r);
    e.z = clamp(e.z, -w.arena + e.r, w.arena - e.r);
  }

  // --- Balas ---
  for (const b of w.bullets) {
    b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
    if (Math.abs(b.x) > w.arena || Math.abs(b.z) > w.arena) b.life = 0;
    if (b.life <= 0) continue;
    if (b.enemy) {
      if (Math.hypot(b.x - p.x, b.z - p.z) < PLAYER_R + 0.25) { b.life = 0; hurt(w); }
      continue;
    }
    for (const e of w.enemies) {
      if (e.hp <= 0 || Math.hypot(b.x - e.x, b.z - e.z) > e.r + 0.2) continue;
      b.life = 0; e.hp--; e.flash = 0.08;
      // Retroceso
      e.x += b.vx * 0.006; e.z += b.vz * 0.006;
      w.events.push({ kind: 'hit', x: e.x, z: e.z });
      if (e.hp <= 0) kill(w, e);
      break;
    }
  }
  w.bullets = w.bullets.filter((b) => b.life > 0);

  // --- Contacto con enemigos ---
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
    if (d < e.r + PLAYER_R) {
      if (p.invuln <= 0) hurt(w);
      const ux = d ? dx / d : 1, uz = d ? dz / d : 0;
      p.x = clamp(p.x + ux * 1.2, -lim, lim); p.z = clamp(p.z + uz * 1.2, -lim, lim);
    }
  }
  w.enemies = w.enemies.filter((e) => e.hp > 0);

  // --- Recogibles ---
  for (const k of w.pickups) {
    k.life -= dt;
    if (Math.hypot(k.x - p.x, k.z - p.z) < 1.3) {
      k.life = 0;
      if (k.type === 'health') p.hp = Math.min(p.maxHp, p.hp + 1);
      else p.rapid = 6;
      w.events.push({ kind: 'pickup', type: k.type });
    }
  }
  w.pickups = w.pickups.filter((k) => k.life > 0);
}

function hurt(w: World) {
  const p = w.player;
  if (p.invuln > 0 || w.over) return;
  p.hp--; p.invuln = 1;
  w.events.push({ kind: 'hurt' });
  if (p.hp <= 0) { w.over = true; w.events.push({ kind: 'gameover' }); }
}

function kill(w: World, e: Enemy) {
  w.score += STATS[e.type].score * Math.max(1, w.wave);
  w.events.push({ kind: 'kill', x: e.x, z: e.z, type: e.type });
  const r = w.rand();
  const chance = e.type === 'tank' ? 0.35 : 0.08;
  if (r < chance) w.pickups.push({ id: w.nextId++, type: w.rand() < 0.5 ? 'health' : 'rapid', x: e.x, z: e.z, life: 10 });
}
