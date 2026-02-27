'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/Toast';
import { LaunchRow, SubClub } from '@/types/launches';
import { listSettlements, listOrganizations, getClubAdjustments, saveClubAdjustments } from '@/lib/api';
import OverlaySection from '@/components/launches/OverlaySection';
import LaunchesTable from '@/components/launches/LaunchesTable';
import EditModal from '@/components/launches/EditModal';

export default function LancamentosPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // Data state
  const [clubs, setClubs] = useState<SubClub[]>([]);
  const [launches, setLaunches] = useState<LaunchRow[]>([]);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [_weekEnd, setWeekEnd] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [allSettlements, setAllSettlements] = useState<any[]>([]);

  // Overlay state
  const [totalOverlay, setTotalOverlay] = useState(0);
  const [selectedClubIds, setSelectedClubIds] = useState<string[]>([]);

  // UI state
  const [editingRow, setEditingRow] = useState<LaunchRow | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingOverlay, setSavingOverlay] = useState(false);

  // Load data on mount
  useEffect(() => {
    if (authLoading || !isAdmin) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdmin]);

  async function loadData(targetWeekStart?: string) {
    setDataLoading(true);
    try {
      // 1. Get all settlements
      const settRes = await listSettlements();
      const settlements = settRes?.data || settRes || [];
      if (!settlements.length) {
        toast('Nenhum acerto encontrado', 'error');
        setDataLoading(false);
        return;
      }
      setAllSettlements(settlements);

      // Use target week or latest settlement
      const target = targetWeekStart
        ? settlements.find((s: any) => s.week_start === targetWeekStart) || settlements[0]
        : settlements[0];
      const ws = target.week_start;
      const we = target.week_end;
      setWeekStart(ws);
      setWeekEnd(we);

      // 2. Get subclubs
      const orgsRes = await listOrganizations('SUBCLUB');
      const orgs = orgsRes?.data || orgsRes || [];
      const subclubs: SubClub[] = orgs.map((o: any) => ({
        id: o.id,
        name: o.name,
        icon: '',
        logoUrl: o.metadata?.logo_url || null,
      }));
      setClubs(subclubs);
      setSelectedClubIds(subclubs.map((c) => c.id));

      // 3. Get saved adjustments for this week
      const adjRes = await getClubAdjustments(ws);
      const adjList = adjRes?.data || adjRes || [];
      const adjMap = new Map<string, any>();
      for (const a of adjList) {
        adjMap.set(a.subclub_id, a);
      }

      // 4. Build launch rows from real data
      const rows: LaunchRow[] = subclubs.map((c) => {
        const adj = adjMap.get(c.id);
        const overlay = adj ? Number(adj.overlay || 0) : 0;
        const compras = adj ? Number(adj.compras || 0) : 0;
        const security = adj ? Number(adj.security || 0) : 0;
        const outros = adj ? Number(adj.outros || 0) : 0;
        const obs = adj?.obs || '';
        return {
          subclubId: c.id,
          subclubName: c.name,
          icon: '',
          logoUrl: c.logoUrl,
          overlay,
          compras,
          security,
          outros,
          total: overlay + compras + security + outros,
          obs,
        };
      });
      setLaunches(rows);

      // Infer total overlay from saved data
      const totalSavedOverlay = rows.reduce((s, r) => s + r.overlay, 0);
      setTotalOverlay(totalSavedOverlay);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Erro ao carregar dados', 'error');
    } finally {
      setDataLoading(false);
    }
  }

  // Recalculate overlay per club (only used for display before saving)
  const rows = useMemo(() => {
    const selectedCount = selectedClubIds.length;
    const perClub = selectedCount > 0 ? totalOverlay / selectedCount : 0;

    return launches.map((row) => {
      const overlay = selectedClubIds.includes(row.subclubId) ? perClub : 0;
      const total = overlay + row.compras + row.security + row.outros;
      return { ...row, overlay, total };
    });
  }, [launches, totalOverlay, selectedClubIds]);

  // Handle overlay confirm — save to Supabase for each selected club
  const handleOverlayConfirm = useCallback(
    async (value: number) => {
      setTotalOverlay(value);
      if (!weekStart) return;

      setSavingOverlay(true);
      try {
        const selectedCount = selectedClubIds.length;
        const perClub = selectedCount > 0 ? value / selectedCount : 0;

        // Save overlay for each club
        const promises = clubs.map((club) => {
          const isSelected = selectedClubIds.includes(club.id);
          const overlayValue = isSelected ? perClub : 0;
          const existing = launches.find((r) => r.subclubId === club.id);

          return saveClubAdjustments({
            subclub_id: club.id,
            week_start: weekStart,
            overlay: overlayValue,
            compras: existing?.compras ?? 0,
            security: existing?.security ?? 0,
            outros: existing?.outros ?? 0,
            obs: existing?.obs ?? '',
          });
        });

        await Promise.all(promises);

        // Update local state
        setLaunches((prev) =>
          prev.map((row) => {
            const isSelected = selectedClubIds.includes(row.subclubId);
            const overlay = isSelected ? perClub : 0;
            return { ...row, overlay };
          }),
        );

        toast('Overlay salvo com sucesso', 'success');
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : 'Erro ao salvar overlay', 'error');
      } finally {
        setSavingOverlay(false);
      }
    },
    [weekStart, selectedClubIds, clubs, launches, toast],
  );

  // Handle modal save — save to Supabase
  const handleSave = useCallback(
    async (data: { subclubId: string; compras: number; security: number; outros: number; obs: string }) => {
      if (!weekStart) return;

      try {
        const existing = rows.find((r) => r.subclubId === data.subclubId);

        const res = await saveClubAdjustments({
          subclub_id: data.subclubId,
          week_start: weekStart,
          overlay: existing?.overlay ?? 0,
          compras: data.compras,
          security: data.security,
          outros: data.outros,
          obs: data.obs,
        });

        if (res?.error) {
          toast(res.error, 'error');
          return;
        }

        // Update local state
        setLaunches((prev) =>
          prev.map((row) =>
            row.subclubId === data.subclubId
              ? { ...row, compras: data.compras, security: data.security, outros: data.outros, obs: data.obs }
              : row,
          ),
        );
        setEditingRow(null);
        toast('Lancamento salvo com sucesso', 'success');

        setSavedIds((prev) => new Set(prev).add(data.subclubId));
        setTimeout(() => {
          setSavedIds((prev) => {
            const next = new Set(prev);
            next.delete(data.subclubId);
            return next;
          });
        }, 3000);
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : 'Erro ao salvar lancamento', 'error');
      }
    },
    [weekStart, rows, toast],
  );

  // Week change handler
  function handleWeekChange(ws: string) {
    loadData(ws);
  }

  // Edit handler
  function handleEdit(subclubId: string) {
    const row = rows.find((r) => r.subclubId === subclubId);
    if (row) setEditingRow(row);
  }

  // Format dates
  const fmtDate = (d?: string | null) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };

  // Loading
  if (authLoading) return null;

  // Access guard
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="card p-8 text-center max-w-md">
          <div className="text-4xl mb-4">{'\u{1F512}'}</div>
          <h2 className="text-lg font-bold text-white mb-2">Acesso Restrito</h2>
          <p className="text-sm text-dark-400">Apenas administradores podem acessar a pagina de lancamentos.</p>
        </div>
      </div>
    );
  }

  if (dataLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-dark-400 text-sm flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Carregando lancamentos...
        </div>
      </div>
    );
  }

  if (!weekStart) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="card p-8 text-center max-w-md">
          <div className="text-4xl mb-4">{'\u{1F4C5}'}</div>
          <h2 className="text-lg font-bold text-white mb-2">Nenhum acerto encontrado</h2>
          <p className="text-sm text-dark-400">Crie um acerto primeiro para poder lancar ajustes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <span>{'\u{1F4CB}'}</span> Lancamentos
          </h1>
          <p className="text-xs text-dark-400 mt-0.5">
            Overlay global + ajustes manuais por clube · Semana selecionada
          </p>
        </div>
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <select
            value={weekStart || ''}
            onChange={(e) => handleWeekChange(e.target.value)}
            className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 font-mono text-xs text-dark-300 focus:outline-none focus:border-poker-500 cursor-pointer"
          >
            {allSettlements.map((s: any) => {
              const ws = s.week_start;
              const d = new Date(ws + 'T00:00:00');
              d.setDate(d.getDate() + 6);
              const we = d.toISOString().slice(0, 10);
              return (
                <option key={s.id} value={ws}>
                  {fmtDate(ws)} — {fmtDate(we)}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Overlay Section */}
      <OverlaySection
        clubs={clubs}
        totalOverlay={totalOverlay}
        selectedClubIds={selectedClubIds}
        onOverlayChange={handleOverlayConfirm}
        onSelectionChange={setSelectedClubIds}
      />
      {savingOverlay && <p className="text-xs text-blue-400 text-center animate-pulse">Salvando overlay...</p>}

      {/* Launches Table */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-dark-300 uppercase tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm bg-poker-500 inline-block" />
          Lancamentos por Clube
        </h2>
        <LaunchesTable rows={rows} onEdit={handleEdit} savedIds={savedIds} />
      </div>

      {/* Edit Modal */}
      <EditModal row={editingRow} onSave={handleSave} onClose={() => setEditingRow(null)} />

      {/* Footer hint */}
      <p className="text-xs text-dark-500 text-center">
        {'\u{1F4A1}'} Valores salvos no Supabase. Usados na Liga de cada clube e no Dashboard.
      </p>
    </div>
  );
}
