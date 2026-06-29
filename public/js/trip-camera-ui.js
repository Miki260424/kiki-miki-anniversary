"use strict";

(function () {
  const engine = window.KikiMikiTripCamera;
  const config = window.KIKI_MIKI_TRIP_CONFIG || {};

  let attached = false;
  let captureBusy = false;
  let unsubscribe = null;
  let latestState = null;
  let saveMessageTimer = null;

  const elements = {
    cameraModal: null,
    snapButton: null,
    root: null,
    chatButton: null,
    tripButton: null,
    selectionButton: null,
    selectionPrimary: null,
    selectionSecondary: null,
    detailsButton: null,
    connectionDot: null,
    activityButton: null,
    captureFlash: null,
    saveMessage: null,
  };

  function isAllowedUser(who) {
    const allowed = Array.isArray(config.allowedUsers)
      ? config.allowedUsers
      : ["mikica"];

    return config.enabled !== false && allowed.includes(who);
  }

  function makeButton(className, text, label, type = "button") {
    const button = document.createElement("button");
    button.type = type;
    button.className = className;
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.title = label;
    return button;
  }

  function formatDateTime(milliseconds) {
    if (!milliseconds) return "Unavailable";

    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) return "Unavailable";

    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function closeOverlay() {
    const overlay = document.querySelector(".trip-camera-overlay");
    if (!overlay) return;

    overlay.classList.remove("visible");
    window.setTimeout(() => overlay.remove(), 190);
  }

  function openPanel(titleText, subtitleText) {
    closeOverlay();

    const overlay = document.createElement("div");
    overlay.className = "trip-camera-overlay";

    const panel = document.createElement("section");
    panel.className = "trip-camera-panel";

    const header = document.createElement("div");
    header.className = "trip-camera-panel-header";

    const heading = document.createElement("div");
    heading.className = "trip-camera-panel-heading";

    const title = document.createElement("h2");
    title.textContent = titleText;

    const subtitle = document.createElement("p");
    subtitle.textContent = subtitleText;

    const closeButton = makeButton("trip-camera-panel-close", "✕", "Close");

    const body = document.createElement("div");
    body.className = "trip-camera-panel-body";

    heading.append(title, subtitle);
    header.append(heading, closeButton);
    panel.append(header, body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    closeButton.addEventListener("click", closeOverlay);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeOverlay();
    });

    requestAnimationFrame(() => overlay.classList.add("visible"));
    return body;
  }

  function createInfoCard(label, value, modifier = "") {
    const card = document.createElement("div");
    card.className = `trip-camera-info-card ${modifier}`.trim();

    const labelElement = document.createElement("span");
    labelElement.className = "trip-camera-info-card-label";
    labelElement.textContent = label;

    const valueElement = document.createElement("strong");
    valueElement.className = "trip-camera-info-card-value";
    valueElement.textContent = value;

    card.append(labelElement, valueElement);
    return card;
  }

  function createCounterRow(label, value, hint = "") {
    const row = document.createElement("div");
    row.className = "trip-camera-counter-row";

    const text = document.createElement("div");
    text.className = "trip-camera-counter-text";

    const labelElement = document.createElement("span");
    labelElement.className = "trip-camera-counter-label";
    labelElement.textContent = label;

    text.appendChild(labelElement);

    if (hint) {
      const hintElement = document.createElement("small");
      hintElement.className = "trip-camera-counter-hint";
      hintElement.textContent = hint;
      text.appendChild(hintElement);
    }

    const valueElement = document.createElement("strong");
    valueElement.className = "trip-camera-counter-value";
    valueElement.textContent = String(value ?? 0);

    row.append(text, valueElement);
    return row;
  }

  function connectionKind(state) {
    if (state?.laptopOnline) return "laptop";
    if (state?.cloudinaryAvailable) return "cloudinary";
    return "offline";
  }

  function connectionTitle(state) {
    if (state?.laptopOnline) return "Laptop connected";
    if (state?.cloudinaryAvailable) return "Cloudinary fallback ready";
    return "No storage connection";
  }

  function showDetailsPanel() {
    const state = engine?.getState?.() || latestState;
    if (!state) return;

    const body = openPanel(
      "Trip Camera connection",
      "Laptop, battery, storage and fallback details",
    );

    const kind = connectionKind(state);
    const mainStatus = document.createElement("div");
    mainStatus.className = `trip-camera-main-status ${kind}`;

    const statusDot = document.createElement("span");
    statusDot.className = "trip-camera-main-status-dot";

    const statusText = document.createElement("div");
    statusText.className = "trip-camera-main-status-text";

    const title = document.createElement("strong");
    title.textContent = connectionTitle(state);

    const description = document.createElement("span");
    if (state.laptopOnline) {
      description.textContent =
        "Photos are saved directly to the laptop and verified before completion.";
    } else if (state.cloudinaryAvailable) {
      description.textContent =
        "Photos are held safely in Cloudinary until the laptop receiver imports them.";
    } else {
      description.textContent =
        "The shutter is disabled until the laptop or Cloudinary becomes available.";
    }

    statusText.append(title, description);
    mainStatus.append(statusDot, statusText);

    const battery = state.laptopStatus?.battery;
    const storage = state.laptopStatus?.storage;
    const fallbackSync = state.laptopStatus?.fallbackSync;

    let batteryText = "Unavailable";
    if (battery?.available) {
      batteryText = `${battery.percentage}%`;
      if (battery.charging || battery.powerOnline) {
        batteryText += " · charging";
      }
    }

    const storageText = Number.isFinite(Number(storage?.freeGB))
      ? `${storage.freeGB} GB free`
      : "Unavailable";

    const syncText = fallbackSync?.enabled
      ? fallbackSync.active
        ? "Importing"
        : fallbackSync.watcherReady
          ? "Watching"
          : fallbackSync.lastError
            ? "Error"
            : "Starting"
      : fallbackSync?.reason || "Unavailable";

    const grid = document.createElement("div");
    grid.className = "trip-camera-card-grid";
    grid.append(
      createInfoCard("Battery", batteryText),
      createInfoCard("Storage", storageText),
      createInfoCard(
        "Cloudinary",
        state.cloudinaryAvailable ? "Available" : "Unavailable",
      ),
      createInfoCard("Fallback sync", syncText),
      createInfoCard(
        "Last receiver update",
        formatDateTime(state.receiverPublishedAt),
      ),
      createInfoCard(
        "Current route",
        state.laptopOnline
          ? "Laptop first"
          : state.cloudinaryAvailable
            ? "Cloudinary fallback"
            : "Paused",
      ),
    );

    const selectionTitle = document.createElement("div");
    selectionTitle.className = "trip-camera-section-title";
    selectionTitle.textContent = "Current destination";

    const selectedGrid = document.createElement("div");
    selectedGrid.className = "trip-camera-card-grid";
    selectedGrid.append(
      createInfoCard("Trip", state.selectedTrip?.name || "Not selected"),
      createInfoCard("City", state.selectedCity || "Not selected"),
    );

    const refreshButton = makeButton(
      "trip-camera-primary-button",
      "Refresh connection",
      "Refresh connection",
    );

    refreshButton.addEventListener("click", async () => {
      refreshButton.disabled = true;
      refreshButton.textContent = "Checking…";

      try {
        await engine.refreshAvailability();
        closeOverlay();
        window.setTimeout(showDetailsPanel, 200);
      } catch (error) {
        window.alert(error.message);
        refreshButton.disabled = false;
        refreshButton.textContent = "Refresh connection";
      }
    });

    body.append(mainStatus, grid, selectionTitle, selectedGrid, refreshButton);
  }

  function showActivityPanel() {
    const state = engine?.getState?.() || latestState;
    if (!state) return;

    const body = openPanel(
      "Trip Camera activity",
      state.selectedTrip
        ? `Persistent status for ${state.selectedTrip.name}`
        : "Select a trip to view persistent activity",
    );

    const counters = state.counters || {};
    const list = document.createElement("div");
    list.className = "trip-camera-counter-list";
    list.append(
      createCounterRow("Taken", counters.taken, "Recorded for this trip"),
      createCounterRow(
        "Saved on laptop",
        counters.savedOnLaptop,
        "Verified laptop files",
      ),
      createCounterRow(
        "Cloudinary waiting",
        counters.cloudinaryWaiting,
        "Waiting for laptop import or deletion",
      ),
      createCounterRow("Uploading", counters.uploading, "In progress now"),
      createCounterRow(
        "Waiting to retry",
        counters.waitingToRetry,
        "Safe on this phone",
      ),
      createCounterRow("Failed", counters.failed, "Needs attention"),
    );

    const title = document.createElement("div");
    title.className = "trip-camera-section-title";
    title.textContent = "Trip management";

    const management = document.createElement("div");
    management.className = "trip-camera-form";

    if (state.selectedTrip?.status === "active") {
      const finishButton = makeButton(
        "trip-camera-danger-button",
        `Finish ${state.selectedTrip.name}`,
        "Finish selected trip",
      );

      finishButton.addEventListener("click", async () => {
        const confirmed = window.confirm(
          `Finish “${state.selectedTrip.name}”? The trip can be reopened later.`,
        );
        if (!confirmed) return;

        finishButton.disabled = true;
        try {
          await engine.finishTrip(state.selectedTrip.id);
          closeOverlay();
        } catch (error) {
          window.alert(error.message);
          finishButton.disabled = false;
        }
      });

      management.appendChild(finishButton);
    }

    if (state.finishedTrips?.length) {
      const finishedSelect = document.createElement("select");
      finishedSelect.className = "trip-camera-dialog-select";

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Choose a finished trip";
      finishedSelect.appendChild(placeholder);

      state.finishedTrips.forEach((trip) => {
        const option = document.createElement("option");
        option.value = trip.id;
        option.textContent = trip.name;
        finishedSelect.appendChild(option);
      });

      const reopenButton = makeButton(
        "trip-camera-secondary-button",
        "Reopen selected trip",
        "Reopen selected trip",
      );
      reopenButton.disabled = true;

      finishedSelect.addEventListener("change", () => {
        reopenButton.disabled = !finishedSelect.value;
      });

      reopenButton.addEventListener("click", async () => {
        if (!finishedSelect.value) return;
        reopenButton.disabled = true;

        try {
          await engine.reopenTrip(finishedSelect.value);
          engine.selectTrip(finishedSelect.value);
          closeOverlay();
        } catch (error) {
          window.alert(error.message);
          reopenButton.disabled = false;
        }
      });

      management.append(finishedSelect, reopenButton);
    }

    if (!management.children.length) {
      const empty = document.createElement("div");
      empty.className = "trip-camera-empty-message";
      empty.textContent = "There are no trip-management actions right now.";
      management.appendChild(empty);
    }

    body.append(list, title, management);
  }

  function showCreateTripPanel() {
    const body = openPanel(
      "Create a trip or country",
      "The current month and year are added automatically",
    );

    const form = document.createElement("form");
    form.className = "trip-camera-form";

    const input = document.createElement("input");
    input.className = "trip-camera-input";
    input.type = "text";
    input.maxLength = 70;
    input.placeholder = "Example: Bulgaria";
    input.autocomplete = "off";

    const preview = document.createElement("div");
    preview.className = "trip-camera-empty-message";
    preview.textContent = "The full trip name will appear here.";

    const createButton = makeButton(
      "trip-camera-primary-button",
      "Create trip",
      "Create trip",
      "submit",
    );

    input.addEventListener("input", () => {
      try {
        preview.textContent = engine.createFullTripName(input.value);
      } catch {
        preview.textContent = "The full trip name will appear here.";
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (createButton.disabled) return;

      createButton.disabled = true;
      createButton.textContent = "Creating…";

      try {
        const trip = await engine.createTrip(input.value);
        engine.selectTrip(trip.id);
        closeOverlay();
        window.setTimeout(showAddCityPanel, 210);
      } catch (error) {
        window.alert(error.message);
        createButton.disabled = false;
        createButton.textContent = "Create trip";
      }
    });

    form.append(input, preview, createButton);
    body.appendChild(form);
    requestAnimationFrame(() => input.focus());
  }

  function showAddCityPanel() {
    const state = engine?.getState?.() || latestState;

    if (!state?.selectedTrip) {
      window.alert("Select a trip first.");
      return;
    }

    const body = openPanel(
      "Add a city",
      "The selected city stays active until you change it",
    );

    const form = document.createElement("form");
    form.className = "trip-camera-form";

    const tripInfo = document.createElement("div");
    tripInfo.className = "trip-camera-empty-message";
    tripInfo.textContent = state.selectedTrip.name;

    const input = document.createElement("input");
    input.className = "trip-camera-input";
    input.type = "text";
    input.maxLength = 60;
    input.placeholder = "Example: Sofia";
    input.autocomplete = "off";

    const addButton = makeButton(
      "trip-camera-primary-button",
      "Add city",
      "Add city",
      "submit",
    );

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (addButton.disabled) return;

      addButton.disabled = true;
      addButton.textContent = "Adding…";

      try {
        const city = await engine.addCity(state.selectedTrip.id, input.value);
        engine.selectCity(state.selectedTrip.id, city);
        closeOverlay();
      } catch (error) {
        window.alert(error.message);
        addButton.disabled = false;
        addButton.textContent = "Add city";
      }
    });

    form.append(tripInfo, input, addButton);
    body.appendChild(form);
    requestAnimationFrame(() => input.focus());
  }

  function showDestinationPanel() {
    const state = engine?.getState?.() || latestState;
    if (!state) return;

    const body = openPanel(
      "Trip destination",
      "Choose the trip and city used for new photos",
    );

    body.classList.add("trip-camera-destination-panel-body");

    const destinationHero = document.createElement("div");
    destinationHero.className = "trip-camera-destination-hero";

    const destinationHeroIcon = document.createElement("span");
    destinationHeroIcon.className = "trip-camera-destination-hero-icon";
    destinationHeroIcon.setAttribute("aria-hidden", "true");
    destinationHeroIcon.innerHTML = `
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"></path>
        <circle cx="12" cy="10" r="2.2"></circle>
      </svg>
    `;

    const destinationHeroText = document.createElement("div");
    destinationHeroText.className = "trip-camera-destination-hero-text";
    const destinationHeroTrip = document.createElement("strong");
    const destinationHeroCity = document.createElement("span");
    destinationHeroText.append(destinationHeroTrip, destinationHeroCity);
    destinationHero.append(destinationHeroIcon, destinationHeroText);

    const form = document.createElement("div");
    form.className = "trip-camera-form trip-camera-destination-form";

    const tripLabel = document.createElement("label");
    tripLabel.className = "trip-camera-dialog-label";
    tripLabel.textContent = "Trip / country";

    const tripSelect = document.createElement("select");
    tripSelect.className = "trip-camera-dialog-select";

    const tripPlaceholder = document.createElement("option");
    tripPlaceholder.value = "";
    tripPlaceholder.textContent = "Choose a trip";
    tripSelect.appendChild(tripPlaceholder);

    state.activeTrips.forEach((trip) => {
      const option = document.createElement("option");
      option.value = trip.id;
      option.textContent = trip.name;
      option.selected = trip.id === state.selectedTripId;
      tripSelect.appendChild(option);
    });

    const cityLabel = document.createElement("label");
    cityLabel.className = "trip-camera-dialog-label";
    cityLabel.textContent = "City";

    const citySelect = document.createElement("select");
    citySelect.className = "trip-camera-dialog-select";

    function updateDestinationHero() {
      const current = engine.getState();
      destinationHeroTrip.textContent =
        current.selectedTrip?.name || "Choose a trip";
      destinationHeroCity.textContent = current.selectedCity
        ? `City: ${current.selectedCity}`
        : "Choose or add a city";
    }

    function fillCities() {
      citySelect.innerHTML = "";
      const current = engine.getState();
      const selectedTrip = current.trips.find(
        (trip) => trip.id === tripSelect.value,
      );

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = selectedTrip?.cities?.length
        ? "Choose a city"
        : "No cities yet";
      citySelect.appendChild(placeholder);

      selectedTrip?.cities?.forEach((city) => {
        const option = document.createElement("option");
        option.value = city;
        option.textContent = city;
        option.selected = city === engine.getSelectedCity(selectedTrip.id);
        citySelect.appendChild(option);
      });

      citySelect.disabled = !selectedTrip?.cities?.length;
    }

    tripSelect.addEventListener("change", () => {
      if (tripSelect.value) engine.selectTrip(tripSelect.value);
      fillCities();
      updateDestinationHero();
    });

    citySelect.addEventListener("change", () => {
      if (tripSelect.value && citySelect.value) {
        engine.selectCity(tripSelect.value, citySelect.value);
        updateDestinationHero();
      }
    });

    fillCities();
    updateDestinationHero();

    const buttonRow = document.createElement("div");
    buttonRow.className = "trip-camera-button-row";

    const createTripButton = makeButton(
      "trip-camera-secondary-button",
      "+ New trip",
      "Create a new trip",
    );
    createTripButton.addEventListener("click", showCreateTripPanel);

    const addCityButton = makeButton(
      "trip-camera-secondary-button",
      "+ Add city",
      "Add another city",
    );
    addCityButton.disabled = !state.selectedTrip;
    addCityButton.addEventListener("click", showAddCityPanel);

    buttonRow.append(createTripButton, addCityButton);
    form.append(tripLabel, tripSelect, cityLabel, citySelect, buttonRow);
    body.append(destinationHero, form);
  }

  function createInterface() {
    const root = document.createElement("div");
    root.className = "trip-camera-ui-root";
    root.hidden = true;

    const topbar = document.createElement("div");
    topbar.className = "trip-camera-topbar";

    const modeSwitch = document.createElement("div");
    modeSwitch.className = "trip-camera-mode-switch";

    const chatButton = makeButton(
      "trip-camera-mode-button",
      "Chat",
      "Use Chat camera mode",
    );
    const tripButton = makeButton(
      "trip-camera-mode-button",
      "Trip",
      "Use Trip camera mode",
    );
    modeSwitch.append(chatButton, tripButton);

    const selectionButton = makeButton(
      "trip-camera-selection-button",
      "",
      "Choose trip and city",
    );

    const selectionIcon = document.createElement("span");
    selectionIcon.className = "trip-camera-selection-icon";
    selectionIcon.setAttribute("aria-hidden", "true");
    selectionIcon.innerHTML = `
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"></path>
        <circle cx="12" cy="10" r="2.1"></circle>
      </svg>
    `;

    const selectionText = document.createElement("span");
    selectionText.className = "trip-camera-selection-text";
    const selectionPrimary = document.createElement("strong");
    const selectionSecondary = document.createElement("small");
    const selectionChevron = document.createElement("span");
    selectionChevron.className = "trip-camera-selection-chevron";
    selectionChevron.textContent = "⌄";
    selectionText.append(selectionPrimary, selectionSecondary);
    selectionButton.append(selectionIcon, selectionText, selectionChevron);

    const cornerActions = document.createElement("div");
    cornerActions.className = "trip-camera-corner-actions";

    const detailsButton = makeButton(
      "trip-camera-corner-button trip-camera-connection-button",
      "",
      "Connection details",
    );
    detailsButton.innerHTML = `
      <span class="trip-camera-device-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <rect x="4" y="5" width="16" height="11" rx="2"></rect>
          <path d="M2.8 19h18.4"></path>
        </svg>
      </span>
      <span class="trip-camera-connection-dot" aria-hidden="true"></span>
    `;

    const activityButton = makeButton(
      "trip-camera-corner-button trip-camera-activity-button",
      "",
      "Trip Camera activity",
    );
    activityButton.innerHTML = `
      <span class="trip-camera-activity-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M5 19V11"></path>
          <path d="M12 19V5"></path>
          <path d="M19 19v-6"></path>
          <path d="M3 19h18"></path>
        </svg>
      </span>
    `;

    cornerActions.append(activityButton, detailsButton);
    topbar.append(modeSwitch, selectionButton, cornerActions);

    const captureFlash = document.createElement("div");
    captureFlash.className = "trip-camera-capture-flash";

    const saveMessage = document.createElement("div");
    saveMessage.className = "trip-camera-save-message";

    root.append(topbar, captureFlash, saveMessage);

    elements.root = root;
    elements.chatButton = chatButton;
    elements.tripButton = tripButton;
    elements.selectionButton = selectionButton;
    elements.selectionPrimary = selectionPrimary;
    elements.selectionSecondary = selectionSecondary;
    elements.detailsButton = detailsButton;
    elements.connectionDot = detailsButton.querySelector(
      ".trip-camera-connection-dot",
    );
    elements.activityButton = activityButton;
    elements.captureFlash = captureFlash;
    elements.saveMessage = saveMessage;

    chatButton.addEventListener("click", () => engine?.setMode?.("chat"));
    tripButton.addEventListener("click", () => engine?.setMode?.("trip"));
    selectionButton.addEventListener("click", showDestinationPanel);
    detailsButton.addEventListener("click", showDetailsPanel);
    activityButton.addEventListener("click", showActivityPanel);

    return root;
  }

  function updateShutter(state) {
    if (!elements.snapButton) return;

    if (state.mode !== "trip") {
      elements.snapButton.classList.remove("trip-camera-shutter-disabled");
      if (!captureBusy) elements.snapButton.disabled = false;
      return;
    }

    const enabled = Boolean(state.canCaptureTripPhoto && !captureBusy);
    elements.snapButton.disabled = !enabled;
    elements.snapButton.classList.toggle(
      "trip-camera-shutter-disabled",
      !enabled,
    );
  }

  function render(state) {
    latestState = state;
    if (!elements.root) return;

    const tripMode = state.mode === "trip";
    elements.cameraModal?.classList.toggle("trip-camera-trip-mode", tripMode);
    elements.chatButton.classList.toggle("active", !tripMode);
    elements.tripButton.classList.toggle("active", tripMode);
    elements.selectionButton.hidden = !tripMode;
    elements.detailsButton.hidden = !tripMode;
    elements.activityButton.hidden = !tripMode;

    if (state.selectedTrip) {
      elements.selectionPrimary.textContent = state.selectedTrip.name;
      elements.selectionSecondary.textContent =
        state.selectedCity || "Add a city";
    } else {
      elements.selectionPrimary.textContent = "Choose a trip";
      elements.selectionSecondary.textContent = "Tap to create or select";
    }

    const kind = connectionKind(state);
    elements.detailsButton.dataset.connection = kind;
    elements.detailsButton.title = connectionTitle(state);
    elements.detailsButton.setAttribute("aria-label", connectionTitle(state));

    updateShutter(state);
  }

  function attach(options = {}) {
    const who = options.who;
    const cameraModal = options.cameraModal;
    const snapButton = options.snapButton;

    if (!isAllowedUser(who) || !cameraModal || !snapButton || !engine) {
      return false;
    }

    engine.ensureStartedForUser?.(who);

    elements.cameraModal = cameraModal;
    elements.snapButton = snapButton;

    if (!elements.root) createInterface();
    if (!cameraModal.contains(elements.root)) {
      cameraModal.appendChild(elements.root);
    }

    elements.root.hidden = false;
    cameraModal.classList.add("trip-camera-ui-attached");
    attached = true;

    if (!unsubscribe) unsubscribe = engine.subscribe(render);
    render(engine.getState());
    return true;
  }

  function setCaptureBusy(isBusy) {
    captureBusy = Boolean(isBusy);
    if (latestState) updateShutter(latestState);
  }

  function showCaptureFlash() {
    if (!elements.captureFlash) return;
    elements.captureFlash.classList.remove("visible");
    void elements.captureFlash.offsetWidth;
    elements.captureFlash.classList.add("visible");
  }

  function showSaveMessage(message) {
    if (!elements.saveMessage) return;

    window.clearTimeout(saveMessageTimer);
    elements.saveMessage.textContent = String(message || "Photo saved");
    elements.saveMessage.classList.add("visible");

    saveMessageTimer = window.setTimeout(() => {
      elements.saveMessage?.classList.remove("visible");
    }, 2200);
  }

  function onCameraClosed() {
    captureBusy = false;
    closeOverlay();

    if (elements.root) elements.root.hidden = true;
    elements.cameraModal?.classList.remove(
      "trip-camera-ui-attached",
      "trip-camera-trip-mode",
    );
    if (elements.snapButton) {
      elements.snapButton.disabled = false;
      elements.snapButton.classList.remove("trip-camera-shutter-disabled");
    }
  }

  window.KikiMikiTripCameraUI = Object.freeze({
    attach,
    setCaptureBusy,
    showCaptureFlash,
    showSaveMessage,
    onCameraClosed,
    get attached() {
      return attached;
    },
  });
})();
