// ══════════════════════════════════════════════════════════════════════
//  Import Confirm Service — Persiste settlement + métricas
//
//  Pipeline (SÓ chamado depois do preview estar ready=true):
//    1. Recebe XLSX + weekStart confirmado
//    2. Re-executa parse + validate (guardrail: recusa se não ready)
//    3. Cria import record
//    4. Upload para Supabase Storage
//    5. Upsert players
//    6. Calcula semana (calculateWeek)
//    7. Cria settlement (DRAFT) — com versionamento (v2, v3 se reimport)
//    8. Persiste player_week_metrics + agent_week_metrics
//    9. Retorna settlement_id
//
//  GUARDRAIL: retorna 409 se houver blockers (agências sem clube, etc)
// ══════════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import XLSX from 'xlsx';
import { supabaseAdmin } from '../config/supabase';
import { importPreviewService } from './importPreview.service';
import { round2 } from '../utils/round2';

// Importa pacotes core (CommonJS)
const { parseWorkbook, validateReadiness } = require('../../../../packages/importer/coreSuprema');
const { calculateWeek } = require('../../../../packages/engine/calculateWeek');

// Mapa: nome do subclube → UUID da organization
type OrgNameMap = Record<string, string>;

export interface ConfirmResult {
  import_id: string;
  settlement_id: string;
  settlement_version: number;
  status: 'ok' | 'error';
  player_count: number;
  agent_count: number;
  club_count: number;
  warnings: string[];
}

interface ConfirmOptions {
  tenantId: string;
  clubId: string;
  weekStart: string;       // YYYY-MM-DD confirmado pelo usuário
  fileName: string;
  fileBuffer: Buffer;
  uploadedBy: string;
}

class ImportConfirmService {

  async confirm(opts: ConfirmOptions): Promise<ConfirmResult> {
    const { tenantId, clubId, weekStart, fileName, fileBuffer, uploadedBy } = opts;
    const warnings: string[] = [];

    // ── 1) Re-parse + Validate (guardrail) ────────────────────────

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const config = await importPreviewService.loadTenantConfig(tenantId);
    const parseResult = parseWorkbook(workbook, config);

    if (parseResult.error) {
      throw new ConfirmError(400, `Erro no parse: ${parseResult.error}`);
    }

    // Verificar blockers
    const allPlayers: any[] = parseResult.all || [];
    const hasUnknown = allPlayers.some((p: any) => p._status === 'unknown_subclub');
    const hasMissing = allPlayers.some((p: any) => p._status === 'missing_agency');

    if (hasUnknown || hasMissing) {
      const unknownCount = allPlayers.filter((p: any) => p._status === 'unknown_subclub').length;
      const missingCount = allPlayers.filter((p: any) => p._status === 'missing_agency').length;
      throw new ConfirmError(409, `Ainda há pendências: ${unknownCount} agência(s) sem clube, ${missingCount} jogador(es) sem agência. Resolva antes de confirmar.`);
    }

    // ── 2) Dedup + Upload para Storage ────────────────────────────

    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Verificar se já existe import com mesmo hash
    const { data: existing } = await supabaseAdmin
      .from('imports')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('file_hash', fileHash)
      .maybeSingle();

    let importId: string;

    if (existing) {
      // Reimport — marcar o anterior como superseded
      importId = existing.id;
      // Limpar métricas e settlement antigos deste import
      await this.cleanPreviousImport(tenantId, importId);
    } else {
      // Novo import
      importId = crypto.randomUUID();
    }

    // Upload para storage
    const storagePath = `${tenantId}/${weekStart}/${fileHash}_${fileName}`;
    const { error: storageError } = await supabaseAdmin.storage
      .from('imports')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });

    if (storageError) {
      warnings.push(`Upload para storage falhou: ${storageError.message}`);
    }

    // Criar/atualizar registro de import
    const { error: importError } = await supabaseAdmin
      .from('imports')
      .upsert({
        id: importId,
        tenant_id: tenantId,
        club_id: clubId,
        week_start: weekStart,
        file_name: fileName,
        file_hash: fileHash,
        file_path: storagePath,
        uploaded_by: uploadedBy,
        status: 'PROCESSING',
        row_count: 0,
        player_count: 0,
      }, {
        onConflict: 'id',
      });

    if (importError) {
      throw new ConfirmError(500, `Erro ao criar import: ${importError.message}`);
    }

    try {
      // ── 3) Upsert players ─────────────────────────────────────────

      await this.upsertPlayers(tenantId, allPlayers);

      // ── 4) Build maps ─────────────────────────────────────────────

      const playerUuidMap = await this.buildPlayerUuidMap(tenantId);
      const orgNameMap = await this.buildOrgNameToIdMap(tenantId);

      // ── 5) Load rates ─────────────────────────────────────────────

      const rates = await this.loadRates(tenantId, weekStart);

      // ── 6) Calculate week ─────────────────────────────────────────

      const weekResult = calculateWeek(allPlayers, rates);

      // ── 7) Create or reuse settlement (merge mode) ────────────────

      // Check for existing DRAFT settlement for this week
      const { data: existingSettlements } = await supabaseAdmin
        .from('settlements')
        .select('id, version, status')
        .eq('tenant_id', tenantId)
        .eq('week_start', weekStart)
        .eq('status', 'DRAFT')
        .order('version', { ascending: false })
        .limit(1);

      const existingDraft = existingSettlements?.[0] || null;

      let settlementId: string;
      let version: number;

      if (existingDraft) {
        // MERGE MODE: reuse existing settlement
        settlementId = existingDraft.id;
        version = existingDraft.version;

        // Determine which subclubs are in the NEW file
        const newSubclubNames = new Set<string>();
        for (const p of allPlayers) {
          if (p.clube) newSubclubNames.add(p.clube);
        }

        // ── Delete existing metrics ONLY for subclubs in the new file ──
        //
        // The unique constraints are per (settlement, entity, subclub_name),
        // so we only need to clear the subclubs being replaced.
        // Data from other subclubs (imported earlier) is preserved.
        if (newSubclubNames.size > 0) {
          const subclubArray = Array.from(newSubclubNames);
          await supabaseAdmin
            .from('player_week_metrics')
            .delete()
            .eq('settlement_id', settlementId)
            .in('subclub_name', subclubArray);

          await supabaseAdmin
            .from('agent_week_metrics')
            .delete()
            .eq('settlement_id', settlementId)
            .in('subclub_name', subclubArray);
        }

        // Update settlement metadata
        await supabaseAdmin
          .from('settlements')
          .update({ import_id: importId, inputs_hash: fileHash })
          .eq('id', settlementId);

        warnings.push(`Dados mesclados com settlement existente (v${version}). Subclubes atualizados: ${Array.from(newSubclubNames).join(', ')}`);
      } else {
        // NEW settlement
        version = await this.getNextVersion(tenantId, weekStart);

        // Se ha versao anterior nao-DRAFT (FINAL/VOID), incrementa versao
        const { data: settlement, error: settlError } = await supabaseAdmin
          .from('settlements')
          .insert({
            tenant_id: tenantId,
            club_id: clubId,
            week_start: weekStart,
            version,
            status: 'DRAFT',
            import_id: importId,
            inputs_hash: fileHash,
          })
          .select('id')
          .single();

        if (settlError || !settlement) {
          throw new Error(`Erro ao criar settlement: ${settlError?.message}`);
        }
        settlementId = settlement.id;
      }

      // ── 8) Persist metrics ────────────────────────────────────────

      await this.persistPlayerMetrics(tenantId, settlementId, weekStart, weekResult.allPlayers, playerUuidMap, orgNameMap);
      const agentCount = await this.persistAgentMetrics(tenantId, settlementId, weekStart, weekResult.clubs, orgNameMap);

      // ── 9) Mark import as DONE ────────────────────────────────────

      await supabaseAdmin
        .from('imports')
        .update({
          status: 'DONE',
          row_count: parseResult.meta?.totalRows || allPlayers.length,
          player_count: allPlayers.length,
          processed_at: new Date().toISOString(),
        })
        .eq('id', importId);

      return {
        import_id: importId,
        settlement_id: settlementId,
        settlement_version: version,
        status: 'ok',
        player_count: allPlayers.length,
        agent_count: agentCount,
        club_count: weekResult.totals?.clubs || 0,
        warnings,
      };

    } catch (err: any) {
      await supabaseAdmin
        .from('imports')
        .update({ status: 'ERROR', error_message: err.message })
        .eq('id', importId);
      throw err;
    }
  }

  // ─── Helpers (reutilizados do import.service original) ──────────

  private async cleanPreviousImport(tenantId: string, importId: string) {
    // Buscar settlement deste import
    const { data: settlements } = await supabaseAdmin
      .from('settlements')
      .select('id')
      .eq('import_id', importId);

    for (const s of (settlements || [])) {
      await supabaseAdmin.from('player_week_metrics').delete().eq('settlement_id', s.id);
      await supabaseAdmin.from('agent_week_metrics').delete().eq('settlement_id', s.id);
    }

    await supabaseAdmin.from('settlements').delete().eq('import_id', importId);
  }

  private async getNextVersion(tenantId: string, weekStart: string): Promise<number> {
    const { data } = await supabaseAdmin
      .from('settlements')
      .select('version')
      .eq('tenant_id', tenantId)
      .eq('week_start', weekStart)
      .order('version', { ascending: false })
      .limit(1);

    if (!data || data.length === 0) return 1;
    return (data[0].version || 0) + 1;
  }

  private async upsertPlayers(tenantId: string, players: any[]) {
    const uniquePlayers = new Map<string, { external_id: string; nickname: string }>();
    for (const p of players) {
      if (!uniquePlayers.has(p.id)) {
        uniquePlayers.set(p.id, { external_id: p.id, nickname: p.nick || p.id });
      }
    }

    const rows = Array.from(uniquePlayers.values()).map(p => ({
      tenant_id: tenantId,
      external_id: p.external_id,
      nickname: p.nickname,
    }));

    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabaseAdmin
        .from('players')
        .upsert(batch, { onConflict: 'tenant_id,external_id', ignoreDuplicates: false });
      if (error) console.error(`[confirm] Erro upsert players batch ${i}:`, error);
    }
  }

  private async buildPlayerUuidMap(tenantId: string): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    const { data } = await supabaseAdmin.from('players').select('id, external_id').eq('tenant_id', tenantId);
    (data || []).forEach(p => { map[p.external_id] = p.id; });
    return map;
  }

  private async buildOrgNameToIdMap(tenantId: string): Promise<OrgNameMap> {
    const map: OrgNameMap = {};
    const { data } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .in('type', ['SUBCLUB', 'AGENT']);

    (data || []).forEach(org => {
      map[org.name] = org.id;
      map[org.name.toUpperCase()] = org.id;
    });
    return map;
  }

  private async loadRates(tenantId: string, weekStart: string) {
    const { data: playerRateRows } = await supabaseAdmin
      .from('player_rb_rates')
      .select('player_id, rate, players!inner(external_id, nickname)')
      .eq('tenant_id', tenantId)
      .lte('effective_from', weekStart)
      .or(`effective_to.is.null,effective_to.gte.${weekStart}`);

    const playerRates: Record<string, number> = {};
    (playerRateRows || []).forEach((r: any) => {
      if (r.players?.external_id) playerRates[r.players.external_id] = Number(r.rate);
      if (r.players?.nickname) playerRates[r.players.nickname] = Number(r.rate);
    });

    const { data: agentRateRows } = await supabaseAdmin
      .from('agent_rb_rates')
      .select('rate, organizations!inner(name)')
      .eq('tenant_id', tenantId)
      .lte('effective_from', weekStart)
      .or(`effective_to.is.null,effective_to.gte.${weekStart}`);

    const agentRates: Record<string, number> = {};
    (agentRateRows || []).forEach((r: any) => {
      if (r.organizations?.name) agentRates[r.organizations.name] = Number(r.rate);
    });

    return { playerRates, agentRates };
  }

  private async persistPlayerMetrics(
    tenantId: string, settlementId: string, weekStart: string,
    allPlayers: any[], playerUuidMap: Record<string, string>, orgNameMap: OrgNameMap
  ) {
    const rows = allPlayers.map(p => ({
      settlement_id: settlementId,
      tenant_id: tenantId,
      week_start: weekStart,
      player_id: playerUuidMap[p.id] || playerUuidMap[p.externalId] || null,
      external_player_id: p.id,
      nickname: p.nick,
      external_agent_id: p.agentId || '',
      agent_name: p.agentName || '',
      subclub_name: p.clube || null,
      subclub_id: orgNameMap[p.clube] || orgNameMap[(p.clube || '').toUpperCase()] || null,
      winnings_brl: round2(p.ganhos || 0),
      rake_total_brl: round2(p.rake || 0),
      ggr_brl: round2(p.ggr || 0),
      rb_rate: p.rbRate || 0,
      rb_value_brl: round2(p.rbValor || 0),
      resultado_brl: round2(p.resultado || 0),
      games: 0,
      hands: 0,
      rake_breakdown: p.rakeBreakdown || {},
    }));

    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabaseAdmin.from('player_week_metrics').insert(batch);
      if (error) {
        // If unique constraint violation, clean up conflicting rows and retry
        if (error.code === '23505') {
          console.warn(`[confirm] Constraint conflict in player_metrics batch ${i}, cleaning up overlapping players...`);
          const extIds = batch.map(r => r.external_player_id).filter(Boolean);
          if (extIds.length > 0) {
            await supabaseAdmin.from('player_week_metrics').delete()
              .eq('settlement_id', settlementId).in('external_player_id', extIds);
          }
          const { error: retryErr } = await supabaseAdmin.from('player_week_metrics').insert(batch);
          if (retryErr) {
            console.error(`[confirm] Retry failed for player_metrics batch ${i}:`, retryErr);
            throw retryErr;
          }
        } else {
          console.error(`[confirm] Erro insert player_metrics batch ${i}:`, error);
          throw error;
        }
      }
    }
  }

  private async persistAgentMetrics(
    tenantId: string, settlementId: string, weekStart: string,
    clubs: Record<string, any>, orgNameMap: OrgNameMap
  ): Promise<number> {
    const rows: any[] = [];

    for (const [clubName, club] of Object.entries(clubs)) {
      const subclubId = orgNameMap[clubName] || orgNameMap[clubName.toUpperCase()] || null;

      for (const agent of (club as any).agents || []) {
        rows.push({
          settlement_id: settlementId,
          tenant_id: tenantId,
          week_start: weekStart,
          agent_id: orgNameMap[agent.agentName] || null,
          agent_name: agent.agentName,
          subclub_name: clubName,
          subclub_id: subclubId,
          player_count: agent.playerCount,
          rake_total_brl: round2(agent.rakeTime || 0),
          ganhos_total_brl: round2(agent.ganhosTime || 0),
          ggr_total_brl: round2(
            (agent.players || []).reduce((s: number, p: any) => s + (Number(p.ggr) || 0), 0)
          ),
          rb_rate: agent.agentRate || 0,
          commission_brl: round2(agent.rbAgente || 0),
          resultado_brl: round2(agent.resultadoAgente || 0),
        });
      }
    }

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from('agent_week_metrics').insert(rows);
      if (error) {
        // If unique constraint violation, clean up conflicting rows and retry
        if (error.code === '23505') {
          console.warn('[confirm] Constraint conflict in agent_metrics, cleaning up overlapping agents...');
          const agentNames = rows.map(r => r.agent_name).filter(Boolean);
          if (agentNames.length > 0) {
            await supabaseAdmin.from('agent_week_metrics').delete()
              .eq('settlement_id', settlementId).in('agent_name', agentNames);
          }
          const { error: retryErr } = await supabaseAdmin.from('agent_week_metrics').insert(rows);
          if (retryErr) {
            console.error('[confirm] Retry failed for agent_metrics:', retryErr);
            throw retryErr;
          }
        } else {
          console.error('[confirm] Erro insert agent_metrics:', error);
          throw error;
        }
      }
    }

    return rows.length;
  }
}

// ─── Custom Error ────────────────────────────────────────────────

export class ConfirmError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const importConfirmService = new ImportConfirmService();
