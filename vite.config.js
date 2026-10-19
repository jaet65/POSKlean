import fs from 'node:fs'
import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

let gitTag = ''
try {
  gitTag = execSync('git describe --tags --abbrev=0', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
} catch {
  // fallback if git is not available or no tags exist
}
if (gitTag.startsWith('v')) {
  gitTag = gitTag.slice(1)
}

const appVersion = process.env.APP_VERSION || gitTag || pkg.version || '0.0.1'

// Guardar token de lectura para auto-updates de GitHub en build de producción si existe
const githubReadToken = process.env.VITE_GITHUB_READ_TOKEN || process.env.GH_TOKEN || ''
if (githubReadToken) {
  try {
    fs.mkdirSync(new URL('./build', import.meta.url), { recursive: true })
    fs.writeFileSync(
      new URL('./build/auto-updater-token.json', import.meta.url),
      JSON.stringify({ token: githubReadToken })
    )
  } catch (e) {
    console.warn('No se pudo guardar auto-updater-token.json:', e.message)
  }
}

import os from 'node:os'
import path from 'node:path'
import net from 'node:net'

function printersDevPlugin() {
  return {
    name: 'printers-dev-api',
    configureServer(server) {
      server.middlewares.use('/__api__/printers', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (process.platform === 'win32') {
          try {
            const { exec } = await import('node:child_process');
            exec(
              'powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Printer | Select-Object Name, Default, PortName, DriverName | ConvertTo-Json"',
              { timeout: 4000 },
              (err, stdout) => {
                if (err || !stdout) {
                  res.end(JSON.stringify([]));
                  return;
                }
                try {
                  const parsed = JSON.parse(stdout.trim());
                  const arr = Array.isArray(parsed) ? parsed : [parsed];
                  const list = arr.filter((p) => p && p.Name).map((p) => ({
                    name: p.Name,
                    displayName: p.Name,
                    isDefault: Boolean(p.Default),
                    description: p.DriverName || p.PortName || '',
                  }));
                  res.end(JSON.stringify(list));
                } catch {
                  res.end(JSON.stringify([]));
                }
              }
            );
            return;
          } catch {
            res.end(JSON.stringify([]));
            return;
          }
        }
        res.end(JSON.stringify([]));
      });

      server.middlewares.use('/__api__/print', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let bodyStr = '';
        req.on('data', (chunk) => {
          bodyStr += chunk;
        });

        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const body = JSON.parse(bodyStr || '{}');
            const { deviceName, text, receiptWidth } = body;
            const printerName = (deviceName || '').trim();
            const widthMm = Number(receiptWidth || 80);
            const is58mm = widthMm <= 60;

            if (!text) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'No text provided to print' }));
              return;
            }

            // 1. Si la impresora seleccionada es la virtual ESC_POS o el puerto 9100 está activo
            const isEscPosVirtual = !printerName || printerName.toLowerCase().includes('esc_pos') || printerName.toLowerCase().includes('virtual');
            if (isEscPosVirtual) {
              try {
                const printedViaTcp = await new Promise((resolve) => {
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
                    socket.write(text);
                    socket.write('\r\n\r\n\r\n\r\n');
                    // GS V 0 : Corte de papel
                    socket.write(Buffer.from([0x1d, 0x56, 0x30]));
                    socket.end(() => resolve(true));
                  });
                });

                if (printedViaTcp) {
                  res.end(JSON.stringify({ success: true, method: 'tcp-9100' }));
                  return;
                }
              } catch {
                // Continuar con el spooler de Windows
              }
            }

            // Si es una impresora virtual de PDF (ej. Microsoft Print to PDF), delegar al diálogo de impresión del navegador
            if (printerName.toLowerCase().includes('pdf')) {
              res.end(JSON.stringify({ success: false, fallbackToBrowser: true, message: 'PDF requiere diálogo de usuario' }));
              return;
            }

            // 2. Enviar al Spooler de Windows mediante Out-Printer
            if (process.platform === 'win32') {
              const { exec } = await import('node:child_process');
              const tmpFile = path.join(os.tmpdir(), `pos_receipt_${Date.now()}.txt`);
              fs.writeFileSync(tmpFile, text, 'utf8');

              const targetArg = printerName ? `-Name '${printerName.replace(/'/g, "''")}'` : '';
              const cmd = `powershell -NoProfile -NonInteractive -Command "Get-Content -LiteralPath '${tmpFile.replace(/'/g, "''")}' | Out-Printer ${targetArg}"`;

              exec(cmd, { timeout: 6000 }, (err) => {
                try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
                if (err) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ success: false, error: err.message }));
                  return;
                }
                res.end(JSON.stringify({ success: true, method: 'windows-spooler' }));
              });
              return;
            }

            res.end(JSON.stringify({ success: true, method: 'simulated' }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isRelease = process.env.VITE_IS_RELEASE === 'true' || process.env.IS_RELEASE === 'true'
  const isDev = mode === 'development' || !isRelease

  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __IS_DEV__: JSON.stringify(isDev),
    },
    plugins: [react(), tailwindcss(), printersDevPlugin()],
    server: {
      host: true,
      port: 5173,
    },
    optimizeDeps: {
      include: [
        '@capacitor/core',
        '@capgo/capacitor-printer',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
      ],
    },
  }
})
