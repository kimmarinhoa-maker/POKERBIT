import { useState, useMemo } from 'react';
import { PreviewData, getClubStyle, ChipPixTradeOperator } from '@/types/import';
import { formatBRL, formatDate } from '@/lib/api';
import type { Platform } from '@/components/import/UploadStep';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';

export interface SubclubeEntry {
  siglas: string[];
  nome: string;
}

interface PreviewStepProps {
  preview: PreviewData;
  onNext: () => void;
  onBack: () => void;
  onEditLinks?: () => void;
  availableSubclubs?: Array<{ id: string; name: string }>;
  onLinkAgent?: (agentName: string, subclubId: string) => Promise<void>;
  onLinkPlayerDirect?: (playerId: string, subclubId: string) => Promise<void>;
  onReprocess?: () => void;
  platform: Platform;
  clubId: string;
  onSubclubCreated: () => void;
  // New club fields
  isNewClub?: boolean;
  clubName?: string;
  onClubNameChange?: (name: string) => void;
  newSubclubes?: SubclubeEntry[];
  onNewSubclubesChange?: (subs: SubclubeEntry[]) => void;
  existingSubclubCount?: number;
  onCreateAndLinkSubclubes?: () => Promise<void>;
}

// ─── Status badges ──────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  ok: { label: 'OK', cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
  auto_resolved: { label: 'Auto', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  sem_vinculo: { label: 'Sem Vinculo', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
  unknown_subclub: { label: 'Sem Clube', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
  missing_agency: { label: 'Sem Agencia', cls: 'bg-red-500/20 text-red-400 border-red-500/40' },
};

type StatusFilter = 'all' | 'missing_agency' | 'sem_vinculo' | 'pending';

const STATUS_FILTERS: { key: StatusFilter; label: string; match: (s: string) => boolean }[] = [
  { key: 'all', label: 'Todos', match: () => true },
  { key: 'pending', label: 'Pendentes', match: (s) => s !== 'ok' && s !== 'auto_resolved' },
  { key: 'missing_agency', label: 'Sem Agencia', match: (s) => s === 'missing_agency' },
  { key: 'sem_vinculo', label: 'Sem Vinculo', match: (s) => s === 'sem_vinculo' },
];

// ─── Sortable columns ──────────────────────────────────────────────

type SortKey = 'nick' | 'ganhos' | 'rake' | 'ggr';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

export default function PreviewStep({
  preview, onNext, onBack, onEditLinks, availableSubclubs, onLinkAgent, onLinkPlayerDirect, onReprocess,
  platform, clubId, onSubclubCreated,
  isNewClub, clubName, onClubNameChange, newSubclubes, onNewSubclubesChange, existingSubclubCount,
  onCreateAndLinkSubclubes,
}: PreviewStepProps) {
  // Players table state
  const [playersOpen, setPlayersOpen] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rake');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  // Status filter
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Inline agent linking
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [linkingSaving, setLinkingSaving] = useState(false);

  // Reimport confirmation
  const [reimportConfirmed, setReimportConfirmed] = useState(false);
  // Diff details toggle
  const [diffOpen, setDiffOpen] = useState(true);

  // Subclubes section
  const [subclubesOpen, setSubclubesOpen] = useState(false);
  const [newSigla, setNewSigla] = useState('');
  const [newNome, setNewNome] = useState('');
  const [linkingSubclubes, setLinkingSubclubes] = useState(false);

  // Local link overrides (optimistic UI — avoid full reprocess)
  const [localLinks, setLocalLinks] = useState<Record<string, string>>({});


  const players = useMemo(() => preview.players || [], [preview.players]);

  const filteredPlayers = useMemo(() => {
    const q = playerSearch.toLowerCase().trim();
    const filterFn = STATUS_FILTERS.find((f) => f.key === statusFilter)?.match || (() => true);

    const list = players.filter((p) => {
      // Status filter
      if (!filterFn(p._status || 'ok')) return false;
      // Text search
      if (q && !p.nick.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q)) return false;
      return true;
    });

    list.sort((a, b) => {
      const av = sortKey === 'nick' ? a.nick.toLowerCase() : a[sortKey];
      const bv = sortKey === 'nick' ? b.nick.toLowerCase() : b[sortKey];
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [players, playerSearch, sortKey, sortDir, statusFilter]);

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

  // Find subclub name by id
  function subclubName(subclubId: string): string {
    return availableSubclubs?.find((s) => s.id === subclubId)?.name || '?';
  }

  async function handleInlineLink(agentName: string, subclubId: string) {
    if (!onLinkAgent || !subclubId) return;
    setLinkingSaving(true);
    try {
      await onLinkAgent(agentName, subclubId);
      // Optimistic: mark all players of this agent as linked locally
      const scName = subclubName(subclubId);
      const updates: Record<string, string> = {};
      for (const p of preview.players || []) {
        if (p.aname === agentName) updates[p.id] = scName;
      }
      setLocalLinks((prev) => ({ ...prev, ...updates }));
      setEditingAgent(null);
    } finally {
      setLinkingSaving(false);
    }
  }

  async function handleInlinePlayerLink(playerId: string, subclubId: string) {
    if (!onLinkPlayerDirect || !subclubId) return;
    setLinkingSaving(true);
    try {
      await onLinkPlayerDirect(playerId, subclubId);
      // Optimistic: mark this player as linked locally
      setLocalLinks((prev) => ({ ...prev, [playerId]: subclubName(subclubId) }));
      setEditingAgent(null);
    } finally {
      setLinkingSaving(false);
    }
  }

  const canEditLinks = !!availableSubclubs && availableSubclubs.length > 0 && (!!onLinkAgent || !!onLinkPlayerDirect);
  const hasRealAgent = (aname: string | undefined | null) => !!aname && aname.toLowerCase() !== 'none';

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
    for (const ua of preview.blockers.unknown_agencies || []) {
      newAgents.add(ua.agent_name.toUpperCase());
    }
    const added = [...newAgents].filter((a) => !existingSet.has(a));
    const removed = [...existingSet].filter((a) => !newAgents.has(a));
    return { added, removed };
  }, [existing, preview]);

  const isIdenticalImport =
    existing && !isMerge ? !hasDifferences && agentDiff.added.length === 0 && agentDiff.removed.length === 0 : false;
  const needsReimportConfirm = !!existing && !isMerge && !reimportConfirmed;

  // Auto-resolved players (linked from previous imports)
  const autoResolvedCount = useMemo(
    () => (preview.players || []).filter((p) => p._status === 'auto_resolved').length,
    [preview.players],
  );

  // Agents sem sigla (SEM VÍNCULO — warning, not blocker)
  const semVinculoCount = useMemo(() => {
    const agents = new Set<string>();
    for (const p of preview.players || []) {
      if (p._status === 'sem_vinculo') agents.add((p.aname || '').toUpperCase());
    }
    return agents.size;
  }, [preview.players]);

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-5">Pre-analise da Planilha</h2>

      {/* ─── Merge banner (different club for same week) ─── */}
      {existing && isMerge && (
        <div className="bg-dark-900 border border-blue-600/40 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
              <span className="text-blue-400 text-sm font-bold">+</span>
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-blue-300 text-sm">Importacao adicional para esta semana</h3>
              <p className="text-dark-400 text-xs mt-1">
                Ja existe um fechamento para esta semana (v{existing.version}, {existing.summary.total_players}{' '}
                jogadores, {existing.summary.total_agents} agentes). Os dados desta planilha serao{' '}
                <span className="text-blue-400 font-medium">adicionados sem alterar</span> os dados ja importados.
              </p>
              {agentDiff.added.length > 0 && (
                <div className="mt-3">
                  <p className="text-blue-400 text-[10px] font-bold uppercase tracking-wider mb-1">Novos agentes</p>
                  <div className="flex flex-wrap gap-1">
                    {agentDiff.added.map((a) => (
                      <span key={a} className="px-2 py-0.5 bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded text-[10px] font-bold">
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
        <div className={`bg-dark-900 border rounded-xl p-4 mb-4 ${isIdenticalImport ? 'border-green-700/40' : 'border-yellow-600/50'}`}>
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isIdenticalImport ? 'bg-green-500/15' : 'bg-yellow-500/15'}`}>
              <span className={`text-sm font-bold ${isIdenticalImport ? 'text-green-400' : 'text-yellow-400'}`}>
                {isIdenticalImport ? '\u2713' : '!'}
              </span>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className={`font-bold text-sm ${isIdenticalImport ? 'text-green-400' : 'text-yellow-300'}`}>
                  {isIdenticalImport ? 'Planilha identica a versao atual' : 'Esta planilha ja foi importada'}
                </h3>
                <button onClick={() => setDiffOpen((o) => !o)} className="text-dark-500 text-xs hover:text-dark-300">
                  {diffOpen ? '\u25B2 Recolher' : '\u25BC Detalhes'}
                </button>
              </div>
              <p className="text-dark-400 text-xs mt-1">
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
                  <div className="overflow-x-auto mb-3">
                    <table className="w-full text-xs data-table">
                      <thead>
                        <tr className="text-dark-400 text-left">
                          <th className="px-3 py-2">Campo</th>
                          <th className="px-3 py-2 text-right">Atual (v{existing.version})</th>
                          <th className="px-3 py-2 text-right">Nova planilha</th>
                          <th className="px-3 py-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="text-dark-300">
                        {diffRows.map((row) => {
                          const diff = row.next - row.prev;
                          const fmt = row.isBRL ? formatBRL : (v: number) => String(v);
                          const isEqual = diff === 0;
                          return (
                            <tr key={row.label} className={!isEqual ? 'bg-yellow-900/10' : ''}>
                              <td className="px-3 py-1.5 text-dark-400">{row.label}</td>
                              <td className="px-3 py-1.5 text-right font-mono">{fmt(row.prev)}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-white">{fmt(row.next)}</td>
                              <td className={`px-3 py-1.5 text-right font-mono ${isEqual ? 'text-green-400' : diff > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                                {isEqual ? '\u2713 igual' : (diff > 0 ? '\u2191 +' : '\u2193 ') + fmt(Math.abs(diff))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {agentDiff.added.length > 0 && (
                    <div className="mb-2">
                      <p className="text-green-400 text-[10px] font-bold uppercase tracking-wider mb-1">Agentes novos</p>
                      <div className="flex flex-wrap gap-1">
                        {agentDiff.added.map((a) => (
                          <span key={a} className="px-2 py-0.5 bg-green-500/15 text-green-400 border border-green-500/30 rounded text-[10px] font-bold">
                            + {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {agentDiff.removed.length > 0 && (
                    <div className="mb-2">
                      <p className="text-red-400 text-[10px] font-bold uppercase tracking-wider mb-1">Agentes removidos</p>
                      <div className="flex flex-wrap gap-1">
                        {agentDiff.removed.map((a) => (
                          <span key={a} className="px-2 py-0.5 bg-red-500/15 text-red-400 border border-red-500/30 rounded text-[10px] font-bold">
                            - {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {!reimportConfirmed && (
                    <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={reimportConfirmed}
                        onChange={(e) => setReimportConfirmed(e.target.checked)}
                        className="w-4 h-4 rounded border-dark-600 text-yellow-500 focus:ring-yellow-500/30"
                      />
                      <span className="text-dark-300 text-xs">Estou ciente e quero reimportar esta semana</span>
                    </label>
                  )}
                  {reimportConfirmed && (
                    <p className="text-green-400 text-xs mt-3">{'\u2713'} Reimportacao confirmada.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Week detection ─── */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Semana Detectada</p>
            <p className="text-white text-lg font-semibold">
              {formatDate(preview.week.week_start)} &rarr; {formatDate(preview.week.week_end)}
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
            preview.week.confidence === 'high'
              ? 'bg-green-500/15 text-green-400 border-green-500/30'
              : preview.week.confidence === 'medium'
                ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                : 'bg-orange-500/15 text-orange-400 border-orange-500/30'
          }`}>
            {preview.week.detected_from === 'xlsx' ? 'XLSX' : preview.week.detected_from === 'filename' ? 'Filename' : 'Fallback'}
            {preview.week.confidence === 'high' ? ' \u2713' : ''}
          </span>
        </div>
      </div>

      {/* ─── Club info / Subclubes ─── */}
      {isNewClub ? (
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-4 mb-4 space-y-4">
          {/* Club name (editable for new clubs) */}
          <div>
            <label className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1 block">Nome do Clube</label>
            <input
              type="text"
              value={clubName || ''}
              onChange={(e) => onClubNameChange?.(e.target.value)}
              className="input w-full text-sm"
              placeholder="Nome do clube"
            />
          </div>

          {/* Subclubes collapsible */}
          <div>
            <button
              onClick={() => setSubclubesOpen((o) => !o)}
              className="w-full flex items-center justify-between text-left"
            >
              <span className="text-sm font-bold text-white">
                Subclubes <span className="text-dark-500 font-normal">(opcional)</span>
                {newSubclubes && newSubclubes.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-poker-500/10 text-poker-400 border border-poker-500/30">
                    {newSubclubes.length}
                  </span>
                )}
              </span>
              <span className="text-dark-500 text-xs flex items-center gap-1">
                {subclubesOpen ? <><ChevronUp className="w-3.5 h-3.5" /> Recolher</> : <><ChevronDown className="w-3.5 h-3.5" /> Adicionar subclubes</>}
              </span>
            </button>

            {subclubesOpen && (
              <div className="mt-3 space-y-2">
                {/* Existing entries */}
                {newSubclubes && newSubclubes.map((sub, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex flex-wrap gap-1">
                      {sub.siglas.map((s) => (
                        <span key={s} className="px-2 py-1 bg-dark-800 border border-dark-600 rounded text-xs font-mono text-white text-center">
                          {s}
                        </span>
                      ))}
                    </div>
                    <span className="text-sm text-dark-300 flex-1">{sub.nome}</span>
                    <button
                      onClick={() => {
                        const updated = newSubclubes.filter((_, idx) => idx !== i);
                        onNewSubclubesChange?.(updated);
                      }}
                      className="text-dark-500 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {/* Add new subclube inline form */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newSigla}
                    onChange={(e) => setNewSigla(e.target.value.toUpperCase())}
                    placeholder="Siglas (ex: TGP, TGPVIP)"
                    className="input w-56 text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={newNome}
                    onChange={(e) => setNewNome(e.target.value)}
                    placeholder="Nome do subclube"
                    className="input flex-1 text-xs"
                  />
                  <button
                    onClick={() => {
                      const siglas = newSigla.split(',').map((s) => s.trim()).filter(Boolean);
                      const nome = newNome.trim();
                      if (!siglas.length || !nome) return;
                      const allExisting = new Set((newSubclubes || []).flatMap((s) => s.siglas));
                      if (siglas.some((s) => allExisting.has(s))) return;
                      const updated = [...(newSubclubes || []), { siglas, nome }];
                      onNewSubclubesChange?.(updated);
                      setNewSigla('');
                      setNewNome('');
                    }}
                    disabled={!newSigla.trim() || !newNome.trim()}
                    className="px-2.5 py-1.5 rounded-lg bg-poker-600/15 text-poker-400 border border-poker-500/30 hover:bg-poker-600/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-dark-500 text-[10px] mt-1">
                  Separe multiplas siglas com virgula. Cada sigla vira um prefixo para vincular agentes.
                </p>

                {/* Vincular Subclubes button */}
                {newSubclubes && newSubclubes.length > 0 && onCreateAndLinkSubclubes && (
                  <div className="pt-3 mt-2 border-t border-dark-700/50">
                    <button
                      onClick={async () => {
                        setLinkingSubclubes(true);
                        try {
                          await onCreateAndLinkSubclubes();
                        } finally {
                          setLinkingSubclubes(false);
                        }
                      }}
                      disabled={linkingSubclubes}
                      className="w-full py-2 rounded-lg text-xs font-bold bg-blue-600/15 text-blue-400 border border-blue-500/30 hover:bg-blue-600/25 disabled:opacity-50 transition-all"
                    >
                      {linkingSubclubes ? 'Criando e vinculando...' : 'Vincular Subclubes'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : existingSubclubCount !== undefined && existingSubclubCount >= 0 ? (
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
              <span className="text-blue-400 text-xs font-bold">{'\u2713'}</span>
            </div>
            <p className="text-dark-300 text-sm">
              Clube encontrado: <span className="text-white font-semibold">{clubName}</span>
              {existingSubclubCount > 0 && (
                <span className="text-dark-500 ml-1">({existingSubclubCount} subclube{existingSubclubCount !== 1 ? 's' : ''})</span>
              )}
            </p>
          </div>
        </div>
      ) : null}

      {/* ─── Summary KPIs ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-0.5 bg-blue-500" />
          <div className="p-3">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Jogadores</p>
            <p className="text-xl font-bold font-mono text-blue-400">{preview.summary.total_players}</p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-0.5 bg-purple-500" />
          <div className="p-3">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Agentes</p>
            <p className="text-xl font-bold font-mono text-purple-400">{preview.summary.total_agents}</p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className={`h-0.5 ${preview.summary.total_winnings_brl >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <div className="p-3">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Ganhos</p>
            <p className={`text-lg font-bold font-mono ${preview.summary.total_winnings_brl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatBRL(preview.summary.total_winnings_brl)}
            </p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-0.5 bg-blue-500" />
          <div className="p-3">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Rake Total</p>
            <p className="text-lg font-bold font-mono text-blue-400">{formatBRL(preview.summary.total_rake_brl)}</p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-0.5 bg-purple-500" />
          <div className="p-3">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">GGR Total</p>
            <p className="text-lg font-bold font-mono text-purple-400">{formatBRL(preview.summary.total_ggr_brl)}</p>
          </div>
        </div>
      </div>

      {/* ─── ChipPix Manager Trade Record ─── */}
      {preview.chippix_trades && Object.keys(preview.chippix_trades).length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-bold text-white mb-3">ChipPix — Manager Trade Record</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(preview.chippix_trades).map(([key, op]: [string, ChipPixTradeOperator]) => (
              <div key={key} className="bg-dark-900 border border-dark-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-blue-400">{op.manager}</span>
                  <span className="text-[10px] text-dark-500">
                    {op.txnCount} txns &middot; {op.playerCount} jogadores
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-0.5">Entradas</p>
                    <p className="font-mono text-sm text-emerald-400">{formatBRL(op.totalIN)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-0.5">Saidas</p>
                    <p className="font-mono text-sm text-red-400">{formatBRL(op.totalOUT)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-0.5">Saldo</p>
                    <p className={`font-mono text-sm font-bold ${op.saldo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatBRL(op.saldo)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Readiness ─── */}
      {preview.readiness.ready ? (
        <div className="bg-dark-900 border border-green-700/40 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
              <span className="text-green-400 text-xs font-bold">{'\u2713'}</span>
            </div>
            <p className="text-green-400 font-medium text-sm">
              Tudo pronto! Sem pendencias.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-dark-900 border border-yellow-600/40 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <span className="text-yellow-400 text-xs font-bold">!</span>
            </div>
            <div>
              <p className="text-yellow-300 font-medium text-sm">
                {preview.readiness.blockers_count} pendencia{preview.readiness.blockers_count !== 1 ? 's' : ''} para resolver
              </p>
              {preview.blockers.players_without_agency.length > 0 && (
                <p className="text-dark-400 text-xs mt-0.5">
                  {preview.blockers.players_without_agency.length} jogador(es) sem agencia
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Auto-resolved players banner ─── */}
      {autoResolvedCount > 0 && onEditLinks && (
        <div className="bg-dark-900 border border-blue-700/40 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                <span className="text-blue-400 text-xs font-bold">{'\u2194'}</span>
              </div>
              <div>
                <p className="text-blue-300 font-medium text-sm">
                  {autoResolvedCount} jogador{autoResolvedCount !== 1 ? 'es' : ''} auto-vinculado{autoResolvedCount !== 1 ? 's' : ''}
                </p>
                <p className="text-dark-400 text-xs mt-0.5">Links de importacoes anteriores.</p>
              </div>
            </div>
            <button
              onClick={onEditLinks}
              className="px-3 py-1.5 text-blue-400 hover:text-blue-300 text-xs font-bold border border-blue-700/40 rounded-lg hover:bg-blue-900/30 transition-colors shrink-0"
            >
              Revisar
            </button>
          </div>
        </div>
      )}

      {/* ─── SEM VÍNCULO banner ─── */}
      {semVinculoCount > 0 && (
        <div className="bg-dark-900 border border-amber-600/40 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
              <span className="text-amber-400 text-xs font-bold">!</span>
            </div>
            <div>
              <p className="text-amber-300 font-medium text-sm">
                {semVinculoCount} agente{semVinculoCount !== 1 ? 's' : ''} sem sigla
              </p>
              <p className="text-dark-400 text-xs mt-0.5">
                {canEditLinks
                  ? 'Clique no subclube na tabela de jogadores para vincular.'
                  : <>Importados como &quot;SEM V{'I'}NCULO&quot;. Vincule em Cadastro {'>'} Agentes apos a importacao.</>}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Players table ─── */}
      {players.length > 0 && (
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden mb-4">
          <button
            onClick={() => { setPlayersOpen((o) => !o); setPage(0); }}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-dark-800/30 transition-colors"
          >
            <h3 className="text-sm font-bold text-white">
              Jogadores <span className="text-dark-500 font-normal ml-1">({players.length})</span>
            </h3>
            <span className="text-dark-500 text-xs">{playersOpen ? '\u25B2 Recolher' : '\u25BC Expandir'}</span>
          </button>

          {playersOpen && (
            <div className="px-4 pb-4">
              <input
                type="text"
                placeholder="Buscar por nick ou ID..."
                value={playerSearch}
                onChange={(e) => { setPlayerSearch(e.target.value); setPage(0); }}
                className="input w-full text-xs mb-3"
              />

              {/* Status filter pills */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {STATUS_FILTERS.map((f) => {
                  const count = f.key === 'all'
                    ? players.length
                    : players.filter((p) => f.match(p._status || 'ok')).length;
                  if (f.key !== 'all' && count === 0) return null;
                  const isActive = statusFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      onClick={() => { setStatusFilter(f.key); setPage(0); }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                        isActive
                          ? 'bg-poker-600/15 border-poker-500 text-poker-400'
                          : 'bg-dark-800/50 border-dark-700 text-dark-400 hover:border-dark-500'
                      }`}
                    >
                      {f.label}
                      <span className="ml-1 font-mono">{count}</span>
                    </button>
                  );
                })}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs data-table">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('nick')}>
                        Nick {sortIcon('nick')}
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">ID</th>
                      <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Agente</th>
                      <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Subclube</th>
                      <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('ganhos')}>
                        Ganhos {sortIcon('ganhos')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('rake')}>
                        Rake {sortIcon('rake')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort('ggr')}>
                        GGR {sortIcon('ggr')}
                      </th>
                      <th className="px-3 py-2 text-center font-medium text-[10px] text-dark-400 uppercase tracking-wider min-w-[100px]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedPlayers.map((p) => {
                      const st = STATUS_STYLES[p._status] || STATUS_STYLES.ok;
                      const effectiveClube = localLinks[p.id] || p.clube;
                      return (
                        <tr key={p.id} className="hover:bg-white/[.02]">
                          <td className="px-3 py-2 text-white font-medium">{p.nick}</td>
                          <td className="px-3 py-2 text-dark-400 font-mono text-[10px]">{p.id}</td>
                          <td className="px-3 py-2 text-dark-300">{p.aname || '-'}</td>
                          <td className="px-3 py-2">
                            {canEditLinks && (hasRealAgent(p.aname) || onLinkPlayerDirect) ? (
                              editingAgent === (hasRealAgent(p.aname) ? p.aname : `player:${p.id}`) ? (
                                <div className="flex items-center gap-1">
                                  <select
                                    className="bg-dark-800 border border-dark-600 rounded text-[10px] text-white px-1.5 py-0.5 max-w-[120px]"
                                    defaultValue=""
                                    disabled={linkingSaving}
                                    onChange={(e) => {
                                      if (!e.target.value) return;
                                      if (hasRealAgent(p.aname) && p.aname) {
                                        handleInlineLink(p.aname, e.target.value);
                                      } else {
                                        handleInlinePlayerLink(p.id, e.target.value);
                                      }
                                    }}
                                  >
                                    <option value="" disabled>Selecione...</option>
                                    {(availableSubclubs || []).map((sc) => (
                                      <option key={sc.id} value={sc.id}>{sc.name}</option>
                                    ))}
                                  </select>
                                  {linkingSaving ? (
                                    <span className="text-[10px] text-dark-400 animate-pulse">...</span>
                                  ) : (
                                    <button onClick={() => setEditingAgent(null)} className="text-dark-500 hover:text-dark-300 text-xs">{'\u2715'}</button>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={() => setEditingAgent(hasRealAgent(p.aname) ? p.aname! : `player:${p.id}`)}
                                  className="group flex items-center gap-1 cursor-pointer"
                                  title="Vincular a subclube"
                                >
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${effectiveClube ? getClubStyle(effectiveClube) : 'bg-dark-700/50 text-dark-400 border-dark-600'} group-hover:ring-1 group-hover:ring-amber-500/50 transition-all`}>
                                    {effectiveClube || 'SEM VINCULO'}
                                  </span>
                                </button>
                              )
                            ) : effectiveClube ? (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getClubStyle(effectiveClube)}`}>
                                {effectiveClube}
                              </span>
                            ) : (
                              <span className="text-dark-500">-</span>
                            )}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono ${p.ganhos >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatBRL(p.ganhos)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-blue-400">{formatBRL(p.rake)}</td>
                          <td className="px-3 py-2 text-right font-mono text-purple-400">{formatBRL(p.ggr)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${st.cls}`}>
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-dark-800/60 border-t border-dark-700">
                    <tr className="font-semibold">
                      <td className="px-3 py-2 text-white" colSpan={4}>
                        Total <span className="text-dark-500 font-normal">({filteredPlayers.length})</span>
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${playerTotals.ganhos >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatBRL(playerTotals.ganhos)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-blue-400">{formatBRL(playerTotals.rake)}</td>
                      <td className="px-3 py-2 text-right font-mono text-purple-400">{formatBRL(playerTotals.ggr)}</td>
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3 text-xs text-dark-400">
                  <span>Pagina {page + 1} de {totalPages}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="px-3 py-1 rounded-lg bg-dark-800 border border-dark-700 hover:border-dark-600 disabled:opacity-40 transition-colors"
                    >
                      {'\u2190'} Anterior
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="px-3 py-1 rounded-lg bg-dark-800 border border-dark-700 hover:border-dark-600 disabled:opacity-40 transition-colors"
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
        <div className="bg-dark-900 border border-blue-700/40 rounded-xl p-4 mb-4">
          <p className="text-blue-300 font-medium text-sm mb-2">
            {preview.duplicate_players.length} ID{preview.duplicate_players.length !== 1 ? 's' : ''} duplicado{preview.duplicate_players.length !== 1 ? 's' : ''} — valores somados
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs data-table">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] text-dark-400 uppercase tracking-wider">ID</th>
                  <th className="px-3 py-2 text-left text-[10px] text-dark-400 uppercase tracking-wider">Nick</th>
                  <th className="px-3 py-2 text-center text-[10px] text-dark-400 uppercase tracking-wider">Ocorrencias</th>
                  <th className="px-3 py-2 text-right text-[10px] text-dark-400 uppercase tracking-wider">Rake Somado</th>
                </tr>
              </thead>
              <tbody>
                {preview.duplicate_players.map((d) => (
                  <tr key={d.id}>
                    <td className="px-3 py-1.5 font-mono text-blue-400">{d.id}</td>
                    <td className="px-3 py-1.5 text-dark-300">{d.nick}</td>
                    <td className="px-3 py-1.5 text-center text-dark-400">{d.count}x</td>
                    <td className="px-3 py-1.5 text-right font-mono text-white">{formatBRL(d.merged_rake)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Warnings ─── */}
      {preview.warnings.length > 0 && (
        <div className="text-xs text-dark-400 space-y-1 mb-4">
          {preview.warnings.map((w, i) => (
            <p key={i} className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
              {w}
            </p>
          ))}
        </div>
      )}

      {/* ─── Navigation ─── */}
      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="px-4 py-2.5 text-dark-400 hover:text-white transition-colors text-sm">
          {'\u2190'} Voltar
        </button>
        <button
          onClick={onNext}
          disabled={needsReimportConfirm}
          className={`btn-primary flex-1 py-2.5 text-sm font-bold ${needsReimportConfirm ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={needsReimportConfirm ? 'Marque o checkbox acima para confirmar' : undefined}
        >
          {needsReimportConfirm
            ? 'Confirme a reimportacao acima'
            : 'Confirmar Importacao'}
        </button>
      </div>
    </div>
  );
}
