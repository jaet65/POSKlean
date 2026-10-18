const { app, BrowserWindow, ipcMain, shell, globalShortcut } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DEV_URL = 'http://localhost:5173';
const PROD_PORT = 5199;
const DIST_DIR = path.join(__dirname, '..', 'dist');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// Firebase Auth rechaza file://; localhost es un dominio autorizado por defecto.
function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);
      if (!filePath.startsWith(DIST_DIR)) { res.writeHead(403).end(); return; }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, 'index.html');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.on('error', reject);
    server.listen(PROD_PORT, '127.0.0.1', () => resolve(`http://localhost:${PROD_PORT}`));
  });
}

let serverUrl = null;
let isQuitting = false;

function blockKioskShortcuts(window) {
  if (!window || window.isDestroyed()) return;

  // Remover menús que puedan responder a la tecla Alt o aceleradores
  window.setMenu(null);
  if (typeof window.removeMenu === 'function') {
    window.removeMenu();
  }

  // Interceptar eventos de teclado antes de que Chromium o el sistema operativo los procese
  window.webContents.on('before-input-event', (event, input) => {
    const key = (input.key || '').toLowerCase();
    const code = input.code || '';
    const isCtrlOrCmd = Boolean(input.control || input.meta);
    const isAlt = Boolean(input.alt);

    // Combinaciones bloqueadas en modo kiosko:
    // - Alt+F4: Cerrar ventana
    // - Alt+Tab: Alternar aplicaciones
    // - Ctrl+Esc / Cmd+Esc: Menú inicio de Windows
    // - Ctrl+Shift+Esc: Administrador de tareas
    // - Tecla Windows (Meta)
    // - Ctrl+W / Cmd+W: Cerrar ventana/pestaña
    // - Ctrl+Q / Cmd+Q: Salir
    // - F11: Salir o alternar pantalla completa
    // - Escape / Esc: Desactivar pantalla completa
    // - Ctrl+N / Ctrl+T: Nuevas ventanas o pestañas
    // - Ctrl+P: Cuadro de diálogo de impresión por defecto de Chrome
    // - F12 / Ctrl+Shift+I / Ctrl+Shift+J: Herramientas de desarrollador (excepto si ELECTRON_DEV está activo)
    // - Alt+Flecha Izquierda / Alt+Flecha Derecha: Navegación de historial
    const isAltF4 = isAlt && (key === 'f4' || code === 'F4');
    const isAltTab = isAlt && (key === 'tab' || code === 'Tab');
    const isCtrlEsc = isCtrlOrCmd && (key === 'escape' || code === 'Escape');
    const isCtrlShiftEsc = isCtrlOrCmd && input.shift && (key === 'escape' || code === 'Escape');
    const isWinKey = key === 'meta' || code === 'MetaLeft' || code === 'MetaRight';
    const isCtrlW = isCtrlOrCmd && (key === 'w' || code === 'KeyW');
    const isCtrlQ = isCtrlOrCmd && (key === 'q' || code === 'KeyQ');
    const isF11 = key === 'f11' || code === 'F11';
    const isEscape = key === 'escape' || code === 'Escape';
    const isCtrlN = isCtrlOrCmd && (key === 'n' || code === 'KeyN');
    const isCtrlT = isCtrlOrCmd && (key === 't' || code === 'KeyT');
    const isCtrlP = isCtrlOrCmd && (key === 'p' || code === 'KeyP');
    const isDevTools = !process.env.ELECTRON_DEV && (
      (isCtrlOrCmd && input.shift && (key === 'i' || key === 'j')) ||
      key === 'f12' ||
      code === 'F12'
    );
    const isHistoryNav = isAlt && (key === 'arrowleft' || key === 'arrowright');

    if (
      isAltF4 ||
      isAltTab ||
      isCtrlEsc ||
      isCtrlShiftEsc ||
      isWinKey ||
      isCtrlW ||
      isCtrlQ ||
      isF11 ||
      isEscape ||
      isCtrlN ||
      isCtrlT ||
      isCtrlP ||
      isDevTools ||
      isHistoryNav
    ) {
      event.preventDefault();
    }
  });
}

function registerGlobalKioskShortcuts() {
  const blockedShortcuts = [
    'Alt+Tab',
    'CommandOrControl+Escape',
    'CommandOrControl+Shift+Escape',
    'Alt+F4',
    'CommandOrControl+W',
  ];
  for (const shortcut of blockedShortcuts) {
    try {
      globalShortcut.register(shortcut, () => { });
    } catch { }
  }
}

// Asegurar que cualquier ventana creada aplique las restricciones
app.on('browser-window-created', (event, createdWin) => {
  blockKioskShortcuts(createdWin);
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

async function createWindow() {
  const iconPath = path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,
    kiosk: true,
    alwaysOnTop: !process.env.ELECTRON_DEV,
    frame: false,
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Aplicar bloqueo de teclas directamente a la ventana
  blockKioskShortcuts(win);

  // Evitar que la ventana pierda el foco ante intentos de cambio de ventana (Alt+Tab, Menú Inicio, etc.)
  win.on('blur', () => {
    if (!isQuitting) {
      setImmediate(() => {
        if (!win.isDestroyed()) {
          win.focus();
        }
      });
    }
  });

  // Evitar cierre involuntario mientras no se invoque el apagado explícito
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url) && !url.includes('web.app') && !url.includes('accounts.google.com')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (!process.env.ELECTRON_DEV) serverUrl ??= await startStaticServer();
  win.loadURL(process.env.ELECTRON_DEV ? DEV_URL : serverUrl);
}

// Impresión directa a la impresora predeterminada, sin diálogo.
ipcMain.handle('print-silent', (event) => new Promise((resolve) => {
  event.sender.print({ silent: true, printBackground: true }, (success, reason) => {
    resolve({ success, reason: reason || null });
  });
}));

// Cierre/apagado ordenado de la aplicación desde el modo kiosko
ipcMain.handle('app-exit', () => {
  isQuitting = true;
  // Si en 1.5s no ha terminado el cierre ordenado, forzar salida del proceso
  setTimeout(() => {
    app.exit(0);
  }, 1500).unref();
  app.quit();
});

app.whenReady().then(() => {
  registerGlobalKioskShortcuts();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
