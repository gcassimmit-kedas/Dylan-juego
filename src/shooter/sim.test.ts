import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, step, spawnEnemy, waveSize, type Input } from './sim.ts';

const idle: Input = { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, fire: false };
const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

test('arranca la primera oleada tras el respiro inicial', () => {
  const w = newWorld(seq([0.5]));
  for (let i = 0; i < 70; i++) step(w, idle, 1 / 60);
  assert.equal(w.wave, 1);
  assert.equal(w.toSpawn, waveSize(1));
});

test('el jugador no sale de la arena', () => {
  const w = newWorld();
  w.spawnTimer = 999;
  for (let i = 0; i < 600; i++) step(w, { ...idle, moveX: 1, moveZ: -1 }, 1 / 60);
  assert.ok(w.player.x <= w.arena && w.player.z >= -w.arena);
});

test('disparar mata a un enemigo y suma puntos', () => {
  const w = newWorld(seq([0.99]));
  w.spawnTimer = 999;
  const e = spawnEnemy(w, 'chaser', 0, 6);
  e.speed = 0;
  for (let i = 0; i < 60 && w.enemies.length; i++) step(w, { ...idle, aimZ: 1, fire: true }, 1 / 60);
  assert.equal(w.enemies.length, 0);
  assert.ok(w.score > 0);
});

test('el contacto quita vida con invulnerabilidad temporal y termina la partida', () => {
  const w = newWorld(seq([0.99]));
  w.spawnTimer = 999;
  spawnEnemy(w, 'tank', 0.5, 0);
  step(w, idle, 1 / 60);
  assert.equal(w.player.hp, 4);
  step(w, idle, 1 / 60);
  assert.equal(w.player.hp, 4, 'invulnerable justo después del golpe');
  w.player.hp = 1; w.player.invuln = 0;
  w.enemies[0].x = w.player.x; w.enemies[0].z = w.player.z + 0.5;
  step(w, idle, 1 / 60);
  assert.ok(w.over);
});

test('el gunner dispara al jugador', () => {
  const w = newWorld(seq([0.5]));
  w.spawnTimer = 999;
  const g = spawnEnemy(w, 'gunner', 0, 9);
  g.cooldown = 0;
  step(w, idle, 1 / 60);
  assert.ok(w.bullets.some((b) => b.enemy && b.vz < 0));
});
