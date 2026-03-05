// ══════════════════════════════════════════════════════════════════════
//  PATCH /api/settlements/:id/agents/:agentId/payment-type
//  Atualiza tipo de pagamento (fiado/avista) de um agente no settlement
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

const bodySchema = z.object({
  payment_type: z.enum(['fiado', 'avista']),
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
            { success: false, error: 'payment_type deve ser "fiado" ou "avista"' },
            { status: 400 },
          );
        }

        const { data, error } = await supabaseAdmin
          .from('agent_week_metrics')
          .update({ payment_type: parsed.data.payment_type })
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
    { roles: ['OWNER', 'ADMIN', 'FINANCEIRO'], permissions: ['tab:liquidacao'] },
  );
}
