# Publicación en App Store y Google Play

Estado a 6 de noviembre de 2026. Los requisitos de las tiendas cambian cada año: lo marcado como **(comprobar)**
debe verificarse en la documentación oficial justo antes de enviar.

## Ya cumplido en el código

- [x] Sin emojis; iconos SVG profesionales (Lucide + propios con el mismo estilo).
- [x] El juego va empaquetado entero dentro de la app: funciona sin conexión, sin CDN ni recursos externos (regla 4.2 de Apple: no es una web envuelta).
- [x] No recoge datos personales: sin cuentas, publicidad, analítica ni SDK de terceros. Solo guarda récord y ajustes en el propio dispositivo.
- [x] Política de privacidad dentro de la app (`privacidad.html`), accesible desde el menú y desde Ajustes.
- [x] Créditos y licencias completas de las librerías (`creditos.html`).
- [x] Pantalla de Ajustes: sonido, calidad gráfica (automática/alta/baja) y temblor de cámara.
- [x] Pausa manual y automática al pasar a segundo plano.
- [x] Accesibilidad básica: botones con `aria-label`, foco visible, "reducir movimiento" desactiva el temblor de cámara.
- [x] Áreas seguras (notch, barra de gestos) y diseño de móvil a escritorio.
- [x] Icono (1024 px, sin transparencia para iOS), icono adaptativo de Android (primer plano + fondo) y pantallas de carga en `resources/`.
- [x] Sin permisos del sistema.
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

## Formularios de las tiendas (respuestas según el estado actual)

- **Apple, privacidad de la app:** "Datos no recopilados".
- **Google, seguridad de los datos:** no recopila datos; no comparte datos.
- **Clasificación por edades:** violencia de fantasía/dibujos contra robots, sin sangre, sin compras, sin chat, sin publicidad. Resultado probable: 9+ en Apple y PEGI 7 en Google **(se confirma al rellenar el cuestionario)**.
- **Anuncios:** no contiene anuncios. **Compras integradas:** no.

## Ficha de la tienda (material que falta)

- Política de privacidad en una **URL pública** (las tiendas no aceptan solo la página interna): basta con publicar `dist/privacidad.html`, por ejemplo con GitHub Pages.
- URL de soporte (Apple la exige).
- Capturas: Apple pide capturas de iPhone de 6,9" y de iPad si se publica para iPad **(comprobar tamaños)**; Google, al menos 2 capturas de teléfono e imagen destacada de 1024×500.
- Texto: nombre (máx. 30 caracteres), subtítulo/descripción breve, descripción completa, palabras clave.

## Si se añade juego en línea

Cambia casi todo lo anterior: la política de privacidad, las fichas de datos (nombre de jugador, identificadores, datos de conexión), la clasificación por edades (interacción entre usuarios) y hace falta moderar nombres y poder reportar jugadores. Ver `CLAUDE.md`, sección 3.
