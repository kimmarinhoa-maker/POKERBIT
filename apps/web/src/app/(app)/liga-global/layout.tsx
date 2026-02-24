'use client';

import RoleGuard from '@/components/RoleGuard';

export default function LigaGlobalLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard allowed={['OWNER', 'ADMIN']}>{children}</RoleGuard>;
}
