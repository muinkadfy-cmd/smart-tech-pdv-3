export type ThermalPaperWidth = '58' | '80';

export type ThermalPrinterProfileId =
  | 'generic-pos-58'
  | 'generic-pos-80'
  | 'epson-tm-t20';

export interface ThermalPrinterProfile {
  id: ThermalPrinterProfileId;
  label: string;
  defaultPaperWidth: ThermalPaperWidth;
  usefulWidthMm: number;
  innerMarginMm: number;
  fontSizePx: number;
  lineHeight: number;
}

export const THERMAL_PRINTER_PROFILES: Record<ThermalPrinterProfileId, ThermalPrinterProfile> = {
  'generic-pos-58': {
    id: 'generic-pos-58',
    label: 'POS-58 / Genérica 58mm',
    defaultPaperWidth: '58',
    usefulWidthMm: 48,
    innerMarginMm: 2,
    fontSizePx: 11,
    lineHeight: 1.22,
  },
  'generic-pos-80': {
    id: 'generic-pos-80',
    label: 'Genérica 80mm',
    defaultPaperWidth: '80',
    usefulWidthMm: 72,
    innerMarginMm: 2,
    fontSizePx: 12,
    lineHeight: 1.24,
  },
  'epson-tm-t20': {
    id: 'epson-tm-t20',
    label: 'Epson TM-T20',
    defaultPaperWidth: '80',
    usefulWidthMm: 72,
    innerMarginMm: 2,
    fontSizePx: 12,
    lineHeight: 1.22,
  },
};

export function getThermalPrinterProfile(profileId?: string | null): ThermalPrinterProfile {
  if (profileId && profileId in THERMAL_PRINTER_PROFILES) {
    return THERMAL_PRINTER_PROFILES[profileId as ThermalPrinterProfileId];
  }
  return THERMAL_PRINTER_PROFILES['generic-pos-58'];
}

