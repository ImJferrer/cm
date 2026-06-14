document.addEventListener("DOMContentLoaded", () => {
  /* ──────────────────────────────────────────────
     DOM ELEMENTS
     ────────────────────────────────────────────── */
  const form = document.getElementById("login-form");
  const nameInput = document.getElementById("name");
  const genderInput = document.getElementById("gender");
  const heightInput = document.getElementById("height");
  const ageInput = document.getElementById("age");
  const phraseInput = document.getElementById("phrase");
  const appearanceInput = document.getElementById("appearance");
  const historyInput = document.getElementById("history");
  const avatarInput = document.getElementById("avatar");
  const avatarPickBtn = document.getElementById("avatar-pick-btn");
  const avatarRequiredHint = document.getElementById("avatar-required-hint");
  const saveJsonBtn = document.getElementById("save-json");
  const loadJsonInput = document.getElementById("load-json");
  const credentialCard = document.getElementById("credential-card");

  const photoFrame = document.getElementById("photo-frame");
  const avatarPreview = document.getElementById("avatar-preview");
  const avatarPlaceholder = document.getElementById("avatar-placeholder");
  const credThumbImg = document.getElementById("cred-thumb-img");
  const credThumbPlaceholder = document.getElementById("cred-thumb-placeholder");

  const cropOverlay = document.getElementById("avatar-crop-overlay");
  const cropImage = document.getElementById("avatar-crop-image");
  const zoomInput = document.getElementById("avatar-zoom");
  const cancelCropBtn = document.getElementById("avatar-cancel");
  const applyCropBtn = document.getElementById("avatar-apply");

  const gmAuthOverlay = document.getElementById("gm-auth-overlay");
  const gmAuthPasswordInput = document.getElementById("gm-auth-password");
  const gmAuthError = document.getElementById("gm-auth-error");
  const gmAuthMessage = document.getElementById("gm-auth-message");
  const gmAuthCancelBtn = document.getElementById("gm-auth-cancel");
  const gmAuthSubmitBtn = document.getElementById("gm-auth-submit");

  const credDwEl = document.getElementById("cred-dw");
  const credCmEl = document.getElementById("cred-cm");
  const countryCodeEl = document.getElementById("country-code");
  const userCountryEl = document.getElementById("user-country");
  const mrzDynamicEl = document.getElementById("mrz-dynamic");

  let gmAuthMode = null;
  let pendingPlayer = null;

  const API_BASE = resolveApiBase();
  const GM_AUTH_URL = API_BASE ? `${API_BASE}/api/gm-auth` : "";

  function resolveApiBase() {
    const raw = window.DWJC2_API_BASE || localStorage.getItem("dwjc2_api_base") || window.location.origin;
    return String(raw || "").replace(/\/+$/, "");
  }

  /* ──────────────────────────────────────────────
     TOAST SYSTEM
     ────────────────────────────────────────────── */
  function showPassportToast(msg, { type = "info", duration = 4000 } = {}) {
    const existing = document.getElementById("passport-toast");
    if (existing) existing.remove();
    const t = document.createElement("div");
    t.id = "passport-toast";
    t.className = `passport-toast passport-toast--${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("passport-toast--in"));
    if (duration > 0) {
      setTimeout(() => {
        t.classList.remove("passport-toast--in");
        t.addEventListener("transitionend", () => t.remove(), { once: true });
      }, duration);
    }
  }

  /* ──────────────────────────────────────────────
     AVATAR STATE
     ────────────────────────────────────────────── */
  let avatarDataUrl = null;
  let editingAvatarDataUrl = null;
  let currentAvatarTransform = "";

  const cropState = { scale: 1, offsetX: 0, offsetY: 0 };
  const AVATAR_MAX_SIZE = 900;
  const AVATAR_JPEG_QUALITY = 0.82;

  function normalizeName(value) {
    return String(value || "").toLowerCase().trim();
  }

  /* ──────────────────────────────────────────────
     IP-BASED ID GENERATION (DW + CM)
     ────────────────────────────────────────────── */

  /**
   * Simple string hash → positive integer
   */
  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32-bit int
    }
    return Math.abs(hash);
  }

  /**
   * Generate a DW-XXXX-XXXX identifier from IP (persistent)
   */
  function generateDW(ip) {
    const h = hashString("dw-" + ip);
    const part1 = String(h % 10000).padStart(4, "0");
    const part2 = String(Math.abs((h >>> 12) ^ (h >>> 4)) % 10000).padStart(4, "0");
    return `DW-${part1}-${part2}`;
  }

  /**
   * Generate a CM-XXXX-XXXX identifier from IP + session (per session)
   */
  function generateCM(ip) {
    const sessionSalt = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const h = hashString("cm-" + ip + "-" + sessionSalt);
    const part1 = String(h % 10000).padStart(4, "0");
    const part2 = String(Math.abs((h >>> 12) ^ (h >>> 4)) % 10000).padStart(4, "0");
    return `CM-${part1}-${part2}`;
  }

  /**
   * Fetch IP info and populate DW, CM, Country Code
   */
  async function populateIPData() {
    try {
      const res = await fetch("https://apip.cc/json");
      if (!res.ok) return;
      const data = await res.json();
      if (data.status !== "success") return;

      const ip = data.IP || data.ip || "";

      // Country code (3-letter if available, else 2-letter)
      const countryCode = data.CountryCode || data.countryCode || "---";
      if (countryCodeEl) countryCodeEl.textContent = countryCode;

      // Country full name for header
      const countryName = data.CountryName || data.CountryCode || data.ContinentName || "Real World";
      if (userCountryEl) userCountryEl.textContent = countryName;

      // DW: persistent per IP
      let dw = localStorage.getItem("dwjc2_dw");
      const storedIP = localStorage.getItem("dwjc2_ip");
      if (!dw || storedIP !== ip) {
        dw = generateDW(ip);
        localStorage.setItem("dwjc2_dw", dw);
        localStorage.setItem("dwjc2_ip", ip);
      }
      if (credDwEl) credDwEl.textContent = dw;

      // CM: per session
      let cm = sessionStorage.getItem("dwjc2_cm");
      if (!cm) {
        cm = generateCM(ip);
        sessionStorage.setItem("dwjc2_cm", cm);
      }
      if (credCmEl) credCmEl.textContent = cm;

      if (mrzDynamicEl) {
        const safeCm = cm.replace(/-/g, "");
        const safeDw = dw.replace(/-/g, "");
        mrzDynamicEl.textContent = `${safeCm}<9${safeDw}<<<<<<<<<<<<<<<<<<02`;
      }

    } catch (_) {
      // Fallback: generate random IDs if API fails
      if (!localStorage.getItem("dwjc2_dw")) {
        const fallbackDW = `DW-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
        localStorage.setItem("dwjc2_dw", fallbackDW);
      }
      const fallbackDWValue = localStorage.getItem("dwjc2_dw");
      if (credDwEl) credDwEl.textContent = fallbackDWValue;

      if (!sessionStorage.getItem("dwjc2_cm")) {
        const fallbackCM = `CM-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
        sessionStorage.setItem("dwjc2_cm", fallbackCM);
      }
      const fallbackCMValue = sessionStorage.getItem("dwjc2_cm");
      if (credCmEl) credCmEl.textContent = fallbackCMValue;

      if (mrzDynamicEl) {
        const safeCm = fallbackCMValue.replace(/-/g, "");
        const safeDw = fallbackDWValue.replace(/-/g, "");
        mrzDynamicEl.textContent = `${safeCm}<9${safeDw}<<<<<<<<<<<<<<<<<<02`;
      }
    }
  }

  // Initialize IDs on load
  populateIPData();

  /* ──────────────────────────────────────────────
     IMAGE COMPRESSION
     ────────────────────────────────────────────── */
  function compressImageDataUrl(dataUrl, maxSize = AVATAR_MAX_SIZE, quality = AVATAR_JPEG_QUALITY) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        if (!width || !height) {
          reject(new Error("invalid-image-size"));
          return;
        }

        const scale = Math.min(1, maxSize / Math.max(width, height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas-unavailable"));
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("image-load-failed"));
      img.src = dataUrl;
    });
  }

  /* ──────────────────────────────────────────────
     AVATAR PREVIEW & MINI B&W THUMBNAIL
     ────────────────────────────────────────────── */
  function setAvatarPreview(src, transform) {
    if (!avatarPreview || !photoFrame) return;
    avatarDataUrl = src;
    avatarPreview.src = src;
    avatarPreview.style.display = "block";
    photoFrame.classList.add("has-avatar");
    if (avatarPlaceholder) avatarPlaceholder.style.display = "none";
    if (avatarPickBtn) avatarPickBtn.textContent = "✅ Foto seleccionada";
    if (avatarRequiredHint) avatarRequiredHint.classList.remove("visible");
    const t = transform || currentAvatarTransform || "translate(0px, 0px) scale(1)";
    currentAvatarTransform = t;
    avatarPreview.style.transform = t;

    // Update B&W mini thumbnail
    if (credThumbImg) {
      credThumbImg.src = src;
      credThumbImg.style.display = "block";
      
      let thumbTransform = t;
      const match = t.match(/translate\(([-0-9.]+)px,\s*([-0-9.]+)px\)\s*scale\(([-0-9.]+)\)/);
      if (match) {
        const x = parseFloat(match[1]) * 0.5;
        const y = parseFloat(match[2]) * 0.5;
        const s = parseFloat(match[3]);
        thumbTransform = `translate(${x}px, ${y}px) scale(${s})`;
      }
      credThumbImg.style.transform = thumbTransform;
    }
    if (credThumbPlaceholder) {
      credThumbPlaceholder.style.display = "none";
    }
  }

  /* ──────────────────────────────────────────────
     AVATAR PICK & CROP
     ────────────────────────────────────────────── */
  if (avatarPickBtn) {
    avatarPickBtn.addEventListener("click", () => avatarInput && avatarInput.click());
  }

  // Also allow clicking photo frame to pick
  if (photoFrame) {
    photoFrame.addEventListener("click", () => avatarInput && avatarInput.click());
  }

  function updateCropTransform() {
    if (!cropImage) return;
    cropImage.style.transform = `translate(${cropState.offsetX}px, ${cropState.offsetY}px) scale(${cropState.scale})`;
  }

  function openCropper(dataUrl) {
    if (!cropOverlay || !cropImage || !zoomInput) { setAvatarPreview(dataUrl); return; }
    editingAvatarDataUrl = dataUrl;
    cropState.scale = 1; cropState.offsetX = 0; cropState.offsetY = 0;
    zoomInput.value = "1";
    updateCropTransform();
    cropImage.src = dataUrl;
    cropOverlay.classList.add("open");
  }

  if (avatarInput) {
    avatarInput.addEventListener("change", () => {
      const file = avatarInput.files[0];
      if (!file) return;
      if (!file.type || !file.type.startsWith("image/")) {
        avatarInput.value = "";
        showPassportToast("Selecciona un archivo de imagen válido.", { type: "warning" });
        return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const compressed = await compressImageDataUrl(e.target.result);
          openCropper(compressed);
        } catch (_) {
          avatarInput.value = "";
          showPassportToast("No se pudo procesar la imagen. Prueba con otra foto.", { type: "warning" });
        }
      };
      reader.onerror = () => {
        avatarInput.value = "";
        showPassportToast("No se pudo leer la imagen seleccionada.", { type: "warning" });
      };
      reader.readAsDataURL(file);
    });
  }

  function constrainCropState() {
    const frameW = 140;
    const frameH = 180;
    const scale = cropState.scale;
    const maxOffsetX = (frameW * scale - frameW) / 2;
    const maxOffsetY = (frameH * scale - frameH) / 2;
    
    if (scale > 1) {
      cropState.offsetX = Math.max(-maxOffsetX, Math.min(cropState.offsetX, maxOffsetX));
      cropState.offsetY = Math.max(-maxOffsetY, Math.min(cropState.offsetY, maxOffsetY));
    } else {
      cropState.offsetX = 0;
      cropState.offsetY = 0;
    }
  }

  if (zoomInput) {
    zoomInput.addEventListener("input", () => {
      cropState.scale = parseFloat(zoomInput.value) || 1;
      constrainCropState();
      updateCropTransform();
    });
  }

  if (cropImage) {
    let dragging = false, startX = 0, startY = 0, baseX = 0, baseY = 0;
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      try { cropImage.releasePointerCapture(e.pointerId); } catch (_) {}
      cropImage.style.cursor = "grab";
    };
    cropImage.addEventListener("pointerdown", (e) => {
      dragging = true;
      cropImage.setPointerCapture(e.pointerId);
      cropImage.style.cursor = "grabbing";
      startX = e.clientX; startY = e.clientY;
      baseX = cropState.offsetX; baseY = cropState.offsetY;
    });
    cropImage.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      cropState.offsetX = baseX + (e.clientX - startX);
      cropState.offsetY = baseY + (e.clientY - startY);
      constrainCropState();
      updateCropTransform();
    });
    cropImage.addEventListener("pointerup", endDrag);
    cropImage.addEventListener("pointercancel", endDrag);
    cropImage.addEventListener("pointerleave", endDrag);
  }

  if (cancelCropBtn && cropOverlay) {
    cancelCropBtn.addEventListener("click", () => {
      cropOverlay.classList.remove("open");
      editingAvatarDataUrl = null;
      if (avatarInput) avatarInput.value = "";
    });
  }

  if (applyCropBtn && cropOverlay && cropImage) {
    applyCropBtn.addEventListener("click", () => {
      cropOverlay.classList.remove("open");
      
      // Bake the crop into a canvas to avoid mobile CSS transform bugs
      const canvas = document.createElement("canvas");
      canvas.width = 140 * 2; // retina resolution
      canvas.height = 180 * 2;
      const ctx = canvas.getContext("2d");
      
      const imgNaturalW = cropImage.naturalWidth;
      const imgNaturalH = cropImage.naturalHeight;
      const frameRatio = 140 / 180;
      const imgRatio = imgNaturalW / imgNaturalH;
      
      let renderW, renderH;
      if (imgRatio > frameRatio) {
        renderH = 180;
        renderW = 180 * imgRatio;
      } else {
        renderW = 140;
        renderH = 140 / imgRatio;
      }
      
      const coverOffsetX = (140 - renderW) / 2;
      const coverOffsetY = (180 - renderH) / 2;
      
      ctx.save();
      ctx.scale(2, 2);
      ctx.translate(70, 90);
      ctx.translate(cropState.offsetX, cropState.offsetY);
      ctx.scale(cropState.scale, cropState.scale);
      ctx.translate(-70, -90);
      ctx.drawImage(cropImage, coverOffsetX, coverOffsetY, renderW, renderH);
      ctx.restore();
      
      const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.9);
      
      // Apply the pre-cropped image with no CSS transform
      setAvatarPreview(croppedDataUrl, "translate(0px, 0px) scale(1)");
      
      editingAvatarDataUrl = null;
      if (avatarInput) avatarInput.value = "";
    });
  }

  /* ──────────────────────────────────────────────
     GM AUTH MODAL
     ────────────────────────────────────────────── */
  function openGmAuthModal(mode) {
    if (!gmAuthOverlay || !gmAuthPasswordInput) return;
    gmAuthMode = mode;
    gmAuthOverlay.classList.add("open");
    gmAuthPasswordInput.value = "";
    if (gmAuthError) gmAuthError.textContent = "";
    if (gmAuthMessage) {
      if (mode === "cristal") {
        gmAuthMessage.textContent = "Esta credencial está protegida. Introduce la contraseña para demostrar que eres realmente el creador del Draw World JC-2.";
      } else if (mode === "sylvie") {
        gmAuthMessage.textContent = "Esta credencial pertenece y está sellada por la reina. Ninguna contraseña la desbloqueará, por favor, intente otro nombre.";
      } else {
        gmAuthMessage.textContent = "Esta credencial está protegida. Introduce la contraseña.";
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
    gmAuthCancelBtn.addEventListener("click", () => { closeGmAuthModal(); pendingPlayer = null; });
  }

  if (gmAuthOverlay) {
    gmAuthOverlay.addEventListener("click", (e) => {
      if (e.target === gmAuthOverlay) { closeGmAuthModal(); pendingPlayer = null; }
    });
  }

  async function handleGmAuthSubmit() {
    if (!gmAuthMode || !gmAuthPasswordInput || !pendingPlayer) return;
    const pwd = gmAuthPasswordInput.value.trim();
    if (!pwd) { if (gmAuthError) gmAuthError.textContent = "Ingresa una contraseña."; return; }
    const lowerName = normalizeName(pendingPlayer.name);
    if (gmAuthSubmitBtn) gmAuthSubmitBtn.disabled = true;
    if (gmAuthError) gmAuthError.textContent = "";
    try {
      const res = await fetch(GM_AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: lowerName, password: pwd }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (gmAuthError) gmAuthError.textContent = data?.error || "No se pudo validar la contraseña.";
        return;
      }
      localStorage.setItem("dwjc2_gm_flag", "1");
      closeGmAuthModal();
      finalizeAndGoChat(pendingPlayer);
    } catch (_) {
      if (gmAuthError) gmAuthError.textContent = "No se pudo contactar con el servidor. Intenta de nuevo.";
    } finally {
      if (gmAuthSubmitBtn) gmAuthSubmitBtn.disabled = false;
    }
  }

  if (gmAuthSubmitBtn) gmAuthSubmitBtn.addEventListener("click", handleGmAuthSubmit);
  if (gmAuthPasswordInput) {
    gmAuthPasswordInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); handleGmAuthSubmit(); } });
  }

  /* ──────────────────────────────────────────────
     SAVE / LOAD JSON
     ────────────────────────────────────────────── */
  if (saveJsonBtn) {
    saveJsonBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      const history = historyInput.value.trim();
      if (!name || !history) {
        showPassportToast("Primero completa al menos nombre e historia para guardar.", { type: "warning" });
        return;
      }
      const player = {
        name,
        gender: genderInput.value.trim(),
        height: heightInput.value.trim(),
        age: ageInput.value.trim(),
        phrase: phraseInput.value.trim(),
        appearance: appearanceInput.value.trim(),
        history,
        avatarDataUrl,
        avatarTransform: currentAvatarTransform || null,
        serial: localStorage.getItem("dwjc2_dw") || null,
        dw: localStorage.getItem("dwjc2_dw") || null,
      };
      const blob = new Blob([JSON.stringify(player, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `personaje-${name}.json`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      showPassportToast("✅ Personaje guardado correctamente.", { type: "success" });
    });
  }

  if (loadJsonInput) {
    loadJsonInput.addEventListener("change", () => {
      const file = loadJsonInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (data.name) nameInput.value = data.name;
          if (data.gender) genderInput.value = data.gender;
          if (data.height) heightInput.value = data.height;
          if (data.age) ageInput.value = data.age;
          if (data.phrase) phraseInput.value = data.phrase;
          if (data.appearance) appearanceInput.value = data.appearance;
          if (data.history) historyInput.value = data.history;
          if (data.avatarDataUrl) {
            const compressedAvatar = await compressImageDataUrl(data.avatarDataUrl);
            setAvatarPreview(compressedAvatar, data.avatarTransform || "");
          }
          showPassportToast("✅ Personaje cargado correctamente.", { type: "success" });
        } catch (_) {
          showPassportToast("El archivo no es un JSON válido de personaje.", { type: "warning" });
        }
      };
      reader.readAsText(file);
    });
  }

  /* ──────────────────────────────────────────────
     FINALIZE & GO TO CHAT
     ────────────────────────────────────────────── */
  function finalizeAndGoChat(player) {
    try {
      localStorage.setItem("dwjc2_player", JSON.stringify(player));
      if (normalizeName(player?.name) !== "cristal") {
        localStorage.removeItem("dwjc2_gm_flag");
      }
    } catch (_) {
      showPassportToast("No se pudo guardar la credencial. Usa una imagen más ligera e inténtalo otra vez.", {
        type: "warning",
        duration: 6000,
      });
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Procesando ingreso..."; }
    if (!credentialCard) { window.location.href = "chat.html"; return; }

    credentialCard.classList.add("credential-card--approved");
    setTimeout(() => credentialCard.classList.add("credential-card--closing"), 500);
    setTimeout(() => window.location.href = "chat.html", 1800);
    pendingPlayer = null;
  }

  /* ──────────────────────────────────────────────
     FORM SUBMISSION
     ────────────────────────────────────────────── */
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      const gender = genderInput.value.trim();
      const height = heightInput.value.trim();
      const age = ageInput.value.trim();
      const phrase = phraseInput.value.trim();
      const appearance = appearanceInput.value.trim();
      const history = historyInput.value.trim();

      if (!name || !gender || !height || !age || !phrase || !appearance || !history) {
        showPassportToast("Por favor completa todos los campos de la credencial.", { type: "warning" });
        return;
      }
      if (!avatarDataUrl) {
        if (avatarRequiredHint) avatarRequiredHint.classList.add("visible");
        if (avatarPickBtn) avatarPickBtn.focus();
        return;
      }

      const dw = localStorage.getItem("dwjc2_dw") || null;
      const cm = sessionStorage.getItem("dwjc2_cm") || null;

      const player = {
        name,
        gender,
        height,
        age,
        phrase,
        appearance,
        history,
        avatarDataUrl,
        avatarTransform: currentAvatarTransform || null,
        serial: dw,   // backward-compatible with chat.js
        dw,
        cm,
        countryCode: countryCodeEl ? countryCodeEl.textContent : "---",
        createdAt: new Date().toISOString(),
      };

      const lowerName = normalizeName(name);
      if (lowerName === "cristal" || lowerName === "sylvie") {
        pendingPlayer = player;
        openGmAuthModal(lowerName);
        return;
      }
      finalizeAndGoChat(player);
    });
  }
});
