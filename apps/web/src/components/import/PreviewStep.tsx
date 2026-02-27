import { useState, useMemo } from 'react';
import { PreviewData, getClubStyle, getClubIcon } from '@/types/import';
import { formatBRL, formatDate } from '@/lib/api';

interface PreviewStepProps {
  preview: PreviewData;
  onNext: () => void;
  onBack: () => void;
  onEditLinks?: () => void;
}

// ─── Status badges ──────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  ok: { label: 'OK', cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
  auto_resolved: { label: 'Auto', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  unknown_subclub: { label: 'Sem Clube', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
  missing_agency: { label: 'Sem Agencia', cls: 'bg-red-500/20 text-red-400 border-red-500/40' },
};

// ─── Sortable columns ──────────────────────────────────────────────

type SortKey = 'nick' | 'ganhos' | 'rake' | 'ggr';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

export default function PreviewStep({ preview, onNext, onBack, onEditLinks }: PreviewStepProps) {
  // Players table state
  const [playersOpen, setPlayersOpen] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rake');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  // Reimport confirmation
  const [reimportConfirmed, setReimportConfirmed] = useState(false);
  // Diff details toggle
  const [diffOpen, setDiffOpen] = useState(true);

  const players = useMemo(() => preview.players || [], [preview.players]);

  const filteredPlayers = useMemo(() => {
    const q = playerSearch.toLowerCase().trim();
    const list = q
      ? players.filter((p) => p.nick.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
      : [...players];

    list.sort((a, b) => {
      const av = sortKey === 'nick' ? a.nick.toLowerCase() : a[sortKey];
      const bv = sortKey === 'nick' ? b.nick.toLowerCase() : b[sortKey];
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [players, playerSearch, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / PAGE_SIZE));
  const pagedPlayers = filteredPlayers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const playerTotals = useMemo(() => {
    return filteredPlayers.reduce(
      (acc, p) => ({
        ganhos: acc.ganhos + p.ganhos,
        rake: acc.rake + p.rake,
        ggr: acc.ggr + p.ggr,
      }),
      { ganhos: 0, rake: 0, ggr: 0 },
    );
  }, [filteredPlayers]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'nick' ? 'asc' : 'desc');
    }
    setPage(0);
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return '\u2195';
    return sortDir === 'asc' ? '\u2191' : '\u2193';
  }

  // Existing settlement
  const existing = preview.existing_settlement;
  const isMerge = existing?.mode === 'merge';

  // All comparison rows (show all, highlight diffs) — only for reimport mode
  const diffRows = useMemo(() => {
    if (!existing || isMerge) return [];
    return [
      { label: 'Jogadores', prev: existing.summary.total_players, next: preview.summary.total_players },
      { label: 'Agentes', prev: existing.summary.total_agents, next: preview.summary.total_agents },
      {
        label: 'Rake Total',
        prev: existing.summary.total_rake_brl,
        next: preview.summary.total_rake_brl,
        isBRL: true as const,
      },
      {
        label: 'GGR Total',
        prev: existing.summary.total_ggr_brl,
        next: preview.summary.total_ggr_brl,
        isBRL: true as const,
      },
    ];
  }, [existing, preview, isMerge]);

  const hasDifferences = diffRows.some((r) => r.prev !== r.next);

  // Agent diff
  const agentDiff = useMemo(() => {
    if (!existing?.agents) return { added: [] as string[], removed: [] as string[] };
    const existingSet = new Set(existing.agents.map((a) => a.toUpperCase()));
    const newAgents = new Set(preview.available_agents.map((a) => a.agent_name.toUpperCase()));
    for (const ua of preview.blockers.unknown_agencies) {
      newAgents.add(ua.agent_name.toUpperCase());
    }
    const added = [...newAgents].filter((a) => !existingSet.has(a));
    const removed = [...existingSet].filter((a) => !newAgents.has(a));
    return { added, removed };
  }, [existing, preview]);

  const isIdenticalImport =
    existing && !isMerge ? !hasDifferences && agentDiff.added.length === 0 && agentDiff.removed.length === 0 : false;
  // Merge mode doesn't need confirmation — data from other clubs is preserved
  const needsReimportConfirm = !!existing && !isMerge && !reimportConfirmed;

  // Auto-resolved players (linked from previous imports)
  const autoResolvedCount = useMemo(
    () => (preview.players || []).filter((p) => p._status === 'auto_resolved').length,
    [preview.players],
  );

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Pre-analise</h2>

      {/* ─── Merge banner (different club for same week) ─── */}
      {existing && isMerge && (
        <div className="border-2 rounded-xl p-4 mb-4 bg-blue-900/15 border-blue-600/50">
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5">{'\u2795'}</span>
            <div className="flex-1">
              <h3 className="font-bold text-blue-300">Importacao adicional para esta semana</h3>
              <p className="text-dark-400 text-sm mt-1">
                Ja existe um fechamento para esta semana (v{existing.version}, {existing.summary.total_players}{' '}
                jogadores, {existing.summary.total_agents} agentes). Os dados desta planilha serao{' '}
                <span className="text-blue-400 font-medium">adicionados sem alterar</span> os dados ja importados.
              </p>
              {agentDiff.added.length > 0 && (
                <div className="mt-3">
                  <p className="text-blue-400 text-xs font-medium mb-1">Novos agentes nesta planilha:</p>
                  <div className="flex flex-wrap gap-1">
                    {agentDiff.added.map((a) => (
                      <span
                        key={a}
                        className="px-2 py-0.5 bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded text-[10px] font-bold"
                      >
                        + {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Reimport banner (same club re-import, collapsible details) ─── */}
      {existing && !isMerge && (
        <div
          className={`border-2 rounded-xl p-4 mb-4 ${
            isIdenticalImport ? 'bg-green-900/10 border-green-700/40' : 'bg-yellow-900/20 border-yellow-600/60'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5">{isIdenticalImport ? '\u2705' : '\u26A0\uFE0F'}</span>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className={`font-bold ${isIdenticalImport ? 'text-green-400' : 'text-yellow-300'}`}>
                  {isIdenticalImport ? 'Planilha identica a versao atual' : 'Esta planilha ja foi importada'}
                </h3>
                <button onClick={() => setDiffOpen((o) => !o)} className="text-dark-500 text-xs hover:text-dark-300">
                  {diffOpen ? '\u25B2 Recolher' : '\u25BC Detalhes'}
                </button>
              </div>
              <p className="text-dark-400 text-sm mt-1">
                Fechamento existente: v{existing.version}, status:{' '}
                <span className={`font-medium ${isIdenticalImport ? 'text-green-400' : 'text-yellow-400'}`}>
                  {existing.status}
                </span>
                {isIdenticalImport
                  ? ' \u2014 reimportar nao e necessario.'
                  : ' \u2014 reimportar vai substituir os dados deste clube.'}
              </p>

              {diffOpen && (
                <div className="mt-3">
                  {/* Comparison table — all rows, diffs highlighted */}
                  <div className="overflow-x-auto mb-3">
                    <table className="w-full text-sm data-table">
                      <thead>
                        <tr className="text-dark-400 text-left border-b border-dark-600/50">
                          <th className="pb-2 pr-4">Campo</th>
                          <th className="pb-2 pr-4 text-right">Atual (v{existing.version})</th>
                          <th className="pb-2 pr-4 text-right">Nova planilha</th>
                          <th className="pb-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="text-dark-300">
                        {diffRows.map((row) => {
                          const diff = row.next - row.prev;
                          const fmt = row.isBRL ? formatBRL : (v: number) => String(v);
                          const isEqual = diff === 0;
                          return (
                            <tr
                              key={row.label}
                              className={`border-t border-dark-700/30 ${!isEqual ? 'bg-yellow-900/10' : ''}`}
                            >
                              <td className="py-1.5 pr-4 text-dark-400">{row.label}</td>
                              <td className="py-1.5 pr-4 text-right font-mono">{fmt(row.prev)}</td>
                              <td className="py-1.5 pr-4 text-right font-mono text-white">{fmt(row.next)}</td>
                              <td
                                className={`py-1.5 text-right font-mono ${isEqual ? 'text-green-400' : diff > 0 ? 'text-yellow-400' : 'text-red-400'}`}
                              >
                                {isEqual ? '\u2713 igual' : (diff > 0 ? '\u2191 +' : '\u2193 ') + fmt(Math.abs(diff))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Agent diff */}
                  {agentDiff.added.length > 0 && (
                    <div className="mb-2">
                      <p className="text-green-400 text-xs font-medium mb-1">Agentes novos na planilha:</p>
                      <div className="flex flex-wrap gap-1">
                        {agentDiff.added.map((a) => (
                          <span
                            key={a}
                            className="px-2 py-0.5 bg-green-500/15 text-green-400 border border-green-500/30 rounded text-[10px] font-bold"
                          >
                            + {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {agentDiff.removed.length > 0 && (
                    <div className="mb-2">
                      <p className="text-red-400 text-xs font-medium mb-1">
                        Agentes no fechamento atual que nao estao na planilha:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {agentDiff.removed.map((a) => (
                          <span
                            key={a}
                            className="px-2 py-0.5 bg-red-500/15 text-red-400 border border-red-500/30 rounded text-[10px] font-bold"
                          >
                            - {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Confirm checkbox */}
                  {!reimportConfirmed && (
                    <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={reimportConfirmed}
                        onChange={(e) => setReimportConfirmed(e.target.checked)}
                        className="w-4 h-4 rounded border-dark-600 text-yellow-500 focus:ring-yellow-500/30"
                      />
                      <span className="text-dark-300 text-sm">Estou ciente e quero reimportar esta semana</span>
                    </label>
                  )}
                  {reimportConfirmed && (
                    <p className="text-green-400 text-xs mt-3">{'\u2713'} Reimportacao confirmada — pode prosseguir.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Week detection ─── */}
      <div className="card mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-dark-400 text-xs uppercase tracking-wide">Semana Detectada</p>
            <p className="text-white text-lg font-semibold mt-1">
              {formatDate(preview.week.week_start)} {'\u2192'} {formatDate(preview.week.week_end)}
            </p>
          </div>
          <div
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              preview.week.confidence === 'high'
                ? 'bg-green-500/20 text-green-400'
                : preview.week.confidence === 'medium'
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-orange-500/20 text-orange-400'
            }`}
          >
            {preview.week.detected_from === 'xlsx'
              ? '\u{1F4CA} Do XLSX'
              : preview.week.detected_from === 'filename'
                ? '\u{1F4C1} Do filename'
                : '\u2699\uFE0F Fallback'}
            {preview.week.confidence === 'high' ? ' \u2713' : ''}
          </div>
        </div>
      </div>

      {/* ─── Summary KPIs ─── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card text-center">
          <p className="text-dark-400 text-xs mb-1">{'\u{1F465}'} Jogadores</p>
          <p className="text-2xl font-bold text-white">{preview.summary.total_players}</p>
        </div>
        <div className="card text-center">
          <p className="text-dark-400 text-xs mb-1">{'\u{1F4BC}'} Agentes</p>
          <p className="text-2xl font-bold text-white">{preview.summary.total_agents}</p>
        </div>
        <div className="card text-center">
          <p className="text-dark-400 text-xs mb-1">{'\u{1F3E2}'} Subclubes</p>
          <p className="text-2xl font-bold text-white">{preview.summary.total_subclubs}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card text-center">
          <p className="text-dark-400 text-xs mb-1">{'\u{1F4B0}'} Ganhos</p>
          <p
            className={`text-lg font-bold ${preview.summary.total_winnings_brl >= 0 ? 'text-green-400' : 'text-red-400'}`}
          >
            {formatBRL(preview.summary.total_winnings_brl)}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-dark-400 text-xs mb-1">{'\u{1F4B3}'} Rake Total</p>
          <p className="text-lg font-bold text-blue-400">{formatBRL(preview.summary.total_rake_brl)}</p>
        </div>
        <div className="card text-center">
          <p className="text-dark-400 text-xs mb-1">{'\u{1F4C8}'} GGR Total</p>
          <p className="text-lg font-bold text-purple-400">{formatBRL(preview.summary.total_ggr_brl)}</p>
        </div>
      </div>

      {/* ─── Subclub distribution ─── */}
      <div className="card mb-4">
        <h3 className="text-sm font-semibold text-dark-300 mb-3">Distribuicao por Subclube</h3>
        <div className="space-y-2">
          {preview.subclubs_found.map((sc) => (
            <div key={sc.subclub_name} className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getClubStyle(sc.subclub_name)}`}>
                  {getClubIcon(sc.subclub_name)} {sc.subclub_name}
                </span>
                <span className="text-dark-400 text-xs">
                  {sc.players_count} jogadores &middot; {sc.agents_count} agentes
                </span>
              </div>
              <span className="text-dark-300 text-sm font-mono">{formatBRL(sc.rake_brl)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Players table ─── */}
      {players.length > 0 && (
        <div className="card mb-4 overflow-hidden">
          <button
            onClick={() => {
              setPlayersOpen((o) => !o);
              setPage(0);
            }}
            className="w-full flex items-center justify-between py-1 text-left"
          >
            <h3 className="text-sm font-semibold text-dark-300">
              {'\u{1F465}'} Jogadores ({players.length})
            </h3>
            <span className="text-dark-500 text-xs">{playersOpen ? '\u25B2 Recolher' : '\u25BC Expandir'}</span>
          </button>

          {playersOpen && (
            <div className="mt-3">
              <input
                type="text"
                placeholder="Buscar por nick ou ID..."
                value={playerSearch}
                onChange={(e) => {
                  setPlayerSearch(e.target.value);
                  setPage(0);
                }}
                className="input w-full text-sm mb-3"
              />

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-dark-400 text-left bg-dark-800/50">
                      <th className="p-2">Nick</th>
                      <th className="p-2">ID</th>
                      <th className="p-2">Agente</th>
                      <th className="p-2">Subclube</th>
                      <th className="p-2 text-right cursor-pointer select-none" onClick={() => toggleSort('ganhos')}>
                        Ganhos {sortIcon('ganhos')}
                      </th>
                      <th className="p-2 text-right cursor-pointer select-none" onClick={() => toggleSort('rake')}>
                        Rake {sortIcon('rake')}
                      </th>
                      <th className="p-2 text-right cursor-pointer select-none" onClick={() => toggleSort('ggr')}>
                        GGR {sortIcon('ggr')}
                      </th>
                      <th className="p-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-700/50">
                    {pagedPlayers.map((p) => {
                      const st = STATUS_STYLES[p._status] || STATUS_STYLES.ok;
                      return (
                        <tr key={p.id} className="hover:bg-dark-800/30">
                          <td className="p-2 text-white font-medium">{p.nick}</td>
                          <td className="p-2 text-dark-400 font-mono">{p.id}</td>
                          <td className="p-2 text-dark-300">{p.aname || '-'}</td>
                          <td className="p-2">
                            {p.clube ? (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getClubStyle(p.clube)}`}
                              >
                                {p.clube}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td
                            className={`p-2 text-right font-mono ${p.ganhos >= 0 ? 'text-green-400' : 'text-red-400'}`}
                          >
                            {formatBRL(p.ganhos)}
                          </td>
                          <td className="p-2 text-right font-mono text-blue-400">{formatBRL(p.rake)}</td>
                          <td className="p-2 text-right font-mono text-purple-400">{formatBRL(p.ggr)}</td>
                          <td className="p-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${st.cls}`}>
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-dark-800/50 font-semibold text-dark-200">
                      <td className="p-2" colSpan={4}>
                        Total ({filteredPlayers.length} jogadores)
                      </td>
                      <td
                        className={`p-2 text-right font-mono ${playerTotals.ganhos >= 0 ? 'text-green-400' : 'text-red-400'}`}
                      >
                        {formatBRL(playerTotals.ganhos)}
                      </td>
                      <td className="p-2 text-right font-mono text-blue-400">{formatBRL(playerTotals.rake)}</td>
                      <td className="p-2 text-right font-mono text-purple-400">{formatBRL(playerTotals.ggr)}</td>
                      <td className="p-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3 text-xs text-dark-400">
                  <span>
                    Pagina {page + 1} de {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="px-2 py-1 rounded bg-dark-800 hover:bg-dark-700 disabled:opacity-40"
                    >
                      {'\u2190'} Anterior
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="px-2 py-1 rounded bg-dark-800 hover:bg-dark-700 disabled:opacity-40"
                    >
                      Proxima {'\u2192'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Duplicates ─── */}
      {preview.duplicate_players && preview.duplicate_players.length > 0 && (
        <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-4 mb-4">
          <p className="text-blue-300 font-medium mb-2">
            {'\u{1F500}'} {preview.duplicate_players.length} ID{preview.duplicate_players.length !== 1 ? 's' : ''}{' '}
            duplicado{preview.duplicate_players.length !== 1 ? 's' : ''} {'\u2014'} valores somados automaticamente
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
                {preview.duplicate_players.map((d) => (
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

      {/* ─── Readiness ─── */}
      {preview.readiness.ready ? (
        <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-4 mb-4">
          <p className="text-green-400 font-medium">{'\u2705'} Tudo pronto! Sem pendencias.</p>
        </div>
      ) : (
        <div className="bg-yellow-900/20 border border-yellow-600/40 rounded-lg p-4 mb-4">
          <p className="text-yellow-300 font-medium">
            {'\u26A0\uFE0F'} {preview.readiness.blockers_count} pendencia
            {preview.readiness.blockers_count !== 1 ? 's' : ''} para resolver
          </p>
          <p className="text-dark-400 text-sm mt-1">
            {preview.blockers.unknown_agencies.length > 0 &&
              `${preview.blockers.unknown_agencies.length} agencia(s) sem subclube`}
            {preview.blockers.unknown_agencies.length > 0 &&
              preview.blockers.players_without_agency.length > 0 &&
              ' \u00B7 '}
            {preview.blockers.players_without_agency.length > 0 &&
              `${preview.blockers.players_without_agency.length} jogador(es) sem agencia`}
          </p>
        </div>
      )}

      {/* ─── Auto-resolved players banner ─── */}
      {autoResolvedCount > 0 && onEditLinks && (
        <div className="bg-blue-900/15 border border-blue-700/40 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-300 font-medium">
                {'\u{1F517}'} {autoResolvedCount} jogador{autoResolvedCount !== 1 ? 'es' : ''} auto-vinculado
                {autoResolvedCount !== 1 ? 's' : ''}
              </p>
              <p className="text-dark-400 text-sm mt-0.5">
                Links salvos de importacoes anteriores. Voce pode revisar ou alterar.
              </p>
            </div>
            <button
              onClick={onEditLinks}
              className="px-3 py-1.5 text-blue-400 hover:text-blue-300 text-sm font-medium border border-blue-700/40 rounded-lg hover:bg-blue-900/30 transition-colors shrink-0"
            >
              Revisar Vinculos
            </button>
          </div>
        </div>
      )}

      {/* ─── Warnings ─── */}
      {preview.warnings.length > 0 && (
        <div className="text-sm text-dark-400 space-y-1 mb-4">
          {preview.warnings.map((w, i) => (
            <p key={i}>
              {'\u26A0\uFE0F'} {w}
            </p>
          ))}
        </div>
      )}

      {/* ─── Navigation ─── */}
      <div className="flex gap-3">
        <button onClick={onBack} className="px-4 py-2.5 text-dark-400 hover:text-white transition-colors">
          {'\u2190'} Voltar
        </button>
        <button
          onClick={onNext}
          disabled={needsReimportConfirm}
          className={`btn-primary flex-1 py-2.5 ${needsReimportConfirm ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={needsReimportConfirm ? 'Marque o checkbox acima para confirmar a reimportacao' : undefined}
        >
          {preview.readiness.ready
            ? needsReimportConfirm
              ? '\u{1F512} Confirme a reimportacao acima'
              : '\u2705 Confirmar Importacao'
            : '\u26A0\uFE0F Resolver Pendencias'}
        </button>
      </div>
    </div>
  );
}
