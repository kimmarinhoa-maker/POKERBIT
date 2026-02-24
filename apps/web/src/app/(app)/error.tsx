'use client';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <div className="text-center max-w-md">
        <h2 className="text-xl font-bold text-white mb-2">Algo deu errado</h2>
        <p className="text-dark-400 text-sm mb-6">
          {error.message || 'Ocorreu um erro inesperado. Tente novamente.'}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="btn-primary text-sm px-6 py-2"
          >
            Tentar novamente
          </button>
          <a
            href="/dashboard"
            className="btn-secondary text-sm px-6 py-2"
          >
            Voltar ao Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
