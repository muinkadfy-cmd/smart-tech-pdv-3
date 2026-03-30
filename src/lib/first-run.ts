import { isDesktopApp } from '@/lib/platform';
import { kvGet, kvSet } from '@/lib/desktop-kv';

const WIZARD_DONE_LS = 'smart-tech:wizard-done';
let _hydrated = false;

/** Leitura síncrona (rápida) para uso no AuthGuard. */
export function isWizardDoneSync(): boolean {
  try {
    return localStorage.getItem(WIZARD_DONE_LS) === '1';
  } catch {
    return false;
  }
}

/** Marca wizard como concluído (desktop + web fallback). */
export async function setWizardDone(): Promise<void> {
  try { localStorage.setItem(WIZARD_DONE_LS, '1'); } catch {}
  if (!isDesktopApp()) return;
  try { await kvSet('wizard_done', '1'); } catch {}
}

/** Carrega wizard_done do SQLite KV para o localStorage (uma vez). */
export function hydrateWizardDoneFromDesktopKv(): void {
  if (_hydrated) return;
  if (!isDesktopApp()) return;
  _hydrated = true;
  try {
    void kvGet('wizard_done')
      .then((v) => {
        if (v) {
          try { localStorage.setItem(WIZARD_DONE_LS, '1'); } catch {}
        }
      })
      .catch(() => undefined);
  } catch {
    // ignore
  }
}
