import { useMemo, useState } from 'react';
import { PreviewData, PlayerSelection, getClubStyle, getClubIcon } from '@/types/import';
import Spinner from '@/components/Spinner';

interface PendenciesStepProps {
  preview: PreviewData;
  agentLinks: Record<string, string>;
  playerLinks: Record<string, string>;
  playerSelections: Record<string, PlayerSelection>;
  saving: Record<string, boolean>;
  // Bulk state
  bulkSubclubId: string;
  setBulkSubclubId: (v: string) => void;
  bulkMode: 'agent' | 'direct' | 'new_agent';
  setBulkMode: (v: 'agent' | 'direct' | 'new_agent') => void;
  bulkAgentName: string;
  setBulkAgentName: (v: string) => void;
  bulkNewAgentName: string;
  setBulkNewAgentName: (v: string) => void;
  // Handlers
  onLinkAgent: (agentName: string, subclubId: string) => void;
  onLinkPlayer: (playerId: string, sel: PlayerSelection) => void;
  onBulkLink: () => void;
  onSetPlayerSelection: (playerId: string, sel: PlayerSelection) => void;
  onReprocess: () => void;
  onBack: () => void;
  loading: boolean;
}

export default function PendenciesStep({
  preview,
  agentLinks,
  playerLinks,
  playerSelections,
  saving,
  bulkSubclubId,
  setBulkSubclubId,
  bulkMode,
  setBulkMode,
  bulkAgentName,
  setBulkAgentName,
  bulkNewAgentName,
  setBulkNewAgentName,
  onLinkAgent,
  onLinkPlayer,
  onBulkLink,
  onSetPlayerSelection,
  onReprocess,
  onBack,
  loading,
}: PendenciesStepProps) {
  const hasPendencies = preview.blockers.unknown_agencies.length > 0 || preview.blockers.players_without_agency.length > 0;
  const [autoResolvedOpen, setAutoResolvedOpen] = useState(!hasPendencies);

  function getAgentsForSubclub(subclubId: string) {
    if (!preview) return [];
    const subclub = preview.available_subclubs.find((s) => s.id === subclubId);
    if (!subclub) return [];
    return preview.available_agents.filter((a) => a.subclub_name === subclub.name);
  }

  // Auto-resolved players (linked from previous imports)
  const autoResolvedPlayers = useMemo(
    () => (preview.players || []).filter((p) => p._status === 'auto_resolved'),
    [preview.players],
  );

  // Phase 3: Progress computation
  const totalAgencies = preview.blockers.unknown_agencies.length;
  const totalPlayersNone = preview.blockers.players_without_agency.length;
  const totalPendencies = totalAgencies + totalPlayersNone;

  const resolvedAgencies = preview.blockers.unknown_agencies.filter((a) => agentLinks[a.agent_name]).length;
  const resolvedPlayers = preview.blockers.players_without_agency.filter((p) => playerLinks[p.player_id]).length;
  const resolvedCount = resolvedAgencies + resolvedPlayers;
  const progressPct = totalPendencies > 0 ? Math.round((resolvedCount / totalPendencies) * 100) : 100;

  const progressColor = progressPct < 33 ? 'bg-red-500' : progressPct < 66 ? 'bg-yellow-500' : 'bg-green-500';

  const allResolved = resolvedCount === totalPendencies;

  // Phase 3: Auto-suggest for agencies
  const agencySuggestions = useMemo(() => {
    const suggestions: Record<string, { subclubId: string; subclubName: string }> = {};
    for (const agency of preview.blockers.unknown_agencies) {
      if (agentLinks[agency.agent_name]) continue;
      if (!agency.detected_prefix) continue;
      const prefix = agency.detected_prefix.toUpperCase();
      const match = preview.available_subclubs.find((sc) => sc.name.toUpperCase().includes(prefix));
      if (match) {
        suggestions[agency.agent_name] = { subclubId: match.id, subclubName: match.name };
      }
    }
    return suggestions;
  }, [preview, agentLinks]);

  const suggestionsCount = Object.keys(agencySuggestions).length;

  function handleAcceptAllSuggestions() {
    for (const [agentName, { subclubId }] of Object.entries(agencySuggestions)) {
      if (!agentLinks[agentName]) {
        onLinkAgent(agentName, subclubId);
      }
    }
  }

  const hasBlockers = totalPendencies > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {hasBlockers ? 'Resolver Pendencias' : 'Revisar Vinculos'}
          </h2>
          <p className="text-dark-400 mt-1">
            {hasBlockers
              ? 'Vincule as agencias e jogadores aos subclubes. Regras salvas valem para futuras importacoes.'
              : 'Revise os vinculos auto-aplicados de importacoes anteriores. Altere se necessario.'}
          </p>
        </div>
      </div>

      {/* Phase 3: Progress bar (only when there are blockers) */}
      {hasBlockers && (
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-dark-300">
            {resolvedCount}/{totalPendencies} pendencias resolvidas
          </span>
          <span
            className={`text-sm font-bold ${progressPct === 100 ? 'text-green-400' : progressPct >= 66 ? 'text-yellow-400' : 'text-red-400'}`}
          >
            {progressPct}%
          </span>
        </div>
        <div className="bg-dark-800 rounded-full h-2.5">
          <div
            className={`${progressColor} h-2.5 rounded-full transition-all duration-500`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
      )}

      {/* Agencies without subclub */}
      {totalAgencies > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-dark-300 flex items-center gap-2">
              {'\u{1F3E2}'} Agencias sem subclube
              <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                {totalAgencies - resolvedAgencies} pendentes
              </span>
            </h3>
            {/* Phase 3: Accept all suggestions */}
            {suggestionsCount > 0 && (
              <button
                onClick={handleAcceptAllSuggestions}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                {'\u2705'} Aceitar Todas Sugestoes ({suggestionsCount})
              </button>
            )}
          </div>

          <div className="space-y-3">
            {preview.blockers.unknown_agencies.map((agency) => {
              const isLinked = !!agentLinks[agency.agent_name];
              const linkedSubclubId = agentLinks[agency.agent_name];
              const linkedSubclub = preview.available_subclubs.find((s) => s.id === linkedSubclubId);
              const isSaving = saving[`agent:${agency.agent_name}`];
              const suggestion = agencySuggestions[agency.agent_name];

              return (
                <div
                  key={agency.agent_name}
                  className={`card transition-all duration-300 ${
                    isLinked ? 'opacity-60 border-green-700/30' : suggestion ? 'border-blue-700/30' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-white font-semibold">{agency.agent_name}</span>
                      {agency.detected_prefix && (
                        <span className="text-dark-500 text-xs ml-2">prefixo: {agency.detected_prefix}</span>
                      )}
                      <span className="text-dark-500 text-xs ml-2">
                        &middot; {agency.players_count} jogador{agency.players_count !== 1 ? 'es' : ''}
                      </span>
                    </div>
                    {isLinked && linkedSubclub && (
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold border ${getClubStyle(linkedSubclub.name)}`}
                      >
                        {'\u2713'} {linkedSubclub.name}
                      </span>
                    )}
                  </div>

                  {agency.sample_players.length > 0 && (
                    <p className="text-dark-500 text-xs mb-2">
                      Jogadores: {agency.sample_players.map((p) => p.player_name).join(', ')}
                    </p>
                  )}

                  {!isLinked && (
                    <div className="flex items-center gap-2">
                      <select
                        className="input flex-1 text-sm"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) onLinkAgent(agency.agent_name, e.target.value);
                        }}
                        disabled={isSaving}
                      >
                        <option value="" disabled>
                          Selecionar subclube...
                        </option>
                        {preview.available_subclubs.map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            {getClubIcon(sc.name)} {sc.name}
                          </option>
                        ))}
                      </select>
                      {/* Phase 3: Auto-suggest label */}
                      {suggestion && (
                        <span className="text-blue-400 text-xs whitespace-nowrap">
                          Sugerido: {suggestion.subclubName}
                        </span>
                      )}
                      {isSaving && <Spinner size="sm" />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Players without agency */}
      {totalPlayersNone > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-dark-300 mb-3 flex items-center gap-2">
            {'\u{1F464}'} Jogadores sem agencia
            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
              {totalPlayersNone - resolvedPlayers} pendentes
            </span>
          </h3>

          {/* Bulk action */}
          <div className="card mb-3 bg-dark-800/80">
            <p className="text-dark-300 text-sm mb-3">
              Vincular TODOS os {totalPlayersNone - resolvedPlayers} jogadores pendentes:
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
                  {preview.available_subclubs.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.name}
                    </option>
                  ))}
                </select>
              </div>

              {bulkSubclubId && (
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs text-dark-500 mb-1">Agencia</label>
                  <select
                    className="input w-full text-sm"
                    value={
                      bulkMode === 'agent'
                        ? `agent:${bulkAgentName}`
                        : bulkMode === 'new_agent'
                          ? '__new__'
                          : '__direct__'
                    }
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
                    {getAgentsForSubclub(bulkSubclubId).map((a) => (
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
                onClick={onBulkLink}
                disabled={saving['bulk-none'] || !bulkSubclubId || (bulkMode === 'new_agent' && !bulkNewAgentName)}
                className="btn-primary py-2 px-4 text-sm shrink-0"
              >
                {saving['bulk-none'] ? (
                  <span className="flex items-center gap-1">
                    <Spinner size="sm" variant="white" /> Vinculando...
                  </span>
                ) : (
                  'Vincular Todos'
                )}
              </button>
            </div>
          </div>

          {/* Individual player rows */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {preview.blockers.players_without_agency.map((player) => {
              const isLinked = !!playerLinks[player.player_id];
              const linkedSubclubId = playerLinks[player.player_id];
              const linkedSubclub = preview.available_subclubs.find((s) => s.id === linkedSubclubId);
              const isSaving = saving[`player:${player.player_id}`];
              const sel = playerSelections[player.player_id];

              if (isLinked) {
                return (
                  <div
                    key={player.player_id}
                    className="flex items-center justify-between p-2.5 rounded-lg border bg-dark-800/30 border-green-700/30 opacity-60 transition-all duration-300"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-green-400">{'\u2713'}</span>
                      <span className="text-poker-400 font-mono text-xs shrink-0">{player.player_id}</span>
                      <span className="text-white text-sm truncate">{player.player_name}</span>
                    </div>
                    {linkedSubclub && (
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold border shrink-0 ${getClubStyle(linkedSubclub.name)}`}
                      >
                        {'\u2713'} {linkedSubclub.name}
                      </span>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={player.player_id}
                  className="p-3 rounded-lg border bg-dark-800/50 border-yellow-700/30 transition-all duration-300"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-poker-400 font-mono text-xs shrink-0">{player.player_id}</span>
                    <span className="text-white text-sm">{player.player_name}</span>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[120px]">
                      <select
                        className="input w-full text-xs"
                        value={sel?.subclubId || ''}
                        onChange={(e) => {
                          onSetPlayerSelection(player.player_id, {
                            subclubId: e.target.value,
                            mode: 'direct',
                          });
                        }}
                      >
                        <option value="">Subclube...</option>
                        {preview.available_subclubs.map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            {sc.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {sel?.subclubId && (
                      <div className="flex-1 min-w-[140px]">
                        <select
                          className="input w-full text-xs"
                          value={
                            sel.mode === 'agent'
                              ? `agent:${sel.agentName}`
                              : sel.mode === 'new_agent'
                                ? '__new__'
                                : '__direct__'
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__direct__') {
                              onSetPlayerSelection(player.player_id, {
                                ...sel,
                                mode: 'direct',
                                agentName: undefined,
                                agentId: undefined,
                              });
                            } else if (val === '__new__') {
                              onSetPlayerSelection(player.player_id, {
                                ...sel,
                                mode: 'new_agent',
                                agentName: undefined,
                                agentId: undefined,
                                newAgentName: '',
                              });
                            } else if (val.startsWith('agent:')) {
                              const agName = val.replace('agent:', '');
                              const ag = preview.available_agents.find((a) => a.agent_name === agName);
                              onSetPlayerSelection(player.player_id, {
                                ...sel,
                                mode: 'agent',
                                agentName: agName,
                                agentId: ag?.agent_id,
                              });
                            }
                          }}
                        >
                          <option value="__direct__">Jogador direto</option>
                          {getAgentsForSubclub(sel.subclubId).map((a) => (
                            <option key={a.agent_name} value={`agent:${a.agent_name}`}>
                              {a.agent_name}
                            </option>
                          ))}
                          <option value="__new__">+ Nova agencia...</option>
                        </select>
                      </div>
                    )}

                    {sel?.mode === 'new_agent' && (
                      <div className="flex-1 min-w-[100px]">
                        <input
                          className="input w-full text-xs"
                          placeholder="Nome agencia"
                          value={sel.newAgentName || ''}
                          onChange={(e) => {
                            onSetPlayerSelection(player.player_id, { ...sel, newAgentName: e.target.value });
                          }}
                        />
                      </div>
                    )}

                    {sel?.subclubId && (
                      <button
                        onClick={() => onLinkPlayer(player.player_id, sel)}
                        disabled={isSaving || !sel.subclubId || (sel.mode === 'new_agent' && !sel.newAgentName)}
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

      {/* Auto-resolved players (from previous imports) */}
      {autoResolvedPlayers.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setAutoResolvedOpen((o) => !o)}
            className="w-full flex items-center justify-between mb-3"
          >
            <h3 className="text-sm font-semibold text-dark-300 flex items-center gap-2">
              {'\u{1F517}'} Jogadores auto-vinculados
              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                {autoResolvedPlayers.length}
              </span>
            </h3>
            <span className="text-dark-500 text-xs">{autoResolvedOpen ? '\u25B2 Recolher' : '\u25BC Expandir'}</span>
          </button>

          {autoResolvedOpen && (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {autoResolvedPlayers.map((player) => {
                const isRelinked = !!playerLinks[player.id];
                const relinkedSubclubId = playerLinks[player.id];
                const relinkedSubclub = preview.available_subclubs.find((s) => s.id === relinkedSubclubId);
                const isSaving = saving[`player:${player.id}`];
                const sel = playerSelections[player.id];

                if (isRelinked) {
                  return (
                    <div
                      key={player.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border bg-dark-800/30 border-blue-700/30 opacity-60 transition-all duration-300"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-blue-400">{'\u2713'}</span>
                        <span className="text-poker-400 font-mono text-xs shrink-0">{player.id}</span>
                        <span className="text-white text-sm truncate">{player.nick}</span>
                      </div>
                      {relinkedSubclub && (
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold border shrink-0 ${getClubStyle(relinkedSubclub.name)}`}
                        >
                          {'\u2713'} {relinkedSubclub.name}
                        </span>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={player.id}
                    className="p-3 rounded-lg border bg-dark-800/50 border-blue-700/20 transition-all duration-300"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-poker-400 font-mono text-xs shrink-0">{player.id}</span>
                      <span className="text-white text-sm">{player.nick}</span>
                      <span className="text-dark-500 text-xs">
                        atual: {player.aname || '-'} / {player.clube || '?'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[120px]">
                        <select
                          className="input w-full text-xs"
                          value={sel?.subclubId || ''}
                          onChange={(e) => {
                            onSetPlayerSelection(player.id, {
                              subclubId: e.target.value,
                              mode: 'direct',
                            });
                          }}
                        >
                          <option value="">Novo subclube...</option>
                          {preview.available_subclubs.map((sc) => (
                            <option key={sc.id} value={sc.id}>
                              {sc.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {sel?.subclubId && (
                        <div className="flex-1 min-w-[140px]">
                          <select
                            className="input w-full text-xs"
                            value={
                              sel.mode === 'agent'
                                ? `agent:${sel.agentName}`
                                : sel.mode === 'new_agent'
                                  ? '__new__'
                                  : '__direct__'
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '__direct__') {
                                onSetPlayerSelection(player.id, {
                                  ...sel,
                                  mode: 'direct',
                                  agentName: undefined,
                                  agentId: undefined,
                                });
                              } else if (val === '__new__') {
                                onSetPlayerSelection(player.id, {
                                  ...sel,
                                  mode: 'new_agent',
                                  agentName: undefined,
                                  agentId: undefined,
                                  newAgentName: '',
                                });
                              } else if (val.startsWith('agent:')) {
                                const agName = val.replace('agent:', '');
                                const ag = preview.available_agents.find((a) => a.agent_name === agName);
                                onSetPlayerSelection(player.id, {
                                  ...sel,
                                  mode: 'agent',
                                  agentName: agName,
                                  agentId: ag?.agent_id,
                                });
                              }
                            }}
                          >
                            <option value="__direct__">Jogador direto</option>
                            {getAgentsForSubclub(sel.subclubId).map((a) => (
                              <option key={a.agent_name} value={`agent:${a.agent_name}`}>
                                {a.agent_name}
                              </option>
                            ))}
                            <option value="__new__">+ Nova agencia...</option>
                          </select>
                        </div>
                      )}

                      {sel?.mode === 'new_agent' && (
                        <div className="flex-1 min-w-[100px]">
                          <input
                            className="input w-full text-xs"
                            placeholder="Nome agencia"
                            value={sel.newAgentName || ''}
                            onChange={(e) => {
                              onSetPlayerSelection(player.id, { ...sel, newAgentName: e.target.value });
                            }}
                          />
                        </div>
                      )}

                      {sel?.subclubId && (
                        <button
                          onClick={() => onLinkPlayer(player.id, sel)}
                          disabled={isSaving || !sel.subclubId || (sel.mode === 'new_agent' && !sel.newAgentName)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded transition-colors disabled:opacity-50 shrink-0"
                        >
                          {isSaving ? <Spinner size="sm" variant="white" /> : 'Re-vincular'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bottom bar */}
      <div className="sticky bottom-0 bg-dark-900/95 backdrop-blur-sm border-t border-dark-700 py-4 -mx-6 px-6 mt-6">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="px-4 py-2.5 text-dark-400 hover:text-white transition-colors">
            {'\u2190'} Voltar
          </button>
          <div className="flex items-center gap-3">
            {!allResolved && totalPendencies > 0 && (
              <span className="text-yellow-400 text-sm">{'\u26A0\uFE0F'} Ainda ha pendencias</span>
            )}
            <button
              onClick={onReprocess}
              disabled={loading}
              className={`btn-primary py-2.5 px-6 ${!allResolved && totalPendencies > 0 ? 'opacity-70' : ''}`}
            >
              {loading ? '\u{1F504} Reprocessando...' : '\u{1F504} Aplicar e Reprocessar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
