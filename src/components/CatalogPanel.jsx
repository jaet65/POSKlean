import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ChevronDown, ChevronRight, Layers, Pencil, Plus, RotateCcw, Upload, X } from 'lucide-react';
import { formatCurrency } from '../utils/currency';
import { CSV_TEMPLATE, parseCatalogCsv } from '../utils/catalogCsv';
import {
  createCatalogProduct,
  enableCatalogProductInStore,
  importCatalogProducts,
  setCatalogProductStatus,
  setStorePriceOverride,
  updateCatalogProduct,
} from '../services/catalogService';
import { suggestedSalePrice } from '../services/purchaseService';
import { subscribeToSuppliers } from '../services/supplierService';

const UNIT_OPTIONS = [
  ['L', 'L (Litro)'],
  ['Pza', 'Pza (Pieza)'],
  ['Kg', 'Kg (Kilogramo)'],
  ['Galón', 'Galón (3.785 L)'],
  ['Porrón', 'Porrón (20 L)'],
  ['Cubeta', 'Cubeta (19 L)'],
];
const PRODUCT_COLORS = [
  { name: 'Cian', class: 'bg-cyan-500' },
  { name: 'Azul', class: 'bg-blue-500' },
  { name: 'Esmeralda', class: 'bg-emerald-500' },
  { name: 'Ámbar', class: 'bg-amber-500' },
  { name: 'Púrpura', class: 'bg-purple-500' },
  { name: 'Rosa', class: 'bg-rose-500' },
  { name: 'Índigo', class: 'bg-indigo-500' },
  { name: 'Lima', class: 'bg-lime-500' },
  { name: 'Naranja', class: 'bg-orange-500' },
  { name: 'Rojo', class: 'bg-red-500' },
];
const CUSTOM_CATEGORY = '__custom__';
const DEFAULT_CATEGORIES = ['Jabón', 'Suavizante'];
const EMPTY_FORM = {
  name: '',
  category: '',
  customCategory: '',
  unit: 'L',
  color: 'bg-cyan-500',
  price: '',
  priceAuto: true,
  storeId: '',
  stock: '0',
  minStock: '10',
  supplierId: '',
  cost: '',
};
const inputClass = 'w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none';
const labelClass = 'mb-1 block text-xs font-medium text-slate-300';

export default function CatalogPanel({ currentUser, catalog, products, stores, activeStoreId }) {
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm] = useState(null);
  const [storeForm, setStoreForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [csvPreview, setCsvPreview] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  useEffect(() => subscribeToSuppliers(setSuppliers, () => setSuppliers([])), []);
  const activeSuppliers = useMemo(
    () => suppliers.filter((supplier) => supplier.status !== 'archived'),
    [suppliers],
  );
  const supplierNameById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])),
    [suppliers],
  );
  const csvInputRef = useRef(null);

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([`\uFEFF${CSV_TEMPLATE}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-catalogo.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setNotice('');
    if (file.size > 1024 * 1024) {
      setError('El archivo CSV es demasiado grande (máximo 1 MB).');
      return;
    }
    setCsvPreview(parseCatalogCsv(await file.text(), suppliers));
  };

  const confirmCsvImport = async () => {
    if (!csvPreview || busy) return;
    setBusy(true);
    try {
      const { created, skipped } = await importCatalogProducts(csvPreview.rows, currentUser);
      setCsvPreview(null);
      setNotice(`Importación completada: ${created} creado(s)${skipped ? `, ${skipped} omitido(s) por ya existir` : ''}.`);
    } catch (importError) {
      setCsvPreview(null);
      setError(importError.message || 'No se pudo importar el catálogo.');
    } finally {
      setBusy(false);
    }
  };

  const visibleStores = useMemo(
    () => (activeStoreId ? stores.filter((store) => store.id === activeStoreId) : stores),
    [stores, activeStoreId],
  );
  const stockByKey = useMemo(() => {
    const map = new Map();
    products.forEach((product) => map.set(`${product.storeId}|${product.catalogId}`, product));
    return map;
  }, [products]);
  const categories = useMemo(
    () => [...new Set([...DEFAULT_CATEGORIES, ...catalog.map((item) => item.category).filter(Boolean)])]
      .sort((a, b) => a.localeCompare(b, 'es')),
    [catalog],
  );
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es-MX');
    return catalog
      .filter((item) => (showArchived ? true : item.status !== 'archived'))
      .filter((item) => !term || `${item.name} ${item.category}`.toLocaleLowerCase('es-MX').includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [catalog, search, showArchived]);

  const run = async (action, successMessage) => {
    setBusy(true);
    setError('');
    try {
      await action();
      if (successMessage) {
        setNotice(successMessage);
        setTimeout(() => setNotice(''), 4000);
      }
      return true;
    } catch (caught) {
      setError(caught.message || 'No se pudo completar la operación.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openProductForm = (item = null) => {
    setError('');
    setForm(item
      ? {
        id: item.id,
        name: item.name,
        category: categories.includes(item.category) ? item.category : CUSTOM_CATEGORY,
        customCategory: categories.includes(item.category) ? '' : item.category,
        unit: item.unit || 'L',
        color: item.color || 'bg-cyan-500',
        price: String(item.price),
        minStock: String(item.minStock ?? 0),
        supplierId: item.supplierId || '',
      }
      : {
        ...EMPTY_FORM,
        category: categories[0] || CUSTOM_CATEGORY,
        storeId: activeStoreId || '',
      });
  };

  const handleCostChange = (value) => {
    setForm((previous) => {
      const cost = parseFloat(value);
      const autoFill = previous.priceAuto && cost > 0;
      return {
        ...previous,
        cost: value,
        price: autoFill ? suggestedSalePrice(cost).toFixed(2) : previous.price,
      };
    });
  };

  const submitProduct = async (event) => {
    event.preventDefault();
    const category = (form.category === CUSTOM_CATEGORY ? form.customCategory : form.category).trim();
    const price = parseFloat(form.price);
    const fields = {
      name: form.name,
      category,
      unit: form.unit,
      color: form.color,
      price,
      minStock: parseFloat(form.minStock || '0'),
      supplierId: form.supplierId || null,
    };
    const ok = await run(async () => {
      if (form.id) {
        await updateCatalogProduct(form.id, fields, currentUser, catalog);
        return;
      }
      const catalogId = await createCatalogProduct(fields, currentUser);
      if (form.storeId) {
        await enableCatalogProductInStore({
          catalogProduct: { id: catalogId, name: fields.name.trim(), unit: fields.unit, status: 'active' },
          storeId: form.storeId,
          currentStock: parseFloat(form.stock || '0'),
          minStock: parseFloat(form.minStock || '0'),
          cost: parseFloat(form.cost || '0'),
          user: currentUser,
        });
      }
    }, form.id ? 'Producto actualizado en el catálogo.' : 'Producto agregado al catálogo.');
    if (ok) setForm(null);
  };

  const submitStoreForm = async (event) => {
    event.preventDefault();
    const item = catalog.find((candidate) => candidate.id === storeForm.catalogId);
    const price = storeForm.price === '' ? null : parseFloat(storeForm.price);
    const ok = await run(
      () => (storeForm.mode === 'enable'
        ? enableCatalogProductInStore({
          catalogProduct: item,
          storeId: storeForm.storeId,
          currentStock: parseFloat(storeForm.stock || '0'),
          minStock: parseFloat(storeForm.minStock || '0'),
          cost: parseFloat(storeForm.cost || '0'),
          priceOverride: price,
          user: currentUser,
        })
        : setStorePriceOverride(storeForm.stockId, price, currentUser)),
      storeForm.mode === 'enable' ? 'Producto habilitado en la tienda.' : 'Precio de la tienda actualizado.',
    );
    if (ok) setStoreForm(null);
  };

  const toggleArchive = (item) => run(
    () => setCatalogProductStatus(item.id, item.status === 'archived' ? 'active' : 'archived', currentUser),
    item.status === 'archived' ? 'Producto restaurado.' : 'Producto archivado.',
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <Layers className="h-4 w-4 text-cyan-400" /> Catálogo central
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Un solo producto para todas las tiendas. Las existencias, el mínimo, el costo y, si hace falta, el precio propio se manejan por sucursal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="rounded-xl bg-slate-700 px-3 py-2 text-xs font-bold text-slate-100 hover:bg-slate-600"
          >
            Plantilla CSV
          </button>
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-xl bg-slate-700 px-3 py-2 text-xs font-bold text-slate-100 hover:bg-slate-600"
          >
            <Upload className="h-4 w-4" /> Importar CSV
          </button>
          <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="hidden" aria-label="Archivo CSV del catálogo" />
          <button
            type="button"
            onClick={() => openProductForm()}
            className="flex items-center gap-1.5 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"
          >
            <Plus className="h-4 w-4" /> Nuevo producto
          </button>
        </div>
      </div>

      {notice && <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/20 p-3 text-xs text-emerald-300">{notice}</p>}
      {error && !form && !storeForm && (
        <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/20 p-3 text-xs text-rose-200">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar producto o categoría"
          aria-label="Buscar en el catálogo"
          className={`${inputClass} max-w-xs`}
        />
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
          Mostrar archivados
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-800/60">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="border-b border-slate-700 bg-slate-900/80 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Precio compra</th>
              <th className="px-4 py-3">Precio venta</th>
              <th className="px-4 py-3">Tiendas</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60">
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No hay productos en el catálogo.</td></tr>
            )}
            {rows.flatMap((item) => {
              const enabledCount = visibleStores.filter((store) => stockByKey.has(`${store.id}|${item.id}`)).length;
              const expanded = expandedId === item.id;
              const archived = item.status === 'archived';
              const costs = visibleStores
                .map((store) => stockByKey.get(`${store.id}|${item.id}`)?.cost)
                .filter((cost) => Number.isFinite(cost));
              const minCost = Math.min(...costs);
              const maxCost = Math.max(...costs);
              const costLabel = costs.length === 0
                ? '—'
                : `${minCost === maxCost
                  ? formatCurrency(minCost)
                  : `${formatCurrency(minCost)} – ${formatCurrency(maxCost)}`} / ${item.unit}`;
              const prices = visibleStores
                .map((store) => stockByKey.get(`${store.id}|${item.id}`)?.price)
                .filter((price) => Number.isFinite(price));
              const minPrice = prices.length ? Math.min(...prices) : item.price;
              const maxPrice = prices.length ? Math.max(...prices) : item.price;
              const priceLabel = `${minPrice === maxPrice
                ? formatCurrency(minPrice)
                : `${formatCurrency(minPrice)} – ${formatCurrency(maxPrice)}`} / ${item.unit}`;
              const result = [
                <tr key={item.id} className={archived ? 'opacity-60' : ''}>
                  <td className="px-4 py-3 font-semibold text-slate-100">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : item.id)}
                      aria-expanded={expanded}
                      className="flex items-center gap-1.5 text-left"
                    >
                      {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {item.name}
                      {archived && <span className="rounded bg-slate-600/40 px-1.5 text-[10px] text-slate-300">Archivado</span>}
                    </button>
                  </td>
                  <td className="px-4 py-3">{item.category}</td>
                  <td className="px-4 py-3">
                    {item.supplierId
                      ? supplierNameById.get(item.supplierId) || 'Proveedor archivado'
                      : <span className="text-amber-300">Sin proveedor</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-amber-300">{costLabel}</td>
                  <td className="px-4 py-3 font-mono font-bold text-cyan-400">{priceLabel}</td>
                  <td className="px-4 py-3">{enabledCount} de {visibleStores.length}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => openProductForm(item)} aria-label={`Editar ${item.name}`} className="mr-2 text-slate-300 hover:text-white">
                      <Pencil className="inline h-4 w-4" />
                    </button>
                    <button type="button" disabled={busy} onClick={() => toggleArchive(item)} aria-label={`${archived ? 'Restaurar' : 'Archivar'} ${item.name}`} className="text-slate-300 hover:text-white disabled:opacity-50">
                      {archived ? <RotateCcw className="inline h-4 w-4" /> : <Archive className="inline h-4 w-4" />}
                    </button>
                  </td>
                </tr>,
              ];
              if (expanded) {
                result.push(
                  <tr key={`${item.id}-stores`} className="bg-slate-900/50">
                    <td colSpan={7} className="space-y-2 px-4 py-3">
                      {visibleStores.length === 0 && <p className="text-slate-400">No hay tiendas activas.</p>}
                      {visibleStores.map((store) => {
                        const stock = stockByKey.get(`${store.id}|${item.id}`);
                        return (
                          <div key={store.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700 px-3 py-2">
                            <span className="font-semibold text-slate-200">{store.name}</span>
                            {stock ? (
                              <span className="flex flex-wrap items-center gap-3">
                                <span>Stock {stock.currentStock} {item.unit} · mín. {stock.minStock} · costo {formatCurrency(stock.cost)}</span>
                                <span className="font-mono font-bold text-cyan-400">
                                  {formatCurrency(stock.price)}
                                  {stock.hasPriceOverride && <span className="ml-1 rounded bg-amber-500/20 px-1.5 text-[10px] text-amber-300">precio propio</span>}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setError('');
                                    setStoreForm({
                                      mode: 'price',
                                      catalogId: item.id,
                                      storeId: store.id,
                                      stockId: stock.id,
                                      price: stock.hasPriceOverride ? String(stock.price) : '',
                                      name: item.name,
                                      storeName: store.name,
                                    });
                                  }}
                                  className="text-cyan-300 hover:text-cyan-200"
                                >
                                  Precio de la tienda
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={archived}
                                onClick={() => {
                                  setError('');
                                  setStoreForm({
                                    mode: 'enable',
                                    catalogId: item.id,
                                    storeId: store.id,
                                    stock: '0',
                                    minStock: String(item.minStock ?? 0),
                                    cost: '',
                                    price: '',
                                    name: item.name,
                                    storeName: store.name,
                                  });
                                }}
                                className="rounded-lg bg-cyan-500/20 px-3 py-1 font-semibold text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40"
                              >
                                Habilitar en esta tienda
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </td>
                  </tr>,
                );
              }
              return result;
            })}
          </tbody>
        </table>
      </div>

      {csvPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4">
          <div role="dialog" aria-modal="true" aria-label="Importar catálogo" className="w-full max-w-lg space-y-3 rounded-2xl border border-slate-700 bg-slate-800 p-5">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h2 className="text-base font-bold text-white">Importar catálogo desde CSV</h2>
              <button type="button" onClick={() => setCsvPreview(null)} aria-label="Cerrar" className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-slate-300">
              <strong>{csvPreview.rows.length}</strong> producto(s) listos para importar
              {csvPreview.errors.length > 0 && <>, <strong className="text-rose-300">{csvPreview.errors.length}</strong> fila(s) con errores (se omiten)</>}.
              Los nombres que ya existen en el catálogo se omiten.
            </p>
            {csvPreview.errors.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                {csvPreview.errors.map((item) => <li key={`${item.line}-${item.message}`}>Fila {item.line}: {item.message}</li>)}
              </ul>
            )}
            {csvPreview.rows.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300">
                {csvPreview.rows.map((row) => (
                  <li key={row.line}>{row.name} · {row.category} · {row.unit} · compra {formatCurrency(row.cost)} → venta {formatCurrency(row.price)} · mín. {row.minStock} · {row.supplierName || 'sin proveedor'}</li>
                ))}
              </ul>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCsvPreview(null)} className="rounded-lg bg-slate-700 px-4 py-2 text-xs font-bold text-slate-100">Cancelar</button>
              <button type="button" disabled={busy || csvPreview.rows.length === 0} onClick={confirmCsvImport} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{busy ? 'Importando…' : 'Importar'}</button>
            </div>
          </div>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4">
          <form onSubmit={submitProduct} role="dialog" aria-modal="true" aria-label="Producto del catálogo" className="w-full max-w-md space-y-3 rounded-2xl border border-slate-700 bg-slate-800 p-5">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h2 className="text-base font-bold text-white">{form.id ? 'Editar producto' : 'Nuevo producto del catálogo'}</h2>
              <button type="button" onClick={() => setForm(null)} aria-label="Cerrar" className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div>
              <label htmlFor="cat-name" className={labelClass}>Nombre del producto: <span className="text-cyan-400">*</span></label>
              <input id="cat-name" required maxLength={120} placeholder="Ej. Jabón líquido de manos" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cat-category" className={labelClass}>Categoría: <span className="text-cyan-400">*</span></label>
                <select id="cat-category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass}>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                  <option value={CUSTOM_CATEGORY}>+ Otra categoría...</option>
                </select>
                {form.category === CUSTOM_CATEGORY && (
                  <input aria-label="Nueva categoría" required maxLength={60} placeholder="Nueva categoría" value={form.customCategory} onChange={(event) => setForm({ ...form, customCategory: event.target.value })} className={`${inputClass} mt-2`} />
                )}
              </div>
              <div>
                <label htmlFor="cat-unit" className={labelClass}>Unidad de medida:</label>
                <select id="cat-unit" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} className={inputClass}>
                  {UNIT_OPTIONS.some(([value]) => value === form.unit) ? null : <option value={form.unit}>{form.unit}</option>}
                  {UNIT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="cat-supplier" className={labelClass}>Proveedor:</label>
              <select id="cat-supplier" value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })} className={inputClass}>
                <option value="">Sin proveedor</option>
                {form.supplierId && !activeSuppliers.some((supplier) => supplier.id === form.supplierId) && (
                  <option value={form.supplierId}>{supplierNameById.get(form.supplierId) || 'Proveedor archivado'}</option>
                )}
                {activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
              <p className="mt-1 text-[10px] text-slate-500">Las órdenes de compra toman el proveedor de los productos que elijas.</p>
            </div>
            {!form.id && (
              <div>
                <label htmlFor="cat-cost" className={labelClass}>Precio de compra por {form.unit} ($ MXN): <span className="text-cyan-400">*</span></label>
                <input id="cat-cost" required type="number" min="0.01" step="0.01" placeholder="0.00" value={form.cost} onChange={(event) => handleCostChange(event.target.value)} className={`${inputClass} font-mono`} />
              </div>
            )}
            <div>
              <label htmlFor="cat-min" className={labelClass}>Stock mínimo / alerta ({form.unit}): <span className="text-cyan-400">*</span></label>
              <input id="cat-min" required type="number" min="0" step="0.01" value={form.minStock} onChange={(event) => setForm({ ...form, minStock: event.target.value })} className={`${inputClass} font-mono text-amber-300`} />
              <p className="mt-1 text-[10px] text-slate-500">Se avisa cuando el stock llegue a este valor. Es el mínimo sugerido al habilitar el producto en cada tienda.</p>
            </div>
            {!form.id && (
              <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/40 p-3">
                <div>
                  <label htmlFor="cat-store" className={labelClass}>Habilitar en tienda (opcional):</label>
                  <select id="cat-store" value={form.storeId} onChange={(event) => setForm({ ...form, storeId: event.target.value })} className={inputClass}>
                    <option value="">Solo catálogo (sin existencias)</option>
                    {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                  </select>
                </div>
                {form.storeId && (
                  <div>
                    <label htmlFor="cat-stock" className={labelClass}>Stock inicial ({form.unit}): <span className="text-cyan-400">*</span></label>
                    <input id="cat-stock" required type="number" min="0" step="0.01" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} className={`${inputClass} font-mono`} />
                  </div>
                )}
              </div>
            )}
            {form.id ? (
              <div>
                <label htmlFor="cat-price" className={labelClass}>Precio de venta global por {form.unit} ($ MXN): <span className="text-cyan-400">*</span></label>
                <input id="cat-price" required type="number" min="0.01" step="0.01" placeholder="0.00" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value, priceAuto: false })} className={`${inputClass} font-mono`} />
                <p className="mt-1 text-[11px] text-slate-500">Cada tienda puede tener su propio precio desde la fila del producto.</p>
              </div>
            ) : (
              <p className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300">
                Precio de venta sugerido (50% de margen): <span className="font-mono font-bold text-cyan-400">{parseFloat(form.cost) > 0 ? `${formatCurrency(parseFloat(form.price))} / ${form.unit}` : '—'}</span>
                <span className="mt-1 block text-[11px] text-slate-500">Podrás ajustarlo después editando el producto o con un precio propio por tienda.</span>
              </p>
            )}
            {!form.id && form.storeId && parseFloat(form.price) > 0 && parseFloat(form.cost) >= 0 && (() => {
              const cost = parseFloat(form.cost) || 0;
              const price = parseFloat(form.price);
              const profit = price - cost;
              const margin = (profit / price) * 100;
              return (
                <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-xs">
                  <span className="text-slate-400">Ganancia neta por {form.unit}:</span>
                  <span className={`font-mono font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatCurrency(profit)} ({margin.toFixed(0)}%)
                  </span>
                </div>
              );
            })()}
            <div>
              <span className={labelClass}>Color identificador:</span>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_COLORS.map((color) => (
                  <button
                    key={color.class}
                    type="button"
                    title={color.name}
                    aria-label={color.name}
                    onClick={() => setForm({ ...form, color: color.class })}
                    className={`h-7 w-7 rounded-full ${color.class} ${form.color === color.class ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800' : 'opacity-70'}`}
                  />
                ))}
              </div>
            </div>

            {error && <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/20 p-2 text-xs text-rose-200">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="rounded-lg bg-slate-700 px-4 py-2 text-xs font-bold text-slate-100">Cancelar</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      )}

      {storeForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4">
          <form onSubmit={submitStoreForm} role="dialog" aria-modal="true" aria-label="Producto en tienda" className="w-full max-w-md space-y-3 rounded-2xl border border-slate-700 bg-slate-800 p-5">
            <div className="flex items-start justify-between border-b border-slate-700 pb-3">
              <div>
                <h2 className="text-base font-bold text-white">{storeForm.mode === 'enable' ? 'Habilitar en tienda' : 'Precio de la tienda'}</h2>
                <p className="mt-1 text-xs text-slate-400">{storeForm.name} · {storeForm.storeName}</p>
              </div>
              <button type="button" onClick={() => setStoreForm(null)} aria-label="Cerrar" className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            {storeForm.mode === 'enable' && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="sf-stock" className={labelClass}>Stock inicial</label>
                  <input id="sf-stock" type="number" min="0" step="0.01" value={storeForm.stock} onChange={(event) => setStoreForm({ ...storeForm, stock: event.target.value })} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="sf-min" className={labelClass}>Mínimo</label>
                  <input id="sf-min" type="number" min="0" step="0.01" value={storeForm.minStock} onChange={(event) => setStoreForm({ ...storeForm, minStock: event.target.value })} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="sf-cost" className={labelClass}>Costo ($)</label>
                  <input id="sf-cost" type="number" min="0" step="0.01" value={storeForm.cost} onChange={(event) => setStoreForm({ ...storeForm, cost: event.target.value })} className={inputClass} />
                </div>
              </div>
            )}
            <div>
              <label htmlFor="sf-price" className={labelClass}>Precio propio de esta tienda ($)</label>
              <input id="sf-price" type="number" min="0.01" step="0.01" value={storeForm.price} onChange={(event) => setStoreForm({ ...storeForm, price: event.target.value })} placeholder="Vacío = precio global" className={inputClass} />
              {storeForm.mode === 'enable' && parseFloat(storeForm.cost) > 0 && (
                <p className="mt-1 text-[11px] text-slate-500">Sugerido por costo: {formatCurrency(suggestedSalePrice(parseFloat(storeForm.cost)))}</p>
              )}
            </div>
            {error && <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/20 p-2 text-xs text-rose-200">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setStoreForm(null)} className="rounded-lg bg-slate-700 px-4 py-2 text-xs font-bold text-slate-100">Cancelar</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
