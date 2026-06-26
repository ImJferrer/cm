# Requisitos — Rediseño de Interfaz Chat
## Cross Moon · Draw World JC-2

---

## Introducción

Este documento define los requisitos funcionales y no funcionales para el rediseño visual de la interfaz de chat de Cross Moon. El rediseño moderniza la estética mediante glassmorphism avanzado, Tailwind CSS vía CDN y bordes redondeados, sin alterar la lógica de negocio existente.

### Glosario

| Término | Definición |
|---------|------------|
| Glass panel | Elemento visual con `backdrop-filter`, fondo semi-transparente y borde sutil |
| Acento | Color temático principal controlado por `--accent` CSS variable |
| CDN | Red de distribución de contenido; Tailwind se carga desde `cdn.tailwindcss.com` |
| `chat.js` | Archivo JavaScript principal — no debe modificarse |
| Tema | Una de las 4 paletas de color: turquesa, rojo, negro, verde |

---

## Requisitos

### Requisito 1: Integración de Tailwind CSS via CDN

**Historia de usuario:** Como desarrolladora, quiero integrar Tailwind CSS via CDN en `chat.html` para poder usar sus utilidades de diseño sin proceso de build.

#### Criterios de Aceptación

1. DADO que el navegador carga `chat.html`, CUANDO se renderiza la página, ENTONCES el script de Tailwind CDN debe estar cargado y funcional antes que `style-chat.css`.
2. DADO que Tailwind está activo, CUANDO se aplica la configuración personalizada, ENTONCES las variables CSS del proyecto (`--accent`, `--accent-rgb`, etc.) deben integrarse como tokens de diseño en la config de Tailwind.
3. DADO que existe CSS personalizado, CUANDO hay conflictos de especificidad entre Tailwind y `style-chat.css`, ENTONCES `style-chat.css` debe tener mayor especificidad o usar `!important` selectivamente para componentes críticos.
4. DADO que se usa Tailwind CDN, CUANDO la página se carga sin conexión a internet, ENTONCES la interfaz debe degradarse gracefully usando solo `style-chat.css`.

---

### Requisito 2: Preservación de Funcionalidad Existente

**Historia de usuario:** Como jugadora del chat, quiero que todas las funciones actuales del chat sigan funcionando exactamente igual después del rediseño visual.

#### Criterios de Aceptación

1. DADO que el rediseño está aplicado, CUANDO `chat.js` referencia clases CSS como `chat-bubble`, `chat-message`, `mine`, `narrator`, `typing-indicator`, `hidden`, ENTONCES esas clases deben existir y comportarse funcionalmente igual que antes.
2. DADO que se aplica el rediseño, CUANDO se envía un mensaje, se recibe un mensaje, se activa el typing indicator, se abre un modal, o se cambia el tema, ENTONCES el comportamiento JS no debe romperse.
3. DADO el rediseño completo, CUANDO se ejecutan todas las funciones de `chat.js` (WebSocket, sidebar, GM panel, modales de edición, auth modal, visitor profile), ENTONCES deben funcionar sin errores de consola relacionados con clases CSS faltantes.
4. DADO que `chat.js` crea elementos dinámicamente con clases específicas, CUANDO esos elementos se insertan en el DOM, ENTONCES deben recibir los estilos glass correctos automáticamente.

---

### Requisito 3: Glassmorphism en Componentes Principales

**Historia de usuario:** Como jugadora, quiero ver una interfaz visualmente atractiva con efecto de cristal esmerilado en los paneles para que el chat se sienta inmersivo y moderno.

#### Criterios de Aceptación

1. DADO que la página está cargada, CUANDO se visualiza el sidebar, ENTONCES debe mostrar `backdrop-filter: blur(32px)` o mayor, fondo semi-transparente (`rgba` con alpha ≤ 0.88) y borde sutil.
2. DADO que se visualiza el header, CUANDO hay contenido detrás, ENTONCES el efecto de desenfoque debe ser visible y el header debe permanecer legible.
3. DADO que aparece una burbuja de chat ajena, CUANDO se renderiza, ENTONCES debe tener fondo frosted glass con `backdrop-filter` y borde con transparencia.
4. DADO que aparece una burbuja propia, CUANDO se renderiza, ENTONCES debe usar gradiente del color de acento del tema activo.
5. DADO que se abre un modal, CUANDO el overlay está visible, ENTONCES el modal debe mostrar glass card con blur intenso (≥ 32px) y el backdrop debe tener blur suave (≥ 8px).
6. DADO que se ve el área de input, CUANDO el textarea está enfocado, ENTONCES debe mostrarse un glow ring del color de acento.

---

### Requisito 4: Bordes Redondeados Consistentes

**Historia de usuario:** Como jugadora, quiero bordes redondeados generosos en todos los elementos para que la interfaz se vea suave y cohesiva.

#### Criterios de Aceptación

1. DADO cualquier burbuja de chat, CUANDO se renderiza, ENTONCES debe tener `border-radius` ≥ `1.25rem` en todas las esquinas excepto la esquina de cola (≤ 0.4rem).
2. DADO el modal de edición o de auth, CUANDO está abierto, ENTONCES debe tener `border-radius` ≥ `1.5rem`.
3. DADO el input container, CUANDO está visible, ENTONCES debe tener `border-radius` ≥ `1.25rem` (forma pill).
4. DADO el botón Enviar, CUANDO está visible, ENTONCES debe tener `border-radius` ≥ `0.875rem`.
5. DADO un player item en el sidebar, CUANDO está visible, ENTONCES debe tener `border-radius` ≥ `0.75rem`.

---

### Requisito 5: Sistema de Animaciones

**Historia de usuario:** Como jugadora, quiero animaciones suaves en las burbujas y elementos interactivos para que la interfaz se sienta viva y responsive.

#### Criterios de Aceptación

1. DADO que llega un mensaje nuevo, CUANDO se inserta en el DOM, ENTONCES la burbuja debe animarse con slide-in (desde izquierda para mensajes ajenos, desde derecha para los propios) con duración ≤ 400ms.
2. DADO que se abre un modal, CUANDO aparece en pantalla, ENTONCES debe escalar desde 0.92 a 1.0 con fade-in simultáneo, duración ≤ 300ms.
3. DADO que el usuario hace hover sobre un avatar, CUANDO el cursor está encima, ENTONCES el avatar debe escalar a 1.1 con transición ≤ 200ms.
4. DADO que el usuario hace hover sobre el botón Enviar, CUANDO el cursor está encima, ENTONCES el botón debe elevarse (`translateY(-2px)`) y el glow aumentar.
5. DADO que el typing indicator está activo, CUANDO es visible, ENTONCES los tres puntos deben animar en cascada (delay de 0.2s entre cada uno).
6. DADO que se hace hover sobre un player item, CUANDO el cursor está encima, ENTONCES el item debe desplazarse 3px a la derecha con glow interno.

---

### Requisito 6: Soporte Multi-tema

**Historia de usuario:** Como jugadora, quiero que los 4 temas de color (turquesa, rojo, negro, verde) funcionen correctamente con el nuevo diseño glass.

#### Criterios de Aceptación

1. DADO que se selecciona un tema desde el selector, CUANDO se aplica la clase `.theme-X` al elemento raíz, ENTONCES todos los efectos glass (glow, borders, gradientes) deben cambiar al color del tema seleccionado.
2. DADO el tema rojo activo, CUANDO se visualiza cualquier burbuja propia, ENTONCES debe usar los valores de `--send-from` y `--send-to` del tema rojo.
3. DADO el tema negro activo, CUANDO el glow es visible, ENTONCES debe usar `--accent-rgb` del tema negro (gris) sin producir artefactos visuales extraños.
4. DADO cualquier tema, CUANDO el texto de las burbujas ajenas es visible, ENTONCES el contraste debe ser ≥ 4.5:1 según WCAG AA.

---

### Requisito 7: Responsividad Mobile

**Historia de usuario:** Como jugadora en móvil, quiero que la interfaz rediseñada funcione correctamente en pantallas pequeñas.

#### Criterios de Aceptación

1. DADO una pantalla < 768px de ancho, CUANDO se carga el chat, ENTONCES el sidebar debe estar oculto por defecto y el botón de menú (☰) debe ser visible.
2. DADO una pantalla < 768px, CUANDO el sidebar está abierto, ENTONCES debe superponerse como drawer con el backdrop activo y border-radius en el lado derecho.
3. DADO cualquier tamaño de pantalla, CUANDO el teclado virtual aparece en móvil iOS/Android, ENTONCES la variable `--app-height` debe ajustarse correctamente y el área de input debe permanecer visible.
4. DADO una pantalla < 480px, CUANDO se visualizan las burbujas de chat, ENTONCES su `max-width` no debe superar el 85% del ancho disponible.

---

### Requisito 8: Rendimiento Visual

**Historia de usuario:** Como jugadora, quiero que el rediseño no cause lag ni janks visuales durante el uso normal del chat.

#### Criterios de Aceptación

1. DADO que hay 50+ mensajes en el historial, CUANDO se hace scroll, ENTONCES no debe haber frame drops perceptibles (el scroll debe ser fluido).
2. DADO que se usan efectos `backdrop-filter`, CUANDO se renderizan múltiples paneles simultáneamente, ENTONCES la página debe mantener ≥ 30fps en dispositivos móviles de gama media.
3. DADO que las animaciones CSS están activas, CUANDO se insertan varios mensajes seguidos, ENTONCES las animaciones deben usar `transform` y `opacity` exclusivamente (propiedades que usan GPU).
4. DADO que Tailwind CDN está cargado, CUANDO la página se carga por primera vez, ENTONCES el tiempo de carga adicional por Tailwind no debe superar 200ms en conexión 4G.
