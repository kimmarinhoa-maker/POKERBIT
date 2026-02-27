'use client';

import { useState, useMemo, useCallback } from 'react';
import { formatBRL } from '@/lib/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { cc } from '@/lib/colorUtils';
import { useToast } from '@/components/Toast';
import { SubclubData, PlayerMetric, PagamentoDetalhe } from '@/types/settlement';
import { Users } from 'lucide-react';
import KpiCard from '@/components/ui/KpiCard';
import Highlight from '@/components/ui/Highlight';
import { exportCsv } from '@/lib/exportCsv';
import { Download } from 'lucide-react';

interface Props {
  subclub: SubclubData;
  weekStart?: string;
  clubId?: string;
  settlementId?: string;
  settlementStatus?: string;
}

interface AgentGroup {
  agentName: string;
  externalAgentId: string | null;
  players: PlayerMetric[];
  totals: {
    ganhos: number;
    rake: number;
    rbValue: number;
    resultado: number;
    saldoAnterior: number;
    totalPagamentos: number;
    saldoAtual: number;
  };
}

function sumTotals(pls: PlayerMetric[]) {
  return {
    ganhos: r2(pls.reduce((s, p) => s + (Number(p.winnings_brl) || 0), 0)),
    rake: r2(pls.reduce((s, p) => s + (Number(p.rake_total_brl) || 0), 0)),
    rbValue: r2(pls.reduce((s, p) => s + (Number(p.rb_value_brl) || 0), 0)),
    resultado: r2(pls.reduce((s, p) => s + (Number(p.resultado_brl) || 0), 0)),
    saldoAnterior: r2(pls.reduce((s, p) => s + (Number(p.saldo_anterior) || 0), 0)),
    totalPagamentos: r2(pls.reduce((s, p) => s + (Number(p.total_pagamentos) || 0), 0)),
    saldoAtual: r2(pls.reduce((s, p) => s + (Number(p.saldo_atual) || 0), 0)),
  };
}

export default function Jogadores({ subclub }: Props) {
  const { players, agents } = subclub;
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [viewTab, setViewTab] = useState<'agencias' | 'jogadores'>('agencias');
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [paymentModal, setPaymentModal] = useState<{
    entityName: string;
    detalhe: PagamentoDetalhe[];
    total: number;
  } | null>(null);

  // NOTE: sync is handled by the parent (loadData) — no need to duplicate here.
  // Previously this caused an infinite remount loop:
  // sync → onDataChange → parent loading=true → skeleton unmounts Jogadores → remount → sync again

  // Build is_direct set from agent data (annotated by backend)
  const directAgents = useMemo(() => {
    const set = new Set<string>();
    for (const a of agents) {
      if (a.is_direct) set.add(a.agent_name?.toLowerCase() || '');
    }
    // Also check players for agent_is_direct (fallback)
    for (const p of players) {
      if (p.agent_is_direct) set.add((p.agent_name || '').toLowerCase());
    }
    return set;
  }, [agents, players]);

  // ── Group ALL players by agent ──
  const allGroups: AgentGroup[] = useMemo(() => {
    const map = new Map<string, PlayerMetric[]>();
    for (const p of players) {
      const key = p.agent_name || 'SEM AGENTE';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    const groups: AgentGroup[] = [];
    for (const [agentName, pls] of map) {
      const agentMeta = agents.find((a) => a.agent_name === agentName);
      groups.push({
        agentName,
        externalAgentId: agentMeta?.external_agent_id || null,
        players: pls.sort((a, b) => (a.nickname || '').localeCompare(b.nickname || '')),
        totals: sumTotals(pls),
      });
    }
    groups.sort((a, b) => a.agentName.localeCompare(b.agentName));
    return groups;
  }, [players, agents]);

  // ── Split: agency groups vs direct players ──
  // Agências = agent exists AND not marked as direct
  // Jogadores = no agent (SEM AGENTE) OR agent marked as is_direct
  const agencyGroups = useMemo(
    () => allGroups.filter((g) => g.agentName !== 'SEM AGENTE' && !directAgents.has(g.agentName.toLowerCase())),
    [allGroups, directAgents],
  );

  const directGroups = useMemo(
    () => allGroups.filter((g) => g.agentName === 'SEM AGENTE' || directAgents.has(g.agentName.toLowerCase())),
    [allGroups, directAgents],
  );

  const directPlayers = useMemo(() => directGroups.flatMap((g) => g.players), [directGroups]);

  // ── Search filter: agencies ──
  const filteredAgencyGroups = useMemo(() => {
    if (!debouncedSearch.trim()) return agencyGroups;
    const q = debouncedSearch.toLowerCase();
    return agencyGroups
      .map((g) => ({
        ...g,
        players: g.players.filter(
          (p) =>
            (p.nickname || '').toLowerCase().includes(q) ||
            (p.agent_name || '').toLowerCase().includes(q) ||
            (p.external_player_id || '').includes(q),
        ),
      }))
      .filter((g) => g.players.length > 0)
      .map((g) => ({ ...g, totals: sumTotals(g.players) }));
  }, [agencyGroups, debouncedSearch]);

  // ── Search filter: direct players ──
  const filteredDirectPlayers = useMemo(() => {
    if (!debouncedSearch.trim()) return directPlayers;
    const q = debouncedSearch.toLowerCase();
    return directPlayers.filter(
      (p) => (p.nickname || '').toLowerCase().includes(q) || (p.external_player_id || '').includes(q),
    );
  }, [directPlayers, debouncedSearch]);

  // ── Grand totals (per active tab) ──
  const grandTotals = useMemo(() => {
    const all = viewTab === 'agencias' ? filteredAgencyGroups.flatMap((g) => g.players) : filteredDirectPlayers;
    return sumTotals(all);
  }, [viewTab, filteredAgencyGroups, filteredDirectPlayers]);

  // ── Counts ──
  const activeCount = useMemo(
    () => players.filter((p) => Math.abs(Number(p.winnings_brl) || 0) > 0.01).length,
    [players],
  );

  const currentPlayerCount = useMemo(
    () =>
      viewTab === 'agencias'
        ? filteredAgencyGroups.reduce((s, g) => s + g.players.length, 0)
        : filteredDirectPlayers.length,
    [viewTab, filteredAgencyGroups, filteredDirectPlayers],
  );

  const copyId = useCallback(
    (id: string) => {
      navigator.clipboard.writeText(id).then(() => {
        toast('ID copiado!', 'success');
      });
    },
    [toast],
  );

  function toggleAgent(agentName: string) {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentName)) next.delete(agentName);
      else next.add(agentName);
      return next;
    });
  }

  return (
    <div>
      {/* ═══ 5 KPI MINI CARDS ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        <KpiCard
          label="Jogadores Ativos"
          value={activeCount}
          accentColor="bg-blue-500"
          valueColor="text-blue-400"
          subtitle={`de ${players.length} total`}
          tooltip="Jogadores com |winnings| > 0.01 na semana"
        />
        <KpiCard
          label="Profit / Loss"
          value={formatBRL(grandTotals.ganhos)}
          accentColor="bg-amber-500"
          valueColor={cc(grandTotals.ganhos)}
          subtitle={grandTotals.ganhos >= 0 ? 'lucro jogadores' : 'loss jogadores'}
          tooltip={`Soma dos winnings de todos jogadores = ${formatBRL(grandTotals.ganhos)}`}
        />
        <KpiCard
          label="Rake Gerado"
          value={formatBRL(grandTotals.rake)}
          accentColor="bg-emerald-500"
          valueColor="text-emerald-400"
          tooltip={`Soma do rake gerado por todos jogadores = ${formatBRL(grandTotals.rake)}`}
        />
        <KpiCard
          label="Rakeback Total"
          value={grandTotals.rbValue > 0 ? formatBRL(grandTotals.rbValue) : '—'}
          accentColor="bg-lime-500"
          valueColor="text-lime-400"
          tooltip={`Soma do RB pago a agentes e jogadores = ${formatBRL(grandTotals.rbValue)}`}
        />
        <KpiCard
          label="Resultado Semana"
          value={formatBRL(grandTotals.resultado)}
          accentColor="bg-amber-500"
          valueColor={cc(grandTotals.resultado)}
          ring="ring-1 ring-amber-700/30"
          tooltip={`resultado = ganhos + rake = ${formatBRL(grandTotals.ganhos)} + ${formatBRL(grandTotals.rake)}`}
        />
      </div>

      {/* ═══ TAB BUTTONS ═══ */}
      <div className="flex gap-1 mb-4">
        <button
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-200 ${
            viewTab === 'agencias'
              ? 'bg-poker-900/20 border-poker-500 text-poker-400'
              : 'bg-dark-800 border-dark-700 text-dark-400 hover:border-poker-500/50 hover:text-poker-400'
          }`}
          onClick={() => setViewTab('agencias')}
        >
          Agencias
          <span className="text-xs bg-dark-800 px-1.5 py-0.5 rounded font-mono">{agencyGroups.length}</span>
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
          <span className="text-xs bg-dark-800 px-1.5 py-0.5 rounded font-mono">{directPlayers.length}</span>
        </button>
      </div>

      {/* ═══ TOOLBAR ═══ */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, agente ou ID..."
          className="input flex-1 max-w-md"
        />
        <button
          onClick={() => {
            const headers = ['Agente', 'Jogador', 'ID', 'Ganhos', 'Rake', 'RB%', 'RB Valor', 'Resultado', 'Saldo Ant.', 'Pagamentos', 'Saldo Atual'];
            const rows = players.map((p) => [
              p.agent_name || '',
              p.nickname || '',
              p.external_player_id || '',
              Number(p.winnings_brl) || 0,
              Number(p.rake_total_brl) || 0,
              Number(p.rb_rate) || 0,
              Number(p.rb_value_brl) || 0,
              Number(p.resultado_brl) || 0,
              Number(p.saldo_anterior) || 0,
              Number(p.total_pagamentos) || 0,
              Number(p.saldo_atual) || 0,
            ]);
            exportCsv(`jogadores_${subclub.name}`, headers, rows);
          }}
          className="btn-ghost text-xs flex items-center gap-1.5 shrink-0"
          title="Exportar CSV"
        >
          <Download size={14} />
          <span className="hidden sm:inline">CSV</span>
        </button>
      </div>

      {/* ═══ TABLE ═══ */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[950px] data-table">
            <thead className="sticky top-0 z-10">
              <tr className="bg-dark-800/80 backdrop-blur-sm">
                <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">
                  {viewTab === 'agencias' ? 'Agencia / Jogador' : 'Jogador'}
                </th>
                <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">
                  Ganhos
                </th>
                <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">
                  Rake
                </th>
                <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">
                  Rakeback
                </th>
                <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">
                  Resultado Semana
                </th>
                <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">
                  Saldo Ant.
                </th>
                <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">
                  Pagamento
                </th>
                <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">
                  Saldo Atual
                </th>
                <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">
                  Situacao
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800/30">
              {viewTab === 'agencias' ? (
                <>
                  {filteredAgencyGroups.map((group) => (
                    <AgentSection
                      key={group.agentName}
                      group={group}
                      isExpanded={expandedAgents.has(group.agentName)}
                      onToggle={() => toggleAgent(group.agentName)}
                      onPaymentClick={(name, detalhe, total) => setPaymentModal({ entityName: name, detalhe, total })}
                      onCopyId={copyId}
                      searchQuery={debouncedSearch}
                    />
                  ))}
                </>
              ) : (
                <>
                  {filteredDirectPlayers.map((p, i) => (
                    <DirectPlayerRow
                      key={`direct-${i}`}
                      player={p}
                      onCopyId={copyId}
                      onPaymentClick={(name, detalhe, total) => setPaymentModal({ entityName: name, detalhe, total })}
                      searchQuery={debouncedSearch}
                    />
                  ))}
                </>
              )}

              {/* ═══ TOTAL FOOTER ═══ */}
              {currentPlayerCount > 0 && (
                <tr className="border-t-2 border-dark-700 bg-dark-900">
                  <td className="px-3 py-2 font-extrabold text-xs text-amber-400">
                    TOTAL
                    <span className="text-dark-500 text-[10px] font-normal ml-2">
                      {viewTab === 'agencias'
                        ? `${filteredAgencyGroups.length} agencias · ${currentPlayerCount} jogadores`
                        : `${currentPlayerCount} jogadores diretos`}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-extrabold ${cc(grandTotals.ganhos)}`}>
                    {formatBRL(grandTotals.ganhos)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-extrabold text-emerald-400">
                    {formatBRL(grandTotals.rake)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-extrabold text-lime-400">
                    {grandTotals.rbValue > 0 ? formatBRL(grandTotals.rbValue) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-extrabold ${cc(grandTotals.resultado)}`}>
                    {formatBRL(grandTotals.resultado)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-extrabold ${cc(grandTotals.saldoAnterior)}`}>
                    {grandTotals.saldoAnterior !== 0 ? formatBRL(grandTotals.saldoAnterior) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-extrabold ${cc(grandTotals.totalPagamentos)}`}>
                    {grandTotals.totalPagamentos !== 0 ? formatBRL(grandTotals.totalPagamentos) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-extrabold ${cc(grandTotals.saldoAtual)}`}>
                    {formatBRL(grandTotals.saldoAtual)}
                  </td>
                  <td className="px-3 py-2" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty state */}
      {currentPlayerCount === 0 && (
        <div className="card text-center py-12 mt-4">
          <Users className="w-8 h-8 text-dark-600 mx-auto mb-3" />
          <p className="text-dark-400">
            {search
              ? 'Nenhum jogador encontrado'
              : viewTab === 'agencias'
                ? 'Nenhuma agência neste subclube'
                : 'Nenhum jogador direto neste subclube'}
          </p>
        </div>
      )}

      {/* ═══ PAYMENT DETAIL MODAL ═══ */}
      {paymentModal && (
        <PaymentModal
          entityName={paymentModal.entityName}
          detalhe={paymentModal.detalhe}
          total={paymentModal.total}
          onClose={() => setPaymentModal(null)}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   AgentSection — agent row + expandable player sub-rows
   ════════════════════════════════════════════════════════════════════ */

function AgentSection({
  group,
  isExpanded,
  onToggle,
  onPaymentClick,
  onCopyId,
  searchQuery = '',
}: {
  group: AgentGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onPaymentClick: (name: string, detalhe: PagamentoDetalhe[], total: number) => void;
  onCopyId: (id: string) => void;
  searchQuery?: string;
}) {
  const agentDetalhe = group.players.flatMap((p) => p.pagamentos_detalhe || []);

  return (
    <>
      <tr
        className="bg-dark-800/30 hover:bg-dark-800/50 cursor-pointer transition-colors border-b border-dark-700/50"
        onClick={onToggle}
      >
        <td className="px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-dark-500 text-[10px] transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}
            >
              ▶
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-dark-100 text-xs font-semibold"><Highlight text={group.agentName} query={searchQuery} /></span>
                {group.externalAgentId && (
                  <span
                    className="text-[10px] font-mono text-dark-600 ml-1.5 select-all cursor-pointer hover:text-dark-400 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopyId(String(group.externalAgentId));
                    }}
                    title="Clique para copiar"
                  >
                    #{group.externalAgentId}
                  </span>
                )}
              </div>
              <div className="text-dark-600 text-[10px]">{group.players.length} jogadores</div>
            </div>
          </div>
        </td>
        <td className={`px-3 py-1.5 text-right font-mono font-semibold ${cc(group.totals.ganhos)}`}>
          {formatBRL(group.totals.ganhos)}
        </td>
        <td className="px-3 py-1.5 text-right font-mono text-dark-200">{formatBRL(group.totals.rake)}</td>
        <td className="px-3 py-1.5 text-right font-mono text-lime-400 font-semibold">
          {group.totals.rbValue > 0 ? formatBRL(group.totals.rbValue) : '—'}
        </td>
        <td className="px-3 py-1.5 text-right">
          <span
            className={`font-mono font-bold px-2 py-0.5 rounded ${
              group.totals.resultado > 0.01
                ? 'text-emerald-400 bg-emerald-500/10'
                : group.totals.resultado < -0.01
                  ? 'text-red-400 bg-red-500/10'
                  : 'text-dark-400'
            }`}
          >
            {formatBRL(group.totals.resultado)}
          </span>
        </td>
        <td className={`px-3 py-1.5 text-right font-mono font-semibold ${cc(group.totals.saldoAnterior)}`}>
          {group.totals.saldoAnterior !== 0 ? formatBRL(group.totals.saldoAnterior) : '—'}
        </td>
        <td className="px-3 py-1.5 text-right">
          {group.totals.totalPagamentos !== 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPaymentClick(group.agentName, agentDetalhe, group.totals.totalPagamentos);
              }}
              className={`font-mono font-semibold hover:opacity-80 ${cc(group.totals.totalPagamentos)}`}
            >
              {formatBRL(group.totals.totalPagamentos)}
            </button>
          ) : (
            <span className="text-dark-500">—</span>
          )}
        </td>
        <td className={`px-3 py-1.5 text-right font-mono font-bold ${cc(group.totals.saldoAtual)}`}>
          {formatBRL(group.totals.saldoAtual)}
        </td>
        <td className="px-3 py-1.5">
          <SituacaoBadge saldoAtual={group.totals.saldoAtual} />
        </td>
      </tr>

      {/* Player sub-rows */}
      {isExpanded &&
        group.players.map((p, i) => {
          const ganhos = Number(p.winnings_brl) || 0;
          const rake = Number(p.rake_total_brl) || 0;
          const rbRate = Number(p.rb_rate) || 0;
          const rbValue = Number(p.rb_value_brl) || 0;
          const resultado = Number(p.resultado_brl) || 0;
          const saldoAnt = Number(p.saldo_anterior) || 0;
          const totalPag = Number(p.total_pagamentos) || 0;
          const saldoAtual = Number(p.saldo_atual) || 0;
          const detalhe = p.pagamentos_detalhe || [];

          return (
            <tr
              key={`${group.agentName}-${i}`}
              className="hover:bg-dark-800/20 transition-colors border-b border-dark-800/30"
            >
              <td className="pl-8 pr-3 py-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-dark-100 text-xs"><Highlight text={p.nickname || '—'} query={searchQuery} /></span>
                  {p.external_player_id && (
                    <span
                      className="text-[10px] font-mono text-dark-600 ml-1.5 select-all cursor-pointer hover:text-dark-400 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopyId(String(p.external_player_id));
                      }}
                      title="Clique para copiar"
                    >
                      #{p.external_player_id}
                    </span>
                  )}
                </div>
              </td>
              <td className={`px-3 py-1 text-right font-mono text-xs ${cc(ganhos)}`}>{formatBRL(ganhos)}</td>
              <td className="px-3 py-1 text-right font-mono text-xs text-dark-200">{formatBRL(rake)}</td>
              <td className="px-3 py-1 text-right text-xs">
                {rbValue > 0.01 ? (
                  <span className="font-mono text-lime-400">
                    {rbRate > 0 && <span className="text-dark-400 text-[10px] mr-1">{rbRate}% ·</span>}
                    {formatBRL(rbValue)}
                  </span>
                ) : (
                  <span className="text-dark-500">—</span>
                )}
              </td>
              <td className="px-3 py-1 text-right">
                <span
                  className={`font-mono text-xs font-medium ${resultado > 0.01 ? 'text-emerald-400' : resultado < -0.01 ? 'text-red-400' : 'text-dark-400'}`}
                >
                  {formatBRL(resultado)}
                </span>
              </td>
              <td className={`px-3 py-1 text-right font-mono text-xs ${cc(saldoAnt)}`}>
                {saldoAnt !== 0 ? formatBRL(saldoAnt) : '—'}
              </td>
              <td className="px-3 py-1 text-right text-xs">
                {totalPag !== 0 ? (
                  <button
                    onClick={() => onPaymentClick(p.nickname || p.external_player_id || '—', detalhe, totalPag)}
                    className={`font-mono hover:opacity-80 ${cc(totalPag)}`}
                  >
                    {formatBRL(totalPag)}
                  </button>
                ) : (
                  <span className="text-dark-500">—</span>
                )}
              </td>
              <td className={`px-3 py-1 text-right font-mono text-xs font-medium ${cc(saldoAtual)}`}>
                {formatBRL(saldoAtual)}
              </td>
              <td className="px-3 py-1">
                <SituacaoBadge saldoAtual={saldoAtual} />
              </td>
            </tr>
          );
        })}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DirectPlayerRow — flat row for jogadores diretos tab
   ════════════════════════════════════════════════════════════════════ */

function DirectPlayerRow({
  player: p,
  onCopyId,
  onPaymentClick,
  searchQuery = '',
}: {
  player: PlayerMetric;
  onCopyId: (id: string) => void;
  onPaymentClick: (name: string, detalhe: PagamentoDetalhe[], total: number) => void;
  searchQuery?: string;
}) {
  const ganhos = Number(p.winnings_brl) || 0;
  const rake = Number(p.rake_total_brl) || 0;
  const rbRate = Number(p.rb_rate) || 0;
  const rbValue = Number(p.rb_value_brl) || 0;
  const resultado = Number(p.resultado_brl) || 0;
  const saldoAnt = Number(p.saldo_anterior) || 0;
  const totalPag = Number(p.total_pagamentos) || 0;
  const saldoAtual = Number(p.saldo_atual) || 0;
  const detalhe = p.pagamentos_detalhe || [];

  return (
    <tr className="hover:bg-dark-800/20 transition-colors border-b border-dark-800/30">
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-dark-100 text-xs font-medium"><Highlight text={p.nickname || '—'} query={searchQuery} /></span>
          {p.external_player_id && (
            <span
              className="text-[10px] font-mono text-dark-600 ml-1.5 select-all cursor-pointer hover:text-dark-400 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onCopyId(String(p.external_player_id));
              }}
              title="Clique para copiar"
            >
              #{p.external_player_id}
            </span>
          )}
        </div>
      </td>
      <td className={`px-3 py-1.5 text-right font-mono text-xs ${cc(ganhos)}`}>{formatBRL(ganhos)}</td>
      <td className="px-3 py-1.5 text-right font-mono text-xs text-dark-200">{formatBRL(rake)}</td>
      <td className="px-3 py-1.5 text-right text-xs">
        {rbValue > 0.01 ? (
          <span className="font-mono text-lime-400">
            {rbRate > 0 && <span className="text-dark-400 text-[10px] mr-1">{rbRate}% ·</span>}
            {formatBRL(rbValue)}
          </span>
        ) : (
          <span className="text-dark-500">—</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-right">
        <span
          className={`font-mono text-xs font-medium ${resultado > 0.01 ? 'text-emerald-400' : resultado < -0.01 ? 'text-red-400' : 'text-dark-400'}`}
        >
          {formatBRL(resultado)}
        </span>
      </td>
      <td className={`px-3 py-1.5 text-right font-mono text-xs ${cc(saldoAnt)}`}>
        {saldoAnt !== 0 ? formatBRL(saldoAnt) : '—'}
      </td>
      <td className="px-3 py-1.5 text-right text-xs">
        {totalPag !== 0 ? (
          <button
            onClick={() => onPaymentClick(p.nickname || p.external_player_id || '—', detalhe, totalPag)}
            className={`font-mono hover:opacity-80 ${cc(totalPag)}`}
          >
            {formatBRL(totalPag)}
          </button>
        ) : (
          <span className="text-dark-500">—</span>
        )}
      </td>
      <td className={`px-3 py-1.5 text-right font-mono text-xs font-medium ${cc(saldoAtual)}`}>
        {formatBRL(saldoAtual)}
      </td>
      <td className="px-3 py-1.5">
        <SituacaoBadge saldoAtual={saldoAtual} />
      </td>
    </tr>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SituacaoBadge
   ════════════════════════════════════════════════════════════════════ */

function SituacaoBadge({ saldoAtual }: { saldoAtual: number }) {
  if (saldoAtual > 0.01) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/10 border-emerald-500/25 text-emerald-400">
        A Receber
      </span>
    );
  }
  if (saldoAtual < -0.01) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-red-500/10 border-red-500/25 text-red-400">
        A Pagar
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-dark-700/30 border-dark-600/40 text-dark-400">
      Quitado
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════
   PaymentModal
   ════════════════════════════════════════════════════════════════════ */

function PaymentModal({
  entityName,
  detalhe,
  total,
  onClose,
}: {
  entityName: string;
  detalhe: PagamentoDetalhe[];
  total: number;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-dark-900 border border-dark-700 rounded-xl p-5 w-96 max-h-[80vh] overflow-y-auto shadow-modal animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">Pagamentos</h3>
            <p className="text-[10px] text-dark-400 mt-0.5">{entityName}</p>
          </div>
          <button onClick={onClose} className="text-dark-400 hover:text-white text-lg leading-none">
            ✕
          </button>
        </div>

        {detalhe.length > 0 ? (
          <div className="space-y-2">
            {detalhe.map((d, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 px-3 bg-dark-800/50 rounded-lg border border-dark-700/50"
              >
                <div>
                  <div className="text-xs text-dark-200">{d.description || d.source || 'Pagamento'}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {d.method && (
                      <span className="text-[10px] text-dark-600 font-mono">via {d.method.toLowerCase()}</span>
                    )}
                    <span className="text-[10px] text-dark-500">
                      {d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : '—'}
                    </span>
                  </div>
                </div>
                <span className={`font-mono font-bold text-xs ${cc(d.amount)}`}>{formatBRL(d.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-dark-500 text-xs">Nenhum pagamento registrado</div>
        )}

        <div className="mt-4 pt-3 border-t border-dark-700 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase text-dark-400">Total</span>
          <span className={`font-mono font-extrabold text-sm ${cc(total)}`}>{formatBRL(total)}</span>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Helpers
   ════════════════════════════════════════════════════════════════════ */

function r2(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

// cc() imported from @/lib/colorUtils
