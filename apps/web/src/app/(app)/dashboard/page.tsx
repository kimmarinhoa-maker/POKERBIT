'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { listSettlements, getSettlementFull, listLedger, formatBRL, formatDate } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/Spinner';

// ─── Types ──────────────────────────────────────────────────────────

interface AgentMetric {
  id: string;
  agent_id: string | null;
  agent_name: string;
  player_count: number;
  resultado_brl: number;
  is_direct?: boolean;
}

interface LedgerEntry {
  id: string;
  entity_id: string;
  dir: 'IN' | 'OUT';
  amount: number;
}

interface SubclubStats {
  id: string;
  name: string;
  totalEntities: number;
  entitiesWithMov: number;
  aPagar: number;
  aReceber: number;
  pago: number;
  quitados: number;
  emAberto: number;
  status: string;
  statusColor: string;
  statusBg: string;
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

// ─── Component ──────────────────────────────────────────────────────

export default function DashboardPage() {
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subclubs, setSubclubs] = useState<any[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [latestSettlement, setLatestSettlement] = useState<any>(null);
  const [loadingKpis, setLoadingKpis] = useState(false);
  const { toast } = useToast();

  // 1. Load settlements list
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await listSettlements();
        if (res.success) setSettlements(res.data || []);
        else toast(res.error || 'Erro ao carregar semanas', 'error');
      } catch {
        toast('Erro de conexao com o servidor', 'error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // 2. Load full data for latest settlement
  useEffect(() => {
    if (settlements.length === 0) return;
    const latest = settlements[0];

    async function loadFull() {
      setLoadingKpis(true);
      try {
        const [fullRes, ledgerRes] = await Promise.all([
          getSettlementFull(latest.id),
          listLedger(latest.week_start),
        ]);
        if (fullRes.success) {
          setSubclubs(fullRes.data.subclubs || []);
          setLatestSettlement(fullRes.data.settlement || latest);
        }
        if (ledgerRes.success) {
          setEntries(ledgerRes.data || []);
        }
      } catch {
        toast('Erro ao carregar dados do settlement', 'error');
      } finally {
        setLoadingKpis(false);
      }
    }
    loadFull();
  }, [settlements]);

  // 3. Group ledger by entity
  const ledgerByEntity = useMemo(() => {
    const map = new Map<string, LedgerEntry[]>();
    for (const e of entries) {
      if (!map.has(e.entity_id)) map.set(e.entity_id, []);
      map.get(e.entity_id)!.push(e);
    }
    return map;
  }, [entries]);

  // 4. Compute stats per subclub
  const subclubStats: SubclubStats[] = useMemo(() => {
    return subclubs.map((sc: any) => {
      const agents: AgentMetric[] = sc.agents || [];
      let aPagar = 0, aReceber = 0, pago = 0, quitados = 0, emAberto = 0, entitiesWithMov = 0;

      agents.forEach(agent => {
        const resultado = Number(agent.resultado_brl) || 0;
        const totalDevido = round2(resultado);

        // Resolve ledger entries (by agent_week_metrics.id and org id)
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

        const totalIn = agEntries.filter(e => e.dir === 'IN').reduce((s, e) => s + Number(e.amount), 0);
        const totalOut = agEntries.filter(e => e.dir === 'OUT').reduce((s, e) => s + Number(e.amount), 0);
        const pagos = round2(totalIn - totalOut);
        const pendente = round2(totalDevido + pagos);

        const hasMov = Math.abs(totalDevido) > 0.01 || Math.abs(pagos) > 0.01;
        if (hasMov) entitiesWithMov++;

        if (pendente < -0.01) aPagar += Math.abs(pendente);
        if (pendente > 0.01) aReceber += pendente;
        pago += totalOut;

        if (hasMov && Math.abs(pendente) < 0.01) quitados++;
        else if (hasMov) emAberto++;
      });

      let status: string, statusColor: string, statusBg: string;
      if (entitiesWithMov === 0) {
        status = 'Sem Mov.'; statusColor = '#94a3b8'; statusBg = 'rgba(148,163,184,.08)';
      } else if (quitados === entitiesWithMov) {
        status = 'Quitado'; statusColor = '#10b981'; statusBg = 'rgba(16,185,129,.08)';
      } else {
        status = 'Em Aberto'; statusColor = '#ef4444'; statusBg = 'rgba(239,68,68,.08)';
      }

      return {
        id: sc.id, name: sc.name,
        totalEntities: agents.length, entitiesWithMov,
        aPagar: round2(aPagar), aReceber: round2(aReceber), pago: round2(pago),
        quitados, emAberto, status, statusColor, statusBg,
      };
    });
  }, [subclubs, ledgerByEntity]);

  // 5. Global KPIs
  const kpis = useMemo(() => {
    const gPagar = subclubStats.reduce((s, d) => s + d.aPagar, 0);
    const gReceber = subclubStats.reduce((s, d) => s + d.aReceber, 0);
    const gNet = round2(gReceber - gPagar);
    const gPago = subclubStats.reduce((s, d) => s + d.pago, 0);
    const gTotal = subclubStats.reduce((s, d) => s + d.totalEntities, 0);
    const gQuit = subclubStats.reduce((s, d) => s + d.quitados, 0);
    const gComMov = subclubStats.reduce((s, d) => s + d.entitiesWithMov, 0);
    return { gPagar, gReceber, gNet, gPago, gTotal, gQuit, gComMov };
  }, [subclubStats]);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT': return <span className="badge-draft">RASCUNHO</span>;
      case 'FINAL': return <span className="badge-final">FINALIZADO</span>;
      case 'VOID':  return <span className="badge-void">ANULADO</span>;
      default: return <span className="badge-draft">{status}</span>;
    }
  };

  const hasKpiData = subclubStats.length > 0;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-1">💼 Dashboard</h2>
        <p className="text-dark-400">
          Painel operacional
          {hasKpiData && (
            <span className="ml-2 text-dark-500">
              · {kpis.gTotal} entidades · {kpis.gQuit} quitadas · {kpis.gComMov - kpis.gQuit} pendentes
            </span>
          )}
        </p>
      </div>

      {/* KPIs (5 cards) */}
      {loadingKpis ? (
        <div className="flex justify-center py-8 mb-6">
          <Spinner size="md" />
        </div>
      ) : hasKpiData ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          <KpiCard
            icon="📤" label="A Pagar"
            value={kpis.gPagar > 0.01 ? formatBRL(kpis.gPagar) : '—'}
            color="text-red-400"
            borderColor="border-t-red-500"
            sub={`${kpis.gComMov - kpis.gQuit} pendentes`}
          />
          <KpiCard
            icon="📥" label="A Receber"
            value={kpis.gReceber > 0.01 ? formatBRL(kpis.gReceber) : '—'}
            color="text-emerald-400"
            borderColor="border-t-emerald-500"
          />
          <KpiCard
            icon="📊" label="Net"
            value={formatBRL(kpis.gNet)}
            color={kpis.gNet > 0.01 ? 'text-emerald-400' : kpis.gNet < -0.01 ? 'text-red-400' : 'text-dark-400'}
            borderColor={kpis.gNet > 0 ? 'border-t-emerald-500' : kpis.gNet < 0 ? 'border-t-red-500' : 'border-t-dark-600'}
            sub={kpis.gNet > 0 ? 'saldo positivo' : kpis.gNet < 0 ? 'saldo negativo' : 'zerado'}
          />
          <KpiCard
            icon="💰" label="Movimentado"
            value={kpis.gPago > 0.01 ? formatBRL(kpis.gPago) : '—'}
            color="text-blue-400"
            borderColor="border-t-blue-500"
          />
          <KpiCard
            icon="✅" label="Quitados"
            value={`${kpis.gQuit}/${kpis.gComMov}`}
            color="text-emerald-400"
            borderColor="border-t-emerald-500"
            sub={kpis.gComMov > 0 ? `${Math.round(kpis.gQuit / kpis.gComMov * 100)}%` : ''}
          />
        </div>
      ) : hasKpiData ? (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-dark-400">Progresso de quitacao</span>
            <span className="text-xs font-mono text-dark-300">
              {kpis.gQuit}/{kpis.gComMov} entidades quitadas
              {kpis.gComMov > 0 && ` (${Math.round(kpis.gQuit / kpis.gComMov * 100)}%)`}
            </span>
          </div>
          <div className="w-full bg-dark-800 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${
                kpis.gQuit === kpis.gComMov && kpis.gComMov > 0
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-poker-600 to-poker-400'
              }`}
              style={{ width: `${kpis.gComMov > 0 ? Math.round(kpis.gQuit / kpis.gComMov * 100) : 0}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Link href="/import" className="card hover:border-poker-600/50 transition-all cursor-pointer group p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-poker-900/30 flex items-center justify-center text-3xl group-hover:bg-poker-900/50 transition-colors">
              📤
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white group-hover:text-poker-400 transition-colors">
                Importar Semana
              </h3>
              <p className="text-sm text-dark-400">Upload de XLSX Suprema Poker</p>
            </div>
          </div>
        </Link>

        {settlements[0] ? (
          <Link href={`/s/${settlements[0].id}`} className="card hover:border-poker-600/50 transition-all cursor-pointer group p-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-dark-800 flex items-center justify-center text-3xl group-hover:bg-poker-900/30 transition-colors">
                📅
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-white group-hover:text-poker-400 transition-colors">
                  Ultima Semana
                </h3>
                <p className="text-sm text-dark-400">
                  {formatDate(settlements[0].week_start)} · v{settlements[0].version}
                </p>
              </div>
              {statusBadge(settlements[0].status)}
            </div>
          </Link>
        ) : (
          <div className="card p-6 border-dashed">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-dark-800 flex items-center justify-center text-3xl">📅</div>
              <div>
                <h3 className="text-lg font-semibold text-dark-400">Nenhuma Semana</h3>
                <p className="text-sm text-dark-500">Importe um XLSX para comecar</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Subclub Cards */}
      {hasKpiData && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-white mb-4">
            Clubes — Semana {latestSettlement ? formatDate(latestSettlement.week_start) : ''}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subclubStats.map(sc => (
              <SubclubCard
                key={sc.id}
                sc={sc}
                settlementId={latestSettlement?.id || settlements[0]?.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Summary Table */}
      {hasKpiData && subclubStats.length > 1 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-white mb-4">Resumo</h3>
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm" aria-label="Resumo por subclube">
              <thead>
                <tr className="bg-dark-800/50">
                  <th className="px-4 py-3 text-left font-medium text-xs text-dark-400">Clube</th>
                  <th className="px-3 py-3 text-center font-medium text-xs text-dark-400">Entidades</th>
                  <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">A Pagar</th>
                  <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">A Receber</th>
                  <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">Pago</th>
                  <th className="px-3 py-3 text-center font-medium text-xs text-dark-400">Quitados</th>
                  <th className="px-3 py-3 text-center font-medium text-xs text-dark-400">Status</th>
                  <th className="px-3 py-3 text-center font-medium text-xs text-dark-400">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/50">
                {subclubStats.map(sc => (
                  <tr key={sc.id} className="hover:bg-dark-800/20 transition-colors">
                    <td className="px-4 py-3 text-white font-semibold">{sc.name}</td>
                    <td className="px-3 py-3 text-center text-dark-300 font-mono">{sc.totalEntities}</td>
                    <td className="px-3 py-3 text-right font-mono text-red-400">
                      {sc.aPagar > 0.01 ? formatBRL(sc.aPagar) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-400">
                      {sc.aReceber > 0.01 ? formatBRL(sc.aReceber) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-blue-400">
                      {sc.pago > 0.01 ? formatBRL(sc.pago) : '—'}
                    </td>
                    <td className="px-3 py-3 text-center text-dark-300 font-mono">
                      {sc.quitados}/{sc.entitiesWithMov}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className="text-[10px] font-bold px-2 py-1 rounded"
                        style={{ background: sc.statusBg, color: sc.statusColor }}
                      >
                        {sc.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Link
                        href={`/s/${latestSettlement?.id || settlements[0]?.id}/club/${sc.id}`}
                        className="text-poker-400 hover:text-poker-300 text-xs font-bold"
                        aria-label={`Abrir ${sc.name}`}
                      >
                        Abrir →
                      </Link>
                    </td>
                  </tr>
                ))}
                {/* Total row */}
                <tr className="bg-dark-800/30 font-bold">
                  <td className="px-4 py-3 text-white">TOTAL</td>
                  <td className="px-3 py-3 text-center text-dark-200 font-mono">{kpis.gTotal}</td>
                  <td className="px-3 py-3 text-right font-mono text-red-400">
                    {kpis.gPagar > 0.01 ? formatBRL(kpis.gPagar) : '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-400">
                    {kpis.gReceber > 0.01 ? formatBRL(kpis.gReceber) : '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-blue-400">
                    {kpis.gPago > 0.01 ? formatBRL(kpis.gPago) : '—'}
                  </td>
                  <td className="px-3 py-3 text-center text-dark-200 font-mono">
                    {kpis.gQuit}/{kpis.gComMov}
                  </td>
                  <td className="px-3 py-3 text-center text-dark-500 text-xs" colSpan={2}>
                    {subclubStats.length} clubes
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Settlements */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Fechamentos Recentes</h3>
          {settlements.length > 0 && (
            <Link href="/s" className="text-sm text-poker-400 hover:text-poker-300 transition-colors">
              Ver todos →
            </Link>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : settlements.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-dark-400 mb-4">Nenhum fechamento ainda</p>
            <Link href="/import" className="btn-primary inline-flex items-center gap-2">
              <span>📤</span> Fazer primeiro upload
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {settlements.slice(0, 5).map((s: any) => (
              <Link
                key={s.id}
                href={`/s/${s.id}`}
                className="card hover:border-poker-600/50 transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-dark-800 flex items-center justify-center text-xl group-hover:bg-poker-900/30 transition-colors">
                      📅
                    </div>
                    <div>
                      <h4 className="text-base font-semibold text-white group-hover:text-poker-400 transition-colors">
                        Semana {formatDate(s.week_start)}
                      </h4>
                      <p className="text-sm text-dark-400">
                        {s.organizations?.name || 'Suprema Poker'} · v{s.version}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {statusBadge(s.status)}
                    <span className="text-dark-500 group-hover:text-dark-300 transition-colors">→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Subclub Card ────────────────────────────────────────────────────

function SubclubCard({ sc, settlementId }: { sc: SubclubStats; settlementId: string }) {
  const pctQuit = sc.entitiesWithMov > 0 ? Math.round(sc.quitados / sc.entitiesWithMov * 100) : 0;

  return (
    <Link
      href={`/s/${settlementId}/club/${sc.id}`}
      className="card hover:border-poker-600/50 transition-colors cursor-pointer group overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-bold text-white group-hover:text-poker-400 transition-colors">{sc.name}</h4>
          <p className="text-xs text-dark-500">{sc.totalEntities} entidades · {sc.entitiesWithMov} com movimento</p>
        </div>
        <span
          className="text-[10px] font-bold px-2 py-1 rounded"
          style={{ background: sc.statusBg, color: sc.statusColor }}
        >
          {sc.status}
        </span>
      </div>

      {/* Financial row */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <p className="text-[9px] text-dark-500 uppercase font-bold">A Pagar</p>
          <p className="font-mono text-sm font-bold text-red-400">
            {sc.aPagar > 0.01 ? formatBRL(sc.aPagar) : '—'}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-dark-500 uppercase font-bold">A Receber</p>
          <p className="font-mono text-sm font-bold text-emerald-400">
            {sc.aReceber > 0.01 ? formatBRL(sc.aReceber) : '—'}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-dark-500 uppercase font-bold">Pago</p>
          <p className="font-mono text-sm font-bold text-blue-400">
            {sc.pago > 0.01 ? formatBRL(sc.pago) : '—'}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      {sc.entitiesWithMov > 0 && (
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-dark-500">Progresso</span>
            <span className="text-[10px] text-dark-300 font-mono font-bold">
              {sc.quitados}/{sc.entitiesWithMov} ({pctQuit}%)
            </span>
          </div>
          <div className="bg-dark-800 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${
                pctQuit === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-emerald-500 to-emerald-400'
              }`}
              style={{ width: `${pctQuit}%` }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, color, borderColor, sub }: {
  icon: string;
  label: string;
  value: string;
  color: string;
  borderColor: string;
  sub?: string;
}) {
  return (
    <div className={`bg-dark-800/50 border border-dark-700/50 border-t-2 ${borderColor} rounded-lg p-4`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">{icon} {label}</p>
      <p className={`font-mono text-lg font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-dark-500 mt-1">{sub}</p>}
    </div>
  );
}
