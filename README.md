# Juegos de Dylan

Juegos 3D para navegador, Android e iOS. `index.html` es el menú.

- **Frente de Batalla** (`shooter.html`): shooter de oleadas de día en un campo de batalla, con tienda de armas y herramientas.
- **Tres en Raya 3D** (`tres-en-raya.html`): tres en raya en un cubo de 4×4×4 o 3×3×3.

**Stack:** TypeScript + [Three.js](https://threejs.org) (render 3D) + Vite (build) + Capacitor (apps móviles).
Un solo código para las tres plataformas.

## Jugar en local

```bash
npm install
npm run dev      # abre http://localhost:5173 (también accesible desde el móvil en la misma red)
npm test         # tests de la lógica y la IA
npm run build    # genera dist/ para publicar en cualquier hosting estático
```

## Frente de Batalla

**Controles**
- Móvil: el pulgar izquierdo mueve y el derecho apunta y dispara. La barra inferior cambia de arma y coloca torretas.
- PC: WASD para moverte, el ratón para apuntar, clic para disparar, 1-4 o Q/E para cambiar de arma, T para colocar una torreta.

**Campo de batalla:** rocas, árboles y muros de sacos terreros que paran las balas (tuyas y enemigas), y cajas
que se rompen y sueltan monedas, vida o disparo rápido. El mapa cambia en cada partida.

**Enemigos:** rojos (rápidos), morados (tanques) y naranjas (artilleros: disparan si te ven y te buscan si te escondes).

**Tienda** (se abre al terminar cada oleada; cada enemigo da monedas y además hay un bonus por oleada):

| Armas | Precio | | Herramientas | Precio |
|---|---|---|---|---|
| Subfusil | 60 | | Botiquín (+2 vida) | 20 |
| Escopeta | 90 | | Armadura (+1 vida máx., hasta 3) | 50 |
| Lanzagranadas | 160 | | Botas (+12% velocidad, hasta 2) | 40 |
| | | | Munición pesada (+30% daño, hasta 2) | 70 |
| | | | Torreta (dispara sola 30 s, hasta 3) | 50 |

**Rendimiento:** si el dispositivo no llega a 40 FPS en los primeros segundos, el juego quita las sombras y baja la resolución automáticamente.

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
- `src/shooter/main.ts`: escena de día, modelos, joysticks táctiles, ratón y teclado, HUD, tienda y efectos.
- `src/shooter/audio.ts`: efectos de sonido sintetizados con WebAudio (no usa archivos de audio).
- `src/tres/game.ts`: lógica del tres en raya (tablero, líneas, victoria, IA).
- `src/tres/main.ts`: escena 3D del tres en raya.
- `src/**/*.test.ts`: tests (`npm test`).
