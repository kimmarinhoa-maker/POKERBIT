'use client';

import { Users, UserPlus } from 'lucide-react';

export default function TeamPage() {
  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-poker-600/20 flex items-center justify-center">
          <Users className="w-5 h-5 text-poker-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Equipe</h1>
          <p className="text-sm text-dark-400">Gerencie os membros da sua equipe</p>
        </div>
      </div>

      <div className="bg-dark-900 border border-dark-700 rounded-xl p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-dark-800 flex items-center justify-center mx-auto mb-4">
          <UserPlus className="w-7 h-7 text-dark-500" />
        </div>
        <h2 className="text-lg font-semibold text-dark-200 mb-2">Em breve</h2>
        <p className="text-sm text-dark-500 mb-6 max-w-md mx-auto">
          A gestao de equipe estara disponivel em breve. Por enquanto, use{' '}
          <a href="/config/equipe" className="text-poker-400 hover:underline">
            Configuracao &gt; Equipe
          </a>{' '}
          para gerenciar membros e permissoes.
        </p>
        <button
          disabled
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-800 border border-dark-700 text-dark-500 cursor-not-allowed text-sm"
        >
          <UserPlus className="w-4 h-4" />
          Convidar membro
        </button>
      </div>
    </div>
  );
}
