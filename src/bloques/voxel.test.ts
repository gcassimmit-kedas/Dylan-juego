import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, spawnPoint, raycast, moveBody, World, B, W, H, BLOCKS, type Body } from './voxel.ts';

const world = generate(12345);
const count = (b: number) => { let n = 0; for (const v of world.blocks) if (v === b) n++; return n; };

test('la misma semilla genera exactamente el mismo mundo', () => {
  assert.deepEqual(generate(12345).blocks, world.blocks);
  assert.notDeepEqual(generate(999).blocks, world.blocks);
});

test('el mundo tiene suelo de roca base, hierba arriba y piedra dentro', () => {
  for (let x = 0; x < W; x += 13) for (let z = 0; z < W; z += 11) assert.equal(world.get(x, 0, z), B.RocaBase);
  assert.ok(count(B.Hierba) > W * W * 0.5);
  assert.ok(count(B.Piedra) > count(B.Tierra));
});

test('hay cuevas, árboles y los cuatro minerales, más raros cuanto más valiosos', () => {
  let caveAir = 0;
  for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) { const t = world.top(x, z); for (let y = 1; y < t - 4; y++) if (world.get(x, y, z) === B.Aire) caveAir++; }
  assert.ok(caveAir > 2000, `aire de cuevas: ${caveAir}`);
  assert.ok(count(B.Tronco) > 20 && count(B.Hojas) > 100);
  const c = count(B.Carbon), i = count(B.Hierro), g = count(B.Oro), d = count(B.Diamante);
  assert.ok(c > i && i > g && g > 0 && d > 0, `carbón ${c}, hierro ${i}, oro ${g}, diamante ${d}`);
});

test('los diamantes solo salen en lo profundo', () => {
  for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) for (let y = 15; y < H; y++) assert.notEqual(world.get(x, y, z), B.Diamante);
});

test('se aparece encima del suelo, no dentro de un bloque', () => {
  const [x, y, z] = spawnPoint(world);
  assert.equal(world.get(Math.floor(x), Math.floor(y), Math.floor(z)), B.Aire);
  assert.ok(BLOCKS[world.get(Math.floor(x), Math.floor(y - 1), Math.floor(z))].solid);
});

/** Mundo plano de prueba: suelo de piedra a la altura 10. */
function flat() { const w = new World(1); for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) for (let y = 0; y <= 10; y++) w.set(x, y, z, B.Piedra); return w; }
const body = (x: number, y: number, z: number): Body => ({ x, y, z, vx: 0, vy: 0, vz: 0, onGround: false, fallFrom: y });
const sim = (w: World, b: Body, wx: number, wz: number, jump: boolean, secs: number) => { let fall = 0; for (let i = 0; i < secs * 60; i++) fall = Math.max(fall, moveBody(w, b, wx, wz, jump && i === 0, 1 / 60)); return fall; };

test('la gravedad deja al cuerpo de pie sobre el suelo', () => {
  const w = flat(), b = body(20.5, 15, 20.5);
  sim(w, b, 0, 0, false, 2);
  assert.equal(b.y, 11); assert.ok(b.onGround);
});

test('al caer de 4 bloques se mide la caída para el daño', () => {
  const w = flat(), b = body(20.5, 15, 20.5);
  assert.equal(Math.round(sim(w, b, 0, 0, false, 2)), 4);
});

test('saltar sube algo más de un bloque y se vuelve al suelo', () => {
  const w = flat(), b = body(20.5, 11, 20.5); b.onGround = true;
  let top = 0;
  moveBody(w, b, 0, 0, true, 1 / 60);
  for (let i = 0; i < 120; i++) { moveBody(w, b, 0, 0, false, 1 / 60); top = Math.max(top, b.y); }
  assert.ok(top > 12.1 && top < 12.6, `altura ${top}`);
  assert.equal(b.y, 11);
});

test('un muro de un bloque se pasa saltando; sin saltar, no', () => {
  const w = flat();
  for (let z = 0; z < W; z++) w.set(25, 11, z, B.Piedra);
  const a = body(23.5, 11, 20.5); a.onGround = true;
  sim(w, a, 4, 0, false, 2);
  assert.ok(a.x < 25 - 0.29, 'sin saltar se queda delante');
  const j = body(23.5, 11, 20.5); j.onGround = true;
  moveBody(w, j, 4, 0, true, 1 / 60);
  sim(w, j, 4, 0, false, 2);
  assert.ok(j.x > 26, `saltando lo pasa: x=${j.x}`);
});

test('no se sale por el borde del mundo', () => {
  const w = flat(), b = body(2, 11, 20.5); b.onGround = true;
  sim(w, b, -5, 0, false, 3);
  assert.ok(b.x >= 0.3 - 1e-9);
});

test('el rayo encuentra el bloque al que miras y el hueco delante para colocar', () => {
  const w = flat();
  const h = raycast(w, 20.5, 12.6, 20.5, 0, -1, 0.0001, 6)!;
  assert.deepEqual([h.x, h.y, h.z], [20, 10, 20]);
  assert.deepEqual([h.px, h.py, h.pz], [20, 11, 20]);
  assert.equal(raycast(w, 20.5, 12.6, 20.5, 0, 1, 0, 6), null);
});
