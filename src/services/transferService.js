import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { stockItemId } from './catalogService';
import { weightedAverageCost } from './purchaseService';

const userInfo = (user) => ({
  userId: user?.id || user?.uid || null,
  userName: user?.displayName || user?.username || user?.email || 'Desconocido',
  userEmail: user?.email || '',
  userRole: user?.role || 'cajero',
});

const round2 = (value) => Math.round(value * 100) / 100;

// Mueve existencias entre tiendas en una sola transacción: descuenta en el origen,
// suma en el destino (lo habilita si hace falta) y registra ambos movimientos.
export async function transferInventory({ sourceStockId, destStoreId, amount, user, transferId: providedTransferId }) {
  if (!db) throw new Error('Firestore no está inicializado.');
  if (user?.role !== 'admin' && user?.role !== 'supervisor') {
    throw new Error('Solo administradores y supervisores pueden transferir inventario.');
  }
  const qty = Number(amount);
  if (!Number.isFinite(qty) || qty <= 0 || qty >= 1000000 || round2(qty) !== qty) {
    throw new Error('Indica una cantidad válida mayor a 0 (máximo dos decimales).');
  }
  if (!sourceStockId || !destStoreId) throw new Error('Selecciona producto y tienda destino.');

  const sourceRef = doc(db, 'stockItems', sourceStockId);
  const author = userInfo(user);
  const transferId = providedTransferId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : doc(collection(db, 'inventoryMovements')).id);
  const outMovementRef = doc(db, 'inventoryMovements', `transfer-${transferId}-out`);
  const inMovementRef = doc(db, 'inventoryMovements', `transfer-${transferId}-in`);

  return runTransaction(db, async (transaction) => {
    const [sourceSnapshot, existingOutMovement] = await Promise.all([
      transaction.get(sourceRef),
      transaction.get(outMovementRef),
    ]);
    if (existingOutMovement.exists()) {
      return { transferId, alreadyProcessed: true };
    }
    if (!sourceSnapshot.exists()) throw new Error('El producto de origen ya no existe.');
    const source = sourceSnapshot.data();
    if (source.storeId === destStoreId) throw new Error('El origen y el destino deben ser distintos.');

    const catalogSnapshot = await transaction.get(doc(db, 'catalogProducts', source.catalogId));
    if (!catalogSnapshot.exists() || catalogSnapshot.data().status === 'archived') {
      throw new Error('El producto está archivado en el catálogo.');
    }
    const catalogData = catalogSnapshot.data();
    const destRef = doc(db, 'stockItems', stockItemId(destStoreId, source.catalogId));
    const destSnapshot = await transaction.get(destRef);

    if (source.currentStock < qty) {
      throw new Error(`Stock insuficiente en el origen: hay ${source.currentStock} ${catalogData.unit || ''}.`);
    }
    const sourceNewStock = round2(source.currentStock - qty);
    const movementBase = {
      productName: catalogData.name || '',
      unit: catalogData.unit || 'L',
      transferId,
      createdBy: author,
      timestamp: serverTimestamp(),
    };

    transaction.update(sourceRef, { currentStock: sourceNewStock });
    transaction.set(outMovementRef, {
      ...movementBase,
      type: 'transfer_out',
      productId: sourceRef.id,
      amount: -qty,
      previousStock: source.currentStock,
      newStock: sourceNewStock,
      referenceId: destRef.id,
      storeId: source.storeId,
      counterpartStoreId: destStoreId,
    });

    let destPreviousStock = 0;
    if (destSnapshot.exists()) {
      const dest = destSnapshot.data();
      destPreviousStock = dest.currentStock;
      transaction.update(destRef, {
        currentStock: round2(dest.currentStock + qty),
        cost: weightedAverageCost(dest.currentStock, dest.cost, qty, source.cost),
      });
    } else {
      transaction.set(destRef, {
        catalogId: source.catalogId,
        storeId: destStoreId,
        currentStock: qty,
        minStock: Number(catalogData.minStock) || 0,
        cost: source.cost,
        createdBy: author,
        createdAt: serverTimestamp(),
      });
    }
    transaction.set(inMovementRef, {
      ...movementBase,
      type: 'transfer_in',
      productId: destRef.id,
      amount: qty,
      previousStock: destPreviousStock,
      newStock: round2(destPreviousStock + qty),
      referenceId: sourceRef.id,
      storeId: destStoreId,
      counterpartStoreId: source.storeId,
    });

    return { transferId, success: true };
  });
}
