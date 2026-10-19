import { createSale } from './salesService';
import { closeCashShift, openCashShift } from './cashShiftService';
import { transferInventory } from './transferService';
import { completeInventoryAudit } from './inventoryService';
import {
  clearPendingQueue,
  countPendingOperations,
  countPendingSales,
  enqueuePendingOperation,
  enqueuePendingSale,
  generateUUID,
  listPendingOperations,
  listPendingSales,
  removePendingOperation,
  removePendingSale,
  updatePendingOperation,
  updatePendingSale,
} from './offlineQueue';

const LOCAL_SHIFT_KEY = 'posklean-local-shift';

export const isConnectivityError = (error) => (
  error?.code === 'unavailable'
  || error?.code === 'deadline-exceeded'
  || error?.code === 'failed-precondition' && /offline|network/i.test(error?.message || '')
  || /offline|network|Failed to get document|client is offline|network-request-failed/i.test(error?.message || '')
);

const plainUser = (user) => ({
  id: user?.id || null,
  uid: user?.uid || null,
  displayName: user?.displayName || null,
  username: user?.username || null,
  email: user?.email || '',
  role: user?.role || 'cajero',
});

const nowLabel = () => new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

export function getLocalShift() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SHIFT_KEY));
  } catch {
    return null;
  }
}

export const setLocalShift = (shift) => localStorage.setItem(LOCAL_SHIFT_KEY, JSON.stringify(shift));
export const clearLocalShift = () => localStorage.removeItem(LOCAL_SHIFT_KEY);

const typeOf = (entry) => entry.type || 'sale';

// Totales de ventas encoladas aún no sincronizadas para un turno.
export function sumPendingSales(entries, shiftId) {
  const paymentTotalsCents = { cash: 0, card: 0, transfer: 0 };
  let saleCount = 0;
  for (const entry of entries || []) {
    if (typeOf(entry) !== 'sale' || entry.error || entry.payload?.shiftId !== shiftId) continue;
    const cents = Math.round((entry.payload.cart || []).reduce((sum, item) => sum + item.total, 0) * 100);
    const method = entry.payload.paymentMethod || 'cash';
    paymentTotalsCents[method] = (paymentTotalsCents[method] || 0) + cents;
    saleCount += 1;
  }
  return { paymentTotalsCents, saleCount };
}

const hasPendingOps = async () => (await listPendingSales()).some((entry) => !entry.error);

// Ejecuta la acción en línea solo si no hay operaciones previas en cola, para preservar el orden FIFO.
async function tryOnline(action) {
  if (!navigator.onLine || await hasPendingOps()) return { done: false };
  try {
    return { done: true, value: await action() };
  } catch (error) {
    if (!isConnectivityError(error)) throw error;
    return { done: false };
  }
}

const afterEnqueue = () => {
  if (navigator.onLine) {
    flushPendingSales().catch(() => {});
  }
};

/**
 * Registra una venta de forma resiliente e idempotente.
 * Genera un UUIDv4 en el cliente para garantizar que reintentos o reconexiones no dupliquen la venta.
 */
export async function createSaleResilient(payload) {
  const saleId = payload.saleId || generateUUID();
  const ticketId = payload.ticketId || `VTA-${saleId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}`;
  const preparedPayload = {
    ...payload,
    saleId,
    ticketId,
  };

  const online = await tryOnline(() => createSale(preparedPayload));
  if (online.done) return online.value;

  await enqueuePendingSale(preparedPayload, 'sale', saleId);
  afterEnqueue();
  const total = preparedPayload.cart.reduce((sum, item) => sum + item.total, 0);
  return {
    id: saleId,
    saleId,
    ticketId,
    channel: preparedPayload.channel,
    paymentMethod: preparedPayload.paymentMethod,
    items: preparedPayload.cart.map(({ id, name, unit, qty, price, total: itemTotal }) => ({
      productId: id,
      name,
      unit: unit || 'L',
      qty,
      price,
      total: itemTotal,
    })),
    total: Number(total.toFixed(2)),
    timestamp: nowLabel(),
    timestampMs: Date.now(),
    pendingSync: true,
  };
}

/**
 * Apertura de turno resiliente con ID UUIDv4 idempotente.
 */
export async function openCashShiftResilient({ storeId, user, openingCash, shiftId: providedShiftId }) {
  const shiftId = providedShiftId || `shift-${generateUUID()}`;
  const cashierId = user?.id || user?.uid;
  if (!cashierId || !storeId || !Number.isFinite(openingCash) || openingCash < 0) {
    throw new Error('Selecciona una tienda válida e inicia sesión para abrir el turno.');
  }

  const preparedPayload = {
    storeId,
    user: plainUser(user),
    openingCash,
    shiftId,
  };

  const online = await tryOnline(() => openCashShift(preparedPayload));
  if (online.done) return online.value;

  await enqueuePendingSale(preparedPayload, 'openShift', shiftId);
  const shift = {
    id: shiftId,
    shiftId,
    cashierId,
    storeId,
    status: 'open',
    openingCashCents: Math.round(openingCash * 100),
    paymentTotalsCents: { cash: 0, card: 0, transfer: 0 },
    saleCount: 0,
    localOnly: true,
  };
  setLocalShift(shift);
  afterEnqueue();
  return shift;
}

/**
 * Cierre de turno resiliente e idempotente.
 */
export async function closeCashShiftResilient({ shift, storeId, user, countedCash }) {
  if (!Number.isFinite(countedCash) || countedCash < 0) {
    throw new Error('El efectivo contado debe ser un monto válido, positivo o cero, con máximo dos decimales.');
  }

  const preparedPayload = {
    shiftId: shift.id,
    storeId,
    user: plainUser(user),
    countedCash,
  };

  const online = await tryOnline(() => closeCashShift(preparedPayload));
  if (online.done) return online.value;

  const countedCashCents = Math.round(countedCash * 100);
  const expectedCashCents = (shift.openingCashCents || 0) + (shift.paymentTotalsCents?.cash || 0);
  const closed = {
    ...shift,
    status: 'closed',
    countedCashCents,
    expectedCashCents,
    cashDifferenceCents: countedCashCents - expectedCashCents,
    closedBy: {
      userId: user?.id || user?.uid || null,
      userName: user?.displayName || user?.username || user?.email || 'Desconocido',
    },
    timestamp: nowLabel(),
    timestampMs: Date.now(),
    localOnly: true,
  };

  await enqueuePendingSale(preparedPayload, 'closeShift', `close-${shift.id}`);
  setLocalShift(closed);
  afterEnqueue();
  return closed;
}

/**
 * Transferencia multitienda de inventario resiliente e idempotente.
 */
export async function transferInventoryResilient(payload) {
  const transferId = payload.transferId || generateUUID();
  const preparedPayload = {
    ...payload,
    user: plainUser(payload.user),
    transferId,
  };

  const online = await tryOnline(() => transferInventory(preparedPayload));
  if (online.done) return online.value;

  await enqueuePendingSale(preparedPayload, 'transfer', `transfer-${transferId}`);
  afterEnqueue();
  return {
    transferId,
    pendingSync: true,
  };
}

/**
 * Auditoría y ajuste de inventario resiliente e idempotente.
 */
export async function completeInventoryAuditResilient(payload) {
  const auditId = payload.auditId || generateUUID();
  const ticketId = payload.ticketId || `AUD-${auditId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}`;
  const preparedPayload = {
    ...payload,
    user: plainUser(payload.user),
    auditId,
    ticketId,
  };

  const online = await tryOnline(() => completeInventoryAudit(preparedPayload));
  if (online.done) return online.value;

  await enqueuePendingSale(preparedPayload, 'audit', `audit-${auditId}`);
  afterEnqueue();
  return {
    auditId,
    ticketId,
    storeId: payload.storeId,
    pendingSync: true,
  };
}

let flushing = false;

/**
 * Procesa la cola de operaciones pendientes en orden FIFO estricto.
 * Gracias a los IDs idempotentes (UUIDv4), cualquier operación que ya hubiera alcanzado
 * Firestore durante una intermitencia de red no se duplicará.
 */
export async function flushPendingSales() {
  if (flushing || !navigator.onLine) return { synced: 0, failed: 0 };
  flushing = true;
  let synced = 0;
  let failed = 0;
  try {
    for (const entry of await listPendingSales()) {
      if (entry.error) {
        failed += 1;
        continue;
      }
      try {
        const type = typeOf(entry);
        if (type === 'openShift') {
          await openCashShift(entry.payload);
        } else if (type === 'closeShift') {
          await closeCashShift(entry.payload);
        } else if (type === 'transfer') {
          await transferInventory(entry.payload);
        } else if (type === 'audit') {
          await completeInventoryAudit(entry.payload);
        } else {
          await createSale(entry.payload);
        }
        await removePendingSale(entry.localId);
        synced += 1;
      } catch (error) {
        if (isConnectivityError(error)) {
          // Si vuelve a fallar la conexión, pausamos el flush para reanudar luego
          break;
        }
        await updatePendingSale({
          ...entry,
          error: error.message || 'Error desconocido al sincronizar',
          failedAt: Date.now(),
          retries: (entry.retries || 0) + 1,
        });
        failed += 1;
      }
    }
    // Si no quedan operaciones pendientes, limpiar el turno local
    if (!(await hasPendingOps())) {
      clearLocalShift();
    }
  } finally {
    flushing = false;
  }
  return { synced, failed };
}

export const flushOfflineQueue = flushPendingSales;

export {
  clearPendingQueue,
  countPendingOperations,
  countPendingSales,
  enqueuePendingOperation,
  enqueuePendingSale,
  generateUUID,
  listPendingOperations,
  listPendingSales,
  removePendingOperation,
  removePendingSale,
  updatePendingOperation,
  updatePendingSale,
};
