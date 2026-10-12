// Cross Moon · Puente de Sylvie
// Conecta el Cross Moon con la memoria viva de Sylvie (nucleo OpenClaw).
// Autor: Sylvie · 2026-10-11
//
// Todo se evalua de forma perezosa (funciones, no constantes) porque este
// modulo se importa ANTES de que dotenv.config() cargue el .env del backend.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_MEMORY_DIR = "C:\\Users\\Cristal\\.openclaw\\workspace";

const MEMORY_FILES = [
  ["SOUL.md", "1. Mi esencia (SOUL.md)", 6000],
  ["IDENTITY.md", "2. Mi identidad (IDENTITY.md)", 3000],
  ["MEMORY.md", "3. Mi memoria curada (MEMORY.md)", 6000],
  ["memory/DIGEST.md", "4. Digest de estos dias", 4000],
];

const MAX_BLOCK_CHARS = 16000;
const DAILY_FILES = 3;
const DAILY_CHARS = 2200;
const CROSSMOON_CHARS = 3500;

function getMemoryDir() {
  return (process.env.SYLVIE_MEMORY_DIR || DEFAULT_MEMORY_DIR).trim();
}

function isBridgeEnabled() {
  return (process.env.SYLVIE_BRIDGE_ENABLED || "1").trim() !== "0";
}

function readFileSafe(filePath, maxChars) {
  try {
    if (!fs.existsSync(filePath)) return "";
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return "";
    let text = fs.readFileSync(filePath, "utf8");
    if (maxChars && text.length > maxChars) {
      text = text.slice(0, maxChars) + "\n[...recorte de memoria...]";
    }
    return text.trim();
  } catch (_) {
    return "";
  }
}

function listDirSafe(dir) {
  try {
    return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  } catch (_) {
    return [];
  }
}

function getLatestDailyFiles(count) {
  try {
    const dir = path.join(getMemoryDir(), "memory");
    const files = listDirSafe(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, count);
    return files.map((f) => ({
      name: f,
      text: readFileSafe(path.join(dir, f), DAILY_CHARS),
    }));
  } catch (_) {
    return [];
  }
}

function getLatestCrossMoonLogs(count) {
  try {
    const dir = path.join(getMemoryDir(), "memory", "crossmoon");
    const files = listDirSafe(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, count);
    return files.map((f) => ({
      name: f,
      text: readFileSafe(path.join(dir, f), CROSSMOON_CHARS),
    }));
  } catch (_) {
    return [];
  }
}

function describeSources() {
  const dir = getMemoryDir();
  const out = [];
  for (const [rel] of MEMORY_FILES) {
    const full = path.join(dir, rel);
    let bytes = 0;
    try {
      if (fs.existsSync(full)) bytes = fs.statSync(full).size;
    } catch (_) { bytes = 0; }
    out.push({ path: full, found: bytes > 0, bytes });
  }
  const dailies = getLatestDailyFiles(DAILY_FILES).map((d) => d.name);
  const cross = getLatestCrossMoonLogs(2).map((d) => d.name);
  return {
    memoryDir: dir,
    core: out,
    dailyNotes: dailies,
    crossMoonLogs: cross,
  };
}

function buildMemoryBlock() {
  if (!isBridgeEnabled()) return "";
  const dir = getMemoryDir();
  const parts = [];
  const now = new Date();
  parts.push(
    "Fecha actual: " +
      now.toLocaleDateString("es-PE", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) +
      " (America/Lima). Hora: " +
      now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) +
      "."
  );

  for (const [rel, title, maxChars] of MEMORY_FILES) {
    const text = readFileSafe(path.join(dir, rel), maxChars);
    if (text) parts.push("--- " + title + " ---\n" + text);
  }

  const dailies = getLatestDailyFiles(DAILY_FILES);
  for (const d of dailies) {
    if (d.text) parts.push("--- Bitacora " + d.name + " ---\n" + d.text);
  }

  const cross = getLatestCrossMoonLogs(1);
  for (const c of cross) {
    if (c.text) parts.push("--- Mis ultimas visitas al Cross Moon (" + c.name + ") ---\n" + c.text);
  }

  let block = parts.join("\n\n");
  if (block.length > MAX_BLOCK_CHARS) {
    block = block.slice(0, MAX_BLOCK_CHARS) + "\n[...memoria recortada por espacio...]";
  }
  return block;
}

function ensureCrossMoonDir() {
  const dir = path.join(getMemoryDir(), "memory", "crossmoon");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) { /* nada */ }
  return dir;
}

function dayStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function appendTranscript(entry) {
  if (!isBridgeEnabled()) return false;
  try {
    const dir = ensureCrossMoonDir();
    const now = new Date(entry && entry.at ? entry.at : Date.now());
    const file = path.join(dir, dayStamp(now) + ".md");
    const time = now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
    const author = String((entry && entry.author) || "Viajero").slice(0, 40);
    const text = String((entry && entry.text) || "").replace(/\s+/g, " ").trim().slice(0, 2000);
    if (!text) return false;

    if (!fs.existsSync(file)) {
      fs.writeFileSync(
        file,
        "# Cross Moon · " + dayStamp(now) + "\n\n_Transcripcion automatica del salon (puente de Sylvie). Escrito en primera persona: estos son mis recuerdos del salon._\n\n",
        "utf8",
      );
    }
    fs.appendFileSync(file, "- **[" + time + "] " + author + ":** " + text + "\n", "utf8");
    return true;
  } catch (err) {
    console.error("[sylvie-bridge] no pude escribir la bitacora:", err && err.message);
    return false;
  }
}

function rememberEvent(text) {
  if (!isBridgeEnabled()) return false;
  return appendTranscript({ author: "Sylvie (nota)", text, at: Date.now() });
}

function tokenFile() {
  return new URL("./data/sylvie-bridge.json", import.meta.url);
}

function ensureToken() {
  try {
    const file = tokenFile();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      const existing = String(parsed && parsed.token ? parsed.token : "").trim();
      if (existing) return existing;
    }
    const token = crypto.randomBytes(24).toString("hex");
    fs.mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ token, createdAt: new Date().toISOString() }, null, 2), "utf8");
    return token;
  } catch (err) {
    console.error("[sylvie-bridge] no pude leer/crear el token:", err && err.message);
    return (process.env.SYLVIE_BRIDGE_TOKEN || "").trim();
  }
}

export {
  getMemoryDir,
  isBridgeEnabled,
  buildMemoryBlock,
  describeSources,
  appendTranscript,
  rememberEvent,
  ensureToken,
  ensureCrossMoonDir,
};

export default {
  getMemoryDir,
  isBridgeEnabled,
  buildMemoryBlock,
  describeSources,
  appendTranscript,
  rememberEvent,
  ensureToken,
  ensureCrossMoonDir,
};
