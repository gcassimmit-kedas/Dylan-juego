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

## 3. Juego en línea (cooperativo)

- El servidor (`server/index.ts`) manda: la simulación corre allí y el cliente solo envía su entrada. Nunca confiar en lo que llega del cliente.
- Con conexión, cada partida es un servidor público con nombre aleatorio (hasta 7 jugadores) que aparece en la lista de Multijugador; sin conexión se juega solo o con «2 jugadores» en el mismo dispositivo (sin servidor). Los jugadores no escriben nada: nombres automáticos y sin chat.
- Si algún día se permite escribir (nombres, chat), debe pasar por `src/shooter/moderation.ts` en el servidor y actualizarse antes la política de privacidad.
- Denunciar y bloquear jugadores deben seguir disponibles (norma 1.2 de Apple).
- Producción solo con HTTPS/WSS.
- Cualquier dato nuevo que se trate exige actualizar antes `privacidad.html`, `docs/TIENDAS.md` y las fichas de privacidad.

## 4. Forma de trabajar

- La simulación (`src/shooter/sim.ts`) es pura y testeable: toda regla de juego nueva lleva test (`npm test`).
- Antes de cada commit: `npx tsc --noEmit -p .`, `npm test`, `npm run build` y prueba en navegador (escritorio y móvil emulado).
- No incluir identificadores de modelos de IA en commits, código ni documentación.
