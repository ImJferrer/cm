// backend/server.js
import express from "express";
import cors from "cors";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import "dotenv/config";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GM_PASSWORD = process.env.GM_PASSWORD || "Sylv13";
const SYLVIE_HARD_PROMPT = (process.env.SYLVIE_HARD_PROMPT || "").trim();

if (!CEREBRAS_API_KEY) {
  console.warn("[warn] Falta CEREBRAS_API_KEY en .env");
}

if (!GEMINI_API_KEY) {
  console.warn("[warn] Falta GEMINI_API_KEY en .env (solo se usara Gemini si existe)");
}

if (!GM_PASSWORD) {
  console.warn("[warn] Falta GM_PASSWORD en .env (usando valor por defecto).");
}

if (!SYLVIE_HARD_PROMPT) {
  console.warn(
    "[warn] Falta SYLVIE_HARD_PROMPT en .env. Sylvie no tendra limites."
  );
}

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

function broadcast(payload, exceptWs) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client !== exceptWs && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

wss.on("connection", (ws) => {
  const clientId = makeClientId();
  const meta = { id: clientId, name: "Viajero" };
  wsClients.set(ws, meta);

  ws.send(JSON.stringify({ type: "welcome", clientId }));

  ws.on("message", (raw) => {
    let parsed;
    try {
      const text = typeof raw === "string" ? raw : raw.toString("utf-8");
      parsed = JSON.parse(text);
    } catch (_) {
      return;
    }

    if (!parsed || typeof parsed !== "object") return;

    if (parsed.type === "hello") {
      meta.name = safeString(parsed.name, 40) || "Viajero";
      return;
    }

    if (parsed.type === "chat" && parsed.message) {
      const msg = parsed.message || {};
      const text = safeString(msg.text, 4000);
      if (!text) return;

      const author = safeString(msg.author, 40) || meta.name || "Viajero";
      const time = safeString(msg.time, 12);
      const role = msg.role === "assistant" ? "assistant" : "user";

      broadcast(
        {
          type: "chat",
          senderId: clientId,
          message: { author, text, time, role },
        },
        ws
      );
    }
  });

  ws.on("close", () => {
    wsClients.delete(ws);
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
              content: `Jugador actual: ${playerName || "Viajero"}. Historia / trasfondo: ${
                playerHistory || "No se proporciono historia; tratalo como recien llegado."
              }. Si el jugador se llama Cristal, reconoce que es Cristal.`,
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

    const targetModel = normalizeModel(model) || "llama-3.3-70b";
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
    if (password === GM_PASSWORD) {
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
