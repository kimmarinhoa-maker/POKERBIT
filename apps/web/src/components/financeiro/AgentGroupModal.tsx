'use client';

import { useState, useMemo } from 'react';
import { X, Search, Plus, Trash2 } from 'lucide-react';
import type { AgentGroup, AgentGroupMember } from '@/types/financeiro';

interface OrgOption {
  id: string;
  name: string;
  platform: string;
  club_name: string;
  already_in_group?: string; // group name if already assigned
}

interface AgentGroupModalProps {
  group: AgentGroup | null; // null = create mode
  allAgentOrgs: OrgOption[];
  onClose: () => void;
  onSave: (name: string, phone: string) => Promise<string | null>; // returns group id or null on error
  onAddMember: (groupId: string, orgId: string) => Promise<boolean>;
  onRemoveMember: (groupId: string, memberId: string) => Promise<boolean>;
  onDelete?: () => void;
}

const PLATFORM_COLORS: Record<string, string> = {
  suprema: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  pppoker: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  clubgg: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

export default function AgentGroupModal({
  group,
  allAgentOrgs,
  onClose,
  onSave,
  onAddMember,
  onRemoveMember,
  onDelete,
}: AgentGroupModalProps) {
  const [name, setName] = useState(group?.name || '');
  const [phone, setPhone] = useState(group?.phone || '');
  const [members, setMembers] = useState<AgentGroupMember[]>(group?.members || []);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [groupId, setGroupId] = useState(group?.id || '');

  const isEdit = !!group;

  // Filter available orgs (not already in this group)
  const memberOrgIds = new Set(members.map((m) => m.organization_id));
  const filteredOrgs = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = allAgentOrgs.filter((org) => {
      if (memberOrgIds.has(org.id)) return false;
      if (!q) return true;
      return (
        org.name.toLowerCase().includes(q) ||
        org.platform.toLowerCase().includes(q) ||
        org.club_name.toLowerCase().includes(q)
      );
    });
    // Sort by club name, then agent name for better organization
    filtered.sort((a, b) => {
      const cmp = (a.club_name || '').localeCompare(b.club_name || '');
      if (cmp !== 0) return cmp;
      return a.name.localeCompare(b.name);
    });
    return filtered;
  }, [allAgentOrgs, memberOrgIds, search]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const id = await onSave(name.trim(), phone.trim());
      if (id) setGroupId(id);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMember(org: OrgOption) {
    if (!groupId) {
      // Need to save group first
      setSaving(true);
      const id = await onSave(name.trim(), phone.trim());
      setSaving(false);
      if (!id) return;
      setGroupId(id);
      const ok = await onAddMember(id, org.id);
      if (ok) {
        setMembers((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            organization_id: org.id,
            org_name: org.name,
            platform: org.platform,
            club_name: org.club_name,
          },
        ]);
      }
    } else {
      const ok = await onAddMember(groupId, org.id);
      if (ok) {
        setMembers((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            organization_id: org.id,
            org_name: org.name,
            platform: org.platform,
            club_name: org.club_name,
          },
        ]);
      }
    }
  }

  async function handleRemoveMember(member: AgentGroupMember) {
    if (!groupId) return;
    const ok = await onRemoveMember(groupId, member.id);
    if (ok) {
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700">
          <h2 className="text-base font-bold text-white">
            {isEdit ? 'Editar Grupo' : 'Novo Grupo de Agente'}
          </h2>
          <button onClick={onClose} className="text-dark-500 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Name + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-dark-500 uppercase tracking-wider font-bold mb-1">
                Nome (pessoa real)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Andre Takeshi"
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 focus:outline-none focus:border-poker-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] text-dark-500 uppercase tracking-wider font-bold mb-1">
                Celular (WhatsApp)
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+55 11 99999-0000"
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 focus:outline-none focus:border-poker-500 transition-colors"
              />
            </div>
          </div>

          {/* Save name/phone button */}
          {(!groupId || isEdit) && (
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="w-full py-2 rounded-lg text-sm font-semibold bg-poker-600 hover:bg-poker-500 text-white disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando...' : groupId ? 'Salvar Alteracoes' : 'Criar Grupo'}
            </button>
          )}

          {/* Members */}
          <div>
            <h3 className="text-[11px] text-dark-500 uppercase tracking-wider font-bold mb-2">
              Agentes Vinculados ({members.length})
            </h3>
            {members.length === 0 ? (
              <p className="text-xs text-dark-600 py-2">Nenhum agente vinculado ainda.</p>
            ) : (
              <div className="space-y-1.5">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 bg-dark-800 border border-dark-700 rounded-lg px-3 py-2"
                  >
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${
                        PLATFORM_COLORS[m.platform] || 'bg-dark-700 text-dark-400 border-dark-600'
                      }`}
                    >
                      {m.platform}
                    </span>
                    <span className="text-xs text-white flex-1 truncate">{m.org_name}</span>
                    <span className="text-[10px] text-dark-500 truncate">{m.club_name}</span>
                    <button
                      onClick={() => handleRemoveMember(m)}
                      className="text-dark-600 hover:text-red-400 transition-colors p-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add agents */}
          {groupId && (
            <div>
              <h3 className="text-[11px] text-dark-500 uppercase tracking-wider font-bold mb-2">
                Adicionar Agente
              </h3>
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 text-dark-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome, plataforma ou clube..."
                  className="w-full bg-dark-800 border border-dark-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-dark-600 focus:outline-none focus:border-poker-500 transition-colors"
                />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredOrgs.length === 0 ? (
                  <p className="text-[11px] text-dark-600 text-center py-3">Nenhum agente disponivel</p>
                ) : (
                  filteredOrgs.slice(0, 50).map((org) => (
                    <button
                      key={org.id}
                      onClick={() => handleAddMember(org)}
                      disabled={!!org.already_in_group}
                      className="w-full flex items-center gap-2 bg-dark-800/50 hover:bg-dark-800 border border-dark-700/50 hover:border-dark-600 rounded-lg px-3 py-2 text-left transition-colors disabled:opacity-40"
                    >
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${
                          PLATFORM_COLORS[org.platform] || 'bg-dark-700 text-dark-400 border-dark-600'
                        }`}
                      >
                        {org.platform}
                      </span>
                      <span className="text-xs text-dark-300 flex-1 truncate">{org.name}</span>
                      <span className="text-[10px] text-dark-600 truncate">{org.club_name}</span>
                      {org.already_in_group ? (
                        <span className="text-[9px] text-amber-500">Em: {org.already_in_group}</span>
                      ) : (
                        <Plus className="w-3.5 h-3.5 text-dark-500" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-dark-700 flex items-center justify-between">
          {onDelete ? (
            <button
              onClick={onDelete}
              className="px-3 py-2 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              Apagar Grupo
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
