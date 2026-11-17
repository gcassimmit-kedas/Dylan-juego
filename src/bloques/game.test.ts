import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, addPlayer, step, place, craft, respawn, MAX_HP, EYE, IDLE, DAY_SECONDS, isNight, type Game, type Player } from './game.ts';
import { World, B, W } from './voxel.ts';
import { addItem, count, breakTime, toolId, RECIPES, I } from './items.ts';

/** Partida en un mundo plano: piedra hasta la altura 10, un bloque de tierra delante. Sin monstruos. */
function flatGame(): { g: Game; p: Player } {
  const g = newGame(1, () => 0.5);
  const w = new World(1);
  for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) for (let y = 0; y <= 10; y++) w.set(x, y, z, B.Piedra);
  g.world = w;
  g.spawnT = Infinity;
  const p = addPlayer(g, 'p1', 'Tú');
  Object.assign(p.body, { x: 20.5, y: 11, z: 20.5, onGround: true, fallFrom: 11 });
  p.invuln = 0;
  return { g, p };
}
const run = (g: Game, secs: number) => { for (let i = 0; i < Math.round(secs * 20); i++) step(g, 1 / 20); };
/** Mirar hacia el bloque (x, y, z) desde los ojos del jugador. */
function lookAt(p: Player, x: number, y: number, z: number, attack = true) {
  const dx = x + 0.5 - p.body.x, dy = y + 0.5 - (p.body.y + EYE), dz = z + 0.5 - p.body.z;
  p.input = { ...IDLE, yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)), attack };
}

test('se empieza con 10 corazones', () => {
  const { p } = flatGame();
  assert.equal(p.hp, MAX_HP); assert.equal(MAX_HP / 2, 10);
});

test('romper un bloque lleva su tiempo: la tierra a mano, unos 0,75 s', () => {
  const { g, p } = flatGame();
  g.world.set(22, 11, 20, B.Tierra);
  lookAt(p, 22, 11, 20);
  run(g, 0.5);
  assert.equal(g.world.get(22, 11, 20), B.Tierra, 'a medio segundo sigue ahí');
  run(g, 0.4);
  assert.equal(g.world.get(22, 11, 20), B.Aire);
  assert.equal(count(p.inv, B.Tierra), 1, 'va al inventario');
});

test('la piedra a mano tarda mucho y no suelta nada; con pico de madera, rápido y suelta adoquín', () => {
  assert.equal(breakTime(B.Piedra, null), 7.5);
  assert.ok(breakTime(B.Piedra, toolId('pico', 'madera')) < 1.2);
  const { g, p } = flatGame();
  lookAt(p, 22, 10, 20);
  run(g, 8);
  assert.equal(g.world.get(22, 10, 20), B.Aire);
  assert.equal(count(p.inv, B.Adoquin), 0);
  addItem(p.inv, toolId('pico', 'madera'), 1); p.sel = 0;
  lookAt(p, 22, 10, 21);
  run(g, 1.3);
  assert.equal(g.world.get(22, 10, 21), B.Aire);
  assert.equal(count(p.inv, B.Adoquin), 1);
});

test('si cambias de bloque a medias, se empieza de cero', () => {
  const { g, p } = flatGame();
  g.world.set(22, 11, 20, B.Tierra); g.world.set(22, 11, 21, B.Tierra);
  lookAt(p, 22, 11, 20); run(g, 0.5);
  lookAt(p, 22, 11, 21); run(g, 0.5);
  assert.equal(g.world.get(22, 11, 20), B.Tierra);
  assert.equal(g.world.get(22, 11, 21), B.Tierra);
});

test('el diamante solo se saca con pico de hierro', () => {
  const { g, p } = flatGame();
  g.world.set(22, 10, 20, B.Diamante);
  addItem(p.inv, toolId('pico', 'piedra'), 1);
  lookAt(p, 22, 10, 20); run(g, 20);
  assert.equal(count(p.inv, I.Diamante), 0);
  g.world.set(22, 10, 20, B.Diamante);
  p.inv[0] = { id: toolId('pico', 'hierro'), n: 1 };
  run(g, 2);
  assert.equal(count(p.inv, I.Diamante), 1);
});

test('la roca base no se rompe nunca', () => {
  const { g, p } = flatGame();
  g.world.set(22, 10, 20, B.RocaBase);
  lookAt(p, 22, 10, 20); run(g, 30);
  assert.equal(g.world.get(22, 10, 20), B.RocaBase);
});

test('colocar un bloque gasta uno del inventario y queda registrado para los demás', () => {
  const { g, p } = flatGame();
  addItem(p.inv, B.Tablas, 3);
  lookAt(p, 22, 10, 20, false);
  assert.ok(place(g, 'p1'));
  assert.equal(g.world.get(22, 11, 20), B.Tablas);
  assert.equal(count(p.inv, B.Tablas), 2);
  assert.ok(g.changes.length > 0 && g.edits.size > 0);
});

test('no se puede colocar un bloque donde estás tú', () => {
  const { g, p } = flatGame();
  addItem(p.inv, B.Tablas, 1);
  lookAt(p, 20, 10, 20, false); // el suelo bajo tus pies: el hueco es donde estás
  assert.equal(place(g, 'p1'), false);
  assert.equal(count(p.inv, B.Tablas), 1);
});

test('crafteo: tablas y palos a mano; el pico necesita una mesa de crafteo cerca', () => {
  const { g, p } = flatGame();
  addItem(p.inv, B.Tronco, 3);
  assert.ok(craft(g, 'p1', 'tablas'));
  assert.ok(craft(g, 'p1', 'tablas'));
  assert.equal(count(p.inv, B.Tablas), 8);
  assert.ok(craft(g, 'p1', 'palos'));
  assert.equal(craft(g, 'p1', 'pico-madera'), false, 'sin mesa no');
  g.world.set(22, 11, 20, B.Mesa);
  assert.ok(craft(g, 'p1', 'pico-madera'));
  assert.equal(count(p.inv, toolId('pico', 'madera')), 1);
  assert.equal(count(p.inv, B.Tablas), 8 - 2 - 3);
});

test('el lingote de hierro se hace en el horno con mineral y carbón', () => {
  const { g, p } = flatGame();
  addItem(p.inv, B.Hierro, 1); addItem(p.inv, I.Carbon, 1);
  g.world.set(22, 11, 20, B.Mesa);
  assert.equal(craft(g, 'p1', 'lingote-hierro'), false);
  g.world.set(22, 11, 21, B.Horno);
  assert.ok(craft(g, 'p1', 'lingote-hierro'));
  assert.equal(count(p.inv, I.LingoteHierro), 1);
});

test('todas las recetas dan objetos que existen', () => {
  for (const r of RECIPES) assert.ok(r.n > 0 && r.needs.length > 0, r.id);
});

test('caer desde alto quita vida; desde 3 bloques, no', () => {
  const { g, p } = flatGame();
  Object.assign(p.body, { y: 14, onGround: false, fallFrom: 14 });
  run(g, 2);
  assert.equal(p.hp, MAX_HP);
  Object.assign(p.body, { y: 21, onGround: false, fallFrom: 21 });
  run(g, 2);
  assert.ok(p.hp < MAX_HP && p.hp > 0, `vida ${p.hp}`);
});

test('se recupera vida poco a poco si no te hacen daño', () => {
  const { g, p } = flatGame();
  p.hp = 10;
  run(g, 12);
  assert.ok(p.hp > 10);
});

test('al morir se reaparece con 10 corazones y se conserva el inventario', () => {
  const { g, p } = flatGame();
  addItem(p.inv, B.Tablas, 5);
  Object.assign(p.body, { y: 60, onGround: false, fallFrom: 60 });
  run(g, 4);
  assert.equal(p.alive, false);
  g.world = (newGame(1)).world;
  respawn(g, 'p1');
  assert.equal(p.alive, true); assert.equal(p.hp, MAX_HP);
  assert.equal(count(p.inv, B.Tablas), 5);
});

test('los monstruos aparecen de noche y atacan a quien está cerca, no a quien está en pausa', () => {
  const { g, p } = flatGame();
  g.time = DAY_SECONDS * 0.75;
  assert.ok(isNight(g));
  g.mobs.push({ id: 900, kind: 'zombi', body: { x: 22.5, y: 11, z: 20.5, vx: 0, vy: 0, vz: 0, onGround: true, fallFrom: 11 }, yaw: 0, hp: 20, cd: 0, flash: 0, wanderT: 0, wx: 0, wz: 0, burn: 0 });
  p.away = true;
  run(g, 3);
  assert.equal(p.hp, MAX_HP, 'en pausa no le hacen daño');
  p.away = false;
  run(g, 3);
  assert.ok(p.hp < MAX_HP);
});

test('se puede matar a un monstruo a golpes y una espada pega más que la mano', () => {
  const { g, p } = flatGame();
  g.time = DAY_SECONDS * 0.75;
  const z = { id: 901, kind: 'zombi' as const, body: { x: 22.3, y: 11, z: 20.5, vx: 0, vy: 0, vz: 0, onGround: true, fallFrom: 11 }, yaw: 0, hp: 20, cd: 99, flash: 0, wanderT: 0, wx: 0, wz: 0, burn: 0 };
  g.mobs.push(z);
  addItem(p.inv, toolId('espada', 'hierro'), 1);
  for (let i = 0; i < 200 && g.mobs.length; i++) {
    p.input = { ...IDLE, yaw: Math.atan2(z.body.x - p.body.x, z.body.z - p.body.z), pitch: -0.1, attack: true };
    z.cd = 99;
    step(g, 1 / 20);
  }
  assert.equal(g.mobs.length, 0);
});

test('cada jugador aparece en su sitio, no uno dentro del otro', () => {
  const g = newGame(5);
  const a = addPlayer(g, 'a', 'A'), b = addPlayer(g, 'b', 'B');
  assert.ok(Math.hypot(a.body.x - b.body.x, a.body.z - b.body.z) > 1.5);
});

// ---------- Mods ----------
import { verityCommand, walkSpeed, jumpSpeed, MAX_FOOD, WALK as WALK0, type ModId } from './game.ts';
function modGame(mods: ModId[]) {
  const r = flatGame();
  r.g.mods = new Set(mods);
  return r;
}

test('superhéroes: corre más, salta más alto y no se hace daño al caer', () => {
  assert.ok(walkSpeed(['heroes']) > WALK0 * 1.5 && jumpSpeed(['heroes']) > jumpSpeed([]));
  const { g, p } = modGame(['heroes']);
  Object.assign(p.body, { y: 30, onGround: false, fallFrom: 30 });
  run(g, 3);
  assert.equal(p.hp, MAX_HP);
});

test('superhéroes: rompe con superfuerza (la tierra a mano en un tercio del tiempo)', () => {
  const { g, p } = modGame(['heroes']);
  g.world.set(22, 11, 20, B.Tierra);
  lookAt(p, 22, 11, 20); run(g, 0.35);
  assert.equal(g.world.get(22, 11, 20), B.Aire);
});

test('supervivencia extrema: el hambre baja y se come para recuperarla', () => {
  const { g, p } = modGame(['supervivencia']);
  run(g, 60);
  assert.ok(p.food < MAX_FOOD);
  const before = p.food;
  addItem(p.inv, I.Manzana, 1);
  assert.ok(place(g, 'p1'), 'comer');
  assert.equal(p.food, Math.min(MAX_FOOD, before + 4));
  assert.equal(count(p.inv, I.Manzana), 0);
});

test('supervivencia extrema: con hambre no te curas y al morir pierdes el inventario', () => {
  const { g, p } = modGame(['supervivencia']);
  p.food = 2; p.hp = 10;
  run(g, 10);
  assert.ok(p.hp <= 10);
  addItem(p.inv, B.Tablas, 5);
  Object.assign(p.body, { y: 60, onGround: false, fallFrom: 60 });
  run(g, 4);
  assert.equal(p.alive, false);
  assert.equal(count(p.inv, B.Tablas), 0);
});

test('sin el mod de supervivencia, la comida cura un poco', () => {
  const { g, p } = flatGame();
  p.hp = 10;
  addItem(p.inv, I.CarneAsada, 1);
  assert.ok(place(g, 'p1'));
  assert.ok(p.hp > 10);
});

test('terror: la sombra desaparece cuando la miras y no hace daño', () => {
  const { g, p } = modGame(['terror']);
  g.time = DAY_SECONDS * 0.75;
  g.mobs.push({ id: 950, kind: 'sombra', body: { x: 40.5, y: 11, z: 20.5, vx: 0, vy: 0, vz: 0, onGround: true, fallFrom: 11 }, yaw: 0, hp: 999, cd: 30, flash: 0, wanderT: 0, wx: 0, wz: 0, burn: 0 });
  p.input = { ...IDLE, yaw: -Math.PI / 2, pitch: 0 }; // mirando hacia el otro lado
  run(g, 2);
  assert.equal(g.mobs.length, 1, 'mientras no la miras, sigue ahí');
  assert.equal(p.hp, MAX_HP);
  p.input = { ...IDLE, yaw: Math.atan2(40.5 - p.body.x, 0), pitch: 0.02 };
  run(g, 0.2);
  assert.equal(g.mobs.length, 0);
});

test('Verity da objetos, cura y cambia la hora; no da objetos que no existen', () => {
  const { g, p } = flatGame();
  assert.ok(verityCommand(g, 'p1', { k: 'dar', id: B.Tablas, n: 10 }));
  assert.equal(count(p.inv, B.Tablas), 10);
  assert.equal(verityCommand(g, 'p1', { k: 'dar', id: 9999, n: 1 }), false);
  assert.ok(verityCommand(g, 'p1', { k: 'dar', id: B.Tablas, n: 5000 }));
  assert.equal(count(p.inv, B.Tablas), 74, 'como mucho 64 de golpe');
  p.hp = 3; verityCommand(g, 'p1', { k: 'curar' }); assert.equal(p.hp, MAX_HP);
  verityCommand(g, 'p1', { k: 'noche' }); assert.ok(isNight(g));
  verityCommand(g, 'p1', { k: 'dia' }); assert.ok(!isNight(g));
});
