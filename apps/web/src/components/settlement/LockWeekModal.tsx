'use client';

import { useState } from 'react';
import { finalizeSettlement, updateSettlementNotes, closeWeek } from '@/lib/api';
import { SubclubData } from '@/types/settlement';

// ═══════════════════════════════════════════════════════════════════
//  Lock Week Modal — Checklist pre-finalizacao (reusable)
// ═══════════════════════════════════════════════════════════════════

interface CheckItem {
  key: string;
  label: string;
  description: string;
}

const CHECKLIST: CheckItem[] = [
  { key: 'import', label: 'Importacao conferida', description: 'Dados importados estao corretos e sem erros' },
  { key: 'rakeback', label: 'Rakeback definido', description: 'Taxas RB dos agentes/jogadores estao configuradas' },
  { key: 'ledger', label: 'Movimentacoes registradas', description: 'Todos pagamentos IN/OUT foram lancados' },
  { key: 'reconciled', label: 'Conciliacao revisada', description: 'Movimentacoes foram conferidas/conciliadas' },
  { key: 'confirm', label: 'Confirmo a finalizacao', description: 'Entendo que apos finalizar nao poderei editar' },
];

interface LockWeekModalProps {
  show: boolean;
  onClose: () => void;
  settlementId: string;
  weekStart: string;
  notes?: string;
  subclubs?: SubclubData[];
  onSuccess: () => void;
}

export default function LockWeekModal({
  show,
  onClose,
  settlementId,
  weekStart,
  notes: initialNotes = '',
  subclubs = [],
  onSuccess,
}: LockWeekModalProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState(initialNotes);
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<'checklist' | 'confirm' | 'processing' | 'done'>('checklist');
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [results, setResults] = useState<{ finalized: boolean; carryCount: number }>({
    finalized: false,
    carryCount: 0,
  });

  const CONFIRM_WORD = 'FINALIZAR';
  const allChecked = CHECKLIST.every((c) => checked.has(c.key));
  const confirmMatch = confirmText.trim().toUpperCase() === CONFIRM_WORD;
  const totalAgents = subclubs.reduce((s: number, sc: SubclubData) => s + (sc.agents?.length || 0), 0);

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleLock() {
    setStep('processing');
    setError(null);
    setProcessing(true);

    try {
      // 1. Save notes
      if (notes !== initialNotes) {
        await updateSettlementNotes(settlementId, notes || null);
      }

      // 2. Compute carry-forward
      const carryRes = await closeWeek(settlementId);
      const carryCount = carryRes.success ? carryRes.data?.count || 0 : 0;

      // 3. Finalize settlement (DRAFT -> FINAL)
      const finalRes = await finalizeSettlement(settlementId);
      if (!finalRes.success) {
        throw new Error(finalRes.error || 'Erro ao finalizar');
      }

      setResults({ finalized: true, carryCount });
      setStep('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro durante finalizacao');
      setStep('checklist');
    } finally {
      setProcessing(false);
    }
  }

  const fmtDate = (dt: string) => new Date(dt + 'T00:00:00').toLocaleDateString('pt-BR');

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="bg-dark-900 border border-dark-700 rounded-2xl shadow-modal animate-scale-in w-full max-w-lg mx-4"
        role="dialog"
        aria-modal="true"
        aria-label="Finalizar semana"
      >
        {/* Accent bar */}
        <div className="h-1 rounded-t-2xl bg-amber-500" />
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700">
          <div>
            <h3 className="text-lg font-bold text-white">Finalizar Semana</h3>
            <p className="text-dark-400 text-xs mt-0.5">
              Semana {fmtDate(weekStart)}
              {subclubs.length > 0 && (
                <>
                  {' '}
                  — {totalAgents} agentes em {subclubs.length} subclube(s)
                </>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-dark-500 hover:text-dark-300 text-lg"
            disabled={processing}
            aria-label="Cancelar finalizacao"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {step === 'checklist' && (
            <>
              {/* Checklist */}
              <p className="text-xs text-dark-400 mb-3 uppercase tracking-wider font-bold">Checklist de verificacao</p>
              <div className="space-y-2 mb-5">
                {CHECKLIST.map((item) => (
                  <label
                    key={item.key}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors border ${
                      checked.has(item.key)
                        ? 'bg-poker-600/10 border-poker-600/20'
                        : 'bg-dark-800/30 border-dark-700/30 hover:bg-dark-800/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked.has(item.key)}
                      onChange={() => toggle(item.key)}
                      className="accent-poker-500 mt-0.5 flex-shrink-0"
                    />
                    <div>
                      <span className={`text-sm font-medium ${checked.has(item.key) ? 'text-white' : 'text-dark-300'}`}>
                        {item.label}
                      </span>
                      <p className="text-xs text-dark-500 mt-0.5">{item.description}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* Notes */}
              <div className="mb-4">
                <label className="text-xs text-dark-400 uppercase tracking-wider font-bold mb-1.5 block">
                  Observacoes (opcional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas sobre este fechamento..."
                  rows={2}
                  className="input w-full text-sm resize-none"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm">
                  {error}
                </div>
              )}

              {/* Info */}
              <div className="bg-yellow-900/10 border border-yellow-700/20 rounded-lg p-3 mb-4">
                <p className="text-xs text-yellow-400/80">
                  Ao finalizar, o status mudara de RASCUNHO para FINAL. O carry-forward (saldo anterior) sera calculado
                  e gravado automaticamente para a proxima semana.
                </p>
              </div>
            </>
          )}

          {step === 'confirm' && (
            <>
              <div className="bg-red-900/10 border border-red-700/20 rounded-lg p-4 mb-4">
                <p className="text-sm font-semibold text-red-300 mb-2">Esta acao e IRREVERSIVEL</p>
                <ul className="text-xs text-dark-300 space-y-1.5 list-disc list-inside">
                  <li>Carry-forward sera gerado para a proxima semana</li>
                  <li>Rates de rakeback serao travados nos valores atuais</li>
                  <li>O settlement ficara somente leitura</li>
                  <li>Edicoes nao serao mais possiveis</li>
                </ul>
              </div>

              <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-2">
                Digite <span className="text-red-400 font-mono">{CONFIRM_WORD}</span> para confirmar:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_WORD}
                className={`input w-full text-sm font-mono tracking-widest text-center ${
                  confirmText.length > 0 && !confirmMatch ? 'border-red-500/50 focus:ring-red-500/40' : ''
                } ${confirmMatch ? 'border-poker-500/50 focus:ring-poker-500/40' : ''}`}
                autoFocus
              />
              {confirmText.length > 0 && !confirmMatch && (
                <p className="text-xs text-red-400 mt-1.5">Digite exatamente &quot;{CONFIRM_WORD}&quot;</p>
              )}
              {confirmMatch && (
                <p className="text-xs text-poker-400 mt-1.5 flex items-center gap-1">Confirmacao aceita</p>
              )}

              {error && (
                <div className="mt-4 bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm">
                  {error}
                </div>
              )}
            </>
          )}

          {step === 'processing' && (
            <div className="py-8 text-center">
              <div className="mx-auto mb-4 w-10 h-10 border-4 border-poker-500/30 border-t-poker-500 rounded-full animate-spin" />
              <p className="text-dark-300 text-sm">Finalizando semana...</p>
              <p className="text-dark-500 text-xs mt-1">Calculando carry-forward e bloqueando edicoes</p>
            </div>
          )}

          {step === 'done' && (
            <div className="py-8 text-center">
              <h4 className="text-lg font-bold text-white mb-2">Semana Finalizada!</h4>
              <div className="space-y-1 text-sm text-dark-300">
                <p>
                  Status alterado para <span className="text-emerald-400 font-bold">FINAL</span>
                </p>
                {results.carryCount > 0 && (
                  <p>
                    Carry-forward calculado para <span className="text-poker-400 font-bold">{results.carryCount}</span>{' '}
                    agentes
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-dark-700">
          {step === 'checklist' && (
            <>
              <button
                onClick={onClose}
                className="text-dark-400 hover:text-white text-sm transition-colors"
                aria-label="Cancelar finalizacao"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setConfirmText(''); setStep('confirm'); }}
                disabled={!allChecked}
                aria-label="Prosseguir para confirmacao"
                className={`text-sm px-5 py-2 rounded-lg font-semibold transition-colors ${
                  allChecked
                    ? 'bg-poker-600 hover:bg-poker-500 text-white'
                    : 'bg-dark-700 text-dark-500 cursor-not-allowed'
                }`}
              >
                Prosseguir
              </button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <button
                onClick={() => setStep('checklist')}
                className="text-dark-400 hover:text-white text-sm transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={handleLock}
                disabled={!confirmMatch}
                aria-label="Confirmar finalizacao"
                className={`text-sm px-5 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                  confirmMatch
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-dark-700 text-dark-500 cursor-not-allowed'
                }`}
              >
                Finalizar Semana
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={onSuccess} className="btn-primary text-sm px-5 py-2">
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
