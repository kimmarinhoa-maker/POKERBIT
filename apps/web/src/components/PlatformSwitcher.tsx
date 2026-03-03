'use client';

import { useState, useRef, useEffect } from 'react';
import { usePlatform } from '@/lib/usePlatform';
import { ChevronDown, Check } from 'lucide-react';
import { getPlatformColor, PLATFORM_LABELS } from '@/types/platform';

interface PlatformSwitcherProps {
  collapsed?: boolean;
}

export default function PlatformSwitcher({ collapsed }: PlatformSwitcherProps) {
  const { selectedPlatformId, selectedPlatform, platforms, setPlatformId, loading } = usePlatform();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside to close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Only show if there are external platforms (more than just Suprema sentinel)
  if (loading || platforms.length <= 1) return null;

  const color = getPlatformColor(selectedPlatform?.platform || 'suprema');

  return (
    <div ref={ref} className="relative mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-dark-800 transition-colors text-left"
      >
        <div
          className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 border ${color.bg} ${color.text} ${color.border}`}
        >
          {(selectedPlatform?.platform || 'S')[0].toUpperCase()}
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-dark-300 truncate">
                {selectedPlatform?.label || 'Suprema'}
              </p>
            </div>
            <ChevronDown
              className={`w-3 h-3 text-dark-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-60 bg-dark-900 border border-dark-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
          <div className="p-1 border-b border-dark-700">
            <p className="px-2 py-1 text-[10px] text-dark-500 uppercase tracking-wider font-semibold">
              Plataforma
            </p>
          </div>
          <div className="p-1.5 max-h-60 overflow-y-auto">
            {platforms.map((p) => {
              const isActive = p.id === selectedPlatformId;
              const c = getPlatformColor(p.platform);
              return (
                <button
                  key={p.id ?? '__suprema__'}
                  onClick={() => {
                    if (!isActive) {
                      setPlatformId(p.id);
                      window.location.href = '/dashboard';
                    }
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-poker-600/15 text-poker-400'
                      : 'text-dark-300 hover:bg-dark-800 hover:text-dark-100'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 border ${c.bg} ${c.text} ${c.border}`}
                  >
                    {p.platform[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-xs font-medium truncate">{p.label}</p>
                    <p className="text-[10px] text-dark-500">
                      {PLATFORM_LABELS[p.platform] || p.platform}
                    </p>
                  </div>
                  {isActive && <Check className="w-3.5 h-3.5 text-poker-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
