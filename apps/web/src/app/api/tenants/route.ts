// ══════════════════════════════════════════════════════════════════════
//  POST /api/tenants — Create new tenant for authenticated user
//  Uses skipTenant since user doesn't have a tenant header for the new one
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const { club_name } = body || {};

        if (!club_name || typeof club_name !== 'string' || club_name.trim().length < 2) {
          return NextResponse.json(
            { success: false, error: 'Nome do clube deve ter pelo menos 2 caracteres' },
            { status: 400 },
          );
        }

        // 1. Create tenant with unique slug
        const slug =
          club_name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') +
          '-' +
          Date.now().toString(36);

        const { data: tenant, error: tenantError } = await supabaseAdmin
          .from('tenants')
          .insert({ name: club_name.trim(), slug })
          .select('id, name, slug, has_subclubs')
          .single();

        if (tenantError) throw tenantError;

        // 2. Link user as OWNER
        await supabaseAdmin.from('user_tenants').insert({
          user_id: ctx.userId,
          tenant_id: tenant.id,
          role: 'OWNER',
        });

        // 3. Create CLUB organization
        await supabaseAdmin.from('organizations').insert({
          tenant_id: tenant.id,
          type: 'CLUB',
          name: club_name.trim(),
        });

        // 4. Seed default payment methods
        await supabaseAdmin.from('payment_methods').insert([
          { tenant_id: tenant.id, name: 'PIX', is_default: true, sort_order: 1 },
          { tenant_id: tenant.id, name: 'ChipPix', is_default: false, sort_order: 2 },
          { tenant_id: tenant.id, name: 'Cash', is_default: false, sort_order: 3 },
        ]);

        return NextResponse.json(
          {
            success: true,
            data: {
              id: tenant.id,
              name: tenant.name,
              slug: tenant.slug,
              role: 'OWNER',
              has_subclubs: tenant.has_subclubs ?? true,
            },
          },
          { status: 201 },
        );
      } catch (err: unknown) {
        console.error('[tenants/create] Error:', err instanceof Error ? err.message : err);
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err, 'Erro ao criar clube') },
          { status: 500 },
        );
      }
    },
    { skipTenant: true },
  );
}
