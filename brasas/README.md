# Brasas en Cloudflare

El juego Brasas (`../public/brasas/index.html`, un solo archivo con Three.js r128) desplegado como **un único Worker de Cloudflare**:

| Pieza | Para qué |
|---|---|
| Static Assets (`../public/brasas/`) | sirve el juego, `claude-shim.js` y `three.min.js` (r128, incluido para no depender de un CDN) |
| Durable Object `Sala` (`src/worker.js`) | una instancia por sala: `lobby`, `bosque-1`..`bosque-4`, `pinar-1`, `pinar-2`, `cueva-1`, `cueva-2`. WebSockets con hibernación; la presencia de cada jugador se reenvía a los demás y quien entra recibe el estado completo |
| D1 (`brasas`) | cuentas sin registro (solo el hash del token) y documentos JSON del guardado |

No se usa Cloudflare Pages: un proyecto de Pages no puede definir clases de Durable Objects, y con Workers + Static Assets todo va en un solo despliegue.

## Cómo encaja con el juego

El juego se escribió para la API `window.claude.use('room' | 'db' | 'user')`. `../public/brasas/claude-shim.js` la implementa sobre este Worker, así que la lógica del juego no se ha tocado. Cambios en `index.html` respecto al original (`terreno-3d.original.html`):

1. `<script src="claude-shim.js">` antes de Three.js, y Three.js r128 servido desde la propia carpeta en lugar de cdnjs.
2. El texto "abre el juego desde su enlace de Claude" pasa a "No se pudo conectar con los servidores...".
3. El botón de ayuda usa un icono SVG en lugar del carácter "?", y en la app aparece "Más juegos" para volver al menú.
4. En el panel Servidores, el **código de jugador**: se copia en un aparato y se pega en otro ("Usar otro código") para recuperar la misma cuenta y las mismas cosas.

### API del shim

- `room`: `presence(parche)` (se agrupa y se envía como mucho ~20 veces por segundo; máximo 4 KB), `peers()`, `onPeers(fn, onError)` (devuelve la función para cancelar), `join(nombre)` y `connected()`. La sala tiene además `leave()`. Al reconectar se reenvía la presencia completa. `onError` solo se llama si la conexión no vuelve en 45 s (lobby) o 20 s (sala), o si la sala está llena.
- `db`: `doc('servidores/<id>')` y `collection('data/users/<uid>').doc(<id>)`, con `get()` -> `{ exists, data() }`, `set(obj)` y `delete()`. Los errores llevan `code` (`invalid_argument`, `permission_denied`, `unauthenticated`, `unavailable`).
- `user`: `id()` devuelve el uid estable.

### Reglas del servidor

- Cuentas: `POST /api/user/new` crea `uid` + `token` al azar. El navegador los guarda en `localStorage`; D1 solo guarda el SHA-256 del token. Límite de 10 cuentas por minuto e IP.
- Documentos: `servidores/<uno de los 8 servidores>` lo leen y escriben todos los jugadores con cuenta. `data/users/<uid>/<id>` solo lo lee y escribe el dueño de ese uid (403 para cualquier otro). Máximo 8 KB por documento (400 si se pasa) y 50 documentos por jugador. Cualquier otra ruta da 403.
- Salas: solo existen las 9 de la lista. Como mucho 10 jugadores por servidor (300 en el lobby); el 11º recibe `full` y el juego ya lo muestra como "Lleno". Hay un límite de 25 mensajes por segundo por conexión, con ráfagas de hasta 50; si se descartan más de 200 mensajes, se cierra el socket. Los mensajes pueden ocupar hasta 8 KB y la presencia hasta 4 KB. Un socket que pasa 60 s sin enviar nada, ni el latido de cada 20 s, se cierra.
- Nada se ejecuta ni se inserta como HTML. Los nombres viajan como texto y el juego los pinta con `textContent` y en un canvas.
- No hay secretos en el repositorio ni hacen falta variables secretas.

## Probar en local

Requisitos: Node 20 o superior.

```sh
cd brasas
npm install
npx wrangler d1 migrations apply brasas --local
npx wrangler dev
```

Abre `http://localhost:8787` en dos navegadores (o en una ventana normal y otra privada), entra al mismo servidor desde los dos y ya os veis. En local no hace falta el `database_id` real: wrangler usa una base de datos de prueba en `.wrangler/`.

## Desplegar

```sh
cd brasas
npm install
npx wrangler login
npx wrangler d1 create brasas
```

`d1 create` imprime un `database_id`. Pégalo en `wrangler.toml`, en lugar de `PEGA-AQUI-EL-ID-DE-D1`. Después:

```sh
npx wrangler d1 migrations apply brasas --remote
npx wrangler deploy
```

El juego queda en `https://brasas.<tu-subdominio>.workers.dev`.

Qué tiene que tener tu cuenta de Cloudflare:

- **Workers**: el plan gratuito vale. Los Durable Objects con SQLite, que son los que usa `new_sqlite_classes`, también funcionan en el plan gratuito.
- **D1**: una base de datos llamada `brasas`, creada con el comando de arriba.
- **Nombre del proyecto**: `brasas`, el campo `name` de `wrangler.toml`. Si lo cambias, cambia también la URL.
- **Limitador de cuentas**: `namespace_id = "1001"` en `[[ratelimits]]` es un número que eliges tú. Si ya usas el 1001 en otro limitador de tu cuenta, pon otro.
- **Dominio propio (opcional)**: en el panel, Workers > brasas > Settings > Domains & Routes.

## Pendiente o a tener en cuenta

- Los archivos del juego están en `public/brasas/` del repositorio, la misma carpeta que empaqueta la app de Shooter 2027 (menú "Más juegos"). En la app no hay servidor de Brasas, así que allí se juega solo; el multijugador funciona en el despliegue de Cloudflare.
- El código de jugador funciona como una contraseña: quien lo tenga juega con esa cuenta. El panel lo avisa.
- El token viaja en la URL del WebSocket, porque los navegadores no permiten cabeceras en WebSocket. Va cifrado con WSS, pero puede quedar en los registros de tu propia cuenta de Cloudflare.
