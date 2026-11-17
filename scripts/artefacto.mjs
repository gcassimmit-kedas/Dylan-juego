// Genera Bloques como una sola página HTML para publicarla como Artifact de claude.ai (versión de un jugador).
// Todo va dentro del archivo: código, estilos, fuentes e imágenes. Uso:
//   node scripts/artefacto.mjs <versión> <archivo de salida>
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const [version = '1.0', out = 'bloques-artefacto.html'] = process.argv.slice(2);
const root = resolve(import.meta.dirname, '..');
const outDir = mkdtempSync(join(tmpdir(), 'bloques-artefacto-'));
process.env.VITE_ARTEFACTO = '1';

await build({
  root, configFile: false, base: './', logLevel: 'warn', publicDir: false,
  build: {
    outDir, emptyOutDir: true, modulePreload: false, cssCodeSplit: false,
    assetsInlineLimit: 10 * 1024 * 1024, // fuentes e imágenes dentro del CSS/JS
    rolldownOptions: { input: join(root, 'bloques.html'), output: { inlineDynamicImports: true } },
  },
});

const html = readFileSync(join(outDir, 'bloques.html'), 'utf8');
const assets = join(outDir, 'assets');
const files = readdirSync(assets);
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const emblem = 'data:image/svg+xml;base64,' + readFileSync(join(root, 'public/icons/emblema.svg')).toString('base64');

let body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
body = body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/\.\/icons\/emblema\.svg/g, emblem)
  .replace('<span class="version">v1.0.0</span>', `<span class="version">v${version}</span>`);

const page = `<title>Bloques ${version}</title>
<style>${css}</style>
${body.trim()}
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
`;
writeFileSync(resolve(out), page);
rmSync(outDir, { recursive: true, force: true });
console.log(`Bloques ${version}: ${resolve(out)} (${(page.length / 1024 / 1024).toFixed(2)} MB)`);
