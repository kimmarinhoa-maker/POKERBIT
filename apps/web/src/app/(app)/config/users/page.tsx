'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect legacy /config/users to /config (Equipe tab)
export default function UsersPageRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/config');
  }, [router]);
  return null;
}
