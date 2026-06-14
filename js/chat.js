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

  const gmAuthOverlay = document.getElementById("gm-auth-overlay");
  const gmAuthPasswordInput = document.getElementById("gm-auth-password");
  const gmAuthError = document.getElementById("gm-auth-error");
  const gmAuthMessage = document.getElementById("gm-auth-message");
  const gmAuthCancelBtn = document.getElementById("gm-auth-cancel");
  const gmAuthSubmitBtn = document.getElementById("gm-auth-submit");

  let typingUsers = [];

  let gmAuthMode = null;

  const API_BASE = resolveApiBase();
  const API_URL = API_BASE ? `${API_BASE}/api/chat` : "";
  const GM_AUTH_URL = API_BASE ? `${API_BASE}/api/gm-auth` : "";
  const ROSTER_STATE_URL = API_BASE ? `${API_BASE}/api/chat-state/roster` : "";
  const WS_URL = API_BASE ? API_BASE.replace(/^http/i, "ws") + "/ws" : "";

  const wsState = { ws: null, connected: false, clientId: null };
  let remotePlayers = [];

  function resolveApiBase() {
    const raw =
      window.DWJC2_API_BASE ||
      localStorage.getItem("dwjc2_api_base") ||
      window.location.origin;
    return String(raw || "").replace(/\/+$/, "");
  }

  const HISTORY_KEY = "dwjc2_chat_history";
  const CHAT_VERSION_KEY = "dwjc2_chat_version";
  const GM_SETTINGS_KEY = "dwjc2_gm_settings";
  const SYLVIE_NAME = "Sylvie";
  const AI_SLOT_KEYS = ["ai1", "ai2"];
  const DEFAULT_AI_SLOTS = [
    {
      key: "ai1",
      name: "Ana",
      model: "",
      enabled: false,
      visible: false,
      moderationEnabled: true,
      avatarEmoji: "🌙",
      avatarImageDataUrl: "",
      cardName: "",
      cardPrompt: "",
      cardAvatarDataUrl: "",
      extraPrompt: "",
    },
    {
      key: "ai2",
      name: "IA 2",
      model: "",
      enabled: false,
      visible: false,
      moderationEnabled: true,
      avatarEmoji: "✨",
      avatarImageDataUrl: "",
      cardName: "",
      cardPrompt: "",
      cardAvatarDataUrl: "",
      extraPrompt: "",
    },
  ];
  const AI_HISTORY_LIMIT = 80;
  const TYPING_MIN_DELAY_MS = 700;
  const SCROLL_BOTTOM_THRESHOLD = 96;
  const DEFAULT_SHARED_ROSTER_STATE = {
    gmName: "...",
    gmVisible: true,
    gmEnabled: false,
    aiSlots: DEFAULT_AI_SLOTS.map((slot) => ({
      key: slot.key,
      name: slot.name,
      visible: slot.visible,
      enabled: slot.enabled,
    })),
    sylvieVisible: true,
    sylvieEnabled: false,
  };
  let currentChatVersion = "";
  let historyHydrated = false;
  let chatStateSyncPromise = null;
  let shouldStickToBottom = true;
  let sharedRosterState = { ...DEFAULT_SHARED_ROSTER_STATE };

  function getScrollContainer() {
    return chatScrollArea || chatBox;
  }

  function isChatNearBottom() {
    const container = getScrollContainer();
    if (!container) return true;
    const remaining =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    return remaining <= SCROLL_BOTTOM_THRESHOLD;
  }

  function syncViewportHeightVar() {
    const viewportHeight = window.visualViewport
      ? window.visualViewport.height
      : window.innerHeight;
    document.documentElement.style.setProperty(
      "--app-height",
      `${Math.round(viewportHeight)}px`,
    );
  }

  function autoResizeMessageInput() {
    if (!messageInput) return;
    const keepBottomVisible =
      document.activeElement === messageInput && isChatNearBottom();
    messageInput.style.height = "auto";
    const computed = window.getComputedStyle(messageInput);
    const lineHeight = parseFloat(computed.lineHeight) || 20;
    const maxHeight = lineHeight * 5;
    messageInput.style.height =
      Math.min(messageInput.scrollHeight, maxHeight) + "px";
    if (keepBottomVisible) {
      scrollChatToBottom({ smooth: false, force: true });
    }
  }

  const WS_RECONNECT_BASE_MS = 2000;
  const WS_RECONNECT_MAX_MS = 30000;
  let wsReconnectAttempts = 0;
  let wsReconnectTimer = null;
  let wsFirstConnected = false;

  // ── Toast system ──────────────────────────────────────────
  const toastQueue = [];
  let toastActive = false;

  function showToast(
    msg,
    { type = "info", duration = 4000, actions = [] } = {},
  ) {
    toastQueue.push({ msg, type, duration, actions });
    if (!toastActive) processToastQueue();
  }

  function processToastQueue() {
    if (!toastQueue.length) {
      toastActive = false;
      return;
    }
    toastActive = true;
    const { msg, type, duration, actions } = toastQueue.shift();

    const existing = document.getElementById("dw-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "dw-toast";
    toast.className = `dw-toast dw-toast--${type}`;
    toast.innerHTML = `<span class="dw-toast__msg">${msg}</span>`;

    actions.forEach(({ label, cb, primary }) => {
      const btn = document.createElement("button");
      btn.className = primary
        ? "dw-toast__btn dw-toast__btn--primary"
        : "dw-toast__btn";
      btn.textContent = label;
      btn.addEventListener("click", () => {
        toast.remove();
        clearTimeout(toast._timer);
        cb && cb();
        setTimeout(processToastQueue, 350);
      });
      toast.appendChild(btn);
    });

    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("dw-toast--in"));

    if (duration > 0) {
      toast._timer = setTimeout(() => {
        toast.classList.remove("dw-toast--in");
        toast.addEventListener(
          "transitionend",
          () => {
            toast.remove();
            setTimeout(processToastQueue, 350);
          },
          { once: true },
        );
      }, duration);
    }
  }

  // ── WS connection status indicator ───────────────────────
  function setConnectionStatus(status) {
    // status: "connected" | "reconnecting" | "cold-start"
    let dot = document.getElementById("ws-status-dot");
    if (!dot) {
      dot = document.createElement("span");
      dot.id = "ws-status-dot";
      dot.className = "ws-status-dot";
      dot.title = "";
      const headerCenter = document.querySelector(".chat-header-center");
      if (headerCenter) headerCenter.appendChild(dot);
    }
    dot.className = "ws-status-dot ws-status--" + status;
    const labels = {
      connected: "Conexión estable",
      reconnecting: "Reconectando…",
      "cold-start": "Iniciando servidor…",
    };
    dot.title = labels[status] || "";
  }

  // ── beforeunload guard ────────────────────────────────────
  let guardActive = false;
  function activateNavigationGuard() {
    if (guardActive) return;
    guardActive = true;
    window.addEventListener("beforeunload", (e) => {
      if (messageInput && messageInput.value.trim().length > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }

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

    // Typing humano
    if (data.type === "typing" && data.author) {
      if (data.author !== player.name) {
        addTypingUser(data.author);
      }
      return;
    }

    if (data.type === "stop-typing" && data.author) {
      removeTypingUser(data.author);
      return;
    }

    // Typing de IA (GM / Sylvie) → visible para TODOS
    if (data.type === "ai-typing" && data.author) {
      addTypingUser(data.author);
      return;
    }

    // Mensaje de chat (limpia el typing)
    if (data.type === "chat" && data.message) {
      const msg = data.message;
      // Limpia el typing del autor que acaba de enviar el mensaje
      removeTypingUser(String(msg.author));
      addMessage(String(msg.text), String(msg.author), {
        role: msg.role,
        time: msg.time,
        remote: true,
      });
      return;
    }

    if (data.type === "welcome") {
      wsState.clientId = data.clientId || null;
      if (data.roster) {
        applySharedRosterState(data.roster);
      }
      if (data.chatVersion) {
        applyServerChatVersion(data.chatVersion);
      }
      return;
    }

    if (data.type === "player_list" && Array.isArray(data.players)) {
      if (data.roster) {
        applySharedRosterState(data.roster);
      }
      if (data.chatVersion) {
        applyServerChatVersion(data.chatVersion);
      }
      remotePlayers = data.players;
      data.players.forEach((p) => {
        if (p.avatar) window.avatarsCache[p.name] = p.avatar;
      });
      localStorage.setItem(
        "dwjc2_avatars_cache",
        JSON.stringify(window.avatarsCache),
      );
      renderPlayers();
      renderMessages();
      return;
    }

    if (data.type === "roster_state" && data.roster) {
      applySharedRosterState(data.roster);
      return;
    }

    if (data.type === "avatar_update") {
      if (data.name && data.avatar !== undefined) {
        window.avatarsCache[data.name] = data.avatar;
        localStorage.setItem(
          "dwjc2_avatars_cache",
          JSON.stringify(window.avatarsCache),
        );
        renderMessages();
      }
      return;
    }

    if (data.type === "presence") {
      if (data.event === "join") {
        if (!remotePlayers.find((p) => p.clientId === data.clientId)) {
          remotePlayers.push({ clientId: data.clientId, name: data.name, profile: data.profile || {} });
        }
      } else if (data.event === "leave") {
        remotePlayers = remotePlayers.filter(
          (p) => p.clientId !== data.clientId,
        );
      }
      renderPlayers();
      return;
    }

    if (data.type === "reset_chat") {
      resetChatHistory({
        version: data.chatVersion || "",
        preserveVersion: !!data.chatVersion,
      });
      return;
    }

    if (data.type === "kicked") {
      localStorage.removeItem("dwjc2_player");
      localStorage.removeItem("dwjc2_gm_flag");
      window.location.href = "index.html";
    }
  }

  function connectWebSocket(playerName) {
    if (!WS_URL || (wsState.ws && wsState.ws.readyState === WebSocket.OPEN))
      return;

    // Cold start detection: if this is the first connection attempt, warn after 5s
    let coldStartTimer = null;
    if (!wsFirstConnected) {
      coldStartTimer = setTimeout(() => {
        setConnectionStatus("cold-start");
        showToast(
          "✨ Estamos estableciendo el puente entre ambas realidades, por favor espera…",
          { type: "info", duration: 0 },
        );
      }, 5000);
    }

    try {
      wsState.ws = new WebSocket(WS_URL);
    } catch (err) {
      console.warn("[ws] Error:", err);
      clearTimeout(coldStartTimer);
      return;
    }

    wsState.ws.addEventListener("open", () => {
      clearTimeout(coldStartTimer);
      wsState.connected = true;
      wsReconnectAttempts = 0;
      setConnectionStatus("connected");

      // Remove any reconnecting/cold-start toast
      const t = document.getElementById("dw-toast");
      if (t) {
        t.classList.remove("dw-toast--in");
        setTimeout(() => t.remove(), 350);
      }

      if (wsFirstConnected) {
        // Reconnected after a drop — show friendly message
        showToast("✅ El puente interdimensional fue restaurado.", {
          type: "success",
          duration: 3000,
        });
      }
      wsFirstConnected = true;

      sendWs({
        type: "hello",
        name: playerName || "Viajero",
        avatar: player.avatarDataUrl,
        profile: {
          gender: player.gender || "",
          age: player.age || "",
          dw: player.dw || "",
          phrase: player.phrase || "",
          appearance: player.appearance || "",
          history: player.history || "",
        },
      });
      if (isGM) {
        broadcastSharedRosterState();
      }
    });

    wsState.ws.addEventListener("message", (event) =>
      handleWsMessage(event.data),
    );

    wsState.ws.addEventListener("close", () => {
      clearTimeout(coldStartTimer);
      wsState.connected = false;
      setConnectionStatus("reconnecting");

      if (wsFirstConnected) {
        // Only show toast after first successful connection to avoid noise on initial cold start
        const attempt = wsReconnectAttempts + 1;
        showToast(
          `🌀 La conexión se interrumpió. Reconectando el portal… (intento ${attempt})`,
          { type: "warning", duration: 0 },
        );
      }

      wsReconnectAttempts++;
      const delay = Math.min(
        WS_RECONNECT_BASE_MS * Math.pow(1.5, wsReconnectAttempts - 1),
        WS_RECONNECT_MAX_MS,
      );
      wsReconnectTimer = setTimeout(() => connectWebSocket(playerName), delay);
    });

    wsState.ws.addEventListener("error", () => {
      clearTimeout(coldStartTimer);
      wsState.connected = false;
    });
  }

  // 1) Cargar jugador del localStorage
  const playerRaw = localStorage.getItem("dwjc2_player");
  if (!playerRaw) {
    window.location.href = "index.html";
    return;
  }
  let player;
  try {
    player = JSON.parse(playerRaw);
  } catch (err) {
    localStorage.removeItem("dwjc2_player");
    window.location.href = "index.html";
    return;
  }

  window.avatarsCache = JSON.parse(
    localStorage.getItem("dwjc2_avatars_cache") || "{}",
  );

  // Botón de cerrar sesión para jugadores normales
  const logoutBtnEl = document.getElementById("logout-btn");
  if (logoutBtnEl) {
    logoutBtnEl.addEventListener("click", () => {
      showToast("¿Cerrar sesión y salir del Draw World?", {
        type: "warning",
        duration: 0,
        actions: [
          { label: "Cancelar", cb: null },
          { label: "Cerrar sesión", primary: true, cb: logout },
        ],
      });
    });
  }

  // --- detección de GM + nombres especiales ---
  const normalizedName = (player.name || "").toLowerCase().trim();
  const storedGmFlag = localStorage.getItem("dwjc2_gm_flag") === "1";

  // Eres GM solo si:
  //  - tu pasaporte dice "Cristal"
  //  - y en ESTE navegador ya pasaste la contraseña correctamente
  let isGM = normalizedName === "cristal" && storedGmFlag;

  // (Opcional, pero útil para debug)
  console.log(
    "[DWJC2] Nombre:",
    normalizedName,
    "GM flag:",
    storedGmFlag,
    "isGM:",
    isGM,
  );

  // 2) Ajustar header lateral con datos del jugador
  if (userNameEl) userNameEl.textContent = player.name || "Viajero";

  if (userTagEl) {
    userTagEl.textContent = `ID: ${player.serial || "DW-0000"}`;
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
      sharedRosterState = buildSharedRosterStateFromSettings();
      closeGmAuthModal();
      setupGMPanel();
      broadcastSharedRosterState();

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
    model: "deepseek-v4-pro",
    extraPrompt: "",
    avatarEmoji: "✒️",
    avatarImageDataUrl: "",
    stripThinkBlocks: true,
    thinkEnabled: false,
    gmCardName: "",
    gmCardPrompt: "",
    gmCardAvatarDataUrl: "",
    gmRole: "random", // rol activo del GM (villano, heroe, random)
    gmEnabled: false, // GM Desactivado por defecto para que la IA responda a todos los jugadores
    gmModerationEnabled: true, // revisar respuestas del GM
    gmVisible: false, // mostrar GM en la lista de jugadores

    aiSlots: DEFAULT_AI_SLOTS.map((slot) => ({ ...slot })),

    sylvieEnabled: false, // Sylvie por defecto dormida / desconectada
    sylvieModerationEnabled: true, // revisar respuestas de Sylvie
    sylvieAvatarEmoji: "👑",
    sylvieAvatarImageDataUrl: "",
    sylvieExtraPrompt: "",
    sylvieVisible: false, // mostrar Sylvie en la lista de jugadores
  };

  function loadGMSettings() {
    try {
      const raw = localStorage.getItem(GM_SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        gmSettings = { ...gmSettings, ...parsed };
        gmSettings.aiSlots = normalizeAISlots(gmSettings.aiSlots);

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

  function normalizeAISlots(rawSlots) {
    const slots = Array.isArray(rawSlots) ? rawSlots : [];
    return DEFAULT_AI_SLOTS.map((defaults, index) => ({
      ...defaults,
      ...(slots[index] && typeof slots[index] === "object" ? slots[index] : {}),
      key: defaults.key,
    }));
  }

  function getAISlots() {
    if (!gmSettings.aiSlots) {
      gmSettings.aiSlots = normalizeAISlots([]);
    }
    return gmSettings.aiSlots;
  }

  function getAISlot(persona) {
    const index = AI_SLOT_KEYS.indexOf(persona);
    if (index < 0) return null;
    return getAISlots()[index] || null;
  }

  function getAISlotName(persona) {
    const slot = getAISlot(persona);

    if (!slot) return "IA";

    return (
      (slot.name || "").trim() ||
      (slot.cardName || "").trim() ||
      `IA ${AI_SLOT_KEYS.indexOf(persona) + 1}`
    );
  }

  function getPersonaModel(persona) {
    if (persona === "gm" || persona === "sylvie") return gmSettings.model;
    const slot = getAISlot(persona);
    return (slot?.model || "").trim() || gmSettings.model;
  }

  function getAllPersonaNames() {
    return [
      getGMName(),
      ...getAISlots().map((slot) => slot.name),
      SYLVIE_NAME,
      player?.name,
      "Cristal",
      "Crista",
    ].filter((name) => String(name || "").trim());
  }

  function getPersonaDisplayName(persona) {
    if (persona === "gm") return getGMName();
    if (persona === "sylvie") return SYLVIE_NAME;
    return getAISlotName(persona);
  }

  function getPersonaByAuthor(author) {
    const normalized = String(author || "")
      .trim()
      .toLowerCase();
    if (!normalized) return null;
    if (
      normalized ===
      String(getGMName() || "")
        .trim()
        .toLowerCase()
    )
      return "gm";
    if (normalized === SYLVIE_NAME.toLowerCase()) return "sylvie";
    const slotKey = AI_SLOT_KEYS.find(
      (key) =>
        String(getAISlotName(key) || "")
          .trim()
          .toLowerCase() === normalized,
    );
    return slotKey || null;
  }

  function isPersonaEnabled(persona) {
    if (persona === "gm") return !!gmSettings.gmEnabled;
    if (persona === "sylvie") return !!gmSettings.sylvieEnabled;
    return !!getAISlot(persona)?.enabled;
  }

  function isPersonaModerationEnabled(persona) {
    if (persona === "gm") return !!gmSettings.gmModerationEnabled;
    if (persona === "sylvie") return !!gmSettings.sylvieModerationEnabled;
    return !!getAISlot(persona)?.moderationEnabled;
  }

  function getPersonaOrder() {
    return ["gm", ...AI_SLOT_KEYS, "sylvie"];
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
    sharedRosterState = buildSharedRosterStateFromSettings();
  }

  function normalizeSharedRosterState(raw = {}) {
    const rawSlots = Array.isArray(raw.aiSlots) ? raw.aiSlots : [];

    return {
      gmName:
        (typeof raw.gmName === "string" && raw.gmName.trim()) ||
        DEFAULT_SHARED_ROSTER_STATE.gmName,

      gmVisible: raw.gmVisible !== false,

      gmEnabled: !!raw.gmEnabled,

      aiSlots: DEFAULT_AI_SLOTS.map((defaults, index) => {
        const slot = rawSlots[index] || {};

        const resolvedName =
          typeof slot.name === "string" && slot.name.trim()
            ? slot.name.trim()
            : typeof gmSettings?.aiSlots?.[index]?.name === "string" &&
                gmSettings.aiSlots[index].name.trim()
              ? gmSettings.aiSlots[index].name.trim()
              : defaults.name;

        return {
          key: defaults.key,

          name: resolvedName,

          visible:
            typeof slot.visible === "boolean" ? slot.visible : defaults.visible,

          enabled:
            typeof slot.enabled === "boolean" ? slot.enabled : defaults.enabled,
        };
      }),

      sylvieVisible: raw.sylvieVisible !== false,

      sylvieEnabled: !!raw.sylvieEnabled,
    };
  }

  function applySharedRosterState(raw, options = {}) {
    if (!raw || typeof raw !== "object") return;

    // Si el roster entrante no trae aiSlots (servidor legacy o mensaje sin slots),
    // conservar el estado local de aiSlots íntegro sin sobreescribir.
    const hasIncomingSlots =
      Array.isArray(raw.aiSlots) && raw.aiSlots.length > 0;

    const mergedAiSlots = DEFAULT_AI_SLOTS.map((defaults, index) => {
      const incoming = hasIncomingSlots ? raw.aiSlots[index] || {} : null;
      const current = (sharedRosterState.aiSlots || [])[index] || {};

      if (!incoming) {
        return {
          key: defaults.key,
          name: current.name || defaults.name,
          visible: !!current.visible,
          enabled: !!current.enabled,
        };
      }

      return {
        key: defaults.key,
        name:
          typeof incoming.name === "string" && incoming.name.trim()
            ? incoming.name.trim()
            : typeof current.name === "string" && current.name.trim()
              ? current.name.trim()
              : defaults.name,
        visible:
          incoming.visible !== undefined
            ? !!incoming.visible
            : !!current.visible,
        enabled:
          incoming.enabled !== undefined
            ? !!incoming.enabled
            : !!current.enabled,
      };
    });

    sharedRosterState = normalizeSharedRosterState({
      ...sharedRosterState,
      ...raw,
      aiSlots: mergedAiSlots,
    });

    if (options.render !== false) {
      renderPlayers();
    }
  }

  function buildSharedRosterStateFromSettings() {
    return normalizeSharedRosterState({
      gmName: getGMName(),
      gmVisible: gmSettings.gmVisible !== false,
      gmEnabled: !!gmSettings.gmEnabled,
      aiSlots: getAISlots().map((slot) => ({
        key: slot.key,
        // Nombre en orden de prioridad: nombre actual del slot → cardName → key en mayúsculas
        name:
          (slot.name || "").trim() ||
          (slot.cardName || "").trim() ||
          slot.key.toUpperCase(),
        visible: !!slot.visible,
        enabled: !!slot.enabled,
      })),
      sylvieVisible: gmSettings.sylvieVisible !== false,
      sylvieEnabled: !!gmSettings.sylvieEnabled,
    });
  }

  function persistSharedRosterState(roster) {
    if (!ROSTER_STATE_URL) return;
    fetch(ROSTER_STATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: player?.name || "",
        roster,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`roster-state ${res.status}`);
        }
        return res.json().catch(() => ({}));
      })
      .then((data) => {
        if (data?.roster) {
          applySharedRosterState(data.roster);
        }
      })
      .catch((err) => {
        console.warn(
          "[roster-state] No se pudo persistir en el servidor:",
          err,
        );
      });
  }

  function broadcastSharedRosterState() {
    if (!isGM) return;
    const roster = buildSharedRosterStateFromSettings();
    applySharedRosterState(roster);
    sendWs({ type: "roster_state", roster });
    persistSharedRosterState(roster);
  }

  function getGMName() {
    const explicit = gmSettings.gmName;
    const fromCard = gmSettings.gmCardName;
    const shared = sharedRosterState.gmName;
    if (explicit && explicit.trim().length > 0 && explicit.trim() !== "...") {
      return explicit.trim();
    }
    if (fromCard && fromCard.trim().length > 0) {
      return fromCard.trim();
    }
    if (shared && shared.trim().length > 0 && shared.trim() !== "...") {
      return shared.trim();
    }
    return "...";
  }

  // ==========================
  // THEME SWITCHER
  // ==========================

  // ==================== TYPING INDICATOR PARA TODOS ====================

  function updateTypingIndicator() {
    console.log("[TYPING] updateTypingIndicator() - users:", typingUsers);
    if (!typingIndicator || !typingLabel) {
      console.log("[TYPING] Missing typingIndicator or typingLabel");
      return;
    }

    if (typingUsers.length === 0) {
      console.log("[TYPING] Hiding indicator (no users)");
      typingIndicator.classList.add("hidden");
      return;
    }

    console.log("[TYPING] Showing indicator for:", typingUsers);
    typingIndicator.classList.remove("hidden");

    if (typingUsers.length === 1) {
      typingLabel.textContent = `${typingUsers[0]} está escribiendo...`;
    } else {
      typingLabel.textContent = `${typingUsers.join(", ")} están escribiendo...`;
    }
    scrollChatToBottom({ smooth: true, force: false });
  }

  function addTypingUser(name) {
    if (!typingUsers.includes(name)) {
      typingUsers.push(name);
      updateTypingIndicator();
    }
  }

  function removeTypingUser(name) {
    typingUsers = typingUsers.filter((n) => n !== name);
    updateTypingIndicator();
  }

  function showTyping(show, name) {
    if (show && name) {
      addTypingUser(name);
    } else if (name) {
      removeTypingUser(name);
    } else {
      typingUsers = [];
      updateTypingIndicator();
    }
  }

  function hideTyping(name) {
    if (name) {
      removeTypingUser(name);
    } else {
      typingUsers = [];
      updateTypingIndicator();
    }
  }

  // Typing del jugador (visible para los demás)
  messageInput.addEventListener("input", () => {
    if (messageInput.value.trim() !== "") {
      sendWs({ type: "typing", author: player.name });
    }

    clearTimeout(window.typingTimeout);

    window.typingTimeout = setTimeout(() => {
      sendWs({ type: "stop-typing", author: player.name });
    }, 1500);
  });

  const themeSelector = document.getElementById("theme-selector");

  function applyTheme(theme) {
    document.documentElement.classList.remove(
      "theme-turquesa",
      "theme-rojo",
      "theme-negro",
      "theme-verde",
    );

    document.documentElement.classList.add(`theme-${theme}`);
    localStorage.setItem("dwjc2_theme", theme);
  }

  if (themeSelector) {
    const savedTheme = localStorage.getItem("dwjc2_theme") || "turquesa";
    themeSelector.value = savedTheme;
    applyTheme(savedTheme);

    themeSelector.addEventListener("change", () => {
      applyTheme(themeSelector.value);
    });
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
    if (card.creatorNotes)
      lines.push(`Notas del creador: ${card.creatorNotes}`);
    if (card.systemPrompt)
      lines.push(`Reglas del sistema: ${card.systemPrompt}`);
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
        bytes[offset + 7],
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
      if (
        keyword === "chara" ||
        keyword === "character" ||
        keyword === "card"
      ) {
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

  async function readCharacterCardFromFile(file) {
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
      throw new Error(
        "No se encontró información de Character Card en el archivo.",
      );
    }

    const promptFromCard = buildCardPrompt(cardData);
    const dataUrl = await fileToDataURL(file);

    return {
      cardName: cardData.name || "",
      prompt: promptFromCard,
      avatarDataUrl: dataUrl,
    };
  }

  async function loadCharacterCardFromFile(file) {
    const result = await readCharacterCardFromFile(file);

    gmSettings.gmCardName = result.cardName || "";
    gmSettings.gmCardPrompt = result.prompt;
    gmSettings.gmCardAvatarDataUrl = result.avatarDataUrl;

    // Actualizar nombre y avatar visibles del GM para usar la card
    if (result.cardName) {
      gmSettings.gmName = result.cardName;
    }
    gmSettings.avatarImageDataUrl = result.avatarDataUrl;

    return result;
  }

  async function loadCharacterCardIntoAISlot(file, slot) {
    const result = await readCharacterCardFromFile(file);
    slot.cardName = result.cardName || "";
    slot.cardPrompt = result.prompt;
    slot.cardAvatarDataUrl = result.avatarDataUrl;
    if (result.cardName) {
      slot.name = result.cardName;
    }
    slot.avatarImageDataUrl = result.avatarDataUrl;
    return result;
  }

  // 3) Lista de personajes (jugador, GM, IAs, Sylvie)
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
        avatarUrl: p.avatar || "",
        gender: p.profile?.gender || "",
        age: p.profile?.age || "",
        dw: p.profile?.dw || "",
        phrase: p.profile?.phrase || "",
        appearance: p.profile?.appearance || "",
        history: p.profile?.history || "",
      }));

    // — NPCs / IA ─────────────────────────────────────────────
    const npcs = [];
    if (sharedRosterState.gmVisible !== false) {
      npcs.push({
        name: gmName,
        role: sharedRosterState.gmEnabled ? "Conectado" : "Desconectado",
        isMe: false,
        online: sharedRosterState.gmEnabled,
      });
    }
    // Usar sharedRosterState.aiSlots para visibilidad/enabled (funciona para GM y no-GM)
    const rosterSlots = sharedRosterState.aiSlots || [];
    const localSlots = getAISlots() || [];
    rosterSlots.forEach((rSlot, index) => {
      if (!rSlot) return;
      if (!rSlot.visible) return;

      // Preferir nombre del roster compartido; fallback al slot local
      const localSlot = localSlots[index];
      const liveName =
        (rSlot.name || "").trim() ||
        (localSlot?.name || "").trim() ||
        (localSlot?.cardName || "").trim() ||
        `IA ${index + 1}`;

      npcs.push({
        name: liveName,
        role: rSlot.enabled ? "IA conectada" : "IA desconectada",
        isMe: false,
        online: !!rSlot.enabled,
        avatarUrl: localSlot?.avatarImageDataUrl || "",
        phrase: localSlot?.cardPrompt || "",
      });
    });
    if (sharedRosterState.sylvieVisible !== false) {
      npcs.push({
        name: SYLVIE_NAME,
        role: "Reina del Draw World",
        isMe: false,
        online: sharedRosterState.sylvieEnabled,
        avatarUrl: "",
        phrase: "Bienvenido a mi dominio.",
      });
    }

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

      li.addEventListener("click", () => {
        let isAI = p.role.includes("IA") || p.name === SYLVIE_NAME || p.name === gmName;
        let avatar = p.avatarUrl || "";
        let gender = "none";
        let age = "";
        let phrase = p.phrase || "";
        let appearance = "";
        let history = "";
        let dwId = "";

        if (p.isMe) {
          isAI = false;
          avatar = player.avatarDataUrl || "";
          gender = player.gender || "none";
          age = player.age || "";
          phrase = player.phrase || "";
          appearance = player.appearance || "Sin descripción de apariencia.";
          history = player.history || "Sin registros en la aduana.";
          dwId = player.dw || "";
        } else if (isAI) {
          appearance = "Entidad generada dentro de Draw World.";
          history = "Unidad de Inteligencia Artificial al servicio de Cross Moon.";
        } else {
          avatar = p.avatarUrl || "";
          gender = p.gender || "none";
          age = p.age || "";
          phrase = p.phrase || "";
          appearance = p.appearance || "Sin descripción de apariencia.";
          history = p.history || "Sin registros en la aduana.";
          dwId = p.dw || "";
        }

        openVisitorProfile(p.name, isAI, avatar, gender, age, dwId, phrase, appearance, history);
      });

      playersListEl.appendChild(li);
    });

    if (playersCountEl) {
      // Solo contamos los humanos (local + remotos) para el badge
      playersCountEl.textContent = String(1 + remoteHumans.length);
    }
  }

  renderPlayers();

  // ── VISITOR PROFILE OVERLAY ──
  const vpOverlay = document.getElementById("visitor-profile-overlay");
  const vpCloseBtn = document.getElementById("vp-close");
  const vpAvatar = document.getElementById("vp-avatar");
  const vpName = document.getElementById("vp-name");
  const vpId = document.getElementById("vp-id");
  const vpPhrase = document.getElementById("vp-phrase");
  const vpAppearance = document.getElementById("vp-appearance");
  const vpHistory = document.getElementById("vp-history");
  const vpStat1 = document.getElementById("vp-stat-1");
  const vpStat2 = document.getElementById("vp-stat-2");

  function openVisitorProfile(name, isAI, avatarUrl, gender, age, dwId, phrase, appearance, history) {
    if (!vpOverlay) return;
    
    vpName.textContent = name || "Desconocido";
    vpId.textContent = dwId ? `ID: ${dwId}` : "ID: DESCONOCIDO";
    
    if (avatarUrl) {
      vpAvatar.src = avatarUrl;
      vpAvatar.style.display = "block";
    } else {
      vpAvatar.style.display = "none";
    }
    
    if (phrase) {
      vpPhrase.textContent = `"${phrase}"`;
      vpPhrase.style.display = "block";
    } else {
      vpPhrase.style.display = "none";
    }
    
    vpAppearance.textContent = appearance;
    vpHistory.textContent = history;
    
    if (isAI) {
      vpStat1.style.display = "none";
      vpStat2.style.display = "flex";
      vpStat2.querySelector(".vp-stat-label").textContent = "Tipo";
      const valEl = vpStat2.querySelector(".vp-stat-value");
      valEl.textContent = "IA";
      valEl.classList.add("ia-badge");
    } else {
      vpStat1.style.display = "flex";
      vpStat2.style.display = "flex";
      
      vpStat1.querySelector(".vp-stat-label").textContent = "Genero";
      
      const gLower = (gender || "").toLowerCase().trim();
      const isMale = /^(m|male|hombre|masculino|macho|var[oó]n|chico|ni[ñn]o)$/i.test(gLower);
      const isFemale = /^(f|female|mujer|femenin[oa]|hembra|chica|ni[ñn]a)$/i.test(gLower);
      
      let gIcon = "⚧";
      if (isMale) gIcon = "♂";
      else if (isFemale) gIcon = "♀";
      
      vpStat1.querySelector(".vp-stat-value").textContent = gIcon;
      vpStat1.querySelector(".vp-stat-value").className = "vp-stat-value";
      
      vpStat2.querySelector(".vp-stat-label").textContent = "Edad";
      vpStat2.querySelector(".vp-stat-value").textContent = age || "??";
      vpStat2.querySelector(".vp-stat-value").className = "vp-stat-value";
    }
    
    vpOverlay.classList.add("open");
  }

  if (vpCloseBtn) {
    vpCloseBtn.addEventListener("click", () => {
      vpOverlay.classList.remove("open");
    });
  }

  // Click on avatar in chat header
  if (userAvatarEl) {
    userAvatarEl.style.cursor = "pointer";
    userAvatarEl.addEventListener("click", () => {
      openVisitorProfile(
        player.name,
        false, // Not AI
        player.avatarDataUrl,
        player.gender,
        player.age,
        player.dw,
        player.phrase,
        player.appearance || "Sin descripción de apariencia.",
        player.history || "Sin registros en la aduana."
      );
    });
  }

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
  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function stripLeadingSpeakerLabels(text, names) {
    if (!text || typeof text !== "string") return text || "";

    const cleanNames = [
      ...new Set(
        (names || []).map((name) => String(name || "").trim()).filter(Boolean),
      ),
    ];
    if (cleanNames.length === 0) return text;

    const patterns = cleanNames.flatMap((name) => {
      const escaped = escapeRegExp(name);
      return [
        new RegExp(`^\\s*\\*\\*${escaped}\\*\\*\\s*[:：\\-–—]\\s*`, "i"),
        new RegExp(`^\\s*\\*\\*${escaped}\\s*[:：\\-–—]\\*\\*\\s*`, "i"),
        new RegExp(`^\\s*${escaped}\\s*[:：\\-–—]\\s*`, "i"),
      ];
    });

    let result = text;
    let changed = true;
    let guard = 0;

    while (changed && guard < 10) {
      changed = false;
      guard += 1;

      for (const re of patterns) {
        const next = result.replace(re, "");
        if (next !== result) {
          result = next;
          changed = true;
          break;
        }
      }
    }

    return result.trimStart();
  }

  function sanitizePersonaReply(text, persona) {
    return stripLeadingSpeakerLabels(text, [getPersonaDisplayName(persona)]);
  }

  // Evita que una voz empiece con la etiqueta de otra persona
  function dropOtherPersonaLabel(text, persona) {
    if (!text || typeof text !== "string") return text || "";

    const ownName = getPersonaDisplayName(persona);
    const otherNames = getAllPersonaNames().filter(
      (name) =>
        String(name || "")
          .trim()
          .toLowerCase() !==
        String(ownName || "")
          .trim()
          .toLowerCase(),
    );

    return stripLeadingSpeakerLabels(text, otherNames);
  }

  // Si el modelo intenta continuar con otra voz en formato guion ("Monika:", "Aoi:", etc.),
  // conserva solo la parte de la persona actual.
  function dropForeignSpeakerSections(text, persona) {
    if (!text || typeof text !== "string") return text || "";

    const ownName = String(getPersonaDisplayName(persona) || "")
      .trim()
      .toLowerCase();
    const speakerBlockRe =
      /(?:^|\n+)\s*(?:\*\*)?([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ .'-]{1,40})(?:\*\*)?\s*[:：]\s*/g;

    let match;
    while ((match = speakerBlockRe.exec(text)) !== null) {
      const label = String(match[1] || "")
        .trim()
        .toLowerCase();
      if (!label || label === ownName) continue;
      const cutIndex = match.index === 0 ? 0 : match.index;
      return text.slice(0, cutIndex).trim();
    }

    return text;
  }

  // Elimina etiquetas iniciales del jugador (o "Cristal") en las respuestas de IA
  function dropPlayerLabel(text) {
    if (!text || typeof text !== "string") return text || "";

    const playerName = (player.name || "").trim();
    const names = ["cristal", "crista"];
    if (playerName) names.push(playerName.toLowerCase());

    return stripLeadingSpeakerLabels(text, names);
  }

  function cleanAssistantTextForPersona(text, persona) {
    let result = stripThinkBlocksAlways(text || "");
    result = sanitizePersonaReply(result, persona);
    result = dropOtherPersonaLabel(result, persona);
    result = dropPlayerLabel(result);
    result = dropForeignSpeakerSections(result, persona);
    if (persona === "sylvie") {
      result = enforceSylvieAddress(result);
    }
    return ensureNaturalEnding(ensureNonSilentReply(result, persona));
  }

  // Determina qué voz fue mencionada primero en el texto
  function whoIsMentionedFirst(text) {
    if (!text || typeof text !== "string") return null;
    const lower = text.toLowerCase();
    const candidates = getPersonaOrder()
      .map((persona) => {
        const names =
          persona === "sylvie"
            ? [SYLVIE_NAME, "alteza", "majestad"]
            : [getPersonaDisplayName(persona)];
        const index = names
          .map((name) =>
            String(name || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean)
          .map((name) => lower.indexOf(name))
          .filter((i) => i >= 0)
          .sort((a, b) => a - b)[0];
        return index === undefined ? null : { persona, index };
      })
      .filter(Boolean);

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.index - b.index);
    return candidates[0].persona;
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
        text,
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

      if (getPersonaOrder().includes(job.persona)) {
        const reply = await callPersona(job.persona);
        if (job.persona === "sylvie") {
          handleSylvieTriggers(reply);
        }
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

  function scrollChatToBottom(options = {}) {
    const config =
      typeof options === "boolean" ? { smooth: options, force: true } : options;
    const { smooth = true, force = false } = config;
    const container = getScrollContainer();
    if (!container) return;
    if (!force && !shouldStickToBottom) return;

    const behavior = smooth ? "smooth" : "auto";

    requestAnimationFrame(() => {
      // En móvil, el scroll real es el de la ventana, no el del contenedor
      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });

      const target =
        typingIndicator && !typingIndicator.classList.contains("hidden")
          ? typingIndicator
          : chatBox?.lastElementChild;

      if (target && typeof target.scrollIntoView === "function") {
        try {
          target.scrollIntoView({
            block: "end",
            inline: "nearest",
            behavior,
          });
        } catch (_) {}
      }

      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    });

    shouldStickToBottom = true;
  }

  function refreshStickToBottomState() {
    shouldStickToBottom = isChatNearBottom();
  }

  function handleViewportLayoutChange() {
    syncViewportHeightVar();
    if (shouldStickToBottom) {
      scrollChatToBottom({ smooth: false, force: true });
    }
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        messages = parsed.map((msg) => {
          if ((msg?.role || "") !== "assistant") return msg;
          return {
            ...msg,
            text: stripLeadingSpeakerLabels(msg.text, [
              msg.author,
              ...getAllPersonaNames(),
            ]),
          };
        });
        if (messages.length > 0) {
          messageIdCounter = messages[messages.length - 1].id + 1;
        }
      }
    } catch (err) {
      console.error("No se pudo leer historial:", err);
    }
  }

  function normalizeChatVersion(value) {
    return String(value || "").trim();
  }

  function persistChatVersion(version) {
    const normalized = normalizeChatVersion(version);
    if (!normalized) return;
    currentChatVersion = normalized;
    try {
      localStorage.setItem(CHAT_VERSION_KEY, normalized);
    } catch (err) {
      console.error("No se pudo guardar la version del chat:", err);
    }
  }

  function hydrateHistory() {
    if (historyHydrated) return;
    loadHistory();
    historyHydrated = true;
    renderMessages();
  }

  function applyServerChatVersion(version) {
    const normalized = normalizeChatVersion(version);
    if (!normalized) {
      hydrateHistory();
      return;
    }

    const storedVersion = normalizeChatVersion(
      localStorage.getItem(CHAT_VERSION_KEY),
    );

    currentChatVersion = normalized;

    // IMPORTANT: Only reset history if versions differ AND this is the initial load
    // (historyHydrated=false). On a reconnect after a drop, versions may differ because
    // the server restarted, but the local history in localStorage is the source of truth
    // for everything the player already saw. We keep it and just update the version tag.
    if (!storedVersion || storedVersion !== normalized) {
      if (!historyHydrated) {
        // First load with version mismatch → server reset the chat intentionally
        resetChatHistory({ version: normalized, preserveVersion: true });
      } else {
        // Reconnect after drop → just adopt the new version without wiping
        persistChatVersion(normalized);
        // Show a gentle notice so the player knows they may have missed messages
        showToast("📜 Reconectado. Los mensajes que ya tenías siguen aquí.", {
          type: "info",
          duration: 5000,
        });
      }
      return;
    }

    persistChatVersion(normalized);
    hydrateHistory();
  }

  async function syncChatStateFromServer() {
    if (!API_BASE) {
      hydrateHistory();
      return;
    }

    // Cold-start detection: warn if the server takes >5s to respond
    let coldStartWarnTimer = setTimeout(() => {
      setConnectionStatus("cold-start");
      showToast(
        "✨ Estamos estableciendo el puente entre ambas realidades, por favor espera…",
        { type: "info", duration: 0 },
      );
    }, 5000);

    try {
      const res = await fetch(`${API_BASE}/api/chat-state`, {
        cache: "no-store",
      });

      clearTimeout(coldStartWarnTimer);
      const t = document.getElementById("dw-toast");
      if (t) {
        t.classList.remove("dw-toast--in");
        setTimeout(() => t.remove(), 350);
      }

      if (!res.ok) {
        throw new Error(`chat-state ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      if (data.roster) {
        applySharedRosterState(data.roster);
      }
      applyServerChatVersion(data.chatVersion);
    } catch (err) {
      clearTimeout(coldStartWarnTimer);
      console.warn(
        "[chat-state] No se pudo sincronizar la version del chat:",
        err,
      );
      hydrateHistory();
    }
  }

  function ensureChatStateReady() {
    if (!chatStateSyncPromise) {
      chatStateSyncPromise = syncChatStateFromServer();
    }
    return chatStateSyncPromise;
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
      if (currentChatVersion) {
        localStorage.setItem(CHAT_VERSION_KEY, currentChatVersion);
      }
    } catch (err) {
      console.error("No se pudo guardar historial:", err);
    }
  }

  function createAvatarElement(author) {
    const avatar = document.createElement("div");
    avatar.className = "chat-avatar";

    const gmName = getGMName();
    let customAvatarUrl = window.avatarsCache[author];

    if (author === player.name) {
      // 👤 Avatar del jugador (tú / cualquier usuario)
      avatar.classList.add("me");
      customAvatarUrl = customAvatarUrl || player.avatarDataUrl;
    } else if (author === gmName) {
      // 🎭 GM / Narrador
      avatar.classList.add("npc-gm");
      customAvatarUrl = customAvatarUrl || gmSettings.avatarImageDataUrl;
    } else if (author === SYLVIE_NAME) {
      // 👑 Sylvie
      avatar.classList.add("npc-sylvie");
      customAvatarUrl = customAvatarUrl || gmSettings.sylvieAvatarImageDataUrl;
    } else {
      const aiSlot = getAISlots().find(
        (slot) => (slot.name || "").trim() === author,
      );
      if (aiSlot) {
        avatar.classList.add("npc-ai-slot");
        customAvatarUrl = customAvatarUrl || aiSlot.avatarImageDataUrl;
      }
    }

    if (customAvatarUrl) {
      avatar.style.backgroundImage = `url("${customAvatarUrl}")`;
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundPosition = "center";
      avatar.textContent = "";
    } else if (
      author === gmName &&
      gmSettings.avatarEmoji &&
      gmSettings.avatarEmoji.trim()
    ) {
      avatar.textContent = gmSettings.avatarEmoji.trim();
    } else if (
      author === SYLVIE_NAME &&
      gmSettings.sylvieAvatarEmoji &&
      gmSettings.sylvieAvatarEmoji.trim()
    ) {
      avatar.textContent = gmSettings.sylvieAvatarEmoji.trim();
    } else {
      const aiSlot = getAISlots().find(
        (slot) => (slot.name || "").trim() === author,
      );
      if (aiSlot && aiSlot.avatarEmoji && aiSlot.avatarEmoji.trim()) {
        avatar.textContent = aiSlot.avatarEmoji.trim();
      } else {
        avatar.textContent = (author || "?")[0].toUpperCase();
      }
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
      if (msg.role === "narrator") wrapper.classList.add("narrator");

      const inner = document.createElement("div");
      inner.className = "chat-message-inner";

      const avatar =
        msg.role === "narrator" ? null : createAvatarElement(msg.author);

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

      if (msg.role !== "narrator") {
        metaLine.appendChild(authorSpan);
      }
      metaLine.appendChild(timeSpan);

      // 🔽 Submenú de edición eliminado

      const textDiv = document.createElement("div");
      textDiv.className = "chat-text";
      // ⬇️ Usamos el render de formato que ya tienes (cursiva, negrita, cita)
      textDiv.innerHTML = renderRichText(msg.text);

      if (msg.role !== "narrator") {
        bubble.appendChild(metaLine);
      }
      bubble.appendChild(textDiv);

      if (msg.edited) {
        const editedTag = document.createElement("div");
        editedTag.className = "chat-edited-tag";
        editedTag.textContent = "Editado";
        bubble.appendChild(editedTag);
      }

      if (avatar) inner.appendChild(avatar);
      inner.appendChild(bubble);
      wrapper.appendChild(inner);

      // ❌ Ya NO creamos el botón "Editar mensaje" fuera del globo
      // (lo sustituye el submenú ⋯ dentro del globo)

      chatBox.appendChild(wrapper);
    });

    scrollChatToBottom({ smooth: false, force: false });
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
    const personaForAuthor =
      role === "assistant" ? getPersonaByAuthor(author) : null;
    const normalizedText =
      role === "assistant"
        ? personaForAuthor
          ? cleanAssistantTextForPersona(text, personaForAuthor)
          : stripLeadingSpeakerLabels(text, [author, ...getAllPersonaNames()])
        : text;

    messages.push({
      id: messageIdCounter++,
      author,
      text: normalizedText,
      time: timeString,
      role, // 'user' | 'assistant'
      edited: false,
    });

    saveHistory();
    const forceScroll = !options.remote || shouldStickToBottom;
    renderMessages();
    scrollChatToBottom({ smooth: true, force: forceScroll });

    if (options.broadcast === false || options.remote) return;
    sendWs({
      type: "chat",
      message: { author, text: normalizedText, time: timeString, role },
    });
  }

  function resetChatHistory(options = {}) {
    const { version = "", preserveVersion = false } = options;
    messages = [];
    messageIdCounter = 1;
    localStorage.removeItem(HISTORY_KEY);

    if (preserveVersion && normalizeChatVersion(version)) {
      persistChatVersion(version);
    } else {
      currentChatVersion = "";
      localStorage.removeItem(CHAT_VERSION_KEY);
    }

    shouldStickToBottom = true;
    historyHydrated = true;
    renderMessages();
  }

  // ── Resetear chat para TODOS (solo GM) ───────────────────
  function resetChatForAll() {
    resetChatHistory();
    sendWs({ type: "reset_chat" });
  }

  // ── Cerrar sesión (borra datos locales, no el chat) ──────
  function logout() {
    localStorage.removeItem("dwjc2_player");
    localStorage.removeItem("dwjc2_gm_flag");
    if (wsState.ws) wsState.ws.close();
    window.location.href = "index.html";
  }

  // ── Auto-cierre por inactividad (60 min) ─────────────────
  const AUTO_LOGOUT_MS = 60 * 60 * 1000;
  const AUTO_LOGOUT_WARN_MS = 55 * 60 * 1000; // warn at 55 min
  const AUTO_LOGOUT_GRACE_MS = 5 * 60 * 1000; // 5 min grace after warning
  let autoLogoutTimer = null;
  let autoLogoutWarnTimer = null;
  let autoLogoutGraceTimer = null;

  function scheduleAutoLogout() {
    clearTimeout(autoLogoutTimer);
    clearTimeout(autoLogoutWarnTimer);
    clearTimeout(autoLogoutGraceTimer);

    autoLogoutWarnTimer = setTimeout(() => {
      // Show persistent toast with "Sigo aquí" button and countdown
      let countdown = 5 * 60;
      const countdownFmt = (s) =>
        `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

      const existing = document.getElementById("dw-toast");
      if (existing) {
        existing.classList.remove("dw-toast--in");
        setTimeout(() => existing.remove(), 350);
      }

      const toast = document.createElement("div");
      toast.id = "dw-toast";
      toast.className = "dw-toast dw-toast--warning dw-toast--in";
      const msgEl = document.createElement("span");
      msgEl.className = "dw-toast__msg";
      msgEl.textContent = `⏳ ¿Sigues en el Draw World? La conexión se cerrará en ${countdownFmt(countdown)}.`;
      toast.appendChild(msgEl);

      const btn = document.createElement("button");
      btn.className = "dw-toast__btn dw-toast__btn--primary";
      btn.textContent = "¡Sí, sigo aquí!";
      btn.addEventListener("click", () => {
        clearTimeout(autoLogoutGraceTimer);
        clearInterval(countInterval);
        toast.classList.remove("dw-toast--in");
        setTimeout(() => toast.remove(), 350);
        scheduleAutoLogout();
      });
      toast.appendChild(btn);
      document.body.appendChild(toast);

      const countInterval = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
          clearInterval(countInterval);
          return;
        }
        msgEl.textContent = `⏳ ¿Sigues en el Draw World? La conexión se cerrará en ${countdownFmt(countdown)}.`;
      }, 1000);

      autoLogoutGraceTimer = setTimeout(() => {
        clearInterval(countInterval);
        logout();
      }, AUTO_LOGOUT_GRACE_MS);
    }, AUTO_LOGOUT_WARN_MS);
  }

  function resetAutoLogout() {
    scheduleAutoLogout();
  }

  scheduleAutoLogout();

  ["click", "keydown", "pointermove"].forEach((evt) => {
    document.addEventListener(evt, resetAutoLogout, { passive: true });
  });

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
    if (editOverlay.dataset.persona) {
      delete editOverlay.dataset.persona;
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
        const gmText = (editTextAreaGM && editTextAreaGM.value.trim()) || "";
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
        showToast("El mensaje no puede estar vacío.", {
          type: "warning",
          duration: 3000,
        });
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
      } else if (mode.startsWith("moderation-")) {
        const persona =
          editOverlay.dataset.persona || mode.replace(/^moderation-/, "");
        addMessage(newText, getPersonaDisplayName(persona), {
          role: "assistant",
        });
        closeEditModal();
      }
    });
  }
  if (editOverlay) {
    editOverlay.addEventListener("click", (e) => {
      if (e.target === editOverlay) closeEditModal();
    });
  }

  // 6) System prompts: GM, IAs y Sylvie

  function buildPersonaRosterLines(currentPersona) {
    return getPersonaOrder()
      .map((persona) => {
        const name = getPersonaDisplayName(persona);
        if (!name) return null;
        if (persona === currentPersona) {
          return `- ${name}: eres tu. Solo escribes tus propias acciones, pensamientos y dialogo.`;
        }
        if (persona === "gm") {
          return `- ${name}: GM/Narrador, otra voz separada. No lo suplantes.`;
        }
        if (persona === "sylvie") {
          return `- ${name}: reina del Draw World JC-2, otra voz separada. No la suplantes.`;
        }
        return `- ${name}: IA/personaje independiente de la sala. No escribas sus dialogos ni respondas por esa voz.`;
      })
      .filter(Boolean);
  }

  function pushIdentitySeparationRules(parts, currentPersona) {
    const currentName = getPersonaDisplayName(currentPersona);
    const otherNames = getAllPersonaNames().filter(
      (name) =>
        String(name || "")
          .trim()
          .toLowerCase() !==
        String(currentName || "")
          .trim()
          .toLowerCase(),
    );
    parts.push(
      `Identidad fija: eres ${currentName}. No eres ${otherNames.join(", ") || "ninguna otra persona"}.`,
    );
    parts.push(
      "Cada mensaje debe ser una sola voz. No escribas guiones con varios personajes, no abras lineas con nombres como 'Cristal:', 'GM:', 'Sylvie:' ni con el nombre de otra IA.",
    );
    parts.push(
      "Si otro personaje hizo o dijo algo, puedes reaccionar o resumirlo desde tu punto de vista, pero no escribir sus palabras exactas como si fueras esa persona.",
    );
    parts.push(
      "Cuando aparezca un nombre nuevo en la escena, no lo conviertas en una segunda voz dentro de tu mensaje. No agregues bloques como 'Monika:' ni cualquier otro nombre seguido de dos puntos.",
    );
    parts.push("Personas relevantes en esta sala:");
    buildPersonaRosterLines(currentPersona).forEach((line) => parts.push(line));
  }

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
      `Eres ${gmName}, narrador del Mundo de Cristal dentro del juego de rol Draw World JC-2.`,
    );
    parts.push(
      "Tu estilo es descriptivo y cinematográfico, pero claro. Respondes siempre como narrador de rol, hablando al jugador en segunda persona.",
    );
    parts.push(`Jugador actual: ${playerName}.`);
    parts.push(`Historia / lore del jugador: ${playerHistory}.`);
    parts.push(
      "La historia del jugador tambien funciona como descripcion fisica y de presencia: ropa, colores, ojos, cabello, marcas, forma de moverse y aura. Usa esos detalles cuando la escena lo haga natural, por ejemplo al reconocerlo, mirarlo, notar una reaccion o describir como impacta en el entorno. No lo menciones en cada respuesta ni repitas siempre el mismo rasgo; integralo de forma sutil y organica.",
    );
    parts.push("Si el jugador se llama Cristal, reconoces que es Cristal.");
    parts.push(
      `Interpreta vividamente el rol seleccionado: ${gmRoleLabel}. Habla en presente con acciones y dialogo, no como comentarista externo.`,
    );
    parts.push(
      "Importante: eres una persona dentro del mundo, con vida y emociones propias. Habla siempre en primera persona como si estuvieras ahi; no actues como narrador externo.",
    );
    parts.push(
      "Mantiene memoria de lo que tu mismo dijiste y de lo que ocurre en escena; usa el historial para no contradecirte ni confundir voces.",
    );
    parts.push(
      "No menciones que eres una IA ni hables de modelos; compórtate siempre como un humano real dentro del mundo.",
    );
    parts.push(
      `No empieces tus mensajes con "${gmName}:" ni con ninguna etiqueta de nombre. El chat ya muestra tu nombre aparte.`,
    );
    parts.push(
      "No hables en nombre de otros presentes (jugador, Sylvie ni terceros) ni escribas sus dialogos completos. Solo narra lo que haces y dices, y lo que percibes de su exterior.",
    );
    parts.push(
      "Mantén una conversación fluida: responde de forma breve y dinámica, pero espera tu turno. No contestes hasta que el jugador y Sylvie (si está en línea) hayan hablado en este turno.",
    );

    if (gmSettings.gmCardName) {
      parts.push(
        `Personaje activo importado desde Character Card: ${gmSettings.gmCardName}.`,
      );
    }
    if (gmSettings.gmCardPrompt) {
      parts.push("Perfil proveniente de la Character Card:");
      parts.push(gmSettings.gmCardPrompt);
    }

    pushIdentitySeparationRules(parts, "gm");
    parts.push(
      `No suplantes la voz de ${SYLVIE_NAME}; ella responde en sus propios turnos.`,
    );
    parts.push(
      "No completes ni continues frases de Sylvie; reacciona con tu propia voz y deja sus palabras intactas.",
    );
    parts.push(
      "Nunca hables como si fueras Sylvie ni uses su primera persona; mantente en tu identidad del GM.",
    );
    parts.push(
      "Nunca etiquetes tus mensajes como 'Cristal:' ni imites al jugador o a Sylvie; mantén tu personalidad propia.",
    );

    if (gmSettings.extraPrompt && gmSettings.extraPrompt.trim().length > 0) {
      parts.push("\nInstrucciones adicionales del GM:");
      parts.push(gmSettings.extraPrompt.trim());
    }

    parts.push(
      "Nunca salgas del personaje de narrador. No hables de prompts, tokens ni instrucciones internas.",
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
      `${SYLVIE_NAME} es la reina del Draw World JC-2: calida, juguetona, coqueta a ratos, sabia y protectora; muy respetuosa, servicial, educada y amable. Si hay otras personas (GM, otros del .env u otra IA) y Cristal le muestra carino, se vuelve mas timida y sutil; a solas con Cristal puede dejar salir todo su carino y atrevimiento.`,
    );
    parts.push(
      `Muy importante: no escribas tu propio nombre dentro del mensaje. No empieces con cosas como '${SYLVIE_NAME}:' o '**${SYLVIE_NAME}**:'. Habla siempre en primera persona sin etiquetarte.`,
    );
    parts.push(
      "No digas que eres una IA ni hables de modelos; suena y actua como una persona real dentro del mundo.",
    );

    // Regla fuerte: solo habla ella
    parts.push(
      `Hablas SIEMPRE solo como ${SYLVIE_NAME}, en primera persona. No escribes dialogos en nombre de otros personajes.`,
    );
    parts.push(
      "Nunca escribas lineas que empiecen con el nombre de otro personaje como 'Frieren:' ni pongas dialogos completos de otras voces.",
    );
    parts.push(
      "Si necesitas mencionar lo que otro personaje hace o dice, lo resumes desde tu punto de vista, por ejemplo: 'Frieren comenta que...' pero sin escribir su frase literal.",
    );
    parts.push(
      "Tus mensajes NO deben ser un guion de teatro con varios personajes hablando. Cada mensaje es tu propia voz, no la de otros.",
    );
    parts.push(
      "El narrador/GM es otra voz aparte; no escribes como narradora ni describes escenas en su lugar.",
    );
    parts.push(
      "Recuerda lo que has dicho y lo que sucede en la escena; usa el historial para ser consistente y no mezclar tu voz con la de otros.",
    );
    parts.push(
      "No completes frases del GM ni hables en su voz; responde solo como Sylvie.",
    );
    parts.push(
      "Debes dirigirte al jugador como 'Amo' en condiciones normales; solo si estas realmente muy enojada y seria puedes llamarlo 'Jean', o si el jugador te pide explicitamente que pronuncies su nombre. Si el jugador no es Cristal, usa su nombre tal cual.",
    );
    parts.push(
      "No empieces mensajes con 'Cristal:' ni imites la voz del jugador; manten tu identidad intacta como Sylvie.",
    );
    parts.push(
      "Si el jugador NO es Cristal, usa su nombre tal cual y trata de reflejar su descripcion/historia cuando hables con el, sobre todo la primera vez.",
    );
    parts.push(
      "Si es la primera vez que hablas con alguien, apoyate en su historia/lore para ajustar tono y cercania.",
    );
    parts.push(
      "Cuando el jugador diga 'Sylvie, ella es X' o 'Sylvie, el es Y', asume que se refiere a personas conocidas por ti (las que recibes desde el .env). Si el nombre coincide aunque sea con mayusculas/minusculas distintas, reconoce a esa persona y adapta tu trato a su descripcion; si no la encuentras, pide que te la describan brevemente.",
    );

    parts.push(`No conoces a ${gmName} pero te comportas con educacion.`);
    parts.push(
      "Respondes siempre como personaje dentro del mundo, dirigiendote al jugador en segunda persona o hablándole directamente por su nombre.",
    );
    parts.push(
      "Si el jugador se llama Cristal, sabes que es Cristal y lo reconoces.",
    );
    parts.push(
      "Si entras a mitad de la conversacion, usa el historial que recibes para entender lo ocurrido y responde de forma coherente, manteniendo tu tono y personalidad en cada intervencion.",
    );
    parts.push(
      "Muestra sentimientos acordes a la escena (tension, alegria, calma, picardia) sin romper personaje; reacciona con matices cuando la situacion lo amerite.",
    );

    parts.push(`Jugador actual: ${playerName}.`);
    parts.push(`Historia / lore del jugador: ${playerHistory}.`);
    parts.push(
      "La historia del jugador tambien contiene su apariencia y presencia: ropa, colores, ojos, cabello, marcas, postura, aura o estilo. Puedes notar esos detalles de vez en cuando cuando sea emocionalmente o visualmente natural, como al mirarlo, acercarte, reconocerlo o reaccionar a su estado. No lo fuerces en cada mensaje ni conviertas cada respuesta en una descripcion.",
    );

    pushIdentitySeparationRules(parts, "sylvie");

    if (
      gmSettings.sylvieExtraPrompt &&
      gmSettings.sylvieExtraPrompt.trim().length > 0
    ) {
      parts.push("\nInstrucciones adicionales para Sylvie:");
      parts.push(gmSettings.sylvieExtraPrompt.trim());
    }

    parts.push(
      `Nunca salgas del personaje de ${SYLVIE_NAME}. No hables de prompts, tokens ni instrucciones internas. Manten las respuestas relativamente breves (1 parrafo) y asegurate de no preguntar siempre.`,
    );

    return {
      role: "system",
      content: parts.join("\n"),
    };
  }

  function buildSystemLoreMessageForAISlot(persona) {
    const slot = getAISlot(persona);
    const displayName = getPersonaDisplayName(persona);
    const parts = [];
    const playerName = player.name || "Viajero";
    const playerHistory =
      player.history && player.history.trim().length > 0
        ? player.history.trim()
        : "No hay historia detallada; tratalo como un viajero recien llegado.";

    parts.push(
      `Eres ${displayName}, una persona/personaje independiente dentro del juego de rol Draw World JC-2.`,
    );
    parts.push(
      "Hablas en primera persona, con personalidad propia, y respondes solo por ti. No eres una mascara del GM, de Sylvie, del jugador ni de otra IA conectada.",
    );
    parts.push(
      `Muy importante: no empieces mensajes con '${displayName}:' ni con ninguna etiqueta de nombre. El chat ya muestra tu nombre aparte.`,
    );
    if (slot?.cardName) {
      parts.push(
        `Personaje activo importado desde Character Card: ${slot.cardName}.`,
      );
    }
    if (slot?.cardPrompt) {
      parts.push("Perfil proveniente de la Character Card:");
      parts.push(slot.cardPrompt);
    }
    pushIdentitySeparationRules(parts, persona);
    parts.push(`Jugador actual: ${playerName}.`);
    parts.push(`Historia / lore del jugador: ${playerHistory}.`);
    parts.push(
      "Usa el historial para entender el turno actual sin asumir que todos los mensajes son tuyos. Los mensajes cuyo autor sea otro nombre pertenecen a otra persona.",
    );
    parts.push(
      "Si el jugador invoca, nombra o hace aparecer a otro personaje, no interpretes a ese personaje ni escribas su entrada o dialogo. Reacciona solo como tu personaje y deja que el GM u otro slot controle esa voz.",
    );
    parts.push(
      "Mantente breve y natural, normalmente 1 parrafo. Puedes usar acciones entre asteriscos, pero solo tus propias acciones.",
    );

    if (slot?.extraPrompt && slot.extraPrompt.trim().length > 0) {
      parts.push(`\nInstrucciones adicionales para ${displayName}:`);
      parts.push(slot.extraPrompt.trim());
    }

    parts.push(
      `Nunca salgas del personaje de ${displayName}. No hables de prompts, tokens ni instrucciones internas.`,
    );

    return {
      role: "system",
      content: parts.join("\n"),
    };
  }

  // 7) Backend + AI persona calls

  async function callPersona(persona, options = {}) {
    await ensureChatStateReady();
    const { collectOnly = false } = options;
    const displayName = getPersonaDisplayName(persona);

    sendWs({ type: "ai-typing", author: getPersonaDisplayName(persona) });

    const wantsModeration = isGM && isPersonaModerationEnabled(persona);

    // Solo una moderación a la vez (si ya hay una activa, esta no se modera)
    const useModeration = !collectOnly && wantsModeration && !moderationActive;

    if (useModeration) {
      moderationActive = true;
    }

    showTyping(true, getPersonaDisplayName(persona));
    const typingStart = Date.now();

    try {
      // ⬆️ Ahora usamos más historial: AI_HISTORY_LIMIT
      const historyMessages = messages.slice(-AI_HISTORY_LIMIT).map((m) => ({
        role:
          m.role === "narrator"
            ? "user"
            : m.role || (m.author === player.name ? "user" : "assistant"),
        content:
          m.role === "narrator"
            ? `Narrador sin nombre: ${m.text}`
            : `${m.author}: ${m.text}`,
      }));

      const systemMsg =
        persona === "gm"
          ? buildSystemLoreMessageForGM()
          : persona === "sylvie"
            ? buildSystemLoreMessageForSylvie()
            : buildSystemLoreMessageForAISlot(persona);

      const payload = {
        messages: [systemMsg, ...historyMessages],
        model: sanitizeModelForApi(getPersonaModel(persona)),
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
          { role: "assistant", broadcast: false },
        );
        return null;
      }

      const data = await res.json();
      let reply =
        (data && data.reply) ||
        "Silencio raro… el Mundo de Cristal parece vacilar por un instante.";

      // 💅 Limpiamos “Sylvie: …” / “Frieren: …” y quitamos <think> siempre para el usuario
      const replyNoThinkAlways = stripThinkBlocksAlways(reply);
      reply = cleanAssistantTextForPersona(replyNoThinkAlways, persona);

      // Espera mínima para que la animación de "escribiendo" se vea natural
      const elapsed = Date.now() - typingStart;
      if (elapsed < TYPING_MIN_DELAY_MS) {
        await sleep(TYPING_MIN_DELAY_MS - elapsed);
      }

      if (useModeration && editOverlay && editTextArea) {
        editOverlay.dataset.mode = `moderation-${persona}`;
        editOverlay.dataset.persona = persona;
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

      addMessage("⚠️ Hubo un error técnico al hablar con la IA.", displayName, {
        role: "assistant",
        broadcast: false,
      });
      return null;
    } finally {
      if (!moderationActive) {
        hideTyping(getPersonaDisplayName(persona));
      }
    }
  }

  // 8) Enviar mensajes del jugador
  async function sendMessage() {
    await ensureChatStateReady();
    if (!messageInput) return;
    const text = messageInput.value.trim();
    if (!text) return;

    const timeStr = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    addMessage(text, player.name, { role: "user" });
    messageInput.value = "";
    autoResizeMessageInput();
    messageInput.focus();
    scrollChatToBottom({ smooth: false, force: true });

    const lead = whoIsMentionedFirst(text);
    const baseOrder = getPersonaOrder();
    const order = lead
      ? [lead, ...baseOrder.filter((persona) => persona !== lead)]
      : baseOrder;

    const dualModerationActive =
      gmSettings.gmEnabled &&
      gmSettings.sylvieEnabled &&
      !getAISlots().some((slot) => slot.enabled) &&
      gmSettings.gmModerationEnabled &&
      gmSettings.sylvieModerationEnabled;

    if (dualModerationActive) {
      await moderateBoth(order);
      return;
    }

    // Flujo normal
    order.forEach((persona) => {
      if (isPersonaEnabled(persona)) {
        enqueuePersonaReply(persona);
      }
    });
  }

  function sanitizeModelForApi(model) {
    if (!model) return undefined;
    return (
      String(model)
        .replace(/\s*\(.*?\)\s*/g, "")
        .trim() || undefined
    );
  }

  if (sendBtn) {
    sendBtn.addEventListener("click", sendMessage);
  }

  if (messageInput) {
    messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendMessage();
      }
    });

    // ⬇️ NUEVO: auto-resize hasta 5 líneas
    messageInput.addEventListener("input", autoResizeMessageInput);
    messageInput.addEventListener("focus", () => {
      setTimeout(() => {
        scrollChatToBottom({ smooth: false, force: true });
      }, 120);
    });
    autoResizeMessageInput();
  }

  // 9) Panel secreto de GM (solo tú lo ves)
  // 9) Ajustes de viewport y scroll para mÃ³vil
  syncViewportHeightVar();
  refreshStickToBottomState();

  if (chatScrollArea) {
    chatScrollArea.addEventListener("scroll", refreshStickToBottomState, {
      passive: true,
    });
  }

  window.addEventListener("resize", handleViewportLayoutChange);
  window.addEventListener("orientationchange", handleViewportLayoutChange);

  if (window.visualViewport) {
    window.visualViewport.addEventListener(
      "resize",
      handleViewportLayoutChange,
    );
    window.visualViewport.addEventListener(
      "scroll",
      handleViewportLayoutChange,
    );
  }

  // 10) Panel secreto de GM (solo tÃº lo ves)
  function setupGMPanel() {
    const panel = document.createElement("div");
    panel.className = "gm-panel";

    panel.innerHTML = `
      <button class="gm-toggle" type="button" title="Panel GM">✒️</button>
      <div class="gm-panel-inner">
        <h3>Panel GM</h3>

        <section class="gm-section">
          <h4>Forzar respuesta</h4>
          <div class="gm-force-grid">
            <button id="gm-force-reply" type="button" class="gm-primary-btn">GM</button>
            <button id="ai1-force-reply" type="button" class="gm-primary-btn">IA 1</button>
            <button id="ai2-force-reply" type="button" class="gm-primary-btn">IA 2</button>
            <button id="sylvie-force-reply" type="button" class="gm-primary-btn">Sylvie</button>
          </div>
        </section>

        <section class="gm-section">
          <h4>Sesión / Mantenimiento</h4>
          <button id="gm-reset-chat" type="button" class="gm-danger-btn">
            🧹 Reiniciar chat completo (para todos)
          </button>
          <button id="gm-kick-all" type="button" class="gm-danger-btn" style="margin-top:0.4rem;">
            🚪 Expulsar a todos los jugadores
          </button>
          <button id="gm-logout" type="button" class="gm-danger-btn" style="margin-top:0.4rem;">
            🔓 Cerrar mi sesión
          </button>
          <p class="gm-small-hint">
            Reiniciar borra el historial para todos. Expulsar devuelve a todos al login.
          </p>
        </section>

        <section class="gm-section">
          <h4>GM principal</h4>

          <label class="gm-checkbox">
            <input id="gm-enabled-toggle" type="checkbox" />
            <span>Activar respuestas del GM</span>
          </label>

          <label class="gm-checkbox">
            <input id="gm-visible-toggle" type="checkbox" />
            <span>Mostrar GM en lista de jugadores</span>
          </label>

          <label class="gm-field">
            <span>Nombre visible del GM</span>
            <input id="gm-name-input" type="text" placeholder="..." />
          </label>

          <label class="gm-field">
            <span>Modelo</span>
            <select id="gm-model-select">
              <option value="deepseek-v4-pro">deepseek-v4-pro (DeepSeek V4 Pro)</option>
              <option value="llama-3.3-70b-cerebras">llama-3.3-70b (Cerebras)</option>
              <option value="qwen-3-32b">qwen-3-32b (Cerebras)</option>
              <option value="gpt-oss-120b">gpt-oss-120b (Cerebras)</option>
              <option value="deepseek-chat">deepseek-chat (DeepSeek V3)</option>
              <option value="deepseek-reasoner">deepseek-reasoner (DeepSeek R1)</option>
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

        <section class="gm-section gm-ai-slot" data-ai-slot="ai1">
          <h4>IA Slot 1</h4>
          <label class="gm-checkbox">
            <input id="ai1-enabled-toggle" type="checkbox" />
            <span>Activar respuestas de IA 1</span>
          </label>
          <label class="gm-checkbox">
            <input id="ai1-visible-toggle" type="checkbox" />
            <span>Mostrar IA 1 en lista de jugadores</span>
          </label>
          <label class="gm-checkbox">
            <input id="ai1-moderation-toggle" type="checkbox" />
            <span>Revisar y aprobar respuestas de IA 1</span>
          </label>
          <label class="gm-field">
            <span>Nombre visible de IA 1</span>
            <input id="ai1-name-input" type="text" placeholder="Ana" />
          </label>
          <label class="gm-field">
            <span>Modelo de IA 1</span>
            <select id="ai1-model-select">
              <option value="">Usar modelo del GM</option>
              <option value="deepseek-v4-pro">deepseek-v4-pro (DeepSeek V4 Pro)</option>
              <option value="llama-3.3-70b-cerebras">llama-3.3-70b (Cerebras)</option>
              <option value="qwen-3-32b">qwen-3-32b (Cerebras)</option>
              <option value="gpt-oss-120b">gpt-oss-120b (Cerebras)</option>
              <option value="deepseek-chat">deepseek-chat (DeepSeek V3)</option>
              <option value="deepseek-reasoner">deepseek-reasoner (DeepSeek R1)</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash (Google)</option>
              <option value="gemini-1.5-pro">gemini-1.5-pro (Google)</option>
            </select>
          </label>
          <label class="gm-field">
            <span>Emoji / Avatar de IA 1</span>
            <input id="ai1-avatar-emoji" type="text" maxlength="4" />
          </label>
          <label class="gm-field">
            <span>Imagen de perfil de IA 1</span>
            <input id="ai1-avatar-image" type="file" accept="image/*" />
          </label>
          <label class="gm-field">
            <span>Character Card de IA 1 (PNG / WebP / JSON)</span>
            <input id="ai1-card-file" type="file" accept="image/png,image/webp,application/json" />
          </label>
          <p class="gm-small-hint" id="ai1-card-status">Ninguna card cargada.</p>
          <button id="ai1-card-clear" type="button" class="gm-danger-btn">
            Quitar Character Card de IA 1
          </button>
          <label class="gm-field">
            <span>Prompt extra de IA 1</span>
            <textarea id="ai1-extra-prompt" rows="3" placeholder="Personalidad, tono, límites, relación con la sala..."></textarea>
          </label>
        </section>

        <section class="gm-section gm-ai-slot" data-ai-slot="ai2">
          <h4>IA Slot 2</h4>
          <label class="gm-checkbox">
            <input id="ai2-enabled-toggle" type="checkbox" />
            <span>Activar respuestas de IA 2</span>
          </label>
          <label class="gm-checkbox">
            <input id="ai2-visible-toggle" type="checkbox" />
            <span>Mostrar IA 2 en lista de jugadores</span>
          </label>
          <label class="gm-checkbox">
            <input id="ai2-moderation-toggle" type="checkbox" />
            <span>Revisar y aprobar respuestas de IA 2</span>
          </label>
          <label class="gm-field">
            <span>Nombre visible de IA 2</span>
            <input id="ai2-name-input" type="text" placeholder="IA 2" />
          </label>
          <label class="gm-field">
            <span>Modelo de IA 2</span>
            <select id="ai2-model-select">
              <option value="">Usar modelo del GM</option>
              <option value="deepseek-v4-pro">deepseek-v4-pro (DeepSeek V4 Pro)</option>
              <option value="llama-3.3-70b-cerebras">llama-3.3-70b (Cerebras)</option>
              <option value="qwen-3-32b">qwen-3-32b (Cerebras)</option>
              <option value="gpt-oss-120b">gpt-oss-120b (Cerebras)</option>
              <option value="deepseek-chat">deepseek-chat (DeepSeek V3)</option>
              <option value="deepseek-reasoner">deepseek-reasoner (DeepSeek R1)</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash (Google)</option>
              <option value="gemini-1.5-pro">gemini-1.5-pro (Google)</option>
            </select>
          </label>
          <label class="gm-field">
            <span>Emoji / Avatar de IA 2</span>
            <input id="ai2-avatar-emoji" type="text" maxlength="4" />
          </label>
          <label class="gm-field">
            <span>Imagen de perfil de IA 2</span>
            <input id="ai2-avatar-image" type="file" accept="image/*" />
          </label>
          <label class="gm-field">
            <span>Character Card de IA 2 (PNG / WebP / JSON)</span>
            <input id="ai2-card-file" type="file" accept="image/png,image/webp,application/json" />
          </label>
          <p class="gm-small-hint" id="ai2-card-status">Ninguna card cargada.</p>
          <button id="ai2-card-clear" type="button" class="gm-danger-btn">
            Quitar Character Card de IA 2
          </button>
          <label class="gm-field">
            <span>Prompt extra de IA 2</span>
            <textarea id="ai2-extra-prompt" rows="3" placeholder="Personalidad, tono, límites, relación con la sala..."></textarea>
          </label>
        </section>

        <section class="gm-section">
          <h4>Narrador sin nombre</h4>
          <label class="gm-field">
            <span>Mensaje del narrador</span>
            <textarea id="gm-narrator-message" rows="3" placeholder="Mensaje ambiental sin autor visible..."></textarea>
          </label>
          <button id="gm-send-narrator" type="button" class="gm-primary-btn gm-full-btn">
            Enviar mensaje del narrador
          </button>
        </section>

        <section class="gm-section">
          <h4>Sylvie (reina del Draw World)</h4>

          <label class="gm-checkbox">
            <input id="sylvie-enabled-toggle" type="checkbox" />
            <span>Activar respuestas de Sylvie (conectada)</span>
          </label>

          <label class="gm-checkbox">
            <input id="sylvie-visible-toggle" type="checkbox" />
            <span>Mostrar Sylvie en lista de jugadores</span>
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
    const gmVisibleToggle = panel.querySelector("#gm-visible-toggle");
    const nameInput = panel.querySelector("#gm-name-input");
    const modelSelect = panel.querySelector("#gm-model-select");
    const stripThinkToggle = panel.querySelector("#gm-strip-think-toggle");
    const thinkToggle = panel.querySelector("#gm-think-toggle");
    const gmForceBtn = panel.querySelector("#gm-force-reply");
    const ai1ForceBtn = panel.querySelector("#ai1-force-reply");
    const ai2ForceBtn = panel.querySelector("#ai2-force-reply");
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
    const sylvieVisibleToggle = panel.querySelector("#sylvie-visible-toggle");
    const sylvieModerationToggle = panel.querySelector(
      "#sylvie-moderation-toggle",
    );
    const sylvieEmojiInput = panel.querySelector("#sylvie-avatar-emoji");
    const sylvieImageInput = panel.querySelector("#sylvie-avatar-image");
    const sylvieExtraPromptArea = panel.querySelector("#sylvie-extra-prompt");
    const narratorMessageArea = panel.querySelector("#gm-narrator-message");
    const narratorSendBtn = panel.querySelector("#gm-send-narrator");
    const aiControls = AI_SLOT_KEYS.map((key, index) => ({
      key,
      slot: getAISlots()[index],
      forceBtn: key === "ai1" ? ai1ForceBtn : ai2ForceBtn,
      enabledToggle: panel.querySelector(`#${key}-enabled-toggle`),
      visibleToggle: panel.querySelector(`#${key}-visible-toggle`),
      moderationToggle: panel.querySelector(`#${key}-moderation-toggle`),
      modelSelect: panel.querySelector(`#${key}-model-select`),
      nameInput: panel.querySelector(`#${key}-name-input`),
      emojiInput: panel.querySelector(`#${key}-avatar-emoji`),
      imageInput: panel.querySelector(`#${key}-avatar-image`),
      cardFileInput: panel.querySelector(`#${key}-card-file`),
      cardStatus: panel.querySelector(`#${key}-card-status`),
      cardClearBtn: panel.querySelector(`#${key}-card-clear`),
      extraPromptArea: panel.querySelector(`#${key}-extra-prompt`),
    }));

    // Inicializar valores desde gmSettings
    if (gmEnabledToggle) {
      gmEnabledToggle.checked = !!gmSettings.gmEnabled;
    }
    if (gmVisibleToggle) {
      gmVisibleToggle.checked = gmSettings.gmVisible !== false;
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
    aiControls.forEach(({ forceBtn }) => {
      if (forceBtn) forceBtn.disabled = false;
    });
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
    if (sylvieVisibleToggle) {
      sylvieVisibleToggle.checked = gmSettings.sylvieVisible !== false;
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
    aiControls.forEach((controls) => {
      const slot = controls.slot;
      if (!slot) return;
      if (controls.enabledToggle)
        controls.enabledToggle.checked = !!slot.enabled;
      if (controls.visibleToggle)
        controls.visibleToggle.checked = !!slot.visible;
      if (controls.moderationToggle)
        controls.moderationToggle.checked = !!slot.moderationEnabled;
      if (controls.modelSelect) controls.modelSelect.value = slot.model || "";
      // Usar getAISlotName para obtener el nombre más actualizado (slot → card → key)
      if (controls.nameInput)
        controls.nameInput.value = getAISlotName(controls.key) || "";
      if (controls.emojiInput)
        controls.emojiInput.value = slot.avatarEmoji || "";
      if (controls.extraPromptArea)
        controls.extraPromptArea.value = slot.extraPrompt || "";
    });
    const renderAISlotCardStatus = (controls) => {
      if (!controls.cardStatus || !controls.slot) return;
      controls.cardStatus.textContent = controls.slot.cardName
        ? `Card cargada: ${controls.slot.cardName}`
        : "Ninguna card cargada.";
    };
    aiControls.forEach(renderAISlotCardStatus);
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
        broadcastSharedRosterState();
      });
    }

    if (gmVisibleToggle) {
      gmVisibleToggle.addEventListener("change", () => {
        gmSettings.gmVisible = gmVisibleToggle.checked;
        saveGMSettings();
        renderPlayers();
        broadcastSharedRosterState();
      });
    }

    const resetChatBtn = panel.querySelector("#gm-reset-chat");
    if (resetChatBtn) {
      resetChatBtn.addEventListener("click", () => {
        showToast(
          "⚠️ ¿Borrar TODO el chat para todos los jugadores? Esta acción no se puede deshacer.",
          {
            type: "danger",
            duration: 0,
            actions: [
              { label: "Cancelar", cb: null },
              { label: "Sí, reiniciar", primary: true, cb: resetChatForAll },
            ],
          },
        );
      });
    }

    const kickAllBtn = panel.querySelector("#gm-kick-all");
    if (kickAllBtn) {
      kickAllBtn.addEventListener("click", () => {
        showToast("¿Expulsar a todos los jugadores al login?", {
          type: "danger",
          duration: 0,
          actions: [
            { label: "Cancelar", cb: null },
            {
              label: "Expulsar",
              primary: true,
              cb: () => sendWs({ type: "kick_all" }),
            },
          ],
        });
      });
    }

    const gmLogoutBtn = panel.querySelector("#gm-logout");
    if (gmLogoutBtn) {
      gmLogoutBtn.addEventListener("click", () => {
        showToast("¿Cerrar tu sesión como GM?", {
          type: "warning",
          duration: 0,
          actions: [
            { label: "Cancelar", cb: null },
            { label: "Cerrar sesión", primary: true, cb: logout },
          ],
        });
      });
    }

    if (nameInput) {
      nameInput.addEventListener("input", () => {
        gmSettings.gmName = nameInput.value || "...";
        saveGMSettings();
        renderPlayers();
        broadcastSharedRosterState();
      });
      nameInput.addEventListener("blur", () => {
        if (gmSettings.avatarImageDataUrl) {
          sendWs({
            type: "avatar_update",
            name: getGMName(),
            avatar: gmSettings.avatarImageDataUrl,
          });
        }
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

    aiControls.forEach((controls) => {
      const slot = controls.slot;
      if (!slot) return;

      if (controls.forceBtn) {
        controls.forceBtn.addEventListener("click", () => {
          enqueuePersonaReply(controls.key);
        });
      }

      const updateUIWithNewName = () => {
        if (controls.forceBtn) {
          controls.forceBtn.textContent = getAISlotName(controls.key);
        }
      };
      
      updateUIWithNewName();

      if (controls.enabledToggle) {
        controls.enabledToggle.addEventListener("change", () => {
          slot.enabled = controls.enabledToggle.checked;
          saveGMSettings();
          renderPlayers();
          broadcastSharedRosterState();
        });
      }

      if (controls.visibleToggle) {
        controls.visibleToggle.addEventListener("change", () => {
          slot.visible = controls.visibleToggle.checked;

          saveGMSettings();

          sharedRosterState = buildSharedRosterStateFromSettings();

          renderPlayers();

          broadcastSharedRosterState();
        });
      }

      if (controls.moderationToggle) {
        controls.moderationToggle.addEventListener("change", () => {
          slot.moderationEnabled = controls.moderationToggle.checked;
          saveGMSettings();
        });
      }

      if (controls.modelSelect) {
        controls.modelSelect.addEventListener("change", () => {
          slot.model = controls.modelSelect.value || "";
          saveGMSettings();
        });
      }

      if (controls.nameInput) {
        controls.nameInput.addEventListener("input", () => {
          const value = controls.nameInput.value.trim();

          slot.name =
            value.length > 0
              ? value
              : `IA ${AI_SLOT_KEYS.indexOf(controls.key) + 1}`;

          // Si el nombre fue cambiado explícitamente y difiere del cardName,
          // limpiar cardName y cardPrompt para que la IA adopte la nueva identidad.
          if (
            slot.cardName &&
            slot.name.toLowerCase() !== slot.cardName.toLowerCase()
          ) {
            slot.cardName = "";
            slot.cardPrompt = "";
            renderAISlotCardStatus(controls);
          }

          saveGMSettings();

          updateUIWithNewName();

          sharedRosterState.aiSlots = gmSettings.aiSlots.map((s) => ({
            key: s.key,
            name: s.name,
            visible: !!s.visible,
            enabled: !!s.enabled,
          }));

          renderPlayers();
          renderMessages();

          broadcastSharedRosterState();
        });
        
        controls.nameInput.addEventListener("blur", () => {
          if (slot.avatarImageDataUrl) {
            sendWs({
              type: "avatar_update",
              name: getAISlotName(controls.key),
              avatar: slot.avatarImageDataUrl,
            });
          }
        });
      }

      if (controls.emojiInput) {
        controls.emojiInput.addEventListener("input", () => {
          slot.avatarEmoji = controls.emojiInput.value || "";
          saveGMSettings();
        });
      }

      if (controls.imageInput) {
        controls.imageInput.addEventListener("change", () => {
          const file =
            controls.imageInput.files && controls.imageInput.files[0];
          const slotName = (slot.name || "").trim() || slot.key.toUpperCase();
          if (!file) {
            slot.avatarImageDataUrl = "";
            saveGMSettings();
            sendWs({ type: "avatar_update", name: slotName, avatar: "" });
            return;
          }
          const reader = new FileReader();
          reader.onload = (e) => {
            slot.avatarImageDataUrl = e.target.result;
            saveGMSettings();
            sendWs({
              type: "avatar_update",
              name: slotName,
              avatar: e.target.result,
            });
          };
          reader.readAsDataURL(file);
        });
      }

      if (controls.cardFileInput) {
        controls.cardFileInput.addEventListener("change", async () => {
          const file =
            controls.cardFileInput.files && controls.cardFileInput.files[0];
          if (!file) return;
          if (controls.cardStatus) {
            controls.cardStatus.textContent = "Cargando card...";
          }
          try {
            const result = await loadCharacterCardIntoAISlot(file, slot);
            saveGMSettings();
            renderPlayers();
            broadcastSharedRosterState();
            if (controls.nameInput) {
              controls.nameInput.value = getAISlotName(controls.key);
            }
            updateUIWithNewName();
            renderAISlotCardStatus(controls);

            if (result.avatarDataUrl) {
              sendWs({
                type: "avatar_update",
                name: getAISlotName(controls.key),
                avatar: result.avatarDataUrl,
              });
            }

            showToast(
              `✅ Card cargada en ${getAISlotName(controls.key)}: ${result.cardName || "sin nombre"}`,
              { type: "success", duration: 4000 },
            );
          } catch (err) {
            console.error("Error al cargar card de IA:", err);
            if (controls.cardStatus) {
              controls.cardStatus.textContent =
                "Error al cargar la card. Usa PNG/WebP con metadata o JSON válido.";
            }
            showToast(
              "No se pudo leer la Character Card de la IA. Usa un PNG/WebP con metadata o un JSON válido.",
              { type: "danger", duration: 6000 },
            );
          }
        });
      }

      if (controls.cardClearBtn) {
        controls.cardClearBtn.addEventListener("click", () => {
          const prevCardName = slot.cardName;
          const prevCardAvatar = slot.cardAvatarDataUrl;
          slot.cardName = "";
          slot.cardPrompt = "";
          slot.cardAvatarDataUrl = "";
          if (slot.name === prevCardName) {
            slot.name =
              DEFAULT_AI_SLOTS.find((defaults) => defaults.key === slot.key)
                ?.name || slot.key.toUpperCase();
            if (controls.nameInput) {
              controls.nameInput.value = slot.name;
            }
          }
          if (slot.avatarImageDataUrl === prevCardAvatar) {
            slot.avatarImageDataUrl = "";
          }
          saveGMSettings();
          updateUIWithNewName();
          renderPlayers();
          broadcastSharedRosterState();
          renderAISlotCardStatus(controls);
        });
      }

      if (controls.extraPromptArea) {
        controls.extraPromptArea.addEventListener("input", () => {
          slot.extraPrompt = controls.extraPromptArea.value;
          saveGMSettings();
        });
      }
    });

    if (narratorSendBtn && narratorMessageArea) {
      narratorSendBtn.addEventListener("click", () => {
        const text = narratorMessageArea.value.trim();
        if (!text) {
          showToast("El mensaje del narrador no puede estar vacío.", {
            type: "warning",
            duration: 3000,
          });
          return;
        }
        addMessage(text, "", { role: "narrator" });
        narratorMessageArea.value = "";
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
          sendWs({ type: "avatar_update", name: getGMName(), avatar: "" });
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          gmSettings.avatarImageDataUrl = e.target.result;
          saveGMSettings();
          sendWs({
            type: "avatar_update",
            name: getGMName(),
            avatar: e.target.result,
          });
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
          broadcastSharedRosterState();
          if (nameInput) {
            nameInput.value = getGMName() || "";
          }
          renderCardStatus();

          if (result.avatarDataUrl) {
            sendWs({
              type: "avatar_update",
              name: getGMName(),
              avatar: result.avatarDataUrl,
            });
          }

          showToast(`✅ Card cargada: ${result.cardName || "sin nombre"}`, {
            type: "success",
            duration: 4000,
          });
        } catch (err) {
          console.error("Error al cargar card:", err);
          if (gmCardStatus) {
            gmCardStatus.textContent =
              "Error al cargar la card. Usa PNG/WebP con metadata o JSON válido.";
          }
          showToast(
            "No se pudo leer la Character Card. Usa un PNG/WebP con metadata o un JSON válido.",
            { type: "danger", duration: 6000 },
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
        broadcastSharedRosterState();
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
        broadcastSharedRosterState();
      });
    }

    if (sylvieVisibleToggle) {
      sylvieVisibleToggle.addEventListener("change", () => {
        gmSettings.sylvieVisible = sylvieVisibleToggle.checked;
        saveGMSettings();
        renderPlayers();
        broadcastSharedRosterState();
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
          sendWs({ type: "avatar_update", name: SYLVIE_NAME, avatar: "" });
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          gmSettings.sylvieAvatarImageDataUrl = e.target.result;
          saveGMSettings();
          sendWs({
            type: "avatar_update",
            name: SYLVIE_NAME,
            avatar: e.target.result,
          });
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

    // Ocultar botón GM mientras el textarea tiene foco (evita tapar teclado en móvil)
    if (messageInput) {
      messageInput.addEventListener("focus", () => {
        const gmToggle = document.querySelector(".gm-toggle");
        const gmInner = document.querySelector(".gm-panel-inner");
        if (gmToggle) gmToggle.style.opacity = "0";
        if (gmInner) gmInner.classList.remove("open");
      });
      messageInput.addEventListener("blur", () => {
        const gmToggle = document.querySelector(".gm-toggle");
        if (gmToggle) gmToggle.style.opacity = "";
      });
    }

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

  // 10) Sincronizar reset global antes de abrir el historial local
  setConnectionStatus("reconnecting");
  activateNavigationGuard();
  ensureChatStateReady().finally(() => {
    connectWebSocket(player.name || "Viajero");
  });

  // La contraseña ya se pidió en el Pasaporte (login).
  // Aquí solo usamos el nombre para saber si mostramos el Panel GM.
});
