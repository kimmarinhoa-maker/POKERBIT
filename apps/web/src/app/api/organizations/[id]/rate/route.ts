// ══════════════════════════════════════════════════════════════════════
//  PUT /api/organizations/:id/rate — Update agent rakeback rate
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';
import { logAudit } from '@/lib/server/audit';

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id: agentId } = await params;
        const body = await req.json();
        const { rate, effective_from } = body;

        const numRate = typeof rate === 'string' ? parseFloat(rate) : rate;
        if (numRate == null || isNaN(numRate) || numRate < 0 || numRate > 100) {
          return NextResponse.json(
            { success: false, error: 'Rate deve ser um numero entre 0 e 100' },
            { status: 400 },
          );
        }

        // Validate org is AGENT and belongs to tenant
        const { data: org } = await supabaseAdmin
          .from('organizations')
          .select('id, type')
          .eq('id', agentId)
          .eq('tenant_id', ctx.tenantId)
          .single();

        if (!org) {
          return NextResponse.json(
            { success: false, error: 'Agente nao encontrado' },
            { status: 404 },
          );
        }
        if (org.type !== 'AGENT') {
          return NextResponse.json(
            { success: false, error: 'Apenas agentes possuem rates' },
            { status: 400 },
          );
        }

        const dateFrom = effective_from || new Date().toISOString().split('T')[0];

        // Check if rate already exists for this date — update instead of insert
        const { data: existing } = await supabaseAdmin
          .from('agent_rb_rates')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .eq('agent_id', agentId)
          .eq('effective_from', dateFrom)
          .maybeSingle();

        let data;
        if (existing) {
          const { data: updated, error } = await supabaseAdmin
            .from('agent_rb_rates')
            .update({ rate: numRate, effective_to: null })
            .eq('id', existing.id)
            .select()
            .single();
          if (error) throw error;
          data = updated;
        } else {
          // Close previous rate
          await supabaseAdmin
            .from('agent_rb_rates')
            .update({ effective_to: dateFrom })
            .eq('tenant_id', ctx.tenantId)
            .eq('agent_id', agentId)
            .is('effective_to', null);

          // Insert new rate
          const { data: inserted, error } = await supabaseAdmin
            .from('agent_rb_rates')
            .insert({
              tenant_id: ctx.tenantId,
              agent_id: agentId,
              rate: numRate,
              effective_from: dateFrom,
              created_by: ctx.userId,
            })
            .select()
            .single();
          if (error) throw error;
          data = inserted;
        }

        logAudit(req, ctx, 'UPDATE', 'agent_rb_rate', agentId, undefined, {
          rate: numRate,
          effective_from: dateFrom,
        });

        return NextResponse.json({ success: true, data });
      } catch (err: unknown) {
        console.error('[PUT /:id/rate] Error:', err);
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN', 'FINANCEIRO'] },
  );
}
