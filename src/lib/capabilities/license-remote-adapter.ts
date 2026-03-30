import { getRuntimeStoreId } from '@/lib/runtime-context';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';

export function resolveLicenseStoreId(): string | null {
  return getRuntimeStoreId();
}

export function isLicenseStoreConfigured(): boolean {
  return !!resolveLicenseStoreId();
}

export function getLicenseRemoteClient() {
  if (!isSupabaseConfigured()) return null;
  return getSupabaseClient();
}

export async function fetchLatestRemoteLicenseByStore(storeId: string): Promise<{ data: any; error: any }> {
  const client = getLicenseRemoteClient();
  if (!client) return { data: null, error: { message: 'Cliente Supabase não disponível.' } };

  return await client
    .from('licenses')
    .select('*')
    .eq('store_id', storeId)
    .order('updated_at', { ascending: false })
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
