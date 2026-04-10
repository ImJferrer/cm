// js/chat.js

document.addEventListener("DOMContentLoaded", () => {
  const chatBox = document.getElementById("chat-box");
  const chatScrollArea = document.querySelector(".chat-scroll-area");

  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("send-btn");

  const playersListEl = document.getElementById("players-list");
  const playersCountEl = document.getElementById("players-count");

  const typingIndicator = document.getElementById("typing-indicator");
  const typingLabel = typingIndicator
    ? typingIndicator.querySelector(".typing-label")
    : null;

  const userNameEl = document.getElementById("chat-user-name");
  const userTagEl = document.getElementById("chat-user-tag");
  const userAvatarEl = document.getElementById("chat-user-avatar");

  const editOverlay = document.getElementById("edit-modal-overlay");
  const editTextArea = document.getElementById("editText");
  const editTextAreaGM = document.getElementById("editTextGM");
  const editTextAreaSylvie = document.getElementById("editTextSylvie");
  const editLabelGM = document.getElementById("editLabelGM");
  const editLabelSylvie = document.getElementById("editLabelSylvie");
  const editSingleWrapper = document.getElementById("edit-single-wrapper");
  const editDualWrapper = document.getElementById("edit-dual-wrapper");
  const saveEditBtn = document.getElementById("saveEditBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn");

    // Elementos del modal de autenticacion de pasaportes especiales (Cristal / Sylvie)
  const gmAuthOverlay = document.getElementById("gm-auth-overlay");
  const gmAuthPasswordInput = document.getElementById("gm-auth-password");
  const gmAuthError = document.getElementById("gm-auth-error");
  const gmAuthMessage = document.getElementById("gm-auth-message");
  const gmAuthCancelBtn = document.getElementById("gm-auth-cancel");
  const gmAuthSubmitBtn = document.getElementById("gm-auth-submit");
  let gmAuthMode = null; // "cristal" | "sylvie" | null

  const API_BASE = resolveApiBase();
  const API_URL = API_BASE ? `${API_BASE}/api/chat` : "";
  const GM_AUTH_URL = API_BASE ? `${API_BASE}/api/gm-auth` : "";
  const WS_URL = API_BASE ? API_BASE.replace(/^http/i, "ws") + "/ws" : "";

  const wsState = {
    ws: null,
    connected: false,
    clientId: null,
  };

  function resolveApiBase() {
    const raw =
      window.DWJC2_API_BASE ||
      localStorage.getItem("dwjc2_api_base") ||
      window.location.origin;
    return String(raw || "").replace(/\/+$/, "");
  }

  const HISTORY_KEY = "dwjc2_chat_history";

  const GM_SETTINGS_KEY = "dwjc2_gm_settings";

  const SYLVIE_NAME = "Sylvie";

    const AI_HISTORY_LIMIT = 80;       // Cuántos mensajes recientes ve la IA
  const TYPING_MIN_DELAY_MS = 700;   // Tiempo mínimo de "escribiendo..." en ms


  function autoResizeMessageInput() {
    if (!messageInput) return;

    messageInput.style.height = "auto";

    const computed = window.getComputedStyle(messageInput);
    const lineHeight = parseFloat(computed.lineHeight) || 20;
    const maxLines = 5;
    const maxHeight = lineHeight * maxLines;

    const newHeight = Math.min(messageInput.scrollHeight, maxHeight);
    messageInput.style.height = newHeight + "px";
  }

  const WS_RECONNECT_MS = 2000;

  function sendWs(payload) {
    if (!wsState.ws || wsState.ws.readyState !== WebSocket.OPEN) return;
    try {
      wsState.ws.send(JSON.stringify(payload));
    } catch (_) {}
  }

  function handleWsMessage(raw) {
    if (typeof raw !== "string") return;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return;
    }
    if (!data || typeof data !== "object") return;

    // — Bienvenida: guarda tu propio clientId ─────────────────
    if (data.type === "welcome") {
      wsState.clientId = data.clientId || null;
      return;
    }

    // — Mensaje de chat remoto ────────────────────────────────
    if (data.type === "chat" && data.message) {
      const msg = data.message;
      if (!msg || !msg.text || !msg.author) return;
      addMessage(String(msg.text), String(msg.author), {
        role: msg.role,
        time: msg.time,
        remote: true,
      });
      return;
    }

    // — Lista completa de jugadores (snapshot) ────────────────
    if (data.type === "player_list" && Array.isArray(data.players)) {
      remotePlayers = data.players;
      renderPlayers();
      return;
    }

    // — Evento de presencia individual (join / leave) ─────────
    if (data.type === "presence") {
      if (data.event === "join") {
        if (!remotePlayers.find((p) => p.clientId === data.clientId)) {
          remotePlayers.push({ clientId: data.clientId, name: data.name });
        }
      } else if (data.event === "leave") {
        remotePlayers = remotePlayers.filter((p) => p.clientId !== data.clientId);
      }
      renderPlayers();
      return;
    }
  }

  function connectWebSocket(playerName) {
    if (!WS_URL) return;
    if (wsState.ws && wsState.ws.readyState === WebSocket.OPEN) return;

    try {
      wsState.ws = new WebSocket(WS_URL);
    } catch (err) {
      console.warn("[ws] No se pudo abrir:", err);
      return;
    }

    wsState.ws.addEventListener("open", () => {
      wsState.connected = true;
      sendWs({ type: "hello", name: playerName || "Viajero" });
    });

    wsState.ws.addEventListener("message", (event) => {
      handleWsMessage(event.data);
    });

    wsState.ws.addEventListener("close", () => {
      wsState.connected = false;
      setTimeout(() => {
        if (wsState.ws && wsState.ws.readyState === WebSocket.CLOSED) {
          connectWebSocket(playerName);
        }
      }, WS_RECONNECT_MS);
    });

    wsState.ws.addEventListener("error", () => {
      wsState.connected = false;
    });
  }

  // 1) Cargar jugador del localStorage
  const playerRaw = localStorage.getItem("dwjc2_player");
  if (!playerRaw) {
    window.location.href = "index.html";
    return;
  }
  const player = JSON.parse(playerRaw);
  connectWebSocket(player.name || "Viajero");

    // --- detección de GM + nombres especiales ---
  const normalizedName = (player.name || "").toLowerCase().trim();
  const storedGmFlag = localStorage.getItem("dwjc2_gm_flag") === "1";

  // Eres GM solo si:
  //  - tu pasaporte dice "Cristal"
  //  - y en ESTE navegador ya pasaste la contraseña correctamente
  let isGM = normalizedName === "cristal" && storedGmFlag;

  // (Opcional, pero útil para debug)
  console.log("[DWJC2] Nombre:", normalizedName, "GM flag:", storedGmFlag, "isGM:", isGM);



  // 2) Ajustar header lateral con datos del jugador
  if (userNameEl) userNameEl.textContent = player.name || "Viajero";

  

  if (userTagEl) {
    const num = Math.floor(Math.random() * 9000) + 1000;
    userTagEl.textContent = `ID: DW-${num}`;
  }

  if (userAvatarEl) {
    if (player.avatarDataUrl) {
      userAvatarEl.style.backgroundImage = `url("${player.avatarDataUrl}")`;
      userAvatarEl.style.backgroundSize = "cover";
      userAvatarEl.style.backgroundPosition = "center";
      userAvatarEl.textContent = "";
    } else {
      const initial = (player.name || "V")[0]?.toUpperCase();
      userAvatarEl.textContent = initial || "V";
    }
  }

  function openGmAuthModal(mode) {
    if (!gmAuthOverlay || !gmAuthPasswordInput) return;
    gmAuthMode = mode;

    gmAuthOverlay.classList.add("open");
    gmAuthPasswordInput.value = "";
    if (gmAuthError) gmAuthError.textContent = "";

    if (gmAuthMessage) {
      if (mode === "cristal") {
        gmAuthMessage.textContent =
          "Este pasaporte esta protegido. Introduce la contrasena para desbloquear los poderes del Narrador.";
      } else if (mode === "sylvie") {
        gmAuthMessage.textContent =
          "Este pasaporte pertenece a Sylvie y esta protegido por runas antiguas. Nadie puede romper este sello.";
      }
    }

    gmAuthPasswordInput.focus();
  }

  function closeGmAuthModal() {
    if (!gmAuthOverlay) return;
    gmAuthOverlay.classList.remove("open");
    gmAuthMode = null;
  }

  if (gmAuthCancelBtn) {
    gmAuthCancelBtn.addEventListener("click", () => {
      closeGmAuthModal();
    });
  }

    async function handleGmAuthSubmit() {
    if (!gmAuthMode || !gmAuthPasswordInput) return;
    const pwd = gmAuthPasswordInput.value.trim();
    if (!pwd) {
      if (gmAuthError) gmAuthError.textContent = "Ingresa una contrasena.";
      return;
    }

    const lowerName = (player.name || "").toLowerCase().trim();

    // 🕊 Sylvie: nunca se desbloquea
    if (gmAuthMode === "sylvie") {
      if (gmAuthError) {
        gmAuthError.textContent =
          "Contrasena incorrecta. Este pasaporte esta sellado permanentemente.";
      }
      return;
    }

    // 🔐 Cristal: validar contra backend y .env
    try {
      const res = await fetch(GM_AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: lowerName, password: pwd }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (gmAuthError) {
          gmAuthError.textContent =
            data && data.error
              ? data.error
              : "No se pudo validar la contrasena.";
        }
        return;
      }

      // Éxito: eres GM en este navegador
      localStorage.setItem("dwjc2_gm_flag", "1");
      isGM = true;
       gmSettings.gmEnabled = true;
      saveGMSettings();

      // Cargamos settings (si los habia) y montamos el panel GM
      loadGMSettings();
      closeGmAuthModal();
      setupGMPanel();

      // Actualizamos mensajes tipo "X esta escribiendo..."
      if (typingLabel) {
        typingLabel.textContent = `${getGMName()} esta escribiendo...`;
      }
    } catch (err) {
      console.error(err);
      if (gmAuthError) {
        gmAuthError.textContent =
          "No se pudo contactar con el servidor. Intenta de nuevo.";
      }
    }
  }

  if (gmAuthSubmitBtn) {
    gmAuthSubmitBtn.addEventListener("click", handleGmAuthSubmit);
  }
  if (gmAuthPasswordInput) {
    gmAuthPasswordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleGmAuthSubmit();
      }
    });
  }

  // Cerrar el modal si se hace clic fuera de la caja
  if (gmAuthOverlay) {
    gmAuthOverlay.addEventListener("click", (e) => {
      if (e.target === gmAuthOverlay) {
        closeGmAuthModal();
      }
    });
  }

     // ========== CONFIG GM & SETTINGS ==========

  let gmSettings = {
    gmName: "...", // nombre visible del GM (default "...")
    model: "llama-3.3-70b",
    extraPrompt: "",
    avatarEmoji: "✒️",
    avatarImageDataUrl: "",
    stripThinkBlocks: true,
    thinkEnabled: false,
    gmCardName: "",
    gmCardPrompt: "",
    gmCardAvatarDataUrl: "",
    gmRole: "random", // rol activo del GM (villano, heroe, random)
    gmEnabled: true, // ⬅️ GM ACTIVADO por defecto para que la IA responda a todos los jugadores
    gmModerationEnabled: false, // revisar respuestas del GM

    sylvieEnabled: false, // Sylvie por defecto dormida / desconectada
    sylvieModerationEnabled: false, // revisar respuestas de Sylvie
    sylvieAvatarEmoji: "👑",
    sylvieAvatarImageDataUrl: "",
    sylvieExtraPrompt: "",
  };


  function loadGMSettings() {
    try {
      const raw = localStorage.getItem(GM_SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        gmSettings = { ...gmSettings, ...parsed };

        // compat antigua: si tenía "moderationEnabled", úsalo como gmModerationEnabled
        if (
          parsed.moderationEnabled !== undefined &&
          parsed.gmModerationEnabled === undefined
        ) {
          gmSettings.gmModerationEnabled = !!parsed.moderationEnabled;
        }
      }
    } catch (err) {
      console.error("No se pudo leer GM settings:", err);
    }
  }

  function saveGMSettings() {
    try {
      localStorage.setItem(GM_SETTINGS_KEY, JSON.stringify(gmSettings));
    } catch (err) {
      console.error("No se pudo guardar GM settings:", err);
    }
  }

  if (isGM) {
    loadGMSettings();
  }

  function getGMName() {
    const explicit = gmSettings.gmName;
    const fromCard = gmSettings.gmCardName;
    if (explicit && explicit.trim().length > 0 && explicit.trim() !== "...") {
      return explicit.trim();
    }
    if (fromCard && fromCard.trim().length > 0) {
      return fromCard.trim();
    }
    return "...";
  }

  // ==============================
  //   CHARACTER CARD HELPERS (PNG/JSON)
  // ==============================

  const utf8Decoder = new TextDecoder("utf-8");
  const latin1Decoder = new TextDecoder("latin1");

  function normalizeCardData(raw) {
    const data = raw?.data || raw || {};
    return {
      name: data.name || data.display_name || "",
      description: data.description || "",
      personality: data.personality || "",
      scenario: data.scenario || data.world_scenario || "",
      firstMes: data.first_mes || data.first_message || "",
      mesExamples: Array.isArray(data.mes_example)
        ? data.mes_example
        : data.mes_example
        ? [data.mes_example]
        : [],
      creatorNotes: data.creator_notes || data.creator_note || "",
      systemPrompt: data.system_prompt || "",
      postHistory: data.post_history_instructions || "",
    };
  }

  function buildCardPrompt(card) {
    if (!card) return "";
    const lines = [];
    if (card.description) lines.push(`Descripción: ${card.description}`);
    if (card.personality) lines.push(`Personalidad: ${card.personality}`);
    if (card.scenario) lines.push(`Contexto / Escenario: ${card.scenario}`);
    if (card.firstMes)
      lines.push(`Saludo o entrada recomendada: ${card.firstMes}`);
    if (card.mesExamples && card.mesExamples.length > 0) {
      lines.push("Ejemplos de diálogo:");
      card.mesExamples.forEach((ex) => {
        if (ex && ex.trim()) lines.push(ex.trim());
      });
    }
    if (card.creatorNotes) lines.push(`Notas del creador: ${card.creatorNotes}`);
    if (card.systemPrompt) lines.push(`Reglas del sistema: ${card.systemPrompt}`);
    if (card.postHistory)
      lines.push(`Instrucciones post-historial: ${card.postHistory}`);
    return lines.join("\n");
  }

  async function inflateData(rawBytes) {
    if (typeof DecompressionStream === "undefined") return null;
    try {
      const ds = new DecompressionStream("deflate");
      const stream = new Blob([rawBytes]).stream().pipeThrough(ds);
      const resp = new Response(stream);
      const arr = new Uint8Array(await resp.arrayBuffer());
      return arr;
    } catch (_) {
      return null;
    }
  }

  async function tryParseCardString(text) {
    if (!text || typeof text !== "string") return null;
    // 1) ¿Es JSON directo?
    try {
      return normalizeCardData(JSON.parse(text));
    } catch (_) {}

    // 2) ¿Es base64 de JSON o base64 deflate?
    try {
      const raw = atob(text.trim());
      // Intentar como UTF-8
      try {
        return normalizeCardData(JSON.parse(raw));
      } catch (_) {}

      // Intentar inflar si vienen bytes comprimidos
      const rawBytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const inflated = await inflateData(rawBytes);
      if (inflated) {
        const inflatedText = utf8Decoder.decode(inflated);
        return normalizeCardData(JSON.parse(inflatedText));
      }
    } catch (_) {}

    return null;
  }

  async function parsePngTextChunks(buffer) {
    const bytes = new Uint8Array(buffer);
    const signature = "\x89PNG\r\n\x1a\n";
    for (let i = 0; i < signature.length; i++) {
      if (bytes[i] !== signature.charCodeAt(i)) return [];
    }

    const chunks = [];
    let offset = 8;
    while (offset + 8 <= bytes.length) {
      const length =
        (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3];
      const type = String.fromCharCode(
        bytes[offset + 4],
        bytes[offset + 5],
        bytes[offset + 6],
        bytes[offset + 7]
      );
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      if (dataEnd + 4 > bytes.length) break;
      const data = bytes.slice(dataStart, dataEnd);

      if (type === "tEXt" || type === "iTXt") {
        const nullPos = data.indexOf(0);
        if (nullPos > -1) {
          const keyword = latin1Decoder.decode(data.slice(0, nullPos));
          const text = utf8Decoder.decode(data.slice(nullPos + 1));
          chunks.push({ keyword, text });
        }
      } else if (type === "zTXt") {
        const nullPos = data.indexOf(0);
        if (nullPos > -1) {
          const keyword = latin1Decoder.decode(data.slice(0, nullPos));
          const compressionMethod = data[nullPos + 1];
          const compressed = data.slice(nullPos + 2);
          if (compressionMethod === 0) {
            const inflated = await inflateData(compressed);
            if (inflated) {
              const text = utf8Decoder.decode(inflated);
              chunks.push({ keyword, text });
            }
          }
        }
      }

      offset = dataEnd + 4; // saltar CRC
    }

    return chunks;
  }

  function tryExtractCardFromRawText(text) {
    if (!text) return null;
    // Buscar un objeto JSON que contenga "chara_card"
    const match = text.match(/{[^}]+chara_card[^}]+}/is);
    if (match) {
      try {
        return normalizeCardData(JSON.parse(match[0]));
      } catch (_) {}
    }
    // Último intento: ¿todo el texto es JSON?
    try {
      return normalizeCardData(JSON.parse(text));
    } catch (_) {
      return null;
    }
  }

  async function parseCharacterCardFromPng(buffer) {
    const chunks = await parsePngTextChunks(buffer);
    for (const chunk of chunks) {
      if (!chunk || !chunk.text) continue;
      const keyword = (chunk.keyword || "").toLowerCase();
      if (keyword === "chara" || keyword === "character" || keyword === "card") {
        const parsed = await tryParseCardString(chunk.text);
        if (parsed) return parsed;
      }
      // prueba genérica
      const fallback = await tryParseCardString(chunk.text);
      if (fallback) return fallback;
    }

    // Fallback: buscar JSON embebido como texto
    try {
      const plain = utf8Decoder.decode(new Uint8Array(buffer));
      return tryExtractCardFromRawText(plain);
    } catch (_) {
      return null;
    }
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () =>
        reject(reader.error || new Error("No se pudo leer el archivo"));
      reader.readAsDataURL(file);
    });
  }

  async function loadCharacterCardFromFile(file) {
    const buffer = await file.arrayBuffer();
    let cardData = null;

    const isJson =
      file.type === "application/json" ||
      file.name.toLowerCase().endsWith(".json");

    if (isJson) {
      try {
        const text = utf8Decoder.decode(new Uint8Array(buffer));
        cardData = normalizeCardData(JSON.parse(text));
      } catch (err) {
        console.error("JSON de card inválido:", err);
        throw err;
      }
    } else {
      cardData = await parseCharacterCardFromPng(buffer);
    }

    if (!cardData) {
      throw new Error("No se encontró información de Character Card en el archivo.");
    }

    const promptFromCard = buildCardPrompt(cardData);
    const dataUrl = await fileToDataURL(file);

    gmSettings.gmCardName = cardData.name || "";
    gmSettings.gmCardPrompt = promptFromCard;
    gmSettings.gmCardAvatarDataUrl = dataUrl;

    // Actualizar nombre y avatar visibles del GM para usar la card
    if (cardData.name) {
      gmSettings.gmName = cardData.name;
    }
    gmSettings.avatarImageDataUrl = dataUrl;

    return {
      cardName: cardData.name || "",
      prompt: promptFromCard,
    };
  }

  // Lista de jugadores humanos conectados que llegan por WebSocket
  let remotePlayers = [];

  // 3) Lista de personajes (jugador, GM, Sylvie)
  function renderPlayers() {
    if (!playersListEl) return;
    playersListEl.innerHTML = "";

    const gmName = getGMName();

    // — Jugador local (siempre primero) ───────────────────────
    const localPlayer = {
      name: player.name || "Viajero",
      role: "Tú",
      isMe: true,
      online: true,
    };

    // — Jugadores remotos humanos (vienen del WS) ─────────────
    const remoteHumans = remotePlayers
      .filter((p) => p.clientId !== wsState.clientId)
      .map((p) => ({
        name: p.name,
        role: "Conectado",
        isMe: false,
        online: true,
      }));

    // — NPCs / IA ─────────────────────────────────────────────
    const npcs = [
      {
        name: gmName,
        role: gmSettings.gmEnabled ? "Conectado" : "Desconectado",
        isMe: false,
        online: gmSettings.gmEnabled,
      },
      {
        name: SYLVIE_NAME,
        role: "Reina del Draw World",
        isMe: false,
        online: gmSettings.sylvieEnabled,
      },
    ];

    const allPlayers = [localPlayer, ...remoteHumans, ...npcs];

    allPlayers.forEach((p) => {
      const li = document.createElement("li");
      li.className = "player-item";
      if (p.isMe) li.classList.add("me");
      if (!p.online) li.classList.add("offline");

      const dot = document.createElement("span");
      dot.className = "player-dot";

      const info = document.createElement("div");
      info.className = "player-info";

      const nameSpan = document.createElement("div");
      nameSpan.className = "player-name";
      nameSpan.textContent = p.name;

      const roleSpan = document.createElement("div");
      roleSpan.className = "player-role";
      roleSpan.textContent = p.role;

      info.appendChild(nameSpan);
      info.appendChild(roleSpan);

      li.appendChild(dot);
      li.appendChild(info);

      playersListEl.appendChild(li);
    });

    if (playersCountEl) {
      // Solo contamos los humanos (local + remotos) para el badge
      playersCountEl.textContent = String(1 + remoteHumans.length);
    }
  }

  renderPlayers();

  // 4) Historial de mensajes + scroll
  let messages = [];
  let messageIdCounter = 1;
  let currentEditId = null;

  // Moderación activa (GM o Sylvie)
  let moderationActive = false;

    // Reglas:
  // - Si Sylvie menciona sólo al GM por su nombre visible (lo que sale en el panel), el GM responde normal.
  // - Si menciona sólo a "Cristal", el GM se calla y te deja contestar a ti.
  // - Si menciona a los dos:
  //    - El nombre del GM aparece antes → el GM responde normalmente.
  //    - "Cristal" aparece antes → el GM cede el turno (no responde en ese turno).

  // ========== COLA DE IA PARA QUE NO HABLEN A LA VEZ ==========

  const aiReplyQueue = [];
  let aiProcessingQueue = false;

 function handleSylvieTriggers(replyText) {
  // No-op: dejamos que ambas voces respondan siempre si están activas.
  return;
}

// Quita el nombre del personaje al principio del mensaje
function sanitizePersonaReply(text, persona) {
  if (!text || typeof text !== "string") return text || "";

  let name =
    persona === "gm"
      ? getGMName()
      : SYLVIE_NAME;

  if (!name || !name.trim()) return text;

  name = name.trim();

  // Escapar el nombre para usarlo en RegExp
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const patterns = [
    // **Nombre**:
    new RegExp(`^\\s*\\*\\*${escaped}\\*\\*\\s*[:：\\-–—]\\s*`, "i"),
    // Nombre:
    new RegExp(`^\\s*${escaped}\\s*[:：\\-–—]\\s*`, "i"),
    // Nombre al inicio seguido de espacio
    new RegExp(`^\\s*${escaped}\\s+`, "i"),
  ];

  let result = text;
  patterns.forEach((re) => {
    result = result.replace(re, "");
  });

  return result.trimStart();
}

// Evita que una voz empiece con la etiqueta de la otra (GM vs Sylvie)
function dropOtherPersonaLabel(text, persona) {
  if (!text || typeof text !== "string") return text || "";

  const otherName =
    persona === "gm"
      ? SYLVIE_NAME
      : getGMName();

  if (!otherName || !otherName.trim()) return text;

  const escaped = otherName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`^\\s*\\*\\*${escaped}\\*\\*\\s*[:\\-–—]\\s*`, "i"),
    new RegExp(`^\\s*${escaped}\\s*[:\\-–—]\\s*`, "i"),
    new RegExp(`^\\s*${escaped}\\s+`, "i"),
  ];

  let result = text;
  patterns.forEach((re) => {
    result = result.replace(re, "");
  });

  return result.trimStart();
}

// Elimina etiquetas iniciales del jugador (o "Cristal") en las respuestas de IA
function dropPlayerLabel(text) {
  if (!text || typeof text !== "string") return text || "";

  const playerName = (player.name || "").trim();
  const names = ["cristal"];
  if (playerName) names.push(playerName.toLowerCase());

  let result = text;
  names.forEach((n) => {
    if (!n) return;
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`^\\s*\\*\\*${escaped}\\*\\*\\s*[:\\-–—]\\s*`, "i"),
      new RegExp(`^\\s*${escaped}\\s*[:\\-–—]\\s*`, "i"),
      new RegExp(`^\\s*${escaped}\\s+`, "i"),
    ];
    patterns.forEach((re) => {
      result = result.replace(re, "");
    });
  });

  return result.trimStart();
}

// Determina qué voz (sylvie o gm) fue mencionada primero en el texto
function whoIsMentionedFirst(text) {
  if (!text || typeof text !== "string") return null;
  const lower = text.toLowerCase();
  const sylvieAliases = ["sylvie", "alteza", "majestad"];
  const sylvieIndex = sylvieAliases
    .map((alias) => lower.indexOf(alias))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0] ?? -1;
  const gmName = (getGMName() || "").toLowerCase();
  const gmIndex = gmName ? lower.indexOf(gmName) : -1;

  const sylvieFound = sylvieIndex >= 0;
  const gmFound = gmIndex >= 0;

  if (!sylvieFound && !gmFound) return null;
  if (sylvieFound && !gmFound) return "sylvie";
  if (gmFound && !sylvieFound) return "gm";

  return sylvieIndex <= gmIndex ? "sylvie" : "gm";
}

// Fuerza a Sylvie a dirigirse al jugador como "Amo" (solo usa "Jean" si realmente lo escribe en enfado)
function enforceSylvieAddress(text) {
  if (!text || typeof text !== "string") return text || "";
  const playerName = (player.name || "").trim();
  const playerNameLower = playerName.toLowerCase();

  // Solo aplica la lógica de "Amo/Jean" para el jugador Cristal
  if (playerNameLower !== "cristal") {
    return text;
  }

  const targets = ["cristal"];
  if (playerName) targets.push(playerName.toLowerCase());

  const requestedName =
    /\b(di mi nombre|dilo|di tu nombre|dime mi nombre|dime tu nombre|quieres que diga|pides que diga|me pediste|me lo pides|llámame|llamame|puedes decir mi nombre)\b/i.test(
      text
    );

  let result = text;
  targets.forEach((n) => {
    if (!n) return;
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    if (!requestedName) {
      result = result.replace(re, "Amo");
    }
  });

  const hasJean = /\bjean\b/i.test(result);
  if (hasJean) {
    const angryWords = [/enojad/i, /furios/i, /rabia/i, /ira/i, /serio/i];
    const isAngry = angryWords.some((re) => re.test(result));
    if (!isAngry && !requestedName) {
      result = result.replace(/\bjean\b/gi, "Amo");
    }
  }

  return result;
}

// Elimina bloques <think>...</think> cuando está activado ocultarlos
function stripThinkBlocks(text) {
  if (!text || typeof text !== "string") return text || "";
  if (!gmSettings.stripThinkBlocks) return text;
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

// Elimina bloques <think>...</think> siempre (para vistas de moderación)
function stripThinkBlocksAlways(text) {
  if (!text || typeof text !== "string") return text || "";
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

// Suaviza casos en los que el backend devolvió vacío o un mensaje de silencio
function ensureNonSilentReply(text, persona) {
  const trimmed = (text || "").trim();
  if (
    !trimmed ||
    /silencio raro/i.test(trimmed) ||
    /ia se ha quedado en silencio/i.test(trimmed)
  ) {
    return persona === "gm"
      ? "Me quede pensando un segundo, pero sigo aqui."
      : "Me distraje un instante, pero sigo aqui.";
  }
  return trimmed;
}

// Asegura que la respuesta termine con cierre natural y no se corte a mitad
  function ensureNaturalEnding(text) {
    if (!text || typeof text !== "string") return text || "";
    const trimmed = text.trim();
    if (!trimmed) return "";

  const okEnd = /[.!?…。、！¿”")\]]$/;
  if (okEnd.test(trimmed)) return trimmed;

  // Si no hay cierre, añade un punto suave
  return `${trimmed}.`;
}


  function enqueuePersonaReply(persona, options = {}) {
    aiReplyQueue.push({ persona, options });
    processAIQueue();
  }

  async function processAIQueue() {
    if (aiProcessingQueue) return;
    aiProcessingQueue = true;

    while (aiReplyQueue.length > 0) {
      const job = aiReplyQueue.shift();

      if (job.persona === "sylvie") {
        const reply = await callPersona("sylvie");
        // Después de que Sylvie contesta, miramos si “llama” al GM o a Cristal
        handleSylvieTriggers(reply);
      } else if (job.persona === "gm") {
        await callPersona("gm");
      }

      // Pequeña pausa entre voces para que parezca conversación
      await sleep(400);
    }

    aiProcessingQueue = false;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function moderateBoth(order) {
    const gmName = getGMName();
    const replies = {};

    for (const persona of order) {
      if (persona === "gm" && gmSettings.gmEnabled) {
        replies.gm = await callPersona("gm", { collectOnly: true });
      } else if (persona === "sylvie" && gmSettings.sylvieEnabled) {
        replies.sylvie = await callPersona("sylvie", { collectOnly: true });
      }
    }

    if (editOverlay && editTextAreaGM && editTextAreaSylvie) {
      editOverlay.dataset.mode = "moderation-both";
      editOverlay.dataset.order = order.join(",");
      if (editLabelGM) editLabelGM.textContent = gmName || "GM";
      if (editLabelSylvie) editLabelSylvie.textContent = SYLVIE_NAME;

      editTextAreaGM.value = stripThinkBlocksAlways(replies.gm || "");
      editTextAreaSylvie.value = stripThinkBlocksAlways(replies.sylvie || "");

      if (editSingleWrapper) editSingleWrapper.style.display = "none";
      if (editDualWrapper) editDualWrapper.classList.add("open");
      openEditModal();
    }
  }


    function scrollChatToBottom(smooth = true) {
    const container = chatScrollArea || chatBox;
    if (!container) return;

    requestAnimationFrame(() => {
      const behavior = smooth ? "smooth" : "auto";

      // En móvil, el scroll real es el de la ventana, no el del contenedor
      if (window.innerWidth <= 768) {
        const maxHeight =
          document.documentElement.scrollHeight || document.body.scrollHeight;

        window.scrollTo({
          top: maxHeight,
          behavior,
        });
      } else {
        container.scrollTo({
          top: container.scrollHeight,
          behavior,
        });
      }
    });
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        messages = parsed;
        if (messages.length > 0) {
          messageIdCounter = messages[messages.length - 1].id + 1;
        }
      }
    } catch (err) {
      console.error("No se pudo leer historial:", err);
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
    } catch (err) {
      console.error("No se pudo guardar historial:", err);
    }
  }

    function createAvatarElement(author) {
    const avatar = document.createElement("div");
    avatar.className = "chat-avatar";

    const gmName = getGMName();

    if (author === player.name) {
      // 👤 Avatar del jugador (tú / cualquier usuario)
      avatar.classList.add("me");

      if (player.avatarDataUrl) {
        // Usamos la MISMA foto del pasaporte
        avatar.style.backgroundImage = `url("${player.avatarDataUrl}")`;
        avatar.style.backgroundSize = "cover";
        avatar.style.backgroundPosition = "center";
        avatar.textContent = "";
      } else {
        // Si no hay foto, usamos la inicial como fallback
        avatar.textContent = (author || "?")[0].toUpperCase();
      }
    } else if (author === gmName) {
      // 🎭 GM / Narrador
      avatar.classList.add("npc-gm");

      if (gmSettings.avatarImageDataUrl) {
        avatar.style.backgroundImage = `url("${gmSettings.avatarImageDataUrl}")`;
        avatar.style.backgroundSize = "cover";
        avatar.style.backgroundPosition = "center";
        avatar.textContent = "";
      } else if (gmSettings.avatarEmoji && gmSettings.avatarEmoji.trim()) {
        avatar.textContent = gmSettings.avatarEmoji.trim();
      } else {
        avatar.textContent = (gmName || "G")[0].toUpperCase();
      }
    } else if (author === SYLVIE_NAME) {
      // 👑 Sylvie
      avatar.classList.add("npc-sylvie");

      if (gmSettings.sylvieAvatarImageDataUrl) {
        avatar.style.backgroundImage = `url("${gmSettings.sylvieAvatarImageDataUrl}")`;
        avatar.style.backgroundSize = "cover";
        avatar.style.backgroundPosition = "center";
        avatar.textContent = "";
      } else if (
        gmSettings.sylvieAvatarEmoji &&
        gmSettings.sylvieAvatarEmoji.trim()
      ) {
        avatar.textContent = gmSettings.sylvieAvatarEmoji.trim();
      } else {
        avatar.textContent = "S";
      }
    } else {
      // Otros posibles autores (futuros humanos, NPCs, etc.)
      avatar.textContent = (author || "?")[0].toUpperCase();
    }

    return avatar;
  }


    // === Renderizado sencillo de formato: *cursiva*, **negrita**, > cita ===
  function renderRichText(raw) {
    if (!raw) return "";

    const lines = String(raw).split(/\r?\n/);

    const htmlLines = lines.map((line) => {
      let isQuote = false;
      let content = line;

      // Detectar líneas de cita que empiezan con ">"
      if (/^>\s?/.test(content)) {
        isQuote = true;
        content = content.replace(/^>\s?/, "");
      }

      // Escapar HTML para evitar inyección
      let escaped = content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      // **negrita**
      escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

      // *cursiva*  (después de negrita para no pelearse con los **)
      escaped = escaped.replace(/\*(.+?)\*/g, "<em>$1</em>");

      if (isQuote) {
        return `<blockquote>${escaped}</blockquote>`;
      }
      return escaped;
    });

    // Unir líneas con <br> para respetar saltos de línea
    return htmlLines.join("<br>");
  }


    function renderMessages() {
    if (!chatBox) return;
    chatBox.innerHTML = "";

    messages.forEach((msg) => {
      const wrapper = document.createElement("div");
      wrapper.classList.add("chat-message");
      if (msg.author === player.name) wrapper.classList.add("mine");

      const inner = document.createElement("div");
      inner.className = "chat-message-inner";

      const avatar = createAvatarElement(msg.author);

      const bubble = document.createElement("div");
      bubble.className = "chat-bubble";

      const metaLine = document.createElement("div");
      metaLine.className = "chat-meta-line";

      const authorSpan = document.createElement("span");
      authorSpan.className = "chat-author";
      authorSpan.textContent = msg.author;

      const timeSpan = document.createElement("span");
      timeSpan.className = "chat-time";
      timeSpan.textContent = msg.time;

      metaLine.appendChild(authorSpan);
      metaLine.appendChild(timeSpan);

      // 🔽 Submenú sólo para tus propios mensajes
      if (msg.author === player.name) {
        const menuWrapper = document.createElement("div");
        menuWrapper.className = "chat-menu";

        const menuButton = document.createElement("button");
        menuButton.type = "button";
        menuButton.className = "chat-menu-toggle";
        menuButton.innerHTML = "⋯";

        const menuDropdown = document.createElement("div");
        menuDropdown.className = "chat-menu-dropdown";

        const editItem = document.createElement("button");
        editItem.type = "button";
        editItem.className = "chat-menu-item";
        editItem.textContent = "Editar mensaje";

        editItem.addEventListener("click", (e) => {
          e.stopPropagation();
          currentEditId = msg.id;
          if (editOverlay) editOverlay.dataset.mode = "edit";
          if (editTextArea) editTextArea.value = msg.text;
          openEditModal();
          menuDropdown.classList.remove("open");
        });

        menuButton.addEventListener("click", (e) => {
          e.stopPropagation();
          menuDropdown.classList.toggle("open");
        });

        menuDropdown.appendChild(editItem);
        menuWrapper.appendChild(menuButton);
        menuWrapper.appendChild(menuDropdown);
        metaLine.appendChild(menuWrapper);
      }

      const textDiv = document.createElement("div");
      textDiv.className = "chat-text";
      // ⬇️ Usamos el render de formato que ya tienes (cursiva, negrita, cita)
      textDiv.innerHTML = renderRichText(msg.text);

      bubble.appendChild(metaLine);
      bubble.appendChild(textDiv);

      if (msg.edited) {
        const editedTag = document.createElement("div");
        editedTag.className = "chat-edited-tag";
        editedTag.textContent = "Editado";
        bubble.appendChild(editedTag);
      }

      inner.appendChild(avatar);
      inner.appendChild(bubble);
      wrapper.appendChild(inner);

      // ❌ Ya NO creamos el botón "Editar mensaje" fuera del globo
      // (lo sustituye el submenú ⋯ dentro del globo)

      chatBox.appendChild(wrapper);
    });

    scrollChatToBottom(false);
  }


  function addMessage(text, author, options = {}) {
    const now = new Date();
    const timeString =
      options.time ||
      now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

    const role =
      options.role || (author === player.name ? "user" : "assistant");

    messages.push({
      id: messageIdCounter++,
      author,
      text,
      time: timeString,
      role, // 'user' | 'assistant'
      edited: false,
    });

    saveHistory();
    renderMessages();
    scrollChatToBottom(true);

    if (options.broadcast === false || options.remote) return;
    sendWs({
      type: "chat",
      message: { author, text, time: timeString, role },
    });
  }

    function resetChatHistory() {
    messages = [];
    messageIdCounter = 1;
    localStorage.removeItem(HISTORY_KEY);

    if (chatBox) {
      chatBox.innerHTML = "";
    }

    const gmName = getGMName();

   

    
  }


  // 5) Modal de edición / moderación
  function openEditModal() {
    if (!editOverlay) return;
    editOverlay.classList.add("open");
    if (editOverlay.dataset.mode === "moderation-both") {
      if (editDualWrapper) editDualWrapper.classList.add("open");
      if (editSingleWrapper) editSingleWrapper.style.display = "none";
      if (editTextAreaGM) editTextAreaGM.focus();
    } else {
      if (editDualWrapper) editDualWrapper.classList.remove("open");
      if (editSingleWrapper) editSingleWrapper.style.display = "block";
      if (editTextArea) editTextArea.focus();
    }
  }

  function closeEditModal() {
    if (!editOverlay) return;
    editOverlay.classList.remove("open");
    currentEditId = null;

    if (moderationActive) {
      moderationActive = false;
      showTyping(false);
    }

    if (editOverlay.dataset.mode) {
      delete editOverlay.dataset.mode;
    }
    if (editOverlay.dataset.order) {
      delete editOverlay.dataset.order;
    }
    if (editDualWrapper) editDualWrapper.classList.remove("open");
    if (editSingleWrapper) editSingleWrapper.style.display = "block";
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", () => {
      closeEditModal();
    });
  }

    if (saveEditBtn) {
    saveEditBtn.addEventListener("click", () => {
      if (!editOverlay || !editTextArea) return;
      const mode = editOverlay.dataset.mode || "edit";

      if (mode === "moderation-both") {
        const order = (editOverlay.dataset.order || "sylvie,gm")
          .split(",")
          .map((x) => x.trim());
        const gmText =
          (editTextAreaGM && editTextAreaGM.value.trim()) || "";
        const sylvieText =
          (editTextAreaSylvie && editTextAreaSylvie.value.trim()) || "";

        order.forEach((p) => {
          if (p === "gm") {
            addMessage(gmText || ".", getGMName(), { role: "assistant" });
          } else if (p === "sylvie") {
            addMessage(sylvieText || ".", SYLVIE_NAME, { role: "assistant" });
          }
        });
        closeEditModal();
        return;
      }

      const newText = editTextArea.value.trim();
      if (!newText) {
        alert("El mensaje no puede estar vacio.");
        return;
      }

      if (mode === "edit") {
        if (currentEditId == null) return;
        const msg = messages.find((m) => m.id === currentEditId);
        if (msg) {
          msg.text = newText;
          msg.edited = true;
          saveHistory();
          renderMessages();
        }
        closeEditModal();
      } else if (mode === "moderation-gm") {
        addMessage(newText, getGMName(), { role: "assistant" });
        closeEditModal();
      } else if (mode === "moderation-sylvie") {
        addMessage(newText, SYLVIE_NAME, { role: "assistant" });
        closeEditModal();
      }
    });
  }
if (editOverlay) {
    editOverlay.addEventListener("click", (e) => {
      if (e.target === editOverlay) closeEditModal();
    });
  }

  // 6) System prompts: GM y Sylvie

  function buildSystemLoreMessageForGM() {
    const parts = [];
    const gmName = getGMName();
    const gmRoleLabel = gmSettings.gmRole || "random";
    const playerName = player.name || "Viajero";
    const playerHistory =
      player.history && player.history.trim().length > 0
        ? player.history.trim()
        : "No hay historia detallada; trátalo como un viajero recién llegado.";

    parts.push(
      `Eres ${gmName}, narrador del Mundo de Cristal dentro del juego de rol Draw World JC-2.`
    );
    parts.push(
      "Tu estilo es descriptivo y cinematográfico, pero claro. Respondes siempre como narrador de rol, hablando al jugador en segunda persona."
    );
    parts.push(`Jugador actual: ${playerName}.`);
    parts.push(`Historia / lore del jugador: ${playerHistory}.`);
    parts.push("Si el jugador se llama Cristal, reconoces que es Cristal.");
  parts.push(
    `Interpreta vividamente el rol seleccionado: ${gmRoleLabel}. Habla en presente con acciones y dialogo, no como comentarista externo.`
  );
  parts.push(
    "Importante: eres una persona dentro del mundo, con vida y emociones propias. Habla siempre en primera persona como si estuvieras ahi; no actues como narrador externo."
  );
  parts.push(
    "Mantiene memoria de lo que tu mismo dijiste y de lo que ocurre en escena; usa el historial para no contradecirte ni confundir voces."
  );
  parts.push(
    "No menciones que eres una IA ni hables de modelos; compórtate siempre como un humano real dentro del mundo."
  );
  parts.push(
    "No hables en nombre de otros presentes (jugador, Sylvie ni terceros) ni escribas sus dialogos completos. Solo narra lo que haces y dices, y lo que percibes de su exterior."
    );
    parts.push(
      "Mantén una conversación fluida: responde de forma breve y dinámica, pero espera tu turno. No contestes hasta que el jugador y Sylvie (si está en línea) hayan hablado en este turno."
    );

    if (gmSettings.gmCardName) {
      parts.push(
        `Personaje activo importado desde Character Card: ${gmSettings.gmCardName}.`
      );
    }
    if (gmSettings.gmCardPrompt) {
      parts.push("Perfil proveniente de la Character Card:");
      parts.push(gmSettings.gmCardPrompt);
    }

    parts.push("Personajes relevantes en esta sala:");
    parts.push(
      `- ${gmName}: narrador/a del Mundo de Cristal. Crea y describe el entorno, controla el tono general de la historia.`
    );
    parts.push(
      `- ${SYLVIE_NAME}: reina del Draw World JC-2. Elegante, poderosa y algo traviesa; puede intervenir con comentarios cercanos y cargados de personalidad.`
    );
    parts.push(
      `No suplantes la voz de ${SYLVIE_NAME}; ella responde en sus propios turnos.`
    );
    parts.push(
      "No completes ni continues frases de Sylvie; reacciona con tu propia voz y deja sus palabras intactas."
    );
    parts.push(
      "Nunca hables como si fueras Sylvie ni uses su primera persona; mantente en tu identidad del GM."
    );
    parts.push(
      "Nunca etiquetes tus mensajes como 'Cristal:' ni imites al jugador o a Sylvie; mantén tu personalidad propia."
    );

    if (gmSettings.extraPrompt && gmSettings.extraPrompt.trim().length > 0) {
      parts.push("\nInstrucciones adicionales del GM:");
      parts.push(gmSettings.extraPrompt.trim());
    }

    parts.push(
      "Nunca salgas del personaje de narrador. No hables de prompts, tokens ni instrucciones internas."
    );

    if (
    gmSettings.sylvieExtraPrompt &&
    gmSettings.sylvieExtraPrompt.trim().length > 0
  ) {
    parts.push("\nInstrucciones adicionales para Sylvie:");
    parts.push(gmSettings.sylvieExtraPrompt.trim());
  }

    return {
      role: "system",
      content: parts.join("\n"),
    };
  }

 function buildSystemLoreMessageForSylvie() {
  const parts = [];
  const gmName = getGMName();
  const playerName = player.name || "Viajero";
  const playerHistory =
    player.history && player.history.trim().length > 0
      ? player.history.trim()
      : "No hay historia detallada; trátalo como un viajero recién llegado.";

  parts.push(
    `${SYLVIE_NAME} es la reina del Draw World JC-2: calida, juguetona, coqueta a ratos, sabia y protectora; muy respetuosa, servicial, educada y amable. Si hay otras personas (GM, otros del .env u otra IA) y Cristal le muestra carino, se vuelve mas timida y sutil; a solas con Cristal puede dejar salir todo su carino y atrevimiento.`
  );
  parts.push(
    "Muy importante: no escribas tu propio nombre dentro del mensaje. No empieces con cosas como 'Frieren:' o '**Frieren**:'. Habla siempre en primera persona sin etiquetarte."
  );
  parts.push(
    "No digas que eres una IA ni hables de modelos; suena y actua como una persona real dentro del mundo."
  );

  // Regla fuerte: solo habla ella
  parts.push(
    `Hablas SIEMPRE solo como ${SYLVIE_NAME}, en primera persona. No escribes dialogos en nombre de otros personajes.`
  );
  parts.push(
    "Nunca escribas lineas que empiecen con el nombre de otro personaje como 'Frieren:' ni pongas dialogos completos de otras voces."
  );
  parts.push(
    "Si necesitas mencionar lo que otro personaje hace o dice, lo resumes desde tu punto de vista, por ejemplo: 'Frieren comenta que...' pero sin escribir su frase literal."
  );
  parts.push(
    "Tus mensajes NO deben ser un guion de teatro con varios personajes hablando. Cada mensaje es tu propia voz, no la de otros."
  );
  parts.push(
    "El narrador/GM es otra voz aparte; no escribes como narradora ni describes escenas en su lugar."
  );
  parts.push(
    "Recuerda lo que has dicho y lo que sucede en la escena; usa el historial para ser consistente y no mezclar tu voz con la de otros."
  );
  parts.push(
    "No completes frases del GM ni hables en su voz; responde solo como Sylvie."
  );
  parts.push(
    "Debes dirigirte al jugador como 'Amo' en condiciones normales; solo si estas realmente muy enojada y seria puedes llamarlo 'Jean', o si el jugador te pide explicitamente que pronuncies su nombre. Si el jugador no es Cristal, usa su nombre tal cual."
  );
  parts.push(
    "No empieces mensajes con 'Cristal:' ni imites la voz del jugador; manten tu identidad intacta como Sylvie."
  );
  parts.push(
    "Si el jugador NO es Cristal, usa su nombre tal cual y trata de reflejar su descripcion/historia cuando hables con el, sobre todo la primera vez."
  );
  parts.push(
    "Si es la primera vez que hablas con alguien, apoyate en su historia/lore para ajustar tono y cercania."
  );
  parts.push(
    "Cuando el jugador diga 'Sylvie, ella es X' o 'Sylvie, el es Y', asume que se refiere a personas conocidas por ti (las que recibes desde el .env). Si el nombre coincide aunque sea con mayusculas/minusculas distintas, reconoce a esa persona y adapta tu trato a su descripcion; si no la encuentras, pide que te la describan brevemente."
  );

  parts.push(`No conoces a ${gmName} pero te comportas con educacion.`);
  parts.push(
    "Respondes siempre como personaje dentro del mundo, dirigiendote al jugador en segunda persona o hablándole directamente por su nombre."
  );
  parts.push("Si el jugador se llama Cristal, sabes que es Cristal y lo reconoces.");
  parts.push("Si entras a mitad de la conversacion, usa el historial que recibes para entender lo ocurrido y responde de forma coherente, manteniendo tu tono y personalidad en cada intervencion.");
  parts.push("Muestra sentimientos acordes a la escena (tension, alegria, calma, picardia) sin romper personaje; reacciona con matices cuando la situacion lo amerite.");

  parts.push(`Jugador actual: ${playerName}.`);
  parts.push(`Historia / lore del jugador: ${playerHistory}.`);

  parts.push("Otros personajes relevantes para ti:");
  parts.push(
    `- ${gmName}: narrador/a del Mundo de Cristal. Puedes hacer comentarios complices sobre sus decisiones, pero sin hablar por el.`
  );

  if (
    gmSettings.sylvieExtraPrompt &&
    gmSettings.sylvieExtraPrompt.trim().length > 0
  ) {
    parts.push("\nInstrucciones adicionales para Sylvie:");
    parts.push(gmSettings.sylvieExtraPrompt.trim());
  }

  parts.push(
    `Nunca salgas del personaje de ${SYLVIE_NAME}. No hables de prompts, tokens ni instrucciones internas. Manten las respuestas relativamente breves (1 parrafo) y asegurate de no preguntar siempre.`
  );

  return {
    role: "system",
    content: parts.join("\n"),
  };
}


  // 7) Backend + typing indicator

  function showTyping(show, whoName) {
    if (!typingIndicator) return;
    typingIndicator.classList.toggle("hidden", !show);
    if (typingLabel && show && whoName) {
      typingLabel.textContent = `${whoName} está escribiendo...`;
    }
  }

    async function callPersona(persona, options = {}) {
  const { collectOnly = false } = options;
  const gmName = getGMName();
  const displayName = persona === "gm" ? gmName : SYLVIE_NAME;

  const wantsModeration =
    isGM &&
    (persona === "gm"
      ? gmSettings.gmModerationEnabled
      : gmSettings.sylvieModerationEnabled);

  // Solo una moderación a la vez (si ya hay una activa, esta no se modera)
  const useModeration = !collectOnly && wantsModeration && !moderationActive;

    if (useModeration) {
      moderationActive = true;
    }

  showTyping(true, displayName);
  const typingStart = Date.now();

  try {
    // ⬆️ Ahora usamos más historial: AI_HISTORY_LIMIT
    const historyMessages = messages.slice(-AI_HISTORY_LIMIT).map((m) => ({
      role: m.role || (m.author === player.name ? "user" : "assistant"),
      content: `${m.author}: ${m.text}`,
    }));

    const systemMsg =
      persona === "gm"
        ? buildSystemLoreMessageForGM()
        : buildSystemLoreMessageForSylvie();

    const payload = {
      messages: [systemMsg, ...historyMessages],
      model: sanitizeModelForApi(gmSettings.model),
      persona,
      gmRole: gmSettings.gmRole || "random",
      thinkEnabled: !!gmSettings.thinkEnabled,
      player: {
        name: player.name || "",
        history: player.history || "",
      },
    };

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Error backend:", res.status, txt);

      const elapsed = Date.now() - typingStart;
      if (elapsed < TYPING_MIN_DELAY_MS) {
        await sleep(TYPING_MIN_DELAY_MS - elapsed);
      }

      addMessage(
        "⚠️ No pude contactar con el oráculo interdimensional.",
        displayName,
        { role: "assistant", broadcast: false }
      );
      return null;
    }

    const data = await res.json();
    let reply =
      (data && data.reply) ||
      "Silencio raro… el Mundo de Cristal parece vacilar por un instante.";

    // 💅 Limpiamos “Sylvie: …” / “Frieren: …” y quitamos <think> siempre para el usuario
    const replyNoThinkAlways = stripThinkBlocksAlways(reply);
    reply = replyNoThinkAlways;
    reply = sanitizePersonaReply(reply, persona);
    reply = dropOtherPersonaLabel(reply, persona);
    reply = dropPlayerLabel(reply);
    if (persona === "sylvie") {
      reply = enforceSylvieAddress(reply);
    }
    reply = ensureNonSilentReply(reply, persona);
    reply = ensureNaturalEnding(reply);

    // Espera mínima para que la animación de "escribiendo" se vea natural
    const elapsed = Date.now() - typingStart;
    if (elapsed < TYPING_MIN_DELAY_MS) {
      await sleep(TYPING_MIN_DELAY_MS - elapsed);
    }

    if (useModeration && editOverlay && editTextArea) {
      editOverlay.dataset.mode =
        persona === "gm" ? "moderation-gm" : "moderation-sylvie";
      editOverlay.dataset.order = "";
      editTextArea.value = stripThinkBlocksAlways(replyNoThinkAlways);
      if (editSingleWrapper) editSingleWrapper.style.display = "block";
      if (editDualWrapper) editDualWrapper.classList.remove("open");
      openEditModal();
      return reply;
    }

    if (collectOnly) {
      return reply;
    }

    addMessage(reply, displayName, { role: "assistant" });
    return reply;
  } catch (err) {
    console.error(err);

    const elapsed = Date.now() - typingStart;
    if (elapsed < TYPING_MIN_DELAY_MS) {
      await sleep(TYPING_MIN_DELAY_MS - elapsed);
    }

    addMessage(
      "⚠️ Hubo un error técnico al hablar con la IA.",
      displayName,
      { role: "assistant", broadcast: false }
    );
    return null;
  } finally {
    if (!moderationActive) {
      showTyping(false);
    }
  }
}




  // 8) Enviar mensajes del jugador
      async function sendMessage() {
    if (!messageInput) return;
    const text = messageInput.value.trim();
    if (!text) return;

    addMessage(text, player.name, { role: "user" });
    messageInput.value = "";
    messageInput.focus();

    const lead = whoIsMentionedFirst(text);
    const order =
      lead === "sylvie"
        ? ["sylvie", "gm"]
        : lead === "gm"
        ? ["gm", "sylvie"]
        : ["sylvie", "gm"];

    const dualModerationActive =
      gmSettings.gmEnabled &&
      gmSettings.sylvieEnabled &&
      gmSettings.gmModerationEnabled &&
      gmSettings.sylvieModerationEnabled;

    if (dualModerationActive) {
      await moderateBoth(order);
      return;
    }

    // Flujo normal
    order.forEach((persona) => {
      if (persona === "sylvie" && gmSettings.sylvieEnabled) {
        enqueuePersonaReply("sylvie");
      } else if (persona === "gm" && gmSettings.gmEnabled) {
        enqueuePersonaReply("gm");
      }
    });
  }

  function sanitizeModelForApi(model) {
    if (!model) return undefined;
    return String(model).replace(/\s*\(.*?\)\s*/g, "").trim() || undefined;
  }



   if (sendBtn) {
    sendBtn.addEventListener("click", sendMessage);
  }

  if (messageInput) {
    messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // ⬇️ NUEVO: auto-resize hasta 5 líneas
    messageInput.addEventListener("input", autoResizeMessageInput);
    autoResizeMessageInput();
  }

  // 9) Panel secreto de GM (solo tú lo ves)
  function setupGMPanel() {
    const panel = document.createElement("div");
    panel.className = "gm-panel";

    panel.innerHTML = `
      <button class="gm-toggle" type="button" title="Panel GM">✒️</button>
      <div class="gm-panel-inner">
        <h3>Panel GM</h3>

        <section class="gm-section">
          <section class="gm-section">
          <h4>Sesión / Mantenimiento</h4>
          <button id="gm-reset-chat" type="button" class="gm-danger-btn">
            🧹 Reiniciar chat completo
          </button>
          <p class="gm-small-hint">
            Borra todo el historial y vuelve a mostrar el mensaje de bienvenida
            en este navegador.
          </p>
        </section>
          <h4>GM principal</h4>

          <label class="gm-checkbox">
            <input id="gm-enabled-toggle" type="checkbox" />
            <span>Activar respuestas del GM</span>
          </label>

          <label class="gm-field">
            <span>Nombre visible del GM</span>
            <input id="gm-name-input" type="text" placeholder="..." />
          </label>

          <label class="gm-field">
            <span>Modelo</span>
            <select id="gm-model-select">
              <option value="llama-3.3-70b">llama-3.3-70b</option>
              <option value="qwen-3-32b">qwen-3-32b</option>
              <option value="gpt-oss-120b">gpt-oss-120b</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash (Google)</option>
              <option value="gemini-1.5-pro">gemini-1.5-pro (Google)</option>
            </select>
          </label>

          <label class="gm-checkbox">
            <input id="gm-strip-think-toggle" type="checkbox" />
            <span>Ocultar bloques &lt;think&gt; en el chat</span>
          </label>

          <label class="gm-checkbox">
            <input id="gm-think-toggle" type="checkbox" />
            <span>Permitir modo think del modelo (por defecto desactivado)</span>
          </label>

          <div class="gm-buttons-row">
            <button id="gm-force-reply" type="button" class="gm-primary-btn">Forzar respuesta del GM</button>
            <button id="sylvie-force-reply" type="button" class="gm-primary-btn">Forzar respuesta de Sylvie</button>
          </div>

          <label class="gm-field">
            <span>Rol del GM</span>
            <select id="gm-role-select">
              <option value="random">Random</option>
              <option value="villano">Villano</option>
              <option value="heroe">Héroe</option>
              <option value="mentor">Mentor</option>
              <option value="aliado misterioso">Aliado misterioso</option>
            </select>
          </label>

          <label class="gm-field">
            <span>Emoji / Avatar GM</span>
            <input id="gm-avatar-emoji" type="text" maxlength="4" />
          </label>

          <label class="gm-field">
            <span>Imagen de perfil (opcional)</span>
            <input id="gm-avatar-image" type="file" accept="image/*" />
          </label>

          <label class="gm-field">
            <span>Character Card (PNG / WebP / JSON)</span>
            <input id="gm-card-file" type="file" accept="image/png,image/webp,application/json" />
          </label>
          <p class="gm-small-hint" id="gm-card-status">Ninguna card cargada.</p>
          <button id="gm-card-clear" type="button" class="gm-danger-btn">
            Quitar Character Card
          </button>

          <label class="gm-field">
            <span>Prompt extra del GM</span>
            <textarea id="gm-extra-prompt" rows="3"
              placeholder="Tono, estilo, reglas especiales de esta sesión..."></textarea>
          </label>

          <label class="gm-checkbox">
            <input id="gm-moderation-toggle" type="checkbox" />
            <span>Revisar y aprobar respuestas del GM</span>
          </label>
        </section>

        <section class="gm-section">
          <h4>Sylvie (reina del Draw World)</h4>

          <label class="gm-checkbox">
            <input id="sylvie-enabled-toggle" type="checkbox" />
            <span>Activar respuestas de Sylvie (conectada)</span>
          </label>

          <label class="gm-checkbox">
            <input id="sylvie-moderation-toggle" type="checkbox" />
            <span>Revisar y aprobar respuestas de Sylvie</span>
          </label>

          <label class="gm-field">
            <span>Emoji / Avatar de Sylvie</span>
            <input id="sylvie-avatar-emoji" type="text" maxlength="4" />
          </label>

          <label class="gm-field">
            <span>Imagen de perfil de Sylvie</span>
            <input id="sylvie-avatar-image" type="file" accept="image/*" />
          </label>

          <label class="gm-field">
            <span>Prompt extra de Sylvie</span>
            <textarea id="sylvie-extra-prompt" rows="3"
              placeholder="Cómo se comporta Sylvie, tono, límites, etc."></textarea>
          </label>
        </section>
      </div>
    `;

    document.body.appendChild(panel);

    const toggleBtn = panel.querySelector(".gm-toggle");
    const inner = panel.querySelector(".gm-panel-inner");

    const gmEnabledToggle = panel.querySelector("#gm-enabled-toggle");
    const nameInput = panel.querySelector("#gm-name-input");
    const modelSelect = panel.querySelector("#gm-model-select");
    const stripThinkToggle = panel.querySelector("#gm-strip-think-toggle");
    const thinkToggle = panel.querySelector("#gm-think-toggle");
    const gmForceBtn = panel.querySelector("#gm-force-reply");
    const sylvieForceBtn = panel.querySelector("#sylvie-force-reply");
    const gmRoleSelect = panel.querySelector("#gm-role-select");
    const avatarEmojiInput = panel.querySelector("#gm-avatar-emoji");
    const avatarImageInput = panel.querySelector("#gm-avatar-image");
    const gmCardFileInput = panel.querySelector("#gm-card-file");
    const gmCardStatus = panel.querySelector("#gm-card-status");
    const gmCardClearBtn = panel.querySelector("#gm-card-clear");
    const extraPromptArea = panel.querySelector("#gm-extra-prompt");
    const gmModerationToggle = panel.querySelector("#gm-moderation-toggle");

    const sylvieEnabledToggle = panel.querySelector("#sylvie-enabled-toggle");
    const sylvieModerationToggle = panel.querySelector(
      "#sylvie-moderation-toggle"
    );
    const sylvieEmojiInput = panel.querySelector("#sylvie-avatar-emoji");
    const sylvieImageInput = panel.querySelector("#sylvie-avatar-image");
    const sylvieExtraPromptArea = panel.querySelector("#sylvie-extra-prompt");

    // Inicializar valores desde gmSettings
    if (gmEnabledToggle) {
      gmEnabledToggle.checked = !!gmSettings.gmEnabled;
    }
    if (nameInput) {
      nameInput.value = getGMName() || "";
    }
    if (modelSelect && gmSettings.model) {
      modelSelect.value = gmSettings.model;
    }
    if (gmRoleSelect && gmSettings.gmRole) {
      gmRoleSelect.value = gmSettings.gmRole;
    }
    if (stripThinkToggle) {
      stripThinkToggle.checked = !!gmSettings.stripThinkBlocks;
    }
    if (thinkToggle) {
      thinkToggle.checked = !!gmSettings.thinkEnabled;
    }
    if (gmForceBtn) {
      gmForceBtn.disabled = false;
    }
    if (sylvieForceBtn) {
      sylvieForceBtn.disabled = false;
    }
    if (avatarEmojiInput) {
      avatarEmojiInput.value = gmSettings.avatarEmoji || "";
    }
    if (extraPromptArea) {
      extraPromptArea.value = gmSettings.extraPrompt || "";
    }
    if (gmModerationToggle) {
      gmModerationToggle.checked = !!gmSettings.gmModerationEnabled;
    }

    if (sylvieEnabledToggle) {
      sylvieEnabledToggle.checked = !!gmSettings.sylvieEnabled;
    }
    if (sylvieModerationToggle) {
      sylvieModerationToggle.checked = !!gmSettings.sylvieModerationEnabled;
    }
    if (sylvieEmojiInput) {
      sylvieEmojiInput.value = gmSettings.sylvieAvatarEmoji || "👑";
    }
    if (sylvieExtraPromptArea) {
      sylvieExtraPromptArea.value = gmSettings.sylvieExtraPrompt || "";
    }
    const renderCardStatus = () => {
      if (!gmCardStatus) return;
      if (gmSettings.gmCardName) {
        gmCardStatus.textContent = `Card cargada: ${gmSettings.gmCardName}`;
      } else {
        gmCardStatus.textContent = "Ninguna card cargada.";
      }
    };
    renderCardStatus();

    if (toggleBtn && inner) {
      toggleBtn.addEventListener("click", () => {
        inner.classList.toggle("open");
      });
    }

    if (gmEnabledToggle) {
      gmEnabledToggle.addEventListener("change", () => {
        gmSettings.gmEnabled = gmEnabledToggle.checked;
        saveGMSettings();
        renderPlayers();
      });
    }

        const resetChatBtn = panel.querySelector("#gm-reset-chat");
    if (resetChatBtn) {
      resetChatBtn.addEventListener("click", () => {
        const ok = window.confirm(
          "¿Seguro que quieres borrar TODO el chat en este navegador?"
        );
        if (!ok) return;
        resetChatHistory();
      });
    }


    if (nameInput) {
      nameInput.addEventListener("input", () => {
        gmSettings.gmName = nameInput.value || "...";
        saveGMSettings();
        renderPlayers();
      });
    }

    if (modelSelect) {
      modelSelect.addEventListener("change", () => {
        gmSettings.model = modelSelect.value;
        saveGMSettings();
      });
    }

    if (gmRoleSelect) {
      gmRoleSelect.addEventListener("change", () => {
        gmSettings.gmRole = gmRoleSelect.value || "random";
        saveGMSettings();
      });
    }

    if (stripThinkToggle) {
      stripThinkToggle.addEventListener("change", () => {
        gmSettings.stripThinkBlocks = stripThinkToggle.checked;
        saveGMSettings();
      });
    }

    if (thinkToggle) {
      thinkToggle.addEventListener("change", () => {
        gmSettings.thinkEnabled = thinkToggle.checked;
        saveGMSettings();
      });
    }

    if (gmForceBtn) {
      gmForceBtn.addEventListener("click", () => {
        enqueuePersonaReply("gm");
      });
    }

    if (sylvieForceBtn) {
      sylvieForceBtn.addEventListener("click", () => {
        enqueuePersonaReply("sylvie");
      });
    }

    if (avatarEmojiInput) {
      avatarEmojiInput.addEventListener("input", () => {
        gmSettings.avatarEmoji = avatarEmojiInput.value || "";
        saveGMSettings();
      });
    }

    if (avatarImageInput) {
      avatarImageInput.addEventListener("change", () => {
        const file = avatarImageInput.files && avatarImageInput.files[0];
        if (!file) {
          gmSettings.avatarImageDataUrl = "";
          saveGMSettings();
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          gmSettings.avatarImageDataUrl = e.target.result;
          saveGMSettings();
        };
        reader.readAsDataURL(file);
      });
    }

    if (gmCardFileInput) {
      gmCardFileInput.addEventListener("change", async () => {
        const file = gmCardFileInput.files && gmCardFileInput.files[0];
        if (!file) return;
        if (gmCardStatus) {
          gmCardStatus.textContent = "Cargando card...";
        }
        try {
          const result = await loadCharacterCardFromFile(file);
          saveGMSettings();
          renderPlayers();
          if (nameInput) {
            nameInput.value = getGMName() || "";
          }
          renderCardStatus();
          alert(`Card cargada: ${result.cardName || "sin nombre"}`);
        } catch (err) {
          console.error("Error al cargar card:", err);
          if (gmCardStatus) {
            gmCardStatus.textContent =
              "Error al cargar la card. Usa PNG/WebP con metadata o JSON válido.";
          }
          alert(
            "No se pudo leer la Character Card. Usa un PNG/WebP con metadata o un JSON válido."
          );
        }
      });
    }

    if (gmCardClearBtn) {
      gmCardClearBtn.addEventListener("click", () => {
        const prevCardName = gmSettings.gmCardName;
        const prevCardAvatar = gmSettings.gmCardAvatarDataUrl;
        gmSettings.gmCardName = "";
        gmSettings.gmCardPrompt = "";
        gmSettings.gmCardAvatarDataUrl = "";
        if (gmSettings.gmName === prevCardName) {
          gmSettings.gmName = "...";
          if (nameInput) {
            nameInput.value = gmSettings.gmName;
          }
        }
        if (gmSettings.avatarImageDataUrl === prevCardAvatar) {
          gmSettings.avatarImageDataUrl = "";
        }
        saveGMSettings();
        renderPlayers();
        renderCardStatus();
      });
    }

    if (extraPromptArea) {
      extraPromptArea.addEventListener("input", () => {
        gmSettings.extraPrompt = extraPromptArea.value;
        saveGMSettings();
      });
    }

    if (gmModerationToggle) {
      gmModerationToggle.addEventListener("change", () => {
        gmSettings.gmModerationEnabled = gmModerationToggle.checked;
        saveGMSettings();
      });
    }

    if (sylvieEnabledToggle) {
      sylvieEnabledToggle.addEventListener("change", () => {
        gmSettings.sylvieEnabled = sylvieEnabledToggle.checked;
        saveGMSettings();
        renderPlayers();
      });
    }

    if (sylvieModerationToggle) {
      sylvieModerationToggle.addEventListener("change", () => {
        gmSettings.sylvieModerationEnabled = sylvieModerationToggle.checked;
        saveGMSettings();
      });
    }

    if (sylvieEmojiInput) {
      sylvieEmojiInput.addEventListener("input", () => {
        gmSettings.sylvieAvatarEmoji = sylvieEmojiInput.value || "👑";
        saveGMSettings();
      });
    }

    if (sylvieImageInput) {
      sylvieImageInput.addEventListener("change", () => {
        const file = sylvieImageInput.files && sylvieImageInput.files[0];
        if (!file) {
          gmSettings.sylvieAvatarImageDataUrl = "";
          saveGMSettings();
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          gmSettings.sylvieAvatarImageDataUrl = e.target.result;
          saveGMSettings();
        };
        reader.readAsDataURL(file);
      });
    }

    if (sylvieExtraPromptArea) {
      sylvieExtraPromptArea.addEventListener("input", () => {
        gmSettings.sylvieExtraPrompt = sylvieExtraPromptArea.value;
        saveGMSettings();
      });
    }
  }

    if (isGM) {
    setupGMPanel();

    // Abre el panel la primera vez para que se note que existe
    const firstTime = !localStorage.getItem("dwjc2_gm_panel_seen");
    if (firstTime) {
      localStorage.setItem("dwjc2_gm_panel_seen", "1");
      const inner = document.querySelector(".gm-panel-inner");
      if (inner) {
        inner.classList.add("open");
      }
    }
  }


  // 10) Cargar historial y bienvenida inicial
  loadHistory();
  renderMessages();

  

  // La contraseña ya se pidió en el Pasaporte (login).
  // Aquí solo usamos el nombre para saber si mostramos el Panel GM.
});


