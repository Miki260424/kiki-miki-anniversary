// ─── public/js/safetyCode.js ─────────────────────────────────────────────────

(function () {
  "use strict";

  window.__MK_AUTH_READY__ = false;
  window.__MK_AUTH_WHO__ = null;

  // Protect page content without hiding the page loader. The old implementation
  // used display:none on the entire body, which also hid the loader and caused
  // a blank white screen while Firebase restored the session.
  const guardStyle = document.createElement("style");
  guardStyle.id = "mk-auth-guard-style";
  guardStyle.textContent = `
    body.mk-auth-pending > :not(#loader) {
      visibility: hidden !important;
    }

    body.mk-auth-pending > #loader {
      display: flex !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
  `;
  document.head.appendChild(guardStyle);

  function markPending() {
    document.body?.classList.add("mk-auth-pending");
  }

  if (document.body) {
    markPending();
  } else {
    document.addEventListener("DOMContentLoaded", markPending, { once: true });
  }

  // Clear the cached identity until the current Firebase user and custom claim
  // have been verified for this page load.
  localStorage.removeItem("mk_user");

  function markAuthenticated(who) {
    localStorage.setItem("mk_user", who);
    window.__MK_AUTH_WHO__ = who;
    window.__MK_AUTH_READY__ = true;
    document.body?.classList.remove("mk-auth-pending");

    window.dispatchEvent(
      new CustomEvent("mk_user_ready", {
        detail: { who },
      }),
    );
  }

  auth.onAuthStateChanged(function (user) {
    if (!user) {
      localStorage.removeItem("mk_user");
      window.location.replace("index.html");
      return;
    }

    user
      .getIdTokenResult(true)
      .then(function (idTokenResult) {
        const who = idTokenResult.claims.who;

        if (!who) {
          console.warn("⚠️ No 'who' claim on token. Redirecting to login.");
          localStorage.removeItem("mk_user");
          window.location.replace("index.html");
          return;
        }

        markAuthenticated(who);
      })
      .catch(function (error) {
        console.error("Token fetch failed:", error);
        localStorage.removeItem("mk_user");
        window.location.replace("index.html");
      });
  });
})();
