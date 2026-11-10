// Empaqueta el Supermercado en un único HTML autocontenido (JS, CSS y fuentes dentro),
// para jugarlo como página publicada sin servidor.
// Uso: node scripts/artifact.mjs   ->  dist-artifact/supermercado.html
import { build } from 'vite';
import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const tmp = join(root, 'dist-artifact', 'tmp');
rmSync(join(root, 'dist-artifact'), { recursive: true, force: true });

await build({
  root,
  configFile: false,
  base: './',
  logLevel: 'warn',
  publicDir: false,
  build: {
    outDir: tmp,
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000, // fuentes como data: URI
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 5000,
    rolldownOptions: {
      input: join(root, 'supermercado.html'),
      output: { codeSplitting: false },
    },
  },
});

const assets = join(tmp, 'assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js'));
const css = files.filter((f) => f.endsWith('.css'));
if (js.length !== 1) throw new Error('Se esperaba un solo archivo JS: ' + js.join(', '));

let html = readFileSync(join(tmp, 'supermercado.html'), 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
let body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
// En la página publicada no existen las otras páginas del proyecto (juegos, privacidad, créditos).
body = body.replace(/<nav class="links"[\s\S]*?<\/nav>/, '');
body = body.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');
const style = css.map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const script = readFileSync(join(assets, js[0]), 'utf8').replace(/<\/script/gi, '<\\/script');

const out = `${title}
<meta name="description" content="Supermercado: dirige tu tienda, cobra a los clientes, repón las estanterías y compra género en el ordenador." />
<style>:root { color-scheme: dark; } html, body { background: #141a0f; }
${style}</style>
${body.trim()}
<script type="module">${script}</script>
`;
mkdirSync(join(root, 'dist-artifact'), { recursive: true });
writeFileSync(join(root, 'dist-artifact', 'supermercado.html'), out);
rmSync(tmp, { recursive: true, force: true });
console.log(`dist-artifact/supermercado.html (${(out.length / 1024 / 1024).toFixed(2)} MB)`);
