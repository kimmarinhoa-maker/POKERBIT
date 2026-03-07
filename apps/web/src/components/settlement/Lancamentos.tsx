'use client';

import { useState, useMemo } from 'react';
import { saveClubAdjustments, formatBRL } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/Toast';
import { SubclubData } from '@/types/settlement';
import { Target, ShoppingCart, Shield, FileText, Pencil, Save, X, TrendingUp, TrendingDown, Equal, Split } from 'lucide-react';

interface Props {
  subclubs: SubclubData[];
  weekStart: string;
  settlementStatus: string;
  onDataChange: () => void;
}

// Overlay is handled separately (single value split across subclubes)
const TABLE_KEYS = ['compras', 'security', 'outros'] as const;
type TableKey = (typeof TABLE_KEYS)[number];
const ALL_KEYS = ['overlay', ...TABLE_KEYS] as const;

const FIELD_META = {
  overlay: { label: 'Overlay', icon: Target, color: 'text-blue-400', colorBg: 'bg-blue-500/8', colorBorder: 'border-blue-500/20' },
  compras: { label: 'Compras', icon: ShoppingCart, color: 'text-red-400', colorBg: 'bg-red-500/8', colorBorder: 'border-red-500/20' },
  security: { label: 'Security', icon: Shield, color: 'text-amber-400', colorBg: 'bg-amber-500/8', colorBorder: 'border-amber-500/20' },
  outros: { label: 'Outros', icon: FileText, color: 'text-purple-400', colorBg: 'bg-purple-500/8', colorBorder: 'border-purple-500/20' },
} as const;

type FormRow = Record<TableKey, string> & { obs: string };

export default function Lancamentos({ subclubs, weekStart, settlementStatus, onDataChange }: Props) {
  const isDraft = settlementStatus === 'DRAFT';
  const { canAccess } = useAuth();
  const { toast } = useToast();
  const canEdit = isDraft && canAccess('OWNER', 'ADMIN', 'FINANCEIRO');

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [forms, setForms] = useState<Record<string, FormRow>>({});
  const [overlayTotal, setOverlayTotal] = useState('0');

  const n = subclubs.length || 1;

  // Saved totals
  const totals = useMemo(() => {
    let overlay = 0, compras = 0, security = 0, outros = 0;
    for (const sc of subclubs) {
      overlay += sc.adjustments.overlay;
      compras += sc.adjustments.compras;
      security += sc.adjustments.security;
      outros += sc.adjustments.outros;
    }
    const grand = overlay + compras + security + outros;
    return { overlay, compras, security, outros, grand };
  }, [subclubs]);

  // ── Edit helpers ──

  function handleStartEdit() {
    const f: Record<string, FormRow> = {};
    for (const sc of subclubs) {
      f[sc.id] = {
        compras: String(Math.abs(sc.adjustments.compras) || 0),
        security: String(sc.adjustments.security || 0),
        outros: String(sc.adjustments.outros || 0),
        obs: sc.adjustments.obs || '',
      };
    }
    setForms(f);
    setOverlayTotal(String(totals.overlay || 0));
    setEditing(true);
  }

  function updateField(scId: string, key: TableKey | 'obs', value: string) {
    setForms((prev) => ({
      ...prev,
      [scId]: { ...prev[scId], [key]: value },
    }));
  }

  // Overlay split
  const overlayParsed = parseFloat(overlayTotal) || 0;
  const overlayPerClub = overlayParsed / n;

  // Check which subclubes have "outros" with value but no obs
  const obsErrors = editing ? subclubs.filter((sc) => {
    const f = forms[sc.id];
    if (!f) return false;
    const outrosVal = Math.abs(parseFloat(f.outros) || 0);
    return outrosVal > 0 && !f.obs.trim();
  }) : [];
  const hasObsError = obsErrors.length > 0;

  async function handleSave() {
    if (hasObsError) {
      toast(`Preencha a observacao de "Outros" para: ${obsErrors.map((sc) => sc.name).join(', ')}`, 'error');
      return;
    }
    setSaving(true);
    try {
      const perClubOverlay = overlayParsed / n;
      const promises = subclubs.map((sc) => {
        const f = forms[sc.id];
        if (!f) return Promise.resolve({ success: true });
        return saveClubAdjustments({
          subclub_id: sc.id,
          week_start: weekStart,
          overlay: Math.round(perClubOverlay * 100) / 100,
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

  // Live totals
  function getEditColTotal(key: TableKey): number {
    let total = 0;
    for (const sc of subclubs) {
      const f = forms[sc.id];
      const v = f ? (parseFloat(f[key]) || 0) : Math.abs(sc.adjustments[key]);
      total += key === 'compras' ? -v : v;
    }
    return total;
  }

  const editOverlay = editing ? overlayParsed : totals.overlay;
  const editCompras = editing ? getEditColTotal('compras') : totals.compras;
  const editSecurity = editing ? getEditColTotal('security') : totals.security;
  const editOutros = editing ? getEditColTotal('outros') : totals.outros;
  const editGrand = editOverlay + editCompras + editSecurity + editOutros;

  const pillData = [
    { key: 'overlay' as const, val: editOverlay },
    { key: 'compras' as const, val: editCompras },
    { key: 'security' as const, val: editSecurity },
    { key: 'outros' as const, val: editOutros },
  ];

  return (
    <div className="animate-tab-fade space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Lancamentos</h2>
          <p className="text-dark-500 text-xs mt-0.5">
            {n > 1 ? `${n} subclubes` : 'Clube'} · {weekStart}
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

      {/* ── Summary pills ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {pillData.map(({ key, val }) => {
          const meta = FIELD_META[key];
          const Icon = meta.icon;
          return (
            <div key={key} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${meta.colorBg} ${meta.colorBorder}`}>
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
          {editGrand > 0.01 ? <TrendingUp size={14} className="text-poker-400" /> :
           editGrand < -0.01 ? <TrendingDown size={14} className="text-red-400" /> :
           <Equal size={14} className="text-dark-500" />}
          <span className="text-[11px] text-dark-400 font-medium">Total</span>
          <span className={`text-sm font-mono font-bold ${editGrand > 0.01 ? 'text-poker-400' : editGrand < -0.01 ? 'text-red-400' : 'text-dark-500'}`}>
            {formatBRL(editGrand)}
          </span>
        </div>
      </div>

      {/* ── Overlay card (single value → split) ── */}
      <div className={`rounded-2xl border p-4 ${FIELD_META.overlay.colorBg} ${FIELD_META.overlay.colorBorder}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
              <Target size={18} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Overlay</p>
              <p className="text-[11px] text-dark-500">
                Valor total dividido igualmente entre {n} subclube{n > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {editing ? (
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  step="0.01"
                  value={overlayTotal}
                  onChange={(e) => setOverlayTotal(e.target.value)}
                  className="w-32 bg-dark-800 border border-blue-500/30 rounded-lg px-3 py-2 text-right font-mono text-sm text-white focus:border-blue-400 focus:outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="0.00"
                />
                {n > 1 && (
                  <div className="flex items-center gap-1.5 text-dark-500">
                    <Split size={12} />
                    <span className="text-[11px] font-mono">
                      {formatBRL(overlayPerClub)}/sub
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className={`text-lg font-mono font-bold ${totals.overlay > 0.01 ? 'text-blue-400' : totals.overlay < -0.01 ? 'text-red-400' : 'text-dark-600'}`}>
                  {formatBRL(totals.overlay)}
                </span>
                {n > 1 && totals.overlay !== 0 && (
                  <span className="text-[11px] text-dark-500 font-mono">
                    ({formatBRL(totals.overlay / n)}/sub)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Table (compras, security, outros per subclube) ── */}
      <div className="bg-dark-900/50 border border-dark-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-800">
              <th className="px-4 py-3 text-left text-[10px] text-dark-500 uppercase tracking-wider font-semibold">
                Subclube
              </th>
              {TABLE_KEYS.map((k) => {
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
                <div className="flex items-center justify-end gap-1.5">
                  <Target size={11} className="text-blue-400" />
                  Overlay
                </div>
              </th>
              <th className="px-4 py-3 text-right text-[10px] text-dark-500 uppercase tracking-wider font-semibold">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {subclubs.map((sc, idx) => {
              const f = forms[sc.id];
              const scOverlay = editing ? overlayPerClub : sc.adjustments.overlay;
              const scCompras = editing && f ? -(Math.abs(parseFloat(f.compras) || 0)) : sc.adjustments.compras;
              const scSecurity = editing && f ? (parseFloat(f.security) || 0) : sc.adjustments.security;
              const scOutros = editing && f ? (parseFloat(f.outros) || 0) : sc.adjustments.outros;
              const rowTotal = scOverlay + scCompras + scSecurity + scOutros;
              const isLast = idx === subclubs.length - 1;
              const rowOutrosHasValue = editing && f && Math.abs(parseFloat(f.outros) || 0) > 0;
              const rowObsMissing = rowOutrosHasValue && !f.obs.trim();

              return (
                <tr
                  key={sc.id}
                  className={`transition-colors hover:bg-dark-800/30 ${!isLast && !rowOutrosHasValue ? 'border-b border-dark-800/50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-dark-100 font-medium text-[13px]">{sc.name}</span>
                      {/* Obs inline when outros has value */}
                      {rowOutrosHasValue && editing && f && (
                        <div className="mt-2">
                          <input
                            type="text"
                            value={f.obs}
                            onChange={(e) => updateField(sc.id, 'obs', e.target.value)}
                            maxLength={200}
                            placeholder="Descreva o lancamento de Outros..."
                            className={`w-full bg-dark-800 border rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-dark-600 focus:outline-none transition-colors ${rowObsMissing ? 'border-red-500/40 focus:border-red-500' : 'border-dark-700 focus:border-poker-500'}`}
                          />
                          {rowObsMissing && (
                            <p className="text-[10px] text-red-400 mt-1">Observacao obrigatoria</p>
                          )}
                        </div>
                      )}
                      {/* Show saved obs when not editing */}
                      {!editing && sc.adjustments.obs && (
                        <p className="text-[11px] text-dark-500 mt-0.5">{sc.adjustments.obs}</p>
                      )}
                    </div>
                  </td>
                  {TABLE_KEYS.map((k) => (
                    <td key={k} className="px-4 py-3 text-right align-top">
                      {editing && f ? (
                        <div className="flex items-center justify-end gap-1">
                          {k === 'compras' && <span className="text-red-500/60 text-xs font-mono">-</span>}
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
                  {/* Overlay column (readonly — calculated) */}
                  <td className="px-4 py-3 text-right align-top">
                    <span className={`font-mono text-[13px] ${scOverlay > 0.01 ? 'text-blue-400' : scOverlay < -0.01 ? 'text-blue-400' : 'text-dark-700'}`}>
                      {Math.abs(scOverlay) < 0.01 ? '—' : formatBRL(scOverlay)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right align-top">
                    <span className={`font-mono font-semibold text-[13px] ${rowTotal > 0.01 ? 'text-poker-400' : rowTotal < -0.01 ? 'text-red-400' : 'text-dark-600'}`}>
                      {formatBRL(rowTotal)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {n > 1 && (
            <tfoot>
              <tr className="border-t border-dark-700 bg-dark-900/80">
                <td className="px-4 py-3">
                  <span className="text-[11px] text-dark-400 uppercase tracking-wider font-bold">Total</span>
                </td>
                {TABLE_KEYS.map((k) => {
                  const val = editing ? getEditColTotal(k) : totals[k as keyof typeof totals] as number;
                  return (
                    <td key={k} className="px-4 py-3 text-right">
                      <span className={`font-mono font-bold text-[13px] ${val > 0.01 ? 'text-poker-400' : val < -0.01 ? 'text-red-400' : 'text-dark-600'}`}>
                        {formatBRL(val)}
                      </span>
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right">
                  <span className={`font-mono font-bold text-[13px] ${editOverlay > 0.01 ? 'text-blue-400' : editOverlay < -0.01 ? 'text-blue-400' : 'text-dark-600'}`}>
                    {formatBRL(editOverlay)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`font-mono font-bold text-sm ${editGrand > 0.01 ? 'text-amber-400' : editGrand < -0.01 ? 'text-red-400' : 'text-dark-600'}`}>
                    {formatBRL(editGrand)}
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
            Overlay dividido automaticamente · Compras salvas como negativo
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
              disabled={saving || hasObsError}
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
