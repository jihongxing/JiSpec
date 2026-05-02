import path from "node:path";

export interface ReplayMetadata {
  version: 1;
  replayable: boolean;
  source: string;
  sourceSession?: string;
  sourceArtifact?: string;
  inputArtifacts: string[];
  commands: Record<string, string>;
  actor?: string;
  reason?: string;
  previousOutcome?: string;
  nextHumanAction: string;
}

export function normalizeReplayPath(root: string, candidate: string | undefined): string | undefined {
  if (!candidate) {
    return undefined;
  }

  const normalizedCandidate = candidate.replace(/\\/g, "/");
  if (path.isAbsolute(candidate)) {
    const relative = path.relative(root, candidate).replace(/\\/g, "/");
    if (!relative.startsWith("../") && relative !== ".." && !path.isAbsolute(relative)) {
      return relative;
    }
    return normalizedCandidate;
  }

  return normalizedCandidate.replace(/^\.\//, "");
}

export function normalizeReplayPaths(root: string, candidates: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const candidate of candidates) {
    const value = normalizeReplayPath(root, candidate);
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }

  return normalized.sort((left, right) => left.localeCompare(right));
}
