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
  - **Excepción: Bloques** (`bloques.html`) es de supervivencia, no de oleadas. Su estructura equivalente: título con logotipo, HUD con 10 corazones y aviso de día/noche, anuncios (anochece, amanece), inventario con crafteo y pantalla de muerte con reaparecer. Su pantalla de inicio es propia (lista de mundos y crear mundo), con las mismas tipografías y paleta.

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
- Con conexión, cada partida es un servidor público con nombre aleatorio (hasta 7 jugadores) que aparece en la lista de Multijugador; sin conexión se juega solo. Los jugadores no escriben nada: nombres automáticos y sin chat.
- Si algún día se permite escribir (nombres, chat), debe pasar por `src/shooter/moderation.ts` en el servidor y actualizarse antes la política de privacidad.
- **Bloques:** cada mundo es público (aparece en la lista) y se puede invitar con un enlace `bloques.html?mundo=<id>`. El enlace solo lleva el identificador aleatorio del mundo, nunca datos de nadie. El servidor (`server/mundo.ts`) simula todo: movimiento, minado, crafteo y monstruos.
- **Verity (Bloques):** se le escribe, pero no es un chat: el texto se entiende en el propio dispositivo (`src/bloques/verity.ts`) y al servidor solo llega la orden ya entendida (`mcmd`), nunca el texto. Nadie más lo ve. Solo la versión Artifact puede preguntar a Claude lo que no entiende, con el permiso de quien juega en claude.ai. Conectar una IA en la web o en la app exige antes actualizar la política de privacidad y las fichas de las tiendas.
- **Mundos (Bloques):** antes de jugar se crea un mundo. Los de un jugador llevan nombre automático (nadie escribe nada) y se guardan solo en el dispositivo (`src/bloques/save.ts`); los en línea los crea y simula el servidor. No hay mods, ni elección de personaje, ni enlaces a otros juegos: Bloques tiene sus propias criaturas (`src/bloques/criaturas.ts`) y su propia pantalla de inicio.
- Denunciar y bloquear jugadores deben seguir disponibles (norma 1.2 de Apple).
- Producción solo con HTTPS/WSS.
- Cualquier dato nuevo que se trate exige actualizar antes `privacidad.html`, `docs/TIENDAS.md` y las fichas de privacidad.

## 4. Forma de trabajar

- La simulación (`src/shooter/sim.ts`) es pura y testeable: toda regla de juego nueva lleva test (`npm test`).
- Antes de cada commit: `npx tsc --noEmit -p .`, `npm test`, `npm run build` y prueba en navegador (escritorio y móvil emulado).
- No incluir identificadores de modelos de IA en commits, código ni documentación.
