// ══════════════════════════════════════════════════════════════════════
//  Clientes Supabase — server-only (API Routes)
// ══════════════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('Missing env: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  return url;
}

function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY');
  return key;
}

function getAnonKey(): string {
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('Missing env: SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return key;
}

// Lazy singleton — avoids createClient() at build time (env vars not available)
let _admin: SupabaseClient | null = null;

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_admin) {
      _admin = createClient(getSupabaseUrl(), getServiceRoleKey(), {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    const val = (_admin as any)[prop];
    return typeof val === 'function' ? val.bind(_admin) : val;
  },
});

// Cria cliente com o JWT do usuário — respeita RLS
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(getSupabaseUrl(), getAnonKey(), {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
