import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markGranted } from './compras.ts';

test('compras: cada pago se entrega una sola vez', () => {
  const a = markGranted([], 'GPA.1');
  assert.deepEqual(a, ['GPA.1']);
  assert.equal(markGranted(a!, 'GPA.1'), null);
  assert.deepEqual(markGranted(a!, 'GPA.2'), ['GPA.1', 'GPA.2']);
  assert.equal(markGranted([], ''), null);
});

test('compras: la lista de entregadas no crece sin límite', () => {
  let list: string[] = [];
  for (let i = 0; i < 80; i++) list = markGranted(list, 'GPA.' + i)!;
  assert.equal(list.length, 50);
  assert.equal(list[49], 'GPA.79');
});
