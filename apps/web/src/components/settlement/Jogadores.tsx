'use client';

import { useState, useMemo } from 'react';
import { formatBRL } from '@/lib/api';

interface Props {
  subclub: any;
}

interface AgentGroup {
  agentName: string;
  players: any[];
  totals: {
    ganhos: number;
    rake: number;
    rbValue: number;
    resultado: number;
  };
}

export default function Jogadores({ subclub }: Props) {
  const { players, agents, name } = subclub;
  const [search, setSearch] = useState('');
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  // ── Group players by agent ──
  const agentGroups: AgentGroup[] = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const p of players) {
      const key = p.agent_name || 'SEM AGENTE';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }

    const groups: AgentGroup[] = [];
    for (const [agentName, pls] of map) {
      const ganhos = pls.reduce((s: number, p: any) => s + (Number(p.winnings_brl) || 0), 0);
      const rake = pls.reduce((s: number, p: any) => s + (Number(p.rake_total_brl) || 0), 0);
      const rbValue = pls.reduce((s: number, p: any) => s + (Number(p.rb_value_brl) || 0), 0);
      const resultado = pls.reduce((s: number, p: any) => s + (Number(p.resultado_brl) || 0), 0);

      groups.push({
        agentName,
        players: pls.sort((a: any, b: any) =>
          (a.nickname || '').localeCompare(b.nickname || '')
        ),
        totals: {
          ganhos: Math.round((ganhos + Number.EPSILON) * 100) / 100,
          rake: Math.round((rake + Number.EPSILON) * 100) / 100,
          rbValue: Math.round((rbValue + Number.EPSILON) * 100) / 100,
          resultado: Math.round((resultado + Number.EPSILON) * 100) / 100,
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
          (p: any) =>
            (p.nickname || '').toLowerCase().includes(q) ||
            (p.agent_name || '').toLowerCase().includes(q) ||
            (p.external_player_id || '').includes(q)
        ),
      }))
      .filter((g) => g.players.length > 0)
      .map((g) => {
        // Recalculate totals for filtered players
        const ganhos = g.players.reduce((s: number, p: any) => s + (Number(p.winnings_brl) || 0), 0);
        const rake = g.players.reduce((s: number, p: any) => s + (Number(p.rake_total_brl) || 0), 0);
        const rbValue = g.players.reduce((s: number, p: any) => s + (Number(p.rb_value_brl) || 0), 0);
        const resultado = g.players.reduce((s: number, p: any) => s + (Number(p.resultado_brl) || 0), 0);
        return {
          ...g,
          totals: {
            ganhos: Math.round((ganhos + Number.EPSILON) * 100) / 100,
            rake: Math.round((rake + Number.EPSILON) * 100) / 100,
            rbValue: Math.round((rbValue + Number.EPSILON) * 100) / 100,
            resultado: Math.round((resultado + Number.EPSILON) * 100) / 100,
          },
        };
      });
  }, [agentGroups, search]);

  // ── Grand totals ──
  const grandTotals = useMemo(() => {
    const allFiltered = filteredGroups.flatMap((g) => g.players);
    const ganhos = allFiltered.reduce((s: number, p: any) => s + (Number(p.winnings_brl) || 0), 0);
    const rake = allFiltered.reduce((s: number, p: any) => s + (Number(p.rake_total_brl) || 0), 0);
    const rbValue = allFiltered.reduce((s: number, p: any) => s + (Number(p.rb_value_brl) || 0), 0);
    const resultado = allFiltered.reduce((s: number, p: any) => s + (Number(p.resultado_brl) || 0), 0);
    return {
      ganhos: Math.round((ganhos + Number.EPSILON) * 100) / 100,
      rake: Math.round((rake + Number.EPSILON) * 100) / 100,
      rbValue: Math.round((rbValue + Number.EPSILON) * 100) / 100,
      resultado: Math.round((resultado + Number.EPSILON) * 100) / 100,
    };
  }, [filteredGroups]);

  // ── KPI: active players (|ganhos| > 0.01) ──
  const activeCount = useMemo(() => {
    return players.filter((p: any) => Math.abs(Number(p.winnings_brl) || 0) > 0.01).length;
  }, [players]);

  const totalPlayerCount = useMemo(() => {
    return filteredGroups.reduce((s, g) => s + g.players.length, 0);
  }, [filteredGroups]);

  // ── Toggle agent expand/collapse ──
  function toggleAgent(agentName: string) {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentName)) next.delete(agentName);
      else next.add(agentName);
      return next;
    });
  }

  // ── Color helper ──
  function colorClass(val: number, posColor = 'text-emerald-400', negColor = 'text-red-400') {
    return val < -0.01 ? negColor : val > 0.01 ? posColor : 'text-dark-400';
  }

  return (
    <div>
      {/* ═══ 5 KPI MINI CARDS ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {/* Jogadores Ativos */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-3 border-t-2 border-t-blue-500">
          <div className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">
            Jogadores Ativos
          </div>
          <div className="text-xl font-extrabold text-white font-mono">{activeCount}</div>
          <div className="text-[10px] text-dark-500 mt-0.5">de {players.length} total</div>
        </div>

        {/* Profit/Loss */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-3 border-t-2 border-t-amber-500">
          <div className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">
            Profit / Loss
          </div>
          <div className={`text-lg font-extrabold font-mono ${colorClass(grandTotals.ganhos)}`}>
            {formatBRL(grandTotals.ganhos)}
          </div>
          <div className="text-[10px] text-dark-500 mt-0.5">
            {grandTotals.ganhos >= 0 ? 'lucro jogadores' : 'loss jogadores'}
          </div>
        </div>

        {/* Rake Gerado */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-3 border-t-2 border-t-emerald-500">
          <div className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">
            Rake Gerado
          </div>
          <div className="text-lg font-extrabold font-mono text-emerald-400">
            {formatBRL(grandTotals.rake)}
          </div>
        </div>

        {/* Rakeback Total */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-3 border-t-2 border-t-lime-500">
          <div className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">
            Rakeback Total
          </div>
          <div className="text-lg font-extrabold font-mono text-lime-400">
            {grandTotals.rbValue > 0 ? formatBRL(grandTotals.rbValue) : '—'}
          </div>
        </div>

        {/* Resultado Semana */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-3 border-t-2 border-t-amber-500">
          <div className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">
            Resultado Semana
          </div>
          <div className={`text-lg font-extrabold font-mono ${colorClass(grandTotals.resultado)}`}>
            {formatBRL(grandTotals.resultado)}
          </div>
          <div className="text-[10px] text-dark-500 mt-0.5">ganhos + rakeback</div>
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
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 900 }}>
            <thead>
              <tr className="bg-dark-800/50">
                <th className="px-4 py-3 text-left font-medium text-xs text-dark-400">
                  Jogador / Agencia
                </th>
                <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">Ganhos</th>
                <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">Rake</th>
                <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">Rakeback</th>
                <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">
                  Resultado Semana
                </th>
                <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">
                  Saldo Ant.
                </th>
                <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">
                  Pagamento
                </th>
                <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">
                  Saldo Atual
                </th>
                <th className="px-3 py-3 text-left font-medium text-xs text-dark-400">
                  Situacao
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map((group) => {
                const isExpanded = expandedAgents.has(group.agentName);

                return (
                  <AgentSection
                    key={group.agentName}
                    group={group}
                    isExpanded={isExpanded}
                    onToggle={() => toggleAgent(group.agentName)}
                    colorClass={colorClass}
                  />
                );
              })}

              {/* ═══ TOTAL FOOTER ROW ═══ */}
              {totalPlayerCount > 0 && (
                <tr className="bg-amber-500/5 border-t-2 border-amber-500/20">
                  <td className="px-4 py-3 font-extrabold text-amber-400">
                    TOTAL
                    <span className="text-dark-500 text-[10px] font-normal ml-2">
                      {filteredGroups.length} agencias · {totalPlayerCount} jogadores
                    </span>
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-mono font-extrabold ${colorClass(
                      grandTotals.ganhos
                    )}`}
                  >
                    {formatBRL(grandTotals.ganhos)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-extrabold text-emerald-400">
                    {formatBRL(grandTotals.rake)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-extrabold text-lime-400">
                    {grandTotals.rbValue > 0 ? formatBRL(grandTotals.rbValue) : '—'}
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-mono font-extrabold ${colorClass(
                      grandTotals.resultado
                    )}`}
                  >
                    {formatBRL(grandTotals.resultado)}
                  </td>
                  {/* Saldo Ant. / Pagamento / Saldo Atual / Situacao — no data yet */}
                  <td className="px-3 py-3 text-right font-mono text-dark-500 text-xs">—</td>
                  <td className="px-3 py-3 text-right font-mono text-dark-500 text-xs">—</td>
                  <td className="px-3 py-3 text-right font-mono text-dark-500 text-xs">—</td>
                  <td className="px-3 py-3 text-dark-500 text-[10px]">
                    {filteredGroups.length} agencias · {totalPlayerCount} jogadores
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty state */}
      {totalPlayerCount === 0 && (
        <div className="card text-center py-10 text-dark-400 mt-4">
          {search ? 'Nenhum jogador encontrado' : 'Nenhum jogador neste subclube'}
        </div>
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
  colorClass,
}: {
  group: AgentGroup;
  isExpanded: boolean;
  onToggle: () => void;
  colorClass: (val: number, pos?: string, neg?: string) => string;
}) {
  return (
    <>
      {/* ── AGENT ROW ── */}
      <tr
        className="bg-dark-800/30 hover:bg-dark-800/50 cursor-pointer transition-colors border-b border-dark-700/50"
        onClick={onToggle}
      >
        {/* Agent name + count */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className={`text-dark-400 text-[10px] transition-transform inline-block ${
                isExpanded ? 'rotate-90' : ''
              }`}
            >
              ▶
            </span>
            <span className="text-white font-semibold">
              {group.agentName}
            </span>
            <span className="bg-dark-700 text-dark-300 rounded-full text-[10px] font-bold px-2 py-0.5">
              {group.players.length}
            </span>
          </div>
        </td>

        {/* Agent totals — Ganhos */}
        <td
          className={`px-3 py-3 text-right font-mono font-semibold ${colorClass(
            group.totals.ganhos
          )}`}
        >
          {formatBRL(group.totals.ganhos)}
        </td>

        {/* Rake */}
        <td className="px-3 py-3 text-right font-mono text-dark-200">
          {formatBRL(group.totals.rake)}
        </td>

        {/* Rakeback */}
        <td className="px-3 py-3 text-right font-mono text-lime-400 font-semibold">
          {group.totals.rbValue > 0 ? formatBRL(group.totals.rbValue) : '—'}
        </td>

        {/* Resultado Semana */}
        <td className="px-3 py-3 text-right">
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

        {/* Saldo Ant. — no data */}
        <td className="px-3 py-3 text-right text-dark-500 text-xs">—</td>

        {/* Pagamento — no data */}
        <td className="px-3 py-3 text-right text-dark-500 text-xs">—</td>

        {/* Saldo Atual — no data */}
        <td className="px-3 py-3 text-right font-mono text-dark-500 text-xs">—</td>

        {/* Situacao — no data */}
        <td className="px-3 py-3">
          <span className="text-dark-500 text-[10px]">—</span>
        </td>
      </tr>

      {/* ── PLAYER SUB-ROWS ── */}
      {isExpanded &&
        group.players.map((p: any, i: number) => {
          const ganhos = Number(p.winnings_brl) || 0;
          const rake = Number(p.rake_total_brl) || 0;
          const rbRate = Number(p.rb_rate) || 0;
          const rbValue = Number(p.rb_value_brl) || 0;
          const resultado = Number(p.resultado_brl) || 0;

          return (
            <tr
              key={`${group.agentName}-${i}`}
              className="hover:bg-dark-800/20 transition-colors border-b border-dark-800/30"
            >
              {/* Player nick + ID (indented) */}
              <td className="px-4 py-2 pl-10">
                <div className="flex items-center gap-1.5">
                  <span className="text-dark-300 text-xs">&#x1F464;</span>
                  <span className="text-dark-100 font-medium">{p.nickname || '—'}</span>
                  <span className="text-dark-600 text-[10px] ml-1">
                    #{p.external_player_id || '—'}
                  </span>
                </div>
              </td>

              {/* Ganhos */}
              <td
                className={`px-3 py-2 text-right font-mono ${
                  ganhos < -0.01 ? 'text-red-400' : ganhos > 0.01 ? 'text-emerald-400' : 'text-dark-400'
                }`}
              >
                {formatBRL(ganhos)}
              </td>

              {/* Rake */}
              <td className="px-3 py-2 text-right font-mono text-dark-200">
                {formatBRL(rake)}
              </td>

              {/* Rakeback — show "5% · R$ 123" */}
              <td className="px-3 py-2 text-right">
                {rbValue > 0.01 ? (
                  <span className="font-mono text-lime-400">
                    {rbRate > 0 && (
                      <span className="text-dark-400 text-[10px] mr-1">{rbRate}% ·</span>
                    )}
                    {formatBRL(rbValue)}
                  </span>
                ) : (
                  <span className="text-dark-500 text-xs">—</span>
                )}
              </td>

              {/* Resultado Semana */}
              <td className="px-3 py-2 text-right">
                <span
                  className={`font-mono font-medium ${
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

              {/* Saldo Ant. — no data */}
              <td className="px-3 py-2 text-right text-dark-500 text-xs">—</td>

              {/* Pagamento — no data */}
              <td className="px-3 py-2 text-right text-dark-500 text-xs">—</td>

              {/* Saldo Atual — no data */}
              <td className="px-3 py-2 text-right font-mono text-dark-500 text-xs">—</td>

              {/* Situacao — no data */}
              <td className="px-3 py-2">
                <span className="text-dark-500 text-[10px]">—</span>
              </td>
            </tr>
          );
        })}
    </>
  );
}
