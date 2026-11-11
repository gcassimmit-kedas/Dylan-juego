import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from './sim.ts';
import { codigoPartida, leerCodigo } from './codigo.ts';

test('el código de partida se lleva el día, el dinero, el género, las mejoras y el aspecto', () => {
  const s = newGame(7);
  s.dia = 12; s.jugadores[0].dinero = 45678; s.jugadores[1].dinero = 999; s.almacen.leche = 37; s.estantes.queso = 5;
  s.cajas[0].musica = true; s.reputacion = 81; s.mejorDia = 3210;
  const codigo = codigoPartida(s, [2, 3]);
  assert.match(codigo, /^SUPER1-[A-Za-z0-9_-]+-[a-z0-9]{7}$/);
  const r = leerCodigo(codigo);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.state.dia, 12);
  assert.equal(r.state.jugadores[0].dinero, 45678);
  assert.equal(r.state.jugadores[1].dinero, 999);
  assert.equal(r.state.almacen.leche, 37);
  assert.equal(r.state.estantes.queso, 5);
  assert.equal(r.state.cajas[0].musica, true);
  assert.equal(r.state.reputacion, 81);
  assert.equal(r.state.mejorDia, 3210);
  assert.deepEqual(r.aspecto, [2, 3]);
});

test('se puede pegar con espacios o saltos de línea', () => {
  const codigo = codigoPartida(newGame(1), [0, 0]);
  const conEspacios = codigo.slice(0, 20) + '\n  ' + codigo.slice(20, 50) + ' ' + codigo.slice(50);
  assert.ok(leerCodigo(conEspacios).ok);
});

test('un código copiado a medias, cambiado o inventado no se carga', () => {
  const codigo = codigoPartida(newGame(1), [1, 1]);
  assert.deepEqual(leerCodigo(''), { ok: false, motivo: 'formato' });
  assert.deepEqual(leerCodigo('hola'), { ok: false, motivo: 'formato' });
  assert.deepEqual(leerCodigo(codigo.slice(0, codigo.length - 12)), { ok: false, motivo: 'incompleto' });
  const cambiado = codigo.slice(0, 15) + (codigo[15] === 'A' ? 'B' : 'A') + codigo.slice(16);
  assert.equal(leerCodigo(cambiado).ok, false);
  // Bien firmado pero con datos imposibles (dinero negativo): tampoco.
  const malo = { v: 3, dia: 1, dinero: -5, reputacion: 50, almacen: {}, estantes: {}, mejorDia: 0, seed: 1 };
  const cuerpo = btoa(JSON.stringify(malo)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  let h = 0x811c9dc5; for (let i = 0; i < cuerpo.length; i++) { h ^= cuerpo.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  assert.deepEqual(leerCodigo(`SUPER1-${cuerpo}-${h.toString(36).padStart(7, '0').slice(-7)}`), { ok: false, motivo: 'datos' });
});
