import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lines, newGame, play, idx, aiMove } from './game.ts';

test('número de líneas ganadoras', () => {
  assert.equal(lines(3).length, 49);
  assert.equal(lines(4).length, 76);
});

test('el centro está bloqueado en 3×3×3', () => {
  const s = newGame(3);
  assert.equal(s.cells[idx(3, 1, 1, 1)], -1);
  assert.equal(play(s, idx(3, 1, 1, 1)), s);
});

test('gana una diagonal espacial en 4×4×4', () => {
  let s = newGame(4);
  const x = [0, 1, 2, 3].map((k) => idx(4, k, k, k));
  const o = [1, 2, 3].map((k) => idx(4, k, 0, 3));
  for (let k = 0; k < 3; k++) { s = play(s, x[k]); s = play(s, o[k]); }
  assert.equal(s.winner, 0);
  s = play(s, x[3]);
  assert.equal(s.winner, 1);
  assert.deepEqual(s.winLine, x);
  assert.equal(play(s, 5), s, 'no se puede jugar tras ganar');
});

test('la IA bloquea la amenaza rival', () => {
  let s = newGame(4);
  s = play(s, idx(4, 0, 0, 0)); s = play(s, idx(4, 0, 3, 3));
  s = play(s, idx(4, 1, 0, 0)); s = play(s, idx(4, 1, 3, 3));
  s = play(s, idx(4, 2, 0, 0)); // X amenaza (3,0,0); turno de O
  assert.equal(aiMove(s, 'dificil'), idx(4, 3, 0, 0));
});

test('la IA prefiere ganar antes que bloquear', () => {
  let s = newGame(4);
  s = play(s, idx(4, 0, 0, 0)); s = play(s, idx(4, 0, 3, 3));
  s = play(s, idx(4, 1, 0, 0)); s = play(s, idx(4, 1, 3, 3));
  s = play(s, idx(4, 2, 0, 0)); s = play(s, idx(4, 2, 3, 3));
  // Turno de X: X gana en (3,0,0), O amenaza (3,3,3).
  assert.equal(aiMove(s, 'dificil'), idx(4, 3, 0, 0));
});

test('partida completa IA contra IA termina', () => {
  for (const n of [3, 4]) {
    let s = newGame(n);
    while (!s.winner && !s.draw) s = play(s, aiMove(s, 'dificil'));
    assert.ok(s.winner || s.draw);
  }
});
