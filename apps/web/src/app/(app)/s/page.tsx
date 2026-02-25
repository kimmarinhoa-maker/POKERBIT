'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listSettlements } from '@/lib/api';
import Spinner from '@/components/Spinner';

export default function SemanaRedirectPage() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await listSettlements();
        if (res.success && res.data?.length > 0) {
          router.replace(`/s/${res.data[0].id}`);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      }
    })();
  }, [router]);

  if (error) {
    return (
      <div className="p-8 text-center py-20">
        <h2 className="text-xl font-bold text-white mb-2">Nenhuma semana encontrada</h2>
        <p className="text-dark-400 mb-6">Importe um XLSX para criar o primeiro fechamento.</p>
        <button onClick={() => router.push('/import')} className="btn-primary px-6 py-2">
          Importar
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center py-20">
      <div className="text-center">
        <Spinner className="mx-auto mb-3" />
        <p className="text-dark-400 text-sm">Carregando ultima semana...</p>
      </div>
    </div>
  );
}
