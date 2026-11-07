// Iconos SVG del juego. Regla del proyecto: nada de emojis en la interfaz.
// - Iconos generales: Lucide (licencia ISC, ver creditos.html).
// - Armas y equipo militar (Lucide no los incluye): dibujados a mano con el mismo estilo
//   (rejilla de 24 px, trazo de 2 px, extremos redondeados), para que todo el juego sea coherente.

import pause from 'lucide-static/icons/pause.svg?raw';
import play from 'lucide-static/icons/play.svg?raw';
import volumeOn from 'lucide-static/icons/volume-2.svg?raw';
import volumeOff from 'lucide-static/icons/volume-x.svg?raw';
import house from 'lucide-static/icons/house.svg?raw';
import coins from 'lucide-static/icons/coins.svg?raw';
import heart from 'lucide-static/icons/heart.svg?raw';
import heartPulse from 'lucide-static/icons/heart-pulse.svg?raw';
import zap from 'lucide-static/icons/zap.svg?raw';
import flame from 'lucide-static/icons/flame.svg?raw';
import bomb from 'lucide-static/icons/bomb.svg?raw';
import rocket from 'lucide-static/icons/rocket.svg?raw';
import briefcaseMedical from 'lucide-static/icons/briefcase-medical.svg?raw';
import footprints from 'lucide-static/icons/footprints.svg?raw';
import magnet from 'lucide-static/icons/magnet.svg?raw';
import drone from 'lucide-static/icons/drone.svg?raw';
import shieldCheck from 'lucide-static/icons/shield-check.svg?raw';
import brickWall from 'lucide-static/icons/brick-wall.svg?raw';
import settings from 'lucide-static/icons/settings.svg?raw';
import x from 'lucide-static/icons/x.svg?raw';
import chevronRight from 'lucide-static/icons/chevron-right.svg?raw';
import arrowLeft from 'lucide-static/icons/arrow-left.svg?raw';
import trophy from 'lucide-static/icons/trophy.svg?raw';
import check from 'lucide-static/icons/check.svg?raw';
import fileText from 'lucide-static/icons/file-text.svg?raw';
import info from 'lucide-static/icons/info.svg?raw';
import crosshair from 'lucide-static/icons/crosshair.svg?raw';
import grid from 'lucide-static/icons/grid-3x3.svg?raw';
import rotateCcw from 'lucide-static/icons/rotate-ccw.svg?raw';

/** Extrae solo el contenido interior de un SVG de Lucide (sin comentario de licencia ni atributos). */
const inner = (svg: string) => svg.replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();

/** Iconos propios, mismo estilo que Lucide. */
const CUSTOM = {
  // Pistola vista de lado, cañón a la derecha
  pistola: '<path d="M3 7h17a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9"/><path d="M3 7v4h3"/><path d="M6 11 4.6 18.2A1 1 0 0 0 5.6 19.4H8a1 1 0 0 0 1-.8L10.4 11"/><path d="M10 11v1.5a2 2 0 0 0 2 2h1.5"/>',
  // Subfusil: cuerpo, cargador, culata plegable
  subfusil: '<path d="M7 8h13a1 1 0 0 1 1 1v2H7z"/><path d="M21 9.5h1.5"/><path d="M7 9H3v4"/><path d="M3 11h4"/><path d="M10 11v3a1 1 0 0 0 1 1h1"/><path d="M14 11l1 7h2l-1-7"/>',
  // Escopeta: doble cañón largo y culata
  escopeta: '<path d="M12 9.5h10"/><path d="M12 12h10"/><path d="M12 9v4H8l-5 3-1-2 5-5z"/><rect x="14" y="12" width="5" height="2.5" rx="1"/><path d="M10 13v1.5a1.5 1.5 0 0 0 1.5 1.5"/>',
  // Fusil de francotirador con mira
  francotirador: '<path d="M12 11h10"/><path d="M12 10v3H8l-5 3-1-2 5-4z"/><rect x="7" y="5" width="9" height="3" rx="1.5"/><path d="M9.5 8v2"/><path d="M13.5 8v2"/><path d="M10 13v1.5a1.5 1.5 0 0 0 1.5 1.5"/><path d="M19 11l-1.5 5"/><path d="M19 11l1.5 5"/>',
  // Munición: tres balas
  municion: '<path d="M6 9c0-2.6 1-4.4 2-5.5 1 1.1 2 2.9 2 5.5"/><rect x="6" y="9" width="4" height="12" rx="1"/><path d="M6 12h4"/><path d="M14 9c0-2.6 1-4.4 2-5.5 1 1.1 2 2.9 2 5.5"/><rect x="14" y="9" width="4" height="12" rx="1"/><path d="M14 12h4"/>',
  // Chaleco táctico
  armadura: '<path d="M8 3 5 5v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5l-3-2-2.5 3h-3z"/><path d="M12 6v15"/><path d="M8 12h2"/><path d="M14 12h2"/><path d="M8 16h2"/><path d="M14 16h2"/>',
  // Torreta en trípode
  torreta: '<rect x="6" y="5" width="9" height="6" rx="1"/><path d="M15 7h6"/><path d="M15 9h6"/><path d="M10.5 11v3"/><path d="M10.5 14 5 21"/><path d="M10.5 14 16 21"/><path d="M10.5 14v7"/>',
  // Mina terrestre con luz
  mina: '<ellipse cx="12" cy="15" rx="8" ry="3"/><path d="M4 15v2c0 1.7 3.6 3 8 3s8-1.3 8-3v-2"/><path d="M10 12.2V10h4v2.2"/><path d="M12 7V5"/><path d="M8.5 6.5l1 1.2"/><path d="M15.5 6.5l-1 1.2"/>',
  // Menú hamburguesa (no usamos glifos de texto)
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
};

const LUCIDE = {
  pause, play, volumeOn, volumeOff, house, coins, heart, heartPulse, zap, flame, bomb, rocket,
  briefcaseMedical, footprints, magnet, drone, shieldCheck, brickWall, settings, x, chevronRight, arrowLeft,
  trophy, check, fileText, info, crosshair, grid, rotateCcw,
};

export type IconName = keyof typeof LUCIDE | keyof typeof CUSTOM;
const BODY: Record<string, string> = Object.fromEntries([
  ...Object.entries(LUCIDE).map(([k, v]) => [k, inner(v)]),
  ...Object.entries(CUSTOM),
]);

/** Devuelve el marcado SVG de un icono (hereda el color del texto: stroke="currentColor"). */
export function icon(name: IconName, cls = 'ic'): string {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${BODY[name]}</svg>`;
}

/** Icono de cada objeto de la tienda / arma / herramienta del shooter. */
export const ITEM_ICON: Record<string, IconName> = {
  pistola: 'pistola', subfusil: 'subfusil', escopeta: 'escopeta', lanzallamas: 'flame', francotirador: 'francotirador',
  granadas: 'bomb', cohetes: 'rocket',
  botiquin: 'briefcaseMedical', armadura: 'armadura', botas: 'footprints', municion: 'municion', iman: 'magnet',
  regeneracion: 'heartPulse', dron: 'drone',
  torreta: 'torreta', mina: 'mina', escudo: 'shieldCheck', barricada: 'brickWall',
};

/** Rellena todos los elementos con data-icon="nombre" (para iconos escritos en el HTML). */
export function hydrateIcons(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon as IconName));
    el.removeAttribute('data-icon');
  });
}

export const ALL_ICONS = Object.keys(BODY) as IconName[];
