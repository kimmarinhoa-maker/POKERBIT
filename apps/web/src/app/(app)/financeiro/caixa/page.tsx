'use client';

import dynamic from 'next/dynamic';

const CaixaGeral = dynamic(() => import('@/app/(app)/caixa-geral/page'), { ssr: false });

export default function FinanceiroCaixaPage() {
  return <CaixaGeral />;
}
