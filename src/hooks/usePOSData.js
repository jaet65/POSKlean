import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
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

export function usePOSData() {
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [productsReady, setProductsReady] = useState(false);
  const [salesReady, setSalesReady] = useState(false);
  const [errors, setErrors] = useState({ products: null, sales: null });

  useEffect(() => {
    if (!db) return undefined;

    const unsubscribeProducts = onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        try {
          const nextProducts = snapshot.docs.map((productDoc) => {
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
      collection(db, 'sales'),
      (snapshot) => {
        try {
          const nextSales = snapshot.docs
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

    return () => {
      unsubscribeProducts();
      unsubscribeSales();
    };
  }, []);

  return {
    products,
    sales,
    loading: Boolean(db) && (!productsReady || !salesReady),
    error: !db
      ? firebaseConfigError
      : [errors.products, errors.sales].filter(Boolean).join(' '),
  };
}
