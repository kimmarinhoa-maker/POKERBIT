// ══════════════════════════════════════════════════════════════════════
//  Ledger Service — Movimentações financeiras (IN/OUT)
//
//  Convenção de sinais (canônica):
//    dir = 'IN'  → pagamento recebido pelo clube → reduz saldo
//    dir = 'OUT' → pagamento enviado pelo clube  → aumenta saldo
//    ledgerNet = entradas(IN) − saidas(OUT)
// ══════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../config/supabase';
import type { CreateLedgerEntryDTO, MovementDir } from '../types';

export class LedgerService {
  // ─── Criar movimentação ──────────────────────────────────────────
  async createEntry(tenantId: string, dto: CreateLedgerEntryDTO, userId: string) {
    const { data, error } = await supabaseAdmin
      .from('ledger_entries')
      .insert({
        tenant_id: tenantId,
        entity_id: dto.entity_id,
        entity_name: dto.entity_name || null,
        week_start: dto.week_start,
        dir: dto.dir,
        amount: dto.amount,
        method: dto.method || null,
        description: dto.description || null,
        source: 'manual',
        created_by: userId,
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar movimentação: ${error.message}`);

    // Audit (non-critical)
    try {
      await supabaseAdmin.from('audit_log').insert({
        tenant_id: tenantId,
        user_id: userId,
        action: 'CREATE',
        entity_type: 'ledger_entry',
        entity_id: data.id,
        new_data: { entity_id: dto.entity_id, dir: dto.dir, amount: dto.amount },
      });
    } catch (auditErr) {
      console.warn('[ledger] Audit log insert failed (CREATE):', auditErr);
    }

    return data;
  }

  // ─── Listar movimentações por semana/entidade ────────────────────
  async listEntries(tenantId: string, weekStart: string, entityId?: string, page?: number, limit?: number) {
    let query = supabaseAdmin
      .from('ledger_entries')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('week_start', weekStart)
      .order('created_at', { ascending: true });

    if (entityId) {
      query = query.eq('entity_id', entityId);
    }

    if (page && limit) {
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(`Erro ao listar movimentações: ${error.message}`);
    return { data: data || [], total: count || 0 };
  }

  // ─── Calcular ledger net de uma entidade na semana ───────────────
  async calcEntityLedgerNet(tenantId: string, weekStart: string, entityId: string) {
    const { data: entries } = await this.listEntries(tenantId, weekStart, entityId);

    let entradas = 0;
    let saidas = 0;

    for (const e of entries) {
      if (e.dir === 'IN') entradas += Number(e.amount) || 0;
      else saidas += Number(e.amount) || 0;
    }

    return {
      entradas,
      saidas,
      net: entradas - saidas,
      count: entries.length,
    };
  }

  // ─── Deletar movimentação ────────────────────────────────────────
  async deleteEntry(tenantId: string, entryId: string, userId: string) {
    // Buscar antes de deletar (para audit)
    const { data: existing } = await supabaseAdmin
      .from('ledger_entries')
      .select('*')
      .eq('id', entryId)
      .eq('tenant_id', tenantId)
      .single();

    if (!existing) throw new Error('Movimentação não encontrada');

    // Verificar se o settlement desta semana esta finalizado
    const { data: settlement } = await supabaseAdmin
      .from('settlements')
      .select('status')
      .eq('tenant_id', tenantId)
      .eq('week_start', existing.week_start)
      .eq('status', 'FINAL')
      .maybeSingle();

    if (settlement) {
      throw new Error('Não é possível deletar movimentação de uma semana finalizada');
    }

    const { error } = await supabaseAdmin.from('ledger_entries').delete().eq('id', entryId).eq('tenant_id', tenantId);

    if (error) throw new Error(`Erro ao deletar: ${error.message}`);

    // Audit (non-critical)
    try {
      await supabaseAdmin.from('audit_log').insert({
        tenant_id: tenantId,
        user_id: userId,
        action: 'DELETE',
        entity_type: 'ledger_entry',
        entity_id: entryId,
        old_data: existing,
      });
    } catch (auditErr) {
      console.warn('[ledger] Audit log insert failed (DELETE):', auditErr);
    }

    return { deleted: true };
  }
  // ─── Toggle conciliação ──────────────────────────────────────────
  async toggleReconciled(tenantId: string, entryId: string, value: boolean) {
    const { data, error } = await supabaseAdmin
      .from('ledger_entries')
      .update({ is_reconciled: value })
      .eq('id', entryId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw new Error(`Erro ao atualizar conciliação: ${error.message}`);
    if (!data) throw new Error('Movimentação não encontrada');
    return data;
  }
}

export const ledgerService = new LedgerService();
