import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, generateChunk, spawnPoint, raycast, moveBody, biomeAt, surfaceHeight, key, unkey, World, B, H, CHUNK, BLOCKS, isPlant, isSolid, type Body } from './voxel.ts';

const world = generate(12345);
/** Cuenta bloques en una zona de 8 x 8 trozos alrededor del origen. */
function census(w: World, r = 4) {
  const n = new Map<number, number>(), maxY = new Map<number, number>();
  for (let x = -r * CHUNK; x < r * CHUNK; x++) for (let z = -r * CHUNK; z < r * CHUNK; z++) for (let y = 0; y < H; y++) {
    const b = w.get(x, y, z);
    n.set(b, (n.get(b) ?? 0) + 1);
    maxY.set(b, Math.max(maxY.get(b) ?? -1, y));
  }
  return { n: (b: number) => n.get(b) ?? 0, maxY: (b: number) => maxY.get(b) ?? -1 };
}
const c = census(world);

test('la misma semilla genera exactamente los mismos trozos (en el servidor y en cada dispositivo)', () => {
  assert.deepEqual(generateChunk(12345, 3, -2), generateChunk(12345, 3, -2));
  assert.notDeepEqual(generateChunk(999, 3, -2), generateChunk(12345, 3, -2));
});

test('no hay bordes: el mundo sigue muy lejos en todas direcciones, con suelo', () => {
  for (const [x, z] of [[-5000, 0], [0, 8000], [12000, -12000], [-700, -900]]) {
    const t = world.top(x, z);
    assert.ok(t > 5 && t < H - 1, `suelo en ${x},${z}: ${t}`);
    assert.equal(world.get(x, 0, z), B.RocaBase);
  }
});

test('se puede caminar más allá de donde antes estaba el borde', () => {
  const w = World.empty(1);
  for (let x = 80; x < 140; x++) for (let z = 40; z < 50; z++) w.set(x, 10, z, B.Piedra);
  const b: Body = { x: 90.5, y: 11, z: 45.5, vx: 0, vy: 0, vz: 0, onGround: true, fallFrom: 11 };
  for (let i = 0; i < 240; i++) moveBody(w, b, 5, 0, false, 1 / 60);
  assert.ok(b.x > 105, `x=${b.x}`);
});

test('el terreno no es plano: hay montañas altas, valles y distintos climas', () => {
  let lo = H, hi = 0;
  const seen = new Set<string>();
  for (let x = -3000; x <= 3000; x += 37) for (let z = -3000; z <= 3000; z += 41) {
    const h = surfaceHeight(x, z, 12345);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
    seen.add(biomeAt(x, z, 12345));
  }
  assert.ok(hi - lo > 45, `de ${lo} a ${hi}`);
  assert.ok(hi > 85, 'montañas altas');
  for (const b of ['llanura', 'bosque', 'desierto', 'montana']) assert.ok(seen.has(b), b);
});

test('cuevas grandes bajo tierra, con más espacio en lo profundo', () => {
  let shallow = 0, deep = 0;
  for (let x = -64; x < 64; x++) for (let z = -64; z < 64; z++) {
    const t = world.top(x, z);
    for (let y = 3; y < t - 6; y++) if (world.get(x, y, z) === B.Aire) { if (y < 40) deep++; else shallow++; }
  }
  assert.ok(deep > 3000, `aire profundo: ${deep}`);
});

test('minerales por profundidad: diamante y esmeralda solo en lo más hondo', () => {
  assert.ok(c.n(B.Carbon) > c.n(B.Hierro) && c.n(B.Hierro) > c.n(B.Oro), `carbón ${c.n(B.Carbon)}, hierro ${c.n(B.Hierro)}, oro ${c.n(B.Oro)}`);
  assert.ok(c.n(B.Diamante) > 0 && c.n(B.Esmeralda) > 0, `diamante ${c.n(B.Diamante)}, esmeralda ${c.n(B.Esmeralda)}`);
  assert.ok(c.maxY(B.Diamante) <= 17, `diamante hasta ${c.maxY(B.Diamante)}`);
  assert.ok(c.maxY(B.Esmeralda) <= 23, `esmeralda hasta ${c.maxY(B.Esmeralda)}`);
});

test('hay árboles y se aparece sobre hierba, no dentro de un bloque', () => {
  assert.ok(c.n(B.Tronco) > 20 && c.n(B.Hojas) > 100);
  const [x, y, z] = spawnPoint(world);
  assert.equal(world.get(Math.floor(x), Math.floor(y), Math.floor(z)), B.Aire);
  assert.ok(BLOCKS[world.get(Math.floor(x), Math.floor(y - 1), Math.floor(z))].solid);
});

test('los cambios se guardan aunque el trozo se olvide y se vuelva a generar', () => {
  const w = generate(5);
  w.set(400, 30, -300, B.Mesa);
  w.unloadFar(0, 0, 2);
  assert.equal(w.hasChunk(25, -19), false);
  assert.equal(w.get(400, 30, -300), B.Mesa);
  assert.deepEqual(unkey(key(-1234, 77, 4321)), [-1234, 77, 4321]);
});

/** Mundo plano de prueba: suelo de piedra a la altura 10. */
function flat() { const w = World.empty(1); for (let x = 0; x < 96; x++) for (let z = 0; z < 96; z++) for (let y = 0; y <= 10; y++) w.set(x, y, z, B.Piedra); return w; }
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
  for (let z = 0; z < 96; z++) w.set(25, 11, z, B.Piedra);
  const a = body(23.5, 11, 20.5); a.onGround = true;
  sim(w, a, 4, 0, false, 2);
  assert.ok(a.x < 25 - 0.29, 'sin saltar se queda delante');
  const j = body(23.5, 11, 20.5); j.onGround = true;
  moveBody(w, j, 4, 0, true, 1 / 60);
  sim(w, j, 4, 0, false, 2);
  assert.ok(j.x > 26, `saltando lo pasa: x=${j.x}`);
});

test('el rayo encuentra el bloque al que miras y el hueco delante para colocar', () => {
  const w = flat();
  const h = raycast(w, 20.5, 12.6, 20.5, 0, -1, 0.0001, 6)!;
  assert.deepEqual([h.x, h.y, h.z], [20, 10, 20]);
  assert.deepEqual([h.px, h.py, h.pz], [20, 11, 20]);
  assert.equal(raycast(w, 20.5, 12.6, 20.5, 0, 1, 0, 6), null);
});

test('el servidor olvida los trozos lejos de todos los jugadores, no los de cerca', () => {
  const w = generate(3);
  w.get(0, 10, 0); w.get(2000, 10, 0); w.get(-4000, 10, 300);
  w.unloadAwayFrom([[0, 0], [2000, 0]], 2);
  assert.ok(w.hasChunk(0, 0) && w.hasChunk(125, 0));
  assert.equal(w.hasChunk(-250, 18), false);
});

test('hay hierba alta, flores y arbustos de bayas, siempre sobre hierba y sin estorbar el paso', () => {
  const w = generate(1);
  const found = new Set<number>();
  for (let x = -160; x < 160; x++) for (let z = -160; z < 160; z++) {
    const t = w.top(x, z), b = w.get(x, t + 1, z);
    if (!isPlant(b)) continue;
    found.add(b);
    assert.equal(w.get(x, t, z), B.Hierba);
    assert.equal(isSolid(b), false);
  }
  for (const b of [B.HierbaAlta, B.FlorSol, B.FlorFuego, B.ArbustoBayas]) assert.ok(found.has(b), BLOCKS[b].name);
});

test('el rayo sobre una planta coloca en su sitio; para pegar a un monstruo, la planta no cuenta', () => {
  const w = World.empty(1);
  for (let x = 0; x < 8; x++) w.set(x, 10, 5, B.Hierba);
  w.set(3, 11, 5, B.FlorSol);
  w.set(6, 11, 5, B.Piedra);
  const hit = raycast(w, 0.5, 11.5, 5.5, 1, 0, 0, 8)!;
  assert.deepEqual([hit.x, hit.px, hit.py], [3, 3, 11]);
  assert.equal(raycast(w, 0.5, 11.5, 5.5, 1, 0, 0, 8, true)!.x, 6);
});

/** Suelo de piedra a la altura 10 (se pisa en y = 11) para probar losas. */
function slabWorld() {
  const w = World.empty(1);
  for (let x = 0; x < 12; x++) for (let z = 0; z < 4; z++) w.set(x, 10, z, B.Piedra);
  return w;
}
const walkEast = (w: World, b: Body, secs: number) => { for (let i = 0; i < secs * 60; i++) moveBody(w, b, 4, 0, false, 1 / 60); };

test('una losa mide medio bloque: se sube andando, sin saltar, y se queda uno de pie a media altura', () => {
  const w = slabWorld();
  w.set(4, 11, 1, B.LosaTablas);
  const b: Body = { x: 2.5, y: 11, z: 1.5, vx: 0, vy: 0, vz: 0, onGround: true, fallFrom: 11 };
  walkEast(w, b, 0.5);
  assert.ok(b.x > 4.2 && b.x < 4.9, `x = ${b.x}`);
  assert.ok(Math.abs(b.y - 11.5) < 1e-6, `y = ${b.y}`);
  assert.equal(b.onGround, true);
});

test('de una losa se sube andando a un bloque entero (hace de escalón), pero un bloque entero desde el suelo no', () => {
  const w = slabWorld();
  w.set(4, 11, 1, B.LosaPiedra); w.set(5, 11, 1, B.Piedra);
  const b: Body = { x: 2.5, y: 11, z: 1.5, vx: 0, vy: 0, vz: 0, onGround: true, fallFrom: 11 };
  w.set(6, 11, 1, B.Piedra); w.set(7, 11, 1, B.Piedra);
  walkEast(w, b, 1);
  assert.ok(b.x > 5.3 && Math.abs(b.y - 12) < 1e-6, `x = ${b.x}, y = ${b.y}`);
  const w2 = slabWorld();
  w2.set(4, 11, 1, B.Piedra);
  const c: Body = { x: 2.5, y: 11, z: 1.5, vx: 0, vy: 0, vz: 0, onGround: true, fallFrom: 11 };
  walkEast(w2, c, 1);
  assert.ok(c.x < 3.8 && c.y === 11);
});

test('bajo una losa colocada a la altura de la cabeza no se pasa', () => {
  const w = slabWorld();
  w.set(4, 12, 1, B.LosaTablas);
  const b: Body = { x: 2.5, y: 11, z: 1.5, vx: 0, vy: 0, vz: 0, onGround: true, fallFrom: 11 };
  walkEast(w, b, 1);
  assert.ok(b.x < 3.8);
});
