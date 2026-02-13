// Firebase Configuration
// Replace these values with your own from Firebase Console after setup

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore Database
const db = firebase.firestore();

// Initialize Storage for images
const storage = firebase.storage();

console.log("Firebase initialized successfully!");
