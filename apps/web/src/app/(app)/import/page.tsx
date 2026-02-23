'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  importPreview,
  importConfirm,
  listOrganizations,
  linkAgent,
  linkPlayer,
  bulkLinkPlayers,
  formatBRL,
  formatDate,
} from '@/lib/api';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/Spinner';

// ─── Types ──────────────────────────────────────────────────────────

type WizardStep = 'upload' | 'preview' | 'pendencies' | 'confirm';

interface PreviewData {
  week: {
    week_start: string;
    week_end: string;
    detected_from: string;
    confidence: string;
  };
  summary: {
    total_players: number;
    total_agents: number;
    total_subclubs: number;
    total_winnings_brl: number;
    total_rake_brl: number;
    total_ggr_brl: number;
  };
  readiness: {
    ready: boolean;
    blockers_count: number;
  };
  blockers: {
    unknown_agencies: Array<{
      agent_name: string;
      agent_id: string;
      detected_prefix: string | null;
      players_count: number;
      sample_players: Array<{ player_id: string; player_name: string }>;
    }>;
    players_without_agency: Array<{
      player_id: string;
      player_name: string;
      original_agent: string;
    }>;
  };
  subclubs_found: Array<{
    subclub_name: string;
    players_count: number;
    agents_count: number;
    rake_brl: number;
  }>;
  available_subclubs: Array<{ id: string; name: string }>;
  duplicate_players: Array<{
    id: string;
    nick: string;
    count: number;
    merged_ganhos: number;
    merged_rake: number;
  }>;
  available_agents: Array<{
    agent_name: string;
    agent_id: string;
    subclub_name: string;
  }>;
  warnings: string[];
}

// Per-player selection state for the dropdowns
interface PlayerSelection {
  subclubId: string;
  mode: 'agent' | 'direct' | 'new_agent';
  agentName?: string;
  agentId?: string;
  newAgentName?: string;
}

// ─── Club colors/icons ──────────────────────────────────────────────

const CLUB_COLORS: Record<string, string> = {
  IMPERIO:   'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  TGP:       'bg-blue-500/20 text-blue-400 border-blue-500/40',
  CONFRARIA: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
  '3BET':    'bg-green-500/20 text-green-400 border-green-500/40',
  CH:        'bg-red-500/20 text-red-400 border-red-500/40',
  '?':       'bg-orange-500/20 text-orange-400 border-orange-500/40',
};

const CLUB_ICONS: Record<string, string> = {
  IMPERIO: '👑', TGP: '🎯', CONFRARIA: '🍷', '3BET': '🎲', CH: '♣️', '?': '❓',
};

function getClubStyle(name: string) {
  return CLUB_COLORS[name] || 'bg-dark-700/50 text-dark-300 border-dark-600';
}

// ─── Main Component ─────────────────────────────────────────────────

export default function ImportWizardPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [step, setStep] = useState<WizardStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [clubs, setClubs] = useState<any[]>([]);
  const [clubId, setClubId] = useState('');
  const [weekStartOverride, setWeekStartOverride] = useState('');
  const [showWeekOverride, setShowWeekOverride] = useState(false);

  // Preview data
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Pendencies resolution
  const [agentLinks, setAgentLinks] = useState<Record<string, string>>({});
  const [playerLinks, setPlayerLinks] = useState<Record<string, string>>({});
  const [playerSelections, setPlayerSelections] = useState<Record<string, PlayerSelection>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // Bulk action state
  const [bulkSubclubId, setBulkSubclubId] = useState('');
  const [bulkMode, setBulkMode] = useState<'agent' | 'direct' | 'new_agent'>('direct');
  const [bulkAgentName, setBulkAgentName] = useState('');
  const [bulkNewAgentName, setBulkNewAgentName] = useState('');

  // Confirm result
  const [confirmResult, setConfirmResult] = useState<any>(null);

  const { toast } = useToast();

  useEffect(() => {
    loadClubs();
  }, []);

  async function loadClubs() {
    const res = await listOrganizations('CLUB');
    if (res.success) {
      setClubs(res.data || []);
      if (res.data?.length > 0) setClubId(res.data[0].id);
    }
  }

  function showToast(msg: string) {
    const isError = msg.startsWith('❌');
    const isSuccess = msg.startsWith('✅');
    const clean = msg.replace(/^[❌✅]\s*/, '');
    toast(clean, isError ? 'error' : isSuccess ? 'success' : 'info');
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  /** Get agents filtered by subclub name */
  function getAgentsForSubclub(subclubId: string): Array<{ agent_name: string; agent_id: string }> {
    if (!preview) return [];
    const subclub = preview.available_subclubs.find(s => s.id === subclubId);
    if (!subclub) return [];
    return preview.available_agents.filter(a => a.subclub_name === subclub.name);
  }

  // ─── Step 1: Upload ─────────────────────────────────────────────

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped?.name.endsWith('.xlsx')) {
      setFile(dropped);
      setError('');
    }
  }

  async function handlePreview() {
    if (!file) return;
    setLoading(true);
    setError('');
    setPreview(null);

    try {
      const res = await importPreview(file, weekStartOverride || undefined);
      if (res.success && res.data) {
        setPreview(res.data);
        setStep('preview');
      } else {
        setError(res.error || 'Erro na pre-analise');
      }
    } catch (err: any) {
      setError(err.message || 'Erro de conexao');
    } finally {
      setLoading(false);
    }
  }

  // ─── Step 2: Preview → decide next step ─────────────────────────

  function handlePreviewNext() {
    if (!preview) return;
    if (preview.readiness.ready) {
      setStep('confirm');
    } else {
      setStep('pendencies');
    }
  }

  // ─── Step 3: Resolve pendencies ─────────────────────────────────

  async function handleLinkAgentInline(agentName: string, subclubId: string) {
    if (!subclubId) return;
    const key = `agent:${agentName}`;
    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      const res = await linkAgent(agentName, subclubId);
      if (res.success) {
        setAgentLinks(prev => ({ ...prev, [agentName]: subclubId }));

        const subclub = preview?.available_subclubs.find(s => s.id === subclubId);
        showToast(`✅ ${agentName} → ${subclub?.name || '?'}`);
      } else {
        showToast(`❌ ${res.error}`);
      }
    } catch (err: any) {
      showToast(`❌ ${err.message}`);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }

  async function handleLinkPlayerWithSelection(playerId: string, sel: PlayerSelection) {
    if (!sel.subclubId) return;
    const key = `player:${playerId}`;
    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      // If new agent, first create the agent link
      if (sel.mode === 'new_agent' && sel.newAgentName) {
        await linkAgent(sel.newAgentName, sel.subclubId);
      }

      const agentName = sel.mode === 'agent' ? sel.agentName :
                        sel.mode === 'new_agent' ? sel.newAgentName :
                        undefined;
      const agentId = sel.mode === 'agent' ? sel.agentId : undefined;

      const res = await linkPlayer(playerId, sel.subclubId, agentId, agentName);
      if (res.success) {
        setPlayerLinks(prev => ({ ...prev, [playerId]: sel.subclubId }));

        const subclub = preview?.available_subclubs.find(s => s.id === sel.subclubId);
        const label = agentName ? `${subclub?.name} / ${agentName}` : `${subclub?.name} (direto)`;
        showToast(`✅ Jogador ${playerId} → ${label}`);
      } else {
        showToast(`❌ ${res.error}`);
      }
    } catch (err: any) {
      showToast(`❌ ${err.message}`);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }

  async function handleBulkLinkNone() {
    if (!preview || !bulkSubclubId) return;
    const nonePlayers = preview.blockers.players_without_agency.filter(p => !playerLinks[p.player_id]);
    if (!nonePlayers.length) return;

    // If new agent, create it first
    if (bulkMode === 'new_agent' && bulkNewAgentName) {
      try {
        await linkAgent(bulkNewAgentName, bulkSubclubId);
      } catch (err: any) {
        showToast(`❌ ${err.message}`);
        return;
      }
    }

    const agentName = bulkMode === 'agent' ? bulkAgentName :
                      bulkMode === 'new_agent' ? bulkNewAgentName :
                      undefined;

    const key = 'bulk-none';
    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      const res = await bulkLinkPlayers(
        nonePlayers.map(p => ({
          external_player_id: p.player_id,
          subclub_id: bulkSubclubId,
          agent_name: agentName,
        }))
      );
      if (res.success) {
        const newLinks = { ...playerLinks };
        nonePlayers.forEach(p => { newLinks[p.player_id] = bulkSubclubId; });
        setPlayerLinks(newLinks);

        const subclub = preview?.available_subclubs.find(s => s.id === bulkSubclubId);
        const label = agentName ? `${subclub?.name} / ${agentName}` : `${subclub?.name} (direto)`;
        showToast(`✅ ${nonePlayers.length} jogadores → ${label}`);
      } else {
        showToast(`❌ ${res.error}`);
      }
    } catch (err: any) {
      showToast(`❌ ${err.message}`);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }

  async function handleReprocess() {
    await handlePreview();
  }

  // ─── Step 4: Confirm ────────────────────────────────────────────

  async function handleConfirm() {
    if (!file || !clubId || !preview) return;

    setLoading(true);
    setError('');

    try {
      const weekStart = preview.week.week_start;
      const res = await importConfirm(file, clubId, weekStart);
      if (res.success && res.data) {
        setConfirmResult(res.data);
      } else {
        setError(res.error || 'Erro ao confirmar importacao');
        if (res.error?.includes('pendencias')) {
          setStep('pendencies');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erro de conexao');
    } finally {
      setLoading(false);
    }
  }

  // ─── Computed ───────────────────────────────────────────────────

  const allResolved = preview ? (
    preview.blockers.unknown_agencies.every(a => agentLinks[a.agent_name]) &&
    preview.blockers.players_without_agency.every(p => playerLinks[p.player_id])
  ) : false;

  const steps: { key: WizardStep; label: string; icon: string }[] = [
    { key: 'upload', label: 'Upload', icon: '📤' },
    { key: 'preview', label: 'Pre-analise', icon: '🔍' },
    { key: 'pendencies', label: 'Pendencias', icon: '⚠️' },
    { key: 'confirm', label: 'Confirmar', icon: '✅' },
  ];

  const stepIdx = steps.findIndex(s => s.key === step);

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-3xl">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => {
          if (s.key === 'pendencies' && preview?.readiness.ready) return null;

          const isActive = s.key === step;
          const isDone = i < stepIdx;
          return (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && !(s.key === 'pendencies' && preview?.readiness.ready) && (
                <div className={`w-8 h-px ${isDone ? 'bg-poker-500' : 'bg-dark-700'}`} />
              )}
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isActive ? 'bg-poker-600/20 text-poker-400 border border-poker-500/40' :
                isDone ? 'bg-dark-700/50 text-poker-400' :
                'bg-dark-800/50 text-dark-500'
              }`}>
                <span>{isDone ? '✓' : s.icon}</span>
                <span>{s.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ STEP 1: Upload ═══ */}
      {step === 'upload' && (
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Importar XLSX</h2>
          <p className="text-dark-400 mb-6">Suprema Poker · A semana sera detectada automaticamente</p>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Selecionar arquivo XLSX"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
            className={`card border-2 border-dashed cursor-pointer text-center py-12 transition-colors ${
              file ? 'border-poker-600/50 bg-poker-900/10' : 'border-dark-600 hover:border-dark-500'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              aria-label="Selecionar arquivo XLSX"
              onChange={(e) => { setFile(e.target.files?.[0] || null); setError(''); }}
            />
            {file ? (
              <div>
                <div className="text-4xl mb-3">📄</div>
                <p className="text-poker-400 font-medium">{file.name}</p>
                <p className="text-dark-500 text-sm mt-1">
                  {(file.size / 1024).toFixed(0)} KB · Clique para trocar
                </p>
              </div>
            ) : (
              <div>
                <div className="text-4xl mb-3">📤</div>
                <p className="text-dark-300 font-medium">Arraste o arquivo .xlsx aqui</p>
                <p className="text-dark-500 text-sm mt-1">ou clique para selecionar</p>
              </div>
            )}
          </div>

          {file && (
            <div className="mt-4">
              {!showWeekOverride ? (
                <button
                  onClick={() => setShowWeekOverride(true)}
                  className="text-dark-500 text-sm hover:text-dark-300 transition-colors"
                >
                  ⚙️ Definir semana manualmente
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <label className="text-sm text-dark-400">Semana:</label>
                  <input
                    type="date"
                    value={weekStartOverride}
                    onChange={(e) => setWeekStartOverride(e.target.value)}
                    className="input flex-1"
                  />
                  <button
                    onClick={() => { setShowWeekOverride(false); setWeekStartOverride(''); }}
                    className="text-dark-500 text-xs hover:text-dark-300"
                  >
                    ✕ Auto-detectar
                  </button>
                </div>
              )}
            </div>
          )}

          {clubs.length > 1 && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-dark-300 mb-1.5">Clube</label>
              <select
                value={clubId}
                onChange={(e) => setClubId(e.target.value)}
                className="input w-full"
              >
                {clubs.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handlePreview}
            disabled={!file || loading}
            className="btn-primary w-full py-3 text-lg mt-6"
            aria-label="Pre-analisar arquivo"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner size="sm" variant="white" />
                Analisando...
              </span>
            ) : (
              '🔍 Pre-analisar'
            )}
          </button>

          {error && (
            <div className="mt-4 bg-red-900/30 border border-red-700/50 rounded-lg p-4 text-red-300 text-sm">
              ❌ {error}
            </div>
          )}
        </div>
      )}

      {/* ═══ STEP 2: Preview ═══ */}
      {step === 'preview' && preview && (
        <div>
          <h2 className="text-2xl font-bold text-white mb-6">Pre-analise</h2>

          <div className="card mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-400 text-xs uppercase tracking-wide">Semana Detectada</p>
                <p className="text-white text-lg font-semibold mt-1">
                  {formatDate(preview.week.week_start)} → {formatDate(preview.week.week_end)}
                </p>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                preview.week.confidence === 'high' ? 'bg-green-500/20 text-green-400' :
                preview.week.confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-orange-500/20 text-orange-400'
              }`}>
                {preview.week.detected_from === 'xlsx' ? '📊 Do XLSX' :
                 preview.week.detected_from === 'filename' ? '📁 Do filename' :
                 '⚙️ Fallback'}
                {preview.week.confidence === 'high' ? ' ✓' : ''}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="card text-center">
              <p className="text-2xl font-bold text-white">{preview.summary.total_players}</p>
              <p className="text-xs text-dark-400">Jogadores</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-white">{preview.summary.total_agents}</p>
              <p className="text-xs text-dark-400">Agentes</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-white">{preview.summary.total_subclubs}</p>
              <p className="text-xs text-dark-400">Subclubes</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="card text-center">
              <p className={`text-lg font-bold ${preview.summary.total_winnings_brl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatBRL(preview.summary.total_winnings_brl)}
              </p>
              <p className="text-xs text-dark-400">Ganhos</p>
            </div>
            <div className="card text-center">
              <p className="text-lg font-bold text-blue-400">{formatBRL(preview.summary.total_rake_brl)}</p>
              <p className="text-xs text-dark-400">Rake Total</p>
            </div>
            <div className="card text-center">
              <p className="text-lg font-bold text-purple-400">{formatBRL(preview.summary.total_ggr_brl)}</p>
              <p className="text-xs text-dark-400">GGR Total</p>
            </div>
          </div>

          <div className="card mb-4">
            <h3 className="text-sm font-semibold text-dark-300 mb-3">Distribuicao por Subclube</h3>
            <div className="space-y-2">
              {preview.subclubs_found.map(sc => (
                <div key={sc.subclub_name} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getClubStyle(sc.subclub_name)}`}>
                      {CLUB_ICONS[sc.subclub_name] || '🏠'} {sc.subclub_name}
                    </span>
                    <span className="text-dark-400 text-xs">
                      {sc.players_count} jogadores · {sc.agents_count} agentes
                    </span>
                  </div>
                  <span className="text-dark-300 text-sm font-mono">{formatBRL(sc.rake_brl)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Duplicados (não bloqueante) */}
          {preview.duplicate_players && preview.duplicate_players.length > 0 && (
            <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-4 mb-4">
              <p className="text-blue-300 font-medium mb-2">
                🔀 {preview.duplicate_players.length} ID{preview.duplicate_players.length !== 1 ? 's' : ''} duplicado{preview.duplicate_players.length !== 1 ? 's' : ''} — valores somados automaticamente
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-dark-400 text-left">
                      <th className="pb-1.5 pr-3">ID</th>
                      <th className="pb-1.5 pr-3">Nick</th>
                      <th className="pb-1.5 pr-3 text-center">Ocorrencias</th>
                      <th className="pb-1.5 text-right">Rake Somado</th>
                    </tr>
                  </thead>
                  <tbody className="text-dark-300">
                    {preview.duplicate_players.map(d => (
                      <tr key={d.id} className="border-t border-blue-800/30">
                        <td className="py-1 pr-3 font-mono text-blue-400">{d.id}</td>
                        <td className="py-1 pr-3">{d.nick}</td>
                        <td className="py-1 pr-3 text-center">{d.count}x</td>
                        <td className="py-1 text-right font-mono">{formatBRL(d.merged_rake)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.readiness.ready ? (
            <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-4 mb-4">
              <p className="text-green-400 font-medium">✅ Tudo pronto! Sem pendencias.</p>
            </div>
          ) : (
            <div className="bg-yellow-900/20 border border-yellow-600/40 rounded-lg p-4 mb-4">
              <p className="text-yellow-300 font-medium">
                ⚠️ {preview.readiness.blockers_count} pendencia{preview.readiness.blockers_count !== 1 ? 's' : ''} para resolver
              </p>
              <p className="text-dark-400 text-sm mt-1">
                {preview.blockers.unknown_agencies.length > 0 && `${preview.blockers.unknown_agencies.length} agencia(s) sem subclube`}
                {preview.blockers.unknown_agencies.length > 0 && preview.blockers.players_without_agency.length > 0 && ' · '}
                {preview.blockers.players_without_agency.length > 0 && `${preview.blockers.players_without_agency.length} jogador(es) sem agencia`}
              </p>
            </div>
          )}

          {preview.warnings.length > 0 && (
            <div className="text-sm text-dark-400 space-y-1 mb-4">
              {preview.warnings.map((w, i) => <p key={i}>⚠️ {w}</p>)}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep('upload')}
              className="px-4 py-2.5 text-dark-400 hover:text-white transition-colors"
            >
              ← Voltar
            </button>
            <button
              onClick={handlePreviewNext}
              className="btn-primary flex-1 py-2.5"
            >
              {preview.readiness.ready ? '✅ Confirmar Importacao' : '⚠️ Resolver Pendencias'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 3: Pendencies ═══ */}
      {step === 'pendencies' && preview && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Resolver Pendencias</h2>
              <p className="text-dark-400 mt-1">
                Vincule as agencias e jogadores aos subclubes. Regras salvas valem para futuras importacoes.
              </p>
            </div>
          </div>

          {/* ── Agencias sem subclube (dropdown) ── */}
          {preview.blockers.unknown_agencies.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-dark-300 mb-3 flex items-center gap-2">
                🏢 Agencias sem subclube
                <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                  {preview.blockers.unknown_agencies.length}
                </span>
              </h3>

              <div className="space-y-3">
                {preview.blockers.unknown_agencies.map(agency => {
                  const isLinked = !!agentLinks[agency.agent_name];
                  const linkedSubclubId = agentLinks[agency.agent_name];
                  const linkedSubclub = preview.available_subclubs.find(s => s.id === linkedSubclubId);
                  const isSaving = saving[`agent:${agency.agent_name}`];

                  return (
                    <div key={agency.agent_name} className={`card transition-all ${isLinked ? 'opacity-60' : ''}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-white font-semibold">{agency.agent_name}</span>
                          {agency.detected_prefix && (
                            <span className="text-dark-500 text-xs ml-2">prefixo: {agency.detected_prefix}</span>
                          )}
                          <span className="text-dark-500 text-xs ml-2">
                            · {agency.players_count} jogador{agency.players_count !== 1 ? 'es' : ''}
                          </span>
                        </div>
                        {isLinked && linkedSubclub && (
                          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getClubStyle(linkedSubclub.name)}`}>
                            ✓ {linkedSubclub.name}
                          </span>
                        )}
                      </div>

                      {agency.sample_players.length > 0 && (
                        <p className="text-dark-500 text-xs mb-2">
                          Jogadores: {agency.sample_players.map(p => p.player_name).join(', ')}
                        </p>
                      )}

                      {!isLinked && (
                        <div className="flex items-center gap-2">
                          <select
                            className="input flex-1 text-sm"
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) handleLinkAgentInline(agency.agent_name, e.target.value);
                            }}
                            disabled={isSaving}
                          >
                            <option value="" disabled>Selecionar subclube...</option>
                            {preview.available_subclubs.map(sc => (
                              <option key={sc.id} value={sc.id}>
                                {CLUB_ICONS[sc.name] || '🏠'} {sc.name}
                              </option>
                            ))}
                          </select>
                          {isSaving && <Spinner size="sm" />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Jogadores sem agencia (dropdowns: subclube + agencia) ── */}
          {preview.blockers.players_without_agency.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-dark-300 mb-3 flex items-center gap-2">
                👤 Jogadores sem agencia
                <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                  {preview.blockers.players_without_agency.length}
                </span>
              </h3>

              {/* Bulk action */}
              <div className="card mb-3 bg-dark-800/80">
                <p className="text-dark-300 text-sm mb-3">
                  Vincular TODOS os {preview.blockers.players_without_agency.filter(p => !playerLinks[p.player_id]).length} jogadores pendentes:
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-xs text-dark-500 mb-1">Subclube</label>
                    <select
                      className="input w-full text-sm"
                      value={bulkSubclubId}
                      onChange={(e) => {
                        setBulkSubclubId(e.target.value);
                        setBulkAgentName('');
                        setBulkMode('direct');
                      }}
                    >
                      <option value="">Selecionar...</option>
                      {preview.available_subclubs.map(sc => (
                        <option key={sc.id} value={sc.id}>{sc.name}</option>
                      ))}
                    </select>
                  </div>

                  {bulkSubclubId && (
                    <div className="flex-1 min-w-[160px]">
                      <label className="block text-xs text-dark-500 mb-1">Agencia</label>
                      <select
                        className="input w-full text-sm"
                        value={bulkMode === 'agent' ? `agent:${bulkAgentName}` : bulkMode === 'new_agent' ? '__new__' : '__direct__'}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '__direct__') {
                            setBulkMode('direct');
                            setBulkAgentName('');
                          } else if (val === '__new__') {
                            setBulkMode('new_agent');
                            setBulkAgentName('');
                          } else if (val.startsWith('agent:')) {
                            setBulkMode('agent');
                            setBulkAgentName(val.replace('agent:', ''));
                          }
                        }}
                      >
                        <option value="__direct__">Jogador direto (sem agencia)</option>
                        {getAgentsForSubclub(bulkSubclubId).map(a => (
                          <option key={a.agent_name} value={`agent:${a.agent_name}`}>
                            {a.agent_name}
                          </option>
                        ))}
                        <option value="__new__">+ Nova agencia...</option>
                      </select>
                    </div>
                  )}

                  {bulkMode === 'new_agent' && bulkSubclubId && (
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-xs text-dark-500 mb-1">Nome da agencia</label>
                      <input
                        className="input w-full text-sm"
                        placeholder="Ex: AG NOVO"
                        value={bulkNewAgentName}
                        onChange={(e) => setBulkNewAgentName(e.target.value)}
                      />
                    </div>
                  )}

                  <button
                    onClick={handleBulkLinkNone}
                    disabled={
                      saving['bulk-none'] ||
                      !bulkSubclubId ||
                      (bulkMode === 'new_agent' && !bulkNewAgentName)
                    }
                    className="btn-primary py-2 px-4 text-sm shrink-0"
                  >
                    {saving['bulk-none'] ? (
                      <span className="flex items-center gap-1"><Spinner size="sm" variant="white" /> Vinculando...</span>
                    ) : (
                      'Vincular Todos'
                    )}
                  </button>
                </div>
              </div>

              {/* Individual player rows */}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {preview.blockers.players_without_agency.map(player => {
                  const isLinked = !!playerLinks[player.player_id];
                  const linkedSubclubId = playerLinks[player.player_id];
                  const linkedSubclub = preview.available_subclubs.find(s => s.id === linkedSubclubId);
                  const isSaving = saving[`player:${player.player_id}`];
                  const sel = playerSelections[player.player_id];

                  if (isLinked) {
                    return (
                      <div key={player.player_id} className="flex items-center justify-between p-2.5 rounded-lg border bg-dark-800/30 border-dark-700/30 opacity-60">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-poker-400 font-mono text-xs shrink-0">{player.player_id}</span>
                          <span className="text-white text-sm truncate">{player.player_name}</span>
                        </div>
                        {linkedSubclub && (
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border shrink-0 ${getClubStyle(linkedSubclub.name)}`}>
                            ✓ {linkedSubclub.name}
                          </span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={player.player_id} className="p-3 rounded-lg border bg-dark-800/50 border-dark-700">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-poker-400 font-mono text-xs shrink-0">{player.player_id}</span>
                        <span className="text-white text-sm">{player.player_name}</span>
                      </div>

                      <div className="flex flex-wrap items-end gap-2">
                        {/* Subclube dropdown */}
                        <div className="flex-1 min-w-[120px]">
                          <select
                            className="input w-full text-xs"
                            value={sel?.subclubId || ''}
                            onChange={(e) => {
                              setPlayerSelections(prev => ({
                                ...prev,
                                [player.player_id]: {
                                  subclubId: e.target.value,
                                  mode: 'direct',
                                },
                              }));
                            }}
                          >
                            <option value="">Subclube...</option>
                            {preview.available_subclubs.map(sc => (
                              <option key={sc.id} value={sc.id}>{sc.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Agencia dropdown (appears after selecting subclub) */}
                        {sel?.subclubId && (
                          <div className="flex-1 min-w-[140px]">
                            <select
                              className="input w-full text-xs"
                              value={
                                sel.mode === 'agent' ? `agent:${sel.agentName}` :
                                sel.mode === 'new_agent' ? '__new__' :
                                '__direct__'
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '__direct__') {
                                  setPlayerSelections(prev => ({
                                    ...prev,
                                    [player.player_id]: { ...prev[player.player_id], mode: 'direct', agentName: undefined, agentId: undefined },
                                  }));
                                } else if (val === '__new__') {
                                  setPlayerSelections(prev => ({
                                    ...prev,
                                    [player.player_id]: { ...prev[player.player_id], mode: 'new_agent', agentName: undefined, agentId: undefined, newAgentName: '' },
                                  }));
                                } else if (val.startsWith('agent:')) {
                                  const agName = val.replace('agent:', '');
                                  const ag = preview.available_agents.find(a => a.agent_name === agName);
                                  setPlayerSelections(prev => ({
                                    ...prev,
                                    [player.player_id]: { ...prev[player.player_id], mode: 'agent', agentName: agName, agentId: ag?.agent_id },
                                  }));
                                }
                              }}
                            >
                              <option value="__direct__">Jogador direto</option>
                              {getAgentsForSubclub(sel.subclubId).map(a => (
                                <option key={a.agent_name} value={`agent:${a.agent_name}`}>
                                  {a.agent_name}
                                </option>
                              ))}
                              <option value="__new__">+ Nova agencia...</option>
                            </select>
                          </div>
                        )}

                        {/* New agent name input */}
                        {sel?.mode === 'new_agent' && (
                          <div className="flex-1 min-w-[100px]">
                            <input
                              className="input w-full text-xs"
                              placeholder="Nome agencia"
                              value={sel.newAgentName || ''}
                              onChange={(e) => {
                                setPlayerSelections(prev => ({
                                  ...prev,
                                  [player.player_id]: { ...prev[player.player_id], newAgentName: e.target.value },
                                }));
                              }}
                            />
                          </div>
                        )}

                        {/* Vincular button */}
                        {sel?.subclubId && (
                          <button
                            onClick={() => handleLinkPlayerWithSelection(player.player_id, sel)}
                            disabled={
                              isSaving ||
                              !sel.subclubId ||
                              (sel.mode === 'new_agent' && !sel.newAgentName)
                            }
                            className="px-3 py-1.5 bg-poker-600 hover:bg-poker-500 text-white text-xs font-medium rounded transition-colors disabled:opacity-50 shrink-0"
                          >
                            {isSaving ? <Spinner size="sm" variant="white" /> : 'Vincular'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="sticky bottom-0 bg-dark-900/95 backdrop-blur-sm border-t border-dark-700 py-4 -mx-6 px-6 mt-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep('preview')}
                className="px-4 py-2.5 text-dark-400 hover:text-white transition-colors"
              >
                ← Voltar
              </button>
              <div className="flex items-center gap-3">
                {!allResolved && (
                  <span className="text-yellow-400 text-sm">
                    ⚠️ Ainda ha pendencias
                  </span>
                )}
                <button
                  onClick={handleReprocess}
                  disabled={loading}
                  className={`btn-primary py-2.5 px-6 ${!allResolved ? 'opacity-70' : ''}`}
                >
                  {loading ? '🔄 Reprocessando...' : '🔄 Aplicar e Reprocessar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 4: Confirm ═══ */}
      {step === 'confirm' && preview && !confirmResult && (
        <div>
          <h2 className="text-2xl font-bold text-white mb-6">Confirmar Importacao</h2>

          <div className="card bg-green-900/10 border-green-700/30 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">✅</span>
              <div>
                <p className="text-green-400 font-semibold text-lg">Tudo pronto!</p>
                <p className="text-dark-400 text-sm">0 pendencias · Pronto para importar</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-dark-500">Semana</p>
                <p className="text-white font-medium">
                  {formatDate(preview.week.week_start)} → {formatDate(preview.week.week_end)}
                </p>
              </div>
              <div>
                <p className="text-dark-500">Jogadores</p>
                <p className="text-white font-medium">{preview.summary.total_players}</p>
              </div>
              <div>
                <p className="text-dark-500">Agentes</p>
                <p className="text-white font-medium">{preview.summary.total_agents}</p>
              </div>
              <div>
                <p className="text-dark-500">Subclubes</p>
                <p className="text-white font-medium">{preview.summary.total_subclubs}</p>
              </div>
              <div>
                <p className="text-dark-500">Rake Total</p>
                <p className="text-blue-400 font-medium">{formatBRL(preview.summary.total_rake_brl)}</p>
              </div>
              <div>
                <p className="text-dark-500">GGR Total</p>
                <p className="text-purple-400 font-medium">{formatBRL(preview.summary.total_ggr_brl)}</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 bg-red-900/30 border border-red-700/50 rounded-lg p-4 text-red-300 text-sm">
              ❌ {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep('preview')}
              className="px-4 py-2.5 text-dark-400 hover:text-white transition-colors"
            >
              ← Voltar
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="btn-primary flex-1 py-3 text-lg"
              aria-label="Confirmar importacao"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size="sm" variant="white" />
                  Importando...
                </span>
              ) : (
                '🚀 Confirmar Importacao'
              )}
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 4b: Success ═══ */}
      {confirmResult && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-white mb-2">Importacao Concluida!</h2>
          <p className="text-dark-400 mb-2">
            Semana {preview ? formatDate(preview.week.week_start) : ''} criada com sucesso
          </p>
          <p className="text-dark-500 text-sm mb-8">
            {confirmResult.player_count} jogadores · {confirmResult.agent_count} agentes · v{confirmResult.settlement_version}
          </p>

          {confirmResult.warnings?.length > 0 && (
            <div className="text-sm text-yellow-300/80 space-y-1 mb-6 text-left max-w-md mx-auto">
              {confirmResult.warnings.map((w: string, i: number) => (
                <p key={i}>⚠️ {w}</p>
              ))}
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setStep('upload');
                setFile(null);
                setPreview(null);
                setConfirmResult(null);
                setError('');
                setAgentLinks({});
                setPlayerLinks({});
                setPlayerSelections({});

                setBulkSubclubId('');
                setBulkMode('direct');
                setBulkAgentName('');
                setBulkNewAgentName('');
              }}
              className="px-6 py-2.5 text-dark-400 hover:text-white transition-colors"
            >
              Nova Importacao
            </button>
            <button
              onClick={() => router.push(`/s/${confirmResult.settlement_id}`)}
              className="btn-primary px-8 py-2.5"
            >
              📊 Ver Fechamento
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
