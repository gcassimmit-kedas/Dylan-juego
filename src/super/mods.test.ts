import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinar, validarMod, codigoMod, leerMod, leerGuardado, efectoActivo, leerEfecto, empaquetarEfecto, INCLUIDOS, NEUTRO, EFECTOS, EFECTO_IDS } from './mods.ts';
import { newGame, empezarTurno, tick, reponer, comprar, costeCaja, importe, precioVenta, intervaloClientes, PRODUCT_IDS, PRODUCTS } from './sim.ts';

test('los mods incluidos son válidos y sus valores están dentro de rango', () => {
  const ids = new Set<string>();
  for (const m of INCLUIDOS) {
    assert.ok(!ids.has(m.id)); ids.add(m.id);
    assert.ok(m.nombre && m.desc);
    for (const [k, v] of Object.entries(m.efectos)) assert.ok(v >= EFECTOS[k as keyof typeof EFECTOS].min && v <= EFECTOS[k as keyof typeof EFECTOS].max, `${m.id}.${k}`);
  }
});

test('combinar: los multiplicadores se multiplican, los regalos se suman y todo se recorta', () => {
  const e = combinar([{ id: 'a', nombre: 'a', desc: '', efectos: { precio: 2, bono: 3000, clientes: 2 } }, { id: 'b', nombre: 'b', desc: '', efectos: { precio: 2, bono: 3000, clientes: 0.5 } }]);
  assert.equal(e.precio, 3);
  assert.equal(e.bono, 5000);
  assert.equal(e.clientes, 1);
  assert.deepEqual(combinar([]), NEUTRO);
});

test('un mod de fuera se valida: sin código, sin valores raros y con textos limpios', () => {
  assert.equal(validarMod(null), null);
  assert.equal(validarMod({ nombre: 'Nada', efectos: {} }), null, 'sin efectos no sirve');
  assert.equal(validarMod({ nombre: '', efectos: { precio: 2 } }), null, 'sin nombre no sirve');
  const m = validarMod({ nombre: '  Mi\n‮mod  ', desc: 'x'.repeat(500), efectos: { precio: 99, ladrones: -5, clientes: 'mucho', velocidad: NaN, script: 'alert(1)', bono: 1e9 } })!;
  assert.equal(m.nombre, 'Mi mod');
  assert.equal(m.desc.length, 120);
  assert.deepEqual(m.efectos, { precio: 3, ladrones: 0, bono: 5000 });
  assert.ok(!('script' in m.efectos));
});

test('el código MOD1 lleva el mod a otra copia del juego y detecta cambios', () => {
  const m = validarMod({ nombre: 'Súper ñandú', desc: 'Con tildes', efectos: { precio: 1.5, coste: 0.5 } })!;
  const c = codigoMod(m);
  assert.ok(c.startsWith('MOD1-'));
  const r = leerMod(c);
  assert.ok(r.ok);
  assert.deepEqual(r.mod, m);
  assert.deepEqual(leerMod(c.slice(0, -2) + 'zz'), { ok: false, motivo: 'incompleto' });
  assert.deepEqual(leerMod('hola'), { ok: false, motivo: 'formato' });
  const j = leerMod(JSON.stringify({ nombre: 'Archivo', efectos: { clientes: 2 } }));
  assert.ok(j.ok && j.mod.efectos.clientes === 2, 'también vale el contenido de un archivo .json');
});

test('lo guardado se valida y solo cuentan los mods activos que existen', () => {
  const propio = validarMod({ nombre: 'Propio', efectos: { velocidad: 2 } })!;
  const g = leerGuardado({ activos: ['turbo', 'noexiste', propio.id, 'turbo', 5], propios: [propio, { nombre: 'roto' }] });
  assert.deepEqual(g.activos, ['turbo', propio.id]);
  assert.equal(g.propios.length, 1);
  assert.equal(efectoActivo(g).velocidad, 2, '1,6 x 2 se recorta a 2');
  assert.deepEqual(leerGuardado('basura'), { activos: [], propios: [] });
});

test('el efecto que manda el anfitrión se recorta a rango', () => {
  const e = leerEfecto([100, -1, 2, 'x', 0.5]);
  assert.equal(e.precio, 3); assert.equal(e.coste, 0.25); assert.equal(e.clientes, 2); assert.equal(e.paciencia, 1); assert.equal(e.ladrones, 0.5);
  assert.deepEqual(leerEfecto(empaquetarEfecto(combinar(INCLUIDOS.slice(0, 2)))), combinar(INCLUIDOS.slice(0, 2)));
  assert.equal(EFECTO_IDS.length, empaquetarEfecto(NEUTRO).length);
});

test('en la simulación: precios, costes, clientes, ladrones y regalo diario', () => {
  const s = newGame(3);
  s.mods = combinar([{ id: 'x', nombre: 'x', desc: '', efectos: { precio: 2, coste: 0.5, clientes: 2, ladrones: 0, bono: 1000 } }]);
  assert.equal(costeCaja('leche', 'ordenador', s.mods.coste), Math.round(PRODUCTS.leche.costoCaja * 0.5 / 10) * 10);
  const d0 = s.jugadores[0].dinero;
  comprar(s, 'leche', 1);
  assert.equal(s.jugadores[0].dinero, d0 - costeCaja('leche', 'ordenador', 0.5));
  const base = newGame(3);
  assert.ok(Math.abs(intervaloClientes(s) * 2 - intervaloClientes(base)) < 1e-9);
  for (const p of PRODUCT_IDS) { s.almacen[p] = 300; reponer(s, p); }
  const antes = s.jugadores[0].dinero;
  empezarTurno(s);
  assert.equal(s.jugadores[0].dinero, antes + 1000);
  s.dia = 50;
  for (let t = 0; t < 120; t += 0.1) tick(s, 0.1);
  assert.ok(s.stats.clientes > 5);
  assert.equal(s.clientes.filter((c) => c.ladron).length + s.stats.robos, 0, 'con ladrones x0 no entra ninguno');
  const c = s.clientes.find((k) => k.cesta.length)!;
  assert.equal(importe(c), c.cesta.reduce((t, l) => t + l.qty * precioVenta(l.product, 2), 0));
  // Si se quitan los mods a mitad de turno, el que ya estaba dentro paga lo que vio.
  const antesImporte = importe(c);
  s.mods = { ...NEUTRO };
  assert.equal(importe(c), antesImporte);
  assert.equal(precioVenta('pan', 0.5), 60);
});
