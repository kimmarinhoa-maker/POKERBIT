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

            const cascadeSteps = [
              { table: 'player_week_metrics', label: 'player metrics' },
              { table: 'agent_week_metrics', label: 'agent metrics' },
              { table: 'settlements', label: 'settlement' },
            ] as const;

            for (const step of cascadeSteps) {
              const col = step.table === 'settlements' ? 'id' : 'settlement_id';
              const { error } = await supabaseAdmin
                .from(step.table)
                .delete()
                .eq(col, sid)
                .eq('tenant_id', ctx.tenantId);
              if (error) {
                throw new Error(
                  `Falha ao excluir ${step.label} (${step.table}): ${error.message}`,
                );
              }
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
