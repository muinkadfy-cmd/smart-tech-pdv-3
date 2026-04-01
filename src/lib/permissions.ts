import { getCurrentSession } from '@/lib/auth-supabase';
import type { UserRole } from '@/types';
import { isAdminOrSuperAdmin } from '@/lib/access-control';
import { getCachedAllowedRoutes } from '@/lib/store-access';

/**
 * Retorna a role atual ou null
 */
function getRole(): UserRole | null {
  const session = getCurrentSession();
  if (!session) return null;
  return session.role as UserRole;
}

/**
 * Permissões básicas por ação
 */
export function hasPermission(
  action: 'create' | 'edit' | 'delete' | 'view'
): boolean {
  const role = getRole();
  if (!role) return false;

  if (role === 'admin') return true;

  if (role === 'atendente') {
    return action !== 'delete';
  }

  if (role === 'tecnico') {
    // Técnico pode operar (criar/editar/visualizar), mas não deve apagar registros
    return action !== 'delete';
  }

  return false;
}

export const canCreate = () => hasPermission('create');
export const canEdit = () => hasPermission('edit');
export const canDelete = () => hasPermission('delete');
export const canView = () => hasPermission('view');

/**
 * ✅ EXPORT QUE ESTAVA FALTANDO
 * Usado pelo Sidebar / DrawerMenu
 */
export function canAccessRoute(route: string): boolean {
  const session = getCurrentSession();
  const role = session?.role as UserRole | undefined;
  if (!role) return false;
  if (isAdminOrSuperAdmin(session)) return true;

  const r = (route || '').toLowerCase();

  const adminOnly =
    r.includes('usuarios') ||
    r.includes('licenca') ||
    r.includes('license') ||
    r.includes('admin');

  // Admin da loja OU SuperAdmin do sistema
  if (adminOnly) return isAdminOrSuperAdmin(session);

  const allowedRoutes = getCachedAllowedRoutes(role, session?.storeId);
  return allowedRoutes.some((allowed) => r.startsWith(String(allowed).toLowerCase()));
}

/**
 * Admin-only
 */
export function canManageUsers(): boolean {
  return isAdminOrSuperAdmin(getCurrentSession());
}

export function canManageLicense(): boolean {
  return isAdminOrSuperAdmin(getCurrentSession());
}
