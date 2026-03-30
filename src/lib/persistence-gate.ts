import { isDesktopApp } from '@/lib/platform';
import { forceSqliteCheckpoint } from '@/lib/sqlite-maintenance';
import { logger } from '@/utils/logger';

let pendingWrites = 0;
let closeGuardRegistered = false;
let closeDrainInProgress = false;
let allowImmediateClose = false;

const PENDING_EVENT = 'smarttech:persistence-pending-changed';
const ERROR_EVENT = 'smarttech:persistence-write-failed';
const STATE_EVENT = 'smarttech:persistence-state-changed';

export type PersistenceGuardState = {
  pendingWrites: number;
  closeDrainInProgress: boolean;
  allowImmediateClose: boolean;
};

function notifyPending(): void {
  try {
    window.dispatchEvent(new CustomEvent(PENDING_EVENT, { detail: { pendingWrites } }));
  } catch {
    // ignore
  }
  notifyState();
}

function notifyState(): void {
  try {
    window.dispatchEvent(new CustomEvent(STATE_EVENT, { detail: getPersistenceGuardState() }));
  } catch {
    // ignore
  }
}

function setCloseFlags(partial: { closeDrainInProgress?: boolean; allowImmediateClose?: boolean }): void {
  try {
    const w = window as any;
    if (typeof partial.closeDrainInProgress === 'boolean') {
      closeDrainInProgress = partial.closeDrainInProgress;
      w.__smarttechCloseDrainInProgress = partial.closeDrainInProgress;
    }
    if (typeof partial.allowImmediateClose === 'boolean') {
      allowImmediateClose = partial.allowImmediateClose;
      w.__smarttechAllowImmediateClose = partial.allowImmediateClose;
    }
    w.__smarttechCloseGuardInstalled = true;
  } catch {
    if (typeof partial.closeDrainInProgress === 'boolean') closeDrainInProgress = partial.closeDrainInProgress;
    if (typeof partial.allowImmediateClose === 'boolean') allowImmediateClose = partial.allowImmediateClose;
  }
  notifyState();
}

export function beginWrite(_label?: string): void {
  pendingWrites += 1;
  notifyPending();
}

export function endWrite(_label?: string): void {
  pendingWrites = Math.max(0, pendingWrites - 1);
  notifyPending();
}

export function getPendingWritesCount(): number {
  return pendingWrites;
}

export function getPersistenceGuardState(): PersistenceGuardState {
  return {
    pendingWrites,
    closeDrainInProgress,
    allowImmediateClose,
  };
}

export function onPersistenceGuardStateChange(fn: (state: PersistenceGuardState) => void): () => void {
  const handler = (event: Event) => {
    try {
      fn(((event as CustomEvent<PersistenceGuardState>).detail) || getPersistenceGuardState());
    } catch {
      fn(getPersistenceGuardState());
    }
  };

  window.addEventListener(STATE_EVENT, handler as EventListener);
  return () => window.removeEventListener(STATE_EVENT, handler as EventListener);
}

export function isImmediateCloseAllowed(): boolean {
  return allowImmediateClose;
}

export function isCloseDrainActive(): boolean {
  return closeDrainInProgress;
}

export function reportPersistenceError(
  context: string,
  error: unknown,
  options?: { markDbCorrupted?: boolean; dispatchSqliteFailed?: boolean }
): void {
  const message = String((error as any)?.message || error || 'Falha de persistência');
  const markDbCorrupted = options?.markDbCorrupted !== false;
  const dispatchSqliteFailed = options?.dispatchSqliteFailed !== false;

  logger.error(`[PersistenceGate] ${context}:`, error);

  try {
    const w = window as any;
    w.__smarttechSqliteError = message;
    if (markDbCorrupted) w.__smarttechDbCorrupted = true;
  } catch {
    // ignore
  }

  if (dispatchSqliteFailed) {
    try {
      window.dispatchEvent(new CustomEvent('smarttech:sqlite-failed', { detail: { tableKey: context, error: message } }));
    } catch {
      // ignore
    }
  }

  try {
    window.dispatchEvent(new CustomEvent(ERROR_EVENT, { detail: { context, error: message } }));
  } catch {
    // ignore
  }
}

function reportCloseGuardError(context: string, error: unknown): void {
  reportPersistenceError(context, error, {
    markDbCorrupted: false,
    dispatchSqliteFailed: false,
  });
}

export async function flushPendingWrites(timeoutMs = 15000): Promise<void> {
  const startedAt = Date.now();

  while (pendingWrites > 0) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timeout aguardando persistência (${pendingWrites} pendente(s))`);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
}

export async function registerDesktopPersistenceCloseGuard(): Promise<void> {
  if (!isDesktopApp() || closeGuardRegistered) return;
  closeGuardRegistered = true;
  setCloseFlags({ closeDrainInProgress: false, allowImmediateClose: false });

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();

    await appWindow.onCloseRequested(async (event) => {
      if (allowImmediateClose) return;

      event.preventDefault();

      if (closeDrainInProgress) return;

      setCloseFlags({ closeDrainInProgress: true });

      try {
        await flushPendingWrites(15000);
        await forceSqliteCheckpoint('app-close', 'TRUNCATE');

        try {
          const { runAutoBackupBeforeCloseIfNeeded } = await import('@/lib/auto-backup');
          await runAutoBackupBeforeCloseIfNeeded();
        } catch (backupError) {
          logger.warn('[PersistenceGate] Falha no auto-backup durante fechamento protegido:', backupError);
        }

        setCloseFlags({ allowImmediateClose: true });
        await appWindow.close();
      } catch (error) {
        reportCloseGuardError('close-guard', error);
      } finally {
        setCloseFlags({ closeDrainInProgress: false });
      }
    });
  } catch (error) {
    reportCloseGuardError('close-guard:init', error);
  }
}
