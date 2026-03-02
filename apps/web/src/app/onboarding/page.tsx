'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getStoredAuth,
  createTenant,
  createTenantSubclubes,
  refreshTenantList,
  uploadClubLogo,
  updateOrgMetadata,
  updateOrganization,
  updateTenantConfig,
  createClubPlatform,
  createPrefixRule,
} from '@/lib/api';
import Spinner from '@/components/Spinner';
import {
  Plus,
  Trash2,
  CheckCircle2,
  Building2,
  ArrowRight,
  ArrowLeft,
  Camera,
  Globe,
  FileText,
  Layers,
} from 'lucide-react';

type Step = 'club' | 'subclubes' | 'platforms' | 'summary';

const PLATFORM_OPTIONS = [
  'Suprema Poker',
  'PPPoker',
  'PokerBros',
  'Cacheta League',
  'ClubGG',
  'X-Poker',
  'Pokerrrr 2',
  'Upoker',
  'KKPoker',
];

interface SubclubeRow {
  name: string;
  prefix: string;
  externalId: string;
}

interface PlatformRow {
  platform: string;
  clubName: string;
  clubExternalId: string;
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNewFromSidebar = searchParams.get('new') === '1';

  const auth = getStoredAuth();
  const existingTenant = auth?.tenants?.[0];

  // If coming from sidebar (?new=1), start at club step; otherwise subclubes
  const initialStep: Step = isNewFromSidebar ? 'club' : 'subclubes';

  const [step, setStep] = useState<Step>(initialStep);

  // ─── Club step state ──────────────────────────────────────────
  const [clubName, setClubName] = useState('');
  const [tenantId, setTenantId] = useState<string>(existingTenant?.id || '');
  const [clubOrgId, setClubOrgId] = useState<string>('');
  const [hasSubclubs, setHasSubclubs] = useState(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [platform, setPlatform] = useState('');
  const [clubExternalId, setClubExternalId] = useState('');
  const [pixKey, setPixKey] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Subclubes step state ─────────────────────────────────────
  const [subclubes, setSubclubes] = useState<SubclubeRow[]>([
    { name: '', prefix: '', externalId: '' },
    { name: '', prefix: '', externalId: '' },
  ]);

  // ─── Platforms step state ─────────────────────────────────────
  const [wantsOtherPlatforms, setWantsOtherPlatforms] = useState<boolean | null>(null);
  const [extraPlatforms, setExtraPlatforms] = useState<PlatformRow[]>([
    { platform: '', clubName: '', clubExternalId: '' },
  ]);

  // ─── Shared state ─────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect to login if no auth
  useEffect(() => {
    if (!auth?.session?.access_token) {
      router.push('/login');
    }
  }, [auth, router]);

  if (!auth?.session?.access_token) return null;

  // ─── Step indicator logic ─────────────────────────────────────
  function getSteps(): Step[] {
    if (!isNewFromSidebar) return ['subclubes'];
    if (hasSubclubs) return ['club', 'subclubes', 'platforms', 'summary'];
    return ['club', 'platforms', 'summary'];
  }

  const steps = getSteps();
  const currentIndex = steps.indexOf(step);

  // ─── Helpers ──────────────────────────────────────────────────

  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('Imagem deve ter no maximo 2MB');
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  // ─── Step 1: Create Club ──────────────────────────────────────

  async function handleCreateClub() {
    if (!clubName.trim()) {
      setError('Digite o nome do clube');
      return;
    }
    if (!platform) {
      setError('Selecione a plataforma');
      return;
    }
    if (!clubExternalId.trim()) {
      setError('Informe o ID do clube na plataforma');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await createTenant(clubName.trim(), hasSubclubs);
      if (!res.success || !res.data) {
        setError(res.error || 'Erro ao criar clube');
        return;
      }

      const newTenantId = (res.data as any).id;
      const orgId = (res.data as any).club_org_id;
      setTenantId(newTenantId);
      setClubOrgId(orgId || '');

      // Set tenant in localStorage so apiFetch sends correct X-Tenant-Id
      localStorage.setItem('poker_selected_tenant', newTenantId);

      // Fire-and-forget parallel operations
      const promises: Promise<any>[] = [];

      // Upload logo
      if (logoFile && orgId) {
        promises.push(uploadClubLogo(orgId, logoFile).catch(() => {}));
      }

      // Save platform in org metadata
      if (orgId) {
        promises.push(updateOrgMetadata(orgId, { platform }).catch(() => {}));
      }

      // Save external_id on org
      if (orgId && clubExternalId.trim()) {
        promises.push(
          updateOrganization(orgId, { external_id: clubExternalId.trim() }).catch(() => {}),
        );
      }

      // Save PIX key in tenant config
      if (pixKey.trim()) {
        promises.push(updateTenantConfig({ pix_key: pixKey.trim() }).catch(() => {}));
      }

      // Create primary club_platform record
      promises.push(
        createClubPlatform({
          platform,
          club_name: clubName.trim(),
          club_external_id: clubExternalId.trim(),
          is_primary: true,
        }).catch(() => {}),
      );

      await Promise.all(promises);

      // Navigate to next step
      if (hasSubclubs) {
        setStep('subclubes');
      } else {
        setStep('platforms');
      }
    } catch {
      setError('Erro ao conectar');
    } finally {
      setLoading(false);
    }
  }

  // ─── Step 2: Subclubes ────────────────────────────────────────

  function addSubclube() {
    setSubclubes((prev) => [...prev, { name: '', prefix: '', externalId: '' }]);
  }

  function removeSubclube(index: number) {
    setSubclubes((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSubclubeField(index: number, field: keyof SubclubeRow, value: string) {
    setSubclubes((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  }

  async function handleCreateSubclubes() {
    const valid = subclubes.filter((s) => s.name.trim());
    if (valid.length === 0) {
      setError('Adicione pelo menos 1 subclube');
      return;
    }
    setLoading(true);
    setError('');

    try {
      // Create subclubes (new format with external_id)
      const payload = valid.map((s) => ({
        name: s.name.trim(),
        ...(s.externalId.trim() ? { external_id: s.externalId.trim() } : {}),
      }));
      const res = await createTenantSubclubes(tenantId, payload);

      if (!res.success) {
        setError(res.error || 'Erro ao criar subclubes');
        return;
      }

      // Create prefix rules for subclubes with prefix
      const created = (res.data as any[]) || [];
      const prefixPromises: Promise<any>[] = [];

      valid.forEach((s, i) => {
        if (s.prefix.trim() && created[i]?.id) {
          prefixPromises.push(
            createPrefixRule({
              prefix: s.prefix.trim(),
              subclub_id: created[i].id,
            }).catch(() => {}),
          );
        }
      });

      if (prefixPromises.length > 0) {
        await Promise.all(prefixPromises);
      }

      setStep('platforms');
    } catch {
      setError('Erro ao conectar');
    } finally {
      setLoading(false);
    }
  }

  // ─── Step 3: Other Platforms ──────────────────────────────────

  function addExtraPlatform() {
    setExtraPlatforms((prev) => [...prev, { platform: '', clubName: '', clubExternalId: '' }]);
  }

  function removeExtraPlatform(index: number) {
    setExtraPlatforms((prev) => prev.filter((_, i) => i !== index));
  }

  function updateExtraPlatform(index: number, field: keyof PlatformRow, value: string) {
    setExtraPlatforms((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  }

  // Available platforms (exclude the primary one already selected)
  const availablePlatforms = PLATFORM_OPTIONS.filter((p) => p !== platform);

  async function handleSavePlatforms() {
    setLoading(true);
    setError('');

    try {
      if (wantsOtherPlatforms) {
        const valid = extraPlatforms.filter((p) => p.platform.trim());
        const promises = valid.map((p) =>
          createClubPlatform({
            platform: p.platform.trim(),
            club_name: p.clubName.trim() || undefined,
            club_external_id: p.clubExternalId.trim() || undefined,
          }).catch(() => {}),
        );
        await Promise.all(promises);
      }

      // Refresh tenant list before summary
      await refreshTenantList();
      localStorage.setItem('poker_selected_tenant', tenantId);

      setStep('summary');
    } catch {
      setError('Erro ao conectar');
    } finally {
      setLoading(false);
    }
  }

  // ─── Step 4: Summary (non-new flow skip) ──────────────────────

  function handleSkipSubclubes() {
    refreshTenantList().then(() => {
      localStorage.setItem('poker_selected_tenant', tenantId);
      window.location.href = '/dashboard';
    });
  }

  // ─── Render ──────────────────────────────────────────────────

  const stepTitles: Record<Step, string> = {
    club: 'Criar Novo Clube',
    subclubes: 'Configurar Subclubes',
    platforms: 'Outras Plataformas',
    summary: 'Tudo pronto!',
  };

  const stepDescriptions: Record<Step, string> = {
    club: 'Configure seu clube para comecar a operar',
    subclubes: 'Adicione os subclubes da sua operacao',
    platforms: 'Sua operacao usa mais de uma plataforma?',
    summary: 'Seu clube esta configurado e pronto para usar',
  };

  const stepIcons: Record<Step, React.ReactNode> = {
    club: <Building2 className="w-7 h-7 text-white" />,
    subclubes: <Layers className="w-7 h-7 text-white" />,
    platforms: <Globe className="w-7 h-7 text-white" />,
    summary: <CheckCircle2 className="w-8 h-8 text-green-400" />,
  };

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
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg ${
            step === 'summary'
              ? 'bg-green-500/20 border border-green-500/30 rounded-full'
              : 'bg-gradient-to-br from-poker-500 to-poker-700 shadow-poker-900/30'
          }`}>
            {stepIcons[step]}
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {stepTitles[step]}
          </h1>
          <p className="text-dark-400 mt-2 text-sm">
            {stepDescriptions[step]}
          </p>
        </div>

        {/* Step indicator */}
        {step !== 'summary' && steps.length > 1 && (
          <div className="flex items-center justify-center gap-2 mb-6">
            {steps.filter((s) => s !== 'summary').map((s, i) => (
              <div
                key={s}
                className={`w-8 h-1 rounded-full transition-colors ${
                  i <= currentIndex ? 'bg-poker-500' : 'bg-dark-700'
                }`}
              />
            ))}
          </div>
        )}

        {/* ─── Club Step ──────────────────────────────────── */}
        {step === 'club' && (
          <div className="card space-y-5 animate-slide-up">
            {/* Logo upload */}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="relative w-20 h-20 rounded-2xl bg-dark-800 border-2 border-dashed border-dark-600 hover:border-poker-500/50 flex items-center justify-center transition-colors group overflow-hidden"
              >
                {logoPreview ? (
                  <>
                    <img src={logoPreview} alt="Logo" className="w-full h-full object-cover rounded-2xl" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                      <Camera className="w-5 h-5 text-white" />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1 text-dark-500 group-hover:text-poker-400 transition-colors">
                    <Camera className="w-6 h-6" />
                    <span className="text-[10px]">Logo</span>
                  </div>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleLogoSelect}
                className="hidden"
              />
              <p className="text-[10px] text-dark-600">PNG, JPG ou WebP — max 2MB</p>
            </div>

            {/* Club name */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Nome do Clube <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                className="input w-full"
                placeholder="Ex: Suprema Poker"
                required
                autoFocus
              />
            </div>

            {/* Platform */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Plataforma <span className="text-red-400">*</span>
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="input w-full"
              >
                <option value="">Selecione a plataforma</option>
                {PLATFORM_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Club external ID */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                ID do Clube na Plataforma <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={clubExternalId}
                onChange={(e) => setClubExternalId(e.target.value)}
                className="input w-full"
                placeholder="Ex: 123456"
              />
              <p className="text-[11px] text-dark-500 mt-1">
                O codigo do seu clube dentro da plataforma
              </p>
            </div>

            {/* PIX key */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Chave PIX
              </label>
              <input
                type="text"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                className="input w-full"
                placeholder="CPF, e-mail, telefone ou chave aleatoria"
              />
              <p className="text-[11px] text-dark-500 mt-1">
                Sera exibida nos comprovantes de pagamento
              </p>
            </div>

            {/* Toggle subclubes */}
            <label className="flex items-center justify-between cursor-pointer select-none py-2 px-3 rounded-lg bg-dark-800/50 border border-dark-700/50">
              <div>
                <span className="text-sm font-medium text-dark-200">Meu clube tem subclubes</span>
                <p className="text-[11px] text-dark-500 mt-0.5">
                  Desative se voce opera apenas um clube sem divisoes internas
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hasSubclubs}
                onClick={() => setHasSubclubs((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  hasSubclubs ? 'bg-poker-500' : 'bg-dark-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                    hasSubclubs ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>

            {error && (
              <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm animate-slide-up">
                {error}
              </div>
            )}

            <button
              onClick={handleCreateClub}
              disabled={loading || !clubName.trim() || !platform || !clubExternalId.trim()}
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

              {/* Table header */}
              <div className="grid grid-cols-[1fr_80px_100px_32px] gap-2 text-[11px] text-dark-500 font-medium px-1">
                <span>Nome</span>
                <span>Sigla</span>
                <span>ID Plataforma</span>
                <span></span>
              </div>

              {subclubes.map((sub, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-center">
                  <input
                    type="text"
                    value={sub.name}
                    onChange={(e) => updateSubclubeField(i, 'name', e.target.value)}
                    className="input"
                    placeholder={`Subclube ${i + 1}`}
                    autoFocus={i === 0}
                  />
                  <input
                    type="text"
                    value={sub.prefix}
                    onChange={(e) => updateSubclubeField(i, 'prefix', e.target.value)}
                    className="input text-center"
                    placeholder="Ex: SP"
                    maxLength={10}
                  />
                  <input
                    type="text"
                    value={sub.externalId}
                    onChange={(e) => updateSubclubeField(i, 'externalId', e.target.value)}
                    className="input text-center"
                    placeholder="ID"
                  />
                  {subclubes.length > 1 ? (
                    <button
                      onClick={() => removeSubclube(i)}
                      className="text-dark-500 hover:text-red-400 transition-colors p-1"
                      title="Remover"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <div />
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
              Subclubes sao as divisoes dentro do seu clube. A sigla e usada para identificar
              jogadores automaticamente na importacao. Voce pode configurar mais depois.
            </p>

            {error && (
              <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm animate-slide-up">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              {!isNewFromSidebar ? (
                <button
                  onClick={handleSkipSubclubes}
                  className="flex-1 py-3 text-sm text-dark-400 hover:text-dark-200 transition-colors rounded-lg hover:bg-dark-800"
                >
                  Pular
                </button>
              ) : (
                <button
                  onClick={() => { setError(''); setStep('club'); }}
                  className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-dark-400 hover:text-dark-200 transition-colors rounded-lg hover:bg-dark-800"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar
                </button>
              )}
              <button
                onClick={isNewFromSidebar ? handleCreateSubclubes : async () => {
                  // Existing tenant flow (no ?new=1) — just create subclubes and go to dashboard
                  const valid = subclubes.filter((s) => s.name.trim());
                  if (valid.length === 0) {
                    setError('Adicione pelo menos 1 subclube');
                    return;
                  }
                  setLoading(true);
                  setError('');
                  try {
                    const names = valid.map((s) => s.name.trim());
                    const res = await createTenantSubclubes(tenantId, names);
                    if (res.success) {
                      await refreshTenantList();
                      localStorage.setItem('poker_selected_tenant', tenantId);
                      window.location.href = '/dashboard';
                    } else {
                      setError(res.error || 'Erro ao criar subclubes');
                    }
                  } catch {
                    setError('Erro ao conectar');
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="btn-primary flex-[2] py-3 font-semibold flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Spinner size="sm" variant="white" />
                    Criando...
                  </>
                ) : isNewFromSidebar ? (
                  <>
                    Continuar
                    <ArrowRight className="w-4 h-4" />
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

        {/* ─── Platforms Step ─────────────────────────────── */}
        {step === 'platforms' && (
          <div className="card space-y-5 animate-slide-up">
            {/* Yes/No cards */}
            {wantsOtherPlatforms === null && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setWantsOtherPlatforms(true)}
                  className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dark-700 hover:border-poker-500/50 bg-dark-800/50 hover:bg-dark-800 transition-all group"
                >
                  <Globe className="w-8 h-8 text-dark-400 group-hover:text-poker-400 transition-colors" />
                  <span className="text-sm font-medium text-dark-200">Sim, uso mais</span>
                  <span className="text-[11px] text-dark-500">Configurar plataformas</span>
                </button>
                <button
                  onClick={() => setWantsOtherPlatforms(false)}
                  className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dark-700 hover:border-green-500/50 bg-dark-800/50 hover:bg-dark-800 transition-all group"
                >
                  <CheckCircle2 className="w-8 h-8 text-dark-400 group-hover:text-green-400 transition-colors" />
                  <span className="text-sm font-medium text-dark-200">Nao, so uma</span>
                  <span className="text-[11px] text-dark-500">Pular esta etapa</span>
                </button>
              </div>
            )}

            {/* Platform form (if yes) */}
            {wantsOtherPlatforms === true && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-dark-300">
                    Plataformas adicionais
                  </label>
                  <span className="text-[11px] text-dark-500">
                    Principal: {platform || 'N/A'}
                  </span>
                </div>

                {/* Table header */}
                <div className="grid grid-cols-[1fr_1fr_100px_32px] gap-2 text-[11px] text-dark-500 font-medium px-1">
                  <span>Plataforma</span>
                  <span>Nome do Clube</span>
                  <span>ID</span>
                  <span></span>
                </div>

                {extraPlatforms.map((ep, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_100px_32px] gap-2 items-center">
                    <select
                      value={ep.platform}
                      onChange={(e) => updateExtraPlatform(i, 'platform', e.target.value)}
                      className="input"
                    >
                      <option value="">Selecione</option>
                      {availablePlatforms
                        .filter((p) => !extraPlatforms.some((ep2, j) => j !== i && ep2.platform === p))
                        .map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                    <input
                      type="text"
                      value={ep.clubName}
                      onChange={(e) => updateExtraPlatform(i, 'clubName', e.target.value)}
                      className="input"
                      placeholder="Nome"
                    />
                    <input
                      type="text"
                      value={ep.clubExternalId}
                      onChange={(e) => updateExtraPlatform(i, 'clubExternalId', e.target.value)}
                      className="input text-center"
                      placeholder="ID"
                    />
                    {extraPlatforms.length > 1 ? (
                      <button
                        onClick={() => removeExtraPlatform(i)}
                        className="text-dark-500 hover:text-red-400 transition-colors p-1"
                        title="Remover"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <div />
                    )}
                  </div>
                ))}

                <button
                  onClick={addExtraPlatform}
                  className="flex items-center gap-2 text-sm text-poker-400 hover:text-poker-300 transition-colors py-1"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar plataforma
                </button>
              </div>
            )}

            {/* No selected — just show a message */}
            {wantsOtherPlatforms === false && (
              <div className="text-center py-4">
                <p className="text-dark-400 text-sm">
                  Tudo certo! Voce pode adicionar mais plataformas depois em Configuracoes.
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm animate-slide-up">
                {error}
              </div>
            )}

            {/* Navigation buttons */}
            {wantsOtherPlatforms !== null && (
              <div className="flex gap-3">
                <button
                  onClick={() => { setError(''); setWantsOtherPlatforms(null); }}
                  className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-dark-400 hover:text-dark-200 transition-colors rounded-lg hover:bg-dark-800"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar
                </button>
                <button
                  onClick={handleSavePlatforms}
                  disabled={loading}
                  className="btn-primary flex-[2] py-3 font-semibold flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Spinner size="sm" variant="white" />
                      Salvando...
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
          </div>
        )}

        {/* ─── Summary Step ───────────────────────────────── */}
        {step === 'summary' && (
          <div className="card space-y-6 animate-slide-up">
            {/* Checklist */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                <span className="text-dark-200">
                  Clube <span className="text-white font-medium">{clubName || 'configurado'}</span> criado
                </span>
              </div>

              {platform && (
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                  <span className="text-dark-200">
                    Plataforma <span className="text-white font-medium">{platform}</span> — ID {clubExternalId}
                  </span>
                </div>
              )}

              {hasSubclubs && subclubes.filter((s) => s.name.trim()).length > 0 && (
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                  <span className="text-dark-200">
                    {subclubes.filter((s) => s.name.trim()).length} subclube(s) configurado(s)
                  </span>
                </div>
              )}

              {pixKey && (
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                  <span className="text-dark-200">Chave PIX salva</span>
                </div>
              )}

              {wantsOtherPlatforms && extraPlatforms.filter((p) => p.platform).length > 0 && (
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                  <span className="text-dark-200">
                    {extraPlatforms.filter((p) => p.platform).length} plataforma(s) adicional(is)
                  </span>
                </div>
              )}
            </div>

            <div className="border-t border-dark-700 pt-4">
              <p className="text-dark-400 text-sm mb-4">
                Seu clube esta pronto. Agora voce pode importar dados ou ir para o dashboard.
              </p>
            </div>

            <button
              onClick={() => {
                window.location.href = '/import';
              }}
              className="btn-primary w-full py-3 font-semibold inline-flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Importar Dados
            </button>

            <button
              onClick={() => {
                window.location.href = '/dashboard';
              }}
              className="w-full py-3 text-sm text-dark-400 hover:text-dark-200 transition-colors rounded-lg hover:bg-dark-800 font-medium"
            >
              Ir para o Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
