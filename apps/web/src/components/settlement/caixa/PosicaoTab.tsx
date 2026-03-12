'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { listLedger, getCarryForward, formatBRL, createLedgerEntry, deleteLedgerEntry } from '@/lib/api';
import { round2 } from '@/lib/formatters';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/useAuth';
import { useSortable } from '@/lib/useSortable';
import type { AgentMetric, PlayerMetric, LedgerEntry } from '@/types/settlement';
import SettlementSkeleton from '@/components/ui/SettlementSkeleton';
import KpiCard from '@/components/ui/KpiCard';
import EmptyState from '@/components/ui/EmptyState';
import { Wallet, ChevronDown, ChevronRight } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

interface Props {
  subclub: {
    id: string;
    name: string;
    agents: AgentMetric[];
    players: PlayerMetric[];
    totals: { rake: number; rbTotal: number };
    feesComputed: { totalTaxasSigned: number };
  };
  weekStart: string;
  clubId: string;
  fees: Record<string, number>;
  settlementStatus: string;
  onDataChange: () => void;
}

interface AgentPosition {
  agent: AgentMetric;
  players: PlayerMetric[];
  entries: LedgerEntry[];
  divida: number;
  chippixRecebido: number;
  rakebackTotal: number;
  pixRecebido: number;
  totalRecebido: number;
  pendente: number;
  pct: number;
  status: 'quitado' | 'parcial' | 'pendente' | 'a_pagar';
}

type SortKey = 'agent' | 'divida' | 'recebido' | 'pendente' | 'status';

// ─── Component ──────────────────────────────────────────────────────

export default function PosicaoTab({ subclub, weekStart, clubId, fees, settlementStatus, onDataChange }: Props) {
  const isDraft = settlementStatus === 'DRAFT';
  const { toast } = useToast();
  const { canAccess } = useAuth();
  const canEdit = canAccess('OWNER', 'ADMIN', 'FINANCEIRO');

  const agents = useMemo(() => subclub.agents || [], [subclub.agents]);
  const players = useMemo(() => subclub.players || [], [subclub.players]);

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [carryMap, setCarryMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Quick-pay modal state
  const [payModalAgent, setPayModalAgent] = useState<AgentMetric | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'PIX', description: '', dir: 'IN' as 'IN' | 'OUT' });
  const [saving, setSaving] = useState(false);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const [ledgerRes, carryRes] = await Promise.all([
        listLedger(weekStart),
        getCarryForward(weekStart, clubId),
      ]);
      if (!mountedRef.current) return;
      if (ledgerRes.success) setEntries(ledgerRes.data || []);
      if (carryRes.success) setCarryMap(carryRes.data || {});
    } catch {
      if (!mountedRef.current) return;
      toast('Erro ao carregar posicao', 'error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [weekStart, clubId, toast]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Group players by agent
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

  // Build agent positions (same aggregation pattern as Comprovantes.tsx:260-320)
  const agentPositions: AgentPosition[] = useMemo(() => {
    return agents.map((agent) => {
      const agPlayers = (playersByAgent.get(agent.agent_name) || []).sort(
        (a, b) => (a.nickname || '').localeCompare(b.nickname || ''),
      );

      // Resolve ledger entries — match by agent IDs + player-level keys
      const seen = new Set<string>();
      const agEntries: LedgerEntry[] = [];
      function add(list: LedgerEntry[] | undefined) {
        if (!list) return;
        for (const e of list) {
          if (!seen.has(e.id)) { seen.add(e.id); agEntries.push(e); }
        }
      }
      add(ledgerByEntity.get(agent.id));
      if (agent.agent_id) add(ledgerByEntity.get(agent.agent_id));
      for (const p of agPlayers) {
        if (p.id) add(ledgerByEntity.get(p.id));
        if (p.player_id) add(ledgerByEntity.get(p.player_id));
        if (p.external_player_id) {
          const eid = String(p.external_player_id);
          add(ledgerByEntity.get(eid));
          add(ledgerByEntity.get(`cp_${eid}`));
        }
      }

      // Divida = abs dos jogadores que perderam (winnings < 0 = jogador deve)
      const divida = agPlayers
        .filter(p => p.winnings_brl < 0)
        .reduce((s, p) => s + Math.abs(p.winnings_brl), 0);

      // Recebidos por fonte
      let chippixRecebido = 0;
      let pixRecebido = 0;
      for (const e of agEntries) {
        const amt = Number(e.amount);
        const src = (e.source || '').toLowerCase();
        if (src === 'chippix') {
          chippixRecebido += e.dir === 'IN' ? amt : -amt;
        } else if (src === 'manual' || src === 'ofx' || src === '') {
          if (e.dir === 'IN') pixRecebido += amt;
          else pixRecebido -= amt;
        }
      }

      const rakebackTotal = round2(agPlayers.reduce((s, p) => s + (p.rb_value_brl || 0), 0));
      const totalRecebido = round2(chippixRecebido + pixRecebido);
      const pendente = round2(divida - totalRecebido);
      const pct = divida > 0 ? Math.min(100, Math.round((totalRecebido / divida) * 100)) : (totalRecebido > 0 ? 100 : 0);

      let status: AgentPosition['status'];
      if (pendente <= 0.01 && divida > 0) status = 'quitado';
      else if (totalRecebido > 0.01 && pendente > 0.01) status = 'parcial';
      else if (divida <= 0 && totalRecebido <= 0) status = 'a_pagar';
      else status = 'pendente';

      return {
        agent, players: agPlayers, entries: agEntries,
        divida: round2(divida), chippixRecebido: round2(chippixRecebido),
        rakebackTotal, pixRecebido: round2(pixRecebido),
        totalRecebido: round2(totalRecebido), pendente: round2(pendente),
        pct, status,
      };
    });
  }, [agents, playersByAgent, ledgerByEntity]);

  // Totals
  const heroTotals = useMemo(() => {
    const divida = round2(agentPositions.reduce((s, a) => s + a.divida, 0));
    const chippix = round2(agentPositions.reduce((s, a) => s + a.chippixRecebido, 0));
    const rb = round2(agentPositions.reduce((s, a) => s + a.rakebackTotal, 0));
    const pix = round2(agentPositions.reduce((s, a) => s + a.pixRecebido, 0));
    const recebido = round2(chippix + pix);
    const pendente = round2(divida - recebido);
    const pct = divida > 0 ? Math.min(100, Math.round((recebido / divida) * 100)) : 0;
    const rake = subclub.totals?.rake || 0;
    const taxas = Math.abs(subclub.feesComputed?.totalTaxasSigned || 0);
    const lucro = round2(rake - taxas - rb);
    return { divida, chippix, rb, pix, recebido, pendente, pct, lucro };
  }, [agentPositions, subclub.totals, subclub.feesComputed]);

  // Progress bar color
  function progressColor(pct: number) {
    if (pct >= 70) return 'bg-emerald-500';
    if (pct >= 30) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  // Status badge
  function StatusBadge({ status, pct }: { status: AgentPosition['status']; pct: number }) {
    const cfg = {
      quitado: { dot: 'bg-emerald-400', text: 'text-emerald-400', label: 'Quitado' },
      parcial: { dot: 'bg-yellow-400', text: 'text-yellow-400', label: `Parcial (${pct}%)` },
      pendente: { dot: 'bg-red-400', text: 'text-red-400', label: 'Pendente' },
      a_pagar: { dot: 'bg-blue-400', text: 'text-blue-400', label: 'A pagar' },
    };
    const c = cfg[status];
    return (
      <span className={`flex items-center gap-1.5 text-xs font-medium ${c.text}`}>
        <span className={`w-2 h-2 rounded-full ${c.dot}`} />
        {c.label}
      </span>
    );
  }

  // Sorting
  const getSortValue = useCallback((a: AgentPosition, key: SortKey): string | number => {
    switch (key) {
      case 'agent': return a.agent.agent_name;
      case 'divida': return a.divida;
      case 'recebido': return a.totalRecebido;
      case 'pendente': return a.pendente;
      case 'status': return a.pct;
    }
  }, []);

  const { sorted, handleSort, sortIcon, ariaSort } = useSortable<AgentPosition, SortKey>({
    data: agentPositions,
    defaultKey: 'pendente',
    getValue: getSortValue,
  });

  // Toggle expand
  function toggleExpand(id: string) {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Quick-pay
  function openQuickPay(agent: AgentMetric, pendente: number) {
    setPayModalAgent(agent);
    setPayForm({
      amount: String(Math.abs(round2(pendente))),
      method: 'PIX',
      description: `Pagamento ${agent.agent_name}`,
      dir: pendente > 0 ? 'IN' : 'OUT',
    });
  }

  async function handleQuickPay() {
    if (!payModalAgent) return;
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    try {
      const res = await createLedgerEntry({
        entity_id: payModalAgent.agent_id || payModalAgent.id,
        entity_name: payModalAgent.agent_name,
        week_start: weekStart,
        dir: payForm.dir as 'IN' | 'OUT',
        amount,
        method: payForm.method || undefined,
        description: payForm.description || undefined,
      });
      if (res.success) {
        setPayModalAgent(null);
        loadEntries();
        onDataChange();
        toast('Pagamento registrado', 'success');
      } else {
        toast(res.error || 'Erro ao registrar', 'error');
      }
    } catch {
      toast('Erro ao registrar pagamento', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <SettlementSkeleton kpis={5} />;

  return (
    <div>
      {/* ═══ HERO CARD ═══ */}
      <div className="card mb-5 border-dark-600/50">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Left: divida/recebido/pendente */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-dark-500 uppercase tracking-wider mb-0.5">Divida Total</p>
              <p className="text-lg font-bold font-mono text-red-400">{formatBRL(heroTotals.divida)}</p>
            </div>
            <div>
              <p className="text-[10px] text-dark-500 uppercase tracking-wider mb-0.5">Recebido</p>
              <p className="text-lg font-bold font-mono text-emerald-400">{formatBRL(heroTotals.recebido)}</p>
              <div className="flex gap-2 text-[10px] text-dark-500 mt-0.5">
                {heroTotals.chippix > 0 && <span>ChipPix: {formatBRL(heroTotals.chippix)}</span>}
                {heroTotals.pix > 0 && <span>PIX: {formatBRL(heroTotals.pix)}</span>}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-dark-500 uppercase tracking-wider mb-0.5">Pendente</p>
              <p className={`text-lg font-bold font-mono ${heroTotals.pendente > 0.01 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                {formatBRL(heroTotals.pendente)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-dark-500 uppercase tracking-wider mb-0.5">Lucro Estimado</p>
              <p className={`text-lg font-bold font-mono ${heroTotals.lucro >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                {formatBRL(heroTotals.lucro)}
              </p>
              <p className="text-[10px] text-dark-500 mt-0.5">Rake - Taxas - RB</p>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-dark-400 mb-1">
            <span>Progresso de Recebimento</span>
            <span className="font-mono">{heroTotals.pct}%</span>
          </div>
          <div className="w-full h-3 bg-dark-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${progressColor(heroTotals.pct)}`}
              style={{ width: `${heroTotals.pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ═══ KPIs ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <KpiCard label="Divida Total" value={formatBRL(heroTotals.divida)} accentColor="bg-red-500" valueColor="text-red-400" />
        <KpiCard label="ChipPix" value={formatBRL(heroTotals.chippix)} accentColor="bg-blue-500" valueColor="text-blue-400" />
        <KpiCard label="PIX/Manual" value={formatBRL(heroTotals.pix)} accentColor="bg-emerald-500" valueColor="text-emerald-400" />
        <KpiCard label="Rakeback" value={formatBRL(heroTotals.rb)} accentColor="bg-purple-500" valueColor="text-purple-400" />
        <KpiCard label="Pendente" value={formatBRL(heroTotals.pendente)} accentColor={heroTotals.pendente > 0.01 ? 'bg-yellow-500' : 'bg-emerald-500'} valueColor={heroTotals.pendente > 0.01 ? 'text-yellow-400' : 'text-emerald-400'} />
      </div>

      {/* ═══ AGENT TABLE ═══ */}
      {agentPositions.length === 0 ? (
        <div className="card">
          <EmptyState icon={Wallet} title="Nenhum agente nesta semana" description="Importe dados para visualizar posicao" />
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm data-table" aria-label="Posicao por agente">
              <thead>
                <tr className="bg-dark-800/50 text-dark-400 text-xs uppercase tracking-wider">
                  <th className="w-8" />
                  <th scope="col" className="px-4 py-3 text-left font-medium cursor-pointer hover:text-dark-200" onClick={() => handleSort('agent')} aria-sort={ariaSort('agent')}>
                    Agente{sortIcon('agent')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium cursor-pointer hover:text-dark-200" onClick={() => handleSort('divida')} aria-sort={ariaSort('divida')}>
                    Divida{sortIcon('divida')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium cursor-pointer hover:text-dark-200" onClick={() => handleSort('recebido')} aria-sort={ariaSort('recebido')}>
                    Recebido{sortIcon('recebido')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium cursor-pointer hover:text-dark-200" onClick={() => handleSort('pendente')} aria-sort={ariaSort('pendente')}>
                    Pendente{sortIcon('pendente')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-center font-medium cursor-pointer hover:text-dark-200" onClick={() => handleSort('status')} aria-sort={ariaSort('status')}>
                    Status{sortIcon('status')}
                  </th>
                  {isDraft && canEdit && <th scope="col" className="px-3 py-3 text-center font-medium w-20">Acao</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/50">
                {sorted.map((pos) => {
                  const isExpanded = expandedAgents.has(pos.agent.id);
                  return (
                    <AgentRow
                      key={pos.agent.id}
                      pos={pos}
                      isExpanded={isExpanded}
                      onToggle={() => toggleExpand(pos.agent.id)}
                      isDraft={isDraft}
                      canEdit={canEdit}
                      onQuickPay={() => openQuickPay(pos.agent, pos.pendente)}
                      progressColor={progressColor}
                    />
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 z-10">
                <tr className="bg-dark-900/95 backdrop-blur-sm font-semibold border-t-2 border-dark-600">
                  <td />
                  <td className="px-4 py-3 text-white font-bold">TOTAL</td>
                  <td className="px-3 py-3 text-right font-mono text-red-400 font-bold">{formatBRL(heroTotals.divida)}</td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-400 font-bold">{formatBRL(heroTotals.recebido)}</td>
                  <td className={`px-3 py-3 text-right font-mono font-bold ${heroTotals.pendente > 0.01 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                    {formatBRL(heroTotals.pendente)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="font-mono text-xs text-dark-300">{heroTotals.pct}%</span>
                  </td>
                  {isDraft && canEdit && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ═══ QUICK-PAY MODAL ═══ */}
      {payModalAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) setPayModalAgent(null); }}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-md mx-4 animate-slide-up">
            <div className="bg-dark-900 border border-dark-700 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Registrar Pagamento</h3>
                <button onClick={() => setPayModalAgent(null)} className="text-dark-500 hover:text-white text-lg w-8 h-8 flex items-center justify-center rounded-full bg-dark-800/80 border border-dark-700 transition-colors">{'\u2715'}</button>
              </div>
              <p className="text-sm text-dark-400 mb-4">Agente: <span className="text-white font-medium">{payModalAgent.agent_name}</span></p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs text-dark-400 mb-1 block">Valor (R$)</label>
                  <input type="number" step="0.01" min="0.01" value={payForm.amount} onChange={(e) => setPayForm(prev => ({ ...prev, amount: e.target.value }))} className="input w-full text-sm font-mono" />
                </div>
                <div>
                  <label className="text-xs text-dark-400 mb-1 block">Metodo</label>
                  <input type="text" value={payForm.method} onChange={(e) => setPayForm(prev => ({ ...prev, method: e.target.value }))} className="input w-full text-sm" />
                </div>
                <div>
                  <label className="text-xs text-dark-400 mb-1 block">Direcao</label>
                  <select value={payForm.dir} onChange={(e) => setPayForm(prev => ({ ...prev, dir: e.target.value as 'IN' | 'OUT' }))} className="input w-full text-sm">
                    <option value="IN">IN (Recebido)</option>
                    <option value="OUT">OUT (Pago)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-dark-400 mb-1 block">Descricao</label>
                  <input type="text" value={payForm.description} onChange={(e) => setPayForm(prev => ({ ...prev, description: e.target.value }))} className="input w-full text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setPayModalAgent(null)} disabled={saving} className="px-4 py-2 text-dark-400 hover:text-white text-sm transition-colors">Cancelar</button>
                <button onClick={handleQuickPay} disabled={saving} className="btn-primary text-sm px-6 py-2">{saving ? 'Salvando...' : 'Confirmar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agent Row (with expandable payments) ───────────────────────────

function AgentRow({ pos, isExpanded, onToggle, isDraft, canEdit, onQuickPay, progressColor }: {
  pos: AgentPosition;
  isExpanded: boolean;
  onToggle: () => void;
  isDraft: boolean;
  canEdit: boolean;
  onQuickPay: () => void;
  progressColor: (pct: number) => string;
}) {
  return (
    <>
      <tr className="hover:bg-dark-800/20 transition-colors cursor-pointer" onClick={onToggle}>
        <td className="pl-3 py-3 text-dark-500">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </td>
        <td className="px-4 py-3 text-white font-medium">
          <div className="flex items-center gap-2">
            {pos.agent.agent_name}
            <span className="text-[10px] text-dark-500">{pos.players.length} jog.</span>
          </div>
        </td>
        <td className="px-3 py-3 text-right font-mono text-red-400">{formatBRL(pos.divida)}</td>
        <td className="px-3 py-3 text-right font-mono text-emerald-400">
          {formatBRL(pos.totalRecebido)}
          {/* Mini progress */}
          <div className="w-16 h-1.5 bg-dark-700 rounded-full overflow-hidden mt-1 ml-auto">
            <div className={`h-full rounded-full ${progressColor(pos.pct)}`} style={{ width: `${pos.pct}%` }} />
          </div>
        </td>
        <td className={`px-3 py-3 text-right font-mono font-medium ${pos.pendente > 0.01 ? 'text-yellow-400' : pos.pendente < -0.01 ? 'text-blue-400' : 'text-emerald-400'}`}>
          {formatBRL(pos.pendente)}
        </td>
        <td className="px-3 py-3 text-center">
          <StatusBadgeInline status={pos.status} pct={pos.pct} />
        </td>
        {isDraft && canEdit && (
          <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onQuickPay}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-poker-600/20 border border-poker-500/30 text-poker-400 hover:bg-poker-600/30 transition-colors"
            >
              Pagar
            </button>
          </td>
        )}
      </tr>
      {/* Expanded: payment details */}
      {isExpanded && pos.entries.length > 0 && (
        <tr>
          <td colSpan={isDraft && canEdit ? 7 : 6} className="px-0 py-0">
            <div className="bg-dark-800/30 border-t border-dark-700/30">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-dark-500 uppercase tracking-wider">
                    <th className="px-6 py-1.5 text-left font-medium">Data</th>
                    <th className="px-3 py-1.5 text-left font-medium">Fonte</th>
                    <th className="px-3 py-1.5 text-left font-medium">Descricao</th>
                    <th className="px-3 py-1.5 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800/20">
                  {pos.entries.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')).map((e) => (
                    <tr key={e.id} className="hover:bg-dark-800/20">
                      <td className="px-6 py-1.5 text-dark-400 font-mono">
                        {e.created_at ? new Date(e.created_at).toLocaleDateString('pt-BR') : '\u2014'}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <SourceBadge source={e.source || e.method || 'manual'} />
                          {e.bank_account_name && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-dark-700/60 text-dark-400 font-medium">
                              {e.bank_account_name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-dark-400 truncate max-w-[200px]">{e.description || e.entity_name || '\u2014'}</td>
                      <td className={`px-3 py-1.5 text-right font-mono font-medium ${e.dir === 'IN' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {e.dir === 'IN' ? '+' : '-'}{formatBRL(Number(e.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
      {isExpanded && pos.entries.length === 0 && (
        <tr>
          <td colSpan={isDraft && canEdit ? 7 : 6} className="px-6 py-3 text-xs text-dark-500 bg-dark-800/20">
            Nenhum pagamento registrado para este agente.
          </td>
        </tr>
      )}
    </>
  );
}

function StatusBadgeInline({ status, pct }: { status: AgentPosition['status']; pct: number }) {
  const cfg = {
    quitado: { dot: 'bg-emerald-400', text: 'text-emerald-400', label: 'Quitado' },
    parcial: { dot: 'bg-yellow-400', text: 'text-yellow-400', label: `Parcial (${pct}%)` },
    pendente: { dot: 'bg-red-400', text: 'text-red-400', label: 'Pendente' },
    a_pagar: { dot: 'bg-blue-400', text: 'text-blue-400', label: 'A pagar' },
  };
  const c = cfg[status];
  return (
    <span className={`flex items-center justify-center gap-1.5 text-xs font-medium ${c.text}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const s = source.toLowerCase();
  const cfg: Record<string, { bg: string; text: string; border: string; label: string }> = {
    chippix: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', label: 'ChipPix' },
    manual: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Manual' },
    ofx: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30', label: 'OFX' },
    pix: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'PIX' },
  };
  const c = cfg[s] || { bg: 'bg-dark-700/30', text: 'text-dark-300', border: 'border-dark-600/30', label: source };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${c.bg} ${c.text} ${c.border}`}>{c.label}</span>
  );
}
