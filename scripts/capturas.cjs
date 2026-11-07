// Capturas de pantalla para las fichas de App Store y Google Play, en los tamaños que piden.
// Uso:  npm run build && npm run server     (en otra terminal)
//       node scripts/capturas.cjs [http://localhost:8080]
// Salida en store/capturas/ (no se versiona: se vuelve a generar cuando cambia el juego).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:8080';
const OUT = path.join(__dirname, '..', 'store', 'capturas');
fs.mkdirSync(OUT, { recursive: true });

// Tamaños finales: iPhone 6,9" 1320x2868, iPad 13" 2064x2752, Android 1080x1920.
const DEVICES = [
  { id: 'iphone-6.9', viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { id: 'ipad-13', viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { id: 'android', viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];

const wait = (p, ms) => p.waitForTimeout(ms);

async function open(browser, dev) {
  const ctx = await browser.newContext({ ...dev, id: undefined });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('shooter.personaje', 'sargento'); localStorage.setItem('shooter.personaje2', 'coloso'); } catch { /* sin almacenamiento */ } });
  await p.goto(BASE + '/');
  await p.waitForSelector('#loading', { state: 'detached', timeout: 60000 });
  return p;
}

/** Dedo en el joystick derecho (táctil) apuntando hacia arriba: dispara. */
async function holdFire(p, dy = -1, dx = 0) {
  await p.evaluate(([dx, dy]) => {
    const c = document.getElementById('scene');
    const x = innerWidth * 0.75, y = innerHeight * 0.7;
    const ev = (type, cx, cy) => c.dispatchEvent(new PointerEvent(type, { pointerId: 77, pointerType: 'touch', clientX: cx, clientY: cy, bubbles: true }));
    ev('pointerdown', x, y);
    ev('pointermove', x + dx * 45, y + dy * 45);
  }, [dx, dy]);
}

/** Robots de exhibición alrededor del jugador (no se mueven para que la escena quede bonita). */
async function stage(p, extra) {
  await p.evaluate((extra) => {
    const w = window.__world();
    for (const q of w.players) { q.invuln = 999; q.owned = ['pistola', 'subfusil', 'fusil', 'escopeta', 'lanzallamas', 'cohetes']; q.weapon = 'fusil'; q.tools = { torreta: 2, mina: 3, escudo: 1, barricada: 1, aereo: 1, emp: 1, senuelo: 0 }; q.wood = 14; q.coins = 380; }
    const p0 = w.players[0];
    const base = { speed: 0, cooldown: 99, flash: 0, side: 0, sideT: 0, ax: 0, az: 0, stuckT: 0, stun: 0 };
    const add = (type, dx, dz, hp, r) => w.enemies.push({ ...base, id: 80000 + w.enemies.length, type, x: p0.x + dx, z: p0.z + dz, hp: hp * 0.7, maxHp: hp, r });
    add('chaser', -4, -6, 4, 0.6); add('chaser', 3.5, -5, 4, 0.6); add('kamikaze', -2.5, -3.5, 2, 0.55);
    add('dron', 4.5, -2.5, 3, 0.6); add('gunner', -5, -9, 6, 0.7); add('tank', 5, -10, 17, 1.05);
    if (extra.boss) { const b = w.enemies.find((e) => e.type === 'jefe'); if (b) { b.x = p0.x; b.z = p0.z - 8.5; b.speed = 0; b.cooldown = 0.2; b.hp = b.maxHp * 0.62; } }
    w.toSpawn = 0; w.spawnTimer = 999;
  }, extra);
}

async function shoot(browser, dev) {
  // 1. Título
  let p = await open(browser, dev);
  await wait(p, 1200);
  await p.screenshot({ path: path.join(OUT, `${dev.id}-1-titulo.png`) });

  // 2. Batalla contra el jefe
  await p.click('#play'); await p.click('#csGo');
  await p.waitForFunction(() => window.__world().wave >= 1, null, { timeout: 90000 });
  // 3. Tienda: monedas y madera antes de terminar la oleada, para que se vea lo que se puede comprar
  await p.evaluate(() => { const w = window.__world(); const q = w.players[0]; q.coins = 385; q.wood = 8; q.owned.push('subfusil'); w.wave = 4; w.enemies.length = 0; w.toSpawn = 0; });
  await p.waitForSelector('#shop:not([hidden])', { timeout: 60000 });
  await p.evaluate(() => { document.getElementById('shopBody').scrollTop = 0; });
  await wait(p, 900);
  await p.screenshot({ path: path.join(OUT, `${dev.id}-4-tienda.png`) });
  await p.click('#nextWave');
  await p.waitForFunction(() => window.__world().enemies.some((e) => e.type === 'jefe'), null, { timeout: 60000 });
  await stage(p, { boss: true });
  await holdFire(p);
  await wait(p, 2200);
  await p.screenshot({ path: path.join(OUT, `${dev.id}-2-jefe.png`) });
  await p.context().close();

  // 4. Elegir soldado
  p = await open(browser, dev);
  await p.click('#play');
  await p.waitForSelector('#charSelect:not([hidden])');
  await p.click('.cs-card[data-char="coloso"]');
  await wait(p, 900);
  await p.screenshot({ path: path.join(OUT, `${dev.id}-3-soldados.png`) });
  await p.context().close();

  // 5. Cooperativo (dos soldados con su nombre)
  p = await open(browser, dev);
  await p.click('#multiBtn'); await p.click('#localBtn'); await p.click('#csGo'); await p.click('#csGo');
  await p.waitForFunction(() => window.__mode() === 'local' && window.__world().wave >= 1, null, { timeout: 90000 });
  await p.evaluate(() => { const [a, b] = window.__world().players; b.x = a.x + 3.5; b.z = a.z + 0.5; });
  await stage(p, {});
  await holdFire(p, -1, -0.3);
  await p.keyboard.down('Enter');
  await wait(p, 2200);
  await p.screenshot({ path: path.join(OUT, `${dev.id}-5-cooperativo.png`) });
  await p.keyboard.up('Enter');
  await p.context().close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const dev of DEVICES) { await shoot(browser, dev); console.log('capturas', dev.id); }

  // Imagen destacada de Google Play (1024x500): la pantalla de título sin botones.
  const fp = await (await browser.newContext({ viewport: { width: 1024, height: 500 } })).newPage();
  await fp.goto(BASE + '/'); await fp.waitForSelector('#loading', { state: 'detached', timeout: 60000 });
  await fp.addStyleTag({ content: '#overlay .menu, #records, #help, .version { display: none !important; } .title { gap: 0 !important; }' });
  await wait(fp, 1200);
  await fp.screenshot({ path: path.join(OUT, 'google-play-destacada-1024x500.png') });

  // Icono de Google Play (512x512, sin transparencia): el mismo que genera scripts/recursos.cjs.
  fs.copyFileSync(path.join(__dirname, '..', 'public', 'icons', 'icon-512.png'), path.join(OUT, 'google-play-icono-512.png'));
  await browser.close();
  console.log('listo en', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
