// Muestra las licencias completas de las librerías incluidas, leídas de los propios paquetes al compilar.
import three from '../../node_modules/three/LICENSE?raw';
import lucide from '../../node_modules/lucide-static/LICENSE?raw';
import capacitor from '../../node_modules/@capacitor/core/LICENSE?raw';
import oswald from '../../node_modules/@fontsource/oswald/LICENSE?raw';
import inter from '../../node_modules/@fontsource/inter/LICENSE?raw';

const LIBS = [
  { name: 'three.js', use: 'Motor gráfico 3D', license: 'MIT', text: three },
  { name: 'Lucide', use: 'Iconos de la interfaz', license: 'ISC (y MIT para los iconos derivados de Feather)', text: lucide },
  { name: 'Capacitor', use: 'Empaquetado como app para Android e iOS', license: 'MIT', text: capacitor },
  { name: 'Oswald', use: 'Tipografía de títulos y cifras', license: 'SIL Open Font License 1.1', text: oswald },
  { name: 'Inter', use: 'Tipografía de textos', license: 'SIL Open Font License 1.1', text: inter },
];

const root = document.getElementById('libs')!;
for (const lib of LIBS) {
  const box = document.createElement('section');
  box.className = 'lib';
  const h = document.createElement('h3'); h.textContent = lib.name;
  const p = document.createElement('p'); p.textContent = `${lib.use} · Licencia ${lib.license}`;
  const pre = document.createElement('pre'); pre.textContent = lib.text.trim();
  box.append(h, p, pre);
  root.appendChild(box);
}
