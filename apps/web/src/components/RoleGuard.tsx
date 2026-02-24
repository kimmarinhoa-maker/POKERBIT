'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';

interface Props {
  allowed: string[];
  children: React.ReactNode;
}

/**
 * Wrapper that redirects to /dashboard if the current user's role
 * is not in the `allowed` list.
 */
export default function RoleGuard({ allowed, children }: Props) {
  const { role, loading } = useAuth();
  const router = useRouter();

  const hasAccess = allowed.includes(role);

  useEffect(() => {
    if (!loading && !hasAccess) {
      router.replace('/dashboard');
    }
  }, [loading, hasAccess, router]);

  if (loading) return null;
  if (!hasAccess) return null;

  return <>{children}</>;
}
