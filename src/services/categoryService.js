import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

const userInfo = (user) => ({
  userId: user?.id || user?.uid || null,
  userName: user?.displayName || user?.username || user?.email || 'Desconocido',
  userRole: user?.role || 'cajero',
});

// El id del documento deriva del nombre para evitar duplicados (sin mayúsculas ni acentos).
const categoryId = (name) => `c_${encodeURIComponent(
  String(name).trim().toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
)}`;

export function subscribeToCategories(onData, onError) {
  if (!db) {
    onData([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, 'categories'),
    (snapshot) => onData(snapshot.docs
      .map((item) => ({ ...item.data(), id: item.id }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))),
    onError,
  );
}

// Registra la categoría si aún no existe; devuelve false si ya estaba registrada.
export async function ensureCategory(name, user) {
  if (!db) throw new Error('Firestore no está inicializado.');
  const clean = String(name || '').trim();
  if (!clean || clean.length > 60) throw new Error('Indica la categoría (máximo 60 caracteres).');
  const ref = doc(db, 'categories', categoryId(clean));
  if ((await getDoc(ref)).exists()) return false;
  await setDoc(ref, { name: clean, createdBy: userInfo(user), createdAt: serverTimestamp() });
  return true;
}

export async function deleteCategory(name, catalog = []) {
  if (!db) throw new Error('Firestore no está inicializado.');
  const key = categoryId(name);
  if (catalog.some((item) => item.category && categoryId(item.category) === key)) {
    throw new Error('No se puede eliminar: hay productos en esta categoría.');
  }
  await deleteDoc(doc(db, 'categories', key));
}
