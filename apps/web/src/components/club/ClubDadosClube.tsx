'use client';

import { useState, useEffect, useCallback } from 'react';
import { getOrgTree, updateOrganization, uploadClubLogo, deleteClubLogo } from '@/lib/api';
import { useToast } from '@/components/Toast';
import ClubLogo from '@/components/ClubLogo';
import TableSkeleton from '@/components/ui/TableSkeleton';

interface Props {
  clubId: string;
}

interface ClubData {
  id: string;
  name: string;
  external_id: string | null;
  platform: string;
  logo_url: string | null;
  metadata: Record<string, any>;
}

export default function ClubDadosClube({ clubId }: Props) {
  const [club, setClub] = useState<ClubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  const loadClub = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getOrgTree();
      if (res.success && res.data) {
        const found = res.data.find((c: any) => c.id === clubId);
        if (found) {
          const data: ClubData = {
            id: found.id,
            name: found.name,
            external_id: found.external_id,
            platform: found.metadata?.platform || '',
            logo_url: found.logo_url || found.metadata?.logo_url || null,
            metadata: found.metadata || {},
          };
          setClub(data);
          setName(data.name);
        }
      }
    } catch {
      toast('Erro ao carregar dados do clube', 'error');
    } finally {
      setLoading(false);
    }
  }, [clubId, toast]);

  useEffect(() => { loadClub(); }, [loadClub]);

  async function handleSave() {
    if (!club) return;
    setSaving(true);
    try {
      const res = await updateOrganization(club.id, { name });
      if (res.success) {
        toast('Dados do clube atualizados', 'success');
        setDirty(false);
        loadClub();
      } else {
        toast(res.error || 'Erro ao salvar', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!club || !e.target.files?.[0]) return;
    try {
      const res = await uploadClubLogo(club.id, e.target.files[0]);
      if (res.success) {
        toast('Logo atualizada', 'success');
        loadClub();
      } else {
        toast(res.error || 'Erro ao enviar logo', 'error');
      }
    } catch {
      toast('Erro ao enviar logo', 'error');
    }
  }

  async function handleLogoDelete() {
    if (!club) return;
    try {
      const res = await deleteClubLogo(club.id);
      if (res.success) {
        toast('Logo removida', 'success');
        loadClub();
      } else {
        toast(res.error || 'Erro ao remover logo', 'error');
      }
    } catch {
      toast('Erro ao remover logo', 'error');
    }
  }

  if (loading) return <div className="p-4 lg:p-6"><TableSkeleton columns={2} rows={4} /></div>;
  if (!club) return <div className="p-4 lg:p-6 text-dark-400">Clube nao encontrado</div>;

  return (
    <div className="p-4 lg:p-6 animate-tab-fade max-w-lg">
      <div className="mb-6">
        <h3 className="text-base font-bold text-white">Dados do Clube</h3>
        <p className="text-dark-500 text-xs mt-0.5">Informacoes e identidade visual</p>
      </div>

      {/* Logo */}
      <div className="mb-6">
        <label className="block text-[11px] text-dark-500 uppercase tracking-wider mb-2">Logo</label>
        <div className="flex items-center gap-4">
          <ClubLogo logoUrl={club.logo_url} name={club.name} size="lg" />
          <div className="flex flex-col gap-2">
            <label className="btn-primary text-xs px-3 py-1.5 cursor-pointer text-center">
              Alterar
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </label>
            {club.logo_url && (
              <button onClick={handleLogoDelete} className="text-xs text-red-400 hover:text-red-300">
                Remover
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="mb-4">
        <label className="block text-[11px] text-dark-500 uppercase tracking-wider mb-1.5">Nome do Clube</label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setDirty(true); }}
          className="input w-full"
        />
      </div>

      {/* Platform (read-only) */}
      <div className="mb-4">
        <label className="block text-[11px] text-dark-500 uppercase tracking-wider mb-1.5">Plataforma</label>
        <div className="input w-full bg-dark-800/50 text-dark-400 cursor-not-allowed flex items-center gap-2">
          {club.platform || 'N/A'}
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">auto-detectado</span>
        </div>
      </div>

      {/* External ID (read-only) */}
      <div className="mb-4">
        <label className="block text-[11px] text-dark-500 uppercase tracking-wider mb-1.5">ID do Clube</label>
        <div className="input w-full bg-dark-800/50 text-dark-400 cursor-not-allowed font-mono flex items-center gap-2">
          {club.external_id || 'N/A'}
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">auto-detectado</span>
        </div>
      </div>

      {/* Save */}
      <div className="flex gap-3 mt-6 pt-4 border-t border-dark-700/50">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="btn-primary text-sm px-6 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
