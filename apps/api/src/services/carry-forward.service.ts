// ══════════════════════════════════════════════════════════════════════
//  Carry-Forward Service — Saldo anterior entre semanas
//
//  Fórmula canônica (NUNCA MUDAR SINAL):
//    saldoFinal = saldoAnterior + resultado - ledgerNet
//    ledgerNet  = entradas(IN) - saídas(OUT)
//
//  A tabela carry_forward armazena o saldo com week_start = semana DESTINO
//  (a semana que vai LER esse valor como saldoAnterior).
// ══════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../config/supabase';
import type { CarryForwardResult, CloseWeekResponse } from '../types';

export class CarryForwardService {
  // ─── Ler carry map: entity_id → amount para uma semana/clube ─────
  async getCarryMap(tenantId: string, clubId: string, weekStart: string): Promise<Record<string, number>> {
    const { data, error } = await supabaseAdmin
      .from('carry_forward')
      .select('entity_id, amount')
      .eq('tenant_id', tenantId)
      .eq('club_id', clubId)
      .eq('week_start', weekStart);

    if (error) throw new Error(`Erro ao ler carry-forward: ${error.message}`);

    const map: Record<string, number> = {};
    for (const row of data || []) {
      map[row.entity_id] = Number(row.amount) || 0;
    }
    return map;
  }

  // ─── Ler carry de uma entidade específica ─────────────────────────
  async getCarryForEntity(tenantId: string, clubId: string, weekStart: string, entityId: string): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from('carry_forward')
      .select('amount')
      .eq('tenant_id', tenantId)
      .eq('club_id', clubId)
      .eq('week_start', weekStart)
      .eq('entity_id', entityId)
      .maybeSingle();

    if (error) throw new Error(`Erro ao ler carry-forward: ${error.message}`);
    return data ? Number(data.amount) || 0 : 0;
  }

  // ─── Computar e persistir carry-forward para todo o settlement ────
  async computeAndPersist(tenantId: string, settlementId: string): Promise<CloseWeekResponse> {
    // 1. Buscar settlement
    const { data: settlement, error: settErr } = await supabaseAdmin
      .from('settlements')
      .select('id, tenant_id, club_id, week_start, status')
      .eq('id', settlementId)
      .eq('tenant_id', tenantId)
      .single();

    if (settErr || !settlement) {
      throw new Error('Settlement não encontrado');
    }

    const { club_id, week_start } = settlement;

    // 2. Buscar todos os agent_week_metrics desse settlement
    const { data: agents, error: agErr } = await supabaseAdmin
      .from('agent_week_metrics')
      .select('id, agent_id, agent_name, resultado_brl')
      .eq('settlement_id', settlementId);

    if (agErr) throw new Error(`Erro ao buscar agentes: ${agErr.message}`);
    if (!agents || agents.length === 0) {
      return { count: 0, week_closed: week_start, next_week: this.addDays(week_start, 7), carries: [] };
    }

    // 3. Agrupar por agent_id estável (org UUID)
    const agentMap = new Map<
      string,
      {
        agent_name: string;
        resultado: number;
        metricIds: string[];
      }
    >();

    for (const a of agents) {
      const key = a.agent_id;
      if (!key) continue;

      const existing = agentMap.get(key);
      if (existing) {
        existing.resultado += Number(a.resultado_brl) || 0;
        existing.metricIds.push(a.id);
      } else {
        agentMap.set(key, {
          agent_name: a.agent_name,
          resultado: Number(a.resultado_brl) || 0,
          metricIds: [a.id],
        });
      }
    }

    // 4. Ler carry-forward da semana ATUAL (saldo anterior)
    const carryMap = await this.getCarryMap(tenantId, club_id, week_start);

    // 5. Calcular próxima semana (destino do carry)
    const nextWeek = this.addDays(week_start, 7);

    // 6. Buscar TODOS ledger entries da semana em UMA query (evita N+1)
    const allEntityIds: string[] = [];
    for (const [agentId, info] of agentMap) {
      allEntityIds.push(agentId, ...info.metricIds);
    }

    const { data: allLedger, error: ledgerErr } = await supabaseAdmin
      .from('ledger_entries')
      .select('entity_id, dir, amount')
      .eq('tenant_id', tenantId)
      .eq('week_start', week_start)
      .in('entity_id', allEntityIds);

    if (ledgerErr) throw new Error(`Erro ao buscar ledger: ${ledgerErr.message}`);

    // Indexar ledger por entity_id para lookup rapido
    const ledgerByEntity = new Map<string, { entradas: number; saidas: number }>();
    for (const e of allLedger || []) {
      if (!ledgerByEntity.has(e.entity_id)) {
        ledgerByEntity.set(e.entity_id, { entradas: 0, saidas: 0 });
      }
      const acc = ledgerByEntity.get(e.entity_id)!;
      if (e.dir === 'IN') acc.entradas += Number(e.amount) || 0;
      else acc.saidas += Number(e.amount) || 0;
    }

    // 7. Computar saldoFinal para cada agente (in-memory, sem queries)
    const results: CarryForwardResult[] = [];
    const upsertRows: any[] = [];

    for (const [agentId, info] of agentMap) {
      const saldoAnterior = carryMap[agentId] || 0;

      // Calcular ledgerNet somando de todos entity_ids do agente (org UUID + metric IDs)
      const entityKeys = [agentId, ...info.metricIds];
      let entradas = 0;
      let saidas = 0;
      for (const key of entityKeys) {
        const acc = ledgerByEntity.get(key);
        if (acc) {
          entradas += acc.entradas;
          saidas += acc.saidas;
        }
      }
      const ledgerNet = entradas - saidas;

      // Fórmula canônica: saldoFinal = saldoAnterior + resultado - ledgerNet
      const saldoFinal = saldoAnterior + info.resultado - ledgerNet;

      results.push({
        entity_id: agentId,
        agent_name: info.agent_name,
        saldo_anterior: saldoAnterior,
        resultado: info.resultado,
        ledger_net: ledgerNet,
        saldo_final: saldoFinal,
      });

      upsertRows.push({
        tenant_id: tenantId,
        club_id,
        entity_id: agentId,
        week_start: nextWeek,
        amount: saldoFinal,
        source_settlement_id: settlementId,
      });
    }

    // 8. Batch upsert TODOS carry-forward em UMA query (evita N upserts)
    if (upsertRows.length > 0) {
      const { error: upsertErr } = await supabaseAdmin.from('carry_forward').upsert(upsertRows, {
        onConflict: 'tenant_id,club_id,entity_id,week_start',
      });

      if (upsertErr) {
        throw new Error(`Erro ao gravar carry-forward em batch: ${upsertErr.message}`);
      }
    }

    return {
      count: results.length,
      week_closed: week_start,
      next_week: nextWeek,
      carries: results,
    };
  }

  // ─── Helper: calcular ledgerNet para vários entity_ids ────────────
  private async calcLedgerNet(tenantId: string, weekStart: string, entityIds: string[]): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from('ledger_entries')
      .select('dir, amount')
      .eq('tenant_id', tenantId)
      .eq('week_start', weekStart)
      .in('entity_id', entityIds);

    if (error) throw new Error(`Erro ao buscar ledger: ${error.message}`);

    let entradas = 0;
    let saidas = 0;
    for (const e of data || []) {
      if (e.dir === 'IN') entradas += Number(e.amount) || 0;
      else saidas += Number(e.amount) || 0;
    }

    return entradas - saidas;
  }

  // ─── Helper: adicionar dias a uma data string ─────────────────────
  private addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
  }
}

export const carryForwardService = new CarryForwardService();
