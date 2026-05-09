import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { RUNTIME_CONFIG } from "./runtimeConfig.ts";

// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyABnaWNsQtQZ2153BoVgQ2E1EJMSTiYmyw",
  authDomain: "wbgetdealgo.firebaseapp.com",
  projectId: "wbgetdealgo",
  storageBucket: "wbgetdealgo.appspot.com",
  messagingSenderId: "103010640500",
  appId: "1:103010640500:web:56ce5d083760f964712721"
};

const app = RUNTIME_CONFIG.USE_FIRESTORE ? initializeApp(firebaseConfig) : null;
export const db = app ? getFirestore(app) : null;
// Analytics is only available in environments with window/browser support
export const analytics = (app && typeof window !== "undefined") ? getAnalytics(app) : null;
export default app;
