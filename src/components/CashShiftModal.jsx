import { useState, useMemo } from 'react';
import {
  ShieldCheck,
  EyeOff,
  Calculator,
  Banknote,
  Coins,
  Printer,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  FileText,
  RotateCcw,
  DollarSign,
  Lock,
} from 'lucide-react';
import { formatCurrency } from '../utils/currency';

const MEXICAN_DENOMINATIONS = [
  { key: 'b1000', label: '$1,000', value: 1000, type: 'bill' },
  { key: 'b500', label: '$500', value: 500, type: 'bill' },
  { key: 'b200', label: '$200', value: 200, type: 'bill' },
  { key: 'b100', label: '$100', value: 100, type: 'bill' },
  { key: 'b50', label: '$50', value: 50, type: 'bill' },
  { key: 'b20', label: '$20', value: 20, type: 'bill' },
  { key: 'c20', label: '$20 Moneda', value: 20, type: 'coin' },
  { key: 'c10', label: '$10', value: 10, type: 'coin' },
  { key: 'c5', label: '$5', value: 5, type: 'coin' },
  { key: 'c2', label: '$2', value: 2, type: 'coin' },
  { key: 'c1', label: '$1', value: 1, type: 'coin' },
  { key: 'c05', label: '$0.50', value: 0.5, type: 'coin' },
];

export default function CashShiftModal({
  isOpen,
  mode, // 'open' | 'close' | 'report'
  onClose,
  storeName,
  currentUser,
  openingCashDraft,
  setOpeningCashDraft,
  onOpenShift,
  onCloseShift,
  isSaving,
  actionError,
  corteZReport,
  onPrintCorteZ,
}) {
  const [countMethod, setCountMethod] = useState('denominations'); // 'denominations' | 'direct'
  const [counts, setCounts] = useState({});
  const [directAmount, setDirectAmount] = useState('');
  const [cashierNotes, setCashierNotes] = useState('');
  const [showConfirmStep, setShowConfirmStep] = useState(false);

  // Calcula el total sumando las denominaciones
  const denominationTotal = useMemo(() => {
    return MEXICAN_DENOMINATIONS.reduce((sum, denom) => {
      const qty = Number(counts[denom.key] || 0);
      return sum + (qty > 0 ? qty * denom.value : 0);
    }, 0);
  }, [counts]);

  // Monto final contado a ciegas según el método seleccionado
  const finalCountedAmount = countMethod === 'denominations'
    ? denominationTotal
    : Number(directAmount || 0);

  const handleDenomChange = (key, rawValue) => {
    const parsed = parseInt(rawValue, 10);
    const qty = Number.isNaN(parsed) || parsed < 0 ? 0 : Math.min(parsed, 99999);
    setCounts((prev) => {
      const updated = { ...prev, [key]: qty };
      return updated;
    });
  };

  const handleResetDenominations = () => {
    setCounts({});
  };

  const handleStartConfirmation = (event) => {
    event.preventDefault();
    if (!Number.isFinite(finalCountedAmount) || finalCountedAmount < 0) {
      return;
    }
    setShowConfirmStep(true);
  };

  const handleExecuteClose = async () => {
    // Empaquetar denominaciones para el reporte / ticket
    const filledDenominations = Object.entries(counts).reduce((acc, [key, qty]) => {
      if (qty > 0) acc[key] = qty;
      return acc;
    }, {});

    await onCloseShift({
      countedCash: finalCountedAmount,
      denominations: countMethod === 'denominations' ? filledDenominations : null,
      notes: cashierNotes.trim() || null,
    });
    setShowConfirmStep(false);
  };

  if (!isOpen) return null;

  // ==========================================
  // VISTA 1: REPORTE DE CORTE Z CONSOLIDADO
  // ==========================================
  if (mode === 'report' && corteZReport) {
    const diff = (corteZReport.cashDifferenceCents || 0) / 100;
    const isCuadrada = Math.abs(diff) < 0.01;
    const isFaltante = diff < -0.01;
    const isSobrante = diff > 0.01;

    const openingCash = (corteZReport.openingCashCents || 0) / 100;
    const cashSales = (corteZReport.paymentTotalsCents?.cash || 0) / 100;
    const cardSales = (corteZReport.paymentTotalsCents?.card || 0) / 100;
    const transferSales = (corteZReport.paymentTotalsCents?.transfer || 0) / 100;
    const totalSales = cashSales + cardSales + transferSales;
    const expectedCash = (corteZReport.expectedCashCents || 0) / 100;
    const countedCash = (corteZReport.countedCashCents || 0) / 100;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="relative w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-6 text-white my-8">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  Corte Z Consolidado
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                    Auditoría Finalizada
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  {storeName} · Turno #{String(corteZReport.id || '').slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Veredicto de Auditoría */}
          <div className="my-5">
            {isCuadrada && (
              <div className="flex items-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-emerald-300">Caja Cuadrada (0 Discrepancias)</h3>
                  <p className="text-xs text-emerald-200/80">
                    El efectivo físico contado por el cajero coincide exactamente con el monto calculado por el sistema.
                  </p>
                </div>
              </div>
            )}
            {isFaltante && (
              <div className="flex items-center gap-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200">
                <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400">
                  <XCircle className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-rose-300">
                    Faltante de Caja: {formatCurrency(Math.abs(diff))}
                  </h3>
                  <p className="text-xs text-rose-200/80">
                    El conteo físico de efectivo es menor al esperado. Discrepancia auditada registrada en el sistema.
                  </p>
                </div>
              </div>
            )}
            {isSobrante && (
              <div className="flex items-center gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-amber-300">
                    Sobrante de Caja: +{formatCurrency(diff)}
                  </h3>
                  <p className="text-xs text-amber-200/80">
                    El efectivo físico reportado supera el esperado según las ventas registradas.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Matriz Financiera Consolidada */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
              <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Efectivo Físico (Ciego)</span>
              <p className="text-xl font-bold font-mono text-cyan-300 mt-1">{formatCurrency(countedCash)}</p>
              <span className="text-[10px] text-slate-500">Declarado por cajero</span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
              <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Efectivo Esperado</span>
              <p className="text-xl font-bold font-mono text-white mt-1">{formatCurrency(expectedCash)}</p>
              <span className="text-[10px] text-slate-500">Fondo + Ventas Efectivo</span>
            </div>
            <div className={`rounded-xl border p-3.5 ${isCuadrada ? 'border-emerald-500/30 bg-emerald-950/20' : isFaltante ? 'border-rose-500/30 bg-rose-950/20' : 'border-amber-500/30 bg-amber-950/20'}`}>
              <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Diferencia Neta</span>
              <p className={`text-xl font-bold font-mono mt-1 ${isCuadrada ? 'text-emerald-400' : isFaltante ? 'text-rose-400' : 'text-amber-400'}`}>
                {diff > 0 ? `+${formatCurrency(diff)}` : formatCurrency(diff)}
              </p>
              <span className="text-[10px] text-slate-400">{isCuadrada ? 'Cuadrada' : isFaltante ? 'Faltante auditado' : 'Sobrante auditado'}</span>
            </div>
          </div>

          {/* Desglose de Ventas del Turno */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2.5 text-xs mb-5">
            <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] border-b border-slate-800 pb-2">
              Resumen Operativo Consolidado
            </h4>
            <div className="flex justify-between text-slate-400">
              <span>Fondo Inicial de Caja</span>
              <strong className="font-mono text-slate-200">{formatCurrency(openingCash)}</strong>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Ventas en Efectivo ({corteZReport.saleCount ?? 0} tickets totales)</span>
              <strong className="font-mono text-slate-200">{formatCurrency(cashSales)}</strong>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Ventas con Tarjeta</span>
              <strong className="font-mono text-slate-200">{formatCurrency(cardSales)}</strong>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Ventas por Transferencia</span>
              <strong className="font-mono text-slate-200">{formatCurrency(transferSales)}</strong>
            </div>
            <div className="flex justify-between border-t border-slate-800 pt-2 font-semibold text-white">
              <span>Total Ventas Brutas del Turno</span>
              <strong className="font-mono text-emerald-400 text-sm">{formatCurrency(totalSales)}</strong>
            </div>
          </div>

          {/* Información del Personal y Cierre */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-800/20 p-3 text-xs text-slate-400 flex flex-wrap justify-between gap-2 mb-6">
            <div>
              <span>Cajero responsable: </span>
              <strong className="text-slate-200">{corteZReport.closedBy?.userName || corteZReport.openedBy?.userName || 'Desconocido'}</strong>
            </div>
            <div>
              <span>Fecha y hora de cierre: </span>
              <strong className="text-slate-200">{corteZReport.timestamp || 'Fecha no disponible'}</strong>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onPrintCorteZ}
              className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition shadow-lg shadow-cyan-500/20"
            >
              <Printer className="w-4 h-4" />
              Imprimir Ticket Corte Z
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-600 transition"
            >
              Concluir y Salir
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VISTA 2: APERTURA DE TURNO
  // ==========================================
  if (mode === 'open') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="relative w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-6 text-white">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">Apertura de Turno de Caja</h3>
                <p className="text-xs text-slate-400">{storeName}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={onOpenShift} className="space-y-4">
            <p className="text-xs text-slate-300">
              Captura el efectivo inicial con el que abre la caja. Las transacciones registradas quedarán auditadas bajo tu usuario.
            </p>

            <div>
              <label htmlFor="opening-cash-input" className="mb-1 block text-xs font-medium text-slate-300">
                Fondo inicial (MXN)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm">$</span>
                <input
                  id="opening-cash-input"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  autoFocus
                  value={openingCashDraft}
                  onChange={(e) => setOpeningCashDraft(e.target.value)}
                  className="w-full rounded-xl border border-slate-600 bg-slate-950 pl-8 pr-3 py-2.5 font-mono text-sm text-white focus:border-cyan-400 focus:outline-none"
                  placeholder="0.00"
                />
              </div>

              {/* Botones rápidos */}
              <div className="flex gap-2 mt-2">
                {[0, 200, 500, 1000].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setOpeningCashDraft(String(amount))}
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-800/80 py-1 text-[11px] font-mono text-slate-300 hover:bg-slate-700 hover:text-white"
                  >
                    ${amount}
                  </button>
                ))}
              </div>
            </div>

            {actionError && (
              <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                {actionError}
              </p>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-600 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-cyan-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 shadow-md shadow-cyan-500/20"
              >
                {isSaving ? 'Abriendo turno...' : 'Abrir Turno'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // VISTA 3: CIERRE DE TURNO - ARQUEO A CIEGAS
  // ==========================================
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-6 text-white my-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">Corte Z · Arqueo a Ciegas</h3>
                <span className="flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  <EyeOff className="w-3 h-3" />
                  Auditoría Ciega
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {storeName} · Operador: {currentUser?.displayName || currentUser?.username || 'Cajero'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal de confirmación de conteo ciego */}
        {showConfirmStep ? (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
              <div className="flex items-center gap-2 font-bold text-amber-300 mb-1">
                <ShieldCheck className="w-4 h-4" />
                Confirmación de Arqueo Físico
              </div>
              ¿Declaras que el conteo físico total en caja es de{' '}
              <strong className="text-base font-mono text-white underline underline-offset-2">
                {formatCurrency(finalCountedAmount)} MXN
              </strong>?
              <br />
              Al confirmar, el sistema registrará este arqueo a ciegas, calculará el Corte Z y no podrá modificarse.
            </div>

            {actionError && (
              <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                {actionError}
              </p>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setShowConfirmStep(false)}
                disabled={isSaving}
                className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-600 disabled:opacity-50"
              >
                Volver a Contar
              </button>
              <button
                type="button"
                onClick={handleExecuteClose}
                disabled={isSaving}
                className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 shadow-md shadow-amber-500/20"
              >
                {isSaving ? 'Cerrando caja...' : 'Confirmar y Realizar Corte Z'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleStartConfirmation} className="space-y-4">
            {/* Aviso de modalidad de arqueo a ciegas */}
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-200 flex items-start gap-2.5">
              <EyeOff className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span>
                <strong>Modalidad de Arqueo Ciego activa:</strong> El sistema oculta el monto esperado y las ventas en efectivo para garantizar una auditoría transparente y sin sesgos.
              </span>
            </div>

            {/* Selector de método de conteo */}
            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => setCountMethod('denominations')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-semibold transition ${
                  countMethod === 'denominations'
                    ? 'bg-slate-800 text-cyan-400 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                Desglose por Billetes y Monedas
              </button>
              <button
                type="button"
                onClick={() => {
                  setCountMethod('direct');
                  if (directAmount === '' && denominationTotal > 0) {
                    setDirectAmount(String(denominationTotal));
                  }
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-semibold transition ${
                  countMethod === 'direct'
                    ? 'bg-slate-800 text-cyan-400 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                Monto Total Directo
              </button>
            </div>

            {/* Contenido según el método */}
            {countMethod === 'denominations' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                  <span>Introduce la cantidad de piezas de cada denominación:</span>
                  <button
                    type="button"
                    onClick={handleResetDenominations}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-300"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Limpiar
                  </button>
                </div>

                {/* Grid de Denominaciones */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
                  {MEXICAN_DENOMINATIONS.map((denom) => {
                    const qty = counts[denom.key] || 0;
                    const subtotal = qty * denom.value;
                    const isBill = denom.type === 'bill';

                    return (
                      <div
                        key={denom.key}
                        className={`rounded-xl border p-2.5 transition flex flex-col justify-between ${
                          qty > 0
                            ? 'border-cyan-500/40 bg-cyan-950/20'
                            : 'border-slate-800 bg-slate-950/60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="flex items-center gap-1 font-mono text-xs font-bold text-white">
                            {isBill ? (
                              <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Coins className="w-3.5 h-3.5 text-amber-400" />
                            )}
                            {denom.label}
                          </span>
                          <span className="font-mono text-[10px] text-cyan-300">
                            {subtotal > 0 ? formatCurrency(subtotal) : '—'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDenomChange(denom.key, Math.max(0, qty - 1))}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={counts[denom.key] || ''}
                            onChange={(e) => handleDenomChange(denom.key, e.target.value)}
                            placeholder="0"
                            className="w-full text-center rounded-lg border border-slate-700 bg-slate-900 py-1 font-mono text-xs text-white focus:border-cyan-400 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleDenomChange(denom.key, qty + 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-3 py-2">
                <label htmlFor="direct-counted-cash" className="block text-xs font-medium text-slate-300">
                  Total de efectivo físico contado en caja (MXN)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-base">$</span>
                  <input
                    id="direct-counted-cash"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    autoFocus
                    value={directAmount}
                    onChange={(e) => setDirectAmount(e.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-950 pl-8 pr-3 py-3 font-mono text-base text-white focus:border-cyan-400 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Ingresa el monto total si utilizaste una contadora de billetes o ya totalizaste manualmente el efectivo.
                </p>
              </div>
            )}

            {/* Total físico contado destacado */}
            <div className="flex items-center justify-between rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-3">
              <span className="text-xs font-semibold text-slate-300">Total Físico Declarado:</span>
              <strong className="text-lg font-mono text-cyan-300">
                {formatCurrency(finalCountedAmount)} MXN
              </strong>
            </div>

            {/* Observaciones del cajero */}
            <div>
              <label htmlFor="cashier-notes" className="mb-1 block text-xs font-medium text-slate-400">
                Observaciones del Arqueo (opcional)
              </label>
              <input
                id="cashier-notes"
                type="text"
                maxLength={120}
                value={cashierNotes}
                onChange={(e) => setCashierNotes(e.target.value)}
                placeholder="Ej. Billetes deteriorados, retiro autorizado..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>

            {actionError && (
              <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                {actionError}
              </p>
            )}

            {/* Acciones */}
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-600 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 shadow-md shadow-amber-500/20"
              >
                Confirmar Arqueo Físico
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
