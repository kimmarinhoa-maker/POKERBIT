'use client';

import KpiSkeleton from './KpiSkeleton';
import TableSkeleton from './TableSkeleton';

export default function SettlementSkeleton({ kpis = 5 }: { kpis?: number }) {
  return (
    <div>
      <KpiSkeleton count={kpis} />
      <div className="h-10 skeleton-shimmer rounded-lg w-72 mb-4" />
      <TableSkeleton columns={5} rows={8} />
    </div>
  );
}
