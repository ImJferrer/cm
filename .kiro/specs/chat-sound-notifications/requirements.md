# Requirements Document

## Introduction

Esta funcionalidad agrega sonidos de notificación al chat en tiempo real de Cross Moon · Draw World JC-2. Los sonidos se activan automáticamente según el tipo de evento: cuando el usuario envía un mensaje, cuando recibe uno de otro humano o de la IA, y cuando alguien lo menciona con @.

## Glossary

- **Sound_Manager**: Módulo del cliente (JavaScript) responsable de cargar y reproducir los sonidos de notificación.
- **Notification_Sound**: Archivo de audio en `assets/Notify/` que se reproduce al ocurrir un evento de chat.
- **Mention**: Referencia explícita a un usuario mediante el prefijo `@` seguido de su nombre dentro del texto de un mensaje.
- **Chat_Client**: La aplicación de frontend que corre en el navegador del usuario (`chat.html` + `js/chat.js`).
- **WebSocket_Event**: Mensaje recibido a través de la conexión WebSocket del chat.
- **AI_Message**: Mensaje enviado por un personaje controlado por inteligencia artificial, distinguible por su tipo o autor en el WebSocket_Event.

---

## Requirements

### Requirement 1: Sonido al enviar un mensaje

**User Story:** Como usuario del chat, quiero escuchar un sonido de confirmación cuando envío un mensaje, para tener retroalimentación auditiva de que mi mensaje fue enviado.

#### Acceptance Criteria

1. WHEN el usuario despacha un mensaje en el chat, THE Sound_Manager SHALL reproducir el archivo `assets/Notify/EnviarMensaje.mp3` únicamente en el dispositivo del usuario remitente.
2. IF el archivo `assets/Notify/EnviarMensaje.mp3` produce cualquier error de carga o reproducción, THEN THE Sound_Manager SHALL capturar el error en silencio y continuar el flujo de envío sin mostrar ningún error visible al usuario.

---

### Requirement 2: Sonido al recibir un mensaje

**User Story:** Como usuario del chat, quiero escuchar un sonido de notificación cuando otro usuario humano o la IA envían un mensaje, para darme cuenta de la nueva actividad sin necesidad de tener la pantalla en foco.

#### Acceptance Criteria

1. WHEN el Chat_Client recibe un WebSocket_Event de tipo `chat` cuyo autor es distinto al usuario local (ya sea un humano conectado o un AI_Message), y el mensaje no contiene una Mention dirigida al usuario local, THE Sound_Manager SHALL reproducir el archivo `assets/Notify/RecibirMensaje.mp3`.
2. IF el Chat_Client recibe un WebSocket_Event de tipo `chat` cuyo autor coincide con el nombre del usuario local, THEN THE Sound_Manager SHALL omitir la reproducción de `RecibirMensaje.mp3`.
3. IF el archivo `assets/Notify/RecibirMensaje.mp3` produce cualquier error de carga o reproducción, THEN THE Sound_Manager SHALL capturar el error en silencio y continuar el procesamiento del mensaje sin mostrar ningún error visible al usuario.

---

### Requirement 3: Sonido de mención con @

**User Story:** Como usuario del chat, quiero escuchar un sonido diferenciado cuando alguien me menciona con @, para identificar rápidamente que hay un mensaje dirigido a mí.

#### Acceptance Criteria

1. WHEN el Chat_Client recibe un WebSocket_Event de tipo `chat` cuyo texto contiene `@` seguida del nombre exacto del usuario local (sin distinción de mayúsculas/minúsculas, usando una expresión regular del tipo `/@nombre\b/i`), THE Sound_Manager SHALL reproducir el archivo `assets/Notify/MencionMensaje.mp3` en el dispositivo de ese usuario.
2. WHEN el texto del mensaje contiene una Mention dirigida al usuario local, THE Sound_Manager SHALL reproducir `MencionMensaje.mp3` en lugar de `RecibirMensaje.mp3`, de modo que solo se reproduzca un sonido por mensaje recibido.
3. IF el archivo `assets/Notify/MencionMensaje.mp3` produce cualquier error de carga o reproducción, THEN THE Sound_Manager SHALL intentar reproducir `RecibirMensaje.mp3` como alternativa.
