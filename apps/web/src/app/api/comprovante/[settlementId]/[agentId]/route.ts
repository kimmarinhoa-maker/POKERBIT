// ══════════════════════════════════════════════════════════════════════
//  Public receipt data endpoint — validates HMAC token, no auth required
//  GET /api/comprovante/{settlementId}/{agentMetricId}?e={expiry}&sig={hmac}
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { validateReceiptToken } from '@/lib/server/receiptToken';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ settlementId: string; agentId: string }> },
) {
  const { settlementId, agentId: agentMetricId } = await params;
  const { searchParams } = new URL(req.url);
  const expiry = searchParams.get('e') || '';
  const sig = searchParams.get('sig') || '';

  // 1. Validate HMAC token
  if (!validateReceiptToken(settlementId, agentMetricId, expiry, sig)) {
    return NextResponse.json(
      { success: false, error: 'Link invalido ou expirado' },
      { status: 403 },
    );
  }

  try {
    // 2. Fetch the agent metric row (includes tenant_id for scoping)
    const { data: agentMetric, error: amErr } = await supabaseAdmin
      .from('agent_week_metrics')
      .select('*')
      .eq('id', agentMetricId)
      .eq('settlement_id', settlementId)
      .single();

    if (amErr || !agentMetric) {
      return NextResponse.json(
        { success: false, error: 'Comprovante nao encontrado' },
        { status: 404 },
      );
    }

    const tenantId = agentMetric.tenant_id;

    // 3. Fetch settlement info
    const { data: settlement } = await supabaseAdmin
      .from('settlements')
      .select('id, week_start, week_end, status, club_id')
      .eq('id', settlementId)
      .eq('tenant_id', tenantId)
      .single();

    if (!settlement) {
      return NextResponse.json(
        { success: false, error: 'Settlement nao encontrado' },
        { status: 404 },
      );
    }

    // 4. Fetch players for this agent only
    const { data: players } = await supabaseAdmin
      .from('player_week_metrics')
      .select('*')
      .eq('settlement_id', settlementId)
      .eq('tenant_id', tenantId)
      .eq('agent_name', agentMetric.agent_name)
      .order('nickname');

    // 5. Fetch ledger entries for this agent
    // Entity IDs: agent_id (org), metric id, and player ids
    const entityIds: string[] = [agentMetricId];
    if (agentMetric.agent_id) entityIds.push(agentMetric.agent_id);
    for (const p of players || []) {
      if (p.player_id) entityIds.push(p.player_id);
      if (p.id) entityIds.push(p.id);
      if (p.external_player_id) {
        entityIds.push(String(p.external_player_id));
        entityIds.push(`cp_${p.external_player_id}`);
      }
    }

    const { data: ledgerEntries } = await supabaseAdmin
      .from('ledger_entries')
      .select('id, entity_id, entity_name, dir, amount, method, description, source, created_at')
      .eq('tenant_id', tenantId)
      .eq('week_start', settlement.week_start)
      .in('entity_id', entityIds)
      .order('created_at', { ascending: true });

    // 6. Carry-forward for this agent
    const { data: carryRows } = await supabaseAdmin
      .from('carry_forward')
      .select('entity_id, amount')
      .eq('tenant_id', tenantId)
      .eq('club_id', settlement.club_id)
      .eq('week_start', settlement.week_start)
      .in('entity_id', entityIds);

    const saldoAnterior = (carryRows || []).reduce(
      (sum, r) => sum + Number(r.amount || 0),
      0,
    );

    // 7. Subclub name (org that matches the agent's subclub_name)
    const subclubName = agentMetric.subclub_name || '';

    // 8. Tenant config (pix key)
    const { data: tenantConfig } = await supabaseAdmin
      .from('tenant_config')
      .select('pix_key')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    // 9. Organization logo
    let logoUrl: string | null = null;
    if (subclubName) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('logo_url, metadata')
        .eq('tenant_id', tenantId)
        .eq('name', subclubName)
        .eq('type', 'SUBCLUB')
        .maybeSingle();
      logoUrl = org?.logo_url || (org?.metadata as Record<string, any>)?.logo_url || null;
    }

    return NextResponse.json({
      success: true,
      data: {
        agent: agentMetric,
        players: players || [],
        ledgerEntries: ledgerEntries || [],
        saldoAnterior,
        settlement: {
          id: settlement.id,
          week_start: settlement.week_start,
          week_end: settlement.week_end,
          status: settlement.status,
        },
        subclubName,
        logoUrl,
        pixKey: tenantConfig?.pix_key || null,
      },
    });
  } catch (err) {
    console.error('[comprovante] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Erro interno' },
      { status: 500 },
    );
  }
}
