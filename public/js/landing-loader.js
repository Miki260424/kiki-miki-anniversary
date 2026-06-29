"use strict";

(function () {
  let loader = null;
  let pageReady = document.readyState === "complete";
  let authReady = window.__MK_AUTH_READY__ === true;
  let finished = false;
  let authPoll = 0;

  function getLoader() {
    loader = document.getElementById("loader");

    if (loader) {
      return loader;
    }

    loader = document.createElement("div");
    loader.id = "loader";
    loader.innerHTML = `
      <div class="back"></div>
      <div class="heart" aria-hidden="true"></div>
    `;

    document.body.insertBefore(loader, document.body.firstChild);
    return loader;
  }

  function clearOldScrollLocks() {
    document.documentElement.classList.remove("landing-page-loading");
    document.body.classList.remove("landing-page-loading");

    document.documentElement.style.removeProperty("overflow");
    document.documentElement.style.removeProperty("overflow-y");
    document.documentElement.style.removeProperty("height");

    document.body.style.removeProperty("overflow");
    document.body.style.removeProperty("overflow-y");
    document.body.style.removeProperty("height");
    document.body.style.removeProperty("position");
    document.body.style.removeProperty("inset");
  }

  function showLoader() {
    const element = getLoader();

    element.classList.remove("is-hidden", "is-gone");
    element.style.display = "block";

    // Match the other pages: only lock scrolling while the loader is visible.
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }

  function finishLoading() {
    authReady = authReady || window.__MK_AUTH_READY__ === true;

    if (finished || !pageReady || !authReady) {
      return;
    }

    finished = true;

    const element = getLoader();
    element.style.display = "none";
    element.classList.add("is-gone");

    // Remove every lock left by both the old and new loader implementations.
    clearOldScrollLocks();

    if (authPoll) {
      window.clearInterval(authPoll);
      authPoll = 0;
    }

    // Mobile browsers sometimes apply the previous overflow value one frame
    // late. Repeat cleanup after layout has settled.
    window.requestAnimationFrame(clearOldScrollLocks);
    window.setTimeout(clearOldScrollLocks, 50);
    window.setTimeout(clearOldScrollLocks, 250);
  }

  function handleAuthReady() {
    authReady = true;
    finishLoading();
  }

  function handlePageReady() {
    pageReady = true;
    finishLoading();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      function () {
        showLoader();
        finishLoading();
      },
      { once: true },
    );
  } else {
    showLoader();
  }

  if (pageReady) {
    handlePageReady();
  } else {
    window.addEventListener("load", handlePageReady, { once: true });
  }

  window.addEventListener("mk_user_ready", handleAuthReady);

  // Covers the race where Firebase authenticated before this script was ready.
  authPoll = window.setInterval(function () {
    if (window.__MK_AUTH_READY__ === true) {
      handleAuthReady();
    }
  }, 100);

  window.addEventListener("pageshow", function () {
    if (window.__MK_AUTH_READY__ === true) {
      authReady = true;
    }

    if (document.readyState === "complete") {
      pageReady = true;
    }

    finishLoading();

    if (finished) {
      clearOldScrollLocks();
    }
  });

  window.addEventListener("pagehide", function () {
    if (authPoll) {
      window.clearInterval(authPoll);
      authPoll = 0;
    }
  });
})();
