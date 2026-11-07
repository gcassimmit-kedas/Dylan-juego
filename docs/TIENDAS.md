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

## Decisiones pendientes (del propietario)

1. **Identificador de la app.** Ahora es `com.dylan.tresenraya3d` (nombre heredado del primer juego). **No se puede cambiar después de publicar.** Hay que elegirlo antes del primer envío, normalmente con un dominio propio invertido (p. ej. `com.tuestudio.shooter2027`).
2. **Nombre en las tiendas.** La app abre "Juegos de Dylan" (shooter + tres en raya). Decidir si se publica así o como "Shooter 2027" (nombre del juego desde el 7 de noviembre de 2026). "Shooter" es una palabra genérica muy usada: conviene acompañarla de un subtítulo descriptivo en la ficha para que se encuentre en las búsquedas.
3. **Público objetivo.** Si el público incluye menores de 13 años, Google aplica la política de Familias y Apple la categoría Niños, con requisitos extra. Si no se apunta a niños, declararlo así en ambas tiendas.
4. **Responsable y correo de contacto** para la política de privacidad (marcados en naranja en `privacidad.html`).

## Cuentas y herramientas

- Apple Developer Program: unos 99 USD al año. Compilar iOS exige un Mac con Xcode **(comprobar versión mínima)**.
- Google Play Console: pago único de unos 25 USD. Las cuentas personales nuevas deben hacer una prueba cerrada con testers antes de publicar **(comprobar número de testers y días)**.
- Firma: guardar a salvo la clave de subida de Android y los certificados de Apple. Perder la clave de Android complica las actualizaciones.

## Pasos técnicos para generar las apps

```bash
npm install
npm run build
npx cap add android            # una vez
npx cap add ios                # una vez, en macOS
npx @capacitor/assets generate # iconos y pantallas de carga desde resources/
npx cap sync
npx cap open android           # o: npx cap open ios
```

- **Android:** comprobar que `targetSdkVersion` cumple el mínimo exigido por Google Play ese año **(comprobar)**; publicar como Android App Bundle (`.aab`).
- **iOS:** en `Info.plist`, `ITSAppUsesNonExemptEncryption = NO` (la app no usa cifrado propio) para evitar la pregunta de exportación en cada envío.

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
