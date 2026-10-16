import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';

// Canales usados mientras no se haya configurado ninguno en Firestore.
export const DEFAULT_CHANNELS = ['Mostrador', 'Uber Flash', 'WhatsApp'];

const normalizeName = (name) => String(name || '').trim().toLocaleLowerCase('es-MX');

function cleanName(name, channels, ignoreId = null) {
  const clean = String(name || '').trim();
  if (!clean || clean.length > 60) throw new Error('Escribe el nombre del canal (máximo 60 caracteres).');
  if (channels.some((channel) => channel.id !== ignoreId && normalizeName(channel.name) === normalizeName(clean))) {
    throw new Error(`Ya existe el canal "${clean}".`);
  }
  return clean;
}

export function subscribeToSalesChannels(onData, onError) {
  if (!db) {
    onData([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, 'salesChannels'),
    (snapshot) => onData(snapshot.docs
      .map((item) => ({ ...item.data(), id: item.id }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))),
    onError,
  );
}

export async function addSalesChannel(name, channels, user) {
  if (!db) throw new Error('Firestore no está inicializado.');
  await addDoc(collection(db, 'salesChannels'), {
    name: cleanName(name, channels),
    createdBy: user?.id || user?.uid || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateSalesChannel(channelId, name, channels) {
  if (!db) throw new Error('Firestore no está inicializado.');
  await updateDoc(doc(db, 'salesChannels', channelId), {
    name: cleanName(name, channels, channelId),
    updatedAt: serverTimestamp(),
  });
}

// Las ventas guardan el nombre del canal, así que eliminarlo no afecta el historial.
export async function deleteSalesChannel(channelId) {
  if (!db) throw new Error('Firestore no está inicializado.');
  await deleteDoc(doc(db, 'salesChannels', channelId));
}

export async function seedDefaultChannels(user) {
  if (!db) throw new Error('Firestore no está inicializado.');
  const batch = writeBatch(db);
  DEFAULT_CHANNELS.forEach((name) => {
    batch.set(doc(collection(db, 'salesChannels')), {
      name,
      createdBy: user?.id || user?.uid || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}
