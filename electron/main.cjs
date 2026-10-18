const { app, BrowserWindow, ipcMain, shell } = require('electron');
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

async function createWindow() {
  const iconPath = path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url) && !url.includes('firebaseapp.com') && !url.includes('accounts.google.com')) {
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
