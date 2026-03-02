'use client';

import { useEffect, useState } from 'react';
import { getFeeConfig, updateFeeConfig, deleteFee, listOrganizations } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/Spinner';
import { Plus, Trash2, Pencil } from 'lucide-react';

interface FeeConfig {
  id: string;
  name: string;
  rate: number;
  base: string;
  is_active: boolean;
  club_id?: string;
}

interface ClubOrg {
  id: string;
  name: string;
  external_id?: string;
  metadata?: { platform?: string; [key: string]: any };
}

const BASE_OPTIONS = [
  { value: 'rake', label: 'Rake' },
  { value: 'ggr', label: 'GGR' },
  { value: 'conversion', label: 'Conversao' },
];

export default function ConfigTaxas() {
  const [fees, setFees] = useState<FeeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Club selector
  const [clubs, setClubs] = useState<ClubOrg[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const [loadingClubs, setLoadingClubs] = useState(true);

  // Edit form
  const [editFees, setEditFees] = useState<Array<{ id?: string; name: string; rate: string; base: string }>>([]);

  // New fee form
  const [showNewFee, setShowNewFee] = useState(false);
  const [newFee, setNewFee] = useState({ name: '', rate: '', base: 'rake' });

  // Load clubs on mount
  useEffect(() => {
    loadClubs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load fees when selected club changes
  useEffect(() => {
    if (selectedClubId) loadFees(selectedClubId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClubId]);

  async function loadClubs() {
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
  }

  async function loadFees(clubId: string) {
    setLoading(true);
    setEditing(false);
    setShowNewFee(false);
    try {
      const res = await getFeeConfig(clubId);
      if (res.success) setFees(res.data || []);
    } catch {
      toast('Erro ao carregar taxas', 'error');
    } finally {
      setLoading(false);
    }
  }

  const selectedClub = clubs.find((c) => c.id === selectedClubId);

  // ─── Edit mode ──────────────────────────────────────────────────────
  function handleStartEdit() {
    setEditFees(
      fees.map((f) => ({ id: f.id, name: f.name, rate: String(f.rate), base: f.base })),
    );
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const feesPayload = editFees
        .filter((f) => f.name.trim())
        .map((f) => ({
          name: f.name.trim(),
          rate: parseFloat(f.rate) || 0,
          base: f.base || 'rake',
        }));
      const res = await updateFeeConfig(feesPayload, selectedClubId);
      if (res.success) {
        setFees(res.data || []);
        setEditing(false);
        toast('Taxas atualizadas!', 'success');
      } else {
        toast(res.error || 'Erro ao salvar', 'error');
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditing(false);
    setShowNewFee(false);
  }

  // ─── Delete fee ─────────────────────────────────────────────────────
  async function handleDeleteFee(feeId: string, feeName: string) {
    try {
      const res = await deleteFee(feeId);
      if (res.success) {
        setFees((prev) => prev.filter((f) => f.id !== feeId));
        toast(`Taxa "${feeName}" removida`, 'success');
      } else {
        toast(res.error || 'Erro ao remover', 'error');
      }
    } catch {
      toast('Erro ao remover taxa', 'error');
    }
  }

  // ─── Add fee ────────────────────────────────────────────────────────
  async function handleAddFee() {
    if (!newFee.name.trim()) return;
    setSaving(true);
    try {
      const res = await updateFeeConfig(
        [{ name: newFee.name.trim(), rate: parseFloat(newFee.rate) || 0, base: newFee.base }],
        selectedClubId,
      );
      if (res.success) {
        setFees(res.data || []);
        setNewFee({ name: '', rate: '', base: 'rake' });
        setShowNewFee(false);
        toast(`Taxa "${newFee.name.trim()}" adicionada`, 'success');
      } else {
        toast(res.error || 'Erro ao adicionar', 'error');
      }
    } catch {
      toast('Erro ao adicionar taxa', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────

  if (loadingClubs) {
    return <div className="flex justify-center py-20"><Spinner /></div>;
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

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <>
          {/* Actions bar */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs text-dark-500">
              {selectedClub?.metadata?.platform && (
                <span className="bg-dark-700/50 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                  {selectedClub.metadata.platform}
                </span>
              )}
              {fees.length > 0 && (
                <span className="ml-2">{fees.length} taxa{fees.length > 1 ? 's' : ''} configurada{fees.length > 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!editing && (
                <>
                  <button
                    onClick={() => setShowNewFee(true)}
                    className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
                    aria-label="Adicionar nova taxa"
                  >
                    <Plus size={14} />
                    Nova Taxa
                  </button>
                  {fees.length > 0 && (
                    <button
                      onClick={handleStartEdit}
                      className="btn-secondary text-sm px-4 py-2 flex items-center gap-1.5"
                      aria-label="Editar taxas"
                    >
                      <Pencil size={14} />
                      Editar
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Add new fee form */}
          {showNewFee && !editing && (
            <div className="card mb-4 bg-dark-800/50">
              <h4 className="text-sm font-semibold text-dark-200 mb-3">Nova Taxa</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-dark-400 mb-1 block">Nome *</label>
                  <input
                    type="text"
                    value={newFee.name}
                    onChange={(e) => setNewFee({ ...newFee, name: e.target.value })}
                    className="input w-full text-sm"
                    placeholder="Ex: taxaApp"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-dark-400 mb-1 block">Valor</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newFee.rate}
                    onChange={(e) => setNewFee({ ...newFee, rate: e.target.value })}
                    className="input w-full text-sm font-mono"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-xs text-dark-400 mb-1 block">Base</label>
                  <select
                    value={newFee.base}
                    onChange={(e) => setNewFee({ ...newFee, base: e.target.value })}
                    className="input w-full text-sm"
                  >
                    {BASE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => { setShowNewFee(false); setNewFee({ name: '', rate: '', base: 'rake' }); }}
                  className="px-3 py-1.5 text-dark-400 hover:text-white text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddFee}
                  disabled={saving || !newFee.name.trim()}
                  className="btn-primary text-xs px-4 py-1.5"
                >
                  {saving ? 'Salvando...' : 'Adicionar'}
                </button>
              </div>
            </div>
          )}

          {/* Fees table */}
          <div className="card">
            {fees.length === 0 && !editing ? (
              <p className="text-dark-500 text-sm py-6 text-center">
                Nenhuma taxa configurada para este clube. Clique em &quot;Nova Taxa&quot; para adicionar.
              </p>
            ) : editing ? (
              /* ── Edit mode: inline editable table ── */
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm data-table">
                    <thead>
                      <tr className="border-b border-dark-700/40">
                        <th className="text-left py-2 px-3 text-xs text-dark-500 font-medium">Nome</th>
                        <th className="text-right py-2 px-3 text-xs text-dark-500 font-medium w-28">Valor</th>
                        <th className="text-center py-2 px-3 text-xs text-dark-500 font-medium w-28">Base</th>
                        <th className="text-right py-2 px-3 text-xs text-dark-500 font-medium w-20">Acao</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editFees.map((f, i) => (
                        <tr key={f.id || i} className="border-b border-dark-800/30">
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={f.name}
                              onChange={(e) => {
                                const next = [...editFees];
                                next[i] = { ...next[i], name: e.target.value };
                                setEditFees(next);
                              }}
                              className="input w-full text-sm"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={f.rate}
                              onChange={(e) => {
                                const next = [...editFees];
                                next[i] = { ...next[i], rate: e.target.value };
                                setEditFees(next);
                              }}
                              className="input w-full text-sm font-mono text-right"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <select
                              value={f.base}
                              onChange={(e) => {
                                const next = [...editFees];
                                next[i] = { ...next[i], base: e.target.value };
                                setEditFees(next);
                              }}
                              className="input w-full text-sm text-center"
                            >
                              {BASE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => {
                                setEditFees(editFees.filter((_, idx) => idx !== i));
                              }}
                              className="text-dark-500 hover:text-red-400 text-xs transition-colors"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-dark-700/50">
                  <button onClick={handleCancel} disabled={saving} className="px-4 py-2 text-dark-400 hover:text-white text-sm transition-colors">
                    Cancelar
                  </button>
                  <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-6 py-2">
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </>
            ) : (
              /* ── Read-only table ── */
              <div className="overflow-x-auto">
                <table className="w-full text-sm data-table">
                  <thead>
                    <tr className="border-b border-dark-700/40">
                      <th className="text-left py-2 px-3 text-xs text-dark-500 font-medium">Nome</th>
                      <th className="text-right py-2 px-3 text-xs text-dark-500 font-medium">Valor</th>
                      <th className="text-center py-2 px-3 text-xs text-dark-500 font-medium">Base</th>
                      <th className="text-right py-2 px-3 text-xs text-dark-500 font-medium w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fees.map((f) => (
                      <tr key={f.id} className="border-b border-dark-800/30 hover:bg-dark-800/20 transition-colors">
                        <td className="py-2.5 px-3 text-dark-200 font-medium">{f.name}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-poker-400">
                          {f.base === 'conversion' ? `${Number(f.rate)}x` : `${Number(f.rate).toFixed(2).replace('.', ',')}%`}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-[10px] font-bold text-dark-500 bg-dark-700/50 px-2 py-0.5 rounded uppercase">
                            {f.base}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleDeleteFee(f.id, f.name)}
                            className="text-dark-500 hover:text-red-400 transition-colors"
                            aria-label={`Remover taxa ${f.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-6 card bg-dark-800/30 border-dark-700/40">
            <div className="text-sm text-dark-400 space-y-1">
              <p>Taxas aplicadas automaticamente no calculo do acerto de cada subclube deste clube.</p>
              <p>Adicione, edite ou remova taxas conforme a necessidade.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
