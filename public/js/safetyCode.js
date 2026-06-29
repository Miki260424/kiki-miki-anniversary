// public/js/safetyCode.js
// Auth gate for protected pages. The full-screen page loader covers the page
// while Firebase restores the session; this file never hides <body>.

(function () {
  "use strict";

  window.__MK_AUTH_READY__ = false;
  window.__MK_AUTH_WHO__ = null;

  function goToLogin() {
    window.__MK_AUTH_READY__ = false;
    window.__MK_AUTH_WHO__ = null;
    localStorage.removeItem("mk_user");
    window.location.replace("index.html");
  }

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

  auth.onAuthStateChanged(function (user) {
    if (!user) {
      goToLogin();
      return;
    }

    user
      .getIdTokenResult(true)
      .then(function (result) {
        const who = result.claims.who;

        if (!who) {
          console.warn("No 'who' claim on token.");
          goToLogin();
          return;
        }

        publishReady(who);
      })
      .catch(function (error) {
        console.error("Token fetch failed:", error);
        goToLogin();
      });
  });
})();
