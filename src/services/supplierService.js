import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

const userInfo = (user) => ({
  userId: user?.id || user?.uid || null,
  userName: user?.displayName || user?.username || user?.email || 'Desconocido',
  userRole: user?.role || 'cajero',
});

const cleanSupplierFields = (data) => {
  const name = String(data?.name || '').trim();
  const email = String(data?.email || '').trim();
  if (!name) throw new Error('Escribe el nombre del proveedor.');
  if (name.length > 120) throw new Error('El nombre del proveedor es demasiado largo.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('El correo del proveedor no es válido.');
  }
  return {
    name,
    contactName: String(data?.contactName || '').trim().slice(0, 120),
    phone: String(data?.phone || '').trim().slice(0, 40),
    email: email.slice(0, 200),
    notes: String(data?.notes || '').trim().slice(0, 500),
  };
};

export function subscribeToSuppliers(onData, onError) {
  if (!db) {
    onError?.(new Error('Firestore no está inicializado.'));
    return () => {};
  }
  return onSnapshot(
    collection(db, 'suppliers'),
    (snapshot) => {
      const suppliers = snapshot.docs
        .map((supplierDoc) => ({ ...supplierDoc.data(), id: supplierDoc.id }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
      onData(suppliers);
    },
    onError,
  );
}

export async function addSupplier(data, user) {
  if (!db) throw new Error('Firestore no está inicializado.');
  const ref = await addDoc(collection(db, 'suppliers'), {
    ...cleanSupplierFields(data),
    status: 'active',
    createdBy: userInfo(user),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSupplier(supplierId, data) {
  if (!db) throw new Error('Firestore no está inicializado.');
  if (!supplierId) throw new Error('Proveedor no válido.');
  await updateDoc(doc(db, 'suppliers', supplierId), {
    ...cleanSupplierFields(data),
    updatedAt: serverTimestamp(),
  });
}

export async function setSupplierStatus(supplierId, status) {
  if (!db) throw new Error('Firestore no está inicializado.');
  if (!supplierId || !['active', 'archived'].includes(status)) {
    throw new Error('Proveedor o estado no válido.');
  }
  await updateDoc(doc(db, 'suppliers', supplierId), {
    status,
    updatedAt: serverTimestamp(),
  });
}
