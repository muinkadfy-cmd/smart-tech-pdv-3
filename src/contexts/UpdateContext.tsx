import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchUpdateManifest, getLastSeenVersion, setLastSeenVersion, compareVersions, type UpdateManifest } from '@/lib/updates';
import { fetchChangelog, getLastSeenCommit, setLastSeenCommit, type ChangelogPayload } from '@/lib/changelog';
import { showToast } from '@/components/ui/ToastContainer';
import { hardRepairPWA } from '@/lib/pwa-repair';
import { isBrowserOnline, isUpdateEnabled } from '@/lib/mode';
import { BUILD_COMMIT, BUILD_DATE, BUILD_ID, BUILD_VERSION } from '@/config/buildInfo';
import { appendUpdateLog, getUpdateLogs, type UpdateLogEntry } from '@/lib/updateLog';
import { isBrowserOnlineSafe } from '@/lib/capabilities/runtime-remote-adapter';

type UpdateState = {
  manifest: UpdateManifest | null;
  changelog: ChangelogPayload | null;

  /** Há build mais novo no servidor (versão/commit/data) do que o build atual. */
  updateAvailable: boolean;
  /** Há um Service Worker novo aguardando (needRefresh / registration.waiting). */
  pwaNeedRefresh: boolean;
  /** Existem novidades no changelog que ainda não foram marcadas como lidas. */
  hasUpdate: boolean;

  lastSeenVersion: string | null;
  lastSeenCommit: string | null;

  logs: UpdateLogEntry[];

  checkNow: () => Promise<void>;
  markAsRead: () => void;
  /** “Depois” no banner/modal */
  dismissPrompt: () => void;
  reloadApp: () => Promise<void>;
  clearAppCache: () => Promise<void>;
};

const UpdateContext = createContext<UpdateState | null>(null);

const DISMISS_KEY = 'smart-tech:update-prompt-dismissed';

function getLocalId() {
  return (BUILD_COMMIT || BUILD_ID || '').trim();
}

function getLocalBuildTimeMs() {
  try {
    const t = BUILD_DATE ? new Date(BUILD_DATE).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

function getServerId(m: UpdateManifest | null): string {
  const commit = String((m as any)?.commit || '').trim();
  const build = String((m as any)?.build || '').trim();
  return commit || build;
}

function getServerBuildTimeMs(m: UpdateManifest | null): number {
  try {
    const raw = String((m as any)?.date || '').trim();
    if (!raw) return 0;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

function isServerNewer(m: UpdateManifest | null): boolean {
  if (!m) return false;

  // 1) Semver (quando o versionamento é incrementado)
  if (m.version && compareVersions(m.version, BUILD_VERSION) > 0) return true;

  // 2) Commit/build id (quando a versão não muda mas o build mudou)
  const localId = getLocalId();
  const serverId = getServerId(m);
  if (localId && serverId && serverId !== localId) return true;

  // 3) Data do build (fallback)
  const lt = getLocalBuildTimeMs();
  const st = getServerBuildTimeMs(m);
  if (lt && st && st > lt + 60_000) return true; // tolerância 1 min

  return false;
}

function getPromptToken(m: UpdateManifest | null) {
  const v = String(m?.version || '').trim();
  const id = getServerId(m);
  const dt = String((m as any)?.date || '').trim();
  return `${v}::${id || dt || 'na'}`;
}

function isPromptDismissed(m: UpdateManifest | null) {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const token = getPromptToken(m);
    return parsed?.token === token && typeof parsed?.until === 'number' && parsed.until > Date.now();
  } catch {
    return false;
  }
}

function dismissPromptFor(m: UpdateManifest | null) {
  try {
    const token = getPromptToken(m);
    const payload = { token, until: Date.now() + 6 * 60 * 60 * 1000 };
    localStorage.setItem(DISMISS_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function canShowUpdateToast(): boolean {
  try {
    const key = 'smart-tech:last-update-toast';
    const last = Number(localStorage.getItem(key) || '0');
    const now = Date.now();
    if (Number.isFinite(last) && now - last < 6 * 60 * 60 * 1000) return false;
    localStorage.setItem(key, String(now));
    return true;
  } catch {
    return true;
  }
}

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [manifest, setManifest] = useState<UpdateManifest | null>(null);
  const [changelog, setChangelog] = useState<ChangelogPayload | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [pwaNeedRefresh, setPwaNeedRefresh] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [lastSeenVersion, setLastSeen] = useState<string | null>(() => getLastSeenVersion());
  const [lastSeenCommit, setLastSeenC] = useState<string | null>(() => getLastSeenCommit());
  const [logs, setLogs] = useState<UpdateLogEntry[]>(() => getUpdateLogs());

  const refreshLogs = useCallback(() => {
    try {
      setLogs(getUpdateLogs());
    } catch {
      // ignore
    }
  }, []);

  const log = useCallback(
    (type: Parameters<typeof appendUpdateLog>[0], message: string) => {
      try {
        appendUpdateLog(type, message);
        refreshLogs();
      } catch {
        // ignore
      }
    },
    [refreshLogs]
  );

  const detectWaitingSW = useCallback(async (): Promise<boolean> => {
    try {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return Boolean(reg?.waiting);
    } catch {
      return false;
    }
  }, []);

  const checkNow = useCallback(async () => {
    if (!isUpdateEnabled()) return;

    const [m, c, waiting] = await Promise.all([
      fetchUpdateManifest(),
      fetchChangelog(),
      detectWaitingSW(),
    ]);

    if (m) setManifest(m);
    if (c) setChangelog(c);
    setPwaNeedRefresh(Boolean(waiting));

    const seenVersion = getLastSeenVersion();
    const seenCommit = getLastSeenCommit();
    setLastSeen(seenVersion);
    setLastSeenC(seenCommit);

    // Primeira execução: define “lido” como o build atual (não o remoto).
    if (!seenVersion) setLastSeenVersion(BUILD_VERSION);
    if (!seenCommit) {
      const localId = getLocalId();
      if (localId) setLastSeenCommit(localId);
    }

    const effectiveSeenVersion = seenVersion || BUILD_VERSION;
    const effectiveSeenCommit = seenCommit || getLocalId();

    const serverNewer = isServerNewer(m);
    setUpdateAvailable(Boolean(serverNewer || waiting));

    // Novidades “não lidas”: versão > vista OU commit do changelog > visto
    const versionUnread = m?.version ? compareVersions(m.version, effectiveSeenVersion) > 0 : false;
    const serverId = getServerId(m);
    const buildUnread = Boolean(serverId && effectiveSeenCommit && serverId !== effectiveSeenCommit);
    const changelogUnread = Boolean(c?.commit && effectiveSeenCommit && c.commit !== effectiveSeenCommit);
    const unread = Boolean(versionUnread || buildUnread || changelogUnread);
    setHasUpdate(unread);

    if ((serverNewer || waiting) && !isPromptDismissed(m)) {
      log('check', `Update detectado (${waiting ? 'SW aguardando' : 'manifest'}).`);
    } else if (unread) {
      log('check', 'Novidades detectadas (changelog).');
    }
  }, [detectWaitingSW, log]);

  const markAsRead = useCallback(() => {
    // Segurança: se o app ainda NÃO atualizou, não marque como lido.
    // Isso evita o caso “o usuário marcou como lido mas ficou preso no cache antigo do PWA”.
    if (updateAvailable || pwaNeedRefresh) {
      showToast('⚠️ Atualize o app antes de marcar como lido (evita ficar preso em cache antigo).', 'warning', 6500);
      return;
    }

    const serverId = getServerId(manifest);

    if (manifest?.version) {
      setLastSeenVersion(manifest.version);
      setLastSeen(manifest.version);
    }

    if (serverId) {
      setLastSeenCommit(serverId);
      setLastSeenC(serverId);
    } else if (changelog?.commit) {
      setLastSeenCommit(changelog.commit);
      setLastSeenC(changelog.commit);
    }

    setHasUpdate(false);
    showToast('✅ Atualizações marcadas como lidas.', 'success', 3500);
    log('mark_read', 'Atualizações marcadas como lidas.');
  }, [updateAvailable, pwaNeedRefresh, manifest, changelog?.commit, log]);

  const dismissPrompt = useCallback(() => {
    dismissPromptFor(manifest);
    log('dismiss', 'Aviso de atualização adiado (Depois).');
  }, [manifest, log]);

  const reloadApp = useCallback(async () => {
    if (!isUpdateEnabled()) return;

    if (!isBrowserOnline()) {
      showToast('⚠️ Você está sem internet. Conecte-se para atualizar o app.', 'warning', 6500);
      return;
    }

    log('apply', 'Usuário solicitou "Atualizar agora".');

    // Marca que um update foi solicitado (para o handler de controllerchange recarregar com segurança)
    try {
      sessionStorage.setItem('smart-tech:pending-update-reload', '1');
    } catch {
      // ignore
    }

    // 1) Fluxo preferencial: função exposta pelo main.tsx (vite-plugin-pwa registerSW)
    const updateFn = (window as any)?.__SMARTTECH_UPDATE_SW__;
    if (typeof updateFn === 'function') {
      showToast('🔄 Atualizando o app. Aguarde de 10 a 20 segundos e não feche a tela.', 'info', 6000);

      // Watchdog: se não recarregar, faz “reparo hard” (evita ficar preso em build antigo)
      try {
        window.setTimeout(() => {
          try {
            const pending = sessionStorage.getItem('smart-tech:pending-update-reload') === '1';
            if (!pending) return;
          } catch {
            // ignore
          }
          try {
            showToast('⚠️ A atualização demorou mais que o esperado. Vamos limpar o cache e recarregar o app.', 'warning', 6500);
          } catch {
            // ignore
          }
          void hardRepairPWA();
        }, 20000);
      } catch {
        // ignore
      }

      try {
        await updateFn(true);
        return;
      } catch {
        // fallback abaixo
      }
    }

    // 2) Fallback: tenta update do registro e recarrega
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update?.();
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    } catch {
      // ignore
    }

    window.location.reload();
  }, [log]);

  const clearAppCache = useCallback(async () => {
    if (!isUpdateEnabled()) return;
    log('clear_cache', 'Limpeza de cache do app solicitada.');
    await hardRepairPWA();
  }, [log]);

  // Checagem automática:
  // - ao montar
  // - a cada 2h (somente quando online)
  // - quando voltar a ficar online
  // - quando a aba voltar a ficar visível
  // - quando o main.tsx disparar "need refresh"
  useEffect(() => {
    if (!isUpdateEnabled()) return;

    void checkNow();
    let stopped = false;

    const maybeCheck = () => {
      if (stopped) return;
      if (isBrowserOnlineSafe()) void checkNow();
    };

    const id = window.setInterval(maybeCheck, 2 * 60 * 60 * 1000);
    const onOnline = () => maybeCheck();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') maybeCheck();
    };
    const onNeedRefresh = () => {
      setPwaNeedRefresh(true);
      log('need_refresh', 'SW aguardando (evento do main.tsx).');
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('smart-tech:pwa-need-refresh', onNeedRefresh);

    return () => {
      stopped = true;
      window.clearInterval(id);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('smart-tech:pwa-need-refresh', onNeedRefresh);
    };
  }, [checkNow, log]);

  const value = useMemo<UpdateState>(
    () => ({
      manifest,
      changelog,
      updateAvailable,
      pwaNeedRefresh,
      hasUpdate,
      lastSeenVersion,
      lastSeenCommit,
      logs,
      checkNow,
      markAsRead,
      dismissPrompt,
      reloadApp,
      clearAppCache,
    }),
    [
      manifest,
      changelog,
      updateAvailable,
      pwaNeedRefresh,
      hasUpdate,
      lastSeenVersion,
      lastSeenCommit,
      logs,
      checkNow,
      markAsRead,
      dismissPrompt,
      reloadApp,
      clearAppCache,
    ]
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useUpdates() {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error('useUpdates must be used within UpdateProvider');
  return ctx;
}
