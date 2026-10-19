const DB_NAME = 'posklean-offline';
const STORE = 'pendingSales';

export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no está disponible en este entorno.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'localId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, run) {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = run(store);
    tx.oncomplete = () => {
      database.close();
      resolve(result?.result !== undefined ? result.result : result);
    };
    tx.onerror = () => {
      database.close();
      reject(tx.error);
    };
  });
}

export function enqueuePendingOperation(payload, type = 'sale', customLocalId = null) {
  const localId = customLocalId || `${type}-${Date.now()}-${generateUUID()}`;
  const entry = {
    localId,
    id: localId,
    type,
    payload,
    queuedAt: Date.now(),
    updatedAt: Date.now(),
    retries: 0,
    status: 'pending',
    error: null,
  };
  return withStore('readwrite', (store) => store.put(entry)).then(() => entry);
}

export const enqueuePendingSale = enqueuePendingOperation;

export async function listPendingOperations() {
  const entries = await withStore('readonly', (store) => store.getAll());
  return (entries || []).sort((a, b) => a.queuedAt - b.queuedAt);
}

export const listPendingSales = listPendingOperations;

export const removePendingOperation = (localId) => withStore('readwrite', (store) => store.delete(localId));
export const removePendingSale = removePendingOperation;

export const updatePendingOperation = (entry) => withStore('readwrite', (store) => store.put({
  ...entry,
  updatedAt: Date.now(),
}));
export const updatePendingSale = updatePendingOperation;

export const clearPendingQueue = () => withStore('readwrite', (store) => store.clear());

export async function countPendingOperations() {
  const entries = await listPendingOperations();
  return entries.filter((entry) => !entry.error).length;
}
export const countPendingSales = countPendingOperations;
