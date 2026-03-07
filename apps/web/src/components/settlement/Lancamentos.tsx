'use client';

import { useState, useMemo } from 'react';
import { saveClubAdjustments, formatBRL } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/Toast';
import KpiCard from '@/components/ui/KpiCard';
import { SubclubData } from '@/types/settlement';

interface Props {
  subclubs: SubclubData[];
  weekStart: string;
  settlementStatus: string;
  onDataChange: () => void;
}

const FIELD_KEYS = ['overlay', 'compras', 'security', 'outros'] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

const FIELD_META: Record<FieldKey, { label: string; sublabel: string }> = {
  overlay: { label: 'Overlay', sublabel: 'Parte do clube' },
  compras: { label: 'Compras', sublabel: 'Fichas / buy-ins' },
  security: { label: 'Security', sublabel: 'Seguranca' },
  outros: { label: 'Outros', sublabel: 'Lancamentos avulsos' },
};

type FormRow = Record<FieldKey, string> & { obs: string };

export default function Lancamentos({ subclubs, weekStart, settlementStatus, onDataChange }: Props) {
  const isDraft = settlementStatus === 'DRAFT';
  const { canAccess } = useAuth();
  const { toast } = useToast();
  const canEdit = isDraft && canAccess('OWNER', 'ADMIN', 'FINANCEIRO');

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state: one row per subclub
  const [forms, setForms] = useState<Record<string, FormRow>>({});

  // KPIs
  const kpis = useMemo(() => {
    let totalOverlay = 0, totalCompras = 0, totalSecurity = 0, totalOutros = 0;
    for (const sc of subclubs) {
      totalOverlay += sc.adjustments.overlay;
      totalCompras += sc.adjustments.compras;
      totalSecurity += sc.adjustments.security;
      totalOutros += sc.adjustments.outros;
    }
    const total = totalOverlay + totalCompras + totalSecurity + totalOutros;
    const positive = Math.max(0, totalOverlay) + Math.max(0, totalCompras) + Math.max(0, totalSecurity) + Math.max(0, totalOutros);
    const negative = Math.min(0, totalOverlay) + Math.min(0, totalCompras) + Math.min(0, totalSecurity) + Math.min(0, totalOutros);
    return { total, positive, negative };
  }, [subclubs]);

  function handleStartEdit() {
    const f: Record<string, FormRow> = {};
    for (const sc of subclubs) {
      f[sc.id] = {
        overlay: String(sc.adjustments.overlay || 0),
        compras: String(sc.adjustments.compras || 0),
        security: String(sc.adjustments.security || 0),
        outros: String(sc.adjustments.outros || 0),
        obs: sc.adjustments.obs || '',
      };
    }
    setForms(f);
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
  }

  function updateField(scId: string, key: FieldKey | 'obs', value: string) {
    setForms((prev) => ({
      ...prev,
      [scId]: { ...prev[scId], [key]: value },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const promises = subclubs.map((sc) => {
        const f = forms[sc.id];
        if (!f) return Promise.resolve({ success: true });
        return saveClubAdjustments({
          subclub_id: sc.id,
          week_start: weekStart,
          overlay: parseFloat(f.overlay) || 0,
          compras: parseFloat(f.compras) || 0,
          security: parseFloat(f.security) || 0,
          outros: parseFloat(f.outros) || 0,
          obs: f.obs || undefined,
        });
      });
      const results = await Promise.all(promises);
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        toast('Erro ao salvar alguns lancamentos', 'error');
      } else {
        toast('Lancamentos salvos', 'success');
        setEditing(false);
        onDataChange();
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  // Live totals while editing
  function getEditTotal(key: FieldKey): number {
    let total = 0;
    for (const sc of subclubs) {
      const f = forms[sc.id];
      total += f ? (parseFloat(f[key]) || 0) : sc.adjustments[key];
    }
    return total;
  }

  const editGrandTotal = editing
    ? FIELD_KEYS.reduce((s, k) => s + getEditTotal(k), 0)
    : kpis.total;

  return (
    <div className="p-4 lg:p-6 animate-tab-fade">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Lancamentos</h2>
          <p className="text-dark-400 text-sm">
            {subclubs.length > 1
              ? `Distribuicao para ${subclubs.length} subclubes`
              : 'Lancamentos do clube'}
          </p>
        </div>
        {canEdit && !editing && (
          <button onClick={handleStartEdit} className="btn-secondary text-sm px-4 py-2">
            Editar
          </button>
        )}
        {!isDraft && <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">FINALIZADO</span>}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <KpiCard label="Positivos" value={formatBRL(kpis.positive)} accentColor="bg-poker-500" valueColor="text-poker-400" />
        <KpiCard label="Negativos" value={formatBRL(kpis.negative)} accentColor="bg-red-500" valueColor="text-red-400" />
        <KpiCard
          label="Total Lancamentos"
          value={formatBRL(editing ? editGrandTotal : kpis.total)}
          accentColor={kpis.total >= 0 ? 'bg-amber-500' : 'bg-red-500'}
          valueColor={editGrandTotal > 0.01 ? 'text-amber-400' : editGrandTotal < -0.01 ? 'text-red-400' : 'text-dark-500'}
          ring="ring-1 ring-amber-700/30"
        />
      </div>

      {editing && (
        <div className="mb-4 flex items-center gap-2 text-poker-400 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-poker-400 animate-pulse" />
          EDITANDO
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm data-table">
          <thead>
            <tr className="bg-dark-800/50 text-dark-400 text-left text-xs uppercase tracking-wider">
              <th className="p-3">Subclube</th>
              {FIELD_KEYS.map((k) => (
                <th key={k} className="p-3 text-right">{FIELD_META[k].label}</th>
              ))}
              <th className="p-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-700/50">
            {subclubs.map((sc) => {
              const f = forms[sc.id];
              const rowTotal = editing && f
                ? FIELD_KEYS.reduce((s, k) => s + (parseFloat(f[k]) || 0), 0)
                : sc.totalLancamentos;

              return (
                <tr key={sc.id}>
                  <td className="p-3 text-dark-200 font-medium">{sc.name}</td>
                  {FIELD_KEYS.map((k) => (
                    <td key={k} className="p-3 text-right">
                      {editing && f ? (
                        <input
                          type="number"
                          step="0.01"
                          value={f[k]}
                          onChange={(e) => updateField(sc.id, k, e.target.value)}
                          className="input w-28 text-right font-mono text-sm ml-auto [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      ) : (
                        <ValDisplay value={sc.adjustments[k]} />
                      )}
                    </td>
                  ))}
                  <td className="p-3 text-right">
                    <span className={`font-mono font-bold ${rowTotal > 0.01 ? 'text-poker-400' : rowTotal < -0.01 ? 'text-red-400' : 'text-dark-500'}`}>
                      {formatBRL(rowTotal)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {subclubs.length > 1 && (
            <tfoot className="bg-dark-800/30 sticky bottom-0">
              <tr className="font-bold text-white">
                <td className="p-3 uppercase text-xs tracking-wider">Total Geral</td>
                {FIELD_KEYS.map((k) => {
                  const colTotal = editing ? getEditTotal(k) : subclubs.reduce((s, sc) => s + sc.adjustments[k], 0);
                  return (
                    <td key={k} className="p-3 text-right">
                      <span className={`font-mono ${colTotal > 0.01 ? 'text-poker-400' : colTotal < -0.01 ? 'text-red-400' : 'text-dark-500'}`}>
                        {formatBRL(colTotal)}
                      </span>
                    </td>
                  );
                })}
                <td className="p-3 text-right">
                  <span className={`font-mono text-base ${editGrandTotal > 0.01 ? 'text-amber-400' : editGrandTotal < -0.01 ? 'text-red-400' : 'text-dark-500'}`}>
                    {formatBRL(editGrandTotal)}
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Save/Cancel buttons */}
      {editing && (
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={handleCancel} disabled={saving} className="px-4 py-2 text-dark-400 hover:text-white text-sm transition-colors border border-dark-600 rounded-lg hover:border-dark-400">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-6 py-2">
            {saving ? 'Salvando...' : 'Salvar Lancamentos'}
          </button>
        </div>
      )}
    </div>
  );
}

function ValDisplay({ value }: { value: number }) {
  if (!value || Math.abs(value) < 0.01) return <span className="text-dark-600 font-mono">—</span>;
  return (
    <span className={`font-mono font-semibold ${value > 0 ? 'text-poker-400' : 'text-red-400'}`}>
      {formatBRL(value)}
    </span>
  );
}
