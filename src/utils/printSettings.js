const PRINT_SETTINGS_KEY = 'pos_print_settings';

export function getLocalPrintSettings(storeId) {
  try {
    const storeSpecific = storeId ? localStorage.getItem(`${PRINT_SETTINGS_KEY}_${storeId}`) : null;
    if (storeSpecific) {
      const parsed = JSON.parse(storeSpecific);
      if (parsed && typeof parsed === 'object') return parsed;
    }
    const globalSetting = localStorage.getItem(PRINT_SETTINGS_KEY);
    if (globalSetting) {
      const parsed = JSON.parse(globalSetting);
      if (parsed && typeof parsed === 'object') return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLocalPrintSettings(storeId, settings) {
  try {
    const payload = JSON.stringify(settings);
    localStorage.setItem(PRINT_SETTINGS_KEY, payload);
    if (storeId) {
      localStorage.setItem(`${PRINT_SETTINGS_KEY}_${storeId}`, payload);
    }
  } catch (error) {
    console.error('Error al guardar configuración de impresión local:', error);
  }
}
