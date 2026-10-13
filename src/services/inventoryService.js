import { addDoc, collection, doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';

export async function addProduct(productData) {
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

  const newProduct = {
    name: trimmedName,
    category: trimmedCategory,
    currentStock: Number(numCurrentStock.toFixed(2)),
    minStock: Number(numMinStock.toFixed(2)),
    unit: trimmedUnit,
    price: Number(numPrice.toFixed(2)),
    cost: Number(numCost.toFixed(2)),
    color: color || 'bg-cyan-500',
  };

  const docRef = await addDoc(collection(db, 'products'), newProduct);
  return { id: docRef.id, ...newProduct };
}

export async function restockProduct(productId, amount) {
  if (!db) {
    throw new Error('No se puede actualizar el inventario: configura primero Firebase.');
  }
  if (!productId || !Number.isFinite(amount) || amount <= 0
    || Number((amount * 100).toFixed(0)) / 100 !== amount) {
    throw new Error('Indica un producto y una cantidad de resurtido válida.');
  }

  const productRef = doc(db, 'products', productId);
  await runTransaction(db, async (transaction) => {
    const productSnapshot = await transaction.get(productRef);
    if (!productSnapshot.exists()) {
      throw new Error('El producto ya no existe. Actualiza el inventario e inténtalo de nuevo.');
    }

    const currentStock = productSnapshot.data().currentStock;
    if (!Number.isFinite(currentStock)) {
      throw new Error(`El producto ${productId} no tiene un currentStock numérico.`);
    }

    transaction.update(productRef, {
      currentStock: Number((currentStock + amount).toFixed(2)),
    });
  });
}

