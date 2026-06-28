"use strict";

(function () {
  const CONFIG = window.KIKI_MIKI_TRIP_CONFIG || {};

  const SETTINGS = Object.freeze({
    enabled: CONFIG.enabled !== false,

    allowedUsers: new Set(
      Array.isArray(CONFIG.allowedUsers) && CONFIG.allowedUsers.length
        ? CONFIG.allowedUsers
        : ["mikica"],
    ),

    tripsCollection: CONFIG.tripsCollection || "trips",

    fallbackCollection: CONFIG.fallbackCollection || "tripFallbacks",

    receiverCollection:
      CONFIG.receiverCollection ||
      CONFIG.receiverFirestoreCollection ||
      "tripSystem",

    receiverDocument:
      CONFIG.receiverDocument ||
      CONFIG.receiverFirestoreDocument ||
      "laptopReceiver",

    targetBytes: Math.round(1.7 * 1024 * 1024),

    maxBytes: 2 * 1024 * 1024,

    maxSide: 3200,

    receiverTimeout: 12_000,
    uploadTimeout: 90_000,
    retryInterval: 60_000,
  });

  const DB_NAME = "kiki-miki-trip-camera";

  const DB_VERSION = 1;

  const STORE_NAME = "pendingPhotos";

  const state = {
    started: false,
    ready: false,

    who: null,
    mode: "chat",

    trips: [],
    selectedTripId: null,

    receiverUrl: null,
    receiverPublishedAt: null,

    laptopOnline: false,
    laptopStatus: null,

    cloudinaryConfigured: false,
    cloudinaryAvailable: false,

    processing: false,

    unsubscribeTrips: null,
    unsubscribeReceiver: null,

    listeners: new Set(),

    lastLocation: null,

    counters: {
      taken: 0,
      savedOnLaptop: 0,
      cloudinaryWaiting: 0,
      uploading: 0,
      waitingToRetry: 0,
      failed: 0,
    },
  };

  function cleanText(value, maxLength = 100) {
    return String(value ?? "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function isAllowedUser(who) {
    return (
      SETTINGS.enabled &&
      typeof who === "string" &&
      SETTINGS.allowedUsers.has(who)
    );
  }

  function requireReady() {
    if (!state.started || !state.ready || !isAllowedUser(state.who)) {
      throw new Error("Trip Camera is not ready for this account.");
    }
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
      if (value === null || value === undefined || value === "") {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, String(value));
      }
    } catch {
      // Continue without saved preferences.
    }
  }

  function modeKey() {
    return `mk_trip_camera_mode_` + `${state.who || "unknown"}`;
  }

  function tripKey() {
    return `mk_trip_selected_` + `${state.who || "unknown"}`;
  }

  function cityKey(tripId) {
    return `mk_trip_city_` + `${state.who || "unknown"}_` + `${tripId}`;
  }

  function timestampToMillis(value) {
    if (value && typeof value.toMillis === "function") {
      return value.toMillis();
    }

    if (value && typeof value.seconds === "number") {
      return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    }

    return 0;
  }

  function mapTrip(doc) {
    const data = doc.data() || {};

    return {
      id: doc.id,

      name: typeof data.name === "string" ? data.name : "Unnamed trip",

      createdBy: typeof data.createdBy === "string" ? data.createdBy : null,

      createdAt: data.createdAt || null,

      createdAtMs: timestampToMillis(data.createdAt),

      updatedAt: data.updatedAt || null,

      status: data.status === "finished" ? "finished" : "active",

      cities: Array.isArray(data.cities)
        ? data.cities.filter(
            (city) => typeof city === "string" && city.trim().length >= 2,
          )
        : [],

      finishedAt: data.finishedAt || null,
    };
  }

  function getSelectedTrip() {
    return state.trips.find((trip) => trip.id === state.selectedTripId) || null;
  }

  function getSelectedCity(tripId = state.selectedTripId) {
    if (!tripId) {
      return null;
    }

    const trip = state.trips.find((item) => item.id === tripId);

    if (!trip) {
      return null;
    }

    const remembered = storageGet(cityKey(tripId));

    const existing = trip.cities.find(
      (city) => city.toLocaleLowerCase() === remembered?.toLocaleLowerCase(),
    );

    return existing || trip.cities[0] || null;
  }

  function getCloudinaryConfig() {
    try {
      if (typeof CLOUDINARY_CONFIG === "undefined") {
        return null;
      }

      if (!CLOUDINARY_CONFIG?.cloudName || !CLOUDINARY_CONFIG?.uploadPreset) {
        return null;
      }

      return {
        cloudName: CLOUDINARY_CONFIG.cloudName,

        uploadPreset: CLOUDINARY_CONFIG.uploadPreset,
      };
    } catch {
      return null;
    }
  }

  function canUseCloudinary() {
    return Boolean(getCloudinaryConfig() && navigator.onLine);
  }

function canCaptureTripPhoto() {
  const selectedTrip = getSelectedTrip();

  return Boolean(
    state.mode === "trip" &&
    selectedTrip &&
    selectedTrip.status === "active" &&
    getSelectedCity() &&
    (
      state.laptopOnline ||
      state.cloudinaryAvailable
    ),
  );
}
  function getState() {
    return {
      ready: state.ready,
      who: state.who,
      mode: state.mode,

      trips: [...state.trips],

      activeTrips: state.trips.filter((trip) => trip.status === "active"),

      finishedTrips: state.trips.filter((trip) => trip.status === "finished"),

      selectedTripId: state.selectedTripId,

      selectedTrip: getSelectedTrip(),

      selectedCity: getSelectedCity(),

      receiverUrl: state.receiverUrl,

      receiverPublishedAt: state.receiverPublishedAt,

      laptopOnline: state.laptopOnline,

      laptopStatus: state.laptopStatus,

      cloudinaryConfigured: state.cloudinaryConfigured,

      cloudinaryAvailable: state.cloudinaryAvailable,

      canCaptureTripPhoto: canCaptureTripPhoto(),

      counters: {
        ...state.counters,
      },
    };
  }

  function notify() {
    const current = getState();

    state.listeners.forEach((listener) => {
      try {
        listener(current);
      } catch (error) {
        console.warn("Trip Camera listener failed:", error);
      }
    });

    window.dispatchEvent(
      new CustomEvent("kiki_miki_trip_camera_updated", {
        detail: current,
      }),
    );
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Trip Camera listener must be a function.");
    }

    state.listeners.add(listener);

    listener(getState());

    return function unsubscribe() {
      state.listeners.delete(listener);
    };
  }

  function createFullTripName(baseName, date = new Date()) {
    const cleaned = cleanText(baseName, 70);

    if (cleaned.length < 2) {
      throw new Error("Please enter a trip name.");
    }

    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const alreadyDated = new RegExp(
      `\\b(?:${months.join("|")})\\s+\\d{4}$`,
      "i",
    ).test(cleaned);

    if (alreadyDated) {
      return cleaned;
    }

    const monthAndYear = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(date);

    return `${cleaned} ` + `${monthAndYear}`;
  }

  function setMode(mode) {
    state.mode = mode === "trip" && isAllowedUser(state.who) ? "trip" : "chat";

    storageSet(modeKey(), state.mode);

    notify();

    if (state.mode === "trip") {
      refreshAvailability();
      processPendingQueue();
    }

    return state.mode;
  }

  function selectTrip(tripId) {
    const trip = state.trips.find((item) => item.id === tripId);

    if (!trip) {
      throw new Error("The selected trip does not exist.");
    }

    state.selectedTripId = trip.id;

    storageSet(tripKey(), trip.id);

    notify();

    return trip;
  }

  function selectCity(tripId, cityName) {
    const trip = state.trips.find((item) => item.id === tripId);

    if (!trip) {
      throw new Error("The selected trip does not exist.");
    }

    const wanted = cleanText(cityName, 60);

    const city = trip.cities.find(
      (item) => item.toLocaleLowerCase() === wanted.toLocaleLowerCase(),
    );

    if (!city) {
      throw new Error("That city is not part of this trip.");
    }

    storageSet(cityKey(tripId), city);

    notify();

    return city;
  }

  async function createTrip(baseName) {
    requireReady();

    const name = createFullTripName(baseName);

    const ref = db.collection(SETTINGS.tripsCollection).doc();

    await ref.set({
      name,

      createdAt: firebase.firestore.FieldValue.serverTimestamp(),

      createdBy: state.who,

      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),

      status: "active",
      cities: [],
      finishedAt: null,
    });

    state.selectedTripId = ref.id;

    storageSet(tripKey(), ref.id);

    notify();

    return {
      id: ref.id,
      name,
    };
  }

  async function addCity(tripId, cityName) {
    requireReady();

    const trip = state.trips.find((item) => item.id === tripId);

    if (!trip) {
      throw new Error("The selected trip does not exist.");
    }

    const city = cleanText(cityName, 60);

    if (city.length < 2) {
      throw new Error("Please enter a city name.");
    }

    const existing = trip.cities.find(
      (item) => item.toLocaleLowerCase() === city.toLocaleLowerCase(),
    );

    const finalCity = existing || city;

    if (!existing) {
      await db
        .collection(SETTINGS.tripsCollection)
        .doc(tripId)
        .update({
          cities: firebase.firestore.FieldValue.arrayUnion(city),

          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    }

    storageSet(cityKey(tripId), finalCity);

    notify();

    return finalCity;
  }

  async function finishTrip(tripId) {
    requireReady();

    await db.collection(SETTINGS.tripsCollection).doc(tripId).update({
      status: "finished",

      finishedAt: firebase.firestore.FieldValue.serverTimestamp(),

      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function reopenTrip(tripId) {
    requireReady();

    await db.collection(SETTINGS.tripsCollection).doc(tripId).update({
      status: "active",
      finishedAt: null,

      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  function isSafeReceiverUrl(value) {
    try {
      const url = new URL(value);

      return (
        url.protocol === "https:" && /\.trycloudflare\.com$/i.test(url.hostname)
      );
    } catch {
      return false;
    }
  }

  async function getFirebaseToken() {
    const user = firebase.auth().currentUser;

    if (!user) {
      throw new Error("Firebase authentication is not ready.");
    }

    return user.getIdToken();
  }

  async function fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();

    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function checkLaptopStatus() {
    if (!state.receiverUrl) {
      state.laptopOnline = false;

      state.laptopStatus = null;

      return false;
    }

    try {
      const token = await getFirebaseToken();

      const response = await fetchWithTimeout(
        `${state.receiverUrl.replace(/\/$/, "")}/status`,
        {
          method: "GET",

          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        SETTINGS.receiverTimeout,
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.ok !== true || data?.laptopOnline !== true) {
        throw new Error(data?.error || `Receiver returned ${response.status}.`);
      }

      state.laptopOnline = true;

      state.laptopStatus = data;

      return true;
    } catch (error) {
      console.warn("Laptop receiver unavailable:", error.message);

      state.laptopOnline = false;

      state.laptopStatus = null;

      return false;
    }
  }

  async function refreshAvailability() {
    state.cloudinaryConfigured = Boolean(getCloudinaryConfig());

    state.cloudinaryAvailable = canUseCloudinary();

    await checkLaptopStatus();

    state.cloudinaryAvailable = canUseCloudinary();

    notify();

    return getState();
  }

  function supportsWebP() {
    const canvas = document.createElement("canvas");

    canvas.width = 1;
    canvas.height = 1;

    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("The browser could not encode the photo."));
          }
        },
        type,
        quality,
      );
    });
  }

  async function decodeBlob(blob) {
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(blob, {
          imageOrientation: "from-image",
        });
      } catch {
        // Use Image below.
      }
    }

    return new Promise((resolve, reject) => {
      const image = new Image();

      const url = URL.createObjectURL(blob);

      image.onload = () => {
        URL.revokeObjectURL(url);

        resolve(image);
      };

      image.onerror = () => {
        URL.revokeObjectURL(url);

        reject(new Error("The browser could not decode the photo."));
      };

      image.src = url;
    });
  }

  function fitInside(width, height, maxSide) {
    const longest = Math.max(width, height);

    if (longest <= maxSide) {
      return {
        width,
        height,
      };
    }

    const scale = maxSide / longest;

    return {
      width: Math.max(1, Math.round(width * scale)),

      height: Math.max(1, Math.round(height * scale)),
    };
  }

  async function compressTripPhotoWithoutCropping(sourceBlob) {
    const image = await decodeBlob(sourceBlob);

    const sourceWidth = image.width;

    const sourceHeight = image.height;

    if (!sourceWidth || !sourceHeight) {
      image.close?.();

      throw new Error("The photo has invalid dimensions.");
    }

    const type = supportsWebP() ? "image/webp" : "image/jpeg";

    const extension = type === "image/webp" ? "webp" : "jpg";

    const qualities = [0.94, 0.91, 0.88, 0.85, 0.82, 0.78, 0.74, 0.7];

    let maxSide = Math.min(
      SETTINGS.maxSide,
      Math.max(sourceWidth, sourceHeight),
    );

    let best = null;

    for (let resizeRound = 0; resizeRound < 8; resizeRound += 1) {
      const size = fitInside(sourceWidth, sourceHeight, maxSide);

      const canvas = document.createElement("canvas");

      canvas.width = size.width;

      canvas.height = size.height;

      const context = canvas.getContext("2d", {
        alpha: false,
      });

      if (!context) {
        image.close?.();

        throw new Error("The browser could not prepare the Trip photo.");
      }

      context.imageSmoothingEnabled = true;

      context.imageSmoothingQuality = "high";

      context.fillStyle = "#ffffff";

      context.fillRect(0, 0, canvas.width, canvas.height);

      /*
       * Full source image.
       * Same aspect ratio.
       * No cropping.
       */
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const quality of qualities) {
        const blob = await canvasToBlob(canvas, type, quality);

        best = {
          blob,
          width: canvas.width,
          height: canvas.height,
          type,
          extension,
          quality,
        };

        if (blob.size <= SETTINGS.targetBytes) {
          image.close?.();

          return best;
        }
      }

      if (best?.blob.size <= SETTINGS.maxBytes) {
        image.close?.();

        return best;
      }

      maxSide = Math.max(960, Math.floor(maxSide * 0.88));
    }

    image.close?.();

    if (!best || best.blob.size > SETTINGS.maxBytes) {
      throw new Error("The Trip photo could not be reduced below 2 MB.");
    }

    return best;
  }

  async function captureFullFrame(video, shouldMirror = false) {
    if (!video?.videoWidth || !video?.videoHeight) {
      throw new Error("The camera frame is not ready.");
    }

    const canvas = document.createElement("canvas");

    canvas.width = video.videoWidth;

    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d", {
      alpha: false,
    });

    if (!context) {
      throw new Error("The camera frame could not be captured.");
    }

    context.fillStyle = "#ffffff";

    context.fillRect(0, 0, canvas.width, canvas.height);

    context.save();

    if (shouldMirror) {
      context.translate(canvas.width, 0);

      context.scale(-1, 1);
    }

    /*
     * The complete camera frame is saved.
     * The ratio selector is ignored for Trip storage.
     * No part of the image is cropped.
     */
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    context.restore();

    return canvasToBlob(canvas, "image/jpeg", 0.96);
  }

  function openQueueDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("Private browser storage is unavailable."));

        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;

        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, {
            keyPath: "fileId",
          });
        }
      };

      request.onsuccess = () => resolve(request.result);

      request.onerror = () => reject(request.error);

      request.onblocked = () => reject(new Error("Trip storage is blocked."));
    });
  }

  async function useStore(mode, action) {
    const database = await openQueueDatabase();

    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);

        const store = transaction.objectStore(STORE_NAME);

        const result = action(store);

        transaction.oncomplete = () => resolve(result?.result);

        transaction.onerror = () => reject(transaction.error);

        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }

  function putRecord(record) {
    return useStore("readwrite", (store) => store.put(record));
  }

  function deleteRecord(fileId) {
    return useStore("readwrite", (store) => store.delete(fileId));
  }

  async function getAllRecords() {
    const database = await openQueueDatabase();

    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");

        const request = transaction.objectStore(STORE_NAME).getAll();

        request.onsuccess = () => resolve(request.result || []);

        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }

  function makeId(prefix) {
    const value =
      crypto.randomUUID?.() ||
      `${Date.now()}_` + `${Math.random().toString(36).slice(2)}`;

    return `${prefix}_${value}`.replace(/[^A-Za-z0-9_-]/g, "_");
  }

  function localDate(date) {
    return [
      String(date.getDate()).padStart(2, "0"),

      String(date.getMonth() + 1).padStart(2, "0"),

      date.getFullYear(),
    ].join("-");
  }

  function localTime(date) {
    return [
      String(date.getHours()).padStart(2, "0"),

      String(date.getMinutes()).padStart(2, "0"),

      String(date.getSeconds()).padStart(2, "0"),
    ].join("-");
  }

  async function getLocation() {
    if (!navigator.geolocation) {
      return null;
    }

    if (
      state.lastLocation &&
      Date.now() - state.lastLocation.receivedAt < 5 * 60 * 1000
    ) {
      return state.lastLocation;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          state.lastLocation = {
            latitude: position.coords.latitude,

            longitude: position.coords.longitude,

            gpsAccuracyMeters: position.coords.accuracy,

            receivedAt: Date.now(),
          };

          resolve(state.lastLocation);
        },

        () => resolve(null),

        {
          enableHighAccuracy: true,

          timeout: 8_000,

          maximumAge: 5 * 60 * 1000,
        },
      );
    });
  }

  async function enqueueCapturedBlob(sourceBlob, options = {}) {
    requireReady();

    if (state.mode !== "trip") {
      throw new Error("Trip mode is not active.");
    }

    if (!canCaptureTripPhoto()) {
      throw new Error("No safe storage destination is available.");
    }

    state.counters.taken += 1;

    notify();

    try {
      const trip = getSelectedTrip();

      const city = getSelectedCity();

      const compressed = await compressTripPhotoWithoutCropping(sourceBlob);

      const captured = options.capturedAt || new Date();

      const location = options.location || (await getLocation());

      const fileId = makeId("photo");

      const metadata = {
        tripId: trip.id,

        tripName: trip.name,

        fileId,

        city,

        captureDate: localDate(captured),

        captureTime: localTime(captured),

        capturedAt: captured.toISOString(),

        capturedBy: state.who,

        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",

        latitude: location?.latitude ?? null,

        longitude: location?.longitude ?? null,

        gpsAccuracyMeters: location?.gpsAccuracyMeters ?? null,

        width: compressed.width,

        height: compressed.height,

        device: navigator.userAgent.slice(0, 250),
      };

      const file = new File(
        [compressed.blob],

        `${fileId}.` + `${compressed.extension}`,
        {
          type: compressed.type,

          lastModified: Date.now(),
        },
      );

      await putRecord({
        fileId,
        file,
        metadata,

        status: "queued",

        attempts: 0,

        createdAt: Date.now(),

        lastError: null,
      });

      await updateQueueCount();

      processPendingQueue();

      return {
        fileId,

        bytes: file.size,

        width: compressed.width,

        height: compressed.height,
      };
    } catch (error) {
      state.counters.failed += 1;

      notify();

      throw error;
    }
  }

  async function uploadToLaptop(record) {
    if (!state.laptopOnline || !state.receiverUrl) {
      throw new Error("Laptop receiver is offline.");
    }

    const token = await getFirebaseToken();

    const form = new FormData();

    form.append("photo", record.file, record.file.name);

    form.append("metadata", JSON.stringify(record.metadata));

    const response = await fetchWithTimeout(
      `${state.receiverUrl.replace(/\/$/, "")}` + `/upload-photo`,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${token}`,
        },

        body: form,
      },

      SETTINGS.uploadTimeout,
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.ok !== true || data?.verified !== true) {
      throw new Error(
        data?.error || `Laptop upload failed (${response.status}).`,
      );
    }

    return data;
  }

  async function uploadToCloudinary(record) {
    const config = getCloudinaryConfig();

    if (!config || !navigator.onLine) {
      throw new Error("Cloudinary fallback is unavailable.");
    }

    const form = new FormData();

    form.append("file", record.file, record.file.name);

    form.append("upload_preset", config.uploadPreset);

    form.append("folder", `trip-camera/` + `${record.metadata.tripId}`);

    form.append("public_id", record.fileId);

    const response = await fetchWithTimeout(
      `https://api.cloudinary.com/v1_1/` + `${config.cloudName}/image/upload`,
      {
        method: "POST",
        body: form,
      },

      SETTINGS.uploadTimeout,
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.secure_url || !data?.public_id) {
      throw new Error(
        data?.error?.message ||
          `Cloudinary upload failed (${response.status}).`,
      );
    }

    await db
      .collection(SETTINGS.fallbackCollection)
      .doc(record.fileId)
      .set({
        fileId: record.fileId,

        tripId: record.metadata.tripId,

        tripName: record.metadata.tripName,

        city: record.metadata.city,

        capturedBy: record.metadata.capturedBy,

        capturedAt: firebase.firestore.Timestamp.fromDate(
          new Date(record.metadata.capturedAt),
        ),

        metadata: record.metadata,

        cloudinary: {
          publicId: data.public_id,

          secureUrl: data.secure_url,

          bytes: data.bytes || record.file.size,

          width: data.width || record.metadata.width,

          height: data.height || record.metadata.height,

          format: data.format || record.file.type,

          version: data.version || null,
        },

        status: "waiting_for_laptop",

        createdAt: firebase.firestore.FieldValue.serverTimestamp(),

        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),

        downloadedAt: null,
        verifiedAt: null,
        lastError: null,
      });

    return data;
  }

  async function updateQueueCount() {
    try {
      const records = await getAllRecords();

      state.counters.waitingToRetry = records.length;
    } catch (error) {
      console.warn("Could not count pending Trip photos:", error);
    }

    notify();
  }

  async function processRecord(record) {
    record.status = "uploading";

    record.attempts = Number(record.attempts || 0) + 1;

    record.lastError = null;

    await putRecord(record);

    state.counters.uploading += 1;

    notify();

    try {
      if (state.laptopOnline) {
        try {
          await uploadToLaptop(record);

          await deleteRecord(record.fileId);

          state.counters.savedOnLaptop += 1;

          return;
        } catch (error) {
          console.warn("Laptop upload failed; trying Cloudinary:", error);

          state.laptopOnline = false;

          state.laptopStatus = null;
        }
      }

      if (canUseCloudinary()) {
        await uploadToCloudinary(record);

        await deleteRecord(record.fileId);

        state.counters.cloudinaryWaiting += 1;

        return;
      }

      throw new Error("Neither laptop nor Cloudinary is available.");
    } catch (error) {
      record.status = "retry";

      record.lastError = error.message;

      await putRecord(record);

      console.warn("Trip photo kept safely on this phone:", error);
    } finally {
      state.counters.uploading = Math.max(0, state.counters.uploading - 1);

      await updateQueueCount();
    }
  }

  async function processPendingQueue() {
    if (state.processing || !state.started || !navigator.onLine) {
      return;
    }

    state.processing = true;

    try {
      await refreshAvailability();

      const records = (await getAllRecords()).sort(
        (a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0),
      );

      for (const record of records) {
        if (!state.laptopOnline && !canUseCloudinary()) {
          break;
        }

        await processRecord(record);
      }
    } catch (error) {
      console.warn("Trip upload queue failed:", error);
    } finally {
      state.processing = false;

      await updateQueueCount();
    }
  }

  function startForUser(who) {
    if (state.started || !isAllowedUser(who)) {
      return;
    }

    state.started = true;

    state.who = who;

    state.mode = storageGet(modeKey()) === "trip" ? "trip" : "chat";

    state.selectedTripId = storageGet(tripKey());

    state.cloudinaryConfigured = Boolean(getCloudinaryConfig());

    state.cloudinaryAvailable = canUseCloudinary();

    state.unsubscribeTrips = db
      .collection(SETTINGS.tripsCollection)
      .orderBy("createdAt", "desc")
      .onSnapshot(
        (snapshot) => {
          state.trips = snapshot.docs.map(mapTrip);

          if (
            state.selectedTripId &&
            !state.trips.some((trip) => trip.id === state.selectedTripId)
          ) {
            state.selectedTripId = null;

            storageSet(tripKey(), null);
          }

          state.ready = true;

          notify();
        },

        (error) => {
          state.ready = false;

          console.error("Trip list could not be loaded:", error);

          notify();
        },
      );

    state.unsubscribeReceiver = db
      .collection(SETTINGS.receiverCollection)
      .doc(SETTINGS.receiverDocument)
      .onSnapshot(
        (doc) => {
          const data = doc.exists ? doc.data() : null;

          state.receiverUrl = isSafeReceiverUrl(data?.url) ? data.url : null;

          state.receiverPublishedAt =
            timestampToMillis(data?.publishedAt) ||
            timestampToMillis(data?.updatedAt) ||
            null;

          refreshAvailability();
        },

        (error) => {
          console.warn("Receiver address could not be read:", error);

          state.receiverUrl = null;

          state.laptopOnline = false;

          state.laptopStatus = null;

          notify();
        },
      );

    refreshAvailability();
    updateQueueCount();
    processPendingQueue();
  }

  function stop() {
    state.unsubscribeTrips?.();
    state.unsubscribeReceiver?.();

    state.unsubscribeTrips = null;

    state.unsubscribeReceiver = null;

    state.started = false;

    state.ready = false;

    state.who = null;

    state.mode = "chat";

    state.trips = [];

    state.selectedTripId = null;

    state.receiverUrl = null;

    state.laptopOnline = false;

    state.laptopStatus = null;

    notify();
  }

  window.KikiMikiTripCamera = Object.freeze({
    subscribe,
    getState,

    getMode() {
      return state.mode;
    },

    setMode,

    createFullTripName,
    createTrip,
    addCity,
    finishTrip,
    reopenTrip,

    selectTrip,
    selectCity,

    getSelectedTrip,
    getSelectedCity,

    canCaptureTripPhoto,
    refreshAvailability,

    captureFullFrame,

    compressTripPhotoWithoutCropping,

    enqueueCapturedBlob,
    processPendingQueue,

    stop,
  });

  window.addEventListener("mk_user_ready", (event) => {
    startForUser(event.detail?.who);
  });

  window.addEventListener("online", () => {
    state.cloudinaryAvailable = canUseCloudinary();

    refreshAvailability();
    processPendingQueue();
  });

  window.addEventListener("offline", () => {
    state.cloudinaryAvailable = false;

    state.laptopOnline = false;

    state.laptopStatus = null;

    notify();
  });

  setInterval(() => {
    if (state.started) {
      refreshAvailability();
      processPendingQueue();
    }
  }, SETTINGS.retryInterval);

  const rememberedWho = storageGet("mk_user");

  if (rememberedWho && firebase.auth().currentUser) {
    startForUser(rememberedWho);
  }
})();
