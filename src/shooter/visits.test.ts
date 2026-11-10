import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visitsUrl, parseTotal, visitsLabel, createThrottle } from './visits.ts';

test('visitsUrl: del WebSocket a la ruta HTTP del contador', () => {
  assert.equal(visitsUrl('wss://shooter.onrender.com/ws'), 'https://shooter.onrender.com/api/visitas');
  assert.equal(visitsUrl('ws://localhost:8080/ws'), 'http://localhost:8080/api/visitas');
  assert.equal(visitsUrl('https://x.com'), null);
  assert.equal(visitsUrl('no es una url'), null);
});

test('parseTotal: solo enteros no negativos', () => {
  assert.equal(parseTotal({ total: 12 }), 12);
  assert.equal(parseTotal({ total: 0 }), 0);
  assert.equal(parseTotal({ total: -1 }), null);
  assert.equal(parseTotal({ total: 1.5 }), null);
  assert.equal(parseTotal({ total: '3' }), null);
  assert.equal(parseTotal(null), null);
});

test('visitsLabel: singular, plural y separador de miles', () => {
  assert.equal(visitsLabel(1), '1 jugador');
  assert.equal(visitsLabel(0), '0 jugadores');
  assert.equal(visitsLabel(1234), '1234'.length === 4 ? `${(1234).toLocaleString('es-ES')} jugadores` : '');
});

test('createThrottle: como mucho N altas por dirección y ventana', () => {
  const ok = createThrottle(2, 1000);
  assert.equal(ok('a', 0), true);
  assert.equal(ok('a', 10), true);
  assert.equal(ok('a', 20), false);
  assert.equal(ok('b', 30), true);
  assert.equal(ok('a', 1000), true); // ventana nueva: se olvida todo
});
