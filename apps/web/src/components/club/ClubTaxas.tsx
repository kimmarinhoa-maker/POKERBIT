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
  label: string;
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
  const [showAddMenu, setShowAddMenu] = useState(false);
  const { toast } = useToast();
  const { confirm, ConfirmDialogElement } = useConfirmDialog();

  const loadFees = useCallback(async () => {
    setLoading(true);
    setDirty(false);
    try {
      const res = await getFeeConfig(clubId);
      if (res.success) {
        const existing = res.data || [];
        // Only show fees that exist in DB
        const rows: FeeRow[] = existing.map((r: any) => {
          const sf = STANDARD_FEES.find((s) => s.name === r.name);
          return {
            id: r.id,
            name: r.name,
            label: sf?.label || r.name,
            rate: String(r.rate),
            base: r.base || sf?.base || 'rake',
            is_active: r.is_active !== false,
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

  // Standard fees not yet added
  const availableToAdd = STANDARD_FEES.filter(
    (sf) => !fees.some((f) => f.name === sf.name)
  );

  function handleAddFee(sf: typeof STANDARD_FEES[0]) {
    setFees((prev) => [...prev, {
      name: sf.name,
      label: sf.label,
      rate: '0',
      base: sf.base,
      is_active: true,
    }]);
    setShowAddMenu(false);
    setDirty(true);
  }

  function handleRateChange(name: string, value: string) {
    setFees((prev) => prev.map((f) => f.name === name ? { ...f, rate: value } : f));
    setDirty(true);
  }

  function handleLabelChange(name: string, value: string) {
    setFees((prev) => prev.map((f) => f.name === name ? { ...f, label: value } : f));
    setDirty(true);
  }

  function handleToggle(name: string) {
    setFees((prev) => prev.map((f) => f.name === name ? { ...f, is_active: !f.is_active } : f));
    setDirty(true);
  }

  async function handleDelete(fee: FeeRow) {
    const ok = await confirm({
      title: 'Excluir Taxa',
      message: `Excluir "${fee.label}"? Voce pode inclui-la novamente depois.`,
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

  if (loading) return <TableSkeleton columns={3} rows={4} />;

  const activeFees = fees.filter((f) => f.is_active);
  const inactiveFees = fees.filter((f) => !f.is_active);

  return (
    <div className="animate-tab-fade">
      {/* Header with Add button */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-dark-500 text-xs">Taxas aplicadas nos fechamentos deste clube</p>
        {availableToAdd.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="btn-primary text-xs px-3 py-1.5"
            >
              + Incluir Taxa
            </button>
            {showAddMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowAddMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-dark-800 border border-dark-700 rounded-lg shadow-xl py-1 min-w-[200px]">
                  {availableToAdd.map((sf) => (
                    <button
                      key={sf.name}
                      onClick={() => handleAddFee(sf)}
                      className="w-full text-left px-4 py-2.5 text-sm text-dark-200 hover:bg-dark-700/50 transition-colors"
                    >
                      <div className="font-medium">{sf.label}</div>
                      <div className="text-[10px] text-dark-500 uppercase">{sf.description}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="space-y-2">
          {fees.map((fee) => (
            <div
              key={fee.name}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
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
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${fee.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>

              {/* Label + base inline */}
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className={`text-sm font-medium ${fee.is_active ? 'text-dark-200' : 'text-dark-500 line-through'}`}>
                  {fee.label}
                </span>
                <span className="text-[10px] text-dark-600 uppercase">
                  {fee.base === 'ggr' ? 'GGR' : 'Rake'}
                </span>
              </div>

              {/* Rate input */}
              <div className="flex items-center gap-1.5 w-24">
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
                <span className="text-dark-500 text-xs font-bold">%</span>
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(fee)}
                className="text-dark-600 hover:text-red-400 transition-colors shrink-0"
                title="Excluir taxa"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}

          {fees.length === 0 && (
            <div className="text-center py-6">
              <p className="text-dark-500 text-sm mb-3">Nenhuma taxa configurada.</p>
              {availableToAdd.length > 0 && (
                <p className="text-dark-600 text-xs">Use o botao &quot;+ Incluir Taxa&quot; para adicionar.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer: summary + save */}
        {fees.length > 0 && (
          <div className="mt-3 pt-3 border-t border-dark-700/50 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-dark-500">
              <span className="text-green-400 font-medium">{activeFees.length} ativa{activeFees.length !== 1 ? 's' : ''}</span>
              {inactiveFees.length > 0 && (
                <span className="text-dark-600">{inactiveFees.length} desativada{inactiveFees.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="btn-primary text-xs px-5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Salvando...' : 'Salvar Taxas'}
            </button>
          </div>
        )}
      </div>

      {ConfirmDialogElement}
    </div>
  );
}
