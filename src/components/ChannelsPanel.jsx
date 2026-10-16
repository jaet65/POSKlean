import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Store, Trash2 } from 'lucide-react';
import {
  DEFAULT_CHANNELS,
  addSalesChannel,
  deleteSalesChannel,
  seedDefaultChannels,
  updateSalesChannel,
} from '../services/channelService';

const inputClass = 'w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none';

export default function ChannelsPanel({ channels, currentUser }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null); // { id, name }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
      return true;
    } catch (caught) {
      setError(caught.message || 'No se pudo completar la operación.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const ok = await run(() => (editing
      ? updateSalesChannel(editing.id, name, channels)
      : addSalesChannel(name, channels, currentUser)));
    if (ok) {
      setName('');
      setEditing(null);
    }
  };

  const remove = (channel) => {
    if (!window.confirm(`¿Eliminar el canal "${channel.name}"? Las ventas ya registradas conservan su canal.`)) return;
    run(() => deleteSalesChannel(channel.id));
  };

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
              Canales de venta
            </span>
            <span className="block text-xs text-slate-400 mt-0.5">
              Opciones que se ofrecen en el punto de venta al armar un ticket.
              {` · ${channels.length} canal${channels.length === 1 ? '' : 'es'}`}
            </span>
          </span>
        </button>
      </div>

      {open && (
      <>
      <form onSubmit={submit} className="flex gap-2">
        <input
          aria-label="Nombre del canal"
          required
          maxLength={60}
          placeholder={editing ? 'Nuevo nombre del canal' : 'Nuevo canal (ej. Rappi)'}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
        />
        <button type="submit" disabled={busy} className="flex items-center gap-1 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">
          {editing ? 'Guardar' : <><Plus className="h-3.5 w-3.5" /> Agregar</>}
        </button>
        {editing && (
          <button type="button" onClick={() => { setEditing(null); setName(''); setError(''); }} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-slate-100">
            Cancelar
          </button>
        )}
      </form>

      {error && <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/20 p-2 text-xs text-rose-200">{error}</p>}

      {channels.length === 0 ? (
        <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300">
          <p>
            Aún no hay canales configurados; el punto de venta usa los predeterminados ({DEFAULT_CHANNELS.join(', ')}).
          </p>
          <button type="button" disabled={busy} onClick={() => run(() => seedDefaultChannels(currentUser))} className="rounded-lg bg-slate-700 px-3 py-1.5 font-bold text-slate-100 hover:bg-slate-600 disabled:opacity-50">
            Crear canales predeterminados para editarlos
          </button>
        </div>
      ) : (
        <ul className="space-y-1">
          {channels.map((channel) => (
            <li key={channel.id} className="flex items-center justify-between rounded-lg bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
              <span className="flex items-center gap-2"><Store className="h-4 w-4 text-cyan-400" />{channel.name}</span>
              <span className="flex items-center gap-3">
                <button type="button" disabled={busy} aria-label={`Editar ${channel.name}`} onClick={() => { setEditing(channel); setName(channel.name); setError(''); }} className="text-slate-300 hover:text-white disabled:opacity-50">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" disabled={busy} aria-label={`Eliminar ${channel.name}`} onClick={() => remove(channel)} className="text-rose-300 hover:text-rose-200 disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      </>
      )}
    </section>
  );
}
