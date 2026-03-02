'use client';

import { useEffect, useState, useMemo } from 'react';
import { getOrgTree, updateOrgMetadata, updateOrganization } from '@/lib/api';
import { useToast } from '@/components/Toast';
import KpiSkeleton from '@/components/ui/KpiSkeleton';
import TableSkeleton from '@/components/ui/TableSkeleton';
import KpiCard from '@/components/ui/KpiCard';
import EmptyState from '@/components/ui/EmptyState';
import { Building2, Check, X } from 'lucide-react';

const PLATFORM_OPTIONS = [
  { value: 'suprema', label: 'Suprema Poker' },
  { value: 'pppoker', label: 'PPPoker' },
  { value: 'clubgg', label: 'ClubGG' },
];

export default function ClubsPage() {
  const [tree, setTree] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const [savingPlatform, setSavingPlatform] = useState<string | null>(null);
  const [editingExtId, setEditingExtId] = useState<string | null>(null);
  const [extIdInput, setExtIdInput] = useState('');
  const [savingExtId, setSavingExtId] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTree() {
    try {
      const res = await getOrgTree();
      if (res.success) {
        setTree(res.data || []);
      } else {
        toast(res.error || 'Erro ao carregar clubes', 'error');
      }
    } catch {
      toast('Erro de conexao com o servidor', 'error');
    } finally {
      setLoading(false);
    }
  }

  // KPIs
  const kpis = useMemo(() => {
    let subclubes = 0,
      agents = 0;
    for (const club of tree) {
      const subs = club.subclubes || [];
      subclubes += subs.length;
      for (const sub of subs) {
        agents += sub.agents?.length || 0;
      }
    }
    return { clubs: tree.length, subclubes, agents };
  }, [tree]);

  function toggleExpand(subId: string) {
    setExpandedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  }

  async function handlePlatformChange(clubId: string, platform: string) {
    setSavingPlatform(clubId);
    try {
      const res = await updateOrgMetadata(clubId, { platform });
      if (res.success) {
        setTree((prev) =>
          prev.map((c) =>
            c.id === clubId
              ? { ...c, metadata: { ...(c.metadata || {}), platform } }
              : c,
          ),
        );
        toast('Plataforma atualizada', 'success');
      } else {
        toast(res.error || 'Erro ao atualizar plataforma', 'error');
      }
    } catch {
      toast('Erro ao atualizar plataforma', 'error');
    } finally {
      setSavingPlatform(null);
    }
  }

  function startEditExtId(clubId: string, currentValue: string) {
    setEditingExtId(clubId);
    setExtIdInput(currentValue || '');
  }

  async function handleSaveExternalId(clubId: string) {
    setSavingExtId(true);
    try {
      const res = await updateOrganization(clubId, { external_id: extIdInput.trim() });
      if (res.success) {
        setTree((prev) =>
          prev.map((c) =>
            c.id === clubId
              ? { ...c, external_id: extIdInput.trim() || null }
              : c,
          ),
        );
        setEditingExtId(null);
        toast('ID do clube atualizado', 'success');
      } else {
        toast(res.error || 'Erro ao atualizar ID', 'error');
      }
    } catch {
      toast('Erro ao atualizar ID', 'error');
    } finally {
      setSavingExtId(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-8 max-w-5xl animate-tab-fade">
        <div className="mb-6">
          <div className="h-7 skeleton-shimmer w-48 mb-2" />
          <div className="h-4 skeleton-shimmer w-36" />
        </div>
        <KpiSkeleton count={3} />
        <TableSkeleton columns={4} rows={5} />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl lg:text-2xl font-bold text-white">Clubes e Subclubes</h2>
        <p className="text-dark-400 text-sm">Hierarquia de organizacoes</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <KpiCard label="Clubes" value={kpis.clubs} accentColor="bg-poker-500" valueColor="text-poker-400" />
        <KpiCard label="Subclubes" value={kpis.subclubes} accentColor="bg-blue-500" valueColor="text-blue-400" />
        <KpiCard label="Agentes" value={kpis.agents} accentColor="bg-amber-500" valueColor="text-amber-400" />
      </div>

      {tree.length === 0 ? (
        <div className="card">
          <EmptyState icon={Building2} title="Nenhum clube" description="Configure a estrutura em Configuracoes > Estrutura" />
        </div>
      ) : (
        <div className="space-y-6">
          {tree.map((club) => (
            <div key={club.id} className="card">
              {/* Club header */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4 pb-4 border-b border-dark-700">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white">{club.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {editingExtId === club.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-dark-500">ID:</span>
                        <input
                          type="text"
                          value={extIdInput}
                          onChange={(e) => setExtIdInput(e.target.value)}
                          className="input text-xs py-0.5 px-2 w-32 font-mono"
                          placeholder="ID do clube"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveExternalId(club.id);
                            if (e.key === 'Escape') setEditingExtId(null);
                          }}
                        />
                        <button
                          onClick={() => handleSaveExternalId(club.id)}
                          disabled={savingExtId}
                          className="text-green-400 hover:text-green-300 transition-colors"
                          aria-label="Salvar ID"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setEditingExtId(null)}
                          className="text-dark-500 hover:text-dark-300 transition-colors"
                          aria-label="Cancelar"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-dark-400">
                        ID:{' '}
                        <button
                          onClick={() => startEditExtId(club.id, club.external_id || '')}
                          className="font-mono text-poker-400 hover:text-poker-300 transition-colors cursor-pointer"
                          title="Clique para editar o ID do clube"
                        >
                          {club.external_id || '—'}
                        </button>
                        <span className="ml-2">· {club.subclubes?.length || 0} subclubes</span>
                      </p>
                    )}
                  </div>
                </div>
                {/* Platform selector */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-dark-500">Plataforma:</label>
                  <select
                    value={club.metadata?.platform || ''}
                    onChange={(e) => handlePlatformChange(club.id, e.target.value)}
                    disabled={savingPlatform === club.id}
                    className="input text-sm py-1 px-2 w-40"
                    aria-label={`Plataforma do clube ${club.name}`}
                  >
                    <option value="">Selecionar...</option>
                    {PLATFORM_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subclubs grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(club.subclubes || []).map((sub: any) => {
                  const agentList = sub.agents || [];
                  const isExpanded = expandedSubs.has(sub.id);

                  return (
                    <div key={sub.id} className="bg-dark-800 rounded-lg border border-dark-700/50 overflow-hidden">
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-dark-100">{sub.name}</span>
                          </div>
                          <span className="text-[10px] font-bold text-dark-500 bg-dark-700/50 px-2 py-0.5 rounded">
                            {agentList.length} ag.
                          </span>
                        </div>
                        {sub.external_id && (
                          <p className="text-[10px] text-dark-600 font-mono ml-7">{sub.external_id}</p>
                        )}
                      </div>

                      {/* Agent list (expandable) */}
                      {agentList.length > 0 && (
                        <>
                          <button
                            onClick={() => toggleExpand(sub.id)}
                            className="w-full px-4 py-1.5 text-[10px] text-dark-500 hover:text-dark-300 transition-colors border-t border-dark-700/50 bg-dark-850/30 text-left"
                            aria-expanded={isExpanded}
                            aria-label={`Ver agentes de ${sub.name}`}
                          >
                            {isExpanded ? '▾' : '▸'} {agentList.length} agentes
                          </button>
                          {isExpanded && (
                            <div className="px-4 py-2 border-t border-dark-700/30 space-y-1">
                              {agentList.map((ag: any) => (
                                <div key={ag.id} className="flex items-center gap-2 text-xs">
                                  <span className="text-dark-600">•</span>
                                  <span className="text-dark-300 truncate">{ag.name}</span>
                                  {ag.external_id && (
                                    <span className="text-dark-600 font-mono text-[9px] ml-auto">{ag.external_id}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
