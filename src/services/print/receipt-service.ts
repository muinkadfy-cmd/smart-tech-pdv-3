import { isDesktopApp } from '@/lib/platform';
import { printDocument } from '@/lib/print-template';
import { getRuntimeStoreId } from '@/lib/runtime-context';
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
  return `/print/${request.type}/${encodeURIComponent(request.id)}?${params.toString()}`;
}

export async function printReceipt(request: PrintReceiptRequest): Promise<void> {
  const settings = loadThermalPrintSettings();
  const paperWidth = request.paperWidth ?? settings.paperWidth;

  if (isDesktopApp()) {
    const resolved = await resolveReceiptPrintData(request.type, request.id);
    if (!resolved) throw new Error('Documento de impressão não encontrado.');

    printDocument(resolved.printData, {
      paperSize: paperWidth === '80' ? '80mm' : '58mm',
      printMode: 'compact',
    });
    return;
  }

  const route = buildPrintRoute(request);
  const features = paperWidth === '80'
    ? 'width=540,height=820,noopener,noreferrer'
    : 'width=460,height=820,noopener,noreferrer';

  const popup = window.open(route, '_blank', features);
  if (!popup) {
    window.location.assign(route);
  }
}
