'use client';

import { useState, useMemo } from 'react';
import { saveClubAdjustments, formatBRL } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/Toast';
import { SubclubData } from '@/types/settlement';
import { Target, ShoppingCart, Shield, FileText, Pencil, Save, X, TrendingUp, TrendingDown, Equal } from 'lucide-react';

interface Props {
  subclubs: SubclubData[];
  weekStart: string;
  settlementStatus: string;
  onDataChange: () => void;
}

const FIELD_KEYS = ['overlay', 'compras', 'security', 'outros'] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

const FIELD_META: Record<FieldKey, { label: string; desc: string; icon: typeof Target; color: string; colorBg: string; colorBorder: string }> = {
  overlay: { label: 'Overlay', desc: 'Dividido entre subclubes', icon: Target, color: 'text-blue-400', colorBg: 'bg-blue-500/8', colorBorder: 'border-blue-500/20' },
  compras: { label: 'Compras', desc: 'Fichas / buy-ins', icon: ShoppingCart, color: 'text-red-400', colorBg: 'bg-red-500/8', colorBorder: 'border-red-500/20' },
  security: { label: 'Security', desc: 'Seguranca', icon: Shield, color: 'text-amber-400', colorBg: 'bg-amber-500/8', colorBorder: 'border-amber-500/20' },
  outros: { label: 'Outros', desc: 'Lancamentos avulsos', icon: FileText, color: 'text-purple-400', colorBg: 'bg-purple-500/8', colorBorder: 'border-purple-500/20' },
};

type FormRow = Record<FieldKey, string> & { obs: string };

export default function Lancamentos({ subclubs, weekStart, settlementStatus, onDataChange }: Props) {
  const isDraft = settlementStatus === 'DRAFT';
  const { canAccess } = useAuth();
  const { toast } = useToast();
  const canEdit = isDraft && canAccess('OWNER', 'ADMIN', 'FINANCEIRO');

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [forms, setForms] = useState<Record<string, FormRow>>({});

  // Totals
  const totals = useMemo(() => {
    const t: Record<FieldKey, number> = { overlay: 0, compras: 0, security: 0, outros: 0 };
    for (const sc of subclubs) {
      for (const k of FIELD_KEYS) t[k] += sc.adjustments[k];
    }
    const grand = FIELD_KEYS.reduce((s, k) => s + t[k], 0);
    return { ...t, grand };
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
          compras: -(Math.abs(parseFloat(f.compras) || 0)),
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

  // Live edit totals
  function getEditTotal(key: FieldKey): number {
    let total = 0;
    for (const sc of subclubs) {
      const f = forms[sc.id];
      if (f) {
        const v = parseFloat(f[key]) || 0;
        total += key === 'compras' ? -(Math.abs(v)) : v;
      } else {
        total += sc.adjustments[key];
      }
    }
    return total;
  }

  const editGrandTotal = editing
    ? FIELD_KEYS.reduce((s, k) => s + getEditTotal(k), 0)
    : totals.grand;

  // For display: get column total
  function colTotal(key: FieldKey): number {
    return editing ? getEditTotal(key) : totals[key];
  }

  return (
    <div className="animate-tab-fade space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Lancamentos</h2>
          <p className="text-dark-500 text-xs mt-0.5">
            {subclubs.length > 1 ? `${subclubs.length} subclubes` : 'Clube'}
            {' · '}
            {weekStart}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isDraft && (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              FINALIZADO
            </span>
          )}
          {editing && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-poker-500/10 text-poker-400 border border-poker-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-poker-400 animate-pulse" />
              EDITANDO
            </span>
          )}
          {canEdit && !editing && (
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-dark-800 border border-dark-700 text-dark-200 hover:text-white hover:border-dark-500 transition-all"
            >
              <Pencil size={12} />
              Editar
            </button>
          )}
        </div>
      </div>

      {/* ── Summary pills (compact) ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {FIELD_KEYS.map((k) => {
          const meta = FIELD_META[k];
          const Icon = meta.icon;
          const val = editing ? getEditTotal(k) : totals[k];
          return (
            <div
              key={k}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${meta.colorBg} ${meta.colorBorder} transition-all`}
            >
              <Icon size={14} className={meta.color} />
              <span className="text-[11px] text-dark-400 font-medium">{meta.label}</span>
              <span className={`text-sm font-mono font-semibold ${val > 0.01 ? 'text-poker-400' : val < -0.01 ? 'text-red-400' : 'text-dark-500'}`}>
                {formatBRL(val)}
              </span>
            </div>
          );
        })}
        <div className="w-px h-6 bg-dark-700 mx-1" />
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-dark-800/80 border border-dark-700">
          {editGrandTotal > 0.01 ? <TrendingUp size={14} className="text-poker-400" /> :
           editGrandTotal < -0.01 ? <TrendingDown size={14} className="text-red-400" /> :
           <Equal size={14} className="text-dark-500" />}
          <span className="text-[11px] text-dark-400 font-medium">Total</span>
          <span className={`text-sm font-mono font-bold ${editGrandTotal > 0.01 ? 'text-poker-400' : editGrandTotal < -0.01 ? 'text-red-400' : 'text-dark-500'}`}>
            {formatBRL(editGrandTotal)}
          </span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-dark-900/50 border border-dark-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-800">
              <th className="px-4 py-3 text-left text-[10px] text-dark-500 uppercase tracking-wider font-semibold">
                Subclube
              </th>
              {FIELD_KEYS.map((k) => {
                const meta = FIELD_META[k];
                const Icon = meta.icon;
                return (
                  <th key={k} className="px-4 py-3 text-right text-[10px] text-dark-500 uppercase tracking-wider font-semibold">
                    <div className="flex items-center justify-end gap-1.5">
                      <Icon size={11} className={meta.color} />
                      {meta.label}
                    </div>
                  </th>
                );
              })}
              <th className="px-4 py-3 text-right text-[10px] text-dark-500 uppercase tracking-wider font-semibold">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {subclubs.map((sc, idx) => {
              const f = forms[sc.id];
              const rowTotal = editing && f
                ? FIELD_KEYS.reduce((s, k) => {
                    const v = parseFloat(f[k]) || 0;
                    return s + (k === 'compras' ? -(Math.abs(v)) : v);
                  }, 0)
                : sc.totalLancamentos;
              const isLast = idx === subclubs.length - 1;

              return (
                <tr
                  key={sc.id}
                  className={`transition-colors hover:bg-dark-800/30 ${!isLast ? 'border-b border-dark-800/50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <span className="text-dark-100 font-medium text-[13px]">{sc.name}</span>
                  </td>
                  {FIELD_KEYS.map((k) => (
                    <td key={k} className="px-4 py-3 text-right">
                      {editing && f ? (
                        <div className="flex items-center justify-end gap-1">
                          {k === 'compras' && <span className="text-dark-600 text-xs">-</span>}
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={f[k]}
                            onChange={(e) => updateField(sc.id, k, e.target.value)}
                            className="w-24 bg-dark-800 border border-dark-700 rounded-lg px-2.5 py-1.5 text-right font-mono text-[13px] text-white focus:border-poker-500 focus:outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                      ) : (
                        <ValDisplay value={sc.adjustments[k]} />
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono font-semibold text-[13px] ${rowTotal > 0.01 ? 'text-poker-400' : rowTotal < -0.01 ? 'text-red-400' : 'text-dark-600'}`}>
                      {formatBRL(rowTotal)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {subclubs.length > 1 && (
            <tfoot>
              <tr className="border-t border-dark-700 bg-dark-900/80">
                <td className="px-4 py-3">
                  <span className="text-[11px] text-dark-400 uppercase tracking-wider font-bold">Total</span>
                </td>
                {FIELD_KEYS.map((k) => {
                  const val = colTotal(k);
                  return (
                    <td key={k} className="px-4 py-3 text-right">
                      <span className={`font-mono font-bold text-[13px] ${val > 0.01 ? 'text-poker-400' : val < -0.01 ? 'text-red-400' : 'text-dark-600'}`}>
                        {formatBRL(val)}
                      </span>
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right">
                  <span className={`font-mono font-bold text-sm ${editGrandTotal > 0.01 ? 'text-amber-400' : editGrandTotal < -0.01 ? 'text-red-400' : 'text-dark-600'}`}>
                    {formatBRL(editGrandTotal)}
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Actions ── */}
      {editing && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-dark-600">
            Compras sao salvas como valor negativo automaticamente
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-dark-400 hover:text-white border border-dark-700 hover:border-dark-500 transition-all"
            >
              <X size={14} />
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium bg-poker-600 text-white hover:bg-poker-500 transition-all disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ValDisplay({ value }: { value: number }) {
  if (!value || Math.abs(value) < 0.01) return <span className="text-dark-700 font-mono text-[13px]">—</span>;
  return (
    <span className={`font-mono font-medium text-[13px] ${value > 0 ? 'text-poker-400' : 'text-red-400'}`}>
      {formatBRL(value)}
    </span>
  );
}
