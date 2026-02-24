'use client';

import { useState, useEffect } from 'react';

interface ClubLogoProps {
  logoUrl?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-xl',
};

export default function ClubLogo({ logoUrl, name, size = 'md', className = '' }: ClubLogoProps) {
  const [imgError, setImgError] = useState(false);
  const sizeClass = sizeMap[size];
  const initial = (name || '?').charAt(0).toUpperCase();

  // Reset error state when URL changes (new upload)
  useEffect(() => {
    setImgError(false);
  }, [logoUrl]);

  if (logoUrl && !imgError) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={`${sizeClass} rounded-lg object-cover bg-dark-800 shrink-0 ${className}`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-lg bg-dark-800 flex items-center justify-center font-bold text-dark-400 shrink-0 ${className}`}
      title={name}
    >
      {initial}
    </div>
  );
}
