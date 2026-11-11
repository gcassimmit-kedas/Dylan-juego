import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKINS, TONOS } from './models.ts';
import { SKIN_COUNT, TONO_COUNT } from './multi.ts';

test('hay 24 aspectos, todos con nombre distinto, y el multijugador acepta exactamente esos', () => {
  assert.equal(SKINS.length, 24);
  assert.equal(SKINS.length, SKIN_COUNT, 'si se añade un aspecto hay que subir SKIN_COUNT');
  assert.equal(TONOS.length, TONO_COUNT);
  assert.equal(new Set(SKINS.map((s) => s.nombre)).size, SKINS.length);
});
