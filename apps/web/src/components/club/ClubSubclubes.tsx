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
} from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import Spinner from '@/components/Spinner';
import TableSkeleton from '@/components/ui/TableSkeleton';
import ClubLogo from '@/components/ClubLogo';
import EmptyState from '@/components/ui/EmptyState';
import { Network } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

interface Org {
  id: string;
  name: string;
  external_id: string | null;
  type: string;
  parent_id: string | null;
  is_active: boolean;
  logo_url?: string | null;
  metadata?: { logo_url?: string; is_direct?: boolean; [key: string]: any };
  agents?: Org[];
  whatsapp_group_link?: string | null;
  chippix_manager_id?: string | null;
}

interface PrefixRule {
  id: string;
  prefix: string;
  priority: number;
  is_active: boolean;
  organizations: { id: string; name: string };
}

interface Props {
  clubId: string;
}

export default function ClubSubclubes({ clubId }: Props) {
  const [subclubes, setSubclubes] = useState<(Org & { agents: Org[] })[]>([]);
  const [prefixRules, setPrefixRules] = useState<PrefixRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'subclubes' | 'agentes' | 'prefixos'>('subclubes');
  const { toast } = useToast();
  const { confirm, ConfirmDialogElement } = useConfirmDialog();

  // Subclub form
  const [subForm, setSubForm] = useState<{
    show: boolean; editingId: string | null; name: string; externalId: string;
    whatsappGroupLink: string; chippixManagerId: string;
  }>({ show: false, editingId: null, name: '', externalId: '', whatsappGroupLink: '', chippixManagerId: '' });
  const [subSaving, setSubSaving] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  // Prefix form
  const [pfxForm, setPfxForm] = useState<{
    show: boolean; editingId: string | null; prefix: string; subclubId: string; priority: string;
  }>({ show: false, editingId: null, prefix: '', subclubId: '', priority: '0' });
  const [pfxSaving, setPfxSaving] = useState(false);
  const [pfxError, setPfxError] = useState<string | null>(null);

  // Agent state
  const [togglingDirect, setTogglingDirect] = useState<Set<string>>(new Set());
  const [agentSubclubTab, setAgentSubclubTab] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [uploadingLogoId, setUploadingLogoId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [treeRes, pfxRes] = await Promise.all([getOrgTree(), getPrefixRules()]);
      if (treeRes.success && treeRes.data) {
        const club = treeRes.data.find((c: any) => c.id === clubId);
        setSubclubes(club?.subclubes || []);
      }
      if (pfxRes.success) setPrefixRules(pfxRes.data || []);
    } catch {
      toast('Erro ao carregar subclubes', 'error');
    } finally {
      setLoading(false);
    }
  }, [clubId, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Initialize agent subclub tab
  useEffect(() => {
    if (subclubes.length > 0 && !agentSubclubTab) setAgentSubclubTab(subclubes[0].id);
  }, [subclubes, agentSubclubTab]);

  // ── Subclub handlers ────────────────────────────────────────────

  function openSubCreate() {
    setSubForm({ show: true, editingId: null, name: '', externalId: '', whatsappGroupLink: '', chippixManagerId: '' });
    setSubError(null);
  }

  function openSubEdit(sub: Org) {
    setSubForm({
      show: true, editingId: sub.id, name: sub.name,
      externalId: sub.external_id || '',
      whatsappGroupLink: sub.whatsapp_group_link || '',
      chippixManagerId: sub.chippix_manager_id || '',
    });
    setSubError(null);
  }

  function closeSubForm() {
    setSubForm({ show: false, editingId: null, name: '', externalId: '', whatsappGroupLink: '', chippixManagerId: '' });
    setSubError(null);
  }

  async function handleSubSave() {
    if (!subForm.name.trim()) { setSubError('Nome obrigatorio'); return; }
    setSubSaving(true);
    setSubError(null);
    try {
      let res;
      if (subForm.editingId) {
        res = await updateOrganization(subForm.editingId, {
          name: subForm.name.trim(),
          external_id: subForm.externalId.trim() || undefined,
          whatsapp_group_link: subForm.whatsappGroupLink.trim() || null,
          chippix_manager_id: subForm.chippixManagerId.trim() || null,
        });
      } else {
        res = await createOrganization({
          name: subForm.name.trim(),
          parent_id: clubId,
          type: 'SUBCLUB',
          external_id: subForm.externalId.trim() || undefined,
        });
      }
      if (res.success) { closeSubForm(); loadData(); }
      else setSubError(res.error || 'Erro ao salvar');
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
      toast('Erro ao alterar status', 'error');
    }
  }

  // ── Logo handlers ─────────────────────────────────────────────

  async function handleLogoUpload(sub: Org, file: File) {
    if (file.size > 2 * 1024 * 1024) { toast('Imagem deve ter no maximo 2MB', 'error'); return; }
    setUploadingLogoId(sub.id);
    try {
      const res = await uploadClubLogo(sub.id, file);
      if (res.success) { toast('Logo atualizado', 'success'); loadData(); }
      else toast(res.error || 'Erro ao fazer upload', 'error');
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
      if (res.success) { toast('Logo removido', 'success'); loadData(); }
      else toast(res.error || 'Erro ao remover logo', 'error');
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
    setPfxForm({ show: true, editingId: rule.id, prefix: rule.prefix, subclubId: rule.organizations.id, priority: String(rule.priority) });
    setPfxError(null);
  }

  function closePfxForm() {
    setPfxForm({ show: false, editingId: null, prefix: '', subclubId: '', priority: '0' });
    setPfxError(null);
  }

  async function handlePfxSave() {
    if (!pfxForm.prefix.trim()) { setPfxError('Prefixo obrigatorio'); return; }
    if (!pfxForm.subclubId) { setPfxError('Selecione um subclube'); return; }
    setPfxSaving(true);
    setPfxError(null);
    try {
      let res;
      if (pfxForm.editingId) {
        res = await updatePrefixRule(pfxForm.editingId, { prefix: pfxForm.prefix.trim(), subclub_id: pfxForm.subclubId, priority: parseInt(pfxForm.priority) || 0 });
      } else {
        res = await createPrefixRule({ prefix: pfxForm.prefix.trim(), subclub_id: pfxForm.subclubId, priority: parseInt(pfxForm.priority) || 0 });
      }
      if (res.success) { closePfxForm(); loadData(); }
      else setPfxError(res.error || 'Erro ao salvar');
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
      toast('Erro ao excluir regra', 'error');
    }
  }

  // ── Agent direct toggle ──────────────────────────────────────────

  async function handleToggleDirect(agentId: string, agentName: string, currentIsDirect: boolean) {
    const action = currentIsDirect ? 'desmarcar' : 'marcar';
    const ok = await confirm({ title: 'Acerto Direto', message: `Deseja ${action} "${agentName}" como acerto direto?` });
    if (!ok) return;
    setTogglingDirect((prev) => new Set(prev).add(agentId));
    try {
      const res = await toggleAgentDirect(agentId, !currentIsDirect);
      if (res.success) { toast('Configuracao salva!', 'success'); loadData(); }
      else toast(res.error || 'Erro', 'error');
    } catch {
      toast('Erro ao alterar configuracao', 'error');
    } finally {
      setTogglingDirect((prev) => { const n = new Set(prev); n.delete(agentId); return n; });
    }
  }

  // Derived
  const allAgentsFromTree = useMemo(() => {
    const list: { id: string; name: string; external_id: string | null; subclub_id: string; is_direct: boolean }[] = [];
    for (const sub of subclubes) {
      for (const ag of sub.agents || []) {
        list.push({ id: ag.id, name: ag.name, external_id: ag.external_id, subclub_id: sub.id, is_direct: ag.metadata?.is_direct === true });
      }
    }
    return list.filter((ag, idx, arr) => arr.findIndex((a) => a.id === ag.id) === idx);
  }, [subclubes]);

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

  const agentCountPerSubclub = useMemo(() => {
    const map = new Map<string, number>();
    for (const ag of allAgentsFromTree) map.set(ag.subclub_id, (map.get(ag.subclub_id) || 0) + 1);
    return map;
  }, [allAgentsFromTree]);

  // ── Render ──────────────────────────────────────────────────────

  if (loading) return <div className="p-4 lg:p-6"><TableSkeleton columns={6} rows={4} /></div>;

  if (subclubes.length === 0) {
    return (
      <div className="p-4 lg:p-6 animate-tab-fade">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white">Subclubes</h3>
            <p className="text-dark-500 text-xs mt-0.5">Nenhum subclube cadastrado</p>
          </div>
          <button onClick={openSubCreate} className="btn-primary text-xs px-3 py-1.5">+ Novo Subclube</button>
        </div>

        {subForm.show && renderSubForm()}

        <div className="card">
          <EmptyState
            icon={Network}
            title="Sem subclubes"
            description="Subclubes sao detectados automaticamente pelas siglas dos agentes na planilha, ou voce pode criar manualmente."
            action={{ label: '+ Novo Subclube', onClick: openSubCreate }}
          />
        </div>
        {ConfirmDialogElement}
      </div>
    );
  }

  function renderSubForm() {
    if (!subForm.show) return null;
    return (
      <div className="bg-dark-800/50 rounded-lg p-4 mb-4">
        <h4 className="text-sm font-semibold text-dark-200 mb-3">
          {subForm.editingId ? 'Editar Subclube' : 'Novo Subclube'}
        </h4>
        {subError && <div className="mb-3 bg-red-900/30 border border-red-700/50 rounded-lg p-2 text-red-300 text-xs">{subError}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-dark-400 mb-1 block">Nome *</label>
            <input type="text" value={subForm.name} onChange={(e) => setSubForm((p) => ({ ...p, name: e.target.value }))} className="input w-full text-sm" placeholder="Ex: IMPERIO" autoFocus />
          </div>
          <div>
            <label className="text-xs text-dark-400 mb-1 block">External ID</label>
            <input type="text" value={subForm.externalId} onChange={(e) => setSubForm((p) => ({ ...p, externalId: e.target.value }))} className="input w-full text-sm" placeholder="Opcional" />
          </div>
        </div>
        {subForm.editingId && (
          <>
            <div className="mt-3">
              <label className="text-xs text-dark-400 mb-1 block">ChipPix Manager ID</label>
              <div className="flex items-stretch">
                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-dark-600 bg-dark-800 text-dark-400 text-sm font-mono select-none">Chippix_</span>
                <input type="text" value={subForm.chippixManagerId.replace(/^[Cc]hippix_/i, '')}
                  onChange={(e) => { const num = e.target.value.replace(/^[Cc]hippix_/i, '').trim(); setSubForm((p) => ({ ...p, chippixManagerId: num ? `Chippix_${num}` : '' })); }}
                  className="input w-full text-sm font-mono rounded-l-none" placeholder="143" />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs text-dark-400 mb-1 block">Link do Grupo WhatsApp</label>
              <input type="url" value={subForm.whatsappGroupLink} onChange={(e) => setSubForm((p) => ({ ...p, whatsappGroupLink: e.target.value }))} className="input w-full text-sm" placeholder="https://chat.whatsapp.com/ABC123..." />
            </div>
          </>
        )}
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={closeSubForm} disabled={subSaving} className="px-3 py-1.5 text-dark-400 hover:text-white text-xs transition-colors">Cancelar</button>
          <button onClick={handleSubSave} disabled={subSaving} className="btn-primary text-xs px-4 py-1.5">{subSaving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 animate-tab-fade">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-white">Subclubes</h3>
          <p className="text-dark-500 text-xs mt-0.5">{subclubes.length} subclube{subclubes.length !== 1 ? 's' : ''} cadastrado{subclubes.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6">
        {(['subclubes', 'agentes', 'prefixos'] as const).map((t) => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              subTab === t ? 'bg-poker-600 border-poker-600 text-white' : 'bg-transparent border-dark-600 text-dark-400 hover:border-dark-500'
            }`}>
            {t === 'subclubes' ? 'Subclubes' : t === 'agentes' ? 'Agentes' : 'Prefixos'}
          </button>
        ))}
      </div>

      {subTab === 'subclubes' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-dark-700/60">
            <span className="text-xs text-dark-500">{subclubes.length} subclube{subclubes.length !== 1 ? 's' : ''}</span>
            <button onClick={openSubCreate} className="btn-primary text-xs px-3 py-1.5">+ Novo Subclube</button>
          </div>

          {renderSubForm()}

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
                        <ClubLogo logoUrl={sub.logo_url || sub.metadata?.logo_url} name={sub.name} size="sm" />
                        <label className="absolute inset-0 rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                          {uploadingLogoId === sub.id ? <Spinner size="sm" variant="white" /> : <span className="text-white text-xs">Upload</span>}
                          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(sub, f); e.target.value = ''; }}
                            disabled={uploadingLogoId === sub.id} />
                        </label>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-white font-medium">{sub.name}</td>
                    <td className="py-2.5 px-2 text-dark-400 font-mono text-xs">{sub.external_id || '—'}</td>
                    <td className="py-2.5 px-2 text-center text-dark-300">{sub.agents?.length || 0}</td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${sub.is_active ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-dark-700/30 text-dark-500 border-dark-600/40'}`}>
                        {sub.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {(sub.logo_url || sub.metadata?.logo_url) && (
                          <button onClick={() => handleLogoDelete(sub)} className="text-dark-500 hover:text-red-400 text-xs transition-colors" disabled={uploadingLogoId === sub.id}>Rm Logo</button>
                        )}
                        <button onClick={() => openSubEdit(sub)} className="text-dark-400 hover:text-poker-400 text-xs transition-colors">Editar</button>
                        <button onClick={() => handleToggleActive(sub)} className={`text-xs transition-colors ${sub.is_active ? 'text-dark-500 hover:text-yellow-400' : 'text-dark-500 hover:text-green-400'}`}>
                          {sub.is_active ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'agentes' && (
        <div className="card">
          {subclubes.length > 0 && (
            <div className="flex gap-2 mb-4 flex-wrap">
              {subclubes.map((sc) => (
                <button key={sc.id} onClick={() => setAgentSubclubTab(sc.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                    agentSubclubTab === sc.id ? 'bg-poker-900/20 border-poker-500 text-poker-400' : 'bg-dark-800 border-dark-700 text-dark-400 hover:border-poker-500/50'
                  }`}>
                  {sc.name}
                  <span className="ml-2 text-xs font-mono opacity-60">{agentCountPerSubclub.get(sc.id) || 0}</span>
                </button>
              ))}
            </div>
          )}
          <input placeholder="Buscar por nome ou ID..." value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)}
            className="w-full bg-dark-800 border border-dark-700 rounded-lg px-4 py-2 text-sm text-dark-100 placeholder:text-dark-500 mb-4 focus:border-poker-500 focus:outline-none" />
          {filteredAgents.length === 0 ? (
            <p className="text-dark-500 text-sm py-4 text-center">
              {allAgentsFromTree.length === 0 ? 'Nenhum agente cadastrado.' : 'Nenhum agente encontrado para o filtro atual.'}
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
                          <button onClick={() => handleToggleDirect(ag.id, ag.name, ag.is_direct)} disabled={isToggling}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              isToggling ? 'bg-dark-600 animate-pulse cursor-wait' : ag.is_direct ? 'bg-poker-600 cursor-pointer' : 'bg-dark-600 cursor-pointer hover:bg-dark-500'
                            }`}>
                            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${ag.is_direct ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="text-xs text-dark-500 text-right mt-2">{filteredAgents.length} agentes</div>
        </div>
      )}

      {subTab === 'prefixos' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-dark-700/60">
            <span className="text-xs text-dark-500">{prefixRules.length} regra{prefixRules.length !== 1 ? 's' : ''}</span>
            <button onClick={openPfxCreate} className="btn-primary text-xs px-3 py-1.5" disabled={subclubes.length === 0}>+ Nova Regra</button>
          </div>

          {pfxForm.show && (
            <div className="bg-dark-800/50 rounded-lg p-4 mb-4">
              <h4 className="text-sm font-semibold text-dark-200 mb-3">{pfxForm.editingId ? 'Editar Regra' : 'Nova Regra de Prefixo'}</h4>
              {pfxError && <div className="mb-3 bg-red-900/30 border border-red-700/50 rounded-lg p-2 text-red-300 text-xs">{pfxError}</div>}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-dark-400 mb-1 block">Prefixo *</label>
                  <input type="text" value={pfxForm.prefix} onChange={(e) => setPfxForm((p) => ({ ...p, prefix: e.target.value }))} className="input w-full text-sm font-mono" placeholder="Ex: AG, TGP" autoFocus />
                </div>
                <div>
                  <label className="text-xs text-dark-400 mb-1 block">Subclube *</label>
                  <select value={pfxForm.subclubId} onChange={(e) => setPfxForm((p) => ({ ...p, subclubId: e.target.value }))} className="input w-full text-sm">
                    <option value="">Selecione...</option>
                    {subclubes.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-dark-400 mb-1 block">Prioridade</label>
                  <input type="number" value={pfxForm.priority} onChange={(e) => setPfxForm((p) => ({ ...p, priority: e.target.value }))} className="input w-full text-sm font-mono" placeholder="0" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={closePfxForm} disabled={pfxSaving} className="px-3 py-1.5 text-dark-400 hover:text-white text-xs transition-colors">Cancelar</button>
                <button onClick={handlePfxSave} disabled={pfxSaving} className="btn-primary text-xs px-4 py-1.5">{pfxSaving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </div>
          )}

          {prefixRules.length === 0 ? (
            <p className="text-dark-500 text-sm py-4 text-center">Nenhuma regra de prefixo. Regras mapeiam prefixos de agentes para subclubes.</p>
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
                      <td className="py-2.5 px-2"><span className="font-mono text-poker-400 bg-poker-900/20 px-2 py-0.5 rounded text-xs font-bold">{rule.prefix}</span></td>
                      <td className="py-2.5 px-2 text-white">{rule.organizations.name}</td>
                      <td className="py-2.5 px-2 text-center text-dark-400 font-mono">{rule.priority}</td>
                      <td className="py-2.5 px-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openPfxEdit(rule)} className="text-dark-400 hover:text-poker-400 text-xs transition-colors">Editar</button>
                          <button onClick={() => handlePfxDelete(rule.id)} className="text-dark-500 hover:text-red-400 text-xs transition-colors">Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {ConfirmDialogElement}
    </div>
  );
}
