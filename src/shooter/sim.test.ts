import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, step, spawnEnemy, waveSize, waveBonus, buy, cannotBuy, nextWave, deployTurret, selectWeapon, type Input, type World } from './sim.ts';

const idle: Input = { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, fire: false };
const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
const run = (w: World, inp: Input, frames: number) => { for (let i = 0; i < frames; i++) step(w, inp, 1 / 60); };
/** Mundo vacío en plena oleada (sin spawns automáticos ni obstáculos). */
function arena(rand = seq([0.99])) {
  const w = newWorld(rand, false);
  w.wave = 1; w.toSpawn = 0; w.spawnTimer = 999;
  return w;
}

test('el campo genera obstáculos lejos del punto de inicio', () => {
  const w = newWorld();
  assert.ok(w.obstacles.length > 30);
  assert.ok(w.obstacles.every((o) => Math.hypot(o.x, o.z) > 6));
  for (const k of ['rock', 'tree', 'crate', 'sandbag']) assert.ok(w.obstacles.some((o) => o.kind === k), k);
});

test('arranca la primera oleada tras el respiro inicial', () => {
  const w = newWorld(seq([0.5]), false);
  run(w, idle, 100);
  assert.equal(w.wave, 1);
  assert.ok(w.toSpawn < waveSize(1) + 1);
});

test('el jugador no atraviesa una roca', () => {
  const w = arena();
  w.obstacles.push({ id: 99, kind: 'rock', x: 3, z: 0, r: 1.5, hp: Infinity, rot: 0 });
  run(w, { ...idle, moveX: 1 }, 120);
  assert.ok(w.player.x <= 3 - 1.5 - 0.6 + 1e-6, `x=${w.player.x}`);
});

test('las balas se detienen en la cobertura y rompen cajas', () => {
  const w = arena();
  w.obstacles.push({ id: 98, kind: 'crate', x: 0, z: 5, r: 0.65, hp: 4, rot: 0 });
  const e = spawnEnemy(w, 'chaser', 0, 9); e.speed = 0;
  run(w, { ...idle, aimZ: 1, fire: true }, 25);
  assert.equal(e.hp, e.maxHp, 'la caja protege al enemigo');
  run(w, { ...idle, aimZ: 1, fire: true }, 60);
  assert.ok(!w.obstacles.some((o) => o.id === 98), 'la caja se rompe');
  assert.ok(w.pickups.length > 0, 'suelta un recogible');
});

test('matar da puntos y monedas; limpiar la oleada abre la tienda con bonus', () => {
  const w = arena();
  const e = spawnEnemy(w, 'chaser', 0, 6); e.speed = 0;
  run(w, { ...idle, aimZ: 1, fire: true }, 90);
  assert.equal(w.enemies.length, 0);
  assert.ok(w.score > 0);
  assert.equal(w.coins, 3 + waveBonus(1));
  assert.equal(w.phase, 'shop');
  const x = w.player.x;
  run(w, { ...idle, moveX: 1 }, 30);
  assert.equal(w.player.x, x, 'el juego se pausa en la tienda');
  nextWave(w);
  assert.equal(w.phase, 'fight');
  assert.equal(w.wave, 2);
  assert.equal(w.toSpawn, waveSize(2));
});

test('tienda: precio, máximo, monedas insuficientes y equipar', () => {
  const w = arena();
  assert.equal(cannotBuy(w, 'subfusil'), 'Faltan monedas');
  w.coins = 500;
  assert.ok(buy(w, 'subfusil'));
  assert.equal(w.coins, 440);
  assert.equal(w.player.weapon, 'subfusil');
  assert.equal(cannotBuy(w, 'subfusil'), 'Comprada');
  assert.ok(buy(w, 'botas') && buy(w, 'botas'));
  assert.equal(cannotBuy(w, 'botas'), 'Al máximo');
  assert.equal(cannotBuy(w, 'botiquin'), 'Vida llena');
  assert.ok(buy(w, 'armadura'));
  assert.equal(w.player.maxHp, 6);
  selectWeapon(w, 'granadas');
  assert.equal(w.player.weapon, 'subfusil', 'no se equipa un arma que no tienes');
});

test('la escopeta dispara 6 perdigones', () => {
  const w = arena();
  w.player.owned.push('escopeta'); selectWeapon(w, 'escopeta');
  step(w, { ...idle, aimZ: 1, fire: true }, 1 / 60);
  assert.equal(w.bullets.length, 6);
});

test('la granada daña en área a varios enemigos', () => {
  const w = arena();
  w.player.owned.push('granadas'); selectWeapon(w, 'granadas');
  const a = spawnEnemy(w, 'tank', 0, 8), b = spawnEnemy(w, 'tank', 1.8, 8.5), far = spawnEnemy(w, 'tank', 12, 8);
  for (const e of [a, b, far]) e.speed = 0;
  run(w, { ...idle, aimZ: 1, fire: true }, 30);
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp, 'ambos cercanos dañados');
  assert.equal(far.hp, far.maxHp, 'el lejano no');
});

test('la torreta dispara sola a enemigos cercanos', () => {
  const w = arena();
  w.player.turrets = 1;
  assert.ok(deployTurret(w));
  assert.equal(w.player.turrets, 0);
  const e = spawnEnemy(w, 'tank', 6, 0); e.speed = 0;
  run(w, idle, 60);
  assert.ok(e.hp < e.maxHp);
});

test('el contacto quita vida con invulnerabilidad temporal y termina la partida', () => {
  const w = arena();
  spawnEnemy(w, 'tank', 0.5, 0);
  step(w, idle, 1 / 60);
  assert.equal(w.player.hp, 4);
  step(w, idle, 1 / 60);
  assert.equal(w.player.hp, 4);
  w.player.hp = 1; w.player.invuln = 0;
  w.enemies[0].x = w.player.x; w.enemies[0].z = w.player.z + 0.5;
  step(w, idle, 1 / 60);
  assert.ok(w.over);
});

test('los enemigos rodean un muro en vez de quedarse atascados', () => {
  const w = arena(seq([0.5]));
  for (let k = -2; k <= 2; k++) w.obstacles.push({ id: 200 + k, kind: 'sandbag', x: k * 1.4, z: 6, r: 0.75, hp: Infinity, rot: 0 });
  const e = spawnEnemy(w, 'chaser', 0.3, 12);
  w.player.invuln = 999;
  let reached = false;
  for (let i = 0; i < 600 && !reached; i++) { step(w, idle, 1 / 60); reached = Math.hypot(e.x - w.player.x, e.z - w.player.z) < 2; }
  assert.ok(reached, `atascado en ${e.x.toFixed(1)},${e.z.toFixed(1)}`);
});

test('un bot completa 6 oleadas en campos aleatorios (ningún enemigo queda atascado)', () => {
  for (let seed = 1; seed <= 5; seed++) {
    let s = seed;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const w = newWorld(rand);
    let t = 0;
    while (w.wave < 7 && t < 60 * 60 * 8) {
      t++;
      w.player.invuln = 1; // el bot no muere: probamos el flujo, no su habilidad
      if (w.phase === 'shop') { for (const id of ['subfusil', 'escopeta', 'municion'] as const) buy(w, id); nextWave(w); continue; }
      const p = w.player;
      let tx = 0, tz = 0, bd = Infinity;
      for (const e of w.enemies) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; tx = e.x - p.x; tz = e.z - p.z; } }
      step(w, { moveX: bd < Infinity ? tx / bd : 0, moveZ: bd < Infinity ? tz / bd : 0, aimX: tx, aimZ: tz, fire: bd < 25 }, 1 / 60);
    }
    assert.ok(w.wave >= 7, `semilla ${seed}: se quedó en oleada ${w.wave} con ${w.enemies.length} enemigos`);
  }
});
