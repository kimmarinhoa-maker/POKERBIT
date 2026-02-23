'use client';

import { useEffect, useState, useMemo } from 'react';
import { getOrgTree } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/Spinner';

export default function ClubsPage() {
  const [tree, setTree] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    loadTree();
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
    let subclubes = 0, agents = 0;
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
    setExpandedSubs(prev => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-dark-800 flex items-center justify-center text-3xl">
          🏢
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Clubes e Subclubes</h2>
          <p className="text-dark-400 text-sm">Hierarquia de organizacoes</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-poker-500 rounded-lg p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Clubes</p>
          <p className="font-mono text-lg font-bold text-poker-400">{kpis.clubs}</p>
        </div>
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-blue-500 rounded-lg p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Subclubes</p>
          <p className="font-mono text-lg font-bold text-blue-400">{kpis.subclubes}</p>
        </div>
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-amber-500 rounded-lg p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Agentes</p>
          <p className="font-mono text-lg font-bold text-amber-400">{kpis.agents}</p>
        </div>
      </div>

      {tree.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">🏢</div>
          <h3 className="text-xl font-bold text-white mb-2">Nenhum clube</h3>
          <p className="text-dark-400 text-sm">Configure a estrutura em Configuracoes → Estrutura</p>
        </div>
      ) : (
        <div className="space-y-6">
          {tree.map((club) => (
            <div key={club.id} className="card">
              {/* Club header */}
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-dark-700">
                <div className="w-12 h-12 rounded-xl bg-poker-900/30 flex items-center justify-center text-2xl">
                  🏢
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white">{club.name}</h3>
                  <p className="text-xs text-dark-400">
                    ID: <span className="font-mono">{club.external_id}</span> · {club.subclubes?.length || 0} subclubes
                  </p>
                </div>
              </div>

              {/* Subclubs grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(club.subclubes || []).map((sub: any) => {
                  const agentList = sub.agents || [];
                  const isExpanded = expandedSubs.has(sub.id);

                  return (
                    <div
                      key={sub.id}
                      className="bg-dark-800 rounded-lg border border-dark-700/50 overflow-hidden"
                    >
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🃏</span>
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
