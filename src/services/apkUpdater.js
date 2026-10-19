import { Capacitor, registerPlugin } from '@capacitor/core';

export const ApkInstaller = registerPlugin('ApkInstaller');

const GITHUB_REPO = 'jaet65/POSKlean';

/**
 * Normaliza y compara dos versiones semánticas (ej. "0.0.6" vs "0.0.3").
 * Retorna true si remoteVer > localVer.
 */
export function isVersionHigher(remoteVer, localVer) {
  const cleanRemote = String(remoteVer || '').replace(/^v/i, '').trim();
  const cleanLocal = String(localVer || '').replace(/^v/i, '').trim();

  if (!cleanRemote || !cleanLocal) return false;
  if (cleanRemote === cleanLocal) return false;

  const rParts = cleanRemote.split('.').map((n) => parseInt(n, 10) || 0);
  const lParts = cleanLocal.split('.').map((n) => parseInt(n, 10) || 0);

  const len = Math.max(rParts.length, lParts.length);
  for (let i = 0; i < len; i++) {
    const r = rParts[i] || 0;
    const l = lParts[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

/**
 * Consulta GitHub Releases para comprobar si existe un APK más reciente.
 */
export async function checkApkUpdate(currentVersion) {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return { hasUpdate: false };

    const release = await res.json();
    const remoteVersion = (release.tag_name || '').replace(/^v/i, '');

    const hasUpdate = isVersionHigher(remoteVersion, currentVersion);
    if (!hasUpdate) {
      return { hasUpdate: false, currentVersion, remoteVersion };
    }

    // Buscar el asset .apk
    const apkAsset = Array.isArray(release.assets)
      ? release.assets.find((a) => a.name && a.name.toLowerCase().endsWith('.apk'))
      : null;

    if (!apkAsset) {
      return { hasUpdate: false, reason: 'No se encontró archivo APK en el release' };
    }

    return {
      hasUpdate: true,
      currentVersion,
      version: remoteVersion,
      tagName: release.tag_name,
      apkUrl: apkAsset.browser_download_url,
      fileName: apkAsset.name,
      size: apkAsset.size,
      releaseNotes: release.body,
    };
  } catch (err) {
    console.warn('Error al verificar actualizaciones de APK:', err);
    return { hasUpdate: false, error: err?.message };
  }
}

/**
 * Descarga el APK e inicia el instalador nativo de Android.
 * @param {string} apkUrl URL directa del archivo .apk
 * @param {string} fileName Nombre del archivo destino
 * @param {(progress: { percent: number, transferred: number, total: number }) => void} onProgress Callback de progreso
 */
export async function startApkUpdate(apkUrl, fileName, onProgress) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    throw new Error('La instalación de APK solo está disponible en Android nativo.');
  }

  let progressHandle = null;
  if (typeof onProgress === 'function') {
    progressHandle = await ApkInstaller.addListener('downloadProgress', (data) => {
      onProgress(data);
    });
  }

  try {
    const result = await ApkInstaller.downloadAndInstall({
      url: apkUrl,
      fileName: fileName || 'POSKlean-update.apk',
    });
    return result;
  } finally {
    if (progressHandle && typeof progressHandle.remove === 'function') {
      progressHandle.remove();
    }
  }
}
