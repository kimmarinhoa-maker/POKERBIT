'use client';

import RoleGuard from '@/components/RoleGuard';

export default function CaixaGeralLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard allowed={['OWNER', 'ADMIN', 'FINANCEIRO']}>{children}</RoleGuard>;
}
