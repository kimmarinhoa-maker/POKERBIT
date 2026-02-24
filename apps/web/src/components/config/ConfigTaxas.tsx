'use client';

import { useEffect, useState } from 'react';
import {
  getFeeConfig,
  updateFeeConfig,
} from '@/lib/api';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/Spinner';

interface FeeConfig {
  id: string;
  name: string;
  rate: number;
  base: 'rake' | 'ggr';
  is_active: boolean;
}

const feesMeta: Record<string, { label: string; sublabel: string; base: 'rake' | 'ggr' | 'conversion' }> = {
  taxaApp:       { label: 'Taxa Aplicativo',  sublabel: 'Percentual cobrado pelo aplicativo',  base: 'rake' },
  taxaLiga:      { label: 'Taxa Liga',         sublabel: 'Percentual destinado a liga',          base: 'rake' },
  taxaRodeoGGR:  { label: 'Taxa Rodeo GGR',    sublabel: 'Percentual sobre GGR rodeo',           base: 'ggr'  },
  taxaRodeoApp:  { label: 'Taxa Rodeo App',     sublabel: 'Percentual app sobre GGR rodeo',       base: 'ggr'  },
  GU_TO_BRL:     { label: 'Conversao GU \u2192 BRL', sublabel: 'Multiplicador da unidade Grand Union para Real', base: 'conversion' },
};

const rakeKeys = ['taxaApp', 'taxaLiga'];
const ggrKeys = ['taxaRodeoGGR', 'taxaRodeoApp'];
const conversionKeys = ['GU_TO_BRL'];

export default function ConfigTaxas() {
  const [fees, setFees] = useState<FeeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFees();
  }, []);

  // ─── Fee Config Logic ────────────────────────────────────────────

  async function loadFees() {
    setLoading(true);
    try {
      const res = await getFeeConfig();
      if (res.success) {
        setFees(res.data || []);
      }
    } catch {
      toast('Erro ao carregar taxas', 'error');
    } finally {
      setLoading(false);
    }
  }

  function getRateByName(name: string): number {
    const fee = fees.find(f => f.name === name);
    return fee ? Number(fee.rate) : 0;
  }

  function handleStartEdit() {
    const formData: Record<string, string> = {};
    for (const key of [...rakeKeys, ...ggrKeys, ...conversionKeys]) {
      const val = getRateByName(key);
      formData[key] = key === 'GU_TO_BRL' ? String(val || 5) : String(val);
    }
    setForm(formData);
    setError(null);
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const feesPayload = [...rakeKeys, ...ggrKeys, ...conversionKeys].map(key => ({
        name: key,
        rate: parseFloat(form[key]) || 0,
        base: feesMeta[key].base,
      }));

      const res = await updateFeeConfig(feesPayload);
      if (res.success) {
        setFees(res.data || []);
        setEditing(false);
        toast('Taxas atualizadas com sucesso!', 'success');
      } else {
        setError(res.error || 'Erro ao salvar');
      }
    } catch (err: any) {
      setError(err.message || 'Erro de conexao');
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      {/* Edit button */}
      <div className="flex justify-end mb-4">
        {!editing && (
          <button onClick={handleStartEdit} className="btn-secondary text-sm px-4 py-2" aria-label="Editar taxas">
            Editar
          </button>
        )}
      </div>

      {/* Feedback */}
      {error && (
        <div className="mb-4 bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Fees card */}
      <div className="card">
        {/* Rake section */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-dark-700/60">
          <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
            Taxas sobre Rake
          </h3>
        </div>

        <div className="space-y-4 mb-6">
          {rakeKeys.map(key => (
            <FeeRow
              key={key}
              name={key}
              meta={feesMeta[key]}
              rate={getRateByName(key)}
              editing={editing}
              formValue={form[key] || ''}
              onChange={(val) => setForm(prev => ({ ...prev, [key]: val }))}
            />
          ))}
        </div>

        {/* GGR section */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-dark-700/60">
          <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
            Taxas sobre GGR
          </h3>
        </div>

        <div className="space-y-4 mb-6">
          {ggrKeys.map(key => (
            <FeeRow
              key={key}
              name={key}
              meta={feesMeta[key]}
              rate={getRateByName(key)}
              editing={editing}
              formValue={form[key] || ''}
              onChange={(val) => setForm(prev => ({ ...prev, [key]: val }))}
            />
          ))}
        </div>

        {/* Conversion section */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-dark-700/60">
          <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
            Conversao de Moeda
          </h3>
        </div>

        <div className="space-y-4">
          {conversionKeys.map(key => (
            <FeeRow
              key={key}
              name={key}
              meta={feesMeta[key]}
              rate={getRateByName(key) || 5}
              editing={editing}
              formValue={form[key] || '5'}
              onChange={(val) => setForm(prev => ({ ...prev, [key]: val }))}
              unit="x"
            />
          ))}
        </div>

        {/* Edit actions */}
        {editing && (
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-dark-700/50">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="px-4 py-2 text-dark-400 hover:text-white text-sm transition-colors"
              aria-label="Cancelar edicao"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary text-sm px-6 py-2"
              aria-label="Salvar taxas"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        )}
      </div>

      {/* Info card */}
      <div className="mt-6 card bg-dark-800/30 border-dark-700/40">
        <div className="text-sm text-dark-400 space-y-1">
          <p>
            Estas taxas sao aplicadas automaticamente no calculo do acerto de cada subclube.
          </p>
          <p>
            <strong className="text-dark-300">Rake:</strong> incide sobre o rake gerado pelos jogadores.
            <strong className="text-dark-300 ml-2">GGR:</strong> incide sobre o GGR Rodeo (receita bruta de jogos rodeo).
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function FeeRow({
  name,
  meta,
  rate,
  editing,
  formValue,
  onChange,
  unit = '%',
}: {
  name: string;
  meta: { label: string; sublabel: string; base: string };
  rate: number;
  editing: boolean;
  formValue: string;
  onChange: (val: string) => void;
  unit?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <span className={`text-sm ${editing ? 'text-dark-200 font-medium' : 'text-dark-300'}`}>
          {meta.label}
        </span>
        <p className="text-[11px] text-dark-500">{meta.sublabel}</p>
      </div>

      {editing ? (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            step={unit === 'x' ? '1' : '0.01'}
            min={unit === 'x' ? '1' : '0'}
            max={unit === 'x' ? '999' : '100'}
            value={formValue}
            onChange={(e) => onChange(e.target.value)}
            className="input w-24 text-right font-mono text-sm"
          />
          <span className="text-dark-500 text-sm">{unit}</span>
        </div>
      ) : (
        <span className="font-mono text-sm font-medium text-poker-400">
          {unit === 'x' ? `${Number(rate)}x` : `${Number(rate).toFixed(2).replace('.', ',')}%`}
        </span>
      )}
    </div>
  );
}
