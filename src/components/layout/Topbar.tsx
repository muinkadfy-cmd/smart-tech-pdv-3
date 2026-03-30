import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/lib/auth-supabase';
import { safeGet, safeSet } from '@/lib/storage';
import { useThemeMode } from '@/hooks/useThemeMode';
import { useLowEndMode } from '@/hooks/useLowEndMode';
import { isDesktopApp } from '@/lib/platform';
import { getPlatformFullscreenState, togglePlatformFullscreen } from '@/lib/capabilities/desktop-window-adapter';
import ProfileDropdown from './ProfileDropdown';
import { BusinessCardModal } from '@/components/BusinessCardModal';
import './Topbar.css';

// ─── Ícones (SVG leve, sem dependências) ────────────────────────────────────
function IconSun({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function IconBolt({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M13 2L3 14h8l-1 8 11-14h-8l0-6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  );
}

function IconPrinter({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9V3h12v6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M6 18H5a3 3 0 0 1-3-3v-3a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-1" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M7 14h10v7H7z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M18 12h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

function IconEnterFullscreen({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconExitFullscreen({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 3v3H6M15 3v3h3M9 21v-3H6M15 21v-3h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}


const STORAGE_KEY_BRIGHT = 'smart-tech-ui-brightness';




type RouteContext = {
  section: string;
  hint: string;
};

function getRouteContext(pathname: string): RouteContext {
  if (pathname.startsWith('/vendas')) return { section: 'Vendas e Operações', hint: 'Venda rápida, balcão e histórico' };
  if (pathname.startsWith('/clientes')) return { section: 'Vendas e Operações', hint: 'Cadastro, busca e relacionamento com clientes' };
  if (pathname.startsWith('/produtos')) return { section: 'Vendas e Operações', hint: 'Catálogo, estoque e cadastro de produtos' };
  if (pathname.startsWith('/ordens')) return { section: 'Atendimento Técnico', hint: 'Ordens de serviço, status e acompanhamento' };
  if (pathname.startsWith('/compra-usados')) return { section: 'Usados', hint: 'Entrada, documentos e triagem de usados' };
  if (pathname.startsWith('/venda-usados')) return { section: 'Usados', hint: 'Venda, garantia e histórico de usados' };
  if (pathname.startsWith('/painel')) return { section: 'Visão Geral', hint: 'Indicadores, atalhos e visão executiva do sistema' };
  if (pathname.startsWith('/financeiro')) return { section: 'Financeiro', hint: 'Receitas, despesas e acompanhamento financeiro' };
  if (pathname.startsWith('/fluxo-caixa')) return { section: 'Financeiro', hint: 'Entradas, saídas e conferência do caixa' };
  if (pathname.startsWith('/cobrancas')) return { section: 'Financeiro', hint: 'Cobranças, recebimentos e acompanhamento' };
  if (pathname.startsWith('/encomendas')) return { section: 'Operações', hint: 'Pedidos, fornecedores e status de encomendas' };
  if (pathname.startsWith('/recibos')) return { section: 'Operações', hint: 'Recibos, comprovantes e emissão rápida' };
  if (pathname.startsWith('/devolucao')) return { section: 'Operações', hint: 'Devoluções, estornos e conferência de itens' };
  if (pathname.startsWith('/fornecedores')) return { section: 'Cadastros', hint: 'Fornecedores, contatos e histórico de compras' };
  if (pathname.startsWith('/configuracoes')) return { section: 'Sistema', hint: 'Empresa, impressão e preferências do aplicativo' };
  if (pathname.startsWith('/backup')) return { section: 'Sistema', hint: 'Backup, restauração e segurança dos dados' };
  if (pathname.startsWith('/ajuda')) return { section: 'Suporte', hint: 'Autoajuda, atalhos e recursos do sistema' };
  if (pathname.startsWith('/codigos')) return { section: 'Suporte', hint: 'Códigos, marcas e referência técnica rápida' };
  return { section: 'Smart Tech PDV', hint: 'Sistema local, estável e pronto para operação diária' };
}

interface TopbarProps {
  onMenuToggle?: () => void;
}

function ClockPill() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = useMemo(() => {
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    const s = now.getSeconds().toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }, [now]);

  const date = useMemo(() => {
    try {
      return now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return now.toDateString();
    }
  }, [now]);

  return (
    <div className="topbar-clock" title="Horário do sistema">
      <div className="clock-time">{time}</div>
      <div className="clock-date">{date}</div>
    </div>
  );
}

export default function Topbar({ onMenuToggle }: TopbarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const topbarRef = useRef<HTMLElement | null>(null);
  const currentSession = useMemo(() => getCurrentUser(), []);

  useThemeMode();

  const desktopApp = useMemo(() => isDesktopApp(), []);

  const routeContext = useMemo(() => getRouteContext(location.pathname), [location.pathname]);
  const userInitials = useMemo(() => {
    const label = String(currentSession?.nome || currentSession?.email || currentSession?.cargo || 'ST').trim();
    if (!label) return 'ST';
    const parts = label.split(/\s+/).filter(Boolean).slice(0, 2);
    const joined = parts.map((part) => part[0]).join('').toUpperCase();
    return joined || label.slice(0, 2).toUpperCase();
  }, [currentSession]);

  const [perfilOpen, setPerfilOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 901);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [logoOk, setLogoOk] = useState(true);
  // Modo fraco (PC muito antigo) — usa o Modo PC Lento interno (data-low-end)
  const { isLowEnd: modoFraco, toggle: toggleModoFraco } = useLowEndMode();
  const [brightness, setBrightness] = useState(() => {
    const raw = Number(safeGet<number>(STORAGE_KEY_BRIGHT, 100).data);
    const v = Number.isFinite(raw) ? raw : 100;
    return Math.min(115, Math.max(85, v));
  });
  const [brightnessOpen, setBrightnessOpen] = useState(false);
  const brightnessRef = useRef<HTMLDivElement | null>(null);
  // Busca global removida (menos poluição / menos re-render em digitação)


  // Ajuste de brilho (UI) - aplica em CSS var e persiste
  useEffect(() => {
    const clamped = Math.min(115, Math.max(85, brightness));
    try {
      safeSet(STORAGE_KEY_BRIGHT, clamped);
    } catch {
      // ignore
    }
    try {
      document.documentElement.style.setProperty('--ui-brightness', (clamped / 100).toFixed(2));
    } catch {
      // ignore
    }
  }, [brightness]);

  // Fecha popover de brilho ao clicar fora
  useEffect(() => {
    if (!brightnessOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = brightnessRef.current;
      if (!el) return;
      if (el.contains(e.target as any)) return;
      setBrightnessOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [brightnessOpen]);

  // Responsivo (desktop x mobile)
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 901);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Fullscreen (apenas web/desktop)
  const canFullscreen = useMemo(() => {
    if (!isDesktop) return false;
    // Desktop (Tauri): fullscreen via Window API
    if (desktopApp) return true;
    const ua = navigator.userAgent || '';
    const isIOS =
      /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);

    const isStandalone =
      (window.matchMedia?.('(display-mode: standalone)')?.matches ?? false) || (navigator as any).standalone === true;

    const el: any = document.documentElement;
    const hasApi = !!(el?.requestFullscreen || el?.webkitRequestFullscreen);
    return !isIOS && !isStandalone && hasApi;
  }, [isDesktop, desktopApp]);

  const handleToggleFullscreen = useCallback(async () => {
    try {
      if (!canFullscreen) return;
      const next = await togglePlatformFullscreen();
      setIsFullscreen(next);
    } catch {
      // silencioso
    }
  }, [canFullscreen]);

  useEffect(() => {
  let alive = true;

  const updateWeb = () => {
    const doc: any = document;
    setIsFullscreen(!!document.fullscreenElement || !!doc.webkitFullscreenElement);
  };

  const updateDesktop = async () => {
    try {
      const fs = await getPlatformFullscreenState();
      if (alive) setIsFullscreen(!!fs);
    } catch {
      // ignore
    }
  };

  if (desktopApp) {
    void updateDesktop();
    return () => {
      alive = false;
    };
  }

  updateWeb();
  document.addEventListener('fullscreenchange', updateWeb);
  document.addEventListener('webkitfullscreenchange', updateWeb as any);
  return () => {
    alive = false;
    document.removeEventListener('fullscreenchange', updateWeb);
    document.removeEventListener('webkitfullscreenchange', updateWeb as any);
  };
}, [desktopApp]);

  // ✅ iPhone/Android PWA: manter altura real do Topbar em CSS var
  useEffect(() => {
    const el = topbarRef.current;
    if (!el) return;

    const setVar = () => {
      const h = el.offsetHeight || 70;
      document.documentElement.style.setProperty('--topbar-height', `${h}px`);
    };

    requestAnimationFrame(setVar);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => setVar());
      ro.observe(el);
    }

    window.addEventListener('resize', setVar);
    return () => {
      window.removeEventListener('resize', setVar);
      ro?.disconnect();
    };
  }, []);

  // Efeito de "scrolled"
  useEffect(() => {
    const el = topbarRef.current;
    if (!el) return;

    const onScroll = () => {
      const y = window.scrollY || 0;
      el.classList.toggle('scrolled', y > 6);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll as any);
  }, []);

  // Usuário (local)
  useEffect(() => {
    (async () => {
      try {
        const u = await getCurrentUser();
        // @ts-ignore - Usuario pode ter campos a mais
        if (u) (window as any).__smarttech_user = u;
      } catch {}
    })();
  }, []);

  // Navegação "voltar" em breadcrumb
  useEffect(() => {
    if (location.pathname === '/') navigate('/painel', { replace: true });
  }, [location.pathname, navigate]);

  return (
    <>
    <header ref={topbarRef as any} className="topbar topbar-saas">
      <div className="topbar-left topbar-left-saas">
        {!isDesktop && (
          <button className="menu-toggle" onClick={onMenuToggle} aria-label="Abrir menu">
            <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>☰</span>
          </button>
        )}

        <Link className="topbar-brand topbar-home-button" to="/painel" title="Ir para o painel" aria-label="Ir para o painel">
          <span className="logo-mark" aria-hidden="true">
            {logoOk ? (
              <img
                className="logo-image"
                src="/icons/icon-192.png"
                alt=""
                draggable={false}
                decoding="async"
                onError={() => setLogoOk(false)}
              />
            ) : (
              <span className="logo-fallback">ST</span>
            )}
          </span>
        </Link>

        <div className="topbar-page-context" aria-label="Contexto da tela">
          <div className="topbar-page-row">
            <span className="topbar-page-chip">{routeContext.section}</span>
            {desktopApp ? <span className="topbar-page-badge">Desktop</span> : null}
          </div>
          <div className="topbar-page-hint" title={routeContext.hint}>{routeContext.hint}</div>
        </div>
      </div>

      {/* Busca global removida (menos poluição / mais performance) */}

      <div className="topbar-right topbar-right-saas">
        <ClockPill />

        {/* Brilho */}
        <div className="brightness-wrap" ref={brightnessRef as any}>
          <button
            className={`action-button ${brightnessOpen ? 'active' : ''}`}
            onClick={() => setBrightnessOpen((v) => !v)}
            title="Ajuste de brilho"
            aria-label="Ajuste de brilho"
          >
            <IconSun />
          </button>
          {brightnessOpen ? (
            <div className="brightness-popover" role="dialog" aria-label="Ajuste de brilho">
              <div className="brightness-row">
                <span className="brightness-label">Brilho</span>
                <span className="brightness-value">{brightness}%</span>
              </div>
              <input
                className="brightness-range"
                type="range"
                min={85}
                max={115}
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
              />
              <div className="brightness-actions">
                <button className="brightness-reset" type="button" onClick={() => setBrightness(100)}>Padrão</button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Modo fraco (PC muito antigo) */}
        <button
          className={`action-button ${modoFraco ? 'active' : ''}`}
          onClick={toggleModoFraco}
          title={modoFraco ? 'Modo fraco (PC muito antigo): ATIVO' : 'Modo normal (otimizado): ATIVO'}
        >
          <IconBolt />
        </button>
        {/* Cartão de Visita */}
        <button
          className="action-button"
          onClick={() => setCardOpen(true)}
          title="Cartão de Visita — Imprimir / QR WhatsApp"
          aria-label="Cartão de Visita"
        >
          <IconPrinter />
        </button>

        {/* Tema (dark / claro) oculto para manter UI limpa */}
        {/* Fullscreen (desktop web) */}
        {canFullscreen && (
          <button className="action-button" onClick={handleToggleFullscreen} title="Tela cheia">
            {isFullscreen ? <IconExitFullscreen /> : <IconEnterFullscreen />}
          </button>
        )}

        <div className="profile-wrapper">
          <button
            type="button"
            className="avatar-button"
            onClick={() => setPerfilOpen((open) => !open)}
            title="Conta e sessão"
            aria-label="Abrir menu da conta"
            aria-expanded={perfilOpen}
          >
            <span className="avatar-initials">{userInitials}</span>
          </button>
          <ProfileDropdown isOpen={perfilOpen} onClose={() => setPerfilOpen(false)} />
        </div>
      </div>
    </header>

    {/* Modal Cartão de Visita */}
    <BusinessCardModal isOpen={cardOpen} onClose={() => setCardOpen(false)} />
  </>
  );
}
