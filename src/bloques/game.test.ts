import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, addPlayer, step, place, craft, respawn, MAX_HP, EYE, IDLE, DAY_SECONDS, isNight, type Game, type Player } from './game.ts';
import { World, B } from './voxel.ts';
const W = 96; // zona de pruebas
import { addItem, count, breakTime, toolId, RECIPES, I } from './items.ts';

/** Partida en un mundo plano: piedra hasta la altura 10, un bloque de tierra delante. Sin monstruos. */
function flatGame(): { g: Game; p: Player } {
  const g = newGame(1, () => 0.5);
  const w = World.empty(1);
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
  assert.ok(g.changes.length > 0 && g.world.edits.size > 0);
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
  g.mobs.push({ id: 900, kind: 'pedrusco', body: { x: 22.5, y: 11, z: 20.5, vx: 0, vy: 0, vz: 0, onGround: true, fallFrom: 11 }, yaw: 0, hp: 20, cd: 0, flash: 0, wanderT: 0, wx: 0, wz: 0, burn: 0 });
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
  const z = { id: 901, kind: 'pedrusco' as const, body: { x: 22.3, y: 11, z: 20.5, vx: 0, vy: 0, vz: 0, onGround: true, fallFrom: 11 }, yaw: 0, hp: 20, cd: 99, flash: 0, wanderT: 0, wx: 0, wz: 0, burn: 0 };
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

import { verityCommand } from './game.ts';

test('la comida cura un poco', () => {
  const { g, p } = flatGame();
  p.hp = 10;
  addItem(p.inv, I.CarneAsada, 1);
  assert.ok(place(g, 'p1'));
  assert.ok(p.hp > 10);
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

// ---------- Mesa, horno y cofre ----------
import { useTarget, boxMove, getBox, FURNACE, CHEST_SLOTS } from './game.ts';
import { SMELT_SECONDS } from './items.ts';

function withBlock(b: number) {
  const r = flatGame();
  addItem(r.p.inv, b, 1);
  lookAt(r.p, 22, 10, 20, false);
  assert.ok(place(r.g, 'p1'));
  return r;
}

test('mirar una mesa de crafteo y usarla la abre (y no se coloca nada encima)', () => {
  const { g, p } = withBlock(B.Mesa);
  lookAt(p, 22, 11, 20, false);
  assert.equal(useTarget(g, p)?.what, 'mesa');
  addItem(p.inv, B.Tierra, 1);
  p.sel = p.inv.findIndex((s) => s?.id === B.Tierra);
  assert.equal(place(g, 'p1'), false);
  assert.equal(g.world.get(22, 12, 20), B.Aire);
});

test('el horno funde mineral de hierro con carbón con el tiempo, y se enciende mientras arde', () => {
  const { g, p } = withBlock(B.Horno);
  addItem(p.inv, B.Hierro, 2); addItem(p.inv, I.Carbon, 1);
  const at = (id: number) => p.inv.findIndex((s) => s?.id === id);
  assert.ok(boxMove(g, 'p1', 22, 11, 20, 'put', at(B.Hierro)));
  assert.ok(boxMove(g, 'p1', 22, 11, 20, 'put', at(I.Carbon)));
  const box = getBox(g, 22, 11, 20)!;
  assert.equal(box.slots[FURNACE.IN]?.n, 2);
  run(g, 1);
  assert.equal(g.world.get(22, 11, 20), B.HornoEncendido);
  run(g, SMELT_SECONDS);
  assert.equal(box.slots[FURNACE.OUT]?.id, I.LingoteHierro);
  run(g, SMELT_SECONDS);
  assert.equal(box.slots[FURNACE.OUT]?.n, 2);
  assert.ok(boxMove(g, 'p1', 22, 11, 20, 'take', FURNACE.OUT));
  assert.equal(count(p.inv, I.LingoteHierro), 2);
  run(g, 90);
  assert.equal(g.world.get(22, 11, 20), B.Horno, 'sin combustible se apaga');
});

test('al horno solo entran cosas que se funden o que arden, cada una en su sitio', () => {
  const { g, p } = withBlock(B.Horno);
  addItem(p.inv, B.Tierra, 1); addItem(p.inv, B.Tablas, 4);
  assert.equal(boxMove(g, 'p1', 22, 11, 20, 'put', p.inv.findIndex((s) => s?.id === B.Tierra)), false);
  assert.ok(boxMove(g, 'p1', 22, 11, 20, 'put', p.inv.findIndex((s) => s?.id === B.Tablas)));
  assert.equal(getBox(g, 22, 11, 20)!.slots[FURNACE.FUEL]?.id, B.Tablas);
});

test('el cofre guarda cosas y al romperlo te devuelve todo', () => {
  const { g, p } = withBlock(B.Cofre);
  assert.equal(getBox(g, 22, 11, 20)!.slots.length, CHEST_SLOTS);
  addItem(p.inv, B.Tablas, 30);
  assert.ok(boxMove(g, 'p1', 22, 11, 20, 'put', p.inv.findIndex((s) => s?.id === B.Tablas)));
  assert.equal(count(p.inv, B.Tablas), 0);
  addItem(p.inv, toolId('hacha', 'piedra'), 1); p.sel = p.inv.findIndex((s) => s !== null);
  lookAt(p, 22, 11, 20); run(g, 3);
  assert.equal(g.world.get(22, 11, 20), B.Aire);
  assert.equal(count(p.inv, B.Tablas), 30);
  assert.equal(count(p.inv, B.Cofre), 1);
});

test('no se puede usar un horno desde lejos (lo comprueba el servidor)', () => {
  const { g, p } = withBlock(B.Horno);
  addItem(p.inv, B.Hierro, 1);
  p.body.x = 40;
  assert.equal(boxMove(g, 'p1', 22, 11, 20, 'put', p.inv.findIndex((s) => s?.id === B.Hierro)), false);
});

test('las plantas se rompen al instante: la flor se recoge, la hierba alta no deja nada y el arbusto da 2 bayas', () => {
  const { g, p } = flatGame();
  for (const [x, b] of [[21, B.FlorSol], [22, B.HierbaAlta], [23, B.ArbustoBayas]] as const) { g.world.set(x, 10, 20, B.Hierba); g.world.set(x, 11, 20, b); }
  for (const x of [21, 22, 23]) { lookAt(p, x, 11, 20); run(g, 0.1); assert.equal(g.world.get(x, 11, 20), B.Aire); }
  assert.equal(count(p.inv, B.FlorSol), 1);
  assert.equal(count(p.inv, B.HierbaAlta), 0);
  assert.equal(count(p.inv, I.Bayas), 2);
});

test('una planta solo se planta sobre hierba o tierra, y se pierde si le quitan el suelo', () => {
  const { g, p } = flatGame();
  addItem(p.inv, B.FlorFuego, 2);
  lookAt(p, 22, 10, 20, false);
  assert.equal(place(g, 'p1'), false); // sobre piedra, no
  g.world.set(22, 10, 20, B.Tierra);
  assert.equal(place(g, 'p1'), true);
  assert.equal(g.world.get(22, 11, 20), B.FlorFuego);
  assert.equal(count(p.inv, B.FlorFuego), 1);
  lookAt(p, 22, 10, 21); // romper la tierra desde un lado: la flor desaparece con ella
  g.world.set(22, 10, 21, B.Aire); g.world.set(22, 10, 22, B.Aire);
  Object.assign(p.body, { x: 22.5, y: 10, z: 22.5 });
  g.world.set(22, 9, 22, B.Piedra);
  lookAt(p, 22, 10, 20);
  run(g, 1.2);
  assert.equal(g.world.get(22, 10, 20), B.Aire);
  assert.equal(g.world.get(22, 11, 20), B.Aire);
});

test('se puede construir encima de una planta: el bloque ocupa su sitio', () => {
  const { g, p } = flatGame();
  g.world.set(22, 10, 20, B.Hierba); g.world.set(22, 11, 20, B.HierbaAlta);
  addItem(p.inv, B.Tablas, 1);
  lookAt(p, 22, 11, 20, false);
  assert.equal(place(g, 'p1'), true);
  assert.equal(g.world.get(22, 11, 20), B.Tablas);
});

test('las bayas se comen', () => {
  const { g, p } = flatGame();
  addItem(p.inv, I.Bayas, 1);
  p.hp = 10;
  assert.equal(place(g, 'p1'), true);
  assert.equal(p.hp, 11);
  assert.equal(count(p.inv, I.Bayas), 0);
});

test('las losas se fabrican en la mesa: 3 tablas dan 6 losas', () => {
  const { g, p } = flatGame();
  g.world.set(21, 11, 21, B.Mesa);
  addItem(p.inv, B.Tablas, 3);
  assert.equal(craft(g, 'p1', 'losa-tablas'), true);
  assert.equal(count(p.inv, B.LosaTablas), 6);
  assert.equal(count(p.inv, B.Tablas), 0);
});

test('cada criatura deja lo suyo: el espino palos, el pedrusco carbón y el brincón bayas', () => {
  for (const [kind, item] of [['espino', I.Palo], ['pedrusco', I.Carbon], ['brincon', I.Bayas]] as const) {
    const { g, p } = flatGame();
    g.rand = () => 0.1;
    g.mobs.push({ id: 902, kind, body: { x: 22.3, y: 11, z: 20.5, vx: 0, vy: 0, vz: 0, onGround: true, fallFrom: 11 }, yaw: 0, hp: 1, cd: 99, flash: 0, wanderT: 0, wx: 0, wz: 0, burn: 0 });
    lookAt(p, 22, 11, 20);
    run(g, 0.2);
    assert.equal(g.mobs.length, 0, kind);
    assert.ok(count(p.inv, item) >= 1, kind);
  }
});

// ---------- Brincones amigos ----------
import { MAX_PETS, isHostile, type Mob } from './game.ts';
const brincon = (id: number, x: number, z: number, extra: Partial<Mob> = {}): Mob =>
  ({ id, kind: 'brincon', body: { x, y: 11, z, vx: 0, vy: 0, vz: 0, onGround: true, fallFrom: 11 }, yaw: 0, hp: 16, cd: 0, flash: 0, wanderT: 99, wx: 0, wz: 0, burn: 0, ...extra });
/** Mirar a una criatura que está de pie en (x, z). */
const lookAtMob = (p: Player, x: number, z: number) => { lookAt(p, Math.floor(x), 11, Math.floor(z), false); };

test('de día el brincón es manso; de noche ataca, salvo en un mundo tranquilo', () => {
  const { g, p } = flatGame();
  const m = brincon(1, 22.5, 20.5);
  g.mobs.push(m);
  g.time = DAY_SECONDS * 0.2;
  assert.equal(isHostile(g, m), false);
  run(g, 3);
  assert.equal(p.hp, MAX_HP);
  g.time = DAY_SECONDS * 0.7;
  assert.equal(isNight(g), true);
  assert.equal(isHostile(g, m), true);
  g.peaceful = true;
  assert.equal(isHostile(g, m), false);
});

test('darle bayas a un brincón lo hace tu amigo: gasta una baya y ya no se le puede pegar', () => {
  const { g, p } = flatGame();
  g.time = DAY_SECONDS * 0.2;
  const m = brincon(1, 22.5, 20.5);
  g.mobs.push(m);
  addItem(p.inv, I.Bayas, 2);
  lookAtMob(p, 22.5, 20.5);
  assert.equal(place(g, 'p1'), true);
  assert.equal(m.owner, 'p1');
  assert.equal(count(p.inv, I.Bayas), 1);
  assert.ok(g.events.some((e) => e.kind === 'tame'));
  p.input.attack = true;
  run(g, 1);
  assert.equal(m.hp, 16);
});

test('sin mirar a un brincón las bayas se comen, y no se pasa de 3 amigos', () => {
  const { g, p } = flatGame();
  g.time = DAY_SECONDS * 0.2;
  addItem(p.inv, I.Bayas, 5);
  p.hp = 10;
  lookAt(p, 30, 11, 20, false);
  assert.equal(place(g, 'p1'), true);
  assert.equal(p.hp, 11);
  for (let i = 0; i < MAX_PETS; i++) g.mobs.push(brincon(10 + i, 30.5, 30.5 + i, { owner: 'p1' }));
  const wild = brincon(1, 22.5, 20.5);
  g.mobs.push(wild);
  p.hp = MAX_HP;
  lookAtMob(p, 22.5, 20.5);
  assert.equal(place(g, 'p1'), false);
  assert.equal(wild.owner, undefined);
});

test('el brincón amigo te sigue, vuelve a tu lado si te alejas mucho y acaba con la criatura que te ataca', () => {
  const { g, p } = flatGame();
  g.time = DAY_SECONDS * 0.7; // de noche
  const pet = brincon(1, 28.5, 20.5, { owner: 'p1' });
  g.mobs.push(pet);
  run(g, 3);
  assert.ok(Math.hypot(pet.body.x - p.body.x, pet.body.z - p.body.z) < 4);
  Object.assign(p.body, { x: 70.5, z: 70.5 });
  run(g, 0.2);
  assert.ok(Math.hypot(pet.body.x - p.body.x, pet.body.z - p.body.z) < 4);
  p.invuln = 999;
  const foe: Mob = { id: 2, kind: 'pedrusco', body: { x: 74.5, y: 11, z: 70.5, vx: 0, vy: 0, vz: 0, onGround: true, fallFrom: 11 }, yaw: 0, hp: 9, cd: 99, flash: 0, wanderT: 0, wx: 0, wz: 0, burn: 0 };
  g.mobs.push(foe);
  run(g, 8);
  assert.ok(!g.mobs.includes(foe));
  assert.ok(g.mobs.includes(pet));
});
