import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, removePlayer, newWorld, step, spawnEnemy, waveSize, waveBonus, buy, cannotBuy, nextWave, useTool, selectWeapon, dronePos, type Input, type World } from './sim.ts';

const idle: Input = { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, fire: false };
const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
const run = (w: World, inp: Input, frames: number) => { for (let i = 0; i < frames; i++) step(w, inp, 1 / 60); };
/** Mundo vacío en plena oleada (sin spawns automáticos ni obstáculos). */
function arena(rand = seq([0.99])) {
  const w = newWorld(rand, false);
  w.wave = 1; w.toSpawn = 1; w.spawnTimer = 999; // queda 1 por salir: la oleada no termina sola
  w.players[0].invuln = 0; // sin la protección de aparición
  return w;
}

test('el campo genera obstáculos lejos del punto de inicio', () => {
  const w = newWorld();
  assert.ok(w.obstacles.length > 30);
  assert.ok(w.obstacles.every((o) => Math.hypot(o.x, o.z) > 6));
  for (const k of ['rock', 'tree', 'crate', 'sandbag']) assert.ok(w.obstacles.some((o) => o.kind === k), k);
});

test('arranca la primera oleada tras el respiro inicial', () => {
  const w = newWorld(seq([0.5]), false);
  run(w, idle, 100);
  assert.equal(w.wave, 1);
  assert.ok(w.toSpawn < waveSize(1) + 1);
});

test('el jugador no atraviesa una roca', () => {
  const w = arena();
  w.obstacles.push({ id: 99, kind: 'rock', x: 3, z: 0, r: 1.5, hp: Infinity, rot: 0 });
  run(w, { ...idle, moveX: 1 }, 120);
  assert.ok(w.players[0].x <= 3 - 1.5 - 0.6 + 1e-6, `x=${w.players[0].x}`);
});

test('las balas se detienen en la cobertura y rompen cajas', () => {
  const w = arena();
  w.obstacles.push({ id: 98, kind: 'crate', x: 0, z: 5, r: 0.65, hp: 4, rot: 0 });
  const e = spawnEnemy(w, 'chaser', 0, 9); e.speed = 0;
  run(w, { ...idle, aimZ: 1, fire: true }, 25);
  assert.equal(e.hp, e.maxHp, 'la caja protege al enemigo');
  run(w, { ...idle, aimZ: 1, fire: true }, 60);
  assert.ok(!w.obstacles.some((o) => o.id === 98), 'la caja se rompe');
  assert.ok(w.pickups.length > 0, 'suelta un recogible');
});

test('matar da puntos y monedas; limpiar la oleada abre la tienda con bonus', () => {
  const w = arena();
  w.toSpawn = 0;
  const e = spawnEnemy(w, 'chaser', 0, 6); e.speed = 0;
  run(w, { ...idle, aimZ: 1, fire: true }, 90);
  assert.equal(w.enemies.length, 0);
  assert.ok(w.score > 0);
  assert.equal(w.players[0].coins, 3 + waveBonus(1));
  assert.equal(w.phase, 'shop');
  const x = w.players[0].x;
  run(w, { ...idle, moveX: 1 }, 30);
  assert.equal(w.players[0].x, x, 'el juego se pausa en la tienda');
  nextWave(w);
  assert.equal(w.phase, 'fight');
  assert.equal(w.wave, 2);
  assert.equal(w.toSpawn, waveSize(2, 1));
});

test('tienda: precio, máximo, monedas insuficientes y equipar', () => {
  const w = arena();
  assert.equal(cannotBuy(w, 'subfusil'), 'Faltan monedas');
  w.players[0].coins = 500;
  assert.ok(buy(w, 'subfusil'));
  assert.equal(w.players[0].coins, 440);
  assert.equal(w.players[0].weapon, 'subfusil');
  assert.equal(cannotBuy(w, 'subfusil'), 'Comprada');
  assert.ok(buy(w, 'botas') && buy(w, 'botas'));
  assert.equal(cannotBuy(w, 'botas'), 'Al máximo');
  assert.equal(cannotBuy(w, 'botiquin'), 'Vida llena');
  assert.ok(buy(w, 'armadura'));
  assert.equal(w.players[0].maxHp, 6);
  selectWeapon(w, 'granadas');
  assert.equal(w.players[0].weapon, 'subfusil', 'no se equipa un arma que no tienes');
});

test('la escopeta dispara 6 perdigones', () => {
  const w = arena();
  w.players[0].owned.push('escopeta'); selectWeapon(w, 'escopeta');
  step(w, { ...idle, aimZ: 1, fire: true }, 1 / 60);
  assert.equal(w.bullets.length, 6);
});

test('la granada daña en área a varios enemigos', () => {
  const w = arena();
  w.players[0].owned.push('granadas'); selectWeapon(w, 'granadas');
  const a = spawnEnemy(w, 'tank', 0, 8), b = spawnEnemy(w, 'tank', 1.8, 8.5), far = spawnEnemy(w, 'tank', 12, 8);
  for (const e of [a, b, far]) e.speed = 0;
  run(w, { ...idle, aimZ: 1, fire: true }, 30);
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp, 'ambos cercanos dañados');
  assert.equal(far.hp, far.maxHp, 'el lejano no');
});

test('la torreta dispara sola a enemigos cercanos', () => {
  const w = arena();
  w.players[0].tools.torreta = 1;
  assert.ok(useTool(w, 'torreta'));
  assert.equal(w.players[0].tools.torreta, 0);
  const e = spawnEnemy(w, 'tank', 6, 0); e.speed = 0;
  run(w, idle, 60);
  assert.ok(e.hp < e.maxHp);
});

test('el contacto quita vida con invulnerabilidad temporal y termina la partida', () => {
  const w = arena();
  spawnEnemy(w, 'tank', 0.5, 0);
  step(w, idle, 1 / 60);
  assert.equal(w.players[0].hp, 4);
  step(w, idle, 1 / 60);
  assert.equal(w.players[0].hp, 4);
  w.players[0].hp = 1; w.players[0].invuln = 0;
  w.enemies[0].x = w.players[0].x; w.enemies[0].z = w.players[0].z + 0.5;
  step(w, idle, 1 / 60);
  assert.ok(w.over);
});

test('los enemigos rodean un muro en vez de quedarse atascados', () => {
  const w = arena(seq([0.5]));
  for (let k = -2; k <= 2; k++) w.obstacles.push({ id: 200 + k, kind: 'sandbag', x: k * 1.4, z: 6, r: 0.75, hp: Infinity, rot: 0 });
  const e = spawnEnemy(w, 'chaser', 0.3, 12);
  w.players[0].invuln = 999;
  let reached = false;
  for (let i = 0; i < 600 && !reached; i++) { step(w, idle, 1 / 60); reached = Math.hypot(e.x - w.players[0].x, e.z - w.players[0].z) < 2; }
  assert.ok(reached, `atascado en ${e.x.toFixed(1)},${e.z.toFixed(1)}`);
});

test('un bot completa 6 oleadas en campos aleatorios (ningún enemigo queda atascado)', () => {
  for (let seed = 1; seed <= 5; seed++) {
    let s = seed;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const w = newWorld(rand);
    let t = 0;
    while (w.wave < 7 && t < 60 * 60 * 8) {
      t++;
      w.players[0].invuln = 1; // el bot no muere: probamos el flujo, no su habilidad
      if (w.phase === 'shop') { for (const id of ['subfusil', 'escopeta', 'municion'] as const) buy(w, id); nextWave(w); continue; }
      const p = w.players[0];
      let tx = 0, tz = 0, bd = Infinity;
      for (const e of w.enemies) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; tx = e.x - p.x; tz = e.z - p.z; } }
      step(w, { moveX: bd < Infinity ? tx / bd : 0, moveZ: bd < Infinity ? tz / bd : 0, aimX: tx, aimZ: tz, fire: bd < 25 }, 1 / 60);
    }
    assert.ok(w.wave >= 7, `semilla ${seed}: se quedó en oleada ${w.wave} con ${w.enemies.length} enemigos`);
  }
});

test('el francotirador atraviesa varios enemigos en fila', () => {
  const w = arena();
  w.players[0].owned.push('francotirador'); selectWeapon(w, 'francotirador');
  const es = [5, 7, 9].map((z) => { const e = spawnEnemy(w, 'tank', 0, z); e.speed = 0; return e; });
  run(w, { ...idle, aimZ: 1, fire: true }, 12);
  assert.ok(es.every((e) => e.hp < e.maxHp), 'los tres reciben daño');
});

test('el lanzallamas tiene corto alcance', () => {
  const w = arena();
  w.players[0].owned.push('lanzallamas'); selectWeapon(w, 'lanzallamas');
  const near = spawnEnemy(w, 'tank', 0, 3), far = spawnEnemy(w, 'tank', 0, 12);
  near.speed = far.speed = 0;
  run(w, { ...idle, aimZ: 1, fire: true }, 60);
  assert.ok(near.hp < near.maxHp);
  assert.equal(far.hp, far.maxHp);
});

test('la mina explota cuando pasa un robot', () => {
  const w = arena();
  w.players[0].tools.mina = 1;
  w.players[0].x = -10;
  assert.ok(useTool(w, 'mina'));
  w.players[0].z = 12; // el jugador se aleja; la mina queda en (-10, 0)
  run(w, idle, 70); // se arma tras 1 s
  const e = spawnEnemy(w, 'chaser', -10, -4); // viene hacia el jugador pasando por la mina
  run(w, idle, 60);
  assert.equal(w.mines.length, 0, 'la mina se gasta');
  assert.ok(!w.enemies.includes(e), 'el robot muere');
});

test('el escudo evita el daño', () => {
  const w = arena();
  w.players[0].tools.escudo = 1;
  useTool(w, 'escudo');
  spawnEnemy(w, 'tank', 0.5, 0);
  run(w, idle, 60);
  assert.equal(w.players[0].hp, 5);
});

test('la barricada para balas enemigas, deja pasar las tuyas y se rompe', () => {
  const w = arena();
  w.players[0].tools.barricada = 1;
  w.players[0].angle = 0; // mirando a +z
  useTool(w, 'barricada');
  const bars = w.obstacles.filter((o) => o.kind === 'barricade');
  assert.equal(bars.length, 3);
  // Balas enemigas que vienen de frente
  const volley = (n: number) => {
    for (let i = 0; i < n; i++) {
      w.bullets.push({ id: w.nextId++, kind: 'enemiga', x: 0, z: 10, vx: 0, vz: -13, life: 2, maxLife: 2, enemy: true, dmg: 1, blast: 0, pierce: 0, hits: [], owner: null });
      run(w, idle, 4);
    }
    run(w, idle, 60);
  };
  volley(10);
  assert.equal(w.players[0].hp, 5, 'la barricada te cubre');
  const t = spawnEnemy(w, 'tank', 0, 6); t.speed = 0;
  run(w, { ...idle, aimZ: 1, fire: true }, 20);
  assert.ok(t.hp < t.maxHp, 'tus balas pasan');
  t.hp = 0; w.enemies = [];
  volley(12); // 22 impactos > 18 de aguante
  assert.equal(w.obstacles.filter((o) => o.kind === 'barricade').length, 2, 'el saco del centro se rompe');
});

test('el imán atrae los recogibles', () => {
  const w = arena();
  w.players[0].magnet = 1;
  w.pickups.push({ id: 500, type: 'coins', x: 7, z: 0, life: 10 });
  run(w, idle, 60);
  assert.equal(w.players[0].coins, 15);
});

test('el dron dispara a enemigos cercanos', () => {
  const w = arena();
  w.players[0].drones = 1;
  const [x, z] = dronePos(w, 0);
  assert.ok(Math.hypot(x, z) > 1.5);
  const e = spawnEnemy(w, 'tank', 6, 6); e.speed = 0;
  run(w, idle, 90);
  assert.ok(e.hp < e.maxHp);
});

test('la regeneración cura con el tiempo', () => {
  const w = arena();
  w.players[0].regen = 1; w.players[0].hp = 3;
  run(w, idle, 60 * 16);
  assert.equal(w.players[0].hp, 4);
});

test('todos los objetos de la tienda se pueden comprar', () => {
  const w = arena();
  w.players[0].coins = 99999; w.players[0].hp = 1;
  for (const id of ['subfusil', 'escopeta', 'lanzallamas', 'francotirador', 'granadas', 'cohetes', 'botiquin', 'armadura', 'botas',
    'municion', 'iman', 'regeneracion', 'dron', 'torreta', 'mina', 'escudo', 'barricada'] as const) assert.ok(buy(w, id), id);
  assert.equal(w.players[0].owned.length, 7);
});

// ---------- Multijugador ----------

test('varios jugadores: cada uno se mueve con su propia entrada', () => {
  const w = arena();
  const b = addPlayer(w, 'p2', 'Ana');
  w.players[0].input = { ...idle, moveX: 1 };
  b.input = { ...idle, moveX: -1 };
  const ax = w.players[0].x, bx = b.x;
  run(w, null as unknown as Input, 30);
  assert.ok(w.players[0].x > ax && b.x < bx);
  assert.notEqual(w.players[0].color, b.color, 'colores distintos');
});

test('las monedas y los puntos van a quien mata', () => {
  const w = arena();
  const b = addPlayer(w, 'p2', 'Ana');
  b.x = 10; b.z = 0;
  const e = spawnEnemy(w, 'chaser', 10, 6); e.speed = 0;
  b.input = { ...idle, aimZ: 1, fire: true };
  run(w, null as unknown as Input, 90);
  assert.ok(!w.enemies.includes(e));
  assert.equal(b.coins, 3);
  assert.equal(w.players[0].coins, 0);
  assert.equal(b.kills, 1);
});

test('los robots persiguen al jugador vivo más cercano', () => {
  const w = arena();
  const b = addPlayer(w, 'p2', 'Ana');
  w.players[0].x = -15; b.x = 15; b.z = 0; w.players[0].z = 0;
  const e = spawnEnemy(w, 'chaser', 10, 0);
  run(w, null as unknown as Input, 30);
  assert.ok(e.x > 10, 'va hacia Ana');
  b.hp = 1; b.invuln = 0; b.alive = true;
  run(w, null as unknown as Input, 60); // Ana cae
  assert.equal(b.alive, false);
  assert.equal(w.over, false, 'la partida sigue mientras quede alguien');
  const x = e.x;
  run(w, null as unknown as Input, 30);
  assert.ok(e.x < x, 'ahora va a por el otro jugador');
});

test('los caídos vuelven en la siguiente oleada y la partida acaba si caen todos', () => {
  const w = arena();
  const b = addPlayer(w, 'p2', 'Ana');
  b.alive = false; b.hp = 0;
  w.toSpawn = 0; w.enemies = [];
  run(w, idle, 2);
  assert.equal(w.phase, 'shop');
  assert.ok(b.coins > 0, 'el bonus de oleada también es para los caídos');
  nextWave(w);
  assert.ok(b.alive && b.hp === b.maxHp);
  assert.equal(w.toSpawn, waveSize(2, 2), 'oleadas más grandes con más jugadores');
  for (const p of w.players) { p.hp = 1; p.invuln = 0; }
  const t = spawnEnemy(w, 'tank', w.players[0].x, w.players[0].z + 0.5); t.speed = 0;
  const t2 = spawnEnemy(w, 'tank', b.x + 0.5, b.z); t2.speed = 0;
  run(w, idle, 5);
  assert.ok(w.over);
});

test('tienda y equipo por jugador', () => {
  const w = arena();
  const b = addPlayer(w, 'p2', 'Ana');
  b.coins = 100;
  assert.ok(buy(w, 'subfusil', 'p2'));
  assert.equal(b.coins, 40);
  assert.deepEqual(w.players[0].owned, ['pistola']);
  assert.equal(cannotBuy(w, 'subfusil'), 'Faltan monedas', 'el primer jugador no tiene monedas');
  b.tools.torreta = 1;
  assert.ok(useTool(w, 'torreta', 'p2'));
  assert.equal(w.turrets[0].owner, 'p2');
  removePlayer(w, 'p2');
  assert.equal(w.players.length, 1);
});
