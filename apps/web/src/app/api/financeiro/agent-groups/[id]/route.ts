// ══════════════════════════════════════════════════════════════════════
//  PATCH /api/financeiro/agent-groups/[id] — Update group
//  DELETE /api/financeiro/agent-groups/[id] — Delete group
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (ctx) => {
    try {
      const { id } = await params;
      const body = await req.json();

      const updates: Record<string, any> = {};
      if (body.name !== undefined) updates.name = body.name.trim();
      if (body.phone !== undefined) updates.phone = body.phone || null;

      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ success: false, error: 'Nada para atualizar' }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
        .from('agent_consolidated_groups')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId)
        .select('id, name, phone')
        .single();

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ success: false, error: 'Ja existe um grupo com esse nome' }, { status: 409 });
        }
        throw error;
      }

      return NextResponse.json({ success: true, data });
    } catch (err: unknown) {
      return NextResponse.json({ success: false, error: safeErrorMessage(err) }, { status: 500 });
    }
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (ctx) => {
    try {
      const { id } = await params;

      const { error } = await supabaseAdmin
        .from('agent_consolidated_groups')
        .delete()
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId);

      if (error) throw error;

      return NextResponse.json({ success: true });
    } catch (err: unknown) {
      return NextResponse.json({ success: false, error: safeErrorMessage(err) }, { status: 500 });
    }
  });
}
