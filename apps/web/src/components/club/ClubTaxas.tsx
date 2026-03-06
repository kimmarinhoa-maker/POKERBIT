'use client';

import { useEffect, useState, useCallback } from 'react';
import { getFeeConfig, updateFeeConfig } from '@/lib/api';
import { useToast } from '@/components/Toast';
import TableSkeleton from '@/components/ui/TableSkeleton';

const STANDARD_FEES = [
  { name: 'taxaApp', label: 'Taxa Aplicativo', base: 'rake', description: '% do Rake' },
  { name: 'taxaLiga', label: 'Taxa Liga', base: 'rake', description: '% do Rake' },
  { name: 'taxaRodeoGGR', label: 'Taxa Rodeo GGR', base: 'ggr', description: '% do GGR' },
  { name: 'taxaRodeoApp', label: 'Taxa Rodeo App', base: 'ggr', description: '% do GGR' },
];

interface Props {
  clubId: string;
}

export default function ClubTaxas({ clubId }: Props) {
  const [rates, setRates] = useState<Record<string, string>>({
    taxaApp: '0', taxaLiga: '0', taxaRodeoGGR: '0', taxaRodeoApp: '0',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  const loadFees = useCallback(async () => {
    setLoading(true);
    setDirty(false);
    try {
      const res = await getFeeConfig(clubId);
      if (res.success) {
        const newRates: Record<string, string> = { taxaApp: '0', taxaLiga: '0', taxaRodeoGGR: '0', taxaRodeoApp: '0' };
        for (const row of res.data || []) {
          if (row.name in newRates) newRates[row.name] = String(row.rate);
        }
        setRates(newRates);
      }
    } catch {
      toast('Erro ao carregar taxas', 'error');
    } finally {
      setLoading(false);
    }
  }, [clubId, toast]);

  useEffect(() => { loadFees(); }, [loadFees]);

  async function handleSave() {
    setSaving(true);
    try {
      const feesPayload = STANDARD_FEES.map((f) => ({ name: f.name, rate: parseFloat(rates[f.name]) || 0, base: f.base }));
      const res = await updateFeeConfig(feesPayload, clubId);
      if (res.success) {
        setDirty(false);
        toast('Taxas salvas!', 'success');
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

  return (
    <div className="p-4 lg:p-6 animate-tab-fade max-w-lg">
      <div className="mb-6">
        <h3 className="text-base font-bold text-white">Taxas</h3>
        <p className="text-dark-500 text-xs mt-0.5">Taxas aplicadas nos fechamentos deste clube</p>
      </div>

      <div className="card">
        <div className="space-y-4">
          {STANDARD_FEES.map((fee) => (
            <div key={fee.name} className="flex items-center gap-4">
              <div className="flex-1">
                <div className="text-sm font-medium text-dark-200">{fee.label}</div>
                <div className="text-[10px] text-dark-500 uppercase tracking-wider">{fee.description}</div>
              </div>
              <div className="flex items-center gap-2 w-32">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={rates[fee.name]}
                  onChange={(e) => { setRates((p) => ({ ...p, [fee.name]: e.target.value })); setDirty(true); }}
                  className="input w-full text-sm font-mono text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-dark-500 text-sm font-bold">%</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-6 pt-4 border-t border-dark-700/50">
          <button onClick={handleSave} disabled={saving || !dirty} className="btn-primary text-sm px-6 py-2 disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Salvando...' : 'Salvar Taxas'}
          </button>
        </div>
      </div>
    </div>
  );
}
