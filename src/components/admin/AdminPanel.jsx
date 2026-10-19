import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Globe,
  Monitor,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Smartphone,
  Users,
  Zap,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { SUPER_ADMIN_EMAIL } from '../../services/userService';
import ChannelsPanel from '../ChannelsPanel';
import StoresSection from './StoresSection';
import UsersSection from './UsersSection';

function MetricCard({ icon: Icon, label, value, iconClass, valueClass = 'text-white' }) {
  return (
    <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex items-center gap-3">
      <div className={`p-3 rounded-xl border ${iconClass}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className={`text-2xl font-bold font-mono ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}

export default function AdminPanel({
  currentUser,
  isAdmin,
  receiptWidth = '58',
  defaultPrinter = '',
  silentPrint = false,
  receiptWidthStoreId,
  receiptWidthStoreName,
  canEditReceiptWidth,
  isSavingReceiptWidth,
  onReceiptWidthChange,
  onSavePrintSettings,
  onTestPrint,
  channels,
  successMessage,
  onDismissSuccess,
  usersList,
  usersLoading,
  pendingUsersCount,
  stores,
  storeNameById,
  storeError,
  isSavingStore,
  onOpenStoreModal,
  onStoreStatusChange,
  onAddUser,
  onEditUser,
  onDeleteUser,
}) {
  const [open, setOpen] = useState(false);
  const [receiptWidthDraft, setReceiptWidthDraft] = useState(receiptWidth);
  const [defaultPrinterDraft, setDefaultPrinterDraft] = useState(defaultPrinter);
  const [silentPrintDraft, setSilentPrintDraft] = useState(silentPrint);
  const [printers, setPrinters] = useState([]);
  const [isScanningPrinters, setIsScanningPrinters] = useState(false);
  const [isManualPrinter, setIsManualPrinter] = useState(false);
  const [printFeedback, setPrintFeedback] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  const isElectron = Boolean(window?.posNative?.isElectron || window?.posNative?.exitApp);
  const isCapacitor = Boolean(Capacitor?.isNativePlatform?.());
  const isStandalone = typeof window !== 'undefined' && (
    Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    Boolean(navigator?.standalone || document?.referrer?.includes('android-app://'))
  );
  const isPWA = !isElectron && !isCapacitor;
  const capacitorPlatform = isCapacitor ? (Capacitor.getPlatform() === 'android' ? 'Android' : Capacitor.getPlatform() === 'ios' ? 'iOS' : 'Nativo') : '';

  const canManageChannels = isAdmin || currentUser?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
  const adminCount = usersList.filter((user) => user.role === 'admin' || user.email === SUPER_ADMIN_EMAIL).length;

  useEffect(() => {
    setReceiptWidthDraft(receiptWidth);
    setDefaultPrinterDraft(defaultPrinter);
    setSilentPrintDraft(silentPrint);
  }, [receiptWidth, defaultPrinter, silentPrint, receiptWidthStoreId]);

  const loadPrinters = async () => {
    setIsScanningPrinters(true);
    let list = [];
    try {
      // 1. Intentar consultar mediante el bridge de Electron si está disponible
      if (window?.posNative?.getPrinters) {
        try {
          const nativeList = await window.posNative.getPrinters();
          if (Array.isArray(nativeList) && nativeList.length > 0) {
            list = nativeList;
          }
        } catch (nativeErr) {
          console.warn('Error al consultar getPrinters nativo:', nativeErr);
        }
      }

      // 2. Si no se obtuvieron impresoras, consultar endpoint de desarrollo o backend
      if (list.length === 0) {
        try {
          const resp = await fetch('/__api__/printers');
          if (resp.ok) {
            const apiList = await resp.json();
            if (Array.isArray(apiList) && apiList.length > 0) {
              list = apiList;
            }
          }
        } catch {
          // Sin conexión al servidor local o modo producción
        }
      }

      if (list.length > 0) {
        // Eliminar duplicados si los hubiera
        const uniqueMap = new Map();
        list.forEach((p) => {
          if (p?.name && !uniqueMap.has(p.name)) {
            uniqueMap.set(p.name, p);
          }
        });
        setPrinters(Array.from(uniqueMap.values()));
      }
    } catch (err) {
      console.error('Error al consultar impresoras del sistema:', err);
    } finally {
      setIsScanningPrinters(false);
    }
  };

  useEffect(() => {
    loadPrinters();
  }, []);

  const hasPendingChanges = (
    String(receiptWidthDraft) !== String(receiptWidth)
    || (silentPrintDraft ? defaultPrinterDraft !== defaultPrinter : false)
    || Boolean(silentPrintDraft) !== Boolean(silentPrint)
  );

  const handleSaveSettings = async () => {
    const width = Number(receiptWidthDraft);
    if (!Number.isFinite(width) || width < 30 || width > 120) {
      setReceiptWidthDraft(receiptWidth);
      return;
    }
    const payload = {
      receiptWidth: String(width),
      defaultPrinter: silentPrintDraft ? defaultPrinterDraft.trim() : '',
      silentPrint: Boolean(silentPrintDraft),
    };
    let saved = false;
    if (onSavePrintSettings) {
      saved = await onSavePrintSettings(payload);
    } else if (onReceiptWidthChange) {
      saved = await onReceiptWidthChange(String(width));
    }
    if (saved) {
      setPrintFeedback('Configuración guardada correctamente.');
      setTimeout(() => setPrintFeedback(''), 3500);
    }
  };

  const handleTestPrintClick = () => {
    if (onTestPrint) {
      setIsTesting(true);
      onTestPrint({
        defaultPrinter: silentPrintDraft ? defaultPrinterDraft : '',
        silentPrint: silentPrintDraft,
        receiptWidth: receiptWidthDraft,
      });
      setTimeout(() => setIsTesting(false), 1500);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          icon={Users}
          label="Total de Usuarios"
          value={usersList.length}
          iconClass="bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
        />
        <MetricCard
          icon={ShieldCheck}
          label="Administradores"
          value={adminCount}
          iconClass="bg-purple-500/10 text-purple-400 border-purple-500/20"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Pendientes de Aprobación"
          value={pendingUsersCount}
          iconClass={pendingUsersCount > 0
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}
          valueClass={pendingUsersCount > 0 ? 'text-amber-400' : 'text-emerald-400'}
        />
      </div>

      {/* CONFIGURACIÓN DE IMPRESIÓN (ESTILO COLAPSABLE CONSISTENTE CON USUARIOS, CANALES Y TIENDAS) */}
      <section className="bg-slate-800 rounded-2xl border border-slate-700 p-4 shadow-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setOpen((previous) => !previous)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {open ? <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" /> : <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />}
            <span>
              <span className="text-base font-bold text-white flex items-center gap-2">
                <Printer className="w-5 h-5 text-cyan-400" />
                Configuración de impresión
                {isElectron && (
                  <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <Monitor className="w-3 h-3" /> PC
                  </span>
                )}
                {isCapacitor && (
                  <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                    <Smartphone className="w-3 h-3" /> Mobile {capacitorPlatform}
                  </span>
                )}
                {isPWA && (
                  <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                    <Globe className="w-3 h-3" /> {isStandalone ? 'PWA' : 'WEB'}
                  </span>
                )}
              </span>
              <span className="block text-xs text-slate-400 mt-0.5">
                {receiptWidthStoreName
                  ? `Configuración para ${receiptWidthStoreName}.`
                  : 'Configura el modo de impresión y ancho de ticket.'}
                {` · ${receiptWidthDraft} mm · Modo: ${silentPrintDraft ? `Silencioso (${defaultPrinterDraft || 'Predeterminada'})` : 'Con diálogo'}`}
              </span>
            </span>
          </button>
        </div>

        {open && (
          <div className="space-y-4 pt-2">
            {/* Config Cards Grid */}
            <div className={`grid grid-cols-1 ${silentPrintDraft ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
              {/* Card 1: Modo de Impresión (Silenciosa / Con Diálogo) */}
              <div className="bg-slate-900/60 rounded-xl border border-slate-700/70 p-3.5 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Zap className={`w-4 h-4 ${silentPrintDraft ? 'text-amber-400' : 'text-slate-400'}`} />
                      Modo de Impresión (Silent Print)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {silentPrintDraft
                      ? 'Los tickets se envían directamente a la impresora seleccionada sin abrir ventanas de confirmación.'
                      : 'El sistema operativo abre la ventana de impresión en cada ticket para seleccionar la impresora manualmente.'}
                  </p>
                </div>

                <div className="flex items-center justify-between bg-slate-950/60 rounded-lg p-2.5 border border-slate-800">
                  <span className={`text-xs font-medium ${silentPrintDraft ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                    {silentPrintDraft ? 'Activada (Directo sin diálogo)' : 'Desactivada (Con diálogo)'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={silentPrintDraft}
                    onClick={() => setSilentPrintDraft(!silentPrintDraft)}
                    disabled={!canEditReceiptWidth || isSavingReceiptWidth}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${silentPrintDraft ? 'bg-cyan-500' : 'bg-slate-700'
                      }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${silentPrintDraft ? 'translate-x-5 bg-white' : 'translate-x-0 bg-slate-300'
                        }`}
                    />
                  </button>
                </div>
              </div>

              {/* Card 2: Impresora por Defecto (SOLO VISIBLE CUANDO LA IMPRESIÓN SILENCIOSA ESTÁ ACTIVADA) */}
              {silentPrintDraft && (
                <div className="bg-slate-900/60 rounded-xl border border-cyan-500/30 p-3.5 flex flex-col justify-between gap-3 shadow-sm">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <Printer className="w-4 h-4 text-cyan-400" />
                        Impresora de Destino
                      </span>
                      <button
                        type="button"
                        onClick={loadPrinters}
                        disabled={isScanningPrinters}
                        title="Volver a escanear impresoras del sistema"
                        className="text-slate-400 hover:text-cyan-400 transition p-1 rounded-md hover:bg-slate-800"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isScanningPrinters ? 'animate-spin text-cyan-400' : ''}`} />
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed mb-2.5">
                      Selecciona la impresora a la que se enviarán los tickets silenciosos automáticamente.
                    </p>
                  </div>

                  <div>
                    <datalist id="printer-suggestions">
                      <option value="POS-58" />
                      <option value="POS-80" />
                      <option value="EPSON TM-T20" />
                      <option value="XP-58" />
                      <option value="XP-80" />
                      <option value="Generic / Text Only" />
                      {printers.map((p) => (
                        <option key={`dl-${p.name}`} value={p.name} />
                      ))}
                    </datalist>

                    {!isManualPrinter ? (
                      <div className="space-y-1.5">
                        <select
                          id="printer-select"
                          value={defaultPrinterDraft}
                          onChange={(e) => setDefaultPrinterDraft(e.target.value)}
                          disabled={!canEditReceiptWidth || isSavingReceiptWidth}
                          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                        >
                          <option value="">(Predeterminada del sistema)</option>
                          {printers.map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.displayName || p.name} {p.isDefault ? '★ (Predeterminada)' : ''}
                            </option>
                          ))}
                          {defaultPrinterDraft && !printers.some((p) => p.name === defaultPrinterDraft) && (
                            <option value={defaultPrinterDraft}>{defaultPrinterDraft} (Configurada)</option>
                          )}
                        </select>
                        <div className="flex justify-between items-center text-[10px] text-slate-500 pt-0.5">
                          <span>
                            {printers.length > 0
                              ? `${printers.length} detectada${printers.length === 1 ? '' : 's'}`
                              : isScanningPrinters
                                ? 'Buscando impresoras...'
                                : '0 detectadas'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsManualPrinter(true)}
                            className="text-cyan-400 hover:underline"
                          >
                            Ingresar manual
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          list="printer-suggestions"
                          value={defaultPrinterDraft}
                          onChange={(e) => setDefaultPrinterDraft(e.target.value)}
                          placeholder="Ej. POS-58, POS-80 o EPSON TM-T20"
                          disabled={!canEditReceiptWidth || isSavingReceiptWidth}
                          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                        />
                        <div className="flex justify-between items-center text-[10px] text-slate-500 pt-0.5">
                          <span>Escribe el nombre de la impresora</span>
                          <button
                            type="button"
                            onClick={() => setIsManualPrinter(false)}
                            className="text-cyan-400 hover:underline"
                          >
                            Volver a la lista
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Card 3: Ancho del Ticket */}
              <div className="bg-slate-900/60 rounded-xl border border-slate-700/70 p-3.5 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-purple-400" />
                      Ancho del Ticket
                    </span>
                    <span className="text-xs font-mono font-bold text-cyan-400">
                      {receiptWidthDraft} mm
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-2">
                    Ajusta el ancho de los tickets térmicos según el rollo de papel (58mm u 80mm).
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {[58, 80].map((width) => (
                      <button
                        key={width}
                        type="button"
                        onClick={() => setReceiptWidthDraft(String(width))}
                        disabled={!canEditReceiptWidth || isSavingReceiptWidth}
                        aria-pressed={Number(receiptWidthDraft) === width}
                        className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${Number(receiptWidthDraft) === width
                          ? 'border-cyan-500/40 bg-cyan-500/20 text-cyan-200 shadow-sm'
                          : 'border-slate-600 bg-slate-900 text-slate-300 hover:bg-slate-700'
                          }`}
                      >
                        {width} mm
                      </button>
                    ))}
                    <div className="flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1">
                      <input
                        id="receipt-width"
                        type="number"
                        min="30"
                        max="120"
                        step="0.5"
                        value={receiptWidthDraft}
                        onChange={(event) => setReceiptWidthDraft(event.target.value)}
                        onBlur={() => {
                          const width = Number(receiptWidthDraft);
                          if (!Number.isFinite(width) || width < 30 || width > 120) {
                            setReceiptWidthDraft(receiptWidth);
                          }
                        }}
                        disabled={!canEditReceiptWidth || isSavingReceiptWidth}
                        aria-label="Ancho del ticket en milímetros"
                        className="w-12 bg-transparent text-right text-xs text-slate-200 focus:outline-none"
                      />
                      <span className="text-[11px] text-slate-400">mm</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-700/60">
              <div className="flex items-center gap-2">
                {printFeedback && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                    <Check className="w-3.5 h-3.5" /> {printFeedback}
                  </span>
                )}
                {hasPendingChanges && !printFeedback && (
                  <span className="text-xs text-amber-400/90 font-medium bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                    ● Cambios sin guardar
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestPrintClick}
                  disabled={isTesting}
                  title="Imprime un ticket térmico de prueba con los ajustes actuales"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition disabled:opacity-50"
                >
                  <Printer className={`w-3.5 h-3.5 ${isTesting ? 'animate-pulse text-cyan-400' : ''}`} />
                  <span>{isTesting ? 'Imprimiendo...' : 'Probar Impresión'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={!canEditReceiptWidth || isSavingReceiptWidth || !Number.isFinite(Number(receiptWidthDraft)) || Number(receiptWidthDraft) < 30 || Number(receiptWidthDraft) > 120}
                  className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingReceiptWidth ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {isAdmin && (
        <UsersSection
          usersList={usersList}
          usersLoading={usersLoading}
          stores={stores}
          storeNameById={storeNameById}
          onAddUser={onAddUser}
          onEditUser={onEditUser}
          onDeleteUser={onDeleteUser}
        />
      )}

      {canManageChannels && <ChannelsPanel channels={channels} currentUser={currentUser} />}

      {successMessage && (
        <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-3 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
          <button type="button" onClick={onDismissSuccess} className="text-emerald-400 hover:text-white text-sm">
            ✕
          </button>
        </div>
      )}

      {isAdmin && (
        <StoresSection
          stores={stores}
          usersList={usersList}
          storeError={storeError}
          isSavingStore={isSavingStore}
          onOpenStoreModal={onOpenStoreModal}
          onStoreStatusChange={onStoreStatusChange}
        />
      )}
    </div>
  );
}
