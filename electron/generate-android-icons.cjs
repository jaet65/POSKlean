const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const DENSITIES = [
  { name: 'mipmap-mdpi', size: 48, fgSize: 108 },
  { name: 'mipmap-hdpi', size: 72, fgSize: 162 },
  { name: 'mipmap-xhdpi', size: 96, fgSize: 216 },
  { name: 'mipmap-xxhdpi', size: 144, fgSize: 324 },
  { name: 'mipmap-xxxhdpi', size: 192, fgSize: 432 },
];

const RES_PATH = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const SVG_PATH = path.join(__dirname, '..', 'public', 'favicon.svg');

app.whenReady().then(async () => {
  const svgContent = fs.readFileSync(SVG_PATH, 'utf8');
  const base64Svg = Buffer.from(svgContent).toString('base64');

  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    useContentSize: true,
    transparent: true,
    frame: false,
  });

  const renderToBuffer = async (html, width, height) => {
    win.setContentSize(width, height);
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((r) => setTimeout(r, 400));
    const image = await win.webContents.capturePage({ x: 0, y: 0, width, height });
    return image.toPNG();
  };

  for (const d of DENSITIES) {
    const dir = path.join(RES_PATH, d.name);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // 1. Foreground for adaptive icon (108dp standard, icon centered in inner 66dp ~ 60% of canvas)
    const fgHtml = `<!DOCTYPE html><html><head><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      html, body { width:${d.fgSize}px; height:${d.fgSize}px; background:transparent; overflow:hidden; display:flex; align-items:center; justify-content:center; }
      img { width:${Math.round(d.fgSize * 0.58)}px; height:${Math.round(d.fgSize * 0.58)}px; object-fit:contain; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3)); }
    </style></head><body><img src="data:image/svg+xml;base64,${base64Svg}" /></body></html>`;
    const fgBuf = await renderToBuffer(fgHtml, d.fgSize, d.fgSize);
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), fgBuf);

    // 2. Legacy square icon with dark rounded background
    const cornerRadius = Math.round(d.size * 0.22);
    const sqHtml = `<!DOCTYPE html><html><head><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      html, body { width:${d.size}px; height:${d.size}px; background:transparent; overflow:hidden; display:flex; align-items:center; justify-content:center; }
      .bg { width:${d.size}px; height:${d.size}px; background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius:${cornerRadius}px; display:flex; align-items:center; justify-content:center; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.1); }
      img { width:${Math.round(d.size * 0.65)}px; height:${Math.round(d.size * 0.65)}px; object-fit:contain; }
    </style></head><body><div class="bg"><img src="data:image/svg+xml;base64,${base64Svg}" /></div></body></html>`;
    const sqBuf = await renderToBuffer(sqHtml, d.size, d.size);
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), sqBuf);

    // 3. Legacy round icon
    const roundHtml = `<!DOCTYPE html><html><head><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      html, body { width:${d.size}px; height:${d.size}px; background:transparent; overflow:hidden; display:flex; align-items:center; justify-content:center; }
      .bg { width:${d.size}px; height:${d.size}px; background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.1); }
      img { width:${Math.round(d.size * 0.62)}px; height:${Math.round(d.size * 0.62)}px; object-fit:contain; }
    </style></head><body><div class="bg"><img src="data:image/svg+xml;base64,${base64Svg}" /></div></body></html>`;
    const roundBuf = await renderToBuffer(roundHtml, d.size, d.size);
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), roundBuf);

    console.log(`Generated icons for ${d.name}`);
  }

  // Update background color to match dark navy theme #0f172a
  const colorXml = path.join(RES_PATH, 'values', 'ic_launcher_background.xml');
  fs.writeFileSync(colorXml, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0f172a</color>\n</resources>\n`);

  // Remove the old Android robot vector assets if they exist
  const oldFg = path.join(RES_PATH, 'drawable-v24', 'ic_launcher_foreground.xml');
  if (fs.existsSync(oldFg)) fs.unlinkSync(oldFg);
  const oldBg = path.join(RES_PATH, 'drawable', 'ic_launcher_background.xml');
  if (fs.existsSync(oldBg)) fs.unlinkSync(oldBg);

  console.log('Successfully generated all Android POSKlean icons and updated configs.');
  app.quit();
});
