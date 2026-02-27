// ══════════════════════════════════════════════════════════════════════
//  ChipPix Service — Parse XLSX ChipPix + insert ledger_entries
//
//  Fluxo: Upload XLSX → Parse → Agrupar por jogador → Auto-match
//         → Insert ledger_entries (source='chippix')
// ══════════════════════════════════════════════════════════════════════

import XLSX from 'xlsx';
import { supabaseAdmin } from '../config/supabase';
import { round2 } from '../utils/round2';
import type { ChipPixExtratoRow, ChipPixImportResult, NaoVinculado } from '../types/chippix';

// ─── Types ──────────────────────────────────────────────────────────

interface ParsedPlayer {
  idJog: string; // Player ID from spreadsheet
  nome: string; // Member name
  entrada: number; // Gross input (sum)
  saida: number; // Gross output (sum)
  taxa: number; // Fees (sum)
  txns: number; // Transaction count
  datas: string[]; // Unique dates
  saldo: number; // entrada - saida
}

// Ledger-compatible row returned to frontend (with virtual fields for compat)
interface ChipPixRow {
  id: string;
  tenant_id: string;
  entity_id: string | null;
  entity_name: string | null;
  week_start: string | null;
  dir: string;
  amount: number;
  method: string | null;
  description: string | null;
  source: string;
  is_reconciled: boolean;
  external_ref: string | null;
  created_by: string | null;
  created_at: string;
  // Virtual fields (computed, for frontend compat)
  fitid: string;
  memo: string | null;
  status: string;
  bank_name: null;
  category: null;
}

export class ChipPixService {
  // ─── Parse XLSX ChipPix → aggregated player records ──────────────
  parseChipPix(buffer: Buffer): ParsedPlayer[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Find sheet: prefer one containing "opera" (Operações), fallback to first
    const sheetName = workbook.SheetNames.find((n) => n.toLowerCase().includes('opera')) || workbook.SheetNames[0];

    if (!sheetName) throw new Error('Arquivo XLSX vazio — nenhuma aba encontrada');

    const sheet = workbook.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (data.length < 2) throw new Error('Planilha vazia ou sem dados');

    // Find header row (first row with recognizable columns)
    const header = (data[0] || []).map((h: any) => String(h).trim().toLowerCase());

    // Locate columns
    const iId = header.findIndex((h) => h.includes('id jogador'));
    const iTipo = header.findIndex((h) => h === 'tipo');
    const iEnt = header.findIndex((h) => h.includes('entrada bruta'));
    const iSai = header.findIndex((h) => h.includes('saida bruta') || h.includes('saída bruta'));
    const iTaxa = header.findIndex((h) => h.includes('taxa'));
    const iNome = header.findIndex((h) => h === 'integrante');

    if (iId < 0) {
      throw new Error('Coluna "Id Jogador" não encontrada. Verifique o arquivo.');
    }

    // Group by player ID
    const grupos: Record<string, ParsedPlayer> = {};

    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      if (!row || row.length === 0) continue;

      const idJog = String(row[iId] || '').trim();
      if (!idJog) continue;

      const parseNum = (val: any): number => {
        if (val === '' || val === null || val === undefined) return 0;
        return parseFloat(String(val).replace(',', '.')) || 0;
      };

      const entrada = iEnt >= 0 ? parseNum(row[iEnt]) : 0;
      const saida = iSai >= 0 ? parseNum(row[iSai]) : 0;
      const taxa = iTaxa >= 0 ? parseNum(row[iTaxa]) : 0;
      const nome = iNome >= 0 ? String(row[iNome] || '').trim() : '';

      // Date from first column (column 0)
      let dateStr = '';
      const rawDate = row[0];
      if (rawDate) {
        if (typeof rawDate === 'number') {
          // Excel serial date
          const d = XLSX.SSF.parse_date_code(rawDate);
          if (d) dateStr = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        } else {
          const s = String(rawDate).substring(0, 10);
          if (/^\d{4}-\d{2}-\d{2}/.test(s)) dateStr = s;
        }
      }

      if (!grupos[idJog]) {
        grupos[idJog] = {
          idJog,
          nome,
          entrada: 0,
          saida: 0,
          taxa: 0,
          txns: 0,
          datas: [],
          saldo: 0,
        };
      }

      const g = grupos[idJog];
      g.entrada += entrada;
      g.saida += saida;
      g.taxa += taxa;
      g.txns++;
      if (!g.nome && nome) g.nome = nome;
      if (dateStr && !g.datas.includes(dateStr)) g.datas.push(dateStr);
    }

    // Compute saldo and sort by entrada desc
    const result = Object.values(grupos);
    for (const g of result) {
      g.saldo = g.entrada - g.saida;
    }
    result.sort((a, b) => b.entrada - a.entrada);

    return result;
  }

  // ─── Auto-match player ID against player_week_metrics ─────────────
  private matchPlayerId(
    idJog: string,
    players: Array<{ external_player_id: string; nickname: string; agent_id: string; agent_name: string }>,
  ): { entityId: string; entityName: string } | null {
    const cpId = idJog.trim();
    if (!cpId) return null;

    // Tier 1: exact match on external_player_id
    let match = players.find((p) => {
      const sid = String(p.external_player_id || '').trim();
      return sid && sid === cpId;
    });

    // Tier 2: numeric prefix match (e.g. "1610051AG" → "1610051")
    if (!match) {
      const numMatch = cpId.match(/^(\d+)/);
      if (numMatch && numMatch[1].length >= 4) {
        const numPart = numMatch[1];
        match = players.find((p) => {
          const sid = String(p.external_player_id || '').trim();
          return sid && sid === numPart;
        });
      }
    }

    // Tier 3: substring match (both directions, min 5 chars)
    if (!match && cpId.length >= 5) {
      match = players.find((p) => {
        const sid = String(p.external_player_id || '').trim();
        return sid.length >= 5 && (sid.includes(cpId) || cpId.includes(sid));
      });
    }

    if (!match) return null;

    return {
      entityId: match.agent_id || match.external_player_id,
      entityName: match.nickname || match.agent_name || cpId,
    };
  }

  // ─── Upload: parse + auto-match + insert ledger_entries ──────────
  async uploadChipPix(tenantId: string, buffer: Buffer, fileName: string, weekStart: string, clubId?: string) {
    const parsed = this.parseChipPix(buffer);

    if (parsed.length === 0) {
      return { imported: 0, skipped: 0, matched: 0, total_players: 0, transactions: [] };
    }

    // Fetch players for auto-matching (from player_week_metrics for this week)
    let players: Array<{ external_player_id: string; nickname: string; agent_id: string; agent_name: string }> = [];
    if (weekStart) {
      let query = supabaseAdmin
        .from('player_week_metrics')
        .select('external_player_id, nickname, agent_id, agent_name')
        .eq('tenant_id', tenantId)
        .eq('week_start', weekStart);

      if (clubId) query = query.eq('club_id', clubId);

      const { data } = await query;
      players = (data || []).filter((p) => p.external_player_id);
    }

    // Check existing external_refs to avoid duplicates
    const refs = parsed.map((p) => `cp_${p.idJog}`);
    const { data: existing } = await supabaseAdmin
      .from('ledger_entries')
      .select('external_ref')
      .eq('tenant_id', tenantId)
      .eq('source', 'chippix')
      .in('external_ref', refs);

    const existingSet = new Set((existing || []).map((e) => e.external_ref));

    let matched = 0;
    const toInsert = parsed
      .filter((p) => !existingSet.has(`cp_${p.idJog}`))
      .map((p) => {
        // Auto-match
        const matchResult = this.matchPlayerId(p.idJog, players);
        if (matchResult) matched++;

        const saldoLiq = p.entrada - p.saida;

        return {
          tenant_id: tenantId,
          source: 'chippix',
          external_ref: `cp_${p.idJog}`,
          amount: Math.abs(saldoLiq),
          description: `ChipPix · ${p.nome || p.idJog} · ent ${p.entrada.toFixed(2)} − saí ${p.saida.toFixed(2)}${p.taxa > 0 ? ` · taxa ${p.taxa.toFixed(2)}` : ''} · ${p.txns} txns`,
          dir: saldoLiq >= 0 ? 'IN' : 'OUT',
          method: 'chippix',
          entity_id: matchResult?.entityId || `cp_${p.idJog}`,
          entity_name: matchResult?.entityName || p.nome || p.idJog,
          week_start: weekStart || null,
          is_reconciled: false,
        };
      });

    let inserted: ChipPixRow[] = [];
    if (toInsert.length > 0) {
      const { data, error } = await supabaseAdmin.from('ledger_entries').insert(toInsert).select();

      if (error) throw new Error(`Erro ao salvar transações ChipPix: ${error.message}`);
      inserted = (data || []).map((r) => this.enrichRow(r));
    }

    return {
      imported: inserted.length,
      skipped: existingSet.size,
      matched,
      total_players: parsed.length,
      transactions: inserted,
    };
  }

  // ─── Derive virtual status from ledger_entries fields ────────────
  private deriveStatus(row: any): string {
    if (row.source === 'chippix_ignored') return 'ignored';
    if (row.is_reconciled) return 'applied';
    if (row.entity_id) return 'linked';
    return 'pending';
  }

  // ─── Enrich ledger row with virtual fields for frontend compat ──
  private enrichRow(row: any): ChipPixRow {
    return {
      ...row,
      fitid: row.external_ref || row.id,
      memo: row.description,
      status: this.deriveStatus(row),
      bank_name: null,
      category: null,
    };
  }

  // ─── Listar transações ChipPix de uma semana ─────────────────────
  async listTransactions(
    tenantId: string,
    weekStart?: string,
    status?: string,
    page: number = 1,
    limit: number = 100,
  ): Promise<{ data: ChipPixRow[]; total: number }> {
    // When status filter is used, we need JS filtering because status is virtual.
    // Otherwise, push pagination to database.
    if (status) {
      // Virtual status requires fetching all and filtering in JS
      let query = supabaseAdmin
        .from('ledger_entries')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('source', ['chippix', 'chippix_ignored'])
        .order('amount', { ascending: false });

      if (weekStart) query = query.eq('week_start', weekStart);

      const { data, error } = await query;
      if (error) throw new Error(`Erro ao listar ChipPix: ${error.message}`);

      const allRows = (data || []).map((r) => this.enrichRow(r)).filter((r) => r.status === status);
      const total = allRows.length;
      const offset = (page - 1) * limit;
      return { data: allRows.slice(offset, offset + limit), total };
    }

    // No status filter — push pagination to database
    let countQuery = supabaseAdmin
      .from('ledger_entries')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('source', ['chippix', 'chippix_ignored']);

    if (weekStart) countQuery = countQuery.eq('week_start', weekStart);

    const { count: total } = await countQuery;

    const offset = (page - 1) * limit;
    let query = supabaseAdmin
      .from('ledger_entries')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('source', ['chippix', 'chippix_ignored'])
      .order('amount', { ascending: false })
      .range(offset, offset + limit - 1);

    if (weekStart) query = query.eq('week_start', weekStart);

    const { data, error } = await query;
    if (error) throw new Error(`Erro ao listar ChipPix: ${error.message}`);

    return { data: (data || []).map((r) => this.enrichRow(r)), total: total || 0 };
  }

  // ─── Import Extrato → parse + link + insert direto em ledger ────
  async importExtrato(tenantId: string, buffer: Buffer, userId: string): Promise<ChipPixImportResult> {
    // 1. Parse XLSX row-by-row
    const rows = this.parseExtrato(buffer);
    if (rows.length === 0) {
      throw new Error('Planilha vazia — nenhuma operação encontrada');
    }

    // 2. Detect week_start from date range
    const semana = this.detectWeekFromRows(rows);

    // 2b. Validate week against active settlement
    const { data: activeSettlement } = await supabaseAdmin
      .from('settlements')
      .select('week_start')
      .eq('tenant_id', tenantId)
      .eq('status', 'DRAFT')
      .order('week_start', { ascending: false })
      .limit(1)
      .single();

    if (activeSettlement && activeSettlement.week_start !== semana) {
      throw new Error(
        `Semana incorreta. O arquivo é da semana ${semana} mas o fechamento ativo é ${activeSettlement.week_start}. Importe o extrato da semana correta.`,
      );
    }

    // 3. Fetch players for auto-linking (external_id = Id Jogador)
    const { data: players } = await supabaseAdmin
      .from('players')
      .select('id, external_id, nickname, full_name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    const playerMap = new Map<string, { id: string; name: string }>();
    for (const p of players || []) {
      if (p.external_id) {
        playerMap.set(String(p.external_id).trim(), {
          id: p.id,
          name: p.nickname || p.full_name || p.external_id,
        });
      }
    }

    // 4. Collect all external_refs to check for dupes
    const allRefs = rows.flatMap((r) => {
      const refs = [r.idOperacao];
      if (r.taxaOperacao > 0) refs.push(`${r.idOperacao}_fee`);
      return refs;
    });

    const { data: existingEntries } = await supabaseAdmin
      .from('ledger_entries')
      .select('external_ref')
      .eq('tenant_id', tenantId)
      .eq('source', 'chippix')
      .in('external_ref', allRefs);

    const existingRefs = new Set((existingEntries || []).map((e) => e.external_ref));

    // 5. Build inserts + track stats
    let vinculados = 0;
    let duplicados = 0;
    const naoVinculadosMap = new Map<string, NaoVinculado>();
    const toInsert: Record<string, any>[] = [];

    for (const row of rows) {
      // Skip dupes
      if (existingRefs.has(row.idOperacao)) {
        duplicados++;
        continue;
      }

      // Link player
      const player = playerMap.get(String(row.idJogador).trim());
      if (player) {
        vinculados++;
      } else {
        const key = String(row.idJogador).trim();
        if (key && !naoVinculadosMap.has(key)) {
          naoVinculadosMap.set(key, {
            chippix_id: key,
            nome: row.integrante || key,
          });
        }
      }

      // Determine dir + amount
      const isEntrada = row.tipo.toLowerCase().startsWith('entrada');
      const dir = isEntrada ? 'IN' : 'OUT';
      const amount = round2(isEntrada ? row.entradaBruta : row.saidaBruta);

      if (amount > 0) {
        toInsert.push({
          tenant_id: tenantId,
          entity_id: player?.id || null,
          entity_name: player?.name || row.integrante || null,
          week_start: semana,
          dir,
          amount,
          method: 'chippix',
          description: `ChipPix ${row.tipo} · ${row.integrante || row.idJogador}${row.finalidade ? ` · ${row.finalidade}` : ''}`,
          source: 'chippix',
          external_ref: row.idOperacao,
          is_reconciled: false,
          created_by: userId,
        });
      }

      // Fee entry (separate, always OUT)
      if (row.taxaOperacao > 0 && !existingRefs.has(`${row.idOperacao}_fee`)) {
        toInsert.push({
          tenant_id: tenantId,
          entity_id: player?.id || null,
          entity_name: player?.name || row.integrante || null,
          week_start: semana,
          dir: 'OUT',
          amount: round2(row.taxaOperacao),
          method: 'chippix',
          description: 'Taxa operacional Chippix',
          source: 'chippix_fee',
          external_ref: `${row.idOperacao}_fee`,
          is_reconciled: false,
          created_by: userId,
        });
      }
    }

    // 6. Bulk insert
    let inseridos = 0;
    if (toInsert.length > 0) {
      const { data: inserted, error } = await supabaseAdmin.from('ledger_entries').insert(toInsert).select('id');

      if (error) throw new Error(`Erro ao inserir ledger_entries: ${error.message}`);
      inseridos = inserted?.length || 0;
    }

    // 7. Audit
    await supabaseAdmin.from('audit_log').insert({
      tenant_id: tenantId,
      user_id: userId,
      action: 'IMPORT_CHIPPIX_EXTRATO',
      entity_type: 'ledger_entry',
      new_data: { semana, total: rows.length, inseridos, duplicados, vinculados },
    });

    return {
      total: rows.length,
      vinculados,
      nao_vinculados: Array.from(naoVinculadosMap.values()),
      duplicados,
      inseridos,
      semana,
    };
  }

  // ─── Parse extrato XLSX row-by-row ─────────────────────────────────
  private parseExtrato(buffer: Buffer): ChipPixExtratoRow[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames.find((n) => n.toLowerCase().includes('opera')) || workbook.SheetNames[0];

    if (!sheetName) throw new Error('Arquivo XLSX vazio — nenhuma aba encontrada');

    const sheet = workbook.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (data.length < 2) throw new Error('Planilha vazia ou sem dados');

    const header = (data[0] || []).map((h: any) => String(h).trim().toLowerCase());

    // Map columns
    const col = (patterns: string[]) => header.findIndex((h) => patterns.some((p) => h.includes(p)));

    const iData = col(['data']);
    const iTipo = col(['tipo']);
    const iFinalidade = col(['finalidade']);
    const iEntBruta = col(['entrada bruta']);
    const iSaiBruta = col(['saida bruta', 'saída bruta']);
    const iEntLiq = col(['entrada liquida', 'entrada líquida']);
    const iSaiLiq = col(['saida liquida', 'saída líquida']);
    const iIntegrante = col(['integrante']);
    const iTaxa = col(['taxa da opera', 'taxa']);
    const iIdJogador = col(['id jogador']);
    const iIdOperacao = col(['id da opera']);
    const iIdPagamento = col(['id do pagamento']);

    if (iIdJogador < 0) throw new Error('Coluna "Id Jogador" não encontrada');
    if (iIdOperacao < 0) throw new Error('Coluna "Id da operação" não encontrada');
    if (iTipo < 0) throw new Error('Coluna "Tipo" não encontrada');

    const parseNum = (val: any): number => {
      if (val === '' || val === null || val === undefined) return 0;
      return parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0;
    };

    const parseDate = (val: any): string => {
      if (!val) return '';
      if (typeof val === 'number') {
        const d = XLSX.SSF.parse_date_code(val);
        if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
      }
      const s = String(val).trim();
      // DD/MM/YYYY
      const brMatch = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
      if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
      // YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
      return '';
    };

    const rows: ChipPixExtratoRow[] = [];

    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      if (!row || row.length === 0) continue;

      const idOperacao = String(row[iIdOperacao] || '').trim();
      const idJogador = String(row[iIdJogador] || '').trim();
      const tipo = String(row[iTipo] || '').trim();

      // Skip empty rows
      if (!idOperacao || !tipo) continue;

      rows.push({
        data: iData >= 0 ? parseDate(row[iData]) : '',
        tipo,
        finalidade: iFinalidade >= 0 ? String(row[iFinalidade] || '').trim() : '',
        entradaBruta: iEntBruta >= 0 ? parseNum(row[iEntBruta]) : 0,
        saidaBruta: iSaiBruta >= 0 ? parseNum(row[iSaiBruta]) : 0,
        entradaLiquida: iEntLiq >= 0 ? parseNum(row[iEntLiq]) : 0,
        saidaLiquida: iSaiLiq >= 0 ? parseNum(row[iSaiLiq]) : 0,
        integrante: iIntegrante >= 0 ? String(row[iIntegrante] || '').trim() : '',
        taxaOperacao: iTaxa >= 0 ? parseNum(row[iTaxa]) : 0,
        idJogador,
        idOperacao,
        idPagamento: iIdPagamento >= 0 ? String(row[iIdPagamento] || '').trim() : '',
      });
    }

    return rows;
  }

  // ─── Detect week_start from row dates ──────────────────────────────
  private detectWeekFromRows(rows: ChipPixExtratoRow[]): string {
    const dates = rows
      .map((r) => r.data)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();

    if (dates.length === 0) {
      throw new Error('Nenhuma data válida encontrada no arquivo');
    }

    // Use earliest date to find its Monday
    const earliest = new Date(dates[0] + 'T00:00:00Z');
    const day = earliest.getUTCDay(); // 0=dom, 1=seg
    const diff = day === 0 ? -6 : 1 - day;
    earliest.setUTCDate(earliest.getUTCDate() + diff);

    const y = earliest.getUTCFullYear();
    const m = String(earliest.getUTCMonth() + 1).padStart(2, '0');
    const d = String(earliest.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ─── Aplicar vinculadas → marcar is_reconciled = true ───────────
  async applyLinked(tenantId: string, weekStart: string, userId: string) {
    // Records already live in ledger_entries; "apply" = mark reconciled
    const { data, error } = await supabaseAdmin
      .from('ledger_entries')
      .update({ is_reconciled: true })
      .eq('tenant_id', tenantId)
      .eq('source', 'chippix')
      .eq('week_start', weekStart)
      .eq('is_reconciled', false)
      .not('entity_id', 'is', null)
      .select('id');

    if (error) throw new Error(`Erro ao aplicar vinculadas: ${error.message}`);
    const applied = data?.length || 0;

    // Audit
    await supabaseAdmin.from('audit_log').insert({
      tenant_id: tenantId,
      user_id: userId,
      action: 'APPLY_CHIPPIX',
      entity_type: 'ledger_entry',
      new_data: { week_start: weekStart, applied },
    });

    return { applied };
  }

  // ─── Vincular entidade ─────────────────────────────────────────────
  async linkTransaction(tenantId: string, txId: string, entityId: string, entityName: string) {
    const { data, error } = await supabaseAdmin
      .from('ledger_entries')
      .update({ entity_id: entityId, entity_name: entityName })
      .eq('id', txId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw new Error(`Erro ao vincular: ${error.message}`);
    return this.enrichRow(data);
  }

  // ─── Desvincular entidade ──────────────────────────────────────────
  async unlinkTransaction(tenantId: string, txId: string) {
    const { data, error } = await supabaseAdmin
      .from('ledger_entries')
      .update({ entity_id: null, entity_name: null })
      .eq('id', txId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw new Error(`Erro ao desvincular: ${error.message}`);
    return this.enrichRow(data);
  }

  // ─── Ignorar / restaurar ──────────────────────────────────────────
  async ignoreTransaction(tenantId: string, txId: string, ignore: boolean) {
    const newSource = ignore ? 'chippix_ignored' : 'chippix';
    const { data, error } = await supabaseAdmin
      .from('ledger_entries')
      .update({ source: newSource })
      .eq('id', txId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw new Error(`Erro ao atualizar: ${error.message}`);
    return this.enrichRow(data);
  }

  // ─── Parse gross values from memo/description ─────────────────────
  private parseGrossFromMemo(desc: string | null) {
    if (!desc) return { entrada: 0, saida: 0, taxa: 0 };
    const entMatch = desc.match(/ent\s+([\d.]+)/);
    const saiMatch = desc.match(/sa[íi]\s+([\d.]+)/);
    const taxMatch = desc.match(/taxa\s+([\d.]+)/);
    return {
      entrada: entMatch ? parseFloat(entMatch[1]) : 0,
      saida: saiMatch ? parseFloat(saiMatch[1]) : 0,
      taxa: taxMatch ? parseFloat(taxMatch[1]) : 0,
    };
  }

  // ─── Ledger Summary (para verificador de conciliação) ─────────────
  async getLedgerSummary(tenantId: string, weekStart: string) {
    const { data, error } = await supabaseAdmin
      .from('ledger_entries')
      .select('entity_id, dir, amount, source, description')
      .eq('tenant_id', tenantId)
      .eq('week_start', weekStart)
      .in('source', ['chippix', 'chippix_fee', 'chippix_ignored']);

    if (error) throw new Error(`Erro ao buscar ledger summary: ${error.message}`);

    const rows = data || [];
    const playerIds = new Set<string>();
    let entradas = 0;
    let saidas = 0;
    let taxas = 0;

    for (const r of rows) {
      if (r.source === 'chippix_fee') {
        taxas += Number(r.amount);
        continue;
      }
      if (r.source === 'chippix_ignored') continue;
      // source === 'chippix' — parse gross values from description memo
      if (r.entity_id) playerIds.add(r.entity_id);
      const gross = this.parseGrossFromMemo(r.description);
      entradas += gross.entrada;
      saidas += gross.saida;
      taxas += gross.taxa;
    }

    return {
      jogadores: playerIds.size,
      entradas: round2(entradas),
      saidas: round2(saidas),
      impacto: round2(entradas - saidas),
      taxas: round2(taxas),
    };
  }

  // ─── Deletar transação ─────────────────────────────────────────────
  async deleteTransaction(tenantId: string, txId: string) {
    const { data: existing } = await supabaseAdmin
      .from('ledger_entries')
      .select('is_reconciled')
      .eq('id', txId)
      .eq('tenant_id', tenantId)
      .single();

    if (!existing) throw new Error('Transação não encontrada');
    if (existing.is_reconciled) {
      throw new Error('Não é possível excluir transação já aplicada');
    }

    const { error } = await supabaseAdmin.from('ledger_entries').delete().eq('id', txId).eq('tenant_id', tenantId);

    if (error) throw new Error(`Erro ao excluir: ${error.message}`);
    return { id: txId };
  }
}

export const chipPixService = new ChipPixService();
