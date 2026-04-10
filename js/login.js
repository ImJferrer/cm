// js/login.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("login-form");
  const nameInput = document.getElementById("name");
  const historyInput = document.getElementById("history");
  const avatarInput = document.getElementById("avatar");
  const saveJsonBtn = document.getElementById("save-json");
  const loadJsonInput = document.getElementById("load-json");
  const passportEl = document.querySelector(".passport");
  const serialSpan = document.getElementById("passport-serial");

  // Bloque de la foto en el pasaporte
  const photoFrame = document.getElementById("photo-frame");
  const avatarPreview = document.getElementById("avatar-preview");
  const avatarPlaceholder = document.getElementById("avatar-placeholder");

  // Overlay de recorte
  const cropOverlay = document.getElementById("avatar-crop-overlay");
  const cropImage = document.getElementById("avatar-crop-image");
  const zoomInput = document.getElementById("avatar-zoom");
  const cancelCropBtn = document.getElementById("avatar-cancel");
  const applyCropBtn = document.getElementById("avatar-apply");

    // 🔐 Modal de contraseña para pasaportes protegidos (Cristal / Sylvie)
  const gmAuthOverlay = document.getElementById("gm-auth-overlay");
  const gmAuthPasswordInput = document.getElementById("gm-auth-password");
  const gmAuthError = document.getElementById("gm-auth-error");
  const gmAuthMessage = document.getElementById("gm-auth-message");
  const gmAuthCancelBtn = document.getElementById("gm-auth-cancel");
  const gmAuthSubmitBtn = document.getElementById("gm-auth-submit");
  let gmAuthMode = null;       // "cristal" | "sylvie" | null
  let pendingPlayer = null;    // jugador que está intentando entrar (Cristal / Sylvie)

  const API_BASE = resolveApiBase();
  const GM_AUTH_URL = API_BASE ? `${API_BASE}/api/gm-auth` : "";

  function resolveApiBase() {
    const raw =
      window.DWJC2_API_BASE ||
      localStorage.getItem("dwjc2_api_base") ||
      window.location.origin;
    return String(raw || "").replace(/\/+$/, "");
  }


  let avatarDataUrl = null;            // imagen final (base64)
  let editingAvatarDataUrl = null;     // imagen que se está recortando
  let currentAvatarTransform = "";     // transform usado en el pasaporte

  // Estado del recorte
  const cropState = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };

    // ==============================
  //   MODAL GM AUTH (Cristal / Sylvie)
  // ==============================

  function openGmAuthModal(mode) {
    if (!gmAuthOverlay || !gmAuthPasswordInput) return;
    gmAuthMode = mode;

    gmAuthOverlay.classList.add("open");
    gmAuthPasswordInput.value = "";
    if (gmAuthError) gmAuthError.textContent = "";

    if (gmAuthMessage) {
      if (mode === "cristal") {
        gmAuthMessage.textContent =
          "Este pasaporte está protegido. Introduce la contraseña para demostrar que eres realmente el creador del Draw World JC-2.";
      } else if (mode === "sylvie") {
        gmAuthMessage.textContent =
          "Este pasaporte pertenece y está sellado por la reina. Ninguna contraseña lo desbloqueará, por favor, intente otro nombre.";
      } else {
        gmAuthMessage.textContent =
          "Este pasaporte está protegido. Introduce la contraseña.";
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
      pendingPlayer = null;
    });
  }

  if (gmAuthOverlay) {
    gmAuthOverlay.addEventListener("click", (e) => {
      if (e.target === gmAuthOverlay) {
        closeGmAuthModal();
        pendingPlayer = null;
      }
    });
  }

  async function handleGmAuthSubmit() {
    if (!gmAuthMode || !gmAuthPasswordInput || !pendingPlayer) return;
    const pwd = gmAuthPasswordInput.value.trim();

    if (!pwd) {
      if (gmAuthError) gmAuthError.textContent = "Ingresa una contraseña.";
      return;
    }

    const lowerName = (pendingPlayer.name || "").toLowerCase().trim();

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
              : "No se pudo validar la contraseña.";
        }
        return;
      }

      localStorage.setItem("dwjc2_gm_flag", "1");

      closeGmAuthModal();
      finalizePassportAndGoChat(pendingPlayer);
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


  // ==============================
  //   SERIAL DEL PASAPORTE
  // ==============================
  if (serialSpan) {
    let serial = localStorage.getItem("dwjc2_serial");

    if (!serial) {
      const random = Math.floor(Math.random() * 10000); // 0-9999
      const padded = String(random).padStart(4, "0");
      serial = `DW-JC2-${padded}`;
      localStorage.setItem("dwjc2_serial", serial);
    }

    serialSpan.textContent = serial;
  }

  // ==============================
  //   UTIL: APLICAR FOTO AL PASAPORTE
  // ==============================
  function setAvatarPreview(src, transform) {
    if (!avatarPreview || !photoFrame) return;

    avatarDataUrl = src;

    avatarPreview.src = src;
    avatarPreview.style.display = "block";
    photoFrame.classList.add("has-avatar");
    if (avatarPlaceholder) {
      avatarPlaceholder.style.display = "none";
    }

    if (transform) {
      currentAvatarTransform = transform;
      avatarPreview.style.transform = transform;
    } else if (currentAvatarTransform) {
      avatarPreview.style.transform = currentAvatarTransform;
    } else {
      avatarPreview.style.transform = "translate(0px, 0px) scale(1)";
    }
  }

  // ==============================
  //   CROP: ACTUALIZAR TRANSFORM
  // ==============================
  function updateCropTransform() {
    if (!cropImage) return;
    cropImage.style.transform = `translate(${cropState.offsetX}px, ${cropState.offsetY}px) scale(${cropState.scale})`;
  }

  // Abrir el recortador con una imagen dada
  function openCropper(dataUrl) {
    if (!cropOverlay || !cropImage || !zoomInput) {
      // fallback: si no existe el overlay, solo mostramos la imagen
      setAvatarPreview(dataUrl);
      return;
    }

    editingAvatarDataUrl = dataUrl;

    cropState.scale = 1;
    cropState.offsetX = 0;
    cropState.offsetY = 0;
    zoomInput.value = "1";
    updateCropTransform();

    cropImage.src = dataUrl;
    cropOverlay.classList.add("open");
  }

  // ==============================
  //   AVATAR: SUBIR IMAGEN
  // ==============================
  if (avatarInput) {
    avatarInput.addEventListener("change", () => {
      const file = avatarInput.files[0];
      if (!file) {
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target.result;
        openCropper(url);
      };
      reader.readAsDataURL(file);
    });
  }

  // ==============================
  //   CROP: CONTROLES (ZOOM + DRAG)
  // ==============================
  if (zoomInput) {
    zoomInput.addEventListener("input", () => {
      const value = parseFloat(zoomInput.value) || 1;
      cropState.scale = value;
      updateCropTransform();
    });
  }

if (cropImage) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try {
      cropImage.releasePointerCapture(e.pointerId);
    } catch (_) {}
    cropImage.style.cursor = "grab";
  };

  cropImage.addEventListener("pointerdown", (e) => {
    dragging = true;
    cropImage.setPointerCapture(e.pointerId);
    cropImage.style.cursor = "grabbing";
    startX = e.clientX;
    startY = e.clientY;
    baseX = cropState.offsetX;
    baseY = cropState.offsetY;
  });

  cropImage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    cropState.offsetX = baseX + dx;
    cropState.offsetY = baseY + dy;
    updateCropTransform();
  });

  cropImage.addEventListener("pointerup", endDrag);
  cropImage.addEventListener("pointercancel", endDrag);
  cropImage.addEventListener("pointerleave", endDrag);
}


  if (cancelCropBtn && cropOverlay) {
    cancelCropBtn.addEventListener("click", () => {
      cropOverlay.classList.remove("open");
      // no cambiamos nada si cancela
    });
  }

  if (applyCropBtn && cropOverlay && cropImage) {
    applyCropBtn.addEventListener("click", () => {
      cropOverlay.classList.remove("open");
      const transform = cropImage.style.transform || "";
      setAvatarPreview(editingAvatarDataUrl, transform);
      // si quieres guardar el transform para el JSON:
      currentAvatarTransform = transform;
    });
  }

  // ==============================
  //   GUARDAR PERSONAJE COMO JSON
  // ==============================
  if (saveJsonBtn) {
    saveJsonBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      const history = historyInput.value.trim();
      const serial = localStorage.getItem("dwjc2_serial") || null;

      if (!name || !history) {
        alert("Primero completa al menos nombre e historia para guardar.");
        return;
      }

      const player = {
        name,
        history,
        avatarDataUrl,
        avatarTransform: currentAvatarTransform || null,
        serial,
      };

      const blob = new Blob([JSON.stringify(player, null, 2)], {
        type: "application/json",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `personaje-${name || "avatar"}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // ==============================
  //   CARGAR PERSONAJE DESDE JSON
  // ==============================
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

          if (data.avatarDataUrl) {
            avatarDataUrl = data.avatarDataUrl;
            currentAvatarTransform = data.avatarTransform || "";
            setAvatarPreview(avatarDataUrl, currentAvatarTransform);
          }

          if (data.serial && serialSpan) {
            serialSpan.textContent = data.serial;
            localStorage.setItem("dwjc2_serial", data.serial);
          }

          alert("Personaje cargado correctamente.");
        } catch (err) {
          console.error(err);
          alert("El archivo no es un JSON válido de personaje.");
        }
      };
      reader.readAsText(file);
    });
  }

  // ==============================
  //   SUBMIT: SELLAR Y ENTREGAR PASAPORTE
  // ==============================
    // ==============================
  //   FUNCION: SELLAR Y ENTREGAR PASAPORTE
  // ==============================
  function finalizePassportAndGoChat(player) {
    // Guardamos en localStorage para usarlo en el chat
    localStorage.setItem("dwjc2_player", JSON.stringify(player));

    // Desactivar botón para evitar dobles clics
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Entregando pasaporte...";
    }

    // Si no encontramos el pasaporte por alguna razón, simplemente redirigimos
    if (!passportEl) {
      window.location.href = "chat.html";
      return;
    }

    // 1) Mostrar el sello de APROBADO
    passportEl.classList.add("passport--approved");

    // 2) Un poco después, cerrar el pasaporte
    setTimeout(() => {
      passportEl.classList.add("passport--closing");
    }, 900);

    // 3) Cuando termina la animación, pasamos al chat
    setTimeout(() => {
      window.location.href = "chat.html";
    }, 3200);

    // Limpiar estado temporal
    pendingPlayer = null;
  }

  // ==============================
  //   SUBMIT: SELLAR Y ENTREGAR PASAPORTE
  // ==============================
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const name = nameInput.value.trim();
      const history = historyInput.value.trim();
      const serial = localStorage.getItem("dwjc2_serial") || null;

      if (!name || !history) {
        alert("Por favor completa nombre e historia.");
        return;
      }

      const player = {
        name,
        history,
        avatarDataUrl,
        avatarTransform: currentAvatarTransform || null,
        serial,
        createdAt: new Date().toISOString(),
      };

      const lowerName = name.toLowerCase().trim();

      // 👑 Pasaportes protegidos: Cristal y Sylvie
      if (lowerName === "cristal" || lowerName === "sylvie") {
        pendingPlayer = player;
        openGmAuthModal(lowerName);
        // ⚠️ NO se sella ni se entra al chat hasta que pase por handleGmAuthSubmit()
        return;
      }

      // Pasaporte normal: se sella directamente
      finalizePassportAndGoChat(player);
    });
  }

});


