// ══════════════════════════════════════════════════════════════════════
//  GET/PUT /api/users/[id]/org-access — Escopo de subclubes permitidos
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id } = await params;

        // Verify user belongs to tenant
        const { data: ut, error: utErr } = await supabaseAdmin
          .from('user_tenants')
          .select('id, user_id, role')
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId)
          .single();

        if (utErr || !ut) {
          return NextResponse.json(
            { success: false, error: 'Membro nao encontrado' },
            { status: 404 },
          );
        }

        // OWNER/ADMIN have full access
        if (ut.role === 'OWNER' || ut.role === 'ADMIN') {
          return NextResponse.json({
            success: true,
            data: { full_access: true, org_ids: [] },
          });
        }

        const { data: rows, error } = await supabaseAdmin
          .from('user_org_access')
          .select('org_id')
          .eq('user_id', ut.user_id)
          .eq('tenant_id', ctx.tenantId);

        if (error) throw error;

        return NextResponse.json({
          success: true,
          data: {
            full_access: false,
            org_ids: (rows || []).map((r: any) => r.org_id),
          },
        });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN'] },
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id } = await params;
        const body = await req.json();
        const { org_ids } = body;

        if (!Array.isArray(org_ids)) {
          return NextResponse.json(
            { success: false, error: 'org_ids deve ser um array de UUIDs' },
            { status: 400 },
          );
        }

        // Verify user belongs to tenant
        const { data: ut, error: utErr } = await supabaseAdmin
          .from('user_tenants')
          .select('id, user_id, role')
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId)
          .single();

        if (utErr || !ut) {
          return NextResponse.json(
            { success: false, error: 'Membro nao encontrado' },
            { status: 404 },
          );
        }

        // OWNER/ADMIN don't need org_access
        if (ut.role === 'OWNER' || ut.role === 'ADMIN') {
          return NextResponse.json(
            { success: false, error: 'OWNER e ADMIN tem acesso total, nao precisam de escopo.' },
            { status: 400 },
          );
        }

        // Delete existing entries and insert new ones (replace-all strategy)
        const { error: delError } = await supabaseAdmin
          .from('user_org_access')
          .delete()
          .eq('user_id', ut.user_id)
          .eq('tenant_id', ctx.tenantId);

        if (delError) throw delError;

        if (org_ids.length > 0) {
          const rows = org_ids.map((orgId: string) => ({
            user_id: ut.user_id,
            org_id: orgId,
            tenant_id: ctx.tenantId,
          }));

          const { error: insError } = await supabaseAdmin
            .from('user_org_access')
            .insert(rows);

          if (insError) throw insError;
        }

        return NextResponse.json({ success: true, data: { org_ids } });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN'] },
  );
}
