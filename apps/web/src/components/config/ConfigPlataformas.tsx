'use client';

import { useEffect, useState } from 'react';
import {
  listClubPlatforms,
  createClubPlatform,
  updateClubPlatform,
  deleteClubPlatform,
  listOrganizations,
} from '@/lib/api';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { Plus, Trash2, Pencil, Check, X, Layers } from 'lucide-react';
import type { ClubPlatform } from '@/types/platform';
import { PLATFORM_LABELS, getPlatformColor } from '@/types/platform';

interface Subclub {
  id: string;
  name: string;
}

const PLATFORM_OPTIONS = [
  { value: 'pppoker', label: 'PPPoker' },
  { value: 'clubgg', label: 'ClubGG' },
  { value: 'suprema', label: 'Suprema Poker' },
];

export default function ConfigPlataformas() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [platforms, setPlatforms] = useState<ClubPlatform[]>([]);
  const [subclubs, setSubclubs] = useState<Subclub[]>([]);
  const [selectedSubclubId, setSelectedSubclubId] = useState<string>('');

  // New form
  const [showAdd, setShowAdd] = useState(false);
  const [newPlatform, setNewPlatform] = useState('pppoker');
  const [newClubName, setNewClubName] = useState('');
  const [newExternalId, setNewExternalId] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit mode
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editExtId, setEditExtId] = useState('');

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [platRes, subRes] = await Promise.all([
        listClubPlatforms(),
        listOrganizations('SUBCLUB'),
      ]);
      if (platRes.success) setPlatforms(platRes.data || []);
      if (subRes.success) {
        const subs: Subclub[] = (subRes.data || []).map((o: any) => ({ id: o.id, name: o.name }));
        setSubclubs(subs);
        if (subs.length > 0 && !selectedSubclubId) setSelectedSubclubId(subs[0].id);
      }
    } catch {
      toast('Erro ao carregar plataformas', 'error');
    } finally {
      setLoading(false);
    }
  }

  const filteredPlatforms = platforms.filter((p) => p.subclub_id === selectedSubclubId);

  async function handleAdd() {
    if (!selectedSubclubId || !newPlatform) return;
    setSaving(true);
    try {
      const res = await createClubPlatform({
        subclub_id: selectedSubclubId,
        platform: newPlatform,
        club_name: newClubName.trim() || undefined,
        club_external_id: newExternalId.trim() || undefined,
      });
      if (res.success) {
        setPlatforms((prev) => [...prev, res.data]);
        setShowAdd(false);
        setNewPlatform('pppoker');
        setNewClubName('');
        setNewExternalId('');
        toast('Clube externo adicionado!', 'success');
      } else {
        toast(res.error || 'Erro ao criar', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    try {
      const res = await deleteClubPlatform(id);
      if (res.success) {
        setPlatforms((prev) => prev.filter((p) => p.id !== id));
        toast(`"${name}" removido`, 'success');
      } else {
        toast(res.error || 'Erro ao remover', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    }
  }

  function startEdit(p: ClubPlatform) {
    setEditId(p.id);
    setEditName(p.club_name || '');
    setEditExtId(p.club_external_id || '');
  }

  async function handleSaveEdit() {
    if (!editId) return;
    setSaving(true);
    try {
      const res = await updateClubPlatform(editId, {
        club_name: editName.trim() || undefined,
        club_external_id: editExtId.trim() || undefined,
      });
      if (res.success) {
        setPlatforms((prev) => prev.map((p) => (p.id === editId ? { ...p, ...res.data } : p)));
        setEditId(null);
        toast('Atualizado!', 'success');
      } else {
        toast(res.error || 'Erro ao salvar', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner /></div>;
  }

  if (subclubs.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="Nenhum subclube cadastrado"
        description="Crie subclubes em Estrutura antes de vincular plataformas externas."
      />
    );
  }

  return (
    <div>
      {/* Subclub selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-dark-300 mb-2">Subclube</label>
        <div className="flex flex-wrap gap-2">
          {subclubs.map((sc) => {
            const count = platforms.filter((p) => p.subclub_id === sc.id).length;
            const isActive = selectedSubclubId === sc.id;
            return (
              <button
                key={sc.id}
                onClick={() => { setSelectedSubclubId(sc.id); setShowAdd(false); setEditId(null); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  isActive
                    ? 'bg-poker-600/15 border-poker-500 text-poker-400'
                    : 'bg-dark-800/50 border-dark-700 text-dark-300 hover:border-dark-500'
                }`}
              >
                {sc.name}
                {count > 0 && (
                  <span className="ml-1.5 text-[10px] bg-dark-700 px-1.5 py-0.5 rounded-full">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-dark-500">
          {filteredPlatforms.length > 0
            ? `${filteredPlatforms.length} plataforma${filteredPlatforms.length > 1 ? 's' : ''} vinculada${filteredPlatforms.length > 1 ? 's' : ''}`
            : ''}
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
        >
          <Plus size={14} />
          Vincular Plataforma
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card mb-4 bg-dark-800/50">
          <h4 className="text-sm font-semibold text-dark-200 mb-3">Vincular Plataforma Externa</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Plataforma *</label>
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value)}
                className="input w-full text-sm"
              >
                {PLATFORM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Nome do Clube</label>
              <input
                type="text"
                value={newClubName}
                onChange={(e) => setNewClubName(e.target.value)}
                className="input w-full text-sm"
                placeholder="Ex: IMPERIO PPPoker"
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">ID Externo</label>
              <input
                type="text"
                value={newExternalId}
                onChange={(e) => setNewExternalId(e.target.value)}
                className="input w-full text-sm"
                placeholder="Ex: 12345"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => { setShowAdd(false); setNewClubName(''); setNewExternalId(''); }}
              className="px-3 py-1.5 text-dark-400 hover:text-white text-xs transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !newPlatform}
              className="btn-primary text-xs px-4 py-1.5"
            >
              {saving ? 'Salvando...' : 'Vincular'}
            </button>
          </div>
        </div>
      )}

      {/* Platforms table */}
      <div className="card">
        {filteredPlatforms.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="Nenhuma plataforma externa"
            description="Este subclube ainda nao tem clubes externos vinculados. Clique em 'Vincular Plataforma' para adicionar."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm data-table">
              <thead>
                <tr className="border-b border-dark-700/40">
                  <th className="text-left py-2 px-3 text-xs text-dark-500 font-medium">Plataforma</th>
                  <th className="text-left py-2 px-3 text-xs text-dark-500 font-medium">Nome do Clube</th>
                  <th className="text-left py-2 px-3 text-xs text-dark-500 font-medium">ID Externo</th>
                  <th className="text-right py-2 px-3 text-xs text-dark-500 font-medium w-24">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlatforms.map((p) => {
                  const color = getPlatformColor(p.platform);
                  const isEditing = editId === p.id;

                  return (
                    <tr key={p.id} className="border-b border-dark-800/30 hover:bg-dark-800/20 transition-colors">
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${color.bg} ${color.text} ${color.border}`}>
                          {PLATFORM_LABELS[p.platform] || p.platform}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="input text-sm w-full"
                            autoFocus
                          />
                        ) : (
                          <span className="text-dark-200">{p.club_name || '-'}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editExtId}
                            onChange={(e) => setEditExtId(e.target.value)}
                            className="input text-sm w-full font-mono"
                          />
                        ) : (
                          <span className="text-dark-400 font-mono">{p.club_external_id || '-'}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={handleSaveEdit}
                              disabled={saving}
                              className="text-poker-400 hover:text-poker-300 transition-colors p-1"
                              title="Salvar"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditId(null)}
                              className="text-dark-500 hover:text-dark-300 transition-colors p-1"
                              title="Cancelar"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => startEdit(p)}
                              className="text-dark-500 hover:text-dark-200 transition-colors p-1"
                              title="Editar"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(p.id, p.club_name || p.platform)}
                              className="text-dark-500 hover:text-red-400 transition-colors p-1"
                              title="Remover"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 card bg-dark-800/30 border-dark-700/40">
        <div className="text-sm text-dark-400 space-y-1">
          <p>Vincule clubes de plataformas externas (PPPoker, ClubGG) aos subclubes da sua operacao.</p>
          <p>Cada plataforma tera settlements, taxas e conciliacao independentes.</p>
        </div>
      </div>
    </div>
  );
}
