# Constitución del proyecto

Reglas obligatorias para cualquier cambio en este repositorio. Si una petición choca con alguna, se avisa antes de hacerla.

## 1. Calidad premium

- El producto es un juego premium destinado a App Store y Google Play. Cada cambio debe estar a ese nivel: probado, pulido y sin piezas a medias.
- **Nada de emojis**: ni en la interfaz, ni en textos del juego, ni en documentación, ni en commits. Tampoco caracteres tipográficos usados como icono (flechas, triángulos de reproducción, barras de menú, etc.).
- **Iconos: solo SVG profesionales.** Se usan desde `src/ui/icons.ts`:
  - iconos generales de **Lucide** (licencia ISC; ya acreditada en `creditos.html`);
  - armas y equipo militar dibujados a mano **con el mismo estilo** (rejilla 24 px, trazo 2 px, extremos redondeados).
  - Antes de añadir un icono propio, se revisa renderizado (hoja de pruebas: `dev/iconos.html` con `npm run dev`).
- Textos de la interfaz en español, con tildes y signos de apertura (¿ ¡).
- **Sistema visual común** (todas las pantallas deben parecer el mismo producto):
  - tipografías empaquetadas `src/ui/fonts.css`: **Oswald** para títulos, botones y cifras (en mayúsculas); **Inter** para textos;
  - paleta oliva oscuro + dorado `#ffc83d` (variables en `src/shooter/style.css`);
  - paneles y botones con **esquina recortada** (clip-path), botón principal dorado y secundarios translúcidos;
  - cada pantalla con estructura de juego comercial: título con logotipo, HUD con barra de vida e indicador de oleada, anuncios de oleada, pantalla final con estadísticas.

## 2. Cumplimiento de tiendas (App Store y Google Play)

- **Privacidad:** el juego no recoge datos personales, no usa analítica, publicidad ni SDK de terceros que rastreen. Cualquier cambio que trate datos (cuentas, juego en línea, compras) exige **antes** actualizar `privacidad.html`, `docs/TIENDAS.md` y las fichas de privacidad de ambas tiendas.
- **Funciona sin conexión:** todo va empaquetado en la app (sin CDN, sin fuentes externas). Necesario además para la regla 4.2 de Apple.
- **Licencias:** toda librería nueva se añade a `creditos.html` con su licencia completa.
- **Ciclo de vida:** el juego se pausa solo al pasar a segundo plano y nunca sigue jugando sin el usuario.
- **Accesibilidad:** botones solo-icono con `aria-label`, foco visible, respeto a "reducir movimiento", contraste legible.
- **Pantallas:** respetar áreas seguras (notch, barra de gestos) y funcionar en vertical y horizontal, de móvil a tableta.
- **Iconos y pantallas de carga:** se generan desde `resources/*.svg` con `node scripts/recursos.cjs`. El icono de iOS no lleva transparencia.
- Checklist completa y tareas pendientes en `docs/TIENDAS.md`.

## 3. Futuro juego en línea

El multijugador se retiró (commit "Quitar el modo multijugador") y queda en el historial. Si se recupera, debe cumplir esta constitución: sin emojis, política de privacidad actualizada (nombre de jugador, datos de conexión), servidor con HTTPS/WSS y moderación de nombres.

## 4. Forma de trabajar

- La simulación (`src/shooter/sim.ts`) es pura y testeable: toda regla de juego nueva lleva test (`npm test`).
- Antes de cada commit: `npx tsc --noEmit -p .`, `npm test`, `npm run build` y prueba en navegador (escritorio y móvil emulado).
- No incluir identificadores de modelos de IA en commits, código ni documentación.
