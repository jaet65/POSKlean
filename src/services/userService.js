import { 
  collection, 
  deleteDoc, 
  doc, 
  getDoc,
  getDocs, 
  onSnapshot, 
  query, 
  runTransaction,
  setDoc, 
  updateDoc, 
  where 
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword,
  deleteUser as deleteAuthUser,
  GoogleAuthProvider,
  onAuthStateChanged, 
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup, 
  signOut 
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, db, getProvisioningAuth, googleProvider } from '../firebase';

export const SUPER_ADMIN_EMAIL = 'agrazmario@gmail.com';

// Las cuentas usuario/contraseña se autentican en Firebase Auth con un correo ficticio
// derivado del usuario. El dominio .invalid está reservado y nunca recibe correo.
export const AUTH_EMAIL_DOMAIN = 'posklean.invalid';
export const MIN_PASSWORD_LENGTH = 6;
const USERNAME_PATTERN = /^[a-z0-9._-]{2,30}$/;

export const DEFAULT_PERMISSIONS = {
  admin: { pos: true, inventory: true, sales: true, users: true },
  supervisor: { pos: true, inventory: true, sales: true, users: false },
  cajero: { pos: true, inventory: true, sales: true, users: false },
  custom: { pos: true, inventory: false, sales: false, users: false },
};

const normalizeUsername = (username) => (username || '').toLowerCase().trim();
const toAuthEmail = (username) => `${username}@${AUTH_EMAIL_DOMAIN}`;
const isCredentialsAccount = (firebaseUser) => (firebaseUser.email || '')
  .toLowerCase()
  .endsWith(`@${AUTH_EMAIL_DOMAIN}`);

const AUTH_ERROR_MESSAGES = {
  'auth/invalid-credential': 'Usuario o contraseña incorrectos.',
  'auth/invalid-login-credentials': 'Usuario o contraseña incorrectos.',
  'auth/user-not-found': 'Usuario o contraseña incorrectos.',
  'auth/wrong-password': 'Usuario o contraseña incorrectos.',
  'auth/invalid-email': 'El nombre de usuario no es válido.',
  'auth/user-disabled': 'Esta cuenta ha sido desactivada por el administrador.',
  'auth/too-many-requests': 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.',
  'auth/network-request-failed': 'No hay conexión con el servidor. Revisa tu internet.',
};

export async function loginWithCredentials(usernameOrEmail, password) {
  if (!auth) {
    throw new Error('Firebase Auth no está inicializado. Revisa las variables de entorno de Firebase.');
  }

  const username = normalizeUsername(usernameOrEmail);
  if (!username) {
    throw new Error('Ingresa tu nombre de usuario.');
  }
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error('Usuario o contraseña incorrectos.');
  }
  if (!password) {
    throw new Error('Ingresa tu contraseña.');
  }

  try {
    await signInWithEmailAndPassword(auth, toAuthEmail(username), password);
  } catch (error) {
    throw new Error(AUTH_ERROR_MESSAGES[error.code] || 'No se pudo iniciar sesión. Inténtalo de nuevo.');
  }
}

export async function loginWithGoogle() {
  if (!auth) {
    throw new Error('Firebase Auth no está inicializado. Revisa las variables de entorno de Firebase.');
  }

  if (Capacitor.isNativePlatform()) {
    const result = await FirebaseAuthentication.signInWithGoogle();
    if (result.credential?.idToken) {
      const credential = GoogleAuthProvider.credential(result.credential.idToken);
      return await signInWithCredential(auth, credential);
    }
    return result;
  }

  return await signInWithPopup(auth, googleProvider);
}

export async function logoutUser() {
  if (Capacitor.isNativePlatform()) {
    try {
      await FirebaseAuthentication.signOut();
    } catch (e) {
      console.warn('Native signOut error:', e);
    }
  }
  if (auth) {
    await signOut(auth);
  }
}

export function subscribeAuthState(onUserChanged) {
  if (!auth) {
    onUserChanged(null);
    return () => {};
  }

  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      onUserChanged(null);
      return;
    }

    try {
      const profile = await syncUserProfile(firebaseUser);
      onUserChanged(profile);
    } catch (err) {
      console.error('Error sincronizando perfil de usuario:', err);
      if (firebaseUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL && !isCredentialsAccount(firebaseUser)) {
        onUserChanged({
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          email: SUPER_ADMIN_EMAIL,
          displayName: firebaseUser.displayName || 'Mario Agraz',
          photoURL: firebaseUser.photoURL,
          role: 'admin',
          status: 'active',
          permissions: DEFAULT_PERMISSIONS.admin,
        });
      } else {
        onUserChanged({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          role: 'guest',
          status: 'error',
          errorMessage: err.message,
          permissions: { pos: false, inventory: false, sales: false, users: false },
        });
      }
    }
  });
}

const touchLastLogin = async (userRef, fields) => {
  try {
    await updateDoc(userRef, fields);
  } catch (error) {
    console.warn('No se pudo registrar el último acceso:', error);
  }
};

export async function syncUserProfile(firebaseUser) {
  if (!db) {
    throw new Error('Firestore no está configurado.');
  }

  const nowIso = new Date().toISOString();
  const userRef = doc(db, 'users', firebaseUser.uid);

  if (isCredentialsAccount(firebaseUser)) {
    const snapshot = await getDoc(userRef);
    if (!snapshot.exists()) {
      throw new Error('Tu cuenta no tiene un perfil activo. Contacta al administrador.');
    }
    const data = snapshot.data();
    if (data.status === 'active') {
      await touchLastLogin(userRef, { lastLogin: nowIso });
    }
    return { id: snapshot.id, ...data, uid: firebaseUser.uid, lastLogin: nowIso, authProvider: 'credentials' };
  }

  const email = (firebaseUser.email || '').toLowerCase().trim();

  if (email === SUPER_ADMIN_EMAIL) {
    const adminProfile = {
      uid: firebaseUser.uid,
      email: SUPER_ADMIN_EMAIL,
      displayName: firebaseUser.displayName || 'Mario Agraz',
      photoURL: firebaseUser.photoURL || null,
      authType: 'google',
      role: 'admin',
      status: 'active',
      permissions: DEFAULT_PERMISSIONS.admin,
      lastLogin: nowIso,
      updatedAt: nowIso,
    };

    await setDoc(userRef, adminProfile, { merge: true });

    // Perfiles antiguos del administrador (con ID aleatorio) quedan duplicados tras la migración.
    try {
      const legacy = await getDocs(query(collection(db, 'users'), where('email', '==', SUPER_ADMIN_EMAIL)));
      await Promise.all(legacy.docs
        .filter((legacyDoc) => legacyDoc.id !== firebaseUser.uid)
        .map((legacyDoc) => deleteDoc(legacyDoc.ref)));
    } catch (error) {
      console.warn('No se pudieron limpiar perfiles antiguos del administrador:', error);
    }

    return { id: firebaseUser.uid, ...adminProfile, authProvider: 'google' };
  }

  const snapshot = await getDoc(userRef);
  if (snapshot.exists()) {
    const data = snapshot.data();
    const updates = { lastLogin: nowIso };
    if (firebaseUser.photoURL && firebaseUser.photoURL !== data.photoURL) {
      updates.photoURL = firebaseUser.photoURL;
    }
    if (data.status === 'active') {
      await touchLastLogin(userRef, updates);
    }
    return { id: snapshot.id, ...data, ...updates, uid: firebaseUser.uid, authProvider: 'google' };
  }

  // Cuenta Google aún no registrada: queda pendiente hasta que un administrador la apruebe.
  const newPendingUser = {
    uid: firebaseUser.uid,
    email,
    displayName: firebaseUser.displayName || 'Nuevo Usuario',
    photoURL: firebaseUser.photoURL || null,
    authType: 'google',
    role: 'cajero',
    status: 'pending',
    permissions: { pos: false, inventory: false, sales: false, users: false },
    createdAt: nowIso,
    lastLogin: nowIso,
  };

  await setDoc(userRef, newPendingUser);
  return { id: firebaseUser.uid, ...newPendingUser, authProvider: 'google' };
}

export function subscribeToUsers(callback, onError) {
  if (!db) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, 'users'),
    (snapshot) => {
      const usersList = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));
      callback(usersList);
    },
    (err) => {
      console.error('Error escuchando usuarios:', err);
      if (onError) onError(err);
    }
  );
}

async function createAuthAccount(authEmail, password) {
  const provisioningAuth = getProvisioningAuth();
  if (!provisioningAuth) throw new Error('Firebase Auth no está inicializado.');

  try {
    let credential;
    try {
      credential = await createUserWithEmailAndPassword(provisioningAuth, authEmail, password);
    } catch (error) {
      if (error.code !== 'auth/email-already-in-use') throw error;
      // Cuenta huérfana (perfil eliminado antes): solo se reutiliza si la contraseña coincide.
      try {
        credential = await signInWithEmailAndPassword(provisioningAuth, authEmail, password);
      } catch {
        throw new Error('Ese nombre de usuario ya se usó antes con otra contraseña. Elige otro nombre de usuario.');
      }
    }
    return { uid: credential.user.uid, authUser: credential.user, provisioningAuth };
  } catch (error) {
    await signOut(provisioningAuth).catch(() => {});
    if (error.code === 'auth/weak-password') {
      throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }
    if (error.code === 'auth/operation-not-allowed') {
      throw new Error('Habilita el acceso por correo/contraseña en Firebase Authentication.');
    }
    throw error.code ? new Error(AUTH_ERROR_MESSAGES[error.code] || error.message) : error;
  }
}

export async function addUser({
  username,
  password,
  email,
  displayName,
  role,
  permissions,
  status,
  storeId,
  authType = 'credentials',
}) {
  if (!db) throw new Error('Firestore no está inicializado.');
  if (authType !== 'credentials') {
    throw new Error('Los usuarios de Google deben iniciar sesión primero; después aparecerán como Pendientes para aprobarlos.');
  }

  const cleanUsername = normalizeUsername(username);
  const cleanEmail = (email || '').toLowerCase().trim();

  if (!USERNAME_PATTERN.test(cleanUsername)) {
    throw new Error('El usuario debe tener de 2 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo.');
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  const existingUsername = await getDocs(
    query(collection(db, 'users'), where('username', '==', cleanUsername)),
  );
  // Los perfiles previos a la migración (con hash local) se reemplazan por la cuenta nueva.
  const legacyDocs = existingUsername.docs.filter((userDoc) => userDoc.data().passwordHash);
  if (existingUsername.docs.some((userDoc) => !userDoc.data().passwordHash)) {
    throw new Error(`El usuario "${cleanUsername}" ya existe. Elige otro nombre de usuario.`);
  }

  const { uid, authUser, provisioningAuth } = await createAuthAccount(toAuthEmail(cleanUsername), password);

  const resolvedRole = role || 'cajero';
  const newUser = {
    uid,
    username: cleanUsername,
    email: cleanEmail,
    displayName: (displayName || '').trim() || cleanUsername,
    authType: 'credentials',
    role: resolvedRole,
    permissions: permissions || DEFAULT_PERMISSIONS[resolvedRole] || DEFAULT_PERMISSIONS.cajero,
    status: status || 'active',
    storeId: resolvedRole === 'cajero' ? storeId || '' : '',
    createdAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'users', uid), newUser);
  } catch (error) {
    await deleteAuthUser(authUser).catch(() => {});
    await signOut(provisioningAuth).catch(() => {});
    throw error;
  }
  await signOut(provisioningAuth).catch(() => {});

  for (const legacyDoc of legacyDocs) {
    const legacyStoreId = legacyDoc.data().storeId;
    if (legacyStoreId) {
      await runTransaction(db, async (transaction) => {
        const storeRef = doc(db, 'stores', legacyStoreId);
        const storeSnapshot = await transaction.get(storeRef);
        if (storeSnapshot.exists() && Array.isArray(storeSnapshot.data().cashierIds)) {
          transaction.update(storeRef, {
            cashierIds: storeSnapshot.data().cashierIds.filter((id) => id !== legacyDoc.id),
          });
        }
      }).catch(() => {});
    }
    await deleteDoc(legacyDoc.ref);
  }

  return { id: uid, ...newUser };
}

export async function updateUser(userId, updates) {
  if (!db) throw new Error('Firestore no está inicializado.');
  if (!userId) throw new Error('ID de usuario inválido.');

  const cleanUpdates = {};
  ['displayName', 'email', 'role', 'permissions', 'status', 'storeId'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(updates || {}, field)) {
      cleanUpdates[field] = updates[field];
    }
  });
  if (typeof cleanUpdates.email === 'string') {
    cleanUpdates.email = cleanUpdates.email.toLowerCase().trim();
  }

  // Protect super admin: cannot demote or deactivate
  if (cleanUpdates.email === SUPER_ADMIN_EMAIL) {
    cleanUpdates.role = 'admin';
    cleanUpdates.status = 'active';
    cleanUpdates.permissions = DEFAULT_PERMISSIONS.admin;
  }

  cleanUpdates.updatedAt = new Date().toISOString();
  const userRef = doc(db, 'users', userId);
  if (Object.prototype.hasOwnProperty.call(cleanUpdates, 'storeId')) {
    await runTransaction(db, async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      if (!userSnapshot.exists()) throw new Error('El usuario ya no existe.');
      const previousStoreId = userSnapshot.data().storeId || '';
      const nextStoreId = cleanUpdates.role === 'cajero' ? cleanUpdates.storeId || '' : '';
      const storeIds = [...new Set([previousStoreId, nextStoreId].filter(Boolean))];
      const storeSnapshots = await Promise.all(
        storeIds.map((storeId) => transaction.get(doc(db, 'stores', storeId))),
      );
      const storesById = new Map(storeSnapshots.map((snapshot) => [snapshot.id, snapshot]));

      if (nextStoreId) {
        const nextStoreSnapshot = storesById.get(nextStoreId);
        if (!nextStoreSnapshot?.exists()) {
          throw new Error('La tienda seleccionada ya no existe. Actualiza la lista e inténtalo de nuevo.');
        }
        if (nextStoreId !== previousStoreId && nextStoreSnapshot.data().status === 'archived') {
          throw new Error('No se puede asignar un cajero a una tienda archivada.');
        }
      }

      storeSnapshots.forEach((storeSnapshot) => {
        if (!storeSnapshot.exists()) return;
        const cashierIds = Array.isArray(storeSnapshot.data().cashierIds)
          ? storeSnapshot.data().cashierIds.filter((id) => id !== userId)
          : [];
        if (storeSnapshot.id === nextStoreId) cashierIds.push(userId);
        transaction.update(storeSnapshot.ref, {
          cashierIds: [...new Set(cashierIds)],
          updatedAt: cleanUpdates.updatedAt,
        });
      });

      transaction.update(userRef, { ...cleanUpdates, storeId: nextStoreId });
    });
    return;
  }

  await updateDoc(userRef, cleanUpdates);
}

// Elimina el perfil: sin perfil la cuenta no puede leer ni escribir datos.
export async function deleteUser(userId, email) {
  if (!db) throw new Error('Firestore no está inicializado.');
  if ((email || '').toLowerCase().trim() === SUPER_ADMIN_EMAIL) {
    throw new Error('No se puede eliminar la cuenta del Administrador Principal.');
  }
  await deleteDoc(doc(db, 'users', userId));
}
