# Plan de Implementación — Rediseño de Interfaz Chat
## Cross Moon · Draw World JC-2

---

## Tareas de Implementación

- [x] 1. Integrar Tailwind CSS CDN y configuración base
  - Añadir script de configuración de Tailwind antes del CDN en `<head>` de `chat.html`
  - Configurar `tailwind.config` con extensión de `colors`, `backdropBlur`, `borderRadius` y `boxShadow` personalizados que referencian variables CSS del proyecto
  - Añadir enlace a Google Fonts `Inter` (weights 400, 500, 600, 700) en `<head>`
  - Añadir script CDN de Tailwind: `<script src="https://cdn.tailwindcss.com"></script>`
  - Verificar que Tailwind no rompe estilos existentes al cargar
  - **Archivos**: `chat.html`

- [x] 2. Rediseñar el Sidebar con glassmorphism avanzado
  - Actualizar `.sidebar` con `backdrop-filter: blur(32px) saturate(180%)`, fondo `rgba(8,12,28,0.85)`, `border-right` sutil y `box-shadow` lateral
  - Añadir pseudo-elemento `::before` con línea de gradiente de acento en la parte superior del sidebar
  - Actualizar `.sidebar-header` con separador más sutil y espaciado refinado
  - Actualizar `.player-item` con `border-radius: 0.875rem`, hover con glow interno y slide derecho
  - Actualizar `.player-item.me` con glass card del color de acento
  - Actualizar `.chat-bot-avatar` (sidebar) con ring de acento animado
  - Actualizar `.sidebar-footer` con separador glass y botones con estilo chip glass
  - **Archivos**: `style-chat.css`

- [x] 3. Rediseñar el Header superior
  - Actualizar `.chat-header` con `backdrop-filter: blur(28px)`, fondo más oscuro y `box-shadow` inferior con glow de acento sutil
  - Actualizar `.chip` y `.chip-soft` con glass treatment, transiciones mejoradas y hover glow
  - Actualizar `.status-menu` con glass card, `border-radius: 1rem` y animación de entrada mejorada
  - Actualizar `.icon-button` con hover glass circular
  - Actualizar `#theme-selector` con estilo chip consistente
  - **Archivos**: `style-chat.css`

- [x] 4. Rediseñar burbujas de chat y avatares
  - Actualizar `.chat-bubble` (ajenas) con frosted glass: `backdrop-filter: blur(12px)`, `background: rgba(220,230,244,0.92)`, `border` con blanco semi-transparente, `box-shadow` multicapa y `border-radius: 1.25rem 1.25rem 1.25rem 0.25rem`
  - Actualizar `.chat-message.mine .chat-bubble` con gradiente `linear-gradient(135deg, var(--send-from), var(--send-to))`, `border` de acento, `box-shadow` con glow y `border-radius: 1.25rem 1.25rem 0.25rem 1.25rem`
  - Actualizar `.chat-message.narrator .chat-bubble` con glass oscuro, borde de acento sutil y `border-radius: 1rem`
  - Actualizar `.chat-avatar` con ring de acento (`box-shadow: 0 0 0 2px rgba(var(--accent-rgb),0.4)`), hover con `scale(1.12)` y glow expandido
  - Actualizar `.chat-meta-line` con tipografía más refinada
  - Refinar animaciones `slideInLeft` y `slideInRight` añadiendo `scale(0.96→1)` para efecto pop
  - **Archivos**: `style-chat.css`

- [x] 5. Rediseñar el área de input
  - Actualizar `.chat-input-area` con `backdrop-filter: blur(24px)`, fondo oscuro y `box-shadow` superior sutil
  - Actualizar `.chat-input-inner` con `border-radius: 1.5rem` (pill), `background` glass oscuro, `border` de acento con transición, y `padding` refinado
  - Actualizar `.chat-input-inner:focus-within` con glow ring animado (`glowPulse` keyframe)
  - Actualizar `.send-button` con `border-radius: 1rem`, `box-shadow` con acento, hover con `translateY(-2px) scale(1.02)` y glow expandido, `:active` con `scale(0.95)`
  - Añadir keyframe `glowPulse` para el anillo de foco del input
  - **Archivos**: `style-chat.css`

- [x] 6. Rediseñar modales y overlays
  - Actualizar `.edit-modal` con `border-radius: 1.75rem`, `backdrop-filter: blur(40px)`, `background rgba(8,12,30,0.94)`, `box-shadow` multicapa con glow de acento
  - Actualizar `.edit-modal-overlay` backdrop con `blur(10px)` y fondo más oscuro
  - Actualizar `.edit-modal-header` con gradiente de acento sutil de fondo y borde inferior de acento
  - Actualizar `.edit-modal-body textarea` con `border-radius: 0.875rem`, glass oscuro y transición de focus
  - Actualizar `.btn-primary` y `.btn-secondary` con `border-radius: 0.875rem` y estilos glass refinados
  - Actualizar `.gm-auth-modal` con los mismos estilos glass del modal base
  - Reemplazar animación de modales con `modalIn` keyframe (scale 0.92→1 + translateY(16px→0))
  - Actualizar `.visitor-profile-overlay` con glass card, `border-radius: 1.5rem`, `backdrop-filter` y `box-shadow` refinados
  - **Archivos**: `style-chat.css`

- [x] 7. Pulir animaciones y micro-interacciones
  - Añadir keyframe `modalIn` para entrada de modales
  - Añadir keyframe `playerFadeIn` para items del sidebar al aparecer
  - Añadir keyframe `glowPulse` para input focus (si no fue añadido en tarea 5)
  - Refinar animación `float` del avatar sidebar (amplitud 6px, 3.5s)
  - Aplicar `.player-item` con `animation: playerFadeIn 0.3s ease` al ser añadidos dinámicamente (via clase CSS que JS ya aplica al insertar)
  - Verificar que todas las animaciones usan `transform` y/o `opacity` (GPU-friendly)
  - Añadir `will-change: transform` a elementos con animaciones continuas (avatares)
  - Actualizar `.typing-bubble` con glass refinado y box-shadow con glow sutil
  - Actualizar `.gm-panel-inner` con `border-radius: 1.25rem`, glass avanzado y `box-shadow` con glow de acento
  - **Archivos**: `style-chat.css`

- [x] 8. QA visual: verificar 4 temas y mobile
  - Abrir el chat en el navegador y cambiar entre los 4 temas (turquesa, rojo, negro, verde) verificando que todos los elementos glass adoptan correctamente el color de acento
  - Verificar contraste de texto en burbujas ajenas con cada tema (mínimo 4.5:1)
  - Redimensionar ventana a < 768px y verificar: sidebar oculto, botón ☰ visible, input correcto
  - Verificar que abrir/cerrar modales funciona con las nuevas animaciones
  - Verificar que el typing indicator muestra animación correcta
  - Verificar que los avatares tienen el efecto hover correcto
  - Abrir DevTools > Performance y hacer scroll con 50+ mensajes verificando sin frame drops
  - Verificar que no hay errores de consola relacionados con clases CSS faltantes
  - **Archivos**: ninguno (solo verificación)
