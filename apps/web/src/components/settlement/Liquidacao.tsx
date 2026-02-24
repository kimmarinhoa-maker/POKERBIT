'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { listLedger, createLedgerEntry, deleteLedgerEntry, getCarryForward, updateAgentPaymentType, formatBRL } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/useAuth';
import Spinner from '@/components/Spinner';

// ─── Types ──────────────────────────────────────────────────────────

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

interface AgentMetric {
  id: string;
  agent_id: string | null;
  agent_name: string;
  player_count: number;
  rake_total_brl: number;
  ganhos_total_brl: number;
  commission_brl: number;
  resultado_brl: number;
  is_direct?: boolean;
  payment_type?: 'fiado' | 'avista';
}

interface Props {
  subclub: {
    id: string;
    name: string;
    agents: AgentMetric[];
  };
  weekStart: string;
  clubId: string;
  settlementId: string;
  settlementStatus: string;
  onDataChange: () => void;
}

type SortMode = 'devedor' | 'credor' | 'resultado' | 'nome' | 'status';
type EntityStatus = 'quitado' | 'credito' | 'parcial' | 'aberto' | 'sem-mov';

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

// ─── Component ──────────────────────────────────────────────────────

export default function Liquidacao({ subclub, weekStart, clubId, settlementId, settlementStatus, onDataChange }: Props) {
  const isDraft = settlementStatus === 'DRAFT';
  const agents = subclub.agents || [];
  const { toast } = useToast();
  const { canAccess } = useAuth();
  const canPay = canAccess('OWNER', 'ADMIN', 'FINANCEIRO');

  const [allEntries, setAllEntries] = useState<LedgerEntry[]>([]);
  const [carryMap, setCarryMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [quickPayAgent, setQuickPayAgent] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', method: '', description: '', dir: 'OUT' as 'IN' | 'OUT' });
  const [saving, setSaving] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('devedor');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | EntityStatus>('todos');
  const [paymentTypeLoading, setPaymentTypeLoading] = useState<Set<string>>(new Set());
  const [paymentTypeOverrides, setPaymentTypeOverrides] = useState<Record<string, 'fiado' | 'avista'>>({});

  const loadLedger = useCallback(async () => {
    setLoading(true);
    try {
      const [ledgerRes, carryRes] = await Promise.all([
        listLedger(weekStart),
        getCarryForward(weekStart, clubId),
      ]);
      if (ledgerRes.success) setAllEntries(ledgerRes.data || []);
      if (carryRes.success) setCarryMap(carryRes.data || {});
    } catch {
      toast('Erro ao carregar dados de liquidacao', 'error');
    } finally {
      setLoading(false);
    }
  }, [weekStart, clubId]);

  useEffect(() => { loadLedger(); }, [loadLedger]);

  // Group ledger entries by entity_id
  const ledgerByEntity = useMemo(() => {
    const map = new Map<string, LedgerEntry[]>();
    for (const e of allEntries) {
      if (!map.has(e.entity_id)) map.set(e.entity_id, []);
      map.get(e.entity_id)!.push(e);
    }
    return map;
  }, [allEntries]);

  // Compute per-agent liquidation data with canonical formula
  const agentLiq = useMemo(() => {
    return agents.map(agent => {
      // Resolve entries by agent_week_metrics.id and org id
      const seen = new Set<string>();
      const entries: LedgerEntry[] = [];
      function add(list: LedgerEntry[] | undefined) {
        if (!list) return;
        for (const e of list) {
          if (!seen.has(e.id)) { seen.add(e.id); entries.push(e); }
        }
      }
      add(ledgerByEntity.get(agent.id));
      if (agent.agent_id) add(ledgerByEntity.get(agent.agent_id));

      const totalIn = entries.filter(e => e.dir === 'IN').reduce((s, e) => s + Number(e.amount), 0);
      const totalOut = entries.filter(e => e.dir === 'OUT').reduce((s, e) => s + Number(e.amount), 0);
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

      return { agent, entries, totalIn, totalOut, resultado, totalDevido, pago, pendente, direcao, status, hasMov };
    });
  }, [agents, ledgerByEntity]);

  // Search + status filter
  const filtered = useMemo(() => {
    let result = agentLiq;
    if (statusFilter !== 'todos') {
      result = result.filter(a => a.status === statusFilter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(a => a.agent.agent_name.toLowerCase().includes(term));
    }
    return result;
  }, [agentLiq, searchTerm, statusFilter]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortMode) {
      case 'devedor':
        return arr.sort((a, b) => a.pendente - b.pendente); // most negative first
      case 'credor':
        return arr.sort((a, b) => b.pendente - a.pendente); // most positive first
      case 'resultado':
        return arr.sort((a, b) => Math.abs(b.resultado) - Math.abs(a.resultado));
      case 'nome':
        return arr.sort((a, b) => a.agent.agent_name.localeCompare(b.agent.agent_name));
      case 'status': {
        const order: Record<EntityStatus, number> = { 'aberto': 0, 'parcial': 1, 'credito': 2, 'quitado': 3, 'sem-mov': 4 };
        return arr.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
      }
      default:
        return arr;
    }
  }, [filtered, sortMode]);

  // KPI totals
  const kpis = useMemo(() => {
    const withMov = agentLiq.filter(a => a.hasMov);
    const totalResultado = round2(agentLiq.reduce((s, a) => s + a.resultado, 0));
    const totalRecebido = round2(agentLiq.reduce((s, a) => s + a.totalIn, 0));
    const totalPago = round2(agentLiq.reduce((s, a) => s + a.totalOut, 0));
    const totalPendente = round2(agentLiq.reduce((s, a) => s + a.pendente, 0));
    const totalRB = round2(agentLiq.reduce((s, a) => s + Number(a.agent.commission_brl || 0), 0));
    const quitados = agentLiq.filter(a => a.status === 'quitado').length;
    const comMov = withMov.length;
    const statusCounts = {
      quitado: agentLiq.filter(a => a.status === 'quitado').length,
      parcial: agentLiq.filter(a => a.status === 'parcial').length,
      aberto: agentLiq.filter(a => a.status === 'aberto').length,
      credito: agentLiq.filter(a => a.status === 'credito').length,
      'sem-mov': agentLiq.filter(a => a.status === 'sem-mov').length,
    };
    return { totalResultado, totalRecebido, totalPago, totalPendente, totalRB, quitados, comMov, total: agentLiq.length, statusCounts };
  }, [agentLiq]);

  const pctQuit = kpis.comMov > 0 ? Math.round(kpis.quitados / kpis.comMov * 100) : 0;

  function toggleAgent(id: string) {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openQuickPay(agent: AgentMetric) {
    const resultado = Number(agent.resultado_brl) || 0;
    setQuickPayAgent(agent.id);
    setPayForm({
      amount: '',
      method: 'PIX',
      description: `Pagamento ${agent.agent_name}`,
      dir: resultado > 0 ? 'OUT' : 'IN',
    });
  }

  async function handleQuickPay(agent: AgentMetric) {
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) return;

    setSaving(true);
    try {
      const res = await createLedgerEntry({
        entity_id: agent.id,
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
    if (!confirm('Excluir esta movimentacao?')) return;
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
    setPaymentTypeLoading(prev => new Set(prev).add(agentId));
    try {
      const res = await updateAgentPaymentType(settlementId, agentId, newType);
      if (res.success) {
        setPaymentTypeOverrides(prev => ({ ...prev, [agentId]: newType }));
        onDataChange();
      }
    } catch {
      toast('Erro ao alterar tipo de pagamento', 'error');
    } finally {
      setPaymentTypeLoading(prev => {
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
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-dark-800 flex items-center justify-center text-3xl">📋</div>
        <div>
          <h2 className="text-2xl font-bold text-white">Liquidacao — {subclub.name}</h2>
          <p className="text-dark-400 text-sm">
            Status de pagamento por agente — {agents.length} agentes
          </p>
        </div>
      </div>

      {/* KPI cards - 5 columns like HTML */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-poker-500 rounded-lg p-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Resultado Total</p>
          <p className={`font-mono text-lg font-bold ${kpis.totalResultado >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
            {formatBRL(kpis.totalResultado)}
          </p>
        </div>
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-yellow-500 rounded-lg p-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">RB Distribuido</p>
          <p className="font-mono text-lg font-bold text-yellow-400">{formatBRL(kpis.totalRB)}</p>
        </div>
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-emerald-500 rounded-lg p-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Recebido</p>
          <p className="font-mono text-lg font-bold text-emerald-400">{formatBRL(kpis.totalRecebido)}</p>
        </div>
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-blue-500 rounded-lg p-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Pago</p>
          <p className="font-mono text-lg font-bold text-blue-400">{formatBRL(kpis.totalPago)}</p>
        </div>
        <div className={`bg-dark-800/50 border border-dark-700/50 border-t-2 ${kpis.quitados === kpis.comMov && kpis.comMov > 0 ? 'border-t-emerald-500' : 'border-t-yellow-500'} rounded-lg p-3 text-center`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Saldo Final</p>
          <p className={`font-mono text-lg font-bold ${Math.abs(kpis.totalPendente) < 0.01 ? 'text-emerald-400' : 'text-yellow-400'}`}>
            {formatBRL(kpis.totalPendente)}
          </p>
          <p className="text-[9px] text-dark-500">{kpis.quitados}/{kpis.comMov} quitados</p>
        </div>
      </div>

      {/* Progress bar */}
      {kpis.comMov > 0 && (
        <div className="card mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-dark-400">Progresso de liquidacao</span>
            <span className="text-xs font-mono text-dark-300 font-bold">
              {kpis.quitados}/{kpis.comMov} quitados ({pctQuit}%)
            </span>
          </div>
          <div className="w-full bg-dark-800 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all duration-700 ${
                pctQuit === 100
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-emerald-500 to-emerald-400'
              }`}
              style={{ width: `${pctQuit}%` }}
            />
          </div>
        </div>
      )}

      {/* Status filter buttons (like HTML) */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {([
          { key: 'todos', label: 'Todos', count: kpis.total },
          { key: 'aberto', label: 'Em Aberto', count: kpis.statusCounts.aberto },
          { key: 'parcial', label: 'Parcial', count: kpis.statusCounts.parcial },
          { key: 'quitado', label: 'Quitado', count: kpis.statusCounts.quitado },
          { key: 'credito', label: 'Credito', count: kpis.statusCounts.credito },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === f.key
                ? 'bg-poker-600/20 text-poker-400 border border-poker-700/40'
                : 'bg-dark-800/50 text-dark-300 border border-dark-700/30 hover:bg-dark-800'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Search + Sort */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Buscar agente..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-4 py-2 text-sm text-white placeholder-dark-500 focus:border-poker-500 focus:outline-none"
          />
        </div>
        <select
          value={sortMode}
          onChange={e => setSortMode(e.target.value as SortMode)}
          className="bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-dark-200 focus:border-poker-500 focus:outline-none"
        >
          <option value="devedor">Maior devedor</option>
          <option value="credor">Maior credor</option>
          <option value="resultado">Resultado</option>
          <option value="nome">Nome A-Z</option>
          <option value="status">Status</option>
        </select>
      </div>

      {/* Agent list */}
      {sorted.length === 0 ? (
        <div className="card text-center py-12 text-dark-400">
          {agents.length === 0
            ? 'Nenhum agente neste subclube'
            : 'Nenhum agente encontrado'}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(({ agent, entries, resultado, pendente, direcao, status, hasMov }) => {
            const isExpanded = expandedAgents.has(agent.id);
            const isQuickPay = quickPayAgent === agent.id;
            const currentPaymentType = paymentTypeOverrides[agent.id] || agent.payment_type || 'fiado';
            const isPaymentTypeLoading = paymentTypeLoading.has(agent.id);

            return (
              <div
                key={agent.id}
                className={`card p-0 overflow-hidden transition-opacity ${!hasMov ? 'opacity-50' : ''}`}
              >
                {/* Agent header */}
                <button
                  onClick={() => toggleAgent(agent.id)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-dark-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-dark-400 transition-transform text-xs ${isExpanded ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    <div className="text-left">
                      <span className="text-white font-semibold">{agent.agent_name}</span>
                      {agent.is_direct && (
                        <span className="text-[9px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-1 py-0.5 rounded font-bold ml-2">
                          DIRETO
                        </span>
                      )}
                      <span className="text-dark-500 text-xs ml-2">
                        {agent.player_count} jog.
                      </span>
                    </div>
                    <StatusBadge status={status} />
                    {/* Payment Type Badge (Fiado / A Vista) */}
                    {isDraft ? (
                      <span
                        role="button"
                        aria-label={`Alternar tipo de pagamento de ${agent.agent_name} para ${currentPaymentType === 'avista' ? 'Fiado' : 'A Vista'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isPaymentTypeLoading) {
                            handleTogglePaymentType(agent.id, currentPaymentType);
                          }
                        }}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer select-none transition-colors ${
                          isPaymentTypeLoading
                            ? 'bg-dark-700/30 text-dark-400 border-dark-600/40 animate-pulse'
                            : currentPaymentType === 'avista'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                              : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40 hover:bg-yellow-500/30'
                        }`}
                        title={`Clique para alternar entre Fiado e A Vista`}
                      >
                        {isPaymentTypeLoading ? '...' : currentPaymentType === 'avista' ? 'A Vista' : 'Fiado'}
                      </span>
                    ) : (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          currentPaymentType === 'avista'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
                        }`}
                      >
                        {currentPaymentType === 'avista' ? 'A Vista' : 'Fiado'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-5 text-sm">
                    <div className="text-right">
                      <p className="text-[10px] text-dark-500 uppercase">Resultado</p>
                      <p className={`font-mono ${resultado < 0 ? 'text-red-400' : 'text-poker-400'}`}>
                        {formatBRL(resultado)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-dark-500 uppercase">Direcao</p>
                      <p className={`text-xs font-medium ${
                        direcao === 'A Receber' ? 'text-poker-400' : direcao === 'A Pagar' ? 'text-red-400' : 'text-dark-500'
                      }`}>
                        {direcao}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-dark-500 uppercase">Pendente</p>
                      <p className={`font-mono font-semibold ${
                        Math.abs(pendente) < 0.01 ? 'text-emerald-400' : 'text-yellow-400'
                      }`}>
                        {formatBRL(pendente)}
                      </p>
                    </div>

                    {isDraft && canPay && status !== 'quitado' && status !== 'sem-mov' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openQuickPay(agent); }}
                        aria-label={`Registrar pagamento para ${agent.agent_name}`}
                        className="px-3 py-1.5 rounded-lg bg-poker-600/20 text-poker-400 text-xs font-medium hover:bg-poker-600/30 transition-colors"
                      >
                        + Pagar
                      </button>
                    )}
                  </div>
                </button>

                {/* Expanded: entries + quick-pay form */}
                {(isExpanded || isQuickPay) && (
                  <div className="border-t border-dark-700/50 px-5 py-3">
                    {/* Quick-pay form */}
                    {isQuickPay && isDraft && (
                      <div className="bg-dark-800/50 rounded-lg p-3 mb-3">
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <label className="text-[10px] text-dark-500 mb-0.5 block">Valor</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={payForm.amount}
                              onChange={(e) => setPayForm(p => ({ ...p, amount: e.target.value }))}
                              className="input w-full text-sm font-mono"
                              placeholder="0,00"
                              autoFocus
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-dark-500 mb-0.5 block">Dir</label>
                            <select
                              value={payForm.dir}
                              onChange={(e) => setPayForm(p => ({ ...p, dir: e.target.value as 'IN' | 'OUT' }))}
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
                              onChange={(e) => setPayForm(p => ({ ...p, method: e.target.value }))}
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
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Entries list */}
                    {entries.length === 0 ? (
                      <p className="text-dark-500 text-xs py-2">Nenhuma movimentacao registrada</p>
                    ) : (
                      <div className="space-y-1">
                        {entries.map(e => (
                          <div key={e.id} className="flex items-center justify-between py-1.5 text-xs">
                            <div className="flex items-center gap-3">
                              <span className="text-dark-500 font-mono">{fmtDate(e.created_at)}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                e.dir === 'IN' ? 'bg-poker-900/30 text-poker-400' : 'bg-red-900/30 text-red-400'
                              }`}>
                                {e.dir === 'IN' ? '↓ IN' : '↑ OUT'}
                              </span>
                              <span className={`font-mono ${e.dir === 'IN' ? 'text-poker-400' : 'text-red-400'}`}>
                                {formatBRL(Number(e.amount))}
                              </span>
                              <span className="text-dark-500">{e.method || ''}</span>
                              <span className="text-dark-600 truncate max-w-[150px]">{e.description || ''}</span>
                            </div>
                            {isDraft && (
                              <button
                                onClick={() => handleDeleteEntry(e.id)}
                                aria-label="Remover lancamento"
                                className="text-dark-600 hover:text-red-400 transition-colors"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: EntityStatus }) {
  const config: Record<EntityStatus, { label: string; cls: string }> = {
    'quitado':  { label: 'Quitado',  cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
    'credito':  { label: 'Credito',  cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
    'parcial':  { label: 'Parcial',  cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
    'aberto':   { label: 'Em Aberto', cls: 'bg-red-500/20 text-red-400 border-red-500/40' },
    'sem-mov':  { label: 'Sem Mov.',  cls: 'bg-dark-700/30 text-dark-400 border-dark-600/40' },
  };
  const c = config[status] || config['aberto'];
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${c.cls}`}>
      {c.label}
    </span>
  );
}
