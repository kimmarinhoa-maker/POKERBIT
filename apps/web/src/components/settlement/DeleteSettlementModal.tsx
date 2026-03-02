'use client';

import { useState } from 'react';
import { deleteSettlement } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/Spinner';

interface Props {
  show: boolean;
  settlementId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const CONFIRM_WORD = 'APAGAR';

export default function DeleteSettlementModal({ show, settlementId, onClose, onSuccess }: Props) {
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToast();

  if (!show) return null;

  const isConfirmed = confirmText.trim().toUpperCase() === CONFIRM_WORD;

  async function handleDelete() {
    if (!isConfirmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await deleteSettlement(settlementId);
      if (res.success) {
        addToast('Settlement apagado com sucesso', 'success');
        setConfirmText('');
        onSuccess();
      } else {
        setError(res.error || 'Erro ao apagar settlement');
      }
    } catch {
      setError('Erro de conexao com o servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Apagar settlement"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !loading && onClose()}
        aria-hidden="true"
      />
      <div className="relative bg-dark-900 border border-red-700/30 rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-scale-in">
        {/* Red accent bar */}
        <div className="h-1 bg-red-500 rounded-t-2xl" />

        <div className="p-6">
          <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
            <span className="text-red-400">&#9888;</span> Apagar Dados do Fechamento
          </h3>
          <p className="text-sm text-dark-300 mb-4">
            Esta acao vai <span className="text-red-400 font-bold">APAGAR PERMANENTEMENTE</span> todos os dados deste settlement (metrics, ledger, carry-forward e import).
          </p>

          <div className="bg-red-900/15 border border-red-700/30 rounded-xl p-4 mb-4">
            <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">O que sera removido:</p>
            <ul className="text-xs text-dark-300 space-y-1.5 list-disc list-inside">
              <li>Todos os dados de jogadores e agentes desta semana</li>
              <li>Movimentacoes do ledger vinculadas</li>
              <li>Carry-forward gerado por este settlement</li>
              <li>Arquivo de import original</li>
            </ul>
          </div>

          {/* Typing confirmation */}
          <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-2">
            Digite <span className="text-red-400 font-mono">{CONFIRM_WORD}</span> para confirmar:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_WORD}
            className={`input w-full text-sm font-mono tracking-widest text-center ${
              confirmText.length > 0 && !isConfirmed
                ? 'border-red-500/50 focus:ring-red-500/40'
                : ''
            } ${isConfirmed ? 'border-red-500/50 focus:ring-red-500/40' : ''}`}
            autoFocus
            disabled={loading}
          />

          {error && (
            <p className="text-sm text-red-400 mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 mt-5 pt-4 border-t border-dark-700/50">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-dark-400 hover:text-dark-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={loading || !isConfirmed}
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Spinner size="sm" variant="white" />
                  Apagando...
                </>
              ) : (
                'Apagar Dados'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
