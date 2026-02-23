'use client';

import { useState, useMemo } from 'react';
import { formatBRL } from '@/lib/api';

interface Props {
  subclub: any;
}

interface AgentGroup {
  agentName: string;
  agentId: string | null;
  externalAgentId: string | null;
  players: any[];
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
    const map = new Map<string, any[]>();

    for (const p of players) {
      const key = p.agent_name || 'SEM AGENTE';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }

    const groups: AgentGroup[] = [];
    for (const [agentName, pls] of map) {
      const agentMetric = agents.find((a: any) => a.agent_name === agentName);

      const ganhos = pls.reduce((s: number, p: any) => s + Number(p.winnings_brl || 0), 0);
      const rake = pls.reduce((s: number, p: any) => s + Number(p.rake_total_brl || 0), 0);
      const ggr = pls.reduce((s: number, p: any) => s + Number(p.ggr_brl || 0), 0);
      const resultado = ganhos + rake + ggr;

      // Get the external_agent_id from the first player in this group
      const extAgentId = pls[0]?.external_agent_id || agentMetric?.external_agent_id || null;

      groups.push({
        agentName,
        agentId: agentMetric?.agent_id || null,
        externalAgentId: extAgentId,
        players: pls.sort((a: any, b: any) =>
          (a.nickname || '').localeCompare(b.nickname || '')
        ),
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
      .map(g => ({
        ...g,
        players: g.players.filter(
          (p: any) =>
            (p.nickname || '').toLowerCase().includes(q) ||
            (p.agent_name || '').toLowerCase().includes(q) ||
            (p.external_player_id || '').includes(q)
        ),
      }))
      .filter(g => g.players.length > 0);
  }, [agentGroups, search]);

  // Grand totals (always from ALL players, not filtered)
  const grandTotals = useMemo(() => {
    const ganhos = players.reduce((s: number, p: any) => s + Number(p.winnings_brl || 0), 0);
    const rake = players.reduce((s: number, p: any) => s + Number(p.rake_total_brl || 0), 0);
    const ggr = players.reduce((s: number, p: any) => s + Number(p.ggr_brl || 0), 0);
    const resultado = ganhos + rake + ggr;
    const ativos = players.filter((p: any) => Math.abs(Number(p.winnings_brl || 0)) > 0.01).length;
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
    const allFilteredPlayers = filteredGroups.flatMap(g => g.players);
    const ganhos = allFilteredPlayers.reduce((s: number, p: any) => s + Number(p.winnings_brl || 0), 0);
    const rake = allFilteredPlayers.reduce((s: number, p: any) => s + Number(p.rake_total_brl || 0), 0);
    const ggr = allFilteredPlayers.reduce((s: number, p: any) => s + Number(p.ggr_brl || 0), 0);
    const resultado = ganhos + rake + ggr;
    return {
      ganhos: Math.round((ganhos + Number.EPSILON) * 100) / 100,
      rake: Math.round((rake + Number.EPSILON) * 100) / 100,
      ggr: Math.round((ggr + Number.EPSILON) * 100) / 100,
      resultado: Math.round((resultado + Number.EPSILON) * 100) / 100,
    };
  }, [filteredGroups]);

  function toggleAgent(name: string) {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function expandAll() {
    setExpandedAgents(new Set(filteredGroups.map(g => g.agentName)));
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
    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `detalhamento_${name || 'clube'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Color class for positive/negative values */
  function valColor(v: number): string {
    if (v > 0.01) return 'text-poker-400';
    if (v < -0.01) return 'text-red-400';
    return 'text-dark-400';
  }

  /** Dynamic border-top color for resultado KPI */
  function resultadoBorderColor(v: number): string {
    if (v > 0.01) return 'bg-emerald-500';
    if (v < -0.01) return 'bg-red-500';
    return 'bg-dark-500';
  }

  return (
    <div>
      {/* ── 4 KPI Cards ── */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {/* Jogadores Ativos */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-1 bg-blue-500" />
          <div className="px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">
              👥 Jogadores Ativos
            </div>
            <div className="font-mono text-lg font-extrabold text-white">
              {grandTotals.ativos}
            </div>
          </div>
        </div>

        {/* Profit / Loss */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-1 bg-amber-500" />
          <div className="px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">
              📈 Profit / Loss
            </div>
            <div className={`font-mono text-lg font-extrabold ${valColor(grandTotals.ganhos)}`}>
              {formatBRL(grandTotals.ganhos)}
            </div>
          </div>
        </div>

        {/* Rake Gerado */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-1 bg-emerald-500" />
          <div className="px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">
              💎 Rake Gerado
            </div>
            <div className="font-mono text-lg font-extrabold text-emerald-400">
              {formatBRL(grandTotals.rake)}
            </div>
          </div>
        </div>

        {/* Resultado Final */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className={`h-1 ${resultadoBorderColor(grandTotals.resultado)}`} />
          <div className="px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">
              📊 Resultado Final
            </div>
            <div className={`font-mono text-lg font-extrabold ${valColor(grandTotals.resultado)}`}>
              {formatBRL(grandTotals.resultado)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Buscar agente ou jogador..."
          className="input w-72"
        />
        <div className="flex items-center gap-2">
          <button onClick={expandAll} className="btn-secondary text-xs px-3 py-1.5">
            Expandir Todos
          </button>
          <button onClick={collapseAll} className="btn-secondary text-xs px-3 py-1.5">
            Recolher Todos
          </button>
          <button
            onClick={() => exportCSV(filteredGroups)}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            📥 Exportar CSV
          </button>
        </div>
      </div>

      {/* ── Single Unified Table ── */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm" style={{ minWidth: 960 }}>
          <thead>
            <tr className="bg-dark-800/50 text-dark-400 text-left border-b border-dark-700">
              <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wider">
                Agencia / Jogador
              </th>
              <th className="px-3 py-2.5 font-semibold text-xs uppercase tracking-wider">
                ID Agente
              </th>
              <th className="px-3 py-2.5 font-semibold text-xs uppercase tracking-wider text-right">
                Ganhos
              </th>
              <th className="px-3 py-2.5 font-semibold text-xs uppercase tracking-wider text-right">
                Rake
              </th>
              <th className="px-3 py-2.5 font-semibold text-xs uppercase tracking-wider text-right">
                Rodeo GGR
              </th>
              <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wider text-right">
                Resultado Final
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
                  valColor={valColor}
                />
              );
            })}

            {/* ── TOTAL footer row ── */}
            {filteredGroups.length > 0 && (
              <tr className="bg-amber-500/5 border-t-2 border-amber-500/20">
                <td className="px-4 py-3 font-extrabold text-amber-400" colSpan={2}>
                  TOTAL
                </td>
                <td className={`px-3 py-3 text-right font-mono font-extrabold ${valColor(filteredTotals.ganhos)}`}>
                  {formatBRL(filteredTotals.ganhos)}
                </td>
                <td className="px-3 py-3 text-right font-mono font-extrabold text-emerald-400">
                  {formatBRL(filteredTotals.rake)}
                </td>
                <td className="px-3 py-3 text-right font-mono font-extrabold text-purple-400">
                  {Math.abs(filteredTotals.ggr) > 0.001 ? formatBRL(filteredTotals.ggr) : '\u2014'}
                </td>
                <td className={`px-4 py-3 text-right font-mono font-extrabold ${valColor(filteredTotals.resultado)}`}>
                  {formatBRL(filteredTotals.resultado)}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Empty state */}
        {filteredGroups.length === 0 && (
          <div className="text-center py-10 text-dark-400">
            {search ? 'Nenhum resultado encontrado' : 'Nenhum jogador neste subclube'}
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
}

function AgentSection({ group, isExpanded, onToggle, valColor }: AgentSectionProps) {
  return (
    <>
      {/* Agent row */}
      <tr
        className="bg-dark-800/30 hover:bg-dark-800/50 cursor-pointer border-b border-dark-700/50 transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 font-bold text-white">
          <span className="inline-flex items-center gap-2">
            <span className="text-[10px] text-dark-500 transition-transform">
              {isExpanded ? '\u25B2' : '\u25B6'}
            </span>
            <span>{'🤝'} {group.agentName}</span>
            <span className="text-[10px] text-dark-500 font-normal">
              ({group.players.length} jog.)
            </span>
          </span>
        </td>
        <td className="px-3 py-2.5 font-mono text-dark-400 text-xs">
          {group.externalAgentId || '\u2014'}
        </td>
        <td className={`px-3 py-2.5 text-right font-mono font-semibold ${valColor(group.totals.ganhos)}`}>
          {formatBRL(group.totals.ganhos)}
        </td>
        <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-400">
          {group.totals.rake > 0.001 ? formatBRL(group.totals.rake) : '\u2014'}
        </td>
        <td className="px-3 py-2.5 text-right font-mono font-semibold text-purple-400">
          {Math.abs(group.totals.ggr) > 0.001 ? formatBRL(group.totals.ggr) : '\u2014'}
        </td>
        <td className={`px-4 py-2.5 text-right font-mono font-extrabold ${valColor(group.totals.resultado)}`}>
          {formatBRL(group.totals.resultado)}
        </td>
      </tr>

      {/* Player sub-rows (visible when expanded) */}
      {isExpanded &&
        group.players.map((p: any, i: number) => {
          const pGanhos = Number(p.winnings_brl || 0);
          const pRake = Number(p.rake_total_brl || 0);
          const pGGR = Number(p.ggr_brl || 0);
          const pRes = pGanhos + pRake + pGGR;
          const altBg = i % 2 === 1 ? 'bg-white/[0.015]' : '';

          return (
            <tr
              key={p.external_player_id || i}
              className={`hover:bg-dark-800/20 transition-colors border-b border-white/[0.04] ${altBg}`}
            >
              <td className="py-2 text-dark-200" style={{ paddingLeft: 28 }}>
                {'👤'} {p.nickname || p.external_player_id || '\u2014'}
              </td>
              <td className="px-3 py-2 font-mono text-dark-400 text-xs">
                {p.external_player_id || '\u2014'}
              </td>
              <td className={`px-3 py-2 text-right font-mono font-semibold ${valColor(pGanhos)}`}>
                {formatBRL(pGanhos)}
              </td>
              <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-400">
                {pRake > 0.001 ? formatBRL(pRake) : '\u2014'}
              </td>
              <td className="px-3 py-2 text-right font-mono font-semibold text-purple-400">
                {Math.abs(pGGR) > 0.001 ? formatBRL(pGGR) : '\u2014'}
              </td>
              <td className={`px-4 py-2 text-right font-mono font-semibold ${valColor(pRes)}`}>
                {formatBRL(pRes)}
              </td>
            </tr>
          );
        })}
    </>
  );
}
