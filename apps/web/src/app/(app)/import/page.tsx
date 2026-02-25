'use client';

import { useState, useEffect } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';
import { importPreview, importConfirm, listOrganizations, linkAgent, linkPlayer, bulkLinkPlayers } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { WizardStep, PreviewData, PlayerSelection } from '@/types/import';

import StepIndicator from '@/components/import/StepIndicator';
import UploadStep from '@/components/import/UploadStep';
import PreviewStep from '@/components/import/PreviewStep';
import PendenciesStep from '@/components/import/PendenciesStep';
import ConfirmStep from '@/components/import/ConfirmStep';
import SuccessStep, { ConfirmResult } from '@/components/import/SuccessStep';

export default function ImportWizardPage() {
  usePageTitle('Importar');
  // Wizard state
  const [step, setStep] = useState<WizardStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [clubs, setClubs] = useState<Array<{ id: string; name: string }>>([]);
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
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);

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

  // Removed showToast wrapper — use toast(msg, type) directly

  // ─── Handlers ─────────────────────────────────────────────────────

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

  function handlePreviewNext() {
    if (!preview) return;
    if (preview.readiness.ready) {
      setStep('confirm');
    } else {
      setStep('pendencies');
    }
  }

  async function handleLinkAgentInline(agentName: string, subclubId: string) {
    if (!subclubId) return;
    const key = `agent:${agentName}`;
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await linkAgent(agentName, subclubId);
      if (res.success) {
        setAgentLinks((prev) => ({ ...prev, [agentName]: subclubId }));
        const subclub = preview?.available_subclubs.find((s) => s.id === subclubId);
        toast(`${agentName} \u2192 ${subclub?.name || '?'}`, 'success');
      } else {
        toast(res.error || 'Erro desconhecido', 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Erro de conexao', 'error');
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function handleLinkPlayerWithSelection(playerId: string, sel: PlayerSelection) {
    if (!sel.subclubId) return;
    const key = `player:${playerId}`;
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      if (sel.mode === 'new_agent' && sel.newAgentName) {
        await linkAgent(sel.newAgentName, sel.subclubId);
      }
      const agentName = sel.mode === 'agent' ? sel.agentName : sel.mode === 'new_agent' ? sel.newAgentName : undefined;
      const agentId = sel.mode === 'agent' ? sel.agentId : undefined;

      const res = await linkPlayer(playerId, sel.subclubId, agentId, agentName);
      if (res.success) {
        setPlayerLinks((prev) => ({ ...prev, [playerId]: sel.subclubId }));
        const subclub = preview?.available_subclubs.find((s) => s.id === sel.subclubId);
        const label = agentName ? `${subclub?.name} / ${agentName}` : `${subclub?.name} (direto)`;
        toast(`Jogador ${playerId} \u2192 ${label}`, 'success');
      } else {
        toast(res.error || 'Erro desconhecido', 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Erro de conexao', 'error');
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function handleBulkLinkNone() {
    if (!preview || !bulkSubclubId) return;
    const nonePlayers = preview.blockers.players_without_agency.filter((p) => !playerLinks[p.player_id]);
    if (!nonePlayers.length) return;

    if (bulkMode === 'new_agent' && bulkNewAgentName) {
      try {
        await linkAgent(bulkNewAgentName, bulkSubclubId);
      } catch (err: any) {
        toast(err.message || 'Erro de conexao', 'error');
        return;
      }
    }

    const agentName = bulkMode === 'agent' ? bulkAgentName : bulkMode === 'new_agent' ? bulkNewAgentName : undefined;

    const key = 'bulk-none';
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await bulkLinkPlayers(
        nonePlayers.map((p) => ({
          external_player_id: p.player_id,
          subclub_id: bulkSubclubId,
          agent_name: agentName,
        })),
      );
      if (res.success) {
        const newLinks = { ...playerLinks };
        nonePlayers.forEach((p) => {
          newLinks[p.player_id] = bulkSubclubId;
        });
        setPlayerLinks(newLinks);
        const subclub = preview?.available_subclubs.find((s) => s.id === bulkSubclubId);
        const label = agentName ? `${subclub?.name} / ${agentName}` : `${subclub?.name} (direto)`;
        toast(`${nonePlayers.length} jogadores \u2192 ${label}`, 'success');
      } else {
        toast(res.error || 'Erro desconhecido', 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Erro de conexao', 'error');
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  }

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

  function handleReset() {
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
  }

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div>
      <StepIndicator currentStep={confirmResult ? 'confirm' : step} skipPendencies={!!preview?.readiness.ready} />

      {step === 'upload' && (
        <UploadStep
          file={file}
          setFile={(f) => {
            setFile(f);
            setError('');
          }}
          clubs={clubs}
          clubId={clubId}
          setClubId={setClubId}
          weekStartOverride={weekStartOverride}
          setWeekStartOverride={setWeekStartOverride}
          showWeekOverride={showWeekOverride}
          setShowWeekOverride={setShowWeekOverride}
          loading={loading}
          error={error}
          onPreview={handlePreview}
        />
      )}

      {step === 'preview' && preview && (
        <PreviewStep preview={preview} onNext={handlePreviewNext} onBack={() => setStep('upload')} />
      )}

      {step === 'pendencies' && preview && (
        <PendenciesStep
          preview={preview}
          agentLinks={agentLinks}
          playerLinks={playerLinks}
          playerSelections={playerSelections}
          saving={saving}
          bulkSubclubId={bulkSubclubId}
          setBulkSubclubId={setBulkSubclubId}
          bulkMode={bulkMode}
          setBulkMode={setBulkMode}
          bulkAgentName={bulkAgentName}
          setBulkAgentName={setBulkAgentName}
          bulkNewAgentName={bulkNewAgentName}
          setBulkNewAgentName={setBulkNewAgentName}
          onLinkAgent={handleLinkAgentInline}
          onLinkPlayer={handleLinkPlayerWithSelection}
          onBulkLink={handleBulkLinkNone}
          onSetPlayerSelection={(id, sel) => setPlayerSelections((prev) => ({ ...prev, [id]: sel }))}
          onReprocess={handlePreview}
          onBack={() => setStep('preview')}
          loading={loading}
        />
      )}

      {step === 'confirm' && preview && !confirmResult && (
        <ConfirmStep
          preview={preview}
          loading={loading}
          error={error}
          onConfirm={handleConfirm}
          onBack={() => setStep('preview')}
        />
      )}

      {confirmResult && <SuccessStep preview={preview} confirmResult={confirmResult} onReset={handleReset} />}
    </div>
  );
}
