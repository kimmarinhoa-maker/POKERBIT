// ══════════════════════════════════════════════════════════════════════
//  POST /api/financeiro/agent-groups/[id]/members — Add member to group
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (ctx) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const orgId = body.organization_id;

      if (!orgId) {
        return NextResponse.json({ success: false, error: 'organization_id obrigatorio' }, { status: 400 });
      }

      // Verify the group belongs to tenant
      const { data: group } = await supabaseAdmin
        .from('agent_consolidated_groups')
        .select('id')
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId)
        .single();

      if (!group) {
        return NextResponse.json({ success: false, error: 'Grupo nao encontrado' }, { status: 404 });
      }

      // Verify org is AGENT type and belongs to tenant
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('id, type')
        .eq('id', orgId)
        .eq('tenant_id', ctx.tenantId)
        .single();

      if (!org) {
        return NextResponse.json({ success: false, error: 'Agente nao encontrado' }, { status: 404 });
      }

      // Check not already in another group
      const { data: existing } = await supabaseAdmin
        .from('agent_consolidated_members')
        .select('id, group_id')
        .eq('organization_id', orgId)
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle();

      if (existing && existing.group_id !== id) {
        return NextResponse.json(
          { success: false, error: 'Este agente ja pertence a outro grupo consolidado' },
          { status: 409 },
        );
      }

      if (existing && existing.group_id === id) {
        return NextResponse.json({ success: true, data: existing });
      }

      const { data, error } = await supabaseAdmin
        .from('agent_consolidated_members')
        .insert({
          group_id: id,
          organization_id: orgId,
          tenant_id: ctx.tenantId,
        })
        .select('id, group_id, organization_id')
        .single();

      if (error) throw error;

      return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (err: unknown) {
      return NextResponse.json({ success: false, error: safeErrorMessage(err) }, { status: 500 });
    }
  });
}
