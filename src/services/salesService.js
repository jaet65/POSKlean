import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

const roundToCents = (value) => Number(value.toFixed(2));

export async function createSale({ cart, channel }) {
  if (!db) {
    throw new Error('No se puede registrar la venta: configura primero Firebase.');
  }
  if (!Array.isArray(cart) || cart.length === 0) {
    throw new Error('Agrega al menos un producto antes de cobrar.');
  }
  if (typeof channel !== 'string' || !channel.trim()) {
    throw new Error('Selecciona un canal de venta válido.');
  }

  const quantitiesByProduct = new Map();
  for (const item of cart) {
    if (!item.id || !Number.isFinite(item.qty) || item.qty <= 0
      || Number((item.qty * 100).toFixed(0)) / 100 !== item.qty) {
      throw new Error('El carrito contiene un producto o una cantidad inválidos.');
    }
    quantitiesByProduct.set(
      item.id,
      (quantitiesByProduct.get(item.id) || 0) + item.qty,
    );
  }

  const saleRef = doc(collection(db, 'sales'));
  const ticketId = `VTA-${saleRef.id.slice(0, 8).toUpperCase()}`;
  const productRefs = [...quantitiesByProduct.keys()].map((id) => doc(db, 'products', id));

  return runTransaction(db, async (transaction) => {
    const productSnapshots = await Promise.all(
      productRefs.map((productRef) => transaction.get(productRef)),
    );
    const saleItems = productSnapshots.map((productSnapshot, index) => {
      if (!productSnapshot.exists()) {
        throw new Error('Uno de los productos del carrito ya no existe. Actualiza el carrito e inténtalo de nuevo.');
      }

      const product = productSnapshot.data();
      const qty = quantitiesByProduct.get(productRefs[index].id);
      if (!Number.isFinite(product.currentStock) || !Number.isFinite(product.price)) {
        throw new Error(`El producto "${product.name || productSnapshot.id}" tiene stock o precio inválido.`);
      }
      if (product.currentStock < qty) {
        throw new Error(`Stock insuficiente de ${product.name}: disponibles ${product.currentStock} L y solicitados ${qty} L.`);
      }

      const price = roundToCents(product.price);
      return {
        productId: productSnapshot.id,
        name: product.name,
        unit: product.unit || 'L',
        qty,
        price,
        total: roundToCents(qty * price),
        newStock: Number((product.currentStock - qty).toFixed(2)),
      };
    });

    const total = roundToCents(saleItems.reduce((sum, item) => sum + item.total, 0));
    const liters = Number(saleItems.reduce((sum, item) => sum + item.qty, 0).toFixed(2));
    const sale = {
      ticketId,
      channel: channel.trim(),
      items: saleItems.map(({ newStock: _newStock, ...item }) => item),
      total,
      liters,
    };

    saleItems.forEach((item, index) => {
      transaction.update(productRefs[index], { currentStock: item.newStock });
    });
    transaction.set(saleRef, {
      ...sale,
      timestamp: serverTimestamp(),
    });

    return {
      ...sale,
      id: saleRef.id,
      timestamp: new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }),
      timestampMs: Date.now(),
    };
  });
}
