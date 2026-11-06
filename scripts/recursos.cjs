// Genera los iconos y pantallas de carga (PNG) a partir de los SVG de resources/.
// Uso: node scripts/recursos.cjs   (usa Playwright/Chromium para rasterizar)
// Después, con los proyectos nativos creados (npx cap add android / ios):  npx @capacitor/assets generate
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const svg = (f) => fs.readFileSync(path.join(ROOT, 'resources', f), 'utf8').replace('<svg ', '<svg width="100%" height="100%" ');
const emblem = svg('emblema.svg');
const bg = svg('fondo.svg');

function page(w, h, layers, bgColor) {
  const side = Math.min(w, h);
  const divs = layers.map(([s, scale]) => {
    const size = side * scale;
    return `<div style="position:absolute;left:${(w - size) / 2}px;top:${(h - size) / 2}px;width:${size}px;height:${size}px">${s}</div>`;
  }).join('');
  return `<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;background:${bgColor ?? 'transparent'};overflow:hidden;position:relative">${divs}</body></html>`;
}

const OUT = [
  // Fuentes para @capacitor/assets: Android e iOS generan todos sus tamaños a partir de estas.
  { file: 'resources/icon-only.png', w: 1024, h: 1024, layers: [[bg, 1], [emblem, 0.92]], bg: '#1b2312' }, // iOS: sin transparencia
  { file: 'resources/icon-foreground.png', w: 1024, h: 1024, layers: [[emblem, 0.62]], transparent: true }, // Android adaptativo: zona segura
  { file: 'resources/icon-background.png', w: 1024, h: 1024, layers: [[bg, 1]], bg: '#1b2312' },
  { file: 'resources/splash.png', w: 2732, h: 2732, layers: [[emblem, 0.26]], bg: '#1d2416' },
  { file: 'resources/splash-dark.png', w: 2732, h: 2732, layers: [[emblem, 0.26]], bg: '#1d2416' },
  // Web / instalación como aplicación web
  { file: 'public/icons/icon-192.png', w: 192, h: 192, layers: [[bg, 1], [emblem, 0.92]], bg: '#1b2312' },
  { file: 'public/icons/icon-512.png', w: 512, h: 512, layers: [[bg, 1], [emblem, 0.92]], bg: '#1b2312' },
  { file: 'public/icons/maskable-512.png', w: 512, h: 512, layers: [[bg, 1], [emblem, 0.66]], bg: '#1b2312' },
  { file: 'public/icons/apple-touch-icon.png', w: 180, h: 180, layers: [[bg, 1], [emblem, 0.92]], bg: '#1b2312' },
];

(async () => {
  const browser = await chromium.launch();
  for (const o of OUT) {
    const p = await browser.newPage({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: 1 });
    await p.setContent(page(o.w, o.h, o.layers, o.transparent ? null : o.bg));
    await p.screenshot({ path: path.join(ROOT, o.file), omitBackground: !!o.transparent });
    await p.close();
    console.log('ok', o.file, `${o.w}x${o.h}`);
  }
  await browser.close();
  fs.copyFileSync(path.join(ROOT, 'resources/emblema.svg'), path.join(ROOT, 'public/icons/emblema.svg'));
})();
