'use client';

import { useState, useMemo } from 'react';
import { saveClubAdjustments, formatBRL } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';

interface Props {
  subclub: {
    id: string;
    name: string;
    adjustments: { overlay: number; compras: number; security: number; outros: number; obs: string | null };
    totalLancamentos: number;
  };
  weekStart: string;
  settlementStatus: string;
  onDataChange: () => void;
}

const fields: { key: 'overlay' | 'compras' | 'security' | 'outros'; label: string; sublabel: string; icon: string }[] =
  [
    { key: 'overlay', label: 'Overlay', sublabel: 'Parte do clube', icon: 'target' },
    { key: 'compras', label: 'Compras', sublabel: 'Fichas / buy-ins', icon: 'money' },
    { key: 'security', label: 'Security', sublabel: 'Seguranca', icon: 'shield' },
    { key: 'outros', label: 'Outros', sublabel: 'Lancamentos avulsos', icon: 'note' },
  ];

export default function Ajustes({ subclub, weekStart, settlementStatus, onDataChange }: Props) {
  const isDraft = settlementStatus === 'DRAFT';
  const { canAccess } = useAuth();
  const canEdit = canAccess('OWNER', 'ADMIN', 'FINANCEIRO');

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    overlay: String(subclub.adjustments.overlay || 0),
    compras: String(subclub.adjustments.compras || 0),
    security: String(subclub.adjustments.security || 0),
    outros: String(subclub.adjustments.outros || 0),
    obs: subclub.adjustments.obs || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // KPIs
  const kpis = useMemo(() => {
    const adj = subclub.adjustments;
    const nonZero = fields.filter((f) => Math.abs(adj[f.key] || 0) > 0.01).length;
    const positive = fields.reduce((s, f) => s + Math.max(0, adj[f.key] || 0), 0);
    const negative = fields.reduce((s, f) => s + Math.min(0, adj[f.key] || 0), 0);
    return { nonZero, positive, negative, total: subclub.totalLancamentos };
  }, [subclub]);

  function handleStartEdit() {
    setForm({
      overlay: String(subclub.adjustments.overlay || 0),
      compras: String(subclub.adjustments.compras || 0),
      security: String(subclub.adjustments.security || 0),
      outros: String(subclub.adjustments.outros || 0),
      obs: subclub.adjustments.obs || '',
    });
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
      const res = await saveClubAdjustments({
        subclub_id: subclub.id,
        week_start: weekStart,
        overlay: parseFloat(form.overlay) || 0,
        compras: parseFloat(form.compras) || 0,
        security: parseFloat(form.security) || 0,
        outros: parseFloat(form.outros) || 0,
        obs: form.obs || undefined,
      });
      if (res.success) {
        setEditing(false);
        onDataChange();
      } else {
        setError(res.error || 'Erro ao salvar');
      }
    } catch (err: any) {
      setError(err.message || 'Erro de conexao');
    } finally {
      setSaving(false);
    }
  }

  // Live total while editing
  const editTotal = editing
    ? (parseFloat(form.overlay) || 0) +
      (parseFloat(form.compras) || 0) +
      (parseFloat(form.security) || 0) +
      (parseFloat(form.outros) || 0)
    : subclub.totalLancamentos;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Ajustes — {subclub.name}</h2>
          <p className="text-dark-400 text-sm">Lancamentos manuais do subclube</p>
        </div>

        {isDraft && !editing && canEdit && (
          <button onClick={handleStartEdit} className="btn-secondary text-sm px-4 py-2">
            Editar
          </button>
        )}
        {!isDraft && <span className="badge-final text-xs">FINALIZADO — somente leitura</span>}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-blue-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Lancamentos</p>
            <p className="text-xl font-bold mt-1 font-mono text-blue-400">{kpis.nonZero}</p>
            <p className="text-[10px] text-dark-500">de {fields.length} campos</p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-poker-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Positivos</p>
            <p className="text-xl font-bold mt-1 font-mono text-poker-400">{formatBRL(kpis.positive)}</p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-red-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Negativos</p>
            <p className="text-xl font-bold mt-1 font-mono text-red-400">{formatBRL(kpis.negative)}</p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden ring-1 ring-amber-700/30 shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className={`h-0.5 ${kpis.total >= 0 ? 'bg-amber-500' : 'bg-red-500'}`} />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Total</p>
            <p
              className={`text-xl font-bold mt-1 font-mono ${kpis.total > 0 ? 'text-amber-400' : kpis.total < 0 ? 'text-red-400' : 'text-dark-500'}`}
            >
              {formatBRL(kpis.total)}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm">{error}</div>
      )}

      <div className="card max-w-xl">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-dark-700/60">
          <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">Lancamentos</h3>
          {editing && <span className="text-[10px] text-poker-400 ml-auto font-semibold">EDITANDO</span>}
        </div>

        <div className="space-y-3">
          {fields.map(({ key, label, sublabel, icon }) => (
            <div
              key={key}
              className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${
                editing ? 'bg-dark-800/30' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div>
                  <span className={`text-sm ${editing ? 'text-dark-200 font-medium' : 'text-dark-300'}`}>{label}</span>
                  <span className="text-[11px] text-dark-500 ml-2">{sublabel}</span>
                </div>
              </div>

              {editing ? (
                <input
                  type="number"
                  step="0.01"
                  value={form[key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  aria-label={`Valor do ajuste ${label}`}
                  className="input w-40 text-right font-mono text-sm"
                />
              ) : (
                <ValueDisplay value={subclub.adjustments[key]} />
              )}
            </div>
          ))}

          {/* Total */}
          <div className="pt-3 mt-1 border-t-2 border-dark-600 flex items-center justify-between px-3">
            <span className="text-sm font-bold text-white uppercase tracking-wide">Total Lancamentos</span>
            <span
              className={`font-mono text-lg font-bold ${
                editTotal > 0.01 ? 'text-poker-400' : editTotal < -0.01 ? 'text-red-400' : 'text-dark-500'
              }`}
            >
              {formatBRL(editTotal)}
            </span>
          </div>
        </div>

        {/* Obs */}
        <div className="mt-4 pt-3 border-t border-dark-700/50">
          <p className="text-xs text-dark-500 mb-1.5">Observacoes</p>
          {editing ? (
            <textarea
              value={form.obs}
              onChange={(e) => setForm((prev) => ({ ...prev, obs: e.target.value }))}
              maxLength={500}
              rows={3}
              placeholder="Observacoes sobre os lancamentos..."
              aria-label="Observacoes dos ajustes"
              className="input w-full text-sm resize-none"
            />
          ) : (
            <p className="text-sm text-dark-400">{subclub.adjustments.obs || '—'}</p>
          )}
        </div>

        {/* Edit actions */}
        {editing && (
          <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-dark-700/50">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="px-4 py-2 text-dark-400 hover:text-white text-sm transition-colors border border-dark-600 rounded-lg hover:border-dark-400"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              aria-label="Salvar ajustes"
              className="btn-primary text-sm px-6 py-2"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ValueDisplay({ value }: { value: number }) {
  if (value === undefined || value === null || value === 0) {
    return <span className="text-dark-600 text-sm font-mono">R$ 0,00</span>;
  }
  return (
    <span className={`font-mono text-sm font-semibold ${value > 0 ? 'text-poker-400' : 'text-red-400'}`}>
      {formatBRL(value)}
    </span>
  );
}
