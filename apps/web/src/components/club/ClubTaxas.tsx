'use client';

import { useEffect, useState, useCallback } from 'react';
import { getFeeConfig, updateFeeConfig, deleteFee } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import TableSkeleton from '@/components/ui/TableSkeleton';

const STANDARD_FEES = [
  { name: 'taxaApp', label: 'Taxa Aplicativo', base: 'rake', description: '% do Rake' },
  { name: 'taxaLiga', label: 'Taxa Liga', base: 'rake', description: '% do Rake' },
  { name: 'taxaRodeoGGR', label: 'Taxa Rodeo GGR', base: 'ggr', description: '% do GGR' },
  { name: 'taxaRodeoApp', label: 'Taxa Rodeo App', base: 'ggr', description: '% do GGR' },
];

interface FeeRow {
  id?: string;
  name: string;
  rate: string;
  base: string;
  is_active: boolean;
}

interface Props {
  clubId: string;
}

export default function ClubTaxas({ clubId }: Props) {
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();
  const { confirm, ConfirmDialogElement } = useConfirmDialog();

  const loadFees = useCallback(async () => {
    setLoading(true);
    setDirty(false);
    try {
      const res = await getFeeConfig(clubId);
      if (res.success) {
        const existing = res.data || [];
        // Map standard fees, merging with DB data
        const rows: FeeRow[] = STANDARD_FEES.map((sf) => {
          const dbRow = existing.find((r: any) => r.name === sf.name);
          return {
            id: dbRow?.id,
            name: sf.name,
            rate: dbRow ? String(dbRow.rate) : '0',
            base: sf.base,
            is_active: dbRow ? dbRow.is_active !== false : true,
          };
        });
        setFees(rows);
      }
    } catch {
      toast('Erro ao carregar taxas', 'error');
    } finally {
      setLoading(false);
    }
  }, [clubId, toast]);

  useEffect(() => { loadFees(); }, [loadFees]);

  function handleRateChange(name: string, value: string) {
    setFees((prev) => prev.map((f) => f.name === name ? { ...f, rate: value } : f));
    setDirty(true);
  }

  function handleToggle(name: string) {
    setFees((prev) => prev.map((f) => f.name === name ? { ...f, is_active: !f.is_active } : f));
    setDirty(true);
  }

  async function handleDelete(fee: FeeRow) {
    const sf = STANDARD_FEES.find((s) => s.name === fee.name);
    const ok = await confirm({
      title: 'Excluir Taxa',
      message: `Excluir "${sf?.label || fee.name}"? A taxa sera removida e nao sera mais calculada nos fechamentos.`,
      variant: 'danger',
    });
    if (!ok) return;

    if (fee.id) {
      try {
        const res = await deleteFee(fee.id);
        if (res.success) {
          toast('Taxa excluida', 'success');
          loadFees();
        } else {
          toast(res.error || 'Erro ao excluir', 'error');
        }
      } catch {
        toast('Erro de conexao', 'error');
      }
    } else {
      // Not saved in DB yet, just remove from state
      setFees((prev) => prev.filter((f) => f.name !== fee.name));
      setDirty(true);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const feesPayload = fees.map((f) => ({
        name: f.name,
        rate: parseFloat(f.rate) || 0,
        base: f.base,
        is_active: f.is_active,
      }));
      const res = await updateFeeConfig(feesPayload, clubId);
      if (res.success) {
        setDirty(false);
        toast('Taxas salvas!', 'success');
        loadFees();
      } else {
        toast(res.error || 'Erro ao salvar', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-4 lg:p-6"><TableSkeleton columns={3} rows={4} /></div>;

  const activeFees = fees.filter((f) => f.is_active);
  const inactiveFees = fees.filter((f) => !f.is_active);

  return (
    <div className="p-4 lg:p-6 animate-tab-fade max-w-lg">
      <div className="mb-6">
        <h3 className="text-base font-bold text-white">Taxas</h3>
        <p className="text-dark-500 text-xs mt-0.5">Taxas aplicadas nos fechamentos deste clube</p>
      </div>

      <div className="card">
        <div className="space-y-3">
          {fees.map((fee) => {
            const sf = STANDARD_FEES.find((s) => s.name === fee.name);
            return (
              <div
                key={fee.name}
                className={`flex items-center gap-4 p-3 rounded-lg border transition-all ${
                  fee.is_active
                    ? 'border-dark-700/50 bg-dark-800/30'
                    : 'border-dark-800/30 bg-dark-900/30 opacity-50'
                }`}
              >
                {/* Toggle */}
                <button
                  onClick={() => handleToggle(fee.name)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
                    fee.is_active ? 'bg-poker-600' : 'bg-dark-600'
                  }`}
                  title={fee.is_active ? 'Desativar taxa' : 'Ativar taxa'}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                      fee.is_active ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${fee.is_active ? 'text-dark-200' : 'text-dark-500 line-through'}`}>
                    {sf?.label || fee.name}
                  </div>
                  <div className="text-[10px] text-dark-500 uppercase tracking-wider">{sf?.description}</div>
                </div>

                {/* Rate input */}
                <div className="flex items-center gap-2 w-28">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={fee.rate}
                    onChange={(e) => handleRateChange(fee.name, e.target.value)}
                    disabled={!fee.is_active}
                    className="input w-full text-sm font-mono text-right disabled:opacity-40 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-dark-500 text-sm font-bold">%</span>
                </div>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(fee)}
                  className="text-dark-600 hover:text-red-400 transition-colors shrink-0"
                  title="Excluir taxa"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            );
          })}

          {fees.length === 0 && (
            <p className="text-dark-500 text-sm text-center py-4">Nenhuma taxa configurada.</p>
          )}
        </div>

        {/* Summary */}
        {fees.length > 0 && (
          <div className="mt-4 pt-3 border-t border-dark-700/50">
            <div className="flex items-center gap-3 text-xs text-dark-500">
              <span className="text-green-400 font-medium">{activeFees.length} ativa{activeFees.length !== 1 ? 's' : ''}</span>
              {inactiveFees.length > 0 && (
                <span className="text-dark-600">{inactiveFees.length} desativada{inactiveFees.length !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end mt-4 pt-4 border-t border-dark-700/50">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="btn-primary text-sm px-6 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Salvando...' : 'Salvar Taxas'}
          </button>
        </div>
      </div>

      <div className="mt-4 text-xs text-dark-500 space-y-1">
        <p>Taxas <strong className="text-dark-400">ativas</strong> sao aplicadas automaticamente no calculo do acerto.</p>
        <p>Taxas <strong className="text-dark-400">desativadas</strong> nao sao calculadas (valor zerado).</p>
        <p>Taxas <strong className="text-dark-400">excluidas</strong> sao removidas permanentemente.</p>
      </div>

      {ConfirmDialogElement}
    </div>
  );
}
