"use strict";

/*
 * KikiMiki mobile back-gesture guard
 *
 * Android/iOS browser back gestures should close the top in-app overlay first
 * instead of immediately navigating away from the current page.
 *
 * Covered overlays:
 * - Chat camera
 * - Chat photo lightbox / shared-media gallery
 * - Trip Camera panels
 * - Reaction picker / image action menu / blur picker
 * - Timeline memory viewer and add-memory form
 * - Favourites song and place popups
 *
 * Normal browser Back still leaves the page when no overlay is open.
 */
(function () {
  const GUARD_KEY = "__kmBackGuard";
  const PAGE_KEY = "__kmBackPage";
  const PAGE_ID =
    crypto.randomUUID?.() ||
    `page_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  let handlingPopState = false;
  let leavingPage = false;

  function stateObject() {
    const current = history.state;
    return current && typeof current === "object" ? current : {};
  }

  function isThisPageState(state) {
    return Boolean(state && state[PAGE_KEY] === PAGE_ID);
  }

  function isGuardState(state) {
    return Boolean(
      isThisPageState(state) &&
        state[GUARD_KEY] === true,
    );
  }

  function markCurrentEntryAsBase() {
    if (isThisPageState(history.state)) return;

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

  function clickCloseInside(root, selector) {
    if (!root) return false;
    return clickElement(root.querySelector(selector));
  }

  function closeTopOverlay() {
    // Trip Camera selection/details/activity panels sit above the camera.
    let overlay = lastVisible(".trip-camera-overlay.visible");
    if (overlay) {
      return (
        clickCloseInside(overlay, ".trip-camera-panel-close") ||
        clickElement(overlay)
      );
    }

    // Separate blur-selection dialog.
    overlay = lastVisible(".separate-blur-overlay.visible");
    if (overlay) {
      return (
        clickCloseInside(overlay, ".separate-blur-close") ||
        clickElement(overlay)
      );
    }

    // Reaction picker.
    overlay = lastVisible(".reaction-picker-overlay.visible");
    if (overlay) {
      return (
        clickCloseInside(overlay, ".reaction-picker-close") ||
        clickElement(overlay)
      );
    }

    // Chat shared media/search/settings full-screen panels.
    overlay = lastVisible(".chat-feature-overlay.visible");
    if (overlay) {
      return (
        clickCloseInside(overlay, ".chat-feature-close") ||
        clickElement(overlay)
      );
    }

    // Long-press image action menu or reaction capsule.
    overlay =
      lastVisible(".img-action-popover.visible") ||
      lastVisible(".reaction-bar.visible");
    if (overlay) {
      document.documentElement.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      );
      return true;
    }

    // Chat image lightbox.
    overlay = lastVisible("#lightbox.open");
    if (overlay) {
      return (
        clickCloseInside(overlay, "#lightbox-close") ||
        clickElement(overlay)
      );
    }

    // Chat camera.
    overlay = lastVisible("#camera-modal.open");
    if (overlay) {
      return (
        clickCloseInside(overlay, "#close-camera-btn") ||
        false
      );
    }

    // Emoji tray and open dropdowns are lightweight overlays.
    overlay = lastVisible("#emoji-tray.open");
    if (overlay) {
      overlay.classList.remove("open");
      return true;
    }

    overlay = lastVisible(".dropdown.open, .dropdown-menu.open");
    if (overlay) {
      overlay.classList.remove("open");
      return true;
    }

    // Timeline: add-memory form.
    overlay = lastVisible("#popUpWindowInsertionOfMemory");
    if (overlay) {
      const display = window.getComputedStyle(overlay).display;
      if (display !== "none") {
        return (
          clickElement(document.getElementById("backBtnMemory")) ||
          clickElement(document.getElementById("imageBackArrow"))
        );
      }
    }

    // Timeline memory viewer or Favourites song popup.
    overlay = lastVisible("#popUpWindow");
    if (overlay) {
      const display = window.getComputedStyle(overlay).display;
      if (display !== "none") {
        return clickElement(
          overlay.querySelector("#backBnt") ||
            document.getElementById("backBnt"),
        );
      }
    }

    // Favourites place popup.
    overlay = lastVisible("#placePopUpWindow.visible");
    if (overlay) {
      return clickElement(
        overlay.querySelector("#placeBackBtn") ||
          document.getElementById("placeBackBtn"),
      );
    }

    return false;
  }

  function restoreGuardAfterOverlayClose() {
    markCurrentEntryAsBase();
    ensureGuardEntry();
  }

  function continueNormalBackNavigation() {
    if (leavingPage) return;
    leavingPage = true;

    const pageUrl = location.href;
    history.back();

    // A directly opened page may have no previous history entry. In that case
    // restore the guard so a later overlay still behaves correctly.
    window.setTimeout(() => {
      if (
        location.href === pageUrl &&
        document.visibilityState !== "hidden"
      ) {
        markCurrentEntryAsBase();
        ensureGuardEntry();
      }

      leavingPage = false;
      handlingPopState = false;
    }, 350);
  }

  function handlePopState(event) {
    if (handlingPopState) return;
    handlingPopState = true;

    // Let page-specific popstate listeners run first. The existing Chat
    // camera/lightbox handlers may already close their own overlay.
    window.setTimeout(() => {
      const closedOverlay = closeTopOverlay();

      if (closedOverlay) {
        restoreGuardAfterOverlayClose();
        handlingPopState = false;
        return;
      }

      // A page-specific handler already closed a camera/lightbox and returned
      // to our guard entry. Stay on the current page.
      if (isGuardState(event.state) || isGuardState(history.state)) {
        handlingPopState = false;
        return;
      }

      // No overlay is open: preserve normal browser Back behaviour.
      continueNormalBackNavigation();
    }, 0);
  }

  function initialise() {
    markCurrentEntryAsBase();
    ensureGuardEntry();
  }

  window.addEventListener("popstate", handlePopState);

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
