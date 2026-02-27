import Link from 'next/link';

export default function RootNotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-dark-950 text-white">
      <div className="text-center max-w-md p-8">
        <div className="text-6xl mb-4">404</div>
        <h2 className="text-xl font-bold mb-2">Pagina nao encontrada</h2>
        <p className="text-dark-400 text-sm mb-6">
          A pagina que voce esta procurando nao existe ou foi movida.
        </p>
        <Link
          href="/dashboard"
          className="inline-block bg-poker-500 hover:bg-poker-600 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
        >
          Voltar ao Dashboard
        </Link>
      </div>
    </div>
  );
}
