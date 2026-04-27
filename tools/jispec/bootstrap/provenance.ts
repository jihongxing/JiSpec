import { normalizeEvidencePath } from "./evidence-graph";

export interface ProvenanceNote {
  paths: string[];
  note: string;
}

export function normalizeProvenancePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map((value) => normalizeEvidencePath(value)))).sort((left, right) =>
    left.localeCompare(right),
  );
}

export function buildProvenanceNote(paths: string[], note: string): ProvenanceNote {
  return {
    paths: normalizeProvenancePaths(paths),
    note,
  };
}
