'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { getOrgTree } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { usePageTitle } from '@/lib/usePageTitle';
import KpiSkeleton from '@/components/ui/KpiSkeleton';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { ChevronDown } from 'lucide-react';
import AgentesTab from '@/components/players/AgentesTab';
import JogadoresTab from '@/components/players/JogadoresTab';

type Tab = 'jogadores' | 'agentes';

export default function PlayersPage() {
  usePageTitle('Cadastro');

  const [tab, setTab] = useState<Tab>('agentes');
  const { toast } = useToast();

  // Tree state (shared between tabs)
  const [tree, setTree] = useState<any[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [selectedSubclubId, setSelectedSubclubId] = useState<string>('');

  // Load org tree
  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await getOrgTree();
      if (res.success) setTree(res.data || []);
      else toast(res.error || 'Erro ao carregar clubes', 'error');
    } catch {
      toast('Erro de conexao com o servidor', 'error');
    } finally {
      setTreeLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // Build flat subclub list
  const subclubs = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    for (const node of tree) {
      if (node.type === 'SUBCLUB') list.push({ id: node.id, name: node.name });
      for (const child of node.children || []) {
        if (child.type === 'SUBCLUB') list.push({ id: child.id, name: child.name });
      }
    }
    return list;
  }, [tree]);

  // Flatten all agents
  const allAgents = useMemo(() => {
    const agents: any[] = [];
    function walk(nodes: any[]) {
      for (const n of nodes) {
        if (n.type === 'AGENT') agents.push(n);
        if (n.children) walk(n.children);
      }
    }
    walk(tree);
    return agents;
  }, [tree]);

  return (
    <div className="space-y-6 animate-tab-fade">
      {/* Tab Bar */}
      <div className="flex items-center gap-6 border-b border-dark-700/50 pb-0">
        {(['agentes', 'jogadores'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-poker-500 text-white'
                : 'border-transparent text-dark-400 hover:text-dark-200'
            }`}
          >
            {t === 'agentes' ? 'Agentes' : 'Jogadores'}
          </button>
        ))}

        {/* Subclub selector (jogadores only) */}
        {tab === 'jogadores' && subclubs.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-dark-500">Subclube:</span>
            <div className="relative">
              <select
                value={selectedSubclubId}
                onChange={(e) => setSelectedSubclubId(e.target.value)}
                className="appearance-none bg-dark-800 border border-dark-700/50 rounded-lg pl-3 pr-8 py-1.5 text-xs text-white focus:border-poker-500 focus:outline-none cursor-pointer"
              >
                <option value="">Todos</option>
                {subclubs.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-500 pointer-events-none"
              />
            </div>
          </div>
        )}
      </div>

      {treeLoading ? (
        <><KpiSkeleton count={4} /><TableSkeleton columns={4} rows={8} /></>
      ) : (
        <>
          {tab === 'agentes' ? (
            <AgentesTab toast={toast} agents={allAgents} reloadTree={loadTree} />
          ) : (
            <JogadoresTab toast={toast} subclubId={selectedSubclubId} />
          )}
        </>
      )}
    </div>
  );
}
