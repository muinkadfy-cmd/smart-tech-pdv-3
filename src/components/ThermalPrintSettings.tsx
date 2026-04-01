import { useMemo, useState } from 'react';
import { usePrintSettings } from '@/hooks/usePrintSettings';
import { isDesktopApp } from '@/lib/platform';
import { useCompany } from '@/contexts/CompanyContext';
import { isQzTrayAvailable, listQzPrinters } from '@/services/print/qzTrayService';
import { openPrintTest } from '@/services/print/receipt-service';
import { THERMAL_PRINTER_PROFILES } from '@/services/print/thermalProfiles';
import './ThermalPrintSettings.css';

export default function ThermalPrintSettings() {
  const { settings, saving, update, applyProfile, saveCurrent } = usePrintSettings();
  const { company } = useCompany();
  const [qzStatus, setQzStatus] = useState<'idle' | 'checking' | 'ready' | 'missing'>('idle');
  const [qzPrinters, setQzPrinters] = useState<string[]>([]);
  const [section, setSection] = useState<'geral' | 'qz' | 'visual'>('geral');
  const qzDownloadUrl = 'https://github.com/qzind/tray/releases/download/v2.2.5/qz-tray-2.2.5-x86_64.exe';

  const profileOptions = useMemo(() => Object.values(THERMAL_PRINTER_PROFILES), []);
  const persistedQzPrinters = useMemo(() => {
    const selected = (settings.qzPrinterName || '').trim();
    if (!selected) return qzPrinters;
    return qzPrinters.includes(selected) ? qzPrinters : [selected, ...qzPrinters];
  }, [qzPrinters, settings.qzPrinterName]);
  const economyModeActive = settings.printDensity === 'compact' && settings.fontSizePx <= 10 && settings.innerMarginMm <= 1.5;
  const activeProfile = THERMAL_PRINTER_PROFILES[settings.printerProfile];
  const logoStatus = !settings.showLogo
    ? 'Logo desativada nesta impressão'
    : company?.logo_url
      ? 'Logo encontrada e pronta para o cupom'
      : 'Sem logo cadastrada nos dados da empresa';

  async function handleApplyNormalMode() {
    const profile = THERMAL_PRINTER_PROFILES[settings.printerProfile];
    await update({
      printDensity: 'normal',
      innerMarginMm: profile?.innerMarginMm ?? 2,
      fontSizePx: profile?.fontSizePx ?? (settings.paperWidth === '80' ? 12 : 11),
      lineHeight: profile?.lineHeight ?? 1.22,
      showFooterCut: true,
    });
  }

  async function handleApplyReducedMode() {
    await update({
      printDensity: 'compact',
      innerMarginMm: 1,
      fontSizePx: settings.paperWidth === '80' ? 10 : 9,
      lineHeight: 1.08,
      showFooterCut: false,
    });
  }

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

      <div className="thermal-settings__savebar">
        <div className="thermal-settings__savecopy">
          <strong>Salvar configurações da impressora</strong>
          <span>Tudo que você selecionar aqui fica gravado localmente para não perder ao atualizar a página.</span>
        </div>
        <div className="thermal-settings__saveactions">
          <button
            type="button"
            className="thermal-settings__testbtn"
            onClick={() => openPrintTest()}
          >
            Impressão de teste
          </button>
          <button
            type="button"
            className="thermal-settings__savebtn"
            onClick={() => { void saveCurrent(); }}
            disabled={saving}
          >
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </div>

      <div className="thermal-settings__summary">
        <div className="thermal-settings__summary-item">
          <span>Papel</span>
          <strong>{settings.paperWidth}mm</strong>
        </div>
        <div className="thermal-settings__summary-item">
          <span>Perfil</span>
          <strong>{activeProfile.label}</strong>
        </div>
        <div className="thermal-settings__summary-item">
          <span>Impressora</span>
          <strong>{settings.qzPrinterName || 'Não selecionada'}</strong>
        </div>
        <div className="thermal-settings__summary-item">
          <span>Modo</span>
          <strong>{economyModeActive ? 'Reduzido' : 'Normal/Denso'}</strong>
        </div>
      </div>

      <div className="thermal-settings__tabs" role="tablist" aria-label="Seções da impressão térmica">
        <button
          type="button"
          role="tab"
          aria-selected={section === 'geral'}
          className={`thermal-settings__tab ${section === 'geral' ? 'is-active' : ''}`}
          onClick={() => setSection('geral')}
        >
          Geral
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'qz'}
          className={`thermal-settings__tab ${section === 'qz' ? 'is-active' : ''}`}
          onClick={() => setSection('qz')}
        >
          QZ Tray
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'visual'}
          className={`thermal-settings__tab ${section === 'visual' ? 'is-active' : ''}`}
          onClick={() => setSection('visual')}
        >
          Aparência
        </button>
      </div>

      {section === 'geral' ? (
        <div className="thermal-settings__panel" role="tabpanel">
          <div className="thermal-settings__intro-card">
            <strong>Base da impressora</strong>
            <p>Escolha o motor, perfil e papel. Essa parte define como o sistema prepara o cupom para POS-58, POS-80 ou Epson.</p>
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
          </div>
        </div>
      ) : null}

      {section === 'qz' ? (
        <div className="thermal-settings__panel" role="tabpanel">
          <div className="thermal-settings__qz-guide">
            <div className="thermal-settings__qz-guide-head">
              <div>
                <strong>QZ Tray para impressão RAW/BT</strong>
                <p>Instale o QZ Tray no Windows para imprimir em modo térmico profissional, sem depender do layout do navegador.</p>
              </div>
              <a
                className="thermal-settings__qz-download"
                href={qzDownloadUrl}
                target="_blank"
                rel="noreferrer"
              >
                Baixar QZ Tray 2.2.5
              </a>
            </div>

            <ol className="thermal-settings__qz-steps">
              <li>Baixe e instale o QZ Tray no computador da impressora.</li>
              <li>Abra o QZ Tray e deixe o ícone ativo ao lado do relógio do Windows.</li>
              <li>Clique em <strong>Testar QZ Tray</strong> para confirmar a conexão.</li>
              <li>Clique em <strong>Carregar impressoras QZ</strong> e selecione a sua POS-58, POS-80 ou Epson.</li>
              <li>Faça uma impressão de teste. Se abrir permissão do QZ, marque para confiar no sistema.</li>
            </ol>
          </div>

          <div className="thermal-settings__qz-layout">
            <div className="form-group">
              <label>Script do QZ Tray</label>
              <input
                type="url"
                value={settings.qzScriptUrl}
                onChange={(e) => { void update({ qzScriptUrl: e.target.value }); }}
              />
            </div>

            <div className="thermal-settings__qz-actions-card">
              <div className="thermal-settings__actions">
                <button type="button" className="btn-secondary btn-sm" onClick={() => { void handleCheckQz(); }}>
                  {qzStatus === 'checking' ? 'Verificando...' : 'Testar QZ Tray'}
                </button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => { void handleLoadQzPrinters(); }}>
                  Carregar impressoras QZ
                </button>
              </div>
              <span className={`thermal-settings__status thermal-settings__status--${qzStatus}`}>
                {qzStatus === 'ready' ? 'QZ Tray detectado e pronto para uso' : qzStatus === 'missing' ? 'QZ Tray não encontrado neste computador' : 'Ainda não verificado'}
              </span>
            </div>

            <div className="thermal-settings__qz-printer">
              <label>Impressora do QZ Tray</label>
              <select
                value={settings.qzPrinterName || ''}
                onChange={(e) => { void update({ qzPrinterName: e.target.value }); }}
              >
                <option value="">Selecione a impressora</option>
                {persistedQzPrinters.map((printer) => (
                  <option key={printer} value={printer}>{printer}</option>
                ))}
              </select>
              <span className="thermal-settings__status">
                Essa impressora será usada no modo RAW/BT do navegador.
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {section === 'visual' ? (
        <div className="thermal-settings__panel" role="tabpanel">
          <div className="thermal-settings__intro-card">
            <strong>Visual e acabamento</strong>
            <p>Ajuste o espaço interno, a densidade do texto e os elementos visuais do cupom para ficar limpo e econômico.</p>
          </div>

          <div className="thermal-settings__logo-status">
            <strong>Status da logo</strong>
            <span>{logoStatus}</span>
          </div>

          <div className="thermal-settings__mode-cards">
            <button
              type="button"
              className={`thermal-settings__mode-card ${!economyModeActive ? 'is-active' : ''}`}
              onClick={() => { void handleApplyNormalMode(); }}
            >
              <strong>Modo normal</strong>
              <span>Leitura mais confortável, com espaçamento padrão e linha de corte visível.</span>
            </button>
            <button
              type="button"
              className={`thermal-settings__mode-card ${economyModeActive ? 'is-active' : ''}`}
              onClick={() => { void handleApplyReducedMode(); }}
            >
              <strong>Modo reduzido</strong>
              <span>Economiza papel com fonte menor, margens mais curtas e cupom mais seco.</span>
            </button>
          </div>

          <div className="thermal-settings__grid">
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
        </div>
      ) : null}

      <div className="thermal-settings__footnote">
        Base útil recomendada: 48mm para POS-58 e 72mm para 80mm/Epson TM-T20. O modo compatível com diálogo foi removido da térmica.
      </div>
    </section>
  );
}
