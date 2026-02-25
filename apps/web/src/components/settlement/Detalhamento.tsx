'use client';

import { useState, useMemo } from 'react';
import { formatBRL } from '@/lib/api';
import { SubclubData, PlayerMetric, AgentMetric } from '@/types/settlement';
import { valueColor, ggrColor } from '@/lib/colorUtils';
import { Search } from 'lucide-react';

interface Props {
  subclub: SubclubData;
}

interface AgentGroup {
  agentName: string;
  agentId: string | null;
  externalAgentId: string | null;
  players: PlayerMetric[];
  totals: {
    ganhos: number;
    rake: number;
    ggr: number;
    resultado: number;
  };
}

export default function Detalhamento({ subclub }: Props) {
  const { players, agents, name } = subclub;
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // Group players by agent
  const agentGroups: AgentGroup[] = useMemo(() => {
    const map = new Map<string, PlayerMetric[]>();

    for (const p of players) {
      const key = p.agent_name || 'SEM AGENTE';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }

    const groups: AgentGroup[] = [];
    for (const [agentName, pls] of map) {
      const agentMetric = agents.find((a) => a.agent_name === agentName);

      const ganhos = pls.reduce((s, p) => s + Number(p.winnings_brl || 0), 0);
      const rake = pls.reduce((s, p) => s + Number(p.rake_total_brl || 0), 0);
      const ggr = pls.reduce((s, p) => s + Number(p.ggr_brl || 0), 0);
      const resultado = ganhos + rake + ggr;

      // Get the external_agent_id from the first player in this group
      const extAgentId = pls[0]?.external_agent_id || agentMetric?.external_agent_id || null;

      groups.push({
        agentName,
        agentId: agentMetric?.agent_id || null,
        externalAgentId: extAgentId,
        players: pls.sort((a, b) => (a.nickname || '').localeCompare(b.nickname || '')),
        totals: {
          ganhos: Math.round((ganhos + Number.EPSILON) * 100) / 100,
          rake: Math.round((rake + Number.EPSILON) * 100) / 100,
          ggr: Math.round((ggr + Number.EPSILON) * 100) / 100,
          resultado: Math.round((resultado + Number.EPSILON) * 100) / 100,
        },
      });
    }

    groups.sort((a, b) => a.agentName.localeCompare(b.agentName));
    return groups;
  }, [players, agents]);

  // Filter by search
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
            (p.external_player_id || '').includes(q),
        ),
      }))
      .filter((g) => g.players.length > 0);
  }, [agentGroups, search]);

  // Grand totals (always from ALL players, not filtered)
  const grandTotals = useMemo(() => {
    const ganhos = players.reduce((s, p) => s + Number(p.winnings_brl || 0), 0);
    const rake = players.reduce((s, p) => s + Number(p.rake_total_brl || 0), 0);
    const ggr = players.reduce((s, p) => s + Number(p.ggr_brl || 0), 0);
    const resultado = ganhos + rake + ggr;
    const ativos = players.filter((p) => Math.abs(Number(p.winnings_brl || 0)) > 0.01).length;
    return {
      ganhos: Math.round((ganhos + Number.EPSILON) * 100) / 100,
      rake: Math.round((rake + Number.EPSILON) * 100) / 100,
      ggr: Math.round((ggr + Number.EPSILON) * 100) / 100,
      resultado: Math.round((resultado + Number.EPSILON) * 100) / 100,
      ativos,
    };
  }, [players]);

  // Filtered totals (for table footer)
  const filteredTotals = useMemo(() => {
    const allFilteredPlayers = filteredGroups.flatMap((g) => g.players);
    const ganhos = allFilteredPlayers.reduce((s, p) => s + Number(p.winnings_brl || 0), 0);
    const rake = allFilteredPlayers.reduce((s, p) => s + Number(p.rake_total_brl || 0), 0);
    const ggr = allFilteredPlayers.reduce((s, p) => s + Number(p.ggr_brl || 0), 0);
    const resultado = ganhos + rake + ggr;
    return {
      ganhos: Math.round((ganhos + Number.EPSILON) * 100) / 100,
      rake: Math.round((rake + Number.EPSILON) * 100) / 100,
      ggr: Math.round((ggr + Number.EPSILON) * 100) / 100,
      resultado: Math.round((resultado + Number.EPSILON) * 100) / 100,
    };
  }, [filteredGroups]);

  function toggleAgent(name: string) {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function expandAll() {
    setExpandedAgents(new Set(filteredGroups.map((g) => g.agentName)));
  }

  function collapseAll() {
    setExpandedAgents(new Set());
  }

  function exportCSV(groups: AgentGroup[]) {
    const rows = [['Agencia', 'ID Agente', 'Jogador', 'ID Jogador', 'Ganhos', 'Rake', 'GGR', 'Resultado']];
    for (const g of groups) {
      for (const p of g.players) {
        const pGanhos = Number(p.winnings_brl || 0);
        const pRake = Number(p.rake_total_brl || 0);
        const pGGR = Number(p.ggr_brl || 0);
        rows.push([
          g.agentName,
          g.externalAgentId || '',
          p.nickname || '',
          p.external_player_id || '',
          pGanhos.toFixed(2),
          pRake.toFixed(2),
          pGGR.toFixed(2),
          (pGanhos + pRake + pGGR).toFixed(2),
        ]);
      }
    }
    const csv = rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `detalhamento_${name || 'clube'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Color functions imported from @/lib/colorUtils
  const valColor = (v: number) => valueColor(v, 'text-poker-400', 'text-red-400');

  return (
    <div>
      {/* ── 5 KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {/* Jogadores Ativos */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-blue-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Jogadores Ativos</p>
            <p className="text-xl font-bold mt-2 font-mono text-blue-400">{grandTotals.ativos}</p>
          </div>
        </div>

        {/* Profit / Loss */}
        <div
          className={`bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default`}
        >
          <div className={`h-0.5 ${grandTotals.ganhos < 0 ? 'bg-red-500' : 'bg-poker-500'}`} />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Profit/Loss</p>
            <p
              className={`text-xl font-bold mt-2 font-mono ${grandTotals.ganhos < 0 ? 'text-red-400' : 'text-poker-400'}`}
            >
              {formatBRL(grandTotals.ganhos)}
            </p>
          </div>
        </div>

        {/* Rake Gerado */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-poker-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Rake Gerado</p>
            <p className="text-xl font-bold mt-2 font-mono text-poker-400">{formatBRL(grandTotals.rake)}</p>
          </div>
        </div>

        {/* GGR Rodeio */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-purple-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">GGR Rodeio</p>
            <p className={`text-xl font-bold mt-2 font-mono ${ggrColor(grandTotals.ggr)}`}>
              {Math.abs(grandTotals.ggr) > 0.001 ? formatBRL(grandTotals.ggr) : '\u2014'}
            </p>
          </div>
        </div>

        {/* Resultado Final */}
        <div
          className={`bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default ring-1 ring-amber-700/30`}
        >
          <div className={`h-0.5 ${grandTotals.resultado >= 0 ? 'bg-amber-500' : 'bg-red-500'}`} />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Resultado Final</p>
            <p
              className={`text-xl font-bold mt-2 font-mono ${grandTotals.resultado >= 0 ? 'text-amber-400' : 'text-red-400'}`}
            >
              {formatBRL(grandTotals.resultado)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar agente ou jogador..."
          className="input w-72"
        />
        <div className="flex items-center gap-2">
          <button onClick={expandAll} className="btn-secondary text-xs px-3 py-1.5">
            Expandir Todos
          </button>
          <button onClick={collapseAll} className="btn-secondary text-xs px-3 py-1.5">
            Recolher Todos
          </button>
          <button onClick={() => exportCSV(filteredGroups)} className="btn-secondary text-xs px-3 py-1.5">
            Exportar CSV
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-dark-800/80 backdrop-blur-sm">
              <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Agente</th>
              <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Rake</th>
              <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Ganhos</th>
              <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Rodeio GGR</th>
              <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Resultado Final</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-800/30">
            {filteredGroups.map((group) => {
              const isExpanded = expandedAgents.has(group.agentName);

              return (
                <AgentSection
                  key={group.agentName}
                  group={group}
                  isExpanded={isExpanded}
                  onToggle={() => toggleAgent(group.agentName)}
                  valColor={valColor}
                  ggrColor={ggrColor}
                />
              );
            })}

            {/* ── TOTAL footer row ── */}
            {filteredGroups.length > 0 && (
              <tr className="border-t-2 border-dark-700 bg-dark-900">
                <td className="px-3 py-2 font-extrabold text-xs text-amber-400">
                  TOTAL
                  <span className="text-dark-500 text-[10px] font-normal ml-2">
                    {filteredGroups.length} agencias &middot; {filteredGroups.reduce((s, g) => s + g.players.length, 0)} jogadores
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs font-extrabold text-emerald-400">
                  {formatBRL(filteredTotals.rake)}
                </td>
                <td className={`px-3 py-2 text-right font-mono text-xs font-extrabold ${valColor(filteredTotals.ganhos)}`}>
                  {formatBRL(filteredTotals.ganhos)}
                </td>
                <td className={`px-3 py-2 text-right font-mono text-xs font-extrabold ${ggrColor(filteredTotals.ggr)}`}>
                  {Math.abs(filteredTotals.ggr) > 0.001 ? formatBRL(filteredTotals.ggr) : '\u2014'}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono text-xs font-extrabold ${valColor(filteredTotals.resultado)}`}
                >
                  {formatBRL(filteredTotals.resultado)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        {/* Empty state */}
        {filteredGroups.length === 0 && (
          <div className="text-center py-10">
            <Search className="w-8 h-8 text-dark-600 mx-auto mb-3" />
            <p className="text-dark-400">
              {search ? 'Nenhum resultado encontrado' : 'Nenhum jogador neste subclube'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Agent row + player sub-rows (fragment) ── */

interface AgentSectionProps {
  group: AgentGroup;
  isExpanded: boolean;
  onToggle: () => void;
  valColor: (v: number) => string;
  ggrColor: (v: number) => string;
}

function AgentSection({ group, isExpanded, onToggle, valColor, ggrColor }: AgentSectionProps) {
  return (
    <>
      {/* Agent row */}
      <tr className="hover:bg-dark-800/40 cursor-pointer border-b border-dark-800 transition-colors" onClick={onToggle}>
        <td className="px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-dark-500 text-[10px]">{isExpanded ? '\u25BC' : '\u25B6'}</span>
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
        <td className="px-3 py-1.5 text-right font-mono text-xs font-semibold text-emerald-400">
          {group.totals.rake > 0.001 ? formatBRL(group.totals.rake) : '\u2014'}
        </td>
        <td className={`px-3 py-1.5 text-right font-mono text-xs font-semibold ${valColor(group.totals.ganhos)}`}>
          {formatBRL(group.totals.ganhos)}
        </td>
        <td className={`px-3 py-1.5 text-right font-mono text-xs font-semibold ${ggrColor(group.totals.ggr)}`}>
          {Math.abs(group.totals.ggr) > 0.001 ? formatBRL(group.totals.ggr) : '\u2014'}
        </td>
        <td className={`px-3 py-1.5 text-right font-mono text-xs font-bold ${valColor(group.totals.resultado)}`}>
          {formatBRL(group.totals.resultado)}
        </td>
      </tr>

      {/* Player sub-rows (visible when expanded) */}
      {isExpanded &&
        group.players.map((p, i) => {
          const pGanhos = Number(p.winnings_brl || 0);
          const pRake = Number(p.rake_total_brl || 0);
          const pGGR = Number(p.ggr_brl || 0);
          const pRes = pGanhos + pRake + pGGR;

          return (
            <tr
              key={p.external_player_id || i}
              className="hover:bg-dark-800/20 transition-colors border-b border-white/[0.04]"
            >
              <td className="pl-8 pr-3 py-1 text-dark-400 text-xs">{p.nickname || p.external_player_id || '\u2014'}</td>
              <td className="px-3 py-1 text-right font-mono text-xs text-emerald-400">
                {pRake > 0.001 ? formatBRL(pRake) : '\u2014'}
              </td>
              <td className={`px-3 py-1 text-right font-mono text-xs ${valColor(pGanhos)}`}>{formatBRL(pGanhos)}</td>
              <td className={`px-3 py-1 text-right font-mono text-xs ${ggrColor(pGGR)}`}>
                {Math.abs(pGGR) > 0.001 ? formatBRL(pGGR) : '\u2014'}
              </td>
              <td className={`px-3 py-1 text-right font-mono text-xs font-semibold ${valColor(pRes)}`}>
                {formatBRL(pRes)}
              </td>
            </tr>
          );
        })}
    </>
  );
}
