// ══════════════════════════════════════════════════════════════════════
//  In-Memory Cache — Simple TTL cache for finalized settlements
// ══════════════════════════════════════════════════════════════════════

interface CacheEntry {
  data: any;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

export function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function cacheSet(key: string, data: any, ttlMs = 300_000): void {
  cache.set(key, { data, expires: Date.now() + ttlMs });
  // Evict expired entries when cache grows large
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expires) cache.delete(k);
    }
  }
}

export function cacheInvalidate(prefix: string): void {
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}
