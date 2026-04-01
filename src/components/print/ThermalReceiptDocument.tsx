import type { ThermalReceiptModel } from '@/services/print/receipt-builders';
import type { ThermalPrintSettings } from '@/services/print/settings';
import './ThermalReceiptDocument.css';

interface ThermalReceiptDocumentProps {
  model: ThermalReceiptModel;
  settings: ThermalPrintSettings;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));
}

export default function ThermalReceiptDocument({ model, settings }: ThermalReceiptDocumentProps) {
  const paperWidthMm = settings.paperWidth === '80' ? '80mm' : '58mm';
  const usefulWidthMm = `${settings.usefulWidthMm}mm`;
  const marginMm = `${settings.innerMarginMm}mm`;

  return (
    <div
      className="thermal-receipt"
      style={{
        ['--paper-width-mm' as any]: paperWidthMm,
        ['--useful-width-mm' as any]: usefulWidthMm,
        ['--inner-margin-mm' as any]: marginMm,
        ['--font-size-px' as any]: `${settings.fontSizePx}px`,
        ['--line-height' as any]: String(settings.lineHeight),
      }}
    >
      <div className="thermal-receipt__inner">
        <header className="thermal-receipt__header thermal-receipt__brand">
          {settings.showLogo && model.company.logo_url ? (
            <img
              className="thermal-receipt__logo"
              src={model.company.logo_url}
              alt={model.company.nome}
              loading="eager"
              decoding="sync"
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
            />
          ) : null}
          <div className="thermal-receipt__store-name">{model.company.nome}</div>
          {model.company.cnpj ? <div className="thermal-receipt__company-line">CNPJ: {model.company.cnpj}</div> : null}
          {model.company.telefone ? <div className="thermal-receipt__company-line">Tel: {model.company.telefone}</div> : null}
          {[model.company.endereco, model.company.cidade, model.company.estado].filter(Boolean).length ? (
            <div className="thermal-receipt__company-line">
              {[model.company.endereco, model.company.cidade, model.company.estado].filter(Boolean).join(', ')}
            </div>
          ) : null}
        </header>

        <section className="thermal-receipt__meta">
          <div className="thermal-receipt__title">{model.title}</div>
          <div className="thermal-receipt__doc-number">{model.documentNumber}</div>
          <div className="thermal-receipt__meta-line">
            <span className="thermal-receipt__section-label">Data</span>
            <span className="thermal-receipt__meta-value">{model.dateLabel}</span>
          </div>
          {model.customerName ? (
            <div className="thermal-receipt__meta-line">
              <span className="thermal-receipt__section-label">Cliente</span>
              <span className="thermal-receipt__meta-value">{model.customerName}</span>
            </div>
          ) : null}
          {model.customerPhone ? (
            <div className="thermal-receipt__meta-line">
              <span className="thermal-receipt__section-label">Contato</span>
              <span className="thermal-receipt__meta-value">{model.customerPhone}</span>
            </div>
          ) : null}
          {model.customerAddress ? (
            <div className="thermal-receipt__meta-line">
              <span className="thermal-receipt__section-label">Endereco</span>
              <span className="thermal-receipt__meta-value">{model.customerAddress}</span>
            </div>
          ) : null}
        </section>

        <section className="thermal-receipt__items">
          {model.items.map((item, index) => (
            <article key={`${item.label}-${index}`} className="thermal-receipt__item">
              <div className="thermal-receipt__item-name">{item.label}</div>
              <div className="thermal-receipt__item-line">
                <span>
                  {item.quantity ? `${item.quantity}x` : ''}
                  {typeof item.unitPrice === 'number' ? ` ${formatCurrency(item.unitPrice)}` : ''}
                </span>
                <strong>{formatCurrency(item.total)}</strong>
              </div>
              {item.note ? <div className="thermal-receipt__item-note">{item.note}</div> : null}
            </article>
          ))}
        </section>

        <section className="thermal-receipt__totals">
          {typeof model.subtotal === 'number' ? (
            <div className="thermal-receipt__summary-row">
              <span className="thermal-receipt__summary-label">Subtotal</span>
              <span className="thermal-receipt__summary-value">{formatCurrency(model.subtotal)}</span>
            </div>
          ) : null}
          {typeof model.discount === 'number' && model.discount > 0 ? (
            <div className="thermal-receipt__summary-row">
              <span className="thermal-receipt__summary-label">Desconto</span>
              <span className="thermal-receipt__summary-value">- {formatCurrency(model.discount)}</span>
            </div>
          ) : null}
          {model.paymentLabel ? (
            <div className="thermal-receipt__summary-row">
              <span className="thermal-receipt__summary-label">Pagamento</span>
              <span className="thermal-receipt__summary-value">{model.paymentLabel}</span>
            </div>
          ) : null}
          {model.installmentsLabel ? (
            <div className="thermal-receipt__summary-row">
              <span className="thermal-receipt__summary-label">Parcelas</span>
              <span className="thermal-receipt__summary-value">{model.installmentsLabel}</span>
            </div>
          ) : null}
          <div className="thermal-receipt__summary-row thermal-receipt__summary-row--grand">
            <span className="thermal-receipt__summary-label">Total</span>
            <span className="thermal-receipt__summary-value">{formatCurrency(model.total)}</span>
          </div>
        </section>

        {model.notes?.length ? (
          <section className="thermal-receipt__notes">
            <div className="thermal-receipt__section-label">Observacoes</div>
            {model.notes.map((note, index) => (
              <div key={`${note}-${index}`} className="thermal-receipt__note">{note}</div>
            ))}
          </section>
        ) : null}

        <footer className="thermal-receipt__footer">
          <div className="thermal-receipt__footer-message">{model.footerMessage}</div>
          {settings.showFooterCut ? <div className="thermal-receipt__cut">corte aqui</div> : null}
        </footer>
      </div>
    </div>
  );
}
