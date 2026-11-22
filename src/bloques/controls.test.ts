import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fpInput, applyLook, PITCH_LIMIT } from './controls.ts';

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('empujar hacia arriba avanza hacia donde miras', () => {
  for (const yaw of [0, 1, -2, Math.PI]) {
    const i = fpInput(yaw, 0, -1, false);
    assert.ok(close(i.moveX, Math.sin(yaw)) && close(i.moveZ, Math.cos(yaw)), `yaw ${yaw}`);
  }
});

test('el apuntado sigue siempre a la mirada aunque no te muevas', () => {
  const i = fpInput(0.7, 0, 0, true);
  assert.ok(close(Math.atan2(i.aimX, i.aimZ), 0.7));
  assert.equal(i.moveX, 0); assert.equal(i.moveZ, 0);
  assert.equal(i.fire, true);
});

test('derecha es derecha: girar a la derecha y luego avanzar es lo mismo que ir de lado a la derecha', () => {
  const side = fpInput(0, 1, 0, false);
  const [yaw] = applyLook(0, 0, 100, 0, Math.PI / 2 / 100); // 90 grados a la derecha
  const fwd = fpInput(yaw, 0, -1, false);
  assert.ok(close(side.moveX, fwd.moveX) && close(side.moveZ, fwd.moveZ));
});

test('en diagonal no se corre más', () => {
  const i = fpInput(0.3, 1, -1, false);
  assert.ok(Math.hypot(i.moveX, i.moveZ) <= 1 + 1e-9);
});

test('la zona muerta ignora un joystick casi quieto', () => {
  const i = fpInput(0, 0.05, 0.05, false);
  assert.equal(i.moveX, 0); assert.equal(i.moveZ, 0);
});

test('la mirada no da la vuelta hacia arriba ni hacia abajo', () => {
  assert.equal(applyLook(0, 0, 0, -10000, 0.01)[1], PITCH_LIMIT);
  assert.equal(applyLook(0, 0, 0, 10000, 0.01)[1], -PITCH_LIMIT);
});
