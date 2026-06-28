"use strict";

(function () {
  const engine = window.KikiMikiTripCamera;
  const config = window.KIKI_MIKI_TRIP_CONFIG || {};

  let attached = false;
  let captureBusy = false;
  let unsubscribe = null;
  let latestState = null;
  let saveMessageTimer = null;

  const elements = {};

  function isAllowedUser(who) {
    const allowed = Array.isArray(config.allowedUsers)
      ? config.allowedUsers
      : ["mikica"];

    return config.enabled !== false && allowed.includes(who);
  }

  function makeButton(className, text, label) {
    const button = document.createElement("button");
    button.type = "button";
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
      if (event.target === overlay) {
        closeOverlay();
      }
    });

    requestAnimationFrame(() => {
      overlay.classList.add("visible");
    });

    return body;
  }

  function createInfoCard(label, value) {
    const card = document.createElement("div");
    card.className = "trip-camera-info-card";

    const labelElement = document.createElement("span");
    labelElement.className = "trip-camera-info-card-label";
    labelElement.textContent = label;

    const valueElement = document.createElement("strong");
    valueElement.className = "trip-camera-info-card-value";
    valueElement.textContent = value;

    card.append(labelElement, valueElement);

    return card;
  }

  function createCounterRow(label, value) {
    const row = document.createElement("div");
    row.className = "trip-camera-counter-row";

    const labelElement = document.createElement("span");
    labelElement.className = "trip-camera-counter-label";
    labelElement.textContent = label;

    const valueElement = document.createElement("strong");
    valueElement.className = "trip-camera-counter-value";
    valueElement.textContent = String(value ?? 0);

    row.append(labelElement, valueElement);

    return row;
  }

  function showDetailsPanel() {
    const state = engine?.getState?.() || latestState;

    if (!state) {
      return;
    }

    const body = openPanel(
      "Trip Camera details",
      "Laptop, storage and fallback availability",
    );

    const mainStatus = document.createElement("div");
    mainStatus.className = "trip-camera-main-status";

    const icon = document.createElement("div");
    icon.className = "trip-camera-main-status-icon";
    icon.textContent = state.laptopOnline ? "💻" : "☁️";

    const text = document.createElement("div");
    text.className = "trip-camera-main-status-text";

    const title = document.createElement("strong");
    const description = document.createElement("span");

    if (state.laptopOnline) {
      title.textContent = "Laptop is online";
      description.textContent = "New photos are sent directly to the laptop.";
    } else if (state.cloudinaryAvailable) {
      title.textContent = "Cloudinary fallback is ready";
      description.textContent =
        "Photos will wait safely in Cloudinary until the laptop returns.";
    } else {
      title.textContent = "No safe destination";
      description.textContent =
        "The shutter remains unavailable until the laptop or Cloudinary returns.";
    }

    text.append(title, description);
    mainStatus.append(icon, text);

    const battery = state.laptopStatus?.battery;
    const storage = state.laptopStatus?.storage;

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

    const grid = document.createElement("div");
    grid.className = "trip-camera-card-grid";

    grid.append(
      createInfoCard("Battery", batteryText),
      createInfoCard("Storage", storageText),
      createInfoCard(
        "Cloudinary",
        state.cloudinaryAvailable ? "Available" : "Unavailable",
      ),
      createInfoCard(
        "Last connection",
        formatDateTime(state.receiverPublishedAt),
      ),
    );

    const selectionTitle = document.createElement("div");
    selectionTitle.className = "trip-camera-section-title";
    selectionTitle.textContent = "Current selection";

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

        window.setTimeout(() => {
          showDetailsPanel();
        }, 200);
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

    if (!state) {
      return;
    }

    const body = openPanel(
      "Trip Camera activity",
      "Only statuses are shown here—never photo previews",
    );

    const list = document.createElement("div");
    list.className = "trip-camera-counter-list";

    list.append(
      createCounterRow("Taken this session", state.counters.taken),
      createCounterRow("Saved on laptop", state.counters.savedOnLaptop),
      createCounterRow("Cloudinary waiting", state.counters.cloudinaryWaiting),
      createCounterRow("Uploading now", state.counters.uploading),
      createCounterRow("Waiting to retry", state.counters.waitingToRetry),
      createCounterRow("Failed", state.counters.failed),
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
          `Finish “${state.selectedTrip.name}”? ` +
            "The photos stay on the laptop and the trip can be reopened later.",
        );

        if (!confirmed) {
          return;
        }

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

    if (state.finishedTrips.length > 0) {
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
        if (!finishedSelect.value) {
          return;
        }

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
      "Create a trip",
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

    preview.textContent = "The full name will appear here.";

    const createButton = makeButton(
      "trip-camera-primary-button",
      "Create trip",
      "Create trip",
    );

    input.addEventListener("input", () => {
      try {
        preview.textContent = engine.createFullTripName(input.value);
      } catch {
        preview.textContent = "The full name will appear here.";
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      createButton.disabled = true;
      createButton.textContent = "Creating…";

      try {
        const trip = await engine.createTrip(input.value);

        engine.selectTrip(trip.id);

        closeOverlay();

        window.setTimeout(() => {
          showAddCityPanel();
        }, 210);
      } catch (error) {
        window.alert(error.message);

        createButton.disabled = false;
        createButton.textContent = "Create trip";
      }
    });

    form.append(input, preview, createButton);

    body.appendChild(form);

    requestAnimationFrame(() => {
      input.focus();
    });
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
      "Add and select city",
      "Add and select city",
    );

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      addButton.disabled = true;
      addButton.textContent = "Adding…";

      try {
        await engine.addCity(state.selectedTrip.id, input.value);

        closeOverlay();
      } catch (error) {
        window.alert(error.message);

        addButton.disabled = false;
        addButton.textContent = "Add and select city";
      }
    });

    form.append(tripInfo, input, addButton);

    body.appendChild(form);

    requestAnimationFrame(() => {
      input.focus();
    });
  }
  function populateTripSelect(state) {
    const select = elements.tripSelect;

    if (!select) {
      return;
    }

    const previous = state.selectedTripId || "";

    select.replaceChildren();

    const placeholder = document.createElement("option");

    placeholder.value = "";

    placeholder.textContent = state.activeTrips.length
      ? "Choose a trip"
      : "No active trips";

    select.appendChild(placeholder);

    state.activeTrips.forEach((trip) => {
      const option = document.createElement("option");

      option.value = trip.id;
      option.textContent = trip.name;

      select.appendChild(option);
    });

    const create = document.createElement("option");

    create.value = "__create__";
    create.textContent = "＋ Create new trip";

    select.appendChild(create);

    select.value = state.activeTrips.some((trip) => trip.id === previous)
      ? previous
      : "";
  }

  function populateCitySelect(state) {
    const select = elements.citySelect;

    if (!select) {
      return;
    }

    select.replaceChildren();

    const trip = state.selectedTrip;

    const placeholder = document.createElement("option");

    placeholder.value = "";

    placeholder.textContent = trip ? "Choose a city" : "Select trip first";

    select.appendChild(placeholder);

    if (trip?.status === "active") {
      trip.cities.forEach((city) => {
        const option = document.createElement("option");

        option.value = city;
        option.textContent = city;

        select.appendChild(option);
      });

      const add = document.createElement("option");

      add.value = "__add__";
      add.textContent = "＋ Add another city";

      select.appendChild(add);
    }

    select.disabled = !trip || trip.status !== "active";

    select.value = state.selectedCity || "";
  }

  function updateDestinationStatus(state) {
    const status = elements.destinationStatus;

    const text = elements.destinationText;

    if (!status || !text) {
      return;
    }

    status.classList.remove("laptop", "cloudinary", "offline");

    if (state.laptopOnline) {
      status.classList.add("laptop");

      text.textContent = "Laptop connected · direct saving";
    } else if (state.cloudinaryAvailable) {
      status.classList.add("cloudinary");

      text.textContent = "Laptop offline · Cloudinary fallback ready";
    } else {
      status.classList.add("offline");

      text.textContent = "No safe storage destination";
    }
  }

  function updateShutter(state) {
    if (!elements.snapButton) {
      return;
    }

    const warning = elements.warning;
    const isTrip = state.mode === "trip";

    if (!isTrip) {
      elements.snapButton.disabled = false;

      elements.snapButton.classList.remove("trip-camera-shutter-disabled");

      warning.hidden = true;

      return;
    }

    const allowed = state.canCaptureTripPhoto && !captureBusy;

    elements.snapButton.disabled = !allowed;

    elements.snapButton.classList.toggle(
      "trip-camera-shutter-disabled",
      !allowed,
    );

    warning.hidden = allowed;

    if (!state.selectedTrip) {
      warning.textContent = "Select or create a trip before taking photos.";
    } else if (state.selectedTrip.status !== "active") {
      warning.textContent = "This trip is finished. Reopen it to take photos.";
    } else if (!state.selectedCity) {
      warning.textContent = "Choose or add a city before taking photos.";
    } else {
      warning.textContent =
        "Laptop and Cloudinary are unavailable. The shutter is disabled.";
    }
  }

  function render(state) {
    latestState = state;

    if (!elements.root) {
      return;
    }

    const isTrip = state.mode === "trip";

    elements.chatButton.classList.toggle("active", !isTrip);

    elements.tripButton.classList.toggle("active", isTrip);

    elements.tripControls.hidden = !isTrip;

    elements.cornerActions.hidden = !isTrip;

    elements.destinationStatus.hidden = !isTrip;

    populateTripSelect(state);
    populateCitySelect(state);
    updateDestinationStatus(state);
    updateShutter(state);
  }

  function buildInterface(options) {
    const root = document.createElement("div");
    root.className = "trip-camera-ui-root";

    const modeSwitch = document.createElement("div");

    modeSwitch.className = "trip-camera-mode-switch";

    const chatButton = makeButton(
      "trip-camera-mode-button active",
      "Chat",
      "Use Chat camera mode",
    );

    const tripButton = makeButton(
      "trip-camera-mode-button",
      "Trip",
      "Use Trip camera mode",
    );

    modeSwitch.append(chatButton, tripButton);

    const cornerActions = document.createElement("div");

    cornerActions.className = "trip-camera-corner-actions";

    const detailsButton = makeButton(
      "trip-camera-corner-button",
      "ⓘ",
      "Connection details",
    );

    const activityButton = makeButton(
      "trip-camera-corner-button",
      "▥",
      "Upload activity",
    );

    cornerActions.append(detailsButton, activityButton);

    const tripControls = document.createElement("div");

    tripControls.className = "trip-camera-trip-controls";

    const tripField = document.createElement("label");

    tripField.className = "trip-camera-field";

    const tripLabel = document.createElement("span");

    tripLabel.className = "trip-camera-field-label";

    tripLabel.textContent = "Trip";

    const tripSelect = document.createElement("select");

    tripSelect.className = "trip-camera-select";

    tripField.append(tripLabel, tripSelect);

    const cityField = document.createElement("label");

    cityField.className = "trip-camera-field";

    const cityLabel = document.createElement("span");

    cityLabel.className = "trip-camera-field-label";

    cityLabel.textContent = "City";

    const citySelect = document.createElement("select");

    citySelect.className = "trip-camera-select";

    cityField.append(cityLabel, citySelect);

    tripControls.append(tripField, cityField);

    const destinationStatus = document.createElement("div");

    destinationStatus.className = "trip-camera-destination-status";

    const destinationDot = document.createElement("span");

    destinationDot.className = "trip-camera-status-dot";

    const destinationText = document.createElement("span");

    destinationStatus.append(destinationDot, destinationText);

    const warning = document.createElement("div");

    warning.className = "trip-camera-shutter-warning";

    warning.hidden = true;

    const flash = document.createElement("div");

    flash.className = "trip-camera-capture-flash";

    const saveMessage = document.createElement("div");

    saveMessage.className = "trip-camera-save-message";

    root.append(
      modeSwitch,
      cornerActions,
      tripControls,
      destinationStatus,
      warning,
      flash,
      saveMessage,
    );

    options.cameraModal.appendChild(root);

    Object.assign(elements, {
      root,
      chatButton,
      tripButton,
      cornerActions,
      tripControls,
      tripSelect,
      citySelect,
      destinationStatus,
      destinationText,
      warning,
      flash,
      saveMessage,
      snapButton: options.snapButton,
    });

    chatButton.addEventListener("click", () => {
      engine.setMode("chat");
      options.snapButton.disabled = false;
    });

    tripButton.addEventListener("click", async () => {
      engine.setMode("trip");

      await engine.refreshAvailability();
    });

    detailsButton.addEventListener("click", showDetailsPanel);

    activityButton.addEventListener("click", showActivityPanel);

    tripSelect.addEventListener("change", () => {
      if (tripSelect.value === "__create__") {
        tripSelect.value = latestState?.selectedTripId || "";

        showCreateTripPanel();

        return;
      }

      if (tripSelect.value) {
        engine.selectTrip(tripSelect.value);
      }
    });

    citySelect.addEventListener("change", () => {
      if (citySelect.value === "__add__") {
        citySelect.value = latestState?.selectedCity || "";

        showAddCityPanel();

        return;
      }

      if (citySelect.value && latestState?.selectedTripId) {
        engine.selectCity(latestState.selectedTripId, citySelect.value);
      }
    });
  }
  function attach(options) {
    if (attached) {
      return true;
    }

    if (
      !engine ||
      !options?.cameraModal ||
      !options?.snapButton ||
      !isAllowedUser(options.who)
    ) {
      return false;
    }

    attached = true;

    buildInterface(options);

    unsubscribe = engine.subscribe(render);

    return true;
  }

  function setCaptureBusy(value) {
    captureBusy = Boolean(value);

    if (latestState) {
      updateShutter(latestState);
    }
  }

  function showCaptureFlash() {
    if (!elements.flash) {
      return;
    }

    elements.flash.classList.remove("visible");

    void elements.flash.offsetWidth;

    elements.flash.classList.add("visible");
  }

  function showSaveMessage(text) {
    if (!elements.saveMessage) {
      return;
    }

    clearTimeout(saveMessageTimer);

    elements.saveMessage.textContent = text;

    elements.saveMessage.classList.add("visible");

    saveMessageTimer = window.setTimeout(() => {
      elements.saveMessage?.classList.remove("visible");
    }, 2200);
  }

  function onCameraClosed() {
    closeOverlay();
    setCaptureBusy(false);
  }

  function destroy() {
    unsubscribe?.();
    unsubscribe = null;

    elements.root?.remove();

    closeOverlay();

    attached = false;
  }

  window.KikiMikiTripCameraUI = Object.freeze({
    attach,
    setCaptureBusy,
    showCaptureFlash,
    showSaveMessage,
    onCameraClosed,
    destroy,
  });
})();
