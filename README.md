# Juegos de Dylan

Juegos 3D para navegador, Android e iOS. `index.html` es el menú.

- **Arena Neón** (`shooter.html`): shooter de oleadas con vista desde arriba (twin-stick).
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

## Arena Neón

**Controles**
- Móvil: el pulgar izquierdo mueve y el derecho apunta y dispara. Los joysticks aparecen donde pones el dedo.
- PC: WASD o flechas para moverte, el ratón para apuntar, clic mantenido (o espacio) para disparar.

**Enemigos:** rojos (rápidos), morados (tanques que encogen al recibir daño) y naranjas (mantienen la distancia y disparan).
**Recogibles:** verde (+1 vida) y amarillo (disparo rápido durante 6 s). El récord se guarda en el dispositivo.

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

- `src/shooter/sim.ts`: simulación pura del shooter (movimiento, oleadas, colisiones). Testeable sin navegador.
- `src/shooter/main.ts`: render 3D, joysticks táctiles, ratón y teclado, HUD y partículas.
- `src/shooter/audio.ts`: efectos de sonido sintetizados con WebAudio (no usa archivos de audio).
- `src/tres/game.ts`: lógica del tres en raya (tablero, líneas, victoria, IA).
- `src/tres/main.ts`: escena 3D del tres en raya.
- `src/**/*.test.ts`: tests (`npm test`).
