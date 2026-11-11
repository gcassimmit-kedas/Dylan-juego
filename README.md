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

Dirige un supermercado en 3D **en primera persona**: eres el empleado y caminas por la tienda (en el menú se ve
la tienda desde arriba). Ordenador: WASD o flechas (Mayús corre), clic para mirar con el ratón (L o Esc lo sueltan),
E o clic para usar lo que hay en el punto de mira. Móvil y tableta: joystick en la mitad izquierda, arrastrar en la
derecha para mirar y botón amarillo para usar. Para reponer, pedir o cobrar hay que ir hasta el mueble, el ordenador
o la caja.

- **Preparación:** antes de abrir, compra género en el **ordenador** (oficina, abajo a la izquierda) con el dinero de la caja
  y **repón** las estanterías tocando cada mueble (o desde el botón Reponer). Las compras llegan al almacén al momento.
- **Empezar turno:** la tienda abre de 8:00 a 20:00 (150 s). Los clientes entran, recorren la tienda con su lista y hacen cola.
- **Cobrar (en 3D):** "Ir a la caja" acerca la cámara al mostrador. El cliente pone su compra en la cinta y hay que
  **arrastrar cada producto hasta el escáner** (pasarlo por encima del cristal basta). Al pasar el último, paga con un
  billete de pesos: se abre el cajón y hay que **dar la vuelta** sacando monedas de 5, 10 y 25 y billetes de 50, 100, 200 y 500 a la bandeja,
  y pulsar "Dar cambio". El panel dice cuánto hay que devolver y cuánto llevas. Si falta, el cliente espera; si sobra, se pierde la diferencia.
  Unos 4 de cada 10 clientes **pagan con tarjeta**: la dejan junto al datáfono, que muestra el importe, y se cobra con "Cobrar con tarjeta" (sin cambio). En vertical la cámara gira para
  que el mostrador ocupe la pantalla. Teclado: Espacio pasa un producto, 1-7 sacan dinero, Retroceso deshace, Intro da el cambio.
- **Recursos limitados:** el dinero y el género. Si un producto se agota, el cliente se enfada; si espera demasiado en la cola,
  deja la compra y se va. La reputación (0-100) decide cuántos clientes llegan.
- **Fin de turno:** resumen con clientes, ingresos, gastos y beneficio. La partida se guarda en el dispositivo entre turnos.

Precios en pesos dominicanos (RD$): nada cuesta 50 o menos y todo es múltiplo de 5. Se empieza con RD$1500. Las fresas y las uvas son difíciles de conseguir: el proveedor solo tiene 0, 1 o 2 cajas
al día, y si un cliente no las encuentra no se enfada.

| Producto | Caja (uds.) | Coste caja | Venta/ud. |
|---|---|---|---|
| Pan de molde | 8 | 520 | 120 |
| Leche | 6 | 250 | 75 |
| Yogur | 8 | 260 | 60 |
| Queso | 4 | 550 | 250 |
| Cereales | 6 | 720 | 220 |
| Galletas | 10 | 360 | 65 |
| Refresco | 12 | 630 | 95 |
| Agua | 12 | 360 | 55 |
| Manzanas | 20 | 660 | 60 |
| Guineos | 12 | 460 | 70 |
| Fresas (difícil de conseguir) | 6 | 1150 | 350 |
| Uvas (difícil de conseguir) | 6 | 1150 | 350 |

Versión de una sola página (todo dentro de un HTML, para publicarla sin servidor): `node scripts/artifact.mjs N`
genera `dist-artifact/supermercado-vN.html` con el título "Supermercado versión N". Cada actualización se publica
como una página nueva con el número siguiente, así las versiones anteriores siguen disponibles.

**Dos cajas y multijugador de dos personas** (solo en la página publicada en claude.ai, con la capacidad `room`):
el botón "Multijugador" abre una lista fija de 6 servidores con su estado (vacío, 1 jugador esperando y su día,
o lleno); los que tienen a alguien esperando salen primero. Al entrar en un servidor vacío, la partida es la tuya
(con tu tienda guardada, caja 1); si tu amigo entra en el mismo servidor desde otro dispositivo, se une a ella
(caja 2). Si dos entran a la vez en uno vacío, el juego decide solo quién es el anfitrión. Cada uno tiene su dinero
(lo que cobra en su caja y lo que gasta en el ordenador); el almacén y las estanterías son de los dos y cada
uno ve las compras del otro. En el ordenador hay **mejoras de caja** (música relajante, bote de propinas) que
se pueden comprar para la propia caja o regalar a la del otro. La pausa es compartida y el anfitrión puede
sacar al invitado. Cada jugador elige su **aspecto** (botón "Aspecto": 6 ropas y 5 tonos de piel, guardado en el
dispositivo) y el otro le ve con él; los nombres los pone el juego (Jugador 1 y Jugador 2) y no se pueden cambiar. Jugando solo, la caja 2 está cerrada.
Cómo funciona: el anfitrión simula la tienda y publica en su "presencia" una foto compacta del estado
(`src/super/sync.ts`, menos de 4 KiB); el invitado la dibuja y manda sus acciones por su presencia, y el anfitrión
las valida (`aplicarAccion`). Nadie escribe nada: no hay nombres ni chat. En la app (iOS/Android) no existe
`window.claude`, así que el botón no aparece; llevarlo a la app exigiría el servidor (`server/index.ts`) y
actualizar antes la privacidad, según la constitución del proyecto.

**Todos los dispositivos:** móvil (vertical y apaisado), tableta y ordenador, con ratón, dedo o teclado. La calidad
gráfica se ajusta sola si el dispositivo va lento (en Pausa se puede fijar en Alta o Baja); hay botón de pantalla
completa donde el navegador lo permite, y un aviso claro si el dispositivo no tiene gráficos 3D (WebGL 2).
Se compila para navegadores desde Safari 14 / Chrome 87.

Código: `src/super/sim.ts` (reglas puras con tests, caminos A* de los clientes), `models.ts` (modelos 3D),
`textures.ts` (texturas dibujadas por código, sin imágenes externas), `checkout.ts` (la caja en 3D), `player.ts` (primera persona),
`sync.ts` y `multi.ts` (multijugador) y `main.ts` (escena e interfaz).

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
