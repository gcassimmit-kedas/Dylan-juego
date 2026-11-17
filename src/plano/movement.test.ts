import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, normalizeInput, MAX_SPEED, HALF_SIZE, type Body } from './movement.ts';

const still: Body = { x: 0, z: 0, heading: 0, speed: 0 };
const run = (b: Body, inp: { x: number; z: number }, secs: number) => {
  for (let i = 0; i < secs * 60; i++) b = step(b, inp, 1 / 60);
  return b;
};

test('sin entrada no se mueve', () => {
  assert.deepEqual(run(still, { x: 0, z: 0 }, 1), still);
});

test('la zona muerta ignora derivas pequeñas del joystick', () => {
  assert.deepEqual(normalizeInput({ x: 0.05, z: -0.05 }), { x: 0, z: 0 });
});

test('empujar hacia arriba avanza hacia -z y alcanza la velocidad máxima', () => {
  const b = run(still, { x: 0, z: -1 }, 1);
  assert.ok(b.z < -4, `z=${b.z}`);
  assert.ok(Math.abs(b.x) < 1e-9);
  assert.equal(b.speed, MAX_SPEED);
});

test('en diagonal no va más rápido que en recto', () => {
  const b = run(still, { x: 1, z: 1 }, 0.5);
  assert.ok(b.speed <= MAX_SPEED + 1e-9);
  assert.ok(Math.abs(b.x - b.z) < 1e-9);
});

test('al soltar frena y conserva la orientación', () => {
  const moving = run(still, { x: 1, z: 0 }, 1);
  const stopped = run(moving, { x: 0, z: 0 }, 1);
  assert.equal(stopped.speed, 0);
  assert.equal(stopped.heading, moving.heading);
});

test('no sale del plano', () => {
  const b = run(still, { x: 1, z: 0 }, 30);
  assert.equal(b.x, HALF_SIZE);
});
