// ══════════════════════════════════════════════════════════════════════
//  PATCH /api/settlements/:id/agents/:agentId/rb-rate
//  Atualiza rb_rate de um agente no settlement (agent_week_metrics)
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

const bodySchema = z.object({
  rb_rate: z.number().min(0).max(100),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; agentId: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id: settlementId, agentId } = await params;

        const body = await req.json();
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { success: false, error: 'rb_rate deve ser um numero entre 0 e 100' },
            { status: 400 },
          );
        }

        const { data, error } = await supabaseAdmin
          .from('agent_week_metrics')
          .update({ rb_rate: parsed.data.rb_rate })
          .eq('id', agentId)
          .eq('settlement_id', settlementId)
          .eq('tenant_id', ctx.tenantId)
          .select()
          .single();

        if (error || !data) {
          return NextResponse.json(
            { success: false, error: 'Agente nao encontrado neste settlement' },
            { status: 404 },
          );
        }

        return NextResponse.json({ success: true, data });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN', 'FINANCEIRO'], permissions: ['tab:rakeback'] },
  );
}
