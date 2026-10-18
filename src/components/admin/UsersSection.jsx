import { useState } from 'react';
import { ChevronDown, ChevronRight, Edit, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { SUPER_ADMIN_EMAIL } from '../../services/userService';

const ROLE_LABELS = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  cajero: 'Cajero',
};

const ROLE_STYLES = {
  admin: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  supervisor: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  cajero: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

const PERMISSION_BADGES = [
  { key: 'pos', label: 'POS', color: 'text-cyan-300' },
  { key: 'inventory', label: 'Inventario', color: 'text-emerald-300' },
  { key: 'sales', label: 'Ventas', color: 'text-blue-300' },
  { key: 'users', label: 'Usuarios', color: 'text-purple-300' },
];

function UserRow({ user, stores, storeNameById, onEditUser, onDeleteUser }) {
  const isMainAdmin = user.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
  const perms = user.permissions || {};
  const displayTitle = user.displayName || user.username || user.email || 'Sin nombre';
  const subtitle = user.username ? `@${user.username}` : user.email;
  const hasAnyPermission = PERMISSION_BADGES.some(({ key }) => perms[key]);

  return (
    <tr className="hover:bg-slate-700/30 transition">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {user.photoURL ? (
            <img src={user.photoURL} alt={displayTitle} className="w-8 h-8 rounded-full border border-slate-600 object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-700 text-cyan-300 flex items-center justify-center font-bold text-xs border border-slate-600">
              {(displayTitle || 'U')[0].toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold text-slate-100 flex items-center gap-1.5">
              <span>{displayTitle}</span>
              {isMainAdmin && (
                <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.2 rounded-md font-bold">
                  Super Admin
                </span>
              )}
              {user.authType === 'credentials' && (
                <span className="text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.2 rounded-md font-medium">
                  Usuario / Clave
                </span>
              )}
            </p>
            <p className="text-slate-400 text-[11px] font-mono">{subtitle}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
          ROLE_STYLES[user.role] || 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        }`}>
          {ROLE_LABELS[user.role] || 'Personalizado'}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-300">
        {user.storeId ? (
          <span>
            {storeNameById.get(user.storeId) || user.storeId}
            {stores.find((store) => store.id === user.storeId)?.status === 'archived' && (
              <span className="ml-1 text-[10px] text-amber-400">(Archivada)</span>
            )}
          </span>
        ) : (
          <span className="text-slate-500">{user.role === 'cajero' ? 'Sin asignar' : '—'}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {PERMISSION_BADGES.filter(({ key }) => perms[key]).map(({ key, label, color }) => (
            <span key={key} className={`bg-slate-900 border border-slate-700 ${color} px-1.5 py-0.5 rounded text-[10px] font-mono`}>
              {label}
            </span>
          ))}
          {!hasAnyPermission && <span className="text-slate-500 text-[11px] italic">Sin permisos</span>}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
          user.status === 'active' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
          user.status === 'pending' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse' :
          'bg-red-500/15 text-red-300 border-red-500/30'
        }`}>
          {user.status === 'active' ? '● Activo' : user.status === 'pending' ? '▲ Pendiente' : '✕ Inactivo'}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
        {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString('es-MX', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
        }) : 'Nunca'}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onEditUser(user)}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-2.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1 border border-slate-600 cursor-pointer"
            title="Editar usuario y permisos"
          >
            <Edit className="w-3 h-3" />
            <span>Editar</span>
          </button>
          {!isMainAdmin && (
            <button
              type="button"
              onClick={() => onDeleteUser(user)}
              className="bg-slate-700/60 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 text-slate-400 p-1.5 rounded-lg transition border border-slate-700 cursor-pointer"
              title="Eliminar usuario"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function UsersSection({
  usersList,
  usersLoading,
  stores,
  storeNameById,
  onAddUser,
  onEditUser,
  onDeleteUser,
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-md">
      <div className="p-4 flex justify-between items-center flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" /> : <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />}
          <span>
            <span className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
              Usuarios y Permisos
            </span>
            <span className="block text-xs text-slate-400 mt-0.5">
              Permite a los administradores conceder o revocar accesos en tiempo real
              {` · ${usersList.length} usuario${usersList.length === 1 ? '' : 's'}`}
            </span>
          </span>
        </button>
      </div>

      {open && (
        <>
          {usersLoading && (
            <div className="p-4 text-center text-xs text-slate-400">
              Cargando directorio de usuarios...
            </div>
          )}
          <div className="flex justify-end" style={{ marginBottom: '0.5rem' }}>
            <button
              type="button"
              onClick={onAddUser}
              className="mr-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Nuevo Usuario</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Tienda asignada</th>
                  <th className="px-4 py-3">Permisos Activos</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Último Acceso</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {usersList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                      <p className="font-semibold text-slate-200 text-sm">No hay usuarios registrados</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Agrega colaboradores para asignarles acceso al Punto de Venta o Inventario.
                      </p>
                    </td>
                  </tr>
                ) : (
                  usersList.map((user) => (
                    <UserRow
                      key={user.id || user.username || user.email}
                      user={user}
                      stores={stores}
                      storeNameById={storeNameById}
                      onEditUser={onEditUser}
                      onDeleteUser={onDeleteUser}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
