import Link from 'next/link';
import { Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <div className="text-center max-w-md animate-fade-in">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-5">
          <Search className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Pagina nao encontrada</h2>
        <p className="text-dark-400 text-sm mb-6">A pagina que voce esta procurando nao existe ou foi movida.</p>
        <Link href="/dashboard" className="btn-primary text-sm px-6 py-2">
          Voltar ao Dashboard
        </Link>
      </div>
    </div>
  );
}
