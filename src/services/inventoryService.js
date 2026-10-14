import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';

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

  const productRef = doc(db, 'products', productId);
  const productSnapshot = await getDoc(productRef);
  if (!productSnapshot.exists()) {
    throw new Error('El producto ya no existe. Actualiza el inventario e inténtalo de nuevo.');
  }

  const product = productSnapshot.data();
  if (product.storeId !== storeId) {
    throw new Error('El producto no pertenece a la tienda seleccionada.');
  }
  if (Number(product.currentStock) !== 0) {
    throw new Error('Solo se pueden eliminar productos con stock en 0.');
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
    color = 'bg-cyan-500',
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

  const normalizedName = trimmedName.toLocaleLowerCase('es-MX');
  const productsInStore = await getDocs(query(
    collection(db, 'products'),
    where('storeId', '==', storeId),
  ));
  const duplicateProduct = productsInStore.docs.some((productDoc) => {
    const existingName = productDoc.data().name;
    return typeof existingName === 'string'
      && existingName.trim().toLocaleLowerCase('es-MX') === normalizedName;
  });
  if (duplicateProduct) {
    throw new Error(`Ya existe un producto llamado "${trimmedName}" en esta tienda.`);
  }

  const userInfo = {
    userId: user?.id || user?.uid || null,
    userName: user?.displayName || user?.username || user?.email || 'Desconocido',
    userEmail: user?.email || '',
    userRole: user?.role || 'cajero',
  };

  const newProduct = {
    name: trimmedName,
    category: trimmedCategory,
    currentStock: Number(numCurrentStock.toFixed(2)),
    minStock: Number(numMinStock.toFixed(2)),
    unit: trimmedUnit,
    price: Number(numPrice.toFixed(2)),
    cost: Number(numCost.toFixed(2)),
    color: color || 'bg-cyan-500',
    createdBy: userInfo,
    storeId,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'products'), newProduct);

  await addDoc(collection(db, 'inventoryMovements'), {
    type: 'initial',
    productId: docRef.id,
    productName: trimmedName,
    unit: trimmedUnit,
    amount: Number(numCurrentStock.toFixed(2)),
    previousStock: 0,
    newStock: Number(numCurrentStock.toFixed(2)),
    referenceId: docRef.id,
    createdBy: userInfo,
    storeId,
    timestamp: serverTimestamp(),
  });

  return { id: docRef.id, ...newProduct };
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

  const productRef = doc(db, 'products', productId);
  const movementRef = doc(collection(db, 'inventoryMovements'));

  await runTransaction(db, async (transaction) => {
    const productSnapshot = await transaction.get(productRef);
    if (!productSnapshot.exists()) {
      throw new Error('El producto ya no existe. Actualiza el inventario e inténtalo de nuevo.');
    }

    const productData = productSnapshot.data();
    const currentStock = productData.currentStock;
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

export async function updateProductMinStock(productId, minStock, user = null, storeId = null) {
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

  await updateDoc(doc(db, 'products', productId), {
    storeId,
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
  const auditId = doc(collection(db, 'inventoryMovements')).id;
  const productRefs = normalizedCounts.map(({ productId }) => doc(db, 'products', productId));
  const movementRefs = normalizedCounts.map(() => doc(collection(db, 'inventoryMovements')));

  return runTransaction(db, async (transaction) => {
    const snapshots = await Promise.all(productRefs.map((productRef) => transaction.get(productRef)));
    const lines = snapshots.map((snapshot, index) => {
      if (!snapshot.exists()) {
        throw new Error('Un producto ya no existe. Actualiza el inventario e inténtalo de nuevo.');
      }

      const product = snapshot.data();
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
