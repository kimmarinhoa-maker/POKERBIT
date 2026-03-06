'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';
import { importPreview, importConfirm, listOrganizations, linkAgent, linkPlayer, bulkLinkPlayers, syncSettlementAgents, findOrCreateClub, createOrganization, createPrefixRule } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/Toast';
import { WizardStep, PreviewData, PlayerSelection } from '@/types/import';

import StepIndicator from '@/components/import/StepIndicator';
import UploadStep from '@/components/import/UploadStep';
import type { Platform, FilenameMeta } from '@/components/import/UploadStep';
import PreviewStep, { type SubclubeEntry } from '@/components/import/PreviewStep';
import PendenciesStep from '@/components/import/PendenciesStep';
import ConfirmStep from '@/components/import/ConfirmStep';
import SuccessStep, { ConfirmResult } from '@/components/import/SuccessStep';

export default function ImportWizardPage() {
  usePageTitle('Importar');
  useAuth();
  // Wizard state
  const [step, setStep] = useState<WizardStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [clubId, setClubId] = useState('');
  const [clubName, setClubName] = useState('');
  const [weekStartOverride, setWeekStartOverride] = useState('');
  const [showWeekOverride, setShowWeekOverride] = useState(false);
  const [platform, setPlatform] = useState<Platform>('suprema');

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

  // Filename metadata (league_id, club_external_id, week)
  const [filenameMeta, setFilenameMeta] = useState<FilenameMeta | null>(null);
  const [clubFound, setClubFound] = useState(false);

  // New club tracking
  const [isNewClub, setIsNewClub] = useState(false);
  const [newSubclubes, setNewSubclubes] = useState<SubclubeEntry[]>([]);
  const [existingSubclubCount, setExistingSubclubCount] = useState<number | undefined>(undefined);

  // Confirm result
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);

  // All clubs (for auto-lookup by filename IDs)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [clubs, setClubs] = useState<any[]>([]);

  const { toast } = useToast();

  // Load clubs on mount (for auto-lookup by filename IDs)
  const loadClubs = useCallback(async () => {
    const res = await listOrganizations('CLUB');
    if (res.success) setClubs(res.data || []);
  }, []);

  useEffect(() => { loadClubs(); }, [loadClubs]);

  // Auto-fill clubName when filenameMeta changes (match existing club by external_id + league_id)
  useEffect(() => {
    if (!filenameMeta?.clubExternalId || clubName) return;
    const match = clubs.find((c) => {
      if (c.external_id !== filenameMeta.clubExternalId) return false;
      if (filenameMeta.leagueId && c.league_id) return c.league_id === filenameMeta.leagueId;
      return true;
    });
    if (match) {
      setClubName(match.name);
      setClubId(match.id);
      setClubFound(true);
    } else {
      setClubFound(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filenameMeta, clubs]);

  // ─── Handlers ─────────────────────────────────────────────────────

  async function handlePreview() {
    if (!file || !clubName.trim()) return;
    setLoading(true);
    setError('');

    // Find or create club by league_id + external_id + name
    let resolvedClubId = '';
    try {
      const res = await findOrCreateClub({
        platform,
        external_id: filenameMeta?.clubExternalId || '',
        league_id: filenameMeta?.leagueId || undefined,
        name: clubName.trim(),
      });
      if (res.success && res.data) {
        resolvedClubId = res.data.id;
        setClubId(res.data.id);
        setIsNewClub(!!res.data.created);
        if (res.data.created) {
          toast(`Clube criado: ${res.data.name}`, 'success');
          setExistingSubclubCount(undefined);
        } else {
          // Count existing subclubes for this club
          const orgsRes = await listOrganizations('SUBCLUB');
          if (orgsRes.success && orgsRes.data) {
            const count = orgsRes.data.filter((o: any) => o.parent_id === res.data.id).length;
            setExistingSubclubCount(count);
          }
        }
      } else {
        setError(res.error || 'Erro ao resolver clube');
        setLoading(false);
        return;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao resolver clube');
      setLoading(false);
      return;
    }

    if (!resolvedClubId) {
      setError('Erro ao resolver clube.');
      setLoading(false);
      return;
    }

    try {
      const res = await importPreview(file, resolvedClubId, weekStartOverride || undefined, platform);
      if (res.success && res.data) {
        setPreview(res.data);
        setStep('preview');
      } else {
        setError(res.error || 'Erro na pre-analise');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro de conexao');
    } finally {
      setLoading(false);
    }
  }

  function handlePreviewNext() {
    if (!preview) return;
    setStep('confirm');
  }

  // Create subclubes + prefix rules, then reprocess preview to show linkage
  async function handleCreateAndLinkSubclubes() {
    if (!clubId || !newSubclubes.length) return;
    for (const sub of newSubclubes) {
      try {
        const orgRes = await createOrganization({
          name: sub.nome,
          parent_id: clubId,
          type: 'SUBCLUB',
          external_id: sub.siglas[0],
        });
        if (orgRes.success && orgRes.data?.id) {
          for (const sigla of sub.siglas) {
            await createPrefixRule({
              prefix: sigla,
              subclub_id: orgRes.data.id,
              priority: 0,
            });
          }
        }
      } catch {
        toast(`Erro ao criar subclube ${sub.nome}`, 'error');
      }
    }
    const count = newSubclubes.length;
    toast(`${count} subclube${count !== 1 ? 's' : ''} criado${count !== 1 ? 's' : ''}`, 'success');
    setNewSubclubes([]);
    // Reprocess preview so players get linked via new prefix rules
    await handlePreview();
  }

  async function handleLinkPlayerDirect(playerId: string, subclubId: string) {
    if (!subclubId) return;
    try {
      const res = await linkPlayer(playerId, subclubId);
      if (res.success) {
        setPlayerLinks((prev) => ({ ...prev, [playerId]: subclubId }));
        const subclub = preview?.available_subclubs.find((s) => s.id === subclubId);
        toast(`Jogador ${playerId} \u2192 ${subclub?.name || '?'}`, 'success');
      } else {
        toast(res.error || 'Erro desconhecido', 'error');
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Erro de conexao', 'error');
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
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Erro de conexao', 'error');
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
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Erro de conexao', 'error');
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
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : 'Erro de conexao', 'error');
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
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Erro de conexao', 'error');
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
      const res = await importConfirm(file, clubId, weekStart, platform, undefined, true);
      if (res.success && res.data) {
        setConfirmResult(res.data);

        // Auto-sync agents (creates AGENT organizations from metrics)
        if (res.data.settlement_id) {
          syncSettlementAgents(res.data.settlement_id).catch(() => {
            toast('Aviso: sincronizacao de agentes falhou', 'error');
          });
        }
      } else {
        setError(res.error || 'Erro ao confirmar importacao');
        if (res.error?.includes('pendencias')) {
          setStep('pendencies');
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro de conexao');
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
    setPlatform('suprema');
    setClubName('');
    setClubFound(false);
    setFilenameMeta(null);
    setIsNewClub(false);
    setNewSubclubes([]);
    setExistingSubclubCount(undefined);
  }

  // Reload clubs (after creating a new subclub in PreviewStep)
  const reloadOrgs = useCallback(async () => {
    loadClubs();
  }, [loadClubs]);

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div>
      <StepIndicator currentStep={confirmResult ? 'confirm' : step} skipPendencies={!!preview?.readiness.ready && step !== 'pendencies'} />

      {step === 'upload' && (
        <UploadStep
          file={file}
          setFile={(f) => {
            setFile(f);
            setError('');
          }}
          platform={platform}
          setPlatform={setPlatform}
          clubName={clubName}
          setClubName={setClubName}
          weekStartOverride={weekStartOverride}
          setWeekStartOverride={setWeekStartOverride}
          showWeekOverride={showWeekOverride}
          setShowWeekOverride={setShowWeekOverride}
          loading={loading}
          error={error}
          onPreview={handlePreview}
          onFilenameMeta={(meta: FilenameMeta) => { setFilenameMeta(meta); setClubFound(false); }}
          clubFound={clubFound}
        />
      )}

      {step === 'preview' && preview && (
        <PreviewStep
          preview={preview}
          onNext={handlePreviewNext}
          onBack={() => setStep('upload')}
          onEditLinks={() => setStep('pendencies')}
          availableSubclubs={preview.available_subclubs}
          onLinkAgent={handleLinkAgentInline}
          onLinkPlayerDirect={handleLinkPlayerDirect}
          onReprocess={handlePreview}
          platform={platform}
          clubId={clubId}
          onSubclubCreated={reloadOrgs}
          isNewClub={isNewClub}
          clubName={clubName}
          onClubNameChange={setClubName}
          newSubclubes={newSubclubes}
          onNewSubclubesChange={setNewSubclubes}
          existingSubclubCount={existingSubclubCount}
          onCreateAndLinkSubclubes={handleCreateAndLinkSubclubes}
        />
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
