import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTerrain, terrainHeight } from './terrain.ts';

test('dentro del campo de batalla no hay terreno', () => {
  for (const [x, z] of [[0, 0], [29, -29], [-31, 10]]) assert.equal(terrainHeight(x, z, 30), 0);
  assert.ok(terrainHeight(40, 0, 30) > 0);
});

test('una columna sola muestra arriba y sus cuatro lados, y nada más', () => {
  const m = buildTerrain(2, 0, (x, z) => (x === 0 && z === 0 ? 2 : 0));
  assert.equal(m.grass.pos.length / 18, 1);
  assert.equal(m.side.pos.length / 18, 4); // bloque de arriba
  assert.equal(m.dirt.pos.length / 18, 4); // bloque de abajo
});

test('las caras entre dos columnas iguales no se dibujan (están tapadas)', () => {
  const m = buildTerrain(3, 0, (x, z) => (Math.abs(x) <= 1 && z === 0 ? 1 : 0));
  assert.equal(m.grass.pos.length / 18, 3);
  assert.equal(m.side.pos.length / 18, 8); // 3 columnas x 4 lados - 4 caras tapadas
});

test('las normales apuntan hacia fuera según el orden de los vértices', () => {
  const m = buildTerrain(2, 0, (x, z) => (x === 0 && z === 0 ? 1 : 0));
  for (const f of [m.grass, m.side]) for (let i = 0; i < f.pos.length; i += 9) {
    const p = f.pos;
    const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
    const vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const k = i / 3;
    const dot = n[0] * f.nrm[k * 3] + n[1] * f.nrm[k * 3 + 1] + n[2] * f.nrm[k * 3 + 2];
    assert.ok(dot > 0, 'triángulo mirando hacia dentro');
  }
});
