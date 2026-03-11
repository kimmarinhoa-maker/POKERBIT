'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { listLedger, getCarryForward, formatBRL, createLedgerEntry, invalidateCache } from '@/lib/api';
import { round2 } from '@/lib/formatters';
import { useSortable } from '@/lib/useSortable';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/useAuth';
import EmptyState from '@/components/ui/EmptyState';
import Highlight from '@/components/ui/Highlight';
import SettlementSkeleton from '@/components/ui/SettlementSkeleton';
import { Wallet, Plus, X } from 'lucide-react';
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

// ─── Channel config ─────────────────────────────────────────────────

const CANAIS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pix:               { label: 'PIX',               color: '#06b6d4', bg: 'rgba(6,182,212,0.08)',  border: 'rgba(6,182,212,0.25)' },
  chippix:           { label: 'ChipPix',           color: '#a855f7', bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.25)' },
  rakeback_deduzido: { label: 'Rakeback',          color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)' },
  saldo_anterior:    { label: 'Saldo Anterior',    color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)' },
};

type FilterVia = 'all' | 'pix' | 'chippix' | 'rakeback' | 'saldo_anterior';

// Row consolidada: 1 linha por agente por canal, valor = líquido
interface MovRow {
  id: string;
  via: string;
  agenteName: string;
  descricao: string;
  valorLiquido: number;
  entradas: number;
  saidas: number;
  txCount: number;
}

// ─── Component ──────────────────────────────────────────────────────

export default function CaixaLancamentosTab({
  settlementId, clubId, weekStart, subclub, settlementStatus, onDataChange,
}: Props) {
  const { toast } = useToast();
  const { canAccess } = useAuth();
  const canEdit = canAccess('OWNER', 'ADMIN', 'FINANCEIRO');
  const isDraft = settlementStatus === 'DRAFT';
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

  // Modal
  const [showModal, setShowModal] = useState(false);

  // ─── Load data ────────────────────────────────────────────────────
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

  // ─── Group players by agent ───────────────────────────────────────
  const playersByAgent = useMemo(() => {
    const map = new Map<string, PlayerMetric[]>();
    for (const p of players) {
      const key = p.agent_name || 'SEM AGENTE';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [players]);

  // ─── Group ledger by entity_id ────────────────────────────────────
  const ledgerByEntity = useMemo(() => {
    const map = new Map<string, LedgerEntry[]>();
    for (const e of entries) {
      if (!map.has(e.entity_id)) map.set(e.entity_id, []);
      map.get(e.entity_id)!.push(e);
    }
    return map;
  }, [entries]);

  // ─── Build consolidated rows ──────────────────────────────────────
  const { rows, channelTotals, plTotal, agentCount } = useMemo(() => {
    const allRows: MovRow[] = [];
    let totalPix = 0;
    let totalChippix = 0;
    let totalRakeback = 0;
    let totalSaldoAnterior = 0;

    function collectEntries(
      agentIds: string[],
      groupPlayers: PlayerMetric[],
      globalSeen: Set<string>,
    ): LedgerEntry[] {
      const seen = new Set<string>();
      const result: LedgerEntry[] = [];
      function add(list: LedgerEntry[] | undefined) {
        if (!list) return;
        for (const e of list) {
          if (!seen.has(e.id) && !globalSeen.has(e.id)) {
            seen.add(e.id);
            globalSeen.add(e.id);
            result.push(e);
          }
        }
      }
      for (const aid of agentIds) add(ledgerByEntity.get(aid));
      for (const p of groupPlayers) {
        if (p.id) add(ledgerByEntity.get(p.id));
        if (p.player_id) add(ledgerByEntity.get(p.player_id));
        if (p.external_player_id) {
          const eid = String(p.external_player_id);
          add(ledgerByEntity.get(eid));
          add(ledgerByEntity.get(`cp_${eid}`));
        }
      }
      return result;
    }

    function processGroup(
      groupId: string,
      groupName: string,
      groupEntries: LedgerEntry[],
      groupPlayers: PlayerMetric[],
      carryKey: string | null,
    ) {
      let pixIn = 0, pixOut = 0, pixCount = 0;
      let cpIn = 0, cpOut = 0, cpCount = 0;

      for (const e of groupEntries) {
        const amt = Number(e.amount);
        const src = (e.source || '').toLowerCase();
        if (src === 'chippix') {
          if (e.dir === 'IN') cpIn += amt; else cpOut += amt;
          cpCount++;
        } else {
          if (e.dir === 'IN') pixIn += amt; else pixOut += amt;
          pixCount++;
        }
      }

      const cpLiquido = round2(cpIn - cpOut);
      if (cpCount > 0) {
        totalChippix += cpLiquido;
        allRows.push({ id: `cp_${groupId}`, via: 'chippix', agenteName: groupName, descricao: cpCount === 1 ? '1 transacao' : `${cpCount} transacoes`, valorLiquido: cpLiquido, entradas: round2(cpIn), saidas: round2(cpOut), txCount: cpCount });
      }

      const pixLiquido = round2(pixIn - pixOut);
      if (pixCount > 0) {
        totalPix += pixLiquido;
        allRows.push({ id: `pix_${groupId}`, via: 'pix', agenteName: groupName, descricao: pixCount === 1 ? '1 transacao' : `${pixCount} transacoes`, valorLiquido: pixLiquido, entradas: round2(pixIn), saidas: round2(pixOut), txCount: pixCount });
      }

      const rbTotal = round2(groupPlayers.reduce((s, p) => s + (p.rb_value_brl || 0), 0));
      if (rbTotal > 0) {
        totalRakeback += rbTotal;
        allRows.push({ id: `rb_${groupId}`, via: 'rakeback', agenteName: groupName, descricao: `${groupPlayers.length} jogador(es)`, valorLiquido: -rbTotal, entradas: 0, saidas: rbTotal, txCount: groupPlayers.length });
      }

      if (carryKey) {
        const carry = carryMap[carryKey] || 0;
        if (Math.abs(carry) > 0.01) {
          totalSaldoAnterior += carry;
          allRows.push({ id: `carry_${groupId}`, via: 'saldo_anterior', agenteName: groupName, descricao: 'Saldo Anterior', valorLiquido: carry, entradas: carry > 0 ? carry : 0, saidas: carry < 0 ? Math.abs(carry) : 0, txCount: 1 });
        }
      }
    }

    const globalSeen = new Set<string>();

    for (const agent of agents) {
      const agPlayers = playersByAgent.get(agent.agent_name) || [];
      const agentIds = [agent.id, agent.agent_id].filter(Boolean) as string[];
      const agEntries = collectEntries(agentIds, agPlayers, globalSeen);
      processGroup(agent.id, agent.agent_name, agEntries, agPlayers, agent.agent_id || agent.id);
    }

    const agentNames = new Set(agents.map(a => a.agent_name));
    const orphanPlayers = players.filter(p => !p.agent_name || !agentNames.has(p.agent_name));
    if (orphanPlayers.length > 0) {
      const orphanEntries = collectEntries([], orphanPlayers, globalSeen);
      processGroup('_orphan', 'SEM AGENTE', orphanEntries, orphanPlayers, null);
    }

    return {
      rows: allRows,
      channelTotals: { pix: round2(totalPix), chippix: round2(totalChippix), rakeback_deduzido: round2(totalRakeback), saldo_anterior: round2(totalSaldoAnterior) },
      plTotal: Math.abs(subclub.totals?.ganhos ?? 0),
      agentCount: agents.length + (orphanPlayers.length > 0 ? 1 : 0),
    };
  }, [agents, players, playersByAgent, ledgerByEntity, carryMap, subclub.totals]);

  // ─── Computed totals ──────────────────────────────────────────────
  const totalRecebido = round2(Math.max(0, channelTotals.pix) + Math.max(0, channelTotals.chippix) + Math.max(0, channelTotals.saldo_anterior));
  const faltaReceber = Math.max(0, round2(plTotal - totalRecebido));
  const pctRecebido = plTotal > 0 ? round2((totalRecebido / plTotal) * 100) : 0;
  const pctFalta = plTotal > 0 ? round2((faltaReceber / plTotal) * 100) : 0;

  // ─── Filter rows ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = rows;
    if (filterVia !== 'all') result = result.filter((r) => r.via === filterVia);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((r) => r.agenteName.toLowerCase().includes(s) || r.descricao.toLowerCase().includes(s));
    }
    return result;
  }, [rows, filterVia, search]);

  // ─── Sort ─────────────────────────────────────────────────────────
  type SortKey = 'agente' | 'via' | 'valor';
  const getSortValue = useCallback((r: MovRow, key: SortKey): string | number => {
    switch (key) {
      case 'agente': return r.agenteName;
      case 'via': return r.via;
      case 'valor': return r.valorLiquido;
    }
  }, []);

  const { sorted, handleSort, sortIcon, ariaSort } = useSortable<MovRow, SortKey>({
    data: filtered,
    defaultKey: 'valor',
    getValue: getSortValue,
  });

  const footerLiquido = round2(filtered.reduce((s, r) => s + r.valorLiquido, 0));

  // ─── Clear filter helper ──────────────────────────────────────────
  const clearFilter = () => setFilterVia('all');

  if (loading) return <SettlementSkeleton kpis={3} />;

  // ─── Sidebar channel data ─────────────────────────────────────────
  const sidebarCanais = [
    { key: 'pix' as const, label: 'PIX', valor: Math.abs(channelTotals.pix), color: '#06b6d4' },
    { key: 'chippix' as const, label: 'ChipPix', valor: Math.abs(channelTotals.chippix), color: '#a855f7' },
    { key: 'rakeback_deduzido' as const, label: 'Rakeback', valor: channelTotals.rakeback_deduzido, color: '#f97316' },
    { key: 'saldo_anterior' as const, label: 'Saldo Ant.', valor: Math.abs(channelTotals.saldo_anterior), color: '#3b82f6' },
  ];
  const maxSidebarVal = Math.max(...sidebarCanais.map(c => c.valor), 1);

  return (
    <div>

      {/* ─── Header + Novo Lancamento ──────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-bold text-white">Fluxo de Caixa</h3>
          <p className="text-dark-500 text-xs">Valores liquidos por agente e canal (IN - OUT)</p>
        </div>
        {isDraft && canEdit && (
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 rounded-lg bg-poker-600/20 text-poker-400 border border-poker-700/40 text-xs font-semibold hover:bg-poker-600/30 transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo Lancamento
          </button>
        )}
      </div>

      {/* ─── Hero KPIs (barras h-1.5) ────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-0.5 bg-red-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">P&L Jogadores</p>
            <p className="text-xl font-bold font-mono text-white">{formatBRL(plTotal)}</p>
            <p className="text-[10px] text-dark-500 mt-0.5">Resultado da semana • {agentCount} agentes</p>
          </div>
        </div>

        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-0.5 bg-poker-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Ja Recebido</p>
            <p className="text-xl font-bold font-mono text-poker-400">{formatBRL(totalRecebido)}</p>
            <p className="text-[10px] text-dark-500 mt-0.5">{pctRecebido}% do total</p>
            <div className="w-full bg-dark-800 rounded-full h-1.5 mt-1.5">
              <div className="h-1.5 rounded-full bg-poker-500 transition-all duration-700" style={{ width: `${Math.min(pctRecebido, 100)}%` }} />
            </div>
          </div>
        </div>

        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-0.5 bg-yellow-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Falta Receber</p>
            <p className="text-xl font-bold font-mono text-yellow-400">{formatBRL(faltaReceber)}</p>
            <p className="text-[10px] text-dark-500 mt-0.5">{pctFalta}% pendente</p>
            <div className="w-full bg-dark-800 rounded-full h-1.5 mt-1.5">
              <div className="h-1.5 rounded-full bg-yellow-500 transition-all duration-700" style={{ width: `${Math.min(pctFalta, 100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Canal Cards (opacity-35 se zerado, IN/OUT em 2 linhas, barra h-1.5) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {(['pix', 'chippix', 'rakeback_deduzido', 'saldo_anterior'] as const).map((via) => {
          const cfg = CANAIS[via];
          const liquido = channelTotals[via];
          const absLiquido = Math.abs(liquido);
          const isZero = absLiquido < 0.01;
          const pct = plTotal > 0 ? round2((absLiquido / plTotal) * 100) : 0;

          const viaKey = via === 'rakeback_deduzido' ? 'rakeback' : via;
          const viaRows = rows.filter(r => r.via === viaKey);
          const grossIn = round2(viaRows.reduce((s, r) => s + r.entradas, 0));
          const grossOut = round2(viaRows.reduce((s, r) => s + r.saidas, 0));

          return (
            <div
              key={via}
              className={`bg-dark-900 border border-dark-700 rounded-xl p-3 hover:border-dark-600 transition-all ${isZero ? 'opacity-35' : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-white">{cfg.label}</span>
                <span className="text-[10px] text-dark-500 font-mono">{pct}%</span>
              </div>
              <p className={`text-sm font-bold font-mono mb-1 ${liquido >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                {liquido < 0 ? '\u2212' : ''}{formatBRL(absLiquido)}
              </p>
              {/* IN/OUT em duas linhas separadas */}
              {!isZero && (grossIn > 0 || grossOut > 0) && (
                <div className="mt-2 space-y-0.5">
                  {grossIn > 0 && (
                    <div className="flex justify-between text-[10px]">
                      <span className="text-dark-500">Entradas</span>
                      <span className="font-mono font-semibold text-poker-400">{formatBRL(grossIn)}</span>
                    </div>
                  )}
                  {grossOut > 0 && (
                    <div className="flex justify-between text-[10px]">
                      <span className="text-dark-500">Saidas</span>
                      <span className="font-mono font-semibold text-red-400">{formatBRL(grossOut)}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="w-full bg-dark-800 rounded-full h-1.5 mt-2">
                <div
                  className="h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: `${cfg.color}90` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Two Column: Table + Sidebar ─────────────────────────── */}
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
            <div className="flex items-center gap-1">
              <select value={filterVia} onChange={(e) => setFilterVia(e.target.value as FilterVia)} className="bg-dark-800 border border-dark-700/50 rounded-lg px-2 py-1.5 text-xs text-dark-200 focus:border-poker-500 focus:outline-none">
                <option value="all">Via: Todas</option>
                <option value="pix">PIX</option>
                <option value="chippix">ChipPix</option>
                <option value="rakeback">Rakeback</option>
                <option value="saldo_anterior">Saldo Ant.</option>
              </select>
              {filterVia !== 'all' && (
                <button onClick={clearFilter} className="p-1 rounded hover:bg-dark-700 text-dark-400 hover:text-white transition-colors" title="Limpar filtro">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
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
                      <th className="px-3 py-2.5 text-left font-medium text-[10px] text-dark-400 uppercase cursor-pointer hover:text-dark-200" onClick={() => handleSort('agente')} aria-sort={ariaSort('agente')}>Agente{sortIcon('agente')}</th>
                      <th className="px-2 py-2.5 text-center font-medium text-[10px] text-dark-400 uppercase cursor-pointer hover:text-dark-200" onClick={() => handleSort('via')} aria-sort={ariaSort('via')}>Canal{sortIcon('via')}</th>
                      <th className="px-3 py-2.5 text-right font-medium text-[10px] text-dark-400 uppercase">Entradas</th>
                      <th className="px-3 py-2.5 text-right font-medium text-[10px] text-dark-400 uppercase">Saidas</th>
                      <th className="px-3 py-2.5 text-right font-medium text-[10px] text-dark-400 uppercase cursor-pointer hover:text-dark-200" onClick={() => handleSort('valor')} aria-sort={ariaSort('valor')}>Liquido{sortIcon('valor')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800/50">
                    {sorted.map((r) => {
                      const viaCfg = CANAIS[r.via] || CANAIS[r.via === 'rakeback' ? 'rakeback_deduzido' : r.via];
                      const isPositive = r.valorLiquido >= 0;

                      return (
                        <tr key={r.id} className="hover:bg-dark-800/30">
                          <td className="px-3 py-2 text-white text-xs">
                            <div>
                              <Highlight text={r.agenteName} query={search} />
                              <p className="text-[10px] text-dark-500">{r.descricao}</p>
                            </div>
                          </td>
                          {/* Badge clicável como filtro */}
                          <td className="px-2 py-2 text-center">
                            {viaCfg ? (
                              <button
                                onClick={() => setFilterVia(r.via as FilterVia)}
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer hover:brightness-125 transition-all"
                                style={{ background: viaCfg.bg, color: viaCfg.color, border: `1px solid ${viaCfg.border}` }}
                                title={`Filtrar por ${viaCfg.label}`}
                              >
                                {viaCfg.label}
                              </button>
                            ) : <span className="text-dark-600 text-[10px]">{r.via}</span>}
                          </td>
                          {/* Entradas — vazio se zero (sem traço) */}
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {r.entradas > 0 && (
                              <span className="text-poker-400 font-semibold">{formatBRL(r.entradas)}</span>
                            )}
                          </td>
                          {/* Saidas — vazio se zero (sem traço) */}
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {r.saidas > 0 && (
                              <span className="text-red-400 font-semibold">{formatBRL(r.saidas)}</span>
                            )}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono font-bold text-xs ${isPositive ? 'text-poker-400' : 'text-red-400'}`}>
                            {isPositive ? '+' : '\u2212'}{formatBRL(Math.abs(r.valorLiquido))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-dark-800/40 border-t-2 border-dark-600">
                      <td className="px-3 py-2.5 text-white text-xs font-bold">TOTAL</td>
                      <td className="px-2 py-2.5 text-center text-[10px] text-dark-400">{filtered.length} linhas</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-poker-400 font-bold">
                        {formatBRL(round2(filtered.reduce((s, r) => s + r.entradas, 0)))}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-red-400 font-bold">
                        {formatBRL(round2(filtered.reduce((s, r) => s + r.saidas, 0)))}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono text-xs font-bold ${footerLiquido >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                        {footerLiquido >= 0 ? '+' : '\u2212'}{formatBRL(Math.abs(footerLiquido))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ─── Sidebar ─────────────────────────────────────────────── */}
        <div className="w-[280px] flex-shrink-0 space-y-3 hidden xl:block">

          {/* Fluxo do Dinheiro — barras proporcionais */}
          <div className="card p-3">
            <h4 className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-3">Fluxo do Dinheiro</h4>
            <div className="space-y-2">
              {sidebarCanais.map((canal) => {
                const barPct = maxSidebarVal > 0 ? (canal.valor / maxSidebarVal) * 100 : 0;
                const totalGeral = sidebarCanais.reduce((s, c) => s + c.valor, 0);
                const sharePct = totalGeral > 0 ? Math.round((canal.valor / totalGeral) * 100) : 0;
                return (
                  <div key={canal.key} className="flex items-center gap-2">
                    <span className="w-14 text-right text-[10px] font-semibold shrink-0" style={{ color: canal.color }}>
                      {canal.label}
                    </span>
                    <div className="flex-1 h-5 bg-white/[0.02] rounded overflow-hidden">
                      <div
                        className="h-full rounded flex items-center pl-1.5 transition-all duration-700"
                        style={{ width: `${barPct}%`, backgroundColor: `${canal.color}50` }}
                      >
                        {barPct > 15 && (
                          <span className="text-[9px] font-mono font-bold text-white/80">{sharePct}%</span>
                        )}
                      </div>
                    </div>
                    <span className="w-20 text-right text-[10px] font-mono font-bold shrink-0" style={{ color: canal.color }}>
                      {formatBRL(canal.valor)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Separador ▼ CAIXA DO CLUBE */}
            <div className="flex items-center gap-2 my-3 text-[10px] text-dark-500">
              <div className="flex-1 h-px bg-dark-700/50" />
              <span>▼ CAIXA DO CLUBE</span>
              <div className="flex-1 h-px bg-dark-700/50" />
            </div>

            {/* Barra verde de progresso geral */}
            <div className="h-6 bg-white/[0.02] rounded overflow-hidden">
              <div
                className="h-full rounded bg-emerald-500/50 flex items-center justify-center transition-all duration-700"
                style={{ width: `${Math.min(pctRecebido, 100)}%` }}
              >
                <span className="text-[10px] font-mono font-bold text-white">{pctRecebido.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Resultado — Rakeback em vermelho, Total com destaque */}
          <div className="card p-3">
            <h4 className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-2">Resultado</h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between py-0.5">
                <span className="text-dark-400">PIX (liquido)</span>
                <span className={`font-mono font-semibold ${channelTotals.pix >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                  {channelTotals.pix < 0 ? '\u2212' : ''}{formatBRL(Math.abs(channelTotals.pix))}
                </span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span className="text-dark-400">ChipPix (liquido)</span>
                <span className={`font-mono font-semibold ${channelTotals.chippix >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                  {channelTotals.chippix < 0 ? '\u2212' : ''}{formatBRL(Math.abs(channelTotals.chippix))}
                </span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span className="text-dark-400">(-) Rakeback</span>
                <span className="font-mono font-semibold text-red-400">{formatBRL(channelTotals.rakeback_deduzido)}</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span className="text-dark-400">Saldo Anterior</span>
                <span className={`font-mono font-semibold ${channelTotals.saldo_anterior >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                  {channelTotals.saldo_anterior < 0 ? '\u2212' : ''}{formatBRL(Math.abs(channelTotals.saldo_anterior))}
                </span>
              </div>
            </div>
            {/* Total Recebido com mais destaque */}
            <div className="mt-2 pt-3 border-t border-emerald-500/20">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-white">Total Recebido</span>
                <span className={`font-mono text-lg font-extrabold ${totalRecebido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatBRL(totalRecebido)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Modal: Novo Lancamento ──────────────────────────────── */}
      {showModal && (
        <NovoLancamentoModal
          weekStart={weekStart}
          agents={agents}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            invalidateCache('/ledger');
            loadData();
            onDataChange();
          }}
        />
      )}
    </div>
  );
}

// ─── Novo Lancamento Modal ──────────────────────────────────────────

function NovoLancamentoModal({
  weekStart, agents, onClose, onCreated,
}: {
  weekStart: string;
  agents: AgentMetric[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [dir, setDir] = useState<'IN' | 'OUT'>('IN');
  const [agentId, setAgentId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('PIX');
  const [description, setDescription] = useState('');

  const selectedAgent = agents.find(a => (a.agent_id || a.id) === agentId);

  const handleSave = async () => {
    const numVal = Number(amount.replace(',', '.'));
    if (!numVal || numVal <= 0) { toast('Valor invalido', 'error'); return; }
    if (!agentId) { toast('Selecione um agente', 'error'); return; }

    setSaving(true);
    try {
      const res = await createLedgerEntry({
        entity_id: agentId,
        entity_name: selectedAgent?.agent_name || 'Manual',
        week_start: weekStart,
        dir,
        amount: numVal,
        method: method || undefined,
        description: description || undefined,
      });
      if (res.success) { toast('Lancamento criado', 'success'); onCreated(); }
      else toast(res.error || 'Erro', 'error');
    } catch { toast('Erro ao criar lancamento', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-900 border border-dark-700 rounded-xl shadow-modal w-full max-w-md animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700/50">
          <h3 className="text-white font-semibold">Novo Lancamento</h3>
          <button onClick={onClose} className="text-dark-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Tipo */}
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1">Tipo</label>
            <div className="flex gap-2">
              {(['IN', 'OUT'] as const).map((d) => (
                <button key={d} onClick={() => setDir(d)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                    dir === d
                      ? d === 'IN' ? 'bg-poker-900/30 text-poker-400 border-poker-700/40' : 'bg-red-900/30 text-red-400 border-red-700/40'
                      : 'bg-dark-800 text-dark-400 border-dark-700/50 hover:bg-dark-700/50'
                  }`}>
                  {d === 'IN' ? '▲ Entrada' : '▼ Saida'}
                </button>
              ))}
            </div>
          </div>
          {/* Agente */}
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1">Agente</label>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-poker-500 focus:outline-none">
              <option value="">Selecionar...</option>
              {agents.map(a => (
                <option key={a.id} value={a.agent_id || a.id}>{a.agent_name}</option>
              ))}
            </select>
          </div>
          {/* Metodo */}
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1">Metodo</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-poker-500 focus:outline-none">
              <option value="PIX">PIX</option>
              <option value="ChipPix">ChipPix</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
          {/* Valor */}
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1">Valor (R$)</label>
            <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-poker-500 focus:outline-none" />
          </div>
          {/* Descricao */}
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1">Descricao</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descricao opcional" className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-poker-500 focus:outline-none" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-dark-700/50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-dark-800 text-dark-300 text-sm hover:bg-dark-700 transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-poker-600/20 text-poker-400 border border-poker-700/40 text-sm font-medium hover:bg-poker-600/30 transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Criar Lancamento'}
          </button>
        </div>
      </div>
    </div>
  );
}
