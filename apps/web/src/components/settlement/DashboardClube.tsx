'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import KpiCard from '@/components/ui/KpiCard';
import { formatCurrency } from '@/lib/formatters';
import { formatBRL, listSettlements, getSettlementFull } from '@/lib/api';
import { SubclubData, PlayerMetric, AgentMetric } from '@/types/settlement';

/* ══════════════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════════════ */

interface Props {
  subclub: SubclubData;
  fees: Record<string, number>;
  settlementId: string;
  subclubName: string;
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

interface RakeWeekPoint {
  semana: string;
  rake: number;
  isCurrent: boolean;
}

interface HistorySubclub {
  name: string;
  id: string;
  totals?: { rake?: number; players?: number };
}

interface HistoryItem {
  settlement: { id: string; week_start: string };
  full: { data?: { subclubs?: HistorySubclub[] }; subclubs?: HistorySubclub[] } | null;
}

const BAR_COLORS_RAKE = ['bg-poker-500', 'bg-poker-500', 'bg-poker-600', 'bg-poker-600', 'bg-poker-700'];
const MEDAL = ['🥇', '🥈', '🥉'];

/* ══════════════════════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════════════════════ */

export default function DashboardClube({ subclub, fees: _fees, settlementId, subclubName }: Props) {
  const { totals, feesComputed, adjustments: _adjustments, totalLancamentos, acertoLiga, name, players, agents } = subclub;

  // ── Historical data (8 weeks) ──────────────────────────────────────
  const [rakeHistory, setRakeHistory] = useState<RakeWeekPoint[]>([]);
  const [prevPlayers, setPrevPlayers] = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        const res = await listSettlements();
        if (cancelled || !res?.data) return;

        // Take up to 4 most recent settlements (limit API calls)
        // TODO: replace with dedicated GET /api/settlements/rake-history?subclub=X endpoint
        const settlements = res.data.slice(0, 4);
        if (settlements.length === 0) {
          setHistoryLoading(false);
          return;
        }

        // Load full data for each settlement in parallel
        const fullData = await Promise.all(
          settlements.map(async (s: { id: string; week_start: string }) => {
            try {
              const full = await getSettlementFull(s.id);
              return { settlement: s, full } as HistoryItem;
            } catch {
              return null;
            }
          }),
        );

        if (cancelled) return;

        // Sort by week_start ascending
        const sorted = fullData
          .filter((x): x is HistoryItem => x !== null)
          .sort((a, b) => a.settlement.week_start.localeCompare(b.settlement.week_start));

        // Extract rake per week for this subclub
        const points: RakeWeekPoint[] = [];
        let prevPlayerCount: number | null = null;

        for (const item of sorted) {
          const { settlement, full } = item;
          const weekStart = settlement.week_start;
          const dt = new Date(weekStart + 'T00:00:00');
          const label = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;

          const isCurrent = settlement.id === settlementId;
          const subclubs = full?.data?.subclubs || full?.subclubs || [];
          const sc = subclubs.find((s) => s.name === subclubName || s.id === subclubName);

          if (sc) {
            points.push({
              semana: label,
              rake: Number(sc.totals?.rake || 0),
              isCurrent,
            });

            // Track previous week's player count
            if (!isCurrent) {
              prevPlayerCount = Number(sc.totals?.players || 0);
            }
          } else {
            points.push({ semana: label, rake: 0, isCurrent });
          }
        }

        if (!cancelled) {
          setRakeHistory(points);
          setPrevPlayers(prevPlayerCount);
          setHistoryLoading(false);
        }
      } catch {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [settlementId, subclubName]);

  // ── Agent summaries ──────────────────────────────────────────────
  const agentSummaries: AgentSummary[] = useMemo(() => {
    const map = new Map<string, { players: number; rake: number; ganhos: number; ggr: number }>();
    for (const p of players || []) {
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
    return (players || []).map((p: PlayerMetric) => ({
      nickname: p.nickname || p.external_player_id || '???',
      agentName: p.agent_name || 'SEM AGENTE',
      rake: Number(p.rake_total_brl || 0),
      ganhos: Number(p.winnings_brl || 0),
      resultado: Number(p.winnings_brl || 0) + Number(p.rake_total_brl || 0) + Number(p.ggr_brl || 0),
    }));
  }, [players]);

  // ── Rankings (top 5) ───────────────────────────────────────────
  const topAgentsRake = useMemo(
    () => [...agentSummaries].sort((a, b) => b.rake - a.rake).slice(0, 5),
    [agentSummaries],
  );

  const topPlayersRake = useMemo(
    () => [...playerSummaries].sort((a, b) => b.rake - a.rake).slice(0, 5),
    [playerSummaries],
  );

  const topWinners = useMemo(
    () =>
      [...playerSummaries]
        .filter((p) => p.ganhos > 0)
        .sort((a, b) => b.ganhos - a.ganhos)
        .slice(0, 5),
    [playerSummaries],
  );

  const topLosers = useMemo(
    () =>
      [...playerSummaries]
        .filter((p) => p.ganhos < 0)
        .sort((a, b) => a.ganhos - b.ganhos)
        .slice(0, 5),
    [playerSummaries],
  );

  // ── Derived ──────────────────────────────────────────────────────
  const totalTaxas = Math.abs(feesComputed.totalTaxasSigned || 0);
  const absLancamentos = Math.abs(totalLancamentos || 0);
  const totalDespesas = totalTaxas + absLancamentos;
  const _totalRakeback = (agents || []).reduce((s: number, a: AgentMetric) => s + Number(a.commission_brl || 0), 0);

  // ── Player delta ─────────────────────────────────────────────────
  const _playerDelta = useMemo(() => {
    if (prevPlayers === null) return undefined;
    const current = totals.players;
    const diff = current - prevPlayers;
    if (diff === 0) return { pct: '0', isUp: false, isZero: true };
    const pct = prevPlayers > 0 ? Math.abs(Math.round((diff / prevPlayers) * 100)) : 100;
    return { pct: String(pct), isUp: diff > 0, isZero: false };
  }, [prevPlayers, totals.players]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-white">Dashboard — {name}</h2>
        <p className="text-xs text-dark-500">Visao consolidada do subclube</p>
      </div>

      {/* ── 6 KPI Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
        <KpiCard
          label="Jogadores"
          value={String(totals.players)}
          accentColor="bg-blue-500"
        />
        <KpiCard
          label="Profit / Loss"
          value={formatCurrency(totals.ganhos)}
          accentColor={totals.ganhos < 0 ? 'bg-red-500' : 'bg-poker-500'}
          valueColor={totals.ganhos < 0 ? 'text-red-400' : 'text-poker-400'}
        />
        <KpiCard
          label="Rake Total"
          value={formatCurrency(totals.rake)}
          accentColor="bg-poker-500"
        />
        <KpiCard
          label="Resultado"
          value={formatCurrency(totals.resultado)}
          accentColor={totals.resultado < 0 ? 'bg-red-500' : 'bg-poker-500'}
          valueColor={totals.resultado < 0 ? 'text-red-400' : 'text-poker-400'}
        />
        <KpiCard
          label="Despesas"
          value={formatCurrency(-totalDespesas)}
          accentColor="bg-red-500"
          valueColor="text-red-400"
        />
        <KpiCard
          label="Fechamento"
          value={formatCurrency(acertoLiga)}
          accentColor={acertoLiga < 0 ? 'bg-red-500' : 'bg-amber-500'}
          valueColor={acertoLiga < 0 ? 'text-red-400' : 'text-amber-400'}
        />
      </div>

      {/* ── Row: Top 5 Rake (Agentes + Jogadores) ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ChartCard title="Top 5 Agentes — Rake" subtitle="Maiores geradores de rake">
          <RankingList
            items={topAgentsRake.map((a) => ({
              name: a.agentName,
              value: a.rake,
              sub: `${a.players} jogador${a.players !== 1 ? 'es' : ''}`,
            }))}
            barColors={BAR_COLORS_RAKE}
          />
        </ChartCard>
        <ChartCard title="Top 5 Jogadores — Rake" subtitle="Maiores geradores de rake">
          <RankingList
            items={topPlayersRake.map((p) => ({ name: p.nickname, value: p.rake, sub: p.agentName }))}
            barColors={BAR_COLORS_RAKE}
          />
        </ChartCard>
      </div>

      {/* ── Row: Top 5 Ganhadores + Perdedores ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ChartCard title="Top 5 Ganhadores" subtitle="Jogadores mais lucrativos">
          {topWinners.length === 0 ? (
            <EmptyState text="Nenhum jogador com ganho positivo" />
          ) : (
            <PodiumCards
              items={topWinners.map((p) => ({ name: p.nickname, value: p.ganhos, sub: p.agentName }))}
              variant="win"
            />
          )}
        </ChartCard>
        <ChartCard title="Top 5 Perdedores" subtitle="Jogadores com maior perda">
          {topLosers.length === 0 ? (
            <EmptyState text="Nenhum jogador com perda" />
          ) : (
            <PodiumCards
              items={topLosers.map((p) => ({ name: p.nickname, value: p.ganhos, sub: p.agentName }))}
              variant="loss"
            />
          )}
        </ChartCard>
      </div>

      {/* ── Row: Comparativo Rake 8 Semanas ───────────────────────── */}
      <div className="mt-4">
        <ChartCard title="Comparativo Rake — Ultimas Semanas" subtitle="Evolucao do rake gerado pelo subclube">
          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-poker-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-dark-500 text-xs ml-3">Carregando historico...</span>
            </div>
          ) : rakeHistory.length === 0 ? (
            <EmptyState text="Sem historico disponivel" />
          ) : (
            <RakeHistoryChart data={rakeHistory} />
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

/* ── Ranking List (horizontal bars) ─────────────────────────────── */
function RankingList({
  items,
  barColors,
  invertBar,
}: {
  items: { name: string; value: number; sub?: string }[];
  barColors: string[];
  invertBar?: boolean;
}) {
  const maxVal = Math.max(...items.map((i) => Math.abs(i.value)), 1);

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
                {item.sub && <span className="text-[10px] text-dark-500 flex-shrink-0">{item.sub}</span>}
              </div>
              <span
                className={`font-mono text-sm font-semibold flex-shrink-0 ml-2 ${
                  invertBar ? 'text-red-400' : item.value >= 0 ? 'text-poker-500' : 'text-red-400'
                }`}
              >
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
const PODIUM_BG = [
  'from-amber-500/20 to-amber-900/5 border-amber-500/30',
  'from-slate-300/15 to-slate-700/5 border-slate-400/25',
  'from-orange-600/15 to-orange-900/5 border-orange-500/20',
];

function PodiumCards({
  items,
  variant,
}: {
  items: { name: string; value: number; sub?: string }[];
  variant: 'win' | 'loss';
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div
          key={item.name + i}
          className={`bg-gradient-to-r ${PODIUM_BG[i] || 'from-dark-800/50 to-dark-900/30 border-dark-700'} border rounded-lg p-3.5 flex items-center justify-between transition-all duration-200 hover:scale-[1.01]`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl flex-shrink-0">{MEDAL[i] || `#${i + 1}`}</span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{item.name}</p>
              {item.sub && <p className="text-[10px] text-dark-400">{item.sub}</p>}
            </div>
          </div>
          <span
            className={`font-mono text-base font-bold flex-shrink-0 ml-2 ${
              variant === 'win' ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {formatBRL(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Rake History Chart (Recharts BarChart) ───────────────────────── */
function RakeTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg p-2 text-xs font-mono shadow-lg">
      <p className="text-dark-400 mb-1">Semana {label}</p>
      <p className="text-poker-500 font-semibold">{formatBRL(payload[0].value)}</p>
    </div>
  );
}

function RakeHistoryChart({ data }: { data: RakeWeekPoint[] }) {
  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-poker-500" />
          <span className="text-[11px] text-dark-400">Semana atual</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-dark-600" />
          <span className="text-[11px] text-dark-400">Semanas anteriores</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barCategoryGap="20%" barSize={28} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id="rakeBarCurrent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#15803d" />
            </linearGradient>
            <linearGradient id="rakeBarDefault" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#475569" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="semana" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: '#475569', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) =>
              v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
            }
          />
          <Tooltip content={<RakeTooltip />} />
          <Bar dataKey="rake" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.isCurrent ? 'url(#rakeBarCurrent)' : 'url(#rakeBarDefault)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
