import path from "node:path";
import {
  createKernelIdentity,
  createKernelId,
  parseKernelRecord,
  serializeKernelRecord,
  stableKernelList,
  type ChangeHypothesis,
  type KernelChangeClassification,
  type KernelMutation,
  type KernelMutationSource,
  type KernelProvenanceLink,
} from "../kernel/shared-models";

export interface MutationBoundaryInput {
  source: KernelMutationSource;
  summary: string;
  touchedPaths?: string[];
  facts?: string[];
  history?: string[];
  payload?: Record<string, unknown>;
  observedAt?: string;
  ambiguityDebtPrior?: AmbiguityDebtPriorSignal;
}

export interface AmbiguityDebtPriorSignal {
  matchedDebtIds: string[];
  matchedCandidateChangeIds: string[];
  confidenceBoost: number;
  rationale: string[];
}

export interface MutationBoundaryProjection {
  version: 1;
  mutation: KernelMutation;
  hypothesis: ChangeHypothesis;
  classification: KernelChangeClassification;
  confidence: number;
  reasons: string[];
  normalizedFacts: string[];
  candidateChangeIds: string[];
  ambiguityDebtPrior?: AmbiguityDebtPriorSignal;
}

const HARD_AMBIGUITY_PATTERNS = [
  /\bunmapped_mutation\b/i,
  /\bambiguous\b/i,
  /\bneeds?\s+review\b/i,
  /\bunknown\b/i,
  /\bdebt\b/i,
];

export function normalizeMutationBoundary(input: MutationBoundaryInput): MutationBoundaryProjection {
  const observedAt = normalizeObservedAt(input.observedAt);
  const summary = normalizeSummary(input.summary);
  const normalizedTouchedPaths = normalizeStringList(input.touchedPaths, normalizeBoundaryPath);
  const normalizedFacts = normalizeStringList(input.facts, normalizeFact);
  const normalizedHistory = normalizeStringList(input.history, normalizeFact);
  const normalizedPayload = input.payload !== undefined
    ? parseKernelRecord<Record<string, unknown>>(serializeKernelRecord(input.payload))
    : undefined;
  const candidateChangeIds = stableKernelList([
    ...extractMutationCandidateChangeIds({
      summary,
      facts: normalizedFacts,
      history: normalizedHistory,
      payload: normalizedPayload,
    }),
    ...(input.ambiguityDebtPrior?.matchedCandidateChangeIds ?? []),
  ]);

  const touchedPathMatches = normalizedTouchedPaths.filter((touchedPath) =>
    normalizedFacts.some((fact) => fact.includes(touchedPath)) ||
    normalizedHistory.some((entry) => entry.includes(touchedPath)) ||
    summary.includes(path.posix.basename(touchedPath)),
  );
  const hasHardAmbiguity = HARD_AMBIGUITY_PATTERNS.some((pattern) =>
    [summary, ...normalizedFacts, ...normalizedHistory].some((entry) => pattern.test(entry)),
  );

  const sourceArtifactSeed = serializeKernelRecord({
    source: input.source,
    summary,
    touchedPaths: normalizedTouchedPaths,
    facts: normalizedFacts,
    history: normalizedHistory,
    candidateChangeIds,
  });
  const sourceArtifactId = createKernelId("mutation-source", sourceArtifactSeed);

  const mutationSeed = serializeKernelRecord({
    source: input.source,
    summary,
    touchedPaths: normalizedTouchedPaths,
    facts: normalizedFacts,
    history: normalizedHistory,
    candidateChangeIds,
  });
  const confidence = roundConfidence(scoreConfidence({
    source: input.source,
    touchedPaths: normalizedTouchedPaths,
    normalizedFacts,
    normalizedHistory,
    candidateChangeIds,
    hasHardAmbiguity,
    touchedPathMatches,
  }) + (input.ambiguityDebtPrior?.confidenceBoost ?? 0));
  const classification = classifyMutation({
    source: input.source,
    touchedPaths: normalizedTouchedPaths,
    candidateChangeIds,
    confidence,
    hasHardAmbiguity,
    touchedPathMatches,
  });
  const reasons = buildReason({
    source: input.source,
    touchedPaths: normalizedTouchedPaths,
    normalizedFacts,
    normalizedHistory,
    candidateChangeIds,
    confidence,
    classification,
    hasHardAmbiguity,
    touchedPathMatches,
  });
  const priorRationale = input.ambiguityDebtPrior?.rationale ?? [];
  if (priorRationale.length > 0) {
    reasons.push(...priorRationale);
  }

  const mutationId = createKernelId("mutation", mutationSeed);
  const hypothesisId = createKernelId("change-hypothesis", mutationSeed);
  const observationLink = buildObservationLink({
    observedAt,
    sourceArtifactId,
    source: input.source,
    mutationId,
    confidence,
    reason: reasons,
  });
  const hypothesisLink = buildHypothesisLink({
    observedAt,
    mutationId,
    hypothesisId,
    confidence,
    reason: reasons,
  });

  const mutation: KernelMutation = {
    ...createKernelIdentity("mutation", mutationSeed, observedAt),
    source: input.source,
    summary,
    status: "observed",
    path: normalizedTouchedPaths[0],
    confidence,
    reason: reasons.join("; "),
    payload: buildMutationPayload({
      source: input.source,
      summary,
      touchedPaths: normalizedTouchedPaths,
      normalizedFacts,
      normalizedHistory,
      candidateChangeIds,
      classification,
      payload: normalizedPayload,
    }),
    lineage: [observationLink],
  };

  const hypothesis: ChangeHypothesis = {
    ...createKernelIdentity("change-hypothesis", mutationSeed, observedAt),
    mutationId: mutation.id,
    classification,
    status: classification === "derived_change" ? "normalized" : "open",
    summary,
    confidence,
    reasons,
    facts: normalizedFacts,
    policyVersion: undefined,
    candidateChangeIds,
    lineage: [hypothesisLink],
  };

  return {
    version: 1,
    mutation,
    hypothesis,
    classification,
    confidence,
    reasons,
    normalizedFacts,
    candidateChangeIds,
    ambiguityDebtPrior: input.ambiguityDebtPrior,
  };
}

export function extractMutationCandidateChangeIds(input: {
  summary: string;
  facts?: string[];
  history?: string[];
  payload?: Record<string, unknown>;
}): string[] {
  return stableKernelList([
    ...extractChangeIds(input.summary),
    ...extractChangeIds((input.facts ?? []).join(" ")),
    ...extractChangeIds((input.history ?? []).join(" ")),
    ...extractChangeIds(input.payload ? serializeKernelRecord(input.payload) : ""),
  ]);
}

function classifyMutation(input: {
  source: KernelMutationSource;
  touchedPaths: string[];
  candidateChangeIds: string[];
  confidence: number;
  hasHardAmbiguity: boolean;
  touchedPathMatches: string[];
}): KernelChangeClassification {
  if (input.touchedPaths.length === 0) {
    return "unmapped_mutation";
  }

  if (input.source === "git_diff" || input.source === "git_commit") {
    if (!input.hasHardAmbiguity || input.candidateChangeIds.length > 0 || input.touchedPathMatches.length > 0) {
      return "derived_change";
    }
    return "unmapped_mutation";
  }

  if (input.source === "external_patch") {
    if (input.candidateChangeIds.length > 0 || input.touchedPathMatches.length > 0) {
      return "derived_change";
    }
    return "unmapped_mutation";
  }

  if (input.source === "ci_patch" || input.source === "ide_patch" || input.source === "human_patch") {
    if (input.candidateChangeIds.length > 0 && input.confidence >= 0.65) {
      return "derived_change";
    }
    return "unmapped_mutation";
  }

  if (input.source === "unknown") {
    return input.candidateChangeIds.length > 0 && input.confidence >= 0.85 ? "derived_change" : "unmapped_mutation";
  }

  return input.candidateChangeIds.length > 0 && input.confidence >= 0.7 ? "derived_change" : "unmapped_mutation";
}

function scoreConfidence(input: {
  source: KernelMutationSource;
  touchedPaths: string[];
  normalizedFacts: string[];
  normalizedHistory: string[];
  candidateChangeIds: string[];
  hasHardAmbiguity: boolean;
  touchedPathMatches: string[];
}): number {
  const sourceWeights: Record<KernelMutationSource, number> = {
    git_diff: 0.78,
    git_commit: 0.9,
    external_patch: 0.72,
    ci_patch: 0.68,
    ide_patch: 0.58,
    human_patch: 0.76,
    unknown: 0.28,
  };

  let score = sourceWeights[input.source];
  if (input.touchedPaths.length > 0) {
    score += 0.1;
  }
  if (input.normalizedFacts.length > 0) {
    score += Math.min(0.08, input.normalizedFacts.length * 0.02);
  }
  if (input.normalizedHistory.length > 0) {
    score += Math.min(0.05, input.normalizedHistory.length * 0.01);
  }
  if (input.candidateChangeIds.length > 0) {
    score += 0.18;
  }
  if (input.touchedPathMatches.length > 0) {
    score += 0.08;
  }
  if (input.hasHardAmbiguity) {
    score -= 0.3;
  }
  return Math.max(0, Math.min(1, score));
}

function buildReason(input: {
  source: KernelMutationSource;
  touchedPaths: string[];
  normalizedFacts: string[];
  normalizedHistory: string[];
  candidateChangeIds: string[];
  confidence: number;
  classification: KernelChangeClassification;
  hasHardAmbiguity: boolean;
  touchedPathMatches: string[];
}): string[] {
  const reasons: string[] = [];
  reasons.push(`source ${input.source} normalized as ${input.classification}`);

  if (input.touchedPaths.length > 0) {
    reasons.push(`touched paths: ${input.touchedPaths.join(", ")}`);
  } else {
    reasons.push("no touched paths supplied");
  }

  if (input.touchedPathMatches.length > 0) {
    reasons.push(`facts align with touched paths: ${input.touchedPathMatches.join(", ")}`);
  }

  if (input.candidateChangeIds.length > 0) {
    reasons.push(`candidate change ids: ${input.candidateChangeIds.join(", ")}`);
  }

  if (input.normalizedFacts.length > 0) {
    reasons.push(`normalized facts: ${input.normalizedFacts.slice(0, 4).join("; ")}`);
  }

  if (input.normalizedHistory.length > 0) {
    reasons.push(`history hints: ${input.normalizedHistory.slice(0, 4).join("; ")}`);
  }

  if (input.hasHardAmbiguity) {
    reasons.push("ambiguous semantic signals retained");
  }

  reasons.push(`confidence ${input.confidence.toFixed(4)}`);

  if (input.classification === "derived_change") {
    reasons.push("mutation can be projected into change space without auto-adopt");
  } else {
    reasons.push("mutation lacks enough canonical evidence to become a derived change");
  }

  return reasons;
}

function buildObservationLink(input: {
  observedAt: Date;
  sourceArtifactId: string;
  source: KernelMutationSource;
  mutationId: string;
  confidence: number;
  reason: string[];
}): KernelProvenanceLink {
  return {
    ...createKernelIdentity("lineage", `${input.sourceArtifactId}|${input.mutationId}`, input.observedAt),
    sourceId: input.sourceArtifactId,
    sourceKind: input.source,
    targetId: input.mutationId,
    targetKind: "mutation",
    relationship: "observed_from",
    confidence: input.confidence,
    reason: input.reason.join("; "),
  };
}

function buildHypothesisLink(input: {
  observedAt: Date;
  mutationId: string;
  hypothesisId: string;
  confidence: number;
  reason: string[];
}): KernelProvenanceLink {
  return {
    ...createKernelIdentity("lineage", `${input.mutationId}|${input.hypothesisId}`, input.observedAt),
    sourceId: input.mutationId,
    sourceKind: "mutation",
    targetId: input.hypothesisId,
    targetKind: "change_hypothesis",
    relationship: "normalized_from",
    confidence: input.confidence,
    reason: input.reason.join("; "),
  };
}

function buildMutationPayload(input: {
  source: KernelMutationSource;
  summary: string;
  touchedPaths: string[];
  normalizedFacts: string[];
  normalizedHistory: string[];
  candidateChangeIds: string[];
  classification: KernelChangeClassification;
  payload?: Record<string, unknown>;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    source: input.source,
    summary: input.summary,
    touchedPaths: input.touchedPaths,
    facts: input.normalizedFacts,
    history: input.normalizedHistory,
    candidateChangeIds: input.candidateChangeIds,
    classification: input.classification,
  };

  if (input.payload) {
    payload.sourcePayload = input.payload;
  }

  return payload;
}

function extractChangeIds(value: string): string[] {
  const ids: string[] = [];
  const tokenPatterns = [
    /\b(?:chg|change|session|delta)-[a-z0-9][a-z0-9_-]{2,}\b/gi,
    /\bchange[_-]?id[:=]\s*([a-z0-9][a-z0-9_-]{2,})/gi,
    /\bsession[_-]?id[:=]\s*([a-z0-9][a-z0-9_-]{2,})/gi,
  ];

  for (const pattern of tokenPatterns) {
    for (const match of value.matchAll(pattern)) {
      const token = match[1] ?? match[0];
      ids.push(normalizeChangeId(token));
    }
  }

  return ids;
}

function normalizeChangeId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-");
}

function normalizeSummary(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeFact(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\s+/g, " ");
}

function normalizeBoundaryPath(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/");
  const cleaned = path.posix.normalize(normalized);
  if (cleaned === "." || cleaned === "..") {
    return normalized;
  }

  return cleaned.replace(/^\.\//, "");
}

function normalizeStringList(
  values: string[] | undefined,
  normalizer: (value: string) => string,
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return stableKernelList(
    values
      .map((value) => normalizer(value))
      .filter((value) => value.length > 0),
  );
}

function normalizeObservedAt(value: string | undefined): Date {
  if (!value) {
    return new Date("1970-01-01T00:00:00.000Z");
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date("1970-01-01T00:00:00.000Z") : parsed;
}

function roundConfidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}
