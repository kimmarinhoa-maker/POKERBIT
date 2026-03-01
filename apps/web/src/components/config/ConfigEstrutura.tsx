'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  getOrgTree,
  createOrganization,
  updateOrganization,
  getPrefixRules,
  createPrefixRule,
  updatePrefixRule,
  deletePrefixRule,
  uploadClubLogo,
  deleteClubLogo,
  toggleAgentDirect,
  updateTenantConfig,
} from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import Spinner from '@/components/Spinner';
import ClubLogo from '@/components/ClubLogo';

// ─── Types ──────────────────────────────────────────────────────────

interface Org {
  id: string;
  name: string;
  external_id: string | null;
  type: string;
  parent_id: string | null;
  is_active: boolean;
  metadata?: { logo_url?: string; [key: string]: any };
  agents?: Org[];
}

interface Club extends Org {
  subclubes: (Org & { agents: Org[] })[];
}

interface PrefixRule {
  id: string;
  prefix: string;
  priority: number;
  is_active: boolean;
  organizations: { id: string; name: string };
}

// ─── Component ──────────────────────────────────────────────────────

export default function ConfigEstrutura() {
  const { hasSubclubs, setHasSubclubs, isAdmin } = useAuth();
  const [tree, setTree] = useState<Club[]>([]);
  const [prefixRules, setPrefixRules] = useState<PrefixRule[]>([]);
  const [togglingDirect, setTogglingDirect] = useState<Set<string>>(new Set());
  const [agentSubclubTab, setAgentSubclubTab] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'subclubes' | 'agentes'>('subclubes');
  const [togglingMode, setTogglingMode] = useState(false);
  const { toast } = useToast();
  const { confirm, ConfirmDialogElement } = useConfirmDialog();

  // Subclub form
  const [subForm, setSubForm] = useState<{ show: boolean; editingId: string | null; name: string; externalId: string; whatsappGroupLink: string }>(
    {
      show: false,
      editingId: null,
      name: '',
      externalId: '',
      whatsappGroupLink: '',
    },
  );
  const [subSaving, setSubSaving] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  // Prefix form
  const [pfxForm, setPfxForm] = useState<{
    show: boolean;
    editingId: string | null;
    prefix: string;
    subclubId: string;
    priority: string;
  }>({
    show: false,
    editingId: null,
    prefix: '',
    subclubId: '',
    priority: '0',
  });
  const [pfxSaving, setPfxSaving] = useState(false);
  const [pfxError, setPfxError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [treeRes, pfxRes] = await Promise.all([getOrgTree(), getPrefixRules()]);
      if (treeRes.success) setTree(treeRes.data || []);
      if (pfxRes.success) setPrefixRules(pfxRes.data || []);
    } catch {
      toast('Erro na operacao de estrutura', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived
  const club = tree[0] || null;
  const subclubes = useMemo(() => club?.subclubes || [], [club?.subclubes]);

  // ── Subclub handlers ────────────────────────────────────────────

  function openSubCreate() {
    setSubForm({ show: true, editingId: null, name: '', externalId: '', whatsappGroupLink: '' });
    setSubError(null);
  }

  function openSubEdit(sub: Org) {
    setSubForm({ show: true, editingId: sub.id, name: sub.name, externalId: sub.external_id || '', whatsappGroupLink: (sub as any).whatsapp_group_link || '' });
    setSubError(null);
  }

  function closeSubForm() {
    setSubForm({ show: false, editingId: null, name: '', externalId: '', whatsappGroupLink: '' });
    setSubError(null);
  }

  async function handleSubSave() {
    if (!subForm.name.trim()) {
      setSubError('Nome obrigatorio');
      return;
    }
    if (!club) return;

    setSubSaving(true);
    setSubError(null);
    try {
      let res;
      if (subForm.editingId) {
        res = await updateOrganization(subForm.editingId, {
          name: subForm.name.trim(),
          external_id: subForm.externalId.trim() || undefined,
          whatsapp_group_link: subForm.whatsappGroupLink.trim() || null,
        });
      } else {
        res = await createOrganization({
          name: subForm.name.trim(),
          parent_id: club.id,
          type: 'SUBCLUB',
          external_id: subForm.externalId.trim() || undefined,
        });
      }
      if (res.success) {
        closeSubForm();
        loadData();
      } else {
        setSubError(res.error || 'Erro ao salvar');
      }
    } catch (err: unknown) {
      setSubError(err instanceof Error ? err.message : 'Erro de conexao');
    } finally {
      setSubSaving(false);
    }
  }

  async function handleToggleActive(sub: Org) {
    try {
      await updateOrganization(sub.id, { is_active: !sub.is_active });
      loadData();
    } catch {
      toast('Erro na operacao de estrutura', 'error');
    }
  }

  // ── Logo handlers ─────────────────────────────────────────────
  const [uploadingLogoId, setUploadingLogoId] = useState<string | null>(null);

  async function handleLogoUpload(sub: Org, file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast('Imagem deve ter no maximo 2MB', 'error');
      return;
    }
    setUploadingLogoId(sub.id);
    try {
      const res = await uploadClubLogo(sub.id, file);
      if (res.success) {
        toast('Logo atualizado com sucesso', 'success');
        loadData();
      } else {
        toast(res.error || 'Erro ao fazer upload', 'error');
      }
    } catch {
      toast('Erro ao fazer upload do logo', 'error');
    } finally {
      setUploadingLogoId(null);
    }
  }

  async function handleLogoDelete(sub: Org) {
    const ok = await confirm({ title: 'Remover Logo', message: 'Remover o logo deste subclube?', variant: 'danger' });
    if (!ok) return;
    setUploadingLogoId(sub.id);
    try {
      const res = await deleteClubLogo(sub.id);
      if (res.success) {
        toast('Logo removido', 'success');
        loadData();
      } else {
        toast(res.error || 'Erro ao remover logo', 'error');
      }
    } catch {
      toast('Erro ao remover logo', 'error');
    } finally {
      setUploadingLogoId(null);
    }
  }

  // ── Prefix handlers ─────────────────────────────────────────────

  function openPfxCreate() {
    setPfxForm({ show: true, editingId: null, prefix: '', subclubId: subclubes[0]?.id || '', priority: '0' });
    setPfxError(null);
  }

  function openPfxEdit(rule: PrefixRule) {
    setPfxForm({
      show: true,
      editingId: rule.id,
      prefix: rule.prefix,
      subclubId: rule.organizations.id,
      priority: String(rule.priority),
    });
    setPfxError(null);
  }

  function closePfxForm() {
    setPfxForm({ show: false, editingId: null, prefix: '', subclubId: '', priority: '0' });
    setPfxError(null);
  }

  async function handlePfxSave() {
    if (!pfxForm.prefix.trim()) {
      setPfxError('Prefixo obrigatorio');
      return;
    }
    if (!pfxForm.subclubId) {
      setPfxError('Selecione um subclube');
      return;
    }

    setPfxSaving(true);
    setPfxError(null);
    try {
      let res;
      if (pfxForm.editingId) {
        res = await updatePrefixRule(pfxForm.editingId, {
          prefix: pfxForm.prefix.trim(),
          subclub_id: pfxForm.subclubId,
          priority: parseInt(pfxForm.priority) || 0,
        });
      } else {
        res = await createPrefixRule({
          prefix: pfxForm.prefix.trim(),
          subclub_id: pfxForm.subclubId,
          priority: parseInt(pfxForm.priority) || 0,
        });
      }
      if (res.success) {
        closePfxForm();
        loadData();
      } else {
        setPfxError(res.error || 'Erro ao salvar');
      }
    } catch (err: unknown) {
      setPfxError(err instanceof Error ? err.message : 'Erro de conexao');
    } finally {
      setPfxSaving(false);
    }
  }

  async function handlePfxDelete(id: string) {
    const ok = await confirm({ title: 'Excluir Regra', message: 'Excluir esta regra de prefixo?', variant: 'danger' });
    if (!ok) return;
    try {
      const res = await deletePrefixRule(id);
      if (res.success) loadData();
    } catch {
      toast('Erro na operacao de estrutura', 'error');
    }
  }

  // ── Agent direct toggle handler ──────────────────────────────────

  async function handleToggleDirect(agentId: string, agentName: string, currentIsDirect: boolean) {
    const action = currentIsDirect ? 'desmarcar' : 'marcar';
    const ok = await confirm({ title: 'Acerto Direto', message: `Deseja ${action} "${agentName}" como acerto direto?` });
    if (!ok) return;
    setTogglingDirect((prev) => new Set(prev).add(agentId));
    try {
      const res = await toggleAgentDirect(agentId, !currentIsDirect);
      if (res.success) {
        setTree((prev) =>
          prev.map((c) => ({
            ...c,
            subclubes: c.subclubes.map((sub) => ({
              ...sub,
              agents: sub.agents.map((ag) =>
                ag.id === agentId ? { ...ag, metadata: { ...ag.metadata, is_direct: !currentIsDirect } } : ag,
              ),
            })),
          })),
        );
        toast('Configuracao salva!', 'success');
      } else {
        toast(res.error || 'Erro ao alterar configuracao', 'error');
      }
    } catch {
      toast('Erro ao alterar configuracao', 'error');
    } finally {
      setTogglingDirect((prev) => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    }
  }

  // Initialize agent subclub tab to first subclub
  useEffect(() => {
    if (subclubes.length > 0 && !agentSubclubTab) {
      setAgentSubclubTab(subclubes[0].id);
    }
  }, [subclubes, agentSubclubTab]);

  // Deduped flat agent list from org tree
  const allAgentsFromTree = useMemo(() => {
    const list: { id: string; name: string; external_id: string | null; subclub_id: string; is_direct: boolean }[] = [];
    for (const sub of subclubes) {
      for (const ag of sub.agents || []) {
        list.push({
          id: ag.id,
          name: ag.name,
          external_id: ag.external_id,
          subclub_id: sub.id,
          is_direct: ag.metadata?.is_direct === true,
        });
      }
    }
    return list.filter((ag, idx, arr) => arr.findIndex((a) => a.id === ag.id) === idx);
  }, [subclubes]);

  // Agents filtered by active subclub tab + search
  const filteredAgents = useMemo(() => {
    return allAgentsFromTree
      .filter((ag) => ag.subclub_id === agentSubclubTab)
      .filter((ag) => {
        if (!agentSearch) return true;
        const q = agentSearch.toLowerCase();
        return ag.name.toLowerCase().includes(q) || (ag.external_id?.toLowerCase().includes(q) ?? false);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allAgentsFromTree, agentSubclubTab, agentSearch]);

  // Agent count per subclub (for tab badges)
  const agentCountPerSubclub = useMemo(() => {
    const map = new Map<string, number>();
    for (const ag of allAgentsFromTree) {
      map.set(ag.subclub_id, (map.get(ag.subclub_id) || 0) + 1);
    }
    return map;
  }, [allAgentsFromTree]);

  // ── Render ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  async function handleToggleSubclubs() {
    const newValue = !hasSubclubs;
    const ok = await confirm({
      title: newValue ? 'Ativar modo multi-clubes' : 'Ativar modo clube unico',
      message: newValue
        ? 'O sistema voltara a gerenciar subclubes independentes.'
        : 'O sistema operara como clube unico, sem subclubes.',
    });
    if (!ok) return;
    setTogglingMode(true);
    try {
      const res = await updateTenantConfig({ has_subclubs: newValue });
      if (res.success) {
        setHasSubclubs(newValue);
        toast(newValue ? 'Modo multi-clubes ativado' : 'Modo clube unico ativado', 'success');
      } else {
        toast(res.error || 'Erro ao atualizar modo', 'error');
      }
    } catch {
      toast('Erro ao atualizar modo', 'error');
    } finally {
      setTogglingMode(false);
    }
  }

  return (
    <div>
      {/* SaaS mode toggle */}
      {isAdmin && (
        <div className="card mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-dark-200">Modo de Operacao</h3>
            <p className="text-xs text-dark-500 mt-0.5">
              {hasSubclubs
                ? 'Multi-clubes: gerencie subclubes independentes'
                : 'Clube unico: operacao simplificada sem subclubes'}
            </p>
          </div>
          <button
            onClick={handleToggleSubclubs}
            disabled={togglingMode}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
              hasSubclubs ? 'bg-poker-600' : 'bg-dark-700'
            }`}
            title={hasSubclubs ? 'Desativar subclubes' : 'Ativar subclubes'}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                hasSubclubs ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}

      {/* Sub-tabs: Sub Clubes | Agentes — pill style */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setSubTab('subclubes')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
            subTab === 'subclubes'
              ? 'bg-poker-600 border-poker-600 text-white'
              : 'bg-transparent border-dark-600 text-dark-400 hover:border-dark-500 hover:text-dark-200'
          }`}
        >
          Sub Clubes
        </button>
        <button
          onClick={() => setSubTab('agentes')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
            subTab === 'agentes'
              ? 'bg-poker-600 border-poker-600 text-white'
              : 'bg-transparent border-dark-600 text-dark-400 hover:border-dark-500 hover:text-dark-200'
          }`}
        >
          Agentes
        </button>
      </div>

      {subTab === 'subclubes' ? (
        <>
          {/* ══ SUBCLUBES ══════════════════════════════════════════════════ */}
          <div className="card mb-8">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-dark-700/60">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">Subclubes</h3>
                <span className="text-xs text-dark-500">({subclubes.length})</span>
              </div>
              <button
                onClick={openSubCreate}
                className="btn-primary text-xs px-3 py-1.5"
                aria-label="Criar novo subclube"
              >
                + Novo Subclube
              </button>
            </div>

            {/* Subclub create/edit form */}
            {subForm.show && (
              <div className="bg-dark-800/50 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-semibold text-dark-200 mb-3">
                  {subForm.editingId ? 'Editar Subclube' : 'Novo Subclube'}
                </h4>
                {subError && (
                  <div className="mb-3 bg-red-900/30 border border-red-700/50 rounded-lg p-2 text-red-300 text-xs">
                    {subError}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-dark-400 mb-1 block">Nome *</label>
                    <input
                      type="text"
                      value={subForm.name}
                      onChange={(e) => setSubForm((p) => ({ ...p, name: e.target.value }))}
                      className="input w-full text-sm"
                      placeholder="Ex: IMPERIO"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs text-dark-400 mb-1 block">External ID</label>
                    <input
                      type="text"
                      value={subForm.externalId}
                      onChange={(e) => setSubForm((p) => ({ ...p, externalId: e.target.value }))}
                      className="input w-full text-sm"
                      placeholder="Opcional"
                    />
                  </div>
                </div>
                {subForm.editingId && (
                  <div className="mt-3">
                    <label className="text-xs text-dark-400 mb-1 block">Link do Grupo WhatsApp</label>
                    <input
                      type="url"
                      value={subForm.whatsappGroupLink}
                      onChange={(e) => setSubForm((p) => ({ ...p, whatsappGroupLink: e.target.value }))}
                      className="input w-full text-sm"
                      placeholder="https://chat.whatsapp.com/ABC123..."
                    />
                    <p className="text-[10px] text-dark-600 mt-1">Cole o link de convite do grupo aqui</p>
                  </div>
                )}
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={closeSubForm}
                    disabled={subSaving}
                    className="px-3 py-1.5 text-dark-400 hover:text-white text-xs transition-colors"
                    aria-label="Cancelar edicao de subclube"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubSave}
                    disabled={subSaving}
                    className="btn-primary text-xs px-4 py-1.5"
                    aria-label="Salvar subclube"
                  >
                    {subSaving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            )}

            {/* Subclub table */}
            {subclubes.length === 0 ? (
              <p className="text-dark-500 text-sm py-4 text-center">
                Nenhum subclube cadastrado. Clique em &quot;+ Novo Subclube&quot; para criar.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm data-table">
                  <thead>
                    <tr className="border-b border-dark-700/40">
                      <th className="text-center py-2 px-2 text-xs text-dark-500 font-medium w-16">Logo</th>
                      <th className="text-left py-2 px-2 text-xs text-dark-500 font-medium">Nome</th>
                      <th className="text-left py-2 px-2 text-xs text-dark-500 font-medium">External ID</th>
                      <th className="text-center py-2 px-2 text-xs text-dark-500 font-medium">Agentes</th>
                      <th className="text-center py-2 px-2 text-xs text-dark-500 font-medium">Status</th>
                      <th className="text-right py-2 px-2 text-xs text-dark-500 font-medium">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subclubes.map((sub) => (
                      <tr key={sub.id} className="border-b border-dark-800/30 hover:bg-dark-800/20 transition-colors">
                        <td className="py-2.5 px-2 text-center">
                          <div className="relative group inline-flex items-center justify-center">
                            <ClubLogo logoUrl={sub.metadata?.logo_url} name={sub.name} size="sm" />
                            {/* Upload overlay */}
                            <label
                              className="absolute inset-0 rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
                              title={sub.metadata?.logo_url ? 'Trocar logo' : 'Upload logo'}
                            >
                              {uploadingLogoId === sub.id ? (
                                <Spinner size="sm" variant="white" />
                              ) : (
                                <span className="text-white text-xs">Upload</span>
                              )}
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleLogoUpload(sub, f);
                                  e.target.value = '';
                                }}
                                disabled={uploadingLogoId === sub.id}
                              />
                            </label>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-white font-medium">{sub.name}</td>
                        <td className="py-2.5 px-2 text-dark-400 font-mono text-xs">{sub.external_id || '—'}</td>
                        <td className="py-2.5 px-2 text-center text-dark-300">{sub.agents?.length || 0}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              sub.is_active
                                ? 'bg-green-500/20 text-green-400 border-green-500/40'
                                : 'bg-dark-700/30 text-dark-500 border-dark-600/40'
                            }`}
                          >
                            {sub.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {sub.metadata?.logo_url && (
                              <button
                                onClick={() => handleLogoDelete(sub)}
                                className="text-dark-500 hover:text-red-400 text-xs transition-colors"
                                aria-label={`Remover logo ${sub.name}`}
                                disabled={uploadingLogoId === sub.id}
                              >
                                Rm Logo
                              </button>
                            )}
                            <button
                              onClick={() => openSubEdit(sub)}
                              className="text-dark-400 hover:text-poker-400 text-xs transition-colors"
                              aria-label={`Editar subclube ${sub.name}`}
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleToggleActive(sub)}
                              className={`text-xs transition-colors ${
                                sub.is_active
                                  ? 'text-dark-500 hover:text-yellow-400'
                                  : 'text-dark-500 hover:text-green-400'
                              }`}
                              aria-label={
                                sub.is_active ? `Desativar subclube ${sub.name}` : `Ativar subclube ${sub.name}`
                              }
                            >
                              {sub.is_active ? 'Desativar' : 'Ativar'}
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

          {/* ══ REGRAS DE PREFIXO ══════════════════════════════════════════ */}
          <div className="card mb-8">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-dark-700/60">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">Regras de Prefixo</h3>
                <span className="text-xs text-dark-500">({prefixRules.length})</span>
              </div>
              <button
                onClick={openPfxCreate}
                className="btn-primary text-xs px-3 py-1.5"
                disabled={subclubes.length === 0}
                aria-label="Criar nova regra de prefixo"
              >
                + Nova Regra
              </button>
            </div>

            {/* Prefix create/edit form */}
            {pfxForm.show && (
              <div className="bg-dark-800/50 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-semibold text-dark-200 mb-3">
                  {pfxForm.editingId ? 'Editar Regra' : 'Nova Regra de Prefixo'}
                </h4>
                {pfxError && (
                  <div className="mb-3 bg-red-900/30 border border-red-700/50 rounded-lg p-2 text-red-300 text-xs">
                    {pfxError}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-dark-400 mb-1 block">Prefixo *</label>
                    <input
                      type="text"
                      value={pfxForm.prefix}
                      onChange={(e) => setPfxForm((p) => ({ ...p, prefix: e.target.value }))}
                      className="input w-full text-sm font-mono"
                      placeholder="Ex: AG, TGP"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs text-dark-400 mb-1 block">Subclube *</label>
                    <select
                      value={pfxForm.subclubId}
                      onChange={(e) => setPfxForm((p) => ({ ...p, subclubId: e.target.value }))}
                      className="input w-full text-sm"
                    >
                      <option value="">Selecione...</option>
                      {subclubes
                        .filter((s) => s.is_active)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-dark-400 mb-1 block">Prioridade</label>
                    <input
                      type="number"
                      value={pfxForm.priority}
                      onChange={(e) => setPfxForm((p) => ({ ...p, priority: e.target.value }))}
                      className="input w-full text-sm font-mono"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={closePfxForm}
                    disabled={pfxSaving}
                    className="px-3 py-1.5 text-dark-400 hover:text-white text-xs transition-colors"
                    aria-label="Cancelar edicao de regra de prefixo"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handlePfxSave}
                    disabled={pfxSaving}
                    className="btn-primary text-xs px-4 py-1.5"
                    aria-label="Salvar regra de prefixo"
                  >
                    {pfxSaving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            )}

            {/* Prefix table */}
            {prefixRules.length === 0 ? (
              <p className="text-dark-500 text-sm py-4 text-center">
                Nenhuma regra de prefixo cadastrada. Regras mapeiam prefixos de agentes para subclubes.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm data-table">
                  <thead>
                    <tr className="border-b border-dark-700/40">
                      <th className="text-left py-2 px-2 text-xs text-dark-500 font-medium">Prefixo</th>
                      <th className="text-left py-2 px-2 text-xs text-dark-500 font-medium">Subclube</th>
                      <th className="text-center py-2 px-2 text-xs text-dark-500 font-medium">Prioridade</th>
                      <th className="text-right py-2 px-2 text-xs text-dark-500 font-medium">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prefixRules.map((rule) => (
                      <tr key={rule.id} className="border-b border-dark-800/30 hover:bg-dark-800/20 transition-colors">
                        <td className="py-2.5 px-2">
                          <span className="font-mono text-poker-400 bg-poker-900/20 px-2 py-0.5 rounded text-xs font-bold">
                            {rule.prefix}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-white">{rule.organizations.name}</td>
                        <td className="py-2.5 px-2 text-center text-dark-400 font-mono">{rule.priority}</td>
                        <td className="py-2.5 px-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openPfxEdit(rule)}
                              className="text-dark-400 hover:text-poker-400 text-xs transition-colors"
                              aria-label={`Editar regra de prefixo ${rule.prefix}`}
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handlePfxDelete(rule.id)}
                              className="text-dark-500 hover:text-red-400 text-xs transition-colors"
                              aria-label={`Remover regra de prefixo ${rule.prefix}`}
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
        </>
      ) : (
        <>
          {/* ══ AGENTES ═══════════════════════════════════════════════════════ */}
          <div className="card mb-8">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-dark-700/60">
              <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">Agentes</h3>
            </div>

            {/* Subclub selector tabs */}
            {subclubes.length > 0 && (
              <div className="flex gap-2 mb-4 flex-wrap">
                {subclubes.map((sc) => (
                  <button
                    key={sc.id}
                    onClick={() => setAgentSubclubTab(sc.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-200 ${
                      agentSubclubTab === sc.id
                        ? 'bg-poker-900/20 border-poker-500 text-poker-400'
                        : 'bg-dark-800 border-dark-700 text-dark-400 hover:border-poker-500/50 hover:text-poker-400'
                    }`}
                  >
                    {sc.name}
                    <span className="ml-2 text-xs font-mono opacity-60">{agentCountPerSubclub.get(sc.id) || 0}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Search */}
            <input
              placeholder="Buscar por nome ou ID..."
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-4 py-2 text-sm text-dark-100 placeholder:text-dark-500 mb-4 focus:border-poker-500 focus:outline-none"
            />

            {/* Agent table */}
            {filteredAgents.length === 0 ? (
              <p className="text-dark-500 text-sm py-4 text-center">
                {allAgentsFromTree.length === 0
                  ? 'Nenhum agente cadastrado. Agentes sao criados automaticamente durante a importacao.'
                  : 'Nenhum agente encontrado para o filtro atual.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm data-table">
                  <thead>
                    <tr className="text-xs text-dark-500 uppercase tracking-widest border-b border-dark-700">
                      <th className="text-left px-4 py-3">Nome</th>
                      <th className="text-left px-4 py-3">ID</th>
                      <th className="text-center px-4 py-3">Acertar Diretamente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgents.map((ag) => {
                      const isToggling = togglingDirect.has(ag.id);
                      return (
                        <tr key={ag.id} className="border-b border-dark-800 hover:bg-dark-800/30 transition-colors">
                          <td className="px-4 py-3 text-dark-100">{ag.name}</td>
                          <td className="px-4 py-3 font-mono text-dark-400 text-xs">{ag.id.slice(0, 8)}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleToggleDirect(ag.id, ag.name, ag.is_direct)}
                              disabled={isToggling}
                              aria-label={
                                ag.is_direct ? `Desmarcar ${ag.name} como direto` : `Marcar ${ag.name} como direto`
                              }
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                                isToggling
                                  ? 'bg-dark-600 animate-pulse cursor-wait'
                                  : ag.is_direct
                                    ? 'bg-poker-600 cursor-pointer'
                                    : 'bg-dark-600 cursor-pointer hover:bg-dark-500'
                              }`}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                                  ag.is_direct ? 'translate-x-4' : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer */}
            <div className="text-xs text-dark-500 text-right mt-2">
              {filteredAgents.length} agentes
              {agentSearch && ` encontrados para "${agentSearch}"`}
            </div>
          </div>
        </>
      )}

      {ConfirmDialogElement}
    </div>
  );
}
