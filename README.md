# Juegos de Dylan

**Shooter 2027**: juego 3D para navegador, Android e iOS. La app abre directamente el juego (`index.html`); `juegos.html` lista los juegos incluidos.

- **Shooter 2027** (`index.html`): shooter de oleadas de día en un campo de batalla, con tienda de armas y herramientas.
- **Tres en Raya 3D** (`tres-en-raya.html`, incluido como juego extra): tres en raya en un cubo de 4×4×4 o 3×3×3.
- **Supermercado** (`supermercado.html`, incluido como juego extra): gestión de una tienda en 3D.

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
- PC: WASD para moverte, el ratón para apuntar, clic para disparar, 1-9 y 0 o Q/E para cambiar de arma.
  Equipo: T (torreta), G (mina), F (escudo), B (barricada), Z (ataque aéreo), X (pulso EMP), C (señuelo). V abre el menú de construir.
- Pausa: botón de pausa arriba a la derecha (o P / Esc en PC). El juego también se pausa solo si cambias de app o de pestaña.

**Soldados para elegir** (antes de cada partida; cada uno con su aspecto y una ventaja):

| Soldado | Rol | Ventaja |
|---|---|---|
| Sargento | Asalto | Equilibrado; empieza con un escudo de energía |
| Coloso | Pesado | +2 de vida máxima, más lento |
| Halcón | Explorador | 20 % más rápido, 1 de vida menos |
| Ingeniera | Construcción | Empieza con 8 de madera y gana el doble por oleada |
| Tiradora | Precisión | +25 % de daño con todas las armas |

**Robots enemigos** (muestran su barra de vida al recibir daño):

- **Araña** (roja, rápida) y **tanque** (morado, orugas y torreta que te apunta) desde el principio.
- **Artillero** (naranja, bípedo con cañón; dispara si te ve y te busca si te escondes).
- **Kamikaze** (amarillo y negro, desde la oleada 3): rueda hacia ti y explota al tocarte a ti o a tu base. Si lo derribas antes, la explosión daña a los robots de alrededor.
- **Dron** (verde azulado, desde la oleada 4): vuela por encima de rocas, muros y barricadas.
- **Enjambre** (violeta, desde la oleada 2): robots diminutos y muy rápidos que llegan de 4 en 4.
- **Escudero** (azul acero, desde la oleada 5): su escudo antidisturbios para las balas de frente. Gira despacio, así que rodeándolo se le da por la espalda; el fuego, el rayo Tesla y las explosiones lo atraviesan, y el escudo se rompe tras aguantar bastante daño.
- **Tirador** (gris, desde la oleada 6): se queda lejos, apunta un segundo con un láser rojo visible y dispara una bala muy rápida. Cuando veas el láser, muévete.
- **Reparador** (blanco con cruz verde, desde la oleada 7): no ataca; repara a los robots de su alrededor. Conviene ir a por él primero.
- **Jefe** (cada 5 oleadas): coloso blindado con mucha vida (más con más jugadores) que dispara abanicos de 7 balas. Su vida se ve arriba en el HUD y al caer suelta botiquines y monedas.

**Campo de batalla:** de día, con cielo, sombras de nubes en movimiento, caminos de tierra, hierba y flores.
Rocas, árboles y sacos terreros paran las balas; las cajas se rompen y sueltan monedas, vida o disparo rápido.
El mapa cambia en cada partida.

**Al superar cada oleada** recuperas toda la vida (los caídos vuelven con la vida completa al empezar la siguiente).

**Tienda** (precios en monedas; al terminar cada oleada; cada robot da monedas y hay un bonus por oleada):

| Armas | Precio | Mejoras | Precio | Equipo (botón) | Precio |
|---|---|---|---|---|---|
| Subfusil | 60 | Armadura (+1 vida máx., ×3) | 50 | Torreta (dispara sola 30 s) | 50 |
| Fusil de asalto | 100 | Botas (+12% velocidad, ×2) | 40 | Mina (explota al pasar un robot) | 25 |
| Escopeta | 90 | Munición pesada (+30% daño, ×2) | 70 | Escudo (5 s invulnerable) | 45 |
| Ametralladora (te frena al disparar) | 180 | Imán (atrae monedas) | 40 | Barricada (muro que para balas enemigas) | 30 |
| Lanzallamas | 120 | Regeneración (+1 vida/15 s) | 80 | Ataque aéreo (5 bombas en línea) | 80 |
| Francotirador (atraviesa) | 140 | Dron escolta (×2) | 90 | Pulso EMP (paraliza 3 s) | 60 |
| Cañón Tesla (salta a 3 robots) | 200 | | | Señuelo (atrae a los robots 8 s) | 35 |
| Lanzagranadas | 160 | | | | |
| Lanzacohetes | 220 | | | | |

**Armadura:** cada nivel suma 1 de vida máxima; **al nivel máximo (3), cada golpe tiene un 30% de probabilidad de no hacer daño** (aparece "Bloqueado").

**Base (madera):** al superar cada oleada ganas madera (3 + número de oleada). Con el botón del martillo (o V, o la cruceta
abajo del mando), y también desde la tienda entre oleadas, construyes delante de ti:

| Estructura | Madera | Qué hace |
|---|---|---|
| Muro de madera | 4 | Tres tramos que frenan a los robots y paran sus balas (tus balas sí pasan) |
| Pinchos | 5 | Dañan y frenan a los robots que los pisan |
| Puesto médico | 10 | Cura 1 de vida cada 6 s si estás cerca |
| Torre de guardia | 12 | Ametralladora permanente que dispara sola |

Los robots no rodean tus estructuras: **las atacan** hasta romperlas (cada una muestra su barra de vida al dañarse).

**Gráficos y rendimiento:** si el dispositivo no llega a 40 FPS en los primeros segundos, el juego quita las sombras
reales (pone sombras simples bajo los personajes) y baja la resolución. Se puede forzar con `index.html?calidad=alta`
o `?calidad=baja`.

### Multijugador cooperativo en línea

Con conexión, al pulsar **Jugar** tu partida es un **servidor público** con nombre aleatorio ("Halcón Dorado 27") al
que pueden unirse otros, hasta **7**. Título > **Multijugador** muestra la lista de esas partidas en marcha, con cuántos
juegan (x/7) y si están en batalla o en la tienda; se entra tocando una. No hay que escribir nada: tu nombre es tu
soldado y un número ("Coloso 2"). Sin conexión se juega solo, como siempre. La pausa detiene la partida si todos pausan.

Cada jugador tiene sus monedas, madera, armas y equipo; la puntuación es del equipo. Las oleadas crecen un 50 % por
jugador extra. Si caes, vuelves al terminar la oleada; la partida acaba cuando cae todo el equipo y la sala empieza otra
sola a los 8 segundos. La tienda dura 30 segundos o hasta que todos pulsan "Estoy listo".

En el menú de la partida se puede **bloquear** o **denunciar** a un jugador. Ver `docs/TIENDAS.md`.

```bash
npm run start                      # compila y arranca el servidor de juego en http://localhost:8080
PORT=9000 npm run server           # solo el servidor (sirve dist/ y el WebSocket en /ws)
npm run dev                        # desarrollo: Vite redirige /ws al servidor del puerto 8080
```

Servidor de partidas en Render (la web de dylanj.kedasrd.com se conecta a él): ver `render.yaml` y `docs/TIENDAS.md`.
En producción el servidor debe ir detrás de HTTPS/WSS. Para las apps nativas, compilar con
`VITE_SERVER_URL=wss://tu-servidor/ws npm run build`; en el navegador también vale `?servidor=wss://...`.

## Tres en Raya 3D

**Controles:** arrastra para girar el cubo, pellizca o usa la rueda para hacer zoom, toca una esfera para jugar.
El control "Separar capas" abre el cubo para ver las casillas del interior.

**Reglas**

- Gana quien alinea N fichas en cualquier dirección: filas, columnas, pilares y diagonales de capa y del espacio
  (76 líneas en 4×4×4 y 49 en 3×3×3).
- En 3×3×3 el centro está **bloqueado**. Si no, el primer jugador gana casi siempre tomándolo.

## Supermercado

Dirige un supermercado en 3D (vista de casa de muñecas: las paredes que tapan el interior se bajan solas).

- **Preparación:** antes de abrir, compra género en el **ordenador** (oficina, abajo a la izquierda) con el dinero de la caja
  y **repón** las estanterías tocando cada mueble (o desde el botón Reponer). Las compras llegan al almacén al momento.
- **Empezar turno:** la tienda abre de 8:00 a 20:00 (150 s). Los clientes entran, recorren la tienda con su lista y hacen cola.
- **Cobrar:** cada toque en la caja (o Espacio) pasa un artículo; al pasar el último, el cliente paga.
- **Recursos limitados:** el dinero y el género. Si un producto se agota, el cliente se enfada; si espera demasiado en la cola,
  deja la compra y se va. La reputación (0-100) decide cuántos clientes llegan.
- **Fin de turno:** resumen con clientes, ingresos, gastos y beneficio. La partida se guarda en el dispositivo entre turnos.

| Producto | Caja (uds.) | Coste caja | Venta/ud. |
|---|---|---|---|
| Pan de molde | 8 | 12 | 3 |
| Leche | 6 | 12 | 4 |
| Yogur | 8 | 10 | 2 |
| Queso | 4 | 14 | 6 |
| Cereales | 6 | 15 | 5 |
| Galletas | 10 | 12 | 2 |
| Refresco | 12 | 14 | 2 |
| Agua | 12 | 8 | 1 |
| Manzanas | 20 | 10 | 1 |

Código: `src/super/sim.ts` (reglas puras con tests, caminos A* de los clientes), `models.ts` (modelos 3D),
`textures.ts` (texturas dibujadas por código, sin imágenes externas) y `main.ts` (escena e interfaz).

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
- `src/shooter/protocol.ts`: mensajes y formato compacto de las instantáneas del modo en línea.
- `src/shooter/net.ts`: cliente en línea (conexión, suavizado y predicción del movimiento propio).
- `src/shooter/moderation.ts`: filtro de nombres (lo usan servidor y cliente).
- `server/index.ts`: servidor del modo en línea (salas, simulación autoritativa a 60 Hz, denuncias).
- `src/shooter/audio.ts`: efectos de sonido sintetizados con WebAudio (no usa archivos de audio).
- `src/tres/game.ts`: lógica del tres en raya (tablero, líneas, victoria, IA).
- `src/tres/main.ts`: escena 3D del tres en raya.
- `src/**/*.test.ts`: tests (`npm test`).

## Dispositivos

- **Android** (teléfonos, tabletas, Chromebooks) e **iOS** (iPhone y iPad): proyectos nativos en `android/` e `ios/` (identificador `com.dylan.shooter2027`).
- **Navegador** en PC, Mac y Linux: instalable y jugable sin conexión tras la primera carga.
- **Controles:** táctil (dos joysticks), teclado y ratón, y **mando** (Xbox, PlayStation, genéricos): stick izquierdo para moverte, stick derecho o RT para disparar, LB/RB para cambiar de arma, X torreta, Y escudo, B mina, LT barricada, Start pausa.
- Vertical y horizontal, de 320 px de ancho a monitores de 2560 px.

## Publicación en tiendas

Normas del proyecto (sin emojis, iconos SVG, cumplimiento de tiendas) en `CLAUDE.md`.
Estado del cumplimiento, decisiones pendientes y pasos para publicar en `docs/TIENDAS.md`.

- Ajustes del juego: sonido, calidad gráfica y temblor de cámara (se guardan solo en el dispositivo).
- Tipografías Oswald e Inter empaquetadas en la app (licencia SIL OFL 1.1).
- Política de privacidad: `privacidad.html`. Créditos y licencias: `creditos.html`.
- Iconos y pantallas de carga: `node scripts/recursos.cjs` (a partir de `resources/*.svg`).
