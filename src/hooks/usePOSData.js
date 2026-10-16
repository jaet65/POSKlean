import { useEffect, useMemo, useState } from 'react';
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
  const [catalog, setCatalog] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [movements, setMovements] = useState([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [productsReady, setProductsReady] = useState(false);
  const [salesReady, setSalesReady] = useState(false);
  const [movementsReady, setMovementsReady] = useState(false);
  const [errors, setErrors] = useState({
    catalog: null, products: null, sales: null, movements: null,
  });

  useEffect(() => {
    if (!db || !enabled) {
      return undefined;
    }

    // Con tienda definida se consulta solo esa tienda (las reglas lo exigen a los cajeros).
    const scopedCollection = (name) => (storeId
      ? query(collection(db, name), where('storeId', '==', storeId))
      : collection(db, name));

    const unsubscribeCatalog = onSnapshot(
      collection(db, 'catalogProducts'),
      (snapshot) => {
        setCatalog(snapshot.docs.map((catalogDoc) => ({ ...catalogDoc.data(), id: catalogDoc.id })));
        setCatalogReady(true);
        setErrors((previous) => ({ ...previous, catalog: null }));
      },
      (error) => {
        setCatalogReady(true);
        setErrors((previous) => ({ ...previous, catalog: `No se pudo cargar el catálogo: ${error.message}` }));
      },
    );

    const unsubscribeProducts = onSnapshot(
      scopedCollection('stockItems'),
      (snapshot) => {
        try {
          const nextStock = snapshot.docs
            .filter((stockDoc) => !storeId || stockDoc.data().storeId === storeId)
            .map((stockDoc) => {
              const data = stockDoc.data();
              if (typeof data.catalogId !== 'string' || typeof data.storeId !== 'string'
                || !Number.isFinite(data.currentStock) || !Number.isFinite(data.minStock)
                || !Number.isFinite(data.cost)) {
                throw new Error(`Las existencias ${stockDoc.id} deben tener stock, mínimo y costo numéricos.`);
              }
              return { ...data, id: stockDoc.id };
            });
          setStockItems(nextStock);
          setProductsReady(true);
          setErrors((previous) => ({ ...previous, products: null }));
        } catch (error) {
          setProductsReady(true);
          setErrors((previous) => ({ ...previous, products: error.message }));
        }
      },
      (error) => {
        setProductsReady(true);
        setErrors((previous) => ({ ...previous, products: `No se pudieron cargar las existencias: ${error.message}` }));
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
      unsubscribeCatalog();
      unsubscribeProducts();
      unsubscribeSales();
      unsubscribeMovements();
    };
  }, [enabled, storeId]);

  // Producto visible = ficha del catálogo + existencias de la tienda.
  // El id es el de las existencias (único por tienda); catalogId apunta al catálogo.
  const mergedProducts = useMemo(() => {
    const catalogById = new Map(catalog.map((item) => [item.id, item]));
    return stockItems.flatMap((stock) => {
      const item = catalogById.get(stock.catalogId);
      if (!item || item.status === 'archived' || !Number.isFinite(item.price)) return [];
      const override = Number.isFinite(stock.priceOverride) ? stock.priceOverride : null;
      return [{
        ...stock,
        name: item.name,
        category: item.category,
        description: item.description || '',
        unit: item.unit || 'L',
        color: item.color || 'bg-cyan-500',
        globalPrice: item.price,
        price: override ?? item.price,
        hasPriceOverride: override !== null,
      }];
    });
  }, [catalog, stockItems]);

  const visibleProducts = enabled
    ? (storeId ? mergedProducts.filter((product) => product.storeId === storeId) : mergedProducts)
    : [];
  const visibleSales = enabled
    ? (storeId ? sales.filter((sale) => sale.storeId === storeId) : sales)
    : [];
  const visibleMovements = enabled
    ? (storeId ? movements.filter((movement) => movement.storeId === storeId) : movements)
    : [];

  return {
    products: visibleProducts,
    catalog: enabled ? catalog : [],
    sales: visibleSales,
    movements: visibleMovements,
    loading: Boolean(db) && (!catalogReady || !productsReady || !salesReady || !movementsReady),
    error: !db
      ? firebaseConfigError
      : [errors.catalog, errors.products, errors.sales, errors.movements].filter(Boolean).join(' '),
  };
}
