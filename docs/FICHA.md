# Ficha de Shooter 2027 en App Store y Google Play

Textos listos para copiar en App Store Connect y Google Play Console. Versión 1.0.0 (Android `versionCode 1`, iOS build 1).
Lo marcado como **(pendiente)** lo tiene que decidir o rellenar el propietario.

## Datos básicos

| Campo | Valor |
|---|---|
| Nombre | Shooter 2027 |
| Identificador (bundle / paquete) | `com.dylan.shooter2027` |
| Categoría | Juegos > Acción (secundaria en Apple: Arcade) |
| Precio | **(pendiente)** gratis o de pago; sin compras integradas ni anuncios |
| Idioma principal | Español (España) |
| Política de privacidad | `https://dylanj.kedasrd.com/privacidad.html` (una vez subida la web nueva) |
| URL de soporte (Apple la exige) | **(pendiente)** una página con un correo de contacto |
| Correo de contacto | **(pendiente)** |
| Copyright | 2026 **(pendiente: nombre del responsable)** |

## Textos

**Subtítulo (Apple, máx. 30):**
Oleadas de robots en 3D

**Descripción breve (Google, máx. 80):**
Defiende la línea contra oleadas de robots, solo o en equipo con tus amigos.

**Texto promocional (Apple, máx. 170):**
Elige a tu soldado, construye tu base y resiste oleadas de robots cada vez más duras. Cada 5 oleadas llega un jefe. Juega solo o en línea con hasta 7 jugadores.

**Palabras clave (Apple, máx. 100, separadas por comas):**
disparos,robots,oleadas,acción,cooperativo,multijugador,soldado,armas,base,defensa,arcade,3d

**Descripción completa:**

Defiende la línea en un campo de batalla en 3D contra oleadas de robots que no dejan de crecer.

ELIGE A TU SOLDADO
Cinco soldados, cada uno con su estilo: el Sargento equilibrado, el Coloso con más vida, el Halcón más rápido, la Ingeniera que construye más y la Tiradora que hace más daño.

ARMAS Y EQUIPO
Diez armas, de la pistola al lanzacohetes, pasando por el lanzallamas, el francotirador y el cañón Tesla. Torretas, minas, escudos, ataques aéreos, pulsos EMP, señuelos y drones escolta.

CONSTRUYE TU BASE
Gana madera al superar oleadas y levanta muros, pinchos, puestos médicos y torres de guardia. Los robots las atacarán para llegar hasta ti.

ENEMIGOS QUE TE PONEN A PRUEBA
Arañas veloces, artilleros, tanques, kamikazes que explotan al tocarte, drones que vuelan por encima de tus muros y un jefe blindado cada 5 oleadas.

JUEGA CON AMIGOS
Elige un servidor de la lista, mira cuántos están jugando y únete a la batalla al momento, hasta 7 jugadores por servidor. Sin escribir nombres ni crear cuentas.

PENSADO PARA TODOS LOS DISPOSITIVOS
Controles táctiles, teclado y ratón o mando. Funciona sin conexión en solitario. Sin anuncios, sin compras integradas y sin cuentas.

## Capturas

Se generan con `node scripts/capturas.cjs` (con el servidor en marcha) en `store/capturas/`:

| Archivo | Tienda | Tamaño |
|---|---|---|
| `iphone-6.9-*.png` | App Store, iPhone 6,9" | 1320 x 2868 |
| `ipad-13-*.png` | App Store, iPad 13" | 2064 x 2752 |
| `android-*.png` | Google Play, teléfono | 1080 x 1920 |
| `google-play-destacada-1024x500.png` | Google Play, imagen destacada | 1024 x 500 |
| `google-play-icono-512.png` | Google Play, icono | 512 x 512 |

Orden recomendado: jefe (2), soldados (3), servidores (5), tienda (4), título (1).

## Notas para la revisión de Apple

> Shooter 2027 no necesita cuenta. El modo de un jugador funciona sin conexión.
> El modo en línea (Multijugador) muestra una lista de servidores con el número de jugadores conectados; basta con tocar uno para entrar. Para probar con dos dispositivos, elija el mismo servidor en ambos.
> Los jugadores no escriben ningún texto: los nombres son automáticos y no hay chat. Desde el menú de la partida (botón de pausa) se puede bloquear y denunciar a otros jugadores.

## Antes de enviar (bloqueantes)

1. **Servidor en línea funcionando** (Render, ver `docs/TIENDAS.md`) y la app compilada con su dirección: `VITE_SERVER_URL=wss://<servicio>.onrender.com/ws npm run build && npx cap sync`. Si el revisor abre el modo en línea y no conecta, Apple rechaza la app por funcionalidad rota (norma 2.1).
2. Correo de contacto y responsable en `privacidad.html` y en la ficha.
3. URL de soporte.
4. Público objetivo (si incluye menores de 13 años cambian los requisitos; ver `docs/TIENDAS.md`).
5. Cuentas: Apple Developer Program y Google Play Console.

## Pasos de publicación

**Google Play**
1. Play Console > Crear app (Shooter 2027, juego, gratis o de pago).
2. Android Studio (`npx cap open android`) > Build > Generate Signed App Bundle. Guardar la clave de firma en lugar seguro.
3. Subir el `.aab` a Pruebas internas y probarlo en un móvil.
4. Cuentas personales nuevas: prueba cerrada con testers durante unos días antes de producción **(comprobar requisitos actuales)**.
5. Rellenar ficha, clasificación de contenido, seguridad de los datos (respuestas en `docs/TIENDAS.md`), público objetivo y anuncios (no tiene).
6. Enviar a producción.

**App Store**
1. App Store Connect > Nueva app con el bundle `com.dylan.shooter2027`.
2. En un Mac: `npx cap open ios` > equipo de firma > Product > Archive > Distribuir a App Store Connect.
3. Probar con TestFlight.
4. Rellenar ficha, capturas, privacidad de la app y clasificación por edades (marcar interacción entre usuarios).
5. Añadir las notas para la revisión de arriba y enviar.
