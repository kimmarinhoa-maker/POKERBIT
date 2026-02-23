import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">🃏</div>
        <h2 className="text-2xl font-bold text-white mb-2">Pagina nao encontrada</h2>
        <p className="text-dark-400 text-sm mb-6">
          A pagina que voce esta procurando nao existe ou foi movida.
        </p>
        <Link href="/dashboard" className="btn-primary text-sm px-6 py-2">
          Voltar ao Dashboard
        </Link>
      </div>
    </div>
  );
}
