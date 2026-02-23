'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredAuth } from '@/lib/api';
import Spinner from '@/components/Spinner';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const auth = getStoredAuth();
    if (auth?.session?.access_token) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner />
    </div>
  );
}
