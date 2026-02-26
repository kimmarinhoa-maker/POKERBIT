'use client';

export default function TabSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="h-8 skeleton-shimmer rounded-lg w-1/3" />
      <div className="h-32 skeleton-shimmer rounded-xl" />
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-12 skeleton-shimmer rounded-lg"
            style={{ animationDelay: `${i * 0.1}s` }}
          />
        ))}
      </div>
    </div>
  );
}
