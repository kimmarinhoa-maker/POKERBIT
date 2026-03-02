'use client';

import { useEffect, useState } from 'react';
import { getFeeConfig, updateFeeConfig, listOrganizations } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/Spinner';

interface FeeConfig {
  id: string;
  name: string;
  rate: number;
  base: 'rake' | 'ggr';
  is_active: boolean;
  club_id?: string;
}

interface ClubOrg {
  id: string;
  name: string;
  metadata?: { platform?: string; [key: string]: any };
}

const feesMeta: Record<string, { label: string; sublabel: string; base: 'rake' | 'ggr' | 'conversion' }> = {
  taxaApp: { label: 'Taxa Aplicativo', sublabel: 'Percentual cobrado pelo aplicativo', base: 'rake' },
  taxaLiga: { label: 'Taxa Liga', sublabel: 'Percentual destinado a liga', base: 'rake' },
  taxaRodeoGGR: { label: 'Taxa Rodeo GGR', sublabel: 'Percentual sobre GGR rodeo', base: 'ggr' },
  taxaRodeoApp: { label: 'Taxa Rodeo App', sublabel: 'Percentual app sobre GGR rodeo', base: 'ggr' },
  GU_TO_BRL: {
    label: 'Conversao GU \u2192 BRL',
    sublabel: 'Multiplicador da unidade Grand Union para Real',
    base: 'conversion',
  },
};

// Suprema: all fees + GU_TO_BRL conversion
const supremaRakeKeys = ['taxaApp', 'taxaLiga'];
const supremaGgrKeys = ['taxaRodeoGGR', 'taxaRodeoApp'];
const supremaConversionKeys = ['GU_TO_BRL'];

// PPPoker: only rake-based fees (no GGR, no GU conversion — values already in BRL)
const pppokerRakeKeys = ['taxaApp', 'taxaLiga'];

function getFeeKeysForPlatform(platform?: string) {
  const isSuprema = platform === 'suprema' || !platform;
  const rakeKeys = isSuprema ? supremaRakeKeys : pppokerRakeKeys;
  const ggrKeys = isSuprema ? supremaGgrKeys : [];
  const conversionKeys = isSuprema ? supremaConversionKeys : [];
  return { rakeKeys, ggrKeys, conversionKeys, allKeys: [...rakeKeys, ...ggrKeys, ...conversionKeys], isSuprema };
}

export default function ConfigTaxas() {
  const [fees, setFees] = useState<FeeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Club selector state
  const [clubs, setClubs] = useState<ClubOrg[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const [loadingClubs, setLoadingClubs] = useState(true);

  // Load clubs on mount
  useEffect(() => {
    loadClubs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load fees when selected club changes
  useEffect(() => {
    if (selectedClubId) {
      loadFees(selectedClubId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClubId]);

  async function loadClubs() {
    setLoadingClubs(true);
    try {
      const res = await listOrganizations('CLUB');
      if (res.success && res.data) {
        const clubList: ClubOrg[] = (res.data || []).map((o: any) => ({
          id: o.id,
          name: o.name,
          metadata: o.metadata || {},
        }));
        setClubs(clubList);
        // Auto-select first club
        if (clubList.length > 0) {
          setSelectedClubId(clubList[0].id);
        }
      }
    } catch {
      toast('Erro ao carregar clubes', 'error');
    } finally {
      setLoadingClubs(false);
    }
  }

  // ─── Fee Config Logic ────────────────────────────────────────────

  async function loadFees(clubId: string) {
    setLoading(true);
    setEditing(false);
    try {
      const res = await getFeeConfig(clubId);
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
    const fee = fees.find((f) => f.name === name);
    return fee ? Number(fee.rate) : 0;
  }

  const selectedClub = clubs.find((c) => c.id === selectedClubId);
  const platform = selectedClub?.metadata?.platform || 'suprema';
  const { rakeKeys, ggrKeys, conversionKeys, allKeys, isSuprema } = getFeeKeysForPlatform(platform);

  function handleStartEdit() {
    const formData: Record<string, string> = {};
    for (const key of allKeys) {
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
      const feesPayload = allKeys.map((key) => ({
        name: key,
        rate: parseFloat(form[key]) || 0,
        base: feesMeta[key].base,
      }));

      const res = await updateFeeConfig(feesPayload, selectedClubId);
      if (res.success) {
        setFees(res.data || []);
        setEditing(false);
        toast('Taxas atualizadas com sucesso!', 'success');
      } else {
        setError(res.error || 'Erro ao salvar');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro de conexao');
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────

  if (loadingClubs) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (clubs.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-dark-400 text-sm">Nenhum clube cadastrado. Crie um clube em Estrutura primeiro.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Club selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-dark-300 mb-2">Clube</label>
        <select
          value={selectedClubId}
          onChange={(e) => setSelectedClubId(e.target.value)}
          className="input w-full max-w-sm"
          aria-label="Selecionar clube"
        >
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.metadata?.platform ? ` (${c.metadata.platform})` : ''}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <>
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
            <div className="mb-4 bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm">{error}</div>
          )}

          {/* Fees card */}
          <div className="card">
            {/* Rake section */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-dark-700/60">
              <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">Taxas sobre Rake</h3>
            </div>

            <div className="space-y-4 mb-6">
              {rakeKeys.map((key) => (
                <FeeRow
                  key={key}
                  name={key}
                  meta={feesMeta[key]}
                  rate={getRateByName(key)}
                  editing={editing}
                  formValue={form[key] || ''}
                  onChange={(val) => setForm((prev) => ({ ...prev, [key]: val }))}
                />
              ))}
            </div>

            {/* GGR section — Suprema only */}
            {ggrKeys.length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-dark-700/60">
                  <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">Taxas sobre GGR</h3>
                </div>

                <div className="space-y-4 mb-6">
                  {ggrKeys.map((key) => (
                    <FeeRow
                      key={key}
                      name={key}
                      meta={feesMeta[key]}
                      rate={getRateByName(key)}
                      editing={editing}
                      formValue={form[key] || ''}
                      onChange={(val) => setForm((prev) => ({ ...prev, [key]: val }))}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Conversion section — Suprema only */}
            {conversionKeys.length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-dark-700/60">
                  <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">Conversao de Moeda</h3>
                </div>

                <div className="space-y-4">
                  {conversionKeys.map((key) => (
                    <FeeRow
                      key={key}
                      name={key}
                      meta={feesMeta[key]}
                      rate={getRateByName(key) || 5}
                      editing={editing}
                      formValue={form[key] || '5'}
                      onChange={(val) => setForm((prev) => ({ ...prev, [key]: val }))}
                      unit="x"
                    />
                  ))}
                </div>
              </>
            )}

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
              {isSuprema ? (
                <>
                  <p>Estas taxas sao aplicadas automaticamente no calculo do acerto de cada subclube.</p>
                  <p>
                    <strong className="text-dark-300">Rake:</strong> incide sobre o rake gerado pelos jogadores.
                    <strong className="text-dark-300 ml-2">GGR:</strong> incide sobre o GGR Rodeo (receita bruta de jogos
                    rodeo).
                  </p>
                </>
              ) : (
                <>
                  <p>Taxas aplicadas aos settlements deste clube. Valores ja em BRL (sem conversao GU).</p>
                  <p>
                    <strong className="text-dark-300">Rake:</strong> incide sobre o rake gerado pelos jogadores.
                    Este clube nao possui GGR Rodeo.
                  </p>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function FeeRow({
  name: _name,
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
        <span className={`text-sm ${editing ? 'text-dark-200 font-medium' : 'text-dark-300'}`}>{meta.label}</span>
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
