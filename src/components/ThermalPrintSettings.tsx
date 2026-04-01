import { useMemo, useState } from 'react';
import { usePrintSettings } from '@/hooks/usePrintSettings';
import { isDesktopApp } from '@/lib/platform';
import { isQzTrayAvailable, listQzPrinters } from '@/services/print/qzTrayService';
import { THERMAL_PRINTER_PROFILES } from '@/services/print/thermalProfiles';
import './ThermalPrintSettings.css';

export default function ThermalPrintSettings() {
  const { settings, saving, update, applyProfile } = usePrintSettings();
  const [qzStatus, setQzStatus] = useState<'idle' | 'checking' | 'ready' | 'missing'>('idle');
  const [qzPrinters, setQzPrinters] = useState<string[]>([]);

  const profileOptions = useMemo(() => Object.values(THERMAL_PRINTER_PROFILES), []);

  async function handleCheckQz() {
    setQzStatus('checking');
    const ok = await isQzTrayAvailable(settings.qzScriptUrl);
    setQzStatus(ok ? 'ready' : 'missing');
  }

  async function handleLoadQzPrinters() {
    setQzStatus('checking');
    try {
      const printers = await listQzPrinters(settings.qzScriptUrl);
      setQzPrinters(printers);
      setQzStatus(printers.length > 0 ? 'ready' : 'missing');
      if (!settings.qzPrinterName && printers[0]) {
        await update({ qzPrinterName: printers[0] });
      }
    } catch {
      setQzStatus('missing');
      setQzPrinters([]);
    }
  }

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
          <label>Motor de impressão</label>
          <select
            value={settings.backend}
            onChange={(e) => { void update({ backend: e.target.value as any }); }}
          >
            {!isDesktopApp() ? <option value="qz-tray">RAW/BT silencioso via QZ Tray</option> : null}
            {isDesktopApp() ? <option value="native-escpos">RAW/BT silencioso nativo</option> : null}
          </select>
        </div>

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

        {settings.backend === 'qz-tray' ? (
          <div className="form-group">
            <label>Script do QZ Tray</label>
            <input
              type="url"
              value={settings.qzScriptUrl}
              onChange={(e) => { void update({ qzScriptUrl: e.target.value }); }}
            />
            <div className="thermal-settings__actions">
              <button type="button" className="btn-secondary btn-sm" onClick={() => { void handleCheckQz(); }}>
                {qzStatus === 'checking' ? 'Verificando...' : 'Testar QZ Tray'}
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => { void handleLoadQzPrinters(); }}>
                Carregar impressoras QZ
              </button>
              <span className={`thermal-settings__status thermal-settings__status--${qzStatus}`}>
                {qzStatus === 'ready' ? 'QZ Tray detectado' : qzStatus === 'missing' ? 'QZ Tray não encontrado' : 'Ainda não verificado'}
              </span>
            </div>
            <div className="thermal-settings__qz-printer">
              <label>Impressora do QZ Tray</label>
              <select
                value={settings.qzPrinterName || ''}
                onChange={(e) => { void update({ qzPrinterName: e.target.value }); }}
              >
                <option value="">Selecione a impressora</option>
                {qzPrinters.map((printer) => (
                  <option key={printer} value={printer}>{printer}</option>
                ))}
              </select>
              <span className="thermal-settings__status">
                Essa impressora será usada no modo RAW/BT do navegador.
              </span>
            </div>
          </div>
        ) : null}
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
        Base útil recomendada: 48mm para POS-58 e 72mm para 80mm/Epson TM-T20. O modo compatível com diálogo foi removido da térmica.
      </div>
    </section>
  );
}
