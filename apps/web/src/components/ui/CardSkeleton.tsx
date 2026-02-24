'use client';

export default function CardSkeleton() {
  return (
    <div className="animate-pulse bg-dark-900 border border-dark-700 rounded-xl p-5">
      <div className="h-3 bg-dark-800 rounded w-1/2 mb-4" />
      <div className="h-8 bg-dark-800 rounded w-3/4 mb-3" />
      <div className="h-3 bg-dark-800 rounded w-1/3" />
    </div>
  );
}
