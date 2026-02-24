'use client';

export default function TabSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      <div className="h-8 bg-dark-800 rounded-lg w-1/3" />
      <div className="h-32 bg-dark-800 rounded-xl" />
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-dark-800 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
