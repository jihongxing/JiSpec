import fs from "node:fs";
import path from "node:path";
import { FilesystemStorage } from "../filesystem-storage";
import { validateRepository } from "../validator";
import { bootstrapProjectExists, runBootstrapInitProject } from "./init-project";
import {
  type BootstrapDiscoverResult,
  type BootstrapDiscoverSummary,
  createEmptyEvidenceGraph,
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
  type EvidenceSourceFile,
  type EvidenceTest,
} from "./evidence-graph";
import { EvidenceExclusionSummaryBuilder, getEvidenceExclusionMatch } from "./evidence-filter";
import {
  buildContractSourceAdapterReport,
  renderContractSourceAdapterLines,
} from "./contract-source-adapters";
import {
  buildAdoptionRankedEvidence,
  buildBootstrapFullInventory,
  renderAdoptionRankedEvidenceLines,
} from "./evidence-ranking";
import {
  HUMAN_SUMMARY_COMPANION_NOTE,
  renderHumanDecisionSnapshot,
} from "../human-decision-packet";

const DEFAULT_EVIDENCE_OUTPUT = ".spec/facts/bootstrap/evidence-graph.json";
const DEFAULT_EVIDENCE_SUMMARY = "evidence-summary.txt";
const DEFAULT_BOOTSTRAP_SUMMARY = "bootstrap-summary.md";
const DEFAULT_FULL_INVENTORY = "full-inventory.json";
const DEFAULT_ADOPTION_RANKED_EVIDENCE = "adoption-ranked-evidence.json";
const DEFAULT_CONTRACT_SOURCE_ADAPTERS = "contract-source-adapters.json";
const ROUTE_FILE_HINT = /(route|routes|router|controller|controllers|api)/i;
const CONTROLLER_FILE_HINT = /controller/i;
const SERVICE_FILE_HINT = /service/i;
const DOCUMENT_EXTENSIONS = new Set([".md", ".mdx"]);
const DOCUMENT_DIRECTORY_SEGMENTS = new Set(["docs", "design"]);
const NON_PRODUCTION_SIGNAL_SEGMENTS = new Set([
  "docs",
  "templates",
  "template",
  "examples",
  "example",
  "fixtures",
  "__fixtures__",
  "__mocks__",
  "coverage",
]);
const HTTP_METHOD_PATTERN =
  /\b(?:router|app)\.(get|post|put|patch|delete|options|head)\s*\(\s*["'`](\/[^"'`]*)["'`]/gi;
const FALLBACK_HTTP_PATTERN = /\b(get|post|put|patch|delete)\s*\(\s*["'`](\/[^"'`]*)["'`]/gi;
const CODE_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".java",
  ".rb",
  ".php",
  ".cs",
  ".kt",
  ".rs",
  ".swift",
]);

export interface BootstrapDiscoverOptions {
  root: string;
  outputPath?: string;
  writeFile?: boolean;
  initProject?: boolean;
  includeNoise?: boolean;
}

export function runBootstrapDiscover(options: BootstrapDiscoverOptions): BootstrapDiscoverResult {
  const root = path.resolve(options.root);
  if (!fs.existsSync(root)) {
    throw new Error(`Repository root does not exist: ${root}`);
  }

  const scaffoldResult = options.initProject
    ? runBootstrapInitProject({ root })
    : undefined;
  const graph = stableSortEvidenceGraph(scanRepository(root, { includeNoise: options.includeNoise }));
  const summary = summarizeEvidenceGraph(graph);
  const writtenFiles =
    options.writeFile === false
      ? scaffoldResult?.writtenFiles ?? []
      : [
          ...(scaffoldResult?.writtenFiles ?? []),
          ...writeEvidenceGraph(root, options.outputPath ?? DEFAULT_EVIDENCE_OUTPUT, graph),
        ].sort((left, right) => left.localeCompare(right));

  return {
    graph,
    writtenFiles,
    warningCount: graph.warnings.length,
    summary,
  };
}

export function renderBootstrapDiscoverText(result: BootstrapDiscoverResult): string {
  const lines = [
    `Bootstrap discover complete for \`${result.graph.repoRoot}\`.`,
    `Contract signals: ${result.summary.highConfidenceRouteCount} high-confidence route(s), ${result.summary.schemaCount} schema asset(s), ${result.summary.testCount} test asset(s)`,
    `Routes discovered: ${result.summary.routeCount}`,
    `Tests discovered: ${result.summary.testCount}`,
    `Schemas discovered: ${result.summary.schemaCount}`,
    `Migrations discovered: ${result.summary.migrationCount}`,
    `Documents discovered: ${result.summary.documentCount}`,
    `Manifests discovered: ${result.summary.manifestCount}`,
    `Source files inventoried: ${result.summary.sourceFileCount}`,
    `Excluded files: ${result.graph.excludedSummary?.totalExcludedFileCount ?? 0}`,
    `Warnings: ${result.warningCount}`,
  ];

  const topRoutes = result.graph.routes
    .filter((route) => getEvidenceConfidenceScore(route) >= 0.5)
    .slice(0, 5)
    .map((route) => formatRouteSignal(route));
  if (topRoutes.length > 0) {
    lines.push("Top route candidates:");
    lines.push(...topRoutes.map((entry) => `- ${entry}`));
  }

  const topManifests = result.graph.manifests.slice(0, 5).map((manifest) => `${manifest.path} (${manifest.kind})`);
  if (topManifests.length > 0) {
    lines.push("Detected manifests:");
    lines.push(...topManifests.map((entry) => `- ${entry}`));
  }

  const topDocuments = result.graph.documents.slice(0, 5).map((document) => `${document.path} (${document.kind})`);
  if (topDocuments.length > 0) {
    lines.push("Detected documents:");
    lines.push(...topDocuments.map((entry) => `- ${entry}`));
  }

  const rankedEvidence = buildAdoptionRankedEvidence(result.graph, { limit: 10 });
  const topRankedEvidence = renderAdoptionRankedEvidenceLines(rankedEvidence, 10);
  if (topRankedEvidence.length > 0) {
    lines.push("Top adoption-ranked evidence:");
    lines.push(...topRankedEvidence.map((entry) => `- ${entry}`));
  }

  const adapterReport = buildContractSourceAdapterReport(result.graph);
  const adapterLines = renderContractSourceAdapterLines(adapterReport, 8);
  if (adapterLines.length > 0) {
    lines.push("Contract source adapters:");
    lines.push(...adapterLines.map((entry) => `- ${entry}`));
  }

  const excludedRules = result.graph.excludedSummary?.rules ?? [];
  if (excludedRules.length > 0) {
    lines.push("Excluded by policy:");
    lines.push(
      ...excludedRules.map((rule) => {
        const examples = rule.examplePaths.length > 0 ? `; examples: ${rule.examplePaths.join(", ")}` : "";
        const optInHint = rule.optInHint ? `; opt in: ${rule.optInHint}` : "";
        return `- ${rule.ruleId}: ${rule.fileCount} file(s) (${rule.reason})${examples}${optInHint}`;
      }),
    );
  }

  if (result.writtenFiles.length > 0) {
    lines.push("Written files:");
    lines.push(...result.writtenFiles.map((filePath) => `- ${filePath}`));
  } else {
    lines.push("Written files: none (`--no-write` mode)");
  }

  if (result.graph.warnings.length > 0) {
    lines.push("Warnings:");
    lines.push(...result.graph.warnings.map((warning) => `- ${warning}`));
  }

  return lines.join("\n");
}

export function renderBootstrapSummaryMarkdown(result: BootstrapDiscoverResult): string {
  return [
    "# Bootstrap Summary",
    "",
    ...renderHumanDecisionSnapshot({
      currentState: `bootstrap evidence inventory captured for \`${result.graph.repoRoot}\``,
      risk: result.warningCount > 0
        ? `${result.warningCount} warning(s) need owner review before draft adoption`
        : "no bootstrap discover warnings recorded",
      evidence: [
        "`evidence-graph.json`",
        "`full-inventory.json`",
        "`adoption-ranked-evidence.json`",
        "`contract-source-adapters.json`",
      ],
      owner: "repo owner",
      nextCommand: "`npm run jispec-cli -- bootstrap draft --root .`",
    }),
    `${HUMAN_SUMMARY_COMPANION_NOTE} Machine consumers should use \`evidence-graph.json\`, \`full-inventory.json\`, \`adoption-ranked-evidence.json\`, and \`contract-source-adapters.json\`.`,
    "",
    "```text",
    renderBootstrapDiscoverText(result),
    "```",
    "",
  ].join("\n");
}

function scanRepository(root: string, options: { includeNoise?: boolean } = {}): EvidenceGraph {
  const graph = createEmptyEvidenceGraph(root);
  const repositoryScan = collectRepositoryFiles(root, { includeNoise: options.includeNoise });
  const repositoryFiles = repositoryScan.files;
  graph.excludedSummary = repositoryScan.excludedSummary;

  graph.schemas = collectSchemaEvidence(root, repositoryFiles);
  graph.tests = collectTestEvidence(root, repositoryFiles);
  graph.migrations = collectMigrationEvidence(root, repositoryFiles);
  graph.routes = collectRouteEvidence(root, repositoryFiles);
  graph.documents = collectDocumentEvidence(root, repositoryFiles);
  graph.manifests = collectManifestEvidence(root, repositoryFiles);
  graph.sourceFiles = collectSourceFileInventory(root, repositoryFiles);

  const validation = validateRepository(root);
  if (!validation.ok) {
    const missingProjectYaml = !bootstrapProjectExists(root);
    const validationIssues = missingProjectYaml
      ? validation.issues.filter((issue) => !isMissingProjectYamlIssue(issue))
      : validation.issues;

    if (missingProjectYaml) {
      graph.warnings.push(
        "Project scaffold is missing. Run `jispec-cli bootstrap init-project --root <path>` or `jispec-cli bootstrap discover --init-project` to create `jiproject/project.yaml`.",
      );
    }

    if (validationIssues.length > 0) {
      graph.warnings.push(`Repository validation reported ${validationIssues.length} issue(s); bootstrap discover continued in warning mode.`);
      graph.warnings.push(
        ...validationIssues.map((issue) => `[${issue.code}] ${normalizeEvidencePath(issue.path)}: ${issue.message}`),
      );
    }
  }

  applyHeuristicWarnings(graph, repositoryFiles.length);

  return graph;
}

function isMissingProjectYamlIssue(issue: { code: string; path: string }): boolean {
  return issue.code === "FILE_MISSING" && normalizeEvidencePath(issue.path) === "jiproject/project.yaml";
}

function collectSchemaEvidence(root: string, files: string[]): EvidenceSchema[] {
  const seen = new Set<string>();
  const schemas: EvidenceSchema[] = [];

  for (const absolutePath of files) {
    const repoPath = normalizeRepoPath(root, absolutePath);
    const lowerPath = repoPath.toLowerCase();
    const extension = path.extname(repoPath).toLowerCase();
    const fileName = path.basename(repoPath).toLowerCase();

    let format: EvidenceSchema["format"] | undefined;
    let signal: EvidenceSchema["signal"] | undefined;
    let confidenceScore = 0;
    let provenanceNote = "";

    if (extension === ".proto") {
      format = "protobuf";
      signal = "protobuf_file";
      confidenceScore = 0.98;
      provenanceNote = "Detected `.proto` schema source.";
    } else if (/openapi|swagger/.test(fileName) && [".yaml", ".yml", ".json"].includes(extension)) {
      format = "openapi";
      signal = "openapi_file";
      confidenceScore = 0.96;
      provenanceNote = "File name matched OpenAPI/Swagger naming convention.";
    } else if ([".graphql", ".gql"].includes(extension)) {
      format = "graphql";
      signal = "graphql_schema_file";
      confidenceScore = 0.93;
      provenanceNote = "Detected GraphQL schema source.";
    } else if ((lowerPath.startsWith("schemas/") || fileName.endsWith(".schema.json")) && extension === ".json") {
      format = "json-schema";
      signal = fileName.endsWith(".schema.json") ? "json_schema_file" : "schema_directory";
      confidenceScore = fileName.endsWith(".schema.json") ? 0.94 : 0.88;
      provenanceNote =
        signal === "json_schema_file"
          ? "Detected explicit `.schema.json` contract asset."
          : "Detected JSON schema-like asset under `schemas/`.";
    } else if ((lowerPath.startsWith("schemas/") || fileName.endsWith(".schema.yaml") || fileName.endsWith(".schema.yml")) && [".yaml", ".yml"].includes(extension)) {
      format = "unknown";
      signal = "schema_directory";
      confidenceScore = 0.72;
      provenanceNote = "Detected schema-like YAML asset under a schema naming convention.";
    } else if (fileName === "schema.prisma" || lowerPath.endsWith("/schema.prisma")) {
      format = "database-schema";
      signal = "database_schema_file";
      confidenceScore = 0.94;
      provenanceNote = "Detected Prisma database schema truth source.";
    } else if (extension === ".sql" && /(^|\/)(schema|db|database|migrations?)\//.test(lowerPath)) {
      format = "database-schema";
      signal = "database_schema_file";
      confidenceScore = 0.86;
      provenanceNote = "Detected SQL database schema or migration-adjacent contract asset.";
    }

    if (!format || seen.has(repoPath)) {
      continue;
    }

    seen.add(repoPath);
    schemas.push({ path: repoPath, format, signal, confidenceScore, provenanceNote });
  }

  return schemas;
}

function collectTestEvidence(root: string, files: string[]): EvidenceTest[] {
  const seen = new Set<string>();
  const tests: EvidenceTest[] = [];

  for (const absolutePath of files) {
    const repoPath = normalizeRepoPath(root, absolutePath);
    const detected = detectTestSignal(repoPath);
    if (!detected || shouldIgnoreTestSignal(repoPath)) {
      continue;
    }

    if (seen.has(repoPath)) {
      continue;
    }

    seen.add(repoPath);
    tests.push({
      path: repoPath,
      frameworkHint: inferTestFrameworkHint(repoPath),
      signal: detected.signal,
      confidenceScore: detected.confidenceScore,
      provenanceNote: detected.provenanceNote,
    });
  }

  return tests;
}

function collectMigrationEvidence(root: string, files: string[]): EvidenceMigration[] {
  const seen = new Set<string>();
  const migrations: EvidenceMigration[] = [];

  for (const absolutePath of files) {
    const repoPath = normalizeRepoPath(root, absolutePath);
    const signal = detectMigrationSignal(repoPath);
    if (!signal) {
      continue;
    }

    if (seen.has(repoPath)) {
      continue;
    }

    seen.add(repoPath);
    migrations.push({
      path: repoPath,
      toolHint: inferMigrationToolHint(repoPath),
      signal: signal.signal,
      confidenceScore: signal.confidenceScore,
      provenanceNote: signal.provenanceNote,
    });
  }

  return migrations;
}

function collectRouteEvidence(root: string, files: string[]): EvidenceRoute[] {
  const seen = new Set<string>();
  const routes: EvidenceRoute[] = [];

  for (const absolutePath of files) {
    const repoPath = normalizeRepoPath(root, absolutePath);
    if (!isRouteCandidateFile(repoPath) || shouldIgnoreRouteSignal(repoPath)) {
      continue;
    }

    const content = safelyReadTextFile(absolutePath);
    const matches = content ? extractRouteMatches(content) : [];

    if (matches.length > 0) {
      for (const match of matches) {
        const route: EvidenceRoute = {
          path: match.path,
          method: match.method,
          sourceFiles: [repoPath],
          signal: "http_signature",
          confidenceScore: 0.96,
          provenanceNote: `Detected HTTP route signature in ${repoPath}.`,
        };
        const key = `${route.path}|${route.method ?? ""}|${repoPath}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        routes.push(route);
      }
      continue;
    }

    if (!isFallbackRouteCandidate(repoPath)) {
      continue;
    }

    const key = `${repoPath}|candidate|${repoPath}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    routes.push({
      path: repoPath,
      sourceFiles: [repoPath],
      signal: "route_candidate",
      confidenceScore: 0.34,
      provenanceNote: `Route-like source file discovered without an explicit HTTP signature: ${repoPath}.`,
    });
  }

  return routes;
}

function collectDocumentEvidence(root: string, files: string[]): EvidenceDocument[] {
  const seen = new Set<string>();
  const documents: EvidenceDocument[] = [];

  for (const absolutePath of files) {
    const repoPath = normalizeRepoPath(root, absolutePath);
    const detected = detectDocumentSignal(repoPath);
    if (!detected || seen.has(repoPath)) {
      continue;
    }

    seen.add(repoPath);
    documents.push({
      path: repoPath,
      kind: detected.kind,
      confidenceScore: detected.confidenceScore,
      provenanceNote: detected.provenanceNote,
    });
  }

  return documents;
}

function collectManifestEvidence(root: string, files: string[]): EvidenceManifest[] {
  const seen = new Set<string>();
  const manifests: EvidenceManifest[] = [];

  for (const absolutePath of files) {
    const repoPath = normalizeRepoPath(root, absolutePath);
    const detected = detectManifestSignal(repoPath);
    if (!detected || seen.has(repoPath)) {
      continue;
    }

    seen.add(repoPath);
    manifests.push({
      path: repoPath,
      kind: detected.kind,
      confidenceScore: detected.confidenceScore,
      provenanceNote: detected.provenanceNote,
    });
  }

  return manifests;
}

function collectSourceFileInventory(root: string, files: string[]): EvidenceSourceFile[] {
  return files.map((absolutePath) => {
    const repoPath = normalizeRepoPath(root, absolutePath);
    return {
      path: repoPath,
      category: classifySourceFile(repoPath, absolutePath),
    };
  });
}

function writeEvidenceGraph(root: string, outputPath: string, graph: EvidenceGraph): string[] {
  const storage = new FilesystemStorage(root);
  const resolvedGraphPath = resolveOutputPath(root, outputPath);
  const resolvedSummaryPath = path.join(path.dirname(resolvedGraphPath), DEFAULT_EVIDENCE_SUMMARY);
  const resolvedBootstrapSummaryPath = path.join(path.dirname(resolvedGraphPath), DEFAULT_BOOTSTRAP_SUMMARY);
  const resolvedFullInventoryPath = path.join(path.dirname(resolvedGraphPath), DEFAULT_FULL_INVENTORY);
  const resolvedRankedEvidencePath = path.join(path.dirname(resolvedGraphPath), DEFAULT_ADOPTION_RANKED_EVIDENCE);
  const resolvedContractSourceAdaptersPath = path.join(path.dirname(resolvedGraphPath), DEFAULT_CONTRACT_SOURCE_ADAPTERS);
  const writtenFiles = [
    normalizeEvidencePath(resolvedGraphPath),
    normalizeEvidencePath(resolvedFullInventoryPath),
    normalizeEvidencePath(resolvedRankedEvidencePath),
    normalizeEvidencePath(resolvedContractSourceAdaptersPath),
    normalizeEvidencePath(resolvedBootstrapSummaryPath),
    normalizeEvidencePath(resolvedSummaryPath),
  ];
  const result: BootstrapDiscoverResult = {
    graph,
    writtenFiles,
    warningCount: graph.warnings.length,
    summary: summarizeEvidenceGraph(graph),
  };

  storage.writeFileSync(resolvedGraphPath, `${JSON.stringify(graph, null, 2)}\n`);
  storage.writeFileSync(resolvedFullInventoryPath, `${JSON.stringify(buildBootstrapFullInventory(graph), null, 2)}\n`);
  storage.writeFileSync(resolvedRankedEvidencePath, `${JSON.stringify(buildAdoptionRankedEvidence(graph), null, 2)}\n`);
  storage.writeFileSync(resolvedContractSourceAdaptersPath, `${JSON.stringify(buildContractSourceAdapterReport(graph), null, 2)}\n`);
  storage.writeFileSync(resolvedSummaryPath, `${renderBootstrapDiscoverText(result)}\n`);
  storage.writeFileSync(resolvedBootstrapSummaryPath, renderBootstrapSummaryMarkdown(result));

  return writtenFiles;
}

function resolveOutputPath(root: string, outputPath: string): string {
  return path.isAbsolute(outputPath) ? outputPath : path.resolve(root, outputPath);
}

function normalizeRepoPath(root: string, absolutePath: string): string {
  const relativePath = path.relative(root, absolutePath) || path.basename(absolutePath);
  return normalizeEvidencePath(relativePath);
}

function collectRepositoryFiles(root: string, options: { includeNoise?: boolean } = {}): { files: string[]; excludedSummary: NonNullable<EvidenceGraph["excludedSummary"]> } {
  const files: string[] = [];
  const exclusionSummary = new EvidenceExclusionSummaryBuilder();

  walkDirectory(root, root, files, exclusionSummary, options);

  return {
    files: files.sort((left, right) => normalizeEvidencePath(left).localeCompare(normalizeEvidencePath(right))),
    excludedSummary: exclusionSummary.toSummary(),
  };
}

function walkDirectory(
  root: string,
  currentPath: string,
  files: string[],
  exclusionSummary: EvidenceExclusionSummaryBuilder,
  options: { includeNoise?: boolean },
): void {
  const entries = fs
    .readdirSync(currentPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    const repoPath = normalizeRepoPath(root, fullPath);
    const exclusionMatch = getEvidenceExclusionMatch(repoPath, { isDirectory: entry.isDirectory(), includeNoise: options.includeNoise });

    if (entry.isDirectory()) {
      if (exclusionMatch) {
        exclusionSummary.record(exclusionMatch, repoPath, countFilesRecursively(fullPath));
        continue;
      }
      walkDirectory(root, fullPath, files, exclusionSummary, options);
      continue;
    }

    if (entry.isFile()) {
      if (exclusionMatch) {
        exclusionSummary.record(exclusionMatch, repoPath, 1);
        continue;
      }
      files.push(fullPath);
    }
  }
}

function countFilesRecursively(currentPath: string): number {
  let count = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentPath, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      count += countFilesRecursively(fullPath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }

  return count;
}

function extractRouteMatches(content: string): Array<{ path: string; method?: string }> {
  const matches: Array<{ path: string; method?: string }> = [];

  for (const pattern of [HTTP_METHOD_PATTERN, FALLBACK_HTTP_PATTERN]) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const method = typeof match[1] === "string" ? match[1].toUpperCase() : undefined;
      const routePath = typeof match[2] === "string" ? match[2] : undefined;
      if (!routePath) {
        continue;
      }
      matches.push({ path: routePath, method });
    }
  }

  return matches;
}

function safelyReadTextFile(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

function detectTestSignal(repoPath: string): Pick<EvidenceTest, "signal" | "confidenceScore" | "provenanceNote"> | undefined {
  const normalizedPath = normalizeEvidencePath(repoPath).toLowerCase();
  const fileName = path.basename(normalizedPath);
  const extension = path.extname(normalizedPath);

  if (fileName === "test-spec.yaml" || fileName === "test-plan.yaml") {
    return {
      signal: "jispec_asset",
      confidenceScore: 0.97,
      provenanceNote: "Detected JiSpec test-plan asset.",
    };
  }

  if (hasPathSegment(normalizedPath, "__tests__") || hasPathSegment(normalizedPath, "tests") || hasPathSegment(normalizedPath, "test")) {
    return {
      signal: "test_directory",
      confidenceScore: 0.92,
      provenanceNote: "Detected file inside a test directory.",
    };
  }

  if (fileName.includes(".test.") || fileName.includes(".spec.")) {
    return {
      signal: "test_suffix",
      confidenceScore: 0.91,
      provenanceNote: "Detected test suffix in file name.",
    };
  }

  if ((normalizedPath.startsWith("scripts/test-") || normalizedPath.includes("/scripts/test-")) && [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
    return {
      signal: "script_test",
      confidenceScore: 0.8,
      provenanceNote: "Detected script-based regression test harness.",
    };
  }

  if (/^test_.*\.py$/.test(fileName) || /.*_test\.go$/.test(fileName) || /^test.*\.java$/.test(fileName)) {
    return {
      signal: "test_suffix",
      confidenceScore: 0.88,
      provenanceNote: "Detected language-specific test naming convention.",
    };
  }

  return undefined;
}

function inferTestFrameworkHint(repoPath: string): string | undefined {
  const normalizedPath = repoPath.toLowerCase();
  const fileName = path.basename(normalizedPath);
  const extension = path.extname(normalizedPath);

  if (fileName === "test-spec.yaml" || fileName === "test-plan.yaml") {
    return "jispec";
  }
  if (fileName.endsWith(".feature")) {
    return "gherkin";
  }
  if (normalizedPath.startsWith("scripts/test-") || normalizedPath.includes("/scripts/test-")) {
    return "node";
  }
  if (fileName.includes(".test.") || fileName.includes(".spec.") || normalizedPath.includes("/__tests__/")) {
    return "node";
  }
  if (extension === ".py") {
    return "pytest";
  }
  if (extension === ".go") {
    return "go-test";
  }

  return "unknown";
}

function detectMigrationSignal(repoPath: string): Pick<EvidenceMigration, "signal" | "confidenceScore" | "provenanceNote"> | undefined {
  const normalizedPath = normalizeEvidencePath(repoPath).toLowerCase();
  const fileName = path.basename(normalizedPath);

  if (normalizedPath.includes("/prisma/migrations/") || normalizedPath.includes("/migrations/") || normalizedPath.includes("/db/migrate/")) {
    return {
      signal: "migration_directory",
      confidenceScore: 0.93,
      provenanceNote: "Detected migration asset inside a migration directory.",
    };
  }

  if (fileName.includes("migration")) {
    return {
      signal: "migration_filename",
      confidenceScore: 0.72,
      provenanceNote: "Detected migration-like file name.",
    };
  }

  return undefined;
}

function inferMigrationToolHint(repoPath: string): string | undefined {
  const normalizedPath = repoPath.toLowerCase();

  if (normalizedPath.includes("/prisma/migrations/")) {
    return "prisma";
  }
  if (normalizedPath.includes("/db/migrate/")) {
    return "rails";
  }
  if (normalizedPath.includes("/migrations/")) {
    return "custom";
  }

  return undefined;
}

function isRouteCandidateFile(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return CODE_FILE_EXTENSIONS.has(extension);
}

function shouldIgnoreRouteSignal(repoPath: string): boolean {
  const normalizedPath = normalizeEvidencePath(repoPath).toLowerCase();
  const segments = normalizedPath.split("/");

  if (detectTestSignal(normalizedPath)) {
    return true;
  }

  return segments.some((segment) => NON_PRODUCTION_SIGNAL_SEGMENTS.has(segment));
}

function shouldIgnoreTestSignal(repoPath: string): boolean {
  const normalizedPath = normalizeEvidencePath(repoPath).toLowerCase();
  return normalizedPath.split("/").some((segment) => ["templates", "template", "examples", "example", "fixtures", "__fixtures__", "__mocks__"].includes(segment));
}

function isFallbackRouteCandidate(repoPath: string): boolean {
  const normalizedPath = normalizeEvidencePath(repoPath).toLowerCase();
  const fileName = path.basename(normalizedPath);
  const segments = normalizedPath.split("/");

  if (!ROUTE_FILE_HINT.test(fileName)) {
    return false;
  }

  if (segments.some((segment) => ["routes", "route", "router", "controllers", "controller", "api", "server", "src", "app"].includes(segment))) {
    return true;
  }

  return false;
}

function classifySourceFile(repoPath: string, absolutePath?: string): EvidenceSourceFile["category"] {
  const normalizedPath = repoPath.toLowerCase();
  const fileName = path.basename(normalizedPath);
  const extension = path.extname(normalizedPath);

  if (isEntrypointFile(normalizedPath)) {
    return "entrypoint";
  }
  if (isSdkSurface(normalizedPath)) {
    return "sdk";
  }
  if (extension === ".go" && absolutePath && /\btype\s+\w+\s+interface\s*\{/.test(safelyReadTextFile(absolutePath) ?? "")) {
    return "interface";
  }
  if (extension === ".rs" && absolutePath && /\bpub\s+trait\s+\w+/.test(safelyReadTextFile(absolutePath) ?? "")) {
    return "trait";
  }

  if (detectManifestSignal(repoPath)) {
    return "manifest";
  }
  if (normalizedPath.endsWith(".feature")) {
    return "feature";
  }
  if (detectMigrationSignal(repoPath)) {
    return "migration";
  }
  if (fileName.includes("controller")) {
    return "controller";
  }
  if (fileName.includes("route") || fileName.includes("routes")) {
    return "route";
  }
  if (detectTestSignal(repoPath)) {
    return "test";
  }
  if (
    extension === ".proto" ||
    extension === ".graphql" ||
    extension === ".gql" ||
    (/openapi|swagger/.test(fileName) && [".yaml", ".yml", ".json"].includes(extension)) ||
    fileName.endsWith(".schema.json") ||
    fileName.endsWith(".schema.yaml") ||
    fileName.endsWith(".schema.yml") ||
    normalizedPath.startsWith("schemas/") ||
    normalizedPath.includes("/schemas/")
  ) {
    return "schema";
  }
  if (detectDocumentSignal(repoPath)) {
    return "document";
  }
  if (SERVICE_FILE_HINT.test(fileName)) {
    return "service";
  }

  return "other";
}

function isEntrypointFile(normalizedPath: string): boolean {
  const fileName = path.basename(normalizedPath);
  return (
    fileName === "main.go" ||
    fileName === "main.rs" ||
    fileName === "server.ts" ||
    fileName === "server.js" ||
    fileName === "app.ts" ||
    fileName === "app.js" ||
    fileName === "index.ts" ||
    fileName === "index.js" ||
    normalizedPath.endsWith("/cmd/server/main.go") ||
    normalizedPath.endsWith("/cmd/api/main.go")
  );
}

function isSdkSurface(normalizedPath: string): boolean {
  return normalizedPath.startsWith("sdk/") || normalizedPath.includes("/sdk/") || normalizedPath.startsWith("packages/sdk/");
}

function detectDocumentSignal(repoPath: string): Pick<EvidenceDocument, "kind" | "confidenceScore" | "provenanceNote"> | undefined {
  const normalizedPath = normalizeEvidencePath(repoPath);
  const lowerPath = normalizedPath.toLowerCase();
  const extension = path.extname(lowerPath);
  const fileName = path.basename(lowerPath);
  const segments = lowerPath.split("/");

  if (!DOCUMENT_EXTENSIONS.has(extension)) {
    if (fileName === "context.yaml" || fileName === "context-map.yaml") {
      return {
        kind: "context",
        confidenceScore: 0.88,
        provenanceNote: "Detected context-definition asset.",
      };
    }

    if ((fileName.includes("contract") || fileName === "contracts.yaml") && [".yaml", ".yml", ".json"].includes(extension)) {
      return {
        kind: "contract",
        confidenceScore: 0.82,
        provenanceNote: "Detected contract-oriented structured document.",
      };
    }

    return undefined;
  }

  if (/^readme(?:\..+)?\.mdx?$/.test(fileName) || fileName === "readme.md") {
    return {
      kind: "readme",
      confidenceScore: 0.99,
      provenanceNote: "Detected repository README document.",
    };
  }

  if (fileName.includes("requirements")) {
    return {
      kind: "requirements",
      confidenceScore: 0.84,
      provenanceNote: "Detected requirements-oriented planning document.",
    };
  }

  if (fileName.includes("architecture") || segments.some((segment) => DOCUMENT_DIRECTORY_SEGMENTS.has(segment))) {
    return {
      kind: "architecture",
      confidenceScore: 0.74,
      provenanceNote: "Detected architecture or design documentation.",
    };
  }

  if (fileName.includes("contract")) {
    return {
      kind: "contract",
      confidenceScore: 0.72,
      provenanceNote: "Detected contract-oriented documentation.",
    };
  }

  return undefined;
}

function detectManifestSignal(repoPath: string): Pick<EvidenceManifest, "kind" | "confidenceScore" | "provenanceNote"> | undefined {
  const normalizedPath = normalizeEvidencePath(repoPath);
  const lowerPath = normalizedPath.toLowerCase();
  const fileName = path.basename(lowerPath);

  switch (fileName) {
    case "package.json":
      return {
        kind: "package-json",
        confidenceScore: 0.99,
        provenanceNote: "Detected Node package manifest.",
      };
    case "tsconfig.json":
      return {
        kind: "tsconfig",
        confidenceScore: 0.9,
        provenanceNote: "Detected TypeScript compiler manifest.",
      };
    case "pyproject.toml":
      return {
        kind: "pyproject",
        confidenceScore: 0.98,
        provenanceNote: "Detected Python project manifest.",
      };
    case "requirements.txt":
      return {
        kind: "requirements",
        confidenceScore: 0.92,
        provenanceNote: "Detected Python requirements manifest.",
      };
    case "pom.xml":
      return {
        kind: "pom",
        confidenceScore: 0.98,
        provenanceNote: "Detected Maven project manifest.",
      };
    case "build.gradle":
    case "build.gradle.kts":
      return {
        kind: "build-gradle",
        confidenceScore: 0.96,
        provenanceNote: "Detected Gradle build manifest.",
      };
    case "cargo.toml":
      return {
        kind: "cargo",
        confidenceScore: 0.98,
        provenanceNote: "Detected Rust Cargo manifest.",
      };
    case "go.mod":
      return {
        kind: "go-mod",
        confidenceScore: 0.98,
        provenanceNote: "Detected Go module manifest.",
      };
    case "gemfile":
      return {
        kind: "gemfile",
        confidenceScore: 0.97,
        provenanceNote: "Detected Ruby Gemfile manifest.",
      };
    case "composer.json":
      return {
        kind: "composer",
        confidenceScore: 0.98,
        provenanceNote: "Detected PHP Composer manifest.",
      };
    case "pnpm-workspace.yaml":
      return {
        kind: "pnpm-workspace",
        confidenceScore: 0.97,
        provenanceNote: "Detected pnpm workspace manifest.",
      };
    case "nx.json":
      return {
        kind: "nx",
        confidenceScore: 0.94,
        provenanceNote: "Detected Nx monorepo manifest.",
      };
    case "turbo.json":
      return {
        kind: "turbo",
        confidenceScore: 0.94,
        provenanceNote: "Detected Turborepo manifest.",
      };
    case "lerna.json":
      return {
        kind: "lerna",
        confidenceScore: 0.94,
        provenanceNote: "Detected Lerna monorepo manifest.",
      };
    case "rush.json":
      return {
        kind: "rush",
        confidenceScore: 0.94,
        provenanceNote: "Detected Rush monorepo manifest.",
      };
    default:
      return undefined;
  }
}

function hasPathSegment(normalizedPath: string, expected: string): boolean {
  return normalizedPath.split("/").includes(expected);
}

function formatRouteSignal(route: EvidenceRoute): string {
  const method = route.method ? `${route.method} ` : "";
  const confidence = getEvidenceConfidenceScore(route);
  return `${method}${route.path} (${Math.round(confidence * 100)}% confidence from ${route.sourceFiles[0] ?? "unknown"})`;
}

function applyHeuristicWarnings(graph: EvidenceGraph, fileCount: number): void {
  const summary: BootstrapDiscoverSummary = summarizeEvidenceGraph(graph);

  if (fileCount === 0) {
    graph.warnings.push("Repository scan found no files outside excluded directories.");
    return;
  }

  if (summary.sourceFileCount === 0) {
    graph.warnings.push("No source files were inventoried for bootstrap discover.");
  }

  if (
    summary.routeCount === 0 &&
    summary.testCount === 0 &&
    summary.schemaCount === 0 &&
    summary.migrationCount === 0 &&
    summary.documentCount === 0 &&
    summary.manifestCount === 0 &&
    !graph.sourceFiles.some((file) => file.category === "feature")
  ) {
    graph.warnings.push("No known bootstrap evidence patterns were detected in this repository layout.");
  }

  if (
    summary.sourceFileCount > 0 &&
    summary.routeCount === 0 &&
    summary.testCount === 0 &&
    summary.schemaCount === 0 &&
    summary.migrationCount === 0 &&
    summary.documentCount === 0 &&
    summary.manifestCount === 0
  ) {
    graph.warnings.push("Repository files were found, but the layout did not match the current bootstrap discover heuristics.");
  }

  if (summary.routeCount > 0 && summary.highConfidenceRouteCount === 0) {
    graph.warnings.push("Only low-confidence route candidates were found; bootstrap draft may need manual API cleanup.");
  }

  if (summary.testCount > 0 && summary.highConfidenceTestCount === 0) {
    graph.warnings.push("Only low-confidence test assets were found; behavior drafts may rely on repository-wide heuristics.");
  }
}
