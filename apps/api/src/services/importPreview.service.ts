// ══════════════════════════════════════════════════════════════════════
//  Import Preview Service — Parse + Validate SEM TOCAR NO BANCO
//
//  Pipeline:
//    1. Recebe XLSX buffer + filename
//    2. Detecta semana automaticamente
//    3. Carrega config do tenant (prefix_map, overrides, player_links)
//    4. Roda parseWorkbook() em memória
//    5. Analisa blockers (agências sem clube, players NONE, etc)
//    6. Retorna preview com summary + blockers + distribuição
//
//  REGRA DE OURO: este serviço NÃO escreve nada no banco.
// ══════════════════════════════════════════════════════════════════════

import XLSX from 'xlsx';
import { supabaseAdmin } from '../config/supabase';
import { detectWeekStart, WeekDetectionResult } from '../utils/detectWeekStart';
import { round2 } from '../utils/round2';

// Importa pacotes core (CommonJS)
const { parseWorkbook, validateReadiness } = require('../../../../packages/importer/coreSuprema');

// ─── Types ──────────────────────────────────────────────────────────

export interface ImportPreviewResponse {
  week: WeekDetectionResult;

  summary: {
    total_players: number;
    total_agents: number;
    total_subclubs: number;
    total_winnings_brl: number;
    total_rake_brl: number;
    total_ggr_brl: number;
  };

  readiness: {
    ready: boolean;
    blockers_count: number;
  };

  blockers: {
    unknown_agencies: Array<{
      agent_name: string;
      agent_id: string;
      detected_prefix: string | null;
      players_count: number;
      sample_players: Array<{ player_id: string; player_name: string }>;
    }>;

    players_without_agency: Array<{
      player_id: string;
      player_name: string;
      original_agent: string;
    }>;
  };

  // Distribuição por subclube (para preview visual)
  subclubs_found: Array<{
    subclub_name: string;
    players_count: number;
    agents_count: number;
    rake_brl: number;
  }>;

  // IDs duplicados detectados (não bloqueante, valores já somados)
  duplicate_players: Array<{
    id: string;
    nick: string;
    count: number;
    merged_ganhos: number;
    merged_rake: number;
  }>;

  // Agentes disponíveis (resolvidos no parse) para dropdown de vinculação
  available_agents: Array<{
    agent_name: string;
    agent_id: string;
    subclub_name: string;
  }>;

  // Warnings (não bloqueantes)
  warnings: string[];
}

// ─── Service ────────────────────────────────────────────────────────

class ImportPreviewService {

  /**
   * Analisa o XLSX e retorna preview SEM PERSISTIR nada.
   */
  async preview(params: {
    tenantId: string;
    fileBuffer: Buffer;
    fileName: string;
    weekStartOverride?: string;  // Se o usuário forçar uma semana
  }): Promise<ImportPreviewResponse> {
    const { tenantId, fileBuffer, fileName, weekStartOverride } = params;

    // 1) Ler o XLSX
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    // 2) Detectar semana automaticamente
    const week = detectWeekStart(workbook, fileName, weekStartOverride);

    // 3) Carregar config do tenant (prefix_map, overrides, player_links, etc)
    const config = await this.loadTenantConfig(tenantId);

    // 4) Carregar subclubes existentes (para saber quais existem)
    const existingSubclubs = await this.loadSubclubs(tenantId);

    // 5) Parse do XLSX (em memória, nada no banco)
    const parseResult = parseWorkbook(workbook, config);

    if (parseResult.error) {
      return {
        week,
        summary: { total_players: 0, total_agents: 0, total_subclubs: 0, total_winnings_brl: 0, total_rake_brl: 0, total_ggr_brl: 0 },
        readiness: { ready: false, blockers_count: 1 },
        blockers: { unknown_agencies: [], players_without_agency: [] },
        subclubs_found: [],
        duplicate_players: [],
        available_agents: [],
        warnings: [`Erro no parse: ${parseResult.error}`],
      };
    }

    // 6) Analisar resultados
    const allPlayers: any[] = parseResult.all || [];
    const warnings: string[] = [];

    // Validação do engine
    const readiness = validateReadiness(parseResult);
    if (readiness.blockers.length > 0) {
      warnings.push(...readiness.blockers.map((b: string) => `Engine: ${b}`));
    }

    // 7) Identificar blockers
    const unknownAgencies = this.findUnknownAgencies(allPlayers);
    const playersWithoutAgency = this.findPlayersWithoutAgency(allPlayers);
    const blockersCount = unknownAgencies.length + playersWithoutAgency.length;

    // 7.5) Duplicados (não bloqueante)
    const duplicatePlayers: ImportPreviewResponse['duplicate_players'] =
      (parseResult.duplicates || []).map((d: any) => ({
        id: d.id,
        nick: d.nick,
        count: d.count,
        merged_ganhos: round2(d.merged_ganhos),
        merged_rake: round2(d.merged_rake),
      }));

    if (duplicatePlayers.length > 0) {
      warnings.push(`${duplicatePlayers.length} ID(s) duplicado(s) encontrado(s) — valores somados automaticamente`);
    }

    // 7.6) Agentes disponíveis (derivados dos jogadores com status ok/auto_resolved)
    const availableAgents = this.findAvailableAgents(allPlayers);

    // 8) Distribuição por subclube
    const subclubsFound = this.buildSubclubDistribution(allPlayers);

    // 9) Summary
    const summary = {
      total_players: allPlayers.length,
      total_agents: new Set(allPlayers.filter((p: any) => p.aname && p.aname !== 'None').map((p: any) => p.aname)).size,
      total_subclubs: subclubsFound.filter(s => s.subclub_name !== '?').length,
      total_winnings_brl: round2(allPlayers.reduce((sum: number, p: any) => sum + (p.ganhos || 0), 0)),
      total_rake_brl: round2(allPlayers.reduce((sum: number, p: any) => sum + (p.rake || 0), 0)),
      total_ggr_brl: round2(allPlayers.reduce((sum: number, p: any) => sum + (p.ggr || 0), 0)),
    };

    return {
      week,
      summary,
      readiness: {
        ready: blockersCount === 0,
        blockers_count: blockersCount,
      },
      blockers: {
        unknown_agencies: unknownAgencies,
        players_without_agency: playersWithoutAgency,
      },
      subclubs_found: subclubsFound,
      duplicate_players: duplicatePlayers,
      available_agents: availableAgents,
      warnings,
    };
  }

  // ─── Análise de Blockers ────────────────────────────────────────

  /**
   * Agentes com status 'unknown_subclub' (têm nome mas prefixo não bate)
   */
  private findUnknownAgencies(players: any[]): ImportPreviewResponse['blockers']['unknown_agencies'] {
    const byAgent = new Map<string, { agentId: string; players: any[] }>();

    for (const p of players) {
      if (p._status === 'unknown_subclub') {
        const key = (p.aname || '').toUpperCase().trim();
        if (!byAgent.has(key)) {
          byAgent.set(key, { agentId: p.aid || '', players: [] });
        }
        byAgent.get(key)!.players.push(p);
      }
    }

    return Array.from(byAgent.entries()).map(([agentName, data]) => {
      // Extrair prefixo detectado (primeira "palavra" do nome do agente)
      const parts = agentName.split(/[\s_-]+/);
      const detectedPrefix = parts.length > 0 ? parts[0] : null;

      return {
        agent_name: agentName,
        agent_id: data.agentId,
        detected_prefix: detectedPrefix,
        players_count: data.players.length,
        sample_players: data.players.slice(0, 5).map((p: any) => ({
          player_id: p.id,
          player_name: p.nick,
        })),
      };
    });
  }

  /**
   * Jogadores com status 'missing_agency' (agent_name = None)
   */
  private findPlayersWithoutAgency(players: any[]): ImportPreviewResponse['blockers']['players_without_agency'] {
    return players
      .filter((p: any) => p._status === 'missing_agency')
      .map((p: any) => ({
        player_id: p.id,
        player_name: p.nick,
        original_agent: p.aname || 'None',
      }));
  }

  /**
   * Distribuição de jogadores por subclube (inclui '?' para não-linkados)
   */
  private buildSubclubDistribution(players: any[]): ImportPreviewResponse['subclubs_found'] {
    const map = new Map<string, { players: Set<string>; agents: Set<string>; rake: number }>();

    for (const p of players) {
      if (p._status === 'ignored') continue;
      const club = p.clube || '?';
      if (!map.has(club)) {
        map.set(club, { players: new Set(), agents: new Set(), rake: 0 });
      }
      const entry = map.get(club)!;
      entry.players.add(p.id);
      if (p.aname && p.aname !== 'None') entry.agents.add(p.aname);
      entry.rake += p.rake || 0;
    }

    return Array.from(map.entries())
      .map(([name, data]) => ({
        subclub_name: name,
        players_count: data.players.size,
        agents_count: data.agents.size,
        rake_brl: round2(data.rake),
      }))
      .sort((a, b) => b.players_count - a.players_count);
  }

  /**
   * Agentes disponíveis extraídos dos jogadores já resolvidos (ok / auto_resolved)
   */
  private findAvailableAgents(players: any[]): ImportPreviewResponse['available_agents'] {
    const agentMap = new Map<string, { agent_id: string; subclub_name: string }>();

    for (const p of players) {
      if (p._status !== 'ok' && p._status !== 'auto_resolved') continue;
      const aname = (p.aname || '').trim();
      if (!aname || /^(none|null|undefined)$/i.test(aname)) continue;

      const key = `${aname}::${p.clube}`;
      if (!agentMap.has(key)) {
        agentMap.set(key, { agent_id: p.aid || '', subclub_name: p.clube || '?' });
      }
    }

    return Array.from(agentMap.entries())
      .map(([key, data]) => ({
        agent_name: key.split('::')[0],
        agent_id: data.agent_id,
        subclub_name: data.subclub_name,
      }))
      .sort((a, b) => a.subclub_name.localeCompare(b.subclub_name) || a.agent_name.localeCompare(b.agent_name));
  }

  // ─── Config do Tenant (reutilizado do import.service) ────────────

  private async loadSubclubs(tenantId: string): Promise<Array<{ id: string; name: string }>> {
    const { data } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('type', 'SUBCLUB')
      .eq('is_active', true)
      .order('name');

    return data || [];
  }

  async loadTenantConfig(tenantId: string) {
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
}

export const importPreviewService = new ImportPreviewService();
