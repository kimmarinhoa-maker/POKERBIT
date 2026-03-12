'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  listPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  getTenantConfig,
  updateTenantConfig,
} from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import TableSkeleton from '@/components/ui/TableSkeleton';

// ─── Types ──────────────────────────────────────────────────────────

interface PaymentMethod {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

// ─── Component ──────────────────────────────────────────────────────

export default function ConfigPagamentos() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState('');
  const [savingPix, setSavingPix] = useState(false);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, tRes] = await Promise.all([listPaymentMethods(), getTenantConfig()]);
      if (mRes.success) setMethods(mRes.data || []);
      if (tRes.success && tRes.data) {
        setPixKey(tRes.data.pix_key || '');
        setPixKeyType(tRes.data.pix_key_type || '');
      }
    } catch {
      toast('Erro ao carregar configuracoes de pagamento', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSavePix() {
    setSavingPix(true);
    try {
      const res = await updateTenantConfig({
        pix_key: pixKey.trim() || null,
        pix_key_type: pixKeyType || null,
      });
      if (res.success) {
        toast('Chave PIX salva!', 'success');
      } else {
        toast(res.error || 'Erro ao salvar', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSavingPix(false);
    }
  }

  if (loading) {
    return <TableSkeleton columns={3} rows={5} />;
  }

  return (
    <div>
      {/* PIX Key for billing */}
      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-dark-200 mb-1">Chave PIX para Cobrancas</h3>
        <p className="text-xs text-dark-500 mb-4">Usada nas mensagens de cobranca via WhatsApp.</p>
        <div className="flex items-end gap-3">
          <div className="w-36">
            <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold mb-1 block">Tipo</label>
            <select
              value={pixKeyType}
              onChange={(e) => setPixKeyType(e.target.value)}
              className="input w-full text-sm"
            >
              <option value="">Selecione</option>
              <option value="cpf">CPF</option>
              <option value="cnpj">CNPJ</option>
              <option value="email">E-mail</option>
              <option value="phone">Telefone</option>
              <option value="random">Aleatoria</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold mb-1 block">Chave PIX</label>
            <input
              type="text"
              placeholder="Digite a chave PIX"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              className="input w-full text-sm"
            />
          </div>
          <button
            onClick={handleSavePix}
            disabled={savingPix}
            className="btn-primary text-xs px-4 py-2 whitespace-nowrap"
          >
            {savingPix ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Info: Contas bancárias movidas para config do clube */}
      <div className="card bg-dark-800/30 border-dark-700/40 mb-6">
        <p className="text-xs text-dark-500">
          As contas bancarias agora sao configuradas individualmente em cada clube/subclube, na aba Configuracoes.
        </p>
      </div>

      {/* Payment Methods */}
      <h3 className="text-sm font-semibold text-dark-200 mb-4">Metodos de Pagamento ({methods.length})</h3>
      <PaymentMethodsSection methods={methods} onReload={loadData} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Payment Methods Section
// ═══════════════════════════════════════════════════════════════════

function PaymentMethodsSection({ methods, onReload }: { methods: PaymentMethod[]; onReload: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', is_default: false });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { confirm, ConfirmDialogElement } = useConfirmDialog();

  async function handleCreate() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await createPaymentMethod({ name: form.name.trim(), is_default: form.is_default });
      if (res.success) {
        setShowForm(false);
        setForm({ name: '', is_default: false });
        onReload();
        toast('Metodo de pagamento criado', 'success');
      }
    } catch {
      toast('Erro ao criar metodo de pagamento', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(m: PaymentMethod) {
    await updatePaymentMethod(m.id, { is_active: !m.is_active });
    onReload();
  }

  async function handleSetDefault(m: PaymentMethod) {
    await updatePaymentMethod(m.id, { is_default: true });
    onReload();
  }

  async function handleDelete(m: PaymentMethod) {
    const ok = await confirm({ title: 'Excluir Metodo', message: `Excluir metodo "${m.name}"?`, variant: 'danger' });
    if (!ok) return;
    await deletePaymentMethod(m.id);
    onReload();
  }

  async function handleRename(m: PaymentMethod, newName: string) {
    if (!newName.trim() || newName.trim() === m.name) {
      setEditingId(null);
      return;
    }
    await updatePaymentMethod(m.id, { name: newName.trim() });
    setEditingId(null);
    onReload();
  }

  return (
    <div>
      {/* Info */}
      <div className="card bg-dark-800/30 border-dark-700/40 mb-4">
        <p className="text-sm text-dark-400">
          Metodos de pagamento aparecem ao registrar movimentacoes (PIX, Transferencia, ChipPix, etc). O metodo padrao e
          pre-selecionado automaticamente.
        </p>
      </div>

      {/* List */}
      <div className="space-y-1.5 mb-4">
        {methods.map((m) => (
          <div key={m.id} className={`card flex items-center justify-between py-3 ${!m.is_active ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-3">
              {editingId === m.id ? (
                <input
                  type="text"
                  defaultValue={m.name}
                  autoFocus
                  onBlur={(e) => handleRename(m, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(m, (e.target as HTMLInputElement).value);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="input text-sm w-40"
                />
              ) : (
                <span
                  className="text-white font-medium text-sm cursor-pointer hover:text-poker-400 transition-colors"
                  onDoubleClick={() => setEditingId(m.id)}
                  title="Duplo-clique para editar"
                >
                  {m.name}
                </span>
              )}
              {m.is_default && (
                <span className="text-[10px] bg-poker-500/10 border border-poker-500/20 text-poker-400 px-1.5 py-0.5 rounded font-bold">
                  PADRAO
                </span>
              )}
              {!m.is_active && (
                <span className="text-[10px] bg-dark-700/30 text-dark-500 px-1.5 py-0.5 rounded font-bold">
                  INATIVO
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!m.is_default && m.is_active && (
                <button
                  onClick={() => handleSetDefault(m)}
                  className="text-xs text-dark-500 hover:text-poker-400 transition-colors"
                  title="Definir como padrao"
                  aria-label={`Definir ${m.name} como padrao`}
                >
                  Padrao
                </button>
              )}
              <button
                onClick={() => handleToggleActive(m)}
                className={`text-xs transition-colors ${m.is_active ? 'text-dark-500 hover:text-yellow-400' : 'text-dark-500 hover:text-emerald-400'}`}
                aria-label={m.is_active ? `Desativar ${m.name}` : `Ativar ${m.name}`}
              >
                {m.is_active ? 'Desativar' : 'Ativar'}
              </button>
              <button
                onClick={() => handleDelete(m)}
                className="text-xs text-dark-600 hover:text-red-400 transition-colors"
                aria-label={`Remover metodo ${m.name}`}
              >
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showForm ? (
        <div className="card bg-dark-800/50">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Nome do metodo (ex: PIX)"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="input flex-1 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />
            <label className="flex items-center gap-1.5 text-xs text-dark-400 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                className="accent-poker-500"
              />
              Padrao
            </label>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="btn-primary text-xs px-4 py-2"
              aria-label="Salvar metodo de pagamento"
            >
              {saving ? '...' : 'Adicionar'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-dark-500 hover:text-dark-300 text-xs"
              aria-label="Cancelar criacao de metodo"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="btn-secondary text-sm px-4 py-2 w-full"
          aria-label="Criar novo metodo de pagamento"
        >
          + Adicionar Metodo
        </button>
      )}

      {ConfirmDialogElement}
    </div>
  );
}
