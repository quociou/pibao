import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCyz8eakCVFkSlNOlVMvEst2lJFWsdBFes",
  authDomain: "pibao-f39f9.firebaseapp.com",
  projectId: "pibao-f39f9",
  storageBucket: "pibao-f39f9.firebasestorage.app",
  messagingSenderId: "782164379236",
  appId: "1:782164379236:web:6d3ab7d5c0981b28010171",
  measurementId: "G-HT2TQ9JXEX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

export { app, db, analytics };