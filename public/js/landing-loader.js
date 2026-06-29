"use strict";

(function () {
  const loader = document.getElementById("loader");
  if (!loader) return;

  const shownAt = performance.now();
  let pageLoaded = document.readyState === "complete";
  let authReady = window.__MK_AUTH_READY__ === true;
  let finished = false;

  function finish() {
    if (finished || !pageLoaded || !authReady) return;

    finished = true;
    const minimumVisibleMs = 350;
    const remaining = Math.max(0, minimumVisibleMs - (performance.now() - shownAt));

    window.setTimeout(() => {
      document.body.classList.remove("page-loading", "mk-auth-pending");
      loader.classList.add("is-hidden");

      window.setTimeout(() => {
        loader.style.display = "none";
      }, 320);
    }, remaining);
  }

  if (!pageLoaded) {
    window.addEventListener(
      "load",
      () => {
        pageLoaded = true;
        finish();
      },
      { once: true },
    );
  }

  window.addEventListener(
    "mk_user_ready",
    () => {
      authReady = true;
      finish();
    },
    { once: true },
  );

  const authPoll = window.setInterval(() => {
    if (window.__MK_AUTH_READY__ === true) {
      authReady = true;
      window.clearInterval(authPoll);
      finish();
    }
  }, 100);

  window.setTimeout(() => window.clearInterval(authPoll), 15000);
  finish();
})();
