import { createSale } from './salesService';
import { closeCashShift, openCashShift } from './cashShiftService';
import {
  enqueuePendingSale,
  listPendingSales,
  removePendingSale,
  updatePendingSale,
} from './offlineQueue';

const LOCAL_SHIFT_KEY = 'posklean-local-shift';

const isConnectivityError = (error) => (
  error?.code === 'unavailable'
  || error?.code === 'deadline-exceeded'
  || /offline|network|Failed to get document/i.test(error?.message || '')
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

const setLocalShift = (shift) => localStorage.setItem(LOCAL_SHIFT_KEY, JSON.stringify(shift));
const clearLocalShift = () => localStorage.removeItem(LOCAL_SHIFT_KEY);

const typeOf = (entry) => entry.type || 'sale';

// Totales de ventas encoladas aún no sincronizadas para un turno.
export function sumPendingSales(entries, shiftId) {
  const paymentTotalsCents = { cash: 0, card: 0, transfer: 0 };
  let saleCount = 0;
  for (const entry of entries) {
    if (typeOf(entry) !== 'sale' || entry.error || entry.payload.shiftId !== shiftId) continue;
    const cents = Math.round(entry.payload.cart.reduce((sum, item) => sum + item.total, 0) * 100);
    paymentTotalsCents[entry.payload.paymentMethod] += cents;
    saleCount += 1;
  }
  return { paymentTotalsCents, saleCount };
}

const hasPendingOps = async () => (await listPendingSales()).some((entry) => !entry.error);

// Ejecuta la acción en línea solo si no hay operaciones previas en cola, para preservar el orden.
async function tryOnline(action) {
  if (!navigator.onLine || await hasPendingOps()) return { done: false };
  try {
    return { done: true, value: await action() };
  } catch (error) {
    if (!isConnectivityError(error)) throw error;
    return { done: false };
  }
}

const afterEnqueue = () => { if (navigator.onLine) flushPendingSales(); };

export async function createSaleResilient(payload) {
  const online = await tryOnline(() => createSale(payload));
  if (online.done) return online.value;

  const entry = await enqueuePendingSale(payload, 'sale');
  afterEnqueue();
  const total = payload.cart.reduce((sum, item) => sum + item.total, 0);
  return {
    id: entry.localId,
    ticketId: `OFF-${entry.localId.slice(-6).toUpperCase()}`,
    channel: payload.channel,
    paymentMethod: payload.paymentMethod,
    items: payload.cart.map(({ id, name, unit, qty, price, total: itemTotal }) => ({
      productId: id, name, unit: unit || 'L', qty, price, total: itemTotal,
    })),
    total: Number(total.toFixed(2)),
    timestamp: nowLabel(),
    timestampMs: Date.now(),
    pendingSync: true,
  };
}

export async function openCashShiftResilient({ storeId, user, openingCash }) {
  const online = await tryOnline(() => openCashShift({ storeId, user, openingCash }));
  if (online.done) return online.value;

  const cashierId = user?.id || user?.uid;
  if (!cashierId || !storeId || !Number.isFinite(openingCash) || openingCash < 0) {
    throw new Error('Selecciona una tienda válida e inicia sesión para abrir el turno.');
  }
  const shiftId = `local-${crypto.randomUUID()}`;
  await enqueuePendingSale({ storeId, user: plainUser(user), openingCash, shiftId }, 'openShift');
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

export async function closeCashShiftResilient({ shift, storeId, user, countedCash }) {
  const online = await tryOnline(() => closeCashShift({
    shiftId: shift.id, storeId, user, countedCash,
  }));
  if (online.done) return online.value;

  if (!Number.isFinite(countedCash) || countedCash < 0) {
    throw new Error('El efectivo contado debe ser un monto válido, positivo o cero, con máximo dos decimales.');
  }
  // `shift` ya incluye las ventas pendientes (ver mezcla en App), no se suman de nuevo.
  const countedCashCents = Math.round(countedCash * 100);
  const expectedCashCents = shift.openingCashCents + shift.paymentTotalsCents.cash;
  const closed = {
    ...shift,
    status: 'closed',
    countedCashCents,
    expectedCashCents,
    cashDifferenceCents: countedCashCents - expectedCashCents,
    closedBy: { userId: user?.id || user?.uid || null, userName: user?.displayName || user?.username || user?.email || 'Desconocido' },
    timestamp: nowLabel(),
    timestampMs: Date.now(),
    localOnly: true,
  };
  await enqueuePendingSale({
    shiftId: shift.id, storeId, user: plainUser(user), countedCash,
  }, 'closeShift');
  setLocalShift(closed);
  afterEnqueue();
  return closed;
}

let flushing = false;

// Reenvía en orden las operaciones pendientes; se detiene si vuelve a caer la conexión.
export async function flushPendingSales() {
  if (flushing || !navigator.onLine) return { synced: 0, failed: 0 };
  flushing = true;
  let synced = 0;
  let failed = 0;
  try {
    for (const entry of await listPendingSales()) {
      if (entry.error) { failed += 1; continue; }
      try {
        const type = typeOf(entry);
        if (type === 'openShift') await openCashShift(entry.payload);
        else if (type === 'closeShift') await closeCashShift(entry.payload);
        else await createSale(entry.payload);
        await removePendingSale(entry.localId);
        synced += 1;
      } catch (error) {
        if (isConnectivityError(error)) break;
        await updatePendingSale({ ...entry, error: error.message || 'Error desconocido' });
        failed += 1;
      }
    }
    // Sin operaciones pendientes, el turno local ya está reflejado en Firestore.
    if (!(await hasPendingOps())) clearLocalShift();
  } finally {
    flushing = false;
  }
  return { synced, failed };
}

export async function countPendingSales() {
  return (await listPendingSales()).filter((entry) => !entry.error).length;
}

export { listPendingSales };
