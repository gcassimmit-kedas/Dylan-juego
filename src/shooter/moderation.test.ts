import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOffensive, checkName, cleanName } from './moderation.ts';

test('detecta palabras ofensivas aunque se disfracen', () => {
  for (const n of ['puta', 'PUTA', 'p.u.t.a', 'p u t a', 'puuuuta', 'pvta'.replace('v', 'u'), 'p3rr4', 'M1erd4', 'fuck', 'FuCk3r', 'hijo de puta', 'eres un imbecil', 'sh!t', 'c4bron', 'Nazi99'])
    assert.ok(isOffensive(n), n);
});

test('no bloquea nombres normales (falsos positivos)', () => {
  for (const n of ['Dylan', 'Papá', 'Conor', 'Pitón', 'Cálculo', 'Moreno', 'Computadora', 'Diputado', 'Escoger', 'Sexto', 'Conejo',
    'Cocodrilo', 'Halcón', 'Lobo Gris', 'Sargento 7', 'Ana-23', 'Pollito', 'Essex', 'Cockpit', 'Montañero', 'Tormenta', 'Águila'])
    assert.ok(!isOffensive(n), n);
});

test('limpia emojis, símbolos y longitud', () => {
  assert.equal(cleanName('  Lobo   Gris  '), 'Lobo Gris');
  assert.equal(cleanName('<b>Ana</b>'), 'bAnab');
  assert.equal(cleanName('Ñandú_99'), 'Ñandú_99');
  assert.equal(cleanName('x'.repeat(40)).length, 16);
  assert.equal(cleanName('Halcón\u{1F525}'), 'Halcón');
});

test('checkName: motivo claro para el jugador', () => {
  assert.deepEqual(checkName('Halcón'), { ok: true, name: 'Halcón' });
  const bad = checkName('m1erda');
  assert.ok(!bad.ok && bad.reason.includes('no está permitido'));
  const short = checkName('a', 'sala');
  assert.ok(!short.ok && short.reason.includes('sala'));
});
