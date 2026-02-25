import { useRouter } from 'next/navigation';
import { PreviewData } from '@/types/import';
import { formatDate } from '@/lib/api';

export interface ConfirmResult {
  settlement_id: string;
  settlement_version: number;
  player_count: number;
  agent_count: number;
  club_count: number;
  warnings: string[];
}

interface SuccessStepProps {
  preview: PreviewData | null;
  confirmResult: ConfirmResult;
  onReset: () => void;
}

export default function SuccessStep({ preview, confirmResult, onReset }: SuccessStepProps) {
  const router = useRouter();

  return (
    <div className="text-center py-8">
      <div className="text-6xl mb-4">{'\u{1F389}'}</div>
      <h2 className="text-2xl font-bold text-white mb-2">Importacao Concluida!</h2>
      <p className="text-dark-400 mb-2">
        {preview?.existing_settlement?.mode === 'merge'
          ? `Dados adicionados ao fechamento da semana ${preview ? formatDate(preview.week.week_start) : ''}`
          : `Semana ${preview ? formatDate(preview.week.week_start) : ''} criada com sucesso`}
      </p>
      <p className="text-dark-500 text-sm mb-8">
        {confirmResult.player_count} jogadores &middot; {confirmResult.agent_count} agentes &middot; v
        {confirmResult.settlement_version}
      </p>

      {confirmResult.warnings?.length > 0 && (
        <div className="text-sm text-yellow-300/80 space-y-1 mb-6 text-left max-w-md mx-auto">
          {confirmResult.warnings.map((w: string, i: number) => (
            <p key={i}>
              {'\u26A0\uFE0F'} {w}
            </p>
          ))}
        </div>
      )}

      <div className="flex gap-3 justify-center">
        <button onClick={onReset} className="px-6 py-2.5 text-dark-400 hover:text-white transition-colors">
          Nova Importacao
        </button>
        <button onClick={() => router.push(`/s/${confirmResult.settlement_id}`)} className="btn-primary px-8 py-2.5">
          {'\u{1F4CA}'} Ver Fechamento
        </button>
      </div>
    </div>
  );
}
