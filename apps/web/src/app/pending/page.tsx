'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredAuth, clearAuth } from '@/lib/api';
import { Clock, LogOut, RefreshCw } from 'lucide-react';

export default function PendingPage() {
  const router = useRouter();
  const auth = getStoredAuth();
  const tenant = auth?.tenants?.[0];

  useEffect(() => {
    if (!auth?.session?.access_token) {
      router.push('/login');
    }
    // If tenant is already active, redirect to dashboard
    if (tenant?.status === 'active') {
      router.push('/dashboard');
    }
  }, [auth, tenant, router]);

  function handleLogout() {
    localStorage.removeItem('poker_selected_tenant');
    clearAuth();
    router.push('/login');
  }

  function handleRefresh() {
    window.location.reload();
  }

  if (!auth?.session?.access_token) return null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background pattern */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />

      <div className="w-full max-w-md relative z-10 text-center">
        {/* Icon */}
        <div className="animate-fade-in mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-5">
            <Clock className="w-9 h-9 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Aguardando Aprovacao</h1>
          <p className="text-dark-400 mt-3 text-sm leading-relaxed max-w-sm mx-auto">
            Sua conta para <span className="text-white font-medium">{tenant?.name || 'seu clube'}</span> foi
            criada com sucesso. Um administrador da plataforma precisa aprovar o acesso antes de voce
            poder utilizar o sistema.
          </p>
        </div>

        {/* Status card */}
        <div className="card animate-slide-up space-y-4">
          <div className="flex items-center gap-3 p-3 bg-amber-500/5 border border-amber-500/15 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-sm text-amber-300">Status: Pendente</span>
          </div>

          <p className="text-xs text-dark-500">
            Voce recebera acesso assim que a aprovacao for concluida.
            Tente atualizar a pagina periodicamente.
          </p>

          <div className="flex gap-3">
            <button
              onClick={handleRefresh}
              className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Verificar status
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 py-2.5 text-sm text-dark-400 hover:text-dark-200 border border-dark-700 rounded-lg hover:bg-dark-800 transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </div>

        <p className="text-center text-dark-600 text-xs mt-8">Poker Manager SaaS v1.0</p>
      </div>
    </div>
  );
}
