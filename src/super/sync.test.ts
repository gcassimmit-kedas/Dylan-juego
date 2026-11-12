import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, tick, reponer, empezarTurno, abrirCaja, clienteEnCaja, escanear, importe, PRODUCT_IDS, type GameState } from './sim.ts';
import { encodeSnap, decodeSnap, parseAccion, aplicarAccion, SNAP_MAX_BYTES, type SnapExtra } from './sync.ts';

const extra = (): SnapExtra => ({ ack: 3, res: [[3, 1, '']], ev: [], g: 'peer-abc', pausa: 0 });

function tiendaLlena(seed: number): GameState {
  const s = newGame(seed);
  for (const p of PRODUCT_IDS) { s.almacen[p] = 500; reponer(s, p); }
  abrirCaja(s, 1, true);
  s.dia = 9; s.reputacion = 100; // muchos clientes a la vez
  empezarTurno(s);
  for (let t = 0; t < 90; t += 0.1) tick(s, 0.1);
  return s;
}

test('la foto del anfitrión cabe en el canal incluso con la tienda llena', () => {
  const s = tiendaLlena(41);
  assert.ok(s.clientes.length >= 8, `clientes: ${s.clientes.length}`);
  const ev = Array.from({ length: 16 }, (_, i) => [i + 1, { tipo: 'venta', importe: 1200, cambio: 300, sobra: 0, propina: 0, id: 99, caja: 1 }]);
  const bytes = new TextEncoder().encode(JSON.stringify(encodeSnap(s, { ...extra(), ev: ev as SnapExtra['ev'] }))).length;
  assert.ok(bytes < SNAP_MAX_BYTES, `${bytes} bytes`);
});

test('el invitado reconstruye lo que necesita para dibujar y cobrar', () => {
  const s = tiendaLlena(42);
  while (!clienteEnCaja(s, 1)) tick(s, 0.1);
  escanear(s, undefined, 1);
  const copia = newGame(1);
  const x = decodeSnap(JSON.parse(JSON.stringify(encodeSnap(s, extra()))), copia)!;
  assert.ok(x);
  assert.equal(x.g, 'peer-abc');
  assert.equal(copia.fase, 'turno');
  assert.deepEqual(copia.estantes, s.estantes);
  assert.deepEqual(copia.jugadores, s.jugadores);
  assert.deepEqual(copia.cajas.map((k) => k.cola), s.cajas.map((k) => k.cola));
  assert.equal(copia.clientes.length, s.clientes.length);
  const a = clienteEnCaja(s, 1)!, b = clienteEnCaja(copia, 1)!;
  assert.equal(b.id, a.id);
  assert.deepEqual(b.cesta, a.cesta);
  assert.deepEqual(b.pasados, a.pasados);
  assert.equal(b.escaneados, a.escaneados);
  assert.ok(Math.abs(b.x - a.x) < 0.01 && Math.abs(b.z - a.z) < 0.01);
});

test('una foto con mala forma se ignora sin tocar el estado', () => {
  const s = newGame(43);
  const antes = JSON.stringify(s.estantes);
  for (const malo of [null, 7, 'x', { v: 2 }, { v: 1, est: [1, 2] }, { v: 1, est: 'x', alm: [], j: [], k: [] }]) {
    assert.equal(decodeSnap(malo, s), null);
  }
  assert.equal(JSON.stringify(s.estantes), antes);
});

test('los valores extremos de la foto se recortan', () => {
  const s = newGame(44);
  const snap = encodeSnap(s, extra()) as Record<string, unknown>;
  (snap.est as number[])[0] = 999999;
  (snap.j as number[][])[0][0] = Number.POSITIVE_INFINITY;
  snap.c = [[1, 'x', 0, 0, 99, 0, 7, 0, 0, 0, 0, 0, '0:5,99:1,abc', '']];
  const x = decodeSnap(snap, s)!;
  assert.ok(x);
  assert.equal(s.estantes[PRODUCT_IDS[0]], 12, 'no más de la capacidad');
  assert.equal(s.jugadores[0].dinero, 0, 'un número no válido se queda en 0');
  assert.equal(s.clientes[0].caja, 1);
  assert.deepEqual(s.clientes[0].cesta, [{ product: PRODUCT_IDS[0], qty: 5 }], 'se descartan productos inexistentes');
});

test('las acciones del invitado se validan antes de aplicarse', () => {
  assert.equal(parseAccion({ n: 1, t: 'reponer', p: 'oro' }), null);
  assert.equal(parseAccion({ n: 0, t: 'empezar' }), null, 'número de acción inválido');
  assert.equal(parseAccion({ n: 2, t: 'comprar', pedido: { leche: -1 } }), null);
  assert.equal(parseAccion({ n: 2, t: 'comprar', pedido: { leche: 1e9 } }), null);
  assert.equal(parseAccion({ n: 3, t: 'cambio', v: 1.5 }), null);
  assert.equal(parseAccion({ n: 4, t: 'mejorar', m: 'musica', k: 7 }), null);
  assert.equal(parseAccion({ n: 5, t: 'borrar-todo' }), null);
  assert.deepEqual(parseAccion({ n: 6, t: 'comprar', pedido: { leche: 2 } }), { n: 6, t: 'comprar', pedido: { leche: 2 }, prov: 'ordenador' });
});

test('el invitado compra con su dinero y solo cobra en su caja', () => {
  const s = tiendaLlena(45);
  const dinero0 = s.jugadores[0].dinero, dinero1 = s.jugadores[1].dinero;
  assert.deepEqual(aplicarAccion(s, parseAccion({ n: 1, t: 'comprar', pedido: { agua: 1 } })!, 1), [1, '']);
  assert.equal(s.jugadores[1].dinero, dinero1 - 360);
  assert.equal(s.jugadores[0].dinero, dinero0);
  while (!clienteEnCaja(s, 0) || !clienteEnCaja(s, 1)) tick(s, 0.1);
  const c0 = clienteEnCaja(s, 0)!;
  const ajeno = c0.cesta[0].product;
  // Escanear como jugador 1 solo afecta a la caja 2.
  const antes = c0.escaneados;
  aplicarAccion(s, { n: 2, t: 'escanear', p: ajeno }, 1);
  assert.equal(c0.escaneados, antes, 'no toca la caja del anfitrión');
});

test('el pago con tarjeta viaja al invitado y su acción se valida', () => {
  const s = tiendaLlena(46);
  while (!clienteEnCaja(s, 1)) tick(s, 0.1);
  const c = clienteEnCaja(s, 1)!;
  while (!c.pago) escanear(s, undefined, 1);
  c.tarjeta = true; c.pago = importe(c);
  const copia = newGame(1);
  decodeSnap(JSON.parse(JSON.stringify(encodeSnap(s, extra()))), copia);
  assert.equal(clienteEnCaja(copia, 1)!.tarjeta, true);
  assert.deepEqual(parseAccion({ n: 9, t: 'tarjeta' }), { n: 9, t: 'tarjeta' });
  const dinero = s.jugadores[1].dinero, total = importe(c);
  assert.deepEqual(aplicarAccion(s, { n: 9, t: 'tarjeta' }, 1), [1, '']);
  assert.equal(s.jugadores[1].dinero, dinero + total);
  assert.deepEqual(aplicarAccion(s, { n: 10, t: 'tarjeta' }, 0), [0, 'tarjeta'], 'en la caja 1 no hay nadie pagando con tarjeta');
});

test('el invitado puede comprar en otras tiendas y avisar de que necesita una ducha', () => {
  assert.deepEqual(parseAccion({ n: 1, t: 'comprar', pedido: { leche: 1 }, prov: 'mayorista' }), { n: 1, t: 'comprar', pedido: { leche: 1 }, prov: 'mayorista' });
  assert.deepEqual(parseAccion({ n: 1, t: 'comprar', pedido: { leche: 1 } }), { n: 1, t: 'comprar', pedido: { leche: 1 }, prov: 'ordenador' }, 'sin proveedor: el ordenador');
  assert.equal(parseAccion({ n: 1, t: 'comprar', pedido: { leche: 1 }, prov: 'banco' }), null);
  assert.equal(parseAccion({ n: 2, t: 'sucio', v: 'mucho' }), null);
  const s = newGame(3);
  assert.deepEqual(aplicarAccion(s, { n: 2, t: 'sucio', v: true }, 1), [1, '']);
  assert.equal(s.cajas[1].sucio, true);
  assert.equal(s.cajas[0].sucio, undefined, 'solo su caja');
  const copia = newGame(1);
  decodeSnap(JSON.parse(JSON.stringify(encodeSnap(s, extra()))), copia);
  assert.equal(copia.cajas[1].sucio, true);
});

test('ladrones y armas viajan al invitado; el alcance se mide desde donde el anfitrión le ve', () => {
  const s = tiendaLlena(43);
  s.jugadores[1].armas = ['agua'];
  s.stats.robos = 2; s.stats.perdidaRobo = 640;
  let c = s.clientes.find((x) => x.ladron);
  for (let i = 0; i < 4000 && !c; i++) { s.proximoCliente = Math.min(s.proximoCliente, 0.1); tick(s, 0.1); c = s.clientes.find((x) => x.ladron && x.estado !== 'saliendo'); }
  assert.ok(c, 'debería entrar algún ladrón');
  const copia = newGame(1);
  const ev = [[1, { tipo: 'robo', id: 5, unidades: 3, coste: 640 }], [2, { tipo: 'ahuyentado', id: 6, j: 1, arma: 'agua', unidades: 2 }], [3, { tipo: 'arma', j: 1, arma: 'bazuca' }]];
  const x = decodeSnap(JSON.parse(JSON.stringify(encodeSnap(s, { ...extra(), ev: ev as SnapExtra['ev'] }))), copia)!;
  assert.deepEqual(copia.jugadores[1].armas, ['agua']);
  assert.deepEqual(copia.jugadores[0].armas, []);
  assert.equal(copia.stats.robos, 2);
  assert.equal(copia.stats.perdidaRobo, 640);
  assert.equal(copia.clientes.find((k) => k.id === c!.id)?.ladron, true);
  assert.equal(x.ev.length, 2, 'un arma que no existe se descarta');
  assert.equal(parseAccion({ n: 1, t: 'arma', a: 'bazuca' }), null);
  assert.equal(parseAccion({ n: 1, t: 'ahuyentar', id: 'x' }), null);
  const a = parseAccion({ n: 2, t: 'ahuyentar', id: c!.id })!;
  assert.deepEqual(aplicarAccion(s, a, 1, null), [0, 'lejos']);
  assert.deepEqual(aplicarAccion(s, a, 1, { x: c!.x + 30, z: c!.z }), [0, 'lejos']);
  assert.deepEqual(aplicarAccion(s, a, 1, { x: c!.x + 2, z: c!.z }), [1, '']);
  s.jugadores[0].dinero = 0;
  assert.deepEqual(aplicarAccion(s, parseAccion({ n: 3, t: 'arma', a: 'red' })!, 0), [0, 'dinero']);
});
