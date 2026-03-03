import { WizardStep } from '@/types/import';

interface StepIndicatorProps {
  currentStep: WizardStep;
  skipPendencies: boolean;
}

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'preview', label: 'Pre-analise' },
  { key: 'pendencies', label: 'Pendencias' },
  { key: 'confirm', label: 'Confirmar' },
];

export default function StepIndicator({ currentStep, skipPendencies }: StepIndicatorProps) {
  const stepIdx = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((s, i) => {
        if (s.key === 'pendencies' && skipPendencies) return null;

        const isActive = s.key === currentStep;
        const isDone = i < stepIdx;

        return (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && !(s.key === 'pendencies' && skipPendencies) && (
              <div
                className={`w-8 h-px transition-colors ${isDone ? 'bg-poker-500' : 'bg-dark-700'}`}
              />
            )}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-[7px] h-[7px] rounded-full transition-all ${
                  isActive
                    ? 'bg-poker-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]'
                    : isDone
                      ? 'bg-poker-500'
                      : 'bg-dark-600'
                }`}
              />
              <span
                className={`text-[10px] font-medium transition-colors ${
                  isActive ? 'text-poker-400' : isDone ? 'text-poker-500/70' : 'text-dark-500'
                }`}
              >
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
