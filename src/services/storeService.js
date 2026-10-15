import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';

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

const normalizeStoreDetails = ({ name, address, phone, cashierIds }) => {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName) throw new Error('El nombre de la tienda es obligatorio.');
  if (!Array.isArray(cashierIds) || cashierIds.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new Error('La asignación de cajeros no es válida.');
  }

  return {
    name: cleanName,
    address: typeof address === 'string' ? address.trim() : '',
    phone: typeof phone === 'string' ? phone.trim() : '',
    cashierIds: [...new Set(cashierIds)],
  };
};

const saveStoreDetails = async ({ storeId = null, previousCashierIds = [], ...details }) => {
  if (!db) throw new Error('Firestore no está inicializado.');
  const store = normalizeStoreDetails(details);
  const storeRef = storeId ? doc(db, 'stores', storeId) : doc(collection(db, 'stores'));
  const selectedCashierIds = new Set(store.cashierIds);

  if (!Array.isArray(previousCashierIds)
    || previousCashierIds.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new Error('La asignación anterior de cajeros no es válida.');
  }

  const previousIds = new Set(previousCashierIds);
  await runTransaction(db, async (transaction) => {
    let existingStore = null;
    if (storeId) {
      const storeSnapshot = await transaction.get(storeRef);
      if (!storeSnapshot.exists()) throw new Error('La tienda ya no existe.');
      existingStore = storeSnapshot.data();
      if (existingStore.status === 'archived' && selectedCashierIds.size > 0) {
        throw new Error('No se pueden asignar cajeros a una tienda archivada. Reactívala primero.');
      }
    }

    const assignedIds = new Set([
      ...previousIds,
      ...(Array.isArray(existingStore?.cashierIds) ? existingStore.cashierIds : []),
      ...selectedCashierIds,
    ]);
    const cashierSnapshots = await Promise.all(
      [...assignedIds].map((id) => transaction.get(doc(db, 'users', id))),
    );
    const now = new Date().toISOString();

    cashierSnapshots.forEach((cashierSnapshot) => {
      const cashierId = cashierSnapshot.id;
      const cashier = cashierSnapshot.data();
      if (!cashierSnapshot.exists()) {
        if (selectedCashierIds.has(cashierId)) {
          throw new Error('Uno de los cajeros seleccionados ya no existe. Actualiza la lista e inténtalo de nuevo.');
        }
        return;
      }
      if (selectedCashierIds.has(cashierId) && cashier.role !== 'cajero') {
        throw new Error('Solo se pueden asignar usuarios con el rol de cajero a una tienda.');
      }
    });

    const previousStoreIds = new Set(cashierSnapshots
      .filter((snapshot) => snapshot.exists()
        && selectedCashierIds.has(snapshot.id)
        && snapshot.data().storeId
        && snapshot.data().storeId !== storeRef.id)
      .map((snapshot) => snapshot.data().storeId));
    const previousStoreSnapshots = await Promise.all(
      [...previousStoreIds].map((id) => transaction.get(doc(db, 'stores', id))),
    );

    cashierSnapshots.forEach((cashierSnapshot) => {
      const cashierId = cashierSnapshot.id;
      const cashier = cashierSnapshot.data();
      if (selectedCashierIds.has(cashierId)) {
        transaction.update(cashierSnapshot.ref, { storeId: storeRef.id, updatedAt: now });
      } else if (cashier.role === 'cajero' && cashier.storeId === storeRef.id) {
        transaction.update(cashierSnapshot.ref, { storeId: '', updatedAt: now });
      }
    });

    previousStoreSnapshots.forEach((previousStoreSnapshot) => {
      if (!previousStoreSnapshot.exists()) return;
      const previousStoreCashierIds = previousStoreSnapshot.data().cashierIds;
      if (!Array.isArray(previousStoreCashierIds)) return;
      transaction.update(previousStoreSnapshot.ref, {
        cashierIds: previousStoreCashierIds.filter((id) => !selectedCashierIds.has(id)),
        updatedAt: now,
      });
    });

    const storeData = {
      ...store,
      ...(storeId
        ? { updatedAt: now }
        : { status: 'active', createdAt: now }),
    };
    if (storeId) {
      transaction.update(storeRef, storeData);
    } else {
      transaction.set(storeRef, storeData);
    }
  });

  return { id: storeRef.id, ...store };
};

export async function addStore(details) {
  return saveStoreDetails(details);
}

export async function updateStore(storeId, details) {
  if (typeof storeId !== 'string' || !storeId.trim()) {
    throw new Error('Selecciona una tienda válida.');
  }
  return saveStoreDetails({ ...details, storeId });
}

export async function updateStoreStatus(storeId, status) {
  if (!db) throw new Error('Firestore no está inicializado.');
  if (typeof storeId !== 'string' || !storeId.trim()) {
    throw new Error('Selecciona una tienda válida.');
  }
  if (status !== 'active' && status !== 'archived') {
    throw new Error('El estado de la tienda no es válido.');
  }

  const storeRef = doc(db, 'stores', storeId);
  const assignedCashiers = await getDocs(query(
    collection(db, 'users'),
    where('storeId', '==', storeId),
  ));

  await runTransaction(db, async (transaction) => {
    const storeSnapshot = await transaction.get(storeRef);
    if (!storeSnapshot.exists()) throw new Error('La tienda ya no existe.');
    const storeData = storeSnapshot.data();
    const storedCashierIds = storeData.cashierIds ?? [];
    if (!Array.isArray(storedCashierIds)
      || storedCashierIds.some((id) => typeof id !== 'string' || !id.trim() || id.includes('/'))) {
      throw new Error('La lista de cajeros asignados a esta tienda no es válida. Corrige las asignaciones e inténtalo de nuevo.');
    }
    const needsAssignmentCleanup = status === 'archived'
      || (storeData.status === 'archived' && status === 'active');
    if (storeData.status === status
      && (!needsAssignmentCleanup || (storedCashierIds.length === 0 && assignedCashiers.empty))) return;

    const cashierIds = new Set([
      ...storedCashierIds,
      ...assignedCashiers.docs.map((cashierSnapshot) => cashierSnapshot.id),
    ]);
    if (cashierIds.size > 499) {
      throw new Error('No se puede cambiar el estado de la tienda porque tiene demasiados cajeros asignados. Corrige las asignaciones e inténtalo de nuevo.');
    }

    const cashierSnapshots = await Promise.all(
      [...cashierIds].map((cashierId) => transaction.get(doc(db, 'users', cashierId))),
    );
    const now = new Date().toISOString();

    if (needsAssignmentCleanup) {
      cashierSnapshots.forEach((cashierSnapshot) => {
        if (!cashierSnapshot.exists()) return;
        const cashier = cashierSnapshot.data();
        if (cashier.role === 'cajero' && cashier.storeId === storeId) {
          transaction.update(cashierSnapshot.ref, { storeId: '', updatedAt: now });
        }
      });
    }

    transaction.update(storeRef, {
      status,
      ...(needsAssignmentCleanup ? { cashierIds: [] } : {}),
      updatedAt: now,
    });
  });
}
