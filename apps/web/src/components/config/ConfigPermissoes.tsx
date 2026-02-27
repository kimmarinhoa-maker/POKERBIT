'use client';

import { useEffect, useState, useCallback } from 'react';
import { getAllPermissions, updateRolePermissions } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { CONFIGURABLE_ROLES, getDefaultPermissionsForRole } from '@/lib/defaultPermissions';
import type { PermRole } from '@/lib/defaultPermissions';
import { permissionSections } from '@/lib/permissionResources';
import Spinner from '@/components/Spinner';
import { Shield } from 'lucide-react';

const roleBadge: Record<string, { bg: string; text: string; border: string }> = {
  ADMIN: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/40' },
  FINANCEIRO: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/40' },
  AUDITOR: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/40' },
  AGENTE: { bg: 'bg-dark-700/30', text: 'text-dark-400', border: 'border-dark-600/40' },
};

export default function ConfigPermissoes() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedRole, setSelectedRole] = useState<PermRole>('ADMIN');
  const [allPerms, setAllPerms] = useState<Record<string, Record<string, boolean>>>({});
  const [dirty, setDirty] = useState(false);

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllPermissions();
      if (res.success && res.data) {
        setAllPerms(res.data);
      } else {
        // Fallback to defaults
        const defaults: Record<string, Record<string, boolean>> = {};
        for (const role of CONFIGURABLE_ROLES) {
          defaults[role] = getDefaultPermissionsForRole(role);
        }
        setAllPerms(defaults);
        toast(res.error || 'Usando permissoes padrao', 'info');
      }
    } catch {
      const defaults: Record<string, Record<string, boolean>> = {};
      for (const role of CONFIGURABLE_ROLES) {
        defaults[role] = getDefaultPermissionsForRole(role);
      }
      setAllPerms(defaults);
      toast('Erro ao carregar permissoes — usando padrao', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  function togglePermission(resource: string) {
    setAllPerms((prev) => {
      const rolePerms = { ...(prev[selectedRole] || {}) };
      rolePerms[resource] = !rolePerms[resource];
      return { ...prev, [selectedRole]: rolePerms };
    });
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const perms = allPerms[selectedRole] || {};
      const res = await updateRolePermissions(selectedRole, perms);
      if (res.success) {
        toast(`Permissoes de ${selectedRole} salvas com sucesso`, 'success');
        setDirty(false);
      } else {
        toast(res.error || 'Erro ao salvar permissoes', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleResetDefaults() {
    setAllPerms((prev) => ({
      ...prev,
      [selectedRole]: getDefaultPermissionsForRole(selectedRole),
    }));
    setDirty(true);
  }

  const currentPerms = allPerms[selectedRole] || getDefaultPermissionsForRole(selectedRole);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      {/* OWNER badge */}
      <div className="flex items-center gap-2 mb-6 bg-purple-500/10 border border-purple-500/30 rounded-lg px-4 py-2.5">
        <Shield className="w-4 h-4 text-purple-400" />
        <span className="text-sm text-purple-300">
          <strong>OWNER</strong> tem acesso total a todas as paginas e abas — nao configuravel.
        </span>
      </div>

      {/* Role selector pills */}
      <div className="flex gap-2 mb-6">
        {CONFIGURABLE_ROLES.map((role) => {
          const badge = roleBadge[role];
          const isSelected = selectedRole === role;
          return (
            <button
              key={role}
              onClick={() => setSelectedRole(role)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                isSelected
                  ? `${badge.bg} ${badge.text} ${badge.border} ring-1 ring-offset-1 ring-offset-dark-900 ${badge.border}`
                  : 'bg-dark-800/50 text-dark-400 border-dark-700/50 hover:border-dark-600 hover:text-dark-200'
              }`}
            >
              {role}
            </button>
          );
        })}
      </div>

      {/* Permission grid */}
      <div className="space-y-6">
        {permissionSections.map((section) => (
          <div key={section.label} className="card">
            <h4 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4 pb-2 border-b border-dark-700/40">
              {section.label}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {section.items.map((item) => {
                const Icon = item.icon;
                const allowed = currentPerms[item.key] ?? false;
                return (
                  <label
                    key={item.key}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                      allowed
                        ? 'bg-poker-600/10 border-poker-600/30 text-white'
                        : 'bg-dark-800/30 border-dark-700/40 text-dark-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={allowed}
                      onChange={() => togglePermission(item.key)}
                      className="w-4 h-4 rounded border-dark-600 text-poker-500 focus:ring-poker-500/30"
                    />
                    <Icon className={`w-4 h-4 shrink-0 ${allowed ? 'text-poker-400' : 'text-dark-600'}`} />
                    <span className="text-sm font-medium">{item.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className={`btn-primary text-sm px-6 py-2.5 ${!dirty ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {saving ? 'Salvando...' : 'Salvar Permissoes'}
        </button>
        <button
          onClick={handleResetDefaults}
          className="text-dark-400 hover:text-dark-200 text-sm transition-colors"
        >
          Restaurar Padrao
        </button>
        {dirty && (
          <span className="text-yellow-400 text-xs">Alteracoes nao salvas</span>
        )}
      </div>
    </div>
  );
}
