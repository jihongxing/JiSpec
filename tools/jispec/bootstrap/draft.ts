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

const DEFAULT_EVIDENCE_GRAPH_PATH = ".spec/facts/bootstrap/evidence-graph.json";
const SESSION_ROOT = ".spec/sessions";

const ARTIFACT_PATHS: Record<DraftArtifactKind, string> = {
  domain: "drafts/domain.yaml",
  api: "drafts/api_spec.json",
  feature: "drafts/behaviors.feature",
};

const ARTIFACT_ORDER: DraftArtifactKind[] = ["domain", "api", "feature"];
const GENERIC_DOMAIN_GROUP_NAMES = new Set([
  "api",
  "app",
  "apps",
  "bootstrap",
  "client",
  "clients",
  "context",
  "contexts",
  "controller",
  "controllers",
  "design",
  "doc",
  "docs",
  "handler",
  "handlers",
  "index",
  "jiproject",
  "main",
  "manifest",
  "manifests",
  "model",
  "models",
  "package",
  "project",
  "readme",
  "route",
  "routes",
  "schema",
  "schemas",
  "server",
  "service",
  "services",
  "spec",
  "specs",
  "src",
  "test",
  "tests",
]);
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
  domainGroups: Array<{
    name: string;
    sourceFiles: string[];
    confidenceScore: number;
    provenanceNote: string;
    routeCount: number;
    testCount: number;
    schemaCount: number;
    migrationCount: number;
  }>;
  sourcePriority: string[];
  qualitySummary: DraftQualitySummary;
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

    const prompt = buildBootstrapDraftPrompt(root, sessionId, graph, context);
    const output = await provider.generate(prompt, aiConfig.options);
    const normalized = normalizeProviderDraftBundle(output, fallbackBundle, context);
    return {
      bundle: normalized,
      providerName,
      generationMode: "provider",
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

function buildBootstrapDraftPrompt(root: string, sessionId: string, graph: EvidenceGraph, context: RankedDraftContext): string {
  return [
    "# JiSpec Bootstrap Draft",
    "## Bootstrap Draft Mode",
    `- Session ID: ${sessionId}`,
    `- Repository Root: ${normalizeEvidencePath(root)}`,
    "",
    "Return a JSON object with this shape:",
    '{ "artifacts": DraftArtifact[], "warnings": string[] }',
    "Where DraftArtifact.kind is one of domain, api, feature.",
    "Each artifact must include relativePath, content, sourceFiles, confidenceScore, and provenanceNote.",
    "Favor high-confidence routes, schemas, documents, manifests, and tests over low-confidence repository noise.",
    "Prefer the first adoption loop to be concrete, reviewable, and grounded in the strongest evidence.",
    "",
    "## Ranked Evidence Summary",
    "```json",
    JSON.stringify(context.qualitySummary, null, 2),
    "```",
    "",
    "## Evidence Graph JSON",
    "```json",
    JSON.stringify(graph, null, 2),
    "```",
  ].join("\n");
}

function normalizeProviderDraftBundle(output: string, fallbackBundle: DraftBundle, context: RankedDraftContext): DraftBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return appendWarnings(fallbackBundle, [
      "AI provider output was not valid JSON; bootstrap draft used the deterministic local generator.",
    ]);
  }

  if (!parsed || typeof parsed !== "object") {
    return appendWarnings(fallbackBundle, [
      "AI provider output was not an object; bootstrap draft used the deterministic local generator.",
    ]);
  }

  const candidate = parsed as {
    artifacts?: unknown;
    warnings?: unknown;
  };

  if (!Array.isArray(candidate.artifacts)) {
    return appendWarnings(fallbackBundle, [
      "AI provider output did not include an artifacts array; bootstrap draft used the deterministic local generator.",
    ]);
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
      kind: raw.kind,
      relativePath:
        typeof raw.relativePath === "string" && raw.relativePath.trim().length > 0
          ? normalizeEvidencePath(raw.relativePath)
          : baseline.relativePath,
      content: typeof raw.content === "string" && raw.content.trim().length > 0 ? raw.content : baseline.content,
      sourceFiles: normalizeSourceFiles(
        Array.isArray(raw.sourceFiles) ? raw.sourceFiles.filter((value): value is string => typeof value === "string") : baseline.sourceFiles,
      ),
      confidenceScore:
        typeof raw.confidenceScore === "number" && Number.isFinite(raw.confidenceScore)
          ? clampScore(raw.confidenceScore)
          : baseline.confidenceScore,
      provenanceNote:
        typeof raw.provenanceNote === "string" && raw.provenanceNote.trim().length > 0
          ? raw.provenanceNote
          : baseline.provenanceNote,
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

  return stableSortDraftBundle({
    artifacts: mergedArtifacts,
    warnings: mergeWarnings(
      warnings,
      context.qualitySummary.evidenceStrength === "thin"
        ? ["Bootstrap draft used thin evidence; review all provider-generated artifacts before adoption."]
        : [],
    ),
  });
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
        domain_story: buildDomainStory(context),
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
          },
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
  const endpoints = context.topRoutes.slice(0, 12).map((route, index) => {
    const routeConfidence = getEvidenceConfidenceScore(route);
    const supportingSchemas = selectSchemasForRoute(route, context.topSchemas).slice(0, 3);
    const sourceFiles = normalizeSourceFiles([
      ...route.sourceFiles,
      ...supportingSchemas.map((schema) => schema.path),
      ...context.topDocuments.slice(0, 1).map((document) => document.path),
    ]);
    return {
      id: `${(route.method ?? "unknown").toLowerCase()}-${slugifyRoutePath(route.path) || `route-${index + 1}`}`,
      method: route.method ?? "UNKNOWN",
      path: route.path,
      source_files: sourceFiles,
      confidence_score: clampScore(0.52 + routeConfidence * 0.38),
      provenance_note: route.provenanceNote || `Derived from route evidence in ${joinSourceFiles(route.sourceFiles)}.`,
      supporting_schemas: supportingSchemas.map((schema) => ({
        path: schema.path,
        format: schema.format,
        confidence_score: getEvidenceConfidenceScore(schema),
      })),
    };
  });

  const schemas = context.topSchemas.slice(0, 12).map((schema) => ({
    path: schema.path,
    format: schema.format,
    source_files: [schema.path],
    confidence_score: clampScore(0.46 + getEvidenceConfidenceScore(schema) * 0.5),
    provenance_note: schema.provenanceNote || `Discovered as a ${schema.format} schema during bootstrap evidence scanning.`,
  }));

  const sourceFiles = normalizeSourceFiles(
    collectArtifactSourceFiles(graph, context, [
      ...endpoints.flatMap((endpoint) => endpoint.source_files),
      ...schemas.flatMap((schema) => schema.source_files),
      ...context.topDocuments.slice(0, 2).map((document) => document.path),
    ]),
  );

  const confidenceScore = clampScore(
    0.46 +
      averageConfidence(context.topRoutes.slice(0, 4)) * 0.28 +
      averageConfidence(context.topSchemas.slice(0, 4)) * 0.2 +
      averageConfidence(context.topDocuments.slice(0, 2)) * 0.05,
  );
  const provenanceNote =
    endpoints.length > 0
      ? `Derived from ${endpoints.length} ranked API surface candidate(s), ${schemas.length} schema asset(s), and ${context.topDocuments.length} supporting document(s).`
      : `Derived from schema and documentation evidence because no explicit routes were discovered.`;

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
        endpoints:
          endpoints.length > 0
            ? endpoints
            : [
                {
                  id: "bootstrap-placeholder-surface",
                  method: "UNKNOWN",
                  path: "/",
                  source_files: sourceFiles,
                  confidence_score: 0.42,
                  provenance_note: "No explicit routes were discovered; this placeholder keeps the first adoption loop visible.",
                },
              ],
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

function buildFeatureArtifact(graph: EvidenceGraph, context: RankedDraftContext): DraftArtifact {
  const topTests = context.topTests.slice(0, 6);
  const scenarios = context.topRoutes.slice(0, 6).map((route, index) => {
    const sourceFiles = normalizeSourceFiles([
      ...route.sourceFiles,
      ...selectTestsForRoute(route, topTests).map((test) => test.path),
      ...selectSchemasForRoute(route, context.topSchemas).slice(0, 2).map((schema) => schema.path),
    ]);
    const confidenceScore = clampScore(
      0.44 + getEvidenceConfidenceScore(route) * 0.3 + averageConfidence(selectTestsForRoute(route, topTests)) * 0.14,
    );
    const provenanceNote =
      route.method && route.path.startsWith("/")
        ? `Derived from ${route.method} ${route.path}, related test evidence, and supporting schema/document signals.`
        : `Derived from route candidate source evidence in ${joinSourceFiles(sourceFiles)}.`;
    const scenarioName =
      route.method && route.path
        ? `${route.method} ${route.path} remains reviewable during the first adoption loop`
        : `Route candidate ${index + 1} remains reviewable during the first adoption loop`;

    return {
      scenarioName,
      route,
      sourceFiles,
      confidenceScore,
      provenanceNote,
      tests: selectTestsForRoute(route, topTests).map((test) => test.path),
    };
  });

  const fallbackScenario = {
    scenarioName: "Bootstrap discovery artifacts remain reviewable after adoption",
    route: undefined,
    sourceFiles: normalizeSourceFiles(
      collectArtifactSourceFiles(graph, context, [
        ...context.topDocuments.slice(0, 2).map((document) => document.path),
        ...topTests.slice(0, 2).map((test) => test.path),
        ...context.topSchemas.slice(0, 2).map((schema) => schema.path),
      ]),
    ),
    confidenceScore: clampScore(0.36 + averageConfidence(context.topDocuments.slice(0, 2)) * 0.16 + averageConfidence(topTests) * 0.1),
    provenanceNote: "No explicit routes were discovered, so the initial behavior draft is grounded in repository-wide bootstrap evidence.",
    tests: topTests.slice(0, 2).map((test) => test.path),
  };

  const selectedScenarios = scenarios.length > 0 ? scenarios : [fallbackScenario];
  const sourceFiles = normalizeSourceFiles(
    selectedScenarios.flatMap((scenario) => scenario.sourceFiles).concat(topTests.slice(0, 3).map((test) => test.path)),
  );
  const confidenceScore = clampScore(
    0.42 +
      averageConfidence(selectedScenarios.map((scenario) => ({ confidenceScore: scenario.confidenceScore }))) * 0.24 +
      averageConfidence(topTests.slice(0, 3)) * 0.17 +
      averageConfidence(context.topDocuments.slice(0, 2)) * 0.06,
  );
  const provenanceNote =
    scenarios.length > 0
      ? `Derived from ${selectedScenarios.length} ranked route-backed behavior candidate(s), ${topTests.length} prioritized test asset(s), and ${context.topDocuments.length} supporting document(s).`
      : "Derived from repository bootstrap evidence because no explicit route-backed behaviors were discovered.";

  const lines: string[] = [
    `# source_files: ${JSON.stringify(sourceFiles)}`,
    `# confidence_score: ${confidenceScore}`,
    `# provenance_note: ${provenanceNote}`,
    "Feature: Bootstrap discovered behaviors",
    "",
  ];

  for (const scenario of selectedScenarios) {
    lines.push(`  # source_files: ${JSON.stringify(scenario.sourceFiles)}`);
    lines.push(`  # confidence_score: ${scenario.confidenceScore}`);
    lines.push(`  # provenance_note: ${scenario.provenanceNote}`);
    lines.push(`  Scenario: ${scenario.scenarioName}`);
    if (scenario.route?.method && scenario.route?.path) {
      lines.push(`    Given bootstrap discover found "${scenario.route.method} ${scenario.route.path}"`);
      lines.push(`    And the strongest source file is "${scenario.sourceFiles[0] ?? "unknown"}"`);
    } else {
      lines.push("    Given bootstrap discover produced repository-wide evidence");
      lines.push(`    And the strongest signals came from "${scenario.sourceFiles[0] ?? "unknown"}"`);
    }
    if (scenario.tests.length > 0) {
      lines.push(`    And test evidence includes "${scenario.tests[0]}"`);
    }
    lines.push("    When the first draft contract bundle is adopted");
    lines.push("    Then the behavior should remain reviewable as a visible contract asset");
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

function buildDomainGroups(graph: EvidenceGraph, context: Pick<RankedDraftContext, "topRoutes" | "topSchemas" | "topTests" | "topDocuments" | "topMigrations">): Array<{
  name: string;
  sourceFiles: string[];
  confidenceScore: number;
  provenanceNote: string;
  routeCount: number;
  testCount: number;
  schemaCount: number;
  migrationCount: number;
}> {
  const groups = new Map<
    string,
    {
      sourceFiles: Set<string>;
      routeCount: number;
      testCount: number;
      schemaCount: number;
      migrationCount: number;
      inferredFromContexts: boolean;
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
        inferredFromContexts,
      });
    }

    return groups.get(name)!;
  };

  const registerSource = (
    sourceFile: string,
    increment: keyof Omit<ReturnType<typeof ensureGroup>, "sourceFiles" | "inferredFromContexts">,
    preferredGroupName?: string,
  ) => {
    const groupName = preferredGroupName ?? inferDomainGroupName(sourceFile);
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

  for (const sourceFile of graph.sourceFiles) {
    const groupName = inferDomainGroupName(sourceFile.path);
    const group = ensureGroup(groupName, sourceFile.path.startsWith("contexts/"));
    group.sourceFiles.add(sourceFile.path);
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
      inferredFromContexts: false,
    });
  }

  return [...groups.entries()]
    .map(([name, group]) => {
      const sourceFiles = normalizeSourceFiles([...group.sourceFiles]);
      const confidenceScore = clampScore(
        0.34 +
          (group.routeCount > 0 ? 0.12 : 0) +
          (group.schemaCount > 0 ? 0.1 : 0) +
          (group.testCount > 0 ? 0.06 : 0) +
          (group.inferredFromContexts ? 0.1 : 0.04) +
          Math.min(sourceFiles.length * 0.015, 0.12),
      );

      return {
        name,
        sourceFiles,
        confidenceScore,
        provenanceNote: group.inferredFromContexts
          ? `Inferred from files under the ${name} bounded-context path and related evidence.`
          : `Inferred from repository path grouping around ${name}.`,
        routeCount: group.routeCount,
        testCount: group.testCount,
        schemaCount: group.schemaCount,
        migrationCount: group.migrationCount,
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
  const topRoutes = rankRoutes(graph.routes).slice(0, 12);
  const topSchemas = rankSchemas(graph.schemas).slice(0, 12);
  const topTests = rankTests(graph.tests).slice(0, 12);
  const topDocuments = rankDocuments(graph.documents ?? []).slice(0, 10);
  const topManifests = rankManifests(graph.manifests ?? []).slice(0, 6);
  const topMigrations = rankMigrations(graph.migrations).slice(0, 6);
  const domainGroups = buildDomainGroups(graph, {
    topRoutes,
    topSchemas,
    topTests,
    topDocuments,
    topMigrations,
  });

  const sourcePriority = normalizeSourceFiles([
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
  const manifestSignalsUsed = topManifests.slice(0, 5).map((manifest) => `${manifest.path} (${manifest.kind}, ${Math.round(getEvidenceConfidenceScore(manifest) * 100)}%)`);
  const specificPrimaryContexts = domainGroups
    .map((group) => group.name)
    .filter((name) => name !== "bootstrap" && !GENERIC_DOMAIN_GROUP_NAMES.has(name));
  const primaryContextNames = (specificPrimaryContexts.length > 0 ? specificPrimaryContexts : domainGroups.map((group) => group.name)).slice(0, 4);

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
    domainGroups,
    sourcePriority,
    qualitySummary: {
      routeSignalsUsed,
      schemaSignalsUsed,
      testSignalsUsed,
      documentSignalsUsed,
      manifestSignalsUsed,
      primaryContextNames,
      evidenceStrength,
    },
  };
}

function buildDomainStory(context: RankedDraftContext): string[] {
  const story: string[] = [];

  if (context.qualitySummary.primaryContextNames.length > 0) {
    story.push(`Primary bounded contexts appear to be ${context.qualitySummary.primaryContextNames.join(", ")}.`);
  }

  if (context.topRoutes.length > 0) {
    story.push(`The strongest contract surface is ${formatRouteEvidence(context.topRoutes[0])}.`);
  }

  if (context.topSchemas.length > 0) {
    story.push(`Schema evidence is led by ${context.topSchemas[0].path}.`);
  }

  if (context.topDocuments.length > 0) {
    story.push(`Documentation context is anchored by ${context.topDocuments[0].path}.`);
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

function inferDomainGroupName(repoPath: string): string {
  const normalizedPath = normalizeEvidencePath(repoPath);
  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "bootstrap";
  }

  if (segments[0] === "contexts" && segments[1]) {
    return normalizeDomainGroupLabel(segments[1]) || "bootstrap";
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
  const basenameLabel = normalizeDomainGroupLabel(
    basename
      .replace(/\.[^.]+$/g, "")
      .replace(/\.(schema|test|spec)$/g, "")
      .replace(/(?:^|[-_.])(route|routes|router|controller|controllers|service|services|handler|handlers|model|models|api|index|main|server)$/g, ""),
  );
  if (basenameLabel && !GENERIC_DOMAIN_GROUP_NAMES.has(basenameLabel)) {
    return basenameLabel;
  }

  const specificSegment = findLastSpecificSegment(segments);
  if (specificSegment) {
    return specificSegment;
  }

  const topLevel = normalizeDomainGroupLabel(segments[0]);
  return topLevel && !GENERIC_DOMAIN_GROUP_NAMES.has(topLevel) ? topLevel : "bootstrap";
}

function inferRouteGroupName(route: EvidenceRoute): string {
  const routeKeyword = extractRouteKeywords(route.path)
    .map((keyword) => normalizeDomainGroupLabel(keyword))
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

function findLastSpecificSegment(segments: string[]): string | undefined {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const label = normalizeDomainGroupLabel(segments[index]);
    if (label && !GENERIC_DOMAIN_GROUP_NAMES.has(label)) {
      return label;
    }
  }

  return undefined;
}

function normalizeDomainGroupLabel(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/\.[^.]+$/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!cleaned) {
    return "";
  }

  if (cleaned.endsWith("ies") && cleaned.length > 4) {
    return `${cleaned.slice(0, -3)}y`;
  }

  if (cleaned.endsWith("s") && cleaned.length > 4 && !cleaned.endsWith("ss")) {
    return cleaned.slice(0, -1);
  }

  return cleaned;
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
