'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import html2canvas from 'html2canvas';
import { listLedger, getCarryForward, formatBRL, listPlayers, sendWhatsApp } from '@/lib/api';
import { round2 } from '@/lib/formatters';
import { useToast } from '@/components/Toast';
import { AgentMetric, PlayerMetric, LedgerEntry } from '@/types/settlement';
import SettlementSkeleton from '@/components/ui/SettlementSkeleton';
import { Users } from 'lucide-react';
import KpiCard from '@/components/ui/KpiCard';

interface Props {
  subclub: {
    id: string;
    name: string;
    agents: AgentMetric[];
    players: PlayerMetric[];
  };
  weekStart: string;
  clubId: string;
  fees: Record<string, number>;
  logoUrl?: string | null;
}

// ─── Computed Agent Data ─────────────────────────────────────────────

interface AgentFinancials {
  agent: AgentMetric;
  players: PlayerMetric[];
  entries: LedgerEntry[];
  ganhos: number;
  rakeTotal: number;
  rbAgente: number;
  resultado: number;
  saldoAnterior: number;
  totalDevido: number;
  totalIn: number;
  totalOut: number;
  pago: number;
  pendente: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function fmtDate(dt: string): string {
  return new Date(dt + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function fmtDateTime(dt: string): string {
  return new Date(dt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function clr(v: number): string {
  return v > 0.01 ? 'text-emerald-400' : v < -0.01 ? 'text-red-400' : 'text-dark-400';
}

function clrPrint(v: number): string {
  return v > 0.01
    ? 'text-emerald-400 print:text-green-700'
    : v < -0.01
      ? 'text-red-400 print:text-red-700'
      : 'text-dark-400 print:text-gray-500';
}

// ─── Component ──────────────────────────────────────────────────────

export default function Comprovantes({ subclub, weekStart, clubId, logoUrl }: Props) {
  const agents = subclub.agents || [];
  const players = subclub.players || [];
  const { toast } = useToast();

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [carryMap, setCarryMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'agencias' | 'diretos'>('agencias');
  const [searchTerm, setSearchTerm] = useState('');
  const [resultFilter, setResultFilter] = useState<'all' | 'pagar' | 'receber' | 'zero'>('all');
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [selectedAgent, setSelectedAgent] = useState<AgentFinancials | null>(null);
  const [fechamentoTipo, setFechamentoTipo] = useState<'avista' | 'profitloss'>('profitloss');
  const [hidePlayers, setHidePlayers] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Load ledger entries + carry-forward
  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const [ledgerRes, carryRes] = await Promise.all([listLedger(weekStart), getCarryForward(weekStart, clubId)]);
      if (!mountedRef.current) return;
      if (ledgerRes.success) setEntries(ledgerRes.data || []);
      if (carryRes.success) setCarryMap(carryRes.data || {});
    } catch {
      if (!mountedRef.current) return;
      toast('Erro ao carregar comprovantes', 'error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [weekStart, clubId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Build direct set from backend-annotated is_direct flag (single source of truth)
  // Same logic as Jogadores.tsx: agent.is_direct + player.agent_is_direct + SEM AGENTE
  const directNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const a of agents) {
      if (a.is_direct) set.add(a.agent_name.toLowerCase());
    }
    for (const p of players) {
      if (p.agent_is_direct) set.add((p.agent_name || '').toLowerCase());
    }
    set.add('sem agente');
    set.add('(sem agente)');
    return set;
  }, [agents, players]);

  // Group players by agent name
  const playersByAgent = useMemo(() => {
    const map = new Map<string, PlayerMetric[]>();
    for (const p of players) {
      const key = p.agent_name || 'SEM AGENTE';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [players]);

  // Group ledger by entity_id
  const ledgerByEntity = useMemo(() => {
    const map = new Map<string, LedgerEntry[]>();
    for (const e of entries) {
      if (!map.has(e.entity_id)) map.set(e.entity_id, []);
      map.get(e.entity_id)!.push(e);
    }
    return map;
  }, [entries]);

  // Week end
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().split('T')[0];
  }, [weekStart]);

  // Compute financial data for each agent
  const agentFinancials: AgentFinancials[] = useMemo(() => {
    return agents.map((rawAgent) => {
      // Use backend-annotated is_direct (already set by settlement service)
      const agent = { ...rawAgent, is_direct: directNameSet.has(rawAgent.agent_name.toLowerCase()) };
      const agPlayers = (playersByAgent.get(agent.agent_name) || []).sort((a, b) =>
        (a.nickname || '').localeCompare(b.nickname || ''),
      );

      // Resolve ledger entries — match by agent IDs + all player-level keys
      // (mirrors backend settlement.service.ts broad-matching logic)
      const seen = new Set<string>();
      const agEntries: LedgerEntry[] = [];
      function add(list: LedgerEntry[] | undefined) {
        if (!list) return;
        for (const e of list) {
          if (!seen.has(e.id)) {
            seen.add(e.id);
            agEntries.push(e);
          }
        }
      }
      // Agent-level keys
      add(ledgerByEntity.get(agent.id));
      if (agent.agent_id) add(ledgerByEntity.get(agent.agent_id));
      // Player-level keys (ChipPix stores as cp_<id>, OFX by player_id, etc.)
      for (const p of agPlayers) {
        if (p.id) add(ledgerByEntity.get(p.id));
        if (p.player_id) add(ledgerByEntity.get(p.player_id));
        if (p.external_player_id) {
          const eid = String(p.external_player_id);
          add(ledgerByEntity.get(eid));
          add(ledgerByEntity.get(`cp_${eid}`));
        }
      }

      const ganhos = Number(agent.ganhos_total_brl) || 0;
      const rakeTotal = Number(agent.rake_total_brl) || 0;
      const rbAgente = Number(agent.commission_brl) || 0;
      const resultado = Number(agent.resultado_brl) || 0;
      const saldoAnterior = (agent.agent_id && carryMap[agent.agent_id]) || 0;
      const totalDevido = round2(resultado + saldoAnterior);

      const totalIn = agEntries.filter((e) => e.dir === 'IN').reduce((s, e) => s + Number(e.amount), 0);
      const totalOut = agEntries.filter((e) => e.dir === 'OUT').reduce((s, e) => s + Number(e.amount), 0);
      const pago = round2(totalIn - totalOut);
      const pendente = round2(totalDevido + pago);

      return {
        agent,
        players: agPlayers,
        entries: agEntries,
        ganhos,
        rakeTotal,
        rbAgente,
        resultado,
        saldoAnterior,
        totalDevido,
        totalIn,
        totalOut,
        pago,
        pendente,
      };
    });
  }, [agents, playersByAgent, ledgerByEntity, directNameSet]);

  // Helper: check if agent is "direct" (same logic as Jogadores tab)
  const isDirectAgent = useCallback(
    (name: string) => {
      return directNameSet.has(name.toLowerCase());
    },
    [directNameSet],
  );

  // Split by direct / normal
  const normalAgents = useMemo(
    () => agentFinancials.filter((d) => !isDirectAgent(d.agent.agent_name)),
    [agentFinancials, isDirectAgent],
  );

  // "Jogadores" tab: build individual player rows from ALL direct players
  // Uses players array directly (same source as Jogadores.tsx) to avoid missing
  // players whose agent_name has no matching agent_week_metrics entry
  const directPlayerRows: AgentFinancials[] = useMemo(() => {
    const rows: AgentFinancials[] = [];

    for (const p of players) {
      const agentName = p.agent_name || 'SEM AGENTE';
      if (!directNameSet.has(agentName.toLowerCase())) continue;

      const ganhos = Number(p.winnings_brl || 0);
      const rakeTotal = Number(p.rake_total_brl || 0);
      const rbJogador = Number(p.rb_value_brl || 0);
      const resultado = Number(p.resultado_brl || 0);

      // Match ledger entries for this specific player
      const seen = new Set<string>();
      const playerEntries: LedgerEntry[] = [];
      const addP = (list: LedgerEntry[] | undefined) => {
        if (!list) return;
        for (const e of list) {
          if (!seen.has(e.id)) {
            seen.add(e.id);
            playerEntries.push(e);
          }
        }
      };
      if (p.id) addP(ledgerByEntity.get(p.id));
      if (p.player_id) addP(ledgerByEntity.get(p.player_id));
      if (p.external_player_id) {
        const eid = String(p.external_player_id);
        addP(ledgerByEntity.get(eid));
        addP(ledgerByEntity.get(`cp_${eid}`));
      }

      // Carry-forward for this player
      let saldoAnterior = 0;
      const carryKeys = [p.player_id, p.id, p.external_player_id].filter((k): k is string => !!k);
      for (const k of carryKeys) {
        if (carryMap[k]) {
          saldoAnterior = carryMap[k];
          break;
        }
      }

      const totalDevido = round2(resultado + saldoAnterior);
      const totalIn = playerEntries.filter((e) => e.dir === 'IN').reduce((s, e) => s + Number(e.amount), 0);
      const totalOut = playerEntries.filter((e) => e.dir === 'OUT').reduce((s, e) => s + Number(e.amount), 0);
      const pago = round2(totalIn - totalOut);
      const pendente = round2(totalDevido + pago);

      // Lookup parent agent for payment_type
      const parentAgent = agents.find((a) => a.agent_name === agentName);

      // Build a synthetic "agent" object representing this player
      const playerAsAgent: AgentMetric = {
        id: p.id || `p_${p.external_player_id}`,
        agent_id: p.player_id || null,
        agent_name: p.nickname || p.external_player_id || '???',
        player_count: 1,
        rake_total_brl: rakeTotal,
        ganhos_total_brl: ganhos,
        rb_rate: Number(p.rb_rate || 0),
        commission_brl: rbJogador,
        resultado_brl: resultado,
        is_direct: true,
        payment_type: parentAgent?.payment_type,
      };

      rows.push({
        agent: playerAsAgent,
        players: [p],
        entries: playerEntries,
        ganhos,
        rakeTotal,
        rbAgente: rbJogador,
        resultado,
        saldoAnterior,
        totalDevido,
        totalIn,
        totalOut,
        pago,
        pendente,
      });
    }

    return rows;
  }, [players, agents, directNameSet, ledgerByEntity, carryMap]);

  const activeData = activeTab === 'agencias' ? normalAgents : directPlayerRows;

  // Sort by absolute pendente (biggest first)
  const sortedData = useMemo(
    () => [...activeData].sort((a, b) => Math.abs(b.pendente) - Math.abs(a.pendente)),
    [activeData],
  );

  // Filter by search + result type
  const filteredData = useMemo(() => {
    return sortedData.filter((d) => {
      if (searchTerm && !d.agent.agent_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (resultFilter === 'pagar' && !(d.pendente < -0.01)) return false;
      if (resultFilter === 'receber' && !(d.pendente > 0.01)) return false;
      if (resultFilter === 'zero' && Math.abs(d.pendente) > 0.01) return false;
      return true;
    });
  }, [sortedData, searchTerm, resultFilter]);

  // KPIs for active tab
  const kpis = useMemo(() => {
    const total = activeData.length;
    const totalPagar = activeData.filter((d) => d.pendente < -0.01).reduce((s, d) => s + Math.abs(d.pendente), 0);
    const totalReceber = activeData.filter((d) => d.pendente > 0.01).reduce((s, d) => s + d.pendente, 0);
    return { total, totalPagar, totalReceber };
  }, [activeData]);

  function toggleExpand(agentId: string) {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }

  // ─── Loading ───────────────────────────────────────────────────────

  if (loading) {
    return <SettlementSkeleton kpis={4} />;
  }

  // ─── List view ─────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Comprovantes — {subclub.name}</h2>
          <p className="text-dark-400 text-sm">
            Demonstrativos por agente — Semana {fmtDate(weekStart)} a {fmtDate(weekEnd)}
          </p>
        </div>
        <button
          onClick={() => {
            const withMov = filteredData.filter((d) => Math.abs(d.pendente) > 0.01 || Math.abs(d.totalDevido) > 0.01);
            if (withMov.length === 0) {
              toast('Nenhum agente com movimentacao', 'info');
              return;
            }
            toast(`Exportando ${withMov.length} comprovantes...`, 'info');
            // Sequential export
            let idx = 0;
            function next() {
              if (idx >= withMov.length) {
                toast('Todos exportados!', 'success');
                return;
              }
              setSelectedAgent(withMov[idx]);
              idx++;
            }
            next();
          }}
          className="text-sm text-dark-400 hover:text-white border border-dark-700 hover:border-dark-600 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          Exportar Todos
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Agentes"
          value={kpis.total}
          accentColor="bg-blue-500"
          valueColor="text-blue-400"
          subtitle={activeTab === 'agencias' ? 'Agencias' : 'Diretos'}
        />
        <KpiCard
          label="Saldo a Pagar"
          value={kpis.totalPagar > 0 ? formatBRL(kpis.totalPagar) : '—'}
          accentColor="bg-red-500"
          valueColor="text-red-400"
        />
        <KpiCard
          label="Saldo a Receber"
          value={kpis.totalReceber > 0 ? formatBRL(kpis.totalReceber) : '—'}
          accentColor="bg-emerald-500"
          valueColor="text-emerald-400"
        />
        <KpiCard
          label="Status"
          value={`${activeData.filter((d) => Math.abs(d.pendente) < 0.01 && (Math.abs(d.totalDevido) > 0.01 || Math.abs(d.pago) > 0.01)).length}/${kpis.total} quitados`}
          accentColor={activeData.filter((d) => Math.abs(d.pendente) < 0.01 && (Math.abs(d.totalDevido) > 0.01 || Math.abs(d.pago) > 0.01)).length === activeData.length ? 'bg-emerald-500' : 'bg-yellow-500'}
          valueColor="text-dark-200"
        />
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setActiveTab('agencias')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-200 ${
            activeTab === 'agencias'
              ? 'bg-poker-900/20 border-poker-500 text-poker-400'
              : 'bg-dark-800 border-dark-700 text-dark-400 hover:border-poker-500/50 hover:text-poker-400'
          }`}
        >
          Agências
          <span className="text-xs bg-dark-800 px-1.5 py-0.5 rounded font-mono">{normalAgents.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('diretos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-200 ${
            activeTab === 'diretos'
              ? 'bg-poker-900/20 border-poker-500 text-poker-400'
              : 'bg-dark-800 border-dark-700 text-dark-400 hover:border-poker-500/50 hover:text-poker-400'
          }`}
        >
          Jogadores
          <span className="text-xs bg-dark-800 px-1.5 py-0.5 rounded font-mono">{directPlayerRows.length}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Buscar agente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Buscar agente"
            className="input w-full"
          />
        </div>
        <select
          value={resultFilter}
          onChange={(e) => setResultFilter(e.target.value as typeof resultFilter)}
          aria-label="Filtrar por status"
          className="input text-sm"
        >
          <option value="all">Todos</option>
          <option value="pagar">A Pagar</option>
          <option value="receber">A Receber</option>
          <option value="zero">Quitado</option>
        </select>
      </div>

      {/* Agent table */}
      {filteredData.length === 0 ? (
        <div className="card text-center py-12">
          <Users className="w-8 h-8 text-dark-600 mx-auto mb-3" />
          <p className="text-dark-400">
            {agents.length === 0 ? 'Nenhum agente neste subclube' : 'Nenhum agente encontrado com os filtros aplicados'}
          </p>
        </div>
      ) : (
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-dark-800/50 border-b border-dark-700">
                <th className="py-2.5 px-3 text-left text-[10px] text-dark-500 uppercase tracking-wider font-bold">Agente</th>
                <th className="py-2.5 px-2 text-center text-[10px] text-dark-500 uppercase tracking-wider font-bold w-[70px]">Tipo</th>
                <th className="py-2.5 px-2 text-center text-[10px] text-dark-500 uppercase tracking-wider font-bold w-[80px]">Status</th>
                <th className="py-2.5 px-2 text-right text-[10px] text-dark-500 uppercase tracking-wider font-bold">Ganhos</th>
                <th className="py-2.5 px-2 text-right text-[10px] text-dark-500 uppercase tracking-wider font-bold">RB Ag.</th>
                <th className="py-2.5 px-2 text-right text-[10px] text-dark-500 uppercase tracking-wider font-bold">Saldo Ant.</th>
                <th className="py-2.5 px-2 text-right text-[10px] text-dark-500 uppercase tracking-wider font-bold">Pago</th>
                <th className="py-2.5 px-2 text-right text-[10px] text-dark-500 uppercase tracking-wider font-bold">Saldo</th>
                <th className="py-2.5 px-2 text-right text-[10px] text-dark-500 uppercase tracking-wider font-bold w-[120px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800/50">
              {filteredData.map((d) => (
                <AgentRow
                  key={d.agent.id}
                  data={d}
                  isExpanded={expandedAgents.has(d.agent.id)}
                  onToggleExpand={() => toggleExpand(d.agent.id)}
                  onPreview={() => setSelectedAgent(d)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Preview Modal ────────────────────────────────────────── */}
      {selectedAgent && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedAgent(null);
          }}
        >
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Modal content */}
          <div className="relative w-full max-w-3xl mx-4 my-8 animate-slide-up">
            {/* ── Unified toolbar centered above comprovante ── */}
            <div className="relative z-10 mb-4">
              {/* Close X */}
              <button
                onClick={() => setSelectedAgent(null)}
                className="absolute -top-1 -right-1 text-dark-500 hover:text-white text-lg w-8 h-8 flex items-center justify-center rounded-full bg-dark-800/80 border border-dark-700 transition-colors"
                aria-label="Fechar"
              >
                ✕
              </button>

              {/* Label */}
              <p className="text-center text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-2">
                Tipo de Fechamento
              </p>

              {/* Controls row */}
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {/* Profit/Loss toggle */}
                <div className="flex items-center gap-0.5 bg-dark-800/90 backdrop-blur rounded-lg border border-dark-700 p-0.5">
                  <button
                    onClick={() => setFechamentoTipo('profitloss')}
                    className={`text-[11px] px-3 py-1.5 rounded-md font-bold transition-all ${
                      fechamentoTipo === 'profitloss'
                        ? 'bg-poker-500/20 text-poker-400 border border-poker-500/30'
                        : 'text-dark-400 hover:text-dark-200 border border-transparent'
                    }`}
                  >
                    Profit/Loss
                  </button>
                  <button
                    onClick={() => setFechamentoTipo('avista')}
                    className={`text-[11px] px-3 py-1.5 rounded-md font-bold transition-all ${
                      fechamentoTipo === 'avista'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'text-dark-400 hover:text-dark-200 border border-transparent'
                    }`}
                  >
                    A Vista
                  </button>
                </div>

                {/* Divider */}
                <div className="w-px h-6 bg-dark-700" />

                {/* Esconder Jogadores */}
                <label className="flex items-center gap-1.5 bg-dark-800/90 backdrop-blur px-3 py-1.5 rounded-lg border border-dark-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hidePlayers}
                    onChange={(e) => setHidePlayers(e.target.checked)}
                    className="accent-poker-500 w-3.5 h-3.5"
                  />
                  <span className="text-[11px] text-dark-300 font-medium">Esconder Jogadores</span>
                </label>

                {/* Divider */}
                <div className="w-px h-6 bg-dark-700" />

                {/* Action buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      // Handled inside StatementView
                      const evt = new CustomEvent('comprovante-export-jpg');
                      window.dispatchEvent(evt);
                    }}
                    className="text-[11px] px-3 py-1.5 rounded-lg font-medium bg-dark-800/90 border border-dark-700 text-dark-300 hover:text-white hover:border-dark-500 transition-colors"
                  >
                    Exportar JPG
                  </button>
                  <button
                    onClick={() => {
                      const evt = new CustomEvent('comprovante-copy');
                      window.dispatchEvent(evt);
                    }}
                    className="text-[11px] px-3 py-1.5 rounded-lg font-medium bg-dark-800/90 border border-dark-700 text-dark-300 hover:text-white hover:border-dark-500 transition-colors"
                  >
                    Copiar
                  </button>
                  <button
                    onClick={async () => {
                      if (!selectedAgent) return;
                      // Search for agent phone first
                      let phone = '';
                      try {
                        const res = await listPlayers(selectedAgent.agent.agent_name, 1);
                        const match = (res.data || []).find((p: any) => p.metadata?.phone);
                        phone = match?.metadata?.phone || '';
                      } catch { /* ignore */ }
                      if (!phone) {
                        toast('Nenhum telefone cadastrado. Cadastre em Jogadores.', 'info');
                      }
                      // Dispatch whatsapp event — StatementView generates image, copies, then opens wa.me
                      const evt = new CustomEvent('comprovante-whatsapp', { detail: { phone } });
                      window.dispatchEvent(evt);
                    }}
                    className="text-[11px] px-3 py-1.5 rounded-lg font-medium bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 transition-colors flex items-center gap-1.5"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WhatsApp
                  </button>
                </div>
              </div>
            </div>

            <StatementView
              data={selectedAgent}
              subclubName={subclub.name}
              weekStart={weekStart}
              weekEnd={weekEnd}
              fechamentoTipo={fechamentoTipo}
              hidePlayers={hidePlayers}
              logoUrl={logoUrl}
              onBack={() => setSelectedAgent(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agent Row (table-based) ─────────────────────────────────────────

function AgentRow({
  data,
  isExpanded,
  onToggleExpand,
  onPreview,
}: {
  data: AgentFinancials;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onPreview: () => void;
}) {
  const { agent, players, ganhos, rbAgente, saldoAnterior, pago, pendente } = data;
  const isDirect = agent.is_direct;
  const hasMov = Math.abs(pendente) > 0.01 || Math.abs(data.totalDevido) > 0.01;
  const hasPago = Math.abs(pago) > 0.01;
  const isQuitado = Math.abs(pendente) < 0.01 && hasMov;

  const statusBadge = isQuitado
    ? { label: 'Quitado', cls: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' }
    : pendente > 0.01
      ? { label: 'A Receber', cls: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' }
      : pendente < -0.01
        ? { label: 'A Pagar', cls: 'bg-red-500/10 border-red-500/20 text-red-400' }
        : null;

  function MoneyCell({ value, color }: { value: number; color?: string }) {
    const hasVal = Math.abs(value) > 0.01;
    return (
      <span className={`font-mono text-xs ${hasVal ? (color || clr(value)) : 'text-dark-600'}`}>
        {hasVal ? formatBRL(value) : '—'}
      </span>
    );
  }

  return (
    <>
      {/* Main row */}
      <tr
        className={`cursor-pointer hover:bg-dark-800/40 transition-colors ${!hasMov ? 'opacity-40' : ''}`}
        onClick={onToggleExpand}
      >
        {/* Agent name */}
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-1.5">
            <span className={`text-dark-500 text-[10px] transition-transform duration-150 inline-block ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
            <span className="text-white font-semibold text-sm truncate max-w-[180px]">{agent.agent_name}</span>
            <span className="text-dark-600 text-[10px] font-mono">{agent.player_count}j</span>
          </div>
        </td>

        {/* Tipo */}
        <td className="py-2.5 px-2 text-center">
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${
            (agent.payment_type || 'fiado') === 'avista'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
          }`}>
            {(agent.payment_type || 'fiado') === 'avista' ? 'VISTA' : 'FIADO'}
          </span>
        </td>

        {/* Status */}
        <td className="py-2.5 px-2 text-center">
          {statusBadge ? (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${statusBadge.cls}`}>
              {statusBadge.label}
            </span>
          ) : (
            <span className="text-dark-600 text-xs">—</span>
          )}
        </td>

        {/* Ganhos */}
        <td className="py-2.5 px-2 text-right"><MoneyCell value={ganhos} /></td>

        {/* RB */}
        <td className="py-2.5 px-2 text-right">
          <MoneyCell value={rbAgente} color={isDirect ? 'text-blue-400' : 'text-purple-400'} />
        </td>

        {/* Saldo Ant */}
        <td className="py-2.5 px-2 text-right">
          <span className={`font-mono text-xs ${Math.abs(saldoAnterior) > 0.01 ? 'text-amber-400' : 'text-dark-600'}`}>
            {formatBRL(saldoAnterior)}
          </span>
        </td>

        {/* Pago */}
        <td className="py-2.5 px-2 text-right"><MoneyCell value={pago} color="text-sky-400" /></td>

        {/* Saldo final */}
        <td className="py-2.5 px-2 text-right">
          <span className={`font-mono text-xs font-bold ${clr(pendente)}`}>
            {formatBRL(pendente)}
          </span>
        </td>

        {/* Actions */}
        <td className="py-2.5 px-2 text-right">
          {hasMov && (
            <button
              onClick={(e) => { e.stopPropagation(); onPreview(); }}
              className="text-[11px] px-2.5 py-1 whitespace-nowrap rounded-md transition-colors border border-poker-500/30 text-poker-400 bg-poker-500/5 hover:bg-poker-500/15"
            >
              Gerar Comprovante
            </button>
          )}
        </td>
      </tr>

      {/* Expanded detail */}
      {isExpanded && (
        <tr>
          <td colSpan={9} className="px-3 pb-4 pt-1 bg-dark-800/20">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pl-5">
              {/* Financial summary */}
              <div>
                <h4 className="text-xs font-bold text-dark-400 uppercase tracking-wider mb-2">Resumo Financeiro</h4>
                <div className="space-y-1 text-sm">
                  <FinRow label="Ganhos/Perdas" value={data.ganhos} />
                  <FinRow label="Rake Gerado" value={data.rakeTotal} muted />
                  {rbAgente > 0.01 && (
                    <FinRow
                      label={isDirect ? 'RB Individual' : `RB Agente (${agent.rb_rate}%)`}
                      value={rbAgente}
                      customColor={isDirect ? 'text-blue-400' : 'text-purple-400'}
                    />
                  )}
                  <div className="border-t border-dark-700/30 pt-1">
                    <FinRow label="Resultado" value={data.resultado} bold />
                  </div>
                  <FinRow label="Saldo Anterior" value={data.saldoAnterior} customColor="text-amber-400" />
                  <div className="border-t border-dark-700/30 pt-1">
                    <FinRow label="Total Devido" value={data.totalDevido} bold />
                  </div>
                  {hasPago && (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-dark-300">Pagamentos</span>
                          {data.entries.length > 0 && (
                            <span className="text-[10px] text-dark-500">
                              {data.entries.map(e => e.method).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') || ''}
                            </span>
                          )}
                        </div>
                        <span className="font-mono font-bold text-sky-400">{formatBRL(data.pago)}</span>
                      </div>
                      <div className="border-t-2 border-dark-600/50 pt-1">
                        <FinRow label="Saldo Final" value={data.pendente} bold large />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Player mini-table */}
              <div>
                <h4 className="text-xs font-bold text-dark-400 uppercase tracking-wider mb-2">
                  Jogadores ({players.length})
                </h4>
                {players.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-dark-700/50 text-dark-500">
                        <th className="py-1 text-left font-medium">Nick</th>
                        <th className="py-1 text-right font-medium">P/L</th>
                        <th className="py-1 text-right font-medium">Rake</th>
                        <th className="py-1 text-right font-medium">Resultado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-800/30">
                      {players.map((p, i) => (
                        <tr key={i}>
                          <td className="py-1 text-dark-300">{p.nickname || p.external_player_id || '—'}</td>
                          <td className={`py-1 text-right font-mono ${clr(Number(p.winnings_brl))}`}>
                            {formatBRL(Number(p.winnings_brl))}
                          </td>
                          <td className="py-1 text-right font-mono text-dark-400">
                            {formatBRL(Number(p.rake_total_brl))}
                          </td>
                          <td className={`py-1 text-right font-mono font-bold ${clr(Number(p.resultado_brl))}`}>
                            {formatBRL(Number(p.resultado_brl))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-dark-500 text-xs">Nenhum jogador</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Financial Row (expand + statement) ──────────────────────────────

function FinRow({
  label,
  value,
  muted,
  bold,
  large,
  customColor,
}: {
  label: string;
  value: number;
  muted?: boolean;
  bold?: boolean;
  large?: boolean;
  customColor?: string;
}) {
  const color = customColor || (muted ? 'text-dark-400' : clr(value));
  return (
    <div className="flex items-center justify-between">
      <span className={`${bold ? 'font-bold text-dark-200' : 'text-dark-300'}`}>{label}</span>
      <span className={`font-mono ${large ? 'text-base' : ''} ${bold ? 'font-extrabold' : 'font-bold'} ${color}`}>
        {formatBRL(value)}
      </span>
    </div>
  );
}

// ─── Statement View (Comprovante Simplificado) ───────────────────────

function StatementView({
  data,
  subclubName,
  weekStart,
  weekEnd,
  fechamentoTipo,
  hidePlayers,
  logoUrl,
  onBack,
}: {
  data: AgentFinancials;
  subclubName: string;
  weekStart: string;
  weekEnd: string;
  fechamentoTipo: 'avista' | 'profitloss';
  hidePlayers: boolean;
  logoUrl?: string | null;
  onBack: () => void;
}) {
  const { agent, players, entries } = data;
  const isDirect = agent.is_direct;
  const statementRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const isAvista = fechamentoTipo === 'avista';

  // ─── Formulas por tipo ───
  const resultadoBase = isAvista ? data.rbAgente : data.resultado;
  const totalDevido = round2(resultadoBase + data.saldoAnterior);
  const pendente = round2(totalDevido + data.pago);

  const isQuitado = Math.abs(pendente) < 0.01 && (Math.abs(totalDevido) > 0.01 || Math.abs(data.pago) > 0.01);
  const isParcial = !isQuitado && Math.abs(data.pago) > 0.01;

  const totalResultado = players.reduce((s, p) => s + Number(p.resultado_brl), 0);
  const tipoLabel = isAvista ? 'A Vista' : 'Profit/Loss';

  // ─── Export JPG via event ───
  useEffect(() => {
    async function handleExport() {
      if (!statementRef.current) return;
      try {
        const canvas = await html2canvas(statementRef.current, {
          backgroundColor: '#0f0f13',
          scale: 2,
          useCORS: true,
          logging: false,
        });
        const link = document.createElement('a');
        const safeName = agent.agent_name.replace(/[^a-zA-Z0-9_-]/g, '_');
        link.download = `comprovante_${safeName}_${fechamentoTipo}_${weekStart}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.95);
        link.click();
        toast('JPG exportado!', 'success');
      } catch {
        toast('Erro ao exportar JPG', 'error');
      }
    }

    async function handleCopy() {
      if (!statementRef.current) return;
      try {
        const canvas = await html2canvas(statementRef.current, {
          backgroundColor: '#0f0f13',
          scale: 2,
          useCORS: true,
          logging: false,
        });
        canvas.toBlob(async (blob) => {
          if (blob) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob }),
            ]);
            toast('Comprovante copiado!', 'success');
          }
        }, 'image/png');
      } catch {
        toast('Erro ao copiar', 'error');
      }
    }

    async function handleWhatsApp(e: Event) {
      const phone = (e as CustomEvent).detail?.phone || '';
      if (!statementRef.current) return;
      if (!phone) {
        toast('Nenhum telefone cadastrado. Cadastre em Jogadores.', 'info');
        return;
      }
      try {
        toast('Enviando comprovante via WhatsApp...', 'info');
        const canvas = await html2canvas(statementRef.current, {
          backgroundColor: '#0f0f13',
          scale: 2,
          useCORS: true,
          logging: false,
        });
        // Convert canvas to base64
        const base64 = canvas.toDataURL('image/png');
        const safeName = agent.agent_name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const cleanPhone = String(phone).replace(/\D/g, '');

        // Send via Evolution API (through our backend)
        const res = await sendWhatsApp({
          phone: cleanPhone,
          imageBase64: base64,
          caption: `Comprovante - ${agent.agent_name}`,
          fileName: `comprovante_${safeName}.png`,
        });

        if (res.success) {
          toast('Comprovante enviado via WhatsApp!', 'success');
        } else {
          // Fallback: copy + open wa.me
          const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
          if (blob) {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          }
          toast(res.error || 'Evolution API indisponivel. Comprovante copiado, cole no WhatsApp.', 'info');
          window.open(`https://wa.me/${cleanPhone}`, '_blank');
        }
      } catch {
        toast('Erro ao enviar. Verifique a config em Configuracoes > WhatsApp.', 'error');
      }
    }

    window.addEventListener('comprovante-export-jpg', handleExport);
    window.addEventListener('comprovante-copy', handleCopy);
    window.addEventListener('comprovante-whatsapp', handleWhatsApp);
    return () => {
      window.removeEventListener('comprovante-export-jpg', handleExport);
      window.removeEventListener('comprovante-copy', handleCopy);
      window.removeEventListener('comprovante-whatsapp', handleWhatsApp);
    };
  }, [agent.agent_name, fechamentoTipo, weekStart, toast]);

  return (
    <div>
      {/* ─── Comprovante Card ─── */}
      <div
        ref={statementRef}
        className="bg-dark-900 border border-dark-700 rounded-xl p-6 print:bg-white print:text-black print:border-none print:shadow-none max-w-2xl mx-auto"
      >
        {/* Header: Logo lateral + Info */}
        <div className="flex items-center gap-5 mb-5">
          {/* Logo grande na lateral */}
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={subclubName}
              className="w-20 h-20 rounded-xl object-cover bg-dark-800 shrink-0"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-dark-800 flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold text-dark-500">{(subclubName || '?').charAt(0).toUpperCase()}</span>
            </div>
          )}

          {/* Info ao lado */}
          <div className="min-w-0">
            <p className="text-[10px] text-dark-500 print:text-gray-400 uppercase tracking-wider font-bold">
              Fechamento Semanal
            </p>
            <h2 className="text-lg font-bold text-poker-400 print:text-black mt-0.5">
              {agent.agent_name}
              <span className="text-dark-500 print:text-gray-500 text-xs font-mono ml-2">
                {(() => {
                  const extId = agent.external_agent_id || players[0]?.external_agent_id;
                  return extId ? `#${extId}` : '';
                })()}
              </span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ml-2 align-middle ${
                isAvista
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 print:text-green-700 print:border-green-600'
                  : 'bg-poker-500/10 text-poker-400 border-poker-500/30 print:text-blue-700 print:border-blue-600'
              }`}>
                {tipoLabel}
              </span>
            </h2>
            <p className="text-dark-400 print:text-gray-500 text-xs mt-0.5">
              {fmtDate(weekStart)} a {fmtDate(weekEnd)} · {players.length} jogador{players.length !== 1 ? 'es' : ''} · {subclubName}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-dark-700/50 print:border-gray-300 mb-4" />

        {/* ─── Player Table ─── */}
        {!hidePlayers && (
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b border-dark-700/50 print:border-gray-300">
                <th className="py-1.5 text-left text-[10px] text-dark-500 print:text-gray-500 uppercase font-bold tracking-wider">Jogador</th>
                <th className="py-1.5 text-center text-[10px] text-dark-500 print:text-gray-500 uppercase font-bold tracking-wider">ID</th>
                {!isAvista && (
                  <th className="py-1.5 text-right text-[10px] text-dark-500 print:text-gray-500 uppercase font-bold tracking-wider">Resultado</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800/30 print:divide-gray-200">
              {players.map((p, i) => (
                <tr key={i}>
                  <td className="py-1.5 text-dark-200 print:text-black text-sm">
                    {p.nickname || '—'}
                  </td>
                  <td className="py-1.5 text-center text-dark-400 print:text-gray-600 font-mono text-xs">
                    {p.external_player_id || '—'}
                  </td>
                  {!isAvista && (
                    <td className={`py-1.5 text-right font-mono font-bold text-sm ${clrPrint(Number(p.resultado_brl))}`}>
                      {formatBRL(Number(p.resultado_brl))}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {/* Total row (only for Profit/Loss) */}
            {!isAvista && (
              <tfoot>
                <tr className="border-t border-dark-600/50 print:border-gray-400">
                  <td className="py-2 text-dark-300 print:text-black font-bold text-sm" colSpan={2}>TOTAL</td>
                  <td className={`py-2 text-right font-mono font-extrabold text-sm ${clrPrint(totalResultado)}`}>
                    {formatBRL(totalResultado)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {/* ─── Financial Summary (compact) ─── */}
        <div className="bg-dark-800/40 print:bg-gray-50 rounded-lg p-4 mb-4">
          <div className="space-y-1.5 text-sm">
            {/* Rake sempre informativo */}
            <div className="flex justify-between">
              <span className="text-dark-400 print:text-gray-500 text-xs">Rake Gerado <span className="text-dark-600 print:text-gray-400">(informativo)</span></span>
              <span className="font-mono text-dark-400 print:text-gray-500 text-xs">{formatBRL(data.rakeTotal)}</span>
            </div>

            {/* RB Agente */}
            {data.rbAgente > 0.01 && (
              <div className="flex justify-between">
                <span className="text-dark-300 print:text-gray-600 text-xs">
                  {isDirect ? 'RB Individual' : `RB Agente (${agent.rb_rate}% do Rake)`}
                </span>
                <span className={`font-mono text-xs font-bold ${isDirect ? 'text-blue-400 print:text-blue-700' : 'text-purple-400 print:text-purple-700'}`}>
                  {formatBRL(data.rbAgente)}
                </span>
              </div>
            )}

            {/* P/L — só aparece no Profit/Loss */}
            {!isAvista && (
              <div className="flex justify-between">
                <span className="text-dark-300 print:text-gray-600 text-xs">P/L Jogadores</span>
                <span className={`font-mono text-xs font-bold ${clrPrint(data.resultado - data.rbAgente)}`}>
                  {formatBRL(data.resultado - data.rbAgente)}
                </span>
              </div>
            )}

            {/* Saldo anterior (se houver) */}
            {Math.abs(data.saldoAnterior) > 0.01 && (
              <div className="flex justify-between">
                <span className="text-dark-300 print:text-gray-600 text-xs">Saldo Anterior</span>
                <span className="font-mono text-xs font-bold text-amber-400 print:text-amber-700">
                  {formatBRL(data.saldoAnterior)}
                </span>
              </div>
            )}

            {/* Resultado Final */}
            <div className="border-t border-dark-700/30 print:border-gray-300 pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-dark-200 print:text-black font-bold text-sm">
                  Resultado Final
                  {isAvista && <span className="text-dark-500 text-[10px] ml-1 font-normal">(somente RB)</span>}
                </span>
                <span className={`font-mono font-extrabold text-base ${clrPrint(totalDevido)}`}>
                  {formatBRL(totalDevido)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Pagamentos Registrados ─── */}
        {entries.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] text-dark-500 print:text-gray-500 uppercase font-bold tracking-wider">
                Pagamentos Registrados
              </h4>
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${
                isQuitado
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 print:text-green-700 print:border-green-600'
                  : isParcial
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 print:text-amber-700 print:border-amber-600'
                    : 'bg-dark-700 text-dark-400 border-dark-600 print:text-gray-600 print:border-gray-400'
              }`}>
                {isQuitado ? 'QUITADO' : isParcial ? 'PARCIALMENTE PAGO' : 'PENDENTE'}
              </span>
            </div>
            <div className="space-y-1.5">
              {entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {e.method && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-dark-800 print:bg-gray-200 text-dark-300 print:text-gray-600 font-bold uppercase">
                        {e.method}
                      </span>
                    )}
                    <span className="text-dark-500 print:text-gray-500 font-mono text-[10px]">
                      {fmtDateTime(e.created_at!)}
                    </span>
                  </div>
                  <span className={`font-mono font-bold ${
                    e.dir === 'IN'
                      ? 'text-emerald-400 print:text-green-700'
                      : 'text-red-400 print:text-red-700'
                  }`}>
                    {e.dir === 'OUT' ? '-' : ''}{formatBRL(Number(e.amount))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Saldo Atual ─── */}
        <div className={`rounded-lg p-3 border ${
          isQuitado
            ? 'bg-emerald-950/20 border-emerald-700/30 print:border-green-400 print:bg-green-50'
            : 'bg-dark-800/30 border-dark-700/50 print:border-gray-300 print:bg-gray-50'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-dark-300 print:text-gray-600 text-sm font-medium">Saldo atual</span>
            <div className="text-right">
              <span className={`font-mono font-extrabold text-lg ${clrPrint(pendente)}`}>
                {formatBRL(Math.abs(pendente))}
              </span>
              {Math.abs(pendente) > 0.01 && (
                <span className={`block text-[10px] font-bold ${pendente > 0 ? 'text-emerald-500 print:text-green-700' : 'text-red-400 print:text-red-700'}`}>
                  {pendente > 0 ? 'a receber' : 'a pagar'}
                </span>
              )}
              {Math.abs(pendente) < 0.01 && (
                <span className="block text-[10px] font-bold text-emerald-400 print:text-green-700">quitado</span>
              )}
            </div>
          </div>
        </div>

        {/* ─── Footer ─── */}
        <div className="text-center mt-5 pt-3 border-t border-dark-800/50 print:border-gray-200">
          <p className="text-[10px] text-dark-600 print:text-gray-400">
            {subclubName} · {tipoLabel} · Gerado em {new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  );
}
