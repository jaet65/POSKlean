import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, ShieldCheck, Users } from 'lucide-react';
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
  receiptWidth,
  receiptWidthStoreId,
  receiptWidthStoreName,
  canEditReceiptWidth,
  isSavingReceiptWidth,
  onReceiptWidthChange,
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
  const [receiptWidthDraft, setReceiptWidthDraft] = useState(receiptWidth);
  const canManageChannels = isAdmin || currentUser?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
  const adminCount = usersList.filter((user) => user.role === 'admin' || user.email === SUPER_ADMIN_EMAIL).length;

  useEffect(() => setReceiptWidthDraft(receiptWidth), [receiptWidth, receiptWidthStoreId]);

  const updateReceiptWidthDraft = (value) => {
    setReceiptWidthDraft(value);
  };

  const commitReceiptWidthDraft = () => {
    const width = Number(receiptWidthDraft);
    if (!Number.isFinite(width) || width < 30 || width > 120) {
      setReceiptWidthDraft(receiptWidth);
    }
  };

  const selectReceiptWidth = (width) => {
    const nextWidth = String(width);
    setReceiptWidthDraft(nextWidth);
    onReceiptWidthChange(nextWidth).then((saved) => {
      if (!saved) setReceiptWidthDraft(receiptWidth);
    });
  };

  const saveReceiptWidthDraft = async () => {
    const width = Number(receiptWidthDraft);
    if (!Number.isFinite(width) || width < 30 || width > 120) {
      setReceiptWidthDraft(receiptWidth);
      return;
    }
    const saved = await onReceiptWidthChange(String(width));
    if (!saved) setReceiptWidthDraft(receiptWidth);
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
      
      <section className="bg-slate-800 rounded-2xl border border-slate-700 p-4 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white">Configuración de impresión</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {receiptWidthStoreName
                ? `Configuración para ${receiptWidthStoreName}.`
                : 'Selecciona una tienda para configurar su ancho de ticket.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="receipt-width" className="text-xs text-slate-400">Ancho del ticket</label>
            <div className="flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-900 p-1">
              <input
                id="receipt-width"
                type="number"
                min="30"
                max="120"
                step="0.5"
                value={receiptWidthDraft}
                onChange={(event) => updateReceiptWidthDraft(event.target.value)}
                onBlur={commitReceiptWidthDraft}
                disabled={!canEditReceiptWidth || isSavingReceiptWidth}
                aria-label="Ancho del ticket en milímetros"
                className="w-20 bg-transparent px-1 py-1 text-right text-sm text-slate-200 focus:outline-none"
              />
              <span className="pr-1 text-xs text-slate-400">mm</span>
            </div>
            <button
              type="button"
              onClick={saveReceiptWidthDraft}
              disabled={!canEditReceiptWidth || isSavingReceiptWidth
                || !Number.isFinite(Number(receiptWidthDraft))
                || Number(receiptWidthDraft) < 30 || Number(receiptWidthDraft) > 120
                || Number(receiptWidthDraft) === Number(receiptWidth)}
              className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingReceiptWidth ? 'Guardando...' : 'Guardar'}
            </button>
            {[58, 80].map((width) => (
              <button
                key={width}
                type="button"
                onClick={() => selectReceiptWidth(width)}
                disabled={!canEditReceiptWidth || isSavingReceiptWidth}
                aria-pressed={Number(receiptWidth) === width}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  Number(receiptWidth) === width
                    ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                    : 'border-slate-600 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {width} mm
              </button>
            ))}
          </div>
        </div>
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
