import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import ThermalReceiptDocument from '@/components/print/ThermalReceiptDocument';
import { resolveReceiptPrintData, type PrintableReceiptType } from '@/services/print/receipt-builders';
import { loadThermalPrintSettings, type ThermalPrintSettings } from '@/services/print/settings';
import { isValidUUID, setStoreId } from '@/lib/store-id';

export default function PrintReceiptPage() {
  const { docType, id } = useParams<{ docType: PrintableReceiptType; id: string }>();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<Awaited<ReturnType<typeof resolveReceiptPrintData>>>(null);

  const settings = useMemo<ThermalPrintSettings>(() => {
    const base = loadThermalPrintSettings();
    const paper = searchParams.get('paper');
    const profile = searchParams.get('profile');
    return {
      ...base,
      paperWidth: paper === '80' ? '80' : paper === '58' ? '58' : base.paperWidth,
      printerProfile: (profile as any) || base.printerProfile,
    };
  }, [searchParams]);

  useEffect(() => {
    let alive = true;

    void (async () => {
      if (!docType || !id) {
        setError('Documento de impressão inválido.');
        setLoading(false);
        return;
      }

      const requestedStore = searchParams.get('store')?.trim() || '';
      if (requestedStore && isValidUUID(requestedStore)) {
        setStoreId(requestedStore, { force: true, reason: 'print-route-bootstrap' });
      }

      const tryResolve = async () => {
        for (let attempt = 0; attempt < 12; attempt++) {
          const resolvedTry = await resolveReceiptPrintData(docType, id);
          if (resolvedTry) return resolvedTry;
          await new Promise((resolve) => window.setTimeout(resolve, 180));
        }
        return null;
      };

      const resolved = await tryResolve();
      if (!alive) return;

      if (!resolved) {
        setError('Não foi possível carregar os dados do cupom.');
        setLoading(false);
        return;
      }

      setModel(resolved);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [docType, id, searchParams]);

  useEffect(() => {
    if (loading || error || !model) return;

    const autoClose = settings.autoCloseAfterPrint;
    const onAfterPrint = () => {
      if (autoClose) {
        setTimeout(() => window.close(), 250);
      }
    };

    window.addEventListener('afterprint', onAfterPrint, { once: true });

    const timer = window.setTimeout(() => {
      window.focus();
      window.print();
    }, 320);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, [loading, error, model, settings.autoCloseAfterPrint]);

  if (loading) {
    return <div className="thermal-print-page"><div className="thermal-print-page__status">Preparando cupom…</div></div>;
  }

  if (error || !model) {
    return <div className="thermal-print-page"><div className="thermal-print-page__status">{error || 'Cupom indisponível.'}</div></div>;
  }

  return (
    <div className="thermal-print-page">
      <ThermalReceiptDocument model={model.thermalModel} settings={settings} />
      <div className="thermal-print-page__status">
        Cupom {settings.paperWidth}mm pronto para impressão
      </div>
    </div>
  );
}
