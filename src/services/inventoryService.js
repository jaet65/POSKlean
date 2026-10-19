import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  createCatalogProduct,
  enableCatalogProductInStore,
  findCatalogByName,
  stockItemId,
} from './catalogService';

export async function deleteProduct(productId, user = null, storeId = null) {
  if (!db) {
    throw new Error('No se puede eliminar el producto: configura primero Firebase.');
  }
  if (user?.role !== 'admin') {
    throw new Error('Solo un administrador puede eliminar productos.');
  }
  if (!productId || typeof storeId !== 'string' || !storeId.trim()) {
    throw new Error('El producto y la tienda son obligatorios.');
  }

  const productRef = doc(db, 'stockItems', productId);
  const productSnapshot = await getDoc(productRef);
  if (!productSnapshot.exists()) {
    throw new Error('El producto ya no existe. Actualiza el inventario e inténtalo de nuevo.');
  }

  const product = productSnapshot.data();
  if (product.storeId !== storeId) {
    throw new Error('El producto no pertenece a la tienda seleccionada.');
  }
  if (Number(product.currentStock) !== 0) {
    throw new Error('Solo se pueden quitar de la tienda productos con stock en 0.');
  }

  await deleteDoc(productRef);
}

export async function addProduct(productData, user = null, storeId = null) {
  if (!db) {
    throw new Error('No se puede crear el producto: configura primero Firebase.');
  }

  const {
    name,
    category,
    currentStock,
    minStock,
    unit = 'L',
    price,
    cost,
  } = productData || {};

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedCategory = typeof category === 'string' ? category.trim() : '';
  const trimmedUnit = typeof unit === 'string' && unit.trim() ? unit.trim() : 'L';
  const numCurrentStock = typeof currentStock === 'number' ? currentStock : parseFloat(currentStock);
  const numMinStock = typeof minStock === 'number' ? minStock : parseFloat(minStock);
  const numPrice = typeof price === 'number' ? price : parseFloat(price);
  const numCost = typeof cost === 'number' ? cost : parseFloat(cost);

  if (!trimmedName) {
    throw new Error('El nombre del producto es obligatorio.');
  }
  if (typeof storeId !== 'string' || !storeId.trim()) {
    throw new Error('Selecciona una tienda válida para el producto.');
  }
  if (!trimmedCategory) {
    throw new Error('La categoría del producto es obligatoria.');
  }
  if (!Number.isFinite(numCurrentStock) || numCurrentStock < 0) {
    throw new Error('El stock inicial debe ser un número mayor o igual a 0.');
  }
  if (!Number.isFinite(numMinStock) || numMinStock < 0) {
    throw new Error('El stock mínimo de alerta debe ser un número mayor o igual a 0.');
  }
  if (!Number.isFinite(numPrice) || numPrice <= 0) {
    throw new Error('El precio de venta debe ser un número mayor a 0.');
  }
  if (!Number.isFinite(numCost) || numCost < 0) {
    throw new Error('El costo por unidad debe ser un número mayor o igual a 0.');
  }

  const userInfo = {
    userId: user?.id || user?.uid || null,
    userName: user?.displayName || user?.username || user?.email || 'Desconocido',
    userEmail: user?.email || '',
    userRole: user?.role || 'cajero',
  };

  // Si el catálogo ya tiene el producto solo se habilita en la tienda; si no, se crea primero.
  let catalogProduct = await findCatalogByName(trimmedName);
  if (catalogProduct) {
    const existingStock = await getDoc(doc(db, 'stockItems', stockItemId(storeId, catalogProduct.id)));
    if (existingStock.exists()) {
      throw new Error(`Ya existe un producto llamado "${trimmedName}" en esta tienda.`);
    }
  } else {
    const catalogId = await createCatalogProduct({
      name: trimmedName,
      category: trimmedCategory,
      unit: trimmedUnit,
      price: numPrice,
    }, user);
    catalogProduct = {
      id: catalogId, name: trimmedName, unit: trimmedUnit, price: Number(numPrice.toFixed(2)),
    };
  }

  const stockId = await enableCatalogProductInStore({
    catalogProduct,
    storeId,
    currentStock: Number(numCurrentStock.toFixed(2)),
    minStock: Number(numMinStock.toFixed(2)),
    cost: Number(numCost.toFixed(2)),
    priceOverride: Number(numPrice.toFixed(2)) !== catalogProduct.price
      ? Number(numPrice.toFixed(2))
      : null,
    user,
  });

  return { id: stockId, storeId, catalogId: catalogProduct.id, name: trimmedName, createdBy: userInfo };
}

export async function restockProduct(productId, amount, user = null, storeId = null) {
  if (!db) {
    throw new Error('No se puede actualizar el inventario: configura primero Firebase.');
  }
  if (!productId || !Number.isFinite(amount) || amount <= 0
    || Number((amount * 100).toFixed(0)) / 100 !== amount) {
    throw new Error('Indica un producto y una cantidad de resurtido válida.');
  }

  const userInfo = {
    userId: user?.id || user?.uid || null,
    userName: user?.displayName || user?.username || user?.email || 'Desconocido',
    userEmail: user?.email || '',
    userRole: user?.role || 'cajero',
  };

  const productRef = doc(db, 'stockItems', productId);
  const movementRef = doc(collection(db, 'inventoryMovements'));

  await runTransaction(db, async (transaction) => {
    const productSnapshot = await transaction.get(productRef);
    if (!productSnapshot.exists()) {
      throw new Error('El producto ya no existe. Actualiza el inventario e inténtalo de nuevo.');
    }

    const stockData = productSnapshot.data();
    const catalogSnapshot = await transaction.get(doc(db, 'catalogProducts', stockData.catalogId));
    const productData = catalogSnapshot.exists() ? catalogSnapshot.data() : {};
    const currentStock = stockData.currentStock;
    if (!Number.isFinite(currentStock)) {
      throw new Error(`El producto ${productId} no tiene un currentStock numérico.`);
    }

    const newStock = Number((currentStock + amount).toFixed(2));

    transaction.update(productRef, {
      currentStock: newStock,
      lastRestockedBy: userInfo,
      lastRestockedAt: serverTimestamp(),
    });

    transaction.set(movementRef, {
      type: 'restock',
      productId,
      productName: productData.name || '',
      unit: productData.unit || 'L',
      amount: Number(amount.toFixed(2)),
      previousStock: currentStock,
      newStock,
      referenceId: productId,
      createdBy: userInfo,
      storeId,
      timestamp: serverTimestamp(),
    });
  });
}

export async function updateProductMinStock(productId, minStock, user = null) {
  if (!db) {
    throw new Error('No se puede actualizar el mínimo: configura primero Firebase.');
  }
  if (user?.role !== 'admin') {
    throw new Error('Solo un administrador puede editar el mínimo de alerta.');
  }
  if (!productId || !Number.isFinite(minStock) || minStock < 0
    || Number((minStock * 100).toFixed(0)) / 100 !== minStock) {
    throw new Error('Indica un mínimo de alerta válido con máximo dos decimales.');
  }

  await updateDoc(doc(db, 'stockItems', productId), {
    minStock: Number(minStock.toFixed(2)),
    minStockUpdatedBy: {
      userId: user.id || user.uid || null,
      userName: user.displayName || user.username || user.email || 'Desconocido',
      userEmail: user.email || '',
      userRole: user.role,
    },
    minStockUpdatedAt: serverTimestamp(),
  });
}

export async function completeInventoryAudit({ counts, user = null, storeId = null }) {
  if (!db) {
    throw new Error('No se puede guardar la auditoría: configura primero Firebase.');
  }
  if (user?.role !== 'admin') {
    throw new Error('Solo un administrador puede realizar auditorías de inventario.');
  }
  if (!Array.isArray(counts) || counts.length === 0 || counts.length > 250) {
    throw new Error('La auditoría debe incluir entre 1 y 250 productos.');
  }

  const normalizedCounts = counts.map(({ productId, countedStock }) => ({
    productId,
    countedStock: Number(countedStock),
  }));
  if (normalizedCounts.some(({ productId, countedStock }) => (
    !productId || !Number.isFinite(countedStock) || countedStock < 0
      || Number((countedStock * 100).toFixed(0)) / 100 !== countedStock
  )) || new Set(normalizedCounts.map(({ productId }) => productId)).size !== normalizedCounts.length) {
    throw new Error('Captura un conteo válido, único y con máximo dos decimales para cada producto.');
  }

  const userInfo = {
    userId: user.id || user.uid || null,
    userName: user.displayName || user.username || user.email || 'Desconocido',
    userEmail: user.email || '',
    userRole: user.role,
  };
  const auditId = providedAuditId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : doc(collection(db, 'inventoryMovements')).id);
  const ticketId = providedTicketId || `AUD-${auditId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}`;
  const productRefs = normalizedCounts.map(({ productId }) => doc(db, 'stockItems', productId));
  const movementRefs = normalizedCounts.map(({ productId }) => doc(db, 'inventoryMovements', `audit-${auditId}-${productId}`));

  return runTransaction(db, async (transaction) => {
    if (movementRefs.length > 0) {
      const firstMovementSnapshot = await transaction.get(movementRefs[0]);
      if (firstMovementSnapshot.exists()) {
        return { auditId, ticketId, storeId, alreadyProcessed: true };
      }
    }
    const snapshots = await Promise.all(productRefs.map((productRef) => transaction.get(productRef)));
    const catalogSnapshots = await Promise.all(snapshots.map((snapshot) => (
      snapshot.exists() ? transaction.get(doc(db, 'catalogProducts', snapshot.data().catalogId)) : null
    )));
    const lines = snapshots.map((snapshot, index) => {
      if (!snapshot.exists() || !catalogSnapshots[index]?.exists()) {
        throw new Error('Un producto ya no existe. Actualiza el inventario e inténtalo de nuevo.');
      }

      const catalogData = catalogSnapshots[index].data();
      const product = {
        ...catalogData,
        ...snapshot.data(),
        price: Number.isFinite(snapshot.data().priceOverride)
          ? snapshot.data().priceOverride
          : catalogData.price,
      };
      const expectedStock = product.currentStock;
      if (!Number.isFinite(expectedStock)) {
        throw new Error(`El producto ${product.name || snapshot.id} tiene stock esperado inválido.`);
      }

      const countedStock = normalizedCounts[index].countedStock;
      const difference = Number((countedStock - expectedStock).toFixed(2));
      const shortage = Math.max(0, -difference);
      const surplus = Math.max(0, difference);
      const unitSalePrice = Number.isFinite(product.price) ? product.price : 0;

      return {
        productId: snapshot.id,
        productName: product.name || '',
        unit: product.unit || 'L',
        expectedStock,
        countedStock,
        difference,
        shortage,
        surplus,
        unitSalePrice,
        lossValue: Number((shortage * unitSalePrice).toFixed(2)),
        surplusValue: Number((surplus * unitSalePrice).toFixed(2)),
      };
    });

    lines.forEach((line, index) => {
      if (line.difference !== 0) {
        transaction.update(productRefs[index], { currentStock: line.countedStock });
      }
      transaction.set(movementRefs[index], {
        type: 'audit',
        auditId,
        ticketId,
        ...line,
        productName: line.productName,
        amount: line.difference,
        previousStock: line.expectedStock,
        newStock: line.countedStock,
        referenceId: auditId,
        createdBy: userInfo,
        storeId,
        timestamp: serverTimestamp(),
      });
    });

    return {
      auditId,
      ticketId,
      storeId,
      createdBy: userInfo,
      timestamp: new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }),
      auditedProducts: lines.length,
      adjustedProducts: lines.filter((line) => line.difference !== 0).length,
      shortageUnits: Number(lines.reduce((sum, line) => sum + line.shortage, 0).toFixed(2)),
      lossValue: Number(lines.reduce((sum, line) => sum + line.lossValue, 0).toFixed(2)),
      surplusUnits: Number(lines.reduce((sum, line) => sum + line.surplus, 0).toFixed(2)),
      surplusValue: Number(lines.reduce((sum, line) => sum + line.surplusValue, 0).toFixed(2)),
      lines,
    };
  });
}
