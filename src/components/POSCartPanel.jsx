import { useEffect, useRef } from 'react';
import {
  CheckCircle,
  DollarSign,
  Printer,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { formatCurrency } from '../utils/currency';
import { formatOtherUnits } from '../utils/volume';

export default function POSCartPanel({
  cart,
  cartQuantityDrafts,
  cartTotal,
  cartVolume,
  cashShiftActionError,
  cashShiftModal,
  hasSingleChannel,
  isCashShiftOpen,
  isGeneralView,
  isSavingSale,
  lastCartTouch,
  lastCompletedSale,
  loading,
  onCartQuantityBlur,
  onCartQuantityChange,
  onClearActionError,
  onOpenChannelModal,
  onOpenPaymentModal,
  onPrintLastTicket,
  onRemoveFromCart,
  products,
  selectedChannel,
  showCheckoutSuccess,
}) {
  const cartListRef = useRef(null);

  useEffect(() => {
    if (!lastCartTouch.id) return;
    const row = [...(cartListRef.current?.children || [])]
      .find((element) => element.dataset.cartId === lastCartTouch.id);
    row?.scrollIntoView({ block: 'nearest' });
  }, [lastCartTouch]);

  return (
    <div className="lg:col-span-5 flex flex-col gap-4">
      {cashShiftActionError && !cashShiftModal && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
          {cashShiftActionError}
        </p>
      )}

      <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex-1 flex flex-col justify-between shadow-md">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-700 mb-3">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-cyan-400" />
              Ticket de Venta
            </h3>
            <span className="text-xs bg-slate-900 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700">
              {cart.length} Ítems
            </span>
          </div>

          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[11px] uppercase font-semibold text-slate-400">
              Canal de Venta:{' '}
              <span className={selectedChannel ? 'text-cyan-300' : 'text-slate-500'}>
                {selectedChannel || 'Sin elegir'}
              </span>
            </p>
            {!hasSingleChannel && (
              <button
                type="button"
                onClick={onOpenChannelModal}
                disabled={isGeneralView || !isCashShiftOpen}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50"
              >
                {selectedChannel ? 'Cambiar' : 'Elegir'}
              </button>
            )}
          </div>

          <div ref={cartListRef} className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                {selectedChannel
                  ? 'El carrito está vacío. Haz clic en los productos para comenzar a cobrar.'
                  : 'Haz clic en un producto y elige el canal de venta para comenzar.'}
              </div>
            ) : (
              cart.map((item) => {
                const productStock = products.find((product) => product.id === item.id)?.currentStock;
                return (
                  <div key={item.id} data-cart-id={item.id} className="grid grid-cols-[minmax(0,1fr)_4.5rem_auto_auto] items-center gap-2 bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-200 line-clamp-1">{item.name}</p>
                      <p className="text-slate-400 text-[11px]">{formatCurrency(item.price)} / {item.unit}</p>
                    </div>
                    <input
                      type="number"
                      min="0.01"
                      max={productStock}
                      step="0.01"
                      aria-label={`Cantidad de ${item.name}`}
                      value={cartQuantityDrafts[item.id] ?? item.qty}
                      onChange={(event) => onCartQuantityChange(item.id, event.target.value)}
                      onBlur={() => onCartQuantityBlur(item.id)}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-1.5 py-1.5 text-center font-mono text-cyan-300 focus:outline-none focus:border-cyan-400"
                    />
                    <span className="font-bold text-slate-100 whitespace-nowrap">{formatCurrency(item.total)}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveFromCart(item.id)}
                      aria-label={`Quitar ${item.name}`}
                      className="text-slate-500 hover:text-red-400 p-1 rounded-md transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-700 mt-4">
          <div className="space-y-1.5 mb-4 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Total Volumen:</span>
              <span className="font-mono text-slate-200">
                {[
                  cartVolume.liters > 0 ? `${cartVolume.liters.toFixed(1)} L` : '',
                  formatOtherUnits(cartVolume.others),
                ].filter(Boolean).join(' · ') || '—'}
              </span>
            </div>
            <div className="flex justify-between text-base font-bold text-white pt-1 border-t border-slate-700/50">
              <span>Total a Cobrar:</span>
              <span className="text-xl text-cyan-400 font-mono">{formatCurrency(cartTotal)} MXN</span>
            </div>
          </div>

          {showCheckoutSuccess && (
            <div className="mb-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-2.5 rounded-xl text-xs flex items-center justify-center gap-2 animate-bounce">
              <CheckCircle className="w-4 h-4" />
              <span>¡Venta registrada con éxito! {lastCompletedSale && `Total: ${formatCurrency(lastCompletedSale.total)}`}</span>
            </div>
          )}
          {lastCompletedSale && (
            <button
              type="button"
              onClick={onPrintLastTicket}
              className="mb-2 w-full py-2 rounded-xl border border-slate-600 text-xs font-semibold text-slate-200 hover:bg-slate-700 flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimir Ticket
            </button>
          )}

          <button
            type="button"
            disabled={isGeneralView || cart.length === 0 || isSavingSale || loading || !isCashShiftOpen}
            onClick={() => {
              onClearActionError();
              onOpenPaymentModal();
            }}
            className={`w-full py-3 rounded-xl font-bold text-sm transition shadow-lg flex items-center justify-center gap-2 ${
              !isGeneralView && cart.length > 0 && !isSavingSale && !loading && isCashShiftOpen
                ? 'bg-linear-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-cyan-500/25'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            {isSavingSale ? 'Procesando...' : `Registrar Cobro (${formatCurrency(cartTotal)})`}
          </button>
        </div>
      </div>
    </div>
  );
}