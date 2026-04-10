document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("login-form");
  const nameInput = document.getElementById("name");
  const historyInput = document.getElementById("history");
  const avatarInput = document.getElementById("avatar");
  const avatarPickBtn = document.getElementById("avatar-pick-btn");
  const avatarRequiredHint = document.getElementById("avatar-required-hint");
  const saveJsonBtn = document.getElementById("save-json");
  const loadJsonInput = document.getElementById("load-json");
  const passportEl = document.querySelector(".passport");
  const serialSpan = document.getElementById("passport-serial");

  const photoFrame = document.getElementById("photo-frame");
  const avatarPreview = document.getElementById("avatar-preview");
  const avatarPlaceholder = document.getElementById("avatar-placeholder");

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
  let gmAuthMode = null;
  let pendingPlayer = null;

  const API_BASE = resolveApiBase();
  const GM_AUTH_URL = API_BASE ? `${API_BASE}/api/gm-auth` : "";

  function resolveApiBase() {
    const raw = window.DWJC2_API_BASE || localStorage.getItem("dwjc2_api_base") || window.location.origin;
    return String(raw || "").replace(/\/+$/, "");
  }

  let avatarDataUrl = null;
  let editingAvatarDataUrl = null;
  let currentAvatarTransform = "";

  const cropState = { scale: 1, offsetX: 0, offsetY: 0 };

  if (avatarPickBtn) {
    avatarPickBtn.addEventListener("click", () => avatarInput && avatarInput.click());
  }

  function openGmAuthModal(mode) {
    if (!gmAuthOverlay || !gmAuthPasswordInput) return;
    gmAuthMode = mode;
    gmAuthOverlay.classList.add("open");
    gmAuthPasswordInput.value = "";
    if (gmAuthError) gmAuthError.textContent = "";
    if (gmAuthMessage) {
      if (mode === "cristal") {
        gmAuthMessage.textContent = "Este pasaporte está protegido. Introduce la contraseña para demostrar que eres realmente el creador del Draw World JC-2.";
      } else if (mode === "sylvie") {
        gmAuthMessage.textContent = "Este pasaporte pertenece y está sellado por la reina. Ninguna contraseña lo desbloqueará, por favor, intente otro nombre.";
      } else {
        gmAuthMessage.textContent = "Este pasaporte está protegido. Introduce la contraseña.";
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
    const lowerName = (pendingPlayer.name || "").toLowerCase().trim();
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
      finalizePassportAndGoChat(pendingPlayer);
    } catch (_) {
      if (gmAuthError) gmAuthError.textContent = "No se pudo contactar con el servidor. Intenta de nuevo.";
    }
  }

  if (gmAuthSubmitBtn) gmAuthSubmitBtn.addEventListener("click", handleGmAuthSubmit);
  if (gmAuthPasswordInput) {
    gmAuthPasswordInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); handleGmAuthSubmit(); } });
  }

  if (serialSpan) {
    let serial = localStorage.getItem("dwjc2_serial");
    if (!serial) {
      serial = `DW-JC2-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
      localStorage.setItem("dwjc2_serial", serial);
    }
    serialSpan.textContent = serial;
  }

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
      const reader = new FileReader();
      reader.onload = (e) => openCropper(e.target.result);
      reader.readAsDataURL(file);
    });
  }

  if (zoomInput) {
    zoomInput.addEventListener("input", () => {
      cropState.scale = parseFloat(zoomInput.value) || 1;
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
      updateCropTransform();
    });
    cropImage.addEventListener("pointerup", endDrag);
    cropImage.addEventListener("pointercancel", endDrag);
    cropImage.addEventListener("pointerleave", endDrag);
  }

  if (cancelCropBtn && cropOverlay) {
    cancelCropBtn.addEventListener("click", () => cropOverlay.classList.remove("open"));
  }

  if (applyCropBtn && cropOverlay && cropImage) {
    applyCropBtn.addEventListener("click", () => {
      cropOverlay.classList.remove("open");
      setAvatarPreview(editingAvatarDataUrl, cropImage.style.transform || "");
    });
  }

  if (saveJsonBtn) {
    saveJsonBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      const history = historyInput.value.trim();
      if (!name || !history) { alert("Primero completa al menos nombre e historia para guardar."); return; }
      const player = { name, history, avatarDataUrl, avatarTransform: currentAvatarTransform || null, serial: localStorage.getItem("dwjc2_serial") || null };
      const blob = new Blob([JSON.stringify(player, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `personaje-${name}.json`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    });
  }

  if (loadJsonInput) {
    loadJsonInput.addEventListener("change", () => {
      const file = loadJsonInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (data.name) nameInput.value = data.name;
          if (data.history) historyInput.value = data.history;
          if (data.avatarDataUrl) setAvatarPreview(data.avatarDataUrl, data.avatarTransform || "");
          if (data.serial && serialSpan) { serialSpan.textContent = data.serial; localStorage.setItem("dwjc2_serial", data.serial); }
          alert("Personaje cargado correctamente.");
        } catch (_) { alert("El archivo no es un JSON válido de personaje."); }
      };
      reader.readAsText(file);
    });
  }

  function finalizePassportAndGoChat(player) {
    localStorage.setItem("dwjc2_player", JSON.stringify(player));
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Entregando pasaporte..."; }
    if (!passportEl) { window.location.href = "chat.html"; return; }
    passportEl.classList.add("passport--approved");
    setTimeout(() => passportEl.classList.add("passport--closing"), 900);
    setTimeout(() => window.location.href = "chat.html", 3200);
    pendingPlayer = null;
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      const history = historyInput.value.trim();
      if (!name || !history) { alert("Por favor completa nombre e historia."); return; }
      if (!avatarDataUrl) {
        if (avatarRequiredHint) avatarRequiredHint.classList.add("visible");
        if (avatarPickBtn) avatarPickBtn.focus();
        return;
      }
      const serial = localStorage.getItem("dwjc2_serial") || null;
      const player = { name, history, avatarDataUrl, avatarTransform: currentAvatarTransform || null, serial, createdAt: new Date().toISOString() };
      const lowerName = name.toLowerCase().trim();
      if (lowerName === "cristal" || lowerName === "sylvie") {
        pendingPlayer = player;
        openGmAuthModal(lowerName);
        return;
      }
      finalizePassportAndGoChat(player);
    });
  }
});
