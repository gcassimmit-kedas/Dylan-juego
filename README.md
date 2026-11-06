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
- Móvil: el pulgar izquierdo mueve y el derecho apunta y dispara. Abajo está la barra de armas y a la derecha el equipo.
- PC: WASD para moverte, el ratón para apuntar, clic para disparar, 1-7 o Q/E para cambiar de arma.
  Equipo: T (torreta), G (mina), F (escudo), B (barricada).

**Personajes:** tu soldado (casco, chaleco, mochila, piernas animadas; el arma cambia en la mano) contra tres robots:
araña (roja, rápida), artillero (naranja, bípedo con cañón; dispara si te ve y te busca si te escondes) y tanque
(morado, con orugas y torreta que te apunta). Los robots muestran su barra de vida al recibir daño.

**Campo de batalla:** de día, con cielo, sombras de nubes en movimiento, caminos de tierra, hierba y flores.
Rocas, árboles y sacos terreros paran las balas; las cajas se rompen y sueltan monedas, vida o disparo rápido.
El mapa cambia en cada partida.

**Tienda** (al terminar cada oleada; cada robot da monedas y hay un bonus por oleada):

| Armas | 🪙 | Mejoras | 🪙 | Equipo (botón) | 🪙 |
|---|---|---|---|---|---|
| Subfusil | 60 | Botiquín (+2 vida) | 20 | Torreta (dispara sola 30 s) | 50 |
| Escopeta | 90 | Armadura (+1 vida máx., ×3) | 50 | Mina (explota al pasar un robot) | 25 |
| Lanzallamas | 120 | Botas (+12% velocidad, ×2) | 40 | Escudo (5 s invulnerable) | 45 |
| Francotirador (atraviesa) | 140 | Munición pesada (+30% daño, ×2) | 70 | Barricada (muro que para balas enemigas) | 30 |
| Lanzagranadas | 160 | Imán (atrae monedas) | 40 | | |
| Lanzacohetes | 220 | Regeneración (+1 vida/15 s) | 80 | | |
| | | Dron escolta (×2) | 90 | | |

**Gráficos y rendimiento:** si el dispositivo no llega a 40 FPS en los primeros segundos, el juego quita las sombras
reales (pone sombras simples bajo los personajes) y baja la resolución. Se puede forzar con `shooter.html?calidad=alta`
o `?calidad=baja`.

## Multijugador (Frente de Batalla)

Cooperativo de hasta **8 jugadores por sala** contra las oleadas de robots. Cada uno tiene sus monedas, su tienda,
sus armas y su equipo; los robots van a por el jugador vivo más cercano. Quien cae vuelve en la siguiente oleada;
si caen todos, la sala empieza otra partida sola a los 8 segundos. La tienda dura 30 s o hasta que todos pulsan "Listo".

**Salas**
- 🌍 **Servidor público principal**: siempre existe; si se llena (8), se abre automáticamente "Servidor principal 2".
- **Salas públicas**: cualquiera las crea y salen en la lista.
- 🔒 **Salas privadas**: no salen en la lista; se entra con un código de 5 caracteres (sin 0/O ni 1/I).

**Arrancar el servidor** (sirve también la web):

```bash
npm install
npm start            # compila y arranca en http://localhost:8080  (PORT=xxxx para otro puerto)
```

- **En casa (misma Wi-Fi):** abre `http://IP-DEL-ORDENADOR:8080/shooter.html` en cada dispositivo → "Multijugador".
- **Desarrollo:** `npm run server` en una terminal y `npm run dev` en otra (Vite reenvía `/ws` al puerto 8080).
- **En internet:** hay que desplegar el servidor en un hosting que admita WebSockets y procesos Node siempre encendidos
  (Fly.io, Railway, Render, un VPS…). Hay un `Dockerfile` listo: `docker build -t frente-de-batalla . && docker run -p 8080:8080 frente-de-batalla`.
  Ponlo detrás de HTTPS: los navegadores (y las apps de iOS) exigen `wss://` cuando la página va por `https://`.
- **Apps (Capacitor):** la app no se sirve desde el servidor, así que hay que decirle dónde está al compilar:
  `VITE_SERVER_URL=wss://tu-servidor.com/ws npm run cap:sync`. También se puede probar con `shooter.html?servidor=wss://…`.

**Cómo funciona por dentro**
- El servidor (`server/index.ts`) ejecuta la **misma simulación** que el modo un jugador, a 60 pasos por segundo,
  y manda 20 instantáneas por segundo (~22 KB/s por jugador). Los clientes solo envían su entrada: no se puede hacer
  trampa cambiando el código del navegador.
- El cliente (`src/shooter/net.ts`) suaviza el movimiento entre instantáneas y **predice tu propio movimiento**
  para que no notes el retardo al andar. Disparar sí tiene el retardo de la conexión (ida y vuelta al servidor).
- El servidor valida todo lo que llega (nombres, entradas, compras), limita mensajes por segundo y, si un jugador
  deja de mandar datos más de 1 s (pestaña oculta, red caída), lo deja quieto.

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
- `src/shooter/protocol.ts`: mensajes de red y codificación compacta de las instantáneas (compartido con el servidor).
- `src/shooter/net.ts`: cliente multijugador (conexión, suavizado, predicción).
- `server/index.ts`: servidor de salas (HTTP + WebSocket).
- `src/shooter/audio.ts`: efectos de sonido sintetizados con WebAudio (no usa archivos de audio).
- `src/tres/game.ts`: lógica del tres en raya (tablero, líneas, victoria, IA).
- `src/tres/main.ts`: escena 3D del tres en raya.
- `src/**/*.test.ts`: tests (`npm test`).
