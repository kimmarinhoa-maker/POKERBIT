import { WizardStep } from '@/types/import';

interface StepIndicatorProps {
  currentStep: WizardStep;
  skipPendencies: boolean;
}

const STEPS: { key: WizardStep; label: string; icon: string }[] = [
  { key: 'upload', label: 'Upload', icon: '\u{1F4E4}' },
  { key: 'preview', label: 'Pre-analise', icon: '\u{1F50D}' },
  { key: 'pendencies', label: 'Pendencias', icon: '\u26A0\uFE0F' },
  { key: 'confirm', label: 'Confirmar', icon: '\u2705' },
];

export default function StepIndicator({ currentStep, skipPendencies }: StepIndicatorProps) {
  const stepIdx = STEPS.findIndex(s => s.key === currentStep);

  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((s, i) => {
        if (s.key === 'pendencies' && skipPendencies) return null;

        const isActive = s.key === currentStep;
        const isDone = i < stepIdx;
        return (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && !(s.key === 'pendencies' && skipPendencies) && (
              <div className={`w-8 h-px ${isDone ? 'bg-poker-500' : 'bg-dark-700'}`} />
            )}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              isActive ? 'bg-poker-600/20 text-poker-400 border border-poker-500/40' :
              isDone ? 'bg-dark-700/50 text-poker-400' :
              'bg-dark-800/50 text-dark-500'
            }`}>
              <span>{isDone ? '\u2713' : s.icon}</span>
              <span>{s.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
