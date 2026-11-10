import { defineConfig, type Plugin } from 'vite';
import { resolve, relative, join } from 'node:path';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Lista recursiva de archivos de public/ (se copian tal cual a dist/). */
function publicFiles(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? publicFiles(p, root) : [relative(root, p).split('\\').join('/')];
  });
}

/**
 * Genera dist/sw.js: guarda todo el juego en el dispositivo para jugar sin conexión en el navegador.
 * La lista y la versión salen de la propia compilación, así una actualización sustituye a la anterior.
 * (Dentro de la app nativa no se usa: allí el juego ya va empaquetado.)
 */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'shooter2027-sw',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    // Se ejecuta cuando dist/ ya está escrito del todo: la lista sale de los archivos reales.
    closeBundle() {
      const files = ['./', ...publicFiles(outDir).filter((f) => f !== 'sw.js').map((f) => './' + f)];
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      const source = `// Generado al compilar (vite.config.ts). No editar.
const CACHE = 'shooter2027-${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Páginas: primero la red (para recibir actualizaciones) y, sin conexión, la copia guardada.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((r) => r || caches.match('./index.html', { ignoreVary: true }))));
    return;
  }
  // Recursos (con huella en el nombre): primero la copia guardada.
  // ignoreVary: los scripts de módulo llevan cabecera Origin y muchos servidores responden con Vary: Origin.
  e.respondWith(caches.match(req, { ignoreVary: true }).then((r) => r || fetch(req)));
});
`;
      writeFileSync(join(outDir, 'sw.js'), source);
    },
  };
}

export default defineConfig({
  base: './', // rutas relativas: necesario para Capacitor (iOS/Android)
  plugins: [serviceWorker()],
  // En desarrollo (npm run dev) el WebSocket va al servidor de juego en el puerto 8080
  server: { proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } } },
  build: {
    // Navegadores de hace unos años (iPhone/iPad con iOS 14 en adelante, Android con Chrome 87+).
    target: ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'],
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'), // Shooter 2027: es lo que abre la app
        juegos: resolve(import.meta.dirname, 'juegos.html'),
        tres: resolve(import.meta.dirname, 'tres-en-raya.html'),
        super: resolve(import.meta.dirname, 'supermercado.html'),
        privacidad: resolve(import.meta.dirname, 'privacidad.html'),
        creditos: resolve(import.meta.dirname, 'creditos.html'),
      },
    },
  },
});
