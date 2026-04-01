import { useState, useEffect, useMemo } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { AppIcon, emojiToAppIcon, type AppIconName } from '@/components/ui/AppIcon';
import Tooltip from '@/components/ui/Tooltip';
import { getCurrentSession } from '@/lib/auth-supabase';
import { getLicenseStatus, getLicenseStatusAsync } from '@/lib/license';
import { canAccessRoute } from '@/lib/permissions';
import { onStoreAccessChange } from '@/lib/store-access';
import { ALWAYS_VISIBLE_PATHS, PATHS_VENDAS_USADOS, menuGroups, type MenuItem } from './menuConfig';
import { getBackupAlertState, onBackupAlertChange } from '@/lib/auto-backup';
import './Sidebar.css';

// Lista plana para compatibilidade
const menuItems: MenuItem[] = menuGroups.flatMap((group) => group.items);

const APP_ICON_NAMES: Set<string> = new Set([
  'dashboard','users','shopping','box','wrench','banknote','cash','creditcard','receipt','settings','help','backup',
  'phone','truck','undo','clipboard','inbox','refresh','search','flask','more','menu','zap','maximize2','minimize2','x','bell','home'
]);

function resolveIconName(icon: string): AppIconName {
  if (APP_ICON_NAMES.has(icon)) return icon as AppIconName;
  const mapped = emojiToAppIcon[icon];
  if (mapped) return mapped;
  return 'more';
}

function SidebarIcon({ icon, color }: { icon: string; color: MenuItem['color'] }) {
  const name = resolveIconName(icon);
  return (
    <span className={`sidebar-icon c-${color}`} aria-hidden="true">
      <AppIcon name={name} size={18} />
    </span>
  );
}

function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('smart-tech-sidebar-collapsed');
    return saved === 'true';
  });

  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 901;
  });

  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 901;
      setIsDesktop(desktop);
      // No desktop, sempre expandir
      if (desktop) {
        setCollapsed(false);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // No desktop, não salvar estado collapsed
    if (!isDesktop) {
      localStorage.setItem('smart-tech-sidebar-collapsed', collapsed.toString());
    }
  }, [collapsed, isDesktop]);

  const session = getCurrentSession();
  const [license, setLicense] = useState(() => getLicenseStatus());
  const [backupAlert, setBackupAlert] = useState(() => getBackupAlertState());
  const [accessVersion, setAccessVersion] = useState(0);
  useEffect(() => onBackupAlertChange(setBackupAlert), []);
  useEffect(() => onStoreAccessChange(() => setAccessVersion((current) => current + 1)), []);

  useEffect(() => {
    // Atualiza status de licença (para esconder itens no DEMO)
    let alive = true;
    getLicenseStatusAsync().then((st) => { if (alive) setLicense(st); }).catch(() => undefined);
    const onFocus = () => {
      getLicenseStatusAsync().then((st) => setLicense(st)).catch(() => undefined);
    };
    window.addEventListener('focus', onFocus);
    return () => { alive = false; window.removeEventListener('focus', onFocus); };
  }, []);

  const TRIAL_RESTRICTED = new Set<string>(['/backup', '/relatorios']);

  // Filtrar itens do menu baseado no role; admin sempre vê Vendas, Compra (Usados), Venda (Usados).
  const filteredMenuGroups = useMemo(() => {
    if (!session) return [];

    const isVisible = (path: string) => {
      if (license.status === 'trial' && TRIAL_RESTRICTED.has(path)) return false;
      return (
        ALWAYS_VISIBLE_PATHS.has(path) ||
        (session.role === 'admin' && PATHS_VENDAS_USADOS.has(path)) ||
        canAccessRoute(path)
      );
    };

    return menuGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => isVisible(item.path)),
      }))
      .filter((group) => group.items.length > 0);
  }, [session?.userId, session?.role, license.status, accessVersion]);

  const visibleItems: MenuItem[] = useMemo(() => {
    if (!session) return [];

    const isVisible = (path: string) => {
      if (license.status === 'trial' && TRIAL_RESTRICTED.has(path)) return false;
      return (
        ALWAYS_VISIBLE_PATHS.has(path) ||
        (session.role === 'admin' && PATHS_VENDAS_USADOS.has(path)) ||
        canAccessRoute(path)
      );
    };

    return menuItems.filter((item) => isVisible(item.path));
  }, [session?.userId, session?.role, license.status, accessVersion]);

  // No desktop, sempre mostrar expandido
  const isExpanded = !collapsed || isDesktop;

  return (
    <aside className={`sidebar ${!isExpanded ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {/* Brand minimal (sem textos "Sistema OS / Smart Tech" para não poluir) */}
        <Link to="/painel" className="sidebar-brand" aria-label="Ir para o painel">
          <span className="sidebar-brand-mark sidebar-brand-mark--compact">ST</span>
          <span className="sidebar-brand-copy">
            <span className="sidebar-brand-kicker">Console</span>
            <span className="sidebar-brand-text">Smart Tech</span>
          </span>
        </Link>
      </div>

      <nav className="sidebar-nav">
        {isExpanded ? (
          filteredMenuGroups.map((group) => (
            <div key={group.label} className="sidebar-group">
              {/* labels ocultos no CSS para ficar igual ao mock */}
              <div className="sidebar-group-label">{group.label}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
                >
                  <SidebarIcon icon={item.icon} color={item.color} />
                  <span className="sidebar-label">
                    {item.label}
                    {item.path === '/backup' && backupAlert.showAlert && (
                      <span style={{
                        marginLeft:6,display:'inline-flex',alignItems:'center',justifyContent:'center',
                        minWidth:18,height:18,borderRadius:9,background:'#DC2626',
                        color:'#fff',fontSize:10,fontWeight:700,padding:'0 4px',
                        animation:'pulse 2s infinite'
                      }} title={backupAlert.message}>!</span>
                    )}
                  </span>
                </NavLink>
              ))}
            </div>
          ))
        ) : (
          // Menu colapsado (apenas ícones) - apenas mobile
          visibleItems.map((item) => {
            const sidebarItem = (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <div style={{ position: 'relative' }}>
                  <SidebarIcon icon={item.icon} color={item.color} />
                </div>
              </NavLink>
            );

            return (
              <Tooltip key={item.path} text={item.label} position="right">
                {sidebarItem}
              </Tooltip>
            );
          })
        )}
      </nav>

      {isExpanded ? (
        <div className="sidebar-footer">
          <div className="sidebar-copyright">
            <p className="copyright-main">© 2026 Smart Tech Rolândia</p>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

export default Sidebar;
