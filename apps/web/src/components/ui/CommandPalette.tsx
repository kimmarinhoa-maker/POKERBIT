'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Search,
  LayoutDashboard,
  Upload,
  Clock,
  Receipt,
  Building2,
  Eye,
  Trophy,
  Users,
  Link as LinkIcon,
  Settings,
  type LucideIcon,
} from 'lucide-react';

interface CommandItem {
  label: string;
  href: string;
  icon: LucideIcon;
  section: string;
  keywords?: string;
}

const commands: CommandItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, section: 'Operacao', keywords: 'home inicio' },
  { label: 'Importar', href: '/import', icon: Upload, section: 'Operacao', keywords: 'upload planilha' },
  { label: 'Historico', href: '/import/history', icon: Clock, section: 'Operacao', keywords: 'imports passados' },
  { label: 'Vincular', href: '/import/vincular', icon: LinkIcon, section: 'Operacao', keywords: 'link associar jogadores' },
  { label: 'Lancamentos', href: '/lancamentos', icon: Receipt, section: 'Operacao', keywords: 'manual ajuste' },
  { label: 'Clubes (Settlement)', href: '/s', icon: Building2, section: 'Fechamentos', keywords: 'settlement acerto' },
  { label: 'Visao Geral', href: '/s', icon: Eye, section: 'Fechamentos', keywords: 'overview resumo settlement' },
  { label: 'Liga Global', href: '/liga-global', icon: Trophy, section: 'Fechamentos', keywords: 'consolidado total' },
  { label: 'Agentes / Jogadores', href: '/players', icon: Users, section: 'Cadastro', keywords: 'player agent cadastro' },
  { label: 'Configuracao', href: '/config', icon: Settings, section: 'Config', keywords: 'settings setup equipe membros permissoes' },
];

const RECENT_KEY = 'cmd-palette-recent';
const MAX_RECENT = 5;

function getRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function addRecent(href: string) {
  const prev = getRecent().filter((h) => h !== href);
  const next = [href, ...prev].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Track page visits for recent items
  useEffect(() => {
    if (pathname) addRecent(pathname);
  }, [pathname]);

  // Open/close with Ctrl+K
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Build filtered results with recent section
  const { items, totalCount } = useMemo(() => {
    if (!query.trim()) {
      // Show recent items first, then all commands
      const recentHrefs = getRecent();
      const recentItems = recentHrefs
        .map((href) => commands.find((c) => c.href === href))
        .filter((c): c is CommandItem => !!c);

      const recentSet = new Set(recentHrefs);
      const regularItems = commands.filter((c) => !recentSet.has(c.href));

      return {
        items: [
          ...recentItems.map((c) => ({ ...c, isRecent: true })),
          ...regularItems.map((c) => ({ ...c, isRecent: false })),
        ],
        totalCount: commands.length,
      };
    }

    const q = query.toLowerCase();
    const filtered = commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.section.toLowerCase().includes(q) ||
        (c.keywords && c.keywords.toLowerCase().includes(q)),
    );
    return {
      items: filtered.map((c) => ({ ...c, isRecent: false })),
      totalCount: filtered.length,
    };
  }, [query]);

  // Scroll active into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`) as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const navigate = useCallback((href: string) => {
    addRecent(href);
    setOpen(false);
    router.push(href);
  }, [router]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && items[activeIndex]) {
      e.preventDefault();
      navigate(items[activeIndex].href);
    }
  }

  if (!open) return null;

  let lastSection = '';
  let lastIsRecent: boolean | null = null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] sm:pt-[20vh]" role="dialog" aria-modal="true" aria-label="Busca rapida">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <div className="relative w-full max-w-lg mx-4 bg-dark-900 border border-dark-600 rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-dark-700">
          <Search size={18} className="text-dark-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar paginas..."
            className="flex-1 bg-transparent text-white placeholder-dark-500 text-sm outline-none"
            aria-label="Buscar paginas"
          />
          {query && (
            <span className="text-[10px] text-dark-500 font-mono">{totalCount} resultado{totalCount !== 1 ? 's' : ''}</span>
          )}
          <kbd className="text-[10px] text-dark-500 bg-dark-800 border border-dark-700 px-1.5 py-0.5 rounded font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] sm:max-h-[300px] overflow-y-auto py-2">
          {items.length === 0 ? (
            <p className="text-center text-dark-500 text-sm py-8">Nenhum resultado</p>
          ) : (
            items.map((cmd, i) => {
              const Icon = cmd.icon;
              const showRecentLabel = cmd.isRecent && lastIsRecent !== true;
              const showSectionLabel = !cmd.isRecent && (lastSection !== cmd.section || lastIsRecent === true);
              lastSection = cmd.section;
              lastIsRecent = cmd.isRecent;

              return (
                <div key={`${cmd.href}-${cmd.isRecent ? 'r' : 's'}`}>
                  {showRecentLabel && (
                    <p className="px-4 pt-2 pb-1 text-[10px] text-dark-500 uppercase tracking-wider font-semibold">Recentes</p>
                  )}
                  {showSectionLabel && (
                    <p className="px-4 pt-2 pb-1 text-[10px] text-dark-500 uppercase tracking-wider font-semibold">{cmd.section}</p>
                  )}
                  <button
                    data-idx={i}
                    onClick={() => navigate(cmd.href)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      i === activeIndex
                        ? 'bg-poker-600/20 text-poker-400'
                        : 'text-dark-200 hover:bg-dark-800'
                    }`}
                  >
                    <Icon size={16} className={i === activeIndex ? 'text-poker-400' : 'text-dark-500'} />
                    <span className="flex-1 text-sm font-medium">{cmd.label}</span>
                    {cmd.isRecent && <span className="text-[9px] text-dark-600 uppercase">recente</span>}
                    {!cmd.isRecent && <span className="text-[10px] text-dark-500 uppercase">{cmd.section}</span>}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-dark-700 text-[10px] text-dark-500">
          <span><kbd className="bg-dark-800 border border-dark-700 px-1 py-0.5 rounded font-mono mr-1">&uarr;&darr;</kbd> navegar</span>
          <span><kbd className="bg-dark-800 border border-dark-700 px-1 py-0.5 rounded font-mono mr-1">Enter</kbd> abrir</span>
          <span><kbd className="bg-dark-800 border border-dark-700 px-1 py-0.5 rounded font-mono mr-1">Esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  );
}
