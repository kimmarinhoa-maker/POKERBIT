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
  const [chippixManagerId, setChippixManagerId] = useState('');
  const [pixKeyType, setPixKeyType] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  const loadOrg = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getOrgTree();
      if (res.success && res.data) {
        let found: any = null;
        for (const club of res.data) {
          if (club.id === orgId) { found = club; break; }
          for (const sub of club.subclubes || []) {
            if (sub.id === orgId) { found = sub; break; }
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
          setChippixManagerId(found.chippix_manager_id || '');
          setPixKeyType(found.metadata?.pix_key_type || '');
          setPixKey(found.metadata?.pix_key || '');
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
      const payload: Record<string, any> = { name };
      payload.chippix_manager_id = chippixManagerId.trim() || null;
      payload.metadata = {
        ...org.metadata,
        pix_key_type: pixKeyType.trim() || null,
        pix_key: pixKey.trim() || null,
      };
      const res = await updateOrganization(org.id, payload);
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
      if (res.success) { toast('Logo atualizada', 'success'); loadOrg(); }
      else toast(res.error || 'Erro ao enviar logo', 'error');
    } catch {
      toast('Erro ao enviar logo', 'error');
    }
  }

  async function handleLogoDelete() {
    if (!org) return;
    try {
      const res = await deleteClubLogo(org.id);
      if (res.success) { toast('Logo removida', 'success'); loadOrg(); }
      else toast(res.error || 'Erro ao remover logo', 'error');
    } catch {
      toast('Erro ao remover logo', 'error');
    }
  }

  if (loading) return <TableSkeleton columns={2} rows={3} />;
  if (!org) return <div className="text-dark-400 text-sm">Organizacao nao encontrada</div>;

  const isSubclub = org.type === 'SUBCLUB';

  return (
    <div className="animate-tab-fade">
      {/* Compact layout: Logo + Fields side by side */}
      <div className="card">
        <div className="flex gap-6 items-start">
          {/* Logo column */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <ClubLogo logoUrl={org.logo_url} name={org.name} size="lg" />
            <div className="flex gap-2">
              <label className="text-[11px] text-poker-400 hover:text-poker-300 cursor-pointer font-medium transition-colors">
                Alterar
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
              {org.logo_url && (
                <button onClick={handleLogoDelete} className="text-[11px] text-dark-500 hover:text-red-400 transition-colors">
                  Remover
                </button>
              )}
            </div>
          </div>

          {/* Fields column */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Name — editable */}
            <div>
              <label className="block text-[11px] text-dark-500 uppercase tracking-wider mb-1">
                {isSubclub ? 'Nome do Subclube' : 'Nome do Clube'}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setDirty(true); }}
                className="input w-full text-sm"
              />
            </div>

            {/* Platform + ID — inline row */}
            <div className="flex gap-3">
              {!isSubclub && org.platform && (
                <div className="flex-1 min-w-0">
                  <label className="block text-[11px] text-dark-500 uppercase tracking-wider mb-1">Plataforma</label>
                  <div className="input w-full bg-dark-800/50 text-dark-400 cursor-not-allowed text-sm flex items-center gap-2">
                    <span className="truncate">{org.platform}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/10 text-green-400 border border-green-500/20 shrink-0">auto</span>
                  </div>
                </div>
              )}
              {org.external_id && (
                <div className="flex-1 min-w-0">
                  <label className="block text-[11px] text-dark-500 uppercase tracking-wider mb-1">
                    {isSubclub ? 'ID Subclube' : 'ID Clube'}
                  </label>
                  <div className="input w-full bg-dark-800/50 text-dark-400 cursor-not-allowed text-sm font-mono flex items-center gap-2">
                    <span className="truncate">{org.external_id}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/10 text-green-400 border border-green-500/20 shrink-0">auto</span>
                  </div>
                </div>
              )}
            </div>

            {/* ChipPix Manager ID */}
            <div>
                <label className="block text-[11px] text-dark-500 uppercase tracking-wider mb-1">ChipPix Manager ID</label>
                <div className="flex items-stretch">
                  <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-dark-600 bg-dark-800 text-dark-400 text-sm font-mono select-none">Chippix_</span>
                  <input
                    type="text"
                    value={chippixManagerId.replace(/^[Cc]hippix_/i, '')}
                    onChange={(e) => {
                      const num = e.target.value.replace(/^[Cc]hippix_/i, '').trim();
                      setChippixManagerId(num ? `Chippix_${num}` : '');
                      setDirty(true);
                    }}
                    className="input w-full text-sm font-mono rounded-l-none"
                    placeholder="143"
                  />
                </div>
                <p className="text-[10px] text-dark-600 mt-1">Numero do operador na planilha (coluna Manager Remark)</p>
            </div>

            {/* Chave PIX */}
            <div>
              <label className="block text-[11px] text-dark-500 uppercase tracking-wider mb-1">Chave PIX</label>
              <div className="flex gap-2">
                <select
                  value={pixKeyType}
                  onChange={(e) => { setPixKeyType(e.target.value); setDirty(true); }}
                  className="input text-sm w-36 shrink-0"
                >
                  <option value="">Tipo...</option>
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                  <option value="email">E-mail</option>
                  <option value="celular">Celular</option>
                  <option value="aleatoria">Aleatória</option>
                </select>
                <input
                  type="text"
                  value={pixKey}
                  onChange={(e) => { setPixKey(e.target.value); setDirty(true); }}
                  className="input w-full text-sm font-mono"
                  placeholder={pixKeyType === 'cpf' ? '000.000.000-00' : pixKeyType === 'cnpj' ? '00.000.000/0000-00' : pixKeyType === 'email' ? 'email@exemplo.com' : pixKeyType === 'celular' ? '+5511999999999' : 'Chave PIX'}
                />
              </div>
              <p className="text-[10px] text-dark-600 mt-1">Chave PIX para receber pagamentos deste clube</p>
            </div>

            {/* Save — right aligned, compact */}
            <div className="flex justify-end pt-1">
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="btn-primary text-xs px-5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
