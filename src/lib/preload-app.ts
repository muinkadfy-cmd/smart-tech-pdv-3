import { logger } from '@/utils/logger';
import { logStartupPersistenceSnapshot } from '@/lib/persistence-info';
import { migrateStoreData } from './store-migration';
import { installRepoBroadcastListener } from './repository/repo-broadcast';
import { isLowEndModeActive } from '@/lib/low-end-mode';
import {
  clientesRepo,
  produtosRepo,
  settingsRepo
} from './repositories';

/**
 * Preload local (OFFLINE-FIRST) — otimizado para PC fraco.
 *
 * Regras:
 * - NUNCA bloquear a UI.
 * - Preload "crítico" mínimo: Clientes + Produtos + Settings (termos/tema).
 * - O resto é carregado por rota (ver: route-preload.ts).
 */
export async function preloadAppLocalData(): Promise<void> {
  try {
    // Migração legada (rápida e síncrona)
    migrateStoreData();
  } catch {
    // ignore
  }

  try {
    installRepoBroadcastListener();
  } catch {
    // ignore
  }

  const critical = [settingsRepo, clientesRepo, produtosRepo];

  try { await logStartupPersistenceSnapshot('preload-start'); } catch { /* ignore */ }

  // Em PC fraco, evitar Promise.all (pico de CPU/RAM). Carregar sequencial.
  if (isLowEndModeActive()) {
    for (const r of critical) {
      try { await r.preloadLocal(); } catch { /* ignore */ }
    }
  } else {
    await Promise.allSettled(critical.map((r) => r.preloadLocal()));
  }

  try { await logStartupPersistenceSnapshot('preload-end'); } catch { /* ignore */ }

  if (import.meta.env.DEV) {
    logger.log('[Preload] Cache local carregado (crítico mínimo).');
  }
}
