// ══════════════════════════════════════════════════════════════════════
//  Settlement Service — Consulta, finalização, void e breakdown
//
//  Inclui getSettlementWithSubclubs() — coração da paridade funcional:
//    - Agrupa métricas por subclub
//    - Calcula fees automáticas (taxaApp, taxaLiga, taxaRodeoGGR, taxaRodeoApp)
//    - Busca lançamentos (club_adjustments)
//    - Calcula acertoLiga com sinais consistentes
//
//  Fórmula TRAVADA:
//    totalTaxasSigned = -totalTaxasAbs
//    acertoLiga = resultado + totalTaxasSigned + adjustments_total
// ══════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../config/supabase';
import type { SettlementStatus } from '../types';

// ─── round2: REGRA DE OURO ──────────────────────────────────────────
function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function sumArr(arr: any[], key: string): number {
  return arr.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

export class SettlementService {

  // ─── Listar semanas disponíveis ──────────────────────────────────
  async listWeeks(tenantId: string, clubId?: string, startDate?: string, endDate?: string) {
    let query = supabaseAdmin
      .from('settlements')
      .select(`
        id, club_id, week_start, version, status,
        import_id, notes, finalized_at, created_at,
        organizations!inner(name)
      `)
      .eq('tenant_id', tenantId)
      .order('week_start', { ascending: false });

    if (clubId) {
      query = query.eq('club_id', clubId);
    }
    if (startDate) {
      query = query.gte('week_start', startDate);
    }
    if (endDate) {
      query = query.lte('week_start', endDate);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Erro ao listar settlements: ${error.message}`);
    return data || [];
  }

  // ─── Settlement básico (mantido para compatibilidade) ────────────
  async getSettlementDetail(tenantId: string, settlementId: string) {
    const { data: settlement, error } = await supabaseAdmin
      .from('settlements')
      .select('*')
      .eq('id', settlementId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !settlement) return null;

    const { data: playerMetrics } = await supabaseAdmin
      .from('player_week_metrics')
      .select('*')
      .eq('settlement_id', settlementId)
      .order('agent_name', { ascending: true })
      .order('nickname', { ascending: true });

    const { data: agentMetrics } = await supabaseAdmin
      .from('agent_week_metrics')
      .select('*')
      .eq('settlement_id', settlementId)
      .order('agent_name', { ascending: true });

    const { data: ledgerEntries } = await supabaseAdmin
      .from('ledger_entries')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('week_start', settlement.week_start)
      .order('created_at', { ascending: true });

    const ganhosTotal = round2(sumArr(playerMetrics || [], 'winnings_brl'));
    const rakeTotal = round2(sumArr(playerMetrics || [], 'rake_total_brl'));
    const ggrTotal = round2(sumArr(playerMetrics || [], 'ggr_brl'));

    const totals = {
      players: (playerMetrics || []).length,
      agents: (agentMetrics || []).length,
      ganhos: ganhosTotal,
      rake: rakeTotal,
      ggr: ggrTotal,
      rbTotal: round2(sumArr(agentMetrics || [], 'commission_brl')),
      // Resultado do Clube = P/L + Rake + GGR
      resultado: round2(ganhosTotal + rakeTotal + ggrTotal),
    };

    return {
      settlement,
      playerMetrics: playerMetrics || [],
      agentMetrics: agentMetrics || [],
      ledgerEntries: ledgerEntries || [],
      totals,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  GET /settlements/:id/full — Coração da paridade funcional
  // ═══════════════════════════════════════════════════════════════════

  async getSettlementWithSubclubs(
    tenantId: string,
    settlementId: string,
    allowedSubclubIds?: string[] | null  // null/undefined = todos
  ) {
    // ── Passo A: fetch settlement ──────────────────────────────────
    const { data: settlement, error: sErr } = await supabaseAdmin
      .from('settlements')
      .select('*')
      .eq('id', settlementId)
      .eq('tenant_id', tenantId)
      .single();

    if (sErr || !settlement) return null;

    // ── Fetch paralelo: players + agents + fees + adjustments ──────
    const [playersRes, agentsRes, feesRes, adjRes] = await Promise.all([
      supabaseAdmin
        .from('player_week_metrics')
        .select('*')
        .eq('settlement_id', settlementId)
        .eq('tenant_id', tenantId)
        .order('agent_name')
        .order('nickname'),
      supabaseAdmin
        .from('agent_week_metrics')
        .select('*')
        .eq('settlement_id', settlementId)
        .eq('tenant_id', tenantId)
        .order('agent_name'),
      supabaseAdmin
        .from('fee_config')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true),
      supabaseAdmin
        .from('club_adjustments')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('week_start', settlement.week_start),
    ]);

    const players = playersRes.data || [];
    const agents = agentsRes.data || [];
    const feeRows = feesRes.data || [];
    const adjRows = adjRes.data || [];

    // ── Normalizar fees ────────────────────────────────────────────
    const fees: Record<string, number> = {
      taxaApp: 0, taxaLiga: 0, taxaRodeoGGR: 0, taxaRodeoApp: 0,
    };
    for (const r of feeRows) {
      fees[r.name] = Number(r.rate);
    }

    // ── Mapa de adjustments por subclub_id ──────────────────────────
    const adjBySubclub = new Map<string, any>();
    for (const a of adjRows) {
      adjBySubclub.set(a.subclub_id, a);
    }

    // ── Passo B: group by subclub ──────────────────────────────────
    const bySub = new Map<string, {
      id: string;
      name: string;
      players: any[];
      agents: any[];
    }>();

    for (const p of players) {
      const key = p.subclub_id || `name:${p.subclub_name || 'OUTROS'}`;
      if (!bySub.has(key)) {
        bySub.set(key, {
          id: p.subclub_id || '',
          name: p.subclub_name || 'OUTROS',
          players: [],
          agents: [],
        });
      }
      bySub.get(key)!.players.push(p);
    }

    for (const a of agents) {
      const key = a.subclub_id || `name:${a.subclub_name || 'OUTROS'}`;
      if (!bySub.has(key)) {
        bySub.set(key, {
          id: a.subclub_id || '',
          name: a.subclub_name || 'OUTROS',
          players: [],
          agents: [],
        });
      }
      bySub.get(key)!.agents.push(a);
    }

    // ── Passo C: compute por subclub ────────────────────────────────
    const subclubs = Array.from(bySub.values()).map(sc => {
      const ganhos = round2(sumArr(sc.players, 'winnings_brl'));
      const rake = round2(sumArr(sc.players, 'rake_total_brl'));
      const ggr = round2(sumArr(sc.players, 'ggr_brl'));

      // Jogadores ativos = com ganhos != 0 OU rake > 0
      const activePlayers = sc.players.filter(
        (p: any) => (Number(p.winnings_brl) || 0) !== 0 || (Number(p.rake_total_brl) || 0) > 0
      ).length;

      const totals = {
        players: activePlayers,
        agents: new Set(sc.agents.map(x => x.agent_name).filter(Boolean)).size,
        ganhos,
        rake,
        netProfit: round2(sumArr(sc.players, 'net_profit_brl')),
        ggr,
        rbTotal: round2(sumArr(sc.players, 'rb_value_brl')),
        // Resultado do Clube = P/L + Rake + GGR (receita líquida do CLUBE)
        // NÃO confundir com resultado_brl do jogador (= ganhos + rb)
        resultado: round2(ganhos + rake + ggr),
      };

      const feesComputed = this.computeFees(totals, fees);

      const adj = adjBySubclub.get(sc.id) || {
        overlay: 0, compras: 0, security: 0, outros: 0, obs: null,
      };
      const adjustments = {
        overlay: round2(Number(adj.overlay || 0)),
        compras: round2(Number(adj.compras || 0)),
        security: round2(Number(adj.security || 0)),
        outros: round2(Number(adj.outros || 0)),
        obs: adj.obs || null,
      };
      const totalLancamentos = round2(
        adjustments.overlay + adjustments.compras +
        adjustments.security + adjustments.outros
      );

      // ── Fórmula canônica TRAVADA (versão signed) ──────────────────
      // acertoLiga = resultado + totalTaxasSigned + totalLancamentos
      const acertoLiga = round2(
        totals.resultado + feesComputed.totalTaxasSigned + totalLancamentos
      );

      const acertoDirecao =
        acertoLiga > 0.01 ? `Liga deve pagar ao ${sc.name}` :
        acertoLiga < -0.01 ? `${sc.name} deve pagar à Liga` :
        'Neutro';

      return {
        id: sc.id,
        name: sc.name,
        totals,
        feesComputed,
        adjustments,
        totalLancamentos,
        acertoLiga,
        acertoDirecao,
        players: sc.players,
        agents: sc.agents,
      };
    });

    // Ordenar subclubes por nome
    subclubs.sort((a, b) => a.name.localeCompare(b.name));

    // ── Filtro RBAC: restringir aos subclubes permitidos ─────────────
    // allowedSubclubIds=null → acesso total; array → filtrar por id
    let filteredSubclubs = subclubs;
    if (Array.isArray(allowedSubclubIds)) {
      filteredSubclubs = subclubs.filter(sc =>
        sc.id && allowedSubclubIds.includes(sc.id)
      );
    }

    // ── Dashboard totals (rollup) ────────────────────────────────────
    const dashboardTotals = this.rollupDashboard(filteredSubclubs);

    return {
      settlement,
      fees,
      subclubs: filteredSubclubs,
      dashboardTotals,
      meta: {
        roundingPolicy: 'round2_each_step',
        calculationVersion: 'v1.1-resultado-clube-fix',
        formula: 'resultado = ganhos + rake + ggr; acertoLiga = resultado + totalTaxasSigned + totalLancamentos',
        feeSign: 'totalTaxas=positive(UI), totalTaxasSigned=negative(calc)',
        adjustmentSign: 'stored_signed: positive=receita, negative=despesa',
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // ─── Compute fees por subclub ────────────────────────────────────
  private computeFees(
    totals: { rake: number; ggr: number },
    fees: Record<string, number>
  ) {
    const taxaApp = round2(totals.rake * (fees.taxaApp || 0) / 100);
    const taxaLiga = round2(totals.rake * (fees.taxaLiga || 0) / 100);

    const ggrBase = totals.ggr > 0 ? totals.ggr : 0;
    const taxaRodeoGGR = round2(ggrBase * (fees.taxaRodeoGGR || 0) / 100);
    const taxaRodeoApp = round2(ggrBase * (fees.taxaRodeoApp || 0) / 100);

    const totalTaxas = round2(taxaApp + taxaLiga + taxaRodeoGGR + taxaRodeoApp);
    const totalTaxasSigned = round2(-totalTaxas);

    return {
      taxaApp,          // positivo (UI)
      taxaLiga,         // positivo (UI)
      taxaRodeoGGR,     // positivo (UI)
      taxaRodeoApp,     // positivo (UI)
      totalTaxas,       // positivo (UI: "R$ 3.993,23")
      totalTaxasSigned, // negativo (cálculo acertoLiga)
    };
  }

  // ─── Rollup dashboard totals ─────────────────────────────────────
  private rollupDashboard(subclubs: any[]) {
    const sumField = (k: string) =>
      round2(subclubs.reduce((acc, s) => acc + Number(s.totals[k] || 0), 0));

    return {
      players: subclubs.reduce((acc, s) => acc + (s.totals.players || 0), 0),
      agents: subclubs.reduce((acc, s) => acc + (s.totals.agents || 0), 0),
      ganhos: sumField('ganhos'),
      rake: sumField('rake'),
      ggr: sumField('ggr'),
      rbTotal: sumField('rbTotal'),
      resultado: sumField('resultado'),
      totalTaxas: round2(
        subclubs.reduce((acc, s) => acc + Number(s.feesComputed.totalTaxas || 0), 0)
      ),
    };
  }

  // ─── Finalizar (DRAFT → FINAL) ──────────────────────────────────
  async finalizeSettlement(tenantId: string, settlementId: string, userId: string) {
    const { data: current } = await supabaseAdmin
      .from('settlements')
      .select('status, week_start, club_id')
      .eq('id', settlementId)
      .eq('tenant_id', tenantId)
      .single();

    if (!current) throw new Error('Settlement não encontrado');
    if (current.status !== 'DRAFT') {
      throw new Error(`Settlement não pode ser finalizado (status atual: ${current.status})`);
    }

    const { data, error } = await supabaseAdmin
      .from('settlements')
      .update({
        status: 'FINAL' as SettlementStatus,
        finalized_by: userId,
        finalized_at: new Date().toISOString(),
      })
      .eq('id', settlementId)
      .select()
      .single();

    if (error) throw new Error(`Erro ao finalizar: ${error.message}`);

    await supabaseAdmin.from('audit_log').insert({
      tenant_id: tenantId,
      user_id: userId,
      action: 'FINALIZE',
      entity_type: 'settlement',
      entity_id: settlementId,
      new_data: { status: 'FINAL', week_start: current.week_start },
    });

    return data;
  }

  // ─── Anular (FINAL → VOID) ──────────────────────────────────────
  async voidSettlement(tenantId: string, settlementId: string, userId: string, reason: string) {
    const { data: current } = await supabaseAdmin
      .from('settlements')
      .select('status')
      .eq('id', settlementId)
      .eq('tenant_id', tenantId)
      .single();

    if (!current) throw new Error('Settlement não encontrado');
    if (current.status !== 'FINAL') {
      throw new Error(`Apenas settlements FINAL podem ser anulados (atual: ${current.status})`);
    }

    const { data, error } = await supabaseAdmin
      .from('settlements')
      .update({
        status: 'VOID' as SettlementStatus,
        voided_by: userId,
        voided_at: new Date().toISOString(),
        void_reason: reason,
      })
      .eq('id', settlementId)
      .select()
      .single();

    if (error) throw new Error(`Erro ao anular: ${error.message}`);

    await supabaseAdmin.from('audit_log').insert({
      tenant_id: tenantId,
      user_id: userId,
      action: 'VOID',
      entity_type: 'settlement',
      entity_id: settlementId,
      new_data: { status: 'VOID', reason },
    });

    return data;
  }
}

export const settlementService = new SettlementService();
