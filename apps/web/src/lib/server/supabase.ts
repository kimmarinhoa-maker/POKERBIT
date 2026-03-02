// ══════════════════════════════════════════════════════════════════════
//  Clientes Supabase — server-only (API Routes)
// ══════════════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy singleton — avoids createClient() at build time (env vars not available)
let _admin: SupabaseClient | null = null;

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    if (!_admin) {
      _admin = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
    }
    const val = (_admin as any)[prop];
    return typeof val === 'function' ? val.bind(_admin) : val;
  },
});

// Cria cliente com o JWT do usuário — respeita RLS
export function createUserClient(accessToken: string): SupabaseClient {
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(process.env.SUPABASE_URL!, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
