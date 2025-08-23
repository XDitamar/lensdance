// src/firebase.js

// Import the functions you need from the SDKs you need

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

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
const analytics = getAnalytics(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Export the instances
export { db, storage };
