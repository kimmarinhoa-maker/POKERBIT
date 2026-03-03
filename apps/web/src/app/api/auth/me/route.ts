// ══════════════════════════════════════════════════════════════════════
//  GET /api/auth/me — Dados do usuário logado + RBAC (skipTenant)
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, buildTenantList } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';

export async function GET(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        // Buscar profile
        const { data: profile, error: profileErr } = await supabaseAdmin
          .from('user_profiles')
          .select('*')
          .eq('id', ctx.userId)
          .maybeSingle();

        if (profileErr) console.warn('[auth/me] Profile fetch error:', profileErr.message);

        // Buscar tenants
        const { data: tenants } = await supabaseAdmin
          .from('user_tenants')
          .select('tenant_id, role, tenants!inner(id, name, slug, has_subclubs, status)')
          .eq('user_id', ctx.userId)
          .eq('is_active', true);

        return NextResponse.json({
          success: true,
          data: {
            id: ctx.userId,
            email: ctx.userEmail,
            profile: profile || null,
            tenants: await buildTenantList(ctx.userId, tenants),
            is_platform_admin: profile?.is_platform_admin === true,
          },
        });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err, 'Erro interno do servidor') },
          { status: 500 },
        );
      }
    },
    { skipTenant: true },
  );
}
