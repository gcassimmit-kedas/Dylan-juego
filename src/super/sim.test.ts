import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, comprar, comprarPedido, costePedido, reponer, empezarTurno, siguienteDia, tick, escanear, clienteEnCaja,
  route, importar, darCambio, cobrarTarjeta, sortearOferta, disponibles, esRara, CAMBIO, abrirCaja, mejorar, cambioDebido, importeEscaneado, BILLETES, exportar, horaTienda, totalArticulos, importe, PRODUCTS, PRODUCT_IDS, DISPLAYS, SHIFT_SECONDS, LAYOUT, walkable,
  type GameState,
} from './sim.ts';

/** Atiende al cliente de la caja: escanea todo y da el cambio justo. */
function atender(s: GameState) {
  while (clienteEnCaja(s)) {
    const c = clienteEnCaja(s)!;
    if (!c.pago) escanear(s); else darCambio(s, cambioDebido(c));
  }
}

/** Avanza la simulación en pasos de 0.1 s; si `cobrar`, el jugador atiende en cuanto hay alguien en la caja. */
function run(s: GameState, seconds: number, cobrar = false) {
  for (let t = 0; t < seconds && s.fase === 'turno'; t += 0.1) {
    tick(s, 0.1);
    if (cobrar) atender(s);
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
  assert.deepEqual(comprar(s, 'leche', 2), { ok: true, coste: 500 });
  assert.equal(s.jugadores[0].dinero, 1500 - 500);
  assert.equal(s.almacen.leche, antes + 12);
  assert.equal(s.jugadores[0].gastos, 500);
});

test('no se puede comprar sin dinero ni cantidades raras', () => {
  const s = newGame();
  s.jugadores[0].dinero = 10;
  assert.deepEqual(comprar(s, 'queso'), { ok: false, motivo: 'dinero' });
  assert.deepEqual(comprar(s, 'queso', 0), { ok: false, motivo: 'cantidad' });
  assert.deepEqual(comprar(s, 'queso', 1.5), { ok: false, motivo: 'cantidad' });
  assert.equal(s.jugadores[0].dinero, 10);
});

test('el pedido del ordenador se compra entero o no se compra', () => {
  const s = newGame();
  const pedido = { agua: 2, queso: 1 };
  assert.equal(costePedido(pedido), 360 * 2 + 550);
  s.jugadores[0].dinero = 1000;
  assert.deepEqual(comprarPedido(s, pedido), { ok: false, motivo: 'dinero' });
  assert.equal(s.almacen.agua, 0);
  s.jugadores[0].dinero = 1500;
  assert.deepEqual(comprarPedido(s, pedido), { ok: true, coste: 1270 });
  assert.equal(s.almacen.agua, 24);
  assert.equal(s.jugadores[0].dinero, 230);
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
  const dinero = s.jugadores[0].dinero;
  empezarTurno(s);
  assert.equal(s.fase, 'turno');
  // Reponemos durante el turno como haría el jugador.
  for (let t = 0; t < SHIFT_SECONDS + 120 && s.fase === 'turno'; t += 0.1) {
    tick(s, 0.1);
    atender(s);
    for (const p of PRODUCT_IDS) reponer(s, p);
  }
  assert.equal(s.fase, 'resumen');
  assert.ok(s.stats.clientes >= 10, `clientes: ${s.stats.clientes}`);
  assert.equal(s.stats.atendidos, s.stats.clientes, 'con todo repuesto y cobrando rápido, nadie se va');
  assert.equal(s.jugadores[0].dinero, dinero + s.jugadores[0].ingresos);
  assert.ok(s.jugadores[0].ingresos > 0);
  assert.ok(s.eventos.some((e) => e.tipo === 'cierre'));
  assert.ok(s.eventos.some((e) => e.tipo === 'fin'));
  siguienteDia(s);
  assert.equal(s.dia, 2);
  assert.equal(s.fase, 'preparacion');
  assert.equal(s.jugadores[0].ingresos, 0);
});

test('cobrar: cada producto pasa por el escáner, el cliente paga con billete y hay que darle el cambio', () => {
  const s = newGame(3);
  for (const p of PRODUCT_IDS) { s.almacen[p] = 100; reponer(s, p); }
  empezarTurno(s);
  assert.equal(escanear(s), null, 'nadie en la caja');
  while (!clienteEnCaja(s)) tick(s, 0.1);
  const c = clienteEnCaja(s)!;
  const n = totalArticulos(c), total = importe(c), dinero = s.jugadores[0].dinero;
  assert.ok(n > 0);
  // Un producto que no lleva no se puede escanear.
  const ajeno = PRODUCT_IDS.find((p) => !c.cesta.some((l) => l.product === p))!;
  assert.equal(escanear(s, ajeno), null);
  assert.equal(darCambio(s, 0), null, 'no se cobra antes de escanear todo');
  for (let i = 1; i < n; i++) assert.ok('escaneado' in escanear(s)!);
  assert.ok(importeEscaneado(c) < total);
  const r = escanear(s)!;
  assert.ok('pagaCon' in r);
  assert.equal(importeEscaneado(c), total);
  assert.ok(c.pago >= total, 'paga con un billete que cubre el total');
  assert.equal(escanear(s), null, 'ya no quedan productos');
  assert.equal(s.jugadores[0].dinero, dinero, 'todavía no ha pagado');
  const debido = cambioDebido(c);
  if (debido > 0) {
    assert.deepEqual(darCambio(s, debido - 1), { ok: false, falta: 1 });
    assert.equal(clienteEnCaja(s), c, 'si falta cambio no se va');
  }
  assert.deepEqual(darCambio(s, debido), { ok: true, sobra: 0, propina: 0 });
  assert.equal(s.jugadores[0].dinero, dinero + total);
  assert.equal(s.jugadores[0].ingresos, total);
  assert.equal(c.estado, 'saliendo');
});

test('dar cambio de más cierra la venta pero se pierde lo que sobra', () => {
  const s = newGame(8);
  for (const p of PRODUCT_IDS) { s.almacen[p] = 100; reponer(s, p); }
  empezarTurno(s);
  while (!clienteEnCaja(s)) tick(s, 0.1);
  const c = clienteEnCaja(s)!;
  while (!c.pago) escanear(s);
  // Garantiza que haya margen para dar de más (y que pague en efectivo).
  c.tarjeta = false;
  c.pago = Math.max(c.pago, importe(c) + 5);
  const dinero = s.jugadores[0].dinero, total = importe(c);
  assert.equal(darCambio(s, c.pago + 1), null, 'no se puede devolver más de lo que entregó');
  assert.deepEqual(darCambio(s, cambioDebido(c) + 1), { ok: true, sobra: 1, propina: 0 });
  assert.equal(s.jugadores[0].dinero, dinero + total - 1);
  assert.equal(s.jugadores[0].cambioDeMas, 1);
});

test('el cliente paga con billetes reales', () => {
  for (let seed = 1; seed < 40; seed++) {
    const s = newGame(seed);
    for (const p of PRODUCT_IDS) { s.almacen[p] = 100; reponer(s, p); }
    empezarTurno(s);
    while (!clienteEnCaja(s)) tick(s, 0.1);
    const c = clienteEnCaja(s)!;
    while (!c.pago) escanear(s);
    assert.ok(c.pago === importe(c) || (BILLETES as readonly number[]).includes(c.pago) || c.pago % 1000 === 0, `paga con ${c.pago}`);
    assert.ok(c.pago >= importe(c));
  }
});

test('mientras se le atiende, el cliente de la caja no pierde la paciencia', () => {
  const s = newGame(6);
  for (const p of PRODUCT_IDS) { s.almacen[p] = 100; reponer(s, p); }
  empezarTurno(s);
  while (!clienteEnCaja(s)) tick(s, 0.1);
  const c = clienteEnCaja(s)!;
  escanear(s);
  const pac = c.paciencia;
  for (let i = 0; i < 300; i++) tick(s, 0.1);
  assert.equal(c.paciencia, pac);
  assert.equal(clienteEnCaja(s), c);
});

test('sin género en la estantería el cliente se queja y baja la reputación', () => {
  const s = newGame(5);
  for (const p of PRODUCT_IDS) s.estantes[p] = 0;
  empezarTurno(s);
  run(s, 70);
  assert.ok(s.stats.faltas > 0);
  assert.ok(s.reputacion < 50);
  assert.ok(s.eventos.some((e) => e.tipo === 'falta'));
  assert.equal(s.jugadores[0].ingresos, 0);
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
  assert.ok(s.stats.cansados > 0 && s.stats.cansados <= s.stats.clientes);
  assert.equal(s.jugadores[0].ingresos, 0);
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
      atender(s);
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
  s.dia = 6; s.jugadores[0].dinero = 321; s.reputacion = 70; s.almacen.pan = 40; s.estantes.pan = 11;
  const copia = importar(JSON.parse(JSON.stringify(exportar(s))))!;
  assert.equal(copia.dia, 6);
  assert.equal(copia.jugadores[0].dinero, 321);
  assert.equal(copia.reputacion, 70);
  assert.equal(copia.almacen.pan, 40);
  assert.equal(copia.estantes.pan, 11);
  assert.equal(copia.fase, 'preparacion');
  assert.equal(importar(null), null);
  assert.equal(importar({ ...exportar(s), dinero: -5 }), null);
  assert.equal(importar({ ...exportar(s), estantes: { ...s.estantes, pan: 999 } }), null);
  assert.equal(importar({ ...exportar(s), v: 9 }), null);
  // Partida de antes de los precios nuevos: el dinero se adapta.
  assert.equal(importar({ ...exportar(s), v: 1, dinero: 100 })!.jugadores[0].dinero, 2000);
});

test('nada cuesta 50 pesos o menos, todo es múltiplo de 5 y lo difícil de conseguir es lo más caro', () => {
  for (const p of PRODUCT_IDS) {
    assert.ok(PRODUCTS[p].precio > 50, `${p}: ${PRODUCTS[p].precio}`);
    assert.equal(PRODUCTS[p].precio % 5, 0, p);
  }
  const normales = PRODUCT_IDS.filter((p) => !esRara(p)).map((p) => PRODUCTS[p].precio);
  assert.ok(PRODUCTS.fresas.precio > Math.max(...normales) && PRODUCTS.uvas.precio > Math.max(...normales));
  assert.ok(esRara('fresas') && esRara('uvas') && !esRara('manzanas'));
});

test('lo difícil de conseguir: el proveedor tiene pocas cajas y algunos días ninguna', () => {
  const s = newGame(12);
  assert.ok(disponibles(s, 'fresas') >= 1, 'el primer día siempre hay');
  assert.equal(disponibles(s, 'leche'), Infinity);
  s.jugadores[0].dinero = 10000;
  const n = disponibles(s, 'fresas');
  assert.deepEqual(comprar(s, 'fresas', n + 1), { ok: false, motivo: 'agotado' });
  assert.deepEqual(comprarPedido(s, { fresas: n + 1, leche: 1 }), { ok: false, motivo: 'agotado' });
  assert.equal(s.almacen.leche, 6, 'el pedido no se compra a medias');
  assert.ok(comprar(s, 'fresas', n).ok);
  assert.equal(disponibles(s, 'fresas'), 0);
  // A lo largo de muchos días hay días sin nada y días con 1 o 2 cajas.
  const vistos = new Set<number>();
  for (let i = 0; i < 60; i++) { sortearOferta(s); vistos.add(disponibles(s, 'uvas')); }
  assert.deepEqual([...vistos].sort(), [0, 1, 2]);
});

test('si no hay fresas ni uvas, el cliente no se enfada', () => {
  const s = newGame(21);
  for (const p of PRODUCT_IDS) { s.almacen[p] = 300; reponer(s, p); }
  s.estantes.fresas = 0; s.estantes.uvas = 0; s.almacen.fresas = 0; s.almacen.uvas = 0;
  empezarTurno(s);
  run(s, SHIFT_SECONDS + 200, true);
  assert.equal(s.stats.faltas, 0);
  assert.ok(s.reputacion >= 50);
});

test('el cambio se da con monedas y billetes dominicanos', () => {
  assert.deepEqual([...CAMBIO], [5, 10, 25, 50, 100, 200, 500]);
  // Con precios múltiplos de 5, cualquier cambio se puede dar con lo que hay en el cajón.
  for (const p of PRODUCT_IDS) assert.equal(PRODUCTS[p].precio % Math.min(...CAMBIO), 0);
});

test('una partida guardada antes de las frutas nuevas se sigue cargando', () => {
  const s = newGame(4);
  const viejo = exportar(s) as unknown as Record<string, unknown>;
  const alm = { ...(viejo.almacen as Record<string, number>) }, est = { ...(viejo.estantes as Record<string, number>) };
  for (const k of ['guineos', 'fresas', 'uvas']) { delete alm[k]; delete est[k]; }
  delete viejo.ofertaRara;
  const c = importar({ ...viejo, almacen: alm, estantes: est })!;
  assert.ok(c);
  assert.equal(c.almacen.fresas, 0);
  assert.ok(disponibles(c, 'fresas') >= 0);
});

// ---------- Dos cajas y dos jugadores ----------

test('con la caja 2 abierta los clientes se reparten y cada caja cobra para su jugador', () => {
  const s = newGame(31);
  for (const p of PRODUCT_IDS) { s.almacen[p] = 500; reponer(s, p); }
  abrirCaja(s, 1, true);
  empezarTurno(s);
  const usadas = new Set<number>();
  for (let t = 0; t < SHIFT_SECONDS + 200 && s.fase === 'turno'; t += 0.1) {
    tick(s, 0.1);
    for (const p of PRODUCT_IDS) reponer(s, p);
    for (const k of [0, 1]) {
      let c;
      while ((c = clienteEnCaja(s, k))) { usadas.add(k); if (!c.pago) escanear(s, undefined, k); else darCambio(s, cambioDebido(c), k); }
    }
  }
  assert.deepEqual([...usadas].sort(), [0, 1], 'se usan las dos cajas');
  assert.ok(s.jugadores[0].ingresos > 0 && s.jugadores[1].ingresos > 0);
  assert.equal(s.jugadores[0].dinero, 1500 + s.jugadores[0].ingresos, 'cada uno con su dinero');
  assert.equal(s.jugadores[1].dinero, 1500 + s.jugadores[1].ingresos);
});

test('jugando solo la caja 2 está cerrada y nadie hace cola en ella', () => {
  const s = newGame(32);
  for (const p of PRODUCT_IDS) { s.almacen[p] = 500; reponer(s, p); }
  empezarTurno(s);
  for (let t = 0; t < 120; t += 0.1) { tick(s, 0.1); assert.equal(s.cajas[1].cola.length, 0); }
});

test('las compras de un jugador salen de su dinero y el otro recibe el aviso', () => {
  const s = newGame(33);
  const r = comprarPedido(s, { leche: 2 }, 1);
  assert.deepEqual(r, { ok: true, coste: 500 });
  assert.equal(s.jugadores[1].dinero, 1000);
  assert.equal(s.jugadores[0].dinero, 1500, 'el otro no paga');
  assert.equal(s.jugadores[1].gastos, 500);
  const ev = s.eventos.find((e) => e.tipo === 'compra');
  assert.deepEqual(ev, { tipo: 'compra', j: 1, coste: 500, lineas: [['leche', 2]] });
  assert.deepEqual(comprarPedido(s, { leche: 1 }, 5), { ok: false, motivo: 'cantidad' }, 'jugador inexistente');
});

test('un jugador puede mejorar la caja del otro: paga él y la mejora es para el otro', () => {
  const s = newGame(34);
  s.jugadores[0].dinero = 5000;
  assert.deepEqual(mejorar(s, 'musica', 1, 0), { ok: true, coste: 2000 });
  assert.equal(s.jugadores[0].dinero, 3000);
  assert.equal(s.cajas[1].musica, true);
  assert.equal(s.cajas[0].musica, false);
  assert.deepEqual(mejorar(s, 'musica', 1, 0), { ok: false, motivo: 'ya' });
  assert.deepEqual(mejorar(s, 'propinas', 0, 1), { ok: false, motivo: 'dinero' }, 'el jugador 2 solo tiene 1500');
  assert.deepEqual(mejorar(s, 'nada' as never, 0, 0), { ok: false, motivo: 'cantidad' });
  assert.ok(s.eventos.some((e) => e.tipo === 'mejora' && e.caja === 1 && e.j === 0));
});

test('música: más paciencia en la cola; propinas: 10 % más por cliente contento', () => {
  const s = newGame(35);
  for (const p of PRODUCT_IDS) { s.almacen[p] = 500; reponer(s, p); }
  s.cajas[0].musica = true; s.cajas[0].propinas = true;
  empezarTurno(s);
  while (!clienteEnCaja(s)) tick(s, 0.1);
  const c = clienteEnCaja(s)!;
  assert.ok(c.pacienciaMax > 38 * 1.4);
  while (!c.pago) escanear(s);
  const total = importe(c), dinero = s.jugadores[0].dinero;
  const r = darCambio(s, cambioDebido(c))!;
  assert.ok(r.ok);
  const propina = Math.round((total * 0.1) / 5) * 5;
  assert.deepEqual(r, { ok: true, sobra: 0, propina });
  assert.equal(s.jugadores[0].dinero, dinero + total + propina);
});

test('al cerrar la caja 2 su cola pasa a la caja 1', () => {
  const s = newGame(36);
  for (const p of PRODUCT_IDS) { s.almacen[p] = 500; reponer(s, p); }
  abrirCaja(s, 1, true);
  empezarTurno(s);
  while (s.cajas[1].cola.length < 1) tick(s, 0.1);
  const ids = [...s.cajas[1].cola];
  abrirCaja(s, 1, false);
  assert.equal(s.cajas[1].cola.length, 0);
  for (const id of ids) assert.ok(s.cajas[0].cola.includes(id));
  for (const id of ids) assert.equal(s.clientes.find((c) => c.id === id)!.caja, 0);
});

test('el guardado conserva el dinero de los dos jugadores y las mejoras', () => {
  const s = newGame(37);
  s.jugadores[1].dinero = 4321; s.cajas[1].propinas = true;
  const c = importar(JSON.parse(JSON.stringify(exportar(s))))!;
  assert.equal(c.jugadores[1].dinero, 4321);
  assert.equal(c.cajas[1].propinas, true);
  assert.equal(c.cajas[1].abierta, false, 'la caja 2 se abre al entrar el segundo jugador, no al cargar');
});

// ---------- Pago con tarjeta ----------

test('algunos clientes pagan con tarjeta: el importe justo y sin cambio', () => {
  let tarjetas = 0, efectivo = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = newGame(seed);
    for (const p of PRODUCT_IDS) { s.almacen[p] = 100; reponer(s, p); }
    empezarTurno(s);
    while (!clienteEnCaja(s)) tick(s, 0.1);
    const c = clienteEnCaja(s)!;
    while (!c.pago) escanear(s);
    const total = importe(c), dinero = s.jugadores[0].dinero;
    if (c.tarjeta) {
      tarjetas++;
      assert.equal(c.pago, total, 'con tarjeta se cobra el total exacto');
      assert.equal(cambioDebido(c), 0);
      assert.equal(darCambio(s, 5), null, 'con tarjeta no se da cambio');
      const r = cobrarTarjeta(s)!;
      assert.ok(r.ok);
      assert.equal(s.jugadores[0].dinero, dinero + total);
      assert.ok(s.eventos.some((e) => e.tipo === 'venta' && e.tarjeta));
    } else {
      efectivo++;
      assert.equal(cobrarTarjeta(s), null, 'si paga en efectivo no se cobra con tarjeta');
    }
  }
  assert.ok(tarjetas >= 12 && efectivo >= 20, `tarjeta ${tarjetas}, efectivo ${efectivo}`);
});
