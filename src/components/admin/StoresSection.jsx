import { useState } from 'react';
import { ChevronDown, ChevronRight, Store } from 'lucide-react';

export default function StoresSection({
  stores,
  usersList,
  storeError,
  isSavingStore,
  onOpenStoreModal,
  onStoreStatusChange,
}) {
  const [open, setOpen] = useState(false);

  return (
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
              <Store className="w-5 h-5 text-cyan-400" />
              Tiendas
            </span>
            <span className="block text-xs text-slate-400 mt-0.5">
              Administra la información de las tiendas y los cajeros asignados.
              {` · ${stores.length} tienda${stores.length === 1 ? '' : 's'}`}
            </span>
          </span>
        </button>
        
      </div>
      {open && (
        <>
        <div className="flex justify-end" style={{ marginBottom: '0.5rem' }}>
          <button
            type="button"
            onClick={() => onOpenStoreModal()}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-400"
          >
            Agregar tienda
          </button>
        </div>
          {storeError && <p className="text-xs text-red-300">{storeError}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {stores.map((store) => (
              <div key={store.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-300">
                    <Store className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                    <span className="truncate">{store.name}</span>
                    {store.status === 'archived' && (
                      <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">
                        Archivada
                      </span>
                    )}
                  </span>
                  {store.address && <p className="mt-1 truncate text-[11px] text-slate-400">{store.address}</p>}
                  {store.phone && <p className="text-[11px] text-slate-400">{store.phone}</p>}
                  <p className="mt-1 text-[11px] text-slate-500">
                    Cajeros: {usersList
                      .filter((user) => user.role === 'cajero' && user.storeId === store.id)
                      .map((user) => user.displayName || user.username || user.email)
                      .join(', ') || 'Sin asignar'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onOpenStoreModal(store)}
                    disabled={isSavingStore}
                    className="rounded-lg bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-600 disabled:opacity-50"
                  >
                    Editar
                  </button>
                  {store.status !== 'archived' ? (
                    <button
                      type="button"
                      onClick={() => onStoreStatusChange(store, 'archived')}
                      disabled={isSavingStore}
                      className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      Archivar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStoreStatusChange(store, 'active')}
                      disabled={isSavingStore}
                      className="rounded-lg bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-600 disabled:opacity-50"
                    >
                      Reactivar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
