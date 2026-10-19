import { useState, useEffect } from 'react';
import { Power, Minimize2, Maximize2, LogOut, AlertTriangle, X } from 'lucide-react';

export default function ExitConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  onExitApp,
  onToggleFullScreen,
  onShutdownSystem,
}) {
  const [isConfirmingShutdown, setIsConfirmingShutdown] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(true);

  useEffect(() => {
    if (!isOpen) {
      setIsConfirmingShutdown(false);
      return;
    }
    // Consultar estado de pantalla completa
    if (window?.posNative?.isFullScreen) {
      window.posNative.isFullScreen().then((res) => setIsFullScreen(Boolean(res))).catch(() => {});
    } else {
      setIsFullScreen(Boolean(document.fullscreenElement));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCloseApp = () => {
    if (onExitApp) {
      onExitApp();
    } else if (onConfirm) {
      onConfirm();
    } else if (window?.posNative?.exitApp) {
      window.posNative.exitApp();
    } else {
      window.close();
    }
  };

  const handleToggleFS = async () => {
    if (onToggleFullScreen) {
      onToggleFullScreen();
    } else if (window?.posNative?.toggleFullScreen) {
      const isFull = await window.posNative.toggleFullScreen();
      setIsFullScreen(Boolean(isFull));
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      setIsFullScreen(false);
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullScreen(true);
    }
    onClose();
  };

  const handleConfirmShutdown = () => {
    if (onShutdownSystem) {
      onShutdownSystem();
    } else if (window?.posNative?.shutdownSystem) {
      window.posNative.shutdownSystem();
    } else {
      // Fallback
      handleCloseApp();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/20 text-rose-400 shadow-md">
              <Power className="h-6 w-6" />
            </div>
            <div>
              <h3 id="exit-modal-title" className="text-base font-bold text-white">
                {isConfirmingShutdown ? 'Confirmar Apagado' : 'Opciones de Salida y Energía'}
              </h3>
              <p className="text-xs text-slate-400">
                {isConfirmingShutdown
                  ? '¿Estás seguro de que deseas apagar la computadora?'
                  : 'Selecciona la acción que deseas realizar en esta terminal.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="rounded-xl p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Vista de confirmación de apagado */}
        {isConfirmingShutdown ? (
          <div className="space-y-4 pt-1">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200 leading-relaxed">
                <p className="font-semibold text-amber-300 mb-1">El equipo se apagará por completo</p>
                <p className="text-amber-200/90">
                  Se cerrará Windows y todas las aplicaciones abiertas. Asegúrate de haber cerrado tus turnos y cobros pendientes.
                </p>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmingShutdown(false)}
                className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 py-2.5 text-xs font-semibold text-slate-300 transition cursor-pointer"
              >
                Regresar
              </button>
              <button
                type="button"
                onClick={handleConfirmShutdown}
                className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-600/30 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Power className="w-4 h-4" />
                <span>Sí, Apagar Equipo</span>
              </button>
            </div>
          </div>
        ) : (
          /* Lista de 3 opciones principales */
          <div className="space-y-2.5 pt-1">
            {/* Opción 1: Salir / Alternar Pantalla Completa */}
            <button
              type="button"
              onClick={handleToggleFS}
              className="w-full text-left rounded-2xl border border-slate-700/80 bg-slate-800/60 hover:bg-slate-800 hover:border-cyan-500/50 p-3.5 transition flex items-center justify-between gap-3 cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 transition">
                  {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-100 group-hover:text-cyan-300 transition">
                    {isFullScreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    {isFullScreen
                      ? 'Desactiva el modo kiosko para ver otras ventanas o el escritorio.'
                      : 'Vuelve al modo kiosko ocupando toda la pantalla.'}
                  </p>
                </div>
              </div>
            </button>

            {/* Opción 2: Cerrar Aplicación */}
            <button
              type="button"
              onClick={handleCloseApp}
              className="w-full text-left rounded-2xl border border-slate-700/80 bg-slate-800/60 hover:bg-slate-800 hover:border-slate-500 p-3.5 transition flex items-center justify-between gap-3 cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-600 bg-slate-700/50 text-slate-300 group-hover:bg-slate-700 transition">
                  <LogOut className="w-5 h-5 text-slate-200" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-100 group-hover:text-white transition">
                    Cerrar aplicación
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Cierra POSKlean y sale al escritorio del sistema operativo.
                  </p>
                </div>
              </div>
            </button>

            {/* Opción 3: Apagar Equipo */}
            <button
              type="button"
              onClick={() => setIsConfirmingShutdown(true)}
              className="w-full text-left rounded-2xl border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/15 hover:border-rose-500/60 p-3.5 transition flex items-center justify-between gap-3 cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/20 text-rose-400 group-hover:bg-rose-500/30 transition shadow-sm">
                  <Power className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-rose-300 group-hover:text-rose-200 transition">
                    Apagar equipo
                  </h4>
                  <p className="text-[11px] text-rose-300/80 leading-snug">
                    Apaga por completo la computadora / terminal de cobro.
                  </p>
                </div>
              </div>
            </button>

            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl bg-slate-800 hover:bg-slate-700 py-2.5 text-xs font-semibold text-slate-300 transition cursor-pointer text-center"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
