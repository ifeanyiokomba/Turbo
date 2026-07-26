// In-memory cache for generated statement file contents.
// The DB stores metadata (periodStart/periodEnd/format); the actual PDF/CSV
// bytes live here keyed by StatementRequest.id. If a server restart clears
// the cache, the GET endpoint transparently regenerates the file from the
// stored period range — so users can always download past statements.

interface CachedStatement {
  statementId: string;
  format: "PDF" | "CSV";
  bytes: Uint8Array;
  filename: string;
  createdAt: number;
}

// Module-scoped cache — survives across requests within the same process.
const cache = new Map<string, CachedStatement>();

// Soft cap: keep the last ~50 generated statements in memory.
const MAX_ENTRIES = 50;

export function getCachedStatement(id: string): CachedStatement | undefined {
  return cache.get(id);
}

export function setCachedStatement(entry: CachedStatement): void {
  cache.set(entry.statementId, entry);
  // Evict oldest entries when over the cap.
  if (cache.size > MAX_ENTRIES) {
    const oldest = Array.from(cache.values()).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    for (let i = 0; i < cache.size - MAX_ENTRIES; i++) {
      cache.delete(oldest[i].statementId);
    }
  }
}

export function clearStatementCache(id: string): void {
  cache.delete(id);
}
