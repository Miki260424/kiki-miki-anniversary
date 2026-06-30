"use strict";

/*
 * KikiMiki layered mobile Back handler.
 *
 * One Back/edge-swipe closes exactly one visible in-app layer:
 *   photo -> shared gallery -> Chat page
 *   Trip panel -> camera -> Chat page
 *
 * The script must be loaded in <head> without "defer" so its popstate
 * listener is registered before chat.js.
 */
(function () {
  const GUARD_KEY = "__kmBackGuard";
  const PAGE_KEY = "__kmBackPage";
  const SKIP_KEY = "__KM_SKIP_NEXT_BACK_GESTURE__";

  const PAGE_ID =
    crypto.randomUUID?.() ||
    `page_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  let leavingPage = false;

  function stateObject() {
    const current = history.state;
    return current && typeof current === "object" ? current : {};
  }

  function belongsToThisPage(state) {
    return Boolean(state && state[PAGE_KEY] === PAGE_ID);
  }

  function isGuardState(state) {
    return Boolean(
      belongsToThisPage(state) &&
        state[GUARD_KEY] === true,
    );
  }

  function markCurrentEntryAsBase() {
    if (belongsToThisPage(history.state)) return;

    history.replaceState(
      {
        ...stateObject(),
        [PAGE_KEY]: PAGE_ID,
        [GUARD_KEY]: false,
      },
      "",
      location.href,
    );
  }

  function ensureGuardEntry() {
    if (isGuardState(history.state)) return;

    history.pushState(
      {
        ...stateObject(),
        [PAGE_KEY]: PAGE_ID,
        [GUARD_KEY]: true,
      },
      "",
      location.href,
    );
  }

  function isVisible(element) {
    if (!element || !element.isConnected || element.hidden) return false;

    const style = window.getComputedStyle(element);

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number.parseFloat(style.opacity || "1") === 0
    ) {
      return false;
    }

    return (
      element.getClientRects().length > 0 ||
      style.position === "fixed"
    );
  }

  function lastVisible(selector) {
    const matches = Array.from(document.querySelectorAll(selector));

    for (let index = matches.length - 1; index >= 0; index -= 1) {
      if (isVisible(matches[index])) return matches[index];
    }

    return null;
  }

  function clickElement(element) {
    if (!element) return false;

    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );

    return true;
  }

  function closeInside(root, selector) {
    return Boolean(root && clickElement(root.querySelector(selector)));
  }

  function getTopLayer() {
    let element = lastVisible(".trip-camera-overlay.visible");
    if (element) {
      return {
        name: "trip-panel",
        close: () =>
          closeInside(element, ".trip-camera-panel-close") ||
          clickElement(element),
      };
    }

    element = lastVisible(".separate-blur-overlay.visible");
    if (element) {
      return {
        name: "blur-picker",
        close: () =>
          closeInside(element, ".separate-blur-close") ||
          clickElement(element),
      };
    }

    element = lastVisible(".reaction-picker-overlay.visible");
    if (element) {
      return {
        name: "reaction-picker",
        close: () =>
          closeInside(element, ".reaction-picker-close") ||
          clickElement(element),
      };
    }

    /*
     * The lightbox must be checked before .chat-feature-overlay.
     * A shared-gallery photo is the top layer while the gallery remains behind.
     */
    element = lastVisible("#lightbox.open");
    if (element) {
      return {
        name: "lightbox",
        close: () =>
          closeInside(element, "#lightbox-close") ||
          clickElement(element),
      };
    }

    element = lastVisible(".img-action-popover.visible");
    if (element) {
      return {
        name: "image-actions",
        close: () => {
          document.documentElement.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
            }),
          );
          return true;
        },
      };
    }

    element = lastVisible(".reaction-bar.visible");
    if (element) {
      return {
        name: "reaction-bar",
        close: () => {
          document.documentElement.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
            }),
          );
          return true;
        },
      };
    }

    element = lastVisible(".chat-feature-overlay.visible");
    if (element) {
      return {
        name: "chat-feature",
        close: () =>
          closeInside(element, ".chat-feature-close") ||
          clickElement(element),
      };
    }

    element = lastVisible("#camera-modal.open");
    if (element) {
      return {
        name: "camera",
        close: () =>
          closeInside(element, "#close-camera-btn"),
      };
    }

    element = lastVisible("#emoji-tray.open");
    if (element) {
      return {
        name: "emoji-tray",
        close: () => {
          element.classList.remove("open");
          return true;
        },
      };
    }

    element = lastVisible(".dropdown.open, .dropdown-menu.open");
    if (element) {
      return {
        name: "dropdown",
        close: () => {
          element.classList.remove("open");
          return true;
        },
      };
    }

    element = lastVisible("#popUpWindowInsertionOfMemory");
    if (
      element &&
      window.getComputedStyle(element).display !== "none"
    ) {
      return {
        name: "add-memory",
        close: () =>
          clickElement(document.getElementById("backBtnMemory")) ||
          clickElement(document.getElementById("imageBackArrow")),
      };
    }

    element = lastVisible("#popUpWindow");
    if (
      element &&
      window.getComputedStyle(element).display !== "none"
    ) {
      return {
        name: "memory-or-song",
        close: () =>
          clickElement(
            element.querySelector("#backBnt") ||
              document.getElementById("backBnt"),
          ),
      };
    }

    element = lastVisible("#placePopUpWindow.visible");
    if (element) {
      return {
        name: "place-popup",
        close: () =>
          clickElement(
            element.querySelector("#placeBackBtn") ||
              document.getElementById("placeBackBtn"),
          ),
      };
    }

    return null;
  }

  function restorePageGuard() {
    markCurrentEntryAsBase();
    ensureGuardEntry();
  }

  function leaveThroughSyntheticBaseEntry() {
    if (leavingPage) return;
    leavingPage = true;

    const currentUrl = location.href;
    history.back();

    window.setTimeout(() => {
      /*
       * A directly opened page may have no earlier browser entry. Restore the
       * page guard if the browser stayed on the same document.
       */
      if (
        location.href === currentUrl &&
        document.visibilityState !== "hidden"
      ) {
        restorePageGuard();
      }

      leavingPage = false;
    }, 350);
  }

  function handlePopState(event) {
    /*
     * closeLightbox() uses history.back() after the X button is pressed.
     * At that moment the lightbox is already gone but the gallery is still
     * visible. This flag prevents that history cleanup from closing the gallery.
     */
    if (window[SKIP_KEY] === true) {
      window[SKIP_KEY] = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.setTimeout(restorePageGuard, 0);
      return;
    }

    /*
     * This is evaluated synchronously, before chat.js can react to popstate.
     * Therefore a Trip panel closes before the camera, and a lightbox closes
     * before the shared gallery.
     */
    const topLayer = getTopLayer();

    if (topLayer) {
      event.preventDefault();
      event.stopImmediatePropagation();

      try {
        topLayer.close();
      } finally {
        window.setTimeout(restorePageGuard, 0);
      }

      return;
    }

    /*
     * Manual camera close moves cameraOpen -> our guard state. The camera is
     * already closed, so remain on the page and do not consume another entry.
     */
    if (
      isGuardState(event.state) ||
      isGuardState(history.state)
    ) {
      return;
    }

    /*
     * No in-app layer is open. The Back gesture moved from our guard entry to
     * the synthetic base entry, so one additional history.back() performs the
     * user's intended normal page navigation.
     */
    window.setTimeout(leaveThroughSyntheticBaseEntry, 0);
  }

  function initialise() {
    markCurrentEntryAsBase();
    ensureGuardEntry();
  }

  /*
   * Register immediately and in capture mode. The HTML loads this file in the
   * head without defer, before chat.js registers its own popstate listener.
   */
  window.addEventListener("popstate", handlePopState, true);

  window.addEventListener("pageshow", () => {
    if (!leavingPage) initialise();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialise, {
      once: true,
    });
  } else {
    initialise();
  }
})();
