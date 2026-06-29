"use strict";

(function () {
  const CONFIG = window.KIKI_MIKI_TRIP_CONFIG || {};
  const allowedUsers = new Set(
    Array.isArray(CONFIG.allowedUsers) && CONFIG.allowedUsers.length
      ? CONFIG.allowedUsers
      : ["mikica"],
  );

  const LOCATION_MAX_AGE_MS = 5 * 60 * 1000;
  const AUTO_PROMPT_PREFIX = "mk_trip_location_auto_prompted_";
  const LOCATION_PREFIX = "mk_trip_last_location_";

  const state = {
    who: null,
    watcherId: null,
    startPromise: null,
    lastLocation: null,
    permissionState: "unknown",
  };

  function isAllowedUser(who) {
    return typeof who === "string" && allowedUsers.has(who);
  }

  function locationKey(who = state.who) {
    return `${LOCATION_PREFIX}${who || "unknown"}`;
  }

  function promptKey(who = state.who) {
    return `${AUTO_PROMPT_PREFIX}${who || "unknown"}`;
  }

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // Location still works for the current page without persistent storage.
    }
  }

  function normalizeLocation(value) {
    if (
      !Number.isFinite(value?.latitude) ||
      !Number.isFinite(value?.longitude)
    ) {
      return null;
    }

    return {
      latitude: Number(value.latitude),
      longitude: Number(value.longitude),
      gpsAccuracyMeters: Number.isFinite(value?.gpsAccuracyMeters)
        ? Number(value.gpsAccuracyMeters)
        : null,
      receivedAt: Number.isFinite(value?.receivedAt)
        ? Number(value.receivedAt)
        : 0,
    };
  }

  function readSavedLocation(who = state.who) {
    try {
      const raw = storageGet(locationKey(who));
      return raw ? normalizeLocation(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  function publishLocation(position) {
    const location = normalizeLocation({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      gpsAccuracyMeters: position.coords.accuracy,
      receivedAt: Date.now(),
    });

    if (!location) return null;

    state.lastLocation = location;
    storageSet(locationKey(), JSON.stringify(location));

    window.dispatchEvent(
      new CustomEvent("mk_trip_location_update", {
        detail: { ...location },
      }),
    );

    return location;
  }

  async function getPermissionState() {
    try {
      if (!navigator.permissions?.query) return "unknown";

      const permission = await navigator.permissions.query({
        name: "geolocation",
      });

      state.permissionState = permission.state;
      return permission.state;
    } catch {
      state.permissionState = "unknown";
      return "unknown";
    }
  }

  function stopWatcher() {
    if (state.watcherId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(state.watcherId);
    }

    state.watcherId = null;
    state.startPromise = null;
  }

  function getLatest(options = {}) {
    if (!state.lastLocation) {
      state.lastLocation = readSavedLocation();
    }

    const location = normalizeLocation(state.lastLocation);
    if (!location) return null;

    const maxAgeMs = Number.isFinite(options.maxAgeMs)
      ? Math.max(0, options.maxAgeMs)
      : LOCATION_MAX_AGE_MS;

    if (Date.now() - location.receivedAt > maxAgeMs) {
      return null;
    }

    return { ...location };
  }

  async function startForUser(who, options = {}) {
    if (!isAllowedUser(who) || !navigator.geolocation) {
      stopWatcher();
      state.who = null;
      state.lastLocation = null;
      return null;
    }

    if (state.who !== who) {
      stopWatcher();
      state.who = who;
      state.lastLocation = readSavedLocation(who);
    }

    if (document.visibilityState === "hidden") {
      return getLatest();
    }

    if (state.watcherId !== null) {
      return getLatest();
    }

    if (state.startPromise) {
      return state.startPromise;
    }

    const allowPrompt = options.allowPrompt === true;

    state.startPromise = (async () => {
      const permissionState = await getPermissionState();

      if (permissionState === "denied") {
        return getLatest();
      }

      if (permissionState === "prompt") {
        if (!allowPrompt || storageGet(promptKey()) === "1") {
          return getLatest();
        }

        // Do not automatically show the browser permission prompt on every
        // visit when the user dismisses it. A successful permanent grant will
        // be reported as "granted" on future visits.
        storageSet(promptKey(), "1");
      }

      if (permissionState === "unknown" && !allowPrompt) {
        return getLatest();
      }

      if (
        permissionState === "unknown" &&
        !state.lastLocation &&
        storageGet(promptKey()) === "1"
      ) {
        return null;
      }

      if (permissionState === "unknown" && !state.lastLocation) {
        storageSet(promptKey(), "1");
      }

      return new Promise((resolve) => {
        let firstResultSettled = false;

        const settle = (value) => {
          if (firstResultSettled) return;
          firstResultSettled = true;
          resolve(value);
        };

        state.watcherId = navigator.geolocation.watchPosition(
          (position) => {
            const location = publishLocation(position);
            settle(location);
          },
          (error) => {
            if (error?.code === 1) {
              stopWatcher();
            }

            window.dispatchEvent(
              new CustomEvent("mk_trip_location_error", {
                detail: {
                  code: error?.code || 0,
                  message: error?.message || "Location is unavailable.",
                },
              }),
            );

            settle(getLatest());
          },
          {
            enableHighAccuracy: true,
            timeout: 20_000,
            maximumAge: 15_000,
          },
        );

        window.setTimeout(() => settle(getLatest()), 20_500);
      });
    })();

    try {
      return await state.startPromise;
    } finally {
      state.startPromise = null;
    }
  }

  function stop() {
    stopWatcher();
    state.who = null;
    state.lastLocation = null;
    state.permissionState = "unknown";
  }

  async function resumeVisiblePage() {
    if (!state.who || document.visibilityState === "hidden") return;

    // When the permission is already granted, this resumes silently after the
    // phone is unlocked or the tab returns to the foreground.
    await startForUser(state.who, { allowPrompt: false });
  }

  window.KikiMikiTripLocation = Object.freeze({
    startForUser,
    getLatest,
    getPermissionState,
    stop,
  });

  window.addEventListener("mk_user_ready", (event) => {
    startForUser(event.detail?.who, { allowPrompt: true }).catch((error) => {
      console.warn("Trip location could not start:", error);
    });
  });

  window.addEventListener("pagehide", stopWatcher);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      stopWatcher();
      return;
    }

    resumeVisiblePage().catch(() => {});
  });

  window.addEventListener("focus", () => {
    resumeVisiblePage().catch(() => {});
  });

  const rememberedWho = storageGet("mk_user");
  if (rememberedWho && firebase.auth().currentUser) {
    startForUser(rememberedWho, { allowPrompt: true }).catch(() => {});
  }
})();
