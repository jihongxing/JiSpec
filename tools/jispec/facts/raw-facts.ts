export interface RawFactRecord {
  key: string;
  value: unknown;
  source: string;
}

export interface RawFactsSource {
  name: string;
  version?: string;
}

export interface RawFactsSnapshot {
  generatedAt: string;
  repoRoot: string;
  sources: RawFactsSource[];
  records: RawFactRecord[];
  warnings: string[];
}

/**
 * Create an empty raw facts snapshot.
 */
export function createRawFactsSnapshot(root: string): RawFactsSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    repoRoot: root,
    sources: [],
    records: [],
    warnings: [],
  };
}

/**
 * Add a raw fact to the snapshot.
 */
export function addRawFact(
  snapshot: RawFactsSnapshot,
  key: string,
  value: unknown,
  source: string,
): void {
  snapshot.records.push({ key, value, source });

  // Add source if not already present
  if (!snapshot.sources.some((s) => s.name === source)) {
    snapshot.sources.push({ name: source });
  }
}

/**
 * Add a warning to the snapshot.
 */
export function addRawFactWarning(snapshot: RawFactsSnapshot, warning: string): void {
  snapshot.warnings.push(warning);
}

/**
 * Stable sort raw facts snapshot for consistent output.
 */
export function stableSortRawFacts(snapshot: RawFactsSnapshot): RawFactsSnapshot {
  return {
    ...snapshot,
    sources: [...snapshot.sources].sort((a, b) => a.name.localeCompare(b.name)),
    records: [...snapshot.records].sort((a, b) => {
      const keyCompare = a.key.localeCompare(b.key);
      if (keyCompare !== 0) return keyCompare;
      return a.source.localeCompare(b.source);
    }),
    warnings: [...snapshot.warnings].sort(),
  };
}

/**
 * Get a raw fact value by key.
 */
export function getRawFactValue(snapshot: RawFactsSnapshot, key: string): unknown {
  const record = snapshot.records.find((r) => r.key === key);
  return record?.value;
}

/**
 * Get all raw facts from a specific source.
 */
export function getRawFactsBySource(
  snapshot: RawFactsSnapshot,
  source: string,
): RawFactRecord[] {
  return snapshot.records.filter((r) => r.source === source);
}
