// ══════════════════════════════════════════════════════════════════════
//  Batch Execute — Runs async operations in parallel chunks
// ══════════════════════════════════════════════════════════════════════

export async function batchExecute<T>(
  items: T[],
  fn: (item: T) => Promise<any>,
  batchSize = 20,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(chunk.map(fn));
    for (const r of results) {
      if (r.status === 'fulfilled') ok++;
      else failed++;
    }
  }
  return { ok, failed };
}
