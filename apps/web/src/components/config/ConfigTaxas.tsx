'use client';

import { useEffect, useState, useCallback } from 'react';
import { getFeeConfig, updateFeeConfig, listOrganizations } from '@/lib/api';
import { useToast } from '@/components/Toast';
import TableSkeleton from '@/components/ui/TableSkeleton';

interface ClubOrg {
  id: string;
  name: string;
  external_id?: string;
  metadata?: { platform?: string; [key: string]: any };
}

// Standard fees — these names MUST match settlement.service.ts
const STANDARD_FEES = [
  { name: 'taxaApp', label: 'Taxa Aplicativo', base: 'rake', description: '% do Rake' },
  { name: 'taxaLiga', label: 'Taxa Liga', base: 'rake', description: '% do Rake' },
  { name: 'taxaRodeoGGR', label: 'Taxa Rodeo GGR', base: 'ggr', description: '% do GGR' },
  { name: 'taxaRodeoApp', label: 'Taxa Rodeo App', base: 'ggr', description: '% do GGR' },
];

export default function ConfigTaxas() {
  const [rates, setRates] = useState<Record<string, string>>({
    taxaApp: '0',
    taxaLiga: '0',
    taxaRodeoGGR: '0',
    taxaRodeoApp: '0',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  // Club selector
  const [clubs, setClubs] = useState<ClubOrg[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const [loadingClubs, setLoadingClubs] = useState(true);

  const loadClubs = useCallback(async () => {
    setLoadingClubs(true);
    try {
      const res = await listOrganizations('CLUB');
      if (res.success && res.data) {
        const clubList: ClubOrg[] = (res.data || []).map((o: any) => ({
          id: o.id,
          name: o.name,
          external_id: o.external_id || undefined,
          metadata: o.metadata || {},
        }));
        setClubs(clubList);
        if (clubList.length > 0) setSelectedClubId(clubList[0].id);
      }
    } catch {
      toast('Erro ao carregar clubes', 'error');
    } finally {
      setLoadingClubs(false);
    }
  }, [toast]);

  const loadFees = useCallback(async (clubId: string) => {
    setLoading(true);
    setDirty(false);
    try {
      const res = await getFeeConfig(clubId);
      if (res.success) {
        const newRates: Record<string, string> = {
          taxaApp: '0',
          taxaLiga: '0',
          taxaRodeoGGR: '0',
          taxaRodeoApp: '0',
        };
        for (const row of res.data || []) {
          if (row.name in newRates) {
            newRates[row.name] = String(row.rate);
          }
        }
        setRates(newRates);
      }
    } catch {
      toast('Erro ao carregar taxas', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadClubs();
  }, [loadClubs]);

  useEffect(() => {
    if (selectedClubId) loadFees(selectedClubId);
  }, [selectedClubId, loadFees]);

  function handleRateChange(name: string, value: string) {
    setRates((prev) => ({ ...prev, [name]: value }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const feesPayload = STANDARD_FEES.map((f) => ({
        name: f.name,
        rate: parseFloat(rates[f.name]) || 0,
        base: f.base,
      }));
      const res = await updateFeeConfig(feesPayload, selectedClubId);
      if (res.success) {
        setDirty(false);
        toast('Taxas salvas! Serao aplicadas nos fechamentos automaticamente.', 'success');
      } else {
        toast(res.error || 'Erro ao salvar', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loadingClubs) {
    return <TableSkeleton columns={3} rows={4} />;
  }

  if (clubs.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-dark-400 text-sm">Nenhum clube cadastrado. Crie um clube em Estrutura primeiro.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Club selector */}
      {clubs.length > 1 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-dark-300 mb-2">Clube</label>
          <select
            value={selectedClubId}
            onChange={(e) => setSelectedClubId(e.target.value)}
            className="input w-full max-w-sm"
            aria-label="Selecionar clube"
          >
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.external_id ? ` (ID: ${c.external_id})` : ''}
                {c.metadata?.platform ? ` · ${c.metadata.platform}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="card"><div className="space-y-4">{[1, 2, 3, 4].map((i) => (<div key={i} className="flex items-center gap-4"><div className="flex-1"><div className="h-4 skeleton-shimmer w-32 mb-1" style={{ animationDelay: `${i * 0.1}s` }} /><div className="h-2.5 skeleton-shimmer w-20" style={{ animationDelay: `${i * 0.1 + 0.05}s` }} /></div><div className="h-9 skeleton-shimmer w-32 rounded-lg" style={{ animationDelay: `${i * 0.1 + 0.1}s` }} /></div>))}</div></div>
      ) : (
        <>
          <div className="card">
            <div className="space-y-4">
              {STANDARD_FEES.map((fee) => (
                <div key={fee.name} className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-dark-200">{fee.label}</div>
                    <div className="text-[10px] text-dark-500 uppercase tracking-wider">{fee.description}</div>
                  </div>
                  <div className="flex items-center gap-2 w-32">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={rates[fee.name]}
                      onChange={(e) => handleRateChange(fee.name, e.target.value)}
                      className="input w-full text-sm font-mono text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-dark-500 text-sm font-bold">%</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-6 pt-4 border-t border-dark-700/50">
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="btn-primary text-sm px-6 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Salvando...' : 'Salvar Taxas'}
              </button>
            </div>
          </div>

          <div className="mt-6 card bg-dark-800/30 border-dark-700/40">
            <div className="text-sm text-dark-400 space-y-1">
              <p>As taxas sao aplicadas automaticamente no calculo do acerto de cada subclube.</p>
              <p>Taxa Aplicativo e Taxa Liga incidem sobre o <strong className="text-dark-200">Rake</strong>.</p>
              <p>Taxa Rodeo GGR e Taxa Rodeo App incidem sobre o <strong className="text-dark-200">GGR</strong>.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
