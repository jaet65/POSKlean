import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle,
  ClipboardCheck,
  Edit,
  History,
  Layers,
  Package,
  Store,
  Trash2,
  Truck,
} from 'lucide-react';
import { formatCurrency } from '../utils/currency';

const getPriceLevel = (price, cost) => {
  const sale = Number(price);
  const purchase = Number(cost);
  if (!Number.isFinite(sale) || !Number.isFinite(purchase) || sale <= 0 || purchase <= 0) return null;
  const margin = ((sale - purchase) / sale) * 100;
  const detail = `Margen ${margin.toFixed(0)}% sobre la venta (objetivo 50%)`;
  if (margin < 48) return { label: 'Bajo', title: detail, className: 'bg-rose-500/20 text-rose-300' };
  if (margin <= 52) return { label: 'Ok', title: detail, className: 'bg-emerald-500/20 text-emerald-300' };
  return { label: 'Alto', title: detail, className: 'bg-amber-500/20 text-amber-300' };
};

export default function InventoryTable({
  activeStoreCount,
  deletingProductId,
  editingMinStockProductId,
  editingPriceProductId,
  filterLowStock = false,
  inventoryTableProducts,
  isAdmin,
  isCajero,
  isGeneralView,
  isSavingMinStock,
  isSavingPrice,
  isStoreManager,
  lowStockCount = 0,
  minStockDraft,
  onCancelMinStock,
  onCancelPrice,
  onDeleteProduct,
  onEditMinStock,
  onEditPrice,
  onGoToCatalog,
  onMinStockDraftChange,
  onOpenHistory,
  onOpenInventoryAudit,
  onOpenRestock,
  onOpenTransfer,
  onPriceDraftChange,
  onSaveMinStock,
  onSavePrice,
  onToggleFilterLowStock,
  priceDraft,
  products,
  storeNameById,
}) {
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const categories = useMemo(() => [...new Set(
    products
      .map((product) => (typeof product.category === 'string' ? product.category.trim() : ''))
      .filter(Boolean),
  )], [products]);
  const filteredProducts = useMemo(() => {
    let list = inventoryTableProducts;
    if (filterLowStock) {
      list = list.filter((product) => product.currentStock <= product.minStock);
    }
    if (selectedCategory !== 'Todos') {
      list = list.filter((product) => (
        typeof product.category === 'string' && product.category.trim() === selectedCategory
      ));
    }
    return list;
  }, [inventoryTableProducts, filterLowStock, selectedCategory]);

  useEffect(() => {
    if (selectedCategory !== 'Todos' && !categories.includes(selectedCategory)) {
      setSelectedCategory('Todos');
    }
  }, [categories, selectedCategory]);

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-md">
      <div className="p-4 border-b border-slate-700 flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-cyan-400" />
            Control de Inventario
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Barra: rojo en o bajo mínimo · ámbar próximo · verde suficiente. Marca blanca: mínimo.</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {isStoreManager && activeStoreCount > 1 && (
            <button
              type="button"
              onClick={onOpenTransfer}
              className="bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 font-bold px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[11px] sm:text-xs transition flex items-center gap-1 sm:gap-1.5 cursor-pointer border border-cyan-500/30"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Transferir</span>
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenInventoryAudit}
              className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 font-bold px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[11px] sm:text-xs transition flex items-center gap-1 sm:gap-1.5 cursor-pointer border border-amber-500/30"
            >
              <ClipboardCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Auditoría</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenHistory}
            className="bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[11px] sm:text-xs transition flex items-center gap-1 sm:gap-1.5 cursor-pointer border border-slate-600"
          >
            <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Historial</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1 overflow-x-auto">
          {['Todos', ...categories].map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                selectedCategory === category
                  ? 'bg-slate-700 text-cyan-400 border border-cyan-500/30 font-semibold'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-700/50'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {onToggleFilterLowStock && (
          <button
            type="button"
            onClick={onToggleFilterLowStock}
            className={`flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
              filterLowStock
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm ring-1 ring-amber-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-700/60 hover:border-amber-500/40 hover:text-amber-300'
            }`}
            title={filterLowStock ? 'Mostrar todos los productos' : 'Filtrar solo productos con bajo stock'}
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${filterLowStock ? 'text-amber-400' : 'text-slate-400'}`} />
            <span>Solo bajo stock</span>
            {lowStockCount > 0 && (
              <span className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                filterLowStock ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-amber-400 border border-slate-700'
              }`}>
                {lowStockCount}
              </span>
            )}
          </button>
        )}
      </div>

      {filterLowStock && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Filtrando por <strong>Bajo Stock</strong> (stock actual ≤ mínimo).</span>
          </div>
          {onToggleFilterLowStock && (
            <button
              type="button"
              onClick={onToggleFilterLowStock}
              className="text-amber-200 underline hover:text-white font-semibold cursor-pointer"
            >
              Mostrar todos
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-700">
            <tr>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Stock Actual</th>
              <th className="px-4 py-3">Mínimo (Alerta)</th>
              {!isCajero && <th className="px-4 py-3">Costo / Unidad</th>}
              <th className="px-4 py-3">Precio Venta</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60">
            {products.length === 0 ? (
              <tr>
                <td colSpan={isCajero ? 6 : 7} className="px-4 py-12 text-center text-slate-400">
                  <Package className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="font-semibold text-slate-200 text-sm">No hay productos registrados en el inventario</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    {isStoreManager
                      ? 'Crea los productos en la pestaña Catálogo y habilítalos en esta tienda.'
                      : 'Pide a un administrador o supervisor que habilite productos en esta tienda desde el Catálogo.'}
                  </p>
                  {isStoreManager && (
                    <button
                      type="button"
                      onClick={onGoToCatalog}
                      className="mt-4 inline-flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition shadow-lg shadow-cyan-500/20 cursor-pointer"
                    >
                      <Layers className="w-4 h-4" />
                      <span>Ir al Catálogo</span>
                    </button>
                  )}
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={isCajero ? 6 : 7} className="px-4 py-10 text-center text-slate-400">
                  {filterLowStock ? (
                    <div className="flex flex-col items-center gap-2">
                      <p>No hay productos con bajo stock en {selectedCategory === 'Todos' ? 'el inventario' : `la categoría "${selectedCategory}"`}.</p>
                      {onToggleFilterLowStock && (
                        <button
                          type="button"
                          onClick={onToggleFilterLowStock}
                          className="text-cyan-400 hover:underline font-semibold"
                        >
                          Ver todos los productos
                        </button>
                      )}
                    </div>
                  ) : (
                    'No hay productos en esta categoría.'
                  )}
                </td>
              </tr>
            ) : filteredProducts.map((product, index) => {
              const previousProduct = filteredProducts[index - 1];
              const storeName = storeNameById.get(product.storeId) || 'Sin tienda';
              const startsStoreGroup = isGeneralView
                && (!previousProduct || previousProduct.storeId !== product.storeId);
              const isOutOfStock = Number(product.currentStock) === 0;
              const isLow = product.currentStock <= product.minStock;
              const stockScaleMax = Math.max(product.currentStock, product.minStock, 1);
              const stockFillPercent = Math.min((product.currentStock / stockScaleMax) * 100, 100);
              const stockBarColor = isLow
                ? 'bg-red-400'
                : product.currentStock <= product.minStock * 1.5
                  ? 'bg-amber-400'
                  : 'bg-emerald-400';

              return (
                <Fragment key={product.id}>
                  {startsStoreGroup && (
                    <tr className="bg-cyan-500/10 border-y border-cyan-500/20">
                      <td colSpan={isCajero ? 6 : 7} className="px-4 py-2 text-xs font-bold text-cyan-300">
                        <Store className="inline-block w-4 h-4 mr-1.5 -mt-0.5" />
                        {storeName}
                      </td>
                    </tr>
                  )}
                  <tr className="hover:bg-slate-700/30 transition">
                    <td className="px-4 py-3 font-semibold text-slate-100 flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${product.color}`} />
                      {product.name}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{product.category}</td>
                    <td className="px-4 py-3 font-mono font-bold">
                      <div className="flex flex-col items-start gap-1.5">
                        <span className={`px-2 py-0.5 rounded-md border ${
                          isOutOfStock
                            ? 'bg-red-500/20 text-red-300 border-red-500/40'
                            : isLow
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                              : 'bg-slate-900 text-slate-200 border-slate-700'
                        }`}>
                          {product.currentStock} {product.unit}
                        </span>
                        <div
                          role="meter"
                          aria-label={`Nivel de stock de ${product.name}`}
                          aria-valuemin={0}
                          aria-valuemax={stockScaleMax}
                          aria-valuenow={Math.min(product.currentStock, stockScaleMax)}
                          aria-valuetext={`${product.currentStock} ${product.unit}; mínimo ${product.minStock} ${product.unit}`}
                          title={`Stock: ${product.currentStock} ${product.unit} · Mínimo: ${product.minStock} ${product.unit}`}
                          className="relative h-1.5 w-20 rounded-full bg-slate-700"
                        >
                          <div className={`h-full rounded-full ${stockBarColor}`} style={{ width: `${stockFillPercent}%` }} />
                          {product.minStock > 0 && (
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90"
                              style={{ left: `${(product.minStock / stockScaleMax) * 100}%` }}
                            />
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {isAdmin && editingMinStockProductId === product.id ? (
                        <form onSubmit={(event) => onSaveMinStock(event, product.id)} className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            aria-label={`Mínimo de alerta para ${product.name}`}
                            value={minStockDraft}
                            onChange={(event) => onMinStockDraftChange(event.target.value)}
                            className="w-20 bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-amber-300 focus:outline-none focus:border-cyan-400"
                          />
                          <span>{product.unit}</span>
                          <button type="submit" disabled={isSavingMinStock} aria-label="Guardar mínimo de alerta" className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button type="button" disabled={isSavingMinStock} onClick={onCancelMinStock} aria-label="Cancelar edición del mínimo" className="text-slate-400 hover:text-white disabled:opacity-50">
                            ✕
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{product.minStock} {product.unit}</span>
                          {isAdmin && (
                            <button type="button" onClick={() => onEditMinStock(product)} aria-label={`Editar mínimo de alerta para ${product.name}`} className="text-slate-500 hover:text-cyan-300">
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    {!isCajero && <td className="px-4 py-3 font-mono">{formatCurrency(product.cost)}</td>}
                    <td className="px-4 py-3 font-mono text-cyan-400 font-bold">
                      {isStoreManager && editingPriceProductId === product.id ? (
                        <form onSubmit={(event) => onSavePrice(event, product)} className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            aria-label={`Precio de venta de ${product.name}`}
                            value={priceDraft}
                            onChange={(event) => onPriceDraftChange(event.target.value)}
                            className="w-24 bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-cyan-300 focus:outline-none focus:border-cyan-400"
                          />
                          <button type="submit" disabled={isSavingPrice} aria-label="Guardar precio de venta" className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button type="button" disabled={isSavingPrice} onClick={onCancelPrice} aria-label="Cancelar edición del precio" className="text-slate-400 hover:text-white disabled:opacity-50">
                            ✕
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{formatCurrency(product.price)}</span>
                          {(() => {
                            const level = getPriceLevel(product.price, product.cost);
                            return level && (
                              <span title={level.title} aria-label={level.title} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${level.className}`}>
                                {level.label}
                              </span>
                            );
                          })()}
                          {isStoreManager && (
                            <button type="button" onClick={() => onEditPrice(product)} aria-label={`Editar precio de venta de ${product.name}`} className="text-slate-500 hover:text-cyan-300">
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => onOpenRestock(product)} className="bg-slate-700 hover:bg-cyan-500 hover:text-slate-950 text-slate-200 px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1 border border-slate-600 cursor-pointer">
                          <Truck className="w-3 h-3" />
                          Solicitar compra
                        </button>
                        {isAdmin && Number(product.currentStock) === 0 && (
                          <button type="button" onClick={() => onDeleteProduct(product)} disabled={deletingProductId === product.id} aria-label={`Eliminar ${product.name}`} title="Eliminar producto sin existencias" className="text-slate-400 hover:text-red-400 disabled:opacity-50 p-1.5 rounded-lg hover:bg-red-500/10 transition">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}