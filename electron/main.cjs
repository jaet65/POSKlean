const { app, BrowserWindow, ipcMain, shell, globalShortcut, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { exec } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

let mainWindow = null;
let isKioskActive = true;

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
  if (createdWin !== mainWindow) {
    // Es una ventana emergente / popup (ej. login con Google)
    createdWin.setKiosk(false);
    createdWin.setFullScreen(false);
  } else {
    blockKioskShortcuts(createdWin);
  }
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

  mainWindow = win;

  // Aplicar bloqueo de teclas directamente a la ventana
  blockKioskShortcuts(win);

  // Evitar que la ventana pierda el foco si está en modo kiosko activo
  win.on('blur', () => {
    if (!isQuitting && isKioskActive) {
      // Si hay una ventana hija o de autenticación abierta (ej. popup de Google), no robarle el foco
      const childWindows = win.getChildWindows();
      if (childWindows && childWindows.length > 0) return;
      if (BrowserWindow.getAllWindows().length > 1) return;

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
    // Permitir popups de autenticación OAuth de Firebase y Google
    const isAuthUrl = (
      url.includes('firebaseapp.com') ||
      url.includes('web.app') ||
      url.includes('accounts.google.com') ||
      url.includes('google.com/accounts') ||
      url.includes('apis.google.com') ||
      url.includes('/__/auth/')
    );

    if (isAuthUrl) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 680,
          autoHideMenuBar: true,
          modal: true,
          parent: win,
          alwaysOnTop: !process.env.ELECTRON_DEV,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        },
      };
    }

    if (/^https?:/.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (!process.env.ELECTRON_DEV) serverUrl ??= await startStaticServer();
  win.loadURL(process.env.ELECTRON_DEV ? DEV_URL : serverUrl);
}

// Consulta impresoras del sistema en Windows mediante PowerShell WMI
function getWindowsPrinters() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve([]);
    const cmd = 'powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Printer | Select-Object Name, Default, PortName, DriverName | ConvertTo-Json"';
    exec(cmd, { timeout: 5000 }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      try {
        const parsed = JSON.parse(stdout.trim());
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const list = arr.filter((p) => p && p.Name).map((p) => ({
          name: p.Name,
          displayName: p.Name,
          isDefault: Boolean(p.Default),
          description: p.DriverName || p.PortName || '',
        }));
        resolve(list);
      } catch {
        resolve([]);
      }
    });
  });
}

// Obtener todas las impresoras disponibles combinando Chromium y WMI de Windows
ipcMain.handle('get-printers', async (event) => {
  try {
    const [chromiumPrinters, osPrinters] = await Promise.all([
      event.sender.getPrintersAsync().catch(() => []),
      getWindowsPrinters().catch(() => []),
    ]);

    const printerMap = new Map();

    if (Array.isArray(chromiumPrinters)) {
      chromiumPrinters.forEach((p) => {
        if (p?.name) {
          printerMap.set(p.name, {
            name: p.name,
            displayName: p.displayName || p.name,
            isDefault: Boolean(p.isDefault),
            description: p.description || '',
            status: p.status,
          });
        }
      });
    }

    if (Array.isArray(osPrinters)) {
      osPrinters.forEach((p) => {
        if (p?.name) {
          const existing = printerMap.get(p.name);
          printerMap.set(p.name, {
            name: p.name,
            displayName: existing?.displayName || p.displayName || p.name,
            isDefault: existing ? (existing.isDefault || p.isDefault) : p.isDefault,
            description: existing?.description || p.description || '',
            status: existing?.status,
          });
        }
      });
    }

    return Array.from(printerMap.values());
  } catch (err) {
    console.error('Error al consultar impresoras:', err);
    return [];
  }
});

// Función compartida para ejecutar impresión en Electron
const handlePrintAction = async (webContents, options = {}) => {
  const isSilent = options.silent !== undefined ? Boolean(options.silent) : true;
  const deviceName = typeof options.deviceName === 'string' ? options.deviceName.trim() : '';
  const widthMm = Number(options.receiptWidth || 80);
  const is58mm = widthMm <= 60;

  // 1. Si es modo silencioso y la impresora es virtual ESC_POS (puerto 9100), enviar directo al socket TCP
  if (isSilent && options.text) {
    const isEscPosVirtual = !deviceName || deviceName.toLowerCase().includes('esc_pos') || deviceName.toLowerCase().includes('virtual');
    if (isEscPosVirtual) {
      try {
        const sentViaTcp = await new Promise((resolve) => {
          const socket = new net.Socket();
          socket.setTimeout(2500);
          socket.on('error', () => {
            socket.destroy();
            resolve(false);
          });
          socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
          });
          socket.connect(9100, '127.0.0.1', () => {
            // Inicializar impresora ESC/POS
            socket.write(Buffer.from([0x1b, 0x40]));
            // Margen izquierdo a 0
            socket.write(Buffer.from([0x1d, 0x4c, 0x00, 0x00]));
            if (is58mm) {
              // GS W 384 dots (0x80, 0x01) para rollo de 58 mm
              socket.write(Buffer.from([0x1d, 0x57, 0x80, 0x01]));
            } else {
              // GS W 576 dots (0x40, 0x02) para rollo de 80 mm
              socket.write(Buffer.from([0x1d, 0x57, 0x40, 0x02]));
            }
            socket.write(options.text);
            socket.write('\r\n\r\n\r\n\r\n');
            // GS V 0 : Corte de papel
            socket.write(Buffer.from([0x1d, 0x56, 0x30]));
            socket.end(() => resolve(true));
          });
        });

        if (sentViaTcp) {
          return { success: true, method: 'tcp-9100' };
        }
      } catch {
        // Continuar con impresión estándar si falla el socket
      }
    }
  }

  // 2. Impresión estándar mediante Chromium / Windows Spooler
  // Las impresoras virtuales PDF (ej. Microsoft Print to PDF) requieren diálogo interactivo para elegir archivo destino
  const isPdfPrinter = deviceName.toLowerCase().includes('pdf');
  const effectiveSilent = isSilent && !isPdfPrinter;

  return new Promise((resolve) => {
    const printOptions = {
      silent: effectiveSilent,
      printBackground: options.printBackground !== undefined ? Boolean(options.printBackground) : true,
    };

    if (deviceName) {
      printOptions.deviceName = deviceName;
    }

    if (options.pageSize) {
      printOptions.pageSize = options.pageSize;
    }

    if (options.margins) {
      printOptions.margins = options.margins;
    }

    webContents.print(printOptions, (success, reason) => {
      resolve({ success, reason: reason || null });
    });
  });
};

// Impresión con opciones configurables (impresora por default y silent print)
ipcMain.handle('print-ticket', (event, options) => handlePrintAction(event.sender, options));

// Compatibilidad con print-silent original
ipcMain.handle('print-silent', (event, options) => handlePrintAction(event.sender, { ...options, silent: true }));

// Cierre/apagado ordenado de la aplicación desde el modo kiosko
ipcMain.handle('app-exit', () => {
  isQuitting = true;
  // Si en 1.5s no ha terminado el cierre ordenado, forzar salida del proceso
  setTimeout(() => {
    app.exit(0);
  }, 1200).unref();
  app.quit();
});

// Salir del modo pantalla completa / kiosko
ipcMain.handle('app-exit-fullscreen', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  isKioskActive = false;
  mainWindow.setKiosk(false);
  mainWindow.setFullScreen(false);
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setSize(1280, 800);
  mainWindow.center();
  return true;
});

// Alternar modo pantalla completa / kiosko
ipcMain.handle('app-toggle-fullscreen', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const isCurrentlyFull = mainWindow.isKiosk() || mainWindow.isFullScreen();
  if (isCurrentlyFull) {
    isKioskActive = false;
    mainWindow.setKiosk(false);
    mainWindow.setFullScreen(false);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setSize(1280, 800);
    mainWindow.center();
    return false;
  } else {
    isKioskActive = true;
    mainWindow.setAlwaysOnTop(!process.env.ELECTRON_DEV);
    mainWindow.setFullScreen(true);
    mainWindow.setKiosk(true);
    return true;
  }
});

// Consultar si la ventana está en pantalla completa
ipcMain.handle('app-is-fullscreen', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return Boolean(mainWindow.isKiosk() || mainWindow.isFullScreen());
});

// Apagar el equipo por completo (Sistema Operativo)
ipcMain.handle('app-shutdown-system', () => {
  isQuitting = true;
  try {
    if (process.platform === 'win32') {
      exec('shutdown /s /t 0', () => {});
    } else if (process.platform === 'darwin') {
      exec('osascript -e \'tell application "System Events" to shut down\'', () => {});
    } else {
      exec('systemctl poweroff || shutdown -h now', () => {});
    }
  } catch (err) {
    console.error('Error al apagar el equipo:', err);
  }
  setTimeout(() => {
    app.exit(0);
  }, 1000).unref();
  app.quit();
});

// ==================== AUTO UPDATER ====================
function getGitHubToken() {
  if (process.env.VITE_GITHUB_READ_TOKEN) return process.env.VITE_GITHUB_READ_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    const tokenPath = path.join(__dirname, '..', 'build', 'auto-updater-token.json');
    if (fs.existsSync(tokenPath)) {
      const data = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      if (data && data.token) return data.token;
    }
  } catch (err) {
    console.warn('No se pudo leer auto-updater-token.json:', err.message);
  }
  return null;
}

const updaterToken = getGitHubToken();
if (updaterToken) {
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'jaet65',
    repo: 'POSKlean',
    private: true,
    token: updaterToken,
  });
  autoUpdater.requestHeaders = {
    Authorization: `Bearer ${updaterToken}`,
  };
}

function sendUpdaterStatus(data) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('updater-status', data);
  }
}

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('checking-for-update', () => {
  sendUpdaterStatus({ status: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  sendUpdaterStatus({ status: 'available', version: info?.version });
});

autoUpdater.on('update-not-available', (info) => {
  sendUpdaterStatus({ status: 'not-available', version: info?.version });
});

autoUpdater.on('error', (err) => {
  console.error('Error en autoUpdater:', err);
  sendUpdaterStatus({ status: 'error', message: err?.message || 'Error desconocido al actualizar' });
});

autoUpdater.on('download-progress', (progressObj) => {
  sendUpdaterStatus({
    status: 'downloading',
    percent: Math.round(progressObj.percent || 0),
    transferred: progressObj.transferred,
    total: progressObj.total,
    bytesPerSecond: progressObj.bytesPerSecond,
  });
});

autoUpdater.on('update-downloaded', (info) => {
  sendUpdaterStatus({ status: 'downloaded', version: info?.version });
});

// Comprobar actualizaciones manualmente
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    return { ok: false, message: 'Actualizaciones deshabilitadas en desarrollo' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, updateInfo: result?.updateInfo };
  } catch (err) {
    return { ok: false, error: err?.message };
  }
});

// Aplicar e instalar actualización descargada
ipcMain.handle('install-update', () => {
  isQuitting = true;
  autoUpdater.quitAndInstall(false, true);
  return true;
});

app.whenReady().then(() => {
  registerGlobalKioskShortcuts();
  createWindow();

  // Buscar actualizaciones automáticamente tras iniciar la aplicación (en producción)
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('Error al chequear actualizaciones al inicio:', err);
      });
    }, 4000);

    // Revisar periódicamente cada 60 minutos
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 60 * 60 * 1000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
