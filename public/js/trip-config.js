"use strict";

(function () {
  // Trip mode remains a surprise for Kikica for now.
  // Later change this to ["mikica", "kikica"].
  const TRIP_MODE_ALLOWED_USERS = Object.freeze(["mikica"]);

  window.KIKI_MIKI_TRIP_CONFIG = Object.freeze({
    enabled: true,
    allowedUsers: TRIP_MODE_ALLOWED_USERS,

    tripsCollection: "trips",
    fallbackCollection: "tripFallbacks",
    activityCollection: "tripPhotoActivity",

    receiverCollection: "tripSystem",
    receiverDocument: "laptopReceiver",

    // Keep the existing Chat-camera compression untouched.
    changeExistingImageCompression: false,
  });
})();
