// ══════════════════════════════════════════════════════════════════════
//  Import Service — Upload, parse e processamento de XLSX
//
//  Pipeline:
//    1. Upload XLSX → Supabase Storage
//    2. Parse com coreSuprema.parseWorkbook()
//    3. Upsert players no banco
//    4. Calcular com calculateWeek()
//    5. Criar settlement DRAFT + persistir métricas
//
//  PR2 fixes:
//    - subclub_name + subclub_id populados em todas as métricas
//    - agent_id resolvido via organizations table
//    - round2() aplicado em todos os valores monetários
// ══════════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import XLSX from 'xlsx';
import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';
import type { ImportProcessResult } from '../types';
import { round2 } from '../utils/round2';

// Importa os pacotes core (CommonJS) — eslint-disable necessário pois são módulos CJS sem typing
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseWorkbook, validateReadiness } = require('../../../../packages/importer/coreSuprema');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { calculateWeek } = require('../../../../packages/engine/calculateWeek');

interface ProcessOptions {
  tenantId: string;
  clubId: string;
  weekStart: string; // YYYY-MM-DD
  fileName: string;
  fileBuffer: Buffer;
  uploadedBy: string;
}

// Mapa: nome do subclube → UUID da organization
type OrgNameMap = Record<string, string>;

export class ImportService {
  // ─── Pipeline principal ──────────────────────────────────────────
  async processImport(opts: ProcessOptions): Promise<ImportProcessResult> {
    const { tenantId, clubId, weekStart, fileName, fileBuffer, uploadedBy } = opts;
    const warnings: string[] = [];

    // 1) Hash do arquivo para idempotência
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Verificar duplicata
    const { data: existing } = await supabaseAdmin
      .from('imports')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('file_hash', fileHash)
      .single();

    if (existing) {
      return {
        import_id: existing.id,
        settlement_id: '',
        status: 'error',
        player_count: 0,
        agent_count: 0,
        club_count: 0,
        unlinked_count: 0,
        warnings: [],
        blockers: [`Arquivo já importado (import_id: ${existing.id}, status: ${existing.status})`],
      };
    }

    // 2) Upload para Storage
    const storagePath = `${tenantId}/${weekStart}/${fileHash}_${fileName}`;
    const { error: storageError } = await supabaseAdmin.storage
      .from(env.STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: false,
      });

    if (storageError) {
      console.error('[import] Erro no upload:', storageError);
      warnings.push(`Upload para storage falhou: ${storageError.message}`);
    }

    // 3) Criar registro de import
    const { data: importRow, error: importError } = await supabaseAdmin
      .from('imports')
      .insert({
        tenant_id: tenantId,
        club_id: clubId,
        week_start: weekStart,
        file_name: fileName,
        file_path: storagePath,
        file_hash: fileHash,
        status: 'PROCESSING',
        uploaded_by: uploadedBy,
      })
      .select('id')
      .single();

    if (importError || !importRow) {
      throw new Error(`Erro ao criar import: ${importError?.message}`);
    }

    const importId = importRow.id;

    try {
      // 4) Parse do XLSX
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const config = await this.loadTenantConfig(tenantId);
      const parseResult = parseWorkbook(workbook, config);

      if (parseResult.error) {
        await this.markImportError(importId, parseResult.error);
        return {
          import_id: importId,
          settlement_id: '',
          status: 'error',
          player_count: 0,
          agent_count: 0,
          club_count: 0,
          unlinked_count: 0,
          warnings,
          blockers: [parseResult.error],
        };
      }

      // 5) Validar prontidão
      const readiness = validateReadiness(parseResult);
      if (readiness.blockers.length > 0) {
        warnings.push(...readiness.blockers.map((b: string) => `⚠️ ${b}`));
      }

      // 6) Upsert players no banco
      await this.upsertPlayers(tenantId, parseResult.all);

      // 6b) Buscar mapas de resolução
      const playerUuidMap = await this.buildPlayerUuidMap(tenantId);
      const orgNameMap = await this.buildOrgNameToIdMap(tenantId);

      // 7) Buscar rates do banco
      const rates = await this.loadRates(tenantId, weekStart);

      // 8) Calcular semana com o engine
      const weekResult = calculateWeek(parseResult.all, rates);

      // 9) Criar settlement DRAFT
      const { data: settlement, error: settlError } = await supabaseAdmin
        .from('settlements')
        .insert({
          tenant_id: tenantId,
          club_id: clubId,
          week_start: weekStart,
          version: 1,
          status: 'DRAFT',
          import_id: importId,
          inputs_hash: fileHash,
        })
        .select('id')
        .single();

      if (settlError || !settlement) {
        throw new Error(`Erro ao criar settlement: ${settlError?.message}`);
      }

      // 10) Persistir métricas por player (com subclub_name + subclub_id + week_start + round2)
      await this.persistPlayerMetrics(
        tenantId,
        settlement.id,
        weekStart,
        weekResult.allPlayers,
        playerUuidMap,
        orgNameMap,
      );

      // 11) Persistir métricas por agente (com agent_id + subclub_name + subclub_id + week_start + round2)
      const agentCount = await this.persistAgentMetrics(
        tenantId,
        settlement.id,
        weekStart,
        weekResult.clubs,
        orgNameMap,
      );

      // 12) Marcar import como DONE
      await supabaseAdmin
        .from('imports')
        .update({
          status: 'DONE',
          row_count: parseResult.meta.totalRows,
          player_count: parseResult.all.length,
          processed_at: new Date().toISOString(),
        })
        .eq('id', importId);

      // Contar jogadores sem vínculo
      const unlinkedCount = parseResult.all.filter((p: any) => p.clube === '?' || !p.clube).length;

      if (unlinkedCount > 0) {
        warnings.push(
          `${unlinkedCount} jogador${unlinkedCount !== 1 ? 'es' : ''} sem clube atribuído. Vincule na página "Vincular" e reimporte.`,
        );
      }

      return {
        import_id: importId,
        settlement_id: settlement.id,
        status: readiness.blockers.length > 0 ? 'partial' : unlinkedCount > 0 ? 'partial' : 'ok',
        player_count: parseResult.all.length,
        agent_count: agentCount,
        club_count: weekResult.totals.clubs,
        unlinked_count: unlinkedCount,
        warnings,
        blockers: readiness.blockers,
      };
    } catch (err: any) {
      await this.markImportError(importId, err.message);
      throw err;
    }
  }

  // ─── Helpers privados ────────────────────────────────────────────

  /**
   * Busca mapa de nome da organização → UUID
   * Ex: { 'IMPERIO': 'b000...0010', 'TGP': 'b000...0011', ... }
   */
  private async buildOrgNameToIdMap(tenantId: string): Promise<OrgNameMap> {
    const map: OrgNameMap = {};
    const { data } = await supabaseAdmin
      .from('organizations')
      .select('id, name, type')
      .eq('tenant_id', tenantId)
      .in('type', ['SUBCLUB', 'AGENT']);

    (data || []).forEach((org) => {
      // Normaliza: nome uppercase para matching com engine output
      map[org.name] = org.id;
      map[org.name.toUpperCase()] = org.id;
    });

    return map;
  }

  private async loadTenantConfig(tenantId: string) {
    // Buscar prefix rules
    const { data: prefixRows } = await supabaseAdmin
      .from('agent_prefix_map')
      .select('prefix, subclub_id, organizations!inner(name)')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('priority', { ascending: false });

    const prefixMap: Record<string, string[]> = {};
    (prefixRows || []).forEach((r: any) => {
      const clube = r.organizations?.name || '?';
      if (!prefixMap[clube]) prefixMap[clube] = [];
      prefixMap[clube].push(r.prefix);
    });

    const prefixRules = Object.entries(prefixMap).map(([clube, prefixes]) => ({
      prefixes,
      clube,
    }));

    // Buscar agent overrides
    const { data: overrideRows } = await supabaseAdmin
      .from('agent_overrides')
      .select('external_agent_id, agent_name, subclub_id, organizations!inner(name)')
      .eq('tenant_id', tenantId);

    const agentOverrides: Record<string, { subclube: string; agentName: string }> = {};
    (overrideRows || []).forEach((r: any) => {
      agentOverrides[r.external_agent_id] = {
        subclube: r.organizations?.name || '?',
        agentName: r.agent_name || '',
      };
    });

    // Buscar manual links (agente por nome → subclube)
    const { data: manualLinkRows } = await supabaseAdmin
      .from('agent_manual_links')
      .select('agent_name, subclub_id, organizations!inner(name)')
      .eq('tenant_id', tenantId);

    const manualLinks: Record<string, string> = {};
    (manualLinkRows || []).forEach((r: any) => {
      const clube = r.organizations?.name || '?';
      manualLinks[r.agent_name.toUpperCase().trim()] = clube;
    });

    // Buscar player links (jogador individual → agente + subclube)
    const { data: playerLinkRows } = await supabaseAdmin
      .from('player_links')
      .select('external_player_id, agent_external_id, agent_name, subclub_id, organizations!inner(name)')
      .eq('tenant_id', tenantId);

    const playerLinks: Record<string, { agentId: string; agentName: string; subclube: string }> = {};
    (playerLinkRows || []).forEach((r: any) => {
      const clube = r.organizations?.name || '?';
      playerLinks[r.external_player_id] = {
        agentId: r.agent_external_id || '',
        agentName: r.agent_name || '',
        subclube: clube,
      };
    });

    return {
      agentOverrides,
      manualLinks,
      prefixRules,
      playerLinks,
      ignoredAgents: {},
    };
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

  private async upsertPlayers(tenantId: string, players: any[]) {
    const uniquePlayers = new Map<string, { external_id: string; nickname: string }>();

    for (const p of players) {
      if (!uniquePlayers.has(p.id)) {
        uniquePlayers.set(p.id, {
          external_id: p.id,
          nickname: p.nick || p.id,
        });
      }
    }

    const rows = Array.from(uniquePlayers.values()).map((p) => ({
      tenant_id: tenantId,
      external_id: p.external_id,
      nickname: p.nickname,
    }));

    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabaseAdmin.from('players').upsert(batch, {
        onConflict: 'tenant_id,external_id',
        ignoreDuplicates: false,
      });

      if (error) {
        console.error(`[import] Erro upsert players batch ${i}:`, error);
      }
    }
  }

  private async buildPlayerUuidMap(tenantId: string): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    const { data } = await supabaseAdmin
      .from('players')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .limit(50000);

    (data || []).forEach((p) => {
      map[p.external_id] = p.id;
    });

    return map;
  }

  /**
   * Persiste player_week_metrics COM:
   *   - subclub_name (cache do engine output p.clube)
   *   - subclub_id (FK resolvida via orgNameMap)
   *   - round2() em todos os valores monetários
   */
  private async persistPlayerMetrics(
    tenantId: string,
    settlementId: string,
    weekStart: string,
    allPlayers: any[],
    playerUuidMap: Record<string, string>,
    orgNameMap: OrgNameMap,
  ) {
    const rows = allPlayers.map((p) => ({
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
      // round2 em todos os valores monetários
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
        console.error(`[import] Erro insert player_metrics batch ${i}:`, error);
        throw error;
      }
    }
  }

  /**
   * Persiste agent_week_metrics COM:
   *   - agent_id resolvido via orgNameMap (não mais null!)
   *   - subclub_name (= clubName do engine, que é o nome do subclube)
   *   - subclub_id (FK resolvida via orgNameMap)
   *   - round2() em todos os valores monetários
   */
  private async persistAgentMetrics(
    tenantId: string,
    settlementId: string,
    weekStart: string,
    clubs: Record<string, any>,
    orgNameMap: OrgNameMap,
  ): Promise<number> {
    const rows: any[] = [];

    for (const [clubName, club] of Object.entries(clubs)) {
      // clubName = nome do subclube (IMPERIO, TGP, etc.) — output do engine
      const subclubId = orgNameMap[clubName] || orgNameMap[clubName.toUpperCase()] || null;

      for (const agent of (club as any).agents || []) {
        rows.push({
          settlement_id: settlementId,
          tenant_id: tenantId,
          week_start: weekStart,
          // Resolver agent_id: tenta pelo nome no orgNameMap
          agent_id: orgNameMap[agent.agentName] || null,
          agent_name: agent.agentName,
          subclub_name: clubName,
          subclub_id: subclubId,
          player_count: agent.playerCount,
          // round2 em todos os valores monetários
          rake_total_brl: round2(agent.rakeTime || 0),
          ganhos_total_brl: round2(agent.ganhosTime || 0),
          ggr_total_brl: round2((agent.players || []).reduce((s: number, p: any) => s + (Number(p.ggr) || 0), 0)),
          rb_rate: agent.agentRate || 0,
          commission_brl: round2(agent.rbAgente || 0),
          resultado_brl: round2(agent.resultadoAgente || 0),
        });
      }
    }

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from('agent_week_metrics').insert(rows);

      if (error) {
        console.error('[import] Erro insert agent_metrics:', error);
        throw error;
      }
    }

    return rows.length;
  }

  private async markImportError(importId: string, message: string) {
    await supabaseAdmin.from('imports').update({ status: 'ERROR', error_message: message }).eq('id', importId);
  }
}

export const importService = new ImportService();
