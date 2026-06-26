# Implementation Plan: Chat Join/Leave Dividers

## Overview

Implementar los System Dividers en el cliente del chat Cross Moon. Se agregan estilos CSS,
una variable de sesión, una función de renderizado DOM, y se extienden los handlers WebSocket
existentes — todo dentro de `style-chat.css` y `js/chat.js`, sin cambios en el backend.

## Tasks

- [x] 1. Agregar reglas CSS para `.system-divider` en `style-chat.css`
  - [x] 1.1 Escribir el bloque `.system-divider` con los estilos especificados en el diseño
    - Agregar la sección `/* ── System Dividers (join / leave / welcome) ── */` al final del
      bloque de mensajes, antes de la sección de typing indicator
    - Propiedades requeridas: `display: block`, `text-align: center`, `font-style: italic`,
      `font-size: 0.75rem`, `color: var(--text-muted)`, `background: transparent`,
      `border: none`, `padding: 0.35rem 0`, `margin: 0.2rem 0`,
      `user-select: none`, `pointer-events: none`, `position: relative`, `z-index: 1`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 2. Agregar variable de sesión y función `renderSystemDivider` en `chat.js`
  - [x] 2.1 Declarar la variable booleana `welcomeDividerShown = false` junto a las demás
    variables de sesión (`shouldStickToBottom`, `historyHydrated`, etc.)
    - _Requirements: 2.3_

  - [x] 2.2 Implementar la función `renderSystemDivider(text)` dentro del scope del módulo
    - Capturar `isChatNearBottom()` **antes** de insertar el nodo
    - Crear `div.system-divider` con `textContent = text` (no innerHTML, para prevenir XSS)
    - Hacer `chatBox.appendChild(el)`
    - Si el chat estaba al fondo, llamar `scrollChatToBottom({ smooth: true, force: true })`
    - Retornar inmediatamente si `chatBox` es `null`
    - _Requirements: 1.3, 1.4, 2.4, 3.3, 3.4, 4.1–4.5_

  - [ ]* 2.3 Escribir property test — Property 3: posición de inserción siempre al final
    - **Property 3: Posición de inserción — siempre al final**
    - **Validates: Requirements 1.3, 2.4, 3.3**
    - Usar `fast-check` con arrays de mensajes existentes (0…20) + username arbitrario
    - Verificar que `chatBox.lastElementChild` es el `.system-divider` recién insertado

  - [ ]* 2.4 Escribir unit tests para `renderSystemDivider`
    - E1: `.system-divider` tiene `font-style: italic`, `text-align: center`, sin `.chat-bubble`,
      `font-size ≤ 0.8rem`, `background` transparente
    - E2a: Si `isChatNearBottom()` retorna `true`, se llama `scrollChatToBottom`
    - E2b: Si `isChatNearBottom()` retorna `false`, **no** se llama `scrollChatToBottom`
    - _Requirements: 1.4, 3.4, 4.1–4.5_

- [x] 3. Extender el handler `presence` en `handleWsMessage`
  - [x] 3.1 Agregar llamada a `renderSystemDivider` en el bloque `event === "join"` del handler
    `presence`, con el guard `data.name && data.name !== player.name`
    - Texto: `` `---- ${data.name} ha caído en el Cross Moon ---` ``
    - Insertar **después** de que `remotePlayers.push(...)` ya actualizó la lista
    - _Requirements: 1.1_

  - [x] 3.2 Agregar llamada a `renderSystemDivider` en el bloque `event === "leave"` del handler
    `presence`, con el guard `data.name && data.name !== player.name`
    - Texto: `` `---- ${data.name} ha cruzado la frontera de regreso. ---` ``
    - Insertar **antes** de `renderPlayers()`
    - _Requirements: 3.1_

  - [ ]* 3.3 Escribir property test — Property 1: texto correcto del divisor de entrada
    - **Property 1: Texto correcto del divisor de entrada**
    - **Validates: Requirements 1.1**
    - Usar `fast-check` con `fc.string({ minLength: 1, maxLength: 30 })` como username
    - Precondición: `username !== localPlayerName`
    - Verificar que `chatBox.lastElementChild.textContent` es exactamente
      `---- ${username} ha caído en el Cross Moon ---`

  - [ ]* 3.4 Escribir property test — Property 2: texto correcto del divisor de salida
    - **Property 2: Texto correcto del divisor de salida**
    - **Validates: Requirements 3.1**
    - Mismo patrón que P1 pero simulando `presence leave`
    - Verificar texto exacto: `---- ${username} ha cruzado la frontera de regreso. ---`

  - [ ]* 3.5 Escribir unit tests para guards del handler `presence`
    - E4: `presence join` con `name === localPlayerName` → 0 elementos `.system-divider`
    - E4b: `presence join` con `name` vacío/undefined → 0 elementos `.system-divider`
    - _Requirements: 1.1, 3.1_

- [x] 4. Checkpoint — Verificar integración de divisores de entrada/salida
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Extender el handler `player_list` en `handleWsMessage` para el divisor de bienvenida
  - [x] 5.1 Agregar la lógica de divisor de bienvenida al bloque `player_list` existente,
    usando el flag `welcomeDividerShown`
    - Verificar `!welcomeDividerShown` antes de operar
    - Verificar que el usuario local está en `data.players` con `p.name === player.name`
    - Si cumple: `welcomeDividerShown = true` y llamar
      `renderSystemDivider("---- Disfruta de tu estadía en el Cross Moon. ---")`
    - Insertar esta lógica **después** del código existente de `renderPlayers()` y antes del
      `return` del bloque
    - _Requirements: 2.1, 2.3, 2.4_

  - [ ]* 5.2 Escribir property test — Property 4: idempotencia del divisor de bienvenida
    - **Property 4: Idempotencia del divisor de bienvenida**
    - **Validates: Requirements 2.3**
    - Usar `fc.integer({ min: 1, max: 20 })` como N repeticiones de `player_list`
    - Verificar que el conteo de `.system-divider` con texto "Disfruta de tu estadía" es
      exactamente 1, independientemente de N

  - [ ]* 5.3 Escribir unit test para el divisor de bienvenida
    - E3: Primera `player_list` con usuario local → divisor con texto exacto
      `---- Disfruta de tu estadía en el Cross Moon. ---`
    - _Requirements: 2.1_

- [x] 6. Actualizar `resetChatHistory()` para limpiar elementos `.system-divider` del DOM
  - [x] 6.1 Agregar `chatBox?.querySelectorAll(".system-divider").forEach(el => el.remove())`
    al final de `resetChatHistory()`, después de la llamada a `renderMessages()`
    - Esta línea es una capa de seguridad; `renderMessages()` ya vacía `chatBox.innerHTML`
    - _Requirements: 5.3_

  - [ ]* 6.2 Escribir property test — Property 6: el reset elimina todos los divisores del DOM
    - **Property 6: El reset elimina todos los divisores del DOM**
    - **Validates: Requirements 5.3**
    - Usar `fc.integer({ min: 0, max: 10 })` como N divisores pre-existentes
    - Verificar que tras `resetChatHistory()` hay exactamente 0 elementos `.system-divider`

- [ ] 7. Verificar invariante de no persistencia en localStorage
  - [ ]* 7.1 Escribir property test — Property 5: los divisores no se persisten en localStorage
    - **Property 5: Los divisores no se persisten en localStorage**
    - **Validates: Requirements 5.1**
    - Simular secuencia arbitraria de eventos `presence` join/leave (hasta 15 eventos)
    - Leer `localStorage["dwjc2_chat_history"]` y verificar que ninguna entrada tiene
      `role: "divider"` ni `type: "system_divider"`

  - [ ]* 7.2 Escribir edge case test — hidratación con divider simulado en localStorage
    - E5: Precargar `localStorage` con una entrada `{ role: "divider" }`, llamar a
      `hydrateHistory()` y verificar que el DOM no contiene `.system-divider`
    - _Requirements: 5.2_

- [ ] 8. Verificar independencia de color por tema
  - [ ]* 8.1 Escribir property test — Property 7: color muted independiente del tema activo
    - **Property 7: Independencia del color respecto al tema activo**
    - **Validates: Requirements 4.6**
    - Usar `fc.constantFrom("turquesa", "rojo", "negro", "verde")` como tema
    - Aplicar tema, renderizar `.system-divider`, leer `getComputedStyle(el).color`
    - Verificar que es `rgb(100, 116, 139)` (equivalente a `#64748b`)

- [ ] 9. Checkpoint final — Todos los tests pasan
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada task referencia los requisitos específicos para trazabilidad
- Los property tests requieren instalar `fast-check`: `npm install --save-dev fast-check`
- `renderSystemDivider` usa `textContent` (no `innerHTML`) para prevenir XSS con nombres arbitrarios
- El flag `welcomeDividerShown` garantiza exactamente un divisor de bienvenida por sesión, aunque el WS reconecte
- `renderMessages()` ya limpia `chatBox.innerHTML`; la línea en `resetChatHistory()` es defensa en profundidad

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4", "3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3", "3.4", "3.5", "5.1", "6.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "6.2", "7.1"] },
    { "id": 5, "tasks": ["7.2", "8.1"] }
  ]
}
```
