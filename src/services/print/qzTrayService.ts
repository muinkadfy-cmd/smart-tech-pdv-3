import { buildEscposReceiptFromPrintData } from '@/utils/escpos';
import type { EmpresaInfo, PrintData } from '@/lib/print-template';
import type { PrintMode } from '@/lib/print-template';

declare global {
  interface Window {
    qz?: any;
  }
}

let qzScriptPromise: Promise<void> | null = null;
let qzSecurityPromise: Promise<void> | null = null;

const QZ_SIGNATURE_ALGORITHM = (import.meta.env.VITE_QZ_SIGNATURE_ALGORITHM || 'SHA512').trim() || 'SHA512';
const QZ_CERT_URL = String(import.meta.env.VITE_QZ_CERT_URL || '').trim();
const QZ_SIGN_URL = String(import.meta.env.VITE_QZ_SIGN_URL || '').trim();
const QZ_CERT_PEM = String(import.meta.env.VITE_QZ_CERT_PEM || '').replace(/\\n/g, '\n').trim();

export interface QzTrustModeStatus {
  configured: boolean;
  certificateConfigured: boolean;
  signatureConfigured: boolean;
  algorithm: string;
  modeLabel: string;
}

export function getQzTrustModeStatus(): QzTrustModeStatus {
  const certificateConfigured = Boolean(QZ_CERT_PEM || QZ_CERT_URL);
  const signatureConfigured = Boolean(QZ_SIGN_URL);
  const configured = certificateConfigured && signatureConfigured;

  return {
    configured,
    certificateConfigured,
    signatureConfigured,
    algorithm: QZ_SIGNATURE_ALGORITHM,
    modeLabel: configured ? 'QZ confiável pronto para produção' : 'QZ confiável ainda pendente',
  };
}

async function fetchTextOrThrow(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'Content-Type': 'text/plain' },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Falha ao buscar ${url}`);
  }
  return text.trim();
}

async function fetchSignatureOrThrow(url: string, toSign: string): Promise<string> {
  const encoded = encodeURIComponent(toSign);

  try {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}request=${encoded}`, {
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain' },
    });
    const text = await response.text();
    if (response.ok && text.trim()) return text.trim();
  } catch {
    // tenta fallback abaixo
  }

  const response = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request: toSign }),
  });
  const text = await response.text();
  if (!response.ok || !text.trim()) {
    throw new Error(text || 'Falha ao assinar mensagem do QZ Tray.');
  }
  return text.trim();
}

async function applyQzSecurityConfig(qz: any): Promise<void> {
  const trust = getQzTrustModeStatus();
  if (!trust.certificateConfigured && !trust.signatureConfigured) return;
  if (qzSecurityPromise) return qzSecurityPromise;

  qzSecurityPromise = Promise.resolve().then(() => {
    if (trust.certificateConfigured) {
      qz.security.setCertificatePromise((resolve: (value: string) => void, reject: (reason?: unknown) => void) => {
        if (QZ_CERT_PEM) {
          resolve(QZ_CERT_PEM);
          return;
        }
        fetchTextOrThrow(QZ_CERT_URL).then(resolve).catch(reject);
      });
    }

    if (trust.signatureConfigured) {
      qz.security.setSignatureAlgorithm(trust.algorithm);
      qz.security.setSignaturePromise((toSign: string) => {
        return (resolve: (value: string) => void, reject: (reason?: unknown) => void) => {
          fetchSignatureOrThrow(QZ_SIGN_URL, toSign).then(resolve).catch(reject);
        };
      });
    }
  }).catch((error) => {
    qzSecurityPromise = null;
    throw error;
  });

  return qzSecurityPromise;
}

function loadScript(src: string): Promise<void> {
  if (window.qz) return Promise.resolve();
  if (qzScriptPromise) return qzScriptPromise;

  qzScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-qz-tray="1"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar QZ Tray.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.qzTray = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar QZ Tray.'));
    document.head.appendChild(script);
  });

  return qzScriptPromise;
}

async function getQz(scriptUrl: string) {
  await loadScript(scriptUrl);
  if (!window.qz) throw new Error('QZ Tray não ficou disponível na página.');
  await applyQzSecurityConfig(window.qz);
  return window.qz;
}

export async function isQzTrayAvailable(scriptUrl: string): Promise<boolean> {
  try {
    const qz = await getQz(scriptUrl);
    return Boolean(qz?.websocket);
  } catch {
    return false;
  }
}

export async function connectQzTray(scriptUrl: string): Promise<void> {
  const qz = await getQz(scriptUrl);
  if (qz.websocket.isActive?.()) return;
  await qz.websocket.connect({ retries: 2, delay: 1 });
}

export async function listQzPrinters(scriptUrl: string): Promise<string[]> {
  const qz = await getQz(scriptUrl);
  await connectQzTray(scriptUrl);
  const printers = await qz.printers.find();
  if (!Array.isArray(printers)) return [];
  return printers.map((item) => String(item || '').trim()).filter(Boolean);
}

function uint8ToBinaryString(data: Uint8Array): string {
  let out = '';
  for (let i = 0; i < data.length; i++) out += String.fromCharCode(data[i] & 0xff);
  return out;
}

function normalizePrinterName(value: unknown): string {
  return String(value || '').trim();
}

export async function printViaQzTray(args: {
  scriptUrl: string;
  printerName: string;
  paperWidth: '58' | '80';
  printMode: PrintMode;
  printData: PrintData;
  company: EmpresaInfo;
  jobName: string;
}): Promise<void> {
  const qz = await getQz(args.scriptUrl);
  await connectQzTray(args.scriptUrl);

  const printers = await listQzPrinters(args.scriptUrl);
  const printer = printers.find((item) => normalizePrinterName(item) === normalizePrinterName(args.printerName));
  if (!printer) {
    throw new Error(`A impressora "${args.printerName}" não foi encontrada no QZ Tray.`);
  }

  const config = qz.configs.create(printer, {
    jobName: args.jobName,
    encoding: 'Cp1252',
    copies: 1,
  });

  const bytes = buildEscposReceiptFromPrintData(
    args.printData,
    args.company,
    args.paperWidth === '80' ? '80mm' : '58mm',
    args.printMode,
  );

  const payload = [{
    type: 'raw',
    format: 'command',
    flavor: 'plain',
    data: uint8ToBinaryString(bytes),
  }];
  await qz.print(config, payload);
}
