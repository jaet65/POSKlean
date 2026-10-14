import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
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
  ? `Falta configurar las variables de entorno de Firebase: ${missingConfigFields
    .map((field) => `VITE_FIREBASE_${field.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`)
    .join(', ')}.`
  : null;

const app = firebaseConfigError
  ? null
  : getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);

export const db = app ? getFirestore(app) : null;
export const auth = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();

const SECONDARY_APP_NAME = 'posklean-user-provisioning';

// Instancia aparte para crear cuentas sin reemplazar la sesión del administrador.
export function getProvisioningAuth() {
  if (!app) return null;
  const existing = getApps().find((candidate) => candidate.name === SECONDARY_APP_NAME);
  return getAuth(existing || initializeApp(firebaseConfig, SECONDARY_APP_NAME));
}

