import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listServers, SERVERS } from './multi.ts';

const peer = (presence: Record<string, unknown>, sameTab = false) => ({ sameTab, presence });

test('la lista de servidores siempre tiene los mismos servidores, aunque no haya nadie', () => {
  const l = listServers([]);
  assert.equal(l.length, SERVERS.length);
  assert.ok(l.every((s) => s.n === 0 && s.dia === null));
  assert.deepEqual(l.map((s) => s.nombre), ['Servidor 1', 'Servidor 2', 'Servidor 3', 'Servidor 4', 'Servidor 5', 'Servidor 6']);
});

test('cada servidor muestra cuántos hay dentro y en qué día van', () => {
  const l = listServers([
    peer({ host: { sala: 'servidor-2', dia: 4, n: 1 } }),
    peer({ host: { sala: 'servidor-5', dia: 9, n: 2 } }),
  ]);
  assert.deepEqual(l.find((s) => s.sala === 'servidor-2'), { sala: 'servidor-2', nombre: 'Servidor 2', n: 1, dia: 4 });
  assert.equal(l.find((s) => s.sala === 'servidor-5')!.n, 2);
  assert.equal(l.find((s) => s.sala === 'servidor-1')!.n, 0);
});

test('lo que anuncia otro jugador no puede inventar servidores ni datos raros', () => {
  const l = listServers([
    peer({ host: { sala: 'servidor-999', dia: 1, n: 1 } }),
    peer({ host: { sala: '<b>hola</b>', n: 2 } }),
    peer({ host: { sala: 'servidor-3', dia: 1e12, n: 7 } }),
    peer({ host: 'nada' }),
    peer({ host: { sala: 'servidor-4', dia: 2, n: 1 } }, true), // yo mismo no cuento
  ]);
  assert.equal(l.length, SERVERS.length);
  const s3 = l.find((s) => s.sala === 'servidor-3')!;
  assert.equal(s3.n, 1);
  assert.equal(s3.dia, 9999);
  assert.equal(l.find((s) => s.sala === 'servidor-4')!.n, 0);
});

test('el aspecto que manda el otro jugador solo puede ser uno de los que existen', async () => {
  const { readSkin, SKIN_COUNT, TONO_COUNT } = await import('./multi.ts');
  assert.deepEqual(readSkin([2, 3]), [2, 3]);
  assert.deepEqual(readSkin([SKIN_COUNT, 0]), [0, 0], 'skin inexistente');
  assert.deepEqual(readSkin([1, TONO_COUNT]), [1, 0], 'tono inexistente');
  assert.deepEqual(readSkin([1.5, -1]), [0, 0]);
  assert.deepEqual(readSkin('chef'), [0, 0]);
  assert.deepEqual(readSkin(null), [0, 0]);
});

test('un servidor abierto desde otro dispositivo de la misma cuenta también sale en la lista', () => {
  // La plataforma marca isMe en todas las pestañas de la misma cuenta; solo esta pestaña es sameTab.
  const l = listServers([{ isMe: true, sameTab: false, presence: { host: { sala: 'servidor-1', dia: 1, n: 1 } } }]);
  assert.equal(l.find((s) => s.sala === 'servidor-1')!.n, 1);
});
