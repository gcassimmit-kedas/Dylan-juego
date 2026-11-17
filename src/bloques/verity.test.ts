import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verity, findItem, norm } from './verity.ts';
import { World, B, W } from './voxel.ts';
import { I, toolId } from './items.ts';
import { DAY_SECONDS } from './game.ts';

function ctx(extra: Partial<Parameters<typeof verity>[1]> = {}) {
  const w = new World(1);
  for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) for (let y = 0; y <= 10; y++) w.set(x, y, z, B.Piedra);
  return { world: w, x: 20.5, y: 11, z: 20.5, yaw: 0, time: DAY_SECONDS * 0.2, terror: false, ...extra };
}

test('entiende frases con o sin tildes y mayúsculas', () => {
  assert.equal(norm('¿Dónde HAY Diamantes?'), 'donde hay diamantes');
});

test('dame 10 tablas da exactamente eso', () => {
  const r = verity('Dame 10 tablas', ctx());
  assert.deepEqual(r.cmd, { k: 'dar', id: B.Tablas, n: 10 });
});

test('entiende números escritos y plurales', () => {
  assert.deepEqual(verity('quiero cinco antorchas', ctx()).cmd, { k: 'dar', id: B.Antorcha, n: 5 });
  assert.deepEqual(verity('necesito diamantes', ctx()).cmd, { k: 'dar', id: I.Diamante, n: 16 });
});

test('herramientas con su material (y de madera si no se dice)', () => {
  assert.equal(findItem('pico de piedra'), toolId('pico', 'piedra'));
  assert.equal(findItem('una espada de diamante'), toolId('espada', 'diamante'));
  assert.equal(findItem('un hacha'), toolId('hacha', 'madera'));
  assert.deepEqual(verity('dame un pico de hierro', ctx()).cmd, { k: 'dar', id: toolId('pico', 'hierro'), n: 1 });
});

test('curar, cambiar la hora y salir a la superficie', () => {
  assert.equal(verity('cúrame', ctx()).cmd?.k, 'curar');
  assert.equal(verity('hazlo de día', ctx()).cmd?.k, 'dia');
  assert.equal(verity('que sea de noche', ctx()).cmd?.k, 'noche');
  assert.equal(verity('estoy atrapado, sácame', ctx()).cmd?.k, 'superficie');
});

test('dice dónde hay un mineral, con distancia y lado', () => {
  const c = ctx();
  c.world.set(20, 5, 30, B.Diamante); // 10 bloques delante (yaw 0 mira hacia +z), 6 más abajo
  const r = verity('¿dónde hay diamantes?', c);
  assert.equal(r.cmd, undefined);
  assert.match(r.text, /delante de ti/);
  assert.match(r.text, /más abajo/);
});

test('explica recetas', () => {
  const r = verity('¿cómo hago un pico de piedra?', ctx());
  assert.match(r.text, /Adoquín|adoquín/);
  assert.match(r.text, /mesa de crafteo/);
});

test('si no entiende, lo dice y da ejemplos', () => {
  const r = verity('xyzzy', ctx());
  assert.equal(r.understood, false);
  assert.equal(r.cmd, undefined);
});

test('con el mod de terror habla de forma inquietante', () => {
  const r = verity('hola', ctx({ terror: true }), () => 0);
  assert.match(r.text, /Siempre/);
});
