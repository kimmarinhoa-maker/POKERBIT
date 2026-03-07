'use client';

import { useState, useMemo } from 'react';
import { saveClubAdjustments, formatBRL } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/Toast';
import { SubclubData } from '@/types/settlement';
import { Target, ShoppingCart, Shield, FileText, Pencil, Save, X, TrendingUp, TrendingDown, Equal } from 'lucide-react';

interface Props {
  subclub: Pick<SubclubData, 'id' | 'name' | 'adjustments' | 'totalLancamentos'>;
  weekStart: string;
  settlementStatus: string;
  onDataChange: () => void;
}

const FIELD_KEYS = ['overlay', 'compras', 'security', 'outros'] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

const FIELD_META: Record<FieldKey, { label: string; desc: string; icon: typeof Target; color: string; colorBg: string; colorBorder: string; iconBg: string }> = {
  overlay: { label: 'Overlay', desc: 'Parte do clube', icon: Target, color: 'text-blue-400', colorBg: 'bg-blue-500/8', colorBorder: 'border-blue-500/20', iconBg: 'bg-blue-500/15 border-blue-500/20' },
  compras: { label: 'Compras', desc: 'Fichas / buy-ins', icon: ShoppingCart, color: 'text-red-400', colorBg: 'bg-red-500/8', colorBorder: 'border-red-500/20', iconBg: 'bg-red-500/15 border-red-500/20' },
  security: { label: 'Security', desc: 'Seguranca', icon: Shield, color: 'text-amber-400', colorBg: 'bg-amber-500/8', colorBorder: 'border-amber-500/20', iconBg: 'bg-amber-500/15 border-amber-500/20' },
  outros: { label: 'Outros', desc: 'Lancamentos avulsos', icon: FileText, color: 'text-purple-400', colorBg: 'bg-purple-500/8', colorBorder: 'border-purple-500/20', iconBg: 'bg-purple-500/15 border-purple-500/20' },
};

export default function Ajustes({ subclub, weekStart, settlementStatus, onDataChange }: Props) {
  const isDraft = settlementStatus === 'DRAFT';
  const { canAccess } = useAuth();
  const { toast } = useToast();
  const canEdit = isDraft && canAccess('OWNER', 'ADMIN', 'FINANCEIRO');

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<FieldKey, string> & { obs: string }>({
    overlay: '0', compras: '0', security: '0', outros: '0', obs: '',
  });

  // Totals for pills
  const savedTotals = useMemo(() => {
    const a = subclub.adjustments;
    return {
      overlay: a.overlay, compras: a.compras, security: a.security, outros: a.outros,
      grand: a.overlay + a.compras + a.security + a.outros,
    };
  }, [subclub]);

  function handleStartEdit() {
    setForm({
      overlay: String(subclub.adjustments.overlay || 0),
      compras: String(Math.abs(subclub.adjustments.compras) || 0),
      security: String(subclub.adjustments.security || 0),
      outros: String(subclub.adjustments.outros || 0),
      obs: subclub.adjustments.obs || '',
    });
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await saveClubAdjustments({
        subclub_id: subclub.id,
        week_start: weekStart,
        overlay: parseFloat(form.overlay) || 0,
        compras: -(Math.abs(parseFloat(form.compras) || 0)),
        security: parseFloat(form.security) || 0,
        outros: parseFloat(form.outros) || 0,
        obs: form.obs || undefined,
      });
      if (res.success) {
        toast('Lancamentos salvos', 'success');
        setEditing(false);
        onDataChange();
      } else {
        toast(res.error || 'Erro ao salvar', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  // Live values
  function editVal(key: FieldKey): number {
    const v = parseFloat(form[key]) || 0;
    return key === 'compras' ? -(Math.abs(v)) : v;
  }
  const editGrand = editing
    ? FIELD_KEYS.reduce((s, k) => s + editVal(k), 0)
    : savedTotals.grand;

  const pillData = FIELD_KEYS.map((k) => ({
    key: k,
    val: editing ? editVal(k) : savedTotals[k],
  }));

  return (
    <div className="animate-tab-fade space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Lancamentos</h2>
          <p className="text-dark-500 text-xs mt-0.5">{subclub.name} · {weekStart}</p>
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

      {/* ── Field cards ── */}
      <div className="space-y-3">
        {FIELD_KEYS.map((key) => {
          const meta = FIELD_META[key];
          const Icon = meta.icon;
          const savedVal = subclub.adjustments[key];

          return (
            <div
              key={key}
              className={`rounded-2xl border p-4 transition-all ${meta.colorBg} ${meta.colorBorder}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${meta.iconBg}`}>
                    <Icon size={18} className={meta.color} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{meta.label}</p>
                    <p className="text-[11px] text-dark-500">{meta.desc}</p>
                  </div>
                </div>

                {editing ? (
                  <div className="flex items-center gap-1">
                    {key === 'compras' && <span className="text-red-500/60 text-sm font-mono">-</span>}
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form[key]}
                      onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                      className={`w-32 bg-dark-800 border rounded-lg px-3 py-2 text-right font-mono text-sm text-white focus:outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${meta.colorBorder} focus:border-opacity-60`}
                    />
                  </div>
                ) : (
                  <span className={`text-lg font-mono font-bold ${savedVal > 0.01 ? meta.color : savedVal < -0.01 ? 'text-red-400' : 'text-dark-600'}`}>
                    {Math.abs(savedVal) < 0.01 ? '—' : formatBRL(savedVal)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Observacoes ── */}
      <div className="bg-dark-900/50 border border-dark-800 rounded-2xl p-4">
        <p className="text-[11px] text-dark-500 uppercase tracking-wider font-semibold mb-2">Observacoes</p>
        {editing ? (
          <textarea
            value={form.obs}
            onChange={(e) => setForm((prev) => ({ ...prev, obs: e.target.value }))}
            maxLength={500}
            rows={3}
            placeholder="Observacoes sobre os lancamentos..."
            className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 focus:border-poker-500 focus:outline-none resize-none"
          />
        ) : (
          <p className="text-sm text-dark-400">{subclub.adjustments.obs || '—'}</p>
        )}
      </div>

      {/* ── Actions ── */}
      {editing && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-dark-600">
            Compras salvas como valor negativo automaticamente
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
