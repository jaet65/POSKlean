import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';

export const DEFAULT_STORE_ID = 'default';
export const DEFAULT_STORE_NAME = 'Tienda Principal';

const STORE_COLLECTIONS = ['products', 'sales', 'inventoryMovements'];

export function subscribeToStores(callback, onError) {
  if (!db) {
    callback([]);
    return () => {};
  }

  return onSnapshot(
    collection(db, 'stores'),
    (snapshot) => callback(snapshot.docs.map((storeDoc) => ({
      id: storeDoc.id,
      ...storeDoc.data(),
    })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))),
    (error) => {
      console.error('Error escuchando tiendas:', error);
      onError?.(error);
    },
  );
}

export async function ensureDefaultStore() {
  if (!db) throw new Error('Firestore no está inicializado.');

  await setDoc(doc(db, 'stores', DEFAULT_STORE_ID), {
    name: DEFAULT_STORE_NAME,
    status: 'active',
    createdAt: new Date().toISOString(),
  }, { merge: true });

  for (const collectionName of STORE_COLLECTIONS) {
    const snapshot = await getDocs(collection(db, collectionName));
    const legacyDocs = snapshot.docs.filter((documentSnapshot) => !documentSnapshot.data().storeId);
    for (let index = 0; index < legacyDocs.length; index += 400) {
      const batch = writeBatch(db);
      legacyDocs.slice(index, index + 400).forEach((documentSnapshot) => {
        batch.update(documentSnapshot.ref, { storeId: DEFAULT_STORE_ID });
      });
      await batch.commit();
    }
  }
}

export async function addStore(name) {
  if (!db) throw new Error('Firestore no está inicializado.');
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName) throw new Error('El nombre de la tienda es obligatorio.');

  const storeRef = doc(collection(db, 'stores'));
  const store = {
    name: cleanName,
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  await setDoc(storeRef, store);
  return { id: storeRef.id, ...store };
}
