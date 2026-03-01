'use client';

import Link from 'next/link';

interface Crumb {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: Crumb[];
}

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-dark-500 flex items-center gap-1.5 mb-4">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-dark-700">/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-dark-300 transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-dark-400">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
