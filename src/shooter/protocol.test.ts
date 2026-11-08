import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportsToKick, MAX_PLAYERS } from './protocol.ts';

test('sala privada: bastan las denuncias de los demás si son pocos', () => {
  assert.equal(reportsToKick(2, false), 1);
  assert.equal(reportsToKick(3, false), 2);
  assert.equal(reportsToKick(4, false), 3);
  assert.equal(reportsToKick(8, false), 3);
});

test('sala pública: nunca basta una sola denuncia', () => {
  assert.equal(reportsToKick(2, true), 2); // solos los dos: no se puede echar al otro
  assert.equal(reportsToKick(3, true), 2);
  assert.equal(reportsToKick(4, true), 3);
  assert.equal(reportsToKick(8, true), 3);
});

test('cada servidor admite 7 jugadores', () => {
  assert.equal(MAX_PLAYERS, 7);
});

test('estado de cada servidor en la lista', async () => {
  const { roomState } = await import('./protocol.ts');
  assert.equal(roomState(0, { wave: 3, phase: 'fight', over: false }), 'vacio');
  assert.equal(roomState(2, { wave: 0, phase: 'fight', over: false }), 'empezando');
  assert.equal(roomState(2, { wave: 3, phase: 'fight', over: false }), 'batalla');
  assert.equal(roomState(2, { wave: 3, phase: 'shop', over: false }), 'tienda');
  assert.equal(roomState(2, { wave: 3, phase: 'fight', over: true }), 'reiniciando');
});

test('nombre aleatorio de servidor: legible y sin repetir', async () => {
  const { randomServerName } = await import('./protocol.ts');
  let r = 7;
  const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const taken = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const n = randomServerName(rand, taken);
    assert.ok(!taken.has(n), 'no se repite');
    assert.match(n, /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+ [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+ \d{1,2}$|^Servidor \d+$/);
    taken.add(n);
  }
  assert.equal(randomServerName(() => 0, new Set()), 'Halcón Rojo 1');
});

test('una partida compartida solo se pausa si todos la pausan', async () => {
  const { roomPaused } = await import('./protocol.ts');
  assert.equal(roomPaused([true]), true, 'solo en la partida: la pausa la detiene');
  assert.equal(roomPaused([true, false]), false, 'si otro sigue jugando, no');
  assert.equal(roomPaused([true, true]), true);
  assert.equal(roomPaused([]), false);
});
