# Juegos de Dylan

**Shooter 2027**: juego 3D para navegador, Android e iOS. La app abre directamente el juego (`index.html`); `juegos.html` lista los juegos incluidos.

- **Shooter 2027** (`index.html`): shooter de oleadas de día en un campo de batalla, con tienda de armas y herramientas.
- **Tres en Raya 3D** (`tres-en-raya.html`, incluido como juego extra): tres en raya en un cubo de 4×4×4 o 3×3×3.

**Stack:** TypeScript + [Three.js](https://threejs.org) (render 3D) + Vite (build) + Capacitor (apps móviles).
Un solo código para las tres plataformas.

## Jugar en local

```bash
npm install
npm run dev      # abre http://localhost:5173 (también accesible desde el móvil en la misma red)
npm test         # tests de la lógica y la IA
npm run build    # genera dist/ para publicar en cualquier hosting estático
```

## Shooter 2027

**Controles**
- Móvil: el pulgar izquierdo mueve y el derecho apunta y dispara. Abajo está la barra de armas y a la derecha el equipo.
- PC: WASD para moverte, el ratón para apuntar, clic para disparar, 1-7 o Q/E para cambiar de arma.
  Equipo: T (torreta), G (mina), F (escudo), B (barricada).
- Pausa: botón de pausa arriba a la derecha (o P / Esc en PC). El juego también se pausa solo si cambias de app o de pestaña.

**Personajes:** tu soldado (casco, chaleco, mochila, piernas animadas; el arma cambia en la mano) contra tres robots:
araña (roja, rápida), artillero (naranja, bípedo con cañón; dispara si te ve y te busca si te escondes) y tanque
(morado, con orugas y torreta que te apunta). Los robots muestran su barra de vida al recibir daño.

**Campo de batalla:** de día, con cielo, sombras de nubes en movimiento, caminos de tierra, hierba y flores.
Rocas, árboles y sacos terreros paran las balas; las cajas se rompen y sueltan monedas, vida o disparo rápido.
El mapa cambia en cada partida.

**Tienda** (precios en monedas; al terminar cada oleada; cada robot da monedas y hay un bonus por oleada):

| Armas | Precio | Mejoras | Precio | Equipo (botón) | Precio |
|---|---|---|---|---|---|
| Subfusil | 60 | Botiquín (+2 vida) | 20 | Torreta (dispara sola 30 s) | 50 |
| Escopeta | 90 | Armadura (+1 vida máx., ×3) | 50 | Mina (explota al pasar un robot) | 25 |
| Lanzallamas | 120 | Botas (+12% velocidad, ×2) | 40 | Escudo (5 s invulnerable) | 45 |
| Francotirador (atraviesa) | 140 | Munición pesada (+30% daño, ×2) | 70 | Barricada (muro que para balas enemigas) | 30 |
| Lanzagranadas | 160 | Imán (atrae monedas) | 40 | | |
| Lanzacohetes | 220 | Regeneración (+1 vida/15 s) | 80 | | |
| | | Dron escolta (×2) | 90 | | |

**Gráficos y rendimiento:** si el dispositivo no llega a 40 FPS en los primeros segundos, el juego quita las sombras
reales (pone sombras simples bajo los personajes) y baja la resolución. Se puede forzar con `index.html?calidad=alta`
o `?calidad=baja`.

## Tres en Raya 3D

**Controles:** arrastra para girar el cubo, pellizca o usa la rueda para hacer zoom, toca una esfera para jugar.
El control "Separar capas" abre el cubo para ver las casillas del interior.

**Reglas**

- Gana quien alinea N fichas en cualquier dirección: filas, columnas, pilares y diagonales de capa y del espacio
  (76 líneas en 4×4×4 y 49 en 3×3×3).
- En 3×3×3 el centro está **bloqueado**. Si no, el primer jugador gana casi siempre tomándolo.

## Apps móviles (Capacitor)

Una sola vez:

```bash
npx cap add android      # requiere Android Studio
npx cap add ios          # requiere macOS + Xcode
```

Cada vez que cambies el juego:

```bash
npm run cap:sync
npx cap open android     # o: npx cap open ios
```

El juego va empaquetado dentro de la app (no carga una URL remota). Eso es necesario para que la App Store lo apruebe.

## Estructura

- `src/shooter/sim.ts`: simulación pura del shooter (campo, IA, armas, oleadas, tienda). Testeable sin navegador.
- `src/shooter/main.ts`: escena de día, terreno, joysticks táctiles, ratón y teclado, HUD y tienda.
- `src/shooter/models.ts`: modelos 3D low-poly (soldado, robots, armas, torreta, dron, mina, obstáculos) y sus animaciones.
- `src/shooter/fx.ts`: efectos (fuego, humo, explosiones, escombros, polvo, fogonazos, textos flotantes).
- `src/shooter/audio.ts`: efectos de sonido sintetizados con WebAudio (no usa archivos de audio).
- `src/tres/game.ts`: lógica del tres en raya (tablero, líneas, victoria, IA).
- `src/tres/main.ts`: escena 3D del tres en raya.
- `src/**/*.test.ts`: tests (`npm test`).

## Publicación en tiendas

Normas del proyecto (sin emojis, iconos SVG, cumplimiento de tiendas) en `CLAUDE.md`.
Estado del cumplimiento, decisiones pendientes y pasos para publicar en `docs/TIENDAS.md`.

- Ajustes del juego: sonido, calidad gráfica y temblor de cámara (se guardan solo en el dispositivo).
- Tipografías Oswald e Inter empaquetadas en la app (licencia SIL OFL 1.1).
- Política de privacidad: `privacidad.html`. Créditos y licencias: `creditos.html`.
- Iconos y pantallas de carga: `node scripts/recursos.cjs` (a partir de `resources/*.svg`).
