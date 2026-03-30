import { useState, useEffect, useCallback, useMemo, useRef, Suspense, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Topbar from '@/components/layout/Topbar';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import DrawerMenu from '@/components/layout/DrawerMenu';
import { ClientIdGuard } from '@/components/ClientIdGuard';
import AuthGuard from '@/components/AuthGuard';
import { CompanyProvider } from '@/contexts/CompanyContext';
import { UpdateProvider } from '@/contexts/UpdateContext';
import UpdateBanner from '@/components/updates/UpdateBanner';
import { QuickActionsBar } from '@/components/quick-actions/QuickActionsBar';
import ToastContainer from '@/components/ui/ToastContainer';
import { stopSyncEngine } from '@/lib/repository/sync-engine';
import { APP_EVENTS } from '@/lib/app-events';
import { perfMarkOnce, perfMeasure } from '@/lib/perf';
import { preloadForPathname } from '@/lib/route-preload';
import '@/styles/layout.css';

async function clearBrowserCaches() {
  if (typeof window === 'undefined' || typeof caches === 'undefined' || typeof caches.keys !== 'function') {
    return;
  }
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

function LoadingFallback({ onVisible }: { onVisible?: (visible: boolean) => void }) {
  useEffect(() => {
    onVisible?.(true);
    return () => onVisible?.(false);
  }, [onVisible]);

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '200px',
      color: 'var(--text-secondary)'
    }}>
      Carregando...
    </div>
  );
}


function OutletBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [timedOut, setTimedOut] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fallbackVisible, setFallbackVisible] = useState(false);

  useEffect(() => {
    // Reset on route change
    setTimedOut(false);
    setErrorMsg(null);

    const onError = (ev: ErrorEvent) => {
      const msg = String(ev?.message || '');
      if (!msg) return;
      // Common for lazy chunk / dynamic import issues
      if (/ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch/i.test(msg)) {
        setErrorMsg(msg);
      }
    };

    const onRejection = (ev: PromiseRejectionEvent) => {
      const reason = (ev as any)?.reason;
      const msg = String(reason?.message || reason || '');
      if (!msg) return;
      if (/ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch/i.test(msg)) {
        setErrorMsg(msg);
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!fallbackVisible) {
      setTimedOut(false);
      return;
    }

    const t = window.setTimeout(() => {
      setTimedOut(true);
    }, 8000);

    return () => {
      window.clearTimeout(t);
    };
  }, [fallbackVisible]);

  if (errorMsg) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '240px',
        padding: 16,
        color: 'var(--text-secondary)'
      }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Falha ao carregar a página</div>
        <div style={{ maxWidth: 620, textAlign: 'center', opacity: 0.9 }}>
          O navegador não conseguiu carregar um módulo (chunk) da aplicação. Isso costuma acontecer por cache antigo (PWA/Service Worker) ou rede instável.
        </div>
        <div style={{ maxWidth: 720, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: 12, opacity: 0.75 }}>
          {errorMsg}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            Recarregar
          </button>
          <button
            type="button"
            onClick={() => {
              void clearBrowserCaches()
                .catch(() => undefined)
                .finally(() => window.location.reload());
            }}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            Limpar cache e recarregar
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Suspense fallback={<LoadingFallback onVisible={setFallbackVisible} />}>
        {children}
      </Suspense>

      {fallbackVisible && timedOut && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
          padding: 10,
          color: 'var(--text-secondary)',
          fontSize: 13
        }}>
          <div>Demorando para carregar…</div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '6px 10px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            Recarregar
          </button>
          {(import.meta.env.DEV || document.documentElement.dataset.diag === '1') && (
            <div style={{ opacity: 0.8 }}>
              Se ficar travado, pode haver chunk antigo, preload preso ou falha assíncrona na rota atual.
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Layout() {
  const location = useLocation();
  const privateShellMarkedRef = useRef(false);
  const isPublicRoute =
    location.pathname === "/" ||
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/setup") ||
    location.pathname.startsWith("/configurar-loja") ||
    location.pathname.startsWith("/ativacao") ||
    location.pathname.startsWith("/s/");
  // ⚠️ Importante (Desktop/Tauri): o tamanho mínimo da janela costuma ser ~1024px.
  // Se tratarmos 1024 como "tablet", o usuário fica sem Sidebar e acha que "sumiram abas".
  // Unificamos o breakpoint com o Sidebar (>= 901px = desktop).
  const [isMobile, setIsMobile] = useState(window.innerWidth < 700);
  const [isTablet, setIsTablet] = useState(window.innerWidth >= 700 && window.innerWidth < 901);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lowEndActive, setLowEndActive] = useState(() => document.documentElement.hasAttribute('data-low-end'));

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), []);

  useEffect(() => {
    let raf = 0;
    let timer: number | null = null;

    const commit = () => {
      const width = window.innerWidth;
      setIsMobile(width < 700);
      setIsTablet(width >= 700 && width < 901);
      if (width >= 901) {
        setDrawerOpen(false);
      }
    };

    const handleResize = () => {
      // Debounce leve para evitar "tempestade" de setState em resize
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(commit);
      }, 150);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (timer) window.clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // ✅ Performance: primeiro momento em que o shell privado realmente aparece
  useEffect(() => {
    if (isPublicRoute) return;
    if (privateShellMarkedRef.current) return;
    privateShellMarkedRef.current = true;
    try {
      perfMarkOnce('private_shell');
      perfMeasure('auth_ready→private_shell', 'auth_ready', 'private_shell');
    } catch {
      // ignore
    }
  }, [isPublicRoute]);
  // ✅ OFFLINE TOTAL: não inicia SyncEngine nem qualquer fluxo online
  useEffect(() => {
    // segurança: garante que qualquer engine antiga esteja parada
    try { stopSyncEngine(); } catch {}
    return () => {
      try { stopSyncEngine(); } catch {}
    };
  }, [isPublicRoute]);


  // ✅ Low-end flag reativo (para cortar UI extra em PC fraco)
  useEffect(() => {
    const update = () => {
      try { setLowEndActive(document.documentElement.hasAttribute('data-low-end')); } catch {}
    };
    update();
    window.addEventListener(APP_EVENTS.LOW_END_MODE_CHANGED, update as any);
    return () => window.removeEventListener(APP_EVENTS.LOW_END_MODE_CHANGED, update as any);
  }, []);

  useEffect(() => {
    // Fechar drawer ao navegar
    setDrawerOpen(false);
  }, [location.pathname]);

  // ✅ PC fraco: preload só da tela atual (on-demand) e sempre fora do caminho crítico
  useEffect(() => {
    if (isPublicRoute) return;
    try {
      preloadForPathname(location.pathname);
    } catch {
      // ignore
    }
  }, [isPublicRoute, location.pathname]);


  // Evita animações/transições durante troca de rota (reduz "piscar")
  useEffect(() => {
    try {
      document.documentElement.classList.add('route-switching');
    } catch {
      // ignore
    }
    const t = window.setTimeout(() => {
      try {
        document.documentElement.classList.remove('route-switching');
      } catch {
        // ignore
      }
    }, 140);
    return () => window.clearTimeout(t);
  }, [location.pathname]);

  // ✅ Em rotas públicas (login/setup/redirect), não renderizar chrome do app
  // Isso evita travar em "Inicializando..." quando ainda não existe sessão local.
  if (isPublicRoute) {
    return (
      <OutletBoundary>
        <Outlet />
      </OutletBoundary>
    );
  }

  const showSidebar = useMemo(() => !isMobile && !isTablet, [isMobile, isTablet]);
  const showDrawer = useMemo(() => (isMobile || isTablet) && drawerOpen, [isMobile, isTablet, drawerOpen]);

  // 🔕 Atalhos flutuantes (dock) no canto direito inferior
  // Por padrão fica DESLIGADO (especialmente em produção) para evitar poluir a UI.
  // Para ligar: defina VITE_SHOW_QUICK_ACTIONS=1 no .env(.production).local
  const showQuickActions = useMemo(() => {
    const raw = String((import.meta as any).env?.VITE_SHOW_QUICK_ACTIONS ?? '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  }, []);

  return (
    <ClientIdGuard>
      <AuthGuard>
        <CompanyProvider>
          <UpdateProvider>
          <div className="app">
          <Topbar onMenuToggle={toggleDrawer} />
          <UpdateBanner />
          {/* SyncStatusBar oculto - status já visível no Topbar */}
          <div className="app-container">
            {showSidebar && <Sidebar />}
            {showDrawer && (
              <>
                <div className="drawer-overlay" onClick={closeDrawer} />
                <DrawerMenu onClose={closeDrawer} />
              </>
            )}
            <main className={`main-content ${showSidebar ? 'with-sidebar' : ''}`}>
              <OutletBoundary>
                <Outlet />
              </OutletBoundary>
            </main>
            {isMobile && <BottomNav onOpenMenu={openDrawer} />}
          </div>
          {showQuickActions && !isMobile && !lowEndActive && (
            <QuickActionsBar position="floating" iconOnly={true} />
          )}
          <ToastContainer />
        </div>
          </UpdateProvider>
        </CompanyProvider>
      </AuthGuard>
    </ClientIdGuard>
  );
}

export default Layout;
