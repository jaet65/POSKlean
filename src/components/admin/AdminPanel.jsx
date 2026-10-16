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
  const canManageChannels = isAdmin || currentUser?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
  const adminCount = usersList.filter((user) => user.role === 'admin' || user.email === SUPER_ADMIN_EMAIL).length;

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
            <p className="text-xs text-slate-400 mt-0.5">Selecciona el ancho del papel para los tickets.</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            Ancho del ticket
            <select
              value={receiptWidth}
              onChange={(event) => onReceiptWidthChange(event.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-slate-200"
            >
              <option value="58">58 mm</option>
              <option value="80">80 mm</option>
            </select>
          </label>
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
