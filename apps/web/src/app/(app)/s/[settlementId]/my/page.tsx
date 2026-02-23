'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSettlementFull } from '@/lib/api';
import Spinner from '@/components/Spinner';

/**
 * RBAC redirect — redireciona para o(s) subclube(s) permitido(s) do user.
 *
 * O backend já filtra os subclubes por role (allowedSubclubIds):
 * - OWNER/ADMIN: recebem todos os subclubes
 * - AGENTE: recebe apenas os subclubes vinculados via user_org_access
 *
 * Lógica:
 * - 1 subclube → redirect direto para /s/{id}/club/{name}
 * - Múltiplos → redirect para /s/{id} (overview filtrada)
 * - Nenhum → mostra mensagem de sem acesso
 */
export default function MySubclubRedirect() {
  const params = useParams();
  const router = useRouter();
  const settlementId = params.settlementId as string;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getSettlementFull(settlementId);
        if (!res.success || !res.data?.subclubs) {
          setError('Erro ao carregar settlement');
          return;
        }

        const subclubs = res.data.subclubs;

        if (subclubs.length === 1) {
          // Redirect direto para o único subclube
          router.replace(`/s/${settlementId}/club/${encodeURIComponent(subclubs[0].name)}`);
        } else if (subclubs.length > 1) {
          // Múltiplos subclubes → overview (já filtrada pelo backend)
          router.replace(`/s/${settlementId}`);
        } else {
          setError('Voce nao tem acesso a nenhum subclube neste fechamento');
        }
      } catch {
        setError('Erro de conexao com o servidor');
      }
    })();
  }, [settlementId, router]);

  if (error) {
    return (
      <div className="p-8 text-center py-20">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={() => router.push('/dashboard')}
          className="btn-secondary text-sm"
        >
          Voltar ao Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center py-20">
      <div className="text-center">
        <Spinner className="mx-auto mb-3" />
        <p className="text-dark-400 text-sm">Redirecionando para seu subclube...</p>
      </div>
    </div>
  );
}
