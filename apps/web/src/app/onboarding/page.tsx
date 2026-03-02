'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  getStoredAuth,
  createTenant,
  createTenantSubclubes,
  refreshTenantList,
} from '@/lib/api';
import Spinner from '@/components/Spinner';
import { Plus, Trash2, CheckCircle2, Building2, ArrowRight } from 'lucide-react';

type Step = 'club' | 'subclubes' | 'success';

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNewFromSidebar = searchParams.get('new') === '1';

  const auth = getStoredAuth();
  const existingTenant = auth?.tenants?.[0];

  // If coming from sidebar (?new=1), start at club step; otherwise subclubes
  const initialStep: Step = isNewFromSidebar ? 'club' : 'subclubes';

  const [step, setStep] = useState<Step>(initialStep);
  const [clubName, setClubName] = useState('');
  const [tenantId, setTenantId] = useState<string>(existingTenant?.id || '');
  const [subclubeNames, setSubclubeNames] = useState<string[]>(['', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect to login if no auth
  useEffect(() => {
    if (!auth?.session?.access_token) {
      router.push('/login');
    }
  }, [auth, router]);

  if (!auth?.session?.access_token) return null;

  // ─── Step: Create Club (only for ?new=1 flow) ────────────────────

  async function handleCreateClub() {
    if (!clubName.trim()) {
      setError('Digite o nome do clube');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await createTenant(clubName.trim());
      if (res.success && res.data) {
        setTenantId((res.data as any).id);
        setStep('subclubes');
      } else {
        setError(res.error || 'Erro ao criar clube');
      }
    } catch {
      setError('Erro ao conectar');
    } finally {
      setLoading(false);
    }
  }

  // ─── Step: Create Subclubes ──────────────────────────────────────

  function addSubclube() {
    setSubclubeNames((prev) => [...prev, '']);
  }

  function removeSubclube(index: number) {
    setSubclubeNames((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSubclube(index: number, value: string) {
    setSubclubeNames((prev) => prev.map((n, i) => (i === index ? value : n)));
  }

  async function handleCreateSubclubes() {
    const names = subclubeNames.filter((n) => n.trim());
    if (names.length === 0) {
      setError('Adicione pelo menos 1 subclube');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await createTenantSubclubes(tenantId, names);
      if (res.success) {
        // Refresh tenants in localStorage and switch to new tenant
        await refreshTenantList();
        localStorage.setItem('poker_selected_tenant', tenantId);
        setStep('success');
      } else {
        setError(res.error || 'Erro ao criar subclubes');
      }
    } catch {
      setError('Erro ao conectar');
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    // Refresh and go to dashboard
    refreshTenantList().then(() => {
      localStorage.setItem('poker_selected_tenant', tenantId);
      window.location.href = '/dashboard';
    });
  }

  // ─── Render ──────────────────────────────────────────────────────

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

      <div className="w-full max-w-lg relative z-10">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-poker-500 to-poker-700 mb-4 shadow-lg shadow-poker-900/30">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {step === 'club' && 'Criar Novo Clube'}
            {step === 'subclubes' && 'Configurar Subclubes'}
            {step === 'success' && 'Tudo pronto!'}
          </h1>
          <p className="text-dark-400 mt-2 text-sm">
            {step === 'club' && 'Escolha o nome do seu clube'}
            {step === 'subclubes' && 'Adicione os subclubes da sua operacao'}
            {step === 'success' && 'Seu clube esta configurado e pronto para usar'}
          </p>
        </div>

        {/* Step indicator */}
        {step !== 'success' && (
          <div className="flex items-center justify-center gap-2 mb-6">
            {isNewFromSidebar && (
              <>
                <div
                  className={`w-8 h-1 rounded-full transition-colors ${
                    step === 'club' ? 'bg-poker-500' : 'bg-poker-500/40'
                  }`}
                />
                <div
                  className={`w-8 h-1 rounded-full transition-colors ${
                    step === 'subclubes' ? 'bg-poker-500' : 'bg-dark-700'
                  }`}
                />
              </>
            )}
            {!isNewFromSidebar && (
              <div className="w-8 h-1 rounded-full bg-poker-500" />
            )}
          </div>
        )}

        {/* ─── Club Step ──────────────────────────────────── */}
        {step === 'club' && (
          <div className="card space-y-5 animate-slide-up">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Nome do Clube
              </label>
              <input
                type="text"
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                className="input w-full"
                placeholder="Ex: Suprema Poker"
                required
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreateClub()}
              />
              <p className="text-[11px] text-dark-500 mt-1">
                Esse sera o nome da sua nova operacao
              </p>
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm animate-slide-up">
                {error}
              </div>
            )}

            <button
              onClick={handleCreateClub}
              disabled={loading || !clubName.trim()}
              className="btn-primary w-full py-3 font-semibold flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Spinner size="sm" variant="white" />
                  Criando...
                </>
              ) : (
                <>
                  Continuar
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}

        {/* ─── Subclubes Step ─────────────────────────────── */}
        {step === 'subclubes' && (
          <div className="card space-y-5 animate-slide-up">
            <div className="space-y-3">
              <label className="block text-sm font-medium text-dark-300">
                Subclubes
              </label>

              {subclubeNames.map((name, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => updateSubclube(i, e.target.value)}
                    className="input flex-1"
                    placeholder={`Subclube ${i + 1}`}
                    autoFocus={i === 0}
                  />
                  {subclubeNames.length > 1 && (
                    <button
                      onClick={() => removeSubclube(i)}
                      className="text-dark-500 hover:text-red-400 transition-colors p-2"
                      title="Remover"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}

              <button
                onClick={addSubclube}
                className="flex items-center gap-2 text-sm text-poker-400 hover:text-poker-300 transition-colors py-1"
              >
                <Plus className="w-4 h-4" />
                Adicionar subclube
              </button>
            </div>

            <p className="text-[11px] text-dark-500">
              Subclubes sao as divisoes dentro do seu clube (ex: mesas, grupos, ligas).
              Voce pode configurar mais depois em Configuracoes.
            </p>

            {error && (
              <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm animate-slide-up">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSkip}
                className="flex-1 py-3 text-sm text-dark-400 hover:text-dark-200 transition-colors rounded-lg hover:bg-dark-800"
              >
                Pular
              </button>
              <button
                onClick={handleCreateSubclubes}
                disabled={loading}
                className="btn-primary flex-[2] py-3 font-semibold flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Spinner size="sm" variant="white" />
                    Criando...
                  </>
                ) : (
                  <>
                    Finalizar
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ─── Success Step ───────────────────────────────── */}
        {step === 'success' && (
          <div className="card text-center space-y-6 animate-slide-up">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-1">Clube configurado!</h2>
              <p className="text-dark-400 text-sm">
                Seu clube e subclubes foram criados. Agora voce pode importar dados e comecar a operar.
              </p>
            </div>

            <Link
              href="/dashboard"
              onClick={() => {
                // Force hard navigation to reload with new tenant
                window.location.href = '/dashboard';
              }}
              className="btn-primary w-full py-3 font-semibold inline-flex items-center justify-center gap-2"
            >
              Ir para o Dashboard
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
