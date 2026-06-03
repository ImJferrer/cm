import express from "express";
import cors from "cors";
import http from "http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";

dotenv.config({ path: fileURLToPath(new URL("./.env", import.meta.url)) });

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const GM_PASSWORD = (process.env.GM_PASSWORD || "").trim();
const SYLVIE_HARD_PROMPT = (process.env.SYLVIE_HARD_PROMPT || "").trim();
const CHAT_STATE_FILE = new URL("./data/chat-state.json", import.meta.url);

app.use(cors());
app.use(express.json());

const wss = new WebSocketServer({ server, path: "/ws" });
const wsClients = new Map();

function makeClientId() {
  return Math.random().toString(36).slice(2, 10);
}

function safeString(value, maxLen) {
  if (value == null) return "";
  return String(value).slice(0, maxLen);
}

function makeChatVersion() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const AI_SLOT_KEYS = ["ai1", "ai2"];

function normalizeRosterState(raw = {}) {
  const rawSlots = Array.isArray(raw.aiSlots) ? raw.aiSlots : [];
  return {
    gmName: safeString(raw.gmName, 80).trim() || "...",
    gmVisible: raw.gmVisible !== false,
    gmEnabled: !!raw.gmEnabled,
    aiSlots: AI_SLOT_KEYS.map((key, index) => {
      const slot = rawSlots[index] || {};
      return {
        key,
        name: safeString(slot.name, 80).trim() || key.toUpperCase(),
        visible: !!slot.visible,
        enabled: !!slot.enabled,
      };
    }),
    sylvieVisible: raw.sylvieVisible !== false,
    sylvieEnabled: !!raw.sylvieEnabled,
  };
}

function loadChatState() {
  try {
    const raw = fs.readFileSync(CHAT_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const chatVersion = safeString(parsed?.chatVersion, 80).trim();
    if (chatVersion) {
      return {
        chatVersion,
        roster: normalizeRosterState(parsed?.roster),
      };
    }
  } catch (_) {}

  return {
    chatVersion: makeChatVersion(),
    roster: normalizeRosterState(),
  };
}

let chatState = loadChatState();

function saveChatState() {
  try {
    fs.mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
    fs.writeFileSync(CHAT_STATE_FILE, JSON.stringify(chatState, null, 2));
  } catch (err) {
    console.error("No se pudo guardar chat state:", err);
  }
}

saveChatState();

function broadcast(payload, exceptWs = null) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client !== exceptWs && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function updateRosterState(raw = {}) {
  chatState.roster = normalizeRosterState({
    ...chatState.roster,
    ...(raw || {}),
  });
  saveChatState();
  broadcast({ type: "roster_state", roster: chatState.roster });
  broadcastPlayerList();
  return chatState.roster;
}

function buildPlayerList() {
  return Array.from(wsClients.values())
    .filter((meta) => {
      const normalizedName = safeString(meta?.name, 40).trim().toLowerCase();
      if (!normalizedName) return true;
      if (chatState.roster.gmVisible === false && normalizedName === "cristal") {
        return false;
      }
      if (
        chatState.roster.sylvieVisible === false &&
        normalizedName === "sylvie"
      ) {
        return false;
      }
      return true;
    })
    .map((meta) => ({
      clientId: meta.id,
      name: meta.name,
      avatar: meta.avatar
    }));
}

function broadcastPlayerList() {
  broadcast({
    type: "player_list",
    players: buildPlayerList(),
    chatVersion: chatState.chatVersion,
    roster: chatState.roster,
  });
}

app.get("/api/chat-state", (_req, res) => {
  res.json({
    chatVersion: chatState.chatVersion,
    roster: chatState.roster,
  });
});

app.post("/api/chat-state/roster", (req, res) => {
  const requesterName = safeString(req.body?.name, 40).trim().toLowerCase();
  if (requesterName !== "cristal") {
    res.status(403).json({ error: "No autorizado." });
    return;
  }

  const roster = updateRosterState(req.body?.roster || {});
  res.json({ ok: true, roster });
});

wss.on("connection", (ws) => {
  const clientId = makeClientId();
  const meta = { id: clientId, name: "Viajero", avatar: null };
  wsClients.set(ws, meta);

  ws.send(JSON.stringify({
    type: "welcome",
    clientId,
    chatVersion: chatState.chatVersion,
    roster: chatState.roster,
  }));

  ws.on("message", (raw) => {
    let parsed;
    try {
      parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf-8"));
    } catch (_) { return; }

    if (!parsed || typeof parsed !== "object") return;

    if (parsed.type === "hello") {
      meta.name = safeString(parsed.name, 40) || "Viajero";
      if (parsed.avatar) meta.avatar = parsed.avatar;
      broadcast({ type: "presence", event: "join", clientId, name: meta.name });
      broadcastPlayerList();
      return;
    }

    if (parsed.type === "avatar_update") {
      broadcast({ type: "avatar_update", name: parsed.name, avatar: parsed.avatar });
      return;
    }

    if (parsed.type === "roster_state") {
      if (meta.name.toLowerCase() !== "cristal") return;
      updateRosterState(parsed.roster || {});
      return;
    }

    // ✅ NUEVO: Typing de IA (GM / Sylvie) visible para TODOS los jugadores
    if (parsed.type === "ai-typing") {
      broadcast({ type: "ai-typing", author: safeString(parsed.author, 40) });
      return;
    }

    if (parsed.type === "typing") {
      broadcast({ type: "typing", author: meta.name }, ws);
      return;
    }

    if (parsed.type === "reset_chat") {
      if (meta.name.toLowerCase() !== "cristal") return;
      chatState.chatVersion = makeChatVersion();
      saveChatState();
      broadcast({ type: "reset_chat", chatVersion: chatState.chatVersion });
      return;
    }

    if (parsed.type === "kick_all") {
      if (meta.name.toLowerCase() !== "cristal") return;
      broadcast({ type: "kicked" }, ws);
      return;
    }

    if (parsed.type === "stop-typing") {
      broadcast({ type: "stop-typing", author: meta.name });
      return;
    }

    if (parsed.type === "chat" && parsed.message) {
      broadcast({ type: "chat", message: parsed.message }, ws);
    }
  });

  ws.on("close", () => {
    const leaving = wsClients.get(ws);
    wsClients.delete(ws);
    if (leaving) {
      broadcast({ type: "presence", event: "leave", clientId: leaving.id, name: leaving.name });
      broadcastPlayerList();
    }
  });

  ws.on("error", (err) => {
    console.error("[ws] error:", err);
  });
});

function getEnvCharacters() {
  const res = [];
  const entries = Object.entries(process.env || {});
  entries.forEach(([key, value]) => {
    if (!value) return;
    if (key.startsWith("SYLVIE_CHAR_") || key.startsWith("CHAR_")) {
      const rawName = key
        .replace(/^SYLVIE_CHAR_/, "")
        .replace(/^CHAR_/, "")
        .replace(/_/g, " ")
        .trim();
      if (!rawName) return;
      res.push({
        name: rawName,
        description: String(value).trim(),
      });
    }
  });
  return res;
}

// Chat principal para cualquier voz (GM / Sylvie)
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, model, persona, gmRole, thinkEnabled } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res
        .status(400)
        .json({ error: "messages debe ser un array con el historial del chat" });
    }

    const apiMessages = [...messages];

    const playerName = (req.body?.player?.name || "").trim();
    const playerHistory = (req.body?.player?.history || "").trim();

    // Guardas de identidad: evitan que las voces se mezclen
    const identityGuards = [];
    const envCharacters = getEnvCharacters();
    if (persona === "sylvie") {
      identityGuards.push({
        role: "system",
        content:
          "Eres Sylvie, reina del Draw World JC-2. Hablas solo en primera persona como Sylvie. No eres el GM ni Frieren y no narras por otros personajes.",
      });
      if (SYLVIE_HARD_PROMPT) {
        identityGuards.push({ role: "system", content: SYLVIE_HARD_PROMPT });
      }
      if (envCharacters.length > 0) {
        const list = envCharacters
          .map((c) => `- ${c.name}: ${c.description}`)
          .join("\n");
        identityGuards.push({
          role: "system",
          content: `Personas conocidas para ti (Sylvie) proporcionadas por el .env:\n${list}`,
        });
      }
    } else if (persona === "gm") {
      identityGuards.push({
        role: "system",
        content:
          "Eres el GM del Draw World JC-2, pero eres una persona dentro del mundo: hablas en primera persona con tu propia vida, emociones y objetivos. No narras como voz externa. No pongas palabras ni acciones en boca de Sylvie, Cristal u otros jugadores; no tomes su rol.",
      });
    } else {
      identityGuards.push({
        role: "system",
        content:
          "Responde manteniendo tu rol actual y no suplantes a otros personajes de la partida.",
      });
    }

    const profilePrompt =
      playerName || playerHistory
        ? [
          {
            role: "system",
            content: [
              `=== PERFIL DEL JUGADOR: ${playerName || "Viajero"} ===`,
              `Descripción completa (apariencia, historia, origen, personalidad):`,
              playerHistory || "No se proporcionó historia; trátalo como un viajero recién llegado.",
              ``,
              `CÓMO USAR ESTE PERFIL EN TUS RESPUESTAS:`,
              `- Esta descripción define cómo luce, huele, se mueve y qué presencia tiene ${playerName || "el jugador"}.`,
              `- Puedes notar su apariencia (color de ojos, cabello, ropa, complexión, marcas) cuando la escena lo haga natural: al verlo entrar, al mirarlo de cerca, al reaccionar a su presencia.`,
              `- Si la descripción sugiere un aroma, fragancia o olor (por su ropa, origen, flores, naturaleza, perfume), puedes percibirlo sutilmente cuando estés cerca físicamente de él/ella.`,
              `- Puedes notar su forma de moverse, su postura, su voz o su energía/aura cuando la situación lo amerite.`,
              `- NO menciones estos detalles en cada respuesta. Varía: a veces el cabello, a veces los ojos, a veces el olor, a veces el movimiento. Que se sienta espontáneo, no mecánico.`,
              `- En un primer encuentro o reencuentro puedes hacer una observación más completa. En intercambios rutinarios, elige solo un rasgo si corresponde.`,
              `- Si el jugador se llama Cristal, reconoce que es Cristal.`,
              `=== FIN DEL PERFIL ===`,
            ].join("\n"),
          },
        ]
        : [];

    // Ajuste de personaje del GM (villano, heroe, random, etc.)
    const resolvedGmRole =
      !gmRole || gmRole === "random"
        ? "elige en cada turno un rol interesante (villano, heroe, mentor o aliado misterioso) y mantenlo durante la escena"
        : gmRole;
    const gmRoleGuard =
      persona === "gm"
        ? [
          {
            role: "system",
            content: `Interpreta vividamente el rol de: ${resolvedGmRole}. Habla como personaje activo, con acciones y dialogo, no solo comentarios meta.`,
          },
        ]
        : [];

    const targetModel = normalizeModel(model) || "deepseek-v4-flash";
    const isQwen = /^qwen-3-32b/i.test(targetModel);
    const allowThinking = !!thinkEnabled;

    // Ajuste para /no_think en Qwen (desactiva reasoning por defecto si no está habilitado)
    const finalMessages = [...identityGuards, ...gmRoleGuard, ...profilePrompt, ...apiMessages];
    if (isQwen && !allowThinking) {
      let lastUserIndex = -1;
      for (let i = finalMessages.length - 1; i >= 0; i--) {
        if ((finalMessages[i].role || "user") === "user") {
          lastUserIndex = i;
          break;
        }
      }
      if (lastUserIndex >= 0) {
        finalMessages[lastUserIndex] = {
          ...finalMessages[lastUserIndex],
          content: `${finalMessages[lastUserIndex].content || ""} /no_think`.trim(),
        };
      } else {
        finalMessages.push({ role: "user", content: "/no_think" });
      }
    }

    const payload = {
      model: targetModel,
      stream: false,
      messages: finalMessages,
      temperature: isQwen ? (thinkEnabled ? 0.6 : 0.8) : 0.8,
      max_tokens: 400,
      top_p: 0.95,
      seed: 0,
    };
    const useGoogle = /^gemini[-_]/i.test(targetModel);
    const useDeepseek = /^deepseek-/i.test(targetModel);

    if (useDeepseek) {
      if (!DEEPSEEK_API_KEY) {
        return res.status(500).json({ error: "Falta DEEPSEEK_API_KEY para usar modelos DeepSeek" });
      }

      const deepseekRes = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: targetModel,
          stream: false,
          messages: finalMessages,
          temperature: 0.8,
          max_tokens: 400,
        }),
      });

      if (!deepseekRes.ok) {
        const text = await deepseekRes.text();
        console.error("Error de DeepSeek:", deepseekRes.status, text);
        return res.status(500).json({ error: "Fallo al contactar con DeepSeek", detail: text });
      }

      const data = await deepseekRes.json();
      const reply = data?.choices?.[0]?.message?.content?.trim() || "Me quede pensando un segundo, continuo...";
      return res.json({ reply });
    }

    if (useGoogle) {
      if (!GEMINI_API_KEY) {
        return res
          .status(500)
          .json({ error: "Falta GEMINI_API_KEY para usar modelos Gemini" });
      }

      const { googlePayload, error } = buildGooglePayload(
        targetModel,
        finalMessages
      );
      if (error) {
        return res.status(400).json({ error });
      }

      const googleRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(googlePayload),
        }
      );

      if (!googleRes.ok) {
        const text = await googleRes.text();
        console.error("Error de Google:", googleRes.status, text);
        return res
          .status(500)
          .json({ error: "Fallo al contactar con Gemini", detail: text });
      }

      const data = await googleRes.json();
      const reply =
        data?.candidates?.[0]?.content?.parts
          ?.map((p) => p?.text || "")
          .join(" ")
          .trim() || "Me quede pensando un segundo, continuo...";

      return res.json({ reply });
    }

    // Cerebras (por defecto)
    const cerebrasRes = await fetch(
      "https://api.cerebras.ai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CEREBRAS_API_KEY}`,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!cerebrasRes.ok) {
      const text = await cerebrasRes.text();
      console.error("Error de Cerebras:", cerebrasRes.status, text);
      return res
        .status(500)
        .json({ error: "Fallo al contactar con la IA", detail: text });
    }

    const data = await cerebrasRes.json();
    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      "Me quede pensando un segundo, continuo...";

    res.json({ reply });
  } catch (err) {
    console.error("Error en /api/chat:", err);
    res.status(500).json({ error: "Error interno en el servidor de rol" });
  }
});

// Autenticacion de pasaportes especiales (Cristal / Sylvie)
app.post("/api/gm-auth", (req, res) => {
  const { name, password } = req.body || {};

  if (!name || !password) {
    return res
      .status(400)
      .json({ error: "name y password son obligatorios." });
  }

  const lower = String(name).toLowerCase().trim();

  // Solo Cristal puede desbloquear poderes de GM
  if (lower === "cristal") {
    if (!GM_PASSWORD) {
      return res.status(503).json({ error: "Falta configurar GM_PASSWORD en el servidor." });
    }
    if (String(password).trim() === GM_PASSWORD) {
      return res.json({ ok: true, role: "gm" });
    }
    return res.status(401).json({ error: "Contrasena incorrecta." });
  }

  // Sylvie siempre esta protegida: nunca acepta ninguna contrasena
  if (lower === "sylvie") {
    return res.status(401).json({
      error:
        "Este pasaporte esta sellado por Sylvie. Ninguna contrasena es valida.",
    });
  }

  // Cualquier otro nombre no tiene poderes especiales
  return res
    .status(403)
    .json({ error: "Este pasaporte no tiene poderes especiales." });
});

server.listen(PORT, () => {
  console.log(`Servidor de rol escuchando en http://localhost:${PORT}`);
});

// Helpers
function buildGooglePayload(model, messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { error: "No hay mensajes para enviar a Gemini" };
  }

  const systemParts = [];
  const contents = [];

  messages.forEach((msg) => {
    const role = msg.role || "user";
    const text = msg.content || "";

    if (!text || typeof text !== "string") return;

    if (role === "system") {
      systemParts.push(text);
      return;
    }

    contents.push({
      role: role === "assistant" ? "model" : "user",
      parts: [{ text }],
    });
  });

  if (contents.length === 0) {
    return { error: "No hay mensajes de usuario/asistente para Gemini" };
  }

  const payload = {
    contents,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 400,
      topP: 0.95,
    },
    tools: [{ googleSearch: {} }],
  };

  if (systemParts.length > 0) {
    payload.systemInstruction = {
      role: "system",
      parts: [{ text: systemParts.join("\n") }],
    };
  }

  return { googlePayload: payload };
}

function normalizeModel(model) {
  if (!model) return "";
  return String(model).replace(/\s*\(.*?\)\s*/g, "").trim();
}