// ─── WHO AM I? ───────────────────────────────────────────────────
// CRITICAL: Do NOT read mk_user at module load time.
// safetyCode.js always clears it on page load and only sets it after
// the Firebase ID token is fetched. We wait for 'mk_user_ready' so
// WHO is always correct, never a stale value from a previous session.
const SENDER_DISPLAY = { mikica: "Микица", kikica: "Кикица" };
const AVATARS = { mikica: "💙", kikica: "💗" };
const CHAT_ID = "mikica_kikica_chat";

window.addEventListener(
  "mk_user_ready",
  function (e) {
    initChat(e.detail.who);
  },
  { once: true },
);

function initChat(WHO) {
  console.log("✅ Chat initialised as:", WHO);

  const _partnerName = WHO === "mikica" ? "Кикица 💗" : "Микица 💙";
  const _hdrEl = document.getElementById("header-name");
  if (_hdrEl) _hdrEl.textContent = _partnerName;

  // ─── FIREBASE REFS ───────────────────────────────────────────────
  const storage = firebase.storage();
  const messagesRef = db
    .collection("chats")
    .doc(CHAT_ID)
    .collection("messages");
  const typingRef = db.collection("chats").doc(CHAT_ID).collection("typing");
  const readRef = db.collection("chats").doc(CHAT_ID).collection("readStatus");
  const presenceCollectionRef = db
    .collection("chats")
    .doc(CHAT_ID)
    .collection("presence");
  const myPresenceRef = presenceCollectionRef.doc(WHO);

  // ─── LIFECYCLE / CLEANUP ─────────────────────────────────────────
  const _cleanupCallbacks = new Set();
  let _cleanupStarted = false;

  function trackCleanup(callback) {
    if (typeof callback === "function") _cleanupCallbacks.add(callback);
    return callback;
  }

  function cleanupChatResources() {
    if (_cleanupStarted) return;
    _cleanupStarted = true;
    _cleanupCallbacks.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.warn("Chat cleanup failed:", error);
      }
    });
    _cleanupCallbacks.clear();
  }

  // ─── BLURRED IMAGES STATE ─────────────────────────────────────────
  const blurRef = db
    .collection("chats")
    .doc(CHAT_ID)
    .collection("blurredImages")
    .doc("state");
  let _blurredImages = new Set();

  function refreshBlurredImagesInDOM() {
    document.querySelectorAll(".grid-img[data-img-url]").forEach((img) => {
      img.classList.toggle(
        "img-blurred",
        _blurredImages.has(img.dataset.imgUrl),
      );
    });
  }

  trackCleanup(
    blurRef.onSnapshot(
      (snap) => {
        _blurredImages = new Set(snap.exists ? snap.data().urls || [] : []);

        // Message rendering reads _blurredImages directly. Refresh only when
        // image elements already exist in the DOM.
        if (document.querySelector(".grid-img[data-img-url]")) {
          refreshBlurredImagesInDOM();
        }
      },
      (error) => console.warn("Blur-state listener failed:", error),
    ),
  );

  function isImageBlurred(url) {
    return _blurredImages.has(url);
  }

  // Cache MediaQueryList objects once. Their .matches values update
  // automatically when the viewport or active input devices change.
  const TOUCH_ONLY_UI_QUERY = window.matchMedia(
    "(hover: none) and (pointer: coarse) and (max-width: 1024px)",
  );
  const FINE_POINTER_QUERY = window.matchMedia("(any-pointer: fine)");

  function isTouchOnlyUI() {
    return TOUCH_ONLY_UI_QUERY.matches && !FINE_POINTER_QUERY.matches;
  }

  async function setImagesBlurred(urls, shouldBlur) {
    urls.forEach((url) => {
      if (shouldBlur) _blurredImages.add(url);
      else _blurredImages.delete(url);
    });
    refreshBlurredImagesInDOM();

    try {
      await blurRef.set({ urls: [..._blurredImages] });
    } catch (e) {
      console.warn("Could not save blur state:", e);
      throw e;
    }
  }

  async function toggleImageBlur(url) {
    await setImagesBlurred([url], !isImageBlurred(url));
  }

  function openSeparateBlurPicker(urls) {
    document
      .querySelectorAll(".separate-blur-overlay")
      .forEach((el) => el.remove());
    closeAllDropdowns();
    lockScroll();

    const selected = new Set(urls.filter((url) => isImageBlurred(url)));
    const overlay = document.createElement("div");
    overlay.className = "separate-blur-overlay";

    const dialog = document.createElement("div");
    dialog.className = "separate-blur-dialog";

    const header = document.createElement("div");
    header.className = "separate-blur-header";

    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = "Blur separately";
    const subtitle = document.createElement("p");
    subtitle.textContent = "Select the images that should stay blurred.";
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "separate-blur-close";
    closeBtn.textContent = "✕";
    closeBtn.title = "Close";

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "separate-blur-grid";

    const updateCard = (card, url) => {
      const active = selected.has(url);
      card.classList.toggle("selected", active);
      card.setAttribute("aria-pressed", String(active));
      const badge = card.querySelector(".separate-blur-badge");
      if (badge) badge.textContent = active ? "Blurred" : "Visible";
    };

    urls.forEach((url, index) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "separate-blur-card";
      card.setAttribute("aria-label", `Toggle blur for image ${index + 1}`);

      const img = document.createElement("img");
      img.src = url;
      img.alt = `Image ${index + 1}`;
      img.loading = "lazy";

      const number = document.createElement("span");
      number.className = "separate-blur-number";
      number.textContent = String(index + 1);

      const badge = document.createElement("span");
      badge.className = "separate-blur-badge";

      card.appendChild(img);
      card.appendChild(number);
      card.appendChild(badge);
      updateCard(card, url);

      card.addEventListener("click", () => {
        if (selected.has(url)) selected.delete(url);
        else selected.add(url);
        updateCard(card, url);
      });

      grid.appendChild(card);
    });

    dialog.appendChild(grid);

    const footer = document.createElement("div");
    footer.className = "separate-blur-footer";

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "separate-blur-secondary";
    clearBtn.textContent = "Show all";
    clearBtn.addEventListener("click", () => {
      selected.clear();
      grid.querySelectorAll(".separate-blur-card").forEach((card, index) => {
        updateCard(card, urls[index]);
      });
    });

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "separate-blur-apply";
    applyBtn.textContent = "Apply";

    const closePicker = () => {
      overlay.remove();
      unlockScroll();
    };

    closeBtn.addEventListener("click", closePicker);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closePicker();
    });

    applyBtn.addEventListener("click", async () => {
      applyBtn.disabled = true;
      try {
        const shouldBlur = urls.filter((url) => selected.has(url));
        const shouldShow = urls.filter((url) => !selected.has(url));
        if (shouldBlur.length) await setImagesBlurred(shouldBlur, true);
        if (shouldShow.length) await setImagesBlurred(shouldShow, false);
        closePicker();
      } catch (_) {
        applyBtn.disabled = false;
        showMiniNotif("Could not save blur setting");
      }
    });

    footer.appendChild(clearBtn);
    footer.appendChild(applyBtn);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
  }

  // ─── ELEMENTS ────────────────────────────────────────────────────
  const msgContainer = document.getElementById("messages-container");

  // ─── SCROLL LOCK (prevents chat scrolling while any menu is open) ───────────
  let _scrollLocked = false;
  function lockScroll() {
    if (_scrollLocked) return;
    _scrollLocked = true;
    msgContainer.style.overflow = "hidden";
    document.body.style.userSelect = "none";
  }
  function unlockScroll() {
    if (!_scrollLocked) return;
    _scrollLocked = false;
    msgContainer.style.overflow = "";
    document.body.style.userSelect = "";
  }
  const emptyState = document.getElementById("empty-state");
  const msgInput = document.getElementById("msg-input");
  const sendBtn = document.getElementById("send-btn");
  const fileInput = document.getElementById("file-input");
  const imgPreviewBar = document.getElementById("img-preview-bar");
  const previewScroll = document.getElementById("preview-scroll");
  const previewCountLabel = document.getElementById("preview-count-label");
  const clearAllBtn = document.getElementById("clear-all-btn");
  const addMoreBtn = document.getElementById("add-more-btn");
  const emojiToggleBtn = document.getElementById("emoji-toggle-btn");
  const emojiTray = document.getElementById("emoji-tray");
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxClose = document.getElementById("lightbox-close");
  const lightboxCounter = document.getElementById("lightbox-counter");
  const lbPrev = document.getElementById("lb-prev");
  const lbNext = document.getElementById("lb-next");
  const typingIndicator = document.getElementById("typing-bubble");

  function placeTypingIndicatorAfterLastMessage(scrollWhenVisible = false) {
    if (!typingIndicator || !msgContainer) return;

    // The typing bubble belongs to the scrollable message list. Re-appending
    // an existing node moves it to the end without cloning listeners/state.
    if (
      typingIndicator.parentElement !== msgContainer ||
      typingIndicator.nextElementSibling
    ) {
      msgContainer.appendChild(typingIndicator);
    }

    if (scrollWhenVisible && isAtBottom) {
      requestAnimationFrame(() => scrollToBottom(true));
    }
  }
  const uploadProgress = document.getElementById("upload-progress");
  const uploadProgressBar = document.getElementById("upload-progress-bar");
  const loader = document.getElementById("loader");
  const notifBanner = document.getElementById("notif-banner");
  const notifAllowBtn = document.getElementById("notif-allow-btn");
  const notifDismissBtn = document.getElementById("notif-dismiss-btn");
  const scrollToBottomBtn = document.getElementById("scroll-to-bottom");
  const replyBar = document.getElementById("reply-bar");
  const chatHeader = document.getElementById("chat-header");
  const headerStatusText = document.getElementById("status-text");
  const headerStatusDot = document.querySelector(".status-dot");

  const headerActions = document.createElement("div");
  headerActions.className = "header-actions";

  function createHeaderActionButton(id, label, icon) {
    const button = document.createElement("button");
    button.id = id;
    button.className = "header-action-btn";
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.textContent = icon;
    return button;
  }

  const sharedMediaBtn = createHeaderActionButton(
    "shared-media-btn",
    "Shared media",
    "",
  );

  // Custom romantic photo icon: rounded gallery frame with a tiny heart.
  // Inline SVG keeps it sharp at every size and avoids a generic system look.
  sharedMediaBtn.innerHTML = `
    <svg
      class="shared-media-heart-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        class="shared-media-heart-icon__frame"
        x="2.75"
        y="3.5"
        width="18.5"
        height="17"
        rx="4.25"
      />
      <circle
        class="shared-media-heart-icon__sun"
        cx="8.2"
        cy="9"
        r="1.55"
      />
      <path
        class="shared-media-heart-icon__landscape"
        d="M5.3 17.05 9.45 12.9a1.05 1.05 0 0 1 1.48 0l2.18 2.16 1.45-1.4a1.05 1.05 0 0 1 1.47.01l2.62 2.61"
      />
      <path
        class="shared-media-heart-icon__heart"
        d="M16.75 7.15c-.82-1.07-2.58-.55-2.58.83 0 1.32 2.58 2.93 2.58 2.93s2.58-1.61 2.58-2.93c0-1.38-1.76-1.9-2.58-.83Z"
      />
    </svg>`;

  headerActions.appendChild(sharedMediaBtn);
  chatHeader?.appendChild(headerActions);

  // Camera
  const cameraBtn = document.getElementById("camera-btn");
  const cameraModal = document.getElementById("camera-modal");
  const cameraFeed = document.getElementById("camera-feed");
  const cameraLiveWrap = document.getElementById("camera-live-wrap");
  const cameraPreviewWrap = document.getElementById("camera-preview-wrap");
  const cameraPreviewImg = document.getElementById("camera-preview-img");
  const snapBtn = document.getElementById("snap-btn");
  const snapCanvas = document.getElementById("snap-canvas");
  const closeCameraBtn = document.getElementById("close-camera-btn");
  const flipCameraBtn = document.getElementById("flip-camera-btn");
  const retakeBtn = document.getElementById("retake-btn");
  const usePhotoBtn = document.getElementById("use-photo-btn");

  // ─── COMPOSER EMOJIS ─────────────────────────────────────────────
  // Keep the original emoji buttons. Camera features remain unchanged.
  function restoreComposerEmojis() {
    const attachmentBtn = document.querySelector('label[for="file-input"]');

    if (cameraBtn) {
      cameraBtn.classList.remove("illustrated-input-btn");
      cameraBtn.setAttribute("aria-label", "Open camera");
      cameraBtn.title = "Camera";
      cameraBtn.textContent = "📷";
    }

    if (attachmentBtn) {
      attachmentBtn.classList.remove("illustrated-input-btn");
      attachmentBtn.setAttribute("aria-label", "Attach photos");
      attachmentBtn.title = "Attach photos";

      // Preserve the hidden file input if it is inside the label.
      if (attachmentBtn.contains(fileInput)) {
        fileInput.remove();
        attachmentBtn.textContent = "📎";
        attachmentBtn.appendChild(fileInput);
      } else {
        attachmentBtn.textContent = "📎";
      }
    }

    if (emojiToggleBtn) {
      emojiToggleBtn.classList.remove("illustrated-input-btn");
      emojiToggleBtn.setAttribute("aria-label", "Open emojis");
      emojiToggleBtn.title = "Emojis";
      emojiToggleBtn.textContent = "😊";
    }
  }

  restoreComposerEmojis();

  // ─── STATE ───────────────────────────────────────────────────────
  const MAX_SELECTED_IMAGES = 30;
  const DRAFT_DB_NAME = "mk-private-chat-drafts";
  const DRAFT_DB_VERSION = 2;
  const DRAFT_STORE = "drafts";
  const DRAFT_KEY = `${CHAT_ID}:${WHO}:unsent-images`;

  let selectedFiles = [];
  let previewObjectUrls = [];
  let draftWriteQueue = Promise.resolve();
  let isSending = false;
  // Successfully uploaded files are cached individually until the Firestore
  // message write succeeds. This also survives a failure halfway through a
  // multi-image batch, so retrying resumes instead of re-uploading earlier files.
  let pendingUploadCache = null;
  // Shape: { signature, entries: Array<{ fileSignature, url } | null>, uploadedAt }
  let typingTimeout = null;
  let isTyping = false;
  let partnerReadTime = null;
  let lbImages = [];
  let lbIndex = 0;
  let cameraStream = null;
  // Every stream/capture action gets a generation number. Results from an
  // older async request are discarded and their tracks are stopped.
  let cameraStreamRequestId = 0;
  let cameraCaptureRequestId = 0;
  let facingMode = "environment";
  let capturedBlob = null;
  let pendingCameraFile = null;
  let cameraPreviewObjectUrl = null;
  let cameraTimerSeconds = 0;
  let cameraCountdownToken = 0;
  let cameraIsCapturing = false;
  let cameraIsCountingDown = false;
  let cameraStage = null;
  let cameraFocusIndicator = null;
  let cameraCountdownEl = null;
  let cameraTimerBtn = null;
  let cameraTimerMenu = null;
  let cameraExposureWrap = null;
  let cameraExposureSlider = null;
  let cameraExposureValue = null;
  let cameraFocusUnsupportedNotified = false;
  let cameraFocusResetTimer = null;
  let cameraZoomWrap = null;
  let cameraZoomSlider = null;
  let cameraZoomValue = null;
  let cameraZoomMinLabel = null;
  let cameraZoomMaxLabel = null;
  let cameraZoomRange = null;
  let cameraZoomCurrent = 1;
  let cameraZoomQueuedValue = null;
  let cameraZoomApplyInFlight = false;
  let cameraZoomUsesSoftware = false;
  let cameraSoftwareZoomBaseSize = null;
  let cameraTorchBtn = null;
  let cameraTorchOn = false;
  let cameraTorchSupported = false;
  const cameraPointers = new Map();
  let cameraPinchStartDistance = 0;
  let cameraPinchStartZoom = 1;
  let cameraPinchActive = false;
  let cameraSinglePointerMoved = false;
  let cameraSinglePointerStart = null;
  let cameraGestureGuardEnabled = false;
  let cameraEnhancementAbortController = null;
  let cameraGestureHadMultiplePointers = false;
  let cameraRatioSelect = null;
  let cameraRatioKey = "default";

  // Default deliberately preserves the current original horizontal camera.
  // Other ratios only apply after the user selects one.
  const CAMERA_RATIOS = Object.freeze({
    default: null,
    "1:1": 1,
    "4:3": 4 / 3,
    "16:9": 16 / 9,
    "9:16": 9 / 16,
    "8:16": 8 / 16,
    "3:1": 3,
  });

  trackCleanup(() => {
    cameraEnhancementAbortController?.abort();
    cameraEnhancementAbortController = null;

    clearTimeout(cameraFocusResetTimer);
    cameraFocusResetTimer = null;

    revokePreviewObjectUrls();

    if (cameraPreviewObjectUrl) {
      URL.revokeObjectURL(cameraPreviewObjectUrl);
      cameraPreviewObjectUrl = null;
    }

    cameraTimerMenu?.remove();
    cameraTimerMenu = null;
  });

  // ─── UNSENT IMAGE DRAFTS (IndexedDB) ─────────────────────────────
  function getFileSignature(file) {
    return [
      file.name || "blob",
      file.size,
      file.type || "",
      file.lastModified || 0,
    ].join(":");
  }

  function getFilesSignature(files) {
    return files.map(getFileSignature).join("|");
  }

  function normalizePendingUploadCache(cache, files) {
    if (!cache || !Array.isArray(files)) return null;

    const fileSignatures = files.map(getFileSignature);
    const entriesBySignature = new Map();

    const addReusableEntry = (entry) => {
      if (
        !entry ||
        typeof entry.fileSignature !== "string" ||
        typeof entry.url !== "string" ||
        !entry.url
      ) {
        return;
      }

      if (!entriesBySignature.has(entry.fileSignature)) {
        entriesBySignature.set(entry.fileSignature, []);
      }
      entriesBySignature.get(entry.fileSignature).push({
        fileSignature: entry.fileSignature,
        url: entry.url,
      });
    };

    if (Array.isArray(cache.entries)) {
      cache.entries.forEach(addReusableEntry);
    } else if (
      Array.isArray(cache.urls) &&
      cache.urls.length === files.length &&
      cache.signature === getFilesSignature(files)
    ) {
      // Backward compatibility with the old full-array cache format.
      cache.urls.forEach((url, index) => {
        addReusableEntry({ fileSignature: fileSignatures[index], url });
      });
    }

    const entries = fileSignatures.map((signature) => {
      const reusable = entriesBySignature.get(signature);
      return reusable?.length ? reusable.shift() : null;
    });

    return {
      signature: getFilesSignature(files),
      entries,
      uploadedAt: Number(cache.uploadedAt) || Date.now(),
    };
  }

  function reconcilePendingUploadCache(files = selectedFiles) {
    pendingUploadCache = normalizePendingUploadCache(
      pendingUploadCache,
      files,
    );
  }

  function invalidatePendingUploadCache() {
    pendingUploadCache = null;
  }

  function openDraftDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is not available"));
        return;
      }

      const request = indexedDB.open(DRAFT_DB_NAME, DRAFT_DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DRAFT_STORE)) {
          database.createObjectStore(DRAFT_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("IndexedDB upgrade is blocked by another open tab"));
    });
  }

  async function writeSelectedFilesDraft() {
    const database = await openDraftDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = database.transaction(DRAFT_STORE, "readwrite");
        const store = tx.objectStore(DRAFT_STORE);
        if (
          selectedFiles.length === 0 &&
          !pendingCameraFile &&
          !pendingUploadCache
        ) {
          store.delete(DRAFT_KEY);
        } else {
          store.put({
            id: DRAFT_KEY,
            files: selectedFiles,
            pendingCameraFile,
            pendingUploadCache,
            updatedAt: Date.now(),
          });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Draft save aborted"));
      });
    } finally {
      database.close();
    }
  }

  function queueSelectedFilesDraftSave() {
    draftWriteQueue = draftWriteQueue
      .catch(() => {})
      .then(writeSelectedFilesDraft)
      .catch((error) =>
        console.warn("Could not persist unsent images:", error),
      );
    return draftWriteQueue;
  }

  async function restoreSelectedFilesDraft() {
    try {
      const database = await openDraftDB();
      const record = await new Promise((resolve, reject) => {
        const tx = database.transaction(DRAFT_STORE, "readonly");
        const request = tx.objectStore(DRAFT_STORE).get(DRAFT_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      database.close();

      const hasStoredFiles =
        record && Array.isArray(record.files) && record.files.length > 0;
      const hasPendingCameraFile =
        record && record.pendingCameraFile instanceof Blob;
      if (!hasStoredFiles && !hasPendingCameraFile) return;

      const restoredFiles = Array.isArray(record.files)
        ? [...record.files]
        : [];
      if (record.pendingCameraFile instanceof Blob) {
        restoredFiles.push(record.pendingCameraFile);
      }

      selectedFiles = restoredFiles
        .filter((file) => file instanceof Blob)
        .slice(0, MAX_SELECTED_IMAGES)
        .map((file, index) =>
          file instanceof File
            ? file
            : new File([file], `restored_photo_${index + 1}.jpg`, {
                type: file.type || "image/jpeg",
                lastModified: record.updatedAt || Date.now(),
              }),
        );
      pendingCameraFile = null;

      const storedCache = record?.pendingUploadCache;
      const normalizedCache = normalizePendingUploadCache(
        storedCache,
        selectedFiles,
      );
      pendingUploadCache =
        normalizedCache && normalizedCache.entries.some((entry) => entry)
          ? normalizedCache
          : null;

      renderPreviewBar();
      queueSelectedFilesDraftSave();
      showMiniNotif(
        `📷 Restored ${selectedFiles.length} unsent photo${selectedFiles.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      console.warn("Could not restore unsent images:", error);
    }
  }

  // ─── BOTTOM-LOCK ─────────────────────────────────────────────────
  let isAtBottom = true;
  let unreadWhileScrolled = 0;

  // ─── RENDERING STATE ─────────────────────────────────────────────
  let lastDate = null;
  let lastSender = null;

  const MAX_TRACKED_MESSAGE_STATE = 800;
  const msgRowMap = new Map();

  function setBoundedMapValue(map, key, value, limit = MAX_TRACKED_MESSAGE_STATE) {
    if (map.has(key)) map.delete(key);
    map.set(key, value);

    while (map.size > limit) {
      const oldestKey = map.keys().next().value;
      map.delete(oldestKey);
    }
  }

  function getMessageRowFromDOM(id) {
    const escapedId = window.CSS?.escape
      ? window.CSS.escape(String(id))
      : String(id).replace(/["\\]/g, "\\$&");
    return msgContainer.querySelector(`.msg-row[data-id="${escapedId}"]`);
  }

  function trackMessageRow(id, row) {
    if (id && row) setBoundedMapValue(msgRowMap, id, row);
  }

  function getTrackedMessageRow(id) {
    return msgRowMap.get(id) || getMessageRowFromDOM(id);
  }

  // ─── GLOBAL IMAGE ORDER FOR CROSS-MESSAGE LIGHTBOX NAVIGATION ──────
  // Read directly from the message DOM. Older pages are prepended to the DOM,
  // so this always reflects true chronological order without a growing cache.
  function getChronologicalChatImageUrls() {
    const seen = new Set();
    const urls = [];

    msgContainer
      .querySelectorAll(".grid-img[data-img-url]")
      .forEach((img) => {
        const url = img.dataset.imgUrl;
        if (!url || seen.has(url)) return;
        seen.add(url);
        urls.push(url);
      });

    return urls;
  }

  // ─── REPLY STATE ─────────────────────────────────────────────────
  let replyingTo = null;

  // ─── REACTION STATE ───────────────────────────────────────────────
  const DEFAULT_QUICK_REACTIONS = ["❤️", "😂", "😘", "🥺", "😍", "👍"];
  const DEFAULT_DOUBLE_TAP_EMOJI = "❤️";

  let _capsuleEmojis = [...DEFAULT_QUICK_REACTIONS];
  let _doubleTapEmoji = DEFAULT_DOUBLE_TAP_EMOJI;

  const capsuleRef = db
    .collection("users")
    .doc(WHO)
    .collection("capsule")
    .doc("settings");

  async function loadCapsuleFromFirestore() {
    try {
      const snap = await capsuleRef.get();
      if (snap.exists) {
        const data = snap.data();
        if (Array.isArray(data.emojis) && data.emojis.length > 0) {
          _capsuleEmojis = data.emojis;
        }
        if (data.doubleTapEmoji) {
          _doubleTapEmoji = data.doubleTapEmoji;
        }
      }
    } catch (e) {
      console.warn("Could not load capsule from Firestore, using defaults:", e);
      try {
        const saved = localStorage.getItem(`mk_quick_reactions_${WHO}`);
        if (saved) _capsuleEmojis = JSON.parse(saved);
      } catch (_) {}
    }
  }

  async function saveCapsuleToFirestore(emojis, doubleTapEmoji) {
    _capsuleEmojis = emojis;
    _doubleTapEmoji = doubleTapEmoji;
    try {
      localStorage.setItem(`mk_quick_reactions_${WHO}`, JSON.stringify(emojis));
    } catch (_) {}
    try {
      await capsuleRef.set({
        emojis,
        doubleTapEmoji,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.warn("Could not save capsule to Firestore:", e);
    }
  }

  function getQuickReactions() {
    return _capsuleEmojis;
  }
  function getDoubleTapEmoji() {
    return _doubleTapEmoji;
  }

  function saveQuickReactions(arr) {
    saveCapsuleToFirestore(arr, _doubleTapEmoji);
  }

  const ALL_REACTION_EMOJIS = [
    "❤️",
    "😂",
    "😘",
    "🥺",
    "😍",
    "👍",
    "💕",
    "💖",
    "💗",
    "🥰",
    "💋",
    "🌹",
    "✨",
    "😊",
    "💌",
    "🎀",
    "🌸",
    "💞",
    "💓",
    "💝",
    "🙈",
    "🫶",
    "😭",
    "🤣",
    "😅",
    "😆",
    "🔥",
    "💯",
    "🎉",
    "✅",
    "👏",
    "🙏",
    "💀",
    "😤",
    "🥳",
    "😇",
    "🤩",
    "😜",
    "😎",
    "💫",
    "⭐",
    "🌙",
    "🎶",
    "🤍",
    "💭",
    "🫠",
    "🩷",
    "💙",
    "💚",
    "💛",
    "🧡",
    "🤎",
    "🖤",
  ];

  let activeReactionBar = null;
  let reactionBarMsgId = null;

  // ─── SCROLL RESTORATION ──────────────────────────────────────────
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  function fixChatViewport() {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      document.body.style.overflow = "";
      msgContainer.scrollTop = msgContainer.scrollHeight;
    });
  }

  let _viewportFixTimer = null;
  const handleViewportPageShow = () => {
    fixChatViewport();
    clearTimeout(_viewportFixTimer);
    _viewportFixTimer = setTimeout(fixChatViewport, 100);
  };
  window.addEventListener("load", fixChatViewport);
  window.addEventListener("pageshow", handleViewportPageShow);
  trackCleanup(() => {
    window.removeEventListener("load", fixChatViewport);
    window.removeEventListener("pageshow", handleViewportPageShow);
    clearTimeout(_viewportFixTimer);
  });

  // ─── BOTTOM-LOCK SCROLL TRACKING ─────────────────────────────────
  const BOTTOM_THRESHOLD = 120;

  function checkScrollPosition() {
    const distFromBottom =
      msgContainer.scrollHeight -
      msgContainer.scrollTop -
      msgContainer.clientHeight;
    isAtBottom = distFromBottom < BOTTOM_THRESHOLD;

    if (isAtBottom) {
      unreadWhileScrolled = 0;
      scrollToBottomBtn.classList.remove("visible");
      scrollToBottomBtn.textContent = "↓";
      const badge = scrollToBottomBtn.querySelector(".unread-badge");
      if (badge) badge.remove();
      updateMyReadTime();
    } else {
      scrollToBottomBtn.classList.add("visible");
      if (unreadWhileScrolled > 0) {
        scrollToBottomBtn.textContent = "";
        const countStr =
          unreadWhileScrolled > 99 ? "99+" : String(unreadWhileScrolled);
        let badge = scrollToBottomBtn.querySelector(".unread-badge");
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "unread-badge";
          scrollToBottomBtn.appendChild(badge);
        }
        badge.textContent = countStr + " new";
      }
    }
  }

  let _messageScrollFrame = null;
  const handleMessageScroll = () => {
    if (_messageScrollFrame !== null) return;
    _messageScrollFrame = requestAnimationFrame(() => {
      _messageScrollFrame = null;
      checkScrollPosition();
      if (msgContainer.scrollTop < 200 && !_loadingMore && !_allLoaded) {
        loadMoreMessages();
      }
    });
  };
  msgContainer.addEventListener("scroll", handleMessageScroll, { passive: true });
  trackCleanup(() => {
    msgContainer.removeEventListener("scroll", handleMessageScroll);
    if (_messageScrollFrame !== null) cancelAnimationFrame(_messageScrollFrame);
  });

  scrollToBottomBtn.addEventListener("click", () => {
    scrollToBottom(true);
    unreadWhileScrolled = 0;
    scrollToBottomBtn.classList.remove("visible");
  });

  function scrollToBottom(smooth = true) {
    if (smooth) {
      msgContainer.scrollTo({
        top: msgContainer.scrollHeight,
        behavior: "smooth",
      });
    } else {
      msgContainer.scrollTop = msgContainer.scrollHeight;
    }
  }

  // ─── NOTIFICATIONS ───────────────────────────────────────────────
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  const isInStandaloneMode =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  let swRegistration = null;

  async function initNotifications() {
    if ("serviceWorker" in navigator) {
      try {
        swRegistration = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js",
        );
      } catch (e) {
        console.warn("SW registration failed:", e);
      }
    }
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      await registerFCMToken();
      return;
    }
    if (Notification.permission === "denied") return;
    if (isIOS && !isInStandaloneMode) {
      notifBanner.querySelector("span").textContent =
        '📲 To get message notifications on iPhone, tap Share → "Add to Home Screen", then open from there!';
      notifAllowBtn.style.display = "none";
      setTimeout(() => notifBanner.classList.add("visible"), 1800);
      return;
    }
    setTimeout(() => notifBanner.classList.add("visible"), 1500);
  }

  notifAllowBtn.addEventListener("click", async () => {
    let perm;
    try {
      perm = await Notification.requestPermission();
    } catch (e) {
      perm = await new Promise((resolve) =>
        Notification.requestPermission(resolve),
      );
    }
    notifBanner.classList.remove("visible");
    if (perm === "granted") {
      showMiniNotif(
        "🔔 Notifications enabled! You'll know when a message arrives 💌",
      );
      await registerFCMToken();
      setTimeout(
        () =>
          sendBrowserNotif(
            "System",
            "Notifications are working! 💌",
            null,
            true,
          ),
        800,
      );
    } else {
      showMiniNotif("⚠️ Permission denied — check your browser settings");
    }
  });

  notifDismissBtn.addEventListener("click", () =>
    notifBanner.classList.remove("visible"),
  );

  async function sendBrowserNotif(senderName, text, imageUrl, force = false) {
    if (Notification.permission !== "granted") return;
    if (!force && !document.hidden) return;
    const title = `${senderName} 💌`;
    const body = text || (imageUrl ? "📷 Sent a photo" : "New message");
    if (swRegistration && swRegistration.active) {
      try {
        swRegistration.active.postMessage({
          type: "NOTIFY",
          title,
          body,
          icon: "favicon.ico",
          tag: "chat-message",
          url: window.location.href,
        });
        return;
      } catch (e) {}
    }
    try {
      const notif = new Notification(title, {
        body,
        icon: "favicon.ico",
        badge: "favicon.ico",
        tag: "chat-message",
        renotify: true,
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
      setTimeout(() => notif.close(), 6000);
    } catch (e) {}
  }

  function showMiniNotif(text) {
    const el = document.createElement("div");
    el.style.cssText = `
    position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
    background:var(--rose);color:white;
    padding:8px 18px;border-radius:20px;font-size:0.82rem;
    box-shadow:0 4px 16px rgba(204,51,102,0.3);
    z-index:9997;animation:fadeIn 0.3s ease;
    font-family:'Quicksand',sans-serif;font-weight:600;
    white-space:nowrap;
  `;
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ─── READ STATUS ─────────────────────────────────────────────────
  const READ_RECEIPT_MIN_INTERVAL_MS = 5_000;
  const READ_RECEIPT_STORAGE_KEY = `mk_last_read_${CHAT_ID}_${WHO}`;
  let _lastReadReceiptWriteAt = 0;
  let _readReceiptTimer = null;
  let _latestIncomingMessageTsMs = 0;
  let _lastReadReceiptMessageTsMs =
    Number(localStorage.getItem(READ_RECEIPT_STORAGE_KEY)) || 0;

  function timestampToMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    return Number(value) || 0;
  }

  function noteIncomingMessage(message) {
    if (!message || message.sender === WHO) return;
    const timestampMs = timestampToMillis(message.timestamp);
    if (timestampMs > _latestIncomingMessageTsMs) {
      _latestIncomingMessageTsMs = timestampMs;
    }
  }

  async function commitReadReceipt(messageTimestampMs) {
    if (
      document.hidden ||
      !isAtBottom ||
      messageTimestampMs <= _lastReadReceiptMessageTsMs
    ) {
      return;
    }

    _lastReadReceiptWriteAt = Date.now();
    try {
      await readRef.doc(WHO).set(
        {
          lastRead: firebase.firestore.FieldValue.serverTimestamp(),
          lastReadMessageTimestamp:
            firebase.firestore.Timestamp.fromMillis(messageTimestampMs),
          user: WHO,
        },
        { merge: true },
      );
      _lastReadReceiptMessageTsMs = messageTimestampMs;
      localStorage.setItem(
        READ_RECEIPT_STORAGE_KEY,
        String(messageTimestampMs),
      );
    } catch (error) {
      console.warn("Read receipt update failed:", error);
    }
  }

  function updateMyReadTime() {
    if (
      document.hidden ||
      !isAtBottom ||
      _latestIncomingMessageTsMs <= _lastReadReceiptMessageTsMs
    ) {
      return;
    }

    const targetTimestampMs = _latestIncomingMessageTsMs;
    const elapsed = Date.now() - _lastReadReceiptWriteAt;
    const delay = Math.max(0, READ_RECEIPT_MIN_INTERVAL_MS - elapsed);

    clearTimeout(_readReceiptTimer);
    _readReceiptTimer = setTimeout(() => {
      _readReceiptTimer = null;
      commitReadReceipt(targetTimestampMs);
    }, delay);
  }

  const partner = WHO === "mikica" ? "kikica" : "mikica";
  trackCleanup(
    readRef.doc(partner).onSnapshot(
      (snap) => {
        if (!snap.exists) return;
        const data = snap.data();
        partnerReadTime = data.lastRead ? data.lastRead.toDate() : null;
        updateAllTicks();
      },
      (error) => console.warn("Read-status listener failed:", error),
    ),
  );

  // ─── ONLINE / LAST-SEEN PRESENCE ────────────────────────────────
  const partnerPresenceRef = presenceCollectionRef.doc(partner);
  const presenceSessionId =
    crypto.randomUUID?.() ||
    `presence_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  // Firestore presence is intentionally low-frequency. This cuts the old
  // 45-second heartbeat by more than half while stale timestamps still stop
  // a disconnected tab from appearing online forever.
  const PRESENCE_HEARTBEAT_MS = 120_000;
  const PRESENCE_ONLINE_WINDOW_MS = 270_000;
  let partnerPresenceData = null;
  let presenceHeartbeat = null;
  let presenceRenderTimer = null;
  let _myPresenceState = null;

  async function updateMyPresence(online, { heartbeat = false } = {}) {
    if (!heartbeat && _myPresenceState === online) return;

    try {
      if (online) {
        await myPresenceRef.set(
          {
            user: WHO,
            online: true,
            sessionId: presenceSessionId,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        _myPresenceState = true;
        return;
      }

      // An older tab may not mark a newer active session offline.
      await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(myPresenceRef);
        if (!snap.exists || snap.data().sessionId !== presenceSessionId) return;
        transaction.set(
          myPresenceRef,
          {
            online: false,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });
      _myPresenceState = false;
    } catch (error) {
      console.warn("Presence update failed:", error);
    }
  }

  function formatPresenceTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "Just the two of us ❤️";
    }
    const diff = Math.max(0, Date.now() - date.getTime());
    if (diff < 60_000) return "Last seen just now";
    if (diff < 60 * 60_000) {
      return `Last seen ${Math.floor(diff / 60_000)}min ago`;
    }
    if (diff < 24 * 60 * 60_000) {
      return `Last seen ${Math.floor(diff / (60 * 60_000))}h ago`;
    }
    return `Last seen ${date.toLocaleDateString("mk-MK", {
      day: "numeric",
      month: "short",
    })}`;
  }

  function renderPartnerPresence() {
    if (!headerStatusText || !headerStatusDot) return;
    const lastSeen = partnerPresenceData?.lastSeen?.toDate?.() || null;
    const isFresh =
      lastSeen && Date.now() - lastSeen.getTime() < PRESENCE_ONLINE_WINDOW_MS;
    const online = Boolean(partnerPresenceData?.online && isFresh);

    headerStatusText.textContent = online
      ? "Online"
      : formatPresenceTime(lastSeen);
    headerStatusDot.classList.toggle("offline", !online);
  }

  trackCleanup(
    partnerPresenceRef.onSnapshot(
      (snap) => {
        partnerPresenceData = snap.exists ? snap.data() : null;
        renderPartnerPresence();
      },
      (error) => console.warn("Presence listener failed:", error),
    ),
  );

  function startPresenceHeartbeat() {
    clearInterval(presenceHeartbeat);
    updateMyPresence(true);
    presenceHeartbeat = setInterval(() => {
      if (!document.hidden) updateMyPresence(true, { heartbeat: true });
    }, PRESENCE_HEARTBEAT_MS);
  }

  startPresenceHeartbeat();
  presenceRenderTimer = setInterval(renderPartnerPresence, 30_000);
  trackCleanup(() => clearInterval(presenceHeartbeat));
  trackCleanup(() => clearInterval(presenceRenderTimer));
  trackCleanup(() => clearTimeout(_readReceiptTimer));

  const handlePresenceVisibility = () => {
    if (document.hidden) {
      clearInterval(presenceHeartbeat);
      updateMyPresence(false);
    } else {
      startPresenceHeartbeat();
      updateMyReadTime();
    }
  };
  document.addEventListener("visibilitychange", handlePresenceVisibility);
  trackCleanup(() =>
    document.removeEventListener("visibilitychange", handlePresenceVisibility),
  );

  const handlePresencePageHide = () => {
    clearInterval(presenceHeartbeat);
    updateMyPresence(false);
  };
  const handlePresencePageShow = (event) => {
    if (event.persisted && !document.hidden) startPresenceHeartbeat();
  };
  window.addEventListener("pagehide", handlePresencePageHide);
  window.addEventListener("pageshow", handlePresencePageShow);
  trackCleanup(() => {
    window.removeEventListener("pagehide", handlePresencePageHide);
    window.removeEventListener("pageshow", handlePresencePageShow);
  });

  function updateAllTicks() {
    if (!partnerReadTime) return;
    document.querySelectorAll(".msg-row.sent[data-ts]").forEach((row) => {
      const ts = new Date(parseInt(row.dataset.ts));
      const tickEl = row.querySelector(".tick");
      if (!tickEl) return;
      if (partnerReadTime >= ts) {
        tickEl.textContent = "✓✓";
        tickEl.className = "tick read";
        tickEl.title = "Read";
      } else {
        tickEl.textContent = "✓✓";
        tickEl.className = "tick delivered";
        tickEl.title = "Delivered";
      }
    });
  }

  // ─── EMOJIS ──────────────────────────────────────────────────────
  const EMOJIS = [
    "❤️",
    "💕",
    "💖",
    "💗",
    "😍",
    "🥰",
    "😘",
    "💋",
    "🌹",
    "✨",
    "😊",
    "🥺",
    "💌",
    "🎀",
    "🌸",
    "💞",
    "💓",
    "💝",
    "😂",
    "🙈",
    "🫶",
    "🙂‍↕️",
    "🥂",
    "🌙",
    "⭐",
    "🎶",
    "🤍",
    "💭",
    "🫠",
    "🩷",
  ];

  const emojiFragment = document.createDocumentFragment();
  EMOJIS.forEach((e) => {
    const btn = document.createElement("button");
    btn.className = "emoji-btn";
    btn.textContent = e;
    btn.addEventListener("click", () => {
      insertAtCursor(msgInput, e);
      msgInput.focus();
    });
    emojiFragment.appendChild(btn);
  });
  emojiTray.appendChild(emojiFragment);

  emojiToggleBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    emojiTray.classList.toggle("open");
  });
  document.addEventListener("click", () => emojiTray.classList.remove("open"));

  function insertAtCursor(el, text) {
    const s = el.selectionStart,
      e = el.selectionEnd;
    el.value = el.value.slice(0, s) + text + el.value.slice(e);
    el.selectionStart = el.selectionEnd = s + text.length;
  }

  // ─── AUTO-RESIZE TEXTAREA ─────────────────────────────────────────
  msgInput.addEventListener("input", () => {
    msgInput.style.height = "auto";
    msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + "px";
    handleTyping();
  });

  // ─── MULTI-FILE SELECT ────────────────────────────────────────────
  fileInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    addFilesToSelection(files);
    fileInput.value = "";
  });

  addMoreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showAddImageMenu(addMoreBtn);
  });

  function showAddImageMenu(anchor) {
    document.querySelectorAll(".add-img-menu").forEach((m) => m.remove());

    const menu = document.createElement("div");
    menu.className = "add-img-menu";
    menu.innerHTML = `
      <button class="add-img-menu-btn" id="aim-camera">📷 Camera</button>
      <button class="add-img-menu-btn" id="aim-media">🖼️ Media</button>
    `;
    document.body.appendChild(menu);

    requestAnimationFrame(() => {
      const rect = anchor.getBoundingClientRect();
      const mw = menu.offsetWidth;
      const mh = menu.offsetHeight;
      let left = rect.left + rect.width / 2 - mw / 2;
      let top = rect.top - mh - 8;
      left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
      top = Math.max(8, top);
      menu.style.left = left + "px";
      menu.style.top = top + "px";
      menu.classList.add("visible");
    });

    menu.querySelector("#aim-camera").addEventListener("click", (e) => {
      e.stopPropagation();
      menu.remove();
      openCamera();
    });

    menu.querySelector("#aim-media").addEventListener("click", (e) => {
      e.stopPropagation();
      menu.remove();
      fileInput.click();
    });

    setTimeout(() => {
      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener("click", closeMenu, true);
        }
      };
      document.addEventListener("click", closeMenu, true);
    }, 50);
  }

  function addFilesToSelection(files) {
    if (isSending) {
      showMiniNotif("Please wait until the current photos finish sending");
      return;
    }

    const validImages = files.filter(
      (file) => file && file.type.startsWith("image/"),
    );
    const freeSlots = MAX_SELECTED_IMAGES - selectedFiles.length;
    const accepted = validImages.slice(0, Math.max(0, freeSlots));
    selectedFiles = [...selectedFiles, ...accepted];
    if (accepted.length > 0) reconcilePendingUploadCache(selectedFiles);

    if (accepted.length < validImages.length) {
      showMiniNotif(`Maximum ${MAX_SELECTED_IMAGES} photos per message`);
    }

    renderPreviewBar();
    queueSelectedFilesDraftSave();
  }

  function revokePreviewObjectUrls() {
    previewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    previewObjectUrls = [];
  }

  function renderPreviewBar() {
    revokePreviewObjectUrls();
    previewScroll
      .querySelectorAll(".preview-item")
      .forEach((el) => el.remove());

    const frag = document.createDocumentFragment();
    selectedFiles.forEach((file, idx) => {
      const item = document.createElement("div");
      item.className = "preview-item";
      const img = document.createElement("img");
      const objectUrl = URL.createObjectURL(file);
      previewObjectUrls.push(objectUrl);
      img.src = objectUrl;
      img.alt = `Selected image ${idx + 1}`;

      const removeBtn = document.createElement("button");
      removeBtn.className = "preview-remove";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => {
        if (isSending) return;
        selectedFiles.splice(idx, 1);
        reconcilePendingUploadCache(selectedFiles);
        renderPreviewBar();
        queueSelectedFilesDraftSave();
      });

      item.appendChild(img);
      item.appendChild(removeBtn);
      frag.appendChild(item);
    });

    previewScroll.insertBefore(frag, addMoreBtn);
    previewCountLabel.textContent = `${selectedFiles.length} image${selectedFiles.length !== 1 ? "s" : ""} selected`;
    imgPreviewBar.classList.toggle("visible", selectedFiles.length > 0);
  }

  clearAllBtn.addEventListener("click", () => {
    if (isSending) return;
    invalidatePendingUploadCache();
    selectedFiles = [];
    renderPreviewBar();
    queueSelectedFilesDraftSave();
  });

  // ─── TYPING INDICATOR ─────────────────────────────────────────────
  function stopTyping() {
    clearTimeout(typingTimeout);
    typingTimeout = null;
    if (!isTyping) return;
    isTyping = false;
    typingRef
      .doc(WHO)
      .set({ typing: false }, { merge: true })
      .catch((error) => console.warn("Could not clear typing state:", error));
  }

  function handleTyping() {
    if (!isTyping) {
      isTyping = true;
      typingRef
        .doc(WHO)
        .set(
          {
            typing: true,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
        .catch((error) => console.warn("Typing update failed:", error));
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTyping, 2_500);
  }

  trackCleanup(
    typingRef.doc(partner).onSnapshot(
      (snap) => {
        if (snap.exists && snap.data().typing) {
          typingIndicator.innerHTML = `
      <div class="typing-bubble-row">
        <div class="typing-bubble-avatar">${AVATARS[partner] || "💗"}</div>
        <div class="typing-bubble-pill">
          <span class="typing-dots"><span></span><span></span><span></span></span>
        </div>
      </div>`;

          // Render it as the final item inside the message list, directly
          // below the newest message instead of above the composer controls.
          placeTypingIndicatorAfterLastMessage(false);
          typingIndicator.classList.add("visible");
          placeTypingIndicatorAfterLastMessage(true);
        } else {
          typingIndicator.classList.remove("visible");
          typingIndicator.innerHTML = "";
        }
      },
      (error) => console.warn("Typing listener failed:", error),
    ),
  );
  trackCleanup(() => clearTimeout(typingTimeout));

  // ─── REPLY SYSTEM ─────────────────────────────────────────────────
  function startReply(msg, id) {
    replyingTo = {
      id,
      sender: msg.sender,
      text: msg.text || null,
      imageUrl: msg.imageUrls ? msg.imageUrls[0] : msg.imageUrl || null,
    };

    replyBar.innerHTML = "";
    const indicator = document.createElement("div");
    indicator.className = "reply-bar-indicator";

    const content = document.createElement("div");
    content.className = "reply-bar-content";

    const senderEl = document.createElement("div");
    senderEl.className = "reply-bar-sender";
    senderEl.textContent = "↩ " + (SENDER_DISPLAY[msg.sender] || msg.sender);

    const textEl = document.createElement("div");
    textEl.className = "reply-bar-text";
    textEl.textContent =
      msg.text || (msg.imageUrls || msg.imageUrl ? "📷 Photo" : "");

    content.appendChild(senderEl);
    content.appendChild(textEl);

    const closeBtn = document.createElement("button");
    closeBtn.className = "reply-bar-close";
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", cancelReply);

    replyBar.appendChild(indicator);
    replyBar.appendChild(content);
    replyBar.appendChild(closeBtn);
    replyBar.classList.add("visible");
    scrollToBottomBtn.classList.add("reply-open");

    msgInput.focus();
  }

  function cancelReply() {
    replyingTo = null;
    replyBar.classList.remove("visible");
    scrollToBottomBtn.classList.remove("reply-open");
  }

  // ─── SHARED MEDIA — PAGINATED / LOADS ON SCROLL ──────────────────
  // New image messages are queried through hasMedia == true, so Firestore
  // reads only image-message documents. Older messages created before the
  // hasMedia field existed are discovered through a bounded fallback scan,
  // one page at a time and only when the user scrolls for more.
  let _activeFeatureOverlay = null;
  let _activeFeatureCleanup = null;

  const MEDIA_PAGE_SIZE = 24;
  const LEGACY_MEDIA_SCAN_PAGE_SIZE = 50;
  const MEDIA_SCROLL_THRESHOLD_PX = 320;

  let _sharedMediaState = null;

  function closeFeatureOverlay() {
    if (_activeFeatureCleanup) {
      try {
        _activeFeatureCleanup();
      } catch (error) {
        console.warn("Feature overlay cleanup failed:", error);
      }
      _activeFeatureCleanup = null;
    }

    if (!_activeFeatureOverlay) return;
    _activeFeatureOverlay.remove();
    _activeFeatureOverlay = null;
    unlockScroll();
  }

  function createFeatureOverlay(titleText) {
    closeFeatureOverlay();
    closeReactionBar();
    closeAllDropdowns();
    lockScroll();

    const overlay = document.createElement("div");
    overlay.className = "chat-feature-overlay";

    const panel = document.createElement("section");
    panel.className = "chat-feature-panel";

    const header = document.createElement("div");
    header.className = "chat-feature-header";

    const title = document.createElement("h2");
    title.textContent = titleText;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "chat-feature-close";
    closeBtn.textContent = "✕";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", closeFeatureOverlay);

    header.append(title, closeBtn);

    const body = document.createElement("div");
    body.className = "chat-feature-body";

    panel.append(header, body);
    overlay.appendChild(panel);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeFeatureOverlay();
    });

    document.body.appendChild(overlay);
    _activeFeatureOverlay = overlay;
    requestAnimationFrame(() => overlay.classList.add("visible"));
    return { overlay, panel, body };
  }

  function extractImageUrls(message) {
    const urls = Array.isArray(message?.imageUrls)
      ? message.imageUrls
      : message?.imageUrl
        ? [message.imageUrl]
        : [];

    return [...new Set(urls.filter((url) => typeof url === "string" && url))];
  }

  function getMediaThumbnailUrl(url) {
    if (!url || !url.includes("res.cloudinary.com")) return url;
    if (!url.includes("/upload/")) return url;

    return url.replace(
      "/upload/",
      "/upload/f_auto,q_auto:eco,c_fill,w_360,h_360/",
    );
  }

  function createSharedMediaState() {
    return {
      items: [],
      keys: new Set(),
      indexedCursor: null,
      indexedDone: false,
      indexedQueryUnavailable: false,
      legacyCursor: null,
      legacyDone: false,
      loading: false,
      grid: null,
      count: null,
      status: null,
      body: null,
      scrollHandler: null,
    };
  }

  function mediaItemsFromDocument(doc) {
    const message = doc.data();
    const timestampMs =
      timestampToMillis(message.timestamp) ||
      Number(message.clientCreatedAt) ||
      0;

    return extractImageUrls(message).map((url, imageIndex) => ({
      key: `${doc.id}:${imageIndex}:${url}`,
      url,
      msgId: doc.id,
      sender: message.sender || null,
      timestampMs,
    }));
  }

  function addSharedMediaItems(items, { prepend = false } = {}) {
    if (!_sharedMediaState || !Array.isArray(items) || items.length === 0) {
      return [];
    }

    const fresh = [];
    items.forEach((item) => {
      if (!item?.url || _sharedMediaState.keys.has(item.key)) return;
      _sharedMediaState.keys.add(item.key);
      fresh.push(item);
    });

    if (fresh.length === 0) return [];

    if (prepend) {
      _sharedMediaState.items = [...fresh, ..._sharedMediaState.items].sort(
        (a, b) => b.timestampMs - a.timestampMs,
      );
    } else {
      _sharedMediaState.items.push(...fresh);
    }

    return fresh;
  }

  function updateSharedMediaStatus() {
    const state = _sharedMediaState;
    if (!state) return;

    if (state.count) {
      const count = state.items.length;
      state.count.textContent = `${count} photo${count === 1 ? "" : "s"} loaded`;
    }

    if (!state.status) return;

    if (state.loading) {
      state.status.textContent = "Loading more photos…";
      state.status.classList.add("loading");
      state.status.disabled = true;
      return;
    }

    state.status.classList.remove("loading");
    if (state.indexedDone && state.legacyDone) {
      state.status.textContent = "All photos loaded";
      state.status.disabled = true;
    } else {
      state.status.textContent = "Scroll or tap for older photos";
      state.status.disabled = false;
    }
  }

  function createSharedMediaButton(item) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shared-media-item";
    button.dataset.mediaKey = item.key;

    const img = document.createElement("img");
    img.src = getMediaThumbnailUrl(item.url);
    img.alt = "Shared photo";
    img.loading = "lazy";
    img.decoding = "async";
    img.dataset.fullUrl = item.url;

    button.appendChild(img);
    button.addEventListener("click", () => {
      const state = _sharedMediaState;
      if (!state) return;

      const urls = state.items.map((mediaItem) => mediaItem.url);
      const selectedIndex = state.items.findIndex(
        (mediaItem) => mediaItem.key === item.key,
      );

      closeFeatureOverlay();
      openLightbox(urls, Math.max(0, selectedIndex), true);
    });

    return button;
  }

  function renderSharedMediaItems(items, { prepend = false } = {}) {
    const state = _sharedMediaState;
    if (!state?.grid || !Array.isArray(items) || items.length === 0) return;

    const fragment = document.createDocumentFragment();
    items.forEach((item) => fragment.appendChild(createSharedMediaButton(item)));

    if (prepend) state.grid.prepend(fragment);
    else state.grid.appendChild(fragment);
  }

  function rebuildSharedMediaGrid() {
    const state = _sharedMediaState;
    if (!state?.grid) return;
    state.grid.innerHTML = "";
    renderSharedMediaItems(state.items);
    updateSharedMediaStatus();
  }

  function upsertSharedMediaItems(messageId, message) {
    if (!_sharedMediaState) return;

    const urls = extractImageUrls(message);
    if (urls.length === 0) return;

    const timestampMs =
      timestampToMillis(message.timestamp) ||
      Number(message.clientCreatedAt) ||
      Date.now();

    const incoming = urls.map((url, imageIndex) => ({
      key: `${messageId}:${imageIndex}:${url}`,
      url,
      msgId: messageId,
      sender: message.sender || null,
      timestampMs,
    }));

    const fresh = addSharedMediaItems(incoming, { prepend: true });
    if (fresh.length > 0 && _sharedMediaState.grid) {
      // Rebuilding is rare (only when a new photo arrives) and guarantees the
      // lightbox/grid order stays chronological without duplicate DOM nodes.
      rebuildSharedMediaGrid();
    }
  }

  async function loadIndexedMediaPage(state) {
    let query = messagesRef
      .where("hasMedia", "==", true)
      .orderBy("timestamp", "desc")
      .limit(MEDIA_PAGE_SIZE);

    if (state.indexedCursor) query = query.startAfter(state.indexedCursor);

    const snap = await query.get();
    if (snap.empty) {
      state.indexedDone = true;
      return [];
    }

    state.indexedCursor = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < MEDIA_PAGE_SIZE) state.indexedDone = true;

    return snap.docs.flatMap(mediaItemsFromDocument);
  }

  async function loadLegacyMediaPage(state) {
    let query = messagesRef
      .orderBy("timestamp", "desc")
      .limit(LEGACY_MEDIA_SCAN_PAGE_SIZE);

    if (state.legacyCursor) query = query.startAfter(state.legacyCursor);

    const snap = await query.get();
    if (snap.empty) {
      state.legacyDone = true;
      return [];
    }

    state.legacyCursor = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < LEGACY_MEDIA_SCAN_PAGE_SIZE) state.legacyDone = true;

    return snap.docs.flatMap((doc) => {
      const data = doc.data();
      // If the optimized media query worked, its documents are already loaded.
      // The fallback then looks only for old image messages missing hasMedia.
      if (!state.indexedQueryUnavailable && data.hasMedia === true) return [];
      return mediaItemsFromDocument(doc);
    });
  }

  async function loadNextSharedMediaPage() {
    const state = _sharedMediaState;
    if (!state || state.loading || (state.indexedDone && state.legacyDone)) {
      return;
    }

    state.loading = true;
    updateSharedMediaStatus();

    try {
      let pageItems = [];

      if (!state.indexedDone) {
        try {
          pageItems = await loadIndexedMediaPage(state);
        } catch (error) {
          // This can happen until Firestore creates the suggested composite
          // index. The bounded fallback still keeps the gallery usable.
          console.warn(
            "Indexed media query unavailable; using bounded message pages:",
            error,
          );
          state.indexedQueryUnavailable = true;
          state.indexedDone = true;
        }
      }

      // Once indexed pages are exhausted—or unavailable—scan one bounded page
      // of older message history per scroll request. Never loop through the
      // complete collection in one action.
      if (state.indexedDone && pageItems.length === 0 && !state.legacyDone) {
        pageItems = await loadLegacyMediaPage(state);
      }

      const fresh = addSharedMediaItems(pageItems);
      renderSharedMediaItems(fresh);

      if (state.items.length === 0 && state.indexedDone && state.legacyDone) {
        state.status.textContent = "No shared photos yet.";
      }
    } catch (error) {
      console.error("Shared media page failed:", error);
      if (state.status) {
        state.status.textContent = "Photos could not be loaded. Scroll to retry.";
      }
    } finally {
      state.loading = false;
      updateSharedMediaStatus();
    }
  }

  function attachSharedMediaInfiniteScroll(body) {
    const state = _sharedMediaState;
    if (!state) return () => {};

    let scrollFrame = null;
    const onScroll = () => {
      if (scrollFrame !== null) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = null;
        const distanceFromBottom =
          body.scrollHeight - body.scrollTop - body.clientHeight;
        if (distanceFromBottom <= MEDIA_SCROLL_THRESHOLD_PX) {
          loadNextSharedMediaPage();
        }
      });
    };

    body.addEventListener("scroll", onScroll, { passive: true });
    state.scrollHandler = onScroll;

    return () => {
      body.removeEventListener("scroll", onScroll);
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
      if (_sharedMediaState) {
        _sharedMediaState.grid = null;
        _sharedMediaState.count = null;
        _sharedMediaState.status = null;
        _sharedMediaState.body = null;
        _sharedMediaState.scrollHandler = null;
      }
    };
  }

  async function openSharedMedia() {
    const { body } = createFeatureOverlay("Shared media");
    if (!_sharedMediaState) _sharedMediaState = createSharedMediaState();

    const state = _sharedMediaState;
    state.body = body;
    body.innerHTML = "";

    const count = document.createElement("div");
    count.className = "shared-media-count";

    const grid = document.createElement("div");
    grid.className = "shared-media-grid";

    const status = document.createElement("button");
    status.type = "button";
    status.className = "shared-media-status";
    status.addEventListener("click", () => loadNextSharedMediaPage());

    state.count = count;
    state.grid = grid;
    state.status = status;

    body.append(count, grid, status);
    renderSharedMediaItems(state.items);
    updateSharedMediaStatus();

    _activeFeatureCleanup = attachSharedMediaInfiniteScroll(body);

    if (state.items.length === 0) {
      await loadNextSharedMediaPage();
    }
  }

  sharedMediaBtn.addEventListener("click", openSharedMedia);

  // ─── SEND MESSAGE ─────────────────────────────────────────────────
  sendBtn.addEventListener("click", sendMessage);
  msgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  async function sendMessage() {
    const text = msgInput.value.trim();
    if (isSending || (!text && selectedFiles.length === 0)) return;

    isSending = true;
    sendBtn.disabled = true;
    fileInput.disabled = true;
    cameraBtn.disabled = true;
    addMoreBtn.disabled = true;

    const filesToSend = [...selectedFiles];
    const textToSend = text;
    const currentReply = replyingTo;

    stopTyping();

    try {
      let imageUrls = [];
      if (filesToSend.length > 0) {
        const normalizedCache = normalizePendingUploadCache(
          pendingUploadCache,
          filesToSend,
        );
        const reusableCount = normalizedCache
          ? normalizedCache.entries.filter(Boolean).length
          : 0;

        if (reusableCount === filesToSend.length) {
          showMiniNotif("Reusing already uploaded photos…");
        } else if (reusableCount > 0) {
          showMiniNotif(
            `Resuming upload — ${reusableCount} photo${reusableCount === 1 ? "" : "s"} already uploaded`,
          );
        }

        imageUrls = await uploadImagesWithProgress(filesToSend);
        // Persist the complete cache before writing the message. If Firestore
        // fails or the page closes, retrying will reuse every uploaded file.
        await queueSelectedFilesDraftSave();
      }

      const clientCreatedAt = Date.now();
      const msgData = {
        sender: WHO,
        text: textToSend || null,
        imageUrls: imageUrls.length > 0 ? imageUrls : null,
        imageUrl: imageUrls.length === 1 ? imageUrls[0] : null,
        hasMedia: imageUrls.length > 0,
        imageCount: imageUrls.length,
        clientCreatedAt,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      };

      if (currentReply) {
        msgData.replyTo = {
          id: currentReply.id,
          sender: currentReply.sender,
          text: currentReply.text || null,
          imageUrl: currentReply.imageUrl || null,
        };
      }

      const messageRef = messagesRef.doc();
      await messageRef.set(msgData);
      if (imageUrls.length > 0) {
        upsertSharedMediaItems(messageRef.id, {
          ...msgData,
          timestamp: firebase.firestore.Timestamp.fromMillis(clientCreatedAt),
        });
      }

      selectedFiles = [];
      pendingUploadCache = null;
      renderPreviewBar();
      await queueSelectedFilesDraftSave();

      if (msgInput.value.trim() === textToSend) {
        msgInput.value = "";
        msgInput.style.height = "";
      }
      if (
        (!currentReply && !replyingTo) ||
        (currentReply && replyingTo?.id === currentReply.id)
      ) {
        cancelReply();
      }
    } catch (err) {
      console.error("Send error:", err);
      renderPreviewBar();
      await queueSelectedFilesDraftSave();
      alert(
        "Couldn't send the message. Your selected photos are still saved on this device.\n\n" +
          err.message,
      );
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      fileInput.disabled = false;
      cameraBtn.disabled = false;
      addMoreBtn.disabled = false;
      msgInput.focus();
    }
  }

  // ─── UPLOAD IMAGES ────────────────────────────────────────────────
  async function uploadImagesWithProgress(files) {
    uploadProgress.style.display = "block";
    uploadProgressBar.style.width = "0%";

    const signature = getFilesSignature(files);
    const fileSignatures = files.map(getFileSignature);
    const normalizedCache = normalizePendingUploadCache(
      pendingUploadCache,
      files,
    );

    pendingUploadCache = normalizedCache || {
      signature,
      entries: Array(files.length).fill(null),
      uploadedAt: Date.now(),
    };

    const urls = Array(files.length).fill(null);
    const perFileProgress = Array(files.length).fill(0);
    const MAX_CONCURRENT_UPLOADS = 4;
    const DRAFT_SAVE_BATCH_SIZE = 3;
    let dirtySuccessfulUploads = 0;
    let nextIndex = 0;
    let firstError = null;
    let stopScheduling = false;
    let draftFlushQueue = Promise.resolve();

    const updateOverallProgress = () => {
      if (files.length === 0) return;
      const completedFraction =
        perFileProgress.reduce((sum, value) => sum + value, 0) / files.length;
      uploadProgressBar.style.width = `${Math.min(100, completedFraction * 100)}%`;
    };

    const flushUploadCacheDraft = async (force = false) => {
      if (dirtySuccessfulUploads === 0) return;
      if (!force && dirtySuccessfulUploads < DRAFT_SAVE_BATCH_SIZE) return;
      dirtySuccessfulUploads = 0;
      draftFlushQueue = draftFlushQueue
        .catch(() => {})
        .then(() => queueSelectedFilesDraftSave());
      await draftFlushQueue;
    };

    const uploadIndex = async (index) => {
      const cachedEntry = pendingUploadCache.entries[index];
      if (
        cachedEntry &&
        cachedEntry.fileSignature === fileSignatures[index] &&
        cachedEntry.url
      ) {
        urls[index] = cachedEntry.url;
        perFileProgress[index] = 1;
        updateOverallProgress();
        return;
      }

      const url = await uploadSingleImage(files[index], (fraction) => {
        perFileProgress[index] = Math.max(
          perFileProgress[index],
          Math.min(1, fraction),
        );
        updateOverallProgress();
      });

      urls[index] = url;
      perFileProgress[index] = 1;
      pendingUploadCache.entries[index] = {
        fileSignature: fileSignatures[index],
        url,
      };
      pendingUploadCache.uploadedAt = Date.now();
      dirtySuccessfulUploads += 1;
      updateOverallProgress();
      await flushUploadCacheDraft(false);
    };

    const worker = async () => {
      while (!stopScheduling) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= files.length) return;

        try {
          await uploadIndex(index);
        } catch (error) {
          if (!firstError) firstError = error;
          stopScheduling = true;
          return;
        }
      }
    };

    try {
      const workerCount = Math.min(MAX_CONCURRENT_UPLOADS, files.length);
      await Promise.all(
        Array.from({ length: workerCount }, () => worker()),
      );

      // Persist every URL that completed, including uploads that finished while
      // another concurrent worker was reporting a failure.
      await flushUploadCacheDraft(true);

      if (firstError) throw firstError;
      if (urls.some((url) => !url)) {
        throw new Error("One or more images did not finish uploading");
      }

      uploadProgressBar.style.width = "100%";
      return urls;
    } finally {
      setTimeout(() => {
        uploadProgress.style.display = "none";
        uploadProgressBar.style.width = "0%";
      }, 400);
    }
  }

  async function uploadSingleImage(file, onProgress = () => {}) {
    let uploadPayload = file;
    try {
      uploadPayload = await compressImage(file);
    } catch (compressionError) {
      console.warn("Image compression failed; uploading original:", compressionError);
    }

    try {
      const formData = new FormData();
      formData.append("file", uploadPayload);
      formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
      formData.append("folder", "chat");
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
        { method: "POST", body: formData },
      );
      if (!res.ok) throw new Error(`Cloudinary upload failed (${res.status})`);
      const data = await res.json();
      onProgress(1);
      return data.secure_url;
    } catch (cloudinaryError) {
      console.warn("Cloudinary failed; using Firebase Storage fallback:", cloudinaryError);
      const safeName = (file.name || "photo.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
      const uniqueId =
        crypto.randomUUID?.() ||
        `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const ref = storage.ref(`chat/${uniqueId}_${safeName}`);
      const task = ref.put(uploadPayload);
      return new Promise((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => {
            if (snap.totalBytes > 0) {
              onProgress(snap.bytesTransferred / snap.totalBytes);
            }
          },
          reject,
          async () => {
            try {
              const url = await task.snapshot.ref.getDownloadURL();
              onProgress(1);
              resolve(url);
            } catch (error) {
              reject(error);
            }
          },
        );
      });
    }
  }

  async function compressImage(file, maxW = 1200, quality = 0.82) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let w = img.naturalWidth,
          h = img.naturalHeight;
        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => resolve(blob || file),
          file.type || "image/jpeg",
          quality,
        );
        URL.revokeObjectURL(url);
      };
      img.onerror = () => resolve(file);
      img.src = url;
    });
  }

  // ─── RENDER MESSAGE ───────────────────────────────────────────────
  let _pendingFirstBatch = [];
  let _firstBatchTimer = null;
  trackCleanup(() => clearTimeout(_firstBatchTimer));

  // ─── IntersectionObserver for lazy image loading ──────────────────
  const _imgObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.lazySrc) {
            img.src = img.dataset.lazySrc;
            delete img.dataset.lazySrc;
            _imgObserver.unobserve(img);
          }
        }
      });
    },
    { rootMargin: "200px" },
  );
  trackCleanup(() => _imgObserver.disconnect());

  function observeLazyImages(root) {
    root
      .querySelectorAll("img[data-lazy-src]")
      .forEach((img) => _imgObserver.observe(img));
  }

  function flushFirstBatch() {
    if (!_pendingFirstBatch.length) return;

    if (emptyState.parentNode) emptyState.remove();

    lastDate = null;
    lastSender = null;

    const frag = document.createDocumentFragment();
    _pendingFirstBatch.forEach(({ msg, id }) => {
      const els = buildMessageElements(msg, id, false);
      els.forEach((el) => frag.appendChild(el));
      trackMessageRow(id, frag.lastElementChild);
    });
    observeLazyImages(frag);
    msgContainer.appendChild(frag);
    if (typingIndicator.classList.contains("visible")) {
      placeTypingIndicatorAfterLastMessage(false);
    }

    _pendingFirstBatch = [];
    _firstBatchTimer = null;

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        msgContainer.scrollTop = msgContainer.scrollHeight;
        loader.style.display = "none";
        updateMyReadTime();
        updateAllTicks();
        checkScrollPosition();
      }),
    );
  }

  function renderMessage(msg, id, animate = true) {
    noteIncomingMessage(msg);
    if (!animate) {
      _pendingFirstBatch.push({ msg, id });
      clearTimeout(_firstBatchTimer);
      _firstBatchTimer = setTimeout(flushFirstBatch, 60);
      return;
    }

    if (emptyState.parentNode) emptyState.remove();

    const els = buildMessageElements(msg, id, true);
    const frag = document.createDocumentFragment();
    els.forEach((el) => frag.appendChild(el));
    observeLazyImages(frag);
    msgContainer.appendChild(frag);

    const row = msgContainer.lastElementChild;
    if (id) trackMessageRow(id, row);

    if (typingIndicator.classList.contains("visible")) {
      placeTypingIndicatorAfterLastMessage(false);
    }

    if (isAtBottom) {
      requestAnimationFrame(() => {
        scrollToBottom(true);
        updateMyReadTime();
      });
    } else {
      if (msg.sender !== WHO) {
        unreadWhileScrolled++;
        checkScrollPosition();
      }
    }
  }

  function buildMessageElements(msg, id, animate) {
    const elements = [];
    const isSent = msg.sender === WHO;
    const ts = msg.timestamp ? msg.timestamp.toDate() : new Date();
    const tsMs = ts.getTime();

    const dateStr = ts.toLocaleDateString("mk-MK", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      const sep = document.createElement("div");
      sep.className = "date-separator";
      sep.textContent = dateStr;
      elements.push(sep);
      lastSender = null;
    }

    const consecutive = lastSender === msg.sender;
    lastSender = msg.sender;

    const row = document.createElement("div");
    row.className = `msg-row ${isSent ? "sent" : "recv"}${consecutive ? " consecutive" : ""}`;
    if (animate) row.classList.add("animate-in");
    row.dataset.id = id || "";
    if (isSent) row.dataset.ts = tsMs;

    const swipeIcon = document.createElement("span");
    swipeIcon.className = "swipe-reply-icon";
    swipeIcon.textContent = "↩";
    row.appendChild(swipeIcon);

    const avatar = document.createElement("div");
    avatar.className = "bubble-avatar";
    if (isSent) {
      avatar.style.display = "none";
    } else {
      avatar.textContent = AVATARS[msg.sender] || "👤";
    }

    const wrap = document.createElement("div");
    wrap.className = "bubble-wrap";

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    // Reply preview
    if (msg.replyTo) {
      const replyDiv = document.createElement("div");
      replyDiv.className = "reply-preview";

      const replySndr = document.createElement("div");
      replySndr.className = "reply-preview-sender";
      replySndr.textContent =
        SENDER_DISPLAY[msg.replyTo.sender] || msg.replyTo.sender;

      const replyTxt = document.createElement("div");
      replyTxt.className = "reply-preview-text";
      replyTxt.textContent =
        msg.replyTo.text || (msg.replyTo.imageUrl ? "📷 Photo" : "");

      if (msg.replyTo.imageUrl) {
        const replyImg = document.createElement("img");
        replyImg.className = "reply-preview-img";
        replyImg.src = msg.replyTo.imageUrl;
        replyImg.loading = "lazy";
        replyDiv.appendChild(replyImg);
      }

      replyDiv.appendChild(replySndr);
      replyDiv.appendChild(replyTxt);
      replyDiv.addEventListener("click", () => jumpToMessage(msg.replyTo.id));
      bubble.appendChild(replyDiv);
    }

    // Images
    const images = msg.imageUrls
      ? msg.imageUrls
      : msg.imageUrl
        ? [msg.imageUrl]
        : [];

    if (images.length > 0) {
      const gridWrap = document.createElement("div");
      gridWrap.className = "img-grid-wrap";

      // Render every image; there is no hidden +N tile.
      const showCount = images.length;
      const countClass =
        images.length === 1
          ? "count-1"
          : images.length === 2
            ? "count-2"
            : images.length === 3
              ? "count-3"
              : images.length === 4
                ? "count-4"
                : "count-many";

      const grid = document.createElement("div");
      grid.className = `img-grid ${countClass}`;

      for (let i = 0; i < showCount; i++) {
        const gridImg = document.createElement("img");
        gridImg.className = "grid-img";
        gridImg.alt = `Image ${i + 1}`;
        gridImg.loading = "lazy";
        gridImg.decoding = "async";

        gridImg.addEventListener(
          "load",
          () => gridImg.classList.add("loaded"),
          {
            once: true,
          },
        );
        gridImg.dataset.lazySrc = images[i];
        gridImg.dataset.imgUrl = images[i];

        const idx = i;
        const imgUrl = images[i];

        if (isImageBlurred(imgUrl)) gridImg.classList.add("img-blurred");

        // ── IMAGE TOUCH INTERACTIONS ────────────────────────────────
        // Mobile behavior:
        //   hold image   -> image actions menu + reaction capsule
        //   single tap   -> lightbox
        //   double tap   -> default reaction
        let imgTapTimer = null;
        let imgLastTap = 0;
        let imgLongPressTimer = null;
        let imgLongPressFired = false;
        let imgTouchStartX = 0;
        let imgTouchStartY = 0;
        let imgMoved = false;

        gridImg.addEventListener("contextmenu", (e) => {
          // Prevent Android Chrome's native/synthetic image context menu.
          // Desktop keeps its normal behavior and uses the message 3-dot menu.
          if (isTouchOnlyUI()) {
            e.preventDefault();
            e.stopPropagation();
          }
        });

        gridImg.addEventListener(
          "touchstart",
          (e) => {
            if (!isTouchOnlyUI()) return;

            imgTouchStartX = e.touches[0].clientX;
            imgTouchStartY = e.touches[0].clientY;
            imgMoved = false;
            imgLongPressFired = false;
            row.__imageActionHoldFired = false;

            clearTimeout(imgLongPressTimer);
            imgLongPressTimer = setTimeout(() => {
              imgLongPressTimer = null;
              if (imgMoved) return;

              imgLongPressFired = true;
              row.__imageActionHoldFired = true;
              clearTimeout(imgTapTimer);
              imgTapTimer = null;

              if (navigator.vibrate) navigator.vibrate(30);
              openImageActionMenu(
                imgUrl,
                gridImg,
                isSent,
                images,
              );
            }, 600);
          },
          { passive: true },
        );

        gridImg.addEventListener(
          "touchmove",
          (e) => {
            if (!isTouchOnlyUI()) return;

            const dy = Math.abs(e.touches[0].clientY - imgTouchStartY);
            const dx = Math.abs(e.touches[0].clientX - imgTouchStartX);
            if (dy > 10 || dx > 10) {
              imgMoved = true;
              clearTimeout(imgLongPressTimer);
              imgLongPressTimer = null;
              clearTimeout(imgTapTimer);
              imgTapTimer = null;
            }
          },
          { passive: true },
        );

        gridImg.addEventListener(
          "touchcancel",
          () => {
            clearTimeout(imgLongPressTimer);
            imgLongPressTimer = null;
            clearTimeout(imgTapTimer);
            imgTapTimer = null;
            imgLongPressFired = false;
            imgMoved = false;
            row.__imageActionHoldFired = false;
          },
          { passive: true },
        );

        gridImg.addEventListener(
          "touchend",
          (e) => {
            if (!isTouchOnlyUI()) return;

            clearTimeout(imgLongPressTimer);
            imgLongPressTimer = null;

            // Preserve row-level swipe-to-reply: moving cancels the hold and tap.
            if (imgMoved) {
              row.__imageActionHoldFired = false;
              return;
            }

            // The hold menu already opened. Do not also open the lightbox or
            // let a synthetic click/contextmenu trigger another action.
            if (imgLongPressFired || row.__imageActionHoldFired) {
              e.preventDefault();
              e.stopPropagation();
              imgLongPressFired = false;
              setTimeout(() => {
                row.__imageActionHoldFired = false;
              }, 0);
              return;
            }

            e.preventDefault();
            const now = Date.now();
            const gap = now - imgLastTap;
            imgLastTap = now;

            if (gap < 350 && gap > 30) {
              clearTimeout(imgTapTimer);
              imgTapTimer = null;
              if (id) {
                saveReaction(id, getDoubleTapEmoji());
                showHeartBurst(gridImg, getDoubleTapEmoji());
              }
            } else {
              clearTimeout(imgTapTimer);
              imgTapTimer = setTimeout(() => {
                imgTapTimer = null;
                if (!row.__imageActionHoldFired) openLightbox(images, idx);
              }, 270);
            }
          },
          { passive: false },
        );

        // Desktop uses click-to-open. All other actions stay in the 3-dot menu.
        gridImg.addEventListener("click", (e) => {
          if (isTouchOnlyUI()) return;
          e.stopPropagation();
          openLightbox(images, idx);
        });

        grid.appendChild(gridImg);
      }

      gridWrap.appendChild(grid);
      bubble.appendChild(gridWrap);
    }

    if (msg.text) {
      const p = document.createElement("p");
      p.className = "bubble-text";
      p.textContent = msg.text;
      bubble.appendChild(p);
    }

    wrap.appendChild(bubble);

    const timeRow = document.createElement("span");
    timeRow.className = "msg-time";
    timeRow.appendChild(
      document.createTextNode(
        ts.toLocaleTimeString("mk-MK", { hour: "2-digit", minute: "2-digit" }) +
          " ",
      ),
    );

    if (isSent) {
      const tickSpan = document.createElement("span");
      tickSpan.className = "read-status";
      const tick = document.createElement("span");
      tick.className = "tick delivered";
      tick.textContent = "✓✓";
      tick.title = "Delivered";
      tickSpan.appendChild(tick);
      timeRow.appendChild(tickSpan);
    }

    wrap.appendChild(timeRow);
    row.appendChild(avatar);
    row.appendChild(wrap);

    attachSwipeReply(row, msg, id || "");

    if (id) {
      const reactions = rememberReactions(id, msg.reactions || {});
      setBoundedMapValue(_reactionRegistry, id, wrap);
      attachReactions(row, msg, id);
      if (Object.keys(reactions).length > 0) {
        renderReactions(wrap, reactions, id);
      }
      // Only the bounded latest-message query is realtime. Older messages keep
      // their loaded reaction state until they are fetched again.
      attachHoverActions(row, msg, id);
      upsertSharedMediaItems(id, msg);
    }

    elements.push(row);
    return elements;
  }

  // ─── REACTIONS ────────────────────────────────────────────────────

  const _reactionMutationQueues = new Map();
  const _reactionRegistry = new Map();
  const _lastKnownReactions = new Map();
  const _reactionStateByMessage = new Map();

  function getReactionWrap(msgId) {
    return (
      _reactionRegistry.get(msgId) ||
      getTrackedMessageRow(msgId)?.querySelector(".bubble-wrap") ||
      null
    );
  }

  function rememberReactions(msgId, reactions) {
    const normalized = { ...(reactions || {}) };
    setBoundedMapValue(_reactionStateByMessage, msgId, normalized);
    setBoundedMapValue(
      _lastKnownReactions,
      msgId,
      JSON.stringify(normalized),
    );
    return normalized;
  }

  function saveReaction(msgId, emoji) {
    const mutationKey = `${msgId}:${WHO}`;
    const previous =
      _reactionMutationQueues.get(mutationKey) || Promise.resolve();

    const mutation = previous
      .catch(() => {})
      .then(async () => {
        let knownReactions = _reactionStateByMessage.get(msgId);
        if (!knownReactions) {
          try {
            const messageSnap = await messagesRef.doc(msgId).get();
            knownReactions = messageSnap.exists
              ? messageSnap.data().reactions || {}
              : {};
            rememberReactions(msgId, knownReactions);
          } catch (error) {
            console.warn("Could not refresh old reaction state:", error);
            knownReactions = {};
          }
        }

        const before = { ...knownReactions };
        const after = { ...before };
        const shouldRemove = after[WHO] === emoji;

        if (shouldRemove) delete after[WHO];
        else after[WHO] = emoji;

        rememberReactions(msgId, after);
        const wrap = getReactionWrap(msgId);
        if (wrap) renderReactions(wrap, after, msgId);

        try {
          await messagesRef.doc(msgId).update({
            [`reactions.${WHO}`]: shouldRemove
              ? firebase.firestore.FieldValue.delete()
              : emoji,
          });
        } catch (error) {
          rememberReactions(msgId, before);
          if (wrap) renderReactions(wrap, before, msgId);
          console.warn("Reaction update failed:", error);
          showMiniNotif("Could not save reaction");
        }
      });

    _reactionMutationQueues.set(mutationKey, mutation);
    const clearMutation = () => {
      if (_reactionMutationQueues.get(mutationKey) === mutation) {
        _reactionMutationQueues.delete(mutationKey);
      }
    };
    mutation.then(clearMutation, clearMutation);
    return mutation;
  }

  function renderReactions(wrap, reactions, msgId) {
    const existing = wrap.querySelector(".reaction-row");
    if (existing) existing.remove();

    if (!reactions || Object.keys(reactions).length === 0) {
      wrap.classList.remove("has-reactions");
      return;
    }

    const counts = {};
    for (const [user, emoji] of Object.entries(reactions)) {
      if (!counts[emoji]) counts[emoji] = { emoji, users: [] };
      counts[emoji].users.push(user);
    }

    const row = document.createElement("div");
    row.className = "reaction-row";

    for (const { emoji, users } of Object.values(counts)) {
      const pill = document.createElement("button");
      pill.className = "reaction-pill" + (users.includes(WHO) ? " mine" : "");
      const emojiSpan = document.createElement("span");
      emojiSpan.className = "reaction-emoji";
      emojiSpan.textContent = emoji;
      pill.appendChild(emojiSpan);
      if (users.length > 1) {
        const countSpan = document.createElement("span");
        countSpan.className = "reaction-count";
        countSpan.textContent = users.length;
        pill.appendChild(countSpan);
      }
      pill.title = users.map((u) => SENDER_DISPLAY[u] || u).join(", ");
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        saveReaction(msgId, emoji);
      });
      row.appendChild(pill);
    }

    const bubble = wrap.querySelector(".bubble");
    const msgTime = wrap.querySelector(".msg-time");
    if (bubble && msgTime) {
      wrap.insertBefore(row, msgTime);
    } else if (bubble) {
      wrap.appendChild(row);
    } else {
      wrap.appendChild(row);
    }
    wrap.classList.add("has-reactions");
  }

  function closeReactionBar() {
    if (!activeReactionBar) return;

    const bar = activeReactionBar;
    activeReactionBar = null;
    reactionBarMsgId = null;
    bar.remove();
    unlockScroll();
  }

  function openReactionBar(msgId, row) {
    closeReactionBar();
    lockScroll();

    if (navigator.vibrate) navigator.vibrate([10, 30, 10]);

    const bar = document.createElement("div");
    bar.className = "reaction-bar";
    const isSent = row.classList.contains("sent");
    bar.classList.add(isSent ? "reaction-bar-sent" : "reaction-bar-recv");

    const quickReactions = getQuickReactions();
    quickReactions.forEach((emoji) => {
      const btn = document.createElement("button");
      btn.className = "reaction-bar-btn";
      btn.textContent = emoji;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMobileMessageMenus();
        saveReaction(msgId, emoji);
        showHeartBurst(row.querySelector(".bubble") || row, emoji);
      });
      bar.appendChild(btn);
    });

    const plusBtn = document.createElement("button");
    plusBtn.className = "reaction-bar-btn reaction-bar-plus";
    plusBtn.textContent = "＋";
    plusBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeActiveImageActionPopover({ closeReaction: false });
      closeReactionBar();
      openReactionPicker(msgId, row);
    });
    bar.appendChild(plusBtn);


    // Append to body as fixed so it is never clipped by overflow:hidden parents
    bar.style.position = "fixed";
    bar.style.visibility = "hidden"; // measure before showing
    document.body.appendChild(bar);

    activeReactionBar = bar;
    reactionBarMsgId = msgId;

    // Position after a frame so we can measure bar dimensions
    requestAnimationFrame(() => {
      const wrap = row.querySelector(".bubble-wrap");
      const wrapRect = wrap.getBoundingClientRect();
      const barW = bar.offsetWidth || 260;
      const barH = bar.offsetHeight || 52;
      const margin = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Vertical: prefer above the bubble-wrap, fall back to below
      let top;
      const spaceAbove = wrapRect.top - margin;
      const spaceBelow = vh - wrapRect.bottom - margin;
      if (spaceAbove >= barH || spaceAbove >= spaceBelow) {
        top = wrapRect.top - barH - margin;
      } else {
        top = wrapRect.bottom + margin;
      }

      // Horizontal: anchor to bubble edge, clamp inside viewport
      let left = isSent
        ? wrapRect.right - barW // right-align to sent bubble
        : wrapRect.left; // left-align to received bubble
      left = Math.max(margin, Math.min(left, vw - barW - margin));
      top = Math.max(margin, Math.min(top, vh - barH - margin));

      bar.style.top = top + "px";
      bar.style.left = left + "px";
      bar.style.visibility = "";

      bar.classList.add("visible");
    });
  }

  function openReactionPicker(msgId, row) {
    lockScroll();
    const overlay = document.createElement("div");
    overlay.className = "reaction-picker-overlay";

    const sheet = document.createElement("div");
    sheet.className = "reaction-picker-sheet";

    const title = document.createElement("div");
    title.className = "reaction-picker-title";
    title.textContent = "React with…";
    sheet.appendChild(title);

    let editMode = null;

    const capsuleLabel = document.createElement("div");
    capsuleLabel.className = "reaction-picker-section-label";
    capsuleLabel.textContent = "Your capsule — tap a slot to edit it";
    sheet.appendChild(capsuleLabel);

    const quickRow = document.createElement("div");
    quickRow.className = "reaction-picker-quick-row";
    const currentQuick = getQuickReactions();
    const workingQuick = [...currentQuick];

    function renderQuickSlots() {
      quickRow.innerHTML = "";
      workingQuick.forEach((emoji, idx) => {
        const slot = document.createElement("button");
        slot.className = "reaction-picker-quick-slot";
        slot.textContent = emoji;
        slot.title = "Tap to select this slot for editing";
        slot.dataset.slotIdx = idx;
        if (editMode === `slot-${idx}`) slot.classList.add("active-slot");
        slot.addEventListener("click", () => {
          editMode = editMode === `slot-${idx}` ? null : `slot-${idx}`;
          renderQuickSlots();
          updateModeHint();
        });
        quickRow.appendChild(slot);
      });
    }
    renderQuickSlots();
    sheet.appendChild(quickRow);

    const defaultLabel = document.createElement("div");
    defaultLabel.className = "reaction-picker-section-label";
    defaultLabel.textContent = "Double-tap emoji (shown on double-tap)";
    sheet.appendChild(defaultLabel);

    const defaultRow = document.createElement("div");
    defaultRow.className = "reaction-picker-default-row";

    let workingDefault = getDoubleTapEmoji();

    const defaultSlot = document.createElement("button");
    defaultSlot.className = "reaction-picker-default-slot";
    defaultSlot.title = "Tap to change your double-tap emoji";

    function renderDefaultSlot() {
      defaultSlot.innerHTML = "";
      const emojiSpan = document.createElement("span");
      emojiSpan.textContent = workingDefault;
      const labelSpan = document.createElement("span");
      labelSpan.className = "default-slot-label";
      labelSpan.textContent = "double-tap";
      defaultSlot.appendChild(emojiSpan);
      defaultSlot.appendChild(labelSpan);
      if (editMode === "default") defaultSlot.classList.add("active-slot");
      else defaultSlot.classList.remove("active-slot");
    }
    renderDefaultSlot();

    defaultSlot.addEventListener("click", () => {
      editMode = editMode === "default" ? null : "default";
      renderDefaultSlot();
      renderQuickSlots();
      updateModeHint();
    });
    defaultRow.appendChild(defaultSlot);
    sheet.appendChild(defaultRow);

    const modeHint = document.createElement("div");
    modeHint.className = "reaction-picker-subtitle";
    function updateModeHint() {
      if (editMode === null) {
        modeHint.textContent =
          "Tap an emoji below to react — or tap a capsule slot above to edit it";
      } else if (editMode === "default") {
        modeHint.textContent =
          "Now tap any emoji below to set your double-tap default ↓";
      } else {
        const idx = parseInt(editMode.split("-")[1]);
        modeHint.textContent = `Editing capsule slot ${idx + 1} — tap an emoji below to replace it ↓`;
      }
    }
    updateModeHint();
    sheet.appendChild(modeHint);

    const allLabel = document.createElement("div");
    allLabel.className = "reaction-picker-section-label";
    allLabel.textContent = "All emojis";
    sheet.appendChild(allLabel);

    const grid = document.createElement("div");
    grid.className = "reaction-picker-grid";

    ALL_REACTION_EMOJIS.forEach((emoji) => {
      const btn = document.createElement("button");
      btn.className = "reaction-picker-emoji";
      btn.textContent = emoji;
      btn.addEventListener("click", () => {
        if (editMode === null) {
          saveReaction(msgId, emoji);
          overlay.remove();
          unlockScroll();
        } else if (editMode === "default") {
          workingDefault = emoji;
          renderDefaultSlot();
          editMode = null;
          updateModeHint();
          showMiniNotif(`Double-tap emoji set to ${emoji} 💌`);
        } else {
          const idx = parseInt(editMode.split("-")[1]);
          workingQuick[idx] = emoji;
          editMode = null;
          renderQuickSlots();
          updateModeHint();
          showMiniNotif(`Capsule slot ${idx + 1} updated to ${emoji}`);
        }
      });
      grid.appendChild(btn);
    });
    sheet.appendChild(grid);

    const closeBtn = document.createElement("button");
    closeBtn.className = "reaction-picker-close";
    closeBtn.textContent = "Save & Close";
    closeBtn.addEventListener("click", () => {
      saveCapsuleToFirestore(workingQuick, workingDefault);
      overlay.remove();
      unlockScroll();
    });
    sheet.appendChild(closeBtn);

    overlay.appendChild(sheet);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        saveCapsuleToFirestore(workingQuick, workingDefault);
        overlay.remove();
        unlockScroll();
      }
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
  }

  document.addEventListener("click", (e) => {
    if (activeReactionBar && !activeReactionBar.contains(e.target)) {
      if (!document.querySelector(".img-action-popover")?.contains(e.target)) {
        closeMobileMessageMenus();
      }
    }
  });

  // Global dropdown close is handled by the mousedown listener registered above attachHoverActions

  // ─── ATTACH REACTIONS TO A ROW ────────────────────────────────────
  // On mobile: long-press on bubble (including over images) opens reaction bar.
  // Images handle their own double-tap/single-tap via touch handlers above.
  // We listen at the bubble level but skip if the exact target is a grid-img
  // (the image touchend already called e.preventDefault() so no click fires,
  // but touchstart/touchmove still bubble up for swipe detection).
  function attachReactions(row, msg, msgId) {
    const bubble = row.querySelector(".bubble");

    let _lp = null;
    let _lpFired = false;
    let _lastTap = 0;
    let _moved = false;
    let _startX = 0;
    let _startY = 0;

    bubble.addEventListener(
      "touchstart",
      (e) => {
        if (!isTouchOnlyUI()) return;

        // On mobile, holding any part of the message — text or image —
        // should open the reaction capsule. Image holds may also open the
        // image-actions menu from the image-specific handler.

        _moved = false;
        _lpFired = false;
        _startX = e.touches[0].clientX;
        _startY = e.touches[0].clientY;
        const sinceLastTap = Date.now() - _lastTap;
        if (sinceLastTap < 350) return;

        _lp = setTimeout(() => {
          _lp = null;
          if (_moved) return;
          _lpFired = true;
          openReactionBar(msgId, row);
        }, 650);
      },
      { passive: true },
    );

    bubble.addEventListener(
      "touchmove",
      (e) => {
        if (!isTouchOnlyUI()) return;

        const t = e.touches[0];
        const dx = Math.abs(t.clientX - _startX);
        const dy = Math.abs(t.clientY - _startY);
        if (dx > 10 || dy > 10) {
          _moved = true;
          clearTimeout(_lp);
          _lp = null;
        }
      },
      { passive: true },
    );

    bubble.addEventListener(
      "touchcancel",
      () => {
        if (!isTouchOnlyUI()) return;
        clearTimeout(_lp);
        _lp = null;
        _lpFired = false;
      },
      { passive: true },
    );

    bubble.addEventListener(
      "touchend",
      (e) => {
        if (!isTouchOnlyUI()) return;
        clearTimeout(_lp);
        _lp = null;

        if (_moved) return;
        if (_lpFired) {
          _lpFired = false;
          // The image-specific handler suppresses a delayed lightbox open.
          return;
        }


        // Only handle double-tap-to-react on non-image parts of the bubble
        // (images handle their own double-tap)
        if (e.target.classList.contains("grid-img")) return;

        const now = Date.now();
        const gap = now - _lastTap;
        _lastTap = now;

        if (gap < 350 && gap > 30) {
          e.preventDefault();
          e.stopPropagation();
          saveReaction(msgId, getDoubleTapEmoji());
          showHeartBurst(bubble, getDoubleTapEmoji());
        }
      },
      { passive: false },
    );

    // Desktop should not open reactions on long-press; the desktop UI uses
    // the explicit React button/menu instead.
    let _mlp = null;
    bubble.addEventListener("mousedown", (e) => {
      if (isTouchOnlyUI()) return;
      clearTimeout(_mlp);
      _mlp = null;
    });
    bubble.addEventListener("mouseup", () => {
      clearTimeout(_mlp);
      _mlp = null;
    });
    bubble.addEventListener("mouseleave", () => {
      clearTimeout(_mlp);
      _mlp = null;
    });
  }

  function showHeartBurst(bubble, emoji) {
    const rect = bubble.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const heart = document.createElement("span");
    heart.className = "heart-burst";
    heart.textContent = emoji || "❤️";
    heart.style.left = cx + "px";
    heart.style.top = cy + "px";
    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), 750);
  }

  // ─── DESKTOP HOVER ACTIONS (3-dot menu) ──────────────────────────
  // Dropdown is appended to document.body with position:fixed so it always
  // renders above every message and is never clipped by overflow:hidden parents.
  // This also fixes the blur button being unclickable.

  let _activeDropdown = null; // { dropdownEl, triggerEl, actionsWrap }

  function closeAllDropdowns() {
    if (_activeDropdown) {
      _activeDropdown.dropdownEl.remove();
      _activeDropdown.triggerEl.classList.remove("open");
      _activeDropdown.actionsWrap.classList.remove("menu-open");
      _activeDropdown = null;
      unlockScroll();
    }
  }

  // Close dropdown when clicking anywhere outside it.
  // Use mousedown (not click) so it fires before the trigger's click handler,
  // allowing re-click on the trigger to properly toggle closed.
  document.addEventListener("mousedown", (e) => {
    if (!_activeDropdown) return;
    if (
      _activeDropdown.dropdownEl.contains(e.target) ||
      _activeDropdown.triggerEl.contains(e.target)
    )
      return;
    closeAllDropdowns();
  });

  function attachHoverActions(row, msg, msgId) {
    // Mobile uses hold-on-image for image actions. The three-dot
    // message menu is reserved for larger/fine-pointer devices.
    if (isTouchOnlyUI()) return;

    const isSent = row.classList.contains("sent");

    const imgUrls = msg.imageUrls
      ? msg.imageUrls
      : msg.imageUrl
        ? [msg.imageUrl]
        : [];

    // ── Trigger button ──
    const trigger = document.createElement("button");
    trigger.className = "msg-actions-trigger";
    trigger.title = "Message actions";
    trigger.textContent = "•••";

    // ── Wrapper — attached to bubble-wrap with position:absolute ──
    // This makes it always appear directly beside the bubble regardless of row width.
    const actionsWrap = document.createElement("div");
    actionsWrap.className =
      "msg-hover-actions " + (isSent ? "actions-sent" : "actions-recv");
    actionsWrap.appendChild(trigger);

    function buildAndOpenDropdown() {
      // If already open for this trigger, close and bail
      if (_activeDropdown && _activeDropdown.triggerEl === trigger) {
        closeAllDropdowns();
        return;
      }
      // Close any other open dropdown
      closeAllDropdowns();

      const dropdown = document.createElement("div");
      dropdown.className = "msg-actions-dropdown-fixed";

      // ── React ──
      const reactItem = document.createElement("button");
      reactItem.className = "msg-action-item";
      const reactIcon = document.createElement("span");
      reactIcon.className = "action-icon";
      reactIcon.textContent = "😊";
      reactItem.appendChild(reactIcon);
      reactItem.appendChild(document.createTextNode(" React"));
      reactItem.addEventListener("mousedown", (e) => e.stopPropagation());
      reactItem.addEventListener("click", (e) => {
        e.stopPropagation();
        closeAllDropdowns();
        openReactionBar(msgId, row);
      });

      // ── Reply ──
      const divider1 = document.createElement("hr");
      divider1.className = "msg-action-divider";

      const replyItem = document.createElement("button");
      replyItem.className = "msg-action-item";
      const replyIcon = document.createElement("span");
      replyIcon.className = "action-icon";
      replyIcon.textContent = "↩";
      replyItem.appendChild(replyIcon);
      replyItem.appendChild(document.createTextNode(" Reply"));
      replyItem.addEventListener("mousedown", (e) => e.stopPropagation());
      replyItem.addEventListener("click", (e) => {
        e.stopPropagation();
        closeAllDropdowns();
        startReply(msg, msgId);
      });

      // attachHoverActions already exits on mobile, so this is desktop-only.
      dropdown.appendChild(reactItem);
      dropdown.appendChild(divider1);
      dropdown.appendChild(replyItem);

      if (imgUrls.length > 0) {
        // ── Save ──
        const divider2 = document.createElement("hr");
        divider2.className = "msg-action-divider";

        const saveItem = document.createElement("button");
        saveItem.className = "msg-action-item";
        const saveIcon = document.createElement("span");
        saveIcon.className = "action-icon";
        saveIcon.textContent = "💾";
        saveItem.appendChild(saveIcon);
        saveItem.appendChild(
          document.createTextNode(
            " " + (imgUrls.length > 1 ? "Save Images" : "Save Image"),
          ),
        );
        saveItem.addEventListener("mousedown", (e) => e.stopPropagation());
        saveItem.addEventListener("click", (e) => {
          e.stopPropagation();
          closeAllDropdowns();
          imgUrls.forEach((url) => saveImageToDevice(url));
        });

        dropdown.appendChild(divider2);
        dropdown.appendChild(saveItem);

        const divider3 = document.createElement("hr");
        divider3.className = "msg-action-divider";

        const blurAllItem = document.createElement("button");
        blurAllItem.className = "msg-action-item";
        const blurAllIcon = document.createElement("span");
        blurAllIcon.className = "action-icon";
        const allBlurred = imgUrls.every((url) => isImageBlurred(url));
        blurAllIcon.textContent = allBlurred ? "👁️" : "🫣";
        blurAllItem.appendChild(blurAllIcon);
        blurAllItem.appendChild(
          document.createTextNode(
            allBlurred ? " Unblur All Images" : " Blur All Images",
          ),
        );
        blurAllItem.addEventListener("mousedown", (e) => e.stopPropagation());
        blurAllItem.addEventListener("click", async (e) => {
          e.stopPropagation();
          closeAllDropdowns();
          try {
            await setImagesBlurred(imgUrls, !allBlurred);
          } catch (_) {
            showMiniNotif("Could not save blur setting");
          }
        });

        dropdown.appendChild(divider3);
        dropdown.appendChild(blurAllItem);

        if (imgUrls.length > 1) {
          const blurSeparateItem = document.createElement("button");
          blurSeparateItem.className = "msg-action-item";
          const blurSeparateIcon = document.createElement("span");
          blurSeparateIcon.className = "action-icon";
          blurSeparateIcon.textContent = "🖼️";
          blurSeparateItem.appendChild(blurSeparateIcon);
          blurSeparateItem.appendChild(
            document.createTextNode(" Blur Separately"),
          );
          blurSeparateItem.addEventListener("mousedown", (e) =>
            e.stopPropagation(),
          );
          blurSeparateItem.addEventListener("click", (e) => {
            e.stopPropagation();
            openSeparateBlurPicker(imgUrls);
          });
          dropdown.appendChild(blurSeparateItem);
        }
      }

      // Append to body so it's never clipped by any parent overflow
      document.body.appendChild(dropdown);

      // Measure and position after render
      requestAnimationFrame(() => {
        const triggerRect = trigger.getBoundingClientRect();
        const ddW = dropdown.offsetWidth || 170;
        const ddH = dropdown.offsetHeight || (imgUrls.length > 0 ? 190 : 115);
        const margin = 8;
        const gap = 6; // gap between trigger bottom and dropdown top
        const vp = { w: window.innerWidth, h: window.innerHeight };

        // Vertically: open just below the trigger; flip above if not enough room below
        let top = triggerRect.bottom + gap;
        if (top + ddH > vp.h - margin) {
          top = triggerRect.top - ddH - gap;
        }

        // Horizontally: right-align to trigger for sent, left-align for recv
        let left;
        if (isSent) {
          left = triggerRect.right - ddW; // right edge of dropdown = right edge of trigger
        } else {
          left = triggerRect.left; // left edge of dropdown = left edge of trigger
        }

        // Clamp to viewport
        left = Math.max(margin, Math.min(left, vp.w - ddW - margin));
        top = Math.max(margin, Math.min(top, vp.h - ddH - margin));

        dropdown.style.top = top + "px";
        dropdown.style.left = left + "px";
        dropdown.style.width = "170px";

        lockScroll();
        dropdown.classList.add("open");
      });

      trigger.classList.add("open");
      actionsWrap.classList.add("menu-open");
      _activeDropdown = {
        dropdownEl: dropdown,
        triggerEl: trigger,
        actionsWrap,
      };
    }

    // stopPropagation on mousedown prevents the document mousedown handler
    // from closing the dropdown before the click handler opens it
    trigger.addEventListener("mousedown", (e) => e.stopPropagation());
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      buildAndOpenDropdown();
    });

    // Attach actionsWrap to the bubble-wrap so position:absolute is relative to it
    const bubbleWrap = row.querySelector(".bubble-wrap");
    if (bubbleWrap) {
      bubbleWrap.appendChild(actionsWrap);
    } else {
      row.appendChild(actionsWrap); // fallback
    }
  }

  // ─── SWIPE-TO-REPLY ───────────────────────────────────────────────
  // FIX: Works on both text messages and image messages.
  // Image touchevents no longer stopPropagation, so swipe is detected at row level.
  const SWIPE_THRESHOLD = 55;

  function attachSwipeReply(row, msg, id) {
    let startX = 0,
      startY = 0,
      dx = 0;
    let swiping = false;
    let triggered = false;

    row.addEventListener(
      "touchstart",
      (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        dx = 0;
        swiping = false;
        triggered = false;
      },
      { passive: true },
    );

    row.addEventListener(
      "touchmove",
      (e) => {
        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;
        dx = x - startX;
        const dy = Math.abs(y - startY);

        if (!swiping && Math.abs(dx) > 8 && dy < Math.abs(dx)) {
          swiping = true;
          row.classList.add("swiping");
        }
        if (!swiping) return;

        const isSent = row.classList.contains("sent");
        const validDir = isSent ? dx < 0 : dx > 0;
        if (!validDir) {
          dx = 0;
          return;
        }

        const absDx = Math.abs(dx);
        const limited = Math.min(absDx, SWIPE_THRESHOLD * 1.2);
        const translateX = isSent ? -limited : limited;

        row.style.transform = `translateX(${translateX}px)`;

        if (absDx > SWIPE_THRESHOLD * 0.6) {
          row.classList.add("swipe-reveal");
        } else {
          row.classList.remove("swipe-reveal");
        }
      },
      { passive: true },
    );

    row.addEventListener(
      "touchend",
      () => {
        if (!swiping) return;
        row.classList.remove("swiping");
        row.classList.remove("swipe-reveal");
        row.style.transform = "";

        if (Math.abs(dx) > SWIPE_THRESHOLD && !triggered) {
          triggered = true;
          if (navigator.vibrate) navigator.vibrate(20);
          startReply(msg, id);
        }
      },
      { passive: true },
    );
  }

  // ─── JUMP TO QUOTED MESSAGE ───────────────────────────────────────
  function jumpToMessage(id) {
    const row = getTrackedMessageRow(id);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("highlight-flash");
    setTimeout(() => row.classList.remove("highlight-flash"), 1300);
  }

  // ─── PAGINATION ──────────────────────────────────────────────────
  const PAGE_SIZE = 40;
  let _oldestDoc = null;
  let _allLoaded = false;
  let _loadingMore = false;
  let _topSpinner = null;

  function showTopSpinner() {
    if (_topSpinner) return;
    _topSpinner = document.createElement("div");
    _topSpinner.id = "load-more-spinner";
    _topSpinner.innerHTML = `<span class="load-spinner-dot"></span><span class="load-spinner-dot"></span><span class="load-spinner-dot"></span>`;
    msgContainer.prepend(_topSpinner);
  }

  function hideTopSpinner() {
    if (_topSpinner) {
      _topSpinner.remove();
      _topSpinner = null;
    }
  }

  async function loadMoreMessages() {
    if (_loadingMore || _allLoaded || !_oldestDoc) return;
    _loadingMore = true;
    showTopSpinner();

    const scrollTopBefore = msgContainer.scrollTop;
    const scrollHeightBefore = msgContainer.scrollHeight;

    try {
      const snap = await messagesRef
        .orderBy("timestamp", "asc")
        .endBefore(_oldestDoc)
        .limitToLast(PAGE_SIZE)
        .get();

      if (snap.empty) {
        _allLoaded = true;
        return;
      }

      const savedLastDate = lastDate;
      const savedLastSender = lastSender;
      lastDate = null;
      lastSender = null;

      const frag = document.createDocumentFragment();
      const rowsToRegister = [];
      snap.docs.forEach((doc) => {
        const els = buildMessageElements(doc.data(), doc.id, false);
        els.forEach((el) => frag.appendChild(el));
        const row = els[els.length - 1];
        if (row?.classList?.contains("msg-row")) {
          rowsToRegister.push([doc.id, row]);
        }
      });
      observeLazyImages(frag);

      const firstReal = (() => {
        for (const child of msgContainer.children) {
          if (child.id !== "load-more-spinner") return child;
        }
        return null;
      })();
      if (firstReal) msgContainer.insertBefore(frag, firstReal);
      else msgContainer.appendChild(frag);

      rowsToRegister.forEach(([messageId, row]) =>
        trackMessageRow(messageId, row),
      );

      lastDate = savedLastDate;
      lastSender = savedLastSender;
      _oldestDoc = snap.docs[0];
      if (snap.docs.length < PAGE_SIZE) _allLoaded = true;

      const heightAdded = msgContainer.scrollHeight - scrollHeightBefore;
      msgContainer.scrollTop = scrollTopBefore + heightAdded;
    } catch (error) {
      console.error("Load more failed:", error);
      showMiniNotif("Older messages could not be loaded");
    } finally {
      hideTopSpinner();
      _loadingMore = false;
    }
  }

  // ─── BOUNDED REAL-TIME LISTENER ───────────────────────────────────
  // One last-page query handles new messages and recent reactions. It never
  // listens to the entire collection, so realtime read cost stays bounded.
  const recentMessagesQuery = messagesRef
    .orderBy("timestamp", "asc")
    .limitToLast(PAGE_SIZE);

  let recentMessagesInitialised = false;
  const unsubscribeRecentMessages = recentMessagesQuery.onSnapshot(
    { includeMetadataChanges: false },
    (snap) => {
      if (!recentMessagesInitialised) {
        if (!snap.empty) {
          _oldestDoc = snap.docs[0];
          lastDate = null;
          lastSender = null;
          _pendingFirstBatch = snap.docs.map((doc) => {
            const msg = doc.data();
            noteIncomingMessage(msg);
            return { msg, id: doc.id };
          });
          clearTimeout(_firstBatchTimer);
          _firstBatchTimer = setTimeout(flushFirstBatch, 60);
          if (snap.docs.length < PAGE_SIZE) _allLoaded = true;
        } else {
          loader.style.display = "none";
        }

        recentMessagesInitialised = true;
        return;
      }

      snap.docChanges().forEach((change) => {
        const msgId = change.doc.id;
        const msg = change.doc.data();

        if (change.type === "added") {
          noteIncomingMessage(msg);
          renderMessage(msg, msgId, true);

          if (msg.sender !== WHO) {
            sendBrowserNotif(
              SENDER_DISPLAY[msg.sender] || msg.sender,
              msg.text,
              msg.imageUrls ? msg.imageUrls[0] : msg.imageUrl,
            );
          }
          return;
        }

        if (change.type === "modified") {
          upsertSharedMediaItems(msgId, msg);
          const reactions = msg.reactions || {};
          const reactionsJSON = JSON.stringify(reactions);
          if (_lastKnownReactions.get(msgId) !== reactionsJSON) {
            const normalized = rememberReactions(msgId, reactions);
            const wrap = getReactionWrap(msgId);
            if (wrap) renderReactions(wrap, normalized, msgId);
          }
        }
        // When a document leaves limitToLast because a newer message arrived,
        // its already-rendered DOM row remains available in the loaded history.
      });
    },
    (error) => {
      console.error("Live message listener failed:", error);
      loader.style.display = "none";
    },
  );
  trackCleanup(unsubscribeRecentMessages);

  const handleChatFocus = () => updateMyReadTime();
  window.addEventListener("focus", handleChatFocus);
  trackCleanup(() => window.removeEventListener("focus", handleChatFocus));

  // ─── LIGHTBOX ────────────────────────────────────────────────────
  // FIX: prev/next arrows always visible when applicable.
  // FIX: no double-open glitch — touch uses preventDefault so no synthetic click fires.
  // FIX: click zones on image itself for navigation.


  function openLightbox(images, startIdx = 0, useExactList = false) {
    const clickedUrl = images[startIdx];
    if (useExactList) {
      lbImages = [...images];
      lbIndex = Math.max(0, Math.min(startIdx, lbImages.length - 1));
    } else {
      // Normal message lightbox follows the actual chronological DOM order.
      lbImages = getChronologicalChatImageUrls();
      const globalIdx = lbImages.indexOf(clickedUrl);

      // The clicked image should already be in the DOM. Keep a safe fallback
      // for a just-rendered image whose DOM registration has not completed yet.
      if (globalIdx >= 0) {
        lbIndex = globalIdx;
      } else {
        lbImages = [...images];
        lbIndex = Math.max(0, Math.min(startIdx, lbImages.length - 1));
      }
    }

    closeReactionBar();
    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
    showLightboxImage();
    history.pushState({ lightboxOpen: true }, "");
  }

  function showLightboxImage() {
    lightboxImg.classList.remove("lb-fade");
    void lightboxImg.offsetWidth;
    lightboxImg.classList.add("lb-fade");
    lightboxImg.src = lbImages[lbIndex];

    const navEl = document.getElementById("lightbox-nav");
    if (lbImages.length > 1) {
      lightboxCounter.textContent = `${lbIndex + 1} / ${lbImages.length}`;
      navEl.style.display = "flex";
    } else {
      navEl.style.display = "none";
    }

    lbPrev.disabled = lbIndex === 0;
    lbNext.disabled = lbIndex === lbImages.length - 1;
  }

  lbPrev.addEventListener("click", () => {
    if (lbIndex > 0) {
      lbIndex--;
      showLightboxImage();
    }
  });
  lbNext.addEventListener("click", () => {
    if (lbIndex < lbImages.length - 1) {
      lbIndex++;
      showLightboxImage();
    }
  });

  // Clicking left half of image = previous, right half = next, single image = close
  lightboxImg.addEventListener("click", (e) => {
    e.stopPropagation();
    if (lbImages.length <= 1) {
      closeLightbox();
      return;
    }
    const rect = lightboxImg.getBoundingClientRect();
    const clickedLeft = e.clientX < rect.left + rect.width / 2;
    if (clickedLeft && lbIndex > 0) {
      lbIndex--;
      showLightboxImage();
    } else if (!clickedLeft && lbIndex < lbImages.length - 1) {
      lbIndex++;
      showLightboxImage();
    }
  });

  // Touch swipe on lightbox
  let lbTouchStartX = null;
  let lbTouchStartY = null;
  lightbox.addEventListener(
    "touchstart",
    (e) => {
      if (e.target === lightboxClose) return;
      lbTouchStartX = e.touches[0].clientX;
      lbTouchStartY = e.touches[0].clientY;
    },
    { passive: true },
  );

  lightbox.addEventListener(
    "touchend",
    (e) => {
      if (lbTouchStartX === null) return;
      const dx = e.changedTouches[0].clientX - lbTouchStartX;
      const dy = Math.abs(e.changedTouches[0].clientY - lbTouchStartY);
      // Only treat as swipe if horizontal movement dominates
      if (Math.abs(dx) > 50 && Math.abs(dx) > dy) {
        if (dx < 0 && lbIndex < lbImages.length - 1) {
          lbIndex++;
          showLightboxImage();
        } else if (dx > 0 && lbIndex > 0) {
          lbIndex--;
          showLightboxImage();
        }
      }
      lbTouchStartX = null;
      lbTouchStartY = null;
    },
    { passive: true },
  );

  lightboxClose.addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  function closeLightbox() {
    if (_activeImageActionPopoverClose) _activeImageActionPopoverClose();
    lightbox.classList.remove("open");
    document.body.style.overflow = "";
    lbImages = [];
    lbIndex = 0;
    if (history.state && history.state.lightboxOpen) history.back();
  }

  // ─── IMAGE ACTION MENU (long-press on image) ──────────────────────
  async function saveImageToDevice(url, showNotice = true) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const ext = blob.type.includes("webp")
        ? "webp"
        : blob.type.includes("png")
          ? "png"
          : "jpg";
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `photo_${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(objUrl);
        a.remove();
      }, 1000);
      if (showNotice) showMiniNotif("💾 Image saved!");
    } catch (err) {
      window.open(url, "_blank", "noopener");
      if (showNotice) showMiniNotif("📂 Opened in new tab — long-press to save");
    }
  }

  let _activeImageActionPopoverClose = null;

  function closeActiveImageActionPopover(options = {}) {
    if (typeof _activeImageActionPopoverClose === "function") {
      _activeImageActionPopoverClose(options);
    }
  }

  function closeMobileMessageMenus() {
    // The reaction capsule and image action menu form one temporary mobile UI.
    // Close the popover first without recursively closing the capsule, then
    // close the capsule itself. Both cleanup functions safely share scroll lock.
    closeActiveImageActionPopover({ closeReaction: false });
    closeReactionBar();
  }

  function openImageActionMenu(
    imgUrl,
    anchorEl,
    isSentMsg,
    allImageUrls = [imgUrl],
  ) {
    // This app menu is deliberately mobile/touch-only. Desktop uses 3 dots.
    if (!isTouchOnlyUI()) return;

    const messageUrls = [
      ...new Set(
        (Array.isArray(allImageUrls) ? allImageUrls : [imgUrl]).filter(Boolean),
      ),
    ];

    if (_activeImageActionPopoverClose) {
      _activeImageActionPopoverClose();
    }
    unlockScroll();
    lockScroll();

    const popover = document.createElement("div");
    popover.className = "img-action-popover";
    let closeOnOutside = null;

    let collisionRecheckTimers = [];

    const closePopover = ({ closeReaction = false } = {}) => {
      collisionRecheckTimers.forEach((timer) => clearTimeout(timer));
      collisionRecheckTimers = [];
      popover.remove();
      if (closeOnOutside) {
        document.removeEventListener("pointerdown", closeOnOutside, true);
      }
      if (_activeImageActionPopoverClose === closePopover) {
        _activeImageActionPopoverClose = null;
      }
      unlockScroll();
      if (closeReaction) closeReactionBar();
    };
    _activeImageActionPopoverClose = closePopover;

    const isBlurred = isImageBlurred(imgUrl);
    const allBlurred =
      messageUrls.length > 0 &&
      messageUrls.every((url) => isImageBlurred(url));

    const items = [];

    items.push({
      icon: "💾",
      label: "Save Image",
      fn: async () => {
        closePopover({ closeReaction: true });
        await saveImageToDevice(imgUrl);
      },
    });

    if (messageUrls.length > 1) {
      items.push({
        icon: "📥",
        label: "Save All",
        fn: async () => {
          closePopover({ closeReaction: true });
          let saved = 0;
          for (const url of messageUrls) {
            try {
              await saveImageToDevice(url, false);
              saved += 1;
              await new Promise((resolve) => setTimeout(resolve, 140));
            } catch (_) {}
          }
          showMiniNotif(
            saved === messageUrls.length
              ? `💾 Saved all ${saved} images`
              : `💾 Saved ${saved} of ${messageUrls.length} images`,
          );
        },
      });
    }

    items.push({
      icon: isBlurred ? "👁️" : "🫣",
      label: isBlurred ? "Unblur" : "Blur",
      fn: async () => {
        closePopover({ closeReaction: true });
        try {
          await toggleImageBlur(imgUrl);
        } catch (_) {
          showMiniNotif("Could not save blur setting");
        }
      },
    });

    if (messageUrls.length > 1) {
      items.push({
        icon: allBlurred ? "👁️" : "🫣",
        label: allBlurred ? "Unblur All" : "Blur All",
        fn: async () => {
          closePopover({ closeReaction: true });
          try {
            await setImagesBlurred(messageUrls, !allBlurred);
          } catch (_) {
            showMiniNotif("Could not save blur setting");
          }
        },
      });
    }

    items.forEach(({ icon, label, fn }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "img-action-popover-btn";

      const iconSpan = document.createElement("span");
      iconSpan.textContent = icon;
      const labelSpan = document.createElement("span");
      labelSpan.textContent = label;

      btn.appendChild(iconSpan);
      btn.appendChild(labelSpan);
      btn.addEventListener("pointerdown", (e) => e.stopPropagation());
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
      popover.appendChild(btn);
    });

    document.body.appendChild(popover);

    const positionImagePopover = () => {
      if (!popover.isConnected) return;

      const rect = anchorEl.getBoundingClientRect();
      const pw = popover.offsetWidth || 170;
      const ph = popover.offsetHeight || 210;
      const margin = 10;
      const pad = 8;
      const collisionGap = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let originalTop = rect.top + rect.height / 2 - ph / 2;
      let originalLeft;

      if (isSentMsg) {
        originalLeft = rect.right + margin;
        if (originalLeft + pw > vw - pad) {
          originalLeft = rect.left - pw - margin;
        }
      } else {
        originalLeft = rect.left - pw - margin;
        if (originalLeft < pad) {
          originalLeft = rect.right + margin;
        }
      }

      const clampLeft = (value) =>
        Math.max(pad, Math.min(value, vw - pw - pad));
      const clampTop = (value) =>
        Math.max(pad, Math.min(value, vh - ph - pad));

      originalLeft = clampLeft(originalLeft);
      originalTop = clampTop(originalTop);

      let chosenLeft = originalLeft;
      let chosenTop = originalTop;

      const reaction =
        activeReactionBar &&
        activeReactionBar.isConnected &&
        activeReactionBar.classList.contains("visible")
          ? activeReactionBar
          : null;

      if (reaction) {
        const reactionRect = reaction.getBoundingClientRect();

        const overlapsReaction = (left, top) =>
          left < reactionRect.right + collisionGap &&
          left + pw > reactionRect.left - collisionGap &&
          top < reactionRect.bottom + collisionGap &&
          top + ph > reactionRect.top - collisionGap;

        const overlapArea = (left, top) => {
          const overlapW = Math.max(
            0,
            Math.min(left + pw, reactionRect.right + collisionGap) -
              Math.max(left, reactionRect.left - collisionGap),
          );
          const overlapH = Math.max(
            0,
            Math.min(top + ph, reactionRect.bottom + collisionGap) -
              Math.max(top, reactionRect.top - collisionGap),
          );
          return overlapW * overlapH;
        };

        if (overlapsReaction(chosenLeft, chosenTop)) {
          // Keep the normal anchored position whenever possible. Only when it
          // collides with the reaction capsule do we test nearby alternatives.
          const candidateValues = [
            [originalLeft, reactionRect.bottom + collisionGap],
            [originalLeft, reactionRect.top - ph - collisionGap],
            [reactionRect.right + collisionGap, originalTop],
            [reactionRect.left - pw - collisionGap, originalTop],
            [reactionRect.right + collisionGap, reactionRect.bottom + collisionGap],
            [reactionRect.left - pw - collisionGap, reactionRect.bottom + collisionGap],
            [reactionRect.right + collisionGap, reactionRect.top - ph - collisionGap],
            [reactionRect.left - pw - collisionGap, reactionRect.top - ph - collisionGap],
          ];

          const candidates = candidateValues.map(([left, top]) => {
            const clampedLeft = clampLeft(left);
            const clampedTop = clampTop(top);
            const displacement =
              Math.abs(clampedLeft - originalLeft) +
              Math.abs(clampedTop - originalTop);
            return {
              left: clampedLeft,
              top: clampedTop,
              overlaps: overlapsReaction(clampedLeft, clampedTop),
              area: overlapArea(clampedLeft, clampedTop),
              displacement,
            };
          });

          candidates.sort((a, b) => {
            if (a.overlaps !== b.overlaps) return a.overlaps ? 1 : -1;
            if (a.area !== b.area) return a.area - b.area;
            return a.displacement - b.displacement;
          });

          if (candidates.length) {
            chosenLeft = candidates[0].left;
            chosenTop = candidates[0].top;
          }
        }
      }

      popover.style.top = `${chosenTop}px`;
      popover.style.left = `${chosenLeft}px`;
      popover.classList.add("visible");
    };

    requestAnimationFrame(positionImagePopover);

    // The image menu opens about 50 ms before the reaction capsule on a hold.
    // Recheck after the capsule is positioned. If there is no collision, these
    // calls leave the image menu exactly where it originally opened.
    collisionRecheckTimers = [
      setTimeout(positionImagePopover, 90),
      setTimeout(positionImagePopover, 180),
    ];

    closeOnOutside = (event) => {
      if (popover.contains(event.target)) return;

      // A tap on the reaction capsule is an intentional reaction action.
      // Close only the image menu now; the reaction handler closes the capsule.
      if (activeReactionBar?.contains(event.target)) {
        closePopover({ closeReaction: false });
        return;
      }

      // A tap anywhere else dismisses the complete mobile message UI.
      closePopover({ closeReaction: true });
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
  }

  // ─── CAMERA ──────────────────────────────────────────────────────
  cameraBtn.addEventListener("click", openCamera);

  function ensureCameraEnhancementUI() {
    if (cameraStage) return;

    cameraEnhancementAbortController?.abort();
    cameraEnhancementAbortController = new AbortController();
    const cameraUiSignal = cameraEnhancementAbortController.signal;

    cameraStage = document.createElement("div");
    cameraStage.id = "camera-stage";
    cameraFeed.parentNode.insertBefore(cameraStage, cameraFeed);
    cameraStage.appendChild(cameraFeed);

    cameraFocusIndicator = document.createElement("div");
    cameraFocusIndicator.id = "camera-focus-indicator";
    cameraStage.appendChild(cameraFocusIndicator);

    cameraCountdownEl = document.createElement("div");
    cameraCountdownEl.id = "camera-countdown";
    cameraStage.appendChild(cameraCountdownEl);

    const optionsRow = document.createElement("div");
    optionsRow.id = "camera-options-row";

    const quickOptionsRow = document.createElement("div");
    quickOptionsRow.id = "camera-quick-options-row";

    const adjustmentsRow = document.createElement("div");
    adjustmentsRow.id = "camera-adjustments-row";

    const timerWrap = document.createElement("div");
    timerWrap.id = "camera-timer-wrap";

    cameraTimerBtn = document.createElement("button");
    cameraTimerBtn.type = "button";
    cameraTimerBtn.id = "camera-timer-btn";
    cameraTimerBtn.className = "cam-option-btn";
    cameraTimerBtn.textContent = "⏱ Off";

    cameraTimerMenu = document.createElement("div");
    cameraTimerMenu.id = "camera-timer-menu";
    cameraTimerMenu.innerHTML = `
      <button type="button" class="camera-timer-choice active" data-seconds="0">Off</button>
      <button type="button" class="camera-timer-choice" data-seconds="5">5s</button>
      <button type="button" class="camera-timer-choice" data-seconds="10">10s</button>
      <button type="button" class="camera-timer-choice" data-seconds="15">15s</button>
      <div class="camera-custom-timer">
        <input id="camera-custom-seconds" type="number" min="1" max="60" inputmode="numeric" placeholder="Custom" />
        <button id="camera-custom-set" type="button">Set</button>
      </div>
    `;

    timerWrap.appendChild(cameraTimerBtn);
    // Keep the popup at document level. The camera wrapper is transformed for
    // centering, which would otherwise make position: fixed behave like it is
    // fixed to the wrapper instead of the visible device viewport.
    document.body.appendChild(cameraTimerMenu);

    const cameraRatioWrap = document.createElement("label");
    cameraRatioWrap.id = "camera-ratio-wrap";
    cameraRatioWrap.setAttribute("for", "camera-ratio-select");
    cameraRatioWrap.innerHTML = `
      <span class="camera-ratio-label">Frame</span>
      <select id="camera-ratio-select" aria-label="Camera frame ratio">
        <option value="default">Default</option>
        <option value="1:1">1:1</option>
        <option value="4:3">4:3</option>
        <option value="16:9">16:9</option>
        <option value="9:16">9:16</option>
        <option value="8:16">8:16</option>
        <option value="3:1">3:1</option>
      </select>
    `;
    cameraRatioSelect = cameraRatioWrap.querySelector("#camera-ratio-select");
    cameraRatioSelect.value = cameraRatioKey;

    cameraZoomWrap = document.createElement("label");
    cameraZoomWrap.id = "camera-zoom-wrap";
    cameraZoomWrap.setAttribute("aria-label", "Camera zoom");
    cameraZoomWrap.innerHTML = `
      <span id="camera-zoom-min">0.5×</span>
      <input
        id="camera-zoom-slider"
        type="range"
        min="0.5"
        max="10"
        step="0.1"
        value="1"
        aria-label="Camera zoom"
      />
      <span id="camera-zoom-max">10×</span>
      <strong id="camera-zoom-value">1×</strong>
    `;
    cameraZoomSlider = cameraZoomWrap.querySelector("#camera-zoom-slider");
    cameraZoomValue = cameraZoomWrap.querySelector("#camera-zoom-value");
    cameraZoomMinLabel = cameraZoomWrap.querySelector("#camera-zoom-min");
    cameraZoomMaxLabel = cameraZoomWrap.querySelector("#camera-zoom-max");

    cameraExposureWrap = document.createElement("label");
    cameraExposureWrap.id = "camera-exposure-wrap";
    cameraExposureWrap.innerHTML = `
      <span aria-hidden="true">☀️</span>
      <input id="camera-exposure-slider" type="range" aria-label="Camera exposure" />
      <span id="camera-exposure-value">0</span>
    `;
    cameraExposureSlider = cameraExposureWrap.querySelector(
      "#camera-exposure-slider",
    );
    cameraExposureValue = cameraExposureWrap.querySelector(
      "#camera-exposure-value",
    );

    cameraTorchBtn = document.createElement("button");
    cameraTorchBtn.type = "button";
    cameraTorchBtn.id = "camera-torch-btn";
    cameraTorchBtn.className = "cam-option-btn";
    cameraTorchBtn.setAttribute("aria-label", "Turn flashlight on");
    cameraTorchBtn.title = "Flashlight";
    cameraTorchBtn.innerHTML = `
      <svg class="camera-torch-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path class="camera-torch-icon__beam" d="M8.5 2.8h7l-1.1 5.1H9.6L8.5 2.8Z"/>
        <path class="camera-torch-icon__body" d="M9.6 7.9h4.8v3.15l-1.25 1.6v7.55h-2.3v-7.55l-1.25-1.6V7.9Z"/>
        <path class="camera-torch-icon__spark" d="m18.2 5.1 1.2-1.2m-1.2 4.3h1.7M5.8 5.1 4.6 3.9m1.2 4.3H4.1"/>
      </svg>
      <span>Flash</span>
    `;

    quickOptionsRow.appendChild(timerWrap);
    quickOptionsRow.appendChild(cameraRatioWrap);
    quickOptionsRow.appendChild(cameraTorchBtn);

    adjustmentsRow.appendChild(cameraZoomWrap);
    adjustmentsRow.appendChild(cameraExposureWrap);

    optionsRow.appendChild(quickOptionsRow);
    optionsRow.appendChild(adjustmentsRow);

    cameraLiveWrap.insertBefore(
      optionsRow,
      document.getElementById("camera-controls"),
    );

    function positionCameraTimerMenu() {
      if (!cameraTimerMenu?.classList.contains("visible")) return;

      const buttonRect = cameraTimerBtn.getBoundingClientRect();
      const menuRect = cameraTimerMenu.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportWidth = viewport?.width || window.innerWidth;
      const viewportHeight = viewport?.height || window.innerHeight;
      const viewportRight = viewportLeft + viewportWidth;
      const viewportBottom = viewportTop + viewportHeight;
      const edgeGap = 10;
      const menuGap = 8;

      const menuWidth = Math.min(
        menuRect.width || 300,
        Math.max(0, viewportWidth - edgeGap * 2),
      );
      cameraTimerMenu.style.width = `${menuWidth}px`;

      // Read the height again after constraining the width because the custom
      // seconds row can wrap differently on very narrow screens.
      const measuredHeight = cameraTimerMenu.getBoundingClientRect().height;
      const maxAvailableHeight = Math.max(120, viewportHeight - edgeGap * 2);
      const menuHeight = Math.min(measuredHeight, maxAvailableHeight);
      cameraTimerMenu.style.maxHeight = `${maxAvailableHeight}px`;

      let left = buttonRect.left + buttonRect.width / 2 - menuWidth / 2;
      left = Math.max(
        viewportLeft + edgeGap,
        Math.min(left, viewportRight - menuWidth - edgeGap),
      );

      const spaceAbove = buttonRect.top - viewportTop - edgeGap;
      const spaceBelow = viewportBottom - buttonRect.bottom - edgeGap;
      let top;

      if (spaceAbove >= menuHeight + menuGap) {
        top = buttonRect.top - menuHeight - menuGap;
        cameraTimerMenu.dataset.placement = "above";
      } else if (spaceBelow >= menuHeight + menuGap) {
        top = buttonRect.bottom + menuGap;
        cameraTimerMenu.dataset.placement = "below";
      } else if (spaceBelow >= spaceAbove) {
        top = Math.max(
          viewportTop + edgeGap,
          Math.min(buttonRect.bottom + menuGap, viewportBottom - menuHeight - edgeGap),
        );
        cameraTimerMenu.dataset.placement = "below";
      } else {
        top = Math.max(
          viewportTop + edgeGap,
          Math.min(buttonRect.top - menuHeight - menuGap, viewportBottom - menuHeight - edgeGap),
        );
        cameraTimerMenu.dataset.placement = "above";
      }

      cameraTimerMenu.style.left = `${left}px`;
      cameraTimerMenu.style.top = `${top}px`;
    }

    function closeCameraTimerMenu() {
      cameraTimerMenu?.classList.remove("visible");
      if (!cameraTimerMenu) return;
      cameraTimerMenu.style.left = "";
      cameraTimerMenu.style.top = "";
      cameraTimerMenu.style.width = "";
      cameraTimerMenu.style.maxHeight = "";
      delete cameraTimerMenu.dataset.placement;
    }

    cameraTimerBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = !cameraTimerMenu.classList.contains("visible");
      if (!willOpen) {
        closeCameraTimerMenu();
        return;
      }

      cameraTimerMenu.classList.add("visible");
      requestAnimationFrame(positionCameraTimerMenu);
    }, { signal: cameraUiSignal });

    cameraTimerMenu
      .querySelectorAll(".camera-timer-choice")
      .forEach((button) => {
        button.addEventListener("click", () => {
          setCameraTimer(Number(button.dataset.seconds));
          closeCameraTimerMenu();
        }, { signal: cameraUiSignal });
      });

    cameraTimerMenu
      .querySelector("#camera-custom-set")
      .addEventListener("click", () => {
        const input = cameraTimerMenu.querySelector("#camera-custom-seconds");
        const requestedSeconds = Number(input.value);
        if (!Number.isFinite(requestedSeconds) || requestedSeconds < 1) return;
        const seconds = Math.round(Math.min(60, requestedSeconds));
        input.value = String(seconds);
        setCameraTimer(seconds);
        closeCameraTimerMenu();
      }, { signal: cameraUiSignal });

    cameraStage.addEventListener(
      "pointerdown",
      handleCameraPointerDown,
      { signal: cameraUiSignal },
    );
    cameraStage.addEventListener(
      "pointermove",
      handleCameraPointerMove,
      { signal: cameraUiSignal },
    );
    cameraStage.addEventListener(
      "pointerup",
      handleCameraPointerEnd,
      { signal: cameraUiSignal },
    );
    cameraStage.addEventListener(
      "pointercancel",
      handleCameraPointerEnd,
      { signal: cameraUiSignal },
    );
    cameraZoomSlider.addEventListener("input", () => {
      requestCameraZoom(Number(cameraZoomSlider.value));
    }, { signal: cameraUiSignal });

    cameraRatioSelect.addEventListener("change", () => {
      const requestedRatio = cameraRatioSelect.value;
      cameraRatioKey = Object.prototype.hasOwnProperty.call(
        CAMERA_RATIOS,
        requestedRatio,
      )
        ? requestedRatio
        : "default";

      clearSoftwareCameraZoomLayout({ restoreRatio: false });
      applyCameraRatioLayout();

      if (cameraZoomUsesSoftware && cameraZoomCurrent > 1) {
        requestAnimationFrame(() => {
          applySoftwareCameraZoom(cameraZoomCurrent);
        });
      }
    }, { signal: cameraUiSignal });

    cameraExposureSlider.addEventListener(
      "input",
      applyExposureCompensation,
      { signal: cameraUiSignal },
    );
    cameraTorchBtn.addEventListener(
      "click",
      toggleCameraTorch,
      { signal: cameraUiSignal },
    );

    document.addEventListener("click", (event) => {
      if (
        cameraTimerMenu &&
        !timerWrap.contains(event.target) &&
        !cameraTimerMenu.contains(event.target)
      ) {
        closeCameraTimerMenu();
      }
    }, { signal: cameraUiSignal });

    window.addEventListener(
      "resize",
      positionCameraTimerMenu,
      { passive: true, signal: cameraUiSignal },
    );
    window.visualViewport?.addEventListener(
      "resize",
      positionCameraTimerMenu,
      { passive: true, signal: cameraUiSignal },
    );
    window.visualViewport?.addEventListener(
      "scroll",
      positionCameraTimerMenu,
      { passive: true, signal: cameraUiSignal },
    );
    window.addEventListener(
      "resize",
      syncCameraStageAspect,
      { passive: true, signal: cameraUiSignal },
    );
    window.visualViewport?.addEventListener(
      "resize",
      syncCameraStageAspect,
      { passive: true, signal: cameraUiSignal },
    );
  }

  function setCameraTimer(seconds) {
    cameraTimerSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    cameraTimerBtn.textContent =
      cameraTimerSeconds > 0 ? `⏱ ${cameraTimerSeconds}s` : "⏱ Off";
    cameraTimerMenu
      .querySelectorAll(".camera-timer-choice")
      .forEach((button) => {
        button.classList.toggle(
          "active",
          Number(button.dataset.seconds) === cameraTimerSeconds,
        );
      });
  }

  function waitForVideoMetadata(requestId) {
    if (cameraFeed.readyState >= 1 && cameraFeed.videoWidth > 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        cameraFeed.removeEventListener("loadedmetadata", onLoaded);
        cameraFeed.removeEventListener("error", onError);
        clearTimeout(timeoutId);
      };
      const finish = (callback) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const onLoaded = () =>
        finish(() => {
          if (requestId !== cameraStreamRequestId) {
            reject(new DOMException("Camera request was replaced", "AbortError"));
          } else {
            resolve();
          }
        });
      const onError = () =>
        finish(() =>
          reject(cameraFeed.error || new Error("Could not load camera preview")),
        );
      const timeoutId = setTimeout(() => {
        finish(() =>
          reject(new DOMException("Camera preview timed out", "TimeoutError")),
        );
      }, 4000);

      cameraFeed.addEventListener("loadedmetadata", onLoaded, { once: true });
      cameraFeed.addEventListener("error", onError, { once: true });
    });
  }

  async function applyAutomaticCameraControls(track) {
    if (!track) return;
    const capabilities =
      typeof track.getCapabilities === "function"
        ? track.getCapabilities()
        : {};
    const advanced = {};

    if (capabilities.focusMode?.includes("continuous")) {
      advanced.focusMode = "continuous";
    }
    if (capabilities.exposureMode?.includes("continuous")) {
      advanced.exposureMode = "continuous";
    }
    if (capabilities.whiteBalanceMode?.includes("continuous")) {
      advanced.whiteBalanceMode = "continuous";
    }

    if (Object.keys(advanced).length > 0) {
      try {
        await track.applyConstraints({ advanced: [advanced] });
      } catch (error) {
        console.warn("Automatic camera controls were not accepted:", error);
      }
    }

    const exposure = capabilities.exposureCompensation;
    if (
      exposure &&
      Number.isFinite(exposure.min) &&
      Number.isFinite(exposure.max) &&
      exposure.max > exposure.min
    ) {
      const settings = track.getSettings ? track.getSettings() : {};
      const value = Number.isFinite(settings.exposureCompensation)
        ? settings.exposureCompensation
        : Math.min(exposure.max, Math.max(exposure.min, 0));
      cameraExposureSlider.min = String(exposure.min);
      cameraExposureSlider.max = String(exposure.max);
      cameraExposureSlider.step = String(exposure.step || 0.1);
      cameraExposureSlider.value = String(value);
      cameraExposureValue.textContent = Number(value).toFixed(1);
      cameraExposureWrap.classList.add("supported");
    } else {
      cameraExposureWrap.classList.remove("supported");
    }

    configureCameraZoom(track, capabilities);
    configureCameraTorch(track, capabilities);
  }

  function formatCameraZoom(value) {
    const rounded = Math.round(value * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}×`;
  }

  function clampCameraZoom(value) {
    if (!cameraZoomRange) return 1;
    return Math.min(
      cameraZoomRange.max,
      Math.max(cameraZoomRange.min, Number(value) || cameraZoomRange.min),
    );
  }

  function syncCameraZoomUI(value) {
    if (!cameraZoomSlider || !cameraZoomValue || !cameraZoomRange) return;
    const clamped = clampCameraZoom(value);
    cameraZoomCurrent = clamped;
    cameraZoomSlider.value = String(clamped);
    cameraZoomValue.textContent = formatCameraZoom(clamped);
  }

  function clearSoftwareCameraZoomLayout({ restoreRatio = true } = {}) {
    cameraStage?.classList.remove("camera-software-zoom-active");
    cameraFeed?.style.removeProperty("--camera-software-zoom");
    cameraSoftwareZoomBaseSize = null;

    if (restoreRatio) {
      applyCameraRatioLayout();
    }
  }

  function applySoftwareCameraZoom(value) {
    if (!cameraStage || !cameraFeed) return;

    const zoom = Math.max(1, Number(value) || 1);

    if (zoom <= 1.001) {
      clearSoftwareCameraZoomLayout();
      return;
    }

    // Freeze the exact current frame dimensions once, then enlarge the video
    // inside that unchanged frame. This avoids transform-scaling blur and
    // keeps the crop centered.
    if (!cameraSoftwareZoomBaseSize) {
      const stageRect = cameraStage.getBoundingClientRect();
      const feedRect = cameraFeed.getBoundingClientRect();

      const baseWidth = Math.max(
        1,
        Math.round(stageRect.width || feedRect.width),
      );
      const baseHeight = Math.max(
        1,
        Math.round(stageRect.height || feedRect.height),
      );

      cameraSoftwareZoomBaseSize = {
        width: baseWidth,
        height: baseHeight,
      };

      cameraStage.style.setProperty(
        "width",
        `${baseWidth}px`,
        "important",
      );
      cameraStage.style.setProperty(
        "height",
        `${baseHeight}px`,
        "important",
      );
    }

    cameraStage.classList.add("camera-software-zoom-active");
    cameraFeed.style.setProperty("--camera-software-zoom", String(zoom));
  }

  function configureCameraZoom(track, capabilities) {
    const zoom = capabilities?.zoom;
    const hardwareSupported =
      zoom &&
      Number.isFinite(zoom.min) &&
      Number.isFinite(zoom.max) &&
      zoom.max > zoom.min;

    cameraZoomQueuedValue = null;
    cameraZoomApplyInFlight = false;
    cameraZoomUsesSoftware = false;
    cameraZoomWrap?.classList.remove("software");
    clearSoftwareCameraZoomLayout({ restoreRatio: true });

    if (!hardwareSupported) {
      // Laptop webcams commonly do not expose hardware zoom. Keep the control
      // available and use a centered software crop that is also applied to the
      // saved image.
      const min = 1;
      const max = 3;
      const step = 0.1;

      cameraZoomUsesSoftware = true;
      cameraZoomRange = { min, max, step };
      cameraZoomSlider.min = String(min);
      cameraZoomSlider.max = String(max);
      cameraZoomSlider.step = String(step);
      cameraZoomMinLabel.textContent = formatCameraZoom(min);
      cameraZoomMaxLabel.textContent = formatCameraZoom(max);
      cameraZoomWrap?.classList.add("supported", "software");
      cameraZoomWrap.title = "Digital zoom for this camera";
      syncCameraZoomUI(1);
      applySoftwareCameraZoom(1);
      return;
    }

    const min = Math.max(0.1, Number(zoom.min));
    const max = Math.min(10, Number(zoom.max));

    if (max <= min) {
      cameraZoomUsesSoftware = true;
      cameraZoomRange = { min: 1, max: 3, step: 0.1 };
      cameraZoomSlider.min = "1";
      cameraZoomSlider.max = "3";
      cameraZoomSlider.step = "0.1";
      cameraZoomMinLabel.textContent = "1×";
      cameraZoomMaxLabel.textContent = "3×";
      cameraZoomWrap?.classList.add("supported", "software");
      cameraZoomWrap.title = "Digital zoom for this camera";
      syncCameraZoomUI(1);
      applySoftwareCameraZoom(1);
      return;
    }

    const step = Number(zoom.step) > 0 ? Number(zoom.step) : 0.1;
    const settings =
      typeof track.getSettings === "function" ? track.getSettings() : {};
    const initial = Math.min(
      max,
      Math.max(
        min,
        Number.isFinite(settings.zoom) ? settings.zoom : Math.max(1, min),
      ),
    );

    cameraZoomRange = { min, max, step };
    cameraZoomSlider.min = String(min);
    cameraZoomSlider.max = String(max);
    cameraZoomSlider.step = String(step);
    cameraZoomMinLabel.textContent = formatCameraZoom(min);
    cameraZoomMaxLabel.textContent = formatCameraZoom(max);
    cameraZoomWrap?.classList.add("supported");
    cameraZoomWrap.title = "Camera zoom";
    syncCameraZoomUI(initial);
  }

  function requestCameraZoom(value) {
    if (!cameraZoomRange || !cameraStream) return;

    const requested = clampCameraZoom(value);
    syncCameraZoomUI(requested);

    if (cameraZoomUsesSoftware) {
      cameraZoomQueuedValue = null;
      applySoftwareCameraZoom(requested);
      return;
    }

    cameraZoomQueuedValue = requested;
    flushCameraZoomQueue();
  }

  async function flushCameraZoomQueue() {
    if (cameraZoomApplyInFlight) return;
    cameraZoomApplyInFlight = true;

    try {
      while (cameraZoomQueuedValue !== null) {
        const value = cameraZoomQueuedValue;
        cameraZoomQueuedValue = null;
        const track = cameraStream?.getVideoTracks()[0];
        if (!track || track.readyState !== "live") break;

        try {
          await track.applyConstraints({ advanced: [{ zoom: value }] });
          const settings = typeof track.getSettings === "function"
            ? track.getSettings()
            : {};
          syncCameraZoomUI(
            Number.isFinite(settings.zoom) ? settings.zoom : value,
          );
        } catch (error) {
          console.warn("Camera zoom was not accepted:", error);
          const settings = typeof track.getSettings === "function"
            ? track.getSettings()
            : {};
          if (Number.isFinite(settings.zoom)) syncCameraZoomUI(settings.zoom);
          break;
        }
      }
    } finally {
      cameraZoomApplyInFlight = false;
    }
  }

  function configureCameraTorch(track, capabilities) {
    cameraTorchOn = false;
    cameraTorchSupported =
      facingMode === "environment" &&
      Boolean(capabilities?.torch === true || capabilities?.torch?.includes?.(true));

    cameraTorchBtn?.classList.toggle("supported", cameraTorchSupported);
    cameraTorchBtn?.classList.remove("on");
    cameraTorchBtn?.setAttribute("aria-pressed", "false");
    cameraTorchBtn?.setAttribute("aria-label", "Turn flashlight on");
    if (cameraTorchBtn) cameraTorchBtn.disabled = !cameraTorchSupported;
  }

  async function toggleCameraTorch() {
    if (!cameraTorchSupported || !cameraStream) {
      showMiniNotif("Flashlight is not available on this camera");
      return;
    }

    const track = cameraStream.getVideoTracks()[0];
    if (!track || track.readyState !== "live") return;
    const requested = !cameraTorchOn;

    try {
      await track.applyConstraints({ advanced: [{ torch: requested }] });
      cameraTorchOn = requested;
      cameraTorchBtn.classList.toggle("on", cameraTorchOn);
      cameraTorchBtn.setAttribute("aria-pressed", String(cameraTorchOn));
      cameraTorchBtn.setAttribute(
        "aria-label",
        cameraTorchOn ? "Turn flashlight off" : "Turn flashlight on",
      );
    } catch (error) {
      console.warn("Flashlight was not accepted:", error);
      showMiniNotif("This browser cannot control the flashlight");
    }
  }

  function getPointerDistance() {
    const points = [...cameraPointers.values()];
    if (points.length < 2) return 0;
    return Math.hypot(
      points[0].x - points[1].x,
      points[0].y - points[1].y,
    );
  }

  function handleCameraPointerDown(event) {
    if (!cameraModal.classList.contains("open")) return;
    cameraPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (cameraPointers.size === 1) {
      cameraSinglePointerMoved = false;
      cameraSinglePointerStart = { x: event.clientX, y: event.clientY };
    } else if (cameraPointers.size >= 2) {
      cameraGestureHadMultiplePointers = true;
      cameraPinchActive = true;
      cameraPinchStartDistance = getPointerDistance();
      cameraPinchStartZoom = cameraZoomCurrent;
      cameraSinglePointerMoved = true;
    }

    try {
      cameraStage.setPointerCapture(event.pointerId);
    } catch (_) {}
  }

  function handleCameraPointerMove(event) {
    if (!cameraPointers.has(event.pointerId)) return;
    cameraPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (
      cameraPointers.size === 1 &&
      cameraSinglePointerStart &&
      Math.hypot(
        event.clientX - cameraSinglePointerStart.x,
        event.clientY - cameraSinglePointerStart.y,
      ) > 8
    ) {
      cameraSinglePointerMoved = true;
    }

    if (
      cameraPinchActive &&
      cameraPointers.size >= 2 &&
      cameraPinchStartDistance > 0
    ) {
      event.preventDefault();
      const distance = getPointerDistance();
      requestCameraZoom(
        cameraPinchStartZoom * (distance / cameraPinchStartDistance),
      );
    }
  }

  function handleCameraPointerEnd(event) {
    const wasSingleTap =
      event.type === "pointerup" &&
      cameraPointers.size === 1 &&
      !cameraGestureHadMultiplePointers &&
      !cameraPinchActive &&
      !cameraSinglePointerMoved;

    cameraPointers.delete(event.pointerId);
    try {
      cameraStage.releasePointerCapture(event.pointerId);
    } catch (_) {}

    if (cameraPointers.size < 2) {
      cameraPinchActive = false;
      cameraPinchStartDistance = 0;
    }

    if (wasSingleTap) focusCameraAtPointer(event);

    if (cameraPointers.size === 0) {
      cameraSinglePointerStart = null;
      cameraSinglePointerMoved = false;
      cameraGestureHadMultiplePointers = false;
    }
  }

  function preventCameraPageGesture(event) {
    if (!cameraModal.classList.contains("open")) return;
    if (
      event.type.startsWith("gesture") ||
      (event.touches && event.touches.length > 1)
    ) {
      event.preventDefault();
    }
  }

  function enableCameraGestureGuard() {
    if (cameraGestureGuardEnabled) return;
    cameraGestureGuardEnabled = true;
    document.documentElement.classList.add("camera-gesture-lock");
    cameraModal.addEventListener("touchmove", preventCameraPageGesture, {
      passive: false,
    });
    cameraModal.addEventListener("gesturestart", preventCameraPageGesture, {
      passive: false,
    });
    cameraModal.addEventListener("gesturechange", preventCameraPageGesture, {
      passive: false,
    });
    cameraModal.addEventListener("gestureend", preventCameraPageGesture, {
      passive: false,
    });
  }

  function disableCameraGestureGuard() {
    if (!cameraGestureGuardEnabled) return;
    cameraGestureGuardEnabled = false;
    document.documentElement.classList.remove("camera-gesture-lock");
    cameraModal.removeEventListener("touchmove", preventCameraPageGesture);
    cameraModal.removeEventListener("gesturestart", preventCameraPageGesture);
    cameraModal.removeEventListener("gesturechange", preventCameraPageGesture);
    cameraModal.removeEventListener("gestureend", preventCameraPageGesture);
    cameraPointers.clear();
    cameraPinchActive = false;
    cameraPinchStartDistance = 0;
    cameraSinglePointerStart = null;
    cameraSinglePointerMoved = false;
    cameraGestureHadMultiplePointers = false;
  }

  function centerCameraStage() {
    if (!cameraStage || !cameraLiveWrap) return;

    cameraLiveWrap.style.setProperty("align-items", "center", "important");
    cameraStage.style.setProperty("align-self", "center", "important");
    cameraStage.style.setProperty("margin-left", "auto", "important");
    cameraStage.style.setProperty("margin-right", "auto", "important");
    cameraStage.style.setProperty("left", "auto", "important");
    cameraStage.style.setProperty("right", "auto", "important");
  }

  function applyCameraRatioLayout() {
    if (!cameraStage) return;

    const selectedRatio = CAMERA_RATIOS[cameraRatioKey];
    centerCameraStage();

    if (!selectedRatio) {
      cameraStage.classList.remove("camera-ratio-active");
      cameraStage.style.removeProperty("width");
      cameraStage.style.removeProperty("height");
      cameraStage.style.removeProperty("--camera-selected-ratio");
      cameraFeed.style.removeProperty("width");
      cameraFeed.style.removeProperty("height");
      cameraSoftwareZoomBaseSize = null;
      centerCameraStage();
      return;
    }

    cameraStage.classList.add("camera-ratio-active");
    cameraStage.style.setProperty(
      "--camera-selected-ratio",
      String(selectedRatio),
    );

    const viewport = window.visualViewport;
    const viewportWidth =
      viewport?.width ||
      document.documentElement.clientWidth ||
      window.innerWidth ||
      320;
    const viewportHeight =
      viewport?.height ||
      document.documentElement.clientHeight ||
      window.innerHeight ||
      800;

    const modalRect = cameraModal?.getBoundingClientRect();
    const modalStyles = cameraModal
      ? window.getComputedStyle(cameraModal)
      : null;
    const modalHorizontalPadding =
      (Number.parseFloat(modalStyles?.paddingLeft) || 0) +
      (Number.parseFloat(modalStyles?.paddingRight) || 0);
    const modalInnerWidth =
      modalRect?.width > 0
        ? modalRect.width - modalHorizontalPadding
        : viewportWidth - 16;

    const liveWrapRect = cameraLiveWrap?.getBoundingClientRect();
    const liveWrapWidth =
      liveWrapRect?.width ||
      cameraLiveWrap?.clientWidth ||
      modalInnerWidth;

    // Never trust a stale 480px flex measurement on a narrower phone.
    // Keep a small safety gap so rounded corners and shadows remain visible.
    const availableWidth = Math.max(
      1,
      Math.min(
        480,
        liveWrapWidth,
        modalInnerWidth,
        viewportWidth - 20,
      ),
    );
    const availableHeight = Math.max(120, viewportHeight * 0.65);

    let width = availableWidth;
    let height = width / selectedRatio;

    if (height > availableHeight) {
      height = availableHeight;
      width = height * selectedRatio;
    }

    // Clamp a second time because height-based sizing can produce a width
    // larger than the visible viewport for very horizontal ratios.
    if (width > availableWidth) {
      width = availableWidth;
      height = width / selectedRatio;
    }

    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));

    cameraStage.style.setProperty("width", `${width}px`, "important");
    cameraStage.style.setProperty("height", `${height}px`, "important");
    cameraStage.style.setProperty("max-width", "100%", "important");

    cameraSoftwareZoomBaseSize = null;
    centerCameraStage();

    requestAnimationFrame(() => {
      centerCameraStage();

      // Re-check after the browser commits the layout. Some mobile browsers
      // report the old flex width during the same frame as a ratio change.
      const committedViewportWidth =
        window.visualViewport?.width ||
        document.documentElement.clientWidth ||
        window.innerWidth ||
        width;
      const safeCommittedWidth = Math.max(1, committedViewportWidth - 20);
      const committedRect = cameraStage.getBoundingClientRect();

      if (committedRect.width > safeCommittedWidth) {
        const correctedWidth = Math.floor(safeCommittedWidth);
        const correctedHeight = Math.floor(correctedWidth / selectedRatio);
        cameraStage.style.setProperty(
          "width",
          `${correctedWidth}px`,
          "important",
        );
        cameraStage.style.setProperty(
          "height",
          `${Math.max(1, correctedHeight)}px`,
          "important",
        );
        centerCameraStage();
      }
    });
  }

  function syncCameraStageAspect() {
    if (!cameraStage) return;
    applyCameraRatioLayout();
  }

  function stopMediaStream(stream) {
    if (!stream) return;
    cameraTorchOn = false;
    cameraTorchBtn?.classList.remove("on");
    cameraTorchBtn?.setAttribute("aria-pressed", "false");
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (_) {}
    });
    if (cameraFeed.srcObject === stream) cameraFeed.srcObject = null;
    if (cameraStream === stream) cameraStream = null;
  }

  function isExpectedCameraInterruption(error) {
    return ["AbortError", "InvalidStateError"].includes(error?.name);
  }

  async function startCameraStream() {
    const requestId = ++cameraStreamRequestId;
    cancelCameraCountdown();
    cameraFocusUnsupportedNotified = false;
    clearTimeout(cameraFocusResetTimer);
    cameraFocusResetTimer = null;
    cameraZoomRange = null;
    cameraZoomQueuedValue = null;
    cameraZoomUsesSoftware = false;
    cameraZoomCurrent = 1;
    clearSoftwareCameraZoomLayout({ restoreRatio: true });
    cameraZoomWrap?.classList.remove("supported", "software");
    cameraTorchSupported = false;
    cameraTorchOn = false;
    cameraTorchBtn?.classList.remove("supported", "on");

    const previousStream = cameraStream;
    cameraStream = null;
    stopMediaStream(previousStream);

    let requestedStream = null;
    try {
      requestedStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          // Higher source resolution improves crop and digital-zoom
          // detail while the displayed camera dimensions stay unchanged.
          width: { ideal: 1920 },
          height: { ideal: 1440 },
          aspectRatio: { ideal: 4 / 3 },
          frameRate: { ideal: 30, max: 60 },
        },
        audio: false,
      });

      if (
        requestId !== cameraStreamRequestId ||
        !cameraModal.classList.contains("open")
      ) {
        stopMediaStream(requestedStream);
        return false;
      }

      cameraStream = requestedStream;

      // Set the final orientation before attaching the stream so opening or
      // switching cameras never shows a visible left-right flip.
      cameraFeed.classList.toggle(
        "front-camera-corrected",
        facingMode === "user",
      );
      cameraFeed.srcObject = requestedStream;

      try {
        await cameraFeed.play();
        await waitForVideoMetadata(requestId);
        syncCameraStageAspect();
      } catch (playError) {
        if (requestId !== cameraStreamRequestId) {
          stopMediaStream(requestedStream);
          return false;
        }
        throw playError;
      }

      if (requestId !== cameraStreamRequestId) {
        stopMediaStream(requestedStream);
        return false;
      }

      const track = requestedStream.getVideoTracks()[0];
      if (track) await applyAutomaticCameraControls(track);
      return true;
    } catch (error) {
      if (requestedStream) stopMediaStream(requestedStream);

      const staleRequest =
        requestId !== cameraStreamRequestId ||
        !cameraModal.classList.contains("open");
      if (staleRequest || isExpectedCameraInterruption(error)) {
        console.debug("Camera request superseded or interrupted:", error);
        return false;
      }

      console.error("Camera start failed:", error);
      alert("Camera not available: " + (error?.message || "Unknown error"));
      closeCamera();
      return false;
    }
  }

  function getVideoFocusPoint(event) {
    const videoRect = cameraFeed.getBoundingClientRect();
    const stageRect = cameraStage?.getBoundingClientRect() || videoRect;
    const videoWidth = Number(cameraFeed.videoWidth) || 0;
    const videoHeight = Number(cameraFeed.videoHeight) || 0;

    if (
      videoRect.width <= 0 ||
      videoRect.height <= 0 ||
      videoWidth <= 0 ||
      videoHeight <= 0
    ) {
      return null;
    }

    const localX = event.clientX - videoRect.left;
    const localY = event.clientY - videoRect.top;

    // The pointer listener is attached to the stage, so first reject taps
    // outside the video element itself.
    if (
      localX < 0 ||
      localY < 0 ||
      localX > videoRect.width ||
      localY > videoRect.height
    ) {
      return null;
    }

    const objectFit = getComputedStyle(cameraFeed).objectFit || "fill";
    const videoAspect = videoWidth / videoHeight;
    const boxAspect = videoRect.width / videoRect.height;

    let renderedWidth = videoRect.width;
    let renderedHeight = videoRect.height;

    if (objectFit === "contain" || objectFit === "scale-down") {
      if (videoAspect > boxAspect) {
        renderedWidth = videoRect.width;
        renderedHeight = renderedWidth / videoAspect;
      } else {
        renderedHeight = videoRect.height;
        renderedWidth = renderedHeight * videoAspect;
      }
    } else if (objectFit === "cover") {
      if (videoAspect > boxAspect) {
        renderedHeight = videoRect.height;
        renderedWidth = renderedHeight * videoAspect;
      } else {
        renderedWidth = videoRect.width;
        renderedHeight = renderedWidth / videoAspect;
      }
    } else if (objectFit === "none") {
      renderedWidth = videoWidth;
      renderedHeight = videoHeight;
    }

    // Camera CSS uses centered object-position. Positive offsets represent
    // letterbox bars; negative offsets represent centered cover-cropping.
    const renderedLeft = (videoRect.width - renderedWidth) / 2;
    const renderedTop = (videoRect.height - renderedHeight) / 2;

    if (
      objectFit === "contain" ||
      objectFit === "scale-down" ||
      objectFit === "none"
    ) {
      const tappedLetterbox =
        localX < renderedLeft ||
        localX > renderedLeft + renderedWidth ||
        localY < renderedTop ||
        localY > renderedTop + renderedHeight;

      // Do not send a fake focus coordinate for taps in black bars.
      if (tappedLetterbox) return null;
    }

    let x = (localX - renderedLeft) / renderedWidth;
    let y = (localY - renderedTop) / renderedHeight;

    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    // The front preview is visually counter-flipped, so map the tap back to
    // the camera sensor coordinate system before applying focus.
    if (cameraFeed.classList.contains("front-camera-corrected")) {
      x = 1 - x;
    }

    const displayX =
      stageRect.width > 0
        ? ((event.clientX - stageRect.left) / stageRect.width) * 100
        : 50;
    const displayY =
      stageRect.height > 0
        ? ((event.clientY - stageRect.top) / stageRect.height) * 100
        : 50;

    return {
      x,
      y,
      displayX: Math.max(0, Math.min(100, displayX)),
      displayY: Math.max(0, Math.min(100, displayY)),
    };
  }

  async function tryCameraConstraint(track, constraint) {
    try {
      await track.applyConstraints({ advanced: [constraint] });
      return true;
    } catch (_) {
      return false;
    }
  }

  async function focusCameraAtPointer(event) {
    if (!cameraStream || cameraIsCountingDown || !event.isPrimary) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const track = cameraStream.getVideoTracks()[0];
    if (!track || track.readyState !== "live") return;

    const point = getVideoFocusPoint(event);
    if (!point) return;

    cameraFocusIndicator.style.left = `${point.displayX}%`;
    cameraFocusIndicator.style.top = `${point.displayY}%`;
    cameraFocusIndicator.classList.remove(
      "show",
      "focus-success",
      "focus-limited",
    );
    void cameraFocusIndicator.offsetWidth;
    cameraFocusIndicator.classList.add("show");

    if (typeof track.getCapabilities !== "function") {
      cameraFocusIndicator.classList.add("focus-limited");
      return;
    }

    const capabilities = track.getCapabilities();
    const supported = navigator.mediaDevices.getSupportedConstraints
      ? navigator.mediaDevices.getSupportedConstraints()
      : {};
    const focusModes = Array.isArray(capabilities.focusMode)
      ? capabilities.focusMode
      : [];

    let pointAccepted = false;
    let focusTriggered = false;

    // Apply one setting at a time. Combining optional camera constraints in
    // one object makes several Android devices reject the entire request.
    if (supported.pointsOfInterest || "pointsOfInterest" in capabilities) {
      pointAccepted = await tryCameraConstraint(track, {
        pointsOfInterest: [{ x: point.x, y: point.y }],
      });
    }

    if (focusModes.includes("single-shot")) {
      focusTriggered = await tryCameraConstraint(track, {
        focusMode: "single-shot",
      });
    } else if (focusModes.includes("continuous")) {
      // Re-applying continuous focus asks the camera to run autofocus again.
      focusTriggered = await tryCameraConstraint(track, {
        focusMode: "continuous",
      });
    }

    const accepted = pointAccepted || focusTriggered;
    cameraFocusIndicator.classList.add(
      accepted ? "focus-success" : "focus-limited",
    );

    clearTimeout(cameraFocusResetTimer);
    if (focusTriggered && focusModes.includes("continuous")) {
      // Do not switch back too quickly: many phones need over a second to lock.
      cameraFocusResetTimer = setTimeout(async () => {
        const latestTrack = cameraStream?.getVideoTracks()[0];
        if (!latestTrack || latestTrack.readyState !== "live") return;
        await tryCameraConstraint(latestTrack, { focusMode: "continuous" });
      }, 2500);
    }

    if (!accepted && !cameraFocusUnsupportedNotified) {
      cameraFocusUnsupportedNotified = true;
      showMiniNotif(
        "This camera only allows automatic focus in the browser",
      );
    }
  }

  async function applyExposureCompensation() {
    if (!cameraStream) return;
    const track = cameraStream.getVideoTracks()[0];
    if (!track || track.readyState !== "live") return;
    const value = Number(cameraExposureSlider.value);
    cameraExposureValue.textContent = value.toFixed(1);
    try {
      await track.applyConstraints({
        advanced: [{ exposureCompensation: value }],
      });
    } catch (error) {
      console.warn("Exposure adjustment is not supported:", error);
    }
  }

  function cancelCameraCountdown() {
    cameraCountdownToken += 1;
    cameraIsCountingDown = false;
    snapBtn.disabled = false;
    snapBtn.setAttribute("aria-label", "Take photo");
    snapBtn.title = "Take photo";
    snapBtn.classList.remove("counting");
    if (cameraCountdownEl) {
      cameraCountdownEl.textContent = "";
      cameraCountdownEl.classList.remove("visible");
    }
  }

  async function beginCameraCapture() {
    if (cameraIsCapturing) return;
    if (cameraIsCountingDown) {
      cancelCameraCountdown();
      return;
    }

    if (cameraTimerSeconds <= 0) {
      captureCurrentFrame();
      return;
    }

    cameraIsCountingDown = true;
    // Keep the shutter clickable so a second tap can cancel the countdown.
    snapBtn.disabled = false;
    snapBtn.setAttribute("aria-label", "Cancel timer");
    snapBtn.title = "Cancel timer";
    snapBtn.classList.add("counting");
    const token = ++cameraCountdownToken;

    for (let remaining = cameraTimerSeconds; remaining > 0; remaining--) {
      if (token !== cameraCountdownToken) return;
      cameraCountdownEl.textContent = String(remaining);
      cameraCountdownEl.classList.add("visible");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (token !== cameraCountdownToken) return;
    cameraCountdownEl.textContent = "";
    cameraCountdownEl.classList.remove("visible");
    cameraIsCountingDown = false;
    snapBtn.disabled = false;
    snapBtn.setAttribute("aria-label", "Take photo");
    snapBtn.title = "Take photo";
    snapBtn.classList.remove("counting");
    captureCurrentFrame();
  }

  async function captureTripCurrentFrame(video) {
    const tripCamera = window.KikiMikiTripCamera;
    const tripCameraUI = window.KikiMikiTripCameraUI;
    const liveTrack = cameraStream?.getVideoTracks()[0];

    if (
      cameraIsCapturing ||
      !liveTrack ||
      liveTrack.readyState !== "live" ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      return;
    }

    if (!tripCamera?.canCaptureTripPhoto?.()) {
      tripCameraUI?.showSaveMessage(
        "Select a trip and city, or restore a storage connection.",
      );
      tripCameraUI?.setCaptureBusy(false);
      return;
    }

    cameraIsCapturing = true;
    snapBtn.disabled = true;
    tripCameraUI?.setCaptureBusy(true);
    tripCameraUI?.showCaptureFlash();

    const captureId = ++cameraCaptureRequestId;
    const shouldMirrorCapturedFrame = cameraFeed.classList.contains(
      "front-camera-corrected",
    );

    try {
      const blob = await tripCamera.captureFullFrame(
        video,
        shouldMirrorCapturedFrame,
      );

      if (
        captureId !== cameraCaptureRequestId ||
        !cameraModal.classList.contains("open")
      ) {
        return;
      }

      await tripCamera.enqueueCapturedBlob(blob);

      if (
        captureId !== cameraCaptureRequestId ||
        !cameraModal.classList.contains("open")
      ) {
        return;
      }

      tripCameraUI?.showSaveMessage("Trip photo secured");
    } catch (error) {
      console.error("Trip photo capture failed:", error);
      tripCameraUI?.showSaveMessage(
        error?.message || "Could not save the Trip photo",
      );
    } finally {
      if (captureId === cameraCaptureRequestId) {
        cameraIsCapturing = false;
        snapBtn.disabled = false;
        tripCameraUI?.setCaptureBusy(false);
      }
    }
  }

  function captureCurrentFrame() {
    const video = cameraFeed;

    if (window.KikiMikiTripCamera?.getMode?.() === "trip") {
      captureTripCurrentFrame(video);
      return;
    }
    const liveTrack = cameraStream?.getVideoTracks()[0];
    if (
      cameraIsCapturing ||
      !liveTrack ||
      liveTrack.readyState !== "live" ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      return;
    }

    cameraIsCapturing = true;
    snapBtn.disabled = true;
    const captureId = ++cameraCaptureRequestId;

    const selectedRatio = CAMERA_RATIOS[cameraRatioKey];
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = video.videoWidth;
    let sourceHeight = video.videoHeight;

    if (cameraZoomUsesSoftware && cameraZoomCurrent > 1) {
      const zoomedWidth = sourceWidth / cameraZoomCurrent;
      const zoomedHeight = sourceHeight / cameraZoomCurrent;
      sourceX += (sourceWidth - zoomedWidth) / 2;
      sourceY += (sourceHeight - zoomedHeight) / 2;
      sourceWidth = zoomedWidth;
      sourceHeight = zoomedHeight;
    }

    if (selectedRatio) {
      const sourceRatio = sourceWidth / sourceHeight;

      if (sourceRatio > selectedRatio) {
        const croppedWidth = sourceHeight * selectedRatio;
        sourceX += (sourceWidth - croppedWidth) / 2;
        sourceWidth = croppedWidth;
      } else if (sourceRatio < selectedRatio) {
        const croppedHeight = sourceWidth / selectedRatio;
        sourceY += (sourceHeight - croppedHeight) / 2;
        sourceHeight = croppedHeight;
      }
    }

    const shouldMirrorCapturedFrame =
      cameraFeed.classList.contains("front-camera-corrected");

    if (shouldMirrorCapturedFrame) {
      sourceX = video.videoWidth - sourceX - sourceWidth;
      sourceX = Math.max(
        0,
        Math.min(video.videoWidth - sourceWidth, sourceX),
      );
    }

    snapCanvas.width = Math.max(1, Math.round(sourceWidth));
    snapCanvas.height = Math.max(1, Math.round(sourceHeight));

    const ctx = snapCanvas.getContext("2d");
    if (!ctx) {
      cameraIsCapturing = false;
      snapBtn.disabled = false;
      return;
    }

    ctx.save();

    if (shouldMirrorCapturedFrame) {
      // Apply the same horizontal correction used by the live preview so the
      // captured front-camera photo is not reversed after it is taken.
      ctx.translate(snapCanvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      snapCanvas.width,
      snapCanvas.height,
    );

    ctx.restore();

    // The frame is now in the canvas, so the camera can be released while the
    // JPEG is encoded and while the user reviews the photo.
    stopMediaStream(cameraStream);

    snapCanvas.toBlob(
      (blob) => {
        if (
          captureId !== cameraCaptureRequestId ||
          !cameraModal.classList.contains("open")
        ) {
          return;
        }
        cameraIsCapturing = false;
        if (!blob) {
          snapBtn.disabled = false;
          showMiniNotif("Could not capture the photo");
          cameraLiveWrap.style.display = "flex";
          startCameraStream();
          return;
        }

        capturedBlob = blob;
        pendingCameraFile = new File([blob], `photo_${Date.now()}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
        queueSelectedFilesDraftSave();
        if (cameraPreviewObjectUrl) {
          URL.revokeObjectURL(cameraPreviewObjectUrl);
        }
        cameraPreviewObjectUrl = URL.createObjectURL(blob);
        cameraPreviewImg.src = cameraPreviewObjectUrl;
        cameraLiveWrap.style.display = "none";
        cameraPreviewWrap.classList.add("visible");
      },
      "image/jpeg",
      0.92,
    );
  }

  snapBtn.addEventListener("click", beginCameraCapture);

  flipCameraBtn.addEventListener("click", async () => {
    cancelCameraCountdown();
    facingMode = facingMode === "environment" ? "user" : "environment";
    await startCameraStream();
  });

  retakeBtn.addEventListener("click", async () => {
    cameraCaptureRequestId += 1;
    cameraIsCapturing = false;
    capturedBlob = null;
    pendingCameraFile = null;
    queueSelectedFilesDraftSave();
    if (cameraPreviewObjectUrl) {
      URL.revokeObjectURL(cameraPreviewObjectUrl);
      cameraPreviewObjectUrl = null;
    }
    cameraPreviewImg.removeAttribute("src");
    cameraPreviewWrap.classList.remove("visible");
    cameraLiveWrap.style.display = "flex";

    retakeBtn.disabled = true;
    try {
      await startCameraStream();
    } finally {
      snapBtn.disabled = false;
      retakeBtn.disabled = false;
    }
  });

  usePhotoBtn.addEventListener("click", () => {
    if (!capturedBlob) return;

    const file =
      pendingCameraFile ||
      new File([capturedBlob], `photo_${Date.now()}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });

    // Release camera-owned references before passing the File to selection.
    capturedBlob = null;
    pendingCameraFile = null;

    addFilesToSelection([file]);
    closeCamera(true, false);
  });

  closeCameraBtn.addEventListener("click", () => closeCamera());

  function pushCameraHistoryState() {
    history.pushState({ cameraOpen: true }, "");
  }

  window.addEventListener("popstate", (e) => {
    if (lightbox.classList.contains("open")) {
      if (_activeImageActionPopoverClose) _activeImageActionPopoverClose();
      lightbox.classList.remove("open");
      document.body.style.overflow = "";
      lbImages = [];
      lbIndex = 0;
      return;
    }
    if (cameraModal.classList.contains("open")) {
      e.preventDefault();
      closeCamera(false, true);
    }
  });

  async function openCamera() {
    if (cameraModal.classList.contains("open")) return;

    cameraCaptureRequestId += 1;
    cameraIsCapturing = false;
    snapBtn.disabled = false;

    ensureCameraEnhancementUI();

    const tripCameraUI =
      window.KikiMikiTripCameraUI;

    tripCameraUI?.attach({
      who: WHO,
      cameraModal,
      snapButton: snapBtn,
    });

    tripCameraUI?.setCaptureBusy(false);

    cameraModal.classList.add("open");
    enableCameraGestureGuard();

    cameraLiveWrap.style.display = "flex";
    cameraPreviewWrap.classList.remove("visible");

    applyCameraRatioLayout();

    capturedBlob = null;

    pushCameraHistoryState();

    await startCameraStream();
  }

  function closeCamera(
    useHistoryBack = true,
    discardPending = true,
  ) {
    cameraStreamRequestId += 1;
    cameraCaptureRequestId += 1;

    cameraIsCapturing = false;
    snapBtn.disabled = false;

    cancelCameraCountdown();

    clearTimeout(cameraFocusResetTimer);
    cameraFocusResetTimer = null;

    stopMediaStream(cameraStream);

    if (cameraPreviewObjectUrl) {
      URL.revokeObjectURL(
        cameraPreviewObjectUrl,
      );

      cameraPreviewObjectUrl = null;
    }

    capturedBlob = null;

    if (discardPending) {
      pendingCameraFile = null;
      queueSelectedFilesDraftSave();
    }

    cameraPreviewImg.removeAttribute("src");

    cameraFeed.classList.remove(
      "front-camera-corrected",
    );

    cameraModal.classList.remove("open");

    window.KikiMikiTripCameraUI
      ?.onCameraClosed();

    disableCameraGestureGuard();

    cameraZoomRange = null;
    cameraZoomQueuedValue = null;
    cameraZoomUsesSoftware = false;
    cameraZoomCurrent = 1;

    clearSoftwareCameraZoomLayout({
      restoreRatio: true,
    });

    cameraZoomWrap?.classList.remove(
      "supported",
      "software",
    );

    cameraTorchSupported = false;
    cameraTorchOn = false;

    cameraTorchBtn?.classList.remove(
      "supported",
      "on",
    );

    if (cameraTimerMenu) {
      cameraTimerMenu.classList.remove(
        "visible",
      );

      cameraTimerMenu.style.left = "";
      cameraTimerMenu.style.top = "";
      cameraTimerMenu.style.width = "";
      cameraTimerMenu.style.maxHeight = "";

      delete cameraTimerMenu.dataset
        .placement;
    }

    document.body.style.overflow = "";

    if (
      useHistoryBack &&
      history.state &&
      history.state.cameraOpen
    ) {
      history.back();
    }
  }

  const FCM_TOKEN_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
  const FCM_TOKEN_LIMIT = 10;
  const FCM_REGISTRATION_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
  const FCM_REGISTRATION_CACHE_KEY = `mk_fcm_registration_${WHO}`;

  function getFCMDeviceId() {
    const storageKey = "mk_fcm_device_id";
    let deviceId = localStorage.getItem(storageKey);
    if (!deviceId) {
      deviceId =
        crypto.randomUUID?.() ||
        `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(storageKey, deviceId);
    }
    return deviceId;
  }

  async function registerFCMToken() {
    try {
      const messaging = firebase.messaging();
      const token = await messaging.getToken({
        vapidKey:
          "BO_WZsr9NOpYF9IprbZRUZvZD-wTGpctb3J9qDEXlskx0h8QzXpvzl58P_gr4L-psIZe5sm_wuOOgWk0vOMGKcE",
        serviceWorkerRegistration: swRegistration,
      });
      if (!token) return;

      const now = Date.now();
      const cutoff = now - FCM_TOKEN_MAX_AGE_MS;
      const deviceId = getFCMDeviceId();
      const previousRegistration = (() => {
        try {
          return JSON.parse(
            localStorage.getItem(FCM_REGISTRATION_CACHE_KEY) || "null",
          );
        } catch (_) {
          return null;
        }
      })();
      if (
        previousRegistration?.token === token &&
        previousRegistration?.deviceId === deviceId &&
        now - Number(previousRegistration?.registeredAt || 0) <
          FCM_REGISTRATION_REFRESH_MS
      ) {
        return;
      }

      const docRef = db.collection("fcmTokens").doc(WHO);

      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        const data = doc.exists ? doc.data() : {};
        const existingRecords = Array.isArray(data.tokenRecords)
          ? data.tokenRecords
          : [];
        const representedTokens = new Set(
          existingRecords.map((record) => record?.token).filter(Boolean),
        );

        // Migrate legacy tokens once. They receive a fresh timestamp and will
        // age out naturally unless that browser registers again.
        const legacyRecords = (Array.isArray(data.tokens) ? data.tokens : [])
          .filter((legacyToken) => !representedTokens.has(legacyToken))
          .map((legacyToken, index) => ({
            token: legacyToken,
            deviceId: `legacy_${index}`,
            lastSeen: now,
          }));

        let records = [...existingRecords, ...legacyRecords].filter((record) => {
          if (!record || typeof record.token !== "string" || !record.token) {
            return false;
          }
          const lastSeen =
            typeof record.lastSeen === "number"
              ? record.lastSeen
              : record.lastSeen?.toMillis?.() || 0;
          record.lastSeen = lastSeen;
          return lastSeen >= cutoff;
        });

        records = records.filter(
          (record) => record.deviceId !== deviceId && record.token !== token,
        );
        records.unshift({ token, deviceId, lastSeen: now });
        records = records.slice(0, FCM_TOKEN_LIMIT);

        transaction.set(
          docRef,
          {
            user: WHO,
            tokens: records.map((record) => record.token),
            tokenRecords: records,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });

      localStorage.setItem(
        FCM_REGISTRATION_CACHE_KEY,
        JSON.stringify({ token, deviceId, registeredAt: now }),
      );
    } catch (err) {
      console.warn("FCM token registration failed:", err);
    }
  }

  // ─── INIT ────────────────────────────────────────────────────────
  loadCapsuleFromFirestore();
  initNotifications();
  restoreSelectedFilesDraft();
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
  if (typeof checkAuthentication === "function") {
    setTimeout(() => {
      loader.style.display = "none";
    }, 4000);
  }

  const persistLocalChatState = () => {
    queueSelectedFilesDraftSave();
  };

  function closeCameraForBackground() {
    if (!cameraModal.classList.contains("open")) return;

    closeCamera(false, true);

    if (history.state?.cameraOpen) {
      history.replaceState(
        {
          ...history.state,
          cameraOpen: false,
        },
        "",
      );
    }
  }

  const handleLocalStateVisibility = () => {
    if (document.visibilityState === "hidden") {
      closeCameraForBackground();
      persistLocalChatState();
      stopTyping();
    }
  };
  const handleFinalPageHide = (event) => {
    closeCameraForBackground();
    persistLocalChatState();
    stopTyping();
    if (!event.persisted) cleanupChatResources();
  };

  document.addEventListener("visibilitychange", handleLocalStateVisibility);
  window.addEventListener("pagehide", handleFinalPageHide);
  trackCleanup(() => {
    document.removeEventListener(
      "visibilitychange",
      handleLocalStateVisibility,
    );
    window.removeEventListener("pagehide", handleFinalPageHide);
  });
} // end initChat
