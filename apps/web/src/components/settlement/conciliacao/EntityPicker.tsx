'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { AgentOption, PlayerOption } from './types';

// ─── Entity Picker (autocomplete dropdown) ──────────────────────────

export interface EntityPickerProps {
  agents: AgentOption[];
  players: PlayerOption[];
  value: string;
  onChange: (entityId: string, entityName: string) => void;
  autoFocus?: boolean;
}

export default function EntityPicker({ agents, players, value, onChange, autoFocus }: EntityPickerProps) {
  const [search, setSearch] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    setSearch(value);
  }, [value]);

  // Filter agents and players based on search
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filteredAgents = agents.filter((a) => {
      const name = (a.agent_name || '').toLowerCase();
      const id = (a.agent_id || '').toLowerCase();
      return !q || name.includes(q) || id.includes(q);
    });
    const filteredPlayers = players.filter((p) => {
      const name = (p.nickname || '').toLowerCase();
      const id = (p.external_player_id || '').toLowerCase();
      return !q || name.includes(q) || id.includes(q);
    });
    return { agents: filteredAgents, players: filteredPlayers };
  }, [search, agents, players]);

  const totalResults = filtered.agents.length + filtered.players.length;

  // Build flat list for keyboard navigation
  const flatItems = useMemo(() => {
    const items: { type: 'agent' | 'player'; id: string; name: string }[] = [];
    for (const a of filtered.agents) {
      items.push({ type: 'agent', id: a.agent_id || a.agent_name, name: a.agent_name });
    }
    for (const p of filtered.players) {
      items.push({ type: 'player', id: p.external_player_id || p.nickname || '', name: p.nickname || '' });
    }
    return items;
  }, [filtered]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightIdx(0);
  }, [flatItems.length]);

  function selectItem(entityId: string, entityName: string) {
    setSearch(entityName);
    setOpen(false);
    onChange(entityId, entityName);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx((prev) => Math.min(prev + 1, flatItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatItems.length > 0 && highlightIdx < flatItems.length) {
          const item = flatItems[highlightIdx];
          selectItem(item.id, item.name);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
    }
  }

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        placeholder="Buscar agente ou jogador..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className="input text-xs w-full"
        autoFocus={autoFocus}
        autoComplete="off"
      />

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-dark-800 border border-dark-600 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
          {totalResults === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-dark-500">Nenhum resultado</div>
          ) : (
            <>
              {/* Agents section */}
              {filtered.agents.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-dark-500 bg-dark-800 sticky top-0">
                    Agentes ({filtered.agents.length})
                  </div>
                  {filtered.agents.map((a, i) => {
                    const flatIdx = i;
                    const isHighlighted = highlightIdx === flatIdx;
                    return (
                      <button
                        key={`agent-${a.agent_id || a.agent_name}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectItem(a.agent_id || a.agent_name, a.agent_name);
                        }}
                        onMouseEnter={() => setHighlightIdx(flatIdx)}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors ${
                          isHighlighted ? 'bg-poker-600/20 text-white' : 'text-dark-200 hover:bg-dark-700'
                        }`}
                      >
                        <span className="text-xs font-medium truncate">{a.agent_name}</span>
                        {a.agent_id && (
                          <span className="text-[10px] text-dark-500 font-mono ml-2 flex-shrink-0">{a.agent_id}</span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}

              {/* Players section */}
              {filtered.players.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-dark-500 bg-dark-800 sticky top-0">
                    Jogadores ({filtered.players.length})
                  </div>
                  {filtered.players.map((p, i) => {
                    const flatIdx = filtered.agents.length + i;
                    const isHighlighted = highlightIdx === flatIdx;
                    return (
                      <button
                        key={`player-${p.external_player_id || p.nickname}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectItem(p.external_player_id || p.nickname || '', p.nickname || '');
                        }}
                        onMouseEnter={() => setHighlightIdx(flatIdx)}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors ${
                          isHighlighted ? 'bg-poker-600/20 text-white' : 'text-dark-200 hover:bg-dark-700'
                        }`}
                      >
                        <span className="text-xs font-medium truncate">{p.nickname || '(sem nome)'}</span>
                        {p.external_player_id && (
                          <span className="text-[10px] text-dark-500 font-mono ml-2 flex-shrink-0">
                            {p.external_player_id}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
