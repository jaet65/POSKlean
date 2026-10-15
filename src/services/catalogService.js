import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';

export const stockItemId = (storeId, catalogId) => `${storeId}_${catalogId}`;

const roundMoney = (value) => Number(Number(value).toFixed(2));
const validMoney = (value) => Number.isFinite(value) && value >= 0
  && Number((value * 100).toFixed(0)) / 100 === value;

const userInfo = (user) => ({
  userId: user?.id || user?.uid || null,
  userName: user?.displayName || user?.username || user?.email || 'Desconocido',
  userEmail: user?.email || '',
  userRole: user?.role || 'cajero',
});

const requireManager = (user) => {
  if (user?.role !== 'admin' && user?.role !== 'supervisor') {
    throw new Error('Solo administradores y supervisores gestionan el catálogo.');
  }
};

export const normalizeProductName = (name) => String(name || '').trim().toLocaleLowerCase('es-MX');

function cleanCatalogFields({ name, category, unit, color, price, minStock = 0, supplierId = null }) {
  const cleanName = String(name || '').trim();
  const cleanCategory = String(category || '').trim();
  const cleanUnit = String(unit || '').trim() || 'L';
  if (!cleanName || cleanName.length > 120) throw new Error('Escribe el nombre del producto (máximo 120 caracteres).');
  if (!cleanCategory || cleanCategory.length > 60) throw new Error('Indica la categoría (máximo 60 caracteres).');
  if (cleanUnit.length > 10) throw new Error('La unidad admite máximo 10 caracteres.');
  const numericPrice = Number(price);
  if (!validMoney(numericPrice) || numericPrice <= 0) {
    throw new Error('El precio de venta debe ser mayor a 0 (máximo dos decimales).');
  }
  const numericMin = Number(minStock);
  if (!validMoney(numericMin)) {
    throw new Error('El stock mínimo debe ser 0 o mayor (máximo dos decimales).');
  }
  return {
    name: cleanName,
    category: cleanCategory,
    unit: cleanUnit,
    color: color || 'bg-cyan-500',
    price: numericPrice,
    minStock: numericMin,
    supplierId: String(supplierId || '').trim() || null,
  };
}

async function findCatalogByName(name) {
  const snapshot = await getDocs(collection(db, 'catalogProducts'));
  const normalized = normalizeProductName(name);
  const match = snapshot.docs.find((item) => normalizeProductName(item.data().name) === normalized);
  return match ? { id: match.id, ...match.data() } : null;
}

export async function createCatalogProduct(fields, user) {
  if (!db) throw new Error('Firestore no está inicializado.');
  requireManager(user);
  const clean = cleanCatalogFields(fields);
  if (await findCatalogByName(clean.name)) {
    throw new Error(`Ya existe un producto "${clean.name}" en el catálogo.`);
  }
  const ref = doc(collection(db, 'catalogProducts'));
  const now = serverTimestamp();
  await runTransaction(db, async (transaction) => {
    transaction.set(ref, {
      ...clean,
      status: 'active',
      createdBy: userInfo(user),
      createdAt: now,
      updatedAt: now,
    });
  });
  return ref.id;
}

// Importa filas ya validadas; omite los nombres que ya existen en el catálogo.
export async function importCatalogProducts(rows, user) {
  if (!db) throw new Error('Firestore no está inicializado.');
  requireManager(user);
  const existing = await getDocs(collection(db, 'catalogProducts'));
  const names = new Set(existing.docs.map((item) => normalizeProductName(item.data().name)));
  const toCreate = [];
  let skipped = 0;
  rows.forEach((row) => {
    const clean = cleanCatalogFields(row);
    if (names.has(normalizeProductName(clean.name))) {
      skipped += 1;
      return;
    }
    names.add(normalizeProductName(clean.name));
    toCreate.push(clean);
  });
  const author = userInfo(user);
  for (let start = 0; start < toCreate.length; start += 400) {
    const batch = writeBatch(db);
    toCreate.slice(start, start + 400).forEach((clean) => {
      const now = serverTimestamp();
      batch.set(doc(collection(db, 'catalogProducts')), {
        ...clean,
        status: 'active',
        createdBy: author,
        createdAt: now,
        updatedAt: now,
      });
    });
    await batch.commit();
  }
  return { created: toCreate.length, skipped };
}

export async function updateCatalogProduct(catalogId, fields, user, allProducts = []) {
  if (!db) throw new Error('Firestore no está inicializado.');
  requireManager(user);
  const clean = cleanCatalogFields(fields);
  const duplicate = allProducts.some((candidate) => candidate.id !== catalogId
    && normalizeProductName(candidate.name) === normalizeProductName(clean.name));
  if (duplicate) throw new Error(`Ya existe un producto "${clean.name}" en el catálogo.`);
  await runTransaction(db, async (transaction) => {
    transaction.update(doc(db, 'catalogProducts', catalogId), {
      ...clean,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function setCatalogProductStatus(catalogId, status, user) {
  if (!db) throw new Error('Firestore no está inicializado.');
  requireManager(user);
  if (!['active', 'archived'].includes(status)) throw new Error('Estado no válido.');
  if (status === 'archived') {
    const stock = await getDocs(query(
      collection(db, 'stockItems'),
      where('catalogId', '==', catalogId),
    ));
    if (stock.docs.some((item) => Number(item.data().currentStock) > 0)) {
      throw new Error('No se puede archivar: aún hay existencias en alguna tienda.');
    }
  }
  await runTransaction(db, async (transaction) => {
    transaction.update(doc(db, 'catalogProducts', catalogId), {
      status,
      updatedAt: serverTimestamp(),
    });
  });
}

// Alta de un producto del catálogo en una tienda, con existencias iniciales opcionales.
export async function enableCatalogProductInStore({
  catalogProduct, storeId, currentStock = 0, minStock = 0, cost = 0, priceOverride = null, user,
}) {
  if (!db) throw new Error('Firestore no está inicializado.');
  requireManager(user);
  if (!catalogProduct?.id || !storeId) throw new Error('Selecciona producto y tienda.');
  if (catalogProduct.status === 'archived') throw new Error('El producto está archivado.');
  const stock = Number(currentStock);
  const minimum = Number(minStock);
  const unitCost = Number(cost);
  if (!validMoney(stock) || !validMoney(minimum) || !validMoney(unitCost)) {
    throw new Error('Existencias, mínimo y costo deben ser números válidos con máximo dos decimales.');
  }
  const override = priceOverride === null || priceOverride === '' ? null : Number(priceOverride);
  if (override !== null && (!validMoney(override) || override <= 0)) {
    throw new Error('El precio propio debe ser mayor a 0.');
  }

  const author = userInfo(user);
  const stockRef = doc(db, 'stockItems', stockItemId(storeId, catalogProduct.id));
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(stockRef);
    if (existing.exists()) throw new Error('El producto ya está habilitado en esta tienda.');
    transaction.set(stockRef, {
      catalogId: catalogProduct.id,
      storeId,
      currentStock: roundMoney(stock),
      minStock: roundMoney(minimum),
      cost: roundMoney(unitCost),
      priceOverride: override,
      createdBy: author,
      createdAt: serverTimestamp(),
    });
    if (stock > 0) {
      transaction.set(doc(collection(db, 'inventoryMovements')), {
        type: 'initial',
        productId: stockRef.id,
        productName: catalogProduct.name,
        unit: catalogProduct.unit || 'L',
        amount: roundMoney(stock),
        previousStock: 0,
        newStock: roundMoney(stock),
        referenceId: stockRef.id,
        createdBy: author,
        storeId,
        timestamp: serverTimestamp(),
      });
    }
  });
  return stockRef.id;
}

// price = null elimina el precio propio y la tienda vuelve al precio global.
export async function setStorePriceOverride(stockId, price, user) {
  if (!db) throw new Error('Firestore no está inicializado.');
  requireManager(user);
  const value = price === null || price === '' ? null : Number(price);
  if (value !== null && (!validMoney(value) || value <= 0)) {
    throw new Error('El precio propio debe ser mayor a 0 (máximo dos decimales).');
  }
  await runTransaction(db, async (transaction) => {
    transaction.update(doc(db, 'stockItems', stockId), { priceOverride: value });
  });
}

export async function getCatalogProduct(catalogId) {
  const snapshot = await getDoc(doc(db, 'catalogProducts', catalogId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export { findCatalogByName };
