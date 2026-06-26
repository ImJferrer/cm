# Requirements Document

## Introduction

Esta feature agrega divisores de sistema (system dividers) al chat del Cross Moon. Son mensajes visuales
sutiles que aparecen automáticamente cuando un usuario entra o sale del chat. Funcionan como separadores
narrativos que refuerzan la ambientación del mundo sin interrumpir el flujo de conversación.

Hay tres mensajes distintos según la perspectiva y el evento:
- **Llegada (vista ajena):** quienes ya estaban conectados ven `---- USUARIO ha caído en el Cross Moon ---`
- **Llegada (vista propia):** el usuario recién llegado ve `---- Disfruta de tu estadía en el Cross Moon. ---`
- **Salida (vista de todos):** todos los demás ven `---- USUARIO ha cruzado la frontera de regreso. ---`

El estilo es gris, cursiva, sin fondo — un divisor visual sutil entre mensajes.

---

## Glossary

- **System_Divider**: Elemento visual de solo lectura que aparece en el chat para señalar eventos de presencia (entrada/salida de usuarios). No es un mensaje de chat convencional; no tiene autor ni burbuja, solo texto.
- **Chat_Client**: La instancia del navegador que ejecuta `chat.js` y renderiza los mensajes en el DOM.
- **Presence_Event**: Evento WebSocket de tipo `presence` emitido por el servidor cuando un cliente envía `hello` (join) o se desconecta (leave).
- **Local_User**: El usuario dueño del `Chat_Client` actual (identificado por `player.name` en `chat.js`).
- **Remote_User**: Cualquier otro usuario conectado que no es el `Local_User`.
- **Username**: El nombre visible del usuario tal como está almacenado en `meta.name` en el servidor y `player.name` en el cliente.

---

## Requirements

### Requirement 1: Divisor de entrada para usuarios remotos

**User Story:** Como usuario ya conectado al chat, quiero ver un aviso sutil cuando alguien nuevo entra,
para saber quién acaba de llegar sin que interrumpa la conversación.

#### Acceptance Criteria

1. WHEN the `Chat_Client` receives a `presence` event with `event: "join"` and the `name` field does not match the `Local_User`'s `Username`, THE `Chat_Client` SHALL render a `System_Divider` with the text `---- {Username} ha caído en el Cross Moon ---`.
2. THE `System_Divider` SHALL be displayed in italic style, gray color, and without background or message bubble.
3. THE `System_Divider` SHALL be inserted at the bottom of the chat message list, after all existing messages.
4. WHEN the `Chat_Client` renders the `System_Divider`, THE `Chat_Client` SHALL scroll to the bottom of the chat if the chat was already at the bottom before the divider was inserted.

---

### Requirement 2: Divisor de bienvenida para el propio usuario

**User Story:** Como usuario que acaba de entrar al chat, quiero ver un mensaje de bienvenida personalizado,
para sentir que llego a un lugar con atmósfera.

#### Acceptance Criteria

1. WHEN the `Chat_Client` successfully sends the `hello` message to the server and receives a `player_list` response that includes the `Local_User`'s own entry for the first time in the session, THE `Chat_Client` SHALL render a `System_Divider` with the text `---- Disfruta de tu estadía en el Cross Moon. ---`.
2. THE `System_Divider` SHALL be displayed in italic style, gray color, and without background or message bubble.
3. THE `System_Divider` SHALL be rendered exactly once per session, regardless of WebSocket reconnections.
4. THE `System_Divider` SHALL be inserted at the bottom of the chat message list after the chat history is loaded.

---

### Requirement 3: Divisor de salida para usuarios remotos

**User Story:** Como usuario conectado al chat, quiero ver un aviso cuando alguien se va,
para saber quién abandonó la sala de manera discreta.

#### Acceptance Criteria

1. WHEN the `Chat_Client` receives a `presence` event with `event: "leave"` and the `name` field does not match the `Local_User`'s `Username`, THE `Chat_Client` SHALL render a `System_Divider` with the text `---- {Username} ha cruzado la frontera de regreso. ---`.
2. THE `System_Divider` SHALL be displayed in italic style, gray color, and without background or message bubble.
3. THE `System_Divider` SHALL be inserted at the bottom of the chat message list, after all existing messages.
4. WHEN the `Chat_Client` renders the `System_Divider`, THE `Chat_Client` SHALL scroll to the bottom of the chat if the chat was already at the bottom before the divider was inserted.

---

### Requirement 4: Estilo visual del divisor

**User Story:** Como usuario del chat, quiero que los divisores de sistema tengan un estilo visual distinto
a los mensajes normales, para que sean fáciles de distinguir pero no llamen demasiado la atención.

#### Acceptance Criteria

1. THE `System_Divider` SHALL use a gray color (hex `#64748b` or CSS variable `--text-muted`) for its text.
2. THE `System_Divider` SHALL render its text in italic (`font-style: italic`).
3. THE `System_Divider` SHALL have no background color and no bubble container.
4. THE `System_Divider` SHALL be centered horizontally within the chat message area.
5. THE `System_Divider` SHALL have a font size smaller than regular chat messages (≤ `0.8rem`).
6. IF the active theme changes, THEN THE `System_Divider` SHALL continue using the muted gray color regardless of theme accent color.

---

### Requirement 5: Los divisores no se persisten en el historial local

**User Story:** Como usuario del chat, quiero que los divisores de presencia no ensucien el historial guardado,
para que al recargar la página solo vea mensajes reales y no una acumulación de avisos de entrada/salida.

#### Acceptance Criteria

1. THE `Chat_Client` SHALL NOT save `System_Divider` entries to `localStorage` as part of the chat history (`dwjc2_chat_history`).
2. WHEN the `Chat_Client` reloads the chat history from `localStorage`, THE `Chat_Client` SHALL NOT render any previously stored `System_Divider` entries even if they exist.
3. WHEN the chat is reset via `reset_chat` event, THE `Chat_Client` SHALL remove all `System_Divider` elements from the DOM along with all other messages.
