import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, comprar, comprarPedido, costePedido, reponer, empezarTurno, siguienteDia, tick, escanear, clienteEnCaja,
  route, importar, exportar, horaTienda, totalArticulos, importe, PRODUCTS, PRODUCT_IDS, DISPLAYS, SHIFT_SECONDS, LAYOUT, walkable,
  type GameState,
} from './sim.ts';

/** Avanza la simulación en pasos de 0.1 s; si `cobrar`, el jugador escanea en cuanto hay alguien en la caja. */
function run(s: GameState, seconds: number, cobrar = false) {
  for (let t = 0; t < seconds && s.fase === 'turno'; t += 0.1) {
    tick(s, 0.1);
    if (cobrar) while (clienteEnCaja(s)) escanear(s);
  }
}

test('cada producto tiene su mueble y los números son coherentes', () => {
  for (const p of PRODUCT_IDS) {
    assert.equal(DISPLAYS.filter((d) => d.product === p).length, 1, p);
    const d = PRODUCTS[p];
    assert.ok(d.precio * d.caja > d.costoCaja, `${p}: vender una caja debe dar beneficio`);
    assert.ok(d.capacidad >= d.caja, `${p}: una caja cabe en la estantería`);
  }
});

test('comprar descuenta dinero y mete las cajas en el almacén', () => {
  const s = newGame();
  const antes = s.almacen.leche;
  assert.deepEqual(comprar(s, 'leche', 2), { ok: true, coste: 24 });
  assert.equal(s.dinero, 80 - 24);
  assert.equal(s.almacen.leche, antes + 12);
  assert.equal(s.stats.gastos, 24);
});

test('no se puede comprar sin dinero ni cantidades raras', () => {
  const s = newGame();
  s.dinero = 10;
  assert.deepEqual(comprar(s, 'queso'), { ok: false, motivo: 'dinero' });
  assert.deepEqual(comprar(s, 'queso', 0), { ok: false, motivo: 'cantidad' });
  assert.deepEqual(comprar(s, 'queso', 1.5), { ok: false, motivo: 'cantidad' });
  assert.equal(s.dinero, 10);
});

test('el pedido del ordenador se compra entero o no se compra', () => {
  const s = newGame();
  const pedido = { agua: 2, queso: 1 };
  assert.equal(costePedido(pedido), 8 * 2 + 14);
  s.dinero = 20;
  assert.deepEqual(comprarPedido(s, pedido), { ok: false, motivo: 'dinero' });
  assert.equal(s.almacen.agua, 0);
  s.dinero = 100;
  assert.deepEqual(comprarPedido(s, pedido), { ok: true, coste: 30 });
  assert.equal(s.almacen.agua, 24);
  assert.equal(s.dinero, 70);
  assert.deepEqual(comprarPedido(s, {}), { ok: false, motivo: 'cantidad' });
  assert.deepEqual(comprarPedido(s, { agua: -1 }), { ok: false, motivo: 'cantidad' });
});

test('reponer llena la estantería con lo que haya en el almacén', () => {
  const s = newGame();
  s.estantes.leche = 2; s.almacen.leche = 30;
  assert.equal(reponer(s, 'leche'), 10);
  assert.equal(s.estantes.leche, 12);
  assert.equal(s.almacen.leche, 20);
  assert.equal(reponer(s, 'leche'), 0, 'ya está llena');
  s.estantes.queso = 0; s.almacen.queso = 3;
  assert.equal(reponer(s, 'queso'), 3);
  assert.equal(s.almacen.queso, 0);
});

test('los puntos clave de la tienda son accesibles', () => {
  for (const d of DISPLAYS) assert.ok(walkable(d.pick), `${d.product}: su punto de recogida está libre`);
  for (let i = 0; i < LAYOUT.queueMax; i++) assert.ok(walkable(LAYOUT.queue(i)), `hueco ${i} de la cola`);
  assert.ok(walkable(LAYOUT.entry) && walkable(LAYOUT.street));
});

test('los caminos rodean los muebles y llegan a su destino', () => {
  const puntos = [LAYOUT.street, LAYOUT.entry, ...DISPLAYS.map((d) => d.pick), LAYOUT.queue(0), LAYOUT.queue(LAYOUT.queueMax - 1)];
  for (const a of puntos) for (const b of puntos) {
    if (a === b) continue;
    const path = route(a, b);
    assert.deepEqual(path[path.length - 1], b);
    let p = a;
    for (const q of path) {
      const n = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 0.05);
      for (let k = 1; k <= n; k++) assert.ok(walkable({ x: p.x + ((q.x - p.x) * k) / n, z: p.z + ((q.z - p.z) * k) / n }), `de ${JSON.stringify(a)} a ${JSON.stringify(b)}`);
      p = q;
    }
  }
});

test('un turno completo: entran clientes, compran, pagan y el turno termina', () => {
  const s = newGame(7);
  for (const p of PRODUCT_IDS) { s.almacen[p] = 200; reponer(s, p); }
  const dinero = s.dinero;
  empezarTurno(s);
  assert.equal(s.fase, 'turno');
  // Reponemos durante el turno como haría el jugador.
  for (let t = 0; t < SHIFT_SECONDS + 120 && s.fase === 'turno'; t += 0.1) {
    tick(s, 0.1);
    while (clienteEnCaja(s)) escanear(s);
    for (const p of PRODUCT_IDS) reponer(s, p);
  }
  assert.equal(s.fase, 'resumen');
  assert.ok(s.stats.clientes >= 10, `clientes: ${s.stats.clientes}`);
  assert.equal(s.stats.atendidos, s.stats.clientes, 'con todo repuesto y cobrando rápido, nadie se va');
  assert.equal(s.dinero, dinero + s.stats.ingresos);
  assert.ok(s.stats.ingresos > 0);
  assert.ok(s.eventos.some((e) => e.tipo === 'cierre'));
  assert.ok(s.eventos.some((e) => e.tipo === 'fin'));
  siguienteDia(s);
  assert.equal(s.dia, 2);
  assert.equal(s.fase, 'preparacion');
  assert.equal(s.stats.ingresos, 0);
});

test('cobrar es un escaneo por artículo y el dinero llega al pasar el último', () => {
  const s = newGame(3);
  for (const p of PRODUCT_IDS) { s.almacen[p] = 100; reponer(s, p); }
  empezarTurno(s);
  assert.equal(escanear(s), null, 'nadie en la caja');
  while (!clienteEnCaja(s)) tick(s, 0.1);
  const c = clienteEnCaja(s)!;
  const n = totalArticulos(c), total = importe(c), dinero = s.dinero;
  assert.ok(n > 0);
  for (let i = 1; i < n; i++) assert.deepEqual(escanear(s), { cobrado: 0 });
  assert.equal(s.dinero, dinero, 'todavía no ha pagado');
  assert.deepEqual(escanear(s), { cobrado: total });
  assert.equal(s.dinero, dinero + total);
  assert.equal(c.estado, 'saliendo');
  assert.notEqual(s.cola[0], c.id);
});

test('sin género en la estantería el cliente se queja y baja la reputación', () => {
  const s = newGame(5);
  for (const p of PRODUCT_IDS) s.estantes[p] = 0;
  empezarTurno(s);
  run(s, 70);
  assert.ok(s.stats.faltas > 0);
  assert.ok(s.reputacion < 50);
  assert.ok(s.eventos.some((e) => e.tipo === 'falta'));
  assert.equal(s.stats.ingresos, 0);
  assert.ok(s.stats.perdidos > 0, 'se van sin comprar');
});

test('si nadie cobra, los clientes se cansan de la cola, se van y devuelven lo que llevaban', () => {
  const s = newGame(11);
  for (const p of PRODUCT_IDS) { s.almacen[p] = 0; s.estantes[p] = PRODUCTS[p].capacidad; }
  empezarTurno(s);
  run(s, SHIFT_SECONDS + 200);
  assert.equal(s.fase, 'resumen', 'el turno acaba aunque no se cobre');
  assert.equal(s.stats.atendidos, 0);
  assert.equal(s.stats.perdidos, s.stats.clientes);
  assert.equal(s.stats.cansados, s.stats.clientes);
  assert.equal(s.stats.ingresos, 0);
  for (const p of PRODUCT_IDS) assert.equal(s.estantes[p], PRODUCTS[p].capacidad, `${p} vuelve a su sitio`);
  assert.ok(s.reputacion < 50);
});

test('al cerrar no entra nadie más', () => {
  const s = newGame(2);
  for (const p of PRODUCT_IDS) { s.almacen[p] = 300; reponer(s, p); }
  empezarTurno(s);
  run(s, SHIFT_SECONDS, true);
  const n = s.stats.clientes;
  run(s, 60, true);
  assert.equal(s.stats.clientes, n);
});

test('la reputación hace que vengan más clientes', () => {
  const contar = (rep: number) => {
    const s = newGame(9);
    s.reputacion = rep;
    for (const p of PRODUCT_IDS) { s.almacen[p] = 500; reponer(s, p); }
    empezarTurno(s);
    for (let t = 0; t < SHIFT_SECONDS + 200 && s.fase === 'turno'; t += 0.1) {
      tick(s, 0.1);
      while (clienteEnCaja(s)) escanear(s);
      for (const p of PRODUCT_IDS) reponer(s, p);
      s.reputacion = rep;
    }
    return s.stats.clientes;
  };
  assert.ok(contar(95) > contar(5));
});

test('reloj de la tienda de 8:00 a 20:00', () => {
  const s = newGame();
  assert.deepEqual(horaTienda(s), { h: 8, m: 0 });
  s.reloj = SHIFT_SECONDS / 2;
  assert.deepEqual(horaTienda(s), { h: 14, m: 0 });
  s.reloj = SHIFT_SECONDS * 2;
  assert.deepEqual(horaTienda(s), { h: 20, m: 0 });
});

test('guardar y cargar conserva la partida y rechaza datos manipulados', () => {
  const s = newGame(4);
  s.dia = 6; s.dinero = 321; s.reputacion = 70; s.almacen.pan = 40; s.estantes.pan = 11;
  const copia = importar(JSON.parse(JSON.stringify(exportar(s))))!;
  assert.equal(copia.dia, 6);
  assert.equal(copia.dinero, 321);
  assert.equal(copia.reputacion, 70);
  assert.equal(copia.almacen.pan, 40);
  assert.equal(copia.estantes.pan, 11);
  assert.equal(copia.fase, 'preparacion');
  assert.equal(importar(null), null);
  assert.equal(importar({ ...exportar(s), dinero: -5 }), null);
  assert.equal(importar({ ...exportar(s), estantes: { ...s.estantes, pan: 999 } }), null);
  assert.equal(importar({ ...exportar(s), v: 2 }), null);
});
