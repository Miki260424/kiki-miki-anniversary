"use strict";

(function () {
  const LOADER_ID = "loader";
  let pageReady = document.readyState === "complete";
  let authReady = window.__MK_AUTH_READY__ === true;
  let hidden = false;
  let loader = null;

  function ensureLoader() {
    loader = document.getElementById(LOADER_ID);

    if (loader) return loader;

    loader = document.createElement("div");
    loader.id = LOADER_ID;
    loader.innerHTML = `
      <div class="back"></div>
      <div class="heart" aria-hidden="true"></div>
      <p class="landing-loader-text">Loading our world…</p>
    `;

    if (document.body.firstChild) {
      document.body.insertBefore(loader, document.body.firstChild);
    } else {
      document.body.appendChild(loader);
    }

    return loader;
  }

  function showLoader() {
    const element = ensureLoader();

    if (hidden) return;

    element.style.display = "flex";
    element.classList.remove("is-hidden", "is-gone");
    document.documentElement.classList.add("landing-page-loading");
    document.body.classList.add("landing-page-loading");
  }

  function hideLoaderWhenReady() {
    authReady = authReady || window.__MK_AUTH_READY__ === true;

    if (hidden || !pageReady || !authReady) {
      showLoader();
      return;
    }

    hidden = true;
    const element = ensureLoader();

    element.classList.add("is-hidden");
    document.documentElement.classList.remove("landing-page-loading");
    document.body.classList.remove("landing-page-loading");

    window.setTimeout(function () {
      element.classList.add("is-gone");
      element.style.display = "none";
    }, 320);
  }

  function handleAuthReady() {
    authReady = true;
    hideLoaderWhenReady();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      function () {
        showLoader();
        hideLoaderWhenReady();
      },
      { once: true },
    );
  } else {
    showLoader();
  }

  if (pageReady) {
    hideLoaderWhenReady();
  } else {
    window.addEventListener(
      "load",
      function () {
        pageReady = true;
        hideLoaderWhenReady();
      },
      { once: true },
    );
  }

  window.addEventListener("mk_user_ready", handleAuthReady);

  // Covers the case where Firebase finished before this file executed.
  if (window.__MK_AUTH_READY__ === true) {
    handleAuthReady();
  }

  // Never leave a blank white screen. If authentication is unusually slow,
  // keep the visible loader and show a helpful message instead.
  window.setTimeout(function () {
    if (window.__MK_AUTH_READY__ === true || hidden) return;

    const element = ensureLoader();
    let text = element.querySelector(".landing-loader-text");

    if (!text) {
      text = document.createElement("p");
      text.className = "landing-loader-text";
      element.appendChild(text);
    }

    text.textContent = "Still signing you in…";
  }, 8000);
})();
