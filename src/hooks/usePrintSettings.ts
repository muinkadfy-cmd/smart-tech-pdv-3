import { useEffect, useState } from 'react';
import {
  buildThermalSettingsFromProfile,
  loadThermalPrintSettings,
  saveThermalPrintSettings,
  type ThermalPrintSettings,
} from '@/services/print/settings';
import { type ThermalPrinterProfileId } from '@/services/print/thermalProfiles';

export function usePrintSettings() {
  const [settings, setSettings] = useState<ThermalPrintSettings>(() => loadThermalPrintSettings());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSettings(loadThermalPrintSettings());
  }, []);

  async function persist(next: ThermalPrintSettings) {
    setSettings(next);
    setSaving(true);
    try {
      await saveThermalPrintSettings(next);
    } finally {
      setSaving(false);
    }
  }

  async function update(patch: Partial<ThermalPrintSettings>) {
    const next = { ...settings, ...patch };
    await persist(next);
  }

  async function applyProfile(profileId: ThermalPrinterProfileId) {
    const base = buildThermalSettingsFromProfile(profileId);
    await persist({
      ...settings,
      ...base,
      showLogo: settings.showLogo,
      showQrCode: settings.showQrCode,
      showFooterCut: settings.showFooterCut,
      autoCloseAfterPrint: settings.autoCloseAfterPrint,
    });
  }

  return {
    settings,
    saving,
    update,
    applyProfile,
    reload: () => setSettings(loadThermalPrintSettings()),
  };
}
