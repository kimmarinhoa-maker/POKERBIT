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

        // Find ALL settlements linked to this import (direct or reassigned)
        // Also find orphaned settlements for the same week with dangling import_ids
        const { data: directSettlement } = await supabaseAdmin
          .from('settlements')
          .select('id, status')
          .eq('import_id', importId)
          .eq('tenant_id', ctx.tenantId)
          .maybeSingle();

        // Also find settlements for this week whose import_id no longer exists
        const { data: weekSettlements } = await supabaseAdmin
          .from('settlements')
          .select('id, status, import_id')
          .eq('week_start', imp.week_start)
          .eq('tenant_id', ctx.tenantId);

        // Collect all settlement IDs to delete
        const settlementsToDelete: { id: string; status: string }[] = [];
        if (directSettlement) settlementsToDelete.push(directSettlement);

        // Check for orphaned settlements (import_id points to non-existent import)
        if (weekSettlements) {
          for (const ws of weekSettlements) {
            if (settlementsToDelete.some((s) => s.id === ws.id)) continue;
            if (ws.import_id) {
              const { count } = await supabaseAdmin
                .from('imports')
                .select('id', { count: 'exact', head: true })
                .eq('id', ws.import_id)
                .eq('tenant_id', ctx.tenantId);
              if (count === 0) {
                // Orphaned — import_id points to deleted import
                settlementsToDelete.push(ws);
              }
            }
          }
        }

        // Cascade delete each settlement
        for (const settlement of settlementsToDelete) {
          if (settlement.status === 'FINAL') {
            continue; // Skip finalized — user must void first
          }

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
          const cascadeTables = [
            'player_week_metrics',
            'agent_week_metrics',
            'ledger_entries',
            'club_adjustments',
            'carry_forward',
          ];

          for (const table of cascadeTables) {
            const col = table === 'carry_forward' ? 'source_settlement_id' : 'settlement_id';
            const { error } = await supabaseAdmin
              .from(table)
              .delete()
              .eq('tenant_id', ctx.tenantId)
              .eq(col, sid);
            if (error) throw new Error(`Falha ao excluir ${table}: ${error.message}`);
          }

          // bank_transactions by week
          await supabaseAdmin
            .from('bank_transactions')
            .delete()
            .eq('tenant_id', ctx.tenantId)
            .eq('week_start', imp.week_start);

          // 4. Cleanup: AGENT orgs órfãs
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

          // 5. Cleanup: SUBCLUB orgs órfãs
          for (const orgId of subclubOrgIds) {
            const { count: mc } = await supabaseAdmin
              .from('agent_week_metrics')
              .select('id', { count: 'exact', head: true })
              .eq('subclub_id', orgId);
            if (mc === 0) {
              const { count: ac } = await supabaseAdmin
                .from('club_adjustments')
                .select('id', { count: 'exact', head: true })
                .eq('subclub_id', orgId)
                .eq('tenant_id', ctx.tenantId);
              if (ac === 0) {
                await supabaseAdmin
                  .from('organizations')
                  .delete()
                  .eq('id', orgId)
                  .eq('type', 'SUBCLUB')
                  .eq('tenant_id', ctx.tenantId);
              }
            }
          }

          // 6. Delete settlement itself
          const { error: delSettErr } = await supabaseAdmin
            .from('settlements')
            .delete()
            .eq('id', sid)
            .eq('tenant_id', ctx.tenantId);
          if (delSettErr) throw new Error(`Falha ao excluir settlement: ${delSettErr.message}`);
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
