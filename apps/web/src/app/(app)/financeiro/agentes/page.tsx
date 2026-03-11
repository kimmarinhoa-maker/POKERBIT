'use client';

import { useEffect, useState } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';
import {
  listAgentGroups,
  createAgentGroup,
  updateAgentGroup,
  deleteAgentGroup,
  addGroupMember,
  removeGroupMember,
  getAgentConsolidatedSettlement,
  listOrganizations,
  listSettlements,
  syncSettlementAgents,
  formatBRL,
  invalidateCache,
} from '@/lib/api';
import { useToast } from '@/components/Toast';
import KpiCard from '@/components/ui/KpiCard';
import KpiSkeleton from '@/components/ui/KpiSkeleton';
import EmptyState from '@/components/ui/EmptyState';
import AgentGroupList from '@/components/financeiro/AgentGroupList';
import AgentGroupDetail from '@/components/financeiro/AgentGroupDetail';
import AgentGroupModal from '@/components/financeiro/AgentGroupModal';
import { useAuth } from '@/lib/useAuth';
import { UserCheck, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import type { AgentGroup, AgentConsolidatedSettlement } from '@/types/financeiro';

interface WeekOption {
  week_start: string;
  label: string;
  settlement_ids: string[];
}

export default function FechamentoAgentesPage() {
  usePageTitle('Fechamento Agentes');
  const { toast } = useToast();
  const { tenantId, tenants } = useAuth();
  const tenantLogoUrl = tenants.find((t) => t.id === tenantId)?.logo_url || null;

  // Data
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [weekTotals, setWeekTotals] = useState<Map<string, number>>(new Map());
  const [allAgentOrgs, setAllAgentOrgs] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [selectedWeek, setSelectedWeek] = useState('');

  // UI state
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<AgentGroup | null>(null);
  const [detailData, setDetailData] = useState<AgentConsolidatedSettlement | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AgentGroup | null>(null);

  // Load initial data
  useEffect(() => {
    loadGroups();
    loadWeeks();
  }, []);

  async function loadGroups() {
    const res = await listAgentGroups();
    if (res.success && res.data) {
      setGroups(res.data);
    } else {
      toast(res.error || 'Erro ao carregar grupos', 'error');
    }
  }

  async function loadAgentOrgs() {
    invalidateCache('/organizations');
    const [agentRes, allRes] = await Promise.all([
      listOrganizations('AGENT'),
      listOrganizations(),
    ]);
    if (agentRes.success && agentRes.data && allRes.success && allRes.data) {
      const orgMap = new Map<string, any>();
      for (const o of allRes.data as any[]) orgMap.set(o.id, o);

      const findClubAndSubclub = (orgId: string): { club: any | null; subclub: any | null } => {
        const visited = new Set<string>();
        let cur = orgMap.get(orgId);
        let subclub: any | null = null;
        while (cur) {
          if (visited.has(cur.id)) break;
          visited.add(cur.id);
          if (cur.type === 'CLUB') return { club: cur, subclub };
          if (cur.type === 'SUBCLUB') subclub = cur;
          if (!cur.parent_id) break;
          cur = orgMap.get(cur.parent_id);
        }
        return { club: null, subclub };
      };

      const orgs = (agentRes.data as any[])
        .filter((org: any) => !/^(none|sem agente|\(sem agente\))$/i.test(org.name))
        .map((org: any) => {
          const { club, subclub } = findClubAndSubclub(org.id);
          return {
            id: org.id,
            name: org.name,
            platform: (club?.metadata?.platform || 'outro').toLowerCase(),
            club_name: subclub?.name || club?.name || '',
          };
        });
      setAllAgentOrgs(orgs);
    }
  }

  async function loadWeeks() {
    const res = await listSettlements();
    if (res.success && res.data) {
      // Group settlement IDs by week_start
      const weekMap = new Map<string, string[]>();
      for (const s of res.data as any[]) {
        if (s.status === 'VOID') continue;
        if (!weekMap.has(s.week_start)) weekMap.set(s.week_start, []);
        weekMap.get(s.week_start)!.push(s.id);
      }

      const weekList: WeekOption[] = [];
      for (const [ws, ids] of weekMap) {
        const [y, m, d] = ws.split('-');
        weekList.push({ week_start: ws, label: `${d}/${m}/${y}`, settlement_ids: ids });
      }
      weekList.sort((a, b) => b.week_start.localeCompare(a.week_start));
      setWeeks(weekList);
      if (weekList.length > 0 && !selectedWeek) {
        setSelectedWeek(weekList[0].week_start);
      }
    }
    setLoading(false);
  }

  // Auto-sync settlements when week changes — creates AGENT orgs for new imports
  useEffect(() => {
    if (!selectedWeek) return;
    const week = weeks.find((w) => w.week_start === selectedWeek);
    if (!week) return;

    async function syncAndLoad() {
      // Sync all settlements for this week (creates AGENT orgs per club)
      await Promise.all(
        week!.settlement_ids.map((id) => syncSettlementAgents(id).catch(() => {})),
      );
      // Now reload agent orgs (will include newly created ones)
      await loadAgentOrgs();
    }
    syncAndLoad();
  }, [selectedWeek, weeks]);

  // Load week totals when week or groups change
  useEffect(() => {
    if (!selectedWeek || groups.length === 0) return;
    loadWeekTotals();
  }, [selectedWeek, groups]);

  async function loadWeekTotals() {
    const totals = new Map<string, number>();
    await Promise.all(
      groups.map(async (g) => {
        const res = await getAgentConsolidatedSettlement(g.id, selectedWeek);
        if (res.success && res.data) {
          totals.set(g.id, res.data.total.resultado);
        }
      }),
    );
    setWeekTotals(totals);
  }

  // Select group -> load detail
  async function handleSelectGroup(group: AgentGroup) {
    setSelectedGroup(group);
    setLoadingDetail(true);
    invalidateCache('/financeiro');
    const res = await getAgentConsolidatedSettlement(group.id, selectedWeek);
    if (res.success && res.data) {
      setDetailData(res.data);
    } else {
      toast(res.error || 'Erro ao carregar dados', 'error');
    }
    setLoadingDetail(false);
  }

  // CRUD handlers
  async function handleSaveGroup(name: string, phone: string): Promise<string | null> {
    if (editingGroup) {
      const res = await updateAgentGroup(editingGroup.id, { name, phone });
      if (res.success) {
        toast('Grupo atualizado!', 'success');
        invalidateCache('/financeiro');
        await loadGroups();
        return editingGroup.id;
      } else {
        toast(res.error || 'Erro ao atualizar', 'error');
        return null;
      }
    } else {
      const res = await createAgentGroup(name, phone);
      if (res.success && res.data) {
        toast('Grupo criado!', 'success');
        invalidateCache('/financeiro');
        await loadGroups();
        return res.data.id;
      } else {
        toast(res.error || 'Erro ao criar grupo', 'error');
        return null;
      }
    }
  }

  async function handleAddMember(groupId: string, orgId: string): Promise<boolean> {
    const res = await addGroupMember(groupId, orgId);
    if (res.success) {
      invalidateCache('/financeiro');
      await loadGroups();
      return true;
    }
    toast(res.error || 'Erro ao vincular agente', 'error');
    return false;
  }

  async function handleRemoveMember(groupId: string, memberId: string): Promise<boolean> {
    const res = await removeGroupMember(groupId, memberId);
    if (res.success) {
      invalidateCache('/financeiro');
      await loadGroups();
      return true;
    }
    toast(res.error || 'Erro ao remover agente', 'error');
    return false;
  }

  async function handleDeleteGroup(group: AgentGroup) {
    if (!confirm(`Excluir grupo "${group.name}"?`)) return;
    const res = await deleteAgentGroup(group.id);
    if (res.success) {
      toast('Grupo excluido!', 'success');
      invalidateCache('/financeiro');
      setSelectedGroup(null);
      setDetailData(null);
      await loadGroups();
    } else {
      toast(res.error || 'Erro ao excluir', 'error');
    }
  }

  function openModal(group?: AgentGroup | null) {
    setEditingGroup(group || null);
    setModalOpen(true);
    loadAgentOrgs();
  }

  // Week navigation
  const currentWeekIdx = weeks.findIndex((w) => w.week_start === selectedWeek);
  function prevWeek() {
    if (currentWeekIdx < weeks.length - 1) {
      setSelectedWeek(weeks[currentWeekIdx + 1].week_start);
      setSelectedGroup(null);
      setDetailData(null);
    }
  }
  function nextWeek() {
    if (currentWeekIdx > 0) {
      setSelectedWeek(weeks[currentWeekIdx - 1].week_start);
      setSelectedGroup(null);
      setDetailData(null);
    }
  }

  // KPIs
  const totalGroups = groups.length;
  const totalMembers = groups.reduce((s, g) => s + g.members.length, 0);
  const aReceber = [...weekTotals.values()].filter((v) => v >= 0).reduce((s, v) => s + v, 0);
  const aPagar = [...weekTotals.values()].filter((v) => v < 0).reduce((s, v) => s + v, 0);

  // Mark orgs already assigned to groups
  const orgGroupMap = new Map<string, string>();
  for (const g of groups) {
    for (const m of g.members) {
      orgGroupMap.set(m.organization_id, g.name);
    }
  }
  const enrichedOrgs = allAgentOrgs.map((org) => ({
    ...org,
    already_in_group: orgGroupMap.get(org.id) || undefined,
  }));

  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <UserCheck className="w-6 h-6 text-poker-500" />
          <h1 className="text-xl font-bold text-white">Fechamento Agentes</h1>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <KpiSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <UserCheck className="w-6 h-6 text-poker-500" />
          <h1 className="text-xl font-bold text-white">Fechamento Agentes</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Week selector */}
          {weeks.length > 0 && (
            <div className="flex items-center gap-1 bg-dark-900 border border-dark-700 rounded-lg px-2 py-1">
              <button
                onClick={prevWeek}
                disabled={currentWeekIdx >= weeks.length - 1}
                className="text-dark-500 hover:text-white disabled:opacity-30 p-0.5 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={selectedWeek}
                onChange={(e) => {
                  setSelectedWeek(e.target.value);
                  setSelectedGroup(null);
                  setDetailData(null);
                }}
                className="bg-transparent text-sm text-white font-mono border-none focus:outline-none cursor-pointer px-1"
              >
                {weeks.map((w) => (
                  <option key={w.week_start} value={w.week_start} className="bg-dark-900">
                    {w.label}
                  </option>
                ))}
              </select>
              <button
                onClick={nextWeek}
                disabled={currentWeekIdx <= 0}
                className="text-dark-500 hover:text-white disabled:opacity-30 p-0.5 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* New group */}
          <button
            onClick={() => openModal()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-poker-600 hover:bg-poker-500 text-white rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo Grupo
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Grupos" value={totalGroups} accentColor="bg-poker-500" />
        <KpiCard label="Agentes Vinculados" value={totalMembers} accentColor="bg-blue-500" />
        <KpiCard label="A Receber" value={formatBRL(aReceber)} accentColor="bg-green-500" valueColor="text-green-400" />
        <KpiCard label="A Pagar" value={formatBRL(Math.abs(aPagar))} accentColor="bg-red-500" valueColor="text-red-400" />
      </div>

      {/* Content */}
      {groups.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="Nenhum grupo de agente"
          description="Crie grupos para consolidar agentes de diferentes plataformas em uma unica visao."
          action={{ label: 'Criar Primeiro Grupo', onClick: () => openModal() }}
        />
      ) : selectedGroup && detailData ? (
        <AgentGroupDetail
          data={detailData}
          logoUrl={tenantLogoUrl}
          onBack={() => { setSelectedGroup(null); setDetailData(null); }}
          onEdit={() => openModal(selectedGroup)}
          onDelete={() => handleDeleteGroup(selectedGroup)}
          onWhatsApp={() => {}}
        />
      ) : loadingDetail ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-pulse flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-dark-800" />
            <div className="h-2 w-24 bg-dark-800 rounded" />
          </div>
        </div>
      ) : (
        <AgentGroupList
          groups={groups}
          weekTotals={weekTotals}
          onSelect={handleSelectGroup}
          onDelete={handleDeleteGroup}
        />
      )}

      {/* Modal */}
      {modalOpen && (
        <AgentGroupModal
          group={editingGroup}
          allAgentOrgs={enrichedOrgs}
          onClose={() => { setModalOpen(false); setEditingGroup(null); }}
          onSave={handleSaveGroup}
          onAddMember={handleAddMember}
          onRemoveMember={handleRemoveMember}
          onDelete={editingGroup ? () => { handleDeleteGroup(editingGroup); setModalOpen(false); } : undefined}
        />
      )}
    </div>
  );
}
