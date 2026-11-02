import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const env = import.meta.env;

const firebaseConfig: FirebaseOptions = {
  apiKey: env["VITE_FIREBASE_API_KEY"] ?? "",
  authDomain: env["VITE_FIREBASE_AUTH_DOMAIN"] ?? "",
  projectId: env["VITE_FIREBASE_PROJECT_ID"] ?? "",
  storageBucket: env["VITE_FIREBASE_STORAGE_BUCKET"] ?? "",
  messagingSenderId: env["VITE_FIREBASE_MESSAGING_SENDER_ID"] ?? "",
  appId: env["VITE_FIREBASE_APP_ID"] ?? "",
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured || typeof window === "undefined") return null;
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAuth(): Auth | null {
  if (!auth) {
    const instance = getFirebaseApp();
    if (instance) auth = getAuth(instance);
  }
  return auth;
}

export function getFirebaseDb(): Firestore | null {
  if (!db) {
    const instance = getFirebaseApp();
    if (instance) db = getFirestore(instance);
  }
  return db;
}
