# Publicación en App Store y Google Play

Estado a 7 de noviembre de 2026. Los requisitos de las tiendas cambian cada año: lo marcado como **(comprobar)**
debe verificarse en la documentación oficial justo antes de enviar.

## Ya cumplido en el código

- [x] Sin emojis; iconos SVG profesionales (Lucide + propios con el mismo estilo).
- [x] El juego va empaquetado entero dentro de la app: funciona sin conexión, sin CDN ni recursos externos (regla 4.2 de Apple: no es una web envuelta).
- [x] Sin cuentas, publicidad, analítica ni SDK de terceros. En solitario no sale ningún dato del dispositivo; el modo en línea (opcional) solo trata lo descrito en la sección "Modo en línea".
- [x] Política de privacidad dentro de la app (`privacidad.html`), accesible desde el menú y desde Ajustes.
- [x] Créditos y licencias completas de las librerías (`creditos.html`).
- [x] Pantalla de Ajustes: sonido, calidad gráfica (automática/alta/baja) y temblor de cámara.
- [x] Pausa manual y automática al pasar a segundo plano. En línea no se puede detener a los demás: al salir de la app el soldado se queda quieto y deja de disparar (el servidor lo hace también si deja de recibir al jugador).
- [x] Accesibilidad básica: botones con `aria-label`, foco visible, "reducir movimiento" desactiva el temblor de cámara.
- [x] Áreas seguras (notch, barra de gestos) y diseño de móvil a escritorio.
- [x] Icono (1024 px, sin transparencia para iOS), icono adaptativo de Android (primer plano + fondo) y pantallas de carga en `resources/`.
- [x] Sin permisos del sistema salvo `INTERNET` en Android, usado solo por el modo en línea.
- [x] Identificador permanente: **`com.dylan.shooter2027`** (fijado el 7 de noviembre de 2026; ya no debe cambiarse).
- [x] Proyectos nativos generados y versionados (`android/`, `ios/`) con iconos y pantallas de carga de todos los tamaños.
- [x] Android: SDK objetivo 36, mínimo Android 7 (API 24); teléfonos, tabletas y Chromebooks; pantalla completa inmersiva.
- [x] iOS: iPhone y iPad (iOS 15 o superior), todas las orientaciones, sin barra de estado, `ITSAppUsesNonExemptEncryption = NO`.
- [x] Navegador (PC, Mac, Linux, Chromebook): instalable y jugable sin conexión tras la primera carga (service worker generado al compilar).
- [x] Mandos (Xbox, PlayStation y genéricos) en PC, Android y iPad; se pausa si el mando se desconecta.
- [x] Probado en 13 tamaños de pantalla, de un iPhone SE en horizontal (568×320) a un monitor de 2560×1440.
- [x] Nombre de la app: **Shooter 2027** (decidido el 7 de noviembre de 2026). La app abre directamente el juego; Tres en Raya 3D va incluido como juego extra en "Otros juegos". "Shooter" es una palabra genérica muy usada en las tiendas: acompañarla de un subtítulo descriptivo en la ficha (por ejemplo, "oleadas de robots") para que se encuentre en las búsquedas.

## Decisiones pendientes (del propietario)

1. **Público objetivo.** Si el público incluye menores de 13 años, Google aplica la política de Familias y Apple la categoría Niños, con requisitos extra. Si no se apunta a niños, declararlo así en ambas tiendas.
2. **Responsable y correo de contacto** para la política de privacidad (marcados en naranja en `privacidad.html`).

## Cuentas y herramientas

- Apple Developer Program: unos 99 USD al año. Compilar iOS exige un Mac con Xcode **(comprobar versión mínima)**.
- Google Play Console: pago único de unos 25 USD. Las cuentas personales nuevas deben hacer una prueba cerrada con testers antes de publicar **(comprobar número de testers y días)**.
- Firma: guardar a salvo la clave de subida de Android y los certificados de Apple. Perder la clave de Android complica las actualizaciones.

## Pasos técnicos para generar las apps

Los proyectos nativos ya existen en el repositorio. Cada vez que cambie el juego:

```bash
npm install
npm run build
npx cap sync                   # copia el juego compilado a android/ e ios/
npx cap open android           # Android Studio: Build > Generate Signed App Bundle (.aab)
npx cap open ios               # Xcode (solo en macOS): Product > Archive
```

- Si cambian los iconos o la pantalla de carga: `node scripts/recursos.cjs` y después `npx @capacitor/assets generate --android --ios`.
- Antes de cada envío, subir la versión: `versionCode`/`versionName` en `android/app/build.gradle` y `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` en Xcode.
- Este entorno no tiene el SDK de Android ni Xcode: los proyectos están generados y configurados, pero **la primera compilación nativa debe hacerse en un equipo con Android Studio y en un Mac con Xcode**.

## Dispositivos no compatibles

PlayStation, Xbox, Nintendo Switch y televisores inteligentes no son posibles con esta tecnología: cada uno exige su propio motor, kits de desarrollo con licencia del fabricante y una certificación aparte.

## Modo en línea (cooperativo)

Hasta 8 jugadores contra las oleadas: servidor principal público (se reparte en varias salas si se llena), salas públicas que cualquiera crea y salas privadas con código de 5 caracteres.

Medidas para la norma 1.2 de Apple (contenido generado por usuarios) y la política de Google sobre contenido de usuarios:

- [x] **Filtro de nombres** de jugador y de sala pública (español e inglés, detecta disfraces como `p3rr4` o `p.u.t.a`). Lo aplica el servidor; el cliente solo avisa antes.
- [x] **Denunciar** a un jugador (nombre ofensivo o mala conducta) desde el menú de la partida. Con 3 denuncias de jugadores distintos se le retira de la sala y su nombre queda vetado en ella. En salas privadas pequeñas basta con que lo denuncien todos los demás; en salas públicas nunca basta una sola denuncia (con dos jugadores, queda bloquear y salir), para que nadie pueda echar a otro a solas.
- [x] **Bloquear** a un jugador: deja de verse su nombre en ese dispositivo.
- [x] Sin chat ni texto libre aparte del nombre.
- [x] **Unirse a un amigo** por su nombre: solo encuentra jugadores en salas públicas (coincidencia exacta, una búsqueda por segundo como máximo); las privadas solo con código. La búsqueda no se guarda.
- [x] Las denuncias se guardan como máximo 30 días, sin IP ni identidad de quien denuncia (`server/reports.jsonl`).
- [ ] **Contacto para quejas** visible en la ficha y en la política (Apple exige poder contactar con el desarrollador): pendiente del correo del responsable.
- [ ] Revisar las denuncias guardadas de forma periódica.

### Servidor

- `npm run start` compila y arranca el servidor (`server/index.ts`, puerto `PORT`, por defecto 8080). También hay `Dockerfile`.
- **En producción debe ir detrás de HTTPS/WSS** (por ejemplo, un proxy con certificado). Las apps nativas no pueden usar `ws://` sin cifrar.
- Las apps nativas no se sirven desde el servidor: hay que compilar con la dirección del servidor, `VITE_SERVER_URL=wss://tu-servidor/ws npm run build`, y después `npx cap sync`.
- Si el servidor no está disponible, el modo en solitario sigue funcionando sin conexión.

### Servidor de partidas en Render

`render.yaml` deja configurado el servicio: imagen del `Dockerfile`, comprobación en `/health` y publicación automática en cada push a la rama. Render pone el HTTPS.

1. Crear cuenta en Render con GitHub y dar acceso al repositorio `Dylan-juego`.
2. New > Blueprint > elegir el repositorio > Apply. Render da una dirección `https://<servicio>.onrender.com`.
3. La web de `dylanj.kedasrd.com` sigue en su alojamiento actual: se compila con `VITE_SERVER_URL=wss://<servicio>.onrender.com/ws npm run build` y se sube `dist/`. Así el juego de la web (y las apps) se conecta a ese servidor.

Plan gratuito: el servidor se duerme tras 15 minutos sin visitas y tarda alrededor de un minuto en despertar; el fichero de denuncias se pierde al reiniciarse (se guardan menos días, nunca más de 30). Para un servidor siempre despierto y denuncias persistentes, plan de pago con disco.

## Formularios de las tiendas (respuestas según el estado actual)

- **Apple, privacidad de la app:** "Datos recopilados": **Contenido del usuario > Otro contenido del usuario** (nombre de jugador y de sala), no vinculado a la identidad, no usado para rastreo, finalidad "Funcionalidad de la app". La dirección IP se usa solo para mantener la conexión y no se guarda **(comprobar si Apple pide declararla)**.
- **Google, seguridad de los datos:** recopila **Actividad en la app > Otro contenido generado por el usuario** (nombre de jugador), tratado de forma efímera salvo en denuncias (30 días), no compartido, cifrado en tránsito (WSS), finalidad "Funciones de la app". No se puede pedir su eliminación por cuenta porque no hay cuentas: indicarlo y remitir al contacto de la política.
- **Clasificación por edades:** violencia de fantasía/dibujos contra robots, sin sangre, sin compras, sin publicidad. **Marcar "los usuarios pueden interactuar"** (juego en línea con nombres visibles, sin chat). Resultado probable: 9+ en Apple y PEGI 7 en Google, con el aviso de interacción en línea **(se confirma al rellenar el cuestionario)**.
- **Anuncios:** no contiene anuncios. **Compras integradas:** no.

## Ficha de la tienda (material que falta)

- Política de privacidad en una **URL pública** (las tiendas no aceptan solo la página interna): basta con publicar `dist/privacidad.html`, por ejemplo con GitHub Pages.
- URL de soporte (Apple la exige).
- Capturas: Apple pide capturas de iPhone de 6,9" y de iPad si se publica para iPad **(comprobar tamaños)**; Google, al menos 2 capturas de teléfono e imagen destacada de 1024×500.
- Texto: nombre (máx. 30 caracteres), subtítulo/descripción breve, descripción completa, palabras clave.

## Si cambia el juego en línea

Cualquier dato nuevo (cuentas, chat, compras, estadísticas en el servidor) exige actualizar antes `privacidad.html`, este documento y los formularios de ambas tiendas. Ver `CLAUDE.md`, sección 3.
