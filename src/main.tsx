import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/routes';
import ErrorBoundary from './components/ErrorBoundary';
import { showToast } from './components/ui/ToastContainer';
import { isUpdateEnabled } from '@/lib/mode';
import { isDesktopApp } from '@/lib/platform';
import { initLowEndMode } from '@/lib/low-end-mode';
import { initDiagnosticsMode } from '@/lib/diagnostics';
import { getDiagnosticsEnabled } from '@/lib/diagnostics';
import { AuthProvider } from './contexts/AuthContext';
import { registerSW } from 'virtual:pwa-register';
import './styles/index.css';
import { preloadAppLocalData } from '@/lib/preload-app';
import { hydrateDesktopGlobals } from '@/lib/desktop-globals';
import { initDeviceId } from '@/lib/device';
import { appendUpdateLog } from '@/lib/updateLog';
import { applyDesktopHardening } from '@/lib/desktop/hardening';
import { installDesktopErrorCapture } from '@/lib/desktop/error-capture';
import { initTheme } from '@/lib/theme';
import { perfInit, perfMarkOnce, perfMeasure } from '@/lib/perf';
import { logStartupPersistenceSnapshot } from '@/lib/persistence-info';
import { registerDesktopPersistenceCloseGuard } from '@/lib/persistence-gate';

// Theme init (dark/claro)
try {
  initTheme();
} catch {
  // ignore
}

// ✅ Performance (PC fraco): inicializa cedo
try {
  perfInit();
  perfMarkOnce('app_start');
} catch {
  // ignore
}


// UI brightness init (85%..115%)
try {
  const raw = Number(localStorage.getItem('smart-tech-ui-brightness') || '100');
  const clamped = Math.min(115, Math.max(85, Number.isFinite(raw) ? raw : 100));
  document.documentElement.style.setProperty('--ui-brightness', (clamped / 100).toFixed(2));
} catch {
  // ignore
}

// Modo PC Lento: aplicar antes do React renderizar
try { initLowEndMode(); } catch { }
try { initDiagnosticsMode(); } catch { }

// ✅ Limpeza produção: evita console spam (melhora performance e segurança)
// Mantém warn/error. log/info/debug ficam ativos apenas em DEV ou com Diagnóstico ligado.
try {
  if (!import.meta.env.DEV && !getDiagnosticsEnabled()) {
        console.log = () => {};
        console.info = () => {};
        console.debug = () => {};
  }
} catch {
  // ignore
}

// Modo normal (otimizado): sempre ON
try {
  const key = 'smart-tech-perf-mode';
  // Força ON para manter UI fluida em PCs fracos (DEV = PROD)
  localStorage.setItem(key, 'true');
  // CSS base usa: html[data-perf="1"]
  document.documentElement.setAttribute('data-perf', '1');
} catch {
  // ignore
}
// Desktop (Tauri): hardening + captura de erros (para suporte)
try {
  if (isDesktopApp() && import.meta.env.PROD) {
    applyDesktopHardening();
  }
  if (isDesktopApp()) {
    installDesktopErrorCapture();
  }
} catch {
  // ignore
}

// PWA update prompt com atualização forçada após 3 dias
// No Desktop/Tauri não existe Service Worker, então não registramos SW.
let updateSW: any = undefined;

if (!isDesktopApp()) {
  updateSW = registerSW({
    onNeedRefresh() {
      if (!isUpdateEnabled()) {
        return;
      }

      // Notifica o app (UI) que há um SW novo aguardando.
      try {
        window.dispatchEvent(new Event('smart-tech:pwa-need-refresh'));
      } catch {
        // ignore
      }

      try {
        appendUpdateLog('need_refresh', 'Service Worker novo disponível (aguardando aplicar).');
      } catch {
        // ignore
      }

      const DAYS_OLD = 3; // Forçar após 3 dias
      const lastUpdateKey = 'smart-tech:last-sw-update';
      const lastUpdate = localStorage.getItem(lastUpdateKey);
      const now = Date.now();

      const shouldForce = !lastUpdate ||
        (now - parseInt(lastUpdate, 10)) > (DAYS_OLD * 24 * 60 * 60 * 1000);

      const applyUpdate = () => {
        try {
          sessionStorage.setItem('smart-tech:pending-update-reload', '1');
        } catch {
          // ignore
        }
        localStorage.setItem(lastUpdateKey, now.toString());
        // `true` = tenta aplicar o SW novo e recarregar
        void updateSW?.(true);
      };

      if (shouldForce) {
        // Forçar atualização (usuário ficou dias sem abrir)
        console.log('[PWA] Forçando atualização automática (versão > 3 dias)');
        showToast('🔄 Atualização automática do app em andamento…', 'info', 4500);
        try {
          appendUpdateLog('apply', 'Atualização automática acionada (regra: >3 dias).');
        } catch {
          // ignore
        }
        applyUpdate();
        return;
      }

      // Orientação para usuário leigo (sem modal/confirm)
      showToast(
        `🔔 Atualização do app disponível.

` +
        `1) Abra “Atualizações”
` +
        `2) Clique “Atualizar agora”
` +
        `3) Depois clique “Marcar como lido”

` +
        `(Se você não atualizar, será automático em ${DAYS_OLD} dias.)`,
        'info',
        12000
      );
    },
    onOfflineReady() {
      // Offline pronto. Sem spam de alert.
      if (import.meta.env.DEV) {
        console.log('[PWA] offline ready');
      }
    }
  });
}
declare global {
  interface Window {
    __SMARTTECH_UPDATE_SW__?: (reloadPage?: boolean) => Promise<void> | void;
  }
}

// Expor para outras telas (ex.: Atualizações) aplicar update do PWA de forma segura
if (!isDesktopApp()) {
  try {
    window.__SMARTTECH_UPDATE_SW__ = updateSW as any;
  } catch {
    // ignore
  }

  // Recarregar ao trocar o controller (somente quando um update foi solicitado)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      try {
        const pending = sessionStorage.getItem('smart-tech:pending-update-reload') === '1';
        if (!pending) return;
        sessionStorage.removeItem('smart-tech:pending-update-reload');
      } catch {
        // ignore
      }
      window.location.reload();
    });
  }
}

try {
  window.addEventListener('pagehide', () => {
    void logStartupPersistenceSnapshot('pagehide');
  });
  window.addEventListener('beforeunload', () => {
    void logStartupPersistenceSnapshot('beforeunload');
  });
} catch {
  // ignore
}

const rootEl = document.getElementById('root');

// ✅ P0: Render primeiro (Login instantâneo). Preload roda em background depois do 1º paint.
if (rootEl) {
  const root = createRoot(rootEl);

  const bootstrap = async () => {
    root.render(
    <StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <RouterProvider
            router={router}
            future={{
              v7_startTransition: true
            }}
          />
        </AuthProvider>
      </ErrorBoundary>
    </StrictMode>
    );

  // ✅ P0 (Pré-login): remover splash HTML (evita overlay/stacking e libera memória)
  try {
    const splash = document.getElementById('preload-splash');
    if (splash && splash.parentElement) splash.parentElement.removeChild(splash);
  } catch {
    // ignore
  }

  // ✅ Marca 1ª renderização do React
  try {
    perfMarkOnce('react_rendered');
    perfMeasure('app_start→react_rendered', 'app_start', 'react_rendered');
  } catch {
    // ignore
  }

  // background: depois do primeiro paint (não bloqueia Login)
  const runAfterPaint = (fn: () => void) => {
    requestAnimationFrame(() => requestAnimationFrame(fn));
  };

  runAfterPaint(() => {
    // ✅ Métrica: 1º frame após React montar
    try {
      perfMarkOnce('first_frame');
      perfMeasure('app_start→first_frame', 'app_start', 'first_frame');
    } catch {
      // ignore
    }

    const idle = (cb: () => void) =>
      (window as any).requestIdleCallback
        ? (window as any).requestIdleCallback(cb, { timeout: 1200 })
        : setTimeout(cb, 400);

    idle(() => {
      if (isDesktopApp()) {
        void initDeviceId();
        void hydrateDesktopGlobals();
        void registerDesktopPersistenceCloseGuard();
        void logStartupPersistenceSnapshot('post-hydrate');
      }
      void preloadAppLocalData();
    });
  });
  };

  void bootstrap();
} else {
  console.error('[Smart Tech] Elemento #root não encontrado no HTML.');
}
