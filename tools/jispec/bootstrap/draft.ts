import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { AIProviderFactory } from "../ai-provider-factory";
import { FilesystemStorage } from "../filesystem-storage";
import { loadAIConfigFromRoot } from "../runtime/load-ai-config";
import {
  getEvidenceConfidenceScore,
  normalizeEvidencePath,
  stableSortEvidenceGraph,
  summarizeEvidenceGraph,
  type EvidenceDocument,
  type EvidenceGraph,
  type EvidenceManifest,
  type EvidenceMigration,
  type EvidenceRoute,
  type EvidenceSchema,
  type EvidenceTest,
} from "./evidence-graph";
import { buildApiSurfaces, type ApiSurface } from "./api-surface";
import { buildAggregateRootCandidates, type AggregateRootCandidate } from "./aggregate-synthesis";
import { buildProtoDomainMappings, type ProtoServiceDomainMapping } from "./proto-domain-mapping";
import {
  assessFeatureScenarioConfidence,
  summarizeFeatureScenarioConfidence,
  type BehaviorEvidenceLevel,
  type FeatureRecommendation,
} from "./feature-confidence";
import {
  extractBusinessVocabularyFromDocuments,
  summarizeBusinessVocabularyTerms,
  type BusinessVocabularyTerm,
} from "./business-vocabulary";
import {
  hasTechnicalBoundaryToken,
  isBoundaryNoiseLabel,
  isTechnicalBoundaryLabel,
  normalizeBoundaryLabel,
  selectBusinessBoundaryFromPath,
  selectBusinessBoundaryLabel,
  shouldSuppressPrimaryBoundaryLabel,
} from "./domain-boundary-policy";
import {
  getTaxonomyScenarioTemplate,
  loadDomainTaxonomyPacksFromRoot,
  scoreDomainTaxonomyEvidence,
  summarizeDomainTaxonomyPacks,
  type DomainTaxonomyPack,
} from "./domain-taxonomy";
import { buildAdoptionRankedEvidence, type AdoptionRankedEvidenceEntry } from "./evidence-ranking";

const DEFAULT_EVIDENCE_GRAPH_PATH = ".spec/facts/bootstrap/evidence-graph.json";
const SESSION_ROOT = ".spec/sessions";

const ARTIFACT_PATHS: Record<DraftArtifactKind, string> = {
  domain: "drafts/domain.yaml",
  api: "drafts/api_spec.json",
  feature: "drafts/behaviors.feature",
};

const ARTIFACT_ORDER: DraftArtifactKind[] = ["domain", "api", "feature"];
const GENERIC_ROUTE_KEYWORDS = new Set([
  "api",
  "health",
  "healthz",
  "live",
  "liveness",
  "metrics",
  "ping",
  "ready",
  "readiness",
  "status",
  "v1",
  "v2",
  "v3",
]);

export type DraftArtifactKind = "domain" | "api" | "feature";

export interface DraftArtifact {
  kind: DraftArtifactKind;
  relativePath: string;
  content: string;
  sourceFiles: string[];
  confidenceScore: number;
  provenanceNote: string;
}

export interface DraftBundle {
  artifacts: DraftArtifact[];
  warnings: string[];
}

export interface DraftArtifactDescriptor {
  kind: DraftArtifactKind;
  relativePath: string;
  sourceFiles: string[];
  confidenceScore: number;
  provenanceNote: string;
}

export interface DraftSessionManifest {
  sessionId: string;
  repoRoot: string;
  sourceEvidenceGraphPath: string;
  sourceEvidenceGeneratedAt?: string;
  createdAt: string;
  updatedAt: string;
  status: "drafted" | "adopting" | "committed" | "abandoned";
  providerName?: string;
  generationMode?: "deterministic" | "provider" | "provider-fallback";
  qualitySummary?: DraftQualitySummary;
  artifactPaths: string[];
  artifacts: DraftArtifactDescriptor[];
  adoptedArtifactPaths?: string[];
  specDebtPaths?: string[];
  takeoverReportPath?: string;
  takeoverBriefPath?: string;
  adoptSummaryPath?: string;
  baselineHandoff?: {
    expectedContractPaths: string[];
    deferredSpecDebtPaths: string[];
    rejectedArtifactKinds: DraftArtifactKind[];
  };
  decisionLog?: Array<{
    artifactKind: DraftArtifactKind;
    decision: string;
    note?: string;
    edited?: boolean;
    targetPath?: string;
    sourceFiles?: string[];
    confidenceScore?: number;
    provenanceNote?: string;
  }>;
  warnings?: string[];
}

export interface BootstrapDraftOptions {
  root: string;
  session?: string;
  writeFile?: boolean;
}

export interface BootstrapDraftResult {
  sessionId: string;
  manifestPath: string;
  sourceEvidenceGraphPath: string;
  draftBundle: DraftBundle;
  writtenFiles: string[];
  warningCount: number;
  providerName: string;
  generationMode: "deterministic" | "provider" | "provider-fallback";
  qualitySummary: DraftQualitySummary;
}

export interface LoadedDraftSession {
  manifest: DraftSessionManifest;
  manifestPath: string;
  sessionDir: string;
  artifacts: DraftArtifact[];
}

interface SessionManifestEntry {
  manifest: DraftSessionManifest;
  manifestPath: string;
}

export interface DraftQualitySummary {
  routeSignalsUsed: string[];
  schemaSignalsUsed: string[];
  testSignalsUsed: string[];
  documentSignalsUsed: string[];
  manifestSignalsUsed: string[];
  businessVocabularySignalsUsed: string[];
  aggregateRootSignalsUsed: string[];
  protoServiceSignalsUsed: string[];
  taxonomyPackSignalsUsed: string[];
  primaryContextNames: string[];
  evidenceStrength: "strong" | "moderate" | "thin";
}

interface RankedDraftContext {
  summary: ReturnType<typeof summarizeEvidenceGraph>;
  topRoutes: EvidenceRoute[];
  topSchemas: EvidenceSchema[];
  topTests: EvidenceTest[];
  topDocuments: EvidenceDocument[];
  topManifests: EvidenceManifest[];
  topMigrations: EvidenceMigration[];
  businessVocabulary: BusinessVocabularyTerm[];
  aggregateRoots: AggregateRootCandidate[];
  protoServiceMappings: ProtoServiceDomainMapping[];
  taxonomyPacks: DomainTaxonomyPack[];
  domainGroups: Array<{
    name: string;
    sourceFiles: string[];
    confidenceScore: number;
    provenanceNote: string;
    routeCount: number;
    testCount: number;
    schemaCount: number;
    migrationCount: number;
    vocabularyCount: number;
  }>;
  sourcePriority: string[];
  topAdoptionEvidence: AdoptionRankedEvidenceEntry[];
  qualitySummary: DraftQualitySummary;
}

interface FeatureScenarioDraft {
  scenarioName: string;
  boundaryName: string;
  sourceFiles: string[];
  confidenceScore: number;
  provenanceNote: string;
  confidenceReasons: string[];
  recommendation: FeatureRecommendation;
  evidenceLevel: BehaviorEvidenceLevel;
  evidenceKinds: string[];
  tests: string[];
  supportingRoute?: string;
  humanReviewRequired: boolean;
  given: string;
  when: string;
  then: string;
}

export async function runBootstrapDraft(options: BootstrapDraftOptions): Promise<BootstrapDraftResult> {
  const root = path.resolve(options.root);
  const evidenceGraphPath = path.join(root, DEFAULT_EVIDENCE_GRAPH_PATH);

  if (!fs.existsSync(evidenceGraphPath)) {
    throw new Error(
      `Bootstrap evidence graph not found at ${normalizeEvidencePath(evidenceGraphPath)}. Run \`jispec-cli bootstrap discover\` first.`,
    );
  }

  const graph = loadEvidenceGraph(evidenceGraphPath);
  const sessionId = resolveDraftSessionId(root, options.session);
  const { bundle, providerName, generationMode, qualitySummary } = await generateDraftBundle(root, sessionId, graph);
  const sessionDir = getSessionDirectory(root, sessionId);
  const manifestPath = path.join(sessionDir, "manifest.json");

  const manifest = createDraftSessionManifest({
    sessionId,
    repoRoot: root,
    evidenceGraphPath,
    graph,
    providerName,
    generationMode,
    qualitySummary,
    bundle,
  });

  const writtenFiles =
    options.writeFile === false
      ? []
      : writeDraftSession(root, sessionId, manifest, bundle);

  return {
    sessionId,
    manifestPath: normalizeEvidencePath(manifestPath),
    sourceEvidenceGraphPath: normalizeEvidencePath(evidenceGraphPath),
    draftBundle: bundle,
    writtenFiles,
    warningCount: bundle.warnings.length,
    providerName,
    generationMode,
    qualitySummary,
  };
}

export function renderBootstrapDraftText(result: BootstrapDraftResult): string {
  const lines = [
    `Bootstrap draft complete for session \`${result.sessionId}\`.`,
    `Provider: ${result.providerName}`,
    `Generation mode: ${result.generationMode}`,
    `Artifacts drafted: ${result.draftBundle.artifacts.length}`,
    `Evidence strength: ${result.qualitySummary.evidenceStrength}`,
    `Warnings: ${result.warningCount}`,
    `Manifest: ${result.manifestPath}`,
  ];

  if (result.qualitySummary.primaryContextNames.length > 0) {
    lines.push(`Primary contexts: ${result.qualitySummary.primaryContextNames.join(", ")}`);
  }

  if (result.qualitySummary.businessVocabularySignalsUsed.length > 0) {
    lines.push("Business vocabulary:");
    lines.push(...result.qualitySummary.businessVocabularySignalsUsed.slice(0, 4).map((entry) => `- ${entry}`));
  }

  if (result.qualitySummary.aggregateRootSignalsUsed.length > 0) {
    lines.push("Aggregate roots:");
    lines.push(...result.qualitySummary.aggregateRootSignalsUsed.slice(0, 4).map((entry) => `- ${entry}`));
  }

  if (result.qualitySummary.protoServiceSignalsUsed.length > 0) {
    lines.push("Proto service mappings:");
    lines.push(...result.qualitySummary.protoServiceSignalsUsed.slice(0, 4).map((entry) => `- ${entry}`));
  }

  if (result.qualitySummary.taxonomyPackSignalsUsed.length > 0) {
    lines.push("Domain taxonomy packs:");
    lines.push(...result.qualitySummary.taxonomyPackSignalsUsed.slice(0, 4).map((entry) => `- ${entry}`));
  }

  if (result.qualitySummary.routeSignalsUsed.length > 0) {
    lines.push("Top route evidence:");
    lines.push(...result.qualitySummary.routeSignalsUsed.slice(0, 4).map((entry) => `- ${entry}`));
  }

  if (result.writtenFiles.length > 0) {
    lines.push("Written files:");
    lines.push(...result.writtenFiles.map((filePath) => `- ${filePath}`));
  } else {
    lines.push("Written files: none (`--no-write` mode)");
  }

  if (result.draftBundle.warnings.length > 0) {
    lines.push("Warnings:");
    lines.push(...result.draftBundle.warnings.map((warning) => `- ${warning}`));
  }

  return lines.join("\n");
}

export function getContractRelativePath(kind: DraftArtifactKind): string {
  switch (kind) {
    case "domain":
      return ".spec/contracts/domain.yaml";
    case "api":
      return ".spec/contracts/api_spec.json";
    case "feature":
      return ".spec/contracts/behaviors.feature";
    default:
      return ".spec/contracts/unknown";
  }
}

export function loadDraftSession(rootInput: string, requestedSession?: string): LoadedDraftSession {
  const root = path.resolve(rootInput);
  const sessionId = resolveAdoptSessionId(root, requestedSession);
  const manifestPath = getManifestPath(root, sessionId);

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Draft session manifest not found: ${normalizeEvidencePath(manifestPath)}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as DraftSessionManifest;
  const artifacts = manifest.artifacts.map((descriptor) => {
    const artifactPath = path.join(root, ".spec", "sessions", sessionId, descriptor.relativePath);
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Draft artifact missing from session ${sessionId}: ${normalizeEvidencePath(artifactPath)}`);
    }

    return {
      kind: descriptor.kind,
      relativePath: descriptor.relativePath,
      content: fs.readFileSync(artifactPath, "utf-8"),
      sourceFiles: [...descriptor.sourceFiles].sort((left, right) => left.localeCompare(right)),
      confidenceScore: descriptor.confidenceScore,
      provenanceNote: descriptor.provenanceNote,
    } satisfies DraftArtifact;
  });

  return {
    manifest,
    manifestPath: normalizeEvidencePath(manifestPath),
    sessionDir: normalizeEvidencePath(getSessionDirectory(root, sessionId)),
    artifacts: stableSortDraftArtifacts(artifacts),
  };
}

export function saveDraftSessionManifest(rootInput: string, manifest: DraftSessionManifest): string {
  const root = path.resolve(rootInput);
  const manifestPath = getManifestPath(root, manifest.sessionId);
  const storage = new FilesystemStorage(root);
  storage.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return normalizeEvidencePath(manifestPath);
}

export function listDraftSessionManifests(rootInput: string): SessionManifestEntry[] {
  const root = path.resolve(rootInput);
  const sessionRoot = path.join(root, SESSION_ROOT);
  if (!fs.existsSync(sessionRoot)) {
    return [];
  }

  const manifests: SessionManifestEntry[] = [];
  for (const entry of fs.readdirSync(sessionRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = path.join(sessionRoot, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as DraftSessionManifest;
    manifests.push({ manifest, manifestPath: normalizeEvidencePath(manifestPath) });
  }

  manifests.sort((left, right) => {
    const leftKey = `${left.manifest.createdAt}|${left.manifest.sessionId}`;
    const rightKey = `${right.manifest.createdAt}|${right.manifest.sessionId}`;
    return rightKey.localeCompare(leftKey);
  });

  return manifests;
}

function resolveDraftSessionId(root: string, requestedSession?: string): string {
  if (!requestedSession) {
    return createSessionId();
  }

  if (requestedSession !== "latest") {
    return requestedSession;
  }

  const latestOpen = listDraftSessionManifests(root).find(({ manifest }) =>
    manifest.status === "drafted" || manifest.status === "adopting");
  return latestOpen?.manifest.sessionId ?? createSessionId();
}

function resolveAdoptSessionId(root: string, requestedSession?: string): string {
  if (requestedSession && requestedSession !== "latest") {
    return requestedSession;
  }

  const manifests = listDraftSessionManifests(root);
  const latestOpen = manifests.find(({ manifest }) => manifest.status === "drafted" || manifest.status === "adopting");
  if (latestOpen) {
    return latestOpen.manifest.sessionId;
  }

  if (manifests.length > 0) {
    return manifests[0].manifest.sessionId;
  }

  throw new Error("No bootstrap draft session was found. Run `jispec-cli bootstrap draft` first.");
}

function createSessionId(): string {
  return `bootstrap-${new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z")}`;
}

function getSessionDirectory(root: string, sessionId: string): string {
  return path.join(root, ".spec", "sessions", sessionId);
}

function getManifestPath(root: string, sessionId: string): string {
  return path.join(getSessionDirectory(root, sessionId), "manifest.json");
}

function loadEvidenceGraph(evidenceGraphPath: string): EvidenceGraph {
  const parsed = JSON.parse(fs.readFileSync(evidenceGraphPath, "utf-8")) as EvidenceGraph;
  return stableSortEvidenceGraph(parsed);
}

async function generateDraftBundle(
  root: string,
  sessionId: string,
  graph: EvidenceGraph,
): Promise<{
  bundle: DraftBundle;
  providerName: string;
  generationMode: "deterministic" | "provider" | "provider-fallback";
  qualitySummary: DraftQualitySummary;
}> {
  const context = buildRankedDraftContext(graph);
  const fallbackBundle = buildDeterministicDraftBundle(graph, context);
  const aiConfig = loadAIConfigFromRoot(root);

  if (!aiConfig) {
    return {
      bundle: appendWarnings(fallbackBundle, ["No AI configuration found; bootstrap draft used the deterministic local generator."]),
      providerName: "deterministic-fallback",
      generationMode: "deterministic",
      qualitySummary: context.qualitySummary,
    };
  }

  let providerName = "deterministic-fallback";

  try {
    const provider = AIProviderFactory.create(aiConfig);
    providerName = provider.name;
    const available = await provider.isAvailable();
    if (!available) {
      return {
        bundle: appendWarnings(fallbackBundle, [
          `AI provider '${provider.name}' is unavailable; bootstrap draft used the deterministic local generator.`,
        ]),
        providerName: "deterministic-fallback",
        generationMode: "provider-fallback",
        qualitySummary: context.qualitySummary,
      };
    }

    const prompt = buildBootstrapDraftPrompt(root, sessionId, context, fallbackBundle);
    const output = await provider.generate(prompt, aiConfig.options);
    const normalized = normalizeProviderDraftBundle(output, fallbackBundle, context);
    return {
      bundle: normalized.bundle,
      providerName: normalized.fellBack ? "deterministic-fallback" : providerName,
      generationMode: normalized.fellBack ? "provider-fallback" : "provider",
      qualitySummary: context.qualitySummary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      bundle: appendWarnings(fallbackBundle, [
        `AI provider '${providerName}' failed during bootstrap draft: ${message}. Falling back to deterministic local generation.`,
      ]),
      providerName: "deterministic-fallback",
      generationMode: "provider-fallback",
      qualitySummary: context.qualitySummary,
    };
  }
}

function appendWarnings(bundle: DraftBundle, warnings: string[]): DraftBundle {
  return stableSortDraftBundle({
    artifacts: bundle.artifacts,
    warnings: [...bundle.warnings, ...warnings],
  });
}

function buildBootstrapDraftPrompt(root: string, sessionId: string, context: RankedDraftContext, fallbackBundle: DraftBundle): string {
  const deterministicDraft = fallbackBundle.artifacts.map((artifact) => ({
    kind: artifact.kind,
    relativePath: artifact.relativePath,
    sourceFiles: artifact.sourceFiles,
    confidenceScore: artifact.confidenceScore,
    provenanceNote: artifact.provenanceNote,
    content: artifact.content,
  }));
  const semanticReanchoringPacket = {
    qualitySummary: context.qualitySummary,
    adoptionRankedEvidence: context.topAdoptionEvidence.slice(0, 12),
    domainBoundaries: context.domainGroups.slice(0, 8),
    routeSignals: context.topRoutes.slice(0, 8).map((route) => ({
      method: route.method,
      path: route.path,
      signal: route.signal,
      sourceFiles: route.sourceFiles,
      confidenceScore: getEvidenceConfidenceScore(route),
      provenanceNote: route.provenanceNote,
    })),
    schemaSignals: context.topSchemas.slice(0, 8).map((schema) => ({
      path: schema.path,
      format: schema.format,
      signal: schema.signal,
      confidenceScore: getEvidenceConfidenceScore(schema),
      provenanceNote: schema.provenanceNote,
    })),
    testSignals: context.topTests.slice(0, 6).map((test) => ({
      path: test.path,
      frameworkHint: test.frameworkHint,
      confidenceScore: getEvidenceConfidenceScore(test),
      provenanceNote: test.provenanceNote,
    })),
    documentSignals: context.topDocuments.slice(0, 6).map((document) => ({
      path: document.path,
      kind: document.kind,
      confidenceScore: getEvidenceConfidenceScore(document),
      provenanceNote: document.provenanceNote,
    })),
    businessVocabulary: context.businessVocabulary.slice(0, 12).map((term) => ({
      label: term.label,
      phrase: term.phrase,
      language: term.language,
      sourcePath: term.sourcePath,
      score: term.score,
      reason: term.reason,
    })),
    aggregateRoots: context.aggregateRoots.slice(0, 12).map((aggregate) => ({
      name: aggregate.name,
      sourceFiles: aggregate.sourceFiles,
      confidenceScore: aggregate.confidenceScore,
      provenanceNote: aggregate.provenanceNote,
      evidence: aggregate.evidence,
    })),
    protoServiceMappings: context.protoServiceMappings.slice(0, 12).map((mapping) => ({
      service: mapping.service,
      boundedContext: mapping.boundedContext,
      contextLabels: mapping.contextLabels,
      aggregateRoots: mapping.aggregateRoots,
      operations: mapping.operations,
      sourceFile: mapping.sourceFile,
      confidenceScore: mapping.confidenceScore,
    })),
    taxonomyPacks: summarizeDomainTaxonomyPacks(context.taxonomyPacks),
  };

  return [
    "# JiSpec Bootstrap Draft Semantic Re-Anchoring",
    "## Bootstrap Draft Mode",
    `- Session ID: ${sessionId}`,
    `- Repository Root: ${normalizeEvidencePath(root)}`,
    "- Mode: BYOK semantic re-anchoring helper",
    "",
    "Return a JSON object with this shape:",
    '{ "artifacts": DraftArtifact[], "warnings": string[] }',
    "Where DraftArtifact.kind is one of domain, api, feature.",
    "For each artifact, you may improve only `content`.",
    "You must copy `relativePath`, `sourceFiles`, `confidenceScore`, and `provenanceNote` exactly from the deterministic draft artifact with the same kind.",
    "Treat the deterministic draft as the authoritative safe baseline.",
    "Use the ranked evidence packet as grounding. Do not invent domains, endpoints, scenarios, DTOs, or tests that are not supported by that packet or the deterministic draft.",
    "Prefer human-readable business semantics over folder names and lifecycle verbs.",
    "For API artifacts, classify every surface with surface_kind: openapi_contract, protobuf_service, explicit_endpoint, typed_handler_inference, module_surface_inference, or weak_candidate.",
    "Prefer OpenAPI/Swagger and protobuf contract surfaces over route guesses; keep weak candidates visibly separate from real endpoints.",
    "For feature artifacts, keep Gherkin Given/When/Then structure and mark thin evidence as human-review instead of overclaiming certainty.",
    "Do not use the full repository inventory as primary context; this packet is intentionally ranked and bounded.",
    "",
    "## Semantic Re-Anchoring Packet",
    "```json",
    JSON.stringify(semanticReanchoringPacket, null, 2),
    "```",
    "",
    "## Deterministic Draft Baseline",
    "```json",
    JSON.stringify({
      artifacts: deterministicDraft,
      warnings: fallbackBundle.warnings,
    }, null, 2),
    "```",
  ].join("\n");
}

function normalizeProviderDraftBundle(
  output: string,
  fallbackBundle: DraftBundle,
  context: RankedDraftContext,
): { bundle: DraftBundle; fellBack: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return {
      bundle: appendWarnings(fallbackBundle, [
        "AI provider output was not valid JSON; bootstrap draft used the deterministic local generator.",
      ]),
      fellBack: true,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      bundle: appendWarnings(fallbackBundle, [
        "AI provider output was not an object; bootstrap draft used the deterministic local generator.",
      ]),
      fellBack: true,
    };
  }

  const candidate = parsed as {
    artifacts?: unknown;
    warnings?: unknown;
  };

  if (!Array.isArray(candidate.artifacts)) {
    return {
      bundle: appendWarnings(fallbackBundle, [
        "AI provider output did not include an artifacts array; bootstrap draft used the deterministic local generator.",
      ]),
      fellBack: true,
    };
  }

  const fallbackByKind = new Map(fallbackBundle.artifacts.map((artifact) => [artifact.kind, artifact]));
  const normalizedArtifacts: DraftArtifact[] = [];

  for (const artifact of candidate.artifacts) {
    if (!artifact || typeof artifact !== "object") {
      continue;
    }

    const raw = artifact as Partial<DraftArtifact> & Record<string, unknown>;
    if (!isDraftArtifactKind(raw.kind)) {
      continue;
    }

    const baseline = fallbackByKind.get(raw.kind);
    if (!baseline) {
      continue;
    }

    normalizedArtifacts.push({
      kind: baseline.kind,
      relativePath: baseline.relativePath,
      content: typeof raw.content === "string" && raw.content.trim().length > 0 ? raw.content : baseline.content,
      sourceFiles: baseline.sourceFiles,
      confidenceScore: baseline.confidenceScore,
      provenanceNote: baseline.provenanceNote,
    });
  }

  const mergedArtifacts = stableSortDraftArtifacts(
    ARTIFACT_ORDER.map((kind) => normalizedArtifacts.find((artifact) => artifact.kind === kind) ?? fallbackByKind.get(kind)!).filter(
      (artifact): artifact is DraftArtifact => Boolean(artifact),
    ),
  );

  const warnings = Array.isArray(candidate.warnings)
    ? candidate.warnings.filter((warning): warning is string => typeof warning === "string")
    : [];

  return {
    bundle: stableSortDraftBundle({
      artifacts: mergedArtifacts,
      warnings: mergeWarnings(
        warnings,
        context.qualitySummary.evidenceStrength === "thin"
          ? ["Bootstrap draft used thin evidence; review all provider-generated artifacts before adoption."]
          : [],
      ),
    }),
    fellBack: false,
  };
}

function createDraftSessionManifest(input: {
  sessionId: string;
  repoRoot: string;
  evidenceGraphPath: string;
  graph: EvidenceGraph;
  providerName: string;
  generationMode: "deterministic" | "provider" | "provider-fallback";
  qualitySummary: DraftQualitySummary;
  bundle: DraftBundle;
}): DraftSessionManifest {
  const timestamp = new Date().toISOString();
  return {
    sessionId: input.sessionId,
    repoRoot: normalizeEvidencePath(input.repoRoot),
    sourceEvidenceGraphPath: normalizeEvidencePath(path.relative(input.repoRoot, input.evidenceGraphPath)),
    sourceEvidenceGeneratedAt: input.graph.generatedAt,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "drafted",
    providerName: input.providerName,
    generationMode: input.generationMode,
    qualitySummary: input.qualitySummary,
    artifactPaths: input.bundle.artifacts.map((artifact) =>
      normalizeEvidencePath(path.join(".spec", "sessions", input.sessionId, artifact.relativePath))),
    artifacts: input.bundle.artifacts.map((artifact) => ({
      kind: artifact.kind,
      relativePath: artifact.relativePath,
      sourceFiles: artifact.sourceFiles,
      confidenceScore: artifact.confidenceScore,
      provenanceNote: artifact.provenanceNote,
    })),
    warnings: [...input.bundle.warnings],
  };
}

function writeDraftSession(
  root: string,
  sessionId: string,
  manifest: DraftSessionManifest,
  bundle: DraftBundle,
): string[] {
  const storage = new FilesystemStorage(root);
  const sessionDir = getSessionDirectory(root, sessionId);
  const manifestPath = path.join(sessionDir, "manifest.json");
  const writtenFiles: string[] = [];

  for (const artifact of bundle.artifacts) {
    const artifactPath = path.join(sessionDir, artifact.relativePath);
    storage.writeFileSync(artifactPath, artifact.content.endsWith("\n") ? artifact.content : `${artifact.content}\n`);
    writtenFiles.push(normalizeEvidencePath(artifactPath));
  }

  storage.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writtenFiles.push(normalizeEvidencePath(manifestPath));

  return writtenFiles.sort((left, right) => left.localeCompare(right));
}

function buildDeterministicDraftBundle(graph: EvidenceGraph, context: RankedDraftContext): DraftBundle {
  const artifacts = stableSortDraftArtifacts([
    buildDomainArtifact(graph, context),
    buildApiArtifact(graph, context),
    buildFeatureArtifact(graph, context),
  ]);

  const warnings = mergeWarnings(
    [...graph.warnings],
    context.qualitySummary.evidenceStrength === "thin"
      ? ["Bootstrap draft evidence is thin; review all generated contract drafts before adoption."]
      : [],
  );

  return stableSortDraftBundle({
    artifacts,
    warnings,
  });
}

function buildDomainArtifact(graph: EvidenceGraph, context: RankedDraftContext): DraftArtifact {
  const sourceFiles = normalizeSourceFiles(
    collectArtifactSourceFiles(graph, context, [
      ...context.domainGroups.flatMap((group) => group.sourceFiles),
      ...context.topDocuments.map((document) => document.path),
      ...context.topManifests.map((manifest) => manifest.path),
      ...context.topSchemas.map((schema) => schema.path),
      ...context.aggregateRoots.flatMap((aggregate) => aggregate.sourceFiles),
    ]),
  );
  const confidenceScore = clampScore(
    0.47 +
      averageConfidence(context.topRoutes.slice(0, 3)) * 0.18 +
      averageConfidence(context.topSchemas.slice(0, 3)) * 0.17 +
      averageConfidence(context.topDocuments.slice(0, 3)) * 0.08 +
      averageConfidence(context.topTests.slice(0, 2)) * 0.07 +
      (context.domainGroups.length > 0 ? 0.08 : 0),
  );
  const provenanceNote =
    context.domainGroups.length > 0
      ? `Derived from ${context.domainGroups.length} ranked domain area(s), ${context.topDocuments.length} supporting document(s), and ${context.topSchemas.length} schema signal(s).`
      : "Derived from repository-wide bootstrap evidence because no bounded context clusters were strong enough.";

  const content = yaml.dump(
    {
      metadata: {
        source_files: sourceFiles,
        confidence_score: confidenceScore,
        provenance_note: provenanceNote,
      },
      domain: {
        repo_root: graph.repoRoot,
        generated_from: "bootstrap discover",
        evidence_strength: context.qualitySummary.evidenceStrength,
        summary: {
          routes: context.summary.routeCount,
          tests: context.summary.testCount,
          schemas: context.summary.schemaCount,
          migrations: context.summary.migrationCount,
          documents: context.summary.documentCount,
          manifests: context.summary.manifestCount,
          source_files: context.summary.sourceFileCount,
        },
        primary_contexts: context.qualitySummary.primaryContextNames,
        taxonomy_packs: summarizeDomainTaxonomyPacks(context.taxonomyPacks),
        domain_story: buildDomainStory(context),
        aggregate_roots: context.aggregateRoots.map((aggregate) => ({
          name: aggregate.name,
          source_files: aggregate.sourceFiles,
          confidence_score: aggregate.confidenceScore,
          provenance_note: aggregate.provenanceNote,
          evidence: {
            schemas: aggregate.evidence.schemas,
            routes: aggregate.evidence.routes,
            tests: aggregate.evidence.tests,
            documents: aggregate.evidence.documents,
            business_vocabulary: aggregate.evidence.businessVocabulary,
          },
        })),
        proto_service_mappings: context.protoServiceMappings.map((mapping) => ({
          service: mapping.service,
          bounded_context: mapping.boundedContext,
          context_labels: mapping.contextLabels,
          aggregate_roots: mapping.aggregateRoots,
          source_file: mapping.sourceFile,
          confidence_score: mapping.confidenceScore,
          provenance_note: mapping.provenanceNote,
          operations: mapping.operations.map((operation) => ({
            operation: operation.operation,
            request_type: operation.requestType,
            response_type: operation.responseType,
            aggregate_roots: operation.aggregateRoots,
          })),
        })),
        areas: context.domainGroups.map((group) => ({
          name: group.name,
          source_files: group.sourceFiles,
          confidence_score: group.confidenceScore,
          provenance_note: group.provenanceNote,
          evidence: {
            routes: group.routeCount,
            tests: group.testCount,
            schemas: group.schemaCount,
            migrations: group.migrationCount,
            business_vocabulary: group.vocabularyCount,
          },
        })),
        business_vocabulary: context.businessVocabulary.slice(0, 12).map((term) => ({
          label: term.label,
          phrase: term.phrase,
          language: term.language,
          source_path: term.sourcePath,
          source_kind: term.sourceKind,
          occurrences: term.occurrences,
          score: term.score,
          reason: term.reason,
        })),
        supporting_documents: context.topDocuments.slice(0, 5).map((document) => ({
          path: document.path,
          kind: document.kind,
          confidence_score: getEvidenceConfidenceScore(document),
          provenance_note: document.provenanceNote,
        })),
        runtime_manifests: context.topManifests.slice(0, 4).map((manifest) => ({
          path: manifest.path,
          kind: manifest.kind,
          confidence_score: getEvidenceConfidenceScore(manifest),
        })),
      },
    },
    { lineWidth: 120 },
  ).trimEnd();

  return {
    kind: "domain",
    relativePath: ARTIFACT_PATHS.domain,
    content,
    sourceFiles,
    confidenceScore,
    provenanceNote,
  };
}

function buildApiArtifact(graph: EvidenceGraph, context: RankedDraftContext): DraftArtifact {
  const classifiedSurfaces = buildApiSurfaces(graph, { schemas: context.topSchemas, taxonomyPacks: context.taxonomyPacks, limit: 32 });
  const schemas = context.topSchemas.slice(0, 12).map((schema) => ({
    path: schema.path,
    format: schema.format,
    source_files: [schema.path],
    confidence_score: clampScore(0.46 + getEvidenceConfidenceScore(schema) * 0.5),
    provenance_note: schema.provenanceNote || `Discovered as a ${schema.format} schema during bootstrap evidence scanning.`,
  }));

  const sourceFiles = normalizeSourceFiles(
    collectArtifactSourceFiles(graph, context, [
      ...classifiedSurfaces.flatMap((surface) => surface.source_files),
      ...schemas.flatMap((schema) => schema.source_files),
      ...context.topDocuments.slice(0, 2).map((document) => document.path),
    ]),
  );
  const endpoints: ApiSurface[] =
    classifiedSurfaces.length > 0
      ? classifiedSurfaces
      : [
          {
            id: "bootstrap-placeholder-surface",
            surface_kind: "weak_candidate",
            candidate_path: "/",
            method: "UNKNOWN",
            source_files: sourceFiles,
            confidence_score: 0.42,
            provenance_note: "No API contract or endpoint evidence was discovered; this placeholder keeps the first adoption loop visible.",
          },
        ];
  const surfaceSummary = summarizeApiSurfaceKinds(endpoints);

  const confidenceScore = clampScore(
    0.43 +
      averageConfidence(endpoints.slice(0, 5).map((surface) => ({ confidenceScore: surface.confidence_score }))) * 0.31 +
      averageConfidence(context.topSchemas.slice(0, 4)) * 0.2 +
      averageConfidence(context.topDocuments.slice(0, 2)) * 0.05,
  );
  const provenanceNote =
    endpoints.length > 0
      ? `Derived from ${endpoints.length} classified API surface(s), ${schemas.length} schema asset(s), and ${context.topDocuments.length} supporting document(s).`
      : "Derived from schema and documentation evidence because no API surfaces were discovered.";

  const content = JSON.stringify(
    {
      metadata: {
        source_files: sourceFiles,
        confidence_score: confidenceScore,
        provenance_note: provenanceNote,
      },
      api_spec: {
        title: "Bootstrap Draft API Contract",
        version: "0.1.0-draft",
        evidence_strength: context.qualitySummary.evidenceStrength,
        primary_contexts: context.qualitySummary.primaryContextNames,
        documents: context.topDocuments.slice(0, 4).map((document) => ({
          path: document.path,
          kind: document.kind,
          confidence_score: getEvidenceConfidenceScore(document),
        })),
        manifests: context.topManifests.slice(0, 3).map((manifest) => ({
          path: manifest.path,
          kind: manifest.kind,
        })),
        surface_summary: surfaceSummary,
        proto_service_mappings: context.protoServiceMappings.map((mapping) => ({
          service: mapping.service,
          bounded_context: mapping.boundedContext,
          context_labels: mapping.contextLabels,
          aggregate_roots: mapping.aggregateRoots,
          source_file: mapping.sourceFile,
          confidence_score: mapping.confidenceScore,
          operations: mapping.operations.map((operation) => ({
            operation: operation.operation,
            request_type: operation.requestType,
            response_type: operation.responseType,
            aggregate_roots: operation.aggregateRoots,
          })),
        })),
        surfaces: endpoints,
        endpoints,
        schemas,
      },
    },
    null,
    2,
  );

  return {
    kind: "api",
    relativePath: ARTIFACT_PATHS.api,
    content,
    sourceFiles,
    confidenceScore,
    provenanceNote,
  };
}

function summarizeApiSurfaceKinds(surfaces: ApiSurface[]): Record<ApiSurface["surface_kind"], number> {
  const summary: Record<ApiSurface["surface_kind"], number> = {
    explicit_endpoint: 0,
    openapi_contract: 0,
    protobuf_service: 0,
    typed_handler_inference: 0,
    module_surface_inference: 0,
    weak_candidate: 0,
  };

  for (const surface of surfaces) {
    summary[surface.surface_kind] += 1;
  }

  return summary;
}

function buildFeatureArtifact(graph: EvidenceGraph, context: RankedDraftContext): DraftArtifact {
  const topTests = context.topTests.slice(0, 6);
  const selectedScenarios = buildFeatureScenarios(graph, context, topTests);
  const sourceFiles = normalizeSourceFiles(
    selectedScenarios.flatMap((scenario) => scenario.sourceFiles).concat(topTests.slice(0, 3).map((test) => test.path)),
  );
  const featureGate = summarizeFeatureScenarioConfidence({
    scenarios: selectedScenarios.map((scenario) => ({
      recommendation: scenario.recommendation,
      confidenceScore: scenario.confidenceScore,
      confidenceReasons: scenario.confidenceReasons,
      humanReviewRequired: scenario.humanReviewRequired,
    })),
    evidenceStrength: context.qualitySummary.evidenceStrength,
  });
  const confidenceScore = clampScore(
    0.42 +
      averageConfidence(selectedScenarios.map((scenario) => ({ confidenceScore: scenario.confidenceScore }))) * 0.24 +
      averageConfidence(topTests.slice(0, 3)) * 0.17 +
      averageConfidence(context.topDocuments.slice(0, 2)) * 0.06,
  );
  const provenanceNote =
    selectedScenarios.some((scenario) => !scenario.humanReviewRequired)
      ? `Derived from ${selectedScenarios.length} boundary-backed behavior candidate(s), ${topTests.length} prioritized test asset(s), and ${context.topDocuments.length} supporting document(s).`
      : "Derived as human-review behavior candidates because bootstrap evidence is too thin for confident behavior synthesis.";

  const lines: string[] = [
    `# source_files: ${JSON.stringify(sourceFiles)}`,
    `# confidence_score: ${confidenceScore}`,
    `# provenance_note: ${provenanceNote}`,
    `# adoption_recommendation: ${featureGate.recommendation}`,
    `# confidence_reasons: ${JSON.stringify(featureGate.confidenceReasons)}`,
    "Feature: Bootstrap discovered behaviors",
    "",
  ];

  for (const scenario of selectedScenarios) {
    lines.push(`  # source_files: ${JSON.stringify(scenario.sourceFiles)}`);
    lines.push(`  # confidence_score: ${scenario.confidenceScore}`);
    lines.push(`  # evidence_level: ${scenario.evidenceLevel}`);
    lines.push(`  # evidence_kinds: ${JSON.stringify(scenario.evidenceKinds)}`);
    lines.push(`  # provenance_note: ${scenario.provenanceNote}`);
    lines.push(`  # recommendation: ${scenario.recommendation}`);
    lines.push(`  # confidence_reasons: ${JSON.stringify(scenario.confidenceReasons)}`);
    if (scenario.humanReviewRequired) {
      lines.push("  @behavior_needs_human_review");
    }
    lines.push(`  Scenario: ${scenario.scenarioName}`);
    lines.push(`    Given ${scenario.given}`);
    lines.push(`    And the strongest behavior evidence is "${scenario.sourceFiles[0] ?? "unknown"}"`);
    if (scenario.supportingRoute) {
      lines.push(`    And supporting API evidence includes "${scenario.supportingRoute}"`);
    }
    if (scenario.tests.length > 0) {
      lines.push(`    And test evidence includes "${scenario.tests[0]}"`);
    }
    lines.push(`    When ${scenario.when}`);
    lines.push(`    Then ${scenario.then}`);
    lines.push("");
  }

  return {
    kind: "feature",
    relativePath: ARTIFACT_PATHS.feature,
    content: lines.join("\n").trimEnd(),
    sourceFiles,
    confidenceScore,
    provenanceNote,
  };
}

function buildFeatureScenarios(graph: EvidenceGraph, context: RankedDraftContext, topTests: EvidenceTest[]): FeatureScenarioDraft[] {
  const strongBoundaries = context.domainGroups.filter((group) => group.name !== "bootstrap").slice(0, 6);
  const boundaries =
    strongBoundaries.length > 0
      ? strongBoundaries
      : [
          {
            name: inferFallbackBehaviorBoundary(context),
            sourceFiles: collectArtifactSourceFiles(graph, context, [
              ...context.topDocuments.slice(0, 2).map((document) => document.path),
              ...context.topSchemas.slice(0, 2).map((schema) => schema.path),
              ...context.topRoutes.slice(0, 2).flatMap((route) => route.sourceFiles),
              ...topTests.slice(0, 2).map((test) => test.path),
            ]),
            confidenceScore: 0.32,
            provenanceNote: "Inferred fallback boundary from thin bootstrap evidence.",
            routeCount: context.topRoutes.length,
            testCount: topTests.length,
            schemaCount: context.topSchemas.length,
            migrationCount: context.topMigrations.length,
          },
        ];

  const scenarios = boundaries.map((boundary, index) => {
    const boundarySourceFiles = new Set(boundary.sourceFiles.map((sourceFile) => normalizeEvidencePath(sourceFile)));
    const relatedRoute = selectRouteForBoundary(boundary.name, context.topRoutes, index);
    const relatedTests = mergeEvidenceByPath(
      relatedRoute ? selectTestsForRoute(relatedRoute, topTests) : [],
      selectTestsForBoundary(boundary.name, topTests, boundarySourceFiles),
    );
    const relatedSchemas = mergeEvidenceByPath(
      relatedRoute ? selectSchemasForRoute(relatedRoute, context.topSchemas) : [],
      selectSchemasForBoundary(boundary.name, context.topSchemas, boundarySourceFiles),
    );
    const relatedDocuments = context.topDocuments
      .filter((document) => boundaryMatchesPath(boundary.name, document.path) || boundarySourceFiles.has(normalizeEvidencePath(document.path)))
      .slice(0, 2);
    const relatedProtoMappings = context.protoServiceMappings.filter((mapping) => protoMappingMatchesBoundary(boundary.name, mapping));
    const relatedAggregateRoots = context.aggregateRoots.filter((aggregate) => aggregateRootMatchesBoundary(boundary.name, aggregate));
    const corroboratingAggregateRoots = relatedAggregateRoots.filter((aggregate) => aggregateHasNonRouteEvidence(aggregate));
    const sourceFiles = normalizeSourceFiles([
      ...boundary.sourceFiles,
      ...(relatedRoute?.sourceFiles ?? []),
      ...relatedTests.slice(0, 2).map((test) => test.path),
      ...relatedSchemas.slice(0, 2).map((schema) => schema.path),
      ...relatedDocuments.map((document) => document.path),
      ...relatedProtoMappings.slice(0, 2).map((mapping) => mapping.sourceFile),
      ...relatedAggregateRoots.slice(0, 2).flatMap((aggregate) => aggregate.sourceFiles),
    ]);
    const behavior = inferBehaviorTemplate(boundary.name, context.taxonomyPacks);
    const genericBehaviorTemplate = behavior.scenarioName.endsWith("behavior is confirmed before enforcement");
    const evidenceCoverage =
      relatedTests.length +
      relatedSchemas.length +
      relatedDocuments.length +
      relatedProtoMappings.length +
      corroboratingAggregateRoots.length;
    const evidenceKinds = collectBehaviorEvidenceKinds({
      relatedRoute,
      relatedTests,
      relatedSchemas,
      relatedDocuments,
      relatedProtoMappings,
      corroboratingAggregateRoots,
    });
    const evidenceLevel = classifyBehaviorEvidenceLevel({
      evidenceKinds,
      genericBehaviorTemplate,
      contextEvidenceStrength: context.qualitySummary.evidenceStrength,
    });
    const strongScenarioSupport =
      evidenceLevel === "strong" ||
      (
        relatedProtoMappings.length > 0 &&
        relatedTests.length + relatedSchemas.length + relatedDocuments.length + corroboratingAggregateRoots.length > 0
      );
    const preliminaryHumanReviewRequired =
      evidenceCoverage === 0 ||
      (context.qualitySummary.evidenceStrength === "thin" && !strongScenarioSupport) ||
      genericBehaviorTemplate ||
      Boolean(relatedRoute && evidenceCoverage === 0);
    const confidenceScore = clampScore(
      Math.max(boundary.confidenceScore, 0.32) +
        averageConfidence(relatedTests.slice(0, 2)) * 0.1 +
        averageConfidence(relatedSchemas.slice(0, 2)) * 0.12 +
        averageConfidence(relatedDocuments.slice(0, 2)) * 0.05 +
        averageConfidence(relatedProtoMappings.slice(0, 2).map((mapping) => ({ confidenceScore: mapping.confidenceScore }))) * 0.09 +
        averageConfidence(corroboratingAggregateRoots.slice(0, 2).map((aggregate) => ({ confidenceScore: aggregate.confidenceScore }))) * 0.06 +
        (preliminaryHumanReviewRequired ? -0.12 : 0.08),
    );
    const confidenceAssessment = assessFeatureScenarioConfidence({
      boundaryName: boundary.name,
      confidenceScore,
      evidenceStrength: context.qualitySummary.evidenceStrength,
      evidenceCoverage,
      relatedRoute: relatedRoute && relatedRoute.method && relatedRoute.path.startsWith("/") ? `${relatedRoute.method} ${relatedRoute.path}` : undefined,
      relatedTestCount: relatedTests.length,
      relatedSchemaCount: relatedSchemas.length,
      relatedDocumentCount: relatedDocuments.length,
      relatedProtoServiceCount: relatedProtoMappings.length,
      relatedAggregateRootCount: corroboratingAggregateRoots.length,
      genericBehaviorTemplate,
      behaviorEvidenceLevel: evidenceLevel,
    });

    return {
      scenarioName: behavior.scenarioName,
      boundaryName: boundary.name,
      sourceFiles,
      confidenceScore,
      provenanceNote: confidenceAssessment.humanReviewRequired
        ? `Boundary ${boundary.name} has ${evidenceLevel} behavior evidence; this scenario is a human-review candidate.`
        : `Derived from the ${boundary.name} boundary with ${evidenceLevel} behavior evidence across ${evidenceKinds.join(", ")}.`,
      confidenceReasons: confidenceAssessment.confidenceReasons,
      recommendation: confidenceAssessment.recommendation,
      evidenceLevel,
      evidenceKinds,
      tests: relatedTests.slice(0, 2).map((test) => test.path),
      supportingRoute: relatedRoute && relatedRoute.method && relatedRoute.path.startsWith("/") ? `${relatedRoute.method} ${relatedRoute.path}` : undefined,
      humanReviewRequired: confidenceAssessment.humanReviewRequired,
      given: behavior.given,
      when: behavior.when,
      then: confidenceAssessment.humanReviewRequired
        ? `${behavior.then}; behavior_needs_human_review remains open until an owner confirms the scenario`
        : behavior.then,
    };
  });

  return selectTakeoverGradeFeatureScenarios(scenarios, context.qualitySummary.evidenceStrength);
}

function selectTakeoverGradeFeatureScenarios(
  scenarios: FeatureScenarioDraft[],
  evidenceStrength: "strong" | "moderate" | "thin",
): FeatureScenarioDraft[] {
  const hasAcceptCandidate = scenarios.some((scenario) => scenario.recommendation === "accept_candidate");
  const limit = hasAcceptCandidate
    ? 6
    : evidenceStrength === "thin"
      ? 2
      : 3;

  return [...scenarios]
    .sort((left, right) => {
      const recommendationDelta = recommendationPriority(right) - recommendationPriority(left);
      if (recommendationDelta !== 0) {
        return recommendationDelta;
      }
      const confidenceDelta = right.confidenceScore - left.confidenceScore;
      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }
      return left.boundaryName.localeCompare(right.boundaryName);
    })
    .slice(0, limit);
}

function recommendationPriority(scenario: FeatureScenarioDraft): number {
  return scenario.recommendation === "accept_candidate" ? 1 : 0;
}

function inferFallbackBehaviorBoundary(context: RankedDraftContext): string {
  const firstContext = context.qualitySummary.primaryContextNames.find((name) => name !== "bootstrap");
  if (firstContext) {
    return firstContext;
  }
  const routeKeyword = context.topRoutes.flatMap((route) => extractRouteKeywords(route.path)).find((keyword) => !GENERIC_ROUTE_KEYWORDS.has(keyword));
  return routeKeyword ? normalizeDomainGroupLabel(routeKeyword) || "bootstrap" : "bootstrap";
}

function inferBehaviorTemplate(boundaryName: string, taxonomyPacks: DomainTaxonomyPack[]): {
  scenarioName: string;
  given: string;
  when: string;
  then: string;
} {
  const normalized = normalizeDomainGroupLabel(boundaryName);
  const taxonomyScenario = getTaxonomyScenarioTemplate(normalized, taxonomyPacks);
  if (taxonomyScenario) {
    return taxonomyScenario;
  }

  return {
    scenarioName: `${titleCaseBoundary(normalized || "bootstrap")} behavior is confirmed before enforcement`,
    given: `bootstrap discover identified the ${normalized || "bootstrap"} boundary`,
    when: "a human reviewer adopts the first behavior contract",
    then: "the behavior is either confirmed as enforceable or deferred as explicit spec debt",
  };
}

function selectRouteForBoundary(boundaryName: string, routes: EvidenceRoute[], index: number): EvidenceRoute | undefined {
  const matched = routes.find((route) =>
    [route.path, ...route.sourceFiles].some((candidate) => boundaryMatchesPath(boundaryName, candidate)),
  );
  return matched ?? routes[index % Math.max(routes.length, 1)];
}

function selectTestsForBoundary(boundaryName: string, tests: EvidenceTest[], boundarySourceFiles?: Set<string>): EvidenceTest[] {
  return tests.filter((test) =>
    boundaryMatchesPath(boundaryName, test.path) ||
    (boundarySourceFiles?.has(normalizeEvidencePath(test.path)) ?? false),
  );
}

function selectSchemasForBoundary(boundaryName: string, schemas: EvidenceSchema[], boundarySourceFiles?: Set<string>): EvidenceSchema[] {
  return schemas.filter((schema) =>
    boundaryMatchesPath(boundaryName, schema.path) ||
    (boundarySourceFiles?.has(normalizeEvidencePath(schema.path)) ?? false),
  );
}

function boundaryMatchesPath(boundaryName: string, candidatePath: string): boolean {
  const boundaryWords = expandEvidenceKeywords(
    normalizeDomainGroupLabel(boundaryName)
      .split("-")
      .filter((part) => part.length >= 3),
  );
  const lowerPath = candidatePath.toLowerCase();
  return boundaryWords.some((word) => lowerPath.includes(word));
}

function protoMappingMatchesBoundary(boundaryName: string, mapping: ProtoServiceDomainMapping): boolean {
  const normalizedBoundary = normalizeDomainGroupLabel(boundaryName);
  if (!normalizedBoundary) {
    return false;
  }

  return [
    mapping.boundedContext,
    mapping.service,
    mapping.sourceFile,
    ...mapping.contextLabels,
    ...mapping.aggregateRoots,
  ].some((candidate) => boundaryMatchesLabel(normalizedBoundary, candidate));
}

function aggregateRootMatchesBoundary(boundaryName: string, aggregate: AggregateRootCandidate): boolean {
  const normalizedBoundary = normalizeDomainGroupLabel(boundaryName);
  if (!normalizedBoundary) {
    return false;
  }

  return [aggregate.name, aggregate.provenanceNote, ...aggregate.sourceFiles].some((candidate) =>
    boundaryMatchesLabel(normalizedBoundary, candidate),
  );
}

function aggregateHasNonRouteEvidence(aggregate: AggregateRootCandidate): boolean {
  return (
    aggregate.evidence.schemas +
      aggregate.evidence.tests +
      aggregate.evidence.documents +
      aggregate.evidence.businessVocabulary >
    0
  );
}

function boundaryMatchesLabel(boundaryName: string, candidate: string): boolean {
  const boundaryWords = expandEvidenceKeywords(
    boundaryName
      .split("-")
      .filter((part) => part.length >= 3),
  );
  const lowerCandidate = normalizeEvidencePath(candidate).toLowerCase();
  return boundaryWords.some((word) => lowerCandidate.includes(word));
}

function titleCaseBoundary(boundaryName: string): string {
  return boundaryName
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function buildDomainGroups(graph: EvidenceGraph, context: Pick<RankedDraftContext, "topRoutes" | "topSchemas" | "topTests" | "topDocuments" | "topMigrations" | "topAdoptionEvidence" | "businessVocabulary" | "protoServiceMappings" | "taxonomyPacks">): Array<{
  name: string;
  sourceFiles: string[];
  confidenceScore: number;
  provenanceNote: string;
  routeCount: number;
  testCount: number;
  schemaCount: number;
  migrationCount: number;
  vocabularyCount: number;
}> {
  const groups = new Map<
    string,
    {
      sourceFiles: Set<string>;
      routeCount: number;
      testCount: number;
      schemaCount: number;
      migrationCount: number;
      vocabularyCount: number;
      inferredFromContexts: boolean;
      semanticScore: number;
      boundaryScore: number;
      vocabularyScore: number;
      protoServiceScore: number;
      taxonomyScore: number;
    }
  >();

  const ensureGroup = (name: string, inferredFromContexts: boolean) => {
    if (!groups.has(name)) {
      groups.set(name, {
        sourceFiles: new Set<string>(),
        routeCount: 0,
        testCount: 0,
        schemaCount: 0,
        migrationCount: 0,
        vocabularyCount: 0,
        inferredFromContexts,
        semanticScore: 0,
        boundaryScore: 0,
        vocabularyScore: 0,
        protoServiceScore: 0,
        taxonomyScore: 0,
      });
    }

    return groups.get(name)!;
  };

  const registerSource = (
    sourceFile: string,
    increment: keyof Omit<ReturnType<typeof ensureGroup>, "sourceFiles" | "inferredFromContexts">,
    preferredGroupName?: string,
  ) => {
    const groupName = resolveDomainGroupName(sourceFile, preferredGroupName);
    const group = ensureGroup(groupName, sourceFile.startsWith("contexts/"));
    group.sourceFiles.add(sourceFile);
    group[increment] += 1;
  };

  for (const route of context.topRoutes) {
    const groupName = inferRouteGroupName(route);
    for (const sourceFile of normalizeSourceFiles(route.sourceFiles)) {
      registerSource(sourceFile, "routeCount", groupName);
    }
  }

  for (const schema of context.topSchemas) {
    registerSource(schema.path, "schemaCount");
  }

  for (const test of context.topTests) {
    registerSource(test.path, "testCount");
  }

  for (const migration of context.topMigrations) {
    registerSource(migration.path, "migrationCount");
  }

  for (const document of context.topDocuments) {
    const groupName = inferDomainGroupName(document.path);
    const group = ensureGroup(groupName, document.path.startsWith("contexts/"));
    group.sourceFiles.add(document.path);
  }

  for (const term of context.businessVocabulary) {
    const groupName = term.label;
    const group = ensureGroup(groupName, false);
    group.sourceFiles.add(term.sourcePath);
    group.vocabularyCount += term.occurrences;
    group.vocabularyScore = Math.max(group.vocabularyScore, term.score);
    group.boundaryScore = Math.max(group.boundaryScore, term.score);
  }

  for (const mapping of context.protoServiceMappings) {
    for (const contextLabel of mapping.contextLabels) {
      const groupName = normalizeDomainGroupLabel(contextLabel);
      if (!groupName) {
        continue;
      }
      const group = ensureGroup(groupName, false);
      group.sourceFiles.add(mapping.sourceFile);
      group.schemaCount += 1;
      group.protoServiceScore = Math.max(group.protoServiceScore, mapping.confidenceScore * 100);
      group.boundaryScore = Math.max(group.boundaryScore, mapping.confidenceScore * 100);
    }
  }

  for (const evidence of context.topAdoptionEvidence) {
    const candidateSources = normalizeSourceFiles([evidence.path, ...evidence.sourceFiles]);
    const boundary = inferBusinessBoundaryFromEvidence(evidence, context.taxonomyPacks);
    const groupName = boundary && !isTechnicalBoundaryLabel(boundary.label)
      ? boundary.label
      : inferAdoptionEvidenceGroupName(evidence);
    const group = ensureGroup(groupName, candidateSources.some((sourceFile) => sourceFile.startsWith("contexts/")));
    for (const sourceFile of candidateSources) {
      group.sourceFiles.add(sourceFile);
    }
    group.semanticScore = Math.max(group.semanticScore, evidence.score);
    if (boundary) {
      group.boundaryScore = Math.max(group.boundaryScore, boundary.score);
    }
    const taxonomyBoost = scoreDomainTaxonomyEvidence([evidence.path, ...evidence.sourceFiles, evidence.reason].join(" "), context.taxonomyPacks);
    if (taxonomyBoost.score > 0) {
      group.taxonomyScore = Math.max(group.taxonomyScore, taxonomyBoost.score * 10);
      for (const label of taxonomyBoost.labels) {
        const taxonomyGroup = ensureGroup(label, false);
        for (const sourceFile of candidateSources) {
          taxonomyGroup.sourceFiles.add(sourceFile);
        }
        taxonomyGroup.taxonomyScore = Math.max(taxonomyGroup.taxonomyScore, taxonomyBoost.score * 10);
        taxonomyGroup.boundaryScore = Math.max(taxonomyGroup.boundaryScore, taxonomyBoost.score * 10);
      }
    }
  }

  if (groups.size === 0) {
    groups.set("bootstrap", {
      sourceFiles: new Set<string>(normalizeSourceFiles([
        ...context.topRoutes.flatMap((route) => route.sourceFiles),
        ...context.topSchemas.map((schema) => schema.path),
        ...context.topTests.map((test) => test.path),
        ...context.topDocuments.map((document) => document.path),
      ])),
      routeCount: context.topRoutes.length,
      testCount: context.topTests.length,
      schemaCount: context.topSchemas.length,
      migrationCount: context.topMigrations.length,
      vocabularyCount: 0,
      inferredFromContexts: false,
      semanticScore: 0,
      boundaryScore: 0,
      vocabularyScore: 0,
      protoServiceScore: 0,
      taxonomyScore: 0,
    });
  }

  return [...groups.entries()]
    .map(([name, group]) => {
      const sourceFiles = normalizeSourceFiles([...group.sourceFiles]);
      const technicalBoundary = isBoundaryNoiseLabel(name) || hasTechnicalBoundaryToken(name);
      const confidenceScore = clampScore(
        0.34 +
          (group.routeCount > 0 ? 0.12 : 0) +
          (group.schemaCount > 0 ? 0.1 : 0) +
          (group.testCount > 0 ? 0.06 : 0) +
          (group.inferredFromContexts ? 0.1 : 0.04) +
          Math.min(group.semanticScore / 1000, 0.16) +
          Math.min(group.boundaryScore / 1000, 0.12) +
          Math.min(group.vocabularyScore / 700, 0.2) +
          Math.min(group.protoServiceScore / 500, 0.18) +
          Math.min(group.taxonomyScore / 500, 0.16) +
          Math.min(sourceFiles.length * 0.015, 0.12) -
          (technicalBoundary ? 0.18 : 0),
      );

      return {
        name,
        sourceFiles,
        confidenceScore,
        provenanceNote:
          technicalBoundary
            ? `Kept as supporting technical evidence for ${name}; not promoted as a primary business boundary.`
            : group.vocabularyScore > 0
              ? `Re-anchored from multilingual business vocabulary around the ${name} boundary.`
            : group.protoServiceScore > 0
              ? `Re-anchored from protobuf service mapping around the ${name} bounded context.`
            : group.taxonomyScore > 0
              ? `Re-anchored from configured domain taxonomy around the ${name} boundary.`
            : group.boundaryScore > 0
            ? `Re-anchored from high-value takeover evidence around the ${name} business boundary.`
            : group.inferredFromContexts
              ? `Inferred from files under the ${name} bounded-context path and related evidence.`
              : `Inferred from repository path grouping around ${name}.`,
        routeCount: group.routeCount,
        testCount: group.testCount,
        schemaCount: group.schemaCount,
        migrationCount: group.migrationCount,
        vocabularyCount: group.vocabularyCount,
      };
    })
    .sort((left, right) => {
      const scoreDelta = right.confidenceScore - left.confidenceScore;
      return scoreDelta !== 0 ? scoreDelta : left.name.localeCompare(right.name);
    })
    .slice(0, 8);
}

function buildRankedDraftContext(graph: EvidenceGraph): RankedDraftContext {
  const summary = summarizeEvidenceGraph(graph);
  const taxonomyPacks = loadDomainTaxonomyPacksFromRoot(graph.repoRoot);
  const adoptionEvidence = buildAdoptionRankedEvidence(graph, { limit: 20, taxonomyPacks });
  const topAdoptionEvidence = adoptionEvidence.evidence;
  const topRoutes = rankRoutes(graph.routes).slice(0, 12);
  const topSchemas = rankSchemas(graph.schemas).slice(0, 12);
  const topTests = rankTests(graph.tests).slice(0, 12);
  const topDocuments = rankDocuments(graph.documents ?? []).slice(0, 10);
  const topManifests = rankManifests(graph.manifests ?? []).slice(0, 6);
  const topMigrations = rankMigrations(graph.migrations).slice(0, 6);
  const businessVocabulary = extractBusinessVocabularyFromDocuments(graph, topDocuments, { limit: 24, taxonomyPacks });
  const aggregateRoots = buildAggregateRootCandidates(graph, {
    routes: topRoutes,
    schemas: topSchemas,
    tests: topTests,
    documents: topDocuments,
    businessVocabulary,
    taxonomyPacks,
    limit: 12,
  });
  const protoServiceMappings = buildProtoDomainMappings(graph, {
    schemas: topSchemas,
    aggregateRoots,
    taxonomyPacks,
    limit: 12,
  });
  const domainGroups = buildDomainGroups(graph, {
    topRoutes,
    topSchemas,
    topTests,
    topDocuments,
    topMigrations,
    topAdoptionEvidence,
    businessVocabulary,
    protoServiceMappings,
    taxonomyPacks,
  });
  const brandHints = inferBrandBoundaryHints(graph);

  const sourcePriority = normalizeSourceFiles([
    ...topAdoptionEvidence.flatMap((entry) => [entry.path, ...entry.sourceFiles]),
    ...topRoutes.flatMap((route) => route.sourceFiles),
    ...topSchemas.map((schema) => schema.path),
    ...topDocuments.map((document) => document.path),
    ...topManifests.map((manifest) => manifest.path),
    ...topTests.map((test) => test.path),
  ]);

  const routeSignalsUsed = topRoutes.slice(0, 5).map((route) => formatRouteEvidence(route));
  const schemaSignalsUsed = topSchemas.slice(0, 5).map((schema) => `${schema.path} (${schema.format}, ${Math.round(getEvidenceConfidenceScore(schema) * 100)}%)`);
  const testSignalsUsed = topTests.slice(0, 5).map((test) => `${test.path} (${test.frameworkHint ?? "unknown"}, ${Math.round(getEvidenceConfidenceScore(test) * 100)}%)`);
  const documentSignalsUsed = topDocuments.slice(0, 5).map((document) => `${document.path} (${document.kind}, ${Math.round(getEvidenceConfidenceScore(document) * 100)}%)`);
  const businessVocabularySignalsUsed = summarizeBusinessVocabularyTerms(businessVocabulary, 8);
  const aggregateRootSignalsUsed = aggregateRoots
    .slice(0, 8)
    .map((aggregate) => `${aggregate.name} (${Math.round(aggregate.confidenceScore * 100)}%) from ${aggregate.sourceFiles.slice(0, 2).join(", ")}`);
  const protoServiceSignalsUsed = protoServiceMappings
    .slice(0, 8)
    .map((mapping) => `${mapping.service} -> ${mapping.boundedContext} (${mapping.aggregateRoots.slice(0, 4).join(", ")})`);
  const taxonomyPackSignalsUsed = summarizeDomainTaxonomyPacks(taxonomyPacks);
  const manifestSignalsUsed = [
    ...topAdoptionEvidence.slice(0, 5).map((entry) => `${entry.path} (${entry.kind}, score ${Math.round(entry.score)})`),
    ...topManifests.slice(0, 5).map((manifest) => `${manifest.path} (${manifest.kind}, ${Math.round(getEvidenceConfidenceScore(manifest) * 100)}%)`),
  ].slice(0, 8);
  const businessPrimaryContexts = domainGroups
    .map((group) => group.name)
    .filter((name) => !shouldSuppressPrimaryBoundaryLabel(name, { brandHints, hasSpecificAlternative: false }));
  const nonBrandPrimaryContexts = businessPrimaryContexts.filter((name) =>
    !shouldSuppressPrimaryBoundaryLabel(name, { brandHints, hasSpecificAlternative: true }),
  );
  const primaryContextNames = (nonBrandPrimaryContexts.length > 0 ? nonBrandPrimaryContexts : businessPrimaryContexts).slice(0, 5);

  const evidenceStrengthScore =
    averageConfidence(topRoutes.slice(0, 4)) * 0.34 +
    averageConfidence(topSchemas.slice(0, 4)) * 0.24 +
    averageConfidence(topTests.slice(0, 4)) * 0.18 +
    averageConfidence(topDocuments.slice(0, 3)) * 0.14 +
    averageConfidence(topManifests.slice(0, 2)) * 0.1;

  const evidenceStrength =
    evidenceStrengthScore >= 0.8
      ? "strong"
      : evidenceStrengthScore >= 0.58
        ? "moderate"
        : "thin";

  return {
    summary,
    topRoutes,
    topSchemas,
    topTests,
    topDocuments,
    topManifests,
    topMigrations,
    businessVocabulary,
    aggregateRoots,
    protoServiceMappings,
    taxonomyPacks,
    domainGroups,
    sourcePriority,
    topAdoptionEvidence,
    qualitySummary: {
      routeSignalsUsed,
      schemaSignalsUsed,
      testSignalsUsed,
      documentSignalsUsed,
      manifestSignalsUsed,
      businessVocabularySignalsUsed,
      aggregateRootSignalsUsed,
      protoServiceSignalsUsed,
      taxonomyPackSignalsUsed,
      primaryContextNames,
      evidenceStrength,
    },
  };
}

function buildDomainStory(context: RankedDraftContext): string[] {
  const story: string[] = [];

  if (context.qualitySummary.primaryContextNames.length > 0) {
    story.push(`Primary takeover boundaries appear to be ${context.qualitySummary.primaryContextNames.join(", ")}.`);
  }

  if (context.domainGroups.length > 0) {
    const topGroup = context.domainGroups[0];
    story.push(`The strongest domain boundary is ${topGroup.name}, supported by ${topGroup.sourceFiles.slice(0, 3).join(", ")}.`);
  }

  if (context.businessVocabulary.length > 0) {
    story.push(`Document vocabulary contributes ${context.businessVocabulary.slice(0, 5).map((term) => term.label).join(", ")}.`);
  }

  if (context.aggregateRoots.length > 0) {
    story.push(`Aggregate root candidates include ${context.aggregateRoots.slice(0, 5).map((aggregate) => aggregate.name).join(", ")}.`);
  }

  if (context.protoServiceMappings.length > 0) {
    story.push(`Proto service mappings include ${context.protoServiceMappings.slice(0, 4).map((mapping) => `${mapping.service}->${mapping.boundedContext}`).join(", ")}.`);
  }

  if (context.topSchemas.length > 0) {
    story.push(`Schema evidence is led by ${context.topSchemas[0].path}.`);
  }

  if (context.topDocuments.length > 0) {
    story.push(`Documentation context is anchored by ${context.topDocuments[0].path}.`);
  }

  if (context.topRoutes.length > 0) {
    story.push(`Route evidence remains supporting context, led by ${formatRouteEvidence(context.topRoutes[0])}.`);
  }

  if (story.length === 0) {
    story.push("Bootstrap draft fell back to repository-wide signals because strong contract evidence was limited.");
  }

  return story;
}

function rankRoutes(routes: EvidenceRoute[]): EvidenceRoute[] {
  return [...routes].sort((left, right) => {
    const delta = routePriorityScore(right) - routePriorityScore(left);
    if (delta !== 0) {
      return delta;
    }
    return `${left.method ?? ""}|${left.path}`.localeCompare(`${right.method ?? ""}|${right.path}`);
  });
}

function rankSchemas(schemas: EvidenceSchema[]): EvidenceSchema[] {
  return [...schemas].sort((left, right) => {
    const delta = schemaPriorityScore(right) - schemaPriorityScore(left);
    if (delta !== 0) {
      return delta;
    }
    return left.path.localeCompare(right.path);
  });
}

function rankTests(tests: EvidenceTest[]): EvidenceTest[] {
  return [...tests].sort((left, right) => {
    const delta = testPriorityScore(right) - testPriorityScore(left);
    if (delta !== 0) {
      return delta;
    }
    return left.path.localeCompare(right.path);
  });
}

function rankDocuments(documents: EvidenceDocument[]): EvidenceDocument[] {
  return [...documents].sort((left, right) => {
    const delta = documentPriorityScore(right) - documentPriorityScore(left);
    if (delta !== 0) {
      return delta;
    }
    return left.path.localeCompare(right.path);
  });
}

function rankManifests(manifests: EvidenceManifest[]): EvidenceManifest[] {
  return [...manifests].sort((left, right) => {
    const delta = manifestPriorityScore(right) - manifestPriorityScore(left);
    if (delta !== 0) {
      return delta;
    }
    return left.path.localeCompare(right.path);
  });
}

function rankMigrations(migrations: EvidenceMigration[]): EvidenceMigration[] {
  return [...migrations].sort((left, right) => {
    const delta = migrationPriorityScore(right) - migrationPriorityScore(left);
    if (delta !== 0) {
      return delta;
    }
    return left.path.localeCompare(right.path);
  });
}

function routePriorityScore(route: EvidenceRoute): number {
  let score = getEvidenceConfidenceScore(route);
  const normalizedPath = route.path.toLowerCase();
  if (route.method) {
    score += 0.08;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(route.method.toUpperCase())) {
      score += 0.06;
    }
  }
  if (route.path.startsWith("/")) {
    score += 0.05;
  }
  if (route.path.includes("${")) {
    score += 0.02;
  }
  if (isInfrastructureRoute(normalizedPath)) {
    score -= 0.14;
  }
  return Number(score.toFixed(4));
}

function schemaPriorityScore(schema: EvidenceSchema): number {
  let score = getEvidenceConfidenceScore(schema);
  if (schema.format === "openapi") {
    score += 0.08;
  }
  if (schema.format === "protobuf") {
    score += 0.08;
  }
  if (schema.format === "database-schema") {
    score += 0.07;
  }
  if (schema.format === "json-schema") {
    score += 0.05;
  }
  if (schema.path.startsWith("schemas/")) {
    score += 0.03;
  }
  return Number(score.toFixed(4));
}

function testPriorityScore(test: EvidenceTest): number {
  let score = getEvidenceConfidenceScore(test);
  if (test.frameworkHint === "jispec" || test.frameworkHint === "gherkin") {
    score += 0.09;
  }
  if (test.path.startsWith("contexts/")) {
    score += 0.06;
  }
  if (test.path.startsWith("tests/")) {
    score += 0.03;
  }
  if (test.path.startsWith("tools/jispec/tests/")) {
    score -= 0.08;
  }
  return Number(score.toFixed(4));
}

function documentPriorityScore(document: EvidenceDocument): number {
  let score = getEvidenceConfidenceScore(document);
  if (document.kind === "readme" || document.kind === "context") {
    score += 0.08;
  }
  if (document.path.startsWith("contexts/") || document.path.startsWith("jiproject/")) {
    score += 0.06;
  }
  if (document.path.startsWith("templates/")) {
    score -= 0.08;
  }
  return Number(score.toFixed(4));
}

function manifestPriorityScore(manifest: EvidenceManifest): number {
  let score = getEvidenceConfidenceScore(manifest);
  if (manifest.kind === "package-json" || manifest.kind === "pyproject" || manifest.kind === "pom" || manifest.kind === "go-mod") {
    score += 0.05;
  }
  return Number(score.toFixed(4));
}

function migrationPriorityScore(migration: EvidenceMigration): number {
  return Number(getEvidenceConfidenceScore(migration).toFixed(4));
}

function averageConfidence(signals: Array<{ confidenceScore?: number }>): number {
  if (signals.length === 0) {
    return 0;
  }

  const total = signals.reduce((sum, signal) => sum + clampScore(typeof signal.confidenceScore === "number" ? signal.confidenceScore : 0), 0);
  return Number((total / signals.length).toFixed(4));
}

function selectSchemasForRoute(route: EvidenceRoute, schemas: EvidenceSchema[]): EvidenceSchema[] {
  const routeWords = expandEvidenceKeywords(extractRouteKeywords(route.path));
  return schemas
    .filter((schema) => {
      const schemaName = path.basename(schema.path).toLowerCase();
      return routeWords.some((word) => schemaName.includes(word));
    })
    .sort((left, right) => schemaPriorityScore(right) - schemaPriorityScore(left));
}

function selectTestsForRoute(route: EvidenceRoute, tests: EvidenceTest[]): EvidenceTest[] {
  const routeWords = expandEvidenceKeywords(extractRouteKeywords(route.path));
  return tests
    .filter((test) => {
      const lower = test.path.toLowerCase();
      return routeWords.some((word) => lower.includes(word));
    })
    .sort((left, right) => testPriorityScore(right) - testPriorityScore(left));
}

function mergeEvidenceByPath<T extends { path: string }>(...groups: T[][]): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const group of groups) {
    for (const entry of group) {
      const key = normalizeEvidencePath(entry.path);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(entry);
    }
  }
  return merged;
}

function collectBehaviorEvidenceKinds(input: {
  relatedRoute?: EvidenceRoute;
  relatedTests: EvidenceTest[];
  relatedSchemas: EvidenceSchema[];
  relatedDocuments: EvidenceDocument[];
  relatedProtoMappings: ProtoServiceDomainMapping[];
  corroboratingAggregateRoots: AggregateRootCandidate[];
}): string[] {
  const kinds = new Set<string>();
  if (input.relatedRoute) {
    kinds.add("route");
  }
  if (input.relatedTests.length > 0) {
    kinds.add("test");
  }
  if (input.relatedSchemas.length > 0) {
    kinds.add("schema");
  }
  if (input.relatedDocuments.length > 0) {
    kinds.add("document");
  }
  if (input.relatedProtoMappings.length > 0) {
    kinds.add("proto");
  }
  if (input.corroboratingAggregateRoots.length > 0) {
    kinds.add("aggregate");
  }
  return [...kinds].sort((left, right) => left.localeCompare(right));
}

function classifyBehaviorEvidenceLevel(input: {
  evidenceKinds: string[];
  genericBehaviorTemplate: boolean;
  contextEvidenceStrength: "strong" | "moderate" | "thin";
}): BehaviorEvidenceLevel {
  const kinds = new Set(input.evidenceKinds);
  const nonRouteKinds = input.evidenceKinds.filter((kind) => kind !== "route");
  const hasExecutableAnchor = kinds.has("test") || kinds.has("proto");
  const hasContractAnchor = kinds.has("schema") || kinds.has("proto");
  const hasBusinessAnchor = kinds.has("document") || kinds.has("aggregate");

  if (input.genericBehaviorTemplate && nonRouteKinds.length === 0) {
    return kinds.has("route") ? "weak" : "unsupported";
  }
  if (input.contextEvidenceStrength !== "thin" && hasExecutableAnchor && hasContractAnchor && hasBusinessAnchor) {
    return input.genericBehaviorTemplate ? "partial" : "strong";
  }
  if (nonRouteKinds.length >= 2 && hasBusinessAnchor && input.contextEvidenceStrength !== "thin") {
    return input.genericBehaviorTemplate ? "partial" : "strong";
  }
  if (nonRouteKinds.length > 0) {
    return "partial";
  }
  return kinds.has("route") ? "weak" : "unsupported";
}

function extractRouteKeywords(routePath: string): string[] {
  return [...new Set(
    routePath
      .toLowerCase()
      .replace(/\$\{[^}]+\}/g, " ")
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length >= 3 && !["api", "v1", "v2"].includes(part)),
  )];
}

function expandEvidenceKeywords(words: string[]): string[] {
  const expanded = new Set<string>();
  for (const word of words) {
    expanded.add(word);
    if (word.endsWith("ies") && word.length > 3) {
      expanded.add(`${word.slice(0, -3)}y`);
    }
    if (word.endsWith("s") && word.length > 3) {
      expanded.add(word.slice(0, -1));
    } else if (word.length > 3) {
      expanded.add(`${word}s`);
    }
  }

  return [...expanded];
}

function formatRouteEvidence(route: EvidenceRoute): string {
  return `${route.method ?? "UNKNOWN"} ${route.path} (${Math.round(getEvidenceConfidenceScore(route) * 100)}% via ${route.sourceFiles[0] ?? "unknown"})`;
}

function resolveDomainGroupName(sourceFile: string, preferredGroupName?: string): string {
  const preferredLabel = preferredGroupName ? normalizeDomainGroupLabel(preferredGroupName) : "";
  if (preferredLabel && !isBoundaryNoiseLabel(preferredLabel) && !hasTechnicalBoundaryToken(preferredLabel)) {
    return preferredLabel;
  }

  const inferred = inferDomainGroupName(sourceFile);
  if (inferred !== "bootstrap") {
    return inferred;
  }

  return "bootstrap";
}

function inferDomainGroupName(repoPath: string): string {
  const normalizedPath = normalizeEvidencePath(repoPath);
  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "bootstrap";
  }

  if (segments[0] === "contexts" && segments[1]) {
    return selectBusinessBoundaryLabel(segments[1]) || "bootstrap";
  }

  if (segments[0] === "tools" && segments[1] === "jispec") {
    return "jispec-cli";
  }

  if ((segments[0] === "src" || segments[0] === "app") && segments[1]) {
    const nested = findLastSpecificSegment(segments.slice(1, -1));
    if (nested) {
      return nested;
    }
  }

  const basename = path.posix.basename(normalizedPath).toLowerCase();
  const basenameLabel = selectBusinessBoundaryLabel(
    basename
      .replace(/\.[^.]+$/g, "")
      .replace(/\.(schema|test|spec)$/g, "")
      .replace(/(?:^|[-_.])(route|routes|router|controller|controllers|service|services|handler|handlers|model|models|api|index|main|server)$/g, ""),
  );
  if (basenameLabel) {
    return basenameLabel;
  }

  const specificSegment = findLastSpecificSegment(segments);
  if (specificSegment) {
    return specificSegment;
  }

  return selectBusinessBoundaryLabel(segments[0]) || "bootstrap";
}

function inferRouteGroupName(route: EvidenceRoute): string {
  const routeKeyword = extractRouteKeywords(route.path)
    .map((keyword) => selectBusinessBoundaryLabel(keyword) ?? "")
    .find((keyword) => keyword.length > 0 && !GENERIC_ROUTE_KEYWORDS.has(keyword));
  if (routeKeyword) {
    return routeKeyword;
  }

  for (const sourceFile of normalizeSourceFiles(route.sourceFiles)) {
    const inferred = inferDomainGroupName(sourceFile);
    if (inferred !== "bootstrap") {
      return inferred;
    }
  }

  return "bootstrap";
}

function inferBusinessGroupNameFromEvidenceSources(evidence: AdoptionRankedEvidenceEntry): string {
  for (const sourceFile of normalizeSourceFiles([evidence.path, ...evidence.sourceFiles])) {
    const direct = selectBusinessBoundaryFromPath(sourceFile);
    if (direct) {
      return direct;
    }

    const inferred = inferDomainGroupName(sourceFile);
    if (inferred !== "bootstrap") {
      return inferred;
    }
  }

  return "bootstrap";
}

function inferAdoptionEvidenceGroupName(evidence: AdoptionRankedEvidenceEntry): string {
  const metadata = evidence.metadata ?? {};
  if (typeof metadata.schemaFormat === "string" && metadata.schemaFormat === "protobuf") {
    const protoGroup = inferProtoGroupName(evidence.path);
    if (protoGroup) {
      return protoGroup;
    }
  }

  if (evidence.kind === "schema" && typeof metadata.schemaFormat === "string" && metadata.schemaFormat === "database-schema") {
    return inferBusinessGroupNameFromEvidenceSources(evidence);
  }

  return inferBusinessGroupNameFromEvidenceSources(evidence);
}

function inferBusinessBoundaryFromEvidence(
  evidence: AdoptionRankedEvidenceEntry,
  taxonomyPacks: DomainTaxonomyPack[],
): { label: string; score: number } | undefined {
  const metadata = evidence.metadata ?? {};
  const haystackParts = [
    evidence.path,
    evidence.reason,
    ...evidence.sourceFiles,
    typeof metadata.provenanceNote === "string" ? metadata.provenanceNote : "",
    typeof metadata.schemaFormat === "string" ? metadata.schemaFormat : "",
    typeof metadata.documentKind === "string" ? metadata.documentKind : "",
    typeof metadata.sourceCategory === "string" ? metadata.sourceCategory : "",
  ];
  const haystack = haystackParts.join("\n");

  const taxonomyBoost = scoreDomainTaxonomyEvidence(haystack, taxonomyPacks);
  const taxonomyLabel = taxonomyBoost.labels.find((label) => !isTechnicalBoundaryLabel(label));
  if (taxonomyLabel) {
    return {
      label: taxonomyLabel,
      score: evidence.score + taxonomyBoost.score * 10,
    };
  }

  const vocabulary = Array.isArray(metadata.businessVocabulary) ? metadata.businessVocabulary : [];
  for (const entry of vocabulary) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const label = normalizeDomainGroupLabel(String((entry as Record<string, unknown>).label ?? ""));
    if (label && !isTechnicalBoundaryLabel(label)) {
      return {
        label,
        score: evidence.score,
      };
    }
  }

  const fallback = inferBusinessGroupNameFromEvidenceSources(evidence);
  return fallback !== "bootstrap" && !isTechnicalBoundaryLabel(fallback)
    ? { label: fallback, score: evidence.score }
    : undefined;
}

function inferBrandBoundaryHints(graph: EvidenceGraph): string[] {
  const rootName = path.basename(normalizeEvidencePath(graph.repoRoot));
  return [rootName].filter(Boolean);
}

function inferProtoGroupName(repoPath: string): string | undefined {
  const basename = path.posix.basename(normalizeEvidencePath(repoPath)).replace(/\.proto$/i, "");
  return selectBusinessBoundaryLabel(basename);
}

function findLastSpecificSegment(segments: string[]): string | undefined {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const label = selectBusinessBoundaryLabel(segments[index]);
    if (label) {
      return label;
    }
  }

  return undefined;
}

function normalizeDomainGroupLabel(value: string): string {
  return normalizeBoundaryLabel(value);
}

function isInfrastructureRoute(routePath: string): boolean {
  return ["/health", "/healthz", "/live", "/liveness", "/metrics", "/ping", "/ready", "/readiness", "/status"].some(
    (candidate) => routePath === candidate || routePath.startsWith(`${candidate}/`),
  );
}

function collectArtifactSourceFiles(graph: EvidenceGraph, context: RankedDraftContext, preferredSources: string[]): string[] {
  const collected = new Set<string>();

  for (const sourceFile of preferredSources) {
    if (sourceFile) {
      collected.add(normalizeEvidencePath(sourceFile));
    }
  }

  if (collected.size === 0) {
    for (const route of context.topRoutes) {
      for (const sourceFile of route.sourceFiles) {
        collected.add(normalizeEvidencePath(sourceFile));
      }
    }

    for (const schema of context.topSchemas) {
      collected.add(normalizeEvidencePath(schema.path));
    }

    for (const test of context.topTests) {
      collected.add(normalizeEvidencePath(test.path));
    }
  }

  if (collected.size === 0) {
    for (const file of context.sourcePriority.slice(0, 12)) {
      collected.add(normalizeEvidencePath(file));
    }
  }

  if (collected.size === 0) {
    for (const file of graph.sourceFiles.slice(0, 12)) {
      collected.add(normalizeEvidencePath(file.path));
    }
  }

  return normalizeSourceFiles([...collected]);
}

function normalizeSourceFiles(sourceFiles: string[]): string[] {
  return [...new Set(sourceFiles.map((sourceFile) => normalizeEvidencePath(sourceFile)))]
    .filter((sourceFile) => sourceFile.length > 0)
    .sort((left, right) => left.localeCompare(right));
}

function stableSortDraftBundle(bundle: DraftBundle): DraftBundle {
  return {
    artifacts: stableSortDraftArtifacts(bundle.artifacts),
    warnings: mergeWarnings(bundle.warnings),
  };
}

function stableSortDraftArtifacts(artifacts: DraftArtifact[]): DraftArtifact[] {
  return [...artifacts].sort((left, right) => {
    const leftIndex = ARTIFACT_ORDER.indexOf(left.kind);
    const rightIndex = ARTIFACT_ORDER.indexOf(right.kind);
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.relativePath.localeCompare(right.relativePath);
  });
}

function isDraftArtifactKind(value: unknown): value is DraftArtifactKind {
  return value === "domain" || value === "api" || value === "feature";
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function mergeWarnings(...warningSets: string[][]): string[] {
  return [...new Set(warningSets.flat().filter((warning) => typeof warning === "string" && warning.trim().length > 0))]
    .sort((left, right) => left.localeCompare(right));
}

function joinSourceFiles(sourceFiles: string[]): string {
  return normalizeSourceFiles(sourceFiles).join(", ");
}

function slugifyRoutePath(routePath: string): string {
  return routePath
    .replace(/\$\{[^}]+\}/g, "param")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
