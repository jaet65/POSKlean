import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const PAYMENT_METHODS = ['cash', 'card', 'transfer'];

const userInfo = (user) => ({
  userId: user?.id || user?.uid || null,
  userName: user?.displayName || user?.username || user?.email || 'Desconocido',
  userRole: user?.role || 'cajero',
});
const validCashAmount = (amount) => Number.isFinite(amount)
  && amount >= 0
  && Number((amount * 100).toFixed(0)) / 100 === amount;

export async function openCashShift({ storeId, user, openingCash }) {
  if (!db) throw new Error('Firestore no está inicializado.');
  const cashierId = user?.id || user?.uid;
  if (typeof storeId !== 'string' || !storeId.trim() || !cashierId) {
    throw new Error('Selecciona una tienda válida e inicia sesión para abrir el turno.');
  }
  if (!validCashAmount(openingCash)) {
    throw new Error('El fondo inicial debe ser un monto válido, positivo o cero, con máximo dos decimales.');
  }

  const registerRef = doc(db, 'cashRegisters', cashierId);
  const storeRef = doc(db, 'stores', storeId);
  const shiftRef = doc(collection(db, 'cashShifts'));
  const cashier = userInfo(user);

  await runTransaction(db, async (transaction) => {
    const [registerSnapshot, storeSnapshot] = await Promise.all([
      transaction.get(registerRef),
      transaction.get(storeRef),
    ]);
    if (!storeSnapshot.exists() || storeSnapshot.data().status === 'archived') {
      throw new Error('No se puede abrir un turno en una tienda archivada o inexistente.');
    }
    if (registerSnapshot.exists() && registerSnapshot.data().status === 'open') {
      throw new Error('Ya tienes un turno abierto. Ciérralo antes de abrir otro.');
    }
    const openCashShiftCount = storeSnapshot.data().openCashShiftCount ?? 0;
    if (!Number.isSafeInteger(openCashShiftCount) || openCashShiftCount < 0
      || openCashShiftCount >= 100000) {
      throw new Error('El contador de turnos abiertos de la tienda no es válido.');
    }

    const openedAt = serverTimestamp();
    transaction.set(shiftRef, {
      shiftId: shiftRef.id,
      cashierId,
      storeId,
      status: 'open',
      openingCashCents: Math.round(openingCash * 100),
      openedBy: cashier,
      openedAt,
      paymentTotalsCents: { cash: 0, card: 0, transfer: 0 },
      saleCount: 0,
    });
    transaction.update(storeRef, { openCashShiftCount: openCashShiftCount + 1 });
    transaction.set(registerRef, {
      cashierId,
      storeId,
      shiftId: shiftRef.id,
      status: 'open',
      updatedAt: openedAt,
    });
  });

  return {
    id: shiftRef.id,
    shiftId: shiftRef.id,
    cashierId,
    storeId,
    status: 'open',
    openingCashCents: Math.round(openingCash * 100),
    openedBy: cashier,
  };
}

export async function closeCashShift({ shiftId, storeId, user, countedCash }) {
  if (!db) throw new Error('Firestore no está inicializado.');
  const cashierId = user?.id || user?.uid;
  if (typeof shiftId !== 'string' || !shiftId.trim()
    || typeof storeId !== 'string' || !storeId.trim()
    || !cashierId) {
    throw new Error('No se pudo identificar el turno, la tienda o el usuario.');
  }
  if (!validCashAmount(countedCash)) {
    throw new Error('El efectivo contado debe ser un monto válido, positivo o cero, con máximo dos decimales.');
  }

  const shiftRef = doc(db, 'cashShifts', shiftId);
  const registerRef = doc(db, 'cashRegisters', cashierId);
  const storeRef = doc(db, 'stores', storeId);
  const closer = userInfo(user);

  return runTransaction(db, async (transaction) => {
    const [shiftSnapshot, registerSnapshot, storeSnapshot] = await Promise.all([
      transaction.get(shiftRef),
      transaction.get(registerRef),
      transaction.get(storeRef),
    ]);
    if (!shiftSnapshot.exists() || shiftSnapshot.data().status !== 'open') {
      throw new Error('El turno ya fue cerrado o no existe.');
    }
    if (!registerSnapshot.exists()
      || registerSnapshot.data().status !== 'open'
      || registerSnapshot.data().shiftId !== shiftId) {
      throw new Error('El turno ya no es el turno activo de esta caja.');
    }
    const shift = shiftSnapshot.data();
    if (shift.cashierId !== cashierId || shift.storeId !== storeId) {
      throw new Error('Solo quien abrió este turno puede cerrarlo.');
    }
    const openCashShiftCount = storeSnapshot.exists()
      ? storeSnapshot.data().openCashShiftCount ?? 0
      : 0;
    if (!storeSnapshot.exists() || !Number.isSafeInteger(openCashShiftCount)
      || openCashShiftCount < 1) {
      throw new Error('El contador de turnos abiertos de la tienda no es válido; solicita apoyo al administrador.');
    }

    const paymentTotalsCents = shift.paymentTotalsCents;
    if (!paymentTotalsCents || PAYMENT_METHODS.some((method) => (
      !Number.isSafeInteger(paymentTotalsCents[method]) || paymentTotalsCents[method] < 0
    )) || !Number.isSafeInteger(shift.saleCount) || shift.saleCount < 0) {
      throw new Error('El resumen de pagos del turno es inválido; no se puede cerrar.');
    }

    const countedCashCents = Math.round(countedCash * 100);
    const expectedCashCents = shift.openingCashCents + paymentTotalsCents.cash;
    const cashDifferenceCents = countedCashCents - expectedCashCents;
    const closedAt = serverTimestamp();
    const closedShift = {
      ...shift,
      status: 'closed',
      closedBy: closer,
      closedAt,
      countedCashCents,
      expectedCashCents,
      cashDifferenceCents,
      paymentTotalsCents,
      saleCount: shift.saleCount,
    };

    transaction.update(shiftRef, {
      status: 'closed',
      closedBy: closer,
      closedAt,
      countedCashCents,
      expectedCashCents,
      cashDifferenceCents,
      saleCount: shift.saleCount,
    });
    transaction.update(registerRef, { status: 'closed', updatedAt: closedAt });
    transaction.update(storeRef, { openCashShiftCount: openCashShiftCount - 1 });

    return {
      ...closedShift,
      id: shiftId,
      paymentTotalsCents,
      timestamp: new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }),
      timestampMs: Date.now(),
    };
  });
}
