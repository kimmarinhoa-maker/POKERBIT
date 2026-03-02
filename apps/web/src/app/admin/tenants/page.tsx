'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredAuth, apiFetch } from '@/lib/api';
import Spinner from '@/components/Spinner';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  Building2,
  Users,
  ArrowLeft,
} from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'pending' | 'active' | 'suspended';
  created_at: string;
  has_subclubs: boolean;
  owner_email: string | null;
  member_count: number;
}

const statusConfig = {
  pending: { label: 'Pendente', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: Clock },
  active: { label: 'Ativo', color: 'text-green-400 bg-green-500/10 border-green-500/20', icon: CheckCircle2 },
  suspended: { label: 'Suspenso', color: 'text-red-400 bg-red-500/10 border-red-500/20', icon: Ban },
};

export default function AdminTenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [error, setError] = useState('');

  const loadTenants = useCallback(async () => {
    try {
      const url = filter === 'all' ? '/admin/tenants' : `/admin/tenants?status=${filter}`;
      const res = await apiFetch(url);
      if (res.success && res.data) {
        setTenants(res.data as Tenant[]);
      } else {
        setError(res.error || 'Erro ao carregar tenants');
      }
    } catch {
      setError('Erro ao conectar');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const auth = getStoredAuth();
    if (!auth?.session?.access_token) {
      router.push('/login');
      return;
    }
    loadTenants();
  }, [router, loadTenants]);

  async function handleStatusChange(tenantId: string, newStatus: string) {
    setActionLoading(tenantId);
    try {
      const res = await apiFetch(`/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.success) {
        setTenants((prev) =>
          prev.map((t) => (t.id === tenantId ? { ...t, status: newStatus as Tenant['status'] } : t)),
        );
      } else {
        setError(res.error || 'Erro ao atualizar status');
      }
    } catch {
      setError('Erro ao conectar');
    } finally {
      setActionLoading(null);
    }
  }

  const pendingCount = tenants.filter((t) => t.status === 'pending').length;

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Header */}
      <div className="bg-dark-900 border-b border-dark-700">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-dark-400 hover:text-white transition-colors p-1"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-600/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Admin — Tenants</h1>
              <p className="text-xs text-dark-400">Gerenciar clubes da plataforma</p>
            </div>
          </div>
          {pendingCount > 0 && (
            <span className="ml-auto px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25">
              {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Filters */}
        <div className="flex gap-2 mb-5">
          {['all', 'pending', 'active', 'suspended'].map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setLoading(true); }}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filter === f
                  ? 'bg-poker-600/20 text-poker-400 border border-poker-700/30'
                  : 'text-dark-400 hover:bg-dark-800 hover:text-dark-200 border border-transparent'
              }`}
            >
              {f === 'all' ? 'Todos' : f === 'pending' ? 'Pendentes' : f === 'active' ? 'Ativos' : 'Suspensos'}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm mb-5">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-20">
            <Building2 className="w-12 h-12 text-dark-600 mx-auto mb-3" />
            <p className="text-dark-400">Nenhum tenant encontrado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tenants.map((t) => {
              const cfg = statusConfig[t.status];
              const StatusIcon = cfg.icon;
              const isLoading = actionLoading === t.id;

              return (
                <div
                  key={t.id}
                  className="card p-0 overflow-hidden"
                >
                  <div className="flex items-center gap-4 p-4">
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-lg bg-dark-800 border border-dark-700 flex items-center justify-center text-dark-400 text-sm font-bold shrink-0">
                      {t.name[0]?.toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-white truncate">{t.name}</h3>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-dark-500">
                        {t.owner_email && <span>{t.owner_email}</span>}
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {t.member_count}
                        </span>
                        <span>{new Date(t.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {t.status === 'pending' && (
                        <button
                          onClick={() => handleStatusChange(t.id, 'active')}
                          disabled={isLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600/15 text-green-400 border border-green-600/25 hover:bg-green-600/25 transition-colors disabled:opacity-50"
                        >
                          {isLoading ? <Spinner size="sm" /> : <CheckCircle2 className="w-4 h-4" />}
                          Aprovar
                        </button>
                      )}
                      {t.status === 'pending' && (
                        <button
                          onClick={() => handleStatusChange(t.id, 'suspended')}
                          disabled={isLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-dark-400 border border-dark-700 hover:bg-dark-800 hover:text-red-400 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" />
                          Rejeitar
                        </button>
                      )}
                      {t.status === 'active' && (
                        <button
                          onClick={() => handleStatusChange(t.id, 'suspended')}
                          disabled={isLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-dark-400 border border-dark-700 hover:bg-dark-800 hover:text-red-400 transition-colors disabled:opacity-50"
                        >
                          {isLoading ? <Spinner size="sm" /> : <Ban className="w-4 h-4" />}
                          Suspender
                        </button>
                      )}
                      {t.status === 'suspended' && (
                        <button
                          onClick={() => handleStatusChange(t.id, 'active')}
                          disabled={isLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600/15 text-green-400 border border-green-600/25 hover:bg-green-600/25 transition-colors disabled:opacity-50"
                        >
                          {isLoading ? <Spinner size="sm" /> : <CheckCircle2 className="w-4 h-4" />}
                          Reativar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
