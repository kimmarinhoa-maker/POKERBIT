// ══════════════════════════════════════════════════════════════════════
//  Clientes Supabase (admin + por-request)
// ══════════════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

// Cliente admin (service_role) — bypassa RLS
// Usar APENAS em jobs server-side e operações administrativas
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

// Cria cliente com o JWT do usuário — respeita RLS
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}
