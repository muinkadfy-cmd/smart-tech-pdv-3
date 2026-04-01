import { useMemo } from 'react';
import { usePrintSettings } from '@/hooks/usePrintSettings';
import { THERMAL_PRINTER_PROFILES } from '@/services/print/thermalProfiles';
import './ThermalPrintSettings.css';

export default function ThermalPrintSettings() {
  const { settings, saving, update, applyProfile } = usePrintSettings();

  const profileOptions = useMemo(() => Object.values(THERMAL_PRINTER_PROFILES), []);

  return (
    <section className="thermal-settings">
      <div className="thermal-settings__hero">
        <div>
          <strong>Impressão térmica profissional</strong>
          <p>Perfis calibrados para 58mm e 80mm, com base útil, densidade visual e preferências persistentes.</p>
        </div>
        <span className="thermal-settings__badge">{saving ? 'Salvando...' : 'Persistente local'}</span>
      </div>

      <div className="thermal-settings__grid">
        <div className="form-group">
          <label>Perfil da impressora</label>
          <select
            value={settings.printerProfile}
            onChange={(e) => { void applyProfile(e.target.value as any); }}
          >
            {profileOptions.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Papel térmico</label>
          <select
            value={settings.paperWidth}
            onChange={(e) => { void update({ paperWidth: e.target.value === '80' ? '80' : '58' }); }}
          >
            <option value="58">58mm</option>
            <option value="80">80mm</option>
          </select>
        </div>

        <div className="form-group">
          <label>Largura útil (mm)</label>
          <input
            type="number"
            min="40"
            max="72"
            step="1"
            value={settings.usefulWidthMm}
            onChange={(e) => { void update({ usefulWidthMm: Number(e.target.value) || settings.usefulWidthMm }); }}
          />
        </div>

        <div className="form-group">
          <label>Margem interna (mm)</label>
          <input
            type="number"
            min="0"
            max="6"
            step="0.5"
            value={settings.innerMarginMm}
            onChange={(e) => { void update({ innerMarginMm: Number(e.target.value) || 0 }); }}
          />
        </div>

        <div className="form-group">
          <label>Densidade / fonte</label>
          <select
            value={settings.printDensity}
            onChange={(e) => { void update({ printDensity: e.target.value as any }); }}
          >
            <option value="compact">Compacta</option>
            <option value="normal">Normal</option>
            <option value="dense">Densa</option>
          </select>
        </div>

        <div className="form-group">
          <label>Tamanho da fonte (px)</label>
          <input
            type="number"
            min="8"
            max="16"
            step="1"
            value={settings.fontSizePx}
            onChange={(e) => { void update({ fontSizePx: Number(e.target.value) || settings.fontSizePx }); }}
          />
        </div>
      </div>

      <div className="thermal-settings__toggles">
        <label className="thermal-settings__toggle">
          <input
            type="checkbox"
            checked={settings.showLogo}
            onChange={(e) => { void update({ showLogo: e.target.checked }); }}
          />
          <span>Exibir logo</span>
        </label>
        <label className="thermal-settings__toggle">
          <input
            type="checkbox"
            checked={settings.showQrCode}
            onChange={(e) => { void update({ showQrCode: e.target.checked }); }}
          />
          <span>Exibir QR Code</span>
        </label>
        <label className="thermal-settings__toggle">
          <input
            type="checkbox"
            checked={settings.showFooterCut}
            onChange={(e) => { void update({ showFooterCut: e.target.checked }); }}
          />
          <span>Mostrar linha de corte</span>
        </label>
        <label className="thermal-settings__toggle">
          <input
            type="checkbox"
            checked={settings.autoCloseAfterPrint}
            onChange={(e) => { void update({ autoCloseAfterPrint: e.target.checked }); }}
          />
          <span>Fechar após imprimir</span>
        </label>
      </div>

      <div className="thermal-settings__footnote">
        Base útil recomendada: 48mm para POS-58 e 72mm para 80mm/Epson TM-T20.
      </div>
    </section>
  );
}

