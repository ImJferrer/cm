# Requirements Document

## Introduction

El sistema de chat en tiempo real (Cross Moon · Draw World JC-2) experimenta degradación de rendimiento cuando el historial de mensajes acumulado en `localStorage` es grande y todos los mensajes se renderizan simultáneamente en el DOM. El objetivo de esta feature es implementar **paginación virtual con lazy loading hacia arriba**: en el DOM solo se mantienen los N mensajes más recientes visibles, y al hacer scroll hacia el tope del área del chat se cargan automáticamente los mensajes anteriores. La descarga del historial completo en JSON no se ve afectada.

## Glossary

- **Chat_Box**: El elemento `#chat-box` del DOM donde se renderizan los mensajes visibles.
- **Scroll_Area**: El elemento `.chat-scroll-area` que es el contenedor scrolleable del chat.
- **Virtual_Window**: El subconjunto de mensajes del historial completo que están actualmente renderizados en el DOM.
- **Full_History**: El array `messages` completo en memoria, cargado desde `localStorage` bajo la clave `dwjc2_chat_history`.
- **Page_Size**: El número de mensajes que conforman una "página" cargada de una vez al hacer scroll hacia arriba. Valor sugerido: 40 mensajes.
- **Initial_Batch**: El lote de mensajes más recientes que se renderizan al abrir el chat. Valor sugerido: 60 mensajes.
- **Load_More_Trigger**: El punto de scroll (cerca del tope del Scroll_Area) que dispara la carga de mensajes anteriores.
- **Session_Divider**: Los elementos `.system-divider` que marcan eventos de sistema (entrada/salida de jugadores, mensajes del sistema) y están intercalados con los mensajes normales.
- **JSON_Download**: La funcionalidad del botón "Descargar Chat (JSON)" que exporta el Full_History completo.
- **Pagination_Manager**: El módulo lógico (dentro de `chat.js`) que gestiona qué subconjunto de mensajes está actualmente en el Virtual_Window.
- **Anchor_Scroll**: La posición de scroll preservada al insertar mensajes hacia arriba para evitar que el Scroll_Area "salte" visualmente.
- **Sticky_Bottom**: El comportamiento donde el chat se mantiene pegado al fondo cuando el usuario está leyendo los mensajes más recientes.

## Requirements

### Requirement 1: Renderizado parcial del historial al cargar el chat

**User Story:** Como jugador, quiero que el chat cargue rápidamente incluso cuando hay cientos de mensajes guardados, de modo que pueda participar en la sesión sin experimentar lag al abrir la página.

#### Acceptance Criteria

1. WHEN el chat termina de hidratarse desde `localStorage`, THE Pagination_Manager SHALL renderizar en el Chat_Box únicamente los últimos Initial_Batch mensajes del Full_History.
2. WHEN el Full_History contiene igual o menos mensajes que el Initial_Batch, THE Pagination_Manager SHALL renderizar todos los mensajes del Full_History sin aplicar paginación. WHEN el Full_History contiene más mensajes que el Initial_Batch, THE Pagination_Manager SHALL aplicar paginación y limitar la visualización al Initial_Batch de mensajes más recientes.
3. THE Pagination_Manager SHALL mantener el Full_History completo en memoria sin descartarlo, independientemente de cuántos mensajes estén en el Virtual_Window.
4. WHEN el renderizado inicial termina, THE Chat_Box SHALL mostrar el scroll posicionado en el último mensaje (Sticky_Bottom).

---

### Requirement 2: Carga de mensajes anteriores al hacer scroll hacia arriba (Lazy Loading)

**User Story:** Como jugador, quiero poder leer mensajes anteriores desplazándome hacia arriba en el chat, sin que la página se congele ni pierda mi posición de lectura.

#### Acceptance Criteria

1. WHEN el usuario hace scroll hasta el Load_More_Trigger (a 150px o menos del tope del Scroll_Area), THE Pagination_Manager SHALL cargar el bloque anterior de Page_Size mensajes e insertarlos al inicio del Chat_Box.
2. WHEN se insertan nuevos mensajes al inicio del Chat_Box, THE Pagination_Manager SHALL preservar la posición visual del Scroll_Area mediante Anchor_Scroll, de modo que el mensaje que estaba en la parte superior visible permanezca en la misma posición.
3. WHEN el Virtual_Window ya contiene el primer mensaje del Full_History, THE Pagination_Manager SHALL dejar de intentar cargar mensajes adicionales hacia arriba.
4. WHILE el Full_History no contiene más mensajes que los ya mostrados, THE Chat_Box SHALL no mostrar indicador de carga adicional.
5. WHEN el usuario hace scroll hacia arriba disparando la carga, THE Pagination_Manager SHALL establecer un flag de carga activo (loading flag) durante la inserción de mensajes anteriores y desactivarlo al completar la operación, para evitar múltiples disparos consecutivos.

---

### Requirement 3: Preservación del Sticky_Bottom para mensajes nuevos

**User Story:** Como jugador, quiero que los nuevos mensajes que llegan en tiempo real (por WebSocket) aparezcan automáticamente en pantalla si estoy leyendo el final del chat, tal como ocurre hoy.

#### Acceptance Criteria

1. WHEN llega un nuevo mensaje por WebSocket o se envía un mensaje propio, THE Pagination_Manager SHALL agregar el mensaje al final del Virtual_Window y al Full_History.
2. WHILE el usuario está posicionado cerca del final del Scroll_Area (dentro del SCROLL_BOTTOM_THRESHOLD existente), THE Chat_Box SHALL desplazarse automáticamente al nuevo mensaje.
3. WHILE el usuario está leyendo mensajes anteriores (scroll hacia arriba), THE Chat_Box SHALL NOT desplazarse automáticamente al recibir mensajes nuevos.
4. WHEN el usuario recibe un nuevo mensaje de otro usuario mientras lee el historial, THE Chat_Box SHALL mostrar un indicador visual ("↓ Nuevo mensaje") en la parte inferior del Scroll_Area. IF el mensaje nuevo es enviado por el propio usuario, THE Chat_Box SHALL NOT mostrar el indicador.
5. WHEN el usuario hace clic en el indicador "↓ Nuevo mensaje", THE Chat_Box SHALL desplazarse al último mensaje y ocultar el indicador.

---

### Requirement 4: Inclusión de Session_Dividers en el Virtual_Window

**User Story:** Como jugador, quiero ver los divisores de sesión (entradas, salidas, mensajes del sistema) correctamente posicionados dentro de los mensajes cargados, para no perder el contexto de la sesión.

#### Acceptance Criteria

1. WHEN el Pagination_Manager calcula qué mensajes incluir en el Virtual_Window, THE Pagination_Manager SHALL incluir también los Session_Dividers cuya posición (`afterIndex`) corresponda al rango de índices de mensajes actualmente visibles.
2. WHEN se cargan mensajes anteriores mediante lazy loading, THE Pagination_Manager SHALL incluir los Session_Dividers correspondientes al rango de mensajes recién cargado.
3. THE Pagination_Manager SHALL NOT duplicar Session_Dividers al cargar lotes adicionales de mensajes.

---

### Requirement 5: No afectar la descarga del historial completo (JSON Download)

**User Story:** Como GM (Cristal), quiero que el botón "Descargar Chat (JSON)" siga exportando el historial completo de mensajes, sin importar cuántos estén visibles en pantalla en ese momento.

#### Acceptance Criteria

1. WHEN el usuario hace clic en "Descargar Chat (JSON)", THE JSON_Download SHALL leer el Full_History completo desde `localStorage` (clave `dwjc2_chat_history`) y exportarlo íntegramente.
2. THE JSON_Download SHALL NOT depender del Virtual_Window ni del estado del Pagination_Manager para construir el archivo exportado.
3. THE JSON_Download SHALL producir un archivo JSON idéntico al que produce hoy (antes de esta feature), independientemente del tamaño del Virtual_Window.

---

### Requirement 6: Rendimiento del renderizado

**User Story:** Como jugador, quiero que la carga de mensajes adicionales al hacer scroll sea perceptiblemente rápida y no congele la interfaz.

#### Acceptance Criteria

1. WHEN el Pagination_Manager inserta un lote de Page_Size mensajes en el Chat_Box, THE Chat_Box SHALL completar la inserción en el mismo frame o en el siguiente frame de animación sin bloquear el hilo principal.
2. THE Pagination_Manager SHALL NOT llamar a la función `renderMessages()` completa (que limpia y re-renderiza todo el Chat_Box) al añadir mensajes nuevos por lazy loading; en su lugar SHALL insertar solo los nodos nuevos. Ambos métodos (renderizado completo e inserción incremental) PUEDEN coexistir para distintas operaciones: el renderizado completo se reserva para resets o cambios de versión, y la inserción incremental se usa para lazy loading y mensajes en tiempo real.
3. WHEN el Virtual_Window supera los 200 mensajes renderizados simultáneamente, THE Pagination_Manager SHALL considerar eliminar los mensajes más lejanos al extremo opuesto de la dirección de scroll para mantener el DOM acotado (windowing opcional, segunda fase).

---

### Requirement 7: Indicador de carga al inicio del chat

**User Story:** Como jugador, quiero saber visualmente cuándo hay más mensajes anteriores disponibles para cargar, para entender que el historial está paginado.

#### Acceptance Criteria

1. WHEN el Virtual_Window no contiene el primer mensaje del Full_History, THE Chat_Box SHALL mostrar un elemento indicador al inicio del Chat_Box con el texto "Cargar mensajes anteriores" o un spinner equivalente.
2. WHEN el Pagination_Manager está cargando el lote anterior, THE indicador SHALL mostrar un estado de carga activo (ej. spinner animado). IF el Virtual_Window ya contiene el primer mensaje del Full_History, THE indicador SHALL ocultarse completamente, incluso si la operación de carga está en progreso.
3. WHEN el Virtual_Window contiene el primer mensaje del Full_History, THE indicador SHALL ocultarse automáticamente.
