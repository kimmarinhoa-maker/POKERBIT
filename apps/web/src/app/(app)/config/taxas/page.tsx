'use client';

import { useEffect, useState } from 'react';
import {
  getFeeConfig,
  updateFeeConfig,
  listOrganizations,
  getRakebackDefaults,
  updateRakebackDefaults,
  RBDefault,
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

interface Subclub {
  id: string;
  name: string;
}

const feesMeta: Record<string, { label: string; sublabel: string; base: 'rake' | 'ggr' }> = {
  taxaApp:       { label: 'Taxa Aplicativo',  sublabel: 'Percentual cobrado pelo aplicativo',  base: 'rake' },
  taxaLiga:      { label: 'Taxa Liga',         sublabel: 'Percentual destinado a liga',          base: 'rake' },
  taxaRodeoGGR:  { label: 'Taxa Rodeo GGR',    sublabel: 'Percentual sobre GGR rodeo',           base: 'ggr'  },
  taxaRodeoApp:  { label: 'Taxa Rodeo App',     sublabel: 'Percentual app sobre GGR rodeo',       base: 'ggr'  },
};

const rakeKeys = ['taxaApp', 'taxaLiga'];
const ggrKeys = ['taxaRodeoGGR', 'taxaRodeoApp'];

export default function TaxasPage() {
  const [fees, setFees] = useState<FeeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Rakeback Defaults state
  const [subclubs, setSubclubs] = useState<Subclub[]>([]);
  const [rbDefaults, setRbDefaults] = useState<RBDefault[]>([]);
  const [rbLoading, setRbLoading] = useState(true);
  const [rbForm, setRbForm] = useState<Record<string, { agent: string; player: string }>>({});
  const [rbSaving, setRbSaving] = useState(false);
  const [rbError, setRbError] = useState<string | null>(null);
  const [rbSuccess, setRbSuccess] = useState(false);

  useEffect(() => {
    loadFees();
    loadRakebackDefaults();
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
    for (const key of [...rakeKeys, ...ggrKeys]) {
      formData[key] = String(getRateByName(key));
    }
    setForm(formData);
    setError(null);
    setSuccess(false);
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const feesPayload = [...rakeKeys, ...ggrKeys].map(key => ({
        name: key,
        rate: parseFloat(form[key]) || 0,
        base: feesMeta[key].base,
      }));

      const res = await updateFeeConfig(feesPayload);
      if (res.success) {
        setFees(res.data || []);
        setEditing(false);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(res.error || 'Erro ao salvar');
      }
    } catch (err: any) {
      setError(err.message || 'Erro de conexao');
    } finally {
      setSaving(false);
    }
  }

  // ─── Rakeback Defaults Logic ─────────────────────────────────────

  async function loadRakebackDefaults() {
    setRbLoading(true);
    try {
      const [orgsRes, rbRes] = await Promise.all([
        listOrganizations('SUBCLUB'),
        getRakebackDefaults(),
      ]);

      const loadedSubclubs: Subclub[] = orgsRes.success ? (orgsRes.data || []) : [];
      const loadedDefaults: RBDefault[] = rbRes.success ? (rbRes.data || []) : [];

      setSubclubs(loadedSubclubs);
      setRbDefaults(loadedDefaults);

      // Build form from existing defaults + subclubs
      const formData: Record<string, { agent: string; player: string }> = {};
      for (const sc of loadedSubclubs) {
        const existing = loadedDefaults.find(d => d.subclub_id === sc.id);
        formData[sc.id] = {
          agent: existing ? String(existing.agent_rb_default) : '0',
          player: existing ? String(existing.player_rb_default) : '0',
        };
      }
      setRbForm(formData);
    } catch {
      toast('Erro ao carregar rakeback defaults', 'error');
    } finally {
      setRbLoading(false);
    }
  }

  function handleRbFormChange(subclubId: string, field: 'agent' | 'player', value: string) {
    setRbForm(prev => ({
      ...prev,
      [subclubId]: {
        ...prev[subclubId],
        [field]: value,
      },
    }));
  }

  async function handleRbSave() {
    setRbSaving(true);
    setRbError(null);
    setRbSuccess(false);
    try {
      const payload: RBDefault[] = subclubs.map(sc => ({
        subclub_id: sc.id,
        agent_rb_default: parseFloat(rbForm[sc.id]?.agent) || 0,
        player_rb_default: parseFloat(rbForm[sc.id]?.player) || 0,
      }));

      const res = await updateRakebackDefaults(payload);
      if (res.success) {
        setRbDefaults(res.data || []);
        setRbSuccess(true);
        setTimeout(() => setRbSuccess(false), 3000);
      } else {
        setRbError(res.error || 'Erro ao salvar rakeback defaults');
      }
    } catch (err: any) {
      setRbError(err.message || 'Erro de conexao');
    } finally {
      setRbSaving(false);
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
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-dark-800 flex items-center justify-center text-3xl">
            💲
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Taxas da Operacao</h2>
            <p className="text-dark-400 text-sm">
              Configuracao das taxas automaticas aplicadas no fechamento
            </p>
          </div>
        </div>

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
      {success && (
        <div className="mb-4 bg-green-900/30 border border-green-700/50 rounded-lg p-3 text-green-300 text-sm">
          Taxas atualizadas com sucesso!
        </div>
      )}

      {/* Fees card */}
      <div className="card">
        {/* Rake section */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-dark-700/60">
          <span className="text-base">🎰</span>
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
          <span className="text-base">🎯</span>
          <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
            Taxas sobre GGR
          </h3>
        </div>

        <div className="space-y-4">
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
        <div className="flex items-start gap-3">
          <span className="text-lg mt-0.5">ℹ️</span>
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

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  Rakeback Defaults Section                                     */}
      {/* ═══════════════════════════════════════════════════════════════ */}

      <div className="mt-10">
        {/* Section Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-xl bg-dark-800 flex items-center justify-center text-3xl">
            🔄
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Rakeback Padrao por Subclube</h2>
            <p className="text-dark-400 text-sm">
              Percentuais padrao de rakeback aplicados a novos agentes e jogadores
            </p>
          </div>
        </div>

        {/* RB Feedback */}
        {rbError && (
          <div className="mb-4 bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm">
            {rbError}
          </div>
        )}
        {rbSuccess && (
          <div className="mb-4 bg-green-900/30 border border-green-700/50 rounded-lg p-3 text-green-300 text-sm">
            Rakeback defaults atualizados com sucesso!
          </div>
        )}

        {/* RB Card */}
        <div className="card">
          {rbLoading ? (
            <div className="flex justify-center py-10">
              <Spinner size="md" />
            </div>
          ) : subclubs.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-dark-400 text-sm">
                Nenhum subclube encontrado. Crie subclubes em <strong className="text-dark-300">Clubes</strong> primeiro.
              </p>
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-700/60">
                      <th className="text-left py-3 px-2 text-dark-400 font-medium text-xs uppercase tracking-wider">
                        Subclube
                      </th>
                      <th className="text-right py-3 px-2 text-dark-400 font-medium text-xs uppercase tracking-wider">
                        RB Agente Padrao (%)
                      </th>
                      <th className="text-right py-3 px-2 text-dark-400 font-medium text-xs uppercase tracking-wider">
                        RB Jogador Padrao (%)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {subclubs.map(sc => (
                      <tr key={sc.id} className="border-b border-dark-700/30 hover:bg-dark-800/30 transition-colors">
                        <td className="py-3 px-2">
                          <span className="text-dark-200 font-medium">{sc.name}</span>
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={rbForm[sc.id]?.agent || '0'}
                              onChange={(e) => handleRbFormChange(sc.id, 'agent', e.target.value)}
                              className="input w-24 text-right font-mono text-sm"
                            />
                            <span className="text-dark-500 text-sm">%</span>
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={rbForm[sc.id]?.player || '0'}
                              onChange={(e) => handleRbFormChange(sc.id, 'player', e.target.value)}
                              className="input w-24 text-right font-mono text-sm"
                            />
                            <span className="text-dark-500 text-sm">%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Save button */}
              <div className="flex justify-end mt-6 pt-4 border-t border-dark-700/50">
                <button
                  onClick={handleRbSave}
                  disabled={rbSaving}
                  className="btn-primary text-sm px-6 py-2"
                  aria-label="Salvar rakeback defaults"
                >
                  {rbSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* RB Info card */}
        <div className="mt-6 card bg-dark-800/30 border-dark-700/40">
          <div className="flex items-start gap-3">
            <span className="text-lg mt-0.5">ℹ️</span>
            <div className="text-sm text-dark-400 space-y-1">
              <p>
                Estes valores sao usados como padrao ao cadastrar novos agentes ou jogadores em cada subclube.
              </p>
              <p>
                <strong className="text-dark-300">RB Agente:</strong> rakeback padrao para agentes.
                <strong className="text-dark-300 ml-2">RB Jogador:</strong> rakeback padrao para jogadores.
              </p>
            </div>
          </div>
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
}: {
  name: string;
  meta: { label: string; sublabel: string; base: string };
  rate: number;
  editing: boolean;
  formValue: string;
  onChange: (val: string) => void;
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
            step="0.01"
            min="0"
            max="100"
            value={formValue}
            onChange={(e) => onChange(e.target.value)}
            className="input w-24 text-right font-mono text-sm"
          />
          <span className="text-dark-500 text-sm">%</span>
        </div>
      ) : (
        <span className="font-mono text-sm font-medium text-poker-400">
          {Number(rate).toFixed(2).replace('.', ',')}%
        </span>
      )}
    </div>
  );
}
