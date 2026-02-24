'use client';

import { useState, useMemo } from 'react';
import { formatBRL } from '@/lib/api';
import { SubclubData, PlayerMetric, PagamentoDetalhe } from '@/types/settlement';

interface Props {
  subclub: SubclubData;
  weekStart?: string;
  clubId?: string;
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

export default function Jogadores({ subclub }: Props) {
  const { players, agents } = subclub;
  const [search, setSearch] = useState('');
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [paymentModal, setPaymentModal] = useState<{
    entityName: string;
    detalhe: PagamentoDetalhe[];
    total: number;
  } | null>(null);

  // ── Group players by agent ──
  const agentGroups: AgentGroup[] = useMemo(() => {
    const map = new Map<string, PlayerMetric[]>();
    for (const p of players) {
      const key = p.agent_name || 'SEM AGENTE';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }

    const groups: AgentGroup[] = [];
    for (const [agentName, pls] of map) {
      const ganhos = pls.reduce((s, p) => s + (Number(p.winnings_brl) || 0), 0);
      const rake = pls.reduce((s, p) => s + (Number(p.rake_total_brl) || 0), 0);
      const rbValue = pls.reduce((s, p) => s + (Number(p.rb_value_brl) || 0), 0);
      const resultado = pls.reduce((s, p) => s + (Number(p.resultado_brl) || 0), 0);
      const saldoAnterior = pls.reduce((s, p) => s + (Number(p.saldo_anterior) || 0), 0);
      const totalPagamentos = pls.reduce((s, p) => s + (Number(p.total_pagamentos) || 0), 0);
      const saldoAtual = pls.reduce((s, p) => s + (Number(p.saldo_atual) || 0), 0);

      // Find external agent ID from agents array
      const agentMeta = agents.find((a) => a.agent_name === agentName);

      groups.push({
        agentName,
        externalAgentId: agentMeta?.external_agent_id || null,
        players: pls.sort((a, b) =>
          (a.nickname || '').localeCompare(b.nickname || '')
        ),
        totals: {
          ganhos: r2(ganhos),
          rake: r2(rake),
          rbValue: r2(rbValue),
          resultado: r2(resultado),
          saldoAnterior: r2(saldoAnterior),
          totalPagamentos: r2(totalPagamentos),
          saldoAtual: r2(saldoAtual),
        },
      });
    }

    groups.sort((a, b) => a.agentName.localeCompare(b.agentName));
    return groups;
  }, [players, agents]);

  // ── Filter by search ──
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return agentGroups;
    const q = search.toLowerCase();
    return agentGroups
      .map((g) => ({
        ...g,
        players: g.players.filter(
          (p) =>
            (p.nickname || '').toLowerCase().includes(q) ||
            (p.agent_name || '').toLowerCase().includes(q) ||
            (p.external_player_id || '').includes(q)
        ),
      }))
      .filter((g) => g.players.length > 0)
      .map((g) => {
        const ganhos = g.players.reduce((s, p) => s + (Number(p.winnings_brl) || 0), 0);
        const rake = g.players.reduce((s, p) => s + (Number(p.rake_total_brl) || 0), 0);
        const rbValue = g.players.reduce((s, p) => s + (Number(p.rb_value_brl) || 0), 0);
        const resultado = g.players.reduce((s, p) => s + (Number(p.resultado_brl) || 0), 0);
        const saldoAnterior = g.players.reduce((s, p) => s + (Number(p.saldo_anterior) || 0), 0);
        const totalPagamentos = g.players.reduce((s, p) => s + (Number(p.total_pagamentos) || 0), 0);
        const saldoAtual = g.players.reduce((s, p) => s + (Number(p.saldo_atual) || 0), 0);
        return {
          ...g,
          totals: {
            ganhos: r2(ganhos), rake: r2(rake), rbValue: r2(rbValue),
            resultado: r2(resultado), saldoAnterior: r2(saldoAnterior),
            totalPagamentos: r2(totalPagamentos), saldoAtual: r2(saldoAtual),
          },
        };
      });
  }, [agentGroups, search]);

  // ── Grand totals ──
  const grandTotals = useMemo(() => {
    const all = filteredGroups.flatMap((g) => g.players);
    return {
      ganhos: r2(all.reduce((s, p) => s + (Number(p.winnings_brl) || 0), 0)),
      rake: r2(all.reduce((s, p) => s + (Number(p.rake_total_brl) || 0), 0)),
      rbValue: r2(all.reduce((s, p) => s + (Number(p.rb_value_brl) || 0), 0)),
      resultado: r2(all.reduce((s, p) => s + (Number(p.resultado_brl) || 0), 0)),
      saldoAnterior: r2(all.reduce((s, p) => s + (Number(p.saldo_anterior) || 0), 0)),
      totalPagamentos: r2(all.reduce((s, p) => s + (Number(p.total_pagamentos) || 0), 0)),
      saldoAtual: r2(all.reduce((s, p) => s + (Number(p.saldo_atual) || 0), 0)),
    };
  }, [filteredGroups]);

  const activeCount = useMemo(() => {
    return players.filter((p) => Math.abs(Number(p.winnings_brl) || 0) > 0.01).length;
  }, [players]);

  const totalPlayerCount = useMemo(() => {
    return filteredGroups.reduce((s, g) => s + g.players.length, 0);
  }, [filteredGroups]);

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
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-3 border-t-2 border-t-blue-500 transition-all duration-200 hover:scale-[1.02] hover:border-dark-600 cursor-default">
          <div className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">
            Jogadores Ativos
          </div>
          <div className="text-xl font-extrabold text-white font-mono">{activeCount}</div>
          <div className="text-[10px] text-dark-500 mt-0.5">de {players.length} total</div>
        </div>

        <div className="bg-dark-900 border border-dark-700 rounded-xl p-3 border-t-2 border-t-amber-500 transition-all duration-200 hover:scale-[1.02] hover:border-dark-600 cursor-default">
          <div className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">
            Profit / Loss
          </div>
          <div className={`text-lg font-extrabold font-mono ${cc(grandTotals.ganhos)}`}>
            {formatBRL(grandTotals.ganhos)}
          </div>
          <div className="text-[10px] text-dark-500 mt-0.5">
            {grandTotals.ganhos >= 0 ? 'lucro jogadores' : 'loss jogadores'}
          </div>
        </div>

        <div className="bg-dark-900 border border-dark-700 rounded-xl p-3 border-t-2 border-t-emerald-500 transition-all duration-200 hover:scale-[1.02] hover:border-dark-600 cursor-default">
          <div className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">
            Rake Gerado
          </div>
          <div className="text-lg font-extrabold font-mono text-emerald-400">
            {formatBRL(grandTotals.rake)}
          </div>
        </div>

        <div className="bg-dark-900 border border-dark-700 rounded-xl p-3 border-t-2 border-t-lime-500 transition-all duration-200 hover:scale-[1.02] hover:border-dark-600 cursor-default">
          <div className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">
            Rakeback Total
          </div>
          <div className="text-lg font-extrabold font-mono text-lime-400">
            {grandTotals.rbValue > 0 ? formatBRL(grandTotals.rbValue) : '—'}
          </div>
        </div>

        <div className="bg-dark-900 border border-dark-700 rounded-xl p-3 border-t-2 border-t-amber-500 ring-1 ring-amber-700/30 transition-all duration-200 hover:scale-[1.02] hover:border-dark-600 cursor-default">
          <div className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">
            Resultado Semana
          </div>
          <div className={`text-lg font-extrabold font-mono ${cc(grandTotals.resultado)}`}>
            {formatBRL(grandTotals.resultado)}
          </div>
        </div>
      </div>

      {/* ═══ TOOLBAR ═══ */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, agente ou ID..."
          className="input w-full max-w-md"
        />
      </div>

      {/* ═══ AGENT-GROUPED TABLE ═══ */}
      <div className="border border-dark-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs" style={{ minWidth: 950 }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-dark-800/80 backdrop-blur-sm">
                <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">
                  Agencia / Jogador
                </th>
                <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Ganhos</th>
                <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Rake</th>
                <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Rakeback</th>
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
              {filteredGroups.map((group) => (
                <AgentSection
                  key={group.agentName}
                  group={group}
                  isExpanded={expandedAgents.has(group.agentName)}
                  onToggle={() => toggleAgent(group.agentName)}
                  onPaymentClick={(name, detalhe, total) =>
                    setPaymentModal({ entityName: name, detalhe, total })
                  }
                />
              ))}

              {/* ═══ TOTAL FOOTER ROW ═══ */}
              {totalPlayerCount > 0 && (
                <tr className="border-t-2 border-dark-700 bg-dark-900">
                  <td className="px-3 py-2 font-extrabold text-xs text-amber-400">
                    TOTAL
                    <span className="text-dark-500 text-[10px] font-normal ml-2">
                      {filteredGroups.length} agencias · {totalPlayerCount} jogadores
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
      {totalPlayerCount === 0 && (
        <div className="text-center py-10 text-dark-400 mt-4">
          {search ? 'Nenhum jogador encontrado' : 'Nenhum jogador neste subclube'}
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
   AgentSection — renders the agent row + player sub-rows
   ════════════════════════════════════════════════════════════════════ */

function AgentSection({
  group,
  isExpanded,
  onToggle,
  onPaymentClick,
}: {
  group: AgentGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onPaymentClick: (name: string, detalhe: PagamentoDetalhe[], total: number) => void;
}) {
  // Collect all detalhe from players for agent-level click
  const agentDetalhe = group.players.flatMap((p) => p.pagamentos_detalhe || []);

  return (
    <>
      {/* ── AGENT ROW ── */}
      <tr
        className="bg-dark-800/30 hover:bg-dark-800/50 cursor-pointer transition-colors border-b border-dark-700/50"
        onClick={onToggle}
      >
        <td className="px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-dark-500 text-[10px] transition-transform inline-block ${
                isExpanded ? 'rotate-90' : ''
              }`}
            >
              ▶
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-dark-100 text-xs font-semibold">{group.agentName}</span>
                {group.externalAgentId && (
                  <span className="text-dark-600 text-[10px] font-mono">{group.externalAgentId}</span>
                )}
              </div>
              <div className="text-dark-600 text-[10px]">{group.players.length} jogadores</div>
            </div>
          </div>
        </td>

        <td className={`px-3 py-1.5 text-right font-mono font-semibold ${cc(group.totals.ganhos)}`}>
          {formatBRL(group.totals.ganhos)}
        </td>

        <td className="px-3 py-1.5 text-right font-mono text-dark-200">
          {formatBRL(group.totals.rake)}
        </td>

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

        {/* Pagamento — clickable */}
        <td className="px-3 py-1.5 text-right">
          {group.totals.totalPagamentos !== 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPaymentClick(group.agentName, agentDetalhe, group.totals.totalPagamentos);
              }}
              className={`font-mono font-semibold underline decoration-dotted underline-offset-2 hover:opacity-80 ${cc(group.totals.totalPagamentos)}`}
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

      {/* ── PLAYER SUB-ROWS ── */}
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
                  <span className="text-dark-100 text-xs">{p.nickname || '—'}</span>
                  <span className="text-dark-600 text-[10px] font-mono">
                    #{p.external_player_id || '—'}
                  </span>
                </div>
              </td>

              <td className={`px-3 py-1 text-right font-mono text-xs ${cc(ganhos)}`}>
                {formatBRL(ganhos)}
              </td>

              <td className="px-3 py-1 text-right font-mono text-xs text-dark-200">
                {formatBRL(rake)}
              </td>

              <td className="px-3 py-1 text-right text-xs">
                {rbValue > 0.01 ? (
                  <span className="font-mono text-lime-400">
                    {rbRate > 0 && (
                      <span className="text-dark-400 text-[10px] mr-1">{rbRate}% ·</span>
                    )}
                    {formatBRL(rbValue)}
                  </span>
                ) : (
                  <span className="text-dark-500">—</span>
                )}
              </td>

              <td className="px-3 py-1 text-right">
                <span
                  className={`font-mono text-xs font-medium ${
                    resultado > 0.01
                      ? 'text-emerald-400'
                      : resultado < -0.01
                      ? 'text-red-400'
                      : 'text-dark-400'
                  }`}
                >
                  {formatBRL(resultado)}
                </span>
              </td>

              <td className={`px-3 py-1 text-right font-mono text-xs ${cc(saldoAnt)}`}>
                {saldoAnt !== 0 ? formatBRL(saldoAnt) : '—'}
              </td>

              {/* Pagamento — clickable */}
              <td className="px-3 py-1 text-right text-xs">
                {totalPag !== 0 ? (
                  <button
                    onClick={() =>
                      onPaymentClick(p.nickname || p.external_player_id || '—', detalhe, totalPag)
                    }
                    className={`font-mono underline decoration-dotted underline-offset-2 hover:opacity-80 ${cc(totalPag)}`}
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
   SituacaoBadge — badge colorido para situação do jogador
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
   PaymentModal — detalhe de pagamentos ao clicar na coluna Pagamento
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-dark-900 border border-dark-700 rounded-xl p-5 w-96 max-h-[80vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">Pagamentos</h3>
            <p className="text-[10px] text-dark-400 mt-0.5">{entityName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-white text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* List */}
        {detalhe.length > 0 ? (
          <div className="space-y-2">
            {detalhe.map((d, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 px-3 bg-dark-800/50 rounded-lg border border-dark-700/50"
              >
                <div>
                  <div className="text-xs text-dark-200">
                    {d.description || d.source || 'Pagamento'}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {d.method && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-dark-700 text-dark-300 border border-dark-600">
                        {d.method}
                      </span>
                    )}
                    <span className="text-[10px] text-dark-500">
                      {d.created_at
                        ? new Date(d.created_at).toLocaleDateString('pt-BR')
                        : '—'}
                    </span>
                  </div>
                </div>
                <span
                  className={`font-mono font-bold text-xs ${cc(d.amount)}`}
                >
                  {formatBRL(d.amount)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-dark-500 text-xs">
            Nenhum pagamento registrado
          </div>
        )}

        {/* Total */}
        <div className="mt-4 pt-3 border-t border-dark-700 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase text-dark-400">Total</span>
          <span className={`font-mono font-extrabold text-sm ${cc(total)}`}>
            {formatBRL(total)}
          </span>
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

function cc(val: number, pos = 'text-emerald-400', neg = 'text-red-400') {
  return val < -0.01 ? neg : val > 0.01 ? pos : 'text-dark-400';
}
