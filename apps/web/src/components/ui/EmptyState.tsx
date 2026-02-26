'use client';

import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-dark-800 border border-dark-700 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-dark-500" />
      </div>
      <h3 className="text-sm font-semibold text-dark-300 mb-1">{title}</h3>
      {description && <p className="text-xs text-dark-500 max-w-xs">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 btn-ghost text-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
