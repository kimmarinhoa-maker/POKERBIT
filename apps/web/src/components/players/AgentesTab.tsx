'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { getAgentRates, updateAgentRate, updateOrgMetadata } from '@/lib/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import Spinner from '@/components/Spinner';
import KpiCard from '@/components/ui/KpiCard';
import KpiSkeleton from '@/components/ui/KpiSkeleton';
import TableSkeleton from '@/components/ui/TableSkeleton';
import EmptyState from '@/components/ui/EmptyState';
import EntityDataModal from './EntityDataModal';
import { User, X, Percent, Check, Users, Search } from 'lucide-react';

type ToastFn = (msg: string, type: 'success' | 'error' | 'info') => void;

export default function AgentesTab({
  toast,
  agents,
  reloadTree,
}: {
  toast: ToastFn;
  agents: any[];
  reloadTree: () => Promise<void>;
}) {
  const [rates, setRates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  // Rate editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Apply all
  const [applyAllRate, setApplyAllRate] = useState('');
  const [applyingAll, setApplyingAll] = useState(false);

  // Dados modal
  const [editAgent, setEditAgent] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', email: '' });
  const [savingDados, setSavingDados] = useState(false);

  const loadRates = useCallback(async () => {
    setLoading(true);
    try {
      const ratesRes = await getAgentRates();
      if (ratesRes.success) setRates(ratesRes.data || []);
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  // Merge agents with rates
  const agentsWithRates = useMemo(() => {
    const rateMap = new Map<string, number>();
    for (const r of rates) {
      const orgId = r.organizations?.id || r.organization_id;
      if (orgId) rateMap.set(orgId, r.rate);
    }
    return agents.map((a) => ({
      ...a,
      rb_rate: rateMap.get(a.id) ?? null,
    }));
  }, [agents, rates]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return agentsWithRates;
    const q = debouncedSearch.toLowerCase();
    return agentsWithRates.filter(
      (a) =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.external_id || '').toLowerCase().includes(q),
    );
  }, [agentsWithRates, debouncedSearch]);

  // Sort by name
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [filtered]);

  // KPIs
  const kpis = useMemo(() => {
    const total = agentsWithRates.length;
    const withRate = agentsWithRates.filter((a) => a.rb_rate !== null && a.rb_rate !== undefined).length;
    const withoutRate = total - withRate;
    const avgRate =
      withRate > 0
        ? agentsWithRates.filter((a) => a.rb_rate != null).reduce((s, a) => s + a.rb_rate, 0) / withRate
        : 0;
    return { total, withRate, withoutRate, avgRate };
  }, [agentsWithRates]);

  function startEdit(agentId: string, currentRate: number | null) {
    setEditingId(agentId);
    setRateInput(currentRate != null ? String(currentRate) : '');
  }

  async function saveRate(agentId: string) {
    const rate = parseFloat(rateInput);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast('Rate deve ser entre 0 e 100', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await updateAgentRate(agentId, rate);
      if (res.success) {
        toast(`Rate ${rate}% salvo!`, 'success');
        setEditingId(null);
        loadRates();
      } else {
        toast(res.error || 'Erro ao salvar rate', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyAll() {
    const rate = parseFloat(applyAllRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast('Rate deve ser entre 0 e 100', 'error');
      return;
    }
    setApplyingAll(true);
    try {
      let count = 0;
      for (const a of sorted) {
        const res = await updateAgentRate(a.id, rate);
        if (res.success) count++;
      }
      toast(`Rate ${rate}% aplicado a ${count} agentes!`, 'success');
      setApplyAllRate('');
      loadRates();
    } catch {
      toast('Erro ao aplicar rate', 'error');
    } finally {
      setApplyingAll(false);
    }
  }

  // Dados modal helpers
  function hasData(agent: any): boolean {
    const meta = agent.metadata || {};
    return !!(meta.full_name || meta.phone || meta.email);
  }

  function openDados(agent: any) {
    const meta = agent.metadata || {};
    const rawPhone = String(meta.phone || '').replace(/\D/g, '');
    const displayPhone = rawPhone.startsWith('55') ? rawPhone.slice(2) : rawPhone;
    setEditForm({
      full_name: meta.full_name || '',
      phone: displayPhone,
      email: meta.email || '',
    });
    setEditAgent(agent);
  }

  async function handleSaveDados() {
    if (!editAgent) return;
    setSavingDados(true);
    const cleanPhone = editForm.phone.replace(/\D/g, '');
    const fullPhone = cleanPhone ? `55${cleanPhone}` : undefined;
    try {
      const res = await updateOrgMetadata(editAgent.id, {
        full_name: editForm.full_name || undefined,
        phone: fullPhone,
        email: editForm.email || undefined,
      });
      if (res.success) {
        toast('Dados atualizados!', 'success');
        setEditAgent(null);
        reloadTree();
      } else {
        toast(res.error || 'Erro ao salvar', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSavingDados(false);
    }
  }

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total Agentes" value={kpis.total} accentColor="bg-blue-500" />
        <KpiCard label="Com Rate" value={kpis.withRate} accentColor="bg-emerald-500" valueColor="text-emerald-400" />
        <KpiCard label="Sem Rate" value={kpis.withoutRate} accentColor="bg-amber-500" valueColor="text-amber-400" />
        <KpiCard label="Media RB" value={`${kpis.avgRate.toFixed(1)}%`} accentColor="bg-poker-500" valueColor="text-poker-400" />
      </div>

      {/* Search + Apply All */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar agente..."
            className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-4 py-2 text-sm text-white placeholder-dark-500 focus:border-poker-500 focus:outline-none"
          />
          {search && debouncedSearch !== search && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Spinner size="sm" />
            </div>
          )}
        </div>
        {search && (
          <button
            onClick={() => setSearch('')}
            className="text-xs text-dark-400 hover:text-dark-200 transition-colors"
          >
            Limpar
          </button>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-dark-500">Aplicar % a todos:</span>
          <input
            type="number"
            value={applyAllRate}
            onChange={(e) => setApplyAllRate(e.target.value)}
            placeholder="%"
            min="0"
            max="100"
            step="0.1"
            className="w-20 bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-1.5 text-sm text-white text-center font-mono focus:border-poker-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            onClick={handleApplyAll}
            disabled={applyingAll || !applyAllRate}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-poker-600 text-white hover:bg-poker-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {applyingAll ? <Spinner size="sm" /> : <Check size={12} />}
            Aplicar
          </button>
        </div>
      </div>

      {loading ? (
        <><KpiSkeleton count={4} /><TableSkeleton columns={4} rows={8} /></>
      ) : sorted.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={search ? Search : Users}
            title={search ? 'Nenhum resultado' : 'Nenhum agente'}
            description={search ? `Nenhum agente encontrado para "${search}"` : 'Agentes sao criados automaticamente ao importar XLSX'}
          />
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm data-table">
              <thead>
                <tr className="bg-dark-800/50">
                  <th className="px-3 py-2 text-left font-medium text-xs text-dark-400">Agente</th>
                  <th className="px-3 py-2 text-left font-medium text-xs text-dark-400 w-28">ID</th>
                  <th className="px-3 py-2 text-center font-medium text-xs text-dark-400 w-36">% Rakeback</th>
                  <th className="px-3 py-2 text-center font-medium text-xs text-dark-400 w-16">Dados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/50">
                {sorted.map((agent) => (
                  <tr key={agent.id}>
                    <td className="px-3 py-1.5 text-white font-medium">{agent.name}</td>
                    <td className="px-3 py-1.5 text-dark-500 font-mono text-[11px]">{agent.external_id || '—'}</td>
                    <td className="px-3 py-1.5 text-center">
                      {editingId === agent.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            value={rateInput}
                            onChange={(e) => setRateInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRate(agent.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            min="0"
                            max="100"
                            step="0.1"
                            autoFocus
                            className="w-20 bg-dark-800 border border-poker-500 rounded px-2 py-1 text-sm text-white text-center font-mono focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="text-dark-500 text-xs">%</span>
                          <button
                            onClick={() => saveRate(agent.id)}
                            disabled={saving}
                            className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                            title="Salvar"
                          >
                            {saving ? <Spinner size="sm" /> : <Check size={14} />}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1 text-dark-500 hover:text-dark-300 transition-colors"
                            title="Cancelar"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(agent.id, agent.rb_rate)}
                          className="group flex items-center justify-center gap-1 w-full"
                          title="Editar rate"
                        >
                          <span
                            className={`font-mono text-sm ${
                              agent.rb_rate != null ? 'text-emerald-400' : 'text-dark-600'
                            }`}
                          >
                            {agent.rb_rate != null ? `${agent.rb_rate}%` : '—'}
                          </span>
                          <Percent
                            size={10}
                            className="text-dark-600 group-hover:text-poker-400 transition-colors"
                          />
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <button
                        onClick={() => openDados(agent)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          hasData(agent)
                            ? 'text-emerald-400 hover:bg-emerald-500/10'
                            : 'text-dark-500 hover:bg-dark-700/50 hover:text-dark-300'
                        }`}
                        title="Editar dados do agente"
                      >
                        <User size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: Dados do Agente ── */}
      {editAgent && (
        <EntityDataModal
          title="Dados do Agente"
          entityName={editAgent.name}
          entityExternalId={editAgent.external_id}
          firstLabel="Nome"
          firstValue={editAgent.name}
          namePlaceholder="Nome completo do agente"
          emailPlaceholder="agente@email.com"
          editForm={editForm}
          setEditForm={setEditForm}
          saving={savingDados}
          onClose={() => setEditAgent(null)}
          onSave={handleSaveDados}
        />
      )}
    </>
  );
}
