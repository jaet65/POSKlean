const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    useContentSize: true,
    transparent: true,
    frame: false,
    webPreferences: {
      offscreen: false,
    },
  });

  const svgContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'favicon.svg'), 'utf8');
  const base64 = Buffer.from(svgContent).toString('base64');
  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 512px; height: 512px; background: transparent; overflow: hidden; display: flex; align-items: center; justify-content: center; }
  img { width: 512px; height: 512px; object-fit: contain; }
</style>
</head>
<body>
  <img src="data:image/svg+xml;base64,${base64}" />
</body>
</html>`;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 600));

  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const pngBuffer = image.toPNG();
  const outPath = path.join(__dirname, '..', 'build', 'icon.png');
  fs.writeFileSync(outPath, pngBuffer);
  console.log('Rendered icon.png successfully.');
  app.quit();
});
