// ══════════════════════════════════════════════════════════════════════
//  GET /api/settlements/:id — Detalhe basico (compatibilidade)
//  DELETE /api/settlements/:id — Apagar settlement DRAFT + todos dados
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { settlementService } from '@/lib/services/settlement.service';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(req, async (ctx) => {
    try {
      const { id } = await params;
      const detail = await settlementService.getSettlementDetail(ctx.tenantId, id);

      if (!detail) {
        return NextResponse.json(
          { success: false, error: 'Settlement nao encontrado' },
          { status: 404 },
        );
      }

      return NextResponse.json({ success: true, data: detail });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id: settlementId } = await params;

        // 1. Verificar se settlement existe, pertence ao tenant, status DRAFT
        const { data: settlement, error: sErr } = await supabaseAdmin
          .from('settlements')
          .select('id, status, import_id, club_id')
          .eq('id', settlementId)
          .eq('tenant_id', ctx.tenantId)
          .single();

        if (sErr || !settlement) {
          return NextResponse.json(
            { success: false, error: 'Settlement nao encontrado' },
            { status: 404 },
          );
        }

        if (settlement.status !== 'DRAFT') {
          return NextResponse.json(
            {
              success: false,
              error: 'Apenas settlements DRAFT podem ser apagados. Use "Anular" para settlements finalizados.',
            },
            { status: 422 },
          );
        }

        // 2. Coletar agent_ids (para cleanup de orgs orfas depois)
        const { data: agentMetrics } = await supabaseAdmin
          .from('agent_week_metrics')
          .select('agent_id')
          .eq('settlement_id', settlementId)
          .not('agent_id', 'is', null);

        const agentOrgIds = [...new Set((agentMetrics || []).map((m) => m.agent_id).filter(Boolean))];

        // 3. Deletar carry_forward gerado por este settlement
        await supabaseAdmin
          .from('carry_forward')
          .delete()
          .eq('source_settlement_id', settlementId);

        // 4. Deletar ledger_entries deste settlement
        await supabaseAdmin
          .from('ledger_entries')
          .delete()
          .eq('settlement_id', settlementId);

        // 5. Deletar player_week_metrics
        await supabaseAdmin
          .from('player_week_metrics')
          .delete()
          .eq('settlement_id', settlementId)
          .eq('tenant_id', ctx.tenantId);

        // 6. Deletar agent_week_metrics
        await supabaseAdmin
          .from('agent_week_metrics')
          .delete()
          .eq('settlement_id', settlementId)
          .eq('tenant_id', ctx.tenantId);

        // 7. Deletar bank_transactions vinculadas
        await supabaseAdmin
          .from('bank_transactions')
          .delete()
          .eq('settlement_id', settlementId)
          .eq('tenant_id', ctx.tenantId);

        // 8. Deletar settlement
        const { error: delErr } = await supabaseAdmin
          .from('settlements')
          .delete()
          .eq('id', settlementId)
          .eq('tenant_id', ctx.tenantId);

        if (delErr) throw delErr;

        // 9. Cleanup: AGENT orgs orfas (sem nenhum agent_week_metrics restante)
        let orphansRemoved = 0;
        if (agentOrgIds.length > 0) {
          for (const orgId of agentOrgIds) {
            const { count } = await supabaseAdmin
              .from('agent_week_metrics')
              .select('id', { count: 'exact', head: true })
              .eq('agent_id', orgId);

            if (count === 0) {
              await supabaseAdmin
                .from('organizations')
                .delete()
                .eq('id', orgId)
                .eq('type', 'AGENT')
                .eq('tenant_id', ctx.tenantId);
              orphansRemoved++;
            }
          }
        }

        // 10. Deletar import associado (se existir)
        if (settlement.import_id) {
          await supabaseAdmin
            .from('imports')
            .delete()
            .eq('id', settlement.import_id)
            .eq('tenant_id', ctx.tenantId);
        }

        return NextResponse.json({
          success: true,
          data: { deleted: true, orphansRemoved },
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
