'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/useAuth';
import { apiFetch, uploadClubLogo, refreshTenantList } from '@/lib/api';
import { ChevronDown, Plus, Check, Pencil, Camera } from 'lucide-react';

interface TenantSelectorProps {
  collapsed?: boolean;
}

export default function TenantSelector({ collapsed }: TenantSelectorProps) {
  const { tenantId, tenantName, tenants, switchTenant, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
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
        // Refresh stored tenants and reload
        await refreshTenantList();
        window.location.reload();
      }
    } catch { /* ignore */ }
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
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  return (
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
          {/* Edit current tenant name */}
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
  );
}
