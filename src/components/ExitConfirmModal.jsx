import { Power } from 'lucide-react';

export default function ExitConfirmModal({ isOpen, onClose, onConfirm }) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/20 text-rose-400 shadow-lg shadow-rose-500/10">
          <Power className="h-7 w-7" />
        </div>
        <div>
          <h3 id="exit-modal-title" className="text-lg font-bold text-white">
            ¿Cerrar aplicación?
          </h3>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Se cerrará POSKlean y saldrás del modo kiosko. Asegúrate de haber guardado tus operaciones antes de salir.
          </p>
        </div>
        <div className="flex gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-600/30 transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Cerrar POS</span>
          </button>
        </div>
      </div>
    </div>
  );
}
