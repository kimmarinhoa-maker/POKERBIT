'use client';

import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/Toast';
import { LaunchRow } from '@/types/launches';
import { mockSubClubs, mockLaunches } from '@/mock/launches.mock';
import OverlaySection from '@/components/launches/OverlaySection';
import LaunchesTable from '@/components/launches/LaunchesTable';
import EditModal from '@/components/launches/EditModal';

export default function LancamentosPage() {
  const { isAdmin, loading } = useAuth();
  const { toast } = useToast();

  // State
  const [launches, setLaunches] = useState<LaunchRow[]>(mockLaunches);
  const [totalOverlay, setTotalOverlay] = useState(0);
  const [selectedClubIds, setSelectedClubIds] = useState<string[]>(
    mockSubClubs.map((c) => c.id)
  );
  const [editingRow, setEditingRow] = useState<LaunchRow | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Recalculate overlay per club
  const rows = useMemo(() => {
    const selectedCount = selectedClubIds.length;
    const perClub = selectedCount > 0 ? totalOverlay / selectedCount : 0;

    return launches.map((row) => {
      const overlay = selectedClubIds.includes(row.subclubId) ? perClub : 0;
      const total = overlay + row.compras + row.security + row.outros;
      return { ...row, overlay, total };
    });
  }, [launches, totalOverlay, selectedClubIds]);

  // Handlers
  function handleEdit(subclubId: string) {
    const row = rows.find((r) => r.subclubId === subclubId);
    if (row) setEditingRow(row);
  }

  const handleSave = useCallback((data: { subclubId: string; compras: number; security: number; outros: number; obs: string }) => {
    setLaunches((prev) =>
      prev.map((row) =>
        row.subclubId === data.subclubId
          ? { ...row, compras: data.compras, security: data.security, outros: data.outros, obs: data.obs }
          : row
      )
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
  }, [toast]);

  // Loading
  if (loading) return null;

  // Access guard
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="card p-8 text-center max-w-md">
          <div className="text-4xl mb-4">{'\u{1F512}'}</div>
          <h2 className="text-lg font-bold text-white mb-2">Acesso Restrito</h2>
          <p className="text-sm text-dark-400">
            Apenas administradores podem acessar a pagina de lancamentos.
          </p>
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
        <div className="flex items-center gap-2 bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5">
          <svg className="w-3.5 h-3.5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="font-mono text-xs text-dark-300">
            25/02/2026 — 01/03/2026
          </span>
        </div>
      </div>

      {/* Overlay Section */}
      <OverlaySection
        clubs={mockSubClubs}
        totalOverlay={totalOverlay}
        selectedClubIds={selectedClubIds}
        onOverlayChange={setTotalOverlay}
        onSelectionChange={setSelectedClubIds}
      />

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
        {'\u{1F4A1}'} Valores salvos automaticamente. Usados na Liga de cada clube e na Liga — Consolidado.
      </p>
    </div>
  );
}
