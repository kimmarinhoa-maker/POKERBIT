'use client';

import { useState, useMemo } from 'react';

type SortDir = 'asc' | 'desc';

interface UseSortableOptions<T, K extends string> {
  data: T[];
  defaultKey: K;
  defaultDir?: SortDir;
  getValue: (item: T, key: K) => string | number;
}

export function useSortable<T, K extends string>({
  data,
  defaultKey,
  defaultDir = 'desc',
  getValue,
}: UseSortableOptions<T, K>) {
  const [sortKey, setSortKey] = useState<K>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  function handleSort(key: K) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = useMemo(() => {
    const mult = sortDir === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      const va = getValue(a, sortKey);
      const vb = getValue(b, sortKey);
      if (typeof va === 'string' && typeof vb === 'string') return mult * va.localeCompare(vb);
      return mult * ((va as number) - (vb as number));
    });
  }, [data, sortKey, sortDir, getValue]);

  function sortIcon(key: K): string {
    return sortKey === key ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';
  }

  function ariaSort(key: K): 'ascending' | 'descending' | 'none' {
    if (sortKey !== key) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  }

  return { sortKey, sortDir, handleSort, sorted, sortIcon, ariaSort };
}
