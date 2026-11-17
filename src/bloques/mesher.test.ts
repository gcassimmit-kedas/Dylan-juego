import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meshChunk, DARK } from './mesher.ts';
import { World, B, generate } from './voxel.ts';

const uv = () => [0, 0, 1, 1] as [number, number, number, number];
const faces = (m: { idx: number[] }) => m.idx.length / 6;

test('un bloque suelto tiene sus 6 caras; dos juntos ocultan las que se tocan', () => {
  const w = new World(1);
  w.set(5, 30, 5, B.Piedra);
  assert.equal(faces(meshChunk(w, 0, 0, uv).solid), 6);
  w.set(6, 30, 5, B.Piedra);
  assert.equal(faces(meshChunk(w, 0, 0, uv).solid), 10);
});

test('bajo tierra (en una cueva) las caras quedan a oscuras; al aire libre, iluminadas', () => {
  const w = new World(1);
  w.set(5, 30, 5, B.Piedra);
  const open = meshChunk(w, 0, 0, uv).solid;
  assert.ok(Math.max(...open.col) > 0.9);
  for (let x = 3; x < 9; x++) for (let z = 3; z < 9; z++) w.set(x, 40, z, B.Piedra); // techo
  const cave = meshChunk(w, 0, 0, uv).solid;
  // Las 6 caras del bloque de abajo: buscar sus vértices por posición (y entre 30 y 31)
  const dark: number[] = [];
  for (let i = 0; i < cave.pos.length / 3; i++) {
    const [x, y, z] = cave.pos.slice(i * 3, i * 3 + 3);
    if (y >= 30 && y <= 31 && x >= 5 && x <= 6 && z >= 5 && z <= 6) dark.push(cave.col[i * 3]);
  }
  assert.equal(dark.length, 24);
  assert.ok(Math.max(...dark) <= DARK + 1e-9);
});

test('una antorcha ilumina la cueva', () => {
  const w = new World(1);
  w.set(5, 30, 5, B.Piedra);
  for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) w.set(x, 40, z, B.Piedra);
  w.set(6, 31, 5, B.Antorcha);
  const m = meshChunk(w, 0, 0, uv);
  assert.ok(Math.max(...m.solid.col) > 0.5);
  assert.ok(faces(m.see) > 0, 'la antorcha se dibuja');
});

test('el mundo generado se convierte en malla sin errores y en un tiempo razonable', () => {
  const w = generate(7);
  const t = performance.now();
  let n = 0;
  for (let cx = 0; cx < 6; cx++) for (let cz = 0; cz < 6; cz++) n += faces(meshChunk(w, cx, cz, uv).solid);
  assert.ok(n > 10000);
  assert.ok(performance.now() - t < 20000);
});
