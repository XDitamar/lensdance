// src/firebase.js

// Import the functions you need from the SDKs you need

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics"; // unused
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from "firebase/auth";

// Your web app's Firebase configuration
// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCTL0IcIZ4cXhevCucMDJdTn5SKUArbdw8",
    authDomain: "lensdance-8d29c.firebaseapp.com",
    projectId: "lensdance-8d29c",
    storageBucket: "lensdance-8d29c.firebasestorage.app",
    messagingSenderId: "934891365081",
    appId: "1:934891365081:web:0aa7ad1d75f0cc2b4894c8",
    measurementId: "G-QCVD78SS7C"
   
};

// Initialize Firebase
// Initialize Firebase
const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app); // unused
const db = getFirestore(app);
const storage = getStorage(app);

// Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

/**
 * Local testing against the Firebase emulators (Auth, Firestore, Functions):
 *   REACT_APP_USE_EMULATORS=1 npm start
 * Development only, twice over: a production build (NODE_ENV=production) never
 * connects to an emulator whatever the variable says, and without the variable
 * the app talks to the real project exactly as before.
 */
export const USE_EMULATORS =
  process.env.NODE_ENV !== "production" && process.env.REACT_APP_USE_EMULATORS === "1";
if (USE_EMULATORS) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

// Export the instances
export { app, db, storage };
