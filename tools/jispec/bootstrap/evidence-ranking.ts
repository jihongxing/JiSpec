import path from "node:path";
import {
  getEvidenceConfidenceScore,
  normalizeEvidencePath,
  summarizeEvidenceGraph,
  type BootstrapDiscoverSummary,
  type EvidenceDocument,
  type EvidenceGraph,
  type EvidenceManifest,
  type EvidenceMigration,
  type EvidenceRoute,
  type EvidenceSchema,
  type EvidenceSourceFile,
  type EvidenceTest,
} from "./evidence-graph";
import { extractBusinessVocabularyFromDocuments, getBusinessVocabularyLabels } from "./business-vocabulary";
import { hasBusinessBoundarySignal, hasTechnicalBoundaryToken } from "./domain-boundary-policy";
import {
  loadDomainTaxonomyPacksFromRoot,
  scoreDomainTaxonomyEvidence,
  type DomainTaxonomyPack,
} from "./domain-taxonomy";
import {
  inferEvidenceProvenanceDescriptor,
  type EvidenceOwnerReviewPosture,
  type EvidenceProvenanceLabel,
} from "../provenance/evidence-provenance";

export type AdoptionEvidenceKind =
  | "route"
  | "schema"
  | "document"
  | "manifest"
  | "test"
  | "migration"
  | "source";

export type AdoptionRankTier = "adoption_ready" | "owner_review";

export interface BootstrapFullInventory {
  version: 1;
  repoRoot: string;
  generatedAt: string;
  summary: BootstrapDiscoverSummary;
  files: EvidenceSourceFile[];
  excludedSummary: NonNullable<EvidenceGraph["excludedSummary"]>;
}

export interface AdoptionRankedEvidenceEntry {
  rank: number;
  kind: AdoptionEvidenceKind;
  path: string;
  score: number;
  reason: string;
  source: string;
  confidenceScore?: number;
  rankTier: AdoptionRankTier;
  provenanceLabel: EvidenceProvenanceLabel;
  evidenceKind: AdoptionEvidenceKind;
  sourcePath: string;
  confidence: number | null;
  ownerReviewPosture: EvidenceOwnerReviewPosture;
  sourceFiles: string[];
  metadata?: Record<string, unknown>;
}

export interface AdoptionRankedEvidence {
  version: 1;
  repoRoot: string;
  generatedAt: string;
  summary: {
    candidateCount: number;
    selectedCount: number;
    topScore: number;
    adoptionReadyCount: number;
    ownerReviewCount: number;
    topAdoptionReadyPath?: string;
    topAdoptionReadyScore?: number;
    topOwnerReviewPath?: string;
    topOwnerReviewScore?: number;
  };
  evidence: AdoptionRankedEvidenceEntry[];
  excludedSummary: NonNullable<EvidenceGraph["excludedSummary"]>;
}

export type AdoptionBoundarySignal =
  | "governance_document"
  | "protocol_document"
  | "schema_truth_source"
  | "explicit_endpoint"
  | "service_entrypoint"
  | "module_surface_inference"
  | "weak_candidate"
  | "runtime_manifest"
  | "supporting_evidence";

interface UnrankedAdoptionEvidenceEntry extends Omit<
  AdoptionRankedEvidenceEntry,
  "rank" | "rankTier" | "provenanceLabel" | "evidenceKind" | "sourcePath" | "confidence" | "ownerReviewPosture"
> {
  stableKey: string;
}

interface RankedAdoptionCandidate extends UnrankedAdoptionEvidenceEntry {
  rankTier: AdoptionRankTier;
  priorityScore: number;
}

export interface EvidenceAssetScoreInput {
  kind: AdoptionEvidenceKind;
  path: string;
  confidenceScore?: number;
  documentKind?: EvidenceDocument["kind"];
  schemaFormat?: EvidenceSchema["format"];
  routeMethod?: string;
  routeSignal?: EvidenceRoute["signal"];
  manifestKind?: EvidenceManifest["kind"];
  testFrameworkHint?: string;
  migrationToolHint?: string;
  sourceCategory?: EvidenceSourceFile["category"];
  taxonomyPacks?: DomainTaxonomyPack[];
}

export interface EvidenceAssetScore {
  score: number;
  reasons: string[];
}

export function buildBootstrapFullInventory(graph: EvidenceGraph): BootstrapFullInventory {
  return {
    version: 1,
    repoRoot: normalizeEvidencePath(graph.repoRoot),
    generatedAt: graph.generatedAt,
    summary: summarizeEvidenceGraph(graph),
    files: [...(graph.sourceFiles ?? [])].sort((left, right) => `${left.path}|${left.category}`.localeCompare(`${right.path}|${right.category}`)),
    excludedSummary: normalizeExcludedSummary(graph.excludedSummary),
  };
}

export function buildAdoptionRankedEvidence(
  graph: EvidenceGraph,
  options: { limit?: number; taxonomyPacks?: DomainTaxonomyPack[] } = {},
): AdoptionRankedEvidence {
  const limit = Math.max(1, Math.trunc(options.limit ?? 20));
  const taxonomyPacks = options.taxonomyPacks ?? loadDomainTaxonomyPacksFromRoot(graph.repoRoot);
  const candidates = collectAdoptionCandidates(graph, taxonomyPacks);
  const annotated = candidates.map((entry) => {
    const rankTier = classifyAdoptionRankTier(entry);
    const priorityScore = Number((entry.score + rankTierPriorityBoost(rankTier)).toFixed(4));
    return {
      ...entry,
      rankTier,
      priorityScore,
    };
  });
  const ranked = annotated
    .sort((left, right) => {
      const priorityDelta = right.priorityScore - left.priorityScore;
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return left.stableKey.localeCompare(right.stableKey);
    })
    .slice(0, limit)
    .map((entry, index) => {
      const boundarySignal = typeof entry.metadata?.boundarySignal === "string"
        ? entry.metadata.boundarySignal
        : undefined;
      const descriptor = inferEvidenceProvenanceDescriptor({
        confidence: entry.confidenceScore,
        evidenceKind: entry.kind,
        sourcePath: entry.path,
        ownerReviewRequired: boundarySignal === "weak_candidate",
        ambiguous: boundarySignal === "weak_candidate",
      });

      return {
        rank: index + 1,
        kind: entry.kind,
        path: entry.path,
        score: entry.score,
        reason: entry.reason,
        source: entry.source,
        confidenceScore: entry.confidenceScore,
        rankTier: entry.rankTier,
        ...descriptor,
        evidenceKind: entry.kind,
        sourceFiles: [...entry.sourceFiles].sort((left, right) => left.localeCompare(right)),
        metadata: entry.metadata,
      };
    });

  const adoptionReadyCount = annotated.filter((entry) => entry.rankTier === "adoption_ready").length;
  const ownerReviewCount = annotated.length - adoptionReadyCount;
  const topAdoptionReady = ranked.find((entry) => entry.rankTier === "adoption_ready");
  const topOwnerReview = ranked.find((entry) => entry.rankTier === "owner_review");

  return {
    version: 1,
    repoRoot: normalizeEvidencePath(graph.repoRoot),
    generatedAt: graph.generatedAt,
    summary: {
      candidateCount: candidates.length,
      selectedCount: ranked.length,
      topScore: ranked[0]?.score ?? 0,
      adoptionReadyCount,
      ownerReviewCount,
      topAdoptionReadyPath: topAdoptionReady?.path,
      topAdoptionReadyScore: topAdoptionReady?.score,
      topOwnerReviewPath: topOwnerReview?.path,
      topOwnerReviewScore: topOwnerReview?.score,
    },
    evidence: ranked,
    excludedSummary: normalizeExcludedSummary(graph.excludedSummary),
  };
}

export function renderAdoptionRankedEvidenceLines(ranked: AdoptionRankedEvidence, limit = 10): string[] {
  return ranked.evidence.slice(0, limit).map((entry) => {
    const sourceFiles = entry.sourceFiles.length > 0 ? ` from ${entry.sourceFiles.slice(0, 2).join(", ")}` : "";
    return `#${entry.rank} ${entry.kind} ${entry.path} (${entry.score}): ${entry.reason}${sourceFiles}`;
  });
}

export interface AdoptionRankedEvidenceView {
  adoptionReadyCount: number;
  ownerReviewCount: number;
  topAdoptionReady: AdoptionRankedEvidenceEntry[];
  topOwnerReview: AdoptionRankedEvidenceEntry[];
  topRanked: AdoptionRankedEvidenceEntry[];
}

export interface AdoptionRankedEvidenceRenderOptions {
  adoptionReadyLimit?: number;
  ownerReviewLimit?: number;
  rankedLimit?: number;
}

export function summarizeAdoptionRankedEvidence(
  ranked: AdoptionRankedEvidence,
  options: AdoptionRankedEvidenceRenderOptions = {},
): AdoptionRankedEvidenceView {
  const adoptionReadyLimit = Math.max(1, Math.trunc(options.adoptionReadyLimit ?? 5));
  const ownerReviewLimit = Math.max(1, Math.trunc(options.ownerReviewLimit ?? 5));
  const rankedLimit = Math.max(1, Math.trunc(options.rankedLimit ?? 10));

  const topRanked = ranked.evidence.slice(0, rankedLimit);
  const topAdoptionReady = ranked.evidence.filter((entry) => entry.rankTier === "adoption_ready").slice(0, adoptionReadyLimit);
  const topOwnerReview = ranked.evidence.filter((entry) => entry.rankTier === "owner_review").slice(0, ownerReviewLimit);

  return {
    adoptionReadyCount: ranked.summary.adoptionReadyCount,
    ownerReviewCount: ranked.summary.ownerReviewCount,
    topAdoptionReady,
    topOwnerReview,
    topRanked,
  };
}

export function renderAdoptionRankedEvidenceSections(
  ranked: AdoptionRankedEvidence,
  options: AdoptionRankedEvidenceRenderOptions = {},
): string[] {
  const view = summarizeAdoptionRankedEvidence(ranked, options);
  const lines: string[] = [
    `Takeover priority: ${view.adoptionReadyCount} adoption-ready, ${view.ownerReviewCount} owner-review candidate(s)`,
  ];

  if (view.topAdoptionReady.length > 0) {
    lines.push("Top adoption-ready evidence:");
    lines.push(...view.topAdoptionReady.map((entry) => `- ${formatAdoptionRankedEvidenceEntry(entry, true)}`));
  }

  if (view.topOwnerReview.length > 0) {
    lines.push("Owner-review evidence:");
    lines.push(...view.topOwnerReview.map((entry) => `- ${formatAdoptionRankedEvidenceEntry(entry, true)}`));
  }

  if (view.topRanked.length > 0) {
    lines.push("Top adoption-ranked evidence:");
    lines.push(...view.topRanked.map((entry) => `- ${formatAdoptionRankedEvidenceEntry(entry)}`));
  }

  return lines;
}

export function scoreEvidenceAsset(input: EvidenceAssetScoreInput): EvidenceAssetScore {
  const normalizedPath = normalizeEvidencePath(input.path);
  const lowerPath = normalizedPath.toLowerCase();
  const fileName = path.basename(lowerPath);
  const confidence = typeof input.confidenceScore === "number" ? input.confidenceScore : 0.5;
  const reasons: string[] = [];
  let score = 20 + confidence * 40;

  if (input.kind === "document") {
    score += 34;
    reasons.push(`${input.documentKind ?? "unknown"} document`);
    if (fileName === "readme.md" || /^readme(?:\..+)?\.mdx?$/.test(fileName)) {
      score += normalizedPath.includes("/") ? 18 : 32;
      reasons.push(normalizedPath.includes("/") ? "component README" : "repository README");
    }
    if (isContractLikeDocumentationPath(lowerPath)) {
      score += 24;
      reasons.push("contract-oriented documentation path");
    }
    if (isGovernanceOrProtocolDocumentationPath(lowerPath)) {
      score += 28;
      reasons.push("governance or protocol boundary document");
    }
    if (input.documentKind === "architecture" || input.documentKind === "contract" || input.documentKind === "context") {
      score += 18;
      reasons.push("contract boundary support");
    }
  } else if (input.kind === "schema") {
    score += 42;
    reasons.push(`${input.schemaFormat ?? "unknown"} schema`);
    if (input.schemaFormat === "protobuf") {
      score += 40;
      reasons.push("protocol truth source");
    } else if (input.schemaFormat === "openapi") {
      score += 38;
      reasons.push("API contract truth source");
    } else if (input.schemaFormat === "graphql") {
      score += 34;
      reasons.push("GraphQL contract source");
    } else if (input.schemaFormat === "database-schema") {
      score += 34;
      reasons.push("database schema truth source");
    } else if (input.schemaFormat === "json-schema") {
      score += 24;
      reasons.push("structured DTO contract");
    }
    if (lowerPath.startsWith("schemas/") || lowerPath.includes("/schemas/")) {
      score += 10;
      reasons.push("schema directory");
    }
    if (["protobuf", "openapi", "graphql", "database-schema"].includes(input.schemaFormat ?? "")) {
      score += 18;
      reasons.push("schema truth source boundary");
    }
  } else if (input.kind === "route") {
    score += input.routeSignal === "http_signature" ? 32 : 10;
    reasons.push(input.routeSignal === "http_signature" ? "explicit HTTP signature" : "route-like module");
    if (input.routeMethod) {
      score += 10;
      reasons.push(`${input.routeMethod} method`);
      if (["POST", "PUT", "PATCH", "DELETE"].includes(input.routeMethod.toUpperCase())) {
        score += 10;
        reasons.push("state-changing endpoint");
      }
    }
    if (normalizedPath.startsWith("/")) {
      score += 6;
    }
    if (input.routeSignal === "http_signature") {
      score += 12;
      reasons.push("explicit endpoint boundary");
    } else {
      score -= 18;
      reasons.push("weak route candidate");
    }
    if (isInfrastructureRoute(normalizedPath)) {
      score -= 24;
      reasons.push("infrastructure endpoint");
    }
  } else if (input.kind === "manifest") {
    score += 16;
    reasons.push(`${input.manifestKind ?? "unknown"} manifest`);
    if (!normalizedPath.includes("/")) {
      score += 16;
      reasons.push("repository-level runtime manifest");
    }
    if (["package-json", "pyproject", "go-mod", "cargo", "pom"].includes(input.manifestKind ?? "")) {
      score += 10;
      reasons.push("runtime/toolchain signal");
    }
    if (["pnpm-workspace", "nx", "turbo", "lerna", "rush"].includes(input.manifestKind ?? "")) {
      score += 14;
      reasons.push("monorepo topology signal");
    }
  } else if (input.kind === "migration") {
    score += 18;
    reasons.push("database migration signal");
    if (input.migrationToolHint) {
      score += 8;
      reasons.push(`${input.migrationToolHint} migration`);
    }
  } else if (input.kind === "test") {
    score += 8;
    reasons.push(`${input.testFrameworkHint ?? "unknown"} test evidence`);
    if (input.testFrameworkHint === "gherkin" || input.testFrameworkHint === "jispec") {
      score += 22;
      reasons.push("behavior contract support");
    }
    if (lowerPath.startsWith("tests/")) {
      score += 6;
      reasons.push("top-level test asset");
    }
  } else if (input.kind === "source") {
    const categoryScores: Record<EvidenceSourceFile["category"], number> = {
      interface: 82,
      trait: 82,
      entrypoint: 76,
      sdk: 70,
      controller: 66,
      service: 62,
      route: 58,
      schema: 48,
      migration: 42,
      feature: 40,
      test: 22,
      document: 20,
      manifest: 18,
      other: 0,
    };
    score += categoryScores[input.sourceCategory ?? "other"];
    reasons.push(`${input.sourceCategory ?? "other"} source inventory`);
    if (lowerPath.startsWith("src/") || lowerPath.startsWith("app/") || lowerPath.startsWith("cmd/")) {
      score += 8;
      reasons.push("application source path");
    }
    if (input.sourceCategory === "entrypoint") {
      score += 24;
      reasons.push("service entrypoint boundary");
    } else if (input.sourceCategory === "controller" || input.sourceCategory === "service" || input.sourceCategory === "route") {
      score += 16;
      reasons.push("module surface boundary");
    } else if (input.sourceCategory === "interface" || input.sourceCategory === "trait" || input.sourceCategory === "sdk") {
      score += 10;
      reasons.push("public module contract surface");
    }
  }

  if (isGeneratedOrStub(lowerPath)) {
    score -= 36;
    reasons.push("generated or stub-like asset");
  }
  if (isExampleOrFixture(lowerPath)) {
    score -= 28;
    reasons.push("example or fixture asset");
  }
  if (isThirdPartyLike(lowerPath)) {
    score -= 80;
    reasons.push("third-party or audit mirror asset");
  }
  if (hasTechnicalBoundaryToken(normalizedPath)) {
    if (hasBusinessBoundarySignal(normalizedPath)) {
      score -= 6;
      reasons.push("technical boundary label treated as supporting evidence");
    } else {
      score -= 22;
      reasons.push("technical boundary without business object");
    }
  }
  const taxonomyBoost = scoreDomainTaxonomyEvidence(normalizedPath, input.taxonomyPacks ?? []);
  if (taxonomyBoost.score > 0) {
    score += taxonomyBoost.score;
    reasons.push(...taxonomyBoost.reasons);
  }

  return {
    score: Number(Math.max(0, score).toFixed(4)),
    reasons,
  };
}

function classifyAdoptionRankTier(entry: UnrankedAdoptionEvidenceEntry): AdoptionRankTier {
  const boundarySignal = typeof entry.metadata?.boundarySignal === "string"
    ? (entry.metadata.boundarySignal as AdoptionBoundarySignal)
    : undefined;

  if (
    boundarySignal === "governance_document" ||
    boundarySignal === "protocol_document" ||
    boundarySignal === "schema_truth_source" ||
    boundarySignal === "explicit_endpoint" ||
    boundarySignal === "service_entrypoint" ||
    boundarySignal === "runtime_manifest"
  ) {
    return "adoption_ready";
  }

  return "owner_review";
}

function rankTierPriorityBoost(rankTier: AdoptionRankTier): number {
  return rankTier === "adoption_ready" ? 7 : 0;
}

function formatAdoptionRankedEvidenceEntry(entry: AdoptionRankedEvidenceEntry, includeRankTier = false): string {
  const sourceFiles = entry.sourceFiles.length > 0 ? ` from ${entry.sourceFiles.slice(0, 2).join(", ")}` : "";
  const tier = includeRankTier ? ` [${entry.rankTier}]` : "";
  return `#${entry.rank}${tier} ${entry.kind} ${entry.path} (${entry.score}): ${entry.reason}${sourceFiles}`;
}

function collectAdoptionCandidates(graph: EvidenceGraph, taxonomyPacks: DomainTaxonomyPack[]): UnrankedAdoptionEvidenceEntry[] {
  const candidates: UnrankedAdoptionEvidenceEntry[] = [];

  for (const document of graph.documents ?? []) {
    candidates.push(documentToEvidence(graph, document, taxonomyPacks));
  }
  for (const schema of graph.schemas ?? []) {
    candidates.push(schemaToEvidence(schema, taxonomyPacks));
  }
  for (const route of graph.routes ?? []) {
    candidates.push(routeToEvidence(route, taxonomyPacks));
  }
  for (const manifest of graph.manifests ?? []) {
    candidates.push(manifestToEvidence(manifest, taxonomyPacks));
  }
  for (const migration of graph.migrations ?? []) {
    candidates.push(migrationToEvidence(migration, taxonomyPacks));
  }
  for (const test of graph.tests ?? []) {
    candidates.push(testToEvidence(test, taxonomyPacks));
  }

  const strongSignalPaths = new Set(
    candidates.flatMap((candidate) => [candidate.path, ...candidate.sourceFiles]).map((entry) => normalizeEvidencePath(entry)),
  );
  for (const sourceFile of graph.sourceFiles ?? []) {
    if (strongSignalPaths.has(sourceFile.path) || !isTakeoverRelevantSource(sourceFile)) {
      continue;
    }
    candidates.push(sourceFileToEvidence(sourceFile, taxonomyPacks));
  }

  return candidates.map((candidate) => ({
    ...candidate,
    score: Number(candidate.score.toFixed(4)),
  }));
}

function documentToEvidence(
  graph: EvidenceGraph,
  document: EvidenceDocument,
  taxonomyPacks: DomainTaxonomyPack[],
): UnrankedAdoptionEvidenceEntry {
  const scored = scoreEvidenceAsset({
    kind: "document",
    path: document.path,
    confidenceScore: getEvidenceConfidenceScore(document),
    documentKind: document.kind,
    taxonomyPacks,
  });
  const vocabularyTerms = extractBusinessVocabularyFromDocuments(graph, [document], { limit: 8, taxonomyPacks });
  const vocabularyLabels = getBusinessVocabularyLabels(vocabularyTerms, 6);
  const vocabularyBoost = Math.min(vocabularyTerms.reduce((sum, term) => sum + term.score, 0) / 12, 42);
  const score = Number((scored.score + vocabularyBoost).toFixed(4));
  const reasons = [...scored.reasons];
  if (vocabularyLabels.length > 0) {
    reasons.push(`business vocabulary: ${vocabularyLabels.join(", ")}`);
  }
  const taxonomyPackIds = [...new Set(vocabularyTerms.map((term) => term.taxonomyPackId).filter((id): id is string => Boolean(id)))];
  if (taxonomyPackIds.length > 0) {
    reasons.push(`taxonomy packs: ${taxonomyPackIds.join(", ")}`);
  }

  return {
    stableKey: `document:${document.path}`,
    kind: "document",
    path: document.path,
    score,
    reason: reasons.join(", "),
    source: "bootstrap.documents",
    confidenceScore: getEvidenceConfidenceScore(document),
    sourceFiles: [document.path],
    metadata: {
      documentKind: document.kind,
      boundarySignal: classifyDocumentBoundarySignal(document.path),
      businessVocabulary: vocabularyTerms.map((term) => ({
        label: term.label,
        phrase: term.phrase,
        language: term.language,
        score: term.score,
        taxonomyPackId: term.taxonomyPackId,
      })),
      provenanceNote: document.provenanceNote,
    },
  };
}

function schemaToEvidence(schema: EvidenceSchema, taxonomyPacks: DomainTaxonomyPack[]): UnrankedAdoptionEvidenceEntry {
  const scored = scoreEvidenceAsset({
    kind: "schema",
    path: schema.path,
    confidenceScore: getEvidenceConfidenceScore(schema),
    schemaFormat: schema.format,
    taxonomyPacks,
  });

  return {
    stableKey: `schema:${schema.path}`,
    kind: "schema",
    path: schema.path,
    score: scored.score,
    reason: scored.reasons.join(", "),
    source: "bootstrap.schemas",
    confidenceScore: getEvidenceConfidenceScore(schema),
    sourceFiles: [schema.path],
    metadata: {
      schemaFormat: schema.format,
      signal: schema.signal,
      boundarySignal: classifySchemaBoundarySignal(schema),
      contractSourceAdapter: schema.format === "openapi" || schema.format === "protobuf" || schema.format === "graphql" || schema.format === "database-schema"
        ? schema.format
        : undefined,
      provenanceNote: schema.provenanceNote,
    },
  };
}

function routeToEvidence(route: EvidenceRoute, taxonomyPacks: DomainTaxonomyPack[]): UnrankedAdoptionEvidenceEntry {
  const scored = scoreEvidenceAsset({
    kind: "route",
    path: route.path,
    confidenceScore: getEvidenceConfidenceScore(route),
    routeMethod: route.method,
    routeSignal: route.signal,
    taxonomyPacks,
  });

  return {
    stableKey: `route:${route.method ?? ""}:${route.path}:${route.sourceFiles.join(",")}`,
    kind: "route",
    path: route.path,
    score: scored.score,
    reason: scored.reasons.join(", "),
    source: "bootstrap.routes",
    confidenceScore: getEvidenceConfidenceScore(route),
    sourceFiles: route.sourceFiles,
    metadata: {
      method: route.method,
      signal: route.signal,
      boundarySignal: classifyRouteBoundarySignal(route),
      provenanceNote: route.provenanceNote,
    },
  };
}

function manifestToEvidence(manifest: EvidenceManifest, taxonomyPacks: DomainTaxonomyPack[]): UnrankedAdoptionEvidenceEntry {
  const scored = scoreEvidenceAsset({
    kind: "manifest",
    path: manifest.path,
    confidenceScore: getEvidenceConfidenceScore(manifest),
    manifestKind: manifest.kind,
    taxonomyPacks,
  });

  return {
    stableKey: `manifest:${manifest.path}`,
    kind: "manifest",
    path: manifest.path,
    score: scored.score,
    reason: scored.reasons.join(", "),
    source: "bootstrap.manifests",
    confidenceScore: getEvidenceConfidenceScore(manifest),
    sourceFiles: [manifest.path],
    metadata: {
      manifestKind: manifest.kind,
      boundarySignal: ["pnpm-workspace", "nx", "turbo", "lerna", "rush"].includes(manifest.kind) ? "supporting_evidence" : "runtime_manifest",
      contractSourceAdapter: ["pnpm-workspace", "nx", "turbo", "lerna", "rush"].includes(manifest.kind) ? "monorepo_manifest" : undefined,
      provenanceNote: manifest.provenanceNote,
    },
  };
}

function migrationToEvidence(migration: EvidenceMigration, taxonomyPacks: DomainTaxonomyPack[]): UnrankedAdoptionEvidenceEntry {
  const scored = scoreEvidenceAsset({
    kind: "migration",
    path: migration.path,
    confidenceScore: getEvidenceConfidenceScore(migration),
    migrationToolHint: migration.toolHint,
    taxonomyPacks,
  });

  return {
    stableKey: `migration:${migration.path}`,
    kind: "migration",
    path: migration.path,
    score: scored.score,
    reason: scored.reasons.join(", "),
    source: "bootstrap.migrations",
    confidenceScore: getEvidenceConfidenceScore(migration),
    sourceFiles: [migration.path],
    metadata: {
      toolHint: migration.toolHint,
      signal: migration.signal,
      boundarySignal: "supporting_evidence",
      provenanceNote: migration.provenanceNote,
    },
  };
}

function testToEvidence(test: EvidenceTest, taxonomyPacks: DomainTaxonomyPack[]): UnrankedAdoptionEvidenceEntry {
  const scored = scoreEvidenceAsset({
    kind: "test",
    path: test.path,
    confidenceScore: getEvidenceConfidenceScore(test),
    testFrameworkHint: test.frameworkHint,
    taxonomyPacks,
  });

  return {
    stableKey: `test:${test.path}`,
    kind: "test",
    path: test.path,
    score: scored.score,
    reason: scored.reasons.join(", "),
    source: "bootstrap.tests",
    confidenceScore: getEvidenceConfidenceScore(test),
    sourceFiles: [test.path],
    metadata: {
      frameworkHint: test.frameworkHint,
      signal: test.signal,
      boundarySignal: "supporting_evidence",
      provenanceNote: test.provenanceNote,
    },
  };
}

function sourceFileToEvidence(
  sourceFile: EvidenceSourceFile,
  taxonomyPacks: DomainTaxonomyPack[],
): UnrankedAdoptionEvidenceEntry {
  const scored = scoreEvidenceAsset({
    kind: "source",
    path: sourceFile.path,
    confidenceScore: 0.68,
    sourceCategory: sourceFile.category,
    taxonomyPacks,
  });

  return {
    stableKey: `source:${sourceFile.path}`,
    kind: "source",
    path: sourceFile.path,
    score: scored.score,
    reason: scored.reasons.join(", "),
    source: "bootstrap.sourceFiles",
    confidenceScore: 0.68,
    sourceFiles: [sourceFile.path],
    metadata: {
      sourceCategory: sourceFile.category,
      boundarySignal: classifySourceBoundarySignal(sourceFile),
    },
  };
}

function isTakeoverRelevantSource(sourceFile: EvidenceSourceFile): boolean {
  return (
    sourceFile.category === "controller" ||
    sourceFile.category === "service" ||
    sourceFile.category === "route" ||
    sourceFile.category === "interface" ||
    sourceFile.category === "trait" ||
    sourceFile.category === "entrypoint" ||
    sourceFile.category === "sdk"
  );
}

function isInfrastructureRoute(routePath: string): boolean {
  const normalized = routePath.toLowerCase();
  return (
    normalized === "/health" ||
    normalized === "/healthz" ||
    normalized === "/ready" ||
    normalized === "/readiness" ||
    normalized === "/live" ||
    normalized === "/liveness" ||
    normalized === "/metrics" ||
    normalized === "/ping" ||
    normalized === "/status"
  );
}

function isContractLikeDocumentationPath(lowerPath: string): boolean {
  const segments = lowerPath.split("/");
  return segments.some((segment) =>
    [
      "adr",
      "adrs",
      "architecture",
      "architectures",
      "contract",
      "contracts",
      "decision",
      "decisions",
      "design",
      "designs",
      "requirement",
      "requirements",
      "spec",
      "specs",
    ].includes(segment),
  );
}

function isGovernanceOrProtocolDocumentationPath(lowerPath: string): boolean {
  const segments = lowerPath.split("/");
  return segments.some((segment) =>
    [
      "governance",
      "governance-docs",
      "policy",
      "policies",
      "protocol",
      "protocols",
      "api-contracts",
      "contracts",
    ].includes(segment),
  );
}

function classifyDocumentBoundarySignal(documentPath: string): AdoptionBoundarySignal {
  const lowerPath = normalizeEvidencePath(documentPath).toLowerCase();
  if (lowerPath.includes("protocol")) {
    return "protocol_document";
  }
  if (lowerPath.includes("governance") || lowerPath.includes("policy") || lowerPath.includes("contract")) {
    return "governance_document";
  }
  return "supporting_evidence";
}

function classifySchemaBoundarySignal(schema: EvidenceSchema): AdoptionBoundarySignal {
  if (["protobuf", "openapi", "graphql", "database-schema", "json-schema"].includes(schema.format)) {
    return "schema_truth_source";
  }
  return "supporting_evidence";
}

function classifyRouteBoundarySignal(route: EvidenceRoute): AdoptionBoundarySignal {
  return route.signal === "http_signature" ? "explicit_endpoint" : "weak_candidate";
}

function classifySourceBoundarySignal(sourceFile: EvidenceSourceFile): AdoptionBoundarySignal {
  if (sourceFile.category === "entrypoint") {
    return "service_entrypoint";
  }
  if (sourceFile.category === "controller" || sourceFile.category === "service" || sourceFile.category === "route") {
    return "module_surface_inference";
  }
  if (sourceFile.category === "interface" || sourceFile.category === "trait" || sourceFile.category === "sdk") {
    return "module_surface_inference";
  }
  return "supporting_evidence";
}

function normalizeExcludedSummary(summary: EvidenceGraph["excludedSummary"]): NonNullable<EvidenceGraph["excludedSummary"]> {
  if (!summary) {
    return {
      totalExcludedFileCount: 0,
      rules: [],
    };
  }

  return {
    totalExcludedFileCount: summary.totalExcludedFileCount,
    rules: [...summary.rules].map((rule) => ({
      ruleId: rule.ruleId,
      reason: rule.reason,
      optInHint: rule.optInHint,
      fileCount: rule.fileCount,
      examplePaths: [...rule.examplePaths].sort((left, right) => left.localeCompare(right)),
    })),
  };
}

function isGeneratedOrStub(lowerPath: string): boolean {
  const fileName = path.basename(lowerPath);
  return (
    lowerPath.includes("/generated/") ||
    lowerPath.includes("/__generated__/") ||
    lowerPath.includes("/autogen/") ||
    fileName.includes(".generated.") ||
    fileName.includes(".gen.") ||
    fileName.includes(".stub.") ||
    fileName.endsWith("_pb.go") ||
    fileName.endsWith(".pb.go")
  );
}

function isExampleOrFixture(lowerPath: string): boolean {
  const segments = lowerPath.split("/");
  return segments.some((segment) => ["examples", "example", "fixtures", "__fixtures__", "mocks", "__mocks__", "templates", "template"].includes(segment));
}

function isThirdPartyLike(lowerPath: string): boolean {
  const segments = lowerPath.split("/");
  return (
    segments.some((segment) => ["vendor", "vendors", "third_party", "third-party", "node_modules"].includes(segment)) ||
    lowerPath.startsWith("artifacts/") ||
    lowerPath.includes("/artifacts/") ||
    lowerPath.includes(".pydeps/")
  );
}
