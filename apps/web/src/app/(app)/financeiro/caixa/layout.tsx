'use client';

import RoleGuard from '@/components/RoleGuard';

export default function FinanceiroCaixaLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard allowed={['OWNER', 'ADMIN', 'FINANCEIRO']}>{children}</RoleGuard>;
}
