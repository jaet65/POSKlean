import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { normalizeProductName, stockItemId } from './catalogService';

const MAX_LINES = 50;
const MAX_TOTAL_CENTS = 99999999999;

const userInfo = (user) => ({
  userId: user?.id || user?.uid || null,
  userName: user?.displayName || user?.username || user?.email || 'Desconocido',
  userRole: user?.role || 'cajero',
});

const toHundredths = (value) => Math.round(Number(value) * 100);
const fromHundredths = (value) => value / 100;
const validQuantity = (value) => Number.isFinite(value) && value > 0 && value < 1000000
  && toHundredths(value) / 100 === value;
const validMoney = (value) => Number.isFinite(value) && value >= 0 && value < 10000000
  && toHundredths(value) / 100 === value;

// Costo promedio ponderado por cantidad entre el existente y la nueva compra.
export function weightedAverageCost(currentStock, currentCost, qty, unitCost) {
  const stock = Math.max(Number(currentStock) || 0, 0);
  const total = stock + qty;
  if (total <= 0) return unitCost;
  return Math.round(((stock * (Number(currentCost) || 0) + qty * unitCost) / total) * 100) / 100;
}

// Mismo criterio que el alta de productos en inventario: 50% de margen sobre la venta.
export function suggestedSalePrice(cost) {
  return Math.round((cost / 0.5) * 100) / 100;
}

export function subscribeToPurchaseOrders(storeIds, onData, onError) {
  const ids = [...new Set((Array.isArray(storeIds) ? storeIds : [storeIds]).filter(Boolean))];
  if (!db || ids.length === 0) {
    onData([]);
    return () => {};
  }
  const byStore = new Map();
  const emit = () => {
    onData([...byStore.values()].flat().sort((a, b) => b.createdAtMs - a.createdAtMs));
  };
  const unsubscribers = ids.map((storeId) => onSnapshot(
    query(collection(db, 'purchaseOrders'), where('storeId', '==', storeId)),
    (snapshot) => {
      byStore.set(storeId, snapshot.docs.map((orderDoc) => {
        const data = orderDoc.data();
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;
        return {
          ...data,
          id: orderDoc.id,
          createdAtMs: createdAt ? createdAt.getTime() : 0,
          createdAtLabel: createdAt
            ? createdAt.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
            : 'Fecha no disponible',
        };
      }));
      emit();
    },
    onError,
  ));
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export async function createPurchaseOrder({ storeId, supplier, lines, notes = '', products, catalog = [], user }) {
  if (!db) throw new Error('Firestore no está inicializado.');
  if (!storeId) throw new Error('Selecciona una tienda para la orden de compra.');
  if (!supplier?.id || supplier.status === 'archived') {
    throw new Error('Selecciona un proveedor activo.');
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('Agrega al menos un producto a la orden.');
  }
  if (lines.length > MAX_LINES) throw new Error(`Una orden admite máximo ${MAX_LINES} productos.`);

  const seen = new Set();
  const newProductNames = new Set();
  const newProducts = [];
  const catalogByName = new Map();
  if (lines.some((line) => line.newProduct)) {
    const catalogSnapshot = await getDocs(collection(db, 'catalogProducts'));
    catalogSnapshot.docs.forEach((item) => {
      catalogByName.set(normalizeProductName(item.data().name), { id: item.id, ...item.data() });
    });
  }
  const items = lines.map((line) => {
    if (line.newProduct) {
      const draft = line.newProduct;
      const name = String(draft.name || '').trim();
      const category = String(draft.category || '').trim();
      const unit = String(draft.unit || '').trim() || 'L';
      if (!name) throw new Error('Escribe el nombre del producto nuevo.');
      if (name.length > 120) throw new Error(`El nombre "${name}" es demasiado largo.`);
      if (!category || category.length > 60) throw new Error(`Indica la categoría de ${name} (máximo 60 caracteres).`);
      if (!validMoney(draft.price) || draft.price <= 0) {
        throw new Error(`El precio de venta de ${name} debe ser mayor a 0 (máximo dos decimales).`);
      }
      const normalizedName = name.toLocaleLowerCase('es-MX');
      const duplicated = newProductNames.has(normalizedName) || products.some((candidate) => (
        candidate.storeId === storeId
        && String(candidate.name || '').trim().toLocaleLowerCase('es-MX') === normalizedName
      ));
      if (duplicated) throw new Error(`Ya existe un producto llamado "${name}" en esta tienda.`);
      newProductNames.add(normalizedName);
      const existingCatalog = catalogByName.get(normalizedName);
      if (existingCatalog?.status === 'archived') {
        throw new Error(`"${name}" está archivado en el catálogo; restáuralo antes de comprarlo.`);
      }
      const isNewCatalog = !existingCatalog;
      const catalogId = existingCatalog ? existingCatalog.id : doc(collection(db, 'catalogProducts')).id;
      if (!validQuantity(line.qty)) {
        throw new Error(`Cantidad no válida para ${name} (máximo dos decimales).`);
      }
      if (!validMoney(line.unitCost)) {
        throw new Error(`Costo no válido para ${name} (máximo dos decimales).`);
      }
      const productRef = doc(db, 'stockItems', stockItemId(storeId, catalogId));
      newProducts.push({
        catalogRef: isNewCatalog ? doc(db, 'catalogProducts', catalogId) : null,
        catalogData: {
          name,
          category,
          unit,
          color: 'bg-cyan-500',
          price: draft.price,
          status: 'active',
          createdBy: { ...userInfo(user), userEmail: user?.email || '' },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        ref: productRef,
        data: {
          catalogId,
          storeId,
          currentStock: 0,
          minStock: 0,
          cost: line.unitCost,
          priceOverride: null,
          createdBy: { ...userInfo(user), userEmail: user?.email || '' },
          createdAt: serverTimestamp(),
        },
      });
      return {
        productId: productRef.id,
        productName: name,
        unit,
        qtyOrdered: line.qty,
        qtyReceived: 0,
        unitCostCents: toHundredths(line.unitCost),
      };
    }
    const catalogItem = line.catalogId
      ? catalog.find((candidate) => candidate.id === line.catalogId)
      : null;
    if (line.catalogId) {
      if (!catalogItem || catalogItem.status === 'archived') {
        throw new Error('Uno de los productos del catálogo ya no está disponible.');
      }
      if (products.some((candidate) => candidate.storeId === storeId && candidate.catalogId === catalogItem.id)) {
        throw new Error(`${catalogItem.name} ya está habilitado en esta tienda.`);
      }
      if (seen.has(`catalog:${catalogItem.id}`)) throw new Error(`${catalogItem.name} está repetido en la orden.`);
      seen.add(`catalog:${catalogItem.id}`);
      if (!validQuantity(line.qty)) {
        throw new Error(`Cantidad no válida para ${catalogItem.name} (máximo dos decimales).`);
      }
      if (!validMoney(line.unitCost)) {
        throw new Error(`Costo no válido para ${catalogItem.name} (máximo dos decimales).`);
      }
      const productRef = doc(db, 'stockItems', stockItemId(storeId, catalogItem.id));
      newProducts.push({
        catalogRef: null,
        catalogData: null,
        ref: productRef,
        data: {
          catalogId: catalogItem.id,
          storeId,
          currentStock: 0,
          minStock: 0,
          cost: line.unitCost,
          priceOverride: null,
          createdBy: { ...userInfo(user), userEmail: user?.email || '' },
          createdAt: serverTimestamp(),
        },
      });
      return {
        productId: productRef.id,
        productName: catalogItem.name,
        unit: catalogItem.unit || 'L',
        qtyOrdered: line.qty,
        qtyReceived: 0,
        unitCostCents: toHundredths(line.unitCost),
      };
    }
    const product = products.find((candidate) => candidate.id === line.productId);
    if (!product || product.storeId !== storeId) {
      throw new Error('Uno de los productos ya no existe en esta tienda.');
    }
    if (seen.has(product.id)) throw new Error(`${product.name} está repetido en la orden.`);
    seen.add(product.id);
    if (!validQuantity(line.qty)) {
      throw new Error(`Cantidad no válida para ${product.name} (máximo dos decimales).`);
    }
    if (!validMoney(line.unitCost)) {
      throw new Error(`Costo no válido para ${product.name} (máximo dos decimales).`);
    }
    return {
      productId: product.id,
      productName: product.name,
      unit: product.unit || 'L',
      qtyOrdered: line.qty,
      qtyReceived: 0,
      unitCostCents: toHundredths(line.unitCost),
    };
  });

  const totalCents = items.reduce(
    (sum, item) => sum + Math.round(item.qtyOrdered * item.unitCostCents),
    0,
  );
  if (totalCents > MAX_TOTAL_CENTS) throw new Error('El total de la orden es demasiado alto.');

  const orderRef = doc(collection(db, 'purchaseOrders'));
  const createdAt = serverTimestamp();
  await runTransaction(db, async (transaction) => {
    newProducts.forEach(({ catalogRef, catalogData, ref, data }) => {
      if (catalogRef) transaction.set(catalogRef, catalogData);
      transaction.set(ref, data);
    });
    transaction.set(orderRef, {
      storeId,
      supplierId: supplier.id,
      supplierName: supplier.name,
      orderNumber: `OC-${orderRef.id.slice(0, 8).toUpperCase()}`,
      status: 'pending',
      items,
      totalCents,
      receivedCents: 0,
      notes: String(notes || '').trim().slice(0, 500),
      createdBy: userInfo(user),
      createdAt,
      updatedAt: createdAt,
    });
  });
  return orderRef.id;
}

export async function cancelPurchaseOrder(orderId, user) {
  if (!db) throw new Error('Firestore no está inicializado.');
  const orderRef = doc(db, 'purchaseOrders', orderId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error('La orden ya no existe.');
    if (snapshot.data().status !== 'pending') {
      throw new Error('Solo se pueden cancelar órdenes pendientes sin recepciones.');
    }
    const now = serverTimestamp();
    transaction.update(orderRef, {
      status: 'cancelled',
      cancelledBy: userInfo(user),
      cancelledAt: now,
      updatedAt: now,
    });
  });
}

// receipts: [{ index, qty, unitCost, newPrice? }] — líneas de la orden que llegan en esta recepción.
export async function receivePurchaseOrder({ orderId, receipts, user }) {
  if (!db) throw new Error('Firestore no está inicializado.');
  const received = (receipts || []).filter((receipt) => Number(receipt.qty) > 0);
  if (received.length === 0) throw new Error('Captura la cantidad recibida de al menos un producto.');

  const orderRef = doc(db, 'purchaseOrders', orderId);
  const author = userInfo(user);

  await runTransaction(db, async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists()) throw new Error('La orden ya no existe.');
    const order = orderSnapshot.data();
    if (!['pending', 'partial'].includes(order.status)) {
      throw new Error('Esta orden ya no admite recepciones.');
    }

    const indexes = new Set();
    const lines = received.map((receipt) => {
      const item = order.items[receipt.index];
      if (!item || indexes.has(receipt.index)) throw new Error('Línea de la orden no válida.');
      indexes.add(receipt.index);
      if (!validQuantity(receipt.qty)) {
        throw new Error(`Cantidad recibida no válida para ${item.productName}.`);
      }
      if (!validMoney(receipt.unitCost)) {
        throw new Error(`Costo no válido para ${item.productName}.`);
      }
      const pendingHundredths = toHundredths(item.qtyOrdered) - toHundredths(item.qtyReceived);
      if (toHundredths(receipt.qty) > pendingHundredths) {
        throw new Error(`${item.productName}: recibes más de lo pendiente (${fromHundredths(pendingHundredths)} ${item.unit}).`);
      }
      return { ...receipt, item, productRef: doc(db, 'stockItems', item.productId) };
    });

    const productSnapshots = await Promise.all(
      lines.map((line) => transaction.get(line.productRef)),
    );

    const nextItems = order.items.map((item) => ({ ...item }));
    let addedCents = 0;
    productSnapshots.forEach((productSnapshot, position) => {
      const { item, qty, unitCost, index, productRef, newPrice } = lines[position];
      if (!productSnapshot.exists() || productSnapshot.data().storeId !== order.storeId) {
        throw new Error(`El producto ${item.productName} ya no existe en esta tienda.`);
      }
      const productData = productSnapshot.data();
      if (!Number.isFinite(productData.currentStock)) {
        throw new Error(`El producto ${item.productName} no tiene un stock numérico.`);
      }
      const newStock = Number((productData.currentStock + qty).toFixed(2));
      const unitCostCents = toHundredths(unitCost);
      const averageCost = weightedAverageCost(productData.currentStock, productData.cost, qty, unitCost);
      const productChanges = {
        currentStock: newStock,
        cost: averageCost,
        lastRestockedBy: author,
        lastRestockedAt: serverTimestamp(),
      };
      if (newPrice !== undefined && newPrice !== null) {
        if (!validMoney(newPrice) || newPrice <= 0) {
          throw new Error(`Precio de venta no válido para ${item.productName}.`);
        }
        productChanges.priceOverride = newPrice;
      }

      transaction.update(productRef, productChanges);
      transaction.set(doc(collection(db, 'inventoryMovements')), {
        type: 'purchase',
        productId: item.productId,
        productName: productData.name || item.productName,
        unit: productData.unit || item.unit || 'L',
        amount: qty,
        previousStock: productData.currentStock,
        newStock,
        referenceId: orderId,
        orderNumber: order.orderNumber || '',
        supplierId: order.supplierId,
        supplierName: order.supplierName,
        unitCostCents,
        createdBy: author,
        storeId: order.storeId,
        timestamp: serverTimestamp(),
      });

      nextItems[index].qtyReceived = fromHundredths(
        toHundredths(item.qtyReceived) + toHundredths(qty),
      );
      nextItems[index].lastReceivedCostCents = unitCostCents;
      addedCents += Math.round(qty * unitCostCents);
    });

    const isComplete = nextItems.every(
      (item) => toHundredths(item.qtyReceived) >= toHundredths(item.qtyOrdered),
    );
    const now = serverTimestamp();
    transaction.update(orderRef, {
      status: isComplete ? 'received' : 'partial',
      items: nextItems,
      receivedCents: (order.receivedCents || 0) + addedCents,
      lastReceivedBy: author,
      receivedAt: now,
      updatedAt: now,
    });
  });
}
