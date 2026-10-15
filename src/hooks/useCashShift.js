import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, firebaseConfigError } from '../firebase';

export function useCashShift(storeId, cashierId, enabled = true) {
  const resourceKey = enabled && storeId && cashierId
    ? JSON.stringify([storeId, cashierId])
    : null;
  const [snapshotState, setSnapshotState] = useState({
    resourceKey: null,
    shift: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!db || !resourceKey) return undefined;
    const registerRef = doc(db, 'cashRegisters', cashierId);
    let unsubscribeShift = null;
    let listeningShiftId = null;

    const unsubscribeRegister = onSnapshot(
      registerRef,
      (registerSnapshot) => {
        if (!registerSnapshot.exists()) {
          unsubscribeShift?.();
          unsubscribeShift = null;
          listeningShiftId = null;
          setSnapshotState({ resourceKey, shift: null, loading: false, error: null });
          return;
        }
        const { shiftId } = registerSnapshot.data();
        if (typeof shiftId !== 'string' || !shiftId) {
          unsubscribeShift?.();
          unsubscribeShift = null;
          listeningShiftId = null;
          setSnapshotState({
            resourceKey,
            shift: null,
            loading: false,
            error: 'El registro de caja no contiene un turno válido.',
          });
          return;
        }
        if (shiftId === listeningShiftId) return;

        unsubscribeShift?.();
        listeningShiftId = shiftId;
        setSnapshotState({ resourceKey, shift: null, loading: true, error: null });
        const shiftRef = doc(db, 'cashShifts', shiftId);
        unsubscribeShift = onSnapshot(
          shiftRef,
          (shiftSnapshot) => {
            if (!shiftSnapshot.exists()) {
              setSnapshotState({
                resourceKey,
                shift: null,
                loading: false,
                error: 'No se encontró el turno vinculado a esta caja.',
              });
              return;
            }
            setSnapshotState({
              resourceKey,
              shift: { ...shiftSnapshot.data(), id: shiftSnapshot.id },
              loading: false,
              error: null,
            });
          },
          (snapshotError) => {
            setSnapshotState({
              resourceKey,
              shift: null,
              loading: false,
              error: `No se pudo cargar el turno: ${snapshotError.message}`,
            });
          },
        );
      },
      (snapshotError) => {
        setSnapshotState({
          resourceKey,
          shift: null,
          loading: false,
          error: `No se pudo cargar la caja: ${snapshotError.message}`,
        });
      },
    );
    return () => {
      unsubscribeRegister();
      unsubscribeShift?.();
    };
  }, [cashierId, resourceKey]);

  const isCurrentSnapshot = snapshotState.resourceKey === resourceKey;
  return {
    shift: isCurrentSnapshot ? snapshotState.shift : null,
    loading: !db
      ? false
      : resourceKey
        ? !isCurrentSnapshot || snapshotState.loading
        : false,
    error: !db ? firebaseConfigError : isCurrentSnapshot ? snapshotState.error : null,
  };
}
