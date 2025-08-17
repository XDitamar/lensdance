// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// --- Your Firebase config ---
const firebaseConfig = {
  apiKey: "AIzaSyCTL0IcIZ4cXhevCucMDJdTn5SKUArbdw8",
  authDomain: "lensdance-8d29c.firebaseapp.com",
  projectId: "lensdance-8d29c",
  storageBucket: "lensdance-8d29c.appspot.com", // 👈 corrected `.appspot.com`
  messagingSenderId: "934891365081",
  appId: "1:934891365081:web:0aa7ad1d75f0cc2b4894c8",
  measurementId: "G-QCVD78SS7C",
};

// --- Init app ---
const app = initializeApp(firebaseConfig);

// --- Services ---
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
