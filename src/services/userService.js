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

export const DEFAULT_PERMISSIONS = {
  admin: { pos: true, inventory: true, sales: true, users: true },
  supervisor: { pos: true, inventory: true, sales: true, users: false },
  cajero: { pos: true, inventory: true, sales: false, users: false },
  custom: { pos: true, inventory: false, sales: false, users: false },
};

export async function loginWithGoogle() {
  if (!auth) {
    throw new Error('Firebase Auth no está configurado. Revisa tu archivo .env.local.');
  }
  return await signInWithPopup(auth, googleProvider);
}

export async function logoutUser() {
  if (!auth) return;
  await signOut(auth);
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
      // Fallback if firestore sync had an issue but it's super admin
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
  });
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
    status: 'pending', // Pending approval from Admin
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

export async function addUser({ email, displayName, role, permissions, status }) {
  if (!db) throw new Error('Firestore no está inicializado.');
  const cleanEmail = (email || '').toLowerCase().trim();
  if (!cleanEmail) throw new Error('El correo electrónico es obligatorio.');

  // Check if user with same email exists
  const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
  const existing = await getDocs(q);
  if (!existing.empty) {
    throw new Error(`Ya existe un usuario registrado con el correo ${cleanEmail}.`);
  }

  const resolvedRole = role || 'cajero';
  const resolvedPermissions = permissions || DEFAULT_PERMISSIONS[resolvedRole] || DEFAULT_PERMISSIONS.cajero;

  const newUser = {
    email: cleanEmail,
    displayName: (displayName || '').trim() || cleanEmail.split('@')[0],
    role: cleanEmail === SUPER_ADMIN_EMAIL ? 'admin' : resolvedRole,
    permissions: cleanEmail === SUPER_ADMIN_EMAIL ? DEFAULT_PERMISSIONS.admin : resolvedPermissions,
    status: status || 'active',
    createdAt: new Date().toISOString(),
  };

  // We use doc with an email-safe id or auto doc
  const userDocRef = doc(collection(db, 'users'));
  await setDoc(userDocRef, newUser);
  return { id: userDocRef.id, ...newUser };
}

export async function updateUser(userId, updates) {
  if (!db) throw new Error('Firestore no está inicializado.');
  if (!userId) throw new Error('ID de usuario inválido.');

  const cleanUpdates = { ...updates };
  if (cleanUpdates.email) {
    cleanUpdates.email = cleanUpdates.email.toLowerCase().trim();
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

