'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect legacy /config/equipe to /config (Equipe is now a tab)
export default function EquipePageRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/config');
  }, [router]);
  return null;
}
