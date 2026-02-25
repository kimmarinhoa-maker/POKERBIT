'use client';

import { useState, useRef, useEffect } from 'react';

interface WeekDatePickerProps {
  value: string | null;
  onChange: (date: string) => void;
  allowedDay: 0 | 1; // 0=domingo, 1=segunda
  label: string;
}

const WEEKDAYS = ['Do', 'Se', 'Te', 'Qu', 'Qu', 'Se', 'Sa'];
const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formatDDMMYYYY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function WeekDatePicker({ value, onChange, allowedDay, label }: WeekDatePickerProps) {
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(value ? parseInt(value.split('-')[0]) : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(value ? parseInt(value.split('-')[1]) - 1 : today.getMonth());
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  // Build calendar grid for viewMonth/viewYear
  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: Array<{ day: number; enabled: boolean } | null> = [];
  // Padding for first week
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(viewYear, viewMonth, d).getDay();
    cells.push({ day: d, enabled: dow === allowedDay });
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  function selectDay(day: number) {
    const iso = toISO(viewYear, viewMonth, day);
    onChange(iso);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <label className="block text-xs text-dark-400 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-left text-sm text-white hover:border-dark-500 transition-colors flex items-center justify-between"
      >
        <span className={value ? 'text-white' : 'text-dark-500'}>{value ? formatDDMMYYYY(value) : 'dd/mm/aaaa'}</span>
        <svg className="w-4 h-4 text-dark-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 bg-dark-800 border border-dark-700 rounded-xl shadow-xl p-3 w-[280px]">
          {/* Header: nav + month/year */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 hover:bg-dark-700 rounded text-dark-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-white">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 hover:bg-dark-700 rounded text-dark-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-0 mb-1">
            {WEEKDAYS.map((wd, i) => (
              <div key={i} className="text-center text-[10px] text-dark-500 font-medium py-1">
                {wd}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-0">
            {cells.map((cell, i) => {
              if (!cell) {
                return <div key={`empty-${i}`} className="w-9 h-9" />;
              }
              const iso = toISO(viewYear, viewMonth, cell.day);
              const isSelected = value === iso;
              const isToday = iso === toISO(today.getFullYear(), today.getMonth(), today.getDate());

              if (!cell.enabled) {
                return (
                  <div
                    key={cell.day}
                    className="w-9 h-9 flex items-center justify-center text-xs text-dark-600 cursor-not-allowed"
                  >
                    {cell.day}
                  </div>
                );
              }

              return (
                <button
                  key={cell.day}
                  type="button"
                  onClick={() => selectDay(cell.day)}
                  className={`w-9 h-9 flex items-center justify-center text-xs rounded-lg font-semibold transition-colors
                    ${
                      isSelected
                        ? 'bg-poker-600 text-white'
                        : isToday
                          ? 'bg-dark-700 text-poker-400 hover:bg-poker-600/30'
                          : 'text-white hover:bg-dark-700'
                    }`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
