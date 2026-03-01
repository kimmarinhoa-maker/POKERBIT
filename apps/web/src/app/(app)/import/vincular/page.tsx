'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { getUnlinkedPlayers, linkAgent, linkPlayer, bulkLinkPlayers } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { LinkIcon } from 'lucide-react';

interface UnlinkedPlayer {
  id: string;
  playerId: string;
  externalId: string;
  nickname: string;
  agentName: string | null;
  agentId: string | null;
}

interface Subclub {
  id: string;
  name: string;
}

const CLUB_COLORS: Record<string, string> = {
  IMPERIO: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40 hover:bg-yellow-500/30',
  TGP: 'bg-blue-500/20 text-blue-400 border-blue-500/40 hover:bg-blue-500/30',
  CONFRARIA: 'bg-purple-500/20 text-purple-400 border-purple-500/40 hover:bg-purple-500/30',
  '3BET': 'bg-green-500/20 text-green-400 border-green-500/40 hover:bg-green-500/30',
  CH: 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30',
};

const CLUB_ICONS: Record<string, string> = {
  IMPERIO: 'IM',
  TGP: 'TG',
  CONFRARIA: 'CF',
  '3BET': '3B',
  CH: 'CH',
};

function getClubStyle(name: string) {
  return CLUB_COLORS[name] || 'bg-dark-700/50 text-dark-300 border-dark-600 hover:bg-dark-700';
}

export default function ImportVincularPage() {
  const searchParams = useSearchParams();
  const settlementId = searchParams.get('settlement_id') || undefined;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [linked, setLinked] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getUnlinkedPlayers(settlementId);
      if (res.success) {
        setData(res.data);
      } else {
        setError(res.error || 'Erro ao carregar dados');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro de conexao');
    } finally {
      setLoading(false);
    }
  }, [settlementId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleLinkAgent(agentName: string, subclub: Subclub) {
    const key = `agent:${agentName}`;
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await linkAgent(agentName, subclub.id);
      if (res.success) {
        const players = data.byAgent[agentName] || [];
        const newLinked = { ...linked };
        players.forEach((p: UnlinkedPlayer) => {
          newLinked[p.externalId] = subclub.name;
        });
        newLinked[key] = subclub.name;
        setLinked(newLinked);
        toast(
          `${agentName} \u2192 ${subclub.name} (${players.length} jogador${players.length !== 1 ? 'es' : ''})`,
          'success',
        );
      } else {
        toast(`Erro: ${res.error}`, 'error');
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Erro inesperado', 'error');
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function handleLinkPlayer(player: UnlinkedPlayer, subclub: Subclub) {
    const key = player.externalId;
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await linkPlayer(player.externalId, subclub.id);
      if (res.success) {
        setLinked((prev) => ({ ...prev, [key]: subclub.name }));
        toast(`${player.nickname} \u2192 ${subclub.name}`, 'success');
      } else {
        toast(`Erro: ${res.error}`, 'error');
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Erro inesperado', 'error');
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function handleBulkLinkNone(subclub: Subclub) {
    const players = data.byAgent['SEM AGENTE'] || data.byAgent['None'] || [];
    if (!players.length) return;

    const key = 'bulk-none';
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await bulkLinkPlayers(
        players.map((p: UnlinkedPlayer) => ({
          external_player_id: p.externalId,
          subclub_id: subclub.id,
        })),
      );
      if (res.success) {
        const newLinked = { ...linked };
        players.forEach((p: UnlinkedPlayer) => {
          newLinked[p.externalId] = subclub.name;
        });
        setLinked(newLinked);
        toast(`${players.length} jogadores sem agente \u2192 ${subclub.name}`, 'success');
      } else {
        toast(`Erro: ${res.error}`, 'error');
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Erro inesperado', 'error');
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  }

  const totalUnlinked = data?.total || 0;
  const totalLinked = Object.keys(linked).filter((k) => !k.startsWith('agent:')).length;
  const remaining = totalUnlinked - totalLinked;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Spinner className="mx-auto mb-3" />
          <p className="text-dark-400">Carregando jogadores...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4 text-red-300">{error}</div>
    );
  }

  if (!data || totalUnlinked === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={LinkIcon}
          title="Todos vinculados!"
          description="Nenhum jogador pendente de vinculacao."
        />
      </div>
    );
  }

  const subclubs: Subclub[] = data.subclubs || [];
  const byAgent: Record<string, UnlinkedPlayer[]> = data.byAgent || {};

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <p className="text-dark-400">
          {totalUnlinked} jogador{totalUnlinked !== 1 ? 'es' : ''} sem clube atribuido
        </p>
        <div className="text-right">
          <div className="text-sm text-dark-400">Progresso</div>
          <div className="text-2xl font-bold text-poker-400">
            {totalLinked}/{totalUnlinked}
          </div>
        </div>
      </div>

      <div className="w-full bg-dark-700 rounded-full h-2 mb-6">
        <div
          className="bg-poker-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${totalUnlinked > 0 ? (totalLinked / totalUnlinked) * 100 : 0}%` }}
        />
      </div>

      {Object.entries(byAgent).map(([agentName, players]) => {
        const isNoneAgent = agentName === 'SEM AGENTE' || agentName === 'None';
        const agentLinkedClub = linked[`agent:${agentName}`];
        const isSavingAgent = saving[`agent:${agentName}`];

        return (
          <div key={agentName} className="card mb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    isNoneAgent ? 'bg-red-900/40 text-red-400' : 'bg-yellow-900/40 text-yellow-400'
                  }`}
                >
                  {isNoneAgent ? '?' : 'AG'}
                </div>
                <div>
                  <h3 className="text-white font-semibold">{isNoneAgent ? 'Jogadores Sem Agente' : agentName}</h3>
                  <p className="text-dark-400 text-xs">
                    {players.length} jogador{players.length !== 1 ? 'es' : ''}
                    {!isNoneAgent && ' \u00b7 Prefixo nao reconhecido'}
                  </p>
                </div>
              </div>

              {!isNoneAgent && !agentLinkedClub && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-dark-500 text-xs mr-1">Vincular todos:</span>
                  {subclubs.map((sc) => (
                    <button
                      key={sc.id}
                      onClick={() => handleLinkAgent(agentName, sc)}
                      disabled={isSavingAgent}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${getClubStyle(sc.name)} ${
                        isSavingAgent ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      {CLUB_ICONS[sc.name] || sc.name.substring(0, 2)} {sc.name}
                    </button>
                  ))}
                </div>
              )}

              {agentLinkedClub && (
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getClubStyle(agentLinkedClub)}`}>
                  {'\u2713'} {agentLinkedClub}
                </span>
              )}
            </div>

            {isNoneAgent && !linked['bulk-none-done'] && (
              <div className="bg-dark-800/50 rounded-lg p-3 mb-4 border border-dark-700">
                <p className="text-dark-300 text-sm mb-2">Vincular TODOS os {players.length} jogadores sem agente a:</p>
                <div className="flex gap-1.5 flex-wrap">
                  {subclubs.map((sc) => (
                    <button
                      key={sc.id}
                      onClick={async () => {
                        await handleBulkLinkNone(sc);
                        setLinked((prev) => ({ ...prev, 'bulk-none-done': 'true' }));
                      }}
                      disabled={saving['bulk-none']}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${getClubStyle(sc.name)} ${
                        saving['bulk-none'] ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      {CLUB_ICONS[sc.name] || sc.name.substring(0, 2)} {sc.name}
                    </button>
                  ))}
                </div>
                <p className="text-dark-500 text-xs mt-2">Ou vincule individualmente abaixo:</p>
              </div>
            )}

            <div className="space-y-2">
              {players.map((player) => {
                const playerLinked = linked[player.externalId];
                const isSavingPlayer = saving[player.externalId];

                return (
                  <div
                    key={player.externalId}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                      playerLinked ? 'bg-dark-800/30 border-dark-700/30 opacity-60' : 'bg-dark-800/50 border-dark-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-poker-400 font-mono text-xs shrink-0">{player.externalId}</span>
                      <span className="text-white text-sm truncate">{player.nickname}</span>
                      {player.agentName && player.agentName !== agentName && (
                        <span className="text-dark-500 text-xs">{'\u00b7'} {player.agentName}</span>
                      )}
                    </div>

                    {playerLinked ? (
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold border shrink-0 ${getClubStyle(playerLinked)}`}
                      >
                        {'\u2713'} {playerLinked}
                      </span>
                    ) : (
                      <div className="flex gap-1 shrink-0">
                        {subclubs.map((sc) => (
                          <button
                            key={sc.id}
                            onClick={() => handleLinkPlayer(player, sc)}
                            disabled={isSavingPlayer}
                            className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${getClubStyle(sc.name)} ${
                              isSavingPlayer ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                            }`}
                            title={sc.name}
                            aria-label={`Vincular a ${sc.name}`}
                          >
                            {CLUB_ICONS[sc.name] || sc.name.substring(0, 2)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {remaining > 0 ? (
        <p className="text-yellow-400 text-sm mt-4">
          {remaining} jogador{remaining !== 1 ? 'es' : ''} ainda sem vinculo
        </p>
      ) : (
        <p className="text-green-400 text-sm mt-4">Todos vinculados! Reimporte para aplicar.</p>
      )}
    </div>
  );
}
