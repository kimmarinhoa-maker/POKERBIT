// ══════════════════════════════════════════════════════════════════════
//  GET /api/chippix/import-summary — ChipPix data from Suprema import
//
//  Returns chippix_import_data (Manager Trade Record) from settlement
//  for cross-reference in the Conciliação tab.
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const url = new URL(req.url);
      const settlementId = url.searchParams.get('settlement_id');
      const weekStart = url.searchParams.get('week_start');

      if (!settlementId && !weekStart) {
        return NextResponse.json(
          { success: false, error: 'settlement_id ou week_start obrigatorio' },
          { status: 400 },
        );
      }

      let query = supabaseAdmin
        .from('settlements')
        .select('id, week_start, chippix_import_data')
        .eq('tenant_id', ctx.tenantId);

      if (settlementId) {
        query = query.eq('id', settlementId);
      } else if (weekStart) {
        query = query.eq('week_start', weekStart).order('version', { ascending: false }).limit(1);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 },
        );
      }

      // Fetch org → chippix_manager_id mapping for subclubs
      const { data: orgs } = await supabaseAdmin
        .from('organizations')
        .select('id, name, chippix_manager_id')
        .eq('tenant_id', ctx.tenantId)
        .eq('type', 'SUBCLUB')
        .not('chippix_manager_id', 'is', null);

      const managerToClub: Record<string, { org_id: string; org_name: string }> = {};
      for (const org of orgs || []) {
        if (org.chippix_manager_id) {
          managerToClub[org.chippix_manager_id] = { org_id: org.id, org_name: org.name };
        }
      }

      if (!data || !data.chippix_import_data) {
        return NextResponse.json({
          success: true,
          data: {
            settlement_id: data?.id || null,
            week_start: data?.week_start || weekStart,
            operators: {},
            manager_to_club: managerToClub,
            has_data: false,
          },
        });
      }

      // Process summary by operator
      const operators = data.chippix_import_data as Record<string, any>;
      const summary: Record<string, any> = {};

      for (const [key, op] of Object.entries(operators)) {
        summary[key] = {
          manager: op.manager,
          managerId: op.managerId,
          totalIN: op.totalIN,
          totalOUT: op.totalOUT,
          saldo: op.saldo,
          txnCount: op.txnCount,
          playerCount: op.playerCount,
        };
      }

      return NextResponse.json({
        success: true,
        data: {
          settlement_id: data.id,
          week_start: data.week_start,
          operators: summary,
          manager_to_club: managerToClub,
          has_data: true,
        },
      });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}
