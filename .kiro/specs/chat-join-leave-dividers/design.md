# Design Document: Chat Join/Leave Dividers

## Overview

Esta feature introduce los **System Dividers** — elementos visuales efímeros que aparecen
en el área de chat cuando un usuario entra o sale de la sala. Son elementos DOM puros,
separados del array `messages`, que se insertan directamente en `#chat-box` sin persistirse
en `localStorage` ni enviarse por WebSocket.

La ambientación del Cross Moon requiere que estas notificaciones sean sutiles: texto gris,
cursiva, sin burbuja ni fondo, centradas. No deben interrumpir el flujo narrativo, solo
marcar silenciosamente la llegada o partida de un viajero.

### Tres variantes de mensaje

| Evento | Vista | Texto |
|--------|-------|-------|
| `presence join`, usuario remoto | Todos los ya conectados | `---- {Username} ha caído en el Cross Moon ---` |
| Primera `player_list` con usuario local | El propio usuario recién llegado | `---- Disfruta de tu estadía en el Cross Moon. ---` |
| `presence leave`, usuario remoto | Todos los demás | `---- {Username} ha cruzado la frontera de regreso. ---` |

---

## Architecture

El diseño se mantiene completamente **dentro del cliente** (`chat.js` + `style-chat.css`).
No requiere cambios en el backend (`server.js`) porque los eventos WebSocket necesarios
(`presence`, `player_list`) ya existen.

```
WebSocket (server.js)
    │
    ├── { type: "presence", event: "join", name, clientId }
    ├── { type: "presence", event: "leave", name, clientId }
    └── { type: "player_list", players: [...] }
           │
    handleWsMessage() ──────────────────────────────────────────────┐
           │                                                         │
           ├── presence + join (name !== player.name)                │
           │       └── renderSystemDivider(text, "join")             │
           │                                                         │
           ├── presence + leave (name !== player.name)               │
           │       └── renderSystemDivider(text, "leave")            │
           │                                                         │
           └── player_list (primer evento con usuario local)         │
                   └── renderSystemDivider(text, "welcome")          │
                                                                     │
    renderSystemDivider(text) ──> DOM: <div class="system-divider">  │
                                       insertado al final de #chat-box
                                       NUNCA en messages[]
                                       NUNCA en localStorage

    resetChatHistory() ──> chatBox.querySelectorAll(".system-divider")
                               .forEach(el => el.remove())
```

### Decisiones de diseño

**DOM directo en vez de entrada en `messages[]`:** Los divisores son efímeros por naturaleza
(no persisten entre sesiones). Insertar nodos DOM directamente evita contaminar el modelo de
datos y simplifica la lógica de persistencia — `saveHistory()` ya no necesita filtrar nada.

**Flag `welcomeDividerShown`:** Una variable booleana en el scope del módulo garantiza que el
divisor de bienvenida se renderice exactamente una vez por sesión, incluso si el WebSocket
reconecta y reenvía `player_list`.

**Sin tipo especial en el servidor:** Los eventos `presence` y `player_list` que el servidor
ya emite son suficientes. No se agrega ningún mensaje de tipo "system" al historial del servidor.

---

## Components and Interfaces

### Nuevos elementos en `chat.js`

#### Variable de sesión
```js
let welcomeDividerShown = false;
```
Declarada junto a las otras variables de sesión (`shouldStickToBottom`, `historyHydrated`, etc.).

#### `renderSystemDivider(text)`
```js
/**
 * Inserta un divisor de sistema al final del chat-box.
 * No modifica messages[] ni localStorage.
 * @param {string} text - Texto visible del divisor
 */
function renderSystemDivider(text) {
  if (!chatBox) return;

  const wasAtBottom = isChatNearBottom();

  const el = document.createElement("div");
  el.className = "system-divider";
  el.textContent = text;

  chatBox.appendChild(el);

  if (wasAtBottom) {
    scrollChatToBottom({ smooth: true, force: true });
  }
}
```

**Características clave:**
- Captura `isChatNearBottom()` **antes** de insertar para preservar la semántica de scroll
- Usa `textContent` (no `innerHTML`) para evitar XSS con nombres de usuario arbitrarios
- No toca `messages[]` ni llama a `saveHistory()`

#### Cambios en `handleWsMessage`

**Bloque `presence`** — extender el handler existente:
```js
if (data.type === "presence") {
  if (data.event === "join") {
    if (!remotePlayers.find((p) => p.clientId === data.clientId)) {
      remotePlayers.push({ clientId: data.clientId, name: data.name, profile: data.profile || {} });
    }
    // NUEVO: divisor de entrada (solo para usuarios remotos)
    if (data.name && data.name !== player.name) {
      renderSystemDivider(`---- ${data.name} ha caído en el Cross Moon ---`);
    }
  } else if (data.event === "leave") {
    remotePlayers = remotePlayers.filter((p) => p.clientId !== data.clientId);
    // NUEVO: divisor de salida (solo para usuarios remotos)
    if (data.name && data.name !== player.name) {
      renderSystemDivider(`---- ${data.name} ha cruzado la frontera de regreso. ---`);
    }
  }
  renderPlayers();
  return;
}
```

**Bloque `player_list`** — agregar detección del divisor de bienvenida:
```js
if (data.type === "player_list" && Array.isArray(data.players)) {
  // ... código existente (roster, chatVersion, remotePlayers, renderPlayers) ...

  // NUEVO: divisor de bienvenida — exactamente una vez por sesión
  if (!welcomeDividerShown) {
    const selfInList = data.players.some(
      (p) => p.name === player.name
    );
    if (selfInList) {
      welcomeDividerShown = true;
      renderSystemDivider("---- Disfruta de tu estadía en el Cross Moon. ---");
    }
  }

  return;
}
```

#### Cambios en `resetChatHistory`

Agregar limpieza de divisores después de `chatBox.innerHTML = ""` (que `renderMessages()` ya hace):
```js
function resetChatHistory(options = {}) {
  // ... código existente ...
  messages = [];
  messageIdCounter = 1;
  localStorage.removeItem(HISTORY_KEY);
  // ... preserveVersion logic ...

  shouldStickToBottom = true;
  historyHydrated = true;
  renderMessages(); // ya vacía chatBox.innerHTML

  // NUEVO: limpiar cualquier divisor que haya quedado fuera del flujo normal
  // (seguridad adicional; renderMessages() ya limpia chatBox.innerHTML)
  chatBox?.querySelectorAll(".system-divider").forEach((el) => el.remove());
}
```

> Nota: `renderMessages()` ya ejecuta `chatBox.innerHTML = ""` al inicio, lo que borra
> todos los nodos del DOM incluyendo los divisores. La llamada explícita a
> `querySelectorAll(".system-divider").forEach(el => el.remove())` es una capa de
> seguridad por si en el futuro `renderMessages()` cambia a un diff incremental.

### Nuevas reglas en `style-chat.css`

```css
/* ── System Dividers (join / leave / welcome) ── */
.system-divider {
    display: block;
    width: 100%;
    text-align: center;
    font-style: italic;
    font-size: 0.75rem;           /* ≤ 0.8rem según req. 4.5 */
    color: var(--text-muted);     /* #64748b — independiente del tema */
    background: transparent;
    border: none;
    padding: 0.35rem 0;
    margin: 0.2rem 0;
    user-select: none;
    pointer-events: none;
    position: relative;
    z-index: 1;                   /* dentro del stacking context del chat-box */
}
```

**Decisiones de estilo:**
- `color: var(--text-muted)` apunta a `#64748b`, definido en `:root` y **no redefinido**
  en ningún tema (`.theme-rojo`, `.theme-negro`, `.theme-verde`), por lo que el color permanece
  constante independientemente del tema activo. Esto cumple el Requisito 4.6 sin lógica extra.
- `background: transparent` y ausencia de `.chat-bubble` satisfacen Requisito 4.3.
- `user-select: none` + `pointer-events: none` refuerzan que son elementos de solo lectura.
- No se usa `animation` para evitar distracción visual; el divisor aparece directamente.

---

## Data Models

Los System Dividers **no tienen modelo de datos**. No se añade ningún tipo nuevo al array
`messages[]` ni a `localStorage`. Esta es la decisión central de la feature.

### Estructura del nodo DOM generado

```html
<div class="system-divider">---- Nombre ha caído en el Cross Moon ---</div>
```

| Propiedad | Valor |
|-----------|-------|
| Tag | `div` |
| Clase | `system-divider` |
| Contenido | `textContent` (texto plano, sin HTML) |
| Padre | `#chat-box` (`.chat-box`) |
| Posición | Último hijo en el momento de inserción |
| Vida | Solo en memoria DOM; se destruye al recargar, al `reset_chat`, o cuando `renderMessages()` vacía `chatBox.innerHTML` |

### Invariante de persistencia

```
messages[]  ──── NO contiene entradas de tipo divider
localStorage  ── dwjc2_chat_history  NO contiene entradas de tipo divider
WebSocket  ────── Los dividers NUNCA se envían ni se reciben como mensajes de chat
```

---

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe cumplirse en todas las
ejecuciones válidas del sistema — esencialmente, una afirmación formal sobre lo que el
software debe hacer. Las propiedades sirven como puente entre especificaciones legibles por
humanos y garantías de corrección verificables automáticamente.*

### Property 1: Texto correcto del divisor de entrada

*Para cualquier* nombre de usuario remoto (distinto del usuario local), al recibir un evento
`presence` con `event: "join"`, el último elemento insertado en `#chat-box` con clase
`system-divider` debe tener exactamente el texto
`"---- {nombre} ha caído en el Cross Moon ---"`.

**Validates: Requirements 1.1**

---

### Property 2: Texto correcto del divisor de salida

*Para cualquier* nombre de usuario remoto (distinto del usuario local), al recibir un evento
`presence` con `event: "leave"`, el último elemento insertado en `#chat-box` con clase
`system-divider` debe tener exactamente el texto
`"---- {nombre} ha cruzado la frontera de regreso. ---"`.

**Validates: Requirements 3.1**

---

### Property 3: Posición de inserción — siempre al final

*Para cualquier* estado previo del chat (de 0 a N mensajes y/o divisores ya presentes),
después de llamar a `renderSystemDivider(text)`, el divisor recién creado debe ser el
último hijo (`lastElementChild`) de `#chat-box`.

**Validates: Requirements 1.3, 2.4, 3.3**

---

### Property 4: Idempotencia del divisor de bienvenida

*Para cualquier* número N ≥ 1 de veces que se reciba un evento `player_list` que incluya
al usuario local durante la misma sesión, el DOM debe contener exactamente un elemento
`.system-divider` con el texto `"---- Disfruta de tu estadía en el Cross Moon. ---"`.

**Validates: Requirements 2.3**

---

### Property 5: Los divisores no se persisten en localStorage

*Para cualquier* secuencia de eventos `presence` join/leave y `player_list`, el valor
almacenado en `localStorage["dwjc2_chat_history"]` nunca debe contener entradas con
`role: "divider"` ni `type: "system_divider"` ni cualquier representación de un divisor.

**Validates: Requirements 5.1**

---

### Property 6: El reset elimina todos los divisores del DOM

*Para cualquier* número N ≥ 0 de elementos `.system-divider` presentes en `#chat-box`,
después de ejecutar `resetChatHistory()`, el DOM debe contener exactamente 0 elementos
con clase `system-divider`.

**Validates: Requirements 5.3**

---

### Property 7: Independencia del color respecto al tema activo

*Para cualquier* tema válido del sistema (turquesa, rojo, negro, verde), un elemento
`.system-divider` debe tener un `color` computado equivalente a `#64748b` (el valor de
`--text-muted` en `:root`), sin importar el color accent del tema.

**Validates: Requirements 4.6**

---

## Error Handling

| Situación | Comportamiento esperado |
|-----------|------------------------|
| `data.name` es `undefined` o vacío en evento `presence` | No se renderiza ningún divisor (guard `if (data.name && ...)`) |
| `chatBox` es `null` (elemento no encontrado en el DOM) | `renderSystemDivider` retorna inmediatamente sin lanzar error |
| `player_list` llega antes de que `player` esté inicializado | No es posible: `player` se inicializa síncronamente antes de `connectWebSocket()` en el flujo de `DOMContentLoaded` |
| `presence join` para el propio usuario (ej. eco del servidor) | Guard `data.name !== player.name` lo descarta sin renderizar divisor |
| `player_list` llega múltiples veces (reconexión WS) | Flag `welcomeDividerShown` garantiza que solo el primer evento relevante genera el divisor |
| `resetChatHistory()` llamado sin divisores presentes | `querySelectorAll` retorna `NodeList` vacía; `forEach` no ejecuta nada — sin error |

---

## Testing Strategy

### Enfoque de pruebas

Esta feature combina lógica de UI con comportamiento de estado (flag de sesión, invariante
de persistencia). Se aplica una estrategia dual:

- **Pruebas de propiedad (property-based):** para los invariantes universales (texto correcto,
  posición, idempotencia, no persistencia, limpieza en reset, independencia de tema).
- **Pruebas de ejemplo (example-based / unit):** para los comportamientos condicionales
  específicos (scroll condicional, estilo visual, estructura del nodo DOM).

### Biblioteca recomendada

**[fast-check](https://fast-check.dev/)** para JavaScript/TypeScript. Ejecutar mínimo
**100 iteraciones** por property test.

```sh
npm install --save-dev fast-check
```

### Property Tests

Cada property test debe etiquetarse con:
`// Feature: chat-join-leave-dividers, Property {N}: {descripción corta}`

**Property 1 & 2 — Texto del divisor join/leave:**
```js
// Feature: chat-join-leave-dividers, Property 1: texto correcto del divisor de entrada
fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 30 }), (username) => {
  fc.pre(username !== localPlayerName);
  simulatePresenceJoin(username);
  const divider = chatBox.lastElementChild;
  return divider?.classList.contains("system-divider") &&
         divider.textContent === `---- ${username} ha caído en el Cross Moon ---`;
}), { numRuns: 100 });
```

**Property 3 — Posición al final:**
```js
// Feature: chat-join-leave-dividers, Property 3: posición de inserción al final
fc.assert(fc.property(
  fc.array(fc.string({ minLength: 1 }), { maxLength: 20 }),
  fc.string({ minLength: 1 }),
  (existingMessages, username) => {
    setupChatWithMessages(existingMessages);
    fc.pre(username !== localPlayerName);
    simulatePresenceJoin(username);
    return chatBox.lastElementChild?.classList.contains("system-divider");
  }
), { numRuns: 100 });
```

**Property 4 — Idempotencia del divisor de bienvenida:**
```js
// Feature: chat-join-leave-dividers, Property 4: idempotencia del divisor de bienvenida
fc.assert(fc.property(fc.integer({ min: 1, max: 20 }), (n) => {
  resetWelcomeFlag();
  for (let i = 0; i < n; i++) simulatePlayerListWithSelf();
  const count = chatBox.querySelectorAll(".system-divider").length;
  // Solo 1 debe ser el de bienvenida con el texto específico
  const welcomeCount = [...chatBox.querySelectorAll(".system-divider")]
    .filter(el => el.textContent.includes("Disfruta de tu estadía")).length;
  return welcomeCount === 1;
}), { numRuns: 100 });
```

**Property 5 — No persistencia en localStorage:**
```js
// Feature: chat-join-leave-dividers, Property 5: no persisten en localStorage
fc.assert(fc.property(
  fc.array(fc.oneof(
    fc.record({ type: fc.constant("join"), name: fc.string({ minLength: 1 }) }),
    fc.record({ type: fc.constant("leave"), name: fc.string({ minLength: 1 }) })
  ), { maxLength: 15 }),
  (events) => {
    events.forEach(ev => simulatePresenceEvent(ev.type, ev.name));
    const history = JSON.parse(localStorage.getItem("dwjc2_chat_history") || "[]");
    return !history.some(entry => entry.role === "divider" || entry.type === "system_divider");
  }
), { numRuns: 100 });
```

**Property 6 — Reset limpia divisores:**
```js
// Feature: chat-join-leave-dividers, Property 6: reset elimina todos los divisores
fc.assert(fc.property(fc.integer({ min: 0, max: 10 }), (n) => {
  for (let i = 0; i < n; i++) renderSystemDividerDirect(`---- test ${i} ---`);
  resetChatHistory();
  return chatBox.querySelectorAll(".system-divider").length === 0;
}), { numRuns: 100 });
```

**Property 7 — Independencia de color por tema:**
```js
// Feature: chat-join-leave-dividers, Property 7: color muted independiente del tema
const themes = ["turquesa", "rojo", "negro", "verde"];
fc.assert(fc.property(fc.constantFrom(...themes), (theme) => {
  applyTheme(theme);
  renderSystemDividerDirect("---- test ---");
  const el = chatBox.querySelector(".system-divider");
  const color = getComputedStyle(el).color;
  // rgb(100, 116, 139) = #64748b
  return color === "rgb(100, 116, 139)";
}), { numRuns: 100 });
```

### Example / Unit Tests

**E1 — Estilo visual del divisor:**
```js
it("system-divider tiene italic, sin bubble, fondo transparente, centrado, ≤0.8rem", () => {
  renderSystemDividerDirect("---- test ---");
  const el = chatBox.querySelector(".system-divider");
  const cs = getComputedStyle(el);
  expect(cs.fontStyle).toBe("italic");
  expect(cs.textAlign).toBe("center");
  expect(el.querySelector(".chat-bubble")).toBeNull();
  expect(parseFloat(cs.fontSize)).toBeLessThanOrEqual(12.8); // 0.8rem en 16px base
  // background-color computado es rgba(0,0,0,0) o transparent
  expect(cs.backgroundColor).toMatch(/rgba\(0,\s*0,\s*0,\s*0\)|transparent/);
});
```

**E2 — Scroll condicional (scroll near bottom → scroll disparado):**
```js
it("renderSystemDivider hace scroll si el chat estaba al fondo", () => {
  mockNearBottom(true);
  const spy = jest.spyOn(container, "scrollTo");
  renderSystemDividerDirect("---- test ---");
  expect(spy).toHaveBeenCalled();
});

it("renderSystemDivider NO hace scroll si el chat no estaba al fondo", () => {
  mockNearBottom(false);
  const spy = jest.spyOn(container, "scrollTo");
  renderSystemDividerDirect("---- test ---");
  expect(spy).not.toHaveBeenCalled();
});
```

**E3 — Divisor de bienvenida (primera player_list con usuario local):**
```js
it("renderiza divisor de bienvenida al recibir la primera player_list con el usuario local", () => {
  simulatePlayerListWithSelf();
  const el = chatBox.querySelector(".system-divider");
  expect(el?.textContent).toBe("---- Disfruta de tu estadía en el Cross Moon. ---");
});
```

**E4 — No renderiza divisores para el propio usuario en presence:**
```js
it("no renderiza divisor join para el propio usuario", () => {
  simulatePresenceJoin(localPlayerName);
  expect(chatBox.querySelectorAll(".system-divider").length).toBe(0);
});
```

**E5 — Edge case: player_list con divider en localStorage es ignorado:**
```js
it("hidratar historial con divider simulado no renderiza .system-divider", () => {
  localStorage.setItem("dwjc2_chat_history", JSON.stringify([
    { id: 1, author: "__system__", text: "test", role: "divider", time: "12:00" }
  ]));
  hydrateHistory();
  expect(chatBox.querySelectorAll(".system-divider").length).toBe(0);
});
```

> La hidratación de historial usa `renderMessages()`, que itera sobre `messages[]`. Si el
> filtro en `saveHistory()` funciona correctamente (Property 5), los divisores nunca llegarán
> al `localStorage`. Este test de edge case es la red de seguridad por si `messages[]` alguna
> vez se contamina.

### Resumen de cobertura

| Requisito | Tipo de test | Test |
|-----------|-------------|------|
| 1.1 Texto divisor join | Property | P1 |
| 1.2 Estilo visual | Example | E1 |
| 1.3 Posición al final | Property | P3 |
| 1.4 Scroll condicional | Example | E2 |
| 2.1 Texto bienvenida | Example | E3 |
| 2.2 Estilo visual | Example | E1 |
| 2.3 Una vez por sesión | Property | P4 |
| 2.4 Posición al final | Property | P3 |
| 3.1 Texto divisor leave | Property | P2 |
| 3.2 Estilo visual | Example | E1 |
| 3.3 Posición al final | Property | P3 |
| 3.4 Scroll condicional | Example | E2 |
| 4.1–4.5 Estilos CSS | Example | E1 |
| 4.6 Independencia de tema | Property | P7 |
| 5.1 No persiste en localStorage | Property | P5 |
| 5.2 Edge case: divider en LS | Edge case | E5 |
| 5.3 Reset limpia divisores | Property | P6 |
