'use client';

export default function TableSkeleton({ columns = 5, rows = 8 }: { columns?: number; rows?: number }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-dark-800/80">
              {[...Array(columns)].map((_, i) => (
                <th key={i} className="px-3 py-3">
                  <div className="h-3 bg-dark-700 rounded w-3/4 animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-800/30">
            {[...Array(rows)].map((_, r) => (
              <tr key={r}>
                {[...Array(columns)].map((_, c) => (
                  <td key={c} className="px-3 py-3">
                    <div
                      className="h-4 bg-dark-800 rounded animate-pulse"
                      style={{ width: `${55 + ((r + c) % 3) * 15}%` }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
