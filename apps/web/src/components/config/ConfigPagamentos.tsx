'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  listPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
} from '@/lib/api';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/Spinner';

// ─── Types ──────────────────────────────────────────────────────────

interface PaymentMethod {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

interface BankAccount {
  id: string;
  name: string;
  bank_code: string | null;
  agency: string | null;
  account_nr: string | null;
  is_default: boolean;
  is_active: boolean;
}

type ActiveSection = 'methods' | 'banks';

// ─── Component ──────────────────────────────────────────────────────

export default function ConfigPagamentos() {
  const [section, setSection] = useState<ActiveSection>('methods');
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, bRes] = await Promise.all([listPaymentMethods(), listBankAccounts()]);
      if (mRes.success) setMethods(mRes.data || []);
      if (bRes.success) setBanks(bRes.data || []);
    } catch {
      toast('Erro ao carregar configuracoes de pagamento', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      {/* Section tabs — pill style */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setSection('methods')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
            section === 'methods'
              ? 'bg-poker-600 border-poker-600 text-white'
              : 'bg-transparent border-dark-600 text-dark-400 hover:border-dark-500 hover:text-dark-200'
          }`}
        >
          Metodos de Pagamento ({methods.length})
        </button>
        <button
          onClick={() => setSection('banks')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
            section === 'banks'
              ? 'bg-poker-600 border-poker-600 text-white'
              : 'bg-transparent border-dark-600 text-dark-400 hover:border-dark-500 hover:text-dark-200'
          }`}
        >
          Contas Bancarias ({banks.length})
        </button>
      </div>

      {/* Content */}
      {section === 'methods' ? (
        <PaymentMethodsSection methods={methods} onReload={loadData} />
      ) : (
        <BankAccountsSection banks={banks} onReload={loadData} />
      )}
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
    if (!confirm(`Excluir metodo "${m.name}"?`)) return;
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Bank Accounts Section
// ═══════════════════════════════════════════════════════════════════

function BankAccountsSection({ banks, onReload }: { banks: BankAccount[]; onReload: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', bank_code: '', agency: '', account_nr: '', is_default: false });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  async function handleCreate() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await createBankAccount({
        name: form.name.trim(),
        bank_code: form.bank_code || undefined,
        agency: form.agency || undefined,
        account_nr: form.account_nr || undefined,
        is_default: form.is_default,
      });
      if (res.success) {
        setShowForm(false);
        setForm({ name: '', bank_code: '', agency: '', account_nr: '', is_default: false });
        onReload();
        toast('Conta bancaria criada', 'success');
      }
    } catch {
      toast('Erro ao criar conta bancaria', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(b: BankAccount) {
    await updateBankAccount(b.id, { is_active: !b.is_active });
    onReload();
  }

  async function handleSetDefault(b: BankAccount) {
    await updateBankAccount(b.id, { is_default: true });
    onReload();
  }

  async function handleDelete(b: BankAccount) {
    if (!confirm(`Excluir conta "${b.name}"?`)) return;
    await deleteBankAccount(b.id);
    onReload();
  }

  return (
    <div>
      {/* Info */}
      <div className="card bg-dark-800/30 border-dark-700/40 mb-4">
        <p className="text-sm text-dark-400">
          Contas bancarias sao usadas na conciliacao OFX e para identificar a origem/destino de pagamentos.
        </p>
      </div>

      {/* List */}
      <div className="space-y-1.5 mb-4">
        {banks.map((b) => (
          <div key={b.id} className={`card py-3 ${!b.is_active ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-dark-700/50 flex items-center justify-center text-xs font-bold text-dark-400 flex-shrink-0">
                  BC
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium text-sm">{b.name}</span>
                    {b.is_default && (
                      <span className="text-[10px] bg-poker-500/10 border border-poker-500/20 text-poker-400 px-1.5 py-0.5 rounded font-bold">
                        PADRAO
                      </span>
                    )}
                    {!b.is_active && (
                      <span className="text-[10px] bg-dark-700/30 text-dark-500 px-1.5 py-0.5 rounded font-bold">
                        INATIVO
                      </span>
                    )}
                  </div>
                  {(b.bank_code || b.agency || b.account_nr) && (
                    <p className="text-xs text-dark-500 mt-0.5">
                      {[b.bank_code, b.agency, b.account_nr].filter(Boolean).join(' / ')}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!b.is_default && b.is_active && (
                  <button
                    onClick={() => handleSetDefault(b)}
                    className="text-xs text-dark-500 hover:text-poker-400 transition-colors"
                    aria-label={`Definir ${b.name} como padrao`}
                  >
                    Padrao
                  </button>
                )}
                <button
                  onClick={() => handleToggleActive(b)}
                  className={`text-xs transition-colors ${b.is_active ? 'text-dark-500 hover:text-yellow-400' : 'text-dark-500 hover:text-emerald-400'}`}
                  aria-label={b.is_active ? `Desativar ${b.name}` : `Ativar ${b.name}`}
                >
                  {b.is_active ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  onClick={() => handleDelete(b)}
                  className="text-xs text-dark-600 hover:text-red-400 transition-colors"
                  aria-label={`Remover conta ${b.name}`}
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showForm ? (
        <div className="card bg-dark-800/50">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] text-dark-500 uppercase mb-0.5 block">Nome *</label>
              <input
                type="text"
                placeholder="Ex: Nubank, C6 Bank"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input w-full text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] text-dark-500 uppercase mb-0.5 block">Codigo Banco</label>
              <input
                type="text"
                placeholder="Ex: 260"
                value={form.bank_code}
                onChange={(e) => setForm((f) => ({ ...f, bank_code: e.target.value }))}
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] text-dark-500 uppercase mb-0.5 block">Agencia</label>
              <input
                type="text"
                placeholder="Ex: 0001"
                value={form.agency}
                onChange={(e) => setForm((f) => ({ ...f, agency: e.target.value }))}
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] text-dark-500 uppercase mb-0.5 block">Conta</label>
              <input
                type="text"
                placeholder="Ex: 12345-6"
                value={form.account_nr}
                onChange={(e) => setForm((f) => ({ ...f, account_nr: e.target.value }))}
                className="input w-full text-sm"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-dark-400 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                className="accent-poker-500"
              />
              Conta padrao
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="text-dark-500 hover:text-dark-300 text-xs"
                aria-label="Cancelar criacao de conta"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="btn-primary text-xs px-4 py-2"
                aria-label="Salvar conta bancaria"
              >
                {saving ? '...' : 'Adicionar Conta'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="btn-secondary text-sm px-4 py-2 w-full"
          aria-label="Criar nova conta bancaria"
        >
          + Adicionar Conta Bancaria
        </button>
      )}
    </div>
  );
}
