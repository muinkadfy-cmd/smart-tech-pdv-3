/**
 * Cliente Supabase (único) para integração com backend
 *
 * Objetivo:
 * - Ter um único createClient no projeto (evitar requests sem Authorization)
 * - Enviar header x-store-id (multitenant) em todas as chamadas
 * - Garantir role "authenticated" via login anônimo quando necessário (RLS em produção)
 *
 * IMPORTANTE:
 * - O app é offline-first. Se Supabase falhar/offline, o app continua local.
 *
 * ✅ P0 (Desktop/PC fraco):
 * - NÃO importar '@supabase/supabase-js' no bundle Desktop (Tauri) para acelerar startup.
 * - Cliente só é inicializado em builds não-desktop, quando realmente configurado.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/utils/logger';
import { ENV } from './env';
import { getRemoteRuntimeStoreId } from '@/lib/capabilities/runtime-remote-adapter';
import { isValidUUID } from '@/lib/store-id';
import { getRepositoryRuntimeProfile } from '@/lib/repository/runtime-profile';
import { isSuperAdmin as isSuperAdminMode } from '@/lib/superadmin';

declare const __SMARTTECH_DESKTOP__: boolean;

// =====================================================
// Flags / estado
// =====================================================

export const isSupabaseConfigured = (): boolean => {
  if (__SMARTTECH_DESKTOP__) return false;
  const profile = getRepositoryRuntimeProfile();
  return !profile.isDesktop && !profile.isLocalOnly && ENV.hasSupabase;
};

// Export binding "vivo" (pode mudar após init async)
export let supabase: SupabaseClient | null = null;

let initPromise: Promise<SupabaseClient | null> | null = null;

let anonAuthInFlight: Promise<{ success: boolean; error?: string }> | null = null;
let lastAnonAuthAttemptAt = 0;
let lastAnonAuthResult: { success: boolean; error?: string } | null = null;
const ANON_AUTH_COOLDOWN_MS = 10_000;

const baseFetch: typeof fetch = (...args) => globalThis.fetch(...args);

function applyStoreHeaders(client: SupabaseClient): void {
  const storeId = getRemoteRuntimeStoreId()?.trim() || '';
  if (!storeId || !isValidUUID(storeId)) return;

  try {
    (client as any).rest = (client as any).rest || {};
    (client as any).rest.headers = (client as any).rest.headers || {};
    (client as any).rest.headers['x-store-id'] = storeId;
    (client as any).rest.headers['x-client-info'] = 'smart-tech-pwa';
    if (isSuperAdminMode()) (client as any).rest.headers['x-superadmin'] = 'true';

    if (import.meta.env.DEV) {
      console.log('[Supabase] headers applied', { storeId });
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[Supabase] falha ao aplicar headers', e);
    }
  }
}

async function initSupabaseClient(): Promise<SupabaseClient | null> {
  // Desktop build é 100% local — nunca inicializar Supabase.
  if (__SMARTTECH_DESKTOP__) return null;

  if (supabase) return supabase;

  // Só inicializa se estiver configurado
  if (!isSupabaseConfigured() || !ENV.supabaseUrl || !ENV.supabaseAnonKey) {
    return null;
  }

  try {
    // Import dinâmico: evita entrar no bundle inicial (e pode ser removido por DCE no Desktop)
    const mod = await import('@supabase/supabase-js');
    const createClient = mod.createClient;

    supabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      global: {
        headers: {
          'x-client-info': 'smart-tech-pwa'
        },
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const storeId = getRemoteRuntimeStoreId()?.trim() || '';

          const headers = new Headers(init?.headers || {});
          headers.set('x-client-info', 'smart-tech-pwa');
          if (isSuperAdminMode()) headers.set('x-superadmin', 'true');
          if (storeId && isValidUUID(storeId)) {
            headers.set('x-store-id', storeId);
          }

          return baseFetch(input, {
            ...init,
            headers
          });
        }
      }
    });

    if (supabase) applyStoreHeaders(supabase);
    return supabase;
  } catch (error) {
    logger.error('Erro ao criar cliente Supabase:', error);
    supabase = null;
    return null;
  }
}

/**
 * Garante que exista (ou tente criar) o cliente Supabase.
 * - No Desktop: sempre null (sem supabase)
 */
export async function ensureSupabaseClient(): Promise<SupabaseClient | null> {
  if (supabase) return supabase;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      return await initSupabaseClient();
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Obtém o cliente Supabase (helper síncrono).
 * - Pode ser null.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (supabase) applyStoreHeaders(supabase);
  return supabase;
}

/**
 * Garante que o client esteja no role "authenticated" (Supabase Auth),
 * sem login real. Usamos login anônimo apenas para habilitar RLS em produção.
 */
export async function ensureSupabaseAuthenticated(): Promise<{ success: boolean; error?: string }> {
  const client = await ensureSupabaseClient();
  if (!client) return { success: false, error: 'Supabase não configurado' };

  const storeId = getRemoteRuntimeStoreId();
  if (!storeId || !isValidUUID(storeId)) {
    return { success: false, error: 'STORE_ID inválido/ausente' };
  }

  try {
    applyStoreHeaders(client);

    // O projeto usa RLS pública + headers de contexto. Sessão Supabase é opcional neste fluxo.
    try {
      const { data } = await client.auth.getSession();
      if (data.session) return { success: true };
    } catch {
      // ignore
    }

    return { success: true };


  } catch (e: any) {
    logger.warn('[Supabase] Exceção ao preparar acesso remoto:', e);
    return { success: false, error: e?.message || 'Erro desconhecido' };
  }
}

/**
 * Verifica se o Supabase está disponível e online
 */
export async function isSupabaseOnline(): Promise<boolean> {
  const client = await ensureSupabaseClient();
  if (!client) return false;

  try {
    applyStoreHeaders(client);

    // Se já existe sessão Supabase, não tente autenticar novamente
    try {
      const { data } = await client.auth.getSession();
      if (data.session) return true;
    } catch {
      // ignore
    }

    // Importar STORE_ID para filtrar por loja
    const storeId = getRemoteRuntimeStoreId();
    const hasValidStoreId = !!storeId && isValidUUID(storeId);

    // Testar conexão com query simples (filtrada por store_id se válido)
    let queryClientes = client.from('clientes').select('id').limit(1);
    if (hasValidStoreId && storeId) queryClientes = queryClientes.eq('store_id', storeId);
    const { error: errorClientes } = await queryClientes;
    if (!errorClientes) return true;

    let queryProdutos = client.from('produtos').select('id').limit(1);
    if (hasValidStoreId && storeId) queryProdutos = queryProdutos.eq('store_id', storeId);
    const { error: errorProdutos } = await queryProdutos;
    if (!errorProdutos) return true;

    const isConnectionError =
      errorClientes?.code === 'PGRST301' ||
      errorClientes?.code === 'PGRST116' ||
      errorProdutos?.code === 'PGRST301' ||
      errorProdutos?.code === 'PGRST116';

    return isConnectionError && !String(errorClientes?.message || '').includes('fetch') && !String(errorProdutos?.message || '').includes('fetch');
  } catch {
    return false;
  }
}

/**
 * Wrapper seguro para operações Supabase
 */
export async function safeSupabaseQuery<T>(
  queryFn: (client: SupabaseClient) => Promise<{ data: T | null; error: any }>
): Promise<{ data: T | null; error: any } | null> {
  const client = await ensureSupabaseClient();
  if (!client) return null;

  try {
    applyStoreHeaders(client);

    // Se já existe sessão Supabase, não tente autenticar novamente
    try {
      const { data } = await client.auth.getSession();
      if (data.session) { /* sessão ok, seguir */ }
    } catch {
      // ignore
    }

    const isOnline = await isSupabaseOnline();
    if (!isOnline) return null;

    const authResult = await ensureSupabaseAuthenticated();
    if (!authResult.success) {
      logger.warn('[Supabase] Não autenticado, pulando query:', authResult.error);
      return null;
    }

    return await queryFn(client);
  } catch (error) {
    logger.error('[Supabase] Erro na query:', error);
    return null;
  }
}

// Log amigável quando não configurado (somente fora do Desktop)
if (!__SMARTTECH_DESKTOP__ && !getRepositoryRuntimeProfile().isLocalOnly && (!ENV.hasSupabase || !ENV.supabaseUrl || !ENV.supabaseAnonKey)) {
  logger.warn('Supabase não configurado. Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não encontradas.');
  logger.warn('O sistema continuará funcionando apenas com LocalStorage (offline-first).');
}



