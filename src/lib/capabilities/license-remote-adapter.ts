import type { SupabaseClient } from '@supabase/supabase-js';

import { ENV } from '@/lib/env';
import { getRuntimeStoreId } from '@/lib/runtime-context';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';

let publicLicenseClient: SupabaseClient | null = null;
let publicLicenseClientPromise: Promise<SupabaseClient | null> | null = null;

export function resolveLicenseStoreId(): string | null {
  return getRuntimeStoreId();
}

export function isLicenseStoreConfigured(): boolean {
  return !!resolveLicenseStoreId();
}

export function isLicenseRemoteConfigured(): boolean {
  return Boolean(ENV.supabaseUrl && ENV.supabaseAnonKey);
}

export function getLicenseRemoteClient() {
  if (!isSupabaseConfigured()) return null;
  return getSupabaseClient();
}

async function getPublicLicenseRemoteClient(): Promise<SupabaseClient | null> {
  if (publicLicenseClient) return publicLicenseClient;
  if (publicLicenseClientPromise) return publicLicenseClientPromise;
  if (!isLicenseRemoteConfigured()) return null;

  publicLicenseClientPromise = (async () => {
    try {
      const mod = await import('@supabase/supabase-js');
      publicLicenseClient = mod.createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        },
        global: {
          headers: {
            'x-client-info': 'smart-tech-license-public'
          }
        }
      });
      return publicLicenseClient;
    } catch {
      publicLicenseClient = null;
      return null;
    } finally {
      publicLicenseClientPromise = null;
    }
  })();

  return publicLicenseClientPromise;
}

export async function fetchLatestRemoteLicenseByStore(storeId: string): Promise<{ data: any; error: any }> {
  const client = getLicenseRemoteClient();
  if (client) {
    const response = await client
      .from('licenses')
      .select('*')
      .eq('store_id', storeId)
      .order('updated_at', { ascending: false })
      .maybeSingle();

    if (response.data) return response;
  }

  const publicClient = await getPublicLicenseRemoteClient();
  if (!publicClient) {
    return { data: null, error: { message: 'Cliente Supabase não disponível.' } };
  }

  return await publicClient
    .rpc('get_public_license_status', { p_store_id: storeId })
    .maybeSingle();
}

export async function updateRemoteLicenseByStore(
  storeId: string,
  payload: Record<string, any>
): Promise<{ data: any; error: any }> {
  const client = getLicenseRemoteClient();
  if (!client) return { data: null, error: { message: 'Cliente Supabase não disponível.' } };

  return await client
    .from('licenses')
    .update(payload)
    .eq('store_id', storeId)
    .select()
    .single();
}

export async function insertRemoteLicense(
  payload: Record<string, any>
): Promise<{ data: any; error: any }> {
  const client = getLicenseRemoteClient();
  if (!client) return { data: null, error: { message: 'Cliente Supabase não disponível.' } };

  return await client
    .from('licenses')
    .insert(payload)
    .select()
    .single();
}
