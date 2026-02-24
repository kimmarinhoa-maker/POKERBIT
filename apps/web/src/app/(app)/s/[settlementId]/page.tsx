'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSettlementFull, voidSettlement, formatDate, formatBRL, isAdmin, getOrgTree } from '@/lib/api';
import LockWeekModal from '@/components/settlement/LockWeekModal';
import WeekSelector from '@/components/WeekSelector';
import Spinner from '@/components/Spinner';
import ClubLogo from '@/components/ClubLogo';

export default function SettlementOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const settlementId = params.settlementId as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLockModal, setShowLockModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [weekNotFound, setWeekNotFound] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [logoMap, setLogoMap] = useState<Record<string, string | null>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, treeRes] = await Promise.all([getSettlementFull(settlementId), getOrgTree()]);
      if (treeRes.success && treeRes.data) {
        const map: Record<string, string | null> = {};
        for (const club of treeRes.data) {
          for (const sub of club.subclubes || []) {
            map[sub.name.toLowerCase()] = sub.metadata?.logo_url || null;
          }
        }
        setLogoMap(map);
      }
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Erro ao carregar settlement');
      }
    } catch {
      setError('Erro de conexao com o servidor');
    } finally {
      setLoading(false);
    }
  }, [settlementId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleFinalize() {
    setShowLockModal(true);
  }

  async function handleVoid() {
    if (voidReason.trim().length < 10) return;
    setVoidLoading(true);
    setVoidError(null);
    try {
      const res = await voidSettlement(settlementId, voidReason.trim());
      if (res.success) {
        setShowVoidModal(false);
        setVoidReason('');
        loadData();
      } else {
        setVoidError(res.error || 'Erro ao anular settlement');
      }
    } catch {
      setVoidError('Erro de conexao com o servidor');
    } finally {
      setVoidLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 min-h-[60vh]">
        <div className="text-center">
          <Spinner size="xl" className="mx-auto mb-4" />
          <p className="text-dark-400 text-sm">Carregando settlement...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <div className="card text-center py-16">
          <p className="text-red-400 mb-4">{error || 'Settlement nao encontrado'}</p>
          <button onClick={() => router.push('/dashboard')} className="btn-secondary text-sm">
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    );
  }

  const { settlement, fees, subclubs, dashboardTotals } = data;
  const t = dashboardTotals;

  const weekEnd = (() => {
    if (!settlement.week_start) return '';
    const d = new Date(settlement.week_start + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().split('T')[0];
  })();

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-dark-900/80 border-b border-dark-700 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-dark-400 hover:text-dark-200 text-sm flex items-center gap-1 transition-colors"
          >
            ← Voltar
          </button>
          <div className="h-4 w-px bg-dark-700" />
          <WeekSelector
            currentSettlementId={settlementId}
            weekStart={settlement.week_start}
            weekEnd={weekEnd}
            status={settlement.status}
            onNotFound={() => setWeekNotFound(true)}
          />
          <span className="text-dark-500 text-xs">v{settlement.version}</span>
        </div>

        <div className="flex items-center gap-3">
          {settlement.status === 'DRAFT' && isAdmin() && (
            <button onClick={handleFinalize} className="btn-primary text-sm flex items-center gap-2">
              Finalizar
            </button>
          )}
          {settlement.status === 'FINAL' && (
            <button
              onClick={() => { setShowVoidModal(true); setVoidReason(''); setVoidError(null); }}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Anular Semana
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-dark-950/30">
        {weekNotFound && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">📅</div>
            <h2 className="text-xl font-bold text-white mb-2">Nenhum fechamento encontrado</h2>
            <p className="text-dark-400 mb-6">Nao existe fechamento importado para o periodo selecionado.</p>
            <button
              onClick={() => router.push('/import')}
              className="btn-primary px-6 py-2"
            >
              Importar Semana
            </button>
          </div>
        )}
        {!weekNotFound && <>
        {/* Global KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <KpiCard label="Jogadores" value={String(t.players)} icon="👥" borderColor="bg-blue-500" />
          <KpiCard label="Agentes" value={String(t.agents)} icon="🏢" borderColor="bg-purple-500" />
          <KpiCard label="Rake Total" value={formatBRL(t.rake)} icon="🎰" borderColor="bg-poker-500" />
          <KpiCard label="GGR Total" value={formatBRL(t.ggr)} icon="🎯" borderColor="bg-purple-500" />
          <KpiCard
            label="Resultado Total"
            value={formatBRL(t.resultado)}
            icon="📈"
            borderColor={t.resultado >= 0 ? 'bg-amber-500' : 'bg-red-500'}
            textColor={t.resultado < 0 ? 'text-red-400' : 'text-amber-400'}
          />
        </div>

        {/* Subclub cards */}
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span>🏢</span> Subclubes
          <span className="text-sm font-normal text-dark-400">({subclubs.length})</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {subclubs.map((sc: any) => (
            <Link
              key={sc.id || sc.name}
              href={`/s/${settlementId}/club/${sc.name}`}
              className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden hover:border-poker-600/50 transition-all duration-200 cursor-pointer text-left group block"
            >
              <div className={`h-1 ${sc.acertoLiga >= 0 ? 'bg-poker-500' : 'bg-red-500'}`} />

              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <ClubLogo logoUrl={logoMap[sc.name.toLowerCase()]} name={sc.name} size="md" className="group-hover:ring-1 group-hover:ring-poker-500/30 transition-all" />
                    <div>
                      <h4 className="font-bold text-white group-hover:text-poker-400 transition-colors">
                        {sc.name}
                      </h4>
                      <p className="text-xs text-dark-400">
                        {sc.totals.players} jogadores · {sc.totals.agents} agentes
                      </p>
                    </div>
                  </div>
                  <span className="text-dark-500 group-hover:text-poker-400 transition-colors text-lg">
                    &rarr;
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-dark-700/50">
                  <div>
                    <p className="text-[10px] text-dark-500 uppercase tracking-wider">Rake</p>
                    <p className="text-sm font-mono text-dark-200 font-medium">{formatBRL(sc.totals.rake)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-dark-500 uppercase tracking-wider">Resultado</p>
                    <p className={`text-sm font-mono font-medium ${sc.totals.resultado < 0 ? 'text-red-400' : 'text-poker-400'}`}>
                      {formatBRL(sc.totals.resultado)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-dark-500 uppercase tracking-wider">Acerto</p>
                    <p className={`text-sm font-mono font-medium ${sc.acertoLiga < 0 ? 'text-red-400' : 'text-poker-400'}`}>
                      {formatBRL(sc.acertoLiga)}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
        </>}
      </div>

      {/* Lock Week Modal */}
      <LockWeekModal
        show={showLockModal}
        settlementId={settlementId}
        weekStart={settlement.week_start}
        notes={settlement.notes || ''}
        subclubs={subclubs}
        onClose={() => setShowLockModal(false)}
        onSuccess={() => { setShowLockModal(false); loadData(); }}
      />

      {/* Void Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Anular fechamento">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !voidLoading && setShowVoidModal(false)}
            aria-hidden="true"
          />
          <div className="relative bg-dark-900 border border-dark-700 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-bold text-white mb-2">Anular Fechamento</h3>
            <p className="text-sm text-dark-400 mb-4">
              Esta acao vai <span className="text-red-400 font-medium">anular permanentemente</span> este
              fechamento. O status mudara para VOID e os dados de carry-forward serao revertidos.
              Esta acao nao pode ser desfeita.
            </p>

            <label className="block text-xs font-medium text-dark-400 uppercase tracking-wider mb-1.5">
              Motivo da anulacao <span className="text-red-400">*</span>
            </label>
            <textarea
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
              placeholder="Descreva o motivo da anulacao (minimo 10 caracteres)..."
              aria-label="Motivo da anulacao"
              className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-dark-500 focus:border-red-500 focus:outline-none resize-y min-h-[80px]"
              rows={3}
              disabled={voidLoading}
            />
            <p className="text-xs text-dark-500 mt-1">
              {voidReason.trim().length}/10 caracteres minimos
            </p>

            {voidError && (
              <p className="text-sm text-red-400 mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {voidError}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 mt-5">
              <button
                onClick={() => setShowVoidModal(false)}
                disabled={voidLoading}
                className="px-4 py-2 text-sm text-dark-400 hover:text-dark-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleVoid}
                disabled={voidLoading || voidReason.trim().length < 10}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {voidLoading ? (
                  <>
                    <Spinner size="sm" variant="white" />
                    Anulando...
                  </>
                ) : (
                  'Confirmar Anulacao'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon, borderColor, textColor }: {
  label: string; value: string; icon: string; borderColor: string; textColor?: string;
}) {
  return (
    <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
      <div className={`h-1 ${borderColor}`} />
      <div className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-dark-800 flex items-center justify-center text-xl shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-dark-400 uppercase tracking-wider">{label}</p>
          <p className={`text-lg font-bold font-mono truncate ${textColor || 'text-white'}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}
