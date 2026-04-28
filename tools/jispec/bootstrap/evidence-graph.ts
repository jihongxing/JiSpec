export interface EvidenceSourceRef {
  path: string;
  kind: "route" | "test" | "schema" | "migration" | "document" | "manifest" | "feature" | "source";
}

export interface EvidenceSignal {
  confidenceScore?: number;
  provenanceNote?: string;
}

export interface EvidenceRoute extends EvidenceSignal {
  path: string;
  method?: string;
  sourceFiles: string[];
  signal?: "http_signature" | "route_candidate";
}

export interface EvidenceTest extends EvidenceSignal {
  path: string;
  frameworkHint?: string;
  signal?: "test_directory" | "test_suffix" | "jispec_asset" | "script_test";
}

export interface EvidenceSchema extends EvidenceSignal {
  path: string;
  format: "openapi" | "json-schema" | "protobuf" | "database-schema" | "unknown";
  signal?: "openapi_file" | "json_schema_file" | "protobuf_file" | "database_schema_file" | "schema_directory";
}

export interface EvidenceMigration extends EvidenceSignal {
  path: string;
  toolHint?: string;
  signal?: "migration_directory" | "migration_filename";
}

export interface EvidenceDocument extends EvidenceSignal {
  path: string;
  kind: "readme" | "requirements" | "architecture" | "contract" | "context";
}

export interface EvidenceManifest extends EvidenceSignal {
  path: string;
  kind:
    | "package-json"
    | "tsconfig"
    | "pyproject"
    | "requirements"
    | "pom"
    | "build-gradle"
    | "cargo"
    | "go-mod"
    | "gemfile"
    | "composer";
}

export interface EvidenceSourceFile {
  path: string;
  category:
    | "route"
    | "controller"
    | "service"
    | "test"
    | "schema"
    | "migration"
    | "feature"
    | "document"
    | "manifest"
    | "interface"
    | "trait"
    | "entrypoint"
    | "sdk"
    | "other";
}

export interface EvidenceExclusionRuleSummary {
  ruleId: string;
  reason: string;
  fileCount: number;
  examplePaths: string[];
}

export interface EvidenceExclusionSummary {
  totalExcludedFileCount: number;
  rules: EvidenceExclusionRuleSummary[];
}

export interface EvidenceGraph {
  repoRoot: string;
  generatedAt: string;
  routes: EvidenceRoute[];
  tests: EvidenceTest[];
  schemas: EvidenceSchema[];
  migrations: EvidenceMigration[];
  documents: EvidenceDocument[];
  manifests: EvidenceManifest[];
  sourceFiles: EvidenceSourceFile[];
  excludedSummary?: EvidenceExclusionSummary;
  warnings: string[];
}

export interface BootstrapDiscoverSummary {
  routeCount: number;
  testCount: number;
  schemaCount: number;
  migrationCount: number;
  documentCount: number;
  manifestCount: number;
  sourceFileCount: number;
  highConfidenceRouteCount: number;
  highConfidenceTestCount: number;
}

export interface BootstrapDiscoverResult {
  graph: EvidenceGraph;
  writtenFiles: string[];
  warningCount: number;
  summary: BootstrapDiscoverSummary;
}

export function normalizeEvidencePath(input: string): string {
  return input.replace(/\\/g, "/");
}

export function getEvidenceConfidenceScore(signal?: EvidenceSignal): number {
  if (!signal || typeof signal.confidenceScore !== "number" || Number.isNaN(signal.confidenceScore)) {
    return 0;
  }

  return Math.max(0, Math.min(1, signal.confidenceScore));
}

export function createEmptyEvidenceGraph(repoRoot: string): EvidenceGraph {
  return {
    repoRoot: normalizeEvidencePath(repoRoot),
    generatedAt: new Date().toISOString(),
    routes: [],
    tests: [],
    schemas: [],
    migrations: [],
    documents: [],
    manifests: [],
    sourceFiles: [],
    excludedSummary: {
      totalExcludedFileCount: 0,
      rules: [],
    },
    warnings: [],
  };
}

export function summarizeEvidenceGraph(graph: EvidenceGraph): BootstrapDiscoverSummary {
  return {
    routeCount: (graph.routes ?? []).length,
    testCount: (graph.tests ?? []).length,
    schemaCount: (graph.schemas ?? []).length,
    migrationCount: (graph.migrations ?? []).length,
    documentCount: (graph.documents ?? []).length,
    manifestCount: (graph.manifests ?? []).length,
    sourceFileCount: (graph.sourceFiles ?? []).length,
    highConfidenceRouteCount: (graph.routes ?? []).filter((route) => getEvidenceConfidenceScore(route) >= 0.8).length,
    highConfidenceTestCount: (graph.tests ?? []).filter((test) => getEvidenceConfidenceScore(test) >= 0.8).length,
  };
}

export function stableSortEvidenceGraph(graph: EvidenceGraph): EvidenceGraph {
  const routes = Array.isArray(graph.routes) ? graph.routes : [];
  const tests = Array.isArray(graph.tests) ? graph.tests : [];
  const schemas = Array.isArray(graph.schemas) ? graph.schemas : [];
  const migrations = Array.isArray(graph.migrations) ? graph.migrations : [];
  const documents = Array.isArray(graph.documents) ? graph.documents : [];
  const manifests = Array.isArray(graph.manifests) ? graph.manifests : [];
  const sourceFiles = Array.isArray(graph.sourceFiles) ? graph.sourceFiles : [];
  const excludedSummary = normalizeExclusionSummary(graph.excludedSummary);
  const warnings = Array.isArray(graph.warnings) ? graph.warnings : [];

  return {
    repoRoot: normalizeEvidencePath(graph.repoRoot),
    generatedAt: graph.generatedAt,
    routes: [...routes].sort((left, right) =>
      compareSignalThenKey(
        left,
        right,
        `${left.path}|${left.method ?? ""}|${(left.sourceFiles ?? []).join(",")}|${left.signal ?? ""}`,
        `${right.path}|${right.method ?? ""}|${(right.sourceFiles ?? []).join(",")}|${right.signal ?? ""}`,
      )),
    tests: [...tests].sort((left, right) =>
      compareSignalThenKey(
        left,
        right,
        `${left.path}|${left.frameworkHint ?? ""}|${left.signal ?? ""}`,
        `${right.path}|${right.frameworkHint ?? ""}|${right.signal ?? ""}`,
      )),
    schemas: [...schemas].sort((left, right) =>
      compareSignalThenKey(
        left,
        right,
        `${left.path}|${left.format}|${left.signal ?? ""}`,
        `${right.path}|${right.format}|${right.signal ?? ""}`,
      )),
    migrations: [...migrations].sort((left, right) =>
      compareSignalThenKey(
        left,
        right,
        `${left.path}|${left.toolHint ?? ""}|${left.signal ?? ""}`,
        `${right.path}|${right.toolHint ?? ""}|${right.signal ?? ""}`,
      )),
    documents: [...documents].sort((left, right) =>
      compareSignalThenKey(left, right, `${left.path}|${left.kind}`, `${right.path}|${right.kind}`)),
    manifests: [...manifests].sort((left, right) =>
      compareSignalThenKey(left, right, `${left.path}|${left.kind}`, `${right.path}|${right.kind}`)),
    sourceFiles: [...sourceFiles].sort((left, right) => {
      const leftKey = `${left.path}|${left.category}`;
      const rightKey = `${right.path}|${right.category}`;
      return leftKey.localeCompare(rightKey);
    }),
    excludedSummary,
    warnings: [...warnings].sort((left, right) => left.localeCompare(right)),
  };
}

function normalizeExclusionSummary(summary: EvidenceExclusionSummary | undefined): EvidenceExclusionSummary {
  if (!summary || !Array.isArray(summary.rules)) {
    return {
      totalExcludedFileCount: 0,
      rules: [],
    };
  }

  const rules = summary.rules
    .map((rule) => ({
      ruleId: rule.ruleId,
      reason: rule.reason,
      fileCount: Number.isFinite(rule.fileCount) ? Math.max(0, Math.trunc(rule.fileCount)) : 0,
      examplePaths: Array.isArray(rule.examplePaths)
        ? [...rule.examplePaths].map((entry) => normalizeEvidencePath(entry)).sort((left, right) => left.localeCompare(right)).slice(0, 5)
        : [],
    }))
    .filter((rule) => rule.ruleId && rule.fileCount > 0)
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));

  return {
    totalExcludedFileCount: rules.reduce((sum, rule) => sum + rule.fileCount, 0),
    rules,
  };
}

function compareSignalThenKey(
  left: EvidenceSignal,
  right: EvidenceSignal,
  leftKey: string,
  rightKey: string,
): number {
  const confidenceDelta = getEvidenceConfidenceScore(right) - getEvidenceConfidenceScore(left);
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }

  return leftKey.localeCompare(rightKey);
}
