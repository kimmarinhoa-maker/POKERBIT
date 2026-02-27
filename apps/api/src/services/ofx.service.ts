// ══════════════════════════════════════════════════════════════════════
//  OFX Service — Parse OFX files + manage bank_transactions staging
//
//  Fluxo: Upload OFX → Parse → Staging (bank_transactions)
//         → Vincular entidade → Aplicar (cria ledger_entries)
// ══════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../config/supabase';

// ─── Types ──────────────────────────────────────────────────────────

interface ParsedTransaction {
  fitid: string;
  tx_date: string; // YYYY-MM-DD
  amount: number;
  memo: string;
  bank_name: string;
  dir: 'in' | 'out';
}

interface BankTransaction {
  id: string;
  tenant_id: string;
  source: string;
  fitid: string;
  tx_date: string;
  amount: number;
  memo: string | null;
  bank_name: string | null;
  dir: string;
  status: string;
  category: string | null;
  entity_id: string | null;
  entity_name: string | null;
  week_start: string | null;
  applied_ledger_id: string | null;
  created_at: string;
}

// ─── Auto-Match Types ────────────────────────────────────────────────

export interface AutoMatchSuggestion {
  transaction_id: string;
  suggested_entity_id: string | null;
  suggested_entity_name: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  match_tier: 1 | 2 | 3 | 4 | 5;
  match_reason: string;
  // Extra context for frontend display
  memo: string | null;
  amount: number;
  tx_date: string;
  dir: string;
}

export class OFXService {
  // ─── Parse OFX raw text → transactions ────────────────────────────
  parseOFX(raw: string, fileName: string): ParsedTransaction[] {
    const txns: ParsedTransaction[] = [];

    // Extract STMTTRN blocks
    const blocks = raw.match(/<STMTTRN[\s\S]*?<\/STMTTRN>|<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>)/gi) || [];

    // Extract bank name from OFX header
    const bankMatch = raw.match(/<(?:FI>[\s\S]*?<ORG>|ORG>)([^<\r\n]+)/i);
    const bankName = bankMatch ? bankMatch[1].trim() : fileName.replace(/\.ofx$/i, '');

    for (const block of blocks) {
      const get = (tag: string): string => {
        const m = block.match(new RegExp('<' + tag + '>([^<\\r\\n]+)', 'i'));
        return m ? m[1].trim() : '';
      };

      const fitid = get('FITID');
      const amountStr = get('TRNAMT').replace(',', '.');
      const amount = parseFloat(amountStr);
      const memo = get('MEMO') || get('NAME') || '';
      const payee = get('PAYEE') || get('PAYEE2') || '';
      const dtRaw = get('DTPOSTED');

      if (isNaN(amount) || amount === 0 || !fitid) continue;

      // Parse date: YYYYMMDD
      const y = dtRaw.substring(0, 4);
      const mo = dtRaw.substring(4, 6);
      const d = dtRaw.substring(6, 8);
      const txDate = `${y}-${mo}-${d}`;

      // Enrich memo with payee
      const memoFull =
        payee && !memo.toLowerCase().includes(payee.toLowerCase().substring(0, 8)) ? `${memo} · ${payee}` : memo;

      txns.push({
        fitid,
        tx_date: txDate,
        amount: Math.abs(amount),
        memo: memoFull,
        bank_name: bankName,
        dir: amount >= 0 ? 'in' : 'out',
      });
    }

    return txns.sort((a, b) => b.tx_date.localeCompare(a.tx_date));
  }

  // ─── Upload: parse + upsert into bank_transactions ────────────────
  async uploadOFX(tenantId: string, raw: string, fileName: string, weekStart?: string) {
    const parsed = this.parseOFX(raw, fileName);

    if (parsed.length === 0) {
      return { imported: 0, skipped: 0, transactions: [] };
    }

    // Check existing FITIDs to avoid duplicates
    const fitids = parsed.map((t) => t.fitid);
    const { data: existing } = await supabaseAdmin
      .from('bank_transactions')
      .select('fitid')
      .eq('tenant_id', tenantId)
      .in('fitid', fitids);

    const existingSet = new Set((existing || []).map((e) => e.fitid));

    const toInsert = parsed
      .filter((t) => !existingSet.has(t.fitid))
      .map((t) => ({
        tenant_id: tenantId,
        source: 'ofx',
        fitid: t.fitid,
        tx_date: t.tx_date,
        amount: t.amount,
        memo: t.memo || null,
        bank_name: t.bank_name,
        dir: t.dir,
        status: 'pending',
        week_start: weekStart || null,
      }));

    let inserted: BankTransaction[] = [];
    if (toInsert.length > 0) {
      const { data, error } = await supabaseAdmin.from('bank_transactions').insert(toInsert).select();

      if (error) throw new Error(`Erro ao salvar transações: ${error.message}`);
      inserted = data || [];
    }

    return {
      imported: inserted.length,
      skipped: existingSet.size,
      total_parsed: parsed.length,
      transactions: inserted,
    };
  }

  // ─── Listar transações de uma semana ──────────────────────────────
  async listTransactions(
    tenantId: string,
    weekStart?: string,
    status?: string,
    page: number = 1,
    limit: number = 100,
  ): Promise<{ data: BankTransaction[]; total: number }> {
    // Count query for total
    let countQuery = supabaseAdmin
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('source', 'ofx');

    if (weekStart) countQuery = countQuery.eq('week_start', weekStart);
    if (status) countQuery = countQuery.eq('status', status);

    const { count: total } = await countQuery;

    // Data query with .range()
    const offset = (page - 1) * limit;
    let query = supabaseAdmin
      .from('bank_transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('source', 'ofx')
      .order('tx_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (weekStart) query = query.eq('week_start', weekStart);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(`Erro ao listar transações: ${error.message}`);
    return { data: data || [], total: total || 0 };
  }

  // ─── Vincular transação a uma entidade ────────────────────────────
  async linkTransaction(tenantId: string, txId: string, entityId: string, entityName: string, category?: string) {
    const { data, error } = await supabaseAdmin
      .from('bank_transactions')
      .update({
        entity_id: entityId,
        entity_name: entityName,
        category: category || null,
        status: 'linked',
      })
      .eq('id', txId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw new Error(`Erro ao vincular: ${error.message}`);
    return data;
  }

  // ─── Desvincular transação ────────────────────────────────────────
  async unlinkTransaction(tenantId: string, txId: string) {
    const { data, error } = await supabaseAdmin
      .from('bank_transactions')
      .update({
        entity_id: null,
        entity_name: null,
        category: null,
        status: 'pending',
      })
      .eq('id', txId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw new Error(`Erro ao desvincular: ${error.message}`);
    return data;
  }

  // ─── Ignorar transação ────────────────────────────────────────────
  async ignoreTransaction(tenantId: string, txId: string, ignore: boolean) {
    const { data, error } = await supabaseAdmin
      .from('bank_transactions')
      .update({ status: ignore ? 'ignored' : 'pending' })
      .eq('id', txId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw new Error(`Erro ao atualizar: ${error.message}`);
    return data;
  }

  // ─── Aplicar transações vinculadas → criar ledger_entries ─────────
  async applyLinked(tenantId: string, weekStart: string, userId: string) {
    // Fetch all linked (not yet applied) transactions for this week
    const { data: linked, error: fetchErr } = await supabaseAdmin
      .from('bank_transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('week_start', weekStart)
      .eq('status', 'linked');

    if (fetchErr) throw new Error(`Erro ao buscar vinculadas: ${fetchErr.message}`);
    if (!linked || linked.length === 0) {
      return { applied: 0, errors: [] };
    }

    // Filter to only those with entity_id and build all ledger entries at once
    const validTxns = linked.filter((tx) => tx.entity_id);
    if (validTxns.length === 0) {
      return { applied: 0, errors: [] };
    }

    const allEntries = validTxns.map((tx) => ({
      tenant_id: tenantId,
      entity_id: tx.entity_id,
      entity_name: tx.entity_name || null,
      week_start: weekStart,
      dir: tx.dir === 'in' ? 'IN' : 'OUT',
      amount: Math.abs(Number(tx.amount)),
      method: tx.bank_name || 'OFX',
      description: tx.memo || `OFX: ${tx.fitid}`,
      source: 'ofx',
      external_ref: tx.fitid,
      created_by: userId,
    }));

    // Batch insert all ledger entries
    const { data: insertedEntries, error: ledgerErr } = await supabaseAdmin
      .from('ledger_entries')
      .insert(allEntries)
      .select('id, external_ref');

    const errors: string[] = [];
    if (ledgerErr) {
      errors.push(`Erro ao criar ledger entries em batch: ${ledgerErr.message}`);
      // Audit even on failure
      await supabaseAdmin.from('audit_log').insert({
        tenant_id: tenantId,
        user_id: userId,
        action: 'APPLY_OFX',
        entity_type: 'bank_transaction',
        new_data: { week_start: weekStart, applied: 0, error: ledgerErr.message },
      });
      return { applied: 0, errors };
    }

    // Build fitid → ledger_id map for the status update
    const fitidToLedgerId = new Map<string, string>();
    for (const entry of insertedEntries || []) {
      if (entry.external_ref) fitidToLedgerId.set(entry.external_ref, entry.id);
    }

    // Batch update all bank_transactions to 'applied'
    const txIds = validTxns.map((tx) => tx.id);
    const { error: updateErr } = await supabaseAdmin
      .from('bank_transactions')
      .update({ status: 'applied' })
      .eq('tenant_id', tenantId)
      .in('id', txIds);

    if (updateErr) {
      errors.push(`Ledger entries criados, mas erro ao atualizar bank_transactions: ${updateErr.message}`);
    }

    // Update applied_ledger_id individually (different value per row)
    for (const tx of validTxns) {
      const ledgerId = fitidToLedgerId.get(tx.fitid);
      if (ledgerId) {
        await supabaseAdmin
          .from('bank_transactions')
          .update({ applied_ledger_id: ledgerId })
          .eq('id', tx.id)
          .eq('tenant_id', tenantId);
      }
    }

    const applied = insertedEntries?.length || 0;

    // Audit
    await supabaseAdmin.from('audit_log').insert({
      tenant_id: tenantId,
      user_id: userId,
      action: 'APPLY_OFX',
      entity_type: 'bank_transaction',
      new_data: { week_start: weekStart, applied },
    });

    return { applied, errors };
  }

  // ─── Auto-Match: 5-tier matching for pending OFX transactions ──────
  async autoMatch(tenantId: string, weekStart: string): Promise<AutoMatchSuggestion[]> {
    // 1) Fetch pending OFX transactions for this week
    const { data: pendingTxns, error: txErr } = await supabaseAdmin
      .from('bank_transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('source', 'ofx')
      .eq('status', 'pending')
      .eq('week_start', weekStart);

    if (txErr) throw new Error(`Erro ao buscar transações pendentes: ${txErr.message}`);
    if (!pendingTxns || pendingTxns.length === 0) return [];

    // 2) Fetch entities for matching
    const { data: agentMetrics } = await supabaseAdmin
      .from('agent_week_metrics')
      .select('agent_id, agent_name')
      .eq('tenant_id', tenantId)
      .eq('week_start', weekStart);

    const { data: playerMetrics } = await supabaseAdmin
      .from('player_week_metrics')
      .select('external_player_id, nickname, agent_id, agent_name')
      .eq('tenant_id', tenantId)
      .eq('week_start', weekStart);

    // Build a unique set of entity names (agents + player nicks)
    const entityMap = new Map<string, { id: string; name: string; type: 'agent' | 'player' }>();
    const agentNameSet = new Set<string>();
    for (const a of (agentMetrics || [])) {
      const agentKey = (a.agent_name || '').toUpperCase().trim();
      if (agentKey && !agentNameSet.has(agentKey)) {
        agentNameSet.add(agentKey);
        entityMap.set(agentKey, {
          id: a.agent_id || a.agent_name,
          name: a.agent_name,
          type: 'agent',
        });
      }
    }
    for (const p of (playerMetrics || [])) {
      const playerKey = (p.nickname || '').toUpperCase().trim();
      if (playerKey && !entityMap.has(playerKey)) {
        entityMap.set(playerKey, {
          id: p.external_player_id || p.nickname,
          name: p.nickname,
          type: 'player',
        });
      }
    }

    // 3) Fetch unreconciled ledger entries for Tier 2 (amount+date match)
    const { data: ledgerEntries } = await supabaseAdmin
      .from('ledger_entries')
      .select('id, entity_id, entity_name, amount, dir, week_start, is_reconciled, created_at')
      .eq('tenant_id', tenantId)
      .eq('week_start', weekStart)
      .eq('is_reconciled', false);

    const unreconciledLedger = ledgerEntries || [];

    // 4) Process each pending transaction through 5 tiers
    const suggestions: AutoMatchSuggestion[] = [];

    for (const tx of pendingTxns) {
      const memoUpper = (tx.memo || '').toUpperCase().trim();
      let matched = false;

      // ── Tier 1: Exact memo match against entity names ─────────
      for (const [key, entity] of entityMap) {
        if (key && memoUpper && (memoUpper === key || memoUpper.includes(key) || key.includes(memoUpper))) {
          // Require a meaningful match (at least 3 chars)
          if (key.length >= 3) {
            suggestions.push({
              transaction_id: tx.id,
              suggested_entity_id: entity.id,
              suggested_entity_name: entity.name,
              confidence: 'high',
              match_tier: 1,
              match_reason: `Memo contém nome "${entity.name}" (${entity.type === 'agent' ? 'agente' : 'jogador'})`,
              memo: tx.memo,
              amount: tx.amount,
              tx_date: tx.tx_date,
              dir: tx.dir,
            });
            matched = true;
            break;
          }
        }
      }
      if (matched) continue;

      // ── Tier 2: Amount+date match against unreconciled ledger ──
      const txAmount = Math.abs(Number(tx.amount));
      const txDate = tx.tx_date; // YYYY-MM-DD
      const ledgerMatch = unreconciledLedger.find((le) => {
        const leAmount = Math.abs(Number(le.amount));
        // Amount must match within 0.01 tolerance
        const amountMatch = Math.abs(leAmount - txAmount) < 0.01;
        // Date: compare using the created_at date (take first 10 chars for YYYY-MM-DD)
        const leDate = (le.created_at || '').substring(0, 10);
        const dateMatch = leDate === txDate;
        return amountMatch && dateMatch;
      });

      if (ledgerMatch && ledgerMatch.entity_id) {
        suggestions.push({
          transaction_id: tx.id,
          suggested_entity_id: ledgerMatch.entity_id,
          suggested_entity_name: ledgerMatch.entity_name || ledgerMatch.entity_id,
          confidence: 'medium',
          match_tier: 2,
          match_reason: `Valor ${txAmount.toFixed(2)} e data ${txDate} coincidem com ledger de "${ledgerMatch.entity_name}"`,
          memo: tx.memo,
          amount: tx.amount,
          tx_date: tx.tx_date,
          dir: tx.dir,
        });
        continue;
      }

      // ── Tier 3: Partial substring match (5+ chars) ─────────────
      if (memoUpper.length >= 5) {
        let tier3Match: { id: string; name: string; type: string } | null = null;

        for (const [key, entity] of entityMap) {
          if (key.length < 5) continue;

          // Check substrings of memo against entity name and vice-versa
          // Try all 5-char+ substrings of entity name in memo
          for (let len = Math.min(key.length, memoUpper.length); len >= 5; len--) {
            let found = false;
            for (let start = 0; start <= key.length - len; start++) {
              const sub = key.substring(start, start + len);
              if (memoUpper.includes(sub)) {
                tier3Match = entity;
                found = true;
                break;
              }
            }
            if (found) break;
          }

          if (tier3Match) break;

          // Also check substrings of memo against entity name
          for (let len = Math.min(key.length, memoUpper.length); len >= 5; len--) {
            let found = false;
            for (let start = 0; start <= memoUpper.length - len; start++) {
              const sub = memoUpper.substring(start, start + len);
              if (key.includes(sub)) {
                tier3Match = entity;
                found = true;
                break;
              }
            }
            if (found) break;
          }

          if (tier3Match) break;
        }

        if (tier3Match) {
          suggestions.push({
            transaction_id: tx.id,
            suggested_entity_id: tier3Match.id,
            suggested_entity_name: tier3Match.name,
            confidence: 'low',
            match_tier: 3,
            match_reason: `Substring do memo corresponde parcialmente a "${tier3Match.name}"`,
            memo: tx.memo,
            amount: tx.amount,
            tx_date: tx.tx_date,
            dir: tx.dir,
          });
          continue;
        }
      }

      // ── Tier 4: Payment method detection (PIX, TED, DOC) ──────
      const paymentMethods = ['PIX', 'TED', 'DOC', 'BOLETO', 'TRANSFERENCIA', 'TRANSF', 'DEP', 'DEPOSITO', 'SAQUE'];
      const detectedMethod = paymentMethods.find((m) => memoUpper.includes(m));

      if (detectedMethod) {
        suggestions.push({
          transaction_id: tx.id,
          suggested_entity_id: null,
          suggested_entity_name: null,
          confidence: 'low',
          match_tier: 4,
          match_reason: `Metodo de pagamento detectado: ${detectedMethod}`,
          memo: tx.memo,
          amount: tx.amount,
          tx_date: tx.tx_date,
          dir: tx.dir,
        });
        continue;
      }

      // ── Tier 5: Unmatched ──────────────────────────────────────
      suggestions.push({
        transaction_id: tx.id,
        suggested_entity_id: null,
        suggested_entity_name: null,
        confidence: 'none',
        match_tier: 5,
        match_reason: 'Nenhuma correspondência encontrada — classificação manual necessária',
        memo: tx.memo,
        amount: tx.amount,
        tx_date: tx.tx_date,
        dir: tx.dir,
      });
    }

    return suggestions;
  }

  // ─── Deletar transação (apenas pending/ignored) ───────────────────
  async deleteTransaction(tenantId: string, txId: string) {
    const { data: existing } = await supabaseAdmin
      .from('bank_transactions')
      .select('status')
      .eq('id', txId)
      .eq('tenant_id', tenantId)
      .single();

    if (!existing) throw new Error('Transação não encontrada');
    if (existing.status === 'applied') {
      throw new Error('Não é possível excluir transação já aplicada');
    }

    const { error } = await supabaseAdmin.from('bank_transactions').delete().eq('id', txId).eq('tenant_id', tenantId);

    if (error) throw new Error(`Erro ao excluir: ${error.message}`);
    return { deleted: true };
  }
}

export const ofxService = new OFXService();
