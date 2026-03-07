'use client';

import { useState, useEffect, useCallback } from 'react';
import { getOrgTree, updateOrganization, uploadClubLogo, deleteClubLogo } from '@/lib/api';
import { useToast } from '@/components/Toast';
import ClubLogo from '@/components/ClubLogo';
import TableSkeleton from '@/components/ui/TableSkeleton';

interface Props {
  orgId: string;
}

interface OrgData {
  id: string;
  name: string;
  type: string;
  external_id: string | null;
  platform: string;
  logo_url: string | null;
  metadata: Record<string, any>;
}

export default function ClubDadosClube({ orgId }: Props) {
  const [org, setOrg] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  const loadOrg = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getOrgTree();
      if (res.success && res.data) {
        let found: any = null;
        // Search in clubs first, then subclubes
        for (const club of res.data) {
          if (club.id === orgId) {
            found = club;
            break;
          }
          for (const sub of club.subclubes || []) {
            if (sub.id === orgId) {
              found = sub;
              break;
            }
          }
          if (found) break;
        }
        if (found) {
          const data: OrgData = {
            id: found.id,
            name: found.name,
            type: found.type || 'CLUB',
            external_id: found.external_id,
            platform: found.metadata?.platform || '',
            logo_url: found.logo_url || found.metadata?.logo_url || null,
            metadata: found.metadata || {},
          };
          setOrg(data);
          setName(data.name);
        }
      }
    } catch {
      toast('Erro ao carregar dados', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgId, toast]);

  useEffect(() => { loadOrg(); }, [loadOrg]);

  async function handleSave() {
    if (!org) return;
    setSaving(true);
    try {
      const res = await updateOrganization(org.id, { name });
      if (res.success) {
        toast('Dados atualizados', 'success');
        setDirty(false);
        loadOrg();
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
    if (!org || !e.target.files?.[0]) return;
    try {
      const res = await uploadClubLogo(org.id, e.target.files[0]);
      if (res.success) {
        toast('Logo atualizada', 'success');
        loadOrg();
      } else {
        toast(res.error || 'Erro ao enviar logo', 'error');
      }
    } catch {
      toast('Erro ao enviar logo', 'error');
    }
  }

  async function handleLogoDelete() {
    if (!org) return;
    try {
      const res = await deleteClubLogo(org.id);
      if (res.success) {
        toast('Logo removida', 'success');
        loadOrg();
      } else {
        toast(res.error || 'Erro ao remover logo', 'error');
      }
    } catch {
      toast('Erro ao remover logo', 'error');
    }
  }

  if (loading) return <div className="p-4 lg:p-6"><TableSkeleton columns={2} rows={4} /></div>;
  if (!org) return <div className="p-4 lg:p-6 text-dark-400">Organizacao nao encontrada</div>;

  const isSubclub = org.type === 'SUBCLUB';
  const title = isSubclub ? 'Dados do Subclube' : 'Dados do Clube';

  return (
    <div className="p-4 lg:p-6 animate-tab-fade max-w-lg">
      <div className="mb-6">
        <h3 className="text-base font-bold text-white">{title}</h3>
        <p className="text-dark-500 text-xs mt-0.5">Informacoes e identidade visual</p>
      </div>

      {/* Logo */}
      <div className="mb-6">
        <label className="block text-[11px] text-dark-500 uppercase tracking-wider mb-2">Logo</label>
        <div className="flex items-center gap-4">
          <ClubLogo logoUrl={org.logo_url} name={org.name} size="lg" />
          <div className="flex flex-col gap-2">
            <label className="btn-primary text-xs px-3 py-1.5 cursor-pointer text-center">
              Alterar
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </label>
            {org.logo_url && (
              <button onClick={handleLogoDelete} className="text-xs text-red-400 hover:text-red-300">
                Remover
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="mb-4">
        <label className="block text-[11px] text-dark-500 uppercase tracking-wider mb-1.5">
          {isSubclub ? 'Nome do Subclube' : 'Nome do Clube'}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setDirty(true); }}
          className="input w-full"
        />
      </div>

      {/* Platform (read-only, only for clubs) */}
      {!isSubclub && org.platform && (
        <div className="mb-4">
          <label className="block text-[11px] text-dark-500 uppercase tracking-wider mb-1.5">Plataforma</label>
          <div className="input w-full bg-dark-800/50 text-dark-400 cursor-not-allowed flex items-center gap-2">
            {org.platform}
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">auto-detectado</span>
          </div>
        </div>
      )}

      {/* External ID (read-only) */}
      {org.external_id && (
        <div className="mb-4">
          <label className="block text-[11px] text-dark-500 uppercase tracking-wider mb-1.5">
            {isSubclub ? 'ID do Subclube' : 'ID do Clube'}
          </label>
          <div className="input w-full bg-dark-800/50 text-dark-400 cursor-not-allowed font-mono flex items-center gap-2">
            {org.external_id}
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">auto-detectado</span>
          </div>
        </div>
      )}

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
