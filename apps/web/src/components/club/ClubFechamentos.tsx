'use client';

import { CalendarDays } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';

interface Settlement {
  id: string;
  week_start: string;
  week_end?: string;
  status: string;
  club_name?: string;
}

interface Props {
  settlements: Settlement[];
  currentSettlementId: string | null;
  onSelectSettlement: (id: string, weekStart: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  FINAL: 'bg-green-500/10 text-green-400 border-green-500/30',
  DRAFT: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  VOID: 'bg-red-500/10 text-red-400 border-red-500/30',
};

function formatWeek(ws: string) {
  const d = new Date(ws + 'T00:00:00');
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const fmt = (dt: Date) => `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(d)} - ${fmt(end)}`;
}

export default function ClubFechamentos({ settlements, currentSettlementId, onSelectSettlement }: Props) {
  if (settlements.length === 0) {
    return (
      <div className="p-4 lg:p-6">
        <div className="card">
          <EmptyState
            icon={CalendarDays}
            title="Nenhum fechamento"
            description="Importe uma planilha para criar o primeiro fechamento deste clube."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 animate-tab-fade">
      <div className="mb-4">
        <h3 className="text-base font-bold text-white">Fechamentos</h3>
        <p className="text-dark-500 text-xs mt-0.5">{settlements.length} semana{settlements.length !== 1 ? 's' : ''} importada{settlements.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th scope="col" className="text-left">Semana</th>
              <th scope="col" className="text-left">Inicio</th>
              <th scope="col" className="text-center">Status</th>
              <th scope="col" className="text-right">Acao</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-800/50">
            {settlements.map((s) => (
              <tr
                key={s.id}
                className={`cursor-pointer hover:bg-dark-800/30 transition-colors ${
                  s.id === currentSettlementId ? 'bg-poker-600/5' : ''
                }`}
                onClick={() => onSelectSettlement(s.id, s.week_start)}
              >
                <td className="font-medium text-white">{formatWeek(s.week_start)}</td>
                <td className="text-dark-400 font-mono text-xs">{s.week_start}</td>
                <td className="text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLORS[s.status] || STATUS_COLORS.DRAFT}`}>
                    {s.status === 'FINAL' ? 'FINAL' : s.status === 'VOID' ? 'ANULADO' : 'RASCUNHO'}
                  </span>
                </td>
                <td className="text-right">
                  <span className="text-poker-400 text-xs font-medium">Abrir →</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
