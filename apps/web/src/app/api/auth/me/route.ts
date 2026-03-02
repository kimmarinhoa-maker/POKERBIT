// ══════════════════════════════════════════════════════════════════════
//  GET /api/auth/me — Dados do usuário logado + RBAC (skipTenant)
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, FULL_ACCESS_ROLES } from '@/lib/server/auth';
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

        // Buscar org_access para cada tenant (subclubs permitidos)
        const { data: orgAccess } = await supabaseAdmin
          .from('user_org_access')
          .select('tenant_id, org_id, organizations!inner(id, name)')
          .eq('user_id', ctx.userId);

        // Mapa: tenant_id -> array de subclubs
        const orgAccessByTenant = new Map<string, { id: string; name: string }[]>();
        for (const oa of orgAccess || []) {
          const tid = oa.tenant_id;
          if (!orgAccessByTenant.has(tid)) orgAccessByTenant.set(tid, []);
          orgAccessByTenant.get(tid)!.push({
            id: (oa as any).organizations.id,
            name: (oa as any).organizations.name,
          });
        }

        // Buscar logo_url das organizacoes CLUB de cada tenant
        const tenantIds = (tenants || []).map((t) => t.tenant_id);
        const { data: clubOrgs } = tenantIds.length > 0
          ? await supabaseAdmin
              .from('organizations')
              .select('tenant_id, logo_url')
              .in('tenant_id', tenantIds)
              .eq('type', 'CLUB')
          : { data: [] };

        const logoByTenant = new Map<string, string | null>();
        for (const org of clubOrgs || []) {
          logoByTenant.set(org.tenant_id, org.logo_url || null);
        }

        return NextResponse.json({
          success: true,
          data: {
            id: ctx.userId,
            email: ctx.userEmail,
            profile: profile || null,
            tenants: (tenants || []).map((t) => ({
              id: (t as any).tenants.id,
              name: (t as any).tenants.name,
              slug: (t as any).tenants.slug,
              role: t.role,
              status: (t as any).tenants.status || 'active',
              has_subclubs: (t as any).tenants.has_subclubs ?? true,
              logo_url: logoByTenant.get(t.tenant_id) || null,
              allowed_subclubs: (FULL_ACCESS_ROLES as readonly string[]).includes(t.role)
                ? null // null = acesso total
                : orgAccessByTenant.get(t.tenant_id) || [],
            })),
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
