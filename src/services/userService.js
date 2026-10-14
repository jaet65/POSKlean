import { 
  collection, 
  deleteDoc, 
  doc, 
  getDocs, 
  onSnapshot, 
  query, 
  setDoc, 
  updateDoc, 
  where 
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut 
} from 'firebase/auth';
import { auth, db, googleProvider } from '../firebase';

export const SUPER_ADMIN_EMAIL = 'agrazmario@gmail.com';

const LOCAL_USER_SESSION_KEY = 'posklean_local_user';

export const DEFAULT_PERMISSIONS = {
  admin: { pos: true, inventory: true, sales: true, users: true },
  supervisor: { pos: true, inventory: true, sales: true, users: false },
  cajero: { pos: true, inventory: true, sales: true, users: false },
  custom: { pos: true, inventory: false, sales: false, users: false },
};

// Generar hash SHA-256 seguro usando Web Crypto API estándar del navegador
export async function hashPassword(password, salt = 'posklean_salt_v1') {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function loginWithCredentials(usernameOrEmail, password) {
  if (!db) {
    throw new Error('Firestore no está configurado.');
  }

  const cleanIdentifier = (usernameOrEmail || '').toLowerCase().trim();
  if (!cleanIdentifier) {
    throw new Error('Ingresa tu nombre de usuario.');
  }
  if (!password) {
    throw new Error('Ingresa tu contraseña.');
  }

  const usersRef = collection(db, 'users');
  
  // Buscar coincidencia por username o por email
  let q = query(usersRef, where('username', '==', cleanIdentifier));
  let snapshot = await getDocs(q);

  if (snapshot.empty) {
    q = query(usersRef, where('email', '==', cleanIdentifier));
    snapshot = await getDocs(q);
  }

  if (snapshot.empty) {
    throw new Error('Usuario no encontrado.');
  }

  const userDoc = snapshot.docs[0];
  const userData = userDoc.data();

  if (userData.status === 'inactive') {
    throw new Error('Esta cuenta ha sido desactivada por el administrador.');
  }

  if (!userData.passwordHash) {
    throw new Error('Esta cuenta requiere inicio de sesión con Google.');
  }

  const expectedHash = await hashPassword(password, userData.salt || 'posklean_salt_v1');
  if (userData.passwordHash !== expectedHash) {
    throw new Error('Contraseña incorrecta.');
  }

  const nowIso = new Date().toISOString();
  await updateDoc(doc(db, 'users', userDoc.id), {
    lastLogin: nowIso,
  });

  const profile = {
    id: userDoc.id,
    uid: userDoc.id,
    ...userData,
    lastLogin: nowIso,
    authProvider: 'credentials',
  };

  localStorage.setItem(LOCAL_USER_SESSION_KEY, JSON.stringify(profile));
  window.dispatchEvent(new CustomEvent('posklean-auth-change', { detail: profile }));

  return profile;
}

export async function loginWithGoogle() {
  if (!auth) {
    throw new Error('Firebase Auth no está inicializado. Revisa las variables de entorno de Firebase.');
  }
  // Limpiar sesión local previa
  localStorage.removeItem(LOCAL_USER_SESSION_KEY);
  return await signInWithPopup(auth, googleProvider);
}

export async function logoutUser() {
  localStorage.removeItem(LOCAL_USER_SESSION_KEY);
  window.dispatchEvent(new CustomEvent('posklean-auth-change', { detail: null }));
  if (auth) {
    await signOut(auth);
  }
}

export function getStoredLocalUser() {
  try {
    const raw = localStorage.getItem(LOCAL_USER_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function subscribeAuthState(onUserChanged) {
  let isGoogleLoggedIn = false;

  const handleCustomAuth = () => {
    if (isGoogleLoggedIn) return;
    const localUser = getStoredLocalUser();
    onUserChanged(localUser);
  };

  window.addEventListener('posklean-auth-change', handleCustomAuth);

  if (!auth) {
    const localUser = getStoredLocalUser();
    onUserChanged(localUser);
    return () => {
      window.removeEventListener('posklean-auth-change', handleCustomAuth);
    };
  }

  const unsubscribeFirebase = onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      isGoogleLoggedIn = true;
      try {
        const profile = await syncUserProfile(firebaseUser);
        onUserChanged(profile);
      } catch (err) {
        console.error('Error sincronizando perfil de usuario:', err);
        if (firebaseUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL) {
          onUserChanged({
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
    } else {
      isGoogleLoggedIn = false;
      const localUser = getStoredLocalUser();
      onUserChanged(localUser);
    }
  });

  return () => {
    unsubscribeFirebase();
    window.removeEventListener('posklean-auth-change', handleCustomAuth);
  };
}

export async function syncUserProfile(firebaseUser) {
  if (!db) {
    throw new Error('Firestore no está configurado.');
  }

  const email = (firebaseUser.email || '').toLowerCase().trim();
  const isSuperAdmin = email === SUPER_ADMIN_EMAIL;

  // Search in 'users' collection by email
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('email', '==', email));
  const snapshot = await getDocs(q);

  const nowIso = new Date().toISOString();

  if (isSuperAdmin) {
    let docId = firebaseUser.uid;
    let existingData = {};

    if (!snapshot.empty) {
      const firstDoc = snapshot.docs[0];
      docId = firstDoc.id;
      existingData = firstDoc.data();
    }

    const adminProfile = {
      uid: firebaseUser.uid,
      email: SUPER_ADMIN_EMAIL,
      displayName: firebaseUser.displayName || existingData.displayName || 'Mario Agraz',
      photoURL: firebaseUser.photoURL || existingData.photoURL || null,
      role: 'admin',
      status: 'active',
      permissions: DEFAULT_PERMISSIONS.admin,
      lastLogin: nowIso,
      updatedAt: nowIso,
    };

    await setDoc(doc(db, 'users', docId), adminProfile, { merge: true });
    return { id: docId, ...adminProfile };
  }

  if (!snapshot.empty) {
    const userDoc = snapshot.docs[0];
    const data = userDoc.data();

    const updatedProfile = {
      uid: firebaseUser.uid,
      displayName: data.displayName || firebaseUser.displayName || 'Usuario POS',
      photoURL: firebaseUser.photoURL || data.photoURL || null,
      lastLogin: nowIso,
    };

    await updateDoc(doc(db, 'users', userDoc.id), updatedProfile);
    return {
      id: userDoc.id,
      ...data,
      ...updatedProfile,
    };
  }

  // User is not yet registered by the Admin -> register as pending
  const newPendingUser = {
    uid: firebaseUser.uid,
    email: email,
    displayName: firebaseUser.displayName || 'Nuevo Usuario',
    photoURL: firebaseUser.photoURL || null,
    role: 'cajero',
    status: 'pending',
    permissions: { pos: false, inventory: false, sales: false, users: false },
    createdAt: nowIso,
    lastLogin: nowIso,
  };

  await setDoc(doc(db, 'users', firebaseUser.uid), newPendingUser);
  return { id: firebaseUser.uid, ...newPendingUser };
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

export async function addUser({ username, password, email, displayName, role, permissions, status, authType = 'credentials' }) {
  if (!db) throw new Error('Firestore no está inicializado.');
  
  const cleanUsername = (username || '').toLowerCase().trim();
  const cleanEmail = (email || '').toLowerCase().trim();

  if (authType === 'credentials') {
    if (!cleanUsername) throw new Error('El nombre de usuario es obligatorio.');
    if (!password || password.trim().length < 4) {
      throw new Error('La contraseña debe tener al menos 4 caracteres.');
    }

    // Comprobar que no exista el username
    const qUsername = query(collection(db, 'users'), where('username', '==', cleanUsername));
    const existUsername = await getDocs(qUsername);
    if (!existUsername.empty) {
      throw new Error(`El usuario "${cleanUsername}" ya existe. Elige otro nombre de usuario.`);
    }

    const salt = Math.random().toString(36).substring(2, 10);
    const passwordHash = await hashPassword(password.trim(), salt);

    const resolvedRole = role || 'cajero';
    const resolvedPermissions = permissions || DEFAULT_PERMISSIONS[resolvedRole] || DEFAULT_PERMISSIONS.cajero;

    const newUser = {
      username: cleanUsername,
      email: cleanEmail || '',
      displayName: (displayName || '').trim() || cleanUsername,
      authType: 'credentials',
      passwordHash,
      salt,
      role: resolvedRole,
      permissions: resolvedPermissions,
      status: status || 'active',
      createdAt: new Date().toISOString(),
    };

    const userDocRef = doc(collection(db, 'users'));
    await setDoc(userDocRef, newUser);
    return { id: userDocRef.id, ...newUser };
  } else {
    // Modo Google
    if (!cleanEmail) throw new Error('El correo electrónico es obligatorio para cuentas de Google.');

    const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
    const existing = await getDocs(q);
    if (!existing.empty) {
      throw new Error(`Ya existe un usuario registrado con el correo ${cleanEmail}.`);
    }

    const resolvedRole = role || 'cajero';
    const resolvedPermissions = permissions || DEFAULT_PERMISSIONS[resolvedRole] || DEFAULT_PERMISSIONS.cajero;

    const newUser = {
      email: cleanEmail,
      username: cleanUsername || '',
      displayName: (displayName || '').trim() || cleanEmail.split('@')[0],
      authType: 'google',
      role: cleanEmail === SUPER_ADMIN_EMAIL ? 'admin' : resolvedRole,
      permissions: cleanEmail === SUPER_ADMIN_EMAIL ? DEFAULT_PERMISSIONS.admin : resolvedPermissions,
      status: status || 'active',
      createdAt: new Date().toISOString(),
    };

    const userDocRef = doc(collection(db, 'users'));
    await setDoc(userDocRef, newUser);
    return { id: userDocRef.id, ...newUser };
  }
}

export async function updateUser(userId, updates) {
  if (!db) throw new Error('Firestore no está inicializado.');
  if (!userId) throw new Error('ID de usuario inválido.');

  const cleanUpdates = { ...updates };
  if (cleanUpdates.email) {
    cleanUpdates.email = cleanUpdates.email.toLowerCase().trim();
  }
  if (cleanUpdates.username) {
    cleanUpdates.username = cleanUpdates.username.toLowerCase().trim();

    // Check if new username belongs to another user
    const qUsername = query(collection(db, 'users'), where('username', '==', cleanUpdates.username));
    const existUsername = await getDocs(qUsername);
    if (!existUsername.empty && existUsername.docs[0].id !== userId) {
      throw new Error(`El nombre de usuario "${cleanUpdates.username}" ya está en uso.`);
    }
  }

  // Si se envió una nueva contraseña para actualizar
  if (cleanUpdates.newPassword && cleanUpdates.newPassword.trim()) {
    if (cleanUpdates.newPassword.trim().length < 4) {
      throw new Error('La nueva contraseña debe tener al menos 4 caracteres.');
    }
    const salt = Math.random().toString(36).substring(2, 10);
    cleanUpdates.passwordHash = await hashPassword(cleanUpdates.newPassword.trim(), salt);
    cleanUpdates.salt = salt;
    delete cleanUpdates.newPassword;
  } else {
    delete cleanUpdates.newPassword;
  }

  // Protect super admin: cannot demote or deactivate
  if (cleanUpdates.email === SUPER_ADMIN_EMAIL) {
    cleanUpdates.role = 'admin';
    cleanUpdates.status = 'active';
    cleanUpdates.permissions = DEFAULT_PERMISSIONS.admin;
  }

  cleanUpdates.updatedAt = new Date().toISOString();
  await updateDoc(doc(db, 'users', userId), cleanUpdates);
}

export async function deleteUser(userId, email) {
  if (!db) throw new Error('Firestore no está inicializado.');
  if ((email || '').toLowerCase().trim() === SUPER_ADMIN_EMAIL) {
    throw new Error('No se puede eliminar la cuenta del Administrador Principal.');
  }
  await deleteDoc(doc(db, 'users', userId));
}

