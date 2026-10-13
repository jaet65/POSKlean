import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredConfigFields = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missingConfigFields = requiredConfigFields.filter((field) => !firebaseConfig[field]);

export const firebaseConfigError = missingConfigFields.length
  ? `Falta configurar Firebase. Completa ${missingConfigFields
    .map((field) => `VITE_FIREBASE_${field.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`)
    .join(', ')} en el archivo .env.local.`
  : null;

const app = firebaseConfigError
  ? null
  : getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);

export const db = app ? getFirestore(app) : null;
