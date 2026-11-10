// Texturas del supermercado dibujadas por código en un <canvas>: no hay imágenes que descargar,
// todo va dentro de la app y funciona sin conexión.
import * as THREE from 'three';
import type { ProductId } from './sim.ts';

const DISPLAY = "'Oswald', 'Arial Narrow', sans-serif";
const BODY = "'Inter', system-ui, sans-serif";

/** Ruido determinista para que las texturas salgan siempre iguales. */
function rng(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

let maxAniso = 4;
export function setAnisotropy(n: number) { maxAniso = n; }

function tex(c: HTMLCanvasElement, repeat?: [number, number], color = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, colors: string[], size: [number, number], seed: number) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = size[0] + r() * (size[1] - size[0]);
    g.fillRect(r() * w, r() * h, s, s);
  }
}

/** Suelo de baldosas de terrazo de 50 cm con juntas. El lienzo cubre 2×2 m. */
export function floorTexture(): { map: THREE.Texture; rough: THREE.Texture } {
  const N = 4, S = 256, W = N * S;
  const [c, g] = canvas(W, W);
  const [rc, rg] = canvas(W, W);
  const r = rng(11);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const l = 214 + Math.floor(r() * 10);
    g.fillStyle = `rgb(${l},${l - 3},${l - 12})`;
    g.fillRect(x * S, y * S, S, S);
    rg.fillStyle = `rgb(${70 + Math.floor(r() * 30)},0,0)`;
    rg.fillRect(x * S, y * S, S, S);
  }
  speckle(g, W, W, 9000, ['#b9b2a2', '#9d9686', '#c9c1ae', '#efeadf', '#8f8a7d'], [1, 3.2], 3);
  speckle(g, W, W, 500, ['#a39b88', '#d8d0bf'], [3, 6], 5);
  // Juntas
  g.fillStyle = '#a7a194';
  rg.fillStyle = '#e0e0e0';
  for (let i = 0; i <= N; i++) {
    g.fillRect(i * S - 3, 0, 6, W); g.fillRect(0, i * S - 3, W, 6);
    rg.fillRect(i * S - 3, 0, 6, W); rg.fillRect(0, i * S - 3, W, 6);
  }
  return { map: tex(c, [10, 7.5]), rough: tex(rc, [10, 7.5], false) };
}

/**
 * Pared interior: azulejo blanco abajo, franja verde corporativa y pintura arriba.
 * El lienzo representa 2 m de ancho por 4 m de alto.
 */
export function wallTexture(): THREE.Texture {
  const [c, g] = canvas(512, 1024);
  g.fillStyle = '#efece3'; g.fillRect(0, 0, 512, 1024);
  speckle(g, 512, 1024, 4000, ['rgba(0,0,0,0.035)', 'rgba(255,255,255,0.05)'], [1, 3], 7);
  // Azulejo hasta 1,4 m
  const tileTop = 1024 - 1.4 * 256;
  g.fillStyle = '#f6f5f0'; g.fillRect(0, tileTop, 512, 1024 - tileTop);
  g.fillStyle = '#d3d0c6';
  for (let y = tileTop; y < 1024; y += 32) g.fillRect(0, y, 512, 2);
  for (let y = tileTop, row = 0; y < 1024; y += 32, row++) for (let x = row % 2 ? 32 : 0; x < 512; x += 64) g.fillRect(x, y, 2, 32);
  // Franja corporativa
  g.fillStyle = '#2f6b3a'; g.fillRect(0, tileTop - 46, 512, 40);
  g.fillStyle = '#ffc83d'; g.fillRect(0, tileTop - 6, 512, 6);
  // Zócalo
  g.fillStyle = '#5a5d55'; g.fillRect(0, 1000, 512, 24);
  return tex(c, [1, 1]);
}

/** Techo de placas acústicas de 60 cm. */
export function ceilingTexture(): THREE.Texture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#e4e2da'; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 1600, ['#cfccc2', '#d8d5cc'], [1, 2], 9);
  g.fillStyle = '#b8b5aa';
  g.fillRect(0, 0, 256, 4); g.fillRect(0, 0, 4, 256);
  return tex(c, [32, 25]);
}

/** Asfalto del aparcamiento con plazas pintadas. El lienzo cubre 10×10 m. */
export function asphaltTexture(): THREE.Texture {
  const [c, g] = canvas(1024, 1024);
  g.fillStyle = '#3b3d3f'; g.fillRect(0, 0, 1024, 1024);
  speckle(g, 1024, 1024, 26000, ['#2e3032', '#46494b', '#525557', '#35373a'], [1, 3], 13);
  g.fillStyle = 'rgba(240,238,228,0.85)';
  for (let x = 0; x < 1024; x += 256) g.fillRect(x, 420, 8, 400);
  return tex(c, [6, 3]);
}

/** Cartón de caja con cinta y logotipo del proveedor. */
export function cardboardTexture(label = 'SUPER'): THREE.Texture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#b98a55'; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 2500, ['#a87a47', '#c79a63', '#9c6f3e'], [1, 2.5], 17);
  g.fillStyle = 'rgba(80,50,20,0.18)';
  for (let y = 0; y < 256; y += 6) g.fillRect(0, y, 256, 1);
  g.fillStyle = 'rgba(214,190,140,0.85)'; g.fillRect(108, 0, 40, 256);
  g.fillStyle = '#5c3a1a'; g.font = `700 34px ${DISPLAY}`; g.textAlign = 'center';
  g.fillText(label, 128, 170);
  g.strokeStyle = '#5c3a1a'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(40, 200); g.lineTo(60, 220); g.lineTo(80, 200); g.stroke();
  return tex(c);
}

/** Madera clara para cajas de fruta y la panera. */
export function woodTexture(): THREE.Texture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#c69a62'; g.fillRect(0, 0, 256, 256);
  const r = rng(21);
  for (let y = 0; y < 256; y += 2) {
    g.fillStyle = `rgba(110,70,30,${0.05 + r() * 0.12})`;
    g.fillRect(0, y + Math.sin(y * 0.15) * 2, 256, 1 + r() * 1.5);
  }
  for (let i = 0; i < 5; i++) {
    g.fillStyle = 'rgba(90,55,20,0.35)';
    g.beginPath(); g.ellipse(r() * 256, r() * 256, 6, 3, 0, 0, Math.PI * 2); g.fill();
  }
  return tex(c);
}

/** Cinta transportadora de la caja (se desplaza al cobrar). */
export function beltTexture(): THREE.Texture {
  const [c, g] = canvas(64, 256);
  g.fillStyle = '#1c1d1f'; g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#2a2b2e';
  for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 64, 3);
  speckle(g, 64, 256, 300, ['#26272a', '#18191b'], [1, 2], 23);
  return tex(c, [1, 3]);
}

/** Cartel colgante de sección. */
export function signTexture(text: string, color = '#2f6b3a'): THREE.Texture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = color; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#ffc83d'; g.fillRect(0, 112, 512, 16);
  g.fillStyle = '#ffffff'; g.font = `700 64px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), 256, 60);
  return tex(c);
}

/** Pantalla del ordenador de pedidos (brilla en la escena). */
export function monitorTexture(): THREE.Texture {
  const [c, g] = canvas(320, 200);
  const grad = g.createLinearGradient(0, 0, 0, 200);
  grad.addColorStop(0, '#1f2a18'); grad.addColorStop(1, '#141a0f');
  g.fillStyle = grad; g.fillRect(0, 0, 320, 200);
  g.fillStyle = '#ffc83d'; g.fillRect(0, 0, 320, 26);
  g.fillStyle = '#241a00'; g.font = `700 16px ${DISPLAY}`; g.fillText('PEDIDOS', 10, 19);
  for (let i = 0; i < 5; i++) {
    g.fillStyle = 'rgba(244,241,228,0.12)'; g.fillRect(10, 38 + i * 30, 300, 24);
    g.fillStyle = ['#e9d9a6', '#e8f0ff', '#ffe36e', '#ff6b4a', '#7fc8ff'][i]; g.fillRect(16, 42 + i * 30, 16, 16);
    g.fillStyle = 'rgba(244,241,228,0.75)'; g.fillRect(40, 46 + i * 30, 120 - i * 10, 6);
    g.fillStyle = '#ffc83d'; g.fillRect(262, 42 + i * 30, 42, 16);
  }
  return tex(c);
}

/** Visor de la caja registradora. */
export function registerScreenTexture(total: number, items: number): THREE.CanvasTexture {
  const [c] = canvas(256, 96);
  const t = tex(c);
  drawRegister(t, total, items);
  return t;
}
export function drawRegister(t: THREE.CanvasTexture, total: number, items: number) {
  const c = t.image as HTMLCanvasElement, g = c.getContext('2d')!;
  g.fillStyle = '#0d1a10'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#7bd36b'; g.font = `600 20px ${DISPLAY}`; g.fillText(`ARTÍCULOS ${items}`, 14, 30);
  g.font = `700 44px ${DISPLAY}`; g.textAlign = 'right'; g.fillText(`$${total}`, 242, 80); g.textAlign = 'left';
  t.needsUpdate = true;
}

/** Cartel de la entrada, por dentro (encima de la puerta). */
export function storeSignTexture(): THREE.Texture {
  const [c, g] = canvas(1024, 192);
  g.fillStyle = '#1f2718'; g.fillRect(0, 0, 1024, 192);
  g.fillStyle = '#ffc83d'; g.font = `700 112px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('SUPERMERCADO', 512, 100);
  return tex(c);
}

// ---------- Envases ----------

/** Etiqueta frontal de cada producto (se usa en el envase 3D y en el catálogo del ordenador). */
export function labelCanvas(p: ProductId): HTMLCanvasElement {
  const [c, g] = canvas(256, 256);
  const title = (text: string, y: number, size: number, color: string) => {
    g.fillStyle = color; g.font = `700 ${size}px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, y);
  };
  const small = (text: string, y: number, color: string) => {
    g.fillStyle = color; g.font = `600 18px ${BODY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, y);
  };
  switch (p) {
    case 'cereales': {
      const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#ff8a1f'); grd.addColorStop(1, '#e0441b');
      g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
      title('CRUJIS', 48, 54, '#fff6d8');
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(128, 176, 84, 34, 0, 0, Math.PI); g.fill();
      g.fillStyle = '#3d6fd8'; g.beginPath(); g.ellipse(128, 168, 92, 20, 0, 0, Math.PI * 2); g.fill();
      const r = rng(31);
      for (let i = 0; i < 26; i++) { g.fillStyle = ['#ffd44a', '#f5b336', '#ffe58a'][i % 3]; g.beginPath(); g.arc(60 + r() * 136, 150 + r() * 22, 7 + r() * 4, 0, Math.PI * 2); g.fill(); }
      small('Copos de maíz', 228, '#fff6d8');
      break;
    }
    case 'galletas': {
      g.fillStyle = '#2a4ea3'; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#ffd34d'; g.fillRect(0, 196, 256, 60);
      title('GALLETAS', 54, 48, '#ffffff');
      for (const [x, y] of [[88, 134], [168, 134], [128, 150]]) {
        g.fillStyle = '#c98a3e'; g.beginPath(); g.arc(x, y, 34, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#4a2a12'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(x - 18 + (i % 3) * 18, y - 10 + Math.floor(i / 3) * 20, 4, 0, Math.PI * 2); g.fill(); }
      }
      small('Con chocolate', 226, '#2a4ea3');
      break;
    }
    case 'refresco': {
      g.fillStyle = '#d0202a'; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#ffffff'; g.lineWidth = 10; g.beginPath(); g.moveTo(0, 190); g.bezierCurveTo(80, 150, 170, 230, 256, 180); g.stroke();
      title('BURBU', 110, 74, '#ffffff');
      small('Refresco de cola', 226, '#ffe9e9');
      break;
    }
    case 'agua': {
      const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#e9f6ff'); grd.addColorStop(1, '#7fc8ff');
      g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#1f6fb8'; g.beginPath(); g.moveTo(40, 170); g.lineTo(100, 110); g.lineTo(140, 150); g.lineTo(170, 120); g.lineTo(220, 170); g.fill();
      title('MANANTIAL', 70, 48, '#1f6fb8');
      small('Agua mineral natural', 214, '#0f3e6d');
      break;
    }
    case 'leche': {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#2d6fd2'; g.fillRect(0, 150, 256, 106);
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, 150); g.bezierCurveTo(70, 120, 180, 180, 256, 140); g.lineTo(256, 150); g.lineTo(0, 160); g.fill();
      title('LECHE', 74, 72, '#2d6fd2');
      small('Entera · 1 litro', 206, '#ffffff');
      break;
    }
    case 'yogur': {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#e84a7f'; g.fillRect(0, 0, 256, 70); g.fillRect(0, 210, 256, 46);
      title('YOGUR', 128, 64, '#e84a7f');
      g.fillStyle = '#d6264f'; g.beginPath(); g.arc(200, 40, 18, 0, Math.PI * 2); g.fill();
      small('Fresa', 180, '#9b1d44');
      break;
    }
    case 'queso': {
      g.fillStyle = '#ffd24a'; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#7a3b12'; g.beginPath(); g.arc(128, 128, 96, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(128, 128, 86, 0, Math.PI * 2); g.fill();
      title('QUESO', 116, 54, '#7a3b12');
      small('Curado', 162, '#7a3b12');
      break;
    }
    case 'pan': {
      g.fillStyle = 'rgba(255,255,255,0.0)'; g.clearRect(0, 0, 256, 256);
      g.fillStyle = '#f2e7d0'; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#c0392b'; g.fillRect(0, 0, 256, 54); g.fillRect(0, 202, 256, 54);
      title('PAN DE MOLDE', 28, 34, '#ffffff');
      g.fillStyle = '#d9a35a'; g.beginPath(); g.roundRect(56, 80, 144, 104, 30); g.fill();
      g.fillStyle = '#f6dfb0'; g.beginPath(); g.roundRect(68, 92, 120, 84, 22); g.fill();
      small('Integral', 228, '#ffffff');
      break;
    }
    case 'manzanas': {
      g.fillStyle = '#3a8a3e'; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#d9262e'; g.beginPath(); g.arc(128, 140, 74, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(100, 110, 18, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5a3a1a'; g.fillRect(124, 52, 8, 30);
      g.fillStyle = '#7bd36b'; g.beginPath(); g.ellipse(150, 64, 22, 10, -0.5, 0, Math.PI * 2); g.fill();
      title('MANZANAS', 230, 36, '#ffffff');
      break;
    }
  }
  return c;
}

const labelCache = new Map<ProductId, THREE.Texture>();
export function labelTexture(p: ProductId): THREE.Texture {
  let t = labelCache.get(p);
  if (!t) { t = tex(labelCanvas(p)); labelCache.set(p, t); }
  return t;
}

/** Piel de manzana con vetas. */
export function appleTexture(): THREE.Texture {
  const [c, g] = canvas(128, 64);
  const grd = g.createLinearGradient(0, 0, 0, 64); grd.addColorStop(0, '#f2c14a'); grd.addColorStop(0.35, '#d22a2a'); grd.addColorStop(1, '#8e1414');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 64);
  const r = rng(41);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${120 + r() * 80},20,20,0.5)`; g.fillRect(r() * 128, r() * 64, 1, 6 + r() * 14); }
  speckle(g, 128, 64, 120, ['rgba(255,230,160,0.6)'], [1, 1.5], 43);
  return tex(c);
}

/** Corteza de queso. */
export function cheeseTexture(): THREE.Texture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#f0b52a'; g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 600, ['#e0a020', '#f7c94a', '#d99a1c'], [1, 3], 47);
  return tex(c);
}

/** Barra de existencias que flota sobre cada mueble. */
export function stockBadge(t: THREE.CanvasTexture | null, n: number, cap: number, name: string): THREE.CanvasTexture {
  if (!t) { const [c] = canvas(256, 80); t = tex(c); }
  const c = t.image as HTMLCanvasElement, g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 80);
  const low = n / cap <= 0.25;
  g.fillStyle = 'rgba(22,28,17,0.88)';
  g.beginPath(); g.moveTo(10, 0); g.lineTo(256, 0); g.lineTo(256, 70); g.lineTo(246, 80); g.lineTo(0, 80); g.lineTo(0, 10); g.fill();
  g.fillStyle = n === 0 ? '#e5484d' : '#f4f1e4'; g.font = `600 26px ${DISPLAY}`; g.textBaseline = 'middle';
  g.fillText(name.toUpperCase(), 14, 26);
  g.textAlign = 'right'; g.fillStyle = low ? '#e5484d' : '#ffc83d'; g.fillText(`${n}/${cap}`, 242, 26); g.textAlign = 'left';
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(14, 50, 228, 14);
  g.fillStyle = low ? '#e5484d' : '#7bd36b'; g.fillRect(14, 50, 228 * (n / cap), 14);
  t.needsUpdate = true;
  return t;
}

/** Barra de paciencia sobre los clientes de la cola. */
export function patienceBar(t: THREE.CanvasTexture | null, f: number): THREE.CanvasTexture {
  if (!t) { const [c] = canvas(128, 24); t = tex(c); }
  const c = t.image as HTMLCanvasElement, g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 24);
  g.fillStyle = 'rgba(22,28,17,0.85)'; g.fillRect(0, 0, 128, 24);
  g.fillStyle = f > 0.5 ? '#7bd36b' : f > 0.25 ? '#ffc83d' : '#e5484d';
  g.fillRect(4, 4, 120 * Math.max(0, f), 16);
  t.needsUpdate = true;
  return t;
}
