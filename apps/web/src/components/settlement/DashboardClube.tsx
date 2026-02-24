'use client';

import { useMemo } from 'react';
import KpiCard from '@/components/dashboard/KpiCard';
import { formatCurrency } from '@/lib/formatters';
import { formatBRL } from '@/lib/api';

interface Props {
  subclub: any;
  fees: Record<string, number>;
}

interface AgentSummary {
  agentName: string;
  players: number;
  rake: number;
  ganhos: number;
  ggr: number;
  resultado: number;
}

interface PlayerSummary {
  nickname: string;
  agentName: string;
  rake: number;
  ganhos: number;
  resultado: number;
}

const MEDAL = ['🥇', '🥈', '🥉'];
const PODIUM_BG = [
  'from-amber-500/20 to-amber-900/5 border-amber-500/30',
  'from-slate-300/15 to-slate-700/5 border-slate-400/25',
  'from-orange-600/15 to-orange-900/5 border-orange-500/20',
];
const BAR_COLORS_RAKE = ['bg-poker-500', 'bg-poker-600', 'bg-poker-700'];
const BAR_COLORS_WIN  = ['bg-emerald-500', 'bg-emerald-600', 'bg-emerald-700'];
const BAR_COLORS_LOSS = ['bg-red-500', 'bg-red-600', 'bg-red-700'];

export default function DashboardClube({ subclub, fees }: Props) {
  const { totals, feesComputed, adjustments, totalLancamentos, acertoLiga, name, players, agents } = subclub;

  // ── Agent summaries ──────────────────────────────────────────────
  const agentSummaries: AgentSummary[] = useMemo(() => {
    const map = new Map<string, { players: number; rake: number; ganhos: number; ggr: number }>();
    for (const p of (players || [])) {
      const key = p.agent_name || 'SEM AGENTE';
      const cur = map.get(key) || { players: 0, rake: 0, ganhos: 0, ggr: 0 };
      cur.players += 1;
      cur.rake += Number(p.rake_total_brl || 0);
      cur.ganhos += Number(p.winnings_brl || 0);
      cur.ggr += Number(p.ggr_brl || 0);
      map.set(key, cur);
    }
    const list: AgentSummary[] = [];
    for (const [agentName, d] of map) {
      list.push({ agentName, ...d, resultado: d.ganhos + d.rake + d.ggr });
    }
    return list;
  }, [players]);

  // ── Player summaries ─────────────────────────────────────────────
  const playerSummaries: PlayerSummary[] = useMemo(() => {
    return (players || []).map((p: any) => ({
      nickname: p.nickname || p.external_player_id || '???',
      agentName: p.agent_name || 'SEM AGENTE',
      rake: Number(p.rake_total_brl || 0),
      ganhos: Number(p.winnings_brl || 0),
      resultado: Number(p.winnings_brl || 0) + Number(p.rake_total_brl || 0) + Number(p.ggr_brl || 0),
    }));
  }, [players]);

  // ── Rankings ─────────────────────────────────────────────────────
  const topAgentsRake = useMemo(() =>
    [...agentSummaries].sort((a, b) => b.rake - a.rake).slice(0, 3),
  [agentSummaries]);

  const topPlayersRake = useMemo(() =>
    [...playerSummaries].sort((a, b) => b.rake - a.rake).slice(0, 3),
  [playerSummaries]);

  const topWinners = useMemo(() =>
    [...playerSummaries].filter(p => p.ganhos > 0).sort((a, b) => b.ganhos - a.ganhos).slice(0, 3),
  [playerSummaries]);

  const topLosers = useMemo(() =>
    [...playerSummaries].filter(p => p.ganhos < 0).sort((a, b) => a.ganhos - b.ganhos).slice(0, 3),
  [playerSummaries]);

  const topAgentWinners = useMemo(() =>
    [...agentSummaries].sort((a, b) => b.resultado - a.resultado).slice(0, 3),
  [agentSummaries]);

  const topAgentLosers = useMemo(() =>
    [...agentSummaries].filter(a => a.resultado < 0).sort((a, b) => a.resultado - b.resultado).slice(0, 3),
  [agentSummaries]);

  // Agent distribution for donut-style chart
  const agentDistribution = useMemo(() => {
    const sorted = [...agentSummaries].sort((a, b) => b.players - a.players);
    const colors = ['bg-poker-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-emerald-500', 'bg-red-400', 'bg-pink-500', 'bg-cyan-500'];
    return sorted.map((a, i) => ({
      label: a.agentName,
      value: a.players,
      color: colors[i % colors.length],
    }));
  }, [agentSummaries]);

  // ── Derived ──────────────────────────────────────────────────────
  const totalTaxas = Math.abs(feesComputed.totalTaxasSigned || 0);
  const absLancamentos = Math.abs(totalLancamentos || 0);
  const totalDespesas = totalTaxas + absLancamentos;
  const totalRakeback = (agents || []).reduce((s: number, a: any) => s + Number(a.rb_value || 0), 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-white">Dashboard — {name}</h2>
        <p className="text-xs text-dark-500">Visao consolidada do subclube</p>
      </div>

      {/* ── 7 KPI Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 mb-8">
        <KpiCard label="Jogadores Ativos" value={String(totals.players)} accent="blue" />
        <KpiCard
          label="Profit / Loss" subtitle="Ganhos e Perdas"
          value={formatCurrency(totals.ganhos)}
          accent={totals.ganhos < 0 ? 'red' : 'green'}
        />
        <KpiCard label="Rake Total" value={formatCurrency(totals.rake)} accent="green" />
        <KpiCard label="GGR Rodeio" value={formatCurrency(totals.ggr)} accent="purple" />
        <KpiCard
          label="Resultado Final" subtitle="P/L + Rake + GGR"
          value={formatCurrency(totals.resultado)}
          accent={totals.resultado < 0 ? 'red' : 'green'}
          breakdown={[
            { label: 'P/L', value: formatCurrency(totals.ganhos), rawValue: totals.ganhos },
            { label: 'Rake', value: formatCurrency(totals.rake), rawValue: totals.rake },
            { label: 'GGR', value: formatCurrency(totals.ggr), rawValue: totals.ggr },
          ]}
        />
        <KpiCard
          label="Total Despesas"
          value={formatCurrency(-totalDespesas)}
          accent="red"
          breakdown={[
            { label: 'Taxas', value: formatCurrency(feesComputed.totalTaxasSigned), rawValue: feesComputed.totalTaxasSigned },
            ...(totalRakeback !== 0 ? [{ label: 'Rakeback', value: formatCurrency(-totalRakeback), rawValue: -totalRakeback }] : []),
            ...(adjustments.overlay ? [{ label: 'Overlay', value: formatCurrency(adjustments.overlay), rawValue: adjustments.overlay }] : []),
            ...(adjustments.compras ? [{ label: 'Compras', value: formatCurrency(adjustments.compras), rawValue: adjustments.compras }] : []),
            ...(adjustments.security ? [{ label: 'Security', value: formatCurrency(adjustments.security), rawValue: adjustments.security }] : []),
            ...(adjustments.outros ? [{ label: 'Outros', value: formatCurrency(adjustments.outros), rawValue: adjustments.outros }] : []),
          ]}
        />
        <KpiCard
          label="Fechamento Semana"
          value={formatCurrency(acertoLiga)}
          accent={acertoLiga < 0 ? 'red' : 'green'}
          breakdown={[
            { label: 'Resultado', value: formatCurrency(totals.resultado), rawValue: totals.resultado },
            { label: 'Taxas', value: formatCurrency(feesComputed.totalTaxasSigned), rawValue: feesComputed.totalTaxasSigned },
            { label: 'Lancamentos', value: formatCurrency(totalLancamentos || 0), rawValue: totalLancamentos || 0 },
          ]}
        />
      </div>

      {/* ── Row: Top Rake (Agentes + Jogadores) ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ChartCard title="Top Agentes — Rake" subtitle="Maiores geradores de rake">
          <RankingList items={topAgentsRake.map(a => ({ name: a.agentName, value: a.rake, sub: `${a.players} jogador${a.players !== 1 ? 'es' : ''}` }))} barColors={BAR_COLORS_RAKE} />
        </ChartCard>
        <ChartCard title="Top Jogadores — Rake" subtitle="Maiores geradores de rake">
          <RankingList items={topPlayersRake.map(p => ({ name: p.nickname, value: p.rake, sub: p.agentName }))} barColors={BAR_COLORS_RAKE} />
        </ChartCard>
      </div>

      {/* ── Row: Winners + Losers (Jogadores) ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ChartCard title="Top Ganhadores" subtitle="Jogadores mais lucrativos">
          {topWinners.length === 0 ? (
            <EmptyState text="Nenhum jogador com ganho positivo" />
          ) : (
            <PodiumCards items={topWinners.map(p => ({ name: p.nickname, value: p.ganhos, sub: p.agentName }))} variant="win" />
          )}
        </ChartCard>
        <ChartCard title="Top Perdedores" subtitle="Jogadores com maior perda">
          {topLosers.length === 0 ? (
            <EmptyState text="Nenhum jogador com perda" />
          ) : (
            <PodiumCards items={topLosers.map(p => ({ name: p.nickname, value: p.ganhos, sub: p.agentName }))} variant="loss" />
          )}
        </ChartCard>
      </div>

      {/* ── Row: Agent Winners/Losers + Distribution ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ChartCard title="Resultado por Agente" subtitle="Ranking de performance">
          <RankingBarChart
            items={[...agentSummaries]
              .sort((a, b) => b.resultado - a.resultado)
              .map(a => ({ name: a.agentName, value: a.resultado }))}
          />
        </ChartCard>
        <ChartCard title="Jogadores por Agente" subtitle="Distribuicao da base">
          <DistributionChart items={agentDistribution} total={totals.players} />
        </ChartCard>
      </div>

      {/* ── Row: Top Agent Winners + Losers ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ChartCard title="Top Agentes Ganhadores" subtitle="Melhor resultado semanal">
          {topAgentWinners.length === 0 ? (
            <EmptyState text="Sem dados" />
          ) : (
            <RankingList items={topAgentWinners.map(a => ({ name: a.agentName, value: a.resultado, sub: `${a.players} jogador${a.players !== 1 ? 'es' : ''}` }))} barColors={BAR_COLORS_WIN} />
          )}
        </ChartCard>
        <ChartCard title="Top Agentes Perdedores" subtitle="Pior resultado semanal">
          {topAgentLosers.length === 0 ? (
            <EmptyState text="Nenhum agente negativo" />
          ) : (
            <RankingList items={topAgentLosers.map(a => ({ name: a.agentName, value: a.resultado, sub: `${a.players} jogador${a.players !== 1 ? 'es' : ''}` }))} barColors={BAR_COLORS_LOSS} invertBar />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════════════════════════════ */

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-dark-900 border border-dark-700 rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-dark-400">{title}</h3>
        {subtitle && <p className="text-[10px] text-dark-600 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-8">
      <p className="text-dark-600 text-sm">{text}</p>
    </div>
  );
}

/* ── Ranking List (horizontal bars with medals) ───────────────────── */
function RankingList({ items, barColors, invertBar }: {
  items: { name: string; value: number; sub?: string }[];
  barColors: string[];
  invertBar?: boolean;
}) {
  const maxVal = Math.max(...items.map(i => Math.abs(i.value)), 1);

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const pct = (Math.abs(item.value) / maxVal) * 100;
        return (
          <div key={item.name + i}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base flex-shrink-0">{MEDAL[i] || `#${i + 1}`}</span>
                <span className="text-sm text-white font-medium truncate">{item.name}</span>
                {item.sub && (
                  <span className="text-[10px] text-dark-500 flex-shrink-0">{item.sub}</span>
                )}
              </div>
              <span className={`font-mono text-sm font-semibold flex-shrink-0 ml-2 ${
                invertBar ? 'text-red-400' : item.value >= 0 ? 'text-poker-500' : 'text-red-400'
              }`}>
                {formatBRL(item.value)}
              </span>
            </div>
            <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${barColors[i] || barColors[barColors.length - 1]}`}
                style={{ width: `${Math.max(pct, 3)}%` }}
              />
            </div>
          </div>
        );
      })}
      {items.length === 0 && <EmptyState text="Sem dados" />}
    </div>
  );
}

/* ── Podium Cards (winner/loser highlight) ────────────────────────── */
function PodiumCards({ items, variant }: {
  items: { name: string; value: number; sub?: string }[];
  variant: 'win' | 'loss';
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div
          key={item.name + i}
          className={`bg-gradient-to-r ${PODIUM_BG[i]} border rounded-lg p-3.5 flex items-center justify-between transition-all duration-200 hover:scale-[1.01]`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl flex-shrink-0">{MEDAL[i]}</span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{item.name}</p>
              {item.sub && <p className="text-[10px] text-dark-400">{item.sub}</p>}
            </div>
          </div>
          <span className={`font-mono text-base font-bold flex-shrink-0 ml-2 ${
            variant === 'win' ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {formatBRL(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Ranking Bar Chart (bidirectional, pos/neg) ───────────────────── */
function RankingBarChart({ items }: { items: { name: string; value: number }[] }) {
  const maxAbs = Math.max(...items.map(i => Math.abs(i.value)), 1);

  if (items.length === 0) return <EmptyState text="Sem dados" />;

  return (
    <div className="space-y-2.5">
      {items.map((item, i) => {
        const pct = (Math.abs(item.value) / maxAbs) * 50; // max 50% each side
        const isPositive = item.value >= 0;
        return (
          <div key={item.name + i}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-dark-300 truncate">{item.name}</span>
              <span className={`font-mono text-xs font-semibold ${isPositive ? 'text-poker-500' : 'text-red-400'}`}>
                {formatBRL(item.value)}
              </span>
            </div>
            <div className="flex h-2 bg-dark-800 rounded-full overflow-hidden">
              {/* Negative bar (left side) */}
              <div className="w-1/2 flex justify-end">
                {!isPositive && (
                  <div
                    className="h-full bg-red-500 rounded-l-full transition-all duration-700 ease-out"
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                )}
              </div>
              {/* Center divider */}
              <div className="w-px bg-dark-600 flex-shrink-0" />
              {/* Positive bar (right side) */}
              <div className="w-1/2">
                {isPositive && (
                  <div
                    className="h-full bg-poker-500 rounded-r-full transition-all duration-700 ease-out"
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Distribution Chart (segmented bar + legend) ──────────────────── */
function DistributionChart({ items, total }: { items: { label: string; value: number; color: string }[]; total: number }) {
  if (items.length === 0) return <EmptyState text="Sem dados" />;

  return (
    <div className="space-y-4">
      {/* Segmented bar */}
      <div className="flex h-8 rounded-lg overflow-hidden bg-dark-800">
        {items.map((item) => {
          const pct = total > 0 ? (item.value / total) * 100 : 0;
          if (pct < 1) return null;
          return (
            <div
              key={item.label}
              className={`${item.color} flex items-center justify-center relative group transition-all duration-500`}
              style={{ width: `${pct}%` }}
            >
              {pct > 12 && (
                <span className="text-[10px] font-bold text-white/90 truncate px-1">{item.value}</span>
              )}
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-dark-700 border border-dark-600 rounded-lg px-2.5 py-1 text-[10px] font-mono text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {item.label}: {item.value} ({Math.round(pct)}%)
              </div>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="space-y-1.5">
        {items.map((item) => {
          const pct = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${item.color}`} />
                <span className="text-xs text-dark-300 truncate">{item.label}</span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="font-mono text-xs text-dark-200">{item.value}</span>
                <span className="text-[10px] text-dark-500 w-10 text-right">{Math.round(pct)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
