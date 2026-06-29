"use strict";

(function () {
  const root = document.documentElement;
  root.classList.add("chat-viewport-managed");

  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  let animationFrame = 0;
  let delayedTimers = [];
  let lastHeight = -1;
  let lastWidth = -1;
  let lastTop = -1;
  let lastLeft = -1;

  function readViewport() {
    const viewport = window.visualViewport;

    return {
      height: Math.max(
        1,
        Math.round(
          viewport?.height ||
            window.innerHeight ||
            document.documentElement.clientHeight ||
            1,
        ),
      ),
      width: Math.max(
        1,
        Math.round(
          viewport?.width ||
            window.innerWidth ||
            document.documentElement.clientWidth ||
            1,
        ),
      ),
      top: Math.max(0, Math.round(viewport?.offsetTop || 0)),
      left: Math.max(0, Math.round(viewport?.offsetLeft || 0)),
    };
  }

  function resetDocumentScroll() {
    document.documentElement.scrollTop = 0;

    if (document.body) {
      document.body.scrollTop = 0;
    }

    if (window.scrollX !== 0 || window.scrollY !== 0) {
      window.scrollTo(0, 0);
    }
  }

  function applyViewport(force = false) {
    const next = readViewport();

    if (
      !force &&
      next.height === lastHeight &&
      next.width === lastWidth &&
      next.top === lastTop &&
      next.left === lastLeft
    ) {
      resetDocumentScroll();
      return;
    }

    lastHeight = next.height;
    lastWidth = next.width;
    lastTop = next.top;
    lastLeft = next.left;

    root.style.setProperty("--chat-viewport-height", `${next.height}px`);
    root.style.setProperty("--chat-viewport-width", `${next.width}px`);
    root.style.setProperty("--chat-viewport-top", `${next.top}px`);
    root.style.setProperty("--chat-viewport-left", `${next.left}px`);

    resetDocumentScroll();
  }

  function scheduleViewport(force = false) {
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(() => applyViewport(force));
  }

  function scheduleSettledViewport() {
    delayedTimers.forEach((timer) => clearTimeout(timer));
    delayedTimers = [40, 120, 300, 650].map((delay) =>
      window.setTimeout(() => scheduleViewport(true), delay),
    );
  }

  // Run before chat.css paints the app.
  applyViewport(true);

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      document.body?.classList.add("chat-viewport-managed");
      scheduleViewport(true);
      scheduleSettledViewport();
    },
    { once: true },
  );

  window.addEventListener("load", scheduleSettledViewport, { once: true });
  window.addEventListener("pageshow", scheduleSettledViewport);
  window.addEventListener("resize", () => scheduleViewport());
  window.addEventListener("orientationchange", scheduleSettledViewport);

  window.visualViewport?.addEventListener(
    "resize",
    () => scheduleViewport(),
    { passive: true },
  );

  window.visualViewport?.addEventListener(
    "scroll",
    () => scheduleViewport(),
    { passive: true },
  );

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      scheduleSettledViewport();
    }
  });

  document.addEventListener("focusin", scheduleSettledViewport);
  document.addEventListener("focusout", scheduleSettledViewport);

  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(animationFrame);
    delayedTimers.forEach((timer) => clearTimeout(timer));
    delayedTimers = [];
  });
})();
