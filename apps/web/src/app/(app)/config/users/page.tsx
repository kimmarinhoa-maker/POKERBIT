'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  getUsers, updateUserRole, removeUser, inviteUser, getStoredAuth,
  listOrganizations, getUserOrgAccess, setUserOrgAccess,
} from '@/lib/api';
import type { TenantUser } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/Spinner';

// ─── Role config ─────────────────────────────────────────────────────

const ROLE_OPTIONS = ['ADMIN', 'FINANCEIRO', 'AUDITOR', 'AGENTE'] as const;
const ALL_ROLES = ['OWNER', ...ROLE_OPTIONS] as const;

const roleBadge: Record<string, { bg: string; text: string; border: string }> = {
  OWNER:      { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/40' },
  ADMIN:      { bg: 'bg-blue-500/20',   text: 'text-blue-400',   border: 'border-blue-500/40' },
  FINANCEIRO: { bg: 'bg-green-500/20',  text: 'text-green-400',  border: 'border-green-500/40' },
  AUDITOR:    { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/40' },
  AGENTE:     { bg: 'bg-dark-700/30',   text: 'text-dark-400',   border: 'border-dark-600/40' },
};

function getRoleBadge(role: string) {
  return roleBadge[role] || roleBadge.AGENTE;
}

function getInitials(name: string | null, email: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }
  if (email) return email.substring(0, 2).toUpperCase();
  return '??';
}

// ─── Page ────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { toast } = useToast();

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('FINANCEIRO');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Role change
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

  // Scope management
  const [scopeUserId, setScopeUserId] = useState<string | null>(null);
  const [scopeOrgIds, setScopeOrgIds] = useState<string[]>([]);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeSaving, setScopeSaving] = useState(false);
  const [subclubs, setSubclubs] = useState<Array<{ id: string; name: string }>>([]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getUsers();
      if (res.success) {
        setUsers(res.data || []);
      } else {
        toast(res.error || 'Erro ao carregar membros', 'error');
      }
    } catch {
      toast('Erro de conexao com o servidor', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const auth = getStoredAuth();
    setCurrentUserId(auth?.user?.id || null);
    loadUsers();
    loadSubclubs();
  }, [loadUsers]);

  async function loadSubclubs() {
    try {
      const res = await listOrganizations('SUBCLUB');
      if (res.success) setSubclubs(res.data || []);
    } catch {}
  }

  // ── Invite ──────────────────────────────────────────────────────

  function openInvite() {
    setInviteEmail('');
    setInviteRole('FINANCEIRO');
    setInviteError(null);
    setShowInvite(true);
  }

  function closeInvite() {
    setShowInvite(false);
    setInviteError(null);
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) {
      setInviteError('Email obrigatorio');
      return;
    }
    setInviting(true);
    setInviteError(null);
    try {
      const res = await inviteUser(inviteEmail.trim(), inviteRole);
      if (res.success) {
        closeInvite();
        const msg = (res as any).pending
          ? 'Convite pendente - usuario precisa fazer signup primeiro'
          : (res as any).message || 'Membro adicionado com sucesso';
        toast(msg, 'success');
        loadUsers();
      } else {
        setInviteError(res.error || 'Erro ao convidar');
      }
    } catch {
      setInviteError('Erro de conexao');
    } finally {
      setInviting(false);
    }
  }

  // ── Role change ────────────────────────────────────────────────

  async function handleRoleChange(userTenantId: string, newRole: string) {
    setEditingRoleId(null);
    try {
      const res = await updateUserRole(userTenantId, newRole);
      if (res.success) {
        toast('Funcao alterada com sucesso', 'success');
        loadUsers();
      } else {
        toast(res.error || 'Erro ao alterar funcao', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    }
  }

  // ── Remove ─────────────────────────────────────────────────────

  async function handleRemove(userTenantId: string, name: string | null) {
    const label = name || 'este membro';
    if (!confirm(`Tem certeza que deseja remover ${label} da organizacao?`)) return;

    try {
      const res = await removeUser(userTenantId);
      if (res.success) {
        toast('Membro removido com sucesso', 'success');
        loadUsers();
      } else {
        toast(res.error || 'Erro ao remover', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    }
  }

  // ── Scope management ──────────────────────────────────────────

  async function openScope(userTenantId: string) {
    setScopeUserId(userTenantId);
    setScopeLoading(true);
    try {
      const res = await getUserOrgAccess(userTenantId);
      if (res.success && res.data) {
        setScopeOrgIds(res.data.org_ids || []);
      }
    } catch {
      toast('Erro ao carregar escopo', 'error');
    } finally {
      setScopeLoading(false);
    }
  }

  function toggleScopeOrg(orgId: string) {
    setScopeOrgIds(prev =>
      prev.includes(orgId) ? prev.filter(id => id !== orgId) : [...prev, orgId]
    );
  }

  async function handleSaveScope() {
    if (!scopeUserId) return;
    setScopeSaving(true);
    try {
      const res = await setUserOrgAccess(scopeUserId, scopeOrgIds);
      if (res.success) {
        toast('Escopo atualizado com sucesso', 'success');
        setScopeUserId(null);
      } else {
        toast(res.error || 'Erro ao salvar escopo', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setScopeSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-dark-800 flex items-center justify-center text-3xl">
            👤
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Equipe</h2>
            <p className="text-dark-400 text-sm">
              Gerencie os membros da sua organizacao
            </p>
          </div>
        </div>

        <button onClick={openInvite} className="btn-primary text-sm px-4 py-2" aria-label="Convidar novo membro">
          + Convidar Membro
        </button>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="card mb-6 bg-dark-800/50">
          <h4 className="text-sm font-semibold text-dark-200 mb-3">Convidar Membro</h4>
          {inviteError && (
            <div className="mb-3 bg-red-900/30 border border-red-700/50 rounded-lg p-2 text-red-300 text-xs">
              {inviteError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Email *</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="input w-full text-sm"
                placeholder="usuario@email.com"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Funcao *</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="input w-full text-sm"
              >
                {ROLE_OPTIONS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={closeInvite}
              disabled={inviting}
              className="px-3 py-1.5 text-dark-400 hover:text-white text-xs transition-colors"
              aria-label="Cancelar convite"
            >
              Cancelar
            </button>
            <button
              onClick={handleInvite}
              disabled={inviting}
              className="btn-primary text-xs px-4 py-1.5"
            >
              {inviting ? 'Enviando...' : 'Convidar'}
            </button>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-dark-700/60">
          <span className="text-base">👥</span>
          <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
            Membros
          </h3>
          <span className="text-xs text-dark-500">({users.length})</span>
        </div>

        {users.length === 0 ? (
          <p className="text-dark-500 text-sm py-4 text-center">
            Nenhum membro encontrado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700/40">
                  <th className="text-left py-2 px-2 text-xs text-dark-500 font-medium">Nome</th>
                  <th className="text-left py-2 px-2 text-xs text-dark-500 font-medium">Email</th>
                  <th className="text-center py-2 px-2 text-xs text-dark-500 font-medium">Funcao</th>
                  <th className="text-center py-2 px-2 text-xs text-dark-500 font-medium">Status</th>
                  <th className="text-right py-2 px-2 text-xs text-dark-500 font-medium">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const isCurrentUser = user.user_id === currentUserId;
                  const badge = getRoleBadge(user.role);

                  return (
                    <React.Fragment key={user.id}>
                    <tr
                      className="border-b border-dark-800/30 hover:bg-dark-800/20 transition-colors"
                    >
                      {/* Nome + Avatar */}
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center text-[11px] font-bold text-dark-300 shrink-0">
                            {getInitials(user.full_name, user.email)}
                          </div>
                          <span className="text-white font-medium">
                            {user.full_name || '—'}
                            {isCurrentUser && (
                              <span className="ml-1.5 text-[10px] text-dark-500">(voce)</span>
                            )}
                          </span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-2.5 px-2 text-dark-400 text-xs">
                        {user.email || '—'}
                      </td>

                      {/* Funcao */}
                      <td className="py-2.5 px-2 text-center relative">
                        {editingRoleId === user.id ? (
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                            onBlur={() => setEditingRoleId(null)}
                            className="input text-xs py-1 px-2 w-auto"
                            autoFocus
                            aria-label="Alterar funcao"
                          >
                            {ALL_ROLES.map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                          >
                            {user.role}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-2 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            user.is_active
                              ? 'bg-green-500/20 text-green-400 border-green-500/40'
                              : 'bg-red-500/20 text-red-400 border-red-500/40'
                          }`}
                        >
                          {user.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>

                      {/* Acoes */}
                      <td className="py-2.5 px-2 text-right">
                        {!isCurrentUser && (
                          <div className="flex items-center justify-end gap-2">
                            {['FINANCEIRO', 'AUDITOR', 'AGENTE'].includes(user.role) && (
                              <button
                                onClick={() => scopeUserId === user.id ? setScopeUserId(null) : openScope(user.id)}
                                className={`text-xs transition-colors ${
                                  scopeUserId === user.id ? 'text-poker-400' : 'text-dark-400 hover:text-poker-400'
                                }`}
                                aria-label="Gerenciar escopo"
                              >
                                Escopo
                              </button>
                            )}
                            {(user.role === 'OWNER' || user.role === 'ADMIN') && (
                              <span className="text-[10px] text-dark-500 px-1.5 py-0.5 bg-dark-700/40 rounded">
                                Acesso Total
                              </span>
                            )}
                            <button
                              onClick={() => setEditingRoleId(user.id)}
                              className="text-dark-400 hover:text-poker-400 text-xs transition-colors"
                              aria-label={`Alterar funcao de ${user.full_name || user.email}`}
                            >
                              Alterar Funcao
                            </button>
                            <button
                              onClick={() => handleRemove(user.id, user.full_name)}
                              className="text-dark-500 hover:text-red-400 text-xs transition-colors"
                              aria-label="Remover membro"
                            >
                              Remover
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {/* Scope inline card */}
                    {scopeUserId === user.id && (
                      <tr>
                        <td colSpan={5} className="p-0">
                          <div className="bg-dark-800/60 border-t border-b border-dark-700/40 p-4">
                            <p className="text-xs text-dark-400 mb-2">
                              Subclubes que <strong className="text-dark-200">{user.full_name || user.email}</strong> pode acessar:
                            </p>
                            {scopeLoading ? (
                              <div className="flex justify-center py-4"><Spinner size="sm" /></div>
                            ) : subclubs.length === 0 ? (
                              <p className="text-dark-500 text-xs">Nenhum subclube cadastrado.</p>
                            ) : (
                              <>
                                <div className="flex flex-wrap gap-2 mb-3">
                                  {subclubs.map(sc => {
                                    const checked = scopeOrgIds.includes(sc.id);
                                    return (
                                      <label
                                        key={sc.id}
                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                                          checked
                                            ? 'bg-poker-600/20 border-poker-600/40 text-poker-400'
                                            : 'bg-dark-800 border-dark-700 text-dark-400 hover:border-dark-600'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleScopeOrg(sc.id)}
                                          className="w-3.5 h-3.5 rounded border-dark-600 text-poker-500 focus:ring-poker-500/30"
                                        />
                                        {sc.name}
                                      </label>
                                    );
                                  })}
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={handleSaveScope}
                                    disabled={scopeSaving}
                                    className="btn-primary text-xs px-4 py-1.5"
                                  >
                                    {scopeSaving ? 'Salvando...' : 'Salvar Escopo'}
                                  </button>
                                  <button
                                    onClick={() => setScopeUserId(null)}
                                    className="text-dark-500 hover:text-dark-300 text-xs transition-colors"
                                  >
                                    Cancelar
                                  </button>
                                  {scopeOrgIds.length === 0 && (
                                    <span className="text-yellow-400 text-[10px]">
                                      Sem subclubes = sem acesso a nenhum fechamento
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info card */}
      <div className="mt-6 card bg-dark-800/30 border-dark-700/40">
        <div className="flex items-start gap-3">
          <span className="text-lg mt-0.5">ℹ️</span>
          <div className="text-sm text-dark-400 space-y-1">
            <p>
              <strong className="text-dark-300">OWNER</strong> e <strong className="text-dark-300">ADMIN</strong> tem acesso total a operacao.
            </p>
            <p>
              <strong className="text-dark-300">FINANCEIRO</strong> acessa fechamentos e pagamentos.
              <strong className="text-dark-300 ml-2">AUDITOR</strong> tem acesso somente leitura.
              <strong className="text-dark-300 ml-2">AGENTE</strong> visualiza apenas seus subclubes vinculados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
