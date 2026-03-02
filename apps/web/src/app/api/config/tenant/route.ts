// ══════════════════════════════════════════════════════════════════════
//  GET/PATCH /api/config/tenant — Tenant settings
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';
import { logAudit } from '@/lib/server/audit';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('tenants')
        .select('pix_key, pix_key_type')
        .eq('id', ctx.tenantId)
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, data });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}

export async function PATCH(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const { name, has_subclubs, pix_key, pix_key_type } = body;

        const updates: Record<string, any> = {};
        if (typeof name === 'string' && name.trim().length >= 2) updates.name = name.trim();
        if (typeof has_subclubs === 'boolean') updates.has_subclubs = has_subclubs;
        if (pix_key !== undefined) updates.pix_key = pix_key || null;
        if (pix_key_type !== undefined) updates.pix_key_type = pix_key_type || null;

        if (Object.keys(updates).length === 0) {
          return NextResponse.json(
            { success: false, error: 'Nenhum campo para atualizar' },
            { status: 400 },
          );
        }

        const { error } = await supabaseAdmin
          .from('tenants')
          .update(updates)
          .eq('id', ctx.tenantId);

        if (error) throw error;

        // Sync CLUB organization name when tenant name changes
        if (updates.name) {
          await supabaseAdmin
            .from('organizations')
            .update({ name: updates.name })
            .eq('tenant_id', ctx.tenantId)
            .eq('type', 'CLUB');
        }

        logAudit(req, ctx, 'UPDATE', 'tenant', ctx.tenantId, undefined, updates);
        return NextResponse.json({ success: true });
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
