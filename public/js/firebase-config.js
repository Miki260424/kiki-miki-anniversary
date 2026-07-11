// ─── public/js/firebase-config.js ────────────────────────────────────────────

const firebaseConfig = {
  apiKey: "AIzaSyBAFE26kDmBhZaF9nFP1h8RtKVzXq-7E8s",
  authDomain: "kikimikianniversary.firebaseapp.com",
  projectId: "kikimikianniversary",
  storageBucket: "kikimikianniversary.firebasestorage.app",
  messagingSenderId: "841345372926",
  appId: "1:841345372926:web:3a41d189f65a7dc14b8baf",
  measurementId: "G-8PPWFSHJLJ",
};

firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();
const auth = firebase.auth();

// Keep auth session alive across browser tabs and page reloads
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// Cache Firestore data on-device (IndexedDB) so re-opening the app (chat,
// trip camera, etc.) reuses what's already known locally instead of
// re-downloading every document from the server every single time a page
// loads or a listener re-attaches. This does not change any behavior or
// feature — data still updates live the moment something changes — it only
// avoids paying for a full re-read of unchanged documents on every open.
// synchronizeTabs lets multiple open tabs (e.g. phone + laptop) share one
// local cache instead of fighting over it.
db.enablePersistence({ synchronizeTabs: true }).catch((error) => {
  if (error.code === "failed-precondition") {
    // Another tab already owns persistence in a browser that doesn't
    // support multi-tab sync; that tab still works normally.
    console.warn("Firestore offline cache unavailable in this tab (another tab owns it).");
  } else if (error.code === "unimplemented") {
    console.warn("Firestore offline cache is not supported in this browser.");
  } else {
    console.warn("Firestore offline cache could not be enabled:", error);
  }
});

console.log("Firebase initialized successfully!");