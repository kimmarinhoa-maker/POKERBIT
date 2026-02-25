import { useState, useEffect } from 'react';
import { PreviewData } from '@/types/import';
import { formatBRL, formatDate } from '@/lib/api';
import Spinner from '@/components/Spinner';

interface ConfirmStepProps {
  preview: PreviewData;
  loading: boolean;
  error: string;
  onConfirm: () => void;
  onBack: () => void;
}

// Phase 4: Animated progress steps
const PROGRESS_STEPS = [
  'Validando dados...',
  'Criando jogadores...',
  'Calculando metricas...',
  'Criando settlement...',
];

export default function ConfirmStep({ preview, loading, error, onConfirm, onBack }: ConfirmStepProps) {
  const [progressIdx, setProgressIdx] = useState(0);

  // Phase 4: Fake progress bar during confirm
  useEffect(() => {
    if (!loading) {
      setProgressIdx(0);
      return;
    }
    const interval = setInterval(() => {
      setProgressIdx((prev) => Math.min(prev + 1, PROGRESS_STEPS.length - 1));
    }, 1200);
    return () => clearInterval(interval);
  }, [loading]);

  const progressPct = loading ? Math.min(((progressIdx + 1) / PROGRESS_STEPS.length) * 90, 90) : 0;

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Confirmar Importacao</h2>

      {preview.existing_settlement?.mode === 'merge' && (
        <div className="border-2 rounded-xl p-4 mb-4 bg-blue-900/15 border-blue-600/50">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{'\u2795'}</span>
            <p className="text-blue-300 text-sm">
              <span className="font-bold">Importacao adicional:</span> os dados desta planilha serao adicionados ao
              fechamento existente (v{preview.existing_settlement.version}) sem alterar dados de outros clubes.
            </p>
          </div>
        </div>
      )}

      <div className="card bg-green-900/10 border-green-700/30 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">{'\u2705'}</span>
          <div>
            <p className="text-green-400 font-semibold text-lg">Tudo pronto!</p>
            <p className="text-dark-400 text-sm">
              {preview.readiness.blockers_count} pendencias &middot; Pronto para importar
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-dark-500">Semana</p>
            <p className="text-white font-medium">
              {formatDate(preview.week.week_start)} {'\u2192'} {formatDate(preview.week.week_end)}
            </p>
          </div>
          <div>
            <p className="text-dark-500">Jogadores</p>
            <p className="text-white font-medium">{preview.summary.total_players}</p>
          </div>
          <div>
            <p className="text-dark-500">Agentes</p>
            <p className="text-white font-medium">{preview.summary.total_agents}</p>
          </div>
          <div>
            <p className="text-dark-500">Subclubes</p>
            <p className="text-white font-medium">{preview.summary.total_subclubs}</p>
          </div>
          <div>
            <p className="text-dark-500">Rake Total</p>
            <p className="text-blue-400 font-medium">{formatBRL(preview.summary.total_rake_brl)}</p>
          </div>
          <div>
            <p className="text-dark-500">GGR Total</p>
            <p className="text-purple-400 font-medium">{formatBRL(preview.summary.total_ggr_brl)}</p>
          </div>
        </div>
      </div>

      {/* Phase 4: Progress during import */}
      {loading && (
        <div className="card mb-4">
          <div className="flex items-center gap-3 mb-3">
            <Spinner size="sm" />
            <span className="text-dark-300 text-sm">{PROGRESS_STEPS[progressIdx]}</span>
          </div>
          <div className="bg-dark-800 rounded-full h-2">
            <div
              className="bg-poker-500 h-2 rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-dark-500">
            {PROGRESS_STEPS.map((label, i) => (
              <span key={i} className={i <= progressIdx ? 'text-poker-400' : ''}>
                {i < progressIdx ? '\u2713' : i === progressIdx ? '\u25CF' : '\u25CB'}
              </span>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-900/30 border border-red-700/50 rounded-lg p-4 text-red-300 text-sm">
          {'\u274C'} {error}
          <button onClick={onConfirm} className="ml-3 text-red-400 hover:text-red-300 underline text-xs">
            Tentar novamente
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={loading}
          className="px-4 py-2.5 text-dark-400 hover:text-white transition-colors disabled:opacity-50"
        >
          {'\u2190'} Voltar
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="btn-primary flex-1 py-3 text-lg"
          aria-label="Confirmar importacao"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner size="sm" variant="white" />
              Importando...
            </span>
          ) : (
            '\u{1F680} Confirmar Importacao'
          )}
        </button>
      </div>
    </div>
  );
}
