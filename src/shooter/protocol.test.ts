import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportsToKick } from './protocol.ts';

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
