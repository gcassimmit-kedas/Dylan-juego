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
import hammer from 'lucide-static/icons/hammer.svg?raw';
import fence from 'lucide-static/icons/fence.svg?raw';
import castle from 'lucide-static/icons/castle.svg?raw';
import hospital from 'lucide-static/icons/hospital.svg?raw';
import plane from 'lucide-static/icons/plane.svg?raw';
import zapOff from 'lucide-static/icons/zap-off.svg?raw';
import userRound from 'lucide-static/icons/user-round.svg?raw';
import shieldOff from 'lucide-static/icons/shield-off.svg?raw';
import globe from 'lucide-static/icons/globe.svg?raw';
import search from 'lucide-static/icons/search.svg?raw';
import lock from 'lucide-static/icons/lock.svg?raw';
import users from 'lucide-static/icons/users.svg?raw';
import flag from 'lucide-static/icons/flag.svg?raw';
import copy from 'lucide-static/icons/copy.svg?raw';
import refreshCw from 'lucide-static/icons/refresh-cw.svg?raw';
import logIn from 'lucide-static/icons/log-in.svg?raw';
import logOut from 'lucide-static/icons/log-out.svg?raw';
import plus from 'lucide-static/icons/plus.svg?raw';
import wifiOff from 'lucide-static/icons/wifi-off.svg?raw';
import ban from 'lucide-static/icons/ban.svg?raw';
import keyRound from 'lucide-static/icons/key-round.svg?raw';
// Supermercado
import store from 'lucide-static/icons/store.svg?raw';
import shoppingCart from 'lucide-static/icons/shopping-cart.svg?raw';
import shoppingBasket from 'lucide-static/icons/shopping-basket.svg?raw';
import monitor from 'lucide-static/icons/monitor.svg?raw';
import packageIc from 'lucide-static/icons/package.svg?raw';
import scanBarcode from 'lucide-static/icons/scan-barcode.svg?raw';
import clock from 'lucide-static/icons/clock.svg?raw';
import truck from 'lucide-static/icons/truck.svg?raw';
import warehouse from 'lucide-static/icons/warehouse.svg?raw';
import smile from 'lucide-static/icons/smile.svg?raw';
import receipt from 'lucide-static/icons/receipt.svg?raw';
import minus from 'lucide-static/icons/minus.svg?raw';
import refrigerator from 'lucide-static/icons/refrigerator.svg?raw';
import trendingUp from 'lucide-static/icons/trending-up.svg?raw';
import packagePlus from 'lucide-static/icons/package-plus.svg?raw';
import userX from 'lucide-static/icons/user-x.svg?raw';
import circleHelp from 'lucide-static/icons/circle-question-mark.svg?raw';
import banknote from 'lucide-static/icons/banknote.svg?raw';
import maximize from 'lucide-static/icons/maximize.svg?raw';
import minimize from 'lucide-static/icons/minimize.svg?raw';
import gauge from 'lucide-static/icons/gauge.svg?raw';
import droplets from 'lucide-static/icons/droplets.svg?raw';
import siren from 'lucide-static/icons/siren.svg?raw';
import shieldAlert from 'lucide-static/icons/shield-alert.svg?raw';
import bed from 'lucide-static/icons/bed.svg?raw';

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
  // Fusil de asalto: cargador curvo, culata y cañón medio
  fusil: '<path d="M2 11h3l1-2h14v3H11"/><path d="M20 10h2"/><path d="M2 11v3l2 1 4-3"/><path d="M13 12c0 2 .5 4 1.5 5.5h2c-1-1.5-1.5-3.5-1.5-5.5"/><path d="M9 12v1.5a1.5 1.5 0 0 0 1.5 1.5"/>',
  // Ametralladora: haz de cañones y cinta de munición
  ametralladora: '<rect x="3" y="8" width="8" height="6" rx="1"/><path d="M11 9h10"/><path d="M11 11h11"/><path d="M11 13h10"/><path d="M6 14v3"/><path d="M6 17l-2 3"/><path d="M6 17l2 3"/><path d="M4 8V6h3"/>',
  // Cañón Tesla: bobina con rayo
  tesla: '<rect x="2" y="9" width="7" height="6" rx="1"/><path d="M9 10.5h4"/><path d="M9 13.5h4"/><circle cx="15" cy="12" r="2"/><path d="M17 12l2-2 1 2 2-2"/><path d="M5 15v3"/>',
  // Madera: troncos apilados
  madera: '<circle cx="7" cy="16" r="3"/><circle cx="17" cy="16" r="3"/><circle cx="12" cy="9" r="3"/><circle cx="7" cy="16" r=".5"/><circle cx="17" cy="16" r=".5"/><circle cx="12" cy="9" r=".5"/>',
  // Pinchos: tabla con púas
  pinchos: '<path d="M3 19h18"/><path d="M4 19l2-9 2 9"/><path d="M9 19l3-13 3 13"/><path d="M16 19l2-9 2 9"/>',
  // Silbato: cuerpo redondo, boquilla y cordón
  silbato: '<circle cx="9" cy="14" r="5"/><path d="M12.6 10.6 21 7v4l-6.2 2.2"/><circle cx="9" cy="14" r="1.5"/><path d="M5.5 10.5 3 8"/>',
  // Pistola de agua: depósito arriba, cañón y gotas
  pistolaAgua: '<path d="M3 10h12a2 2 0 0 1 2 2H8"/><path d="M17 11h2.5"/><path d="M8 12l-1.5 6.8a1 1 0 0 0 1 1.2h2a1 1 0 0 0 1-.8L12 12"/><rect x="5" y="4" width="7" height="6" rx="2"/><path d="M22 8.5v.01"/><path d="M22 13.5v.01"/>',
  // Lanzarredes: tubo y red abierta
  lanzarredes: '<path d="M2.5 18.5l3 3 5-5-3-3z"/><path d="M10 14 13 3"/><path d="M10 14l11-3"/><path d="M10 14l8.5-8.5"/><path d="M13 3c3.5.6 6.6 3.4 8 8"/><path d="M11.8 8.5c2 .4 3.6 1.7 4.4 3.8"/>',
  // Menú hamburguesa (no usamos glifos de texto)
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
};

const LUCIDE = {
  pause, play, volumeOn, volumeOff, house, coins, heart, heartPulse, zap, flame, bomb, rocket,
  footprints, magnet, drone, shieldCheck, brickWall, settings, x, chevronRight, arrowLeft,
  trophy, check, fileText, info, crosshair, grid, rotateCcw, hammer, fence, castle, hospital, plane, zapOff, userRound, shieldOff,
  globe, search, lock, users, flag, copy, refreshCw, logIn, logOut, plus, wifiOff, ban, keyRound,
  store, shoppingCart, shoppingBasket, monitor, packageIc, scanBarcode, clock, truck, warehouse, smile, receipt, minus, refrigerator, trendingUp, packagePlus, userX, circleHelp, banknote, maximize, minimize, gauge, droplets, bed, siren, shieldAlert,
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
  pistola: 'pistola', subfusil: 'subfusil', fusil: 'fusil', escopeta: 'escopeta', ametralladora: 'ametralladora', lanzallamas: 'flame',
  francotirador: 'francotirador', tesla: 'tesla',
  granadas: 'bomb', cohetes: 'rocket',
  armadura: 'armadura', botas: 'footprints', municion: 'municion', iman: 'magnet',
  regeneracion: 'heartPulse', dron: 'drone',
  torreta: 'torreta', mina: 'mina', escudo: 'shieldCheck', barricada: 'brickWall', aereo: 'plane', emp: 'zapOff', senuelo: 'userRound',
  muro: 'fence', pinchos: 'pinchos', medico: 'hospital', torre: 'castle',
};

/** Rellena todos los elementos con data-icon="nombre" (para iconos escritos en el HTML). */
export function hydrateIcons(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon as IconName));
    el.removeAttribute('data-icon');
  });
}

export const ALL_ICONS = Object.keys(BODY) as IconName[];
