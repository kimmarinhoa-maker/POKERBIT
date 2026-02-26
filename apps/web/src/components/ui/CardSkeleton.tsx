'use client';

export default function CardSkeleton() {
  return (
    <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
      <div className="h-0.5 skeleton-shimmer" />
      <div className="p-5">
        <div className="h-3 skeleton-shimmer w-1/2 mb-4" />
        <div className="h-8 skeleton-shimmer w-3/4 mb-3" />
        <div className="h-3 skeleton-shimmer w-1/3" />
      </div>
    </div>
  );
}
