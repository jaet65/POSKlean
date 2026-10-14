import { addDoc, collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export async function addProduct(productData, user = null) {
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
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'products'), newProduct);

  // Si se dio de alta con stock inicial > 0, registrar movimiento de inventario
  if (numCurrentStock > 0) {
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
      timestamp: serverTimestamp(),
    });
  }

  return { id: docRef.id, ...newProduct };
}

export async function restockProduct(productId, amount, user = null) {
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
      timestamp: serverTimestamp(),
    });
  });
}

