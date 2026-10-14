import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, firebaseConfigError } from '../firebase';

const formatTimestamp = (timestamp) => {
  const date = timestamp?.toDate
    ? timestamp.toDate()
    : timestamp
      ? new Date(timestamp)
      : null;

  if (!date || Number.isNaN(date.getTime())) {
    return { timestamp: 'Fecha no disponible', timestampMs: 0 };
  }

  return {
    timestamp: date.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }),
    timestampMs: date.getTime(),
  };
};

export function usePOSData(storeId, enabled = true) {
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [movements, setMovements] = useState([]);
  const [productsReady, setProductsReady] = useState(false);
  const [salesReady, setSalesReady] = useState(false);
  const [movementsReady, setMovementsReady] = useState(false);
  const [errors, setErrors] = useState({ products: null, sales: null, movements: null });

  useEffect(() => {
    if (!db || !enabled) {
      return undefined;
    }

    // Con tienda definida se consulta solo esa tienda (las reglas lo exigen a los cajeros).
    const scopedCollection = (name) => (storeId
      ? query(collection(db, name), where('storeId', '==', storeId))
      : collection(db, name));

    const unsubscribeProducts = onSnapshot(
      scopedCollection('products'),
      (snapshot) => {
        try {
          const nextProducts = snapshot.docs.filter((productDoc) => !storeId || productDoc.data().storeId === storeId).map((productDoc) => {
            const data = productDoc.data();
            if (typeof data.name !== 'string' || typeof data.category !== 'string'
              || !Number.isFinite(data.currentStock) || !Number.isFinite(data.minStock)
              || !Number.isFinite(data.price) || !Number.isFinite(data.cost)) {
              throw new Error(`El producto ${productDoc.id} debe tener stock, mínimo, precio y costo numéricos.`);
            }
            return { ...data, id: productDoc.id };
          });
          setProducts(nextProducts);
          setProductsReady(true);
          setErrors((previous) => ({ ...previous, products: null }));
        } catch (error) {
          setProductsReady(true);
          setErrors((previous) => ({ ...previous, products: error.message }));
        }
      },
      (error) => {
        setProductsReady(true);
        setErrors((previous) => ({ ...previous, products: `No se pudieron cargar los productos: ${error.message}` }));
      },
    );

    const unsubscribeSales = onSnapshot(
      scopedCollection('sales'),
      (snapshot) => {
        try {
          const nextSales = snapshot.docs
            .filter((saleDoc) => !storeId || saleDoc.data().storeId === storeId)
            .map((saleDoc) => {
              const data = saleDoc.data();
              if (!Number.isFinite(data.total) || !Number.isFinite(data.liters) || !Array.isArray(data.items)) {
                throw new Error(`La venta ${saleDoc.id} tiene datos incompletos o inválidos.`);
              }
              return {
                ...data,
                id: saleDoc.id,
                ticketId: data.ticketId || data.id || `VTA-${saleDoc.id.slice(0, 8).toUpperCase()}`,
                ...formatTimestamp(data.timestamp),
              };
            })
            .sort((a, b) => b.timestampMs - a.timestampMs);
          setSales(nextSales);
          setSalesReady(true);
          setErrors((previous) => ({ ...previous, sales: null }));
        } catch (error) {
          setSalesReady(true);
          setErrors((previous) => ({ ...previous, sales: error.message }));
        }
      },
      (error) => {
        setSalesReady(true);
        setErrors((previous) => ({ ...previous, sales: `No se pudieron cargar las ventas: ${error.message}` }));
      },
    );

    const unsubscribeMovements = onSnapshot(
      scopedCollection('inventoryMovements'),
      (snapshot) => {
        try {
          const nextMovements = snapshot.docs
            .filter((movDoc) => !storeId || movDoc.data().storeId === storeId)
            .map((movDoc) => {
              const data = movDoc.data();
              return {
                ...data,
                id: movDoc.id,
                ...formatTimestamp(data.timestamp),
              };
            })
            .sort((a, b) => b.timestampMs - a.timestampMs);
          setMovements(nextMovements);
          setMovementsReady(true);
          setErrors((previous) => ({ ...previous, movements: null }));
        } catch (error) {
          setMovementsReady(true);
          setErrors((previous) => ({ ...previous, movements: error.message }));
        }
      },
      (error) => {
        setMovementsReady(true);
        setErrors((previous) => ({ ...previous, movements: `No se pudieron cargar los movimientos: ${error.message}` }));
      },
    );

    return () => {
      unsubscribeProducts();
      unsubscribeSales();
      unsubscribeMovements();
    };
  }, [enabled, storeId]);

  const visibleProducts = enabled
    ? (storeId ? products.filter((product) => product.storeId === storeId) : products)
    : [];
  const visibleSales = enabled
    ? (storeId ? sales.filter((sale) => sale.storeId === storeId) : sales)
    : [];
  const visibleMovements = enabled
    ? (storeId ? movements.filter((movement) => movement.storeId === storeId) : movements)
    : [];

  return {
    products: visibleProducts,
    sales: visibleSales,
    movements: visibleMovements,
    loading: Boolean(db) && (!productsReady || !salesReady || !movementsReady),
    error: !db
      ? firebaseConfigError
      : [errors.products, errors.sales, errors.movements].filter(Boolean).join(' '),
  };
}
