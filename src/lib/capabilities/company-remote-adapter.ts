import { canUseRemoteSync, requireRemoteSession } from '@/lib/capabilities/remote-sync-adapter';
import { getSupabaseClient } from '@/lib/supabaseClient';

export interface CompanyRemoteRow {
  id: string;
  store_id: string;
  nome_fantasia: string;
  razao_social: string;
  cnpj: string;
  telefone: string;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  logo_url?: string;
  mensagem_rodape?: string;
  created_at: string;
  updated_at: string;
}

export async function canUseCompanyRemote(): Promise<boolean> {
  return await canUseRemoteSync();
}

export async function fetchRemoteCompanyByStoreId(
  storeId: string
): Promise<{ data: CompanyRemoteRow | null; error: any }> {
  await requireRemoteSession();
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: { message: 'Cliente Supabase não disponível.' } };
  }

  const { data, error } = await client
    .from('empresa')
    .select('*')
    .eq('store_id', storeId)
    .limit(1);

  return {
    data: Array.isArray(data) ? ((data[0] as CompanyRemoteRow | undefined) ?? null) : null,
    error
  };
}
