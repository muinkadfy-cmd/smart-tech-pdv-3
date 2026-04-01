import { isDesktopApp } from '@/lib/platform';
import { printDocument } from '@/lib/print-template';
import { getRuntimeStoreId } from '@/lib/runtime-context';
import { loadPrintProfile } from '@/print/printProfiles';
import { printViaQzTray } from './qzTrayService';
import { loadThermalPrintSettings } from './settings';
import { resolveReceiptPrintData, type PrintableReceiptType } from './receipt-builders';

export interface PrintReceiptRequest {
  type: PrintableReceiptType;
  id: string;
  paperWidth?: '58' | '80';
  printerProfile?: string;
}

function buildPrintRoute(request: PrintReceiptRequest) {
  const settings = loadThermalPrintSettings();
  const paper = request.paperWidth ?? settings.paperWidth;
  const profile = request.printerProfile ?? settings.printerProfile;
  const storeId = getRuntimeStoreId();
  const params = new URLSearchParams({
    paper,
    profile,
  });
  if (storeId) params.set('store', storeId);
  if (typeof window !== 'undefined') {
    params.set('returnTo', `${window.location.pathname}${window.location.search}`);
  }
  return `/print/${request.type}/${encodeURIComponent(request.id)}?${params.toString()}`;
}

export function openPrintTest(): void {
  const route = buildPrintRoute({ type: 'test', id: 'sample' });
  if (typeof window !== 'undefined') {
    window.location.href = route;
  }
}

export async function printReceipt(request: PrintReceiptRequest): Promise<void> {
  const settings = loadThermalPrintSettings();
  const paperWidth = request.paperWidth ?? settings.paperWidth;
  const printProfile = loadPrintProfile();
  const thermalMode = settings.printDensity === 'compact' ? 'compact' : 'normal';

  if (isDesktopApp()) {
    const resolved = await resolveReceiptPrintData(request.type, request.id);
    if (!resolved) throw new Error('Documento de impressão não encontrado.');

    printDocument(resolved.printData, {
      paperSize: paperWidth === '80' ? '80mm' : '58mm',
      printMode: thermalMode,
    });
    return;
  }

  if (settings.backend === 'qz-tray') {
    try {
      const resolved = await resolveReceiptPrintData(request.type, request.id);
      if (!resolved) throw new Error('Documento de impressão não encontrado.');
      const printerName = (settings.qzPrinterName || printProfile.printerName || '').trim();
      if (!printerName) throw new Error('Selecione a impressora no sistema antes de usar QZ Tray.');

      await printViaQzTray({
        scriptUrl: settings.qzScriptUrl,
        printerName,
        paperWidth,
        printMode: thermalMode,
        printData: resolved.printData,
        company: resolved.thermalModel.company,
        jobName: `Smart Tech - ${resolved.printData.tipo} ${resolved.printData.numero}`.trim(),
      });
      return;
    } catch (error) {
      console.error('[Print] QZ Tray falhou:', error);
      const message = error instanceof Error ? error.message : String(error);
      alert(
        'Impressão térmica em modo RAW/BT indisponível.\n\n' +
        `${message}\n\n` +
        'Abra o QZ Tray, confirme a impressora e tente novamente.'
      );
      return;
    }
  }

  alert('Impressão térmica compatível foi removida. Use RAW/BT silencioso.');
}
