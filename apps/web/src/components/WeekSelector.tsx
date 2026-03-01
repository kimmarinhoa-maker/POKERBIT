'use client';

import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { listSettlements } from '@/lib/api';
import WeekDatePicker from '@/components/WeekDatePicker';

interface WeekSelectorProps {
  currentSettlementId: string;
  weekStart: string;
  weekEnd: string;
  status: string;
  onNotFound?: () => void;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  FINAL: { label: 'FINAL', cls: 'border-green-500/30 bg-green-500/10 text-green-400' },
  DRAFT: { label: 'RASCUNHO', cls: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' },
  VOID: { label: 'ANULADO', cls: 'border-red-500/30 bg-red-500/10 text-red-400' },
};

export default function WeekSelector({
  currentSettlementId,
  weekStart,
  weekEnd,
  status,
  onNotFound,
}: WeekSelectorProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sc = STATUS_MAP[status] || STATUS_MAP.DRAFT;

  const [startDate, setStartDate] = useState<string | null>(weekStart);
  const [endDate, setEndDate] = useState<string | null>(weekEnd);
  const [_searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Auto-compute Data Final (Sunday) = Data Inicial (Monday) + 6 days, then search
  function handleStartChange(date: string) {
    setStartDate(date);
    setNotFound(false);
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    const end = d.toISOString().slice(0, 10);
    setEndDate(end);
    // Auto-search immediately
    doSearch(date, end);
  }

  async function doSearch(start: string, end?: string) {
    setSearching(true);
    setNotFound(false);
    try {
      const res = await listSettlements(undefined, start, end || undefined);
      if (res.success && res.data && res.data.length > 0) {
        const target = res.data[0];
        const suffix = pathname.replace(`/s/${currentSettlementId}`, '');
        const qs = searchParams.toString();
        const newUrl = `/s/${target.id}${suffix}${qs ? `?${qs}` : ''}`;
        window.location.href = newUrl;
      } else {
        setNotFound(true);
        setSearching(false);
        onNotFound?.();
      }
    } catch {
      setNotFound(true);
      setSearching(false);
      onNotFound?.();
    }
  }

  function formatDDMM(iso: string) {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
  }

  function navigateWeek(delta: number) {
    const current = startDate || weekStart;
    const d = new Date(current + 'T00:00:00');
    d.setDate(d.getDate() + delta * 7);
    const newStart = d.toISOString().slice(0, 10);
    handleStartChange(newStart);
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3">
        {/* Status badge */}
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${sc.cls}`}>{sc.label}</span>

        <div className="h-4 w-px bg-dark-700" />

        {/* Prev/Next week arrows */}
        <button
          onClick={() => navigateWeek(-1)}
          className="text-dark-400 hover:text-white p-1 rounded hover:bg-dark-800 transition-colors"
          title="Semana anterior"
          aria-label="Semana anterior"
        >
          {'\u2039'}
        </button>

        {/* Date pickers */}
        <div className="flex items-end gap-2">
          <WeekDatePicker value={startDate} onChange={handleStartChange} allowedDay={1} label="Data Inicial" />
          <WeekDatePicker value={endDate} onChange={setEndDate} allowedDay={0} label="Data Final" />
        </div>

        <button
          onClick={() => navigateWeek(1)}
          className="text-dark-400 hover:text-white p-1 rounded hover:bg-dark-800 transition-colors"
          title="Proxima semana"
          aria-label="Proxima semana"
        >
          {'\u203A'}
        </button>

        {/* Not found inline */}
        {notFound && startDate && endDate && (
          <span className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
            Nenhum fechamento para {formatDDMM(startDate)} → {formatDDMM(endDate)}
          </span>
        )}
      </div>
    </div>
  );
}
