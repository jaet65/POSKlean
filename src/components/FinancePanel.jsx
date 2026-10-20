import { useState, useMemo, useEffect } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Building,
  Calendar,
  Check,
  CheckCircle2,
  DollarSign,
  Download,
  Edit,
  FileSpreadsheet,
  FileText,
  Flame,
  Layers,
  Package,
  PieChart,
  Plus,
  Repeat,
  Scale,
  Search,
  Sparkles,
  Store,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { formatCurrency } from '../utils/currency';
import {
  FINANCE_CATEGORIES,
  FINANCE_CLASSIFICATIONS,
  addFinanceTransaction,
  applyRecurringTemplatesForMonth,
  deleteFinanceTransaction,
  deleteRecurringTemplate,
  saveRecurringTemplate,
  subscribeToFinanceTransactions,
  subscribeToRecurringTemplates,
  updateFinanceTransaction,
} from '../services/financeService';

export default function FinancePanel({
  currentUser,
  stores = [],
  activeStoreId = null,
  salesHistory = [],
  stockItems = [],
  catalog = [],
}) {
  // Estado de navegación interna
  const [financeTab, setFinanceTab] = useState('dashboard'); // 'dashboard', 'pnl', 'capex_roi', 'projections', 'transactions'
  
  // Filtros de fecha y tienda
  const [periodPreset, setPeriodPreset] = useState('this_month'); // 'this_month', 'last_month', 'last_3_months', 'this_year', 'all', 'custom'
  const [filterStoreId, setFilterStoreId] = useState(activeStoreId || 'all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Datos financieros de Firestore
  const [transactions, setTransactions] = useState([]);
  const [recurringTemplates, setRecurringTemplates] = useState([]);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Modales
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [showRecurringModal, setShowRecurringModal] = useState(false);

  // Filtro de transacciones en la tabla
  const [searchQuery, setSearchQuery] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Subscripción a Firestore
  useEffect(() => {
    const unsubTx = subscribeToFinanceTransactions(
      filterStoreId === 'all' ? null : filterStoreId,
      (data) => {
        setTransactions(data);
      },
      (err) => {
        setActionError(`Error al cargar datos financieros: ${err.message}`);
      }
    );

    const unsubTemplates = subscribeToRecurringTemplates(
      (data) => setRecurringTemplates(data),
      (err) => console.error('Error plantillas:', err)
    );

    return () => {
      unsubTx();
      unsubTemplates();
    };
  }, [filterStoreId]);

  // Actualizar storeId si cambia en el POS
  useEffect(() => {
    if (activeStoreId && activeStoreId !== 'all') {
      setFilterStoreId(activeStoreId);
    }
  }, [activeStoreId]);

  // Rango de fechas calculado según el preset
  const dateRange = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    if (periodPreset === 'this_month') {
      const start = new Date(currentYear, currentMonth, 1);
      const end = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
      const yearMonth = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
      return { start, end, yearMonth, label: start.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) };
    }

    if (periodPreset === 'last_month') {
      const start = new Date(currentYear, currentMonth - 1, 1);
      const end = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
      const yearMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
      return { start, end, yearMonth, label: start.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) };
    }

    if (periodPreset === 'last_3_months') {
      const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { start, end: now, label: 'Últimos 90 días' };
    }

    if (periodPreset === 'this_year') {
      const start = new Date(currentYear, 0, 1);
      const end = new Date(currentYear, 11, 31, 23, 59, 59, 999);
      return { start, end, label: `Año ${currentYear}` };
    }

    if (periodPreset === 'custom' && customStartDate && customEndDate) {
      const start = new Date(`${customStartDate}T00:00:00`);
      const end = new Date(`${customEndDate}T23:59:59.999`);
      return { start, end, label: `${customStartDate} al ${customEndDate}` };
    }

    // 'all' o fallback
    return {
      start: new Date(2020, 0, 1),
      end: new Date(2035, 11, 31),
      label: 'Histórico Completo',
    };
  }, [periodPreset, customStartDate, customEndDate]);

  // Costo unitario por producto del inventario para estimar COGS
  const costByCatalogId = useMemo(() => {
    const map = new Map();
    stockItems.forEach((item) => {
      if (item.catalogId && Number.isFinite(item.cost)) {
        map.set(item.catalogId, item.cost);
      }
      if (item.id && Number.isFinite(item.cost)) {
        map.set(item.id, item.cost);
      }
    });
    return map;
  }, [stockItems]);

  // Filtrado de Ventas POS dentro del periodo y tienda
  const periodSales = useMemo(() => {
    return salesHistory.filter((s) => {
      // Filtro de tienda
      if (filterStoreId !== 'all' && s.storeId && s.storeId !== filterStoreId) {
        return false;
      }
      // Filtro de fecha
      const saleTime = s.timestampMs || (s.timestamp?.toDate ? s.timestamp.toDate().getTime() : 0);
      if (!saleTime) return false;
      return saleTime >= dateRange.start.getTime() && saleTime <= dateRange.end.getTime();
    });
  }, [salesHistory, filterStoreId, dateRange]);

  // Cálculo de Ingresos POS y COGS (Costo de Ventas)
  const salesMetrics = useMemo(() => {
    let totalRevenue = 0;
    let totalCogs = 0;
    let totalLiters = 0;

    periodSales.forEach((sale) => {
      totalRevenue += sale.total || 0;
      totalLiters += sale.liters || 0;

      if (Array.isArray(sale.items)) {
        sale.items.forEach((item) => {
          const qty = Number(item.qty) || 0;
          const unitCost = Number(item.cost) || costByCatalogId.get(item.productId) || costByCatalogId.get(item.catalogId) || 0;
          totalCogs += qty * unitCost;
        });
      }
    });

    // Si COGS no está especificado en los productos, margen bruto estimado conservador 50%
    if (totalCogs === 0 && totalRevenue > 0) {
      totalCogs = totalRevenue * 0.45;
    }

    return {
      revenue: Math.round(totalRevenue * 100) / 100,
      cogs: Math.round(totalCogs * 100) / 100,
      liters: Math.round(totalLiters * 10) / 10,
      ticketCount: periodSales.length,
    };
  }, [periodSales, costByCatalogId]);

  // Transacciones financieras filtradas por el periodo seleccionado
  const periodTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (filterStoreId !== 'all' && t.storeId && t.storeId !== 'global' && t.storeId !== filterStoreId) {
        return false;
      }
      const tDate = t.date ? new Date(`${t.date}T12:00:00`) : new Date(t.dateMs || 0);
      return tDate >= dateRange.start && tDate <= dateRange.end;
    });
  }, [transactions, filterStoreId, dateRange]);

  // Resumen Financiero P&L del Periodo
  const pnlSummary = useMemo(() => {
    let extraRevenue = 0;
    let opexTotal = 0;
    const opexByCategory = {};

    periodTransactions.forEach((t) => {
      if (t.classification === 'revenue') {
        extraRevenue += t.amount || 0;
      } else if (t.classification === 'opex') {
        opexTotal += t.amount || 0;
        opexByCategory[t.category] = (opexByCategory[t.category] || 0) + (t.amount || 0);
      }
    });

    const grossRevenue = salesMetrics.revenue + extraRevenue;
    const grossProfit = grossRevenue - salesMetrics.cogs;
    const grossMarginPct = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;

    const operatingIncome = grossProfit - opexTotal;
    const operatingMarginPct = grossRevenue > 0 ? (operatingIncome / grossRevenue) * 100 : 0;
    const netProfit = operatingIncome; // Antes de impuestos / dep.
    const netMarginPct = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

    return {
      grossRevenue,
      extraRevenue,
      posRevenue: salesMetrics.revenue,
      cogs: salesMetrics.cogs,
      grossProfit,
      grossMarginPct,
      opexTotal,
      opexByCategory,
      operatingIncome,
      operatingMarginPct,
      netProfit,
      netMarginPct,
    };
  }, [periodTransactions, salesMetrics]);

  // CAPEX & ROI ACUMULADO (A nivel histórico de la tienda o global)
  const capexMetrics = useMemo(() => {
    const relevantTransactions = transactions.filter((t) => {
      if (filterStoreId !== 'all' && t.storeId && t.storeId !== 'global' && t.storeId !== filterStoreId) {
        return false;
      }
      return true;
    });

    let totalCapex = 0;
    let totalInitialCapital = 0;
    const capexByCategory = {};
    const assetsList = [];

    relevantTransactions.forEach((t) => {
      if (t.classification === 'capex') {
        totalCapex += t.amount || 0;
        capexByCategory[t.category] = (capexByCategory[t.category] || 0) + (t.amount || 0);
        assetsList.push(t);
      } else if (t.classification === 'capital_injection') {
        totalInitialCapital += t.amount || 0;
      }
    });

    // Inversión Total Base para ROI: suma de activos fijos (CAPEX) o Capital aportado (lo que sea mayor)
    const totalInvestmentBase = Math.max(totalCapex, totalInitialCapital) || totalCapex || 1;

    // Ganancia Neta Acumulada Histórica
    // Calculamos todas las ventas históricas de la tienda
    let allTimePosRevenue = 0;
    let allTimeCogs = 0;
    salesHistory.forEach((s) => {
      if (filterStoreId !== 'all' && s.storeId && s.storeId !== filterStoreId) return;
      allTimePosRevenue += s.total || 0;
      if (Array.isArray(s.items)) {
        s.items.forEach((item) => {
          const qty = Number(item.qty) || 0;
          const unitCost = Number(item.cost) || costByCatalogId.get(item.productId) || 0;
          allTimeCogs += qty * unitCost;
        });
      }
    });
    if (allTimeCogs === 0 && allTimePosRevenue > 0) {
      allTimeCogs = allTimePosRevenue * 0.45;
    }

    let allTimeOpex = 0;
    let allTimeExtraRevenue = 0;
    relevantTransactions.forEach((t) => {
      if (t.classification === 'opex') allTimeOpex += t.amount || 0;
      if (t.classification === 'revenue') allTimeExtraRevenue += t.amount || 0;
    });

    const allTimeNetProfit = (allTimePosRevenue + allTimeExtraRevenue - allTimeCogs) - allTimeOpex;
    const roiPercentage = totalInvestmentBase > 0 ? (allTimeNetProfit / totalInvestmentBase) * 100 : 0;
    const remainingToRecover = Math.max(0, totalInvestmentBase - allTimeNetProfit);
    const recoveryProgressPct = Math.min(100, Math.max(0, (allTimeNetProfit / totalInvestmentBase) * 100));

    // Payback Period (Meses estimados para recuperar lo restante)
    // Usamos el beneficio mensual del P&L actual como ritmo de amortización
    const monthlyRunRate = pnlSummary.netProfit > 0 ? pnlSummary.netProfit : 0;
    const monthsToPayback = monthlyRunRate > 0 && remainingToRecover > 0
      ? Math.ceil(remainingToRecover / monthlyRunRate)
      : (remainingToRecover === 0 ? 0 : null);

    return {
      totalCapex,
      totalInitialCapital,
      totalInvestmentBase,
      capexByCategory,
      assetsList,
      allTimeNetProfit,
      roiPercentage,
      remainingToRecover,
      recoveryProgressPct,
      monthsToPayback,
      monthlyRunRate,
    };
  }, [transactions, filterStoreId, salesHistory, costByCatalogId, pnlSummary.netProfit]);

  // PROYECCIONES & PUNTO DE EQUILIBRIO (Break-Even)
  const breakEvenMetrics = useMemo(() => {
    // Estimación de OPEX fijo mensual (Renta + Nómina + Servicios fijos + Otros OPEX)
    const fixedOpexMonthly = pnlSummary.opexTotal > 0 ? pnlSummary.opexTotal : 20000;
    const grossMarginRatio = pnlSummary.grossRevenue > 0 ? (pnlSummary.grossProfit / pnlSummary.grossRevenue) : 0.55;

    // Ventas mínimas para cubrir OPEX
    const breakEvenSalesMonthly = grossMarginRatio > 0 ? fixedOpexMonthly / grossMarginRatio : 0;
    
    // Litros o tickets promedio diarios requeridos
    const avgTicketPrice = salesMetrics.ticketCount > 0 ? (salesMetrics.revenue / salesMetrics.ticketCount) : 180;
    const avgPricePerLiter = salesMetrics.liters > 0 ? (salesMetrics.revenue / salesMetrics.liters) : 28;

    const breakEvenTicketsMonthly = avgTicketPrice > 0 ? Math.ceil(breakEvenSalesMonthly / avgTicketPrice) : 0;
    const breakEvenLitersMonthly = avgPricePerLiter > 0 ? Math.ceil(breakEvenSalesMonthly / avgPricePerLiter) : 0;
    const breakEvenSalesDaily = breakEvenSalesMonthly / 30;

    return {
      fixedOpexMonthly,
      grossMarginRatio,
      breakEvenSalesMonthly,
      breakEvenSalesDaily,
      breakEvenTicketsMonthly,
      breakEvenLitersMonthly,
      avgTicketPrice,
      avgPricePerLiter,
    };
  }, [pnlSummary, salesMetrics]);

  // Manejador de guardado de transacción
  const handleSaveTransaction = async (formData) => {
    try {
      setActionError(null);
      if (editingTransaction?.id) {
        await updateFinanceTransaction(editingTransaction.id, formData, currentUser);
        setActionSuccess('Movimiento actualizado con éxito.');
      } else {
        await addFinanceTransaction({ ...formData, user: currentUser });
        setActionSuccess('Movimiento registrado con éxito.');
      }
      setShowTransactionModal(false);
      setEditingTransaction(null);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setActionError(err.message || 'Error al guardar movimiento.');
    }
  };

  // Manejador para eliminar transacción
  const handleDeleteTransaction = async (id) => {
    if (!window.confirm('¿Confirmas que deseas eliminar este movimiento financiero?')) return;
    try {
      setActionError(null);
      await deleteFinanceTransaction(id);
      setActionSuccess('Movimiento eliminado correctamente.');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      setActionError(`Error al eliminar: ${err.message}`);
    }
  };

  // Manejador de aplicación de plantillas recurrentes
  const handleApplyRecurring = async () => {
    if (recurringTemplates.length === 0) {
      alert('No tienes plantillas de gastos recurrentes configuradas.');
      return;
    }
    const currentYearMonth = dateRange.yearMonth || new Date().toISOString().slice(0, 7);
    if (!window.confirm(`¿Deseas generar automáticamente los gastos recurrentes para el mes ${currentYearMonth}?`)) return;

    try {
      setActionError(null);
      const res = await applyRecurringTemplatesForMonth({
        yearMonth: currentYearMonth,
        templates: recurringTemplates,
        existingTransactions: transactions,
        storeId: filterStoreId,
        user: currentUser,
      });

      if (res.appliedCount > 0) {
        setActionSuccess(`¡Se generaron ${res.appliedCount} gastos recurrentes para el mes (${res.skippedCount} omitidos por ya existir)!`);
      } else {
        setActionSuccess(`Todos los gastos recurrentes (${res.skippedCount}) ya se encontraban registrados para este periodo.`);
      }
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err) {
      setActionError(`Error al aplicar plantillas: ${err.message}`);
    }
  };

  // Exportar a CSV
  const handleExportCsv = () => {
    if (transactions.length === 0) {
      alert('No hay transacciones registradas para exportar.');
      return;
    }
    const headers = ['Fecha', 'Tipo', 'Clasificación', 'Categoría', 'Descripción', 'Monto', 'Tienda', 'Método de Pago', 'Proveedor', 'Factura', 'Notas'];
    const rows = transactions.map((t) => [
      t.date || '',
      t.type || '',
      t.classification || '',
      FINANCE_CATEGORIES[t.category]?.label || t.category || '',
      `"${(t.description || '').replace(/"/g, '""')}"`,
      t.amount || 0,
      t.storeId || 'global',
      t.paymentMethod || '',
      `"${(t.vendor || '').replace(/"/g, '""')}"`,
      `"${(t.invoiceNumber || '').replace(/"/g, '""')}"`,
      `"${(t.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Finanzas_POSKlean_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtrado de la tabla de movimientos
  const filteredTransactions = useMemo(() => {
    return periodTransactions.filter((t) => {
      if (classificationFilter !== 'all' && t.classification !== classificationFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const descMatch = (t.description || '').toLowerCase().includes(q);
        const vendorMatch = (t.vendor || '').toLowerCase().includes(q);
        const invMatch = (t.invoiceNumber || '').toLowerCase().includes(q);
        const catMatch = (FINANCE_CATEGORIES[t.category]?.label || '').toLowerCase().includes(q);
        if (!descMatch && !vendorMatch && !invMatch && !catMatch) return false;
      }
      return true;
    });
  }, [periodTransactions, classificationFilter, categoryFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* HEADER DE CONTROL FINANCIERO */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 text-cyan-400 shadow-inner">
                <PieChart className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  Finanzas & Retorno de Inversión
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                    OPEX · CAPEX · P&L · ROI
                  </span>
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Control integral de ingresos, egresos operativos, inversión en mobiliario y proyección de utilidades
                </p>
              </div>
            </div>
          </div>

          {/* Botones de acción principal */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setEditingTransaction(null);
                setShowTransactionModal(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Registrar Movimiento</span>
            </button>

            <button
              type="button"
              onClick={() => setShowRecurringModal(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer"
              title="Administrar rentas, sueldos o servicios recurrentes"
            >
              <Repeat className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Gastos Recurrentes</span>
              {recurringTemplates.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px]">
                  {recurringTemplates.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-slate-300 border border-slate-700 text-xs font-medium transition cursor-pointer"
              title="Exportar a archivo Excel / CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">CSV</span>
            </button>
          </div>
        </div>

        {/* BARRA DE FILTROS (TIENDA Y PERIODO) */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Selector de Tienda */}
            <label className="flex items-center gap-2 bg-slate-950/80 border border-slate-700/80 px-2.5 py-1.5 rounded-xl text-xs text-slate-300">
              <Store className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] text-slate-400 font-medium">Sucursal:</span>
              <select
                value={filterStoreId}
                onChange={(e) => setFilterStoreId(e.target.value)}
                className="bg-transparent text-slate-100 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900">Consolidado (Todas)</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-900">
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Selector de Periodo */}
            <label className="flex items-center gap-2 bg-slate-950/80 border border-slate-700/80 px-2.5 py-1.5 rounded-xl text-xs text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] text-slate-400 font-medium">Periodo:</span>
              <select
                value={periodPreset}
                onChange={(e) => setPeriodPreset(e.target.value)}
                className="bg-transparent text-slate-100 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="this_month" className="bg-slate-900">Este Mes</option>
                <option value="last_month" className="bg-slate-900">Mes Anterior</option>
                <option value="last_3_months" className="bg-slate-900">Últimos 3 Meses</option>
                <option value="this_year" className="bg-slate-900">Año en Curso</option>
                <option value="all" className="bg-slate-900">Histórico Completo</option>
                <option value="custom" className="bg-slate-900">Personalizado...</option>
              </select>
            </label>

            {/* Selector de Rango Personalizado */}
            {periodPreset === 'custom' && (
              <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-700/80 px-2.5 py-1 rounded-xl text-xs">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-transparent text-slate-200 text-xs focus:outline-none"
                />
                <span className="text-slate-500">a</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-transparent text-slate-200 text-xs focus:outline-none"
                />
              </div>
            )}
          </div>

          <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Mostrando: <strong className="text-slate-200 capitalize">{dateRange.label}</strong></span>
          </div>
        </div>
      </div>

      {/* MENSAJES DE ESTADO */}
      {actionError && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3.5 rounded-xl text-xs flex items-center gap-2.5 animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span className="flex-1 font-medium">{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-3.5 rounded-xl text-xs flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span className="flex-1 font-medium">{actionSuccess}</span>
          <button type="button" onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* PESTAÑAS DE VISTA FINANCIERA */}
      <div className="flex border-b border-slate-800 gap-1 overflow-x-auto scrollbar-none pb-0.5">
        <button
          type="button"
          onClick={() => setFinanceTab('dashboard')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl transition-all whitespace-nowrap cursor-pointer ${
            financeTab === 'dashboard'
              ? 'bg-slate-800/90 text-cyan-400 border-t-2 border-t-cyan-400 border-x border-slate-700 shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Dashboard & KPIs</span>
        </button>

        <button
          type="button"
          onClick={() => setFinanceTab('pnl')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl transition-all whitespace-nowrap cursor-pointer ${
            financeTab === 'pnl'
              ? 'bg-slate-800/90 text-cyan-400 border-t-2 border-t-cyan-400 border-x border-slate-700 shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Estado de Resultados (P&L)</span>
        </button>

        <button
          type="button"
          onClick={() => setFinanceTab('capex_roi')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl transition-all whitespace-nowrap cursor-pointer ${
            financeTab === 'capex_roi'
              ? 'bg-slate-800/90 text-cyan-400 border-t-2 border-t-cyan-400 border-x border-slate-700 shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Target className="w-4 h-4" />
          <span>Retorno de Inversión (ROI & CAPEX)</span>
        </button>

        <button
          type="button"
          onClick={() => setFinanceTab('projections')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl transition-all whitespace-nowrap cursor-pointer ${
            financeTab === 'projections'
              ? 'bg-slate-800/90 text-cyan-400 border-t-2 border-t-cyan-400 border-x border-slate-700 shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>Punto de Equilibrio & Proyecciones</span>
        </button>

        <button
          type="button"
          onClick={() => setFinanceTab('transactions')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl transition-all whitespace-nowrap cursor-pointer ${
            financeTab === 'transactions'
              ? 'bg-slate-800/90 text-cyan-400 border-t-2 border-t-cyan-400 border-x border-slate-700 shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Libro de Entradas y Salidas</span>
          <span className="px-1.5 py-0.2 rounded-full bg-slate-700 text-slate-300 text-[10px] font-mono">
            {periodTransactions.length}
          </span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* VISTA 1: DASHBOARD EJECUTIVO & KPIS                           */}
      {/* ============================================================== */}
      {financeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Tarjetas Principales de KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Ventas Totales */}
            <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 p-4 shadow-lg hover:border-slate-600 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ingresos Brutos</span>
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold font-mono text-white">
                {formatCurrency(pnlSummary.grossRevenue)}
              </p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>POS: {formatCurrency(pnlSummary.posRevenue)}</span>
                <span>{salesMetrics.liters} L despachados</span>
              </div>
            </div>

            {/* Costo de Ventas (COGS) */}
            <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 p-4 shadow-lg hover:border-slate-600 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Costo Mercancía (COGS)</span>
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold font-mono text-blue-300">
                {formatCurrency(pnlSummary.cogs)}
              </p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Margen Bruto:</span>
                <strong className="text-emerald-400 font-bold">{pnlSummary.grossMarginPct.toFixed(1)}%</strong>
              </div>
            </div>

            {/* Gastos Operativos (OPEX) */}
            <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 p-4 shadow-lg hover:border-slate-600 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Gastos OPEX</span>
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Building className="w-4 h-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold font-mono text-amber-300">
                {formatCurrency(pnlSummary.opexTotal)}
              </p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Renta, nómina, servicios</span>
                <span className="text-slate-300 font-medium">
                  {pnlSummary.grossRevenue > 0 ? `${((pnlSummary.opexTotal / pnlSummary.grossRevenue) * 100).toFixed(1)}% de vta.` : '—'}
                </span>
              </div>
            </div>

            {/* Utilidad Neta (Net Profit) */}
            <div className={`rounded-2xl border p-4 shadow-lg transition ${
              pnlSummary.netProfit >= 0
                ? 'bg-emerald-950/20 border-emerald-500/40'
                : 'bg-rose-950/20 border-rose-500/40'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Utilidad Neta (P&L)
                </span>
                <div className={`p-2 rounded-xl border ${
                  pnlSummary.netProfit >= 0
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                }`}>
                  {pnlSummary.netProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                </div>
              </div>
              <p className={`mt-2 text-2xl font-bold font-mono ${
                pnlSummary.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {formatCurrency(pnlSummary.netProfit)}
              </p>
              <div className="mt-2 flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400">Margen Neto:</span>
                <strong className={`font-bold ${pnlSummary.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {pnlSummary.netMarginPct.toFixed(1)}%
                </strong>
              </div>
            </div>
          </div>

          {/* BANNER DE ESTADO DEL RETORNO DE INVERSIÓN (ROI) */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-purple-400" />
                  <h3 className="text-base font-bold text-white">Progreso de Retorno de Inversión (ROI)</h3>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    CAPEX Total: {formatCurrency(capexMetrics.totalCapex)}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Inversión en mobiliario, adecuaciones y equipo vs. Ganancia neta real acumulada histórica ({formatCurrency(capexMetrics.allTimeNetProfit)})
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right font-mono">
                  <p className="text-xs text-slate-400">ROI Acumulado</p>
                  <p className={`text-xl font-black ${capexMetrics.roiPercentage >= 100 ? 'text-emerald-400' : 'text-purple-300'}`}>
                    {capexMetrics.roiPercentage.toFixed(1)}%
                  </p>
                </div>
                <div className="border-l border-slate-700 pl-4 text-right font-mono">
                  <p className="text-xs text-slate-400">Recuperado</p>
                  <p className="text-sm font-bold text-white">
                    {formatCurrency(Math.max(0, capexMetrics.allTimeNetProfit))} / {formatCurrency(capexMetrics.totalInvestmentBase)}
                  </p>
                </div>
              </div>
            </div>

            {/* Barra de progreso visual del retorno de inversión */}
            <div className="mt-4">
              <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-700/80">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    capexMetrics.recoveryProgressPct >= 100
                      ? 'bg-gradient-to-r from-emerald-500 to-cyan-400'
                      : 'bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, capexMetrics.recoveryProgressPct))}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>{capexMetrics.recoveryProgressPct.toFixed(1)}% de la inversión amortizada</span>
                {capexMetrics.remainingToRecover > 0 ? (
                  <span className="text-amber-400">
                    Faltan {formatCurrency(capexMetrics.remainingToRecover)} para recuperar el 100%
                  </span>
                ) : (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 stroke-[3]" /> ¡Inversión 100% amortizada y en rendimiento neto!
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* DESGLOSE DE GASTOS OPERATIVOS (OPEX) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Top Categorías de OPEX */}
            <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 p-5 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Building className="w-4 h-4 text-amber-400" />
                  Estructura de Gastos Operativos (OPEX)
                </h3>
                <span className="text-xs font-mono text-slate-400 font-medium">
                  Total: {formatCurrency(pnlSummary.opexTotal)}
                </span>
              </div>

              {Object.keys(pnlSummary.opexByCategory).length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  <Building className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No se han registrado gastos operativos (renta, nómina, servicios) en este periodo.
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTransaction(null);
                        setShowTransactionModal(true);
                      }}
                      className="text-cyan-400 hover:underline font-semibold"
                    >
                      + Registrar primer gasto
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(pnlSummary.opexByCategory)
                    .sort(([, a], [, b]) => b - a)
                    .map(([catKey, catAmount]) => {
                      const catInfo = FINANCE_CATEGORIES[catKey] || { label: catKey };
                      const pct = pnlSummary.opexTotal > 0 ? (catAmount / pnlSummary.opexTotal) * 100 : 0;
                      return (
                        <div key={catKey} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-300">{catInfo.label}</span>
                            <span className="font-mono text-slate-100 font-semibold">
                              {formatCurrency(catAmount)}{' '}
                              <span className="text-[10px] text-slate-500">({pct.toFixed(0)}%)</span>
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(3, pct))}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Accesos Rápidos y Alertas */}
            <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 p-5 shadow-lg flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  Resumen de Rentabilidad y Recomendaciones
                </h3>
                <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700 flex items-start gap-3">
                    <Scale className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white block">Punto de Equilibrio (Break-Even):</strong>
                      Tu negocio necesita vender al menos{' '}
                      <strong className="text-cyan-300 font-mono">{formatCurrency(breakEvenMetrics.breakEvenSalesMonthly)}</strong> al mes{' '}
                      (~{breakEvenMetrics.breakEvenLitersMonthly.toLocaleString()} L) para cubrir costos fijos y costo del producto sin perder dinero.
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700 flex items-start gap-3">
                    <Target className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white block">Tiempo Estimado de Retorno (Payback):</strong>
                      {capexMetrics.monthsToPayback !== null ? (
                        capexMetrics.monthsToPayback === 0 ? (
                          <span className="text-emerald-300">¡Tu inversión inicial ya está 100% amortizada y pagada!</span>
                        ) : (
                          <span>
                            Al ritmo actual de utilidad mensual ({formatCurrency(capexMetrics.monthlyRunRate)}), se estima recuperar el capital restante en{' '}
                            <strong className="text-purple-300 font-mono font-bold">{capexMetrics.monthsToPayback} meses</strong>.
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400">
                          Se requiere generar utilidad operativa neta positiva en el periodo para proyectar los meses de amortización.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-700 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleApplyRecurring}
                  className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                >
                  <Repeat className="w-3.5 h-3.5" />
                  <span>Aplicar gastos recurrentes de este mes</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFinanceTab('pnl')}
                  className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
                >
                  <span>Ver Estado de Resultados Completo</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* VISTA 2: ESTADO DE RESULTADOS (P&L - PROFIT & LOSS)            */}
      {/* ============================================================== */}
      {financeTab === 'pnl' && (
        <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 p-5 sm:p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                Estado de Resultados (P&L - Profit and Loss)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Periodo: <strong className="text-slate-200 capitalize">{dateRange.label}</strong> · {filterStoreId === 'all' ? 'Consolidado General' : 'Sucursal Seleccionada'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-600 bg-slate-700/60 hover:bg-slate-700 text-xs text-slate-200 font-medium transition cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Imprimir / PDF</span>
              </button>
            </div>
          </div>

          {/* Tabla Contable P&L */}
          <div className="mt-5 space-y-4 font-mono text-xs sm:text-sm">
            {/* 1. INGRESOS BRUTOS */}
            <div className="bg-slate-900/90 rounded-xl p-3.5 border border-slate-700/60">
              <div className="flex items-center justify-between text-slate-100 font-bold text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-emerald-400">(+)</span> 1. INGRESOS BRUTOS OPERATIVOS
                </span>
                <span className="text-emerald-400 text-base">{formatCurrency(pnlSummary.grossRevenue)}</span>
              </div>
              <div className="mt-2.5 pl-6 space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center justify-between">
                  <span>· Ventas Mostrador / Tickets POS ({salesMetrics.ticketCount} tickets, {salesMetrics.liters} L)</span>
                  <span className="text-slate-200">{formatCurrency(pnlSummary.posRevenue)}</span>
                </div>
                {pnlSummary.extraRevenue > 0 && (
                  <div className="flex items-center justify-between">
                    <span>· Otros Ingresos (fletes, venta de envases/merma)</span>
                    <span className="text-slate-200">{formatCurrency(pnlSummary.extraRevenue)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. COSTO DE VENTAS (COGS) */}
            <div className="bg-slate-900/90 rounded-xl p-3.5 border border-slate-700/60">
              <div className="flex items-center justify-between text-slate-100 font-bold text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-rose-400">(-)</span> 2. COSTO DE BIENES VENDIDOS (COGS)
                </span>
                <span className="text-rose-400 text-base">{formatCurrency(pnlSummary.cogs)}</span>
              </div>
              <div className="mt-2.5 pl-6 space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center justify-between">
                  <span>· Costo directo de materia prima y producto vendido</span>
                  <span className="text-slate-200">{formatCurrency(pnlSummary.cogs)}</span>
                </div>
              </div>
            </div>

            {/* UTILIDAD BRUTA */}
            <div className="bg-cyan-950/20 border border-cyan-500/30 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-cyan-300 font-bold text-sm sm:text-base flex items-center gap-2">
                  (=) UTILIDAD BRUTA (Gross Profit)
                </span>
                <p className="text-[11px] text-cyan-400/80 pl-6">
                  Margen Bruto sobre ventas: <strong className="text-white">{pnlSummary.grossMarginPct.toFixed(1)}%</strong>
                </p>
              </div>
              <span className="text-cyan-300 font-bold text-lg">{formatCurrency(pnlSummary.grossProfit)}</span>
            </div>

            {/* 3. GASTOS DE OPERACIÓN (OPEX) */}
            <div className="bg-slate-900/90 rounded-xl p-3.5 border border-slate-700/60">
              <div className="flex items-center justify-between text-slate-100 font-bold text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-amber-400">(-)</span> 3. GASTOS DE OPERACIÓN (OPEX)
                </span>
                <span className="text-amber-400 text-base">{formatCurrency(pnlSummary.opexTotal)}</span>
              </div>
              <div className="mt-2.5 pl-6 space-y-2 text-xs">
                {Object.keys(pnlSummary.opexByCategory).length === 0 ? (
                  <p className="text-slate-500 italic">No hay gastos operativos registrados en el periodo.</p>
                ) : (
                  Object.entries(pnlSummary.opexByCategory)
                    .sort(([, a], [, b]) => b - a)
                    .map(([catKey, amount]) => {
                      const catInfo = FINANCE_CATEGORIES[catKey] || { label: catKey };
                      const pctOfRev = pnlSummary.grossRevenue > 0 ? (amount / pnlSummary.grossRevenue) * 100 : 0;
                      return (
                        <div key={catKey} className="flex items-center justify-between text-slate-300 border-b border-slate-800/80 pb-1">
                          <span className="flex items-center gap-2">
                            <span>· {catInfo.label}</span>
                            <span className="text-[10px] text-slate-500">({pctOfRev.toFixed(1)}% vta.)</span>
                          </span>
                          <span className="text-slate-100 font-semibold">{formatCurrency(amount)}</span>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            {/* UTILIDAD DE OPERACIÓN / EBITDA */}
            <div className="bg-slate-900/80 border border-slate-700 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-slate-200 font-bold text-sm">
                  (=) UTILIDAD DE OPERACIÓN (EBITDA / Operating Income)
                </span>
                <p className="text-[11px] text-slate-400 pl-6">
                  Margen Operativo: <strong className="text-white">{pnlSummary.operatingMarginPct.toFixed(1)}%</strong>
                </p>
              </div>
              <span className={`text-base font-bold ${pnlSummary.operatingIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(pnlSummary.operatingIncome)}
              </span>
            </div>

            {/* UTILIDAD NETA FINAL */}
            <div className={`rounded-xl p-4 border-2 flex items-center justify-between shadow-2xl ${
              pnlSummary.netProfit >= 0
                ? 'bg-gradient-to-r from-emerald-950/40 to-slate-900 border-emerald-500/60'
                : 'bg-gradient-to-r from-rose-950/40 to-slate-900 border-rose-500/60'
            }`}>
              <div>
                <span className={`text-base sm:text-lg font-black flex items-center gap-2 ${
                  pnlSummary.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  (=) UTILIDAD NETA REAL (Net Profit)
                </span>
                <p className="text-xs text-slate-300 pl-6 mt-0.5">
                  Ganancia líquida final del periodo · Margen Neto:{' '}
                  <strong className="text-white font-bold">{pnlSummary.netMarginPct.toFixed(1)}%</strong>
                </p>
              </div>
              <span className={`text-xl sm:text-2xl font-black ${
                pnlSummary.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {formatCurrency(pnlSummary.netProfit)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* VISTA 3: RETORNO DE INVERSIÓN (ROI & CAPEX)                   */}
      {/* ============================================================== */}
      {financeTab === 'capex_roi' && (
        <div className="space-y-6">
          {/* Métricas Clave de Retorno */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Inversión Total en Activos (CAPEX)</span>
              <p className="mt-2 text-2xl font-bold font-mono text-purple-300">
                {formatCurrency(capexMetrics.totalCapex)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Mobiliario, bombas, remodelación y equipos</p>
            </div>

            <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Ganancia Neta Real Acumulada</span>
              <p className={`mt-2 text-2xl font-bold font-mono ${capexMetrics.allTimeNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(capexMetrics.allTimeNetProfit)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Total histórico acumulado desde el día 1</p>
            </div>

            <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Retorno de Inversión (ROI)</span>
              <p className={`mt-2 text-2xl font-bold font-mono ${capexMetrics.roiPercentage >= 100 ? 'text-emerald-400' : 'text-cyan-400'}`}>
                {capexMetrics.roiPercentage.toFixed(1)}%
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {capexMetrics.remainingToRecover > 0
                  ? `Faltan ${formatCurrency(capexMetrics.remainingToRecover)} para el 100%`
                  : '¡Inversión recuperada al 100%!'}
              </p>
            </div>
          </div>

          {/* Tabla / Inventario de Activos y Mobiliario (CAPEX) */}
          <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-purple-400" />
                  Inventario de Inversiones de Capital & Mobiliario (CAPEX)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Bienes duraderos y adecuaciones físicas registrados en el negocio
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingTransaction({ classification: 'capex', category: 'furniture' });
                  setShowTransactionModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 text-xs font-semibold transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Agregar Activo / Mobiliario</span>
              </button>
            </div>

            {capexMetrics.assetsList.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                <Boxes className="w-10 h-10 mx-auto mb-2 opacity-30 text-purple-400" />
                No hay activos fijos ni compras de mobiliario registradas todavía.
                <p className="mt-1">
                  Registra compras de mobiliario, bombas, tanques o remodelación para calcular el retorno de inversión exacto.
                </p>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 font-mono uppercase tracking-wider border-b border-slate-700">
                    <tr>
                      <th className="px-3 py-2.5">Fecha</th>
                      <th className="px-3 py-2.5">Activo / Mobiliario</th>
                      <th className="px-3 py-2.5">Categoría</th>
                      <th className="px-3 py-2.5">Sucursal</th>
                      <th className="px-3 py-2.5 text-right">Inversión</th>
                      <th className="px-3 py-2.5 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60 font-mono">
                    {capexMetrics.assetsList.map((asset) => {
                      const catInfo = FINANCE_CATEGORIES[asset.category] || { label: asset.category };
                      const storeName = stores.find((s) => s.id === asset.storeId)?.name || (asset.storeId === 'global' ? 'General' : asset.storeId);
                      return (
                        <tr key={asset.id} className="hover:bg-slate-700/30 transition">
                          <td className="px-3 py-2.5 text-slate-400">{asset.date}</td>
                          <td className="px-3 py-2.5 font-sans font-semibold text-white">
                            <div>{asset.description}</div>
                            {asset.vendor && <span className="text-[10px] text-slate-400 font-mono">Proveedor: {asset.vendor}</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px]">
                              {catInfo.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-300">{storeName}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-purple-300 text-sm">
                            {formatCurrency(asset.amount)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTransaction(asset);
                                  setShowTransactionModal(true);
                                }}
                                className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
                                title="Editar activo"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTransaction(asset.id)}
                                className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                                title="Eliminar activo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* VISTA 4: PUNTO DE EQUILIBRIO & PROYECCIONES FINANCIERAS        */}
      {/* ============================================================== */}
      {financeTab === 'projections' && (
        <div className="space-y-6">
          {/* Card de Punto de Equilibrio (Break-Even) */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/80 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <Scale className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Punto de Equilibrio Operativo (Break-Even Point)
                </h3>
                <p className="text-xs text-slate-400">
                  Cálculo de ventas mínimas mensuales y diarias para no tener pérdidas (cubrir OPEX fijos + COGS de producto)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
              <div className="bg-slate-950/80 rounded-xl p-3.5 border border-slate-800">
                <span className="text-xs text-slate-400">Venta Mensual Mínima:</span>
                <p className="text-xl font-bold font-mono text-cyan-300 mt-1">
                  {formatCurrency(breakEvenMetrics.breakEvenSalesMonthly)}
                </p>
                <span className="text-[10px] text-slate-500 font-mono">Para $0 utilidad / $0 pérdida</span>
              </div>

              <div className="bg-slate-950/80 rounded-xl p-3.5 border border-slate-800">
                <span className="text-xs text-slate-400">Meta Diaria Mínima:</span>
                <p className="text-xl font-bold font-mono text-white mt-1">
                  {formatCurrency(breakEvenMetrics.breakEvenSalesDaily)}
                </p>
                <span className="text-[10px] text-slate-500 font-mono">Promedio de 30 días</span>
              </div>

              <div className="bg-slate-950/80 rounded-xl p-3.5 border border-slate-800">
                <span className="text-xs text-slate-400">Litros Mínimos al Mes:</span>
                <p className="text-xl font-bold font-mono text-blue-400 mt-1">
                  {breakEvenMetrics.breakEvenLitersMonthly.toLocaleString()} L
                </p>
                <span className="text-[10px] text-slate-500 font-mono">~{Math.ceil(breakEvenMetrics.breakEvenLitersMonthly / 30)} L diarios</span>
              </div>

              <div className="bg-slate-950/80 rounded-xl p-3.5 border border-slate-800">
                <span className="text-xs text-slate-400">Tickets Mínimos al Mes:</span>
                <p className="text-xl font-bold font-mono text-purple-400 mt-1">
                  {breakEvenMetrics.breakEvenTicketsMonthly} tickets
                </p>
                <span className="text-[10px] text-slate-500 font-mono">~{Math.ceil(breakEvenMetrics.breakEvenTicketsMonthly / 30)} tickets al día</span>
              </div>
            </div>
          </div>

          {/* SIMULADOR DE PROYECCIÓN A 3, 6 Y 12 MESES */}
          <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 p-5 shadow-xl">
            <div className="border-b border-slate-700 pb-3 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                Simulador & Proyección Financiera (3, 6 y 12 Meses)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Estimación de ingresos, utilidades acumuladas y evolución del ROI en 3 escenarios futuros
              </p>
            </div>

            {/* Escenarios comparativos */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Escenario Conservador */}
              <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-amber-300 text-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Conservador (-10%)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Ventas moderadas</span>
                </div>
                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Venta mensual estimada:</span>
                    <strong className="text-slate-200">{formatCurrency(pnlSummary.grossRevenue * 0.9)}</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Utilidad neta mensual:</span>
                    <strong className="text-amber-300">{formatCurrency(pnlSummary.netProfit * 0.9)}</strong>
                  </div>
                  <div className="flex justify-between text-slate-400 border-t border-slate-800 pt-1.5">
                    <span>Utilidad acum. 6 meses:</span>
                    <strong className="text-white">{formatCurrency((pnlSummary.netProfit * 0.9) * 6)}</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Utilidad acum. 12 meses:</span>
                    <strong className="text-white">{formatCurrency((pnlSummary.netProfit * 0.9) * 12)}</strong>
                  </div>
                </div>
              </div>

              {/* Escenario Base (Tendencia Actual) */}
              <div className="bg-slate-900/90 border-2 border-cyan-500/50 rounded-xl p-4 space-y-3 shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-cyan-300 text-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    Base (Tendencia Actual)
                  </span>
                  <span className="text-[10px] font-mono bg-cyan-500/10 text-cyan-300 px-1.5 py-0.2 rounded">Recomendado</span>
                </div>
                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Venta mensual estimada:</span>
                    <strong className="text-slate-200">{formatCurrency(pnlSummary.grossRevenue)}</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Utilidad neta mensual:</span>
                    <strong className="text-cyan-300">{formatCurrency(pnlSummary.netProfit)}</strong>
                  </div>
                  <div className="flex justify-between text-slate-400 border-t border-slate-800 pt-1.5">
                    <span>Utilidad acum. 6 meses:</span>
                    <strong className="text-white">{formatCurrency(pnlSummary.netProfit * 6)}</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Utilidad acum. 12 meses:</span>
                    <strong className="text-white">{formatCurrency(pnlSummary.netProfit * 12)}</strong>
                  </div>
                </div>
              </div>

              {/* Escenario Optimista */}
              <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-emerald-300 text-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Optimista (+15%)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Crecimiento rápido</span>
                </div>
                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Venta mensual estimada:</span>
                    <strong className="text-slate-200">{formatCurrency(pnlSummary.grossRevenue * 1.15)}</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Utilidad neta mensual:</span>
                    <strong className="text-emerald-300">{formatCurrency(pnlSummary.netProfit * 1.25)}</strong>
                  </div>
                  <div className="flex justify-between text-slate-400 border-t border-slate-800 pt-1.5">
                    <span>Utilidad acum. 6 meses:</span>
                    <strong className="text-white">{formatCurrency((pnlSummary.netProfit * 1.25) * 6)}</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Utilidad acum. 12 meses:</span>
                    <strong className="text-white">{formatCurrency((pnlSummary.netProfit * 1.25) * 12)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* VISTA 5: LIBRO DE ENTRADAS Y SALIDAS                          */}
      {/* ============================================================== */}
      {financeTab === 'transactions' && (
        <div className="bg-slate-800/90 rounded-2xl border border-slate-700/80 p-5 shadow-xl">
          {/* Barra de Filtros de la Tabla */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-700 pb-4">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Buscador */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar descripción, proveedor o factura..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 w-60 sm:w-72"
                />
              </div>

              {/* Filtro Clasificación */}
              <select
                value={classificationFilter}
                onChange={(e) => setClassificationFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none"
              >
                <option value="all">Todas las Clasificaciones</option>
                <option value="opex">Gasto Operativo (OPEX)</option>
                <option value="capex">Inversión (CAPEX)</option>
                <option value="capital_injection">Inversión Inicial / Capital</option>
                <option value="revenue">Otros Ingresos</option>
              </select>

              {/* Filtro Categoría */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none"
              >
                <option value="all">Todas las Categorías</option>
                {Object.entries(FINANCE_CATEGORIES).map(([catKey, cat]) => (
                  <option key={catKey} value={catKey}>{cat.label}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingTransaction(null);
                setShowTransactionModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>+ Nuevo Movimiento</span>
            </button>
          </div>

          {/* Tabla de Transacciones */}
          {filteredTransactions.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No se encontraron movimientos registrados con los filtros seleccionados.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 font-mono uppercase tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="px-3 py-2.5">Fecha</th>
                    <th className="px-3 py-2.5">Tipo / Clasificación</th>
                    <th className="px-3 py-2.5">Categoría</th>
                    <th className="px-3 py-2.5">Descripción & Proveedor</th>
                    <th className="px-3 py-2.5">Sucursal</th>
                    <th className="px-3 py-2.5 text-right">Monto</th>
                    <th className="px-3 py-2.5 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60 font-mono">
                  {filteredTransactions.map((tx) => {
                    const classDef = FINANCE_CLASSIFICATIONS[tx.classification] || {};
                    const catInfo = FINANCE_CATEGORIES[tx.category] || { label: tx.category };
                    const storeName = stores.find((s) => s.id === tx.storeId)?.name || (tx.storeId === 'global' ? 'General' : tx.storeId);
                    const isExpense = tx.type === 'expense';

                    return (
                      <tr key={tx.id} className="hover:bg-slate-700/30 transition">
                        <td className="px-3 py-2.5 text-slate-400">{tx.date}</td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            tx.classification === 'opex'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : tx.classification === 'capex'
                              ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                              : tx.classification === 'capital_injection'
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                          }`}>
                            {classDef.label || tx.classification}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-300">{catInfo.label}</td>
                        <td className="px-3 py-2.5 font-sans">
                          <div className="font-semibold text-white">{tx.description}</div>
                          {(tx.vendor || tx.invoiceNumber) && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              {tx.vendor ? `Prov: ${tx.vendor}` : ''} {tx.invoiceNumber ? `· Factura: ${tx.invoiceNumber}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-300">{storeName}</td>
                        <td className={`px-3 py-2.5 text-right font-bold text-sm ${
                          isExpense ? 'text-rose-400' : 'text-emerald-400'
                        }`}>
                          {isExpense ? '-' : '+'}{formatCurrency(tx.amount)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTransaction(tx);
                                setShowTransactionModal(true);
                              }}
                              className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
                              title="Editar"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTransaction(tx.id)}
                              className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: REGISTRAR / EDITAR MOVIMIENTO FINANCIERO                */}
      {/* ============================================================== */}
      {showTransactionModal && (
        <TransactionModal
          stores={stores}
          activeStoreId={filterStoreId}
          initialData={editingTransaction}
          onClose={() => {
            setShowTransactionModal(false);
            setEditingTransaction(null);
          }}
          onSave={handleSaveTransaction}
        />
      )}

      {/* ============================================================== */}
      {/* MODAL: GESTIÓN DE PLANTILLAS Y GASTOS RECURRENTES              */}
      {/* ============================================================== */}
      {showRecurringModal && (
        <RecurringModal
          stores={stores}
          templates={recurringTemplates}
          currentUser={currentUser}
          onClose={() => setShowRecurringModal(false)}
          onApply={handleApplyRecurring}
        />
      )}
    </div>
  );
}

// ======================================================================
// COMPONENTE AUXILIAR: MODAL DE NUEVA TRANSACCIÓN
// ======================================================================
function TransactionModal({ stores, activeStoreId, initialData, onClose, onSave }) {
  const [classification, setClassification] = useState(initialData?.classification || 'opex');
  const [category, setCategory] = useState(initialData?.category || 'rent');
  const [amount, setAmount] = useState(initialData?.amount ? String(initialData.amount) : '');
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState(initialData?.description || '');
  const [storeId, setStoreId] = useState(initialData?.storeId || (activeStoreId !== 'all' ? activeStoreId : 'global'));
  const [paymentMethod, setPaymentMethod] = useState(initialData?.paymentMethod || 'transfer');
  const [vendor, setVendor] = useState(initialData?.vendor || '');
  const [invoiceNumber, setInvoiceNumber] = useState(initialData?.invoiceNumber || '');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [isRecurring, setIsRecurring] = useState(Boolean(initialData?.isRecurring));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Filtrar categorías que corresponden a la clasificación seleccionada
  const availableCategories = useMemo(() => {
    return Object.entries(FINANCE_CATEGORIES).filter(([, cat]) => cat.classification === classification);
  }, [classification]);

  // Si cambia la clasificación, seleccionar por defecto la primera categoría de esa clasificación
  const handleClassificationChange = (newClass) => {
    setClassification(newClass);
    const firstCat = Object.entries(FINANCE_CATEGORIES).find(([, cat]) => cat.classification === newClass);
    if (firstCat) setCategory(firstCat[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Escribe una descripción del movimiento.');
      return;
    }
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setError('Ingresa un monto numérico positivo.');
      return;
    }

    try {
      setBusy(true);
      setError(null);
      await onSave({
        classification,
        category,
        amount: numAmount,
        date,
        description: description.trim(),
        storeId,
        paymentMethod,
        vendor: vendor.trim(),
        invoiceNumber: invoiceNumber.trim(),
        notes: notes.trim(),
        isRecurring,
      });
    } catch (err) {
      setError(err.message || 'Error al guardar');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-800 p-5 sm:p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-start justify-between border-b border-slate-700 pb-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-cyan-400" />
              {initialData ? 'Editar Movimiento Financiero' : 'Registrar Nuevo Movimiento'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Captura salidas operativas (renta, nómina), inversiones de mobiliario (CAPEX) o entradas de capital
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Clasificación Principal */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">
              Tipo de Clasificación Contable:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(FINANCE_CLASSIFICATIONS).map(([key, def]) => {
                const isSelected = classification === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleClassificationChange(key)}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-md'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <span className="block font-bold text-xs">{def.label.split(' ')[0]}</span>
                    <span className="text-[10px] text-slate-400 line-clamp-1">{def.key.toUpperCase()}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {FINANCE_CLASSIFICATIONS[classification]?.description}
            </p>
          </div>

          {/* Categoría y Monto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Categoría:</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400"
              >
                {availableCategories.map(([key, cat]) => (
                  <option key={key} value={key}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Monto ($ MXN):</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 pl-7 pr-3 py-2 text-slate-100 font-mono font-bold focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Descripción / Concepto:</label>
            <input
              type="text"
              required
              placeholder="Ej. Renta local mes de Octubre, 3 Anaqueles metálicos de 5 niveles..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* Fecha, Tienda y Método de Pago */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Fecha:</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Sucursal / Tienda:</label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400"
              >
                <option value="global">Corporativo / General</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Método de Pago:</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400"
              >
                <option value="transfer">Transferencia Bancaria</option>
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta Débito / Crédito</option>
                <option value="credit">Crédito Comercial</option>
              </select>
            </div>
          </div>

          {/* Proveedor y Factura (Opcionales) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Proveedor / Beneficiario (Opcional):</label>
              <input
                type="text"
                placeholder="Ej. CFE, Inmobiliaria Real, Home Depot"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Folio / Factura / Nota (Opcional):</label>
              <input
                type="text"
                placeholder="Ej. FAC-48912"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* Notas Adicionales */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">Notas / Observaciones (Opcional):</label>
            <textarea
              rows={2}
              placeholder="Detalles adicionales sobre la garantía, condiciones o amortización..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-400 resize-none"
            />
          </div>

          {/* Opción Recurrente */}
          {classification === 'opex' && (
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700 focus:ring-cyan-400"
              />
              <span>Guardar también como gasto recurrente para los siguientes meses</span>
            </label>
          )}

          <div className="pt-3 border-t border-slate-700 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-xl border border-slate-600 bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg transition active:scale-95 disabled:opacity-50"
            >
              {busy ? 'Guardando...' : initialData ? 'Actualizar Movimiento' : 'Guardar Movimiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ======================================================================
// COMPONENTE AUXILIAR: MODAL DE GASTOS RECURRENTES
// ======================================================================
function RecurringModal({ stores, templates, currentUser, onClose, onApply }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('rent');
  const [amount, setAmount] = useState('');
  const [storeId, setStoreId] = useState('global');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!description.trim() || !Number.isFinite(numAmount) || numAmount <= 0) {
      setError('Verifica la descripción y el monto.');
      return;
    }
    try {
      setBusy(true);
      setError(null);
      await saveRecurringTemplate({
        description: description.trim(),
        category,
        classification: 'opex',
        amount: numAmount,
        storeId,
        dayOfMonth: Number(dayOfMonth) || 1,
        user: currentUser,
      });
      setShowAddForm(false);
      setDescription('');
      setAmount('');
      setBusy(false);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('¿Eliminar esta plantilla de gasto recurrente?')) return;
    try {
      await deleteRecurringTemplate(id);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-800 p-5 sm:p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-start justify-between border-b border-slate-700 pb-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Repeat className="w-5 h-5 text-amber-400" />
              Gastos Recurrentes Programados
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Automatiza la renta mensual, nómina quincenal, internet y otros gastos fijos
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Botón principal de generar */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-amber-300 block">
              Generar gastos fijos de este mes:
            </span>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Aplica con un solo clic todas las plantillas registradas en el mes actual sin duplicados.
            </p>
          </div>
          <button
            type="button"
            onClick={onApply}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition whitespace-nowrap cursor-pointer active:scale-95"
          >
            ⚡ Aplicar Gastos del Mes
          </button>
        </div>

        {/* Lista de plantillas existentes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">Plantillas Activas:</span>
            {!showAddForm && (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Nueva Plantilla
              </button>
            )}
          </div>

          {templates.length === 0 ? (
            <p className="text-slate-500 text-xs italic py-4 text-center">
              No tienes plantillas de gastos recurrentes. Agrega la renta, el internet o la nómina para generarlos cada mes.
            </p>
          ) : (
            <div className="divide-y divide-slate-700 border border-slate-700 rounded-xl bg-slate-900/60 overflow-hidden text-xs">
              {templates.map((tpl) => (
                <div key={tpl.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-800/50">
                  <div>
                    <span className="font-bold text-white block">{tpl.description}</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {FINANCE_CATEGORIES[tpl.category]?.label || tpl.category} · Día {tpl.dayOfMonth || 1} de cada mes
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-amber-300 text-sm">
                      {formatCurrency(tpl.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(tpl.id)}
                      className="text-slate-400 hover:text-rose-400 p-1"
                      title="Eliminar plantilla"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Formulario para agregar nueva plantilla */}
        {showAddForm && (
          <form onSubmit={handleSaveTemplate} className="p-4 border border-cyan-500/30 rounded-xl bg-slate-900 space-y-3 text-xs">
            <span className="font-bold text-cyan-300 block">Agregar Gasto Recurrente:</span>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Descripción:</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Renta local Centro, Internet CFE Telecom"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Monto Mensual ($ MXN):</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-slate-100 font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Categoría:</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-slate-100 focus:outline-none"
                >
                  <option value="rent">Renta del Local</option>
                  <option value="payroll">Nómina y Sueldos</option>
                  <option value="utilities">Servicios (Luz, Agua, Internet)</option>
                  <option value="maintenance">Mantenimiento</option>
                  <option value="marketing">Publicidad</option>
                  <option value="other_opex">Otro Gasto Fijo</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Día de Cobro (1-31):</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-slate-100 font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Sucursal:</label>
                <select
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-slate-100 focus:outline-none"
                >
                  <option value="global">General / Todas</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition"
              >
                {busy ? 'Guardando...' : 'Guardar Plantilla'}
              </button>
            </div>
          </form>
        )}

        <div className="pt-3 border-t border-slate-700 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
