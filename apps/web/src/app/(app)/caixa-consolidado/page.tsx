'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';
import { apiFetch, listClubPlatforms, formatBRL } from '@/lib/api';
import { round2 } from '@/lib/formatters';
import { useToast } from '@/components/Toast';
import KpiCard from '@/components/ui/KpiCard';
import KpiSkeleton from '@/components/ui/KpiSkeleton';
import TableSkeleton from '@/components/ui/TableSkeleton';
import EmptyState from '@/components/ui/EmptyState';
import WeekDatePicker from '@/components/WeekDatePicker';
import { Landmark } from 'lucide-react';
import type { ClubPlatform } from '@/types/platform';
import { getPlatformColor, PLATFORM_LABELS } from '@/types/platform';

// ─── Types ──────────────────────────────────────────────────────────

interface Settlement {
  id: string;
  week_start: string;
  status: string;
  club_platform_id: string | null;
}

interface PlatformRow {
  platformId: string | null;
  platformLabel: string;
  platform: string;
  clubName: string;
  settlementId: string;
  weekStart: string;
  status: string;
  acertoLiga: number;
  rakeTotal: number;
  resultado: number;
  jogadores: number;
}

// ─── Page ───────────────────────────────────────────────────────────

export default function CaixaConsolidadoPage() {
  usePageTitle('Caixa Consolidado');
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PlatformRow[]>([]);
  const [clubPlatforms, setClubPlatforms] = useState<ClubPlatform[]>([]);

  // Week selector
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  // Load club platforms once
  useEffect(() => {
    listClubPlatforms().then((res) => {
      if (res.success) setClubPlatforms(res.data || []);
    });
  }, []);

  const loadData = useCallback(async (start?: string, end?: string) => {
    setLoading(true);
    try {
      // Fetch ALL settlements (no platform filter) for the selected week
      const params = new URLSearchParams();
      if (start) params.set('start_date', start);
      if (end) params.set('end_date', end);

      // Direct fetch without X-Platform-Id header
      const token = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('poker_auth') || '{}')?.session?.access_token : null;
      const tenantId = typeof window !== 'undefined' ? localStorage.getItem('poker_selected_tenant') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (tenantId) headers['X-Tenant-Id'] = tenantId;
      // Explicitly do NOT set X-Platform-Id here (we want ALL)

      const qs = params.toString();
      const res = await fetch(`/api/settlements${qs ? `?${qs}` : ''}`, { headers });
      const json = await res.json();

      if (!json.success || !json.data?.length) {
        setRows([]);
        setLoading(false);
        return;
      }

      const settlements: Settlement[] = json.data;
      if (!startDate && settlements.length > 0) {
        setStartDate(settlements[0].week_start);
        const dt = new Date(settlements[0].week_start + 'T00:00:00');
        dt.setDate(dt.getDate() + 6);
        setEndDate(dt.toISOString().slice(0, 10));
      }

      // Load full data for each settlement (grouped by platform)
      const platformRows: PlatformRow[] = [];

      for (const s of settlements) {
        try {
          const fullRes = await apiFetch(`/settlements/${s.id}/full`);
          if (!fullRes.success) continue;

          const dt = fullRes.data.dashboardTotals || {};
          const cp = clubPlatforms.find((p) => p.id === s.club_platform_id);

          platformRows.push({
            platformId: s.club_platform_id,
            platformLabel: cp ? (cp.club_name || PLATFORM_LABELS[cp.platform] || cp.platform) : 'Suprema (Principal)',
            platform: cp?.platform || 'suprema',
            clubName: cp?.subclub_name || 'Geral',
            settlementId: s.id,
            weekStart: s.week_start,
            status: s.status,
            acertoLiga: Number(dt.acertoLiga ?? 0),
            rakeTotal: Number(dt.rake ?? 0),
            resultado: Number(dt.resultado ?? 0),
            jogadores: Number(dt.players ?? 0),
          });
        } catch {
          // Skip failed settlements
        }
      }

      setRows(platformRows);
    } catch {
      toast('Erro ao carregar dados consolidados', 'error');
    } finally {
      setLoading(false);
    }
  }, [clubPlatforms, startDate, toast]);

  // Initial load
  useEffect(() => {
    if (clubPlatforms !== undefined) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubPlatforms]);

  function handleStartChange(date: string) {
    setStartDate(date);
    const dt = new Date(date + 'T00:00:00');
    dt.setDate(dt.getDate() + 6);
    const end = dt.toISOString().slice(0, 10);
    setEndDate(end);
    loadData(date, end);
  }

  // ─── Aggregates ────────────────────────────────────────────────────

  const totals = useMemo(() => {
    const acertoLiga = round2(rows.reduce((s, r) => s + r.acertoLiga, 0));
    const rakeTotal = round2(rows.reduce((s, r) => s + r.rakeTotal, 0));
    const resultado = round2(rows.reduce((s, r) => s + r.resultado, 0));
    const jogadores = rows.reduce((s, r) => s + r.jogadores, 0);
    return { acertoLiga, rakeTotal, resultado, jogadores };
  }, [rows]);

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="bg-dark-950 min-h-screen p-4 lg:p-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-xl lg:text-2xl font-extrabold text-dark-100 mb-1">Caixa Consolidado</h1>
          <p className="text-dark-400 text-sm">Visao cross-platform — todas as plataformas</p>
        </div>
        <div className="flex items-center gap-2">
          <WeekDatePicker value={startDate} onChange={handleStartChange} allowedDay={1} label="Data Inicial" />
          <WeekDatePicker value={endDate} onChange={setEndDate} allowedDay={0} label="Data Final" />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="animate-tab-fade">
          <KpiSkeleton count={4} />
          <TableSkeleton rows={3} columns={5} />
        </div>
      )}

      {/* Empty */}
      {!loading && rows.length === 0 && (
        <EmptyState
          icon={Landmark}
          title="Nenhum dado encontrado"
          description="Nao ha settlements para o periodo selecionado."
        />
      )}

      {/* Content */}
      {!loading && rows.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard
              label="Jogadores"
              value={String(totals.jogadores)}
              accentColor="bg-blue-500"
            />
            <KpiCard
              label="Rake Total"
              value={formatBRL(totals.rakeTotal)}
              accentColor="bg-poker-500"
            />
            <KpiCard
              label="Resultado"
              value={formatBRL(totals.resultado)}
              accentColor={totals.resultado >= 0 ? 'bg-poker-500' : 'bg-red-500'}
              valueColor={totals.resultado >= 0 ? 'text-poker-400' : 'text-red-400'}
            />
            <KpiCard
              label="Acerto Liga"
              value={formatBRL(totals.acertoLiga)}
              accentColor={totals.acertoLiga >= 0 ? 'bg-amber-500' : 'bg-red-500'}
              valueColor={totals.acertoLiga >= 0 ? 'text-amber-400' : 'text-red-400'}
            />
          </div>

          {/* Table */}
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm data-table">
              <thead className="bg-dark-800/50">
                <tr>
                  <th className="text-left py-3 px-4 text-xs text-dark-500 font-medium">Plataforma</th>
                  <th className="text-left py-3 px-4 text-xs text-dark-500 font-medium">Clube / Subclube</th>
                  <th className="text-center py-3 px-4 text-xs text-dark-500 font-medium">Status</th>
                  <th className="text-right py-3 px-4 text-xs text-dark-500 font-medium">Jogadores</th>
                  <th className="text-right py-3 px-4 text-xs text-dark-500 font-medium">Rake</th>
                  <th className="text-right py-3 px-4 text-xs text-dark-500 font-medium">Resultado</th>
                  <th className="text-right py-3 px-4 text-xs text-dark-500 font-medium">Acerto Liga</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/30">
                {rows.map((r) => {
                  const color = getPlatformColor(r.platform);
                  return (
                    <tr
                      key={r.settlementId}
                      className="hover:bg-dark-800/20 transition-colors cursor-pointer"
                      onClick={() => { window.location.href = `/s/${r.settlementId}`; }}
                    >
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${color.bg} ${color.text} ${color.border}`}>
                          {PLATFORM_LABELS[r.platform] || r.platform}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-dark-200 font-medium">{r.platformLabel}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          r.status === 'FINAL'
                            ? 'border-green-500/30 bg-green-500/10 text-green-400'
                            : r.status === 'VOID'
                              ? 'border-red-500/30 bg-red-500/10 text-red-400'
                              : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                        }`}>
                          {r.status === 'FINAL' ? 'FECHADO' : r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-dark-300 font-mono">{r.jogadores}</td>
                      <td className="py-3 px-4 text-right text-dark-300 font-mono">{formatBRL(r.rakeTotal)}</td>
                      <td className={`py-3 px-4 text-right font-mono ${r.resultado >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                        {formatBRL(r.resultado)}
                      </td>
                      <td className={`py-3 px-4 text-right font-mono ${r.acertoLiga >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                        {formatBRL(r.acertoLiga)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Grand total footer */}
              <tfoot className="bg-dark-800/30 border-t border-dark-700">
                <tr className="font-bold">
                  <td colSpan={3} className="py-3 px-4 text-dark-200">
                    TOTAL ({rows.length} plataforma{rows.length > 1 ? 's' : ''})
                  </td>
                  <td className="py-3 px-4 text-right text-dark-200 font-mono">{totals.jogadores}</td>
                  <td className="py-3 px-4 text-right text-dark-200 font-mono">{formatBRL(totals.rakeTotal)}</td>
                  <td className={`py-3 px-4 text-right font-mono ${totals.resultado >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                    {formatBRL(totals.resultado)}
                  </td>
                  <td className={`py-3 px-4 text-right font-mono ${totals.acertoLiga >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                    {formatBRL(totals.acertoLiga)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
