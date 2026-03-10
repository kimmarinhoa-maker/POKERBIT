'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { listLedger, getCarryForward, formatBRL } from '@/lib/api';
import { round2 } from '@/lib/formatters';
import { useSortable } from '@/lib/useSortable';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/ui/EmptyState';
import Highlight from '@/components/ui/Highlight';
import SettlementSkeleton from '@/components/ui/SettlementSkeleton';
import { Wallet } from 'lucide-react';
import type { AgentMetric, PlayerMetric, LedgerEntry, SubclubData } from '@/types/settlement';

// ─── Props ──────────────────────────────────────────────────────────

interface Props {
  settlementId: string;
  clubId: string;
  weekStart: string;
  subclub: SubclubData & { id: string; agents: AgentMetric[]; players: PlayerMetric[] };
  settlementStatus: string;
  onDataChange: () => void;
}

// ─── Channel config (sem icones) ────────────────────────────────────

const CANAIS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pix:               { label: 'PIX',               color: '#06b6d4', bg: 'rgba(6,182,212,0.08)',  border: 'rgba(6,182,212,0.25)' },
  chippix:           { label: 'ChipPix',           color: '#a855f7', bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.25)' },
  rakeback_deduzido: { label: 'Rakeback Deduzido', color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)' },
  saldo_anterior:    { label: 'Saldo Anterior',    color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)' },
};

type FilterVia = 'all' | 'pix' | 'chippix' | 'rakeback' | 'saldo_anterior';

// ─── Helpers ────────────────────────────────────────────────────────

function fmtDate(d?: string) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

// Unified row for the movimentações table
interface MovRow {
  id: string;
  date: string;
  tipo: 'entrada' | 'saida';
  via: string; // pix | chippix | rakeback | saldo_anterior
  agenteName: string;
  descricao: string;
  valor: number;
  source: string;
}

// ─── Component ──────────────────────────────────────────────────────

export default function CaixaLancamentosTab({
  settlementId, clubId, weekStart, subclub, settlementStatus, onDataChange,
}: Props) {
  const { toast } = useToast();
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const agents = useMemo(() => subclub.agents || [], [subclub.agents]);
  const players = useMemo(() => subclub.players || [], [subclub.players]);

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [carryMap, setCarryMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterVia, setFilterVia] = useState<FilterVia>('all');
  const [search, setSearch] = useState('');

  // ─── Load data (same pattern as PosicaoTab) ─────────────────────
  const loadData = useCallback(async () => {
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
      if (mountedRef.current) toast('Erro ao carregar dados do caixa', 'error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [weekStart, clubId, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Group players by agent ─────────────────────────────────────
  const playersByAgent = useMemo(() => {
    const map = new Map<string, PlayerMetric[]>();
    for (const p of players) {
      const key = p.agent_name || 'SEM AGENTE';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [players]);

  // ─── Group ledger by entity_id ──────────────────────────────────
  const ledgerByEntity = useMemo(() => {
    const map = new Map<string, LedgerEntry[]>();
    for (const e of entries) {
      if (!map.has(e.entity_id)) map.set(e.entity_id, []);
      map.get(e.entity_id)!.push(e);
    }
    return map;
  }, [entries]);

  // ─── Build unified movimentações from real data ─────────────────
  const { rows, channelTotals, plTotal, agentCount } = useMemo(() => {
    const allRows: MovRow[] = [];
    let totalPix = 0;
    let totalChippix = 0;
    let totalRakeback = 0;
    let totalSaldoAnterior = 0;

    for (const agent of agents) {
      const agPlayers = playersByAgent.get(agent.agent_name) || [];

      // Collect all ledger entries for this agent (same logic as PosicaoTab)
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

      // Process ledger entries → PIX or ChipPix rows
      for (const e of agEntries) {
        const amt = Number(e.amount);
        const src = (e.source || '').toLowerCase();
        const isChippix = src === 'chippix';
        const via = isChippix ? 'chippix' : 'pix';
        const signed = e.dir === 'IN' ? amt : -amt;

        if (isChippix) totalChippix += signed;
        else totalPix += signed;

        allRows.push({
          id: e.id,
          date: e.created_at || '',
          tipo: e.dir === 'IN' ? 'entrada' : 'saida',
          via,
          agenteName: agent.agent_name,
          descricao: e.description || e.entity_name || (isChippix ? 'ChipPix' : e.method || 'PIX'),
          valor: amt,
          source: e.source || 'manual',
        });
      }

      // Rakeback from player metrics
      const rbTotal = round2(agPlayers.reduce((s, p) => s + (p.rb_value_brl || 0), 0));
      if (rbTotal > 0) {
        totalRakeback += rbTotal;
        allRows.push({
          id: `rb_${agent.id}`,
          date: '',
          tipo: 'saida',
          via: 'rakeback',
          agenteName: agent.agent_name,
          descricao: `Rakeback ${agPlayers.length} jogador(es)`,
          valor: rbTotal,
          source: 'rakeback',
        });
      }

      // Saldo Anterior from carry_forward
      const carryKey = agent.agent_id || agent.id;
      const carry = carryMap[carryKey] || 0;
      if (Math.abs(carry) > 0.01) {
        // carry > 0 means club is owed (entrada), carry < 0 means club owes (saida)
        const isEntrada = carry > 0;
        if (isEntrada) totalSaldoAnterior += carry;
        else totalSaldoAnterior += carry; // negative
        allRows.push({
          id: `carry_${agent.id}`,
          date: '',
          tipo: isEntrada ? 'entrada' : 'saida',
          via: 'saldo_anterior',
          agenteName: agent.agent_name,
          descricao: 'Saldo Anterior',
          valor: Math.abs(carry),
          source: 'carry_forward',
        });
      }
    }

    const pl = Math.abs(subclub.totals?.ganhos ?? 0);

    return {
      rows: allRows,
      channelTotals: {
        pix: round2(totalPix),
        chippix: round2(totalChippix),
        rakeback_deduzido: round2(totalRakeback),
        saldo_anterior: round2(totalSaldoAnterior),
      },
      plTotal: pl,
      agentCount: agents.length,
    };
  }, [agents, playersByAgent, ledgerByEntity, carryMap, subclub.totals]);

  // ─── Computed totals ────────────────────────────────────────────
  const totalRecebido = round2(
    Math.max(0, channelTotals.pix) + Math.max(0, channelTotals.chippix) + Math.max(0, channelTotals.saldo_anterior)
  );
  const faltaReceber = Math.max(0, round2(plTotal - totalRecebido));
  const pctRecebido = plTotal > 0 ? round2((totalRecebido / plTotal) * 100) : 0;
  const pctFalta = plTotal > 0 ? round2((faltaReceber / plTotal) * 100) : 0;

  // ─── Filter rows ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = rows;
    if (filterVia !== 'all') result = result.filter((r) => r.via === filterVia);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (r) => r.agenteName.toLowerCase().includes(s) || r.descricao.toLowerCase().includes(s),
      );
    }
    return result;
  }, [rows, filterVia, search]);

  // ─── Sort ──────────────────────────────────────────────────────
  type SortKey = 'date' | 'agente' | 'via' | 'valor';
  const getSortValue = useCallback((r: MovRow, key: SortKey): string | number => {
    switch (key) {
      case 'date': return r.date;
      case 'agente': return r.agenteName;
      case 'via': return r.via;
      case 'valor': return r.valor * (r.tipo === 'saida' ? -1 : 1);
    }
  }, []);

  const { sorted, handleSort, sortIcon, ariaSort } = useSortable<MovRow, SortKey>({
    data: filtered,
    defaultKey: 'date',
    getValue: getSortValue,
  });

  if (loading) return <SettlementSkeleton kpis={3} />;

  return (
    <div>

      {/* Header */}
      <div className="mb-5">
        <h3 className="text-lg font-bold text-white">Fluxo de Caixa</h3>
        <p className="text-dark-500 text-xs">
          Rastreamento de recebimentos e pagamentos por canal
        </p>
      </div>

      {/* ─── Hero KPIs ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        {/* P&L Total */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-0.5 bg-red-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">P&L Jogadores</p>
            <p className="text-xl font-bold font-mono text-white">{formatBRL(plTotal)}</p>
            <p className="text-[10px] text-dark-500 mt-0.5">Resultado da semana • {agentCount} agentes</p>
          </div>
        </div>

        {/* Ja Recebido */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-0.5 bg-poker-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Ja Recebido</p>
            <p className="text-xl font-bold font-mono text-poker-400">{formatBRL(totalRecebido)}</p>
            <p className="text-[10px] text-dark-500 mt-0.5">{pctRecebido}% do total</p>
            <div className="w-full bg-dark-800 rounded-full h-1 mt-1.5">
              <div className="h-1 rounded-full bg-poker-500 transition-all duration-700" style={{ width: `${Math.min(pctRecebido, 100)}%` }} />
            </div>
          </div>
        </div>

        {/* Falta Receber */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-0.5 bg-yellow-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Falta Receber</p>
            <p className="text-xl font-bold font-mono text-yellow-400">{formatBRL(faltaReceber)}</p>
            <p className="text-[10px] text-dark-500 mt-0.5">{pctFalta}% pendente</p>
            <div className="w-full bg-dark-800 rounded-full h-1 mt-1.5">
              <div className="h-1 rounded-full bg-yellow-500 transition-all duration-700" style={{ width: `${Math.min(pctFalta, 100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Canal Cards (sem icones) ─────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {(['pix', 'chippix', 'rakeback_deduzido', 'saldo_anterior'] as const).map((via) => {
          const cfg = CANAIS[via];
          const total = channelTotals[via];
          const absTotal = Math.abs(total);
          const pct = plTotal > 0 ? round2((absTotal / plTotal) * 100) : 0;

          return (
            <div key={via} className="bg-dark-900 border border-dark-700 rounded-xl p-3 hover:border-dark-600 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-white">{cfg.label}</span>
                <span className="text-[10px] text-dark-500 font-mono">{pct}%</span>
              </div>
              <p className={`text-sm font-bold font-mono mb-1 ${total >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                {formatBRL(absTotal)}
              </p>
              <div className="w-full bg-dark-800 rounded-full h-1 mt-2">
                <div
                  className="h-1 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: `${cfg.color}90` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Two Column: Table + Sidebar ────────────────────────── */}
      <div className="flex gap-4">

        {/* Left: Table */}
        <div className="flex-1 min-w-0">
          {/* Filters */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input
              type="text"
              placeholder="Buscar agente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 max-w-[200px] bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-1.5 text-xs text-white placeholder-dark-500 focus:border-poker-500 focus:outline-none"
            />
            <select value={filterVia} onChange={(e) => setFilterVia(e.target.value as FilterVia)} className="bg-dark-800 border border-dark-700/50 rounded-lg px-2 py-1.5 text-xs text-dark-200 focus:border-poker-500 focus:outline-none">
              <option value="all">Via: Todas</option>
              <option value="pix">PIX</option>
              <option value="chippix">ChipPix</option>
              <option value="rakeback">Rakeback</option>
              <option value="saldo_anterior">Saldo Ant.</option>
            </select>
          </div>

          {/* Table */}
          {sorted.length === 0 ? (
            <div className="card">
              <EmptyState icon={Wallet} title="Nenhuma movimentacao" description="Importe dados de ChipPix ou registre pagamentos na aba Posicao." />
            </div>
          ) : (
            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm data-table">
                  <thead>
                    <tr className="bg-dark-800/50">
                      <th className="px-3 py-2.5 text-left font-medium text-[10px] text-dark-400 uppercase cursor-pointer hover:text-dark-200" onClick={() => handleSort('date')} aria-sort={ariaSort('date')}>Data{sortIcon('date')}</th>
                      <th className="px-2 py-2.5 text-center font-medium text-[10px] text-dark-400 uppercase">Tipo</th>
                      <th className="px-3 py-2.5 text-left font-medium text-[10px] text-dark-400 uppercase cursor-pointer hover:text-dark-200" onClick={() => handleSort('agente')} aria-sort={ariaSort('agente')}>Agente{sortIcon('agente')}</th>
                      <th className="px-2 py-2.5 text-center font-medium text-[10px] text-dark-400 uppercase cursor-pointer hover:text-dark-200" onClick={() => handleSort('via')} aria-sort={ariaSort('via')}>Via{sortIcon('via')}</th>
                      <th className="px-3 py-2.5 text-right font-medium text-[10px] text-dark-400 uppercase cursor-pointer hover:text-dark-200" onClick={() => handleSort('valor')} aria-sort={ariaSort('valor')}>Valor{sortIcon('valor')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800/50">
                    {sorted.map((r) => {
                      const isEntrada = r.tipo === 'entrada';
                      const viaCfg = CANAIS[r.via] || CANAIS[r.via === 'rakeback' ? 'rakeback_deduzido' : r.via];

                      return (
                        <tr key={r.id} className="hover:bg-dark-800/30">
                          <td className="px-3 py-2 text-dark-300 text-xs font-mono">{fmtDate(r.date) || '\u2014'}</td>
                          <td className="px-2 py-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                              isEntrada
                                ? 'bg-poker-900/20 text-poker-400 border-poker-700/30'
                                : 'bg-red-900/20 text-red-400 border-red-700/30'
                            }`}>
                              {isEntrada ? '▲' : '▼'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-white text-xs truncate max-w-[180px]">
                            <div>
                              <Highlight text={r.agenteName} query={search} />
                              <p className="text-[10px] text-dark-500 truncate">
                                <Highlight text={r.descricao} query={search} />
                              </p>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center">
                            {viaCfg ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: viaCfg.bg, color: viaCfg.color, border: `1px solid ${viaCfg.border}` }}>
                                {viaCfg.label}
                              </span>
                            ) : <span className="text-dark-600 text-[10px]">{r.via}</span>}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono font-medium text-xs ${
                            isEntrada ? 'text-poker-400' : 'text-red-400'
                          }`}>
                            {isEntrada ? '+' : '\u2212'}{formatBRL(r.valor)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="px-3 py-2 bg-dark-800/30 flex items-center justify-between border-t border-dark-800/50">
                <span className="text-[10px] text-dark-400">{filtered.length} movimentacao{filtered.length !== 1 ? 'es' : ''}</span>
                <div className="flex items-center gap-4 text-[10px] font-mono">
                  <span className="text-poker-400">IN: {formatBRL(filtered.filter(r => r.tipo === 'entrada').reduce((s, r) => s + r.valor, 0))}</span>
                  <span className="text-red-400">OUT: {formatBRL(filtered.filter(r => r.tipo === 'saida').reduce((s, r) => s + r.valor, 0))}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Sidebar */}
        <div className="w-[280px] flex-shrink-0 space-y-3 hidden xl:block">

          {/* Fluxo Visual */}
          <div className="card p-3">
            <h4 className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-3">Fluxo do Dinheiro</h4>
            {(['pix', 'chippix', 'rakeback_deduzido', 'saldo_anterior'] as const).map((via) => {
              const cfg = CANAIS[via];
              const total = Math.abs(channelTotals[via]);
              const pct = plTotal > 0 ? round2((total / plTotal) * 100) : 0;
              return (
                <div key={via} className="mb-2.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-dark-400">{cfg.label}</span>
                    <span className="text-[10px] font-mono text-dark-300">{formatBRL(total)}</span>
                  </div>
                  <div className="w-full bg-dark-800 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: cfg.color }} />
                  </div>
                </div>
              );
            })}
            <div className="border-t border-dark-700/50 pt-2 mt-2">
              <div className="text-[9px] text-dark-500 uppercase tracking-wider font-bold text-center mb-1">CAIXA DO CLUBE</div>
              <div className="w-full bg-dark-800 rounded-full h-2">
                <div className="h-2 rounded-full bg-poker-500 transition-all duration-500" style={{ width: `${Math.min(pctRecebido, 100)}%` }} />
              </div>
              <div className="text-center text-[10px] text-dark-400 mt-0.5 font-mono">{pctRecebido}%</div>
            </div>
          </div>

          {/* Resultado */}
          <div className="card p-3">
            <h4 className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-2">Resultado</h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-dark-400">PIX</span>
                <span className="font-mono text-poker-400">{formatBRL(Math.abs(channelTotals.pix))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dark-400">ChipPix</span>
                <span className="font-mono text-poker-400">{formatBRL(Math.abs(channelTotals.chippix))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dark-400">(-) Rakeback</span>
                <span className="font-mono text-red-400">{formatBRL(channelTotals.rakeback_deduzido)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dark-400">Saldo Anterior</span>
                <span className={`font-mono ${channelTotals.saldo_anterior >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                  {formatBRL(Math.abs(channelTotals.saldo_anterior))}
                </span>
              </div>
            </div>
            <div className="border-t border-dark-700/50 pt-2 mt-2 flex items-center justify-between">
              <span className="text-xs font-bold text-white">Total Recebido</span>
              <span className={`text-lg font-bold font-mono ${totalRecebido >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                {formatBRL(totalRecebido)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
