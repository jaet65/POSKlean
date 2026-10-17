import { Search } from 'lucide-react';
import { formatCurrency } from '../utils/currency';

export default function POSCatalog({
  availableCategories,
  cart,
  filteredProducts,
  isCashShiftOpen,
  isGeneralView,
  onCategoryChange,
  onProductSelect,
  onSearchChange,
  searchTerm,
  selectedCategory,
}) {
  return (
    <div className="lg:col-span-7 flex flex-col gap-4">
      <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-sm flex flex-col gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar jabón, cloro, suavitel..."
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {['Todos', ...availableCategories].map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => onCategoryChange(category)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                selectedCategory === category
                  ? 'bg-slate-700 text-cyan-400 border border-cyan-500/30'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-700/50'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
        {[...filteredProducts]
            .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
            .map((product) => {
          const isLow = product.currentStock <= product.minStock;
          const isOutOfStock = Number(product.currentStock) === 0;
          const isSelected = cart.some((item) => item.id === product.id);

          return (
            <button
              key={product.id}
              type="button"
              disabled={isGeneralView || isOutOfStock || !isCashShiftOpen}
              onClick={() => onProductSelect(product)}
              className={`text-left p-2.5 rounded-xl border transition-all flex flex-col justify-between relative group ${
                isSelected
                  ? 'bg-slate-800 border-cyan-500 ring-2 ring-cyan-500/20 shadow-lg'
                  : isOutOfStock
                    ? 'bg-slate-800/50 border-slate-700/80 opacity-60 cursor-not-allowed'
                    : 'bg-slate-800/80 border-slate-700/80 hover:border-slate-500 hover:bg-slate-800'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${product.color}`} />
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                    isOutOfStock
                      ? 'bg-red-500/20 border-red-500/30 text-red-300'
                      : isLow
                        ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                        : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}>
                    {product.currentStock} {product.unit}
                  </span>
                </div>
                <h3 className="font-semibold text-xs text-slate-100 line-clamp-2 leading-snug mb-0.5">
                  {product.name}
                </h3>
                {product.description && (
                  <p title={product.description} className="text-[10px] text-slate-400 line-clamp-2 leading-snug">
                    {product.description}
                  </p>
                )}
              </div>

              <div className="mt-2 pt-1.5 border-t border-slate-700/60 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">x {product.unit}</span>
                <span className="text-sm font-bold text-cyan-400">{formatCurrency(product.price)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}