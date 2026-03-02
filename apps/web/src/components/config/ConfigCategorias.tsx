'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  listTransactionCategories,
  createTransactionCategory,
  updateTransactionCategory,
  deleteTransactionCategory,
} from '@/lib/api';
import type { TransactionCategory } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import Spinner from '@/components/Spinner';

// ─── Form State ─────────────────────────────────────────────────────

interface CategoryForm {
  name: string;
  direction: 'in' | 'out';
  dre_type: string;
  dre_group: string;
  color: string;
  auto_match: string;
}

const emptyForm: CategoryForm = {
  name: '',
  direction: 'out',
  dre_type: '',
  dre_group: '',
  color: '#6B7280',
  auto_match: '',
};

// ─── Component ──────────────────────────────────────────────────────

export default function ConfigCategorias() {
  const [categories, setCategories] = useState<TransactionCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { confirm, ConfirmDialogElement } = useConfirmDialog();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTransactionCategories();
      if (res.success) setCategories(res.data || []);
      else toast(res.error || 'Erro ao carregar categorias', 'error');
    } catch {
      toast('Erro ao carregar categorias', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const inCategories = categories.filter((c) => c.direction === 'in');
  const outCategories = categories.filter((c) => c.direction === 'out');

  function openCreate(dir: 'in' | 'out') {
    setEditingId(null);
    setForm({ ...emptyForm, direction: dir });
    setShowForm(true);
  }

  function openEdit(cat: TransactionCategory) {
    setEditingId(cat.id);
    setForm({
      name: cat.name,
      direction: cat.direction,
      dre_type: cat.dre_type || '',
      dre_group: cat.dre_group || '',
      color: cat.color || '#6B7280',
      auto_match: cat.auto_match || '',
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast('Nome e obrigatorio', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        direction: form.direction,
        dre_type: (form.dre_type || null) as 'revenue' | 'expense' | null,
        dre_group: form.dre_group || null,
        color: form.color || '#6B7280',
        auto_match: form.auto_match || null,
      };

      let res;
      if (editingId) {
        res = await updateTransactionCategory(editingId, payload);
      } else {
        res = await createTransactionCategory(payload);
      }

      if (res.success) {
        toast(editingId ? 'Categoria atualizada' : 'Categoria criada', 'success');
        cancelForm();
        load();
      } else {
        toast(res.error || 'Erro ao salvar', 'error');
      }
    } catch {
      toast('Erro ao salvar categoria', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(cat: TransactionCategory) {
    if (cat.is_system) {
      toast('Categorias do sistema nao podem ser excluidas', 'error');
      return;
    }
    const ok = await confirm({
      title: 'Excluir Categoria',
      message: `Excluir "${cat.name}"? Transacoes ja classificadas nao serao afetadas.`,
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await deleteTransactionCategory(cat.id);
      if (res.success) {
        toast('Categoria excluida', 'success');
        load();
      } else {
        toast(res.error || 'Erro ao excluir', 'error');
      }
    } catch {
      toast('Erro ao excluir categoria', 'error');
    }
  }

  const dreLabel = (t: string | null) => {
    if (t === 'revenue') return 'Receita';
    if (t === 'expense') return 'Despesa';
    return 'Nao impacta';
  };

  const dreBadgeCls = (t: string | null) => {
    if (t === 'revenue') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    if (t === 'expense') return 'bg-red-500/10 text-red-400 border-red-500/30';
    return 'bg-dark-700/30 text-dark-400 border-dark-600/30';
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <p className="text-dark-400 text-sm">
        Categorias para classificar movimentacoes financeiras (ChipPix, OFX, manuais).
        Categorias com <strong className="text-dark-200">Auto-Match</strong> classificam automaticamente na importacao.
      </p>

      {/* ── Inline Form ──────────────────────────────────────────── */}
      {showForm && (
        <div className="card border-poker-700/30">
          <h4 className="text-sm font-semibold text-dark-200 mb-3">
            {editingId ? 'Editar Categoria' : 'Nova Categoria'}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Nome *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Mensalidade ChipPix"
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Direcao</label>
              <select
                value={form.direction}
                onChange={(e) => setForm((p) => ({ ...p, direction: e.target.value as 'in' | 'out' }))}
                className="input w-full text-sm"
              >
                <option value="in">Entrada (IN)</option>
                <option value="out">Saida (OUT)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Tipo DRE</label>
              <select
                value={form.dre_type}
                onChange={(e) => setForm((p) => ({ ...p, dre_type: e.target.value }))}
                className="input w-full text-sm"
              >
                <option value="">Nao impacta DRE</option>
                <option value="revenue">Receita</option>
                <option value="expense">Despesa</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Grupo DRE</label>
              <input
                type="text"
                value={form.dre_group}
                onChange={(e) => setForm((p) => ({ ...p, dre_group: e.target.value }))}
                placeholder="Ex: custos_operacionais"
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Cor</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                  className="w-8 h-8 rounded border border-dark-600 cursor-pointer bg-transparent"
                />
                <input
                  type="text"
                  value={form.color}
                  onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                  className="input flex-1 text-sm font-mono"
                  maxLength={7}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Auto-Match (regex)</label>
              <input
                type="text"
                value={form.auto_match}
                onChange={(e) => setForm((p) => ({ ...p, auto_match: e.target.value }))}
                placeholder="Ex: mensalidade|taxa"
                className="input w-full text-sm font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={cancelForm}
              disabled={saving}
              className="px-4 py-2 text-dark-400 hover:text-white text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary text-sm px-6 py-2"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* ── ENTRADAS ─────────────────────────────────────────────── */}
      <CategorySection
        title="Entradas"
        direction="in"
        items={inCategories}
        onAdd={() => openCreate('in')}
        onEdit={openEdit}
        onDelete={handleDelete}
        dreLabel={dreLabel}
        dreBadgeCls={dreBadgeCls}
        showForm={showForm}
      />

      {/* ── SAIDAS ───────────────────────────────────────────────── */}
      <CategorySection
        title="Saidas"
        direction="out"
        items={outCategories}
        onAdd={() => openCreate('out')}
        onEdit={openEdit}
        onDelete={handleDelete}
        dreLabel={dreLabel}
        dreBadgeCls={dreBadgeCls}
        showForm={showForm}
      />

      {ConfirmDialogElement}
    </div>
  );
}

// ─── Sub-component: Section ─────────────────────────────────────────

function CategorySection({
  title,
  direction,
  items,
  onAdd,
  onEdit,
  onDelete,
  dreLabel,
  dreBadgeCls,
  showForm,
}: {
  title: string;
  direction: 'in' | 'out';
  items: TransactionCategory[];
  onAdd: () => void;
  onEdit: (cat: TransactionCategory) => void;
  onDelete: (cat: TransactionCategory) => void;
  dreLabel: (t: string | null) => string;
  dreBadgeCls: (t: string | null) => string;
  showForm: boolean;
}) {
  const accentColor = direction === 'in' ? 'border-t-emerald-500' : 'border-t-red-500';

  return (
    <div className={`bg-dark-900 border border-dark-700 rounded-xl overflow-hidden border-t-2 ${accentColor}`}>
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <h3 className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">
          {title} ({items.length})
        </h3>
        {!showForm && (
          <button
            onClick={onAdd}
            className="text-[11px] text-poker-400 hover:text-poker-300 font-semibold transition-colors"
          >
            + Nova
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="px-5 pb-4 text-dark-500 text-xs">Nenhuma categoria cadastrada</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs data-table">
            <thead>
              <tr className="bg-dark-800/50">
                <th className="px-4 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Nome</th>
                <th className="px-4 py-2 text-center font-medium text-[10px] text-dark-400 uppercase tracking-wider">Tipo DRE</th>
                <th className="px-4 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Auto-Match</th>
                <th className="px-4 py-2 text-center font-medium text-[10px] text-dark-400 uppercase tracking-wider w-24">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800/30">
              {items.map((cat) => (
                <tr key={cat.id} className="hover:bg-dark-800/20 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-dark-200 font-medium">{cat.name}</span>
                      {cat.is_system && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-dark-700/50 text-dark-500 border border-dark-600/30">
                          SISTEMA
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${dreBadgeCls(cat.dre_type)}`}>
                      {dreLabel(cat.dre_type)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {cat.auto_match ? (
                      <code className="text-[10px] text-amber-400 bg-amber-500/5 px-1.5 py-0.5 rounded border border-amber-500/20 font-mono">
                        {cat.auto_match}
                      </code>
                    ) : (
                      <span className="text-dark-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => onEdit(cat)}
                        className="text-dark-500 hover:text-blue-400 transition-colors"
                        title="Editar"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => onDelete(cat)}
                        disabled={cat.is_system}
                        className="text-dark-500 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={cat.is_system ? 'Categorias do sistema nao podem ser excluidas' : 'Excluir'}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
