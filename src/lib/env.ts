export const ENV = {
  clientId: import.meta.env.VITE_CLIENT_ID || 'local',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  hasSupabase: Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY),
  superAdminEnabled: String(import.meta.env.VITE_SUPERADMIN || '').toLowerCase() === 'true',
  superAdminEmail: String(import.meta.env.VITE_SUPERADMIN_EMAIL || 'superadmin@smarttech.local').trim().toLowerCase(),
  superAdminPassword: String(import.meta.env.VITE_SUPERADMIN_PASSWORD || 'SuperAdmin@123'),
} as const;
