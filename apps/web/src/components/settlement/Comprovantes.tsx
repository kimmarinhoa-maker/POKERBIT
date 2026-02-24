'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import html2canvas from 'html2canvas';
import { listLedger, getCarryForward, formatBRL } from '@/lib/api';
import { round2 } from '@/lib/formatters';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/Spinner';

// ─── Types ──────────────────────────────────────────────────────────

interface AgentMetric {
  id: string;
  agent_id: string | null;
  agent_name: string;
  player_count: number;
  rake_total_brl: number;
  ganhos_total_brl: number;
  rb_rate: number;
  commission_brl: number;
  resultado_brl: number;
  is_direct?: boolean;
  payment_type?: 'fiado' | 'avista';
}

interface PlayerMetric {
  nickname: string | null;
  external_player_id: string | null;
  agent_name: string | null;
  winnings_brl: number;
  rake_total_brl: number;
  ggr_brl: number;
  rb_rate: number;
  rb_value_brl: number;
  resultado_brl: number;
}

interface LedgerEntry {
  id: string;
  entity_id: string;
  entity_name: string | null;
  dir: 'IN' | 'OUT';
  amount: number;
  method: string | null;
  description: string | null;
  created_at: string;
}

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
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
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

export default function Comprovantes({ subclub, weekStart, clubId }: Props) {
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

  // Load ledger entries + carry-forward
  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const [ledgerRes, carryRes] = await Promise.all([
        listLedger(weekStart),
        getCarryForward(weekStart, clubId),
      ]);
      if (ledgerRes.success) setEntries(ledgerRes.data || []);
      if (carryRes.success) setCarryMap(carryRes.data || {});
    } catch (err) {
      console.error(err);
      toast('Erro ao carregar comprovantes', 'error');
    } finally {
      setLoading(false);
    }
  }, [weekStart, clubId]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Build direct set from backend-annotated is_direct flag (single source of truth)
  // Same logic as Jogadores.tsx: agent.is_direct + player.agent_is_direct + SEM AGENTE
  const directNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const a of agents) {
      if ((a as any).is_direct) set.add(a.agent_name.toLowerCase());
    }
    for (const p of players) {
      if ((p as any).agent_is_direct) set.add((p.agent_name || '').toLowerCase());
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
    return agents.map(rawAgent => {
      // Use backend-annotated is_direct (already set by settlement service)
      const agent = { ...rawAgent, is_direct: directNameSet.has(rawAgent.agent_name.toLowerCase()) };
      const agPlayers = (playersByAgent.get(agent.agent_name) || [])
        .sort((a, b) => (a.nickname || '').localeCompare(b.nickname || ''));

      // Resolve ledger entries — match by agent IDs + all player-level keys
      // (mirrors backend settlement.service.ts broad-matching logic)
      const seen = new Set<string>();
      const agEntries: LedgerEntry[] = [];
      function add(list: LedgerEntry[] | undefined) {
        if (!list) return;
        for (const e of list) {
          if (!seen.has(e.id)) { seen.add(e.id); agEntries.push(e); }
        }
      }
      // Agent-level keys
      add(ledgerByEntity.get(agent.id));
      if (agent.agent_id) add(ledgerByEntity.get(agent.agent_id));
      // Player-level keys (ChipPix stores as cp_<id>, OFX by player_id, etc.)
      for (const p of agPlayers) {
        if ((p as any).id) add(ledgerByEntity.get((p as any).id));
        if ((p as any).player_id) add(ledgerByEntity.get((p as any).player_id));
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

      const totalIn = agEntries.filter(e => e.dir === 'IN').reduce((s, e) => s + Number(e.amount), 0);
      const totalOut = agEntries.filter(e => e.dir === 'OUT').reduce((s, e) => s + Number(e.amount), 0);
      const pago = round2(totalIn - totalOut);
      const pendente = round2(totalDevido + pago);

      return {
        agent, players: agPlayers, entries: agEntries,
        ganhos, rakeTotal, rbAgente, resultado,
        saldoAnterior, totalDevido, totalIn, totalOut, pago, pendente,
      };
    });
  }, [agents, playersByAgent, ledgerByEntity, directNameSet]);

  // Helper: check if agent is "direct" (same logic as Jogadores tab)
  const isDirectAgent = useCallback((name: string) => {
    return directNameSet.has(name.toLowerCase());
  }, [directNameSet]);

  // Split by direct / normal
  const normalAgents = useMemo(() =>
    agentFinancials.filter(d => !isDirectAgent(d.agent.agent_name)), [agentFinancials, isDirectAgent]);

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
      function addP(list: LedgerEntry[] | undefined) {
        if (!list) return;
        for (const e of list) {
          if (!seen.has(e.id)) { seen.add(e.id); playerEntries.push(e); }
        }
      }
      if ((p as any).id) addP(ledgerByEntity.get((p as any).id));
      if ((p as any).player_id) addP(ledgerByEntity.get((p as any).player_id));
      if (p.external_player_id) {
        const eid = String(p.external_player_id);
        addP(ledgerByEntity.get(eid));
        addP(ledgerByEntity.get(`cp_${eid}`));
      }

      // Carry-forward for this player
      let saldoAnterior = 0;
      const carryKeys = [(p as any).player_id, (p as any).id, p.external_player_id].filter(Boolean);
      for (const k of carryKeys) {
        if (carryMap[k]) { saldoAnterior = carryMap[k]; break; }
      }

      const totalDevido = round2(resultado + saldoAnterior);
      const totalIn = playerEntries.filter(e => e.dir === 'IN').reduce((s, e) => s + Number(e.amount), 0);
      const totalOut = playerEntries.filter(e => e.dir === 'OUT').reduce((s, e) => s + Number(e.amount), 0);
      const pago = round2(totalIn - totalOut);
      const pendente = round2(totalDevido + pago);

      // Lookup parent agent for payment_type
      const parentAgent = agents.find(a => a.agent_name === agentName);

      // Build a synthetic "agent" object representing this player
      const playerAsAgent: AgentMetric = {
        id: (p as any).id || `p_${p.external_player_id}`,
        agent_id: (p as any).player_id || null,
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
        ganhos, rakeTotal, rbAgente: rbJogador, resultado,
        saldoAnterior, totalDevido, totalIn, totalOut, pago, pendente,
      });
    }

    return rows;
  }, [players, agents, directNameSet, ledgerByEntity, carryMap]);

  const activeData = activeTab === 'agencias' ? normalAgents : directPlayerRows;

  // Sort by absolute pendente (biggest first)
  const sortedData = useMemo(() =>
    [...activeData].sort((a, b) => Math.abs(b.pendente) - Math.abs(a.pendente)),
  [activeData]);

  // Filter by search + result type
  const filteredData = useMemo(() => {
    return sortedData.filter(d => {
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
    const totalPagar = activeData
      .filter(d => d.pendente < -0.01)
      .reduce((s, d) => s + Math.abs(d.pendente), 0);
    const totalReceber = activeData
      .filter(d => d.pendente > 0.01)
      .reduce((s, d) => s + d.pendente, 0);
    return { total, totalPagar, totalReceber };
  }, [activeData]);

  function toggleExpand(agentId: string) {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }

  // ─── Loading ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  // ─── Statement view (print) ────────────────────────────────────────

  if (selectedAgent) {
    return (
      <StatementView
        data={selectedAgent}
        subclubName={subclub.name}
        weekStart={weekStart}
        weekEnd={weekEnd}
        onBack={() => setSelectedAgent(null)}
      />
    );
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
            const withMov = filteredData.filter(d => Math.abs(d.pendente) > 0.01 || Math.abs(d.totalDevido) > 0.01);
            if (withMov.length === 0) { toast('Nenhum agente com movimentacao', 'info'); return; }
            toast(`Exportando ${withMov.length} comprovantes...`, 'info');
            // Sequential export
            let idx = 0;
            function next() {
              if (idx >= withMov.length) { toast('Todos exportados!', 'success'); return; }
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-blue-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Agentes</p>
            <p className="text-xl font-bold mt-1 font-mono text-blue-400">{kpis.total}</p>
            <p className="text-[10px] text-dark-500">{activeTab === 'agencias' ? 'Agencias' : 'Diretos'}</p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-red-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Saldo a Pagar</p>
            <p className="text-xl font-bold mt-1 font-mono text-red-400">
              {kpis.totalPagar > 0 ? formatBRL(kpis.totalPagar) : '—'}
            </p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-emerald-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Saldo a Receber</p>
            <p className="text-xl font-bold mt-1 font-mono text-emerald-400">
              {kpis.totalReceber > 0 ? formatBRL(kpis.totalReceber) : '—'}
            </p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className={`h-0.5 ${activeData.filter(d => Math.abs(d.pendente) < 0.01 && (Math.abs(d.totalDevido) > 0.01 || Math.abs(d.pago) > 0.01)).length === activeData.length ? 'bg-emerald-500' : 'bg-yellow-500'}`} />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Status</p>
            <p className="text-sm font-bold mt-1 font-mono text-dark-200">
              {activeData.filter(d => Math.abs(d.pendente) < 0.01 && (Math.abs(d.totalDevido) > 0.01 || Math.abs(d.pago) > 0.01)).length}/{kpis.total} quitados
            </p>
          </div>
        </div>
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
          <span className="text-xs bg-dark-800 px-1.5 py-0.5 rounded font-mono">
            {normalAgents.length}
          </span>
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
          <span className="text-xs bg-dark-800 px-1.5 py-0.5 rounded font-mono">
            {directPlayerRows.length}
          </span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Buscar agente..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            aria-label="Buscar agente"
            className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-4 py-2 text-sm text-white placeholder-dark-500 focus:border-poker-500 focus:outline-none"
          />
        </div>
        <select
          value={resultFilter}
          onChange={e => setResultFilter(e.target.value as typeof resultFilter)}
          aria-label="Filtrar por status"
          className="bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-dark-200 focus:border-poker-500 focus:outline-none"
        >
          <option value="all">Todos</option>
          <option value="pagar">A Pagar</option>
          <option value="receber">A Receber</option>
          <option value="zero">Quitado</option>
        </select>
      </div>

      {/* Agent cards */}
      {filteredData.length === 0 ? (
        <div className="card text-center py-12 text-dark-400">
          {agents.length === 0
            ? 'Nenhum agente neste subclube'
            : 'Nenhum agente encontrado com os filtros aplicados'}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredData.map(data => (
            <AgentCard
              key={data.agent.id}
              data={data}
              isExpanded={expandedAgents.has(data.agent.id)}
              onToggleExpand={() => toggleExpand(data.agent.id)}
              onGenerateStatement={() => setSelectedAgent(data)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Agent Card ──────────────────────────────────────────────────────

function AgentCard({ data, isExpanded, onToggleExpand, onGenerateStatement }: {
  data: AgentFinancials;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onGenerateStatement: () => void;
}) {
  const { agent, players, ganhos, rbAgente, saldoAnterior, pago, pendente } = data;
  const isDirect = agent.is_direct;
  const hasMov = Math.abs(pendente) > 0.01 || Math.abs(data.totalDevido) > 0.01;
  const hasPago = Math.abs(pago) > 0.01;

  // Status badge
  const statusBadge = Math.abs(pendente) < 0.01 && hasMov
    ? { label: 'Quitado', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' }
    : pendente > 0.01
      ? { label: 'A Receber', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' }
      : pendente < -0.01
        ? { label: 'A Pagar', bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' }
        : null;

  return (
    <div className={`card overflow-hidden transition-all border-l-4 ${
      (agent.payment_type || 'fiado') === 'avista' ? 'border-l-emerald-500' : 'border-l-yellow-500'
    } ${!hasMov ? 'opacity-50' : ''}`}>
      {/* Main row */}
      <div className="flex items-center gap-2">
        {/* Col 1: Name + ID + jog count — fixed width */}
        <div className="flex-shrink-0 min-w-0" style={{ width: '180px' }}>
          <div className="flex items-center gap-1.5">
            <span className="text-white font-semibold text-sm truncate">{agent.agent_name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(agent.id);
              }}
              title="Clique para copiar ID"
              className="text-[10px] font-mono text-dark-600 hover:text-dark-400 transition-colors cursor-pointer flex-shrink-0"
            >
              {agent.id.slice(0, 6)}
            </button>
            {isDirect && (
              <span className="text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-1 py-0.5 rounded font-bold flex-shrink-0">
                DIR
              </span>
            )}
          </div>
          <span className="text-dark-500 text-xs">{agent.player_count} jog.</span>
        </div>

        {/* Col 2: Tipo de Fechamento — fixed width */}
        <div className="flex-shrink-0" style={{ width: '130px' }}>
          <p className="text-[9px] text-dark-500 uppercase tracking-wider font-bold mb-0.5">Tipo de Fechamento</p>
          <div className="flex items-center gap-1">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
                (agent.payment_type || 'fiado') === 'avista'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-red-500/20 text-red-400 border-red-500/40'
              }`}
            >
              {(agent.payment_type || 'fiado') === 'avista' ? 'A VISTA' : 'FIADO'}
            </span>
            {statusBadge && (
              <span className={`text-[10px] ${statusBadge.bg} border ${statusBadge.border} ${statusBadge.text} px-1.5 py-0.5 rounded font-bold`}>
                {statusBadge.label}
              </span>
            )}
          </div>
        </div>

        {/* Col 3: Data columns — fixed equal widths */}
        <div className="flex items-center flex-1 justify-end">
          <DataCol label="GANHOS" value={ganhos} w={100} />
          <DataCol
            label={isDirect ? 'RB (Ind.)' : `RB AG. (${agent.rb_rate}%)`}
            value={rbAgente}
            customColor={isDirect ? 'text-blue-400' : 'text-purple-400'}
            w={100}
          />
          <DataCol
            label="SALDO ANT."
            value={saldoAnterior}
            customColor="text-yellow-400"
            showZero
            w={100}
          />
          <DataCol
            label="PAGO"
            value={pago}
            customColor="text-sky-400"
            w={100}
          />
          <DataCol
            label="SALDO"
            value={pendente}
            isFinal
            w={100}
          />
        </div>

        {/* Col 4: Actions — fixed */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-1">
          {hasMov && (
            <button
              onClick={(e) => { e.stopPropagation(); onGenerateStatement(); }}
              className="text-xs px-3 py-1.5 whitespace-nowrap border border-emerald-500/50 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors"
            >
              {Math.abs(pendente) < 0.01 && hasMov ? 'Comprovante Gerado' : 'Gerar Comprovante'}
            </button>
          )}
          <button
            onClick={onToggleExpand}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
            className="text-xs text-dark-400 hover:text-dark-200 whitespace-nowrap transition-colors"
          >
            ▶ Detalhes
          </button>
        </div>
      </div>

      {/* Expanded section */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-dark-700/30">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Financial summary */}
            <div>
              <h4 className="text-xs font-bold text-dark-300 uppercase tracking-wider mb-3">
                Resumo Financeiro
              </h4>
              <div className="space-y-1.5 text-sm">
                <FinRow label="Ganhos/Perdas" value={data.ganhos} />
                <FinRow label="Rake Gerado" value={data.rakeTotal} muted />
                {rbAgente > 0.01 && (
                  <FinRow
                    label={isDirect ? 'RB Individual (Σ jogadores)' : `RB Agente (${agent.rb_rate}%)`}
                    value={rbAgente}
                    customColor={isDirect ? 'text-blue-400' : 'text-purple-400'}
                  />
                )}
                <div className="border-t border-dark-700/30 pt-1.5">
                  <FinRow label="Resultado da Semana" value={data.resultado} bold />
                </div>
                <FinRow label="Saldo Anterior" value={data.saldoAnterior} customColor="text-yellow-400" />
                <div className="border-t border-dark-700/30 pt-1.5">
                  <FinRow label="Total Devido" value={data.totalDevido} bold />
                </div>
                {hasPago && (
                  <>
                    <FinRow label="Pagamentos" value={data.pago} customColor="text-sky-400" />
                    <div className="border-t-2 border-dark-700/30 pt-1.5">
                      <FinRow label="Saldo Final" value={data.pendente} bold large />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Player table */}
            <div>
              <h4 className="text-xs font-bold text-dark-300 uppercase tracking-wider mb-3">
                Jogadores ({players.length})
              </h4>
              {players.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-dark-700/50 text-dark-400">
                        <th className="py-1.5 text-left font-medium">Nick</th>
                        <th className="py-1.5 text-left font-medium">ID</th>
                        <th className="py-1.5 text-right font-medium">P/L</th>
                        <th className="py-1.5 text-right font-medium">Rake</th>
                        <th className="py-1.5 text-right font-medium">Resultado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-800/30">
                      {players.map((p, i) => (
                        <tr key={i} className={i % 2 ? 'bg-dark-800/10' : ''}>
                          <td className="py-1 text-dark-200 font-medium">{p.nickname || '—'}</td>
                          <td className="py-1 text-dark-500 text-[10px] font-mono">{p.external_player_id || '—'}</td>
                          <td className={`py-1 text-right font-mono ${clr(Number(p.winnings_brl))}`}>
                            {formatBRL(Number(p.winnings_brl))}
                          </td>
                          <td className="py-1 text-right font-mono text-dark-300">
                            {formatBRL(Number(p.rake_total_brl))}
                          </td>
                          <td className={`py-1 text-right font-mono font-bold ${clr(Number(p.resultado_brl))}`}>
                            {formatBRL(Number(p.resultado_brl))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-dark-500 text-xs">Nenhum jogador vinculado</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Data Column (card row) ──────────────────────────────────────────

function DataCol({ label, value, customColor, isFinal, tooltip, showZero, w }: {
  label: string;
  value: number;
  customColor?: string;
  isFinal?: boolean;
  tooltip?: string;
  showZero?: boolean;
  w?: number;
}) {
  const hasValue = Math.abs(value) > 0.01 || showZero;
  const color = customColor || clr(value);

  return (
    <div
      className={`text-right flex-shrink-0 ${isFinal ? 'bg-dark-700/20 rounded-lg py-1 px-2' : 'px-1'}`}
      style={{ width: w ? `${w}px` : undefined, minWidth: w ? undefined : '60px' }}
      title={tooltip}
    >
      <p className="text-[9px] text-dark-500 uppercase tracking-wider font-bold mb-0.5">{label}</p>
      <p className={`font-mono text-sm font-bold ${hasValue ? color : 'text-dark-600'}`}>
        {hasValue ? formatBRL(value) : '—'}
      </p>
    </div>
  );
}

// ─── Financial Row (expand + statement) ──────────────────────────────

function FinRow({ label, value, muted, bold, large, customColor }: {
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

// ─── Statement View (Print-Friendly) ─────────────────────────────────

function StatementView({ data, subclubName, weekStart, weekEnd, onBack }: {
  data: AgentFinancials;
  subclubName: string;
  weekStart: string;
  weekEnd: string;
  onBack: () => void;
}) {
  const { agent, players, entries } = data;
  const isDirect = agent.is_direct;
  const statementRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  async function handleExportJPG() {
    if (!statementRef.current || exporting) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(statementRef.current, {
        backgroundColor: '#0f0f13',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      const safeName = agent.agent_name.replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = `comprovante_${safeName}_${weekStart}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    } catch (err) {
      console.error(err);
      toast('Erro ao exportar JPG', 'error');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      {/* Controls (hidden on print) */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <button
          onClick={onBack}
          className="text-dark-400 hover:text-dark-200 text-sm flex items-center gap-1 transition-colors"
        >
          ← Voltar para lista
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportJPG}
            disabled={exporting}
            aria-label="Exportar como JPG"
            className="btn-secondary text-sm px-4 py-2 flex items-center gap-2"
          >
            {exporting ? 'Exportando...' : 'Exportar JPG'}
          </button>
          <button
            onClick={() => window.print()}
            aria-label="Imprimir comprovante"
            className="btn-primary text-sm px-4 py-2 flex items-center gap-2"
          >
            Imprimir
          </button>
        </div>
      </div>

      {/* Statement */}
      <div ref={statementRef} className="card print:shadow-none print:border-none print:bg-white print:text-black max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 pb-4 border-b border-dark-700/50 print:border-black/20">
          <h2 className="text-xl font-bold text-white print:text-black">
            Demonstrativo de Rakeback
          </h2>
          <p className="text-dark-400 print:text-gray-600 text-sm mt-1">
            {subclubName} — Semana {fmtDate(weekStart)} a {fmtDate(weekEnd)}
          </p>
          <p className="text-lg font-semibold text-poker-400 print:text-black mt-2">
            {agent.agent_name}
            {isDirect && <span className="text-blue-400 text-xs ml-2 print:text-blue-700">(DIRETO)</span>}
            <span
              className={`text-xs ml-2 px-1.5 py-0.5 rounded font-bold border ${
                (agent.payment_type || 'fiado') === 'avista'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 print:text-green-700 print:border-green-600'
                  : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40 print:text-yellow-700 print:border-yellow-600'
              }`}
            >
              {(agent.payment_type || 'fiado') === 'avista' ? 'A VISTA' : 'FIADO'}
            </span>
          </p>
        </div>

        {/* Summary grid */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <MiniStat label="Jogadores" value={String(agent.player_count)} />
          <MiniStat label="Rake Total" value={formatBRL(data.rakeTotal)} />
          <MiniStat label="RB Rate" value={`${agent.rb_rate}%`} />
          <MiniStat label="Comissao RB" value={formatBRL(data.rbAgente)} />
        </div>

        {/* Financial summary */}
        <div className="bg-dark-800/30 print:bg-gray-50 rounded-lg p-4 mb-6">
          <h4 className="text-xs font-bold text-dark-400 print:text-gray-600 uppercase tracking-wider mb-3">
            Resumo Financeiro
          </h4>
          <div className="space-y-2 text-sm">
            <PrintFinRow label="Ganhos/Perdas" value={data.ganhos} />
            <PrintFinRow label="Rake Gerado" value={data.rakeTotal} muted />
            {data.rbAgente > 0.01 && (
              <PrintFinRow
                label={isDirect ? 'RB Individual' : `RB Agente (${agent.rb_rate}%)`}
                value={data.rbAgente}
              />
            )}
            <div className="border-t border-dark-700/30 print:border-gray-300 pt-2">
              <PrintFinRow label="Resultado da Semana" value={data.resultado} bold />
            </div>
            <PrintFinRow label="Saldo Anterior" value={data.saldoAnterior} />
            <div className="border-t border-dark-700/30 print:border-gray-300 pt-2">
              <PrintFinRow label="Total Devido" value={data.totalDevido} bold />
            </div>
            {Math.abs(data.pago) > 0.01 && (
              <>
                <PrintFinRow label="Pagamentos" value={data.pago} />
                <div className="border-t-2 border-dark-700/30 print:border-gray-400 pt-2">
                  <PrintFinRow label="Saldo Final" value={data.pendente} bold large />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Player table */}
        <h4 className="text-xs text-dark-500 print:text-gray-600 uppercase tracking-wider font-semibold mb-2">
          Jogadores ({players.length})
        </h4>
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b border-dark-700/50 print:border-black/20 text-dark-400 print:text-gray-600 text-xs">
              <th className="py-2 text-left font-medium">Jogador</th>
              <th className="py-2 text-right font-medium">Ganhos</th>
              <th className="py-2 text-right font-medium">Rake</th>
              <th className="py-2 text-right font-medium">GGR</th>
              <th className="py-2 text-right font-medium">RB %</th>
              <th className="py-2 text-right font-medium">RB Valor</th>
              <th className="py-2 text-right font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-800/30 print:divide-black/10">
            {players.map((p, i) => (
              <tr key={i}>
                <td className="py-1.5 text-dark-200 print:text-black">
                  {p.nickname}
                  <span className="text-dark-500 print:text-gray-500 text-xs ml-1">#{p.external_player_id}</span>
                </td>
                <td className={`py-1.5 text-right font-mono ${clrPrint(Number(p.winnings_brl))}`}>
                  {formatBRL(Number(p.winnings_brl))}
                </td>
                <td className="py-1.5 text-right font-mono text-dark-300 print:text-black">
                  {formatBRL(Number(p.rake_total_brl))}
                </td>
                <td className="py-1.5 text-right font-mono text-dark-300 print:text-black">
                  {Number(p.ggr_brl) !== 0 ? formatBRL(Number(p.ggr_brl)) : '—'}
                </td>
                <td className="py-1.5 text-right text-dark-400 print:text-gray-600">
                  {Number(p.rb_rate) > 0 ? `${p.rb_rate}%` : '—'}
                </td>
                <td className="py-1.5 text-right font-mono text-dark-300 print:text-black">
                  {Number(p.rb_value_brl) > 0 ? formatBRL(Number(p.rb_value_brl)) : '—'}
                </td>
                <td className={`py-1.5 text-right font-mono font-bold ${clrPrint(Number(p.resultado_brl))}`}>
                  {formatBRL(Number(p.resultado_brl))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Movements */}
        {entries.length > 0 && (
          <>
            <h4 className="text-xs text-dark-500 print:text-gray-600 uppercase tracking-wider font-semibold mb-2">
              Movimentacoes ({entries.length})
            </h4>
            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="border-b border-dark-700/50 print:border-black/20 text-dark-400 print:text-gray-600 text-xs">
                  <th className="py-2 text-left font-medium">Data</th>
                  <th className="py-2 text-center font-medium">Dir</th>
                  <th className="py-2 text-right font-medium">Valor</th>
                  <th className="py-2 text-left font-medium">Metodo</th>
                  <th className="py-2 text-left font-medium">Descricao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/30 print:divide-black/10">
                {entries.map(e => (
                  <tr key={e.id}>
                    <td className="py-1.5 text-dark-300 print:text-black text-xs font-mono">{fmtDateTime(e.created_at)}</td>
                    <td className="py-1.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        e.dir === 'IN' ? 'bg-poker-900/30 text-poker-400 print:text-green-700' : 'bg-red-900/30 text-red-400 print:text-red-700'
                      }`}>
                        {e.dir}
                      </span>
                    </td>
                    <td className={`py-1.5 text-right font-mono ${e.dir === 'IN' ? 'text-poker-400 print:text-green-700' : 'text-red-400 print:text-red-700'}`}>
                      {formatBRL(Number(e.amount))}
                    </td>
                    <td className="py-1.5 text-dark-400 print:text-gray-600 text-xs">{e.method || '—'}</td>
                    <td className="py-1.5 text-dark-400 print:text-gray-600 text-xs">{e.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Status footer */}
        <div className={`rounded-lg p-4 border-2 ${
          Math.abs(data.pendente) < 0.01
            ? 'bg-green-950/30 border-green-700/50 print:border-green-600'
            : Math.abs(data.pago) > 0.01
              ? 'bg-orange-950/20 border-orange-700/30 print:border-orange-600'
              : 'bg-dark-800/50 border-dark-600/50 print:border-black/20'
        }`}>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-[10px] text-dark-500 print:text-gray-600 uppercase mb-1">Resultado</p>
              <p className={`font-mono font-bold ${clrPrint(data.resultado)}`}>
                {formatBRL(data.resultado)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-dark-500 print:text-gray-600 uppercase mb-1">Total Pago</p>
              <p className="font-mono font-bold text-sky-400 print:text-blue-700">
                {formatBRL(data.totalOut)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-dark-500 print:text-gray-600 uppercase mb-1">
                {Math.abs(data.pendente) < 0.01 ? 'Quitado' : Math.abs(data.pago) > 0.01 ? 'Parcial' : 'Pendente'}
              </p>
              <p className={`font-mono font-bold ${
                Math.abs(data.pendente) < 0.01 ? 'text-green-400 print:text-green-700' : 'text-yellow-400 print:text-orange-600'
              }`}>
                {formatBRL(data.pendente)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-dark-500 print:text-gray-600 uppercase tracking-wider mb-1">{label}</p>
      <p className="font-mono font-bold text-dark-200 print:text-black">{value}</p>
    </div>
  );
}

function PrintFinRow({ label, value, muted, bold, large }: {
  label: string;
  value: number;
  muted?: boolean;
  bold?: boolean;
  large?: boolean;
}) {
  const color = muted ? 'text-dark-400 print:text-gray-500' : clrPrint(value);
  return (
    <div className="flex items-center justify-between">
      <span className={`${bold ? 'font-bold text-dark-200 print:text-black' : 'text-dark-300 print:text-gray-700'}`}>
        {label}
      </span>
      <span className={`font-mono ${large ? 'text-lg' : ''} ${bold ? 'font-extrabold' : 'font-bold'} ${color}`}>
        {formatBRL(value)}
      </span>
    </div>
  );
}
