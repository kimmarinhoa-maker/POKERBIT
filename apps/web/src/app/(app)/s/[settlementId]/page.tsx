'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePageTitle } from '@/lib/usePageTitle';
import Link from 'next/link';
import { getSettlementFull, voidSettlement, formatBRL, getOrgTree } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import LockWeekModal from '@/components/settlement/LockWeekModal';
import KpiCard from '@/components/ui/KpiCard';
import WeekSelector from '@/components/WeekSelector';
import Spinner from '@/components/Spinner';
import ClubLogo from '@/components/ClubLogo';

export default function SettlementOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const { canAccess } = useAuth();
  const settlementId = params.settlementId as string;

  const [data, setData] = useState<any>(null);
  usePageTitle(data?.settlement?.week_start ? `Fechamento ${data.settlement.week_start}` : 'Fechamento');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLockModal, setShowLockModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [weekNotFound, setWeekNotFound] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidConfirmText, setVoidConfirmText] = useState('');
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const VOID_CONFIRM_WORD = 'ANULAR';
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
    if (voidReason.trim().length < 10 || voidConfirmText.trim().toUpperCase() !== VOID_CONFIRM_WORD) return;
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

  const { settlement, subclubs, dashboardTotals } = data;
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
          {settlement.status === 'DRAFT' && canAccess('OWNER', 'ADMIN') && (
            <button onClick={handleFinalize} className="btn-primary text-sm flex items-center gap-2">
              Finalizar
            </button>
          )}
          {settlement.status === 'FINAL' && canAccess('OWNER', 'ADMIN') && (
            <button
              onClick={() => {
                setShowVoidModal(true);
                setVoidReason('');
                setVoidConfirmText('');
                setVoidError(null);
              }}
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
            <h2 className="text-xl font-bold text-white mb-2">Nenhum fechamento encontrado</h2>
            <p className="text-dark-400 mb-6">Nao existe fechamento importado para o periodo selecionado.</p>
            <button onClick={() => router.push('/import')} className="btn-primary px-6 py-2">
              Importar Semana
            </button>
          </div>
        )}
        {!weekNotFound && (
          <>
            {/* Global KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <KpiCard label="Jogadores" value={String(t.players)} accentColor="bg-blue-500" tooltip="Total de jogadores na semana" />
              <KpiCard label="Agentes" value={String(t.agents)} accentColor="bg-purple-500" tooltip="Total de agentes ativos" />
              <KpiCard label="Rake Total" value={formatBRL(t.rake)} accentColor="bg-poker-500" tooltip={`Soma do rake de todos subclubes = ${formatBRL(t.rake)}`} />
              <KpiCard label="GGR Total" value={formatBRL(t.ggr)} accentColor="bg-purple-500" tooltip={`Soma do GGR de todos subclubes = ${formatBRL(t.ggr)}`} />
              <KpiCard
                label="Resultado Total"
                value={formatBRL(t.resultado)}
                accentColor={t.resultado >= 0 ? 'bg-amber-500' : 'bg-red-500'}
                valueColor={t.resultado < 0 ? 'text-red-400' : 'text-amber-400'}
                tooltip={`resultado = ganhos + rake + ggr (consolidado) = ${formatBRL(t.resultado)}`}
              />
            </div>

            {/* Subclub cards */}
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              Subclubes
              <span className="text-sm font-normal text-dark-400">({subclubs.length})</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {subclubs.map((sc: any) => (
                <Link
                  key={sc.id || sc.name}
                  href={`/s/${settlementId}/club/${sc.name}`}
                  className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden hover:border-poker-600/50 shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 cursor-pointer text-left group block"
                >
                  <div className={`h-0.5 ${sc.acertoLiga >= 0 ? 'bg-poker-500' : 'bg-red-500'}`} />

                  <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <ClubLogo
                          logoUrl={logoMap[sc.name.toLowerCase()]}
                          name={sc.name}
                          size="md"
                          className="group-hover:ring-1 group-hover:ring-poker-500/30 transition-all"
                        />
                        <div>
                          <h4 className="font-bold text-white group-hover:text-poker-400 transition-colors">
                            {sc.name}
                          </h4>
                          <p className="text-xs text-dark-400">
                            {sc.totals.players} jogadores · {sc.totals.agents} agentes
                          </p>
                        </div>
                      </div>
                      <span className="text-dark-500 group-hover:text-poker-400 transition-colors text-lg">&rarr;</span>
                    </div>

                    <div className="grid grid-cols-3 gap-3 pt-3 border-t border-dark-700/50">
                      <div>
                        <p className="text-[10px] text-dark-500 uppercase tracking-wider">Rake</p>
                        <p className="text-sm font-mono text-dark-200 font-medium">{formatBRL(sc.totals.rake)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-dark-500 uppercase tracking-wider">Resultado</p>
                        <p
                          className={`text-sm font-mono font-medium ${sc.totals.resultado < 0 ? 'text-red-400' : 'text-poker-400'}`}
                        >
                          {formatBRL(sc.totals.resultado)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-dark-500 uppercase tracking-wider">Acerto</p>
                        <p
                          className={`text-sm font-mono font-medium ${sc.acertoLiga < 0 ? 'text-red-400' : 'text-poker-400'}`}
                        >
                          {formatBRL(sc.acertoLiga)}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Lock Week Modal */}
      <LockWeekModal
        show={showLockModal}
        settlementId={settlementId}
        weekStart={settlement.week_start}
        notes={settlement.notes || ''}
        subclubs={subclubs}
        onClose={() => setShowLockModal(false)}
        onSuccess={() => {
          setShowLockModal(false);
          loadData();
        }}
      />

      {/* Void Modal — Enhanced with carry-forward warning + typing confirmation */}
      {showVoidModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Anular fechamento"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !voidLoading && setShowVoidModal(false)}
            aria-hidden="true"
          />
          <div className="relative bg-dark-900 border border-red-700/30 rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-scale-in">
            {/* Red accent bar */}
            <div className="h-1 bg-red-500 rounded-t-2xl" />

            <div className="p-6">
              <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <span className="text-red-400">&#9888;</span> Anular Fechamento
              </h3>
              <p className="text-sm text-dark-300 mb-4">
                Esta acao e <span className="text-red-400 font-bold">IRREVERSIVEL</span> e ficara registrada no log de auditoria.
              </p>

              {/* Carry-forward warning */}
              <div className="bg-red-900/15 border border-red-700/30 rounded-xl p-4 mb-4">
                <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Atencao: Carry-Forward</p>
                <ul className="text-xs text-dark-300 space-y-1.5 list-disc list-inside">
                  <li>O carry-forward gerado por este settlement <span className="text-red-400 font-medium">NAO sera revertido automaticamente</span></li>
                  <li>Se a semana seguinte ja foi finalizada, os saldos transportados ficam incorretos</li>
                  <li>Recomendacao: anule as semanas na ordem reversa (mais recente primeiro)</li>
                </ul>
              </div>

              {/* Reason */}
              <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                Motivo da anulacao <span className="text-red-400">*</span>
              </label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Descreva o motivo da anulacao (minimo 10 caracteres)..."
                aria-label="Motivo da anulacao"
                className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-dark-500 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-y min-h-[70px] transition-all"
                rows={2}
                disabled={voidLoading}
              />
              <p className="text-xs text-dark-500 mt-1 mb-4">{voidReason.trim().length}/10 caracteres minimos</p>

              {/* Typing confirmation */}
              {voidReason.trim().length >= 10 && (
                <div className="animate-fade-in">
                  <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-2">
                    Digite <span className="text-red-400 font-mono">{VOID_CONFIRM_WORD}</span> para confirmar:
                  </label>
                  <input
                    type="text"
                    value={voidConfirmText}
                    onChange={(e) => setVoidConfirmText(e.target.value)}
                    placeholder={VOID_CONFIRM_WORD}
                    className={`input w-full text-sm font-mono tracking-widest text-center ${
                      voidConfirmText.length > 0 && voidConfirmText.trim().toUpperCase() !== VOID_CONFIRM_WORD
                        ? 'border-red-500/50 focus:ring-red-500/40'
                        : ''
                    } ${voidConfirmText.trim().toUpperCase() === VOID_CONFIRM_WORD ? 'border-red-500/50 focus:ring-red-500/40' : ''}`}
                    autoFocus
                    disabled={voidLoading}
                  />
                </div>
              )}

              {voidError && (
                <p className="text-sm text-red-400 mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {voidError}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 mt-5 pt-4 border-t border-dark-700/50">
                <button
                  onClick={() => setShowVoidModal(false)}
                  disabled={voidLoading}
                  className="px-4 py-2 text-sm text-dark-400 hover:text-dark-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleVoid}
                  disabled={voidLoading || voidReason.trim().length < 10 || voidConfirmText.trim().toUpperCase() !== VOID_CONFIRM_WORD}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  {voidLoading ? (
                    <>
                      <Spinner size="sm" variant="white" />
                      Anulando...
                    </>
                  ) : (
                    'Anular Fechamento'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

