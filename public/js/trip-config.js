"use strict";

(function () {
  // ═══════════════════════════════════════════════════════════════
  // TRIP MODE SURPRISE SWITCH
  //
  // CURRENTLY ONLY MIKICA CAN SEE AND USE TRIP MODE.
  //
  // Later, to enable it for Kikica, change:
  // ["mikica"]
  //
  // to:
  // ["mikica", "kikica"]
  // ═══════════════════════════════════════════════════════════════
  const TRIP_MODE_ALLOWED_USERS = Object.freeze(["mikica"]);

  window.KIKI_MIKI_TRIP_CONFIG = Object.freeze({
    enabled: true,

    allowedUsers: TRIP_MODE_ALLOWED_USERS,

    // Written automatically by the laptop tunnel manager.
    receiverDocumentCollection: "tripSystem",
    receiverDocumentId: "laptopReceiver",

    // Photos remain controlled by the existing compression code.
    changeExistingImageCompression: false,
  });
})();
