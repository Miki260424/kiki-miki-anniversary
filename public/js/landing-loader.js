"use strict";

(function () {
  const loader = document.getElementById("loader");
  let authReady = window.__MK_AUTH_READY__ === true;
  let pageReady = document.readyState === "complete";
  let finished = false;
  let authPoll = 0;

  if (!loader) {
    console.error("Landing loader element was not found.");
    unlockPage();
    return;
  }

  function lockPage() {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }

  function unlockPage() {
    const root = document.documentElement;
    const body = document.body;

    root.classList.remove(
      "page-loading",
      "landing-page-loading",
      "mk-auth-pending",
    );

    body.classList.remove(
      "page-loading",
      "landing-page-loading",
      "mk-auth-pending",
    );

    [
      "overflow",
      "overflow-y",
      "height",
      "min-height",
      "position",
      "inset",
      "top",
      "right",
      "bottom",
      "left",
      "touch-action",
    ].forEach(function (property) {
      root.style.removeProperty(property);
      body.style.removeProperty(property);
    });

    body.style.removeProperty("display");
    body.style.removeProperty("visibility");
    body.style.removeProperty("opacity");
  }

  function hideLoader() {
    if (finished) return;

    finished = true;
    loader.style.display = "none";
    loader.setAttribute("aria-hidden", "true");

    unlockPage();

    requestAnimationFrame(unlockPage);
    window.setTimeout(unlockPage, 50);
    window.setTimeout(unlockPage, 250);

    if (authPoll) {
      clearInterval(authPoll);
      authPoll = 0;
    }
  }

  function finishWhenReady() {
    authReady = authReady || window.__MK_AUTH_READY__ === true;
    pageReady = pageReady || document.readyState === "complete";

    if (!authReady || !pageReady || finished) {
      return;
    }

    hideLoader();
  }

  lockPage();
  loader.style.display = "block";
  loader.removeAttribute("aria-hidden");

  window.addEventListener(
    "load",
    function () {
      pageReady = true;
      finishWhenReady();
    },
    { once: true },
  );

  window.addEventListener("mk_user_ready", function () {
    authReady = true;
    finishWhenReady();
  });

  window.addEventListener("pageshow", function () {
    if (window.__MK_AUTH_READY__ === true) authReady = true;
    if (document.readyState === "complete") pageReady = true;

    if (finished) {
      unlockPage();
    } else {
      finishWhenReady();
    }
  });

  authPoll = window.setInterval(function () {
    if (window.__MK_AUTH_READY__ === true) {
      authReady = true;
      finishWhenReady();
    }
  }, 100);

  finishWhenReady();
})();
