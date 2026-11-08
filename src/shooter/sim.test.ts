import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, removePlayer, BOSS_EVERY, CHARACTERS, CHARACTER_ORDER, build, cannotBuild, woodReward, ARMOR_MAX, newWorld, step, spawnEnemy, waveSize, waveBonus, buy, cannotBuy, nextWave, useTool, selectWeapon, dronePos, type Input, type World } from './sim.ts';

const idle: Input = { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, fire: false };
const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
const run = (w: World, inp: Input, frames: number) => { for (let i = 0; i < frames; i++) step(w, inp, 1 / 60); };
/** Mundo vacío en plena oleada (sin spawns automáticos ni obstáculos). */
function arena(rand = seq([0.99])) {
  const w = newWorld(rand, false);
  w.wave = 1; w.toSpawn = 1; w.spawnTimer = 999; // queda 1 por salir: la oleada no termina sola
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
  assert.ok(w.player.x <= 3 - 1.5 - 0.6 + 1e-6, `x=${w.player.x}`);
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
  assert.equal(w.coins, 3 + waveBonus(1));
  assert.equal(w.phase, 'shop');
  const x = w.player.x;
  run(w, { ...idle, moveX: 1 }, 30);
  assert.equal(w.player.x, x, 'el juego se pausa en la tienda');
  nextWave(w);
  assert.equal(w.phase, 'fight');
  assert.equal(w.wave, 2);
  assert.equal(w.toSpawn, waveSize(2));
});

test('tienda: precio, máximo, monedas insuficientes y equipar', () => {
  const w = arena();
  assert.equal(cannotBuy(w, 'subfusil'), 'Faltan monedas');
  w.coins = 500;
  assert.ok(buy(w, 'subfusil'));
  assert.equal(w.coins, 440);
  assert.equal(w.player.weapon, 'subfusil');
  assert.equal(cannotBuy(w, 'subfusil'), 'Comprada');
  assert.ok(buy(w, 'botas') && buy(w, 'botas'));
  assert.equal(cannotBuy(w, 'botas'), 'Al máximo');
  assert.ok(buy(w, 'armadura'));
  assert.equal(w.player.maxHp, 6);
  selectWeapon(w, 'granadas');
  assert.equal(w.player.weapon, 'subfusil', 'no se equipa un arma que no tienes');
});

test('la escopeta dispara 6 perdigones', () => {
  const w = arena();
  w.player.owned.push('escopeta'); selectWeapon(w, 'escopeta');
  step(w, { ...idle, aimZ: 1, fire: true }, 1 / 60);
  assert.equal(w.bullets.length, 6);
});

test('la granada daña en área a varios enemigos', () => {
  const w = arena();
  w.player.owned.push('granadas'); selectWeapon(w, 'granadas');
  const a = spawnEnemy(w, 'tank', 0, 8), b = spawnEnemy(w, 'tank', 1.8, 8.5), far = spawnEnemy(w, 'tank', 12, 8);
  for (const e of [a, b, far]) e.speed = 0;
  run(w, { ...idle, aimZ: 1, fire: true }, 30);
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp, 'ambos cercanos dañados');
  assert.equal(far.hp, far.maxHp, 'el lejano no');
});

test('la torreta dispara sola a enemigos cercanos', () => {
  const w = arena();
  w.player.tools.torreta = 1;
  assert.ok(useTool(w, 'torreta'));
  assert.equal(w.player.tools.torreta, 0);
  const e = spawnEnemy(w, 'tank', 6, 0); e.speed = 0;
  run(w, idle, 60);
  assert.ok(e.hp < e.maxHp);
});

test('el contacto quita vida con invulnerabilidad temporal y termina la partida', () => {
  const w = arena();
  spawnEnemy(w, 'tank', 0.5, 0);
  step(w, idle, 1 / 60);
  assert.equal(w.player.hp, 4);
  step(w, idle, 1 / 60);
  assert.equal(w.player.hp, 4);
  w.player.hp = 1; w.player.invuln = 0;
  w.enemies[0].x = w.player.x; w.enemies[0].z = w.player.z + 0.5;
  step(w, idle, 1 / 60);
  assert.ok(w.over);
});

test('los enemigos rodean un muro en vez de quedarse atascados', () => {
  const w = arena(seq([0.5]));
  for (let k = -2; k <= 2; k++) w.obstacles.push({ id: 200 + k, kind: 'sandbag', x: k * 1.4, z: 6, r: 0.75, hp: Infinity, rot: 0 });
  const e = spawnEnemy(w, 'chaser', 0.3, 12);
  w.player.invuln = 999;
  let reached = false;
  for (let i = 0; i < 600 && !reached; i++) { step(w, idle, 1 / 60); reached = Math.hypot(e.x - w.player.x, e.z - w.player.z) < 2; }
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
      w.player.invuln = 1; // el bot no muere: probamos el flujo, no su habilidad
      if (w.phase === 'shop') { for (const id of ['subfusil', 'escopeta', 'municion'] as const) buy(w, id); nextWave(w); continue; }
      const p = w.player;
      let tx = 0, tz = 0, bd = Infinity;
      for (const e of w.enemies) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; tx = e.x - p.x; tz = e.z - p.z; } }
      step(w, { moveX: bd < Infinity ? tx / bd : 0, moveZ: bd < Infinity ? tz / bd : 0, aimX: tx, aimZ: tz, fire: bd < 25 }, 1 / 60);
    }
    assert.ok(w.wave >= 7, `semilla ${seed}: se quedó en oleada ${w.wave} con ${w.enemies.length} enemigos`);
  }
});

test('el francotirador atraviesa varios enemigos en fila', () => {
  const w = arena();
  w.player.owned.push('francotirador'); selectWeapon(w, 'francotirador');
  const es = [5, 7, 9].map((z) => { const e = spawnEnemy(w, 'tank', 0, z); e.speed = 0; return e; });
  run(w, { ...idle, aimZ: 1, fire: true }, 12);
  assert.ok(es.every((e) => e.hp < e.maxHp), 'los tres reciben daño');
});

test('el lanzallamas tiene corto alcance', () => {
  const w = arena();
  w.player.owned.push('lanzallamas'); selectWeapon(w, 'lanzallamas');
  const near = spawnEnemy(w, 'tank', 0, 3), far = spawnEnemy(w, 'tank', 0, 12);
  near.speed = far.speed = 0;
  run(w, { ...idle, aimZ: 1, fire: true }, 60);
  assert.ok(near.hp < near.maxHp);
  assert.equal(far.hp, far.maxHp);
});

test('la mina explota cuando pasa un robot', () => {
  const w = arena();
  w.player.tools.mina = 1;
  w.player.x = -10;
  assert.ok(useTool(w, 'mina'));
  w.player.z = 12; // el jugador se aleja; la mina queda en (-10, 0)
  run(w, idle, 70); // se arma tras 1 s
  const e = spawnEnemy(w, 'chaser', -10, -4); // viene hacia el jugador pasando por la mina
  run(w, idle, 60);
  assert.equal(w.mines.length, 0, 'la mina se gasta');
  assert.ok(!w.enemies.includes(e), 'el robot muere');
});

test('el escudo evita el daño', () => {
  const w = arena();
  w.player.tools.escudo = 1;
  useTool(w, 'escudo');
  spawnEnemy(w, 'tank', 0.5, 0);
  run(w, idle, 60);
  assert.equal(w.player.hp, 5);
});

test('la barricada para balas enemigas, deja pasar las tuyas y se rompe', () => {
  const w = arena();
  w.player.tools.barricada = 1;
  w.player.angle = 0; // mirando a +z
  useTool(w, 'barricada');
  const bars = w.obstacles.filter((o) => o.kind === 'barricade');
  assert.equal(bars.length, 3);
  // Balas enemigas que vienen de frente
  const volley = (n: number) => {
    for (let i = 0; i < n; i++) {
      w.bullets.push({ id: w.nextId++, kind: 'enemiga', x: 0, z: 10, vx: 0, vz: -13, life: 2, maxLife: 2, enemy: true, dmg: 1, blast: 0, pierce: 0, hits: [] });
      run(w, idle, 4);
    }
    run(w, idle, 60);
  };
  volley(10);
  assert.equal(w.player.hp, 5, 'la barricada te cubre');
  const t = spawnEnemy(w, 'tank', 0, 6); t.speed = 0;
  run(w, { ...idle, aimZ: 1, fire: true }, 20);
  assert.ok(t.hp < t.maxHp, 'tus balas pasan');
  t.hp = 0; w.enemies = [];
  volley(12); // 22 impactos > 18 de aguante
  assert.equal(w.obstacles.filter((o) => o.kind === 'barricade').length, 2, 'el saco del centro se rompe');
});

test('el imán atrae los recogibles', () => {
  const w = arena();
  w.player.magnet = 1;
  w.pickups.push({ id: 500, type: 'coins', x: 7, z: 0, life: 10 });
  run(w, idle, 60);
  assert.equal(w.coins, 15);
});

test('el dron dispara a enemigos cercanos', () => {
  const w = arena();
  w.player.drones = 1;
  const [x, z] = dronePos(w, 0);
  assert.ok(Math.hypot(x, z) > 1.5);
  const e = spawnEnemy(w, 'tank', 6, 6); e.speed = 0;
  run(w, idle, 90);
  assert.ok(e.hp < e.maxHp);
});

test('la regeneración cura con el tiempo', () => {
  const w = arena();
  w.player.regen = 1; w.player.hp = 3;
  run(w, idle, 60 * 16);
  assert.equal(w.player.hp, 4);
});

test('todos los objetos de la tienda se pueden comprar', () => {
  const w = arena();
  w.coins = 99999; w.player.hp = 1;
  for (const id of ['subfusil', 'escopeta', 'lanzallamas', 'francotirador', 'granadas', 'cohetes', 'armadura', 'botas',
    'municion', 'iman', 'regeneracion', 'dron', 'torreta', 'mina', 'escudo', 'barricada'] as const) assert.ok(buy(w, id), id);
  assert.equal(w.player.owned.length, 7);
});

// ---------- Armadura, madera y base ----------

test('armadura al máximo: bloquea golpes al azar (30%) y sin ella siempre duele', () => {
  const hits = (armor: number) => {
    let blocked = 0;
    for (let i = 0; i < 400; i++) {
      let r = i * 7919 % 1000;
      const w = newWorld(() => ((r = (r * 16807 + 11) % 1000) / 1000), false);
      w.wave = 1; w.toSpawn = 1; w.spawnTimer = 999;
      w.player.armorLvl = armor; w.player.invuln = 0;
      w.bullets.push({ id: 1, kind: 'enemiga', x: w.player.x, z: w.player.z, vx: 0, vz: 0, life: 1, maxLife: 1, enemy: true, dmg: 1, blast: 0, pierce: 0, hits: [] });
      step(w, idle, 1 / 60);
      if (w.player.hp === 5) blocked++;
    }
    return blocked / 400;
  };
  assert.equal(hits(0), 0, 'sin armadura no bloquea nunca');
  assert.equal(hits(ARMOR_MAX - 1), 0, 'por debajo del máximo tampoco');
  const rate = hits(ARMOR_MAX);
  assert.ok(rate > 0.2 && rate < 0.4, `al máximo bloquea ~30% (salió ${rate})`);
});

test('se gana madera al superar una oleada', () => {
  const w = arena();
  w.toSpawn = 0;
  step(w, idle, 1 / 60);
  assert.equal(w.phase, 'shop');
  assert.equal(w.player.wood, woodReward(1));
});

test('construir: cuesta madera, se coloca delante y no se solapa', () => {
  const w = arena();
  assert.equal(cannotBuild(w, 'muro'), 'Falta madera');
  w.player.wood = 100; w.player.angle = 0;
  assert.ok(build(w, 'muro'));
  assert.equal(w.player.wood, 96);
  const walls = w.obstacles.filter((o) => o.kind === 'wall');
  assert.equal(walls.length, 3);
  assert.ok(walls.every((o) => o.z > 2), 'delante del jugador');
  assert.equal(cannotBuild(w, 'muro'), 'No hay sitio', 'no se construye encima de otro muro');
  w.phase = 'shop';
  w.player.angle = Math.PI;
  assert.ok(build(w, 'medico'), 'también entre oleadas');
});

test('los robots atacan y destruyen los muros; tus balas los atraviesan', () => {
  const w = arena();
  w.player.wood = 10; w.player.angle = 0;
  build(w, 'muro');
  const t = spawnEnemy(w, 'tank', 0, 12);
  w.player.invuln = 999;
  run(w, idle, 60 * 12);
  assert.ok(w.obstacles.filter((o) => o.kind === 'wall').length < 3, 'el tanque rompe algún tramo');
  const w2 = arena();
  w2.player.wood = 10; w2.player.angle = 0;
  build(w2, 'muro');
  const e = spawnEnemy(w2, 'tank', 0, 6); e.speed = 0;
  run(w2, { ...idle, aimZ: 1, fire: true }, 20);
  assert.ok(e.hp < e.maxHp, 'tus balas pasan por tu muro');
  void t;
});

test('pinchos: dañan y frenan a los robots', () => {
  const w = arena();
  w.player.wood = 10; w.player.angle = 0;
  build(w, 'pinchos');
  const trap = w.traps[0];
  const e = spawnEnemy(w, 'tank', trap.x, trap.z); e.speed = 0;
  run(w, idle, 60);
  assert.ok(e.hp < e.maxHp);
});

test('torre de guardia: dispara sola y desaparece si destruyen la estructura', () => {
  const w = arena();
  w.player.wood = 20; w.player.angle = 0;
  build(w, 'torre');
  assert.equal(w.turrets.length, 1);
  const e = spawnEnemy(w, 'tank', 8, 8); e.speed = 0;
  run(w, idle, 90);
  assert.ok(e.hp < e.maxHp);
  w.obstacles.find((o) => o.kind === 'tower')!.hp = 0;
  run(w, idle, 2);
  assert.equal(w.turrets.length, 0);
});

test('puesto médico: cura si estás cerca', () => {
  const w = arena();
  w.player.wood = 20; w.player.angle = 0; w.player.hp = 3;
  build(w, 'medico');
  run(w, idle, 60 * 6.5);
  assert.equal(w.player.hp, 4);
});

// ---------- Armas nuevas ----------

test('cañón Tesla: el rayo salta a robots cercanos', () => {
  const w = arena();
  w.player.owned.push('tesla'); selectWeapon(w, 'tesla');
  const es = [[0, 6], [2, 8], [-2, 9]].map(([x, z]) => { const e = spawnEnemy(w, 'tank', x, z); e.speed = 0; return e; });
  run(w, { ...idle, aimZ: 1, fire: true }, 10);
  assert.ok(es.every((e) => e.hp < e.maxHp), 'los tres reciben daño');
});

test('ametralladora: dispara muy rápido pero frena al jugador', () => {
  const a = arena(), b = arena();
  a.player.owned.push('ametralladora'); selectWeapon(a, 'ametralladora');
  run(a, { ...idle, moveX: 1, aimZ: -1, fire: true }, 60);
  run(b, { ...idle, moveX: 1, aimZ: -1, fire: true }, 60);
  assert.ok(a.player.x < b.player.x * 0.75, 'se mueve más despacio');
});

test('fusil de asalto: se puede comprar y equipar', () => {
  const w = arena();
  w.coins = 500;
  assert.ok(buy(w, 'fusil'));
  assert.equal(w.player.weapon, 'fusil');
});

// ---------- Equipo nuevo ----------

test('ataque aéreo: bombardea en línea tras un aviso', () => {
  const w = arena();
  w.player.tools.aereo = 1; w.player.angle = 0;
  const e = spawnEnemy(w, 'tank', 0, 10); e.speed = 0;
  assert.ok(useTool(w, 'aereo'));
  run(w, idle, 30);
  assert.equal(e.hp, e.maxHp, 'aún no ha caído');
  run(w, idle, 90);
  assert.ok(e.hp < e.maxHp, 'tras el aviso, impacta');
});

test('pulso EMP: paraliza a los robots cercanos', () => {
  const w = arena();
  w.player.tools.emp = 1;
  const e = spawnEnemy(w, 'chaser', 0, 6);
  useTool(w, 'emp');
  const z = e.z;
  run(w, idle, 60);
  assert.equal(e.z, z, 'no se mueve durante el aturdimiento');
  run(w, idle, 150);
  assert.ok(e.z < z, 'después vuelve a moverse');
});

test('señuelo: los robots van a por él', () => {
  const w = arena();
  w.player.tools.senuelo = 1; w.player.angle = Math.PI / 2; // mira a +x
  useTool(w, 'senuelo');
  const dc = w.decoys[0];
  const e = spawnEnemy(w, 'chaser', dc.x + 8, dc.z + 3);
  w.player.x = -6;
  run(w, idle, 60);
  assert.ok(Math.hypot(e.x - dc.x, e.z - dc.z) < Math.hypot(e.x - w.player.x, e.z - w.player.z), 'se acerca al señuelo');
});

test('todas las armas y herramientas nuevas están en la tienda', () => {
  const w = arena();
  w.coins = 99999;
  for (const id of ['fusil', 'ametralladora', 'tesla', 'aereo', 'emp', 'senuelo'] as const) assert.ok(buy(w, id), id);
  assert.equal(w.player.owned.length, 4);
});

// ---------- Cooperativo en línea (varios jugadores en el mismo mundo) ----------

test('coop: cada jugador se mueve con su propia entrada y tiene su color', () => {
  const w = arena();
  const b = addPlayer(w, 'p2', 'Ana');
  w.players[0].input = { ...idle, moveX: 1 };
  b.input = { ...idle, moveX: -1 };
  const ax = w.players[0].x, bx = b.x;
  run(w, null as unknown as Input, 30);
  assert.ok(w.players[0].x > ax && b.x < bx);
  assert.notEqual(w.players[0].color, b.color);
});

test('coop: monedas, puntos y bajas para quien mata (también con trampas y torres)', () => {
  const w = arena();
  const b = addPlayer(w, 'p2', 'Ana');
  b.x = 10; b.z = 0;
  const e = spawnEnemy(w, 'chaser', 10, 6); e.speed = 0;
  b.input = { ...idle, aimZ: 1, fire: true };
  run(w, null as unknown as Input, 90);
  assert.ok(!w.enemies.includes(e));
  assert.equal(b.coins, 3); assert.equal(b.kills, 1);
  assert.equal(w.players[0].coins, 0, 'el otro jugador no cobra');
  b.input = { ...idle };
  b.wood = 10; b.angle = 0;
  assert.ok(build(w, 'pinchos', 'p2'));
  const trap = w.traps[0];
  assert.equal(trap.owner, 'p2');
  const e2 = spawnEnemy(w, 'chaser', trap.x, trap.z); e2.speed = 0; e2.hp = 0.5;
  run(w, null as unknown as Input, 20);
  assert.equal(b.kills, 2, 'la baja de los pinchos es para quien los construyó');
});

test('coop: los robots van a por el jugador vivo más cercano', () => {
  const w = arena();
  const b = addPlayer(w, 'p2', 'Ana');
  w.players[0].x = -15; w.players[0].z = 0; b.x = 15; b.z = 0; b.invuln = 0;
  const e = spawnEnemy(w, 'chaser', 10, 0);
  run(w, null as unknown as Input, 30);
  assert.ok(e.x > 10, 'va hacia Ana');
  b.hp = 1;
  run(w, null as unknown as Input, 90);
  assert.equal(b.alive, false);
  assert.equal(w.over, false, 'la partida sigue mientras quede alguien');
  const x = e.x;
  run(w, null as unknown as Input, 30);
  assert.ok(e.x < x, 'ahora va a por el otro jugador');
});

test('coop: los caídos vuelven en la siguiente oleada y la partida acaba si caen todos', () => {
  const w = arena();
  const b = addPlayer(w, 'p2', 'Ana');
  b.alive = false; b.hp = 0;
  w.toSpawn = 0; w.enemies = [];
  run(w, idle, 2);
  assert.equal(w.phase, 'shop');
  assert.ok(b.coins > 0 && b.wood === woodReward(1), 'monedas y madera también para los caídos');
  nextWave(w);
  assert.ok(b.alive && b.hp === b.maxHp);
  assert.equal(w.toSpawn, waveSize(2, 2), 'oleadas más grandes con más jugadores');
  for (const q of w.players) { q.hp = 1; q.invuln = 0; }
  const t1 = spawnEnemy(w, 'tank', w.players[0].x, w.players[0].z + 0.5); t1.speed = 0;
  const t2 = spawnEnemy(w, 'tank', b.x + 0.5, b.z); t2.speed = 0;
  run(w, idle, 5);
  assert.ok(w.over);
});

test('coop: tienda, equipo y construcción por jugador; el puesto médico cura a cualquiera', () => {
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
  b.wood = 20; b.angle = 0; b.x = 8; b.z = 0;
  assert.equal(cannotBuild(w, 'medico'), 'Falta madera', 'la madera es de cada uno');
  assert.ok(build(w, 'medico', 'p2'));
  const med = w.obstacles.find((o) => o.kind === 'medic')!;
  const a = w.players[0];
  a.x = med.x + 1.5; a.z = med.z; a.hp = 3;
  run(w, null as unknown as Input, 60 * 6.5);
  assert.equal(a.hp, 4, 'el puesto de Ana cura al otro jugador');
  removePlayer(w, 'p2');
  assert.equal(w.players.length, 1);
});

test('coop: la armadura bloquea golpes de cada jugador por separado', () => {
  let r = 12345;
  const w = newWorld(() => (r = (r * 16807) % 2147483647) / 2147483647, false);
  w.wave = 1; w.toSpawn = 1; w.spawnTimer = 999;
  const b = addPlayer(w, 'p2', 'Ana');
  b.armorLvl = ARMOR_MAX; b.x = 10;
  let blocked = 0;
  for (let i = 0; i < 300; i++) {
    b.invuln = 0; b.hp = 5; b.alive = true;
    w.bullets.push({ id: 10000 + i, kind: 'enemiga', x: b.x, z: b.z, vx: 0, vz: 0, life: 1, maxLife: 1, enemy: true, dmg: 1, blast: 0, pierce: 0, hits: [], owner: null });
    step(w, null as unknown as Input, 1 / 60);
    if (b.hp === 5) blocked++;
  }
  assert.ok(blocked / 300 > 0.18 && blocked / 300 < 0.42, `bloquea ~30% (${blocked / 300})`);
  assert.equal(w.players[0].hp, 5, 'el otro jugador no recibe nada');
});

test('kamikaze: explota al tocarte, te quita vida y no da monedas', () => {
  const w = newWorld(() => 0.5, false);
  w.wave = 3; w.toSpawn = 1; // queda otro: no se cobra el premio de oleada w.spawnTimer = 999;
  const p = w.players[0]; p.x = 0; p.z = 0;
  const e = spawnEnemy(w, 'kamikaze', 0, 1.2);
  step(w, null as unknown as Input, 1 / 60);
  assert.equal(w.enemies.includes(e), false, 'el kamikaze desaparece');
  assert.equal(p.hp, 4, 'quita 1 de vida');
  assert.equal(p.coins, 0, 'no da monedas');
});

test('kamikaze derribado revienta y daña a los robots de alrededor', () => {
  const w = newWorld(() => 0.5, false);
  w.wave = 3; w.toSpawn = 0; w.spawnTimer = 999;
  const p = w.players[0]; p.x = 0; p.z = 0; p.angle = 0;
  const k = spawnEnemy(w, 'kamikaze', 0, 8); k.speed = 0; k.hp = 0.5;
  const t = spawnEnemy(w, 'tank', 1.2, 8.6); t.speed = 0;
  const hp0 = t.hp;
  run(w, { moveX: 0, moveZ: 0, aimX: 0, aimZ: 1, fire: true }, 60);
  assert.equal(w.enemies.includes(k), false);
  assert.ok(t.hp < hp0, 'la explosión daña al tanque de al lado');
  assert.equal(p.hp, 5, 'al jugador lejos no le hace nada');
});

test('kamikaze revienta contra la base', () => {
  const w = newWorld(() => 0.5, false);
  w.wave = 3; w.toSpawn = 0; w.spawnTimer = 999;
  const p = w.players[0]; p.x = 0; p.z = 0; p.angle = 0; p.wood = 10;
  assert.ok(build(w, 'muro'));
  const walls = w.obstacles.filter((o) => o.kind === 'wall');
  const hp0 = walls.reduce((s, o) => s + o.hp, 0);
  spawnEnemy(w, 'kamikaze', walls[1].x, walls[1].z + 3);
  run(w, null as unknown as Input, 120);
  assert.equal(w.enemies.length, 0);
  assert.ok(walls.reduce((s, o) => s + Math.max(0, o.hp), 0) < hp0, 'el muro recibe daño');
  assert.equal(p.hp, 5, 'el muro protege al jugador');
});

test('dron: vuela por encima de los obstáculos', () => {
  const w = newWorld(() => 0.5, false);
  w.wave = 4; w.toSpawn = 0; w.spawnTimer = 999;
  const p = w.players[0]; p.x = 0; p.z = 0;
  w.obstacles.push({ id: 999, kind: 'rock', x: 0, z: 5, r: 1.6, hp: Infinity, rot: 0 });
  const d = spawnEnemy(w, 'dron', 0, 10);
  let passed = false;
  for (let i = 0; i < 120; i++) { step(w, null as unknown as Input, 1 / 60); if (Math.abs(d.x) < 0.3 && Math.abs(d.z - 5) < 0.5) passed = true; }
  assert.ok(passed, 'atraviesa la roca en línea recta');
});

test('jefe: aparece cada 5 oleadas, dispara en abanico y suelta botín', () => {
  const w = newWorld(() => 0.5, false);
  w.wave = BOSS_EVERY - 1;
  nextWave(w);
  const boss = w.enemies.find((e) => e.type === 'jefe');
  assert.ok(boss, 'hay jefe en la oleada 5');
  assert.ok(boss.hp >= 100);
  const w4 = newWorld(() => 0.5, false); w4.wave = 2; nextWave(w4);
  assert.equal(w4.enemies.some((e) => e.type === 'jefe'), false, 'en la 3 no');
  const p = w.players[0]; p.x = 0; p.z = 0; w.spawnTimer = 999; w.toSpawn = 1;
  boss.x = 0; boss.z = -12; boss.cooldown = 0; boss.speed = 0;
  step(w, null as unknown as Input, 1 / 60);
  assert.equal(w.bullets.filter((b) => b.enemy).length, 7, 'abanico de 7 balas');
  const coins0 = p.coins;
  boss.hp = 1;
  w.bullets.push({ id: 5000, kind: 'bala', x: boss.x, z: boss.z, vx: 0, vz: 0, life: 1, maxLife: 1, enemy: false, dmg: 5, blast: 0, pierce: 0, hits: [], owner: 'p1' });
  step(w, null as unknown as Input, 1 / 60);
  assert.equal(w.enemies.includes(boss), false);
  assert.equal(p.coins - coins0, 50, '50 monedas');
  assert.equal(w.pickups.length, 5, 'botín alrededor');
});

test('jefe: más vida con más jugadores', () => {
  const solo = newWorld(() => 0.5, false); solo.wave = 5;
  const duo = newWorld(() => 0.5, false, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]); duo.wave = 5;
  assert.ok(spawnEnemy(duo, 'jefe', 0, 0).hp > spawnEnemy(solo, 'jefe', 0, 0).hp);
});

const crew = () => newWorld(() => 0.5, false, CHARACTER_ORDER.map((c) => ({ id: c, name: c, character: c })));

test('personajes: cada uno empieza con su ventaja', () => {
  const w = crew();
  const by = (id: string) => w.players.find((p) => p.id === id)!;
  assert.equal(by('sargento').maxHp, 5);
  assert.equal(by('sargento').tools.escudo, 1, 'el sargento lleva un escudo');
  assert.equal(by('coloso').maxHp, 7);
  assert.equal(by('coloso').hp, 7);
  assert.equal(by('halcon').maxHp, 4);
  assert.equal(by('ingeniera').wood, 8);
  assert.equal(addPlayer(newWorld(() => 0.5, false), 'x', 'X', 'inventado' as never).character, 'sargento', 'un personaje desconocido no rompe nada');
});

test('personajes: velocidad distinta', () => {
  const dist = (c: keyof typeof CHARACTERS) => {
    const w = newWorld(() => 0.5, false, [{ id: 'a', name: 'A', character: c }]);
    w.spawnTimer = 999;
    const p = w.players[0];
    run(w, { moveX: 1, moveZ: 0, aimX: 0, aimZ: 0, fire: false }, 30);
    return p.x;
  };
  assert.ok(dist('halcon') > dist('sargento') * 1.15);
  assert.ok(dist('coloso') < dist('sargento') * 0.9);
});

test('personajes: la tiradora hace más daño y la ingeniera gana más madera', () => {
  const dmg = (c: keyof typeof CHARACTERS) => {
    const w = newWorld(() => 0.5, false, [{ id: 'a', name: 'A', character: c }]);
    w.spawnTimer = 999; w.toSpawn = 1;
    const t = spawnEnemy(w, 'tank', 0, 5); t.speed = 0;
    const hp0 = t.hp;
    w.players[0].angle = 0;
    run(w, { moveX: 0, moveZ: 0, aimX: 0, aimZ: 1, fire: true }, 20);
    return hp0 - t.hp;
  };
  assert.ok(Math.abs(dmg('tiradora') - dmg('sargento') * 1.25) < 1e-9);
  const w = crew();
  w.wave = 1; w.toSpawn = 0; w.spawnTimer = 999;
  const before = Object.fromEntries(w.players.map((p) => [p.id, p.wood]));
  step(w, null as unknown as Input, 1 / 60);
  const gain = (id: string) => w.players.find((p) => p.id === id)!.wood - before[id];
  assert.equal(gain('ingeniera'), gain('sargento') * 2);
});

test('al superar una oleada se recupera toda la vida', () => {
  const w = newWorld(() => 0.5, false, [{ id: 'a', name: 'A', character: 'coloso' }, { id: 'b', name: 'B' }]);
  w.wave = 2; w.toSpawn = 0; w.spawnTimer = 999;
  const [a, b] = w.players;
  a.hp = 1; b.hp = 0; b.alive = false;
  step(w, null as unknown as Input, 1 / 60);
  assert.equal(w.phase, 'shop');
  assert.equal(a.hp, a.maxHp, 'vida completa (7 del Coloso)');
  assert.equal(b.alive, false, 'el caído sigue fuera hasta la siguiente oleada');
  nextWave(w);
  assert.equal(b.hp, b.maxHp, 'y vuelve con la vida completa');
});
