'use client';

import KpiSkeleton from './KpiSkeleton';
import TableSkeleton from './TableSkeleton';

export default function SettlementSkeleton({ kpis = 5 }: { kpis?: number }) {
  return (
    <div>
      <KpiSkeleton count={kpis} />
      <div className="h-10 bg-dark-800 rounded-lg w-72 mb-4 animate-pulse" />
      <TableSkeleton columns={5} rows={8} />
    </div>
  );
}
