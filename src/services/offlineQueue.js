const DB_NAME = 'posklean-offline';
const STORE = 'pendingSales';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'localId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, run) {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode);
    const result = run(tx.objectStore(STORE));
    tx.oncomplete = () => {
      database.close();
      resolve(result?.result);
    };
    tx.onerror = () => {
      database.close();
      reject(tx.error);
    };
  });
}

export function enqueuePendingSale(payload, type = 'sale') {
  const entry = {
    localId: `${Date.now()}-${crypto.randomUUID()}`,
    queuedAt: Date.now(),
    type,
    payload,
    error: null,
  };
  return withStore('readwrite', (store) => store.put(entry)).then(() => entry);
}

export async function listPendingSales() {
  const entries = await withStore('readonly', (store) => store.getAll());
  return (entries || []).sort((a, b) => a.queuedAt - b.queuedAt);
}

export const removePendingSale = (localId) => withStore('readwrite', (store) => store.delete(localId));

export const updatePendingSale = (entry) => withStore('readwrite', (store) => store.put(entry));
