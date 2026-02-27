'use client';

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import {
  listLedger,
  createLedgerEntry,
  deleteLedgerEntry,
  getCarryForward,
  updateAgentPaymentType,
  formatBRL,
} from '@/lib/api';
import { round2 } from '@/lib/formatters';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useSortable } from '@/lib/useSortable';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/useAuth';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { LedgerEntry, AgentMetric, SubclubData } from '@/types/settlement';
import SettlementSkeleton from '@/components/ui/SettlementSkeleton';
import { Users, Download, Search } from 'lucide-react';
import { exportCsv } from '@/lib/exportCsv';
import KpiCard from '@/components/ui/KpiCard';
import EmptyState from '@/components/ui/EmptyState';
import Highlight from '@/components/ui/Highlight';

interface Props {
  subclub: Pick<SubclubData, 'id' | 'name' | 'agents' | 'players'>;
  weekStart: string;
  clubId: string;
  settlementId: string;
  settlementStatus: string;
  onDataChange: () => void;
}

type DirFilter = 'todos' | 'pagar' | 'receber';
type EntityStatus = 'quitado' | 'credito' | 'parcial' | 'aberto' | 'sem-mov';
type LiqSortKey = 'nome' | 'resultado' | 'saldoAnt' | 'totalDevido' | 'pago' | 'pendente' | 'status';

// ─── Component ──────────────────────────────────────────────────────

export default function Liquidacao({
  subclub,
  weekStart,
  clubId,
  settlementId,
  settlementStatus,
  onDataChange,
}: Props) {
  const isDraft = settlementStatus === 'DRAFT';
  const agents = useMemo(() => subclub.agents || [], [subclub.agents]);
  const allPlayers = useMemo(() => subclub.players || [], [subclub.players]);
  const { toast } = useToast();
  const { canAccess } = useAuth();
  const canPay = canAccess('OWNER', 'ADMIN', 'FINANCEIRO');
  const { confirm, ConfirmDialogElement } = useConfirmDialog();

  const [allEntries, setAllEntries] = useState<LedgerEntry[]>([]);
  const [carryMap, setCarryMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [quickPayAgent, setQuickPayAgent] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', method: '', description: '', dir: 'OUT' as 'IN' | 'OUT' });
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm);
  const [dirFilter, setDirFilter] = useState<DirFilter>('todos');
  const [paymentTypeLoading, setPaymentTypeLoading] = useState<Set<string>>(new Set());
  const [paymentTypeOverrides, setPaymentTypeOverrides] = useState<Record<string, 'fiado' | 'avista'>>({});
  const [viewTab, setViewTab] = useState<'agencias' | 'jogadores'>('agencias');
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const loadLedger = useCallback(async () => {
    setLoading(true);
    try {
      const [ledgerRes, carryRes] = await Promise.all([listLedger(weekStart), getCarryForward(weekStart, clubId)]);
      if (!mountedRef.current) return;
      if (ledgerRes.success) setAllEntries(ledgerRes.data || []);
      if (carryRes.success) setCarryMap(carryRes.data || {});
    } catch {
      if (!mountedRef.current) return;
      toast('Erro ao carregar dados de liquidacao', 'error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [weekStart, clubId, toast]);

  // Unified direct logic: backend annotations (agent.is_direct, player.agent_is_direct) + "SEM AGENTE"
  const directNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const a of agents) {
      if (a.is_direct) set.add(a.agent_name.toLowerCase());
    }
    for (const p of allPlayers) {
      if (p.agent_is_direct) set.add((p.agent_name || '').toLowerCase());
    }
    set.add('sem agente');
    set.add('(sem agente)');
    return set;
  }, [agents, allPlayers]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  // Group ledger entries by entity_id
  const ledgerByEntity = useMemo(() => {
    const map = new Map<string, LedgerEntry[]>();
    for (const e of allEntries) {
      if (!map.has(e.entity_id)) map.set(e.entity_id, []);
      map.get(e.entity_id)!.push(e);
    }
    return map;
  }, [allEntries]);

  // Group players by agent name for broad ledger matching
  const playersByAgent = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const p of allPlayers) {
      const key = p.agent_name || 'SEM AGENTE';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [allPlayers]);

  // Compute per-agent liquidation data with canonical formula
  const agentLiq = useMemo(() => {
    const agentNames = new Set(agents.map((a) => a.agent_name));

    function computeLiq(agent: AgentMetric) {
      // Resolve entries — match by agent IDs + all player-level keys
      const seen = new Set<string>();
      const entries: LedgerEntry[] = [];
      function add(list: LedgerEntry[] | undefined) {
        if (!list) return;
        for (const e of list) {
          if (!seen.has(e.id)) {
            seen.add(e.id);
            entries.push(e);
          }
        }
      }
      // Agent-level keys
      add(ledgerByEntity.get(agent.id));
      if (agent.agent_id) add(ledgerByEntity.get(agent.agent_id));
      // Player-level keys (ChipPix stores as cp_<id>, OFX by player_id, etc.)
      const agPlayers = playersByAgent.get(agent.agent_name) || [];
      for (const p of agPlayers) {
        if (p.id) add(ledgerByEntity.get(p.id));
        if (p.player_id) add(ledgerByEntity.get(p.player_id));
        if (p.external_player_id) {
          const eid = String(p.external_player_id);
          add(ledgerByEntity.get(eid));
          add(ledgerByEntity.get(`cp_${eid}`));
        }
      }

      const totalIn = entries.filter((e) => e.dir === 'IN').reduce((s, e) => s + Number(e.amount), 0);
      const totalOut = entries.filter((e) => e.dir === 'OUT').reduce((s, e) => s + Number(e.amount), 0);
      const resultado = Number(agent.resultado_brl) || 0;

      // Canonical formula: pendente = totalDevido + pago
      const saldoAnterior = (agent.agent_id && carryMap[agent.agent_id]) || 0;
      const totalDevido = round2(resultado + saldoAnterior);
      const pago = round2(totalIn - totalOut);
      const pendente = round2(totalDevido + pago);

      const hasMov = Math.abs(totalDevido) > 0.01 || Math.abs(pago) > 0.01;
      const direcao = resultado > 0.01 ? 'A Receber' : resultado < -0.01 ? 'A Pagar' : 'Neutro';

      // Status determination (5 states like HTML)
      let status: EntityStatus;
      if (!hasMov) {
        status = 'sem-mov';
      } else if (Math.abs(pendente) < 0.01) {
        status = 'quitado';
      } else if (
        Math.abs(totalDevido) > 0.01 &&
        ((totalDevido > 0 && pendente < -0.01) || (totalDevido < 0 && pendente > 0.01))
      ) {
        status = 'credito';
      } else if (entries.length > 0) {
        status = 'parcial';
      } else {
        status = 'aberto';
      }

      return { agent, entries, totalIn, totalOut, resultado, saldoAnterior, totalDevido, pago, pendente, direcao, status, hasMov };
    }

    const result = agents.map(computeLiq);

    // Add orphan direct player groups (players whose agent_name has no agent_week_metrics entry)
    for (const [agName, agPlayers] of playersByAgent) {
      if (agentNames.has(agName)) continue;
      if (!directNameSet.has(agName.toLowerCase())) continue;
      const synAgent: AgentMetric = {
        id: `orphan_${agName}`,
        agent_id: null,
        agent_name: agName,
        player_count: agPlayers.length,
        rake_total_brl: agPlayers.reduce((s, p) => s + (Number(p.rake_total_brl) || 0), 0),
        ganhos_total_brl: agPlayers.reduce((s, p) => s + (Number(p.winnings_brl) || 0), 0),
        commission_brl: agPlayers.reduce((s, p) => s + (Number(p.rb_value_brl) || 0), 0),
        resultado_brl: agPlayers.reduce((s, p) => s + (Number(p.resultado_brl) || 0), 0),
        is_direct: true,
      };
      result.push(computeLiq(synAgent));
    }

    return result;
  }, [agents, ledgerByEntity, playersByAgent, carryMap, directNameSet]);

  // Helper: check if agent is direct via backend annotation
  const isAgentDirect = useCallback(
    (agent: AgentMetric) => {
      return agent.is_direct === true || directNameSet.has(agent.agent_name.toLowerCase());
    },
    [directNameSet],
  );

  // Tab counts
  const tabCounts = useMemo(() => {
    const agencias = agentLiq.filter((a) => !isAgentDirect(a.agent)).length;
    const jogadores = allPlayers.filter(
      (p) => p.agent_is_direct || directNameSet.has((p.agent_name || '').toLowerCase()),
    ).length;
    return { agencias, jogadores };
  }, [agentLiq, isAgentDirect, allPlayers, directNameSet]);

  // Filter: tab + direction + search
  const filtered = useMemo(() => {
    let result = agentLiq;
    if (viewTab === 'agencias') {
      result = result.filter((a) => !isAgentDirect(a.agent));
    } else {
      result = result.filter((a) => isAgentDirect(a.agent));
    }
    if (dirFilter === 'pagar') {
      result = result.filter((a) => a.direcao === 'A Pagar');
    } else if (dirFilter === 'receber') {
      result = result.filter((a) => a.direcao === 'A Receber');
    }
    if (debouncedSearch) {
      const term = debouncedSearch.toLowerCase();
      result = result.filter((a) => a.agent.agent_name.toLowerCase().includes(term));
    }
    return result;
  }, [agentLiq, viewTab, dirFilter, debouncedSearch, isAgentDirect]);

  // Sortable table columns
  const getSortValue = useCallback(
    (item: (typeof filtered)[0], key: LiqSortKey): string | number => {
      switch (key) {
        case 'nome': return item.agent.agent_name;
        case 'resultado': return item.resultado;
        case 'saldoAnt': return item.saldoAnterior;
        case 'totalDevido': return item.totalDevido;
        case 'pago': return item.pago;
        case 'pendente': return item.pendente;
        case 'status': {
          const order: Record<EntityStatus, number> = { aberto: 0, parcial: 1, credito: 2, quitado: 3, 'sem-mov': 4 };
          return order[item.status] ?? 9;
        }
      }
    },
    [],
  );

  const { sorted, handleSort, sortIcon, ariaSort } = useSortable({
    data: filtered,
    defaultKey: 'pendente' as LiqSortKey,
    defaultDir: 'asc',
    getValue: getSortValue,
  });

  // KPI totals (tab-aware)
  const kpis = useMemo(() => {
    const tabData =
      viewTab === 'agencias'
        ? agentLiq.filter((a) => !isAgentDirect(a.agent))
        : agentLiq.filter((a) => isAgentDirect(a.agent));
    const withMov = tabData.filter((a) => a.hasMov);
    const totalRecebido = round2(tabData.reduce((s, a) => s + a.totalIn, 0));
    const totalPago = round2(tabData.reduce((s, a) => s + a.totalOut, 0));
    const quitados = tabData.filter((a) => a.status === 'quitado').length;
    const comMov = withMov.length;
    return { totalRecebido, totalPago, quitados, comMov, total: tabData.length };
  }, [agentLiq, viewTab, isAgentDirect]);

  // Direction data (for KPIs + filter counts)
  const dirData = useMemo(() => {
    const tabData =
      viewTab === 'agencias'
        ? agentLiq.filter((a) => !isAgentDirect(a.agent))
        : agentLiq.filter((a) => isAgentDirect(a.agent));
    const aPagar = tabData.filter((a) => a.direcao === 'A Pagar');
    const aReceber = tabData.filter((a) => a.direcao === 'A Receber');
    return {
      aPagarTotal: round2(aPagar.reduce((s, a) => s + Math.abs(a.pendente), 0)),
      aPagarCount: aPagar.length,
      aReceberTotal: round2(aReceber.reduce((s, a) => s + a.pendente, 0)),
      aReceberCount: aReceber.length,
      saldoLiquido: round2(tabData.reduce((s, a) => s + a.pendente, 0)),
    };
  }, [agentLiq, viewTab, isAgentDirect]);

  // Footer totals (visible rows)
  const footerTotals = useMemo(() => ({
    resultado: round2(sorted.reduce((s, a) => s + a.resultado, 0)),
    saldoAnterior: round2(sorted.reduce((s, a) => s + a.saldoAnterior, 0)),
    totalDevido: round2(sorted.reduce((s, a) => s + a.totalDevido, 0)),
    pago: round2(sorted.reduce((s, a) => s + a.pago, 0)),
    pendente: round2(sorted.reduce((s, a) => s + a.pendente, 0)),
  }), [sorted]);

  const pctQuit = kpis.comMov > 0 ? Math.round((kpis.quitados / kpis.comMov) * 100) : 0;

  function toggleAgent(id: string) {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openQuickPay(agent: AgentMetric, pendente: number) {
    setQuickPayAgent(agent.id);
    setPayForm({
      amount: String(Math.abs(round2(pendente))),
      method: 'PIX',
      description: `Pagamento ${agent.agent_name}`,
      dir: pendente > 0 ? 'OUT' : 'IN',
    });
  }

  async function handleQuickPay(agent: AgentMetric) {
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) return;

    setSaving(true);
    try {
      const res = await createLedgerEntry({
        entity_id: agent.agent_id || agent.id,
        entity_name: agent.agent_name,
        week_start: weekStart,
        dir: payForm.dir,
        amount,
        method: payForm.method || undefined,
        description: payForm.description || undefined,
      });
      if (res.success) {
        setQuickPayAgent(null);
        loadLedger();
        onDataChange();
        toast('Pagamento registrado', 'success');
      }
    } catch {
      toast('Erro ao registrar pagamento', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEntry(id: string) {
    const ok = await confirm({ title: 'Excluir Movimentacao', message: 'Excluir esta movimentacao?', variant: 'danger' });
    if (!ok) return;
    try {
      const res = await deleteLedgerEntry(id);
      if (res.success) {
        loadLedger();
        onDataChange();
        toast('Movimentacao excluida', 'success');
      }
    } catch {
      toast('Erro ao excluir movimentacao', 'error');
    }
  }

  async function handleTogglePaymentType(agentId: string, currentType: 'fiado' | 'avista') {
    const newType = currentType === 'fiado' ? 'avista' : 'fiado';
    setPaymentTypeLoading((prev) => new Set(prev).add(agentId));
    try {
      const res = await updateAgentPaymentType(settlementId, agentId, newType);
      if (res.success) {
        setPaymentTypeOverrides((prev) => ({ ...prev, [agentId]: newType }));
        onDataChange();
      }
    } catch {
      toast('Erro ao alterar tipo de pagamento', 'error');
    } finally {
      setPaymentTypeLoading((prev) => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    }
  }

  function fmtDate(dt: string) {
    return new Date(dt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  if (loading) {
    return <SettlementSkeleton kpis={5} />;
  }

  return (
    <div>
      {/* ═══ HEADER: Title + Tabs + Search + CSV ═══ */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-white">Liquidacao — {subclub.name}</h2>
            <p className="text-dark-400 text-sm">Status de pagamento por entidade</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Tab buttons */}
            <button
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-200 ${
                viewTab === 'agencias'
                  ? 'bg-poker-900/20 border-poker-500 text-poker-400'
                  : 'bg-dark-800 border-dark-700 text-dark-400 hover:border-poker-500/50 hover:text-poker-400'
              }`}
              onClick={() => setViewTab('agencias')}
            >
              Agencias
              <span className="text-xs bg-dark-800 px-1.5 py-0.5 rounded font-mono">{tabCounts.agencias}</span>
            </button>
            <button
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-200 ${
                viewTab === 'jogadores'
                  ? 'bg-poker-900/20 border-poker-500 text-poker-400'
                  : 'bg-dark-800 border-dark-700 text-dark-400 hover:border-poker-500/50 hover:text-poker-400'
              }`}
              onClick={() => setViewTab('jogadores')}
            >
              Jogadores
              <span className="text-xs bg-dark-800 px-1.5 py-0.5 rounded font-mono">{tabCounts.jogadores}</span>
            </button>

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-8 w-40 text-sm"
              />
            </div>

            {/* CSV export */}
            <button
              onClick={() => {
                const headers = ['Agente', 'Resultado', 'Saldo Ant.', 'Total Devido', 'Total Pago', 'Em Aberto', 'Direcao', 'Status'];
                const rows = sorted.map(({ agent, resultado, saldoAnterior, totalDevido, pago, pendente, direcao, status }) => [
                  agent.agent_name, resultado, saldoAnterior, totalDevido, pago, pendente, direcao, status,
                ]);
                exportCsv(`liquidacao_${subclub.name}`, headers, rows);
              }}
              className="btn-ghost text-xs flex items-center gap-1.5 shrink-0"
              title="Exportar CSV"
            >
              <Download size={14} />
              <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* ═══ KPI CARDS (5 columns) ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <KpiCard
          label="Progresso"
          value={`${kpis.quitados} de ${kpis.comMov}`}
          subtitle="quitados"
          accentColor="bg-blue-500"
          tooltip={`${kpis.quitados} entidades quitadas de ${kpis.comMov} com movimentacao`}
        />
        <KpiCard
          label="A Pagar"
          value={formatBRL(dirData.aPagarTotal)}
          subtitle={`${dirData.aPagarCount} entidades`}
          accentColor="bg-red-500"
          valueColor="text-red-400"
          tooltip="Soma dos pendentes das entidades que o clube deve"
        />
        <KpiCard
          label="A Receber"
          value={formatBRL(dirData.aReceberTotal)}
          subtitle={`${dirData.aReceberCount} entidades`}
          accentColor="bg-emerald-500"
          valueColor="text-emerald-400"
          tooltip="Soma dos pendentes das entidades que devem ao clube"
        />
        <KpiCard
          label="Saldo Liquido"
          value={formatBRL(dirData.saldoLiquido)}
          subtitle={dirData.saldoLiquido > 0.01 ? 'favoravel ao clube' : dirData.saldoLiquido < -0.01 ? 'favoravel a agentes' : 'zerado'}
          accentColor={Math.abs(dirData.saldoLiquido) < 0.01 ? 'bg-emerald-500' : 'bg-yellow-500'}
          valueColor={Math.abs(dirData.saldoLiquido) < 0.01 ? 'text-emerald-400' : 'text-yellow-400'}
          tooltip={`Saldo liquido = soma de todos os pendentes = ${formatBRL(dirData.saldoLiquido)}`}
        />
        <KpiCard
          label="Movimentado"
          value={formatBRL(kpis.totalRecebido + kpis.totalPago)}
          subtitle="total ja pago/recebido"
          accentColor="bg-yellow-500"
          valueColor="text-yellow-400"
          tooltip={`Recebido: ${formatBRL(kpis.totalRecebido)} + Pago: ${formatBRL(kpis.totalPago)}`}
        />
      </div>

      {/* ═══ PROGRESS BAR ═══ */}
      {kpis.comMov > 0 && (
        <div className="card mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-dark-400">Progresso de liquidacao</span>
            <span className="text-xs font-mono text-dark-300 font-bold">
              {kpis.quitados}/{kpis.comMov} quitados ({pctQuit}%)
            </span>
          </div>
          <div className="w-full bg-dark-800 rounded-full h-2.5 shadow-inner">
            <div
              className={`h-2.5 rounded-full animate-progress-fill shadow-glow-green ${
                pctQuit === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'
              }`}
              style={{ width: `${pctQuit}%` }}
            />
          </div>
        </div>
      )}

      {/* ═══ DIRECTION FILTER ═══ */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setDirFilter('todos')}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            dirFilter === 'todos'
              ? 'bg-dark-700/40 border-dark-500 text-dark-200'
              : 'bg-dark-800/50 border-dark-700/30 text-dark-400 hover:text-dark-200'
          }`}
        >
          Todos ({kpis.total})
        </button>
        <button
          onClick={() => setDirFilter('pagar')}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            dirFilter === 'pagar'
              ? 'bg-red-500/10 border-red-500/50 text-red-400'
              : 'bg-dark-800/50 border-dark-700/30 text-dark-400 hover:text-red-400'
          }`}
        >
          A Pagar ({dirData.aPagarCount})
        </button>
        <button
          onClick={() => setDirFilter('receber')}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            dirFilter === 'receber'
              ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
              : 'bg-dark-800/50 border-dark-700/30 text-dark-400 hover:text-emerald-400'
          }`}
        >
          A Receber ({dirData.aReceberCount})
        </button>
      </div>

      {/* ═══ SECTION HEADER ═══ */}
      {dirFilter !== 'todos' && (
        <div
          className={`border-l-4 ${
            dirFilter === 'pagar' ? 'border-red-500' : 'border-emerald-500'
          } bg-dark-900/50 px-4 py-2 rounded-r-lg mb-3 flex items-center justify-between`}
        >
          <span className="text-sm font-medium text-dark-200">
            {dirFilter === 'pagar' ? 'A Pagar' : 'A Receber'} ({sorted.length})
          </span>
          <span className="text-sm font-mono text-dark-400">
            em aberto:{' '}
            <span className={dirFilter === 'pagar' ? 'text-red-400' : 'text-emerald-400'}>
              {formatBRL(Math.abs(footerTotals.pendente))}
            </span>
          </span>
        </div>
      )}

      {/* ═══ DATA TABLE ═══ */}
      {sorted.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Users}
            title={agents.length === 0 ? 'Nenhum agente neste subclube' : 'Nenhum agente encontrado'}
            description={agents.length === 0 ? 'Importe dados para popular os agentes' : 'Tente ajustar os filtros de busca'}
          />
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm data-table">
              <thead>
                <tr className="bg-dark-800/50 text-dark-400 text-left text-xs uppercase tracking-wider">
                  <th
                    scope="col"
                    className="p-3 cursor-pointer hover:text-dark-200"
                    onClick={() => handleSort('nome')}
                    role="columnheader"
                    aria-sort={ariaSort('nome')}
                  >
                    Agente{sortIcon('nome')}
                  </th>
                  <th
                    scope="col"
                    className="p-3 text-right cursor-pointer hover:text-dark-200"
                    onClick={() => handleSort('resultado')}
                    role="columnheader"
                    aria-sort={ariaSort('resultado')}
                  >
                    Resultado{sortIcon('resultado')}
                  </th>
                  <th
                    scope="col"
                    className="p-3 text-right cursor-pointer hover:text-dark-200"
                    onClick={() => handleSort('saldoAnt')}
                    role="columnheader"
                    aria-sort={ariaSort('saldoAnt')}
                  >
                    Saldo Ant.{sortIcon('saldoAnt')}
                  </th>
                  <th
                    scope="col"
                    className="p-3 text-right cursor-pointer hover:text-dark-200"
                    onClick={() => handleSort('totalDevido')}
                    role="columnheader"
                    aria-sort={ariaSort('totalDevido')}
                  >
                    Total Devido{sortIcon('totalDevido')}
                  </th>
                  <th
                    scope="col"
                    className="p-3 text-right cursor-pointer hover:text-dark-200"
                    onClick={() => handleSort('pago')}
                    role="columnheader"
                    aria-sort={ariaSort('pago')}
                  >
                    Total Pago{sortIcon('pago')}
                  </th>
                  <th
                    scope="col"
                    className="p-3 text-right cursor-pointer hover:text-dark-200"
                    onClick={() => handleSort('pendente')}
                    role="columnheader"
                    aria-sort={ariaSort('pendente')}
                  >
                    Em Aberto{sortIcon('pendente')}
                  </th>
                  <th
                    scope="col"
                    className="p-3 text-center cursor-pointer hover:text-dark-200"
                    onClick={() => handleSort('status')}
                    role="columnheader"
                    aria-sort={ariaSort('status')}
                  >
                    Status{sortIcon('status')}
                  </th>
                  <th scope="col" className="p-3 text-right">
                    Acao
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/50">
                {sorted.map((item) => {
                  const { agent, entries, resultado, saldoAnterior, totalDevido, pago, pendente, status, hasMov } = item;
                  const isExpanded = expandedAgents.has(agent.id);
                  const isQuickPay = quickPayAgent === agent.id;
                  const currentPaymentType = paymentTypeOverrides[agent.id] || agent.payment_type || 'fiado';
                  const isPayTypeLoading = paymentTypeLoading.has(agent.id);

                  return (
                    <Fragment key={agent.id}>
                      {/* Main row */}
                      <tr className={`${!hasMov ? 'opacity-50' : ''}`}>
                        {/* AGENTE */}
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleAgent(agent.id)}
                              className="text-dark-400 hover:text-dark-200 transition-colors"
                              aria-label={isExpanded ? 'Recolher' : 'Expandir'}
                            >
                              <span className={`inline-block transition-transform text-xs ${isExpanded ? 'rotate-90' : ''}`}>
                                {'\u25B6'}
                              </span>
                            </button>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-white font-semibold truncate">
                                  <Highlight text={agent.agent_name} query={debouncedSearch} />
                                </span>
                                <span className="text-dark-500 text-xs shrink-0">{agent.player_count} jog.</span>
                                {isAgentDirect(agent) && (
                                  <span className="text-[9px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-1 py-0.5 rounded font-bold shrink-0">
                                    DIRETO
                                  </span>
                                )}
                                {/* Payment type badge */}
                                {isDraft && canPay ? (
                                  <span
                                    role="button"
                                    aria-label={`Alternar tipo de pagamento para ${currentPaymentType === 'avista' ? 'Fiado' : 'A Vista'}`}
                                    onClick={() => {
                                      if (!isPayTypeLoading) handleTogglePaymentType(agent.id, currentPaymentType);
                                    }}
                                    className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border cursor-pointer select-none transition-colors shrink-0 ${
                                      isPayTypeLoading
                                        ? 'bg-dark-700/30 text-dark-400 border-dark-600/40 animate-pulse'
                                        : currentPaymentType === 'avista'
                                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                                          : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40 hover:bg-yellow-500/30'
                                    }`}
                                    title="Clique para alternar entre Fiado e A Vista"
                                  >
                                    {isPayTypeLoading ? '...' : currentPaymentType === 'avista' ? 'A Vista' : 'Fiado'}
                                  </span>
                                ) : (
                                  <span
                                    className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border shrink-0 ${
                                      currentPaymentType === 'avista'
                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                        : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
                                    }`}
                                  >
                                    {currentPaymentType === 'avista' ? 'A Vista' : 'Fiado'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        {/* RESULTADO */}
                        <td className={`p-3 text-right font-mono ${resultado < -0.01 ? 'text-red-400' : resultado > 0.01 ? 'text-poker-400' : 'text-dark-400'}`}>
                          {formatBRL(resultado)}
                        </td>
                        {/* SALDO ANTERIOR */}
                        <td className={`p-3 text-right font-mono ${Math.abs(saldoAnterior) < 0.01 ? 'text-dark-500' : 'text-dark-300'}`}>
                          {formatBRL(saldoAnterior)}
                        </td>
                        {/* TOTAL DEVIDO */}
                        <td className={`p-3 text-right font-mono ${totalDevido < -0.01 ? 'text-red-400' : totalDevido > 0.01 ? 'text-poker-400' : 'text-dark-400'}`}>
                          {formatBRL(totalDevido)}
                        </td>
                        {/* TOTAL PAGO */}
                        <td className="p-3 text-right font-mono text-dark-300">
                          {formatBRL(pago)}
                        </td>
                        {/* EM ABERTO */}
                        <td className={`p-3 text-right font-mono font-semibold ${Math.abs(pendente) < 0.01 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                          {formatBRL(pendente)}
                        </td>
                        {/* STATUS */}
                        <td className="p-3 text-center">
                          <StatusBadge status={status} />
                        </td>
                        {/* ACAO */}
                        <td className="p-3 text-right">
                          {isDraft && canPay && status !== 'quitado' && status !== 'sem-mov' && (
                            <button
                              onClick={() => openQuickPay(agent, pendente)}
                              aria-label={`Registrar pagamento para ${agent.agent_name}`}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                                pendente > 0
                                  ? 'bg-red-600/15 text-red-400 hover:bg-red-600/25 border border-red-500/30'
                                  : 'bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600/25 border border-emerald-500/30'
                              }`}
                            >
                              {pendente > 0 ? `Pagar ${formatBRL(pendente)}` : `Receber ${formatBRL(Math.abs(pendente))}`}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expanded row: quick-pay + entries */}
                      {(isExpanded || isQuickPay) && (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <div className="border-t border-dark-700/50 px-5 py-3 bg-dark-800/20">
                              {/* Quick-pay form */}
                              {isQuickPay && isDraft && (
                                <div className="bg-dark-800/50 rounded-lg p-3 mb-3">
                                  <div className="grid grid-cols-5 gap-2">
                                    <div>
                                      <label className="text-[10px] text-dark-500 mb-0.5 block">Valor</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        value={payForm.amount}
                                        onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))}
                                        className="input w-full text-sm font-mono"
                                        placeholder="0,00"
                                        autoFocus
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-dark-500 mb-0.5 block">Dir</label>
                                      <select
                                        value={payForm.dir}
                                        onChange={(e) => setPayForm((p) => ({ ...p, dir: e.target.value as 'IN' | 'OUT' }))}
                                        aria-label="Direcao do pagamento"
                                        className="input w-full text-sm"
                                      >
                                        <option value="IN">IN</option>
                                        <option value="OUT">OUT</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-dark-500 mb-0.5 block">Metodo</label>
                                      <input
                                        type="text"
                                        value={payForm.method}
                                        onChange={(e) => setPayForm((p) => ({ ...p, method: e.target.value }))}
                                        className="input w-full text-sm"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-dark-500 mb-0.5 block">Descricao</label>
                                      <input
                                        type="text"
                                        value={payForm.description}
                                        onChange={(e) => setPayForm((p) => ({ ...p, description: e.target.value }))}
                                        className="input w-full text-sm"
                                      />
                                    </div>
                                    <div className="flex items-end gap-1">
                                      <button
                                        onClick={() => handleQuickPay(agent)}
                                        disabled={saving}
                                        className="btn-primary text-xs px-3 py-2 flex-1"
                                      >
                                        {saving ? '...' : 'Salvar'}
                                      </button>
                                      <button
                                        onClick={() => setQuickPayAgent(null)}
                                        className="px-2 py-2 text-dark-500 hover:text-dark-300 text-xs"
                                      >
                                        {'\u2715'}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Entries mini-table */}
                              {entries.length === 0 ? (
                                <p className="text-dark-500 text-xs py-2">Nenhuma movimentacao registrada</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-dark-500 text-left">
                                      <th className="pb-1 font-medium">Data</th>
                                      <th className="pb-1 font-medium">Dir</th>
                                      <th className="pb-1 font-medium text-right">Valor</th>
                                      <th className="pb-1 font-medium">Metodo</th>
                                      <th className="pb-1 font-medium">Descricao</th>
                                      {isDraft && canPay && <th className="pb-1 w-6" />}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-dark-700/30">
                                    {entries.map((e) => (
                                      <tr key={e.id}>
                                        <td className="py-1.5 text-dark-500 font-mono">{fmtDate(e.created_at!)}</td>
                                        <td className="py-1.5">
                                          <span
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                              e.dir === 'IN' ? 'bg-poker-900/30 text-poker-400' : 'bg-red-900/30 text-red-400'
                                            }`}
                                          >
                                            {e.dir === 'IN' ? '\u2193 IN' : '\u2191 OUT'}
                                          </span>
                                        </td>
                                        <td className={`py-1.5 text-right font-mono ${e.dir === 'IN' ? 'text-poker-400' : 'text-red-400'}`}>
                                          {formatBRL(Number(e.amount))}
                                        </td>
                                        <td className="py-1.5 text-dark-500">{e.method || '-'}</td>
                                        <td className="py-1.5 text-dark-600 truncate max-w-[200px]">{e.description || '-'}</td>
                                        {isDraft && canPay && (
                                          <td className="py-1.5 text-right">
                                            <button
                                              onClick={() => handleDeleteEntry(e.id)}
                                              aria-label="Remover lancamento"
                                              className="text-dark-600 hover:text-red-400 transition-colors"
                                            >
                                              {'\u2715'}
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>

              {/* ═══ TOTAL FOOTER ═══ */}
              <tfoot className="sticky bottom-0 bg-dark-900 border-t-2 border-dark-600">
                <tr className="text-sm font-bold">
                  <td className="p-3 text-dark-200">TOTAL ({sorted.length})</td>
                  <td className={`p-3 text-right font-mono ${footerTotals.resultado < -0.01 ? 'text-red-400' : footerTotals.resultado > 0.01 ? 'text-poker-400' : 'text-dark-400'}`}>
                    {formatBRL(footerTotals.resultado)}
                  </td>
                  <td className="p-3 text-right font-mono text-dark-300">
                    {formatBRL(footerTotals.saldoAnterior)}
                  </td>
                  <td className={`p-3 text-right font-mono ${footerTotals.totalDevido < -0.01 ? 'text-red-400' : footerTotals.totalDevido > 0.01 ? 'text-poker-400' : 'text-dark-400'}`}>
                    {formatBRL(footerTotals.totalDevido)}
                  </td>
                  <td className="p-3 text-right font-mono text-dark-300">
                    {formatBRL(footerTotals.pago)}
                  </td>
                  <td className={`p-3 text-right font-mono font-semibold ${Math.abs(footerTotals.pendente) < 0.01 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                    {formatBRL(footerTotals.pendente)}
                  </td>
                  <td className="p-3" />
                  <td className="p-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {ConfirmDialogElement}
    </div>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: EntityStatus }) {
  const config: Record<EntityStatus, { label: string; cls: string; dot: string }> = {
    quitado: { label: 'Quitado', cls: 'bg-green-500/15 text-green-400 border-green-500/30', dot: 'bg-green-400' },
    credito: { label: 'Credito', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30', dot: 'bg-purple-400' },
    parcial: { label: 'Parcial', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', dot: 'bg-yellow-400' },
    aberto: { label: 'Em Aberto', cls: 'bg-red-500/15 text-red-400 border-red-500/30', dot: 'bg-red-400' },
    'sem-mov': { label: 'Sem Mov.', cls: 'bg-dark-700/20 text-dark-400 border-dark-600/30', dot: 'bg-dark-500' },
  };
  const c = config[status] || config['aberto'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === 'parcial' ? 'animate-pulse' : ''}`} />
      {c.label}
    </span>
  );
}
