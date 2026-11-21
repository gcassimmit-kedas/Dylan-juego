import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldName, newCard, startWorld, saveGame, loadGame, parseCards, MAX_WORLDS } from './save.ts';
import { step, getPlayer } from './game.ts';
import { addItem, count } from './items.ts';
import { B, key } from './voxel.ts';

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

test('los mundos tienen nombre automático y no se repite', () => {
  const a = worldName(() => 0);
  assert.equal(a, 'Valle Dorado');
  const b = worldName(seq([0, 0, 0.5, 0.5]), [a]);
  assert.notEqual(b, a);
  assert.match(b, /^[A-ZÁÉÍÓÚ][a-záéíóú]+ [A-ZÁÉÍÓÚ][a-záéíóú]+$/);
  assert.equal(worldName(() => 0, ['Valle Dorado']), 'Valle Nuevo 2');
});

test('un mundo guardado se reanuda igual: bloques, cofre, inventario, sitio y hora', () => {
  const card = newCard(() => 0.3, 'Valle Dorado', false, 1000);
  const g = startWorld(card, 'p1');
  const p = getPlayer(g, 'p1')!;
  const [x, y, z] = [Math.floor(p.body.x) + 2, Math.floor(p.body.y), Math.floor(p.body.z)];
  g.world.set(x, y, z, B.Cofre);
  g.boxes.set(key(x, y, z), { kind: 'cofre', slots: [{ id: B.Tablas, n: 5 }, ...Array(26).fill(null)], burn: 0, burnMax: 0, prog: 0 });
  addItem(p.inv, B.Adoquin, 12);
  p.hp = 9; p.sel = 3; g.time = 321.5;
  const text = JSON.stringify(saveGame(g, 'p1'));
  const h = loadGame(card, JSON.parse(text), 'p1');
  const q = getPlayer(h, 'p1')!;
  assert.equal(h.world.get(x, y, z), B.Cofre);
  assert.equal(h.boxes.get(key(x, y, z))!.slots[0]!.n, 5);
  assert.equal(count(q.inv, B.Adoquin), 12);
  assert.equal(q.hp, 9); assert.equal(q.sel, 3); assert.equal(h.time, 321.5);
  assert.ok(Math.abs(q.body.x - p.body.x) < 0.02 && Math.abs(q.body.z - p.body.z) < 0.02);
});

test('un guardado estropeado no rompe el mundo: se ignora lo que no encaja', () => {
  const card = newCard(() => 0.3, 'Valle Dorado', false, 1000);
  for (const bad of [null, 'x', { v: 2 }, { v: 1, edits: ['a', 5, 3], boxes: [[1, { kind: 'bomba', slots: [] }], 7], player: { x: 'a', inv: 'no' }, time: -4 }]) {
    const g = loadGame(card, bad, 'p1');
    assert.ok(getPlayer(g, 'p1')!.alive);
    assert.equal(g.boxes.size, 0);
  }
  const g = loadGame(card, { v: 1, player: { x: 1, y: 60, z: 1, hp: 999, sel: 40, inv: [{ id: 99999, n: 3 }, { id: B.Tablas, n: 5000 }] } }, 'p1');
  const p = getPlayer(g, 'p1')!;
  assert.equal(p.hp, 20); assert.equal(p.sel, 8);
  assert.equal(p.inv[0], null); assert.equal(p.inv[1]!.n, 64);
});

test('en un mundo tranquilo no aparecen criaturas ni de noche', () => {
  const card = newCard(() => 0.3, 'Prado Sereno', true, 1000);
  const g = startWorld(card, 'p1');
  g.time = 600 * 0.6; // de noche
  for (let i = 0; i < 20 * 30; i++) step(g, 1 / 20);
  assert.equal(g.mobs.length, 0);
});

test('la lista de mundos descarta fichas que no tienen buena forma', () => {
  const good = newCard(() => 0.3, 'Valle Dorado', false, 1000);
  assert.deepEqual(parseCards(JSON.stringify([good, { id: '../x', name: 'a' }, 5, null])).map((c) => c.name), ['Valle Dorado']);
  assert.deepEqual(parseCards('no es json'), []);
  assert.equal(parseCards(JSON.stringify(Array.from({ length: 20 }, () => good))).length, MAX_WORLDS);
});

test('tus brincones amigos siguen contigo al reanudar el mundo', () => {
  const card = newCard(() => 0.3, 'Valle Dorado', false, 1000);
  const g = startWorld(card, 'p1');
  const p = getPlayer(g, 'p1')!;
  g.mobs.push({ id: 5, kind: 'brincon', owner: 'p1', body: { ...p.body, x: p.body.x + 1 }, yaw: 0, hp: 16, cd: 0, flash: 0, wanderT: 0, wx: 0, wz: 0, burn: 0 });
  g.mobs.push({ id: 6, kind: 'pedrusco', body: { ...p.body }, yaw: 0, hp: 20, cd: 0, flash: 0, wanderT: 0, wx: 0, wz: 0, burn: 0 });
  const h = loadGame(card, JSON.parse(JSON.stringify(saveGame(g, 'p1'))), 'p1');
  assert.deepEqual(h.mobs.map((m) => [m.kind, m.owner]), [['brincon', 'p1']]);
});

test('la armadura puesta se guarda, y una pieza en el sitio que no es suyo se descarta', async () => {
  const { armorId } = await import('./items.ts');
  const card = newCard(() => 0.3, 'Valle Dorado', false, 1000);
  const g = startWorld(card, 'p1');
  getPlayer(g, 'p1')!.armor = [armorId('casco', 'oro'), null, armorId('botas', 'diamante')];
  const data = JSON.parse(JSON.stringify(saveGame(g, 'p1')));
  assert.deepEqual(getPlayer(loadGame(card, data, 'p1'), 'p1')!.armor, [armorId('casco', 'oro'), null, armorId('botas', 'diamante')]);
  data.player.armor = [armorId('botas', 'oro'), 7, 'x'];
  assert.deepEqual(getPlayer(loadGame(card, data, 'p1'), 'p1')!.armor, [null, null, null]);
});
