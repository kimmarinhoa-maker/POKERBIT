'use client';

import RoleGuard from '@/components/RoleGuard';

export default function FechamentoAgentesLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard allowed={['OWNER', 'ADMIN', 'FINANCEIRO']}>{children}</RoleGuard>;
}
