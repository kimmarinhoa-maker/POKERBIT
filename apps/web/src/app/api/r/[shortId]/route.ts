// ══════════════════════════════════════════════════════════════════════
//  Public receipt data endpoint — validates via DB short link (no HMAC)
//  GET /api/r/{shortId}
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shortId: string }> },
) {
  const { shortId } = await params;

  try {
    // 1. Lookup short link (column is "id", not "short_id")
    const { data: link, error: linkErr } = await supabaseAdmin
      .from('receipt_links')
      .select('id, settlement_id, agent_metric_id, expires_at')
      .eq('id', shortId)
      .maybeSingle();

    if (linkErr || !link) {
      return NextResponse.json(
        { success: false, error: 'Link nao encontrado' },
        { status: 404 },
      );
    }

    // 2. Check expiry
    if (new Date(link.expires_at) < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Link expirado' },
        { status: 403 },
      );
    }

    const { settlement_id: settlementId, agent_metric_id: agentMetricId } = link;

    // 3. Fetch the agent metric row
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

    // Get tenant_id from agent_week_metrics (receipt_links table doesn't have it)
    const tenantId = agentMetric.tenant_id;

    // 4. Fetch settlement info (week_end doesn't exist in DB — computed below)
    const { data: settlement, error: settErr } = await supabaseAdmin
      .from('settlements')
      .select('id, week_start, status, club_id')
      .eq('id', settlementId)
      .eq('tenant_id', tenantId)
      .single();

    if (settErr || !settlement) {
      console.error('[receipt-short] Settlement error:', settErr);
      return NextResponse.json(
        { success: false, error: 'Settlement nao encontrado' },
        { status: 404 },
      );
    }

    // Compute week_end = week_start + 6 days
    const weekEndDate = new Date(settlement.week_start + 'T00:00:00');
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekEnd = weekEndDate.toISOString().split('T')[0];

    // 5. Fetch players for this agent
    const { data: players } = await supabaseAdmin
      .from('player_week_metrics')
      .select('*')
      .eq('settlement_id', settlementId)
      .eq('tenant_id', tenantId)
      .eq('agent_name', agentMetric.agent_name)
      .order('nickname');

    // 6. Fetch ledger entries for this agent
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

    // 7. Carry-forward
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

    // 8. Subclub name
    const subclubName = agentMetric.subclub_name || '';

    // 9. Tenant config (pix key)
    const { data: tenantConfig } = await supabaseAdmin
      .from('tenant_config')
      .select('pix_key')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    // 10. Organization logo (stored in metadata JSONB)
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
          week_end: weekEnd,
          status: settlement.status,
        },
        subclubName,
        logoUrl,
        pixKey: tenantConfig?.pix_key || null,
      },
    });
  } catch (err) {
    console.error('[receipt-short] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Erro interno' },
      { status: 500 },
    );
  }
}
