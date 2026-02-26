'use client';

const colsMap: Record<number, string> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-6',
};

export default function KpiSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 ${colsMap[count] || 'md:grid-cols-5'} gap-3 mb-5`}>
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className="animate-pulse bg-dark-900 border border-dark-700 rounded-xl overflow-hidden"
        >
          <div className="h-0.5 bg-dark-700" />
          <div className="p-4">
            <div className="h-3 bg-dark-800 rounded w-1/2 mb-3" />
            <div className="h-7 bg-dark-800 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
