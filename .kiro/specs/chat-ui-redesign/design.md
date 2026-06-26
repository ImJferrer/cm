# Diseño Técnico — Rediseño de Interfaz Chat
## Cross Moon · Draw World JC-2

---

## 1. Visión General

Rediseño visual completo del chat usando **Tailwind CSS via CDN** como utilidades complementarias al CSS personalizado existente (`style-chat.css`). La estética objetivo es una aplicación RPG/anime de nivel premium: oscura, atmosférica y visualmente impactante.

**Principios de diseño:**
- Glassmorphism profundo: capas de transparencia con `backdrop-filter` intensificado
- Bordes redondeados generosos en todos los componentes
- Jerarquía visual clara mediante luz, sombra y profundidad
- Paleta oscura cosmica como base, con acento de color temático luminoso
- Animaciones suaves y con propósito (no decorativas)

---

## 2. Arquitectura de Implementación

### 2.1 Integración de Tailwind

```html
<!-- En <head> de chat.html, antes de style-chat.css -->
<script>
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          accent: 'var(--accent)',
          'bg-main': 'var(--bg-main)',
        },
        backdropBlur: {
          xs: '2px',
          '4xl': '72px',
        },
        borderRadius: {
          '4xl': '2rem',
          '5xl': '2.5rem',
        },
        boxShadow: {
          'glass': '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
          'glass-lg': '0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
          'glow': '0 0 20px rgba(var(--accent-rgb), 0.35)',
          'glow-lg': '0 0 40px rgba(var(--accent-rgb), 0.5)',
        }
      }
    }
  }
</script>
<script src="https://cdn.tailwindcss.com"></script>
```

**Regla fundamental:** Tailwind provee utilidades de espaciado, tipografía y layout. Las variables CSS (`--accent`, `--bg-main`, etc.) siguen controlando los temas. `style-chat.css` es la fuente de verdad para componentes complejos.

---

## 3. Sistema de Diseño

### 3.1 Paleta Base (tema Turquesa — default)

| Token | Valor | Uso |
|-------|-------|-----|
| `--bg-main` | `#020617` | Fondo global |
| `--accent` | `#2dd4bf` | Glow, bordes activos, dots |
| `--bg-bubble-ai` | `rgba(226,232,240,0.96)` | Burbujas ajenas |
| `--bg-bubble-me` | `#0f766e` | Burbujas propias |
| `--border-soft` | `rgba(148,163,184,0.12)` | Bordes sutiles |
| Glass panel | `rgba(10,15,30,0.88)` | Sidebar, header, modales |

### 3.2 Tipografía

- **Fuente**: `Inter` (ya cargada via system-ui fallback)
- Añadir Google Fonts `Inter` con weights 400, 500, 600, 700
- Tamaños: `xs`(0.67rem), `sm`(0.75rem), base(0.875rem), `lg`(1rem)

### 3.3 Espaciado y Radio

| Componente | Border Radius |
|-----------|---------------|
| Burbujas (ajenas) | `1.25rem` (bottom-left: `0.375rem`) |
| Burbujas (propias) | `1.25rem` (bottom-right: `0.375rem`) |
| Modales | `1.75rem` |
| Sidebar | esquina derecha `1.5rem` |
| Input container | `1.5rem` (pill) |
| Botón Enviar | `1rem` |
| Player items | `0.875rem` |
| Avatares | `50%` |

---

## 4. Especificación por Componente

### 4.1 Fondo Global (`.chat-page`)

```css
background: 
  radial-gradient(ellipse at 20% 50%, rgba(45,212,191,0.04) 0%, transparent 60%),
  radial-gradient(ellipse at 80% 20%, rgba(79,70,229,0.06) 0%, transparent 60%),
  #020617;
```

El `bg-2.png` permanece con `opacity: 0.15` como textura de neblina.

### 4.2 Sidebar (`.sidebar`)

**Glass treatment:**
```css
background: rgba(8, 12, 28, 0.85);
backdrop-filter: blur(32px) saturate(180%);
border-right: 1px solid rgba(255,255,255,0.06);
box-shadow: 4px 0 32px rgba(0,0,0,0.4);
/* Línea de acento superior */
border-top: 2px solid transparent;
background-clip: padding-box;
position: relative;
```

**Línea de acento top** (pseudo-elemento):
```css
.sidebar::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  opacity: 0.6;
}
```

**Player items hover:**
```css
.player-item:hover {
  background: rgba(var(--accent-rgb), 0.08);
  box-shadow: inset 0 0 0 1px rgba(var(--accent-rgb), 0.2);
  transform: translateX(3px);
}
```

**Avatar sidebar:**
- Ring animado: `box-shadow: 0 0 0 2px var(--accent), 0 0 16px rgba(var(--accent-rgb), 0.4)`
- Animación `float` 3s

### 4.3 Header (`.chat-header`)

```css
background: rgba(6, 10, 24, 0.82);
backdrop-filter: blur(28px) saturate(200%);
border-bottom: 1px solid rgba(255,255,255,0.05);
box-shadow: 0 4px 24px rgba(0,0,0,0.3), 0 1px 0 rgba(var(--accent-rgb),0.08);
```

**Chips (`.chip`):**
```css
border-radius: 999px;
padding: 0.28rem 0.85rem;
background: rgba(var(--accent-rgb), 0.08);
border: 1px solid rgba(var(--accent-rgb), 0.25);
backdrop-filter: blur(8px);
transition: all 0.2s ease;
```

Hover: `background: rgba(var(--accent-rgb), 0.18)` + `box-shadow: 0 0 12px rgba(var(--accent-rgb), 0.2)`

### 4.4 Burbujas de Chat (`.chat-bubble`)

**Burbujas ajenas (`.chat-bubble` base):**
```css
background: rgba(220, 230, 244, 0.92);
backdrop-filter: blur(12px);
border: 1px solid rgba(255,255,255,0.3);
box-shadow: 
  0 4px 16px rgba(0,0,0,0.2),
  inset 0 1px 0 rgba(255,255,255,0.5);
border-radius: 1.25rem 1.25rem 1.25rem 0.25rem;
```

**Burbujas propias (`.chat-message.mine .chat-bubble`):**
```css
background: linear-gradient(135deg, var(--send-from), var(--send-to));
border: 1px solid rgba(var(--accent-rgb), 0.3);
box-shadow:
  0 4px 20px rgba(var(--accent-rgb), 0.25),
  0 1px 0 rgba(255,255,255,0.1) inset;
border-radius: 1.25rem 1.25rem 0.25rem 1.25rem;
```

**Burbujas narrator (`.chat-message.narrator .chat-bubble`):**
```css
background: rgba(5, 10, 25, 0.75);
backdrop-filter: blur(16px);
border: 1px solid rgba(var(--accent-rgb), 0.18);
border-radius: 1rem;
box-shadow: 0 0 20px rgba(var(--accent-rgb), 0.08), 0 4px 16px rgba(0,0,0,0.3);
```

### 4.5 Avatares (`.chat-avatar`)

```css
width: 36px; height: 36px;
border-radius: 50%;
box-shadow: 
  0 0 0 2px rgba(var(--accent-rgb), 0.4),
  0 4px 12px rgba(0,0,0,0.4);
transition: transform 0.2s ease, box-shadow 0.25s ease;
```

Hover: `transform: scale(1.12)` + `box-shadow: 0 0 0 3px var(--accent), 0 0 20px rgba(var(--accent-rgb),0.5)`

### 4.6 Área de Input (`.chat-input-area`)

**Contenedor:**
```css
background: rgba(6, 10, 24, 0.88);
backdrop-filter: blur(24px);
border-top: 1px solid rgba(255,255,255,0.05);
box-shadow: 0 -4px 24px rgba(0,0,0,0.2);
```

**Input inner (`.chat-input-inner`):**
```css
border-radius: 1.5rem;
background: rgba(15, 22, 45, 0.9);
border: 1.5px solid rgba(var(--accent-rgb), 0.18);
padding: 0.55rem 0.6rem 0.55rem 1.1rem;
transition: border-color 0.25s, box-shadow 0.25s;
```

Focus within:
```css
border-color: var(--accent);
box-shadow: 
  0 0 0 3px rgba(var(--accent-rgb), 0.12),
  0 0 20px rgba(var(--accent-rgb), 0.08);
```

**Botón Enviar (`.send-button`):**
```css
border-radius: 1rem;
background: var(--send-btn-bg);
box-shadow: 0 4px 18px var(--send-btn-shadow);
font-weight: 700;
letter-spacing: 0.01em;
transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
```

Hover: `transform: translateY(-2px) scale(1.02)` + `box-shadow: 0 8px 28px var(--send-btn-shadow-hover), 0 0 16px rgba(var(--accent-rgb),0.3)`

### 4.7 Modales (`.edit-modal`)

```css
border-radius: 1.75rem;
background: rgba(8, 12, 30, 0.94);
backdrop-filter: blur(40px) saturate(200%);
border: 1px solid rgba(255,255,255,0.07);
box-shadow: 
  0 32px 80px rgba(0,0,0,0.8),
  0 0 0 1px rgba(var(--accent-rgb), 0.08),
  inset 0 1px 0 rgba(255,255,255,0.06);
overflow: hidden;
```

**Header del modal:**
```css
.edit-modal-header {
  background: linear-gradient(180deg, rgba(var(--accent-rgb),0.06), transparent);
  border-bottom: 1px solid rgba(var(--accent-rgb), 0.12);
}
```

**Overlay backdrop:**
```css
background: rgba(1,4,18,0.88);
backdrop-filter: blur(10px);
```

### 4.8 Typing Indicator (`.typing-bubble`)

```css
border-radius: 999px;
background: rgba(8, 12, 28, 0.88);
backdrop-filter: blur(16px);
border: 1px solid rgba(var(--accent-rgb), 0.15);
box-shadow: 0 4px 16px rgba(0,0,0,0.3), 0 0 8px rgba(var(--accent-rgb),0.1);
```

### 4.9 GM Panel (`.gm-panel-inner`)

```css
border-radius: 1.25rem;
background: rgba(8, 12, 28, 0.96);
backdrop-filter: blur(32px) saturate(200%);
border: 1px solid rgba(var(--accent-rgb), 0.12);
box-shadow: 0 24px 60px rgba(0,0,0,0.9), 0 0 0 1px rgba(var(--accent-rgb),0.05);
```

### 4.10 Visitor Profile Overlay (`.visitor-profile-overlay`)

Aplicar glass card con:
```css
background: rgba(6, 10, 24, 0.92);
backdrop-filter: blur(32px);
border: 1px solid rgba(var(--accent-rgb), 0.15);
border-radius: 1.5rem;
box-shadow: 0 32px 80px rgba(0,0,0,0.85);
```

---

## 5. Catálogo de Animaciones

### 5.1 Animaciones Existentes (refinar)

| Nombre | Descripción | Mejora |
|--------|-------------|--------|
| `slideInLeft` | Burbujas ajenas | Añadir `scale(0.96→1)` |
| `slideInRight` | Burbujas propias | Añadir `scale(0.96→1)` |
| `slideInUp` | Narrador y modales | Añadir spring cubic-bezier |
| `float` | Avatar sidebar | Aumentar amplitud a 6px |
| `bounce` | Dots typing | Mantener igual |

### 5.2 Animaciones Nuevas

```css
/* Glow pulse en focus del input */
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.12); }
  50%       { box-shadow: 0 0 0 5px rgba(var(--accent-rgb), 0.22); }
}

/* Shimmer en el botón Enviar al hover */
@keyframes shimmerBtn {
  0%   { background-position: -100% center; }
  100% { background-position: 200% center; }
}

/* Escala de entrada para modales */
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.92) translateY(16px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* Fade + slide para player items al aparecer */
@keyframes playerFadeIn {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}
```

### 5.3 Micro-interacciones

- **Avatar click**: `transform: scale(0.95)` momentáneo (100ms) al hacer click
- **Send button**: `transform: scale(0.95)` en `:active`
- **Chip hover**: `filter: brightness(1.1)` + border color al acento
- **Player item**: slide derecho 3px + glow interno
- **Input focus**: transición suave 0.25s de border + box-shadow

---

## 6. Responsivo y Mobile

La lógica de sidebar ya existe (`.sidebar-open` toggle). Refinamientos:

- **< 768px**: `.menu-button` visible, sidebar como drawer con `border-radius: 0 1.5rem 1.5rem 0`
- **Input area**: padding safe-area iOS respetado, textarea crece hasta 5 líneas
- **Burbujas**: `max-width: calc(100% - 3rem)` en mobile
- **Modales**: `width: 95vw`, padding reducido

---

## 7. Compatibilidad de Temas

Los 4 temas (turquesa, rojo, negro, verde) usan variables CSS. El diseño glass funciona automáticamente porque todos los valores de `rgba()`, `box-shadow` y `border` hacen referencia a `--accent-rgb` y `--send-btn-bg`.

**Verificar en cada tema:**
- Contraste de texto en burbujas (mínimo 4.5:1)
- Glow visible pero no excesivo
- Botón Enviar legible

---

## 8. Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `chat.html` | Añadir Tailwind CDN + config script en `<head>` |
| `style-chat.css` | Reemplazar estilos de componentes con nuevos valores glass |
| `chat.html` | Añadir Google Fonts `Inter` |

**Archivos que NO se modifican:**
- `js/chat.js` — ningún cambio
- `backend/` — ningún cambio
- `index.html` / `style.css` — fuera de alcance
