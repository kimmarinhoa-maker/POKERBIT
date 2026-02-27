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
import { round2 } from '../utils/round2';
import { normName } from '../utils/normName';
import { AppError } from '../utils/apiError';

function sumArr(arr: any[], key: string): number {
  return arr.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

export class SettlementService {
  // ─── Listar semanas disponíveis ──────────────────────────────────
  async listWeeks(
    tenantId: string,
    clubId?: string,
    startDate?: string,
    endDate?: string,
    page: number = 1,
    limit: number = 50,
  ) {
    // Count query for total
    let countQuery = supabaseAdmin
      .from('settlements')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    if (clubId) countQuery = countQuery.eq('club_id', clubId);
    if (startDate) countQuery = countQuery.gte('week_start', startDate);
    if (endDate) countQuery = countQuery.lte('week_start', endDate);

    const { count: total } = await countQuery;

    // Data query with .range()
    const offset = (page - 1) * limit;
    let query = supabaseAdmin
      .from('settlements')
      .select(
        `
        id, club_id, week_start, version, status,
        import_id, notes, finalized_at, created_at,
        organizations!inner(name)
      `,
      )
      .eq('tenant_id', tenantId)
      .order('week_start', { ascending: false })
      .range(offset, offset + limit - 1);

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
    return { data: data || [], total: total || 0 };
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
      .eq('tenant_id', tenantId)
      .eq('settlement_id', settlementId)
      .order('agent_name', { ascending: true })
      .order('nickname', { ascending: true });

    const { data: agentMetrics } = await supabaseAdmin
      .from('agent_week_metrics')
      .select('*')
      .eq('tenant_id', tenantId)
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
    allowedSubclubIds?: string[] | null, // null/undefined = todos
  ) {
    // ── Passo A: fetch settlement ──────────────────────────────────
    const { data: settlement, error: sErr } = await supabaseAdmin
      .from('settlements')
      .select('*')
      .eq('id', settlementId)
      .eq('tenant_id', tenantId)
      .single();

    if (sErr || !settlement) return null;

    // ── Fetch paralelo: players + agents + fees + adjustments + carry + ledger + agent orgs
    const [playersRes, agentsRes, feesRes, adjRes, carryRes, ledgerRes, agentOrgsRes] = await Promise.all([
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
      supabaseAdmin.from('fee_config').select('*').eq('tenant_id', tenantId).eq('is_active', true),
      supabaseAdmin
        .from('club_adjustments')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('week_start', settlement.week_start),
      // Carry-forward para saldo anterior por entidade
      supabaseAdmin
        .from('carry_forward')
        .select('entity_id, amount')
        .eq('tenant_id', tenantId)
        .eq('club_id', settlement.club_id)
        .eq('week_start', settlement.week_start),
      // Ledger entries para pagamentos por jogador
      supabaseAdmin
        .from('ledger_entries')
        .select('entity_id, dir, amount, method, source, description, created_at')
        .eq('tenant_id', tenantId)
        .eq('week_start', settlement.week_start),
      // Agent orgs para is_direct flag
      supabaseAdmin
        .from('organizations')
        .select('id, name, metadata')
        .eq('tenant_id', tenantId)
        .eq('type', 'AGENT')
        .eq('is_active', true),
    ]);

    const players = playersRes.data || [];
    const agents = agentsRes.data || [];
    const feeRows = feesRes.data || [];
    const adjRows = adjRes.data || [];

    // ── Build is_direct map: org_id + normalized name ──────────────────
    const directByOrgId = new Map<string, boolean>();
    const directByName = new Map<string, boolean>();
    for (const org of agentOrgsRes.data || []) {
      const isDirect = org.metadata?.is_direct === true;
      if (isDirect) {
        directByOrgId.set(org.id, true);
        directByName.set(normName(org.name), true);
      }
    }
    // Annotate each agent metric with is_direct
    for (const a of agents) {
      (a as any).is_direct =
        (a.agent_id && directByOrgId.has(a.agent_id)) || directByName.has(normName(a.agent_name || '')) || false;
    }
    // Annotate each player with agent's is_direct
    for (const p of players) {
      (p as any).agent_is_direct =
        (p.agent_id && directByOrgId.has(p.agent_id)) || directByName.has(normName(p.agent_name || '')) || false;
    }

    // ── Build carry-forward map: entity_id → amount ──────────────────
    const carryMap = new Map<string, number>();
    for (const cf of carryRes.data || []) {
      carryMap.set(cf.entity_id, Number(cf.amount) || 0);
    }

    // ── Build ledger map: entity_id → { total, detalhe[] } ──────────
    const ledgerMap = new Map<string, { total: number; detalhe: any[] }>();
    for (const le of ledgerRes.data || []) {
      if (le.source === 'system' || le.source === 'import') continue;
      const key = le.entity_id;
      if (!key) continue;
      if (!ledgerMap.has(key)) ledgerMap.set(key, { total: 0, detalhe: [] });
      const entry = ledgerMap.get(key)!;
      const signed = le.dir === 'IN' ? Number(le.amount) : -Number(le.amount);
      entry.total += signed;
      entry.detalhe.push({
        method: le.method,
        source: le.source,
        amount: round2(signed),
        description: le.description,
        created_at: le.created_at,
      });
    }
    // Sort each detalhe array by created_at DESC
    for (const [, v] of ledgerMap) {
      v.detalhe.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    // ── Normalizar fees ────────────────────────────────────────────
    const fees: Record<string, number> = {
      taxaApp: 0,
      taxaLiga: 0,
      taxaRodeoGGR: 0,
      taxaRodeoApp: 0,
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
    // Pre-build name→id mapping so rows with/without subclub_id merge correctly
    const subclubNameToId = new Map<string, string>();
    for (const p of players) {
      if (p.subclub_id && p.subclub_name) subclubNameToId.set(p.subclub_name, p.subclub_id);
    }
    for (const a of agents) {
      if (a.subclub_id && a.subclub_name) subclubNameToId.set(a.subclub_name, a.subclub_id);
    }
    const subKey = (row: any): string => {
      if (row.subclub_id) return row.subclub_id;
      const name = row.subclub_name || 'OUTROS';
      return subclubNameToId.get(name) || `name:${name}`;
    };

    const bySub = new Map<
      string,
      {
        id: string;
        name: string;
        players: any[];
        agents: any[];
      }
    >();

    for (const p of players) {
      const key = subKey(p);
      if (!bySub.has(key)) {
        bySub.set(key, {
          id: p.subclub_id || subclubNameToId.get(p.subclub_name || '') || '',
          name: p.subclub_name || 'OUTROS',
          players: [],
          agents: [],
        });
      }
      bySub.get(key)!.players.push(p);
    }

    for (const a of agents) {
      const key = subKey(a);
      if (!bySub.has(key)) {
        bySub.set(key, {
          id: a.subclub_id || subclubNameToId.get(a.subclub_name || '') || '',
          name: a.subclub_name || 'OUTROS',
          players: [],
          agents: [],
        });
      }
      bySub.get(key)!.agents.push(a);
    }

    // ── Passo C: compute por subclub ────────────────────────────────
    const subclubs = Array.from(bySub.values()).map((sc) => {
      const ganhos = round2(sumArr(sc.players, 'winnings_brl'));
      const rake = round2(sumArr(sc.players, 'rake_total_brl'));
      const ggr = round2(sumArr(sc.players, 'ggr_brl'));

      // Jogadores ativos = com ganhos != 0 OU rake > 0
      const activePlayers = sc.players.filter(
        (p: any) => (Number(p.winnings_brl) || 0) !== 0 || (Number(p.rake_total_brl) || 0) > 0,
      ).length;

      const totals = {
        players: activePlayers,
        agents: new Set(sc.agents.map((x) => x.agent_name).filter(Boolean)).size,
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
        overlay: 0,
        compras: 0,
        security: 0,
        outros: 0,
        obs: null,
      };
      const adjustments = {
        overlay: round2(Number(adj.overlay || 0)),
        compras: round2(Number(adj.compras || 0)),
        security: round2(Number(adj.security || 0)),
        outros: round2(Number(adj.outros || 0)),
        obs: adj.obs || null,
      };
      const totalLancamentos = round2(
        adjustments.overlay + adjustments.compras + adjustments.security + adjustments.outros,
      );

      // ── Fórmula canônica TRAVADA (versão signed) ──────────────────
      // acertoLiga = resultado + totalTaxasSigned + totalLancamentos
      const acertoLiga = round2(totals.resultado + feesComputed.totalTaxasSigned + totalLancamentos);

      const acertoDirecao =
        acertoLiga > 0.01
          ? `Liga deve pagar ao ${sc.name}`
          : acertoLiga < -0.01
            ? `${sc.name} deve pagar à Liga`
            : 'Neutro';

      // ── Enriquecer cada jogador com carry + pagamentos ────────────
      // Build agent lookup: agent_name → IDs from agent_week_metrics
      // Needed because ledger entries store entity_id as agent_week_metrics.id
      // and carry_forward stores entity_id as organizations.id
      const agentIdLookup = new Map<string, { orgId: string | null; metricId: string }>();
      for (const a of sc.agents) {
        if (!agentIdLookup.has(a.agent_name)) {
          agentIdLookup.set(a.agent_name, {
            orgId: a.agent_id || null,
            metricId: a.id,
          });
        }
      }

      // Track assigned agents: carry/ledger are per-agent, so only assign
      // to the FIRST player of each agent to avoid duplication in sumTotals
      const agentCarryAssigned = new Set<string>();

      for (const p of sc.players) {
        // Player-specific keys (ChipPix per-player, etc.)
        const keys: string[] = [];
        if (p.player_id) keys.push(p.player_id);
        if (p.external_player_id) {
          const eid = String(p.external_player_id);
          keys.push(eid);
          keys.push(`cp_${eid}`);
        }
        if (p.id) keys.push(p.id);

        // Agent-level keys: only for the FIRST player of each agent
        // to prevent carry/ledger duplication across all players of same agent
        const agentKey = p.agent_name || '_NO_AGENT_';
        if (!agentCarryAssigned.has(agentKey)) {
          agentCarryAssigned.add(agentKey);
          const agentInfo = agentIdLookup.get(p.agent_name || '');
          if (agentInfo) {
            if (agentInfo.orgId) keys.push(agentInfo.orgId);
            keys.push(agentInfo.metricId);
          }
          if (p.agent_id && !keys.includes(p.agent_id)) {
            keys.push(p.agent_id);
          }
        }

        // Saldo anterior (carry-forward)
        let saldoAnterior = 0;
        for (const k of keys) {
          if (carryMap.has(k)) {
            saldoAnterior = carryMap.get(k)!;
            break;
          }
        }

        // Pagamentos (ledger entries) — collect from all matching keys
        let totalPagamentos = 0;
        const pagamentosDetalhe: any[] = [];
        const usedKeys = new Set<string>();
        for (const k of keys) {
          if (ledgerMap.has(k) && !usedKeys.has(k)) {
            usedKeys.add(k);
            const entry = ledgerMap.get(k)!;
            totalPagamentos += entry.total;
            pagamentosDetalhe.push(...entry.detalhe);
          }
        }
        // Re-sort detalhe combined
        pagamentosDetalhe.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const resultadoSemana = Number(p.resultado_brl) || 0;
        // Fórmula canônica: saldoAtual = resultado + saldoAnterior + pagamentos
        // totalPagamentos (IN=+, OUT=-): pagamento recebido REDUZ dívida do jogador
        const saldoAtual = round2(resultadoSemana + saldoAnterior + round2(totalPagamentos));

        p.saldo_anterior = round2(saldoAnterior);
        p.total_pagamentos = round2(totalPagamentos);
        p.pagamentos_detalhe = pagamentosDetalhe;
        p.saldo_atual = saldoAtual;
        p.situacao = saldoAtual > 0.01 ? 'a_receber' : saldoAtual < -0.01 ? 'a_pagar' : 'quitado';
      }

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
      filteredSubclubs = subclubs.filter((sc) => sc.id && allowedSubclubIds.includes(sc.id));
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
  private computeFees(totals: { rake: number; ggr: number }, fees: Record<string, number>) {
    const taxaApp = round2((totals.rake * (fees.taxaApp || 0)) / 100);
    const taxaLiga = round2((totals.rake * (fees.taxaLiga || 0)) / 100);

    const ggrBase = totals.ggr > 0 ? totals.ggr : 0;
    const taxaRodeoGGR = round2((ggrBase * (fees.taxaRodeoGGR || 0)) / 100);
    const taxaRodeoApp = round2((ggrBase * (fees.taxaRodeoApp || 0)) / 100);

    const totalTaxas = round2(taxaApp + taxaLiga + taxaRodeoGGR + taxaRodeoApp);
    const totalTaxasSigned = round2(-totalTaxas);

    return {
      taxaApp, // positivo (UI)
      taxaLiga, // positivo (UI)
      taxaRodeoGGR, // positivo (UI)
      taxaRodeoApp, // positivo (UI)
      totalTaxas, // positivo (UI: "R$ 3.993,23")
      totalTaxasSigned, // negativo (cálculo acertoLiga)
    };
  }

  // ─── Rollup dashboard totals ─────────────────────────────────────
  // Soma direto dos players para evitar cascata de arredondamento
  // (round2 por jogador → round2 por subclub → round2 dashboard)
  private rollupDashboard(subclubs: any[]) {
    // Soma direta dos dados de jogadores — apenas 1 round2 no final
    const allPlayers = subclubs.flatMap((s) => s.players || []);

    const ganhos = round2(sumArr(allPlayers, 'winnings_brl'));
    const rake = round2(sumArr(allPlayers, 'rake_total_brl'));
    const ggr = round2(sumArr(allPlayers, 'ggr_brl'));
    const rbTotal = round2(sumArr(allPlayers, 'rb_value_brl'));
    const resultado = round2(ganhos + rake + ggr);

    // Fees e lançamentos continuam somados por subclub (são per-subclub por natureza)
    const totalTaxas = round2(subclubs.reduce((acc, s) => acc + Number(s.feesComputed.totalTaxas || 0), 0));
    const totalTaxasSigned = round2(-totalTaxas);
    const totalLancamentos = round2(subclubs.reduce((acc, s) => acc + Number(s.totalLancamentos || 0), 0));
    const acertoLiga = round2(resultado + totalTaxasSigned + totalLancamentos);

    return {
      players: subclubs.reduce((acc, s) => acc + (s.totals.players || 0), 0),
      agents: subclubs.reduce((acc, s) => acc + (s.totals.agents || 0), 0),
      ganhos,
      rake,
      ggr,
      rbTotal,
      resultado,
      totalTaxas,
      totalTaxasSigned,
      totalLancamentos,
      acertoLiga,
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

    if (!current) throw new AppError('Settlement não encontrado', 404);
    if (current.status !== 'DRAFT') {
      throw new AppError(`Settlement não pode ser finalizado (status atual: ${current.status})`, 422);
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

    try {
      await supabaseAdmin.from('audit_log').insert({
        tenant_id: tenantId,
        user_id: userId,
        action: 'FINALIZE',
        entity_type: 'settlement',
        entity_id: settlementId,
        new_data: { status: 'FINAL', week_start: current.week_start },
      });
    } catch (auditErr) {
      console.warn('[audit] Failed to log:', auditErr);
    }

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

    if (!current) throw new AppError('Settlement não encontrado', 404);
    if (current.status !== 'FINAL') {
      throw new AppError(`Apenas settlements FINAL podem ser anulados (atual: ${current.status})`, 422);
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

    try {
      await supabaseAdmin.from('audit_log').insert({
        tenant_id: tenantId,
        user_id: userId,
        action: 'VOID',
        entity_type: 'settlement',
        entity_id: settlementId,
        new_data: { status: 'VOID', reason },
      });
    } catch (auditErr) {
      console.warn('[audit] Failed to log:', auditErr);
    }

    return data;
  }
}

export const settlementService = new SettlementService();
