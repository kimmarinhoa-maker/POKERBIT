'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/useAuth';
import { apiFetch, uploadClubLogo, refreshTenantList, deleteTenant } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { ChevronDown, Plus, Check, Pencil, Camera, Trash2 } from 'lucide-react';

interface TenantSelectorProps {
  collapsed?: boolean;
}

export default function TenantSelector({ collapsed }: TenantSelectorProps) {
  const { tenantId, tenantName, tenants, switchTenant, isAdmin, role } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Click-outside to close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setEditing(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus input when editing
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const currentTenant = tenants.find((t) => t.id === tenantId);
  const initial = tenantName?.[0]?.toUpperCase() || 'P';
  const currentLogo = currentTenant?.logo_url;
  const isOwner = role === 'OWNER';

  async function handleSaveName() {
    if (!editName.trim() || editName.trim() === tenantName) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/config/tenant', {
        method: 'PATCH',
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.success) {
        await refreshTenantList();
        window.location.reload();
      }
    } catch (err) { toast(err instanceof Error ? err.message : 'Erro ao salvar nome', 'error'); }
    finally { setSaving(false); }
  }

  function startEdit() {
    setEditName(tenantName || '');
    setEditing(true);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return;
    const orgId = currentTenant?.club_org_id;
    if (!orgId) return;
    setSaving(true);
    try {
      await uploadClubLogo(orgId, file);
      await refreshTenantList();
      window.location.reload();
    } catch (err) { toast(err instanceof Error ? err.message : 'Erro ao enviar logo', 'error'); }
    finally { setSaving(false); }
  }

  async function handleDeleteTenant() {
    if (deleteConfirm !== 'CONFIRMAR' || !tenantId) return;
    setDeleting(true);
    try {
      const res = await deleteTenant(tenantId);
      if (res.success) {
        // Remove from localStorage and redirect
        localStorage.removeItem('poker_selected_tenant');
        await refreshTenantList();
        // If there are other tenants, switch to the first one; otherwise logout
        const remaining = tenants.filter((t) => t.id !== tenantId);
        if (remaining.length > 0) {
          localStorage.setItem('poker_selected_tenant', remaining[0].id);
          window.location.href = '/dashboard';
        } else {
          window.location.href = '/login';
        }
      }
    } catch (err) { toast(err instanceof Error ? err.message : 'Erro ao deletar operacao', 'error'); }
    finally { setDeleting(false); }
  }

  return (
    <>
      <div ref={ref} className="relative mt-3">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-dark-800 transition-colors text-left"
        >
          {currentLogo ? (
            <img src={currentLogo} alt={tenantName || ''} className="w-8 h-8 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-poker-600/20 border border-poker-700/30 flex items-center justify-center text-poker-400 text-xs font-bold shrink-0">
              {initial}
            </div>
          )}
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-dark-200 truncate">{tenantName}</p>
                {tenants.length > 1 && (
                  <p className="text-[10px] text-dark-500">{tenants.length} clubes</p>
                )}
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-dark-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </>
          )}
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 w-64 bg-dark-900 border border-dark-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
            {/* Edit current tenant */}
            {isAdmin && (
              <div className="p-2 border-b border-dark-700">
                {editing ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={inputRef}
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName();
                        if (e.key === 'Escape') setEditing(false);
                      }}
                      className="input flex-1 text-xs py-1.5"
                      placeholder="Nome do clube"
                      disabled={saving}
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={saving}
                      className="px-2 py-1.5 rounded-md text-xs bg-poker-600/20 text-poker-400 hover:bg-poker-600/30 transition-colors disabled:opacity-50"
                    >
                      {saving ? '...' : 'OK'}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={startEdit}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-dark-400 hover:bg-dark-800 hover:text-dark-200 transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Editar nome do clube</span>
                    </button>
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={saving}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-dark-400 hover:bg-dark-800 hover:text-dark-200 transition-colors disabled:opacity-50"
                    >
                      <Camera className="w-3 h-3" />
                      <span>{saving ? 'Enviando...' : currentLogo ? 'Alterar logo' : 'Adicionar logo'}</span>
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    {isOwner && (
                      <button
                        onClick={() => {
                          setOpen(false);
                          setShowDeleteModal(true);
                          setDeleteConfirm('');
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-red-400/70 hover:bg-red-900/20 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Deletar operacao</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tenant list */}
            <div className="p-1.5 max-h-60 overflow-y-auto">
              {tenants.map((t) => {
                const isActive = t.id === tenantId;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      if (!isActive) switchTenant(t.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-poker-600/15 text-poker-400'
                        : 'text-dark-300 hover:bg-dark-800 hover:text-dark-100'
                    }`}
                  >
                    {t.logo_url ? (
                      <img src={t.logo_url} alt={t.name} className="w-7 h-7 rounded-md object-cover shrink-0" />
                    ) : (
                      <div
                        className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                          isActive
                            ? 'bg-poker-600/30 text-poker-400 border border-poker-700/40'
                            : 'bg-dark-800 text-dark-400 border border-dark-700'
                        }`}
                      >
                        {t.name[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <span className="truncate flex-1 text-left">{t.name}</span>
                    <span className="text-[10px] text-dark-500 uppercase shrink-0">{t.role}</span>
                    {isActive && <Check className="w-3.5 h-3.5 text-poker-400 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Create new */}
            <div className="border-t border-dark-700 p-1.5">
              <a
                href="/onboarding?new=1"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-dark-400 hover:bg-dark-800 hover:text-dark-200 transition-colors"
              >
                <div className="w-7 h-7 rounded-md bg-dark-800 border border-dashed border-dark-600 flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5" />
                </div>
                <span>Criar novo clube</span>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Deletar Operacao</h3>
                <p className="text-xs text-dark-400">{tenantName}</p>
              </div>
            </div>

            <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-300 leading-relaxed">
                Esta acao e <strong>irreversivel</strong>. Todos os dados serao permanentemente apagados:
              </p>
              <ul className="text-xs text-red-300/80 mt-2 space-y-0.5 list-disc list-inside">
                <li>Imports e settlements</li>
                <li>Jogadores e agentes</li>
                <li>Movimentacoes e conciliacoes</li>
                <li>Subclubes e configuracoes</li>
              </ul>
            </div>

            <div className="mb-4">
              <label className="block text-sm text-dark-300 mb-1.5">
                Digite <strong className="text-red-400">CONFIRMAR</strong> para deletar:
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="input w-full text-sm"
                placeholder="CONFIRMAR"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 text-sm text-dark-400 hover:text-dark-200 border border-dark-700 rounded-lg hover:bg-dark-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteTenant}
                disabled={deleteConfirm !== 'CONFIRMAR' || deleting}
                className="flex-1 py-2.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-medium"
              >
                {deleting ? 'Deletando...' : 'Deletar tudo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
