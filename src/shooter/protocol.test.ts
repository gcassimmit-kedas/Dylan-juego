import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportsToKick, findFriendRooms, type SearchableRoom } from './protocol.ts';
import { nameKey } from './moderation.ts';

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

test('buscar a un amigo: solo en salas públicas y por su nombre exacto', () => {
  const room = (id: string, isPublic: boolean, names: string[]): SearchableRoom =>
    ({ info: { id, name: id, players: names.length, max: 8, wave: 3, main: false }, isPublic, playerKeys: names.map(nameKey) });
  const rooms = [room('principal', true, ['Halcón', 'Lince']), room('secreta', false, ['Halcón']), room('otra', true, ['Lobo', 'halcon'])];
  assert.deepEqual(findFriendRooms(rooms, nameKey('HALCON')).map((r) => r.id), ['principal', 'otra'], 'sin mayúsculas ni tildes; dos salas');
  assert.deepEqual(findFriendRooms(rooms, nameKey('  Lince ')).map((r) => r.id), ['principal']);
  assert.deepEqual(findFriendRooms(rooms, nameKey('Halc')), [], 'nada de coincidencias parciales');
  assert.equal(findFriendRooms(rooms, nameKey('Halcón')).some((r) => r.id === 'secreta'), false, 'las privadas nunca aparecen');
  assert.deepEqual(findFriendRooms(rooms, ''), []);
});
