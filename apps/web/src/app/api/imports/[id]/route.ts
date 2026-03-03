// ══════════════════════════════════════════════════════════════════════
//  GET    /api/imports/:id — Import detail
//  DELETE /api/imports/:id — Cascade delete import + settlement
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';
import { logAudit } from '@/lib/server/audit';

type RouteParams = { params: Promise<{ id: string }> };

// ─── GET /api/imports/:id — Detalhe de um import ────────────────────
export async function GET(req: NextRequest, { params }: RouteParams) {
  return withAuth(req, async (ctx) => {
    try {
      const { id } = await params;

      const { data, error } = await supabaseAdmin
        .from('imports')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { success: false, error: 'Import nao encontrado' },
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
  });
}

// ─── DELETE /api/imports/:id — Remover um import ────────────────────
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id: importId } = await params;

        // Verify import exists and get week_start for sibling check
        const { data: imp, error: fetchErr } = await supabaseAdmin
          .from('imports')
          .select('id, week_start')
          .eq('id', importId)
          .eq('tenant_id', ctx.tenantId)
          .single();

        if (fetchErr || !imp) {
          return NextResponse.json(
            { success: false, error: 'Import nao encontrado' },
            { status: 404 },
          );
        }

        // Find associated settlement (settlements.import_id -> imports.id)
        const { data: settlement } = await supabaseAdmin
          .from('settlements')
          .select('id, status')
          .eq('import_id', importId)
          .eq('tenant_id', ctx.tenantId)
          .maybeSingle();

        if (settlement) {
          // Guard: block deletion if settlement is finalized or voided
          if (settlement.status === 'FINAL' || settlement.status === 'VOID') {
            return NextResponse.json(
              { success: false, error: 'Nao e possivel excluir: settlement ja finalizado' },
              { status: 422 },
            );
          }

          // Check if there are OTHER imports for the same week (sibling imports)
          const { data: siblings } = await supabaseAdmin
            .from('imports')
            .select('id')
            .eq('tenant_id', ctx.tenantId)
            .eq('week_start', imp.week_start)
            .eq('status', 'DONE')
            .neq('id', importId)
            .limit(1);

          if (siblings && siblings.length > 0) {
            // Has sibling imports -> preserve settlement, reassign import_id to a sibling
            await supabaseAdmin
              .from('settlements')
              .update({ import_id: siblings[0].id })
              .eq('id', settlement.id);
          } else {
            // Last import for this week -> full cascade delete
            const sid = settlement.id;

            // 1. Collect agent_ids before deleting metrics (for orphan cleanup)
            const { data: agentMetrics } = await supabaseAdmin
              .from('agent_week_metrics')
              .select('agent_id')
              .eq('settlement_id', sid)
              .not('agent_id', 'is', null);

            const agentOrgIds = [
              ...new Set((agentMetrics || []).map((m: { agent_id: string }) => m.agent_id).filter(Boolean)),
            ];

            // 2. Collect subclub_ids before deleting metrics (for orphan cleanup)
            const { data: subclubMetrics } = await supabaseAdmin
              .from('agent_week_metrics')
              .select('subclub_id')
              .eq('settlement_id', sid)
              .not('subclub_id', 'is', null);

            const subclubOrgIds = [
              ...new Set((subclubMetrics || []).map((m: { subclub_id: string }) => m.subclub_id).filter(Boolean)),
            ];

            // 3. Delete all settlement children in order (FKs)
            const cascadeSteps = [
              { table: 'player_week_metrics', col: 'settlement_id', label: 'player metrics' },
              { table: 'agent_week_metrics', col: 'settlement_id', label: 'agent metrics' },
              { table: 'ledger_entries', col: 'settlement_id', label: 'ledger entries' },
              { table: 'bank_transactions', col: 'week_start', label: 'bank transactions', useWeek: true as const },
              { table: 'carry_forward', col: 'source_settlement_id', label: 'carry forward' },
            ];

            for (const step of cascadeSteps) {
              let query = supabaseAdmin
                .from(step.table)
                .delete()
                .eq('tenant_id', ctx.tenantId);

              if ('useWeek' in step && step.useWeek) {
                query = query.eq(step.col, imp.week_start);
              } else {
                query = query.eq(step.col, sid);
              }

              const { error } = await query;
              if (error) {
                throw new Error(
                  `Falha ao excluir ${step.label} (${step.table}): ${error.message}`,
                );
              }
            }

            // 4. Cleanup: AGENT orgs órfãs (sem nenhum agent_week_metrics restante)
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
                }
              }
            }

            // 5. Cleanup: SUBCLUB orgs órfãs (auto-criadas, sem métricas nem ajustes)
            if (subclubOrgIds.length > 0) {
              for (const orgId of subclubOrgIds) {
                const { count: metricsCount } = await supabaseAdmin
                  .from('agent_week_metrics')
                  .select('id', { count: 'exact', head: true })
                  .eq('subclub_id', orgId);

                if (metricsCount === 0) {
                  const { count: adjustCount } = await supabaseAdmin
                    .from('club_adjustments')
                    .select('id', { count: 'exact', head: true })
                    .eq('subclub_id', orgId)
                    .eq('tenant_id', ctx.tenantId);

                  if (adjustCount === 0) {
                    await supabaseAdmin
                      .from('organizations')
                      .delete()
                      .eq('id', orgId)
                      .eq('type', 'SUBCLUB')
                      .eq('tenant_id', ctx.tenantId);
                  }
                }
              }
            }

            // 6. Delete settlement itself
            const { error: delSettErr } = await supabaseAdmin
              .from('settlements')
              .delete()
              .eq('id', sid)
              .eq('tenant_id', ctx.tenantId);

            if (delSettErr) {
              throw new Error(`Falha ao excluir settlement: ${delSettErr.message}`);
            }
          }
        }

        // Delete import record
        const { error: delErr } = await supabaseAdmin
          .from('imports')
          .delete()
          .eq('id', importId)
          .eq('tenant_id', ctx.tenantId);

        if (delErr) throw delErr;

        logAudit(req, ctx, 'DELETE', 'import', importId);
        return NextResponse.json({ success: true });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN'], permissions: ['page:import'] },
  );
}
