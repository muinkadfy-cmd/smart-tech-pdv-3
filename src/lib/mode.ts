/**
 * Modo de Operação do Smart Tech PDV
 *
 * Regras atuais:
 * - Desktop/Tauri continua local-first por padrão
 * - Web/PWA usa Supabase quando configurado
 * - A flag `smart-tech:local-only` pode forçar modo local no navegador
 *
 * Mantemos a API (isLocalOnly/setLocalOnly) para não quebrar imports.
 */

import { isDesktopApp } from "./platform";
import { isBrowserOnlineSafe, isRemoteRuntimeConfigured } from '@/lib/capabilities/runtime-remote-adapter';

const LS_KEY = 'smart-tech:local-only';

export function isLocalOnly(): boolean {
  if (isDesktopApp()) return true;
  if (typeof window === 'undefined') return false;

  if (typeof window !== 'undefined') {
    try {
      const hasSupabaseEnv = Boolean(
        import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
      );
      if (hasSupabaseEnv) {
        localStorage.removeItem(LS_KEY);
        return false;
      }
      return localStorage.getItem(LS_KEY) === '1';
    } catch {
      return false;
    }
  }

  return false;
}

/** Mantido por compatibilidade. */
export function setLocalOnly(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) {
      localStorage.setItem(LS_KEY, '1');
    } else {
      localStorage.removeItem(LS_KEY);
    }
  } catch {
    // ignore
  }
}

/** Mantido por compatibilidade. */
export function isBrowserOnline(): boolean {
  return isBrowserOnlineSafe();
}

/**
 * Flags de recursos neste build local.
 * Objetivo: permitir exceções (ex.: Atualizações do PWA) sem reativar sync.
 *
 * Persistência: localStorage
 * - smart-tech:feature-flags = {"updates":true,"license":false}
 */
export type FeatureFlags = { updates?: boolean; license?: boolean };
const FLAGS_KEY = 'smart-tech:feature-flags';

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function readFlags(): FeatureFlags {
  if (!hasWindow()) return {};
  try {
    const raw = localStorage.getItem(FLAGS_KEY);
    return raw ? (JSON.parse(raw) as FeatureFlags) : {};
  } catch {
    return {};
  }
}

function writeFlags(flags: FeatureFlags) {
  if (!hasWindow()) return;
  try {
    localStorage.setItem(FLAGS_KEY, JSON.stringify(flags));
  } catch {
    // ignore
  }
}

export function isSyncEnabled(): boolean {
  return !isLocalOnly();
}

/** Atualizações do PWA: ON por padrão (para permitir atualizar quando houver internet). */
export function isUpdateEnabled(): boolean {
  // No Desktop/Tauri não existe Service Worker, então PWA update fica desligado.
  if (isDesktopApp()) return false;

  const f = readFlags();
  return f.updates !== false;
}

/** Licença remota: OFF por padrão (pode ser habilitada no futuro). */
export function isLicenseEnabled(): boolean {
  if (!isDesktopApp() && isRemoteRuntimeConfigured()) {
    return true;
  }
  const f = readFlags();
  return f.license === true || isLicenseMandatory();
}

/**
 * No navegador, a licença pode ser remota. No desktop local, mantemos a exigência
 * apenas quando o build/ambiente pedir isso explicitamente.
 */
export function isLicenseMandatory(): boolean {
  return isDesktopApp() && import.meta.env.PROD;
}

/**
 * Controle de permissão para alternar a flag de licença.
 * Mantido para compatibilidade com telas antigas.
 */
export function canToggleLicenseFlag(): boolean {
  if (isLicenseMandatory()) return false;
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem('smart-tech:session');
    const s = raw ? JSON.parse(raw) : null;
    return s?.role === 'admin' || s?.isSuperAdmin === true;
  } catch {
    return false;
  }
}

export function setFeatureFlag(key: keyof FeatureFlags, enabled: boolean) {
  const f = readFlags();
  (f as any)[key] = enabled;
  writeFlags(f);
}

export function getModeDiagnostics(): {
  localOnly: boolean;
  browserOnline: boolean;
  desktop: boolean;
  updatesEnabled: boolean;
  licenseEnabled: boolean;
  licenseMandatory: boolean;
} {
  return {
    localOnly: isLocalOnly(),
    browserOnline: isBrowserOnlineSafe(),
    desktop: isDesktopApp(),
    updatesEnabled: isUpdateEnabled(),
    licenseEnabled: isLicenseEnabled(),
    licenseMandatory: isLicenseMandatory()
  };
}
