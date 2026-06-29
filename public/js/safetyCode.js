// public/js/safetyCode.js
// Authentication gate for protected pages.
// The page-level loader remains visible while Firebase restores the session.

(function () {
  "use strict";

  window.__MK_AUTH_READY__ = false;
  window.__MK_AUTH_WHO__ = null;

  function publishReady(who) {
    localStorage.setItem("mk_user", who);
    window.__MK_AUTH_WHO__ = who;
    window.__MK_AUTH_READY__ = true;

    window.dispatchEvent(
      new CustomEvent("mk_user_ready", {
        detail: { who },
      }),
    );
  }

  function returnToLogin() {
    window.__MK_AUTH_READY__ = false;
    window.__MK_AUTH_WHO__ = null;
    localStorage.removeItem("mk_user");
    window.location.replace("index.html");
  }

  auth.onAuthStateChanged(function (user) {
    if (!user) {
      returnToLogin();
      return;
    }

    user
      .getIdTokenResult(true)
      .then(function (idTokenResult) {
        const who = idTokenResult.claims.who;

        if (!who) {
          console.warn("No 'who' claim on token. Redirecting to login.");
          returnToLogin();
          return;
        }

        publishReady(who);
      })
      .catch(function (error) {
        console.error("Token fetch failed:", error);
        returnToLogin();
      });
  });
})();
