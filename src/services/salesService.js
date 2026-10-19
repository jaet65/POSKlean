import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { createPurchaseRequest } from './purchaseService';

const roundToCents = (value) => Number(value.toFixed(2));

export async function createSale({
  cart,
  channel,
  paymentMethod,
  shiftId,
  user,
  storeId,
  saleId,
  ticketId: clientTicketId,
}) {
  if (!db) {
    throw new Error('No se puede registrar la venta: configura primero Firebase.');
  }
  if (!Array.isArray(cart) || cart.length === 0) {
    throw new Error('Agrega al menos un producto antes de cobrar.');
  }
  if (typeof channel !== 'string' || !channel.trim()) {
    throw new Error('Selecciona un canal de venta válido.');
  }
  if (!['cash', 'card', 'transfer'].includes(paymentMethod)) {
    throw new Error('Selecciona un método de pago válido.');
  }
  const cashierId = user?.id || user?.uid;
  if (!cashierId || typeof shiftId !== 'string' || !shiftId.trim()
    || typeof storeId !== 'string' || !storeId.trim()) {
    throw new Error('Abre un turno de caja antes de registrar la venta.');
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

  const finalSaleId = saleId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : doc(collection(db, 'sales')).id);
  const saleRef = doc(db, 'sales', finalSaleId);
  const ticketId = clientTicketId || `VTA-${finalSaleId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}`;
  const productRefs = [...quantitiesByProduct.keys()].map((id) => doc(db, 'stockItems', id));
  const shiftRef = doc(db, 'cashShifts', shiftId);
  const registerRef = doc(db, 'cashRegisters', cashierId);

  const userInfo = {
    userId: user?.id || user?.uid || null,
    userName: user?.displayName || user?.username || user?.email || 'Desconocido',
    userEmail: user?.email || '',
    userRole: user?.role || 'cajero',
  };

  const saleResult = await runTransaction(db, async (transaction) => {
    // Verificación de idempotencia: si la venta ya fue registrada previamente, se retorna intacta
    const existingSaleSnapshot = await transaction.get(saleRef);
    if (existingSaleSnapshot.exists()) {
      const existing = existingSaleSnapshot.data();
      const existingDate = existing.timestamp?.toDate ? existing.timestamp.toDate() : null;
      return {
        ...existing,
        id: saleRef.id,
        ticketId: existing.ticketId || ticketId,
        timestamp: existingDate
          ? existingDate.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
          : new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }),
        timestampMs: existing.timestamp?.toMillis ? existing.timestamp.toMillis() : Date.now(),
        alreadyProcessed: true,
        restockCandidates: [],
      };
    }

    const [shiftSnapshot, registerSnapshot] = await Promise.all([
      transaction.get(shiftRef),
      transaction.get(registerRef),
    ]);
    if (!shiftSnapshot.exists() || shiftSnapshot.data().status !== 'open'
      || shiftSnapshot.data().cashierId !== cashierId
      || shiftSnapshot.data().storeId !== storeId) {
      throw new Error('El turno no está abierto para esta caja. Abre un turno y vuelve a intentar.');
    }
    if (!registerSnapshot.exists()
      || registerSnapshot.data().status !== 'open'
      || registerSnapshot.data().shiftId !== shiftId) {
      throw new Error('El turno ya está cerrado o dejó de ser el turno activo.');
    }
    const shiftPaymentTotals = shiftSnapshot.data().paymentTotalsCents;
    const shiftSaleCount = shiftSnapshot.data().saleCount;
    if (!shiftPaymentTotals || !Number.isSafeInteger(shiftPaymentTotals[paymentMethod])
      || !Number.isSafeInteger(shiftSaleCount) || shiftSaleCount < 0) {
      throw new Error('El resumen del turno tiene datos inválidos.');
    }

    const stockSnapshots = await Promise.all(
      productRefs.map((productRef) => transaction.get(productRef)),
    );
    const catalogSnapshots = await Promise.all(stockSnapshots.map((stockSnapshot) => (
      stockSnapshot.exists()
        ? transaction.get(doc(db, 'catalogProducts', stockSnapshot.data().catalogId))
        : null
    )));
    const saleItems = stockSnapshots.map((productSnapshot, index) => {
      const catalogSnapshot = catalogSnapshots[index];
      if (!productSnapshot.exists() || !catalogSnapshot?.exists()
        || catalogSnapshot.data().status === 'archived') {
        throw new Error('Uno de los productos del carrito ya no existe. Actualiza el carrito e inténtalo de nuevo.');
      }

      const stock = productSnapshot.data();
      const product = {
        ...catalogSnapshot.data(),
        currentStock: stock.currentStock,
        price: Number.isFinite(stock.priceOverride) ? stock.priceOverride : catalogSnapshot.data().price,
      };
      const qty = quantitiesByProduct.get(productRefs[index].id);
      if (stock.storeId !== storeId) {
        throw new Error(`El producto "${product.name}" no pertenece a esta tienda.`);
      }
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
        previousStock: product.currentStock,
        newStock: Number((product.currentStock - qty).toFixed(2)),
      };
    });

    // Productos que cruzan el stock mínimo con esta venta; la solicitud se crea tras confirmar.
    const restockCandidates = [];
    saleItems.forEach((item, index) => {
      const stock = stockSnapshots[index].data();
      const catalog = catalogSnapshots[index].data();
      const minStock = Number(stock.minStock ?? catalog.minStock);
      if (!(minStock > 0) || item.previousStock <= minStock || item.newStock > minStock
        || catalog.status !== 'active' || !catalog.supplierId) return;
      restockCandidates.push({
        storeId,
        supplierId: catalog.supplierId,
        qtyRequested: Number(Math.max(minStock * 2 - item.newStock, 0.01).toFixed(2)),
        product: {
          id: item.productId,
          catalogId: stock.catalogId,
          storeId,
          name: catalog.name,
          unit: item.unit,
        },
      });
    });

    const total = roundToCents(saleItems.reduce((sum, item) => sum + item.total, 0));
    const totalCents = Math.round(total * 100);
    const liters = Number(saleItems.reduce((sum, item) => sum + item.qty, 0).toFixed(2));
    const sale = {
      ticketId,
      channel: channel.trim(),
      paymentMethod,
      shiftId,
      cashierId,
      totalCents,
      items: saleItems.map(({ previousStock: _prev, newStock: _newStock, ...item }) => item),
      total,
      liters,
      createdBy: userInfo,
      storeId,
    };

    saleItems.forEach((item, index) => {
      transaction.update(productRefs[index], { currentStock: item.newStock });

      // Registrar movimiento de inventario por venta (salida) con ID determinista
      const movementRef = doc(db, 'inventoryMovements', `sale-${saleRef.id}-${item.productId}`);
      transaction.set(movementRef, {
        type: 'sale',
        productId: item.productId,
        productName: item.name,
        unit: item.unit,
        amount: -item.qty,
        previousStock: item.previousStock,
        newStock: item.newStock,
        referenceId: saleRef.id,
        ticketId,
        createdBy: userInfo,
        storeId,
        timestamp: serverTimestamp(),
      });
    });

    transaction.set(saleRef, {
      ...sale,
      storeId,
      timestamp: serverTimestamp(),
    });
    transaction.update(shiftRef, {
      paymentTotalsCents: {
        ...shiftPaymentTotals,
        [paymentMethod]: shiftPaymentTotals[paymentMethod] + totalCents,
      },
      saleCount: shiftSaleCount + 1,
      lastSaleId: saleRef.id,
    });

    return {
      ...sale,
      id: saleRef.id,
      timestamp: new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }),
      timestampMs: Date.now(),
      restockCandidates,
    };
  });

  const { restockCandidates = [], alreadyProcessed = false, ...result } = saleResult;
  // Un fallo aquí (p. ej. proveedor inactivo) no debe afectar la venta ya registrada.
  // Y si la venta ya había sido procesada (retry idempotente), evitamos duplicar solicitudes de compra.
  if (!alreadyProcessed && restockCandidates.length > 0) {
    await Promise.allSettled(restockCandidates.map(({ product, supplierId, qtyRequested, storeId: requestStore }) => (
      createPurchaseRequest({ storeId: requestStore, product, supplierId, qtyRequested, user })
    )));
  }
  return result;
}
