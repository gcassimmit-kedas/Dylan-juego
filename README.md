# Tres en Raya 3D

Tres en raya en un cubo 3D (4×4×4 o 3×3×3) para navegador, Android e iOS.

**Stack:** TypeScript + [Three.js](https://threejs.org) (render 3D) + Vite (build) + Capacitor (apps móviles).
Un solo código para las tres plataformas.

## Jugar en local

```bash
npm install
npm run dev      # abre http://localhost:5173 (también accesible desde el móvil en la misma red)
npm test         # tests de la lógica y la IA
npm run build    # genera dist/ para publicar en cualquier hosting estático
```

**Controles:** arrastra para girar el cubo, pellizca o usa la rueda para hacer zoom, toca una esfera para jugar.
El control "Separar capas" abre el cubo para ver las casillas del interior.

## Reglas

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

- `src/game.ts`: lógica pura (tablero, líneas, victoria, IA). No depende de Three.js.
- `src/main.ts`: escena 3D, entrada táctil y de ratón, HUD.
- `src/game.test.ts`: tests (`node --test`).
