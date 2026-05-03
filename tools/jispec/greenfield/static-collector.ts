import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import type { GreenfieldImplementationFact, GreenfieldImplementationFactKind } from "./evidence-graph";
import type {
  ContractGraph,
  ContractGraphEdge,
  ContractGraphEdgeRelation,
  ContractGraphNode,
  ContractGraphNodeKind,
} from "./contract-graph";

export type StaticCollectorFactKind =
  | "route"
  | "schema"
  | "test"
  | "migration"
  | "type_definition"
  | "package_script"
  | "monorepo_manifest"
  | "config"
  | "unresolved_surface";

export type StaticCollectorConfidence =
  | "explicit_anchor"
  | "stable_id"
  | "manual_mapping"
  | "heuristic"
  | "unresolved";

export interface StaticImplementationFact {
  id: string;
  kind: StaticCollectorFactKind;
  label: string;
  path: string;
  contract_ids: string[];
  scenario_ids: string[];
  requirement_ids: string[];
  test_ids: string[];
  slice_ids: string[];
  confidence: StaticCollectorConfidence;
  source: "static_collector";
  metadata?: Record<string, unknown>;
}

export interface StaticCollectorManifest {
  schema_version: 1;
  manifest_kind: "deterministic-static-collector";
  generated_at: string;
  root: string;
  collectors: StaticCollectorDeclaration[];
  facts: StaticImplementationFact[];
  unresolved_surfaces: StaticImplementationFact[];
  warnings: string[];
}

export interface StaticCollectorDeclaration {
  id: string;
  priority: "P0" | "P1" | "P2";
  languages: string[];
  frameworks: string[];
  fact_kinds: StaticCollectorFactKind[];
  confidence_levels: StaticCollectorConfidence[];
  failure_mode: "emit_unresolved_surface" | "advisory_only";
}

export interface StaticCollectorOptions {
  generatedAt?: string;
}

interface AnchorSet {
  contractIds: string[];
  scenarioIds: string[];
  requirementIds: string[];
  testIds: string[];
  sliceIds: string[];
}

interface ManualMapping extends Partial<AnchorSet> {
  factId?: string;
  path?: string;
  kind?: StaticCollectorFactKind;
}

interface ManualMappingsFile {
  mappings?: Array<Record<string, unknown>>;
}

interface FactDraft {
  id: string;
  kind: StaticCollectorFactKind;
  label: string;
  path: string;
  confidence?: StaticCollectorConfidence;
  metadata?: Record<string, unknown>;
}

const MANIFEST_PATH = ".spec/evidence/static-collector-manifest.json";
const MANUAL_MAPPINGS_PATH = ".spec/evidence/static-collector-mappings.yaml";
const GOVERNED_FACT_KINDS: StaticCollectorFactKind[] = [
  "route",
  "schema",
  "test",
  "migration",
  "type_definition",
];
const REPO_INTERNAL_ADVISORY_PREFIXES = [
  "tools/jispec/",
  "examples/",
  "templates/",
  "scripts/",
  ".jispec-ci/",
];
const REPO_INTERNAL_ADVISORY_PATHS = [
  "tsconfig.json",
];

export function collectStaticImplementationFacts(
  rootInput: string,
  options: StaticCollectorOptions = {},
): StaticCollectorManifest {
  const root = path.resolve(rootInput);
  const manualMappings = loadManualMappings(root);
  const warnings: string[] = [];
  const facts: StaticImplementationFact[] = [];
  const unresolvedSurfaces: StaticImplementationFact[] = [];

  for (const filePath of findSourceFiles(root)) {
    const relativePath = normalizePath(path.relative(root, filePath));
    const content = safeRead(filePath);
    if (content === undefined) {
      warnings.push(`Static collector could not read ${relativePath}.`);
      continue;
    }

    const drafts = [
      ...discoverRouteFacts(relativePath, content),
      ...discoverSchemaFacts(relativePath, content),
      ...discoverGraphqlUnresolvedSurfaces(relativePath, content),
      ...discoverMigrationFacts(relativePath, content),
      ...discoverTypeDefinitionFacts(relativePath, content),
      ...discoverTestFacts(relativePath, content),
      ...discoverPackageScriptFacts(relativePath, content),
      ...discoverMonorepoManifestFacts(relativePath, content),
      ...discoverConfigFacts(relativePath),
    ];

    for (const draft of drafts) {
      const fact = finalizeFact(draft, content, manualMappings);
      if (fact.kind === "unresolved_surface") {
        unresolvedSurfaces.push(fact);
      } else {
        facts.push(fact);
      }
    }
  }

  return {
    schema_version: 1,
    manifest_kind: "deterministic-static-collector",
    generated_at: options.generatedAt ?? new Date().toISOString(),
    root: normalizePath(root),
    collectors: collectorDeclarations(),
    facts: dedupeFacts(facts),
    unresolved_surfaces: dedupeFacts(unresolvedSurfaces),
    warnings: stableUnique(warnings),
  };
}

export function writeStaticCollectorManifest(
  rootInput: string,
  manifest: StaticCollectorManifest,
  relativePath = MANIFEST_PATH,
): string {
  const root = path.resolve(rootInput);
  const manifestPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
  return normalizePath(manifestPath);
}

export function staticCollectorManifestPath(): string {
  return MANIFEST_PATH;
}

export function isGovernedStaticFact(fact: StaticImplementationFact): boolean {
  return GOVERNED_FACT_KINDS.includes(fact.kind) && isGovernedStaticPath(fact.path) && fact.metadata?.advisory_only !== true;
}

export function isGovernedStaticPath(relativePath: string): boolean {
  const normalized = normalizePath(relativePath);
  if (REPO_INTERNAL_ADVISORY_PATHS.includes(normalized)) {
    return false;
  }
  return !REPO_INTERNAL_ADVISORY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function hasStaticFactMapping(fact: StaticImplementationFact): boolean {
  return (
    fact.contract_ids.length > 0 ||
    fact.scenario_ids.length > 0 ||
    fact.requirement_ids.length > 0 ||
    fact.test_ids.length > 0 ||
    fact.slice_ids.length > 0
  );
}

export function staticFactsToGreenfieldImplementationFacts(
  facts: StaticImplementationFact[],
): GreenfieldImplementationFact[] {
  return facts
    .filter((fact) => isGreenfieldImplementationFactKind(fact.kind) && hasStaticFactMapping(fact))
    .map((fact) => ({
      id: fact.id,
      kind: fact.kind as GreenfieldImplementationFactKind,
      label: fact.label,
      path: fact.path,
      requirementIds: fact.requirement_ids,
      contractIds: fact.contract_ids,
      scenarioIds: fact.scenario_ids,
      testIds: fact.test_ids,
      sliceIds: fact.slice_ids,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function augmentContractGraphWithStaticFacts(
  graph: ContractGraph,
  facts: StaticImplementationFact[],
): ContractGraph {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(graph.edges.map((edge) => [edgeKey(edge), edge]));

  for (const fact of facts.filter((entry) => isGovernedStaticFact(entry) && hasStaticFactMapping(entry))) {
    const nodeId = codeNodeIdForStaticFact(fact);
    nodes.set(nodeId, {
      id: nodeId,
      kind: fact.kind === "migration" ? "migration" : "code_fact",
      label: fact.label,
      path: fact.path,
      source_id: fact.id,
      requirement_ids: fact.requirement_ids,
    });

    for (const requirementId of fact.requirement_ids) {
      addEdge(edges, {
        from: reqNodeId(requirementId),
        to: nodeId,
        relation: "derived_from",
        source: "static_collector",
        reason: `Static collector mapped ${fact.kind} through ${fact.confidence}.`,
      });
    }
    for (const contractId of fact.contract_ids) {
      addEdge(edges, {
        from: apiNodeId(contractId),
        to: nodeId,
        relation: "implements",
        source: "static_collector",
        reason: `Static collector mapped ${fact.kind} through ${fact.confidence}.`,
      });
    }
    for (const scenarioId of fact.scenario_ids) {
      addEdge(edges, {
        from: bddNodeId(scenarioId),
        to: nodeId,
        relation: "implements",
        source: "static_collector",
        reason: `Static collector mapped ${fact.kind} through ${fact.confidence}.`,
      });
    }
    for (const testId of fact.test_ids) {
      addEdge(edges, {
        from: testNodeId(testId),
        to: nodeId,
        relation: "implements",
        source: "static_collector",
        reason: `Static collector mapped ${fact.kind} through ${fact.confidence}.`,
      });
    }
    for (const sliceId of fact.slice_ids) {
      addEdge(edges, {
        from: sliceNodeId(sliceId),
        to: nodeId,
        relation: "implements",
        source: "static_collector",
        reason: `Static collector mapped ${fact.kind} through ${fact.confidence}.`,
      });
    }
  }

  const nextGraph: Omit<ContractGraph, "summary"> = {
    ...graph,
    nodes: stableNodes(Array.from(nodes.values())),
    edges: stableEdges(Array.from(edges.values())),
    warnings: stableUnique(graph.warnings ?? []),
  };

  return {
    ...nextGraph,
    summary: summarizeContractGraph(nextGraph.nodes, nextGraph.edges),
  };
}

function discoverRouteFacts(relativePath: string, content: string): FactDraft[] {
  const facts: FactDraft[] = [];
  const literalPatterns = [
    /\b(?:router|app)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/gi,
    /\b[A-Za-z0-9_$.]+\.(GET|POST|PUT|PATCH|DELETE)\(\s*["'`]([^"'`]+)["'`]/g,
    /\b(GET|POST|PUT|PATCH|DELETE)\s+([/][^\s"'`]+)/g,
    /\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g,
    /@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping)\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/g,
  ];

  for (const pattern of literalPatterns) {
    for (const match of content.matchAll(pattern)) {
      const rawMethod = match[1] ?? "";
      const method = routeMethodFromToken(rawMethod);
      const routePath = normalizeRoutePath(match[2] ?? inferRoutePathFromFile(relativePath));
      if (!method || !routePath) {
        continue;
      }
      facts.push({
        id: `route:${method} ${routePath}`,
        kind: "route",
        label: `${method} ${routePath}`,
        path: relativePath,
        metadata: {
          stable_id: `route:${relativePath}:${method}:${routePath}`,
          method,
          route_path: routePath,
        },
      });
    }
  }

  const dynamicPattern = /\b(?:router|app)\.(get|post|put|patch|delete)\(\s*([A-Za-z_$][\w$]*)/gi;
  for (const match of content.matchAll(dynamicPattern)) {
    const method = (match[1] ?? "").toUpperCase();
    const token = match[2] ?? "unknown";
    facts.push({
      id: `unresolved_surface:route:${relativePath}:${method}:${token}`,
      kind: "unresolved_surface",
      label: `Unresolved ${method} route ${token}`,
      path: relativePath,
      confidence: "unresolved",
      metadata: {
        surface_kind: "route",
        method,
        token,
        reason: "Route path is registered through a non-literal expression.",
      },
    });
  }

  return facts;
}

function discoverSchemaFacts(relativePath: string, content: string): FactDraft[] {
  const facts: FactDraft[] = [];
  const extension = path.extname(relativePath).toLowerCase();
  const fileName = path.basename(relativePath).toLowerCase();

  if (extension === ".proto") {
    const services = stableUnique(Array.from(content.matchAll(/\bservice\s+([A-Za-z_][\w]*)\s*{/g)).map((match) => match[1] ?? "").filter(Boolean));
    const messages = stableUnique(Array.from(content.matchAll(/\bmessage\s+([A-Za-z_][\w]*)\s*{/g)).map((match) => match[1] ?? "").filter(Boolean));
    facts.push({
      id: `schema:${relativePath}`,
      kind: "schema",
      label: `Protobuf schema ${relativePath}`,
      path: relativePath,
      metadata: {
        adapter_id: "protobuf",
        extractor: "protobuf-file",
        services,
        messages,
      },
    });
  }

  if ([".graphql", ".gql"].includes(extension)) {
    facts.push({
      id: `schema:${relativePath}`,
      kind: "schema",
      label: `GraphQL schema ${relativePath}`,
      path: relativePath,
      metadata: {
        adapter_id: "graphql",
        extractor: "graphql-schema-file",
        operations: discoverGraphqlOperationTypes(content),
        types: discoverGraphqlTypes(content),
      },
    });
  }

  if (/openapi|swagger/.test(fileName) && [".yaml", ".yml", ".json"].includes(extension)) {
    facts.push({
      id: `schema:${relativePath}`,
      kind: "schema",
      label: `OpenAPI schema ${relativePath}`,
      path: relativePath,
      metadata: {
        adapter_id: "openapi",
        extractor: "openapi-file",
        paths: discoverOpenApiPaths(content),
      },
    });
  }

  for (const table of discoverSqlTables(content)) {
    facts.push({
      id: `schema:${table.name}`,
      kind: "schema",
      label: `Schema ${table.name}`,
      path: relativePath,
      metadata: {
        adapter_id: "db_migration",
        table: table.name,
        columns: table.columns,
        primary_keys: table.primaryKeys,
        foreign_keys: table.foreignKeys,
      },
    });
  }

  if (
    !isContractSourceSchemaFile(relativePath) &&
    /schema|z\.object|object\s*\(|typeDefs|GraphQLObjectType/i.test(content) &&
    /schemas?|models?|dto|contract/i.test(relativePath)
  ) {
    facts.push({
      id: `schema:${relativePath}`,
      kind: "schema",
      label: `Schema ${relativePath}`,
      path: relativePath,
      metadata: { extractor: "schema-file" },
    });
  }

  return facts;
}

function discoverGraphqlUnresolvedSurfaces(relativePath: string, content: string): FactDraft[] {
  if (isGraphqlSchemaFile(relativePath)) {
    return [];
  }
  if (!/\b(gql\s*`|typeDefs\s*=|GraphQLObjectType|GraphQLSchema|resolver[s]?\b)/i.test(content)) {
    return [];
  }

  return [{
    id: `unresolved_surface:graphql:${relativePath}`,
    kind: "unresolved_surface",
    label: `Unresolved GraphQL surface ${relativePath}`,
    path: relativePath,
    confidence: "unresolved",
    metadata: {
      adapter_id: "graphql",
      surface_kind: "graphql",
      reason: "GraphQL surface is embedded in source code and requires owner review before contract adoption.",
    },
  }];
}

function discoverMigrationFacts(relativePath: string, content: string): FactDraft[] {
  if (!isMigrationPath(relativePath)) {
    return [];
  }

  const tables = discoverSqlTables(content).map((table) => table.name);
  return [{
    id: `migration:${relativePath}`,
    kind: "migration",
    label: `Migration ${relativePath}`,
    path: relativePath,
    metadata: {
      tables,
      operations: discoverSqlOperations(content),
    },
  }];
}

function discoverTypeDefinitionFacts(relativePath: string, content: string): FactDraft[] {
  if (!/types?|models?|domain|entities|value-objects|src\//i.test(relativePath)) {
    return [];
  }

  const facts: FactDraft[] = [];
  const typePatterns = [
    /\bexport\s+interface\s+([A-Z][A-Za-z0-9_]*)\s*{([\s\S]*?)}/g,
    /\bexport\s+type\s+([A-Z][A-Za-z0-9_]*)\s*=\s*{([\s\S]*?)}/g,
    /\bexport\s+class\s+([A-Z][A-Za-z0-9_]*)\s*{([\s\S]*?)}/g,
    /\btype\s+([A-Z][A-Za-z0-9_]*)\s+struct\s*{([\s\S]*?)}/g,
    /\bpub\s+struct\s+([A-Z][A-Za-z0-9_]*)\s*{([\s\S]*?)}/g,
  ];

  for (const pattern of typePatterns) {
    for (const match of content.matchAll(pattern)) {
      const name = match[1] ?? "";
      if (!name) {
        continue;
      }
      facts.push({
        id: `type_definition:${relativePath}:${name}`,
        kind: "type_definition",
        label: `Type definition ${name}`,
        path: relativePath,
        metadata: {
          type_name: name,
          first_level_fields: extractFirstLevelFields(match[2] ?? ""),
        },
      });
    }
  }

  return facts;
}

function discoverTestFacts(relativePath: string, content: string): FactDraft[] {
  if (!/\.(test|spec|feature)\b/i.test(relativePath) && !/tests?\//i.test(relativePath)) {
    return [];
  }
  if (!/\b(describe|it|test)\s*\(/.test(content) && !/^\s*(Feature|Scenario):/m.test(content)) {
    return [];
  }

  return [{
    id: `test:${relativePath}`,
    kind: "test",
    label: `Test ${relativePath}`,
    path: relativePath,
    metadata: {
      test_names: extractTestNames(content),
    },
  }];
}

function discoverPackageScriptFacts(relativePath: string, content: string): FactDraft[] {
  if (relativePath !== "package.json") {
    return [];
  }

  try {
    const parsed = JSON.parse(content) as { scripts?: Record<string, unknown> };
    return Object.keys(parsed.scripts ?? {}).sort().map((scriptName) => ({
      id: `package_script:${scriptName}`,
      kind: "package_script" as const,
      label: `Package script ${scriptName}`,
      path: relativePath,
      confidence: "heuristic" as const,
      metadata: {
        advisory_only: true,
      },
    }));
  } catch {
    return [];
  }
}

function discoverMonorepoManifestFacts(relativePath: string, content: string): FactDraft[] {
  const fileName = path.basename(relativePath).toLowerCase();
  const manifestKinds: Record<string, string> = {
    "pnpm-workspace.yaml": "pnpm",
    "nx.json": "nx",
    "turbo.json": "turbo",
    "lerna.json": "lerna",
    "rush.json": "rush",
  };
  const directKind = manifestKinds[fileName];
  if (directKind) {
    return [{
      id: `monorepo_manifest:${relativePath}`,
      kind: "monorepo_manifest",
      label: `Monorepo manifest ${relativePath}`,
      path: relativePath,
      confidence: "heuristic",
      metadata: {
        adapter_id: "monorepo_manifest",
        manifest_kind: directKind,
        advisory_only: true,
      },
    }];
  }

  if (relativePath !== "package.json") {
    return [];
  }

  try {
    const parsed = JSON.parse(content) as { workspaces?: unknown };
    const workspaces = parsed.workspaces;
    if (Array.isArray(workspaces) || (isRecord(workspaces) && Array.isArray(workspaces.packages))) {
      return [{
        id: "monorepo_manifest:package.json:workspaces",
        kind: "monorepo_manifest",
        label: "Monorepo manifest package.json workspaces",
        path: relativePath,
        confidence: "heuristic",
        metadata: {
          adapter_id: "monorepo_manifest",
          manifest_kind: "package-json-workspaces",
          advisory_only: true,
        },
      }];
    }
  } catch {
    return [];
  }

  return [];
}

function discoverConfigFacts(relativePath: string): FactDraft[] {
  if (!/(^|\/)(tsconfig|vite|webpack|next|nuxt|eslint|prettier|jest|vitest|cargo|go\.mod|pom\.xml|gradle)/i.test(relativePath)) {
    return [];
  }
  return [{
    id: `config:${relativePath}`,
    kind: "config",
    label: `Config ${relativePath}`,
    path: relativePath,
    confidence: "heuristic",
    metadata: {
      advisory_only: true,
    },
  }];
}

function finalizeFact(
  draft: FactDraft,
  content: string,
  manualMappings: Map<string, ManualMapping>,
): StaticImplementationFact {
  const explicit = extractExplicitAnchors(content);
  const stable = extractStableIds(`${draft.path}\n${extractTestNames(content).join("\n")}`);
  const mapping = manualMappings.get(normalizeImplementationFactId(draft.id));
  const confidence = draft.confidence ??
    (hasAnyAnchor(explicit)
      ? "explicit_anchor"
      : hasAnyAnchor(stable)
        ? "stable_id"
        : mapping
          ? "manual_mapping"
          : "heuristic");
  const anchors = mergeAnchors(explicit, stable, mapping ?? {});

  return {
    id: normalizeImplementationFactId(draft.id),
    kind: draft.kind,
    label: draft.label,
    path: draft.path,
    contract_ids: stableUnique(anchors.contractIds),
    scenario_ids: stableUnique(anchors.scenarioIds),
    requirement_ids: stableUnique(anchors.requirementIds),
    test_ids: stableUnique(anchors.testIds),
    slice_ids: stableUnique(anchors.sliceIds),
    confidence,
    source: "static_collector",
    metadata: decorateStaticMetadata(draft.path, draft.metadata),
  };
}

function extractExplicitAnchors(content: string): AnchorSet {
  const anchors = emptyAnchors();
  const patterns: Array<[keyof AnchorSet, RegExp]> = [
    ["contractIds", /@jispec\s+contract\s+([A-Z0-9_,\-\s]+)/gi],
    ["scenarioIds", /@jispec\s+(?:scenario|bdd)\s+([A-Z0-9_,\-\s]+)/gi],
    ["requirementIds", /@jispec\s+requirement\s+([A-Z0-9_,\-\s]+)/gi],
    ["testIds", /@jispec\s+test\s+([A-Z0-9_,\-\s]+)/gi],
    ["sliceIds", /@jispec\s+slice\s+([A-Za-z0-9_,\-\s]+)/gi],
  ];

  for (const [key, pattern] of patterns) {
    for (const match of content.matchAll(pattern)) {
      anchors[key].push(...splitAnchorIds(match[1] ?? ""));
    }
  }

  return filterAnchorPrefixes(anchors);
}

function extractStableIds(value: string): AnchorSet {
  return {
    contractIds: stableUnique(value.match(/\bCTR-[A-Z0-9-]+\b/g) ?? []),
    scenarioIds: stableUnique(value.match(/\bSCN-[A-Z0-9-]+\b/g) ?? []),
    requirementIds: stableUnique(value.match(/\bREQ-[A-Z0-9-]+\b/g) ?? []),
    testIds: stableUnique(value.match(/\bTEST-[A-Z0-9-]+\b/g) ?? []),
    sliceIds: stableUnique(value.match(/\b[a-z][a-z0-9-]*-v\d+\b/g) ?? []),
  };
}

function filterAnchorPrefixes(anchors: AnchorSet): AnchorSet {
  return {
    contractIds: stableUnique(anchors.contractIds.filter((value) => /^CTR-/.test(value))),
    scenarioIds: stableUnique(anchors.scenarioIds.filter((value) => /^SCN-/.test(value))),
    requirementIds: stableUnique(anchors.requirementIds.filter((value) => /^REQ-/.test(value))),
    testIds: stableUnique(anchors.testIds.filter((value) => /^TEST-/.test(value))),
    sliceIds: stableUnique(anchors.sliceIds),
  };
}

function splitAnchorIds(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mergeAnchors(...sets: Partial<AnchorSet>[]): AnchorSet {
  const merged = emptyAnchors();
  for (const set of sets) {
    merged.contractIds.push(...(set.contractIds ?? []));
    merged.scenarioIds.push(...(set.scenarioIds ?? []));
    merged.requirementIds.push(...(set.requirementIds ?? []));
    merged.testIds.push(...(set.testIds ?? []));
    merged.sliceIds.push(...(set.sliceIds ?? []));
  }
  return {
    contractIds: stableUnique(merged.contractIds),
    scenarioIds: stableUnique(merged.scenarioIds),
    requirementIds: stableUnique(merged.requirementIds),
    testIds: stableUnique(merged.testIds),
    sliceIds: stableUnique(merged.sliceIds),
  };
}

function loadManualMappings(root: string): Map<string, ManualMapping> {
  const mappingsPath = path.join(root, MANUAL_MAPPINGS_PATH);
  const mappings = new Map<string, ManualMapping>();
  if (!fs.existsSync(mappingsPath)) {
    return mappings;
  }

  try {
    const parsed = yaml.load(fs.readFileSync(mappingsPath, "utf-8")) as ManualMappingsFile;
    for (const entry of parsed.mappings ?? []) {
      const factId = stringValue(entry.fact_id) ?? stringValue(entry.factId);
      if (!factId) {
        continue;
      }
      mappings.set(normalizeImplementationFactId(factId), {
        factId,
        path: stringValue(entry.path),
        kind: stringValue(entry.kind) as StaticCollectorFactKind | undefined,
        contractIds: stringArray(entry.contract_ids ?? entry.contractIds),
        scenarioIds: stringArray(entry.scenario_ids ?? entry.scenarioIds),
        requirementIds: stringArray(entry.requirement_ids ?? entry.requirementIds),
        testIds: stringArray(entry.test_ids ?? entry.testIds),
        sliceIds: stringArray(entry.slice_ids ?? entry.sliceIds),
      });
    }
  } catch {
    return mappings;
  }

  return mappings;
}

function discoverSqlTables(content: string): Array<{
  name: string;
  columns: string[];
  primaryKeys: string[];
  foreignKeys: string[];
}> {
  const tables: Array<{ name: string; columns: string[]; primaryKeys: string[]; foreignKeys: string[] }> = [];
  const createPattern = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(["`\[]?[A-Za-z_][\w.]*["`\]]?)\s*\(([\s\S]*?)\)\s*;/gi;
  for (const match of content.matchAll(createPattern)) {
    const name = normalizeSqlIdentifier(match[1] ?? "");
    const body = match[2] ?? "";
    tables.push({
      name,
      columns: extractSqlColumns(body),
      primaryKeys: extractSqlPrimaryKeys(body),
      foreignKeys: extractSqlForeignKeys(body),
    });
  }

  const alterPattern = /\balter\s+table\s+(?:if\s+exists\s+)?(["`\[]?[A-Za-z_][\w.]*["`\]]?)/gi;
  for (const match of content.matchAll(alterPattern)) {
    const name = normalizeSqlIdentifier(match[1] ?? "");
    if (!name || tables.some((table) => table.name === name)) {
      continue;
    }
    tables.push({ name, columns: [], primaryKeys: [], foreignKeys: [] });
  }

  return tables.sort((left, right) => left.name.localeCompare(right.name));
}

function discoverSqlOperations(content: string): string[] {
  const operations: string[] = [];
  for (const match of content.matchAll(/\b(create\s+table|alter\s+table|drop\s+table|create\s+index|create\s+unique\s+index)\b/gi)) {
    operations.push((match[1] ?? "").toLowerCase().replace(/\s+/g, "_"));
  }
  return stableUnique(operations);
}

function extractSqlColumns(body: string): string[] {
  return stableUnique(splitSqlBody(body)
    .map((line) => line.trim())
    .filter((line) => line && !/^(primary|foreign|unique|constraint|check|key)\b/i.test(line))
    .map((line) => normalizeSqlIdentifier(line.split(/\s+/)[0] ?? ""))
    .filter(Boolean));
}

function extractSqlPrimaryKeys(body: string): string[] {
  const keys: string[] = [];
  for (const match of body.matchAll(/\bprimary\s+key\s*\(([^)]+)\)/gi)) {
    keys.push(...splitSqlIdentifiers(match[1] ?? ""));
  }
  for (const line of splitSqlBody(body)) {
    if (/\bprimary\s+key\b/i.test(line) && !/^\s*primary\s+key/i.test(line)) {
      keys.push(normalizeSqlIdentifier(line.trim().split(/\s+/)[0] ?? ""));
    }
  }
  return stableUnique(keys);
}

function extractSqlForeignKeys(body: string): string[] {
  const keys: string[] = [];
  for (const match of body.matchAll(/\bforeign\s+key\s*\(([^)]+)\)\s+references\s+([A-Za-z_][\w.]*)/gi)) {
    for (const column of splitSqlIdentifiers(match[1] ?? "")) {
      keys.push(`${column}->${normalizeSqlIdentifier(match[2] ?? "")}`);
    }
  }
  return stableUnique(keys);
}

function splitSqlBody(body: string): string[] {
  return body.split(/,(?![^()]*\))/g);
}

function splitSqlIdentifiers(value: string): string[] {
  return stableUnique(value.split(",").map(normalizeSqlIdentifier).filter(Boolean));
}

function normalizeSqlIdentifier(value: string): string {
  return value.trim().replace(/^[`"[]|[`"\]]$/g, "").toLowerCase();
}

function extractFirstLevelFields(body: string): string[] {
  return stableUnique(body
    .split(/\n|;/)
    .map((line) => line.trim())
    .map((line) => line.replace(/^readonly\s+/, "").replace(/^public\s+|^private\s+|^protected\s+/, ""))
    .map((line) => {
      const tsMatch = /^([A-Za-z_][\w]*)\??\s*:/.exec(line);
      if (tsMatch) {
        return tsMatch[1];
      }
      const goMatch = /^([A-Z][A-Za-z0-9_]*)\s+/.exec(line);
      if (goMatch) {
        return goMatch[1];
      }
      return "";
    })
    .filter(Boolean));
}

function extractTestNames(content: string): string[] {
  const names: string[] = [];
  for (const match of content.matchAll(/\b(?:describe|it|test)\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
    names.push(match[1] ?? "");
  }
  for (const match of content.matchAll(/^\s*(?:Feature|Scenario):\s*(.+)$/gm)) {
    names.push(match[1] ?? "");
  }
  return stableUnique(names);
}

function findSourceFiles(root: string): string[] {
  const files: string[] = [];
  visit(root, files, root);
  return files.sort((left, right) => normalizePath(left).localeCompare(normalizePath(right)));
}

function visit(directory: string, files: string[], root: string): void {
  if (!fs.existsSync(directory)) {
    return;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    const relativePath = normalizePath(path.relative(root, fullPath));
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(relativePath)) {
        continue;
      }
      visit(fullPath, files, root);
      continue;
    }

    if (entry.isFile() && isCollectableFile(entry.name)) {
      files.push(fullPath);
    }
  }
}

function shouldSkipDirectory(relativePath: string): boolean {
  return [
    ".git",
    ".github",
    ".spec",
    ".tmp",
    "agents",
    "contexts",
    "dist",
    "docs",
    "jiproject",
    "node_modules",
    "schemas",
  ].some((entry) => relativePath === entry || relativePath.startsWith(`${entry}/`));
}

function isCollectableFile(fileName: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|json|yaml|yml|sql|go|rs|java|kt|py|rb|php|feature|proto|graphql|gql)$/.test(fileName) ||
    fileName === "go.mod" ||
    fileName === "pom.xml";
}

function isGraphqlSchemaFile(relativePath: string): boolean {
  const extension = path.extname(relativePath).toLowerCase();
  return extension === ".graphql" || extension === ".gql";
}

function isContractSourceSchemaFile(relativePath: string): boolean {
  const extension = path.extname(relativePath).toLowerCase();
  const fileName = path.basename(relativePath).toLowerCase();
  return extension === ".proto" || isGraphqlSchemaFile(relativePath) || (/openapi|swagger/.test(fileName) && [".yaml", ".yml", ".json"].includes(extension));
}

function isMigrationPath(relativePath: string): boolean {
  return /migrations?\//i.test(relativePath) || /\d{8,}.*\.(sql|ts|js)$/i.test(relativePath);
}

function routeMethodFromToken(token: string): string {
  const map: Record<string, string> = {
    GetMapping: "GET",
    PostMapping: "POST",
    PutMapping: "PUT",
    PatchMapping: "PATCH",
    DeleteMapping: "DELETE",
  };
  return map[token] ?? token.toUpperCase();
}

function normalizeRoutePath(routePath: string): string {
  const normalized = routePath.trim().replace(/\/+/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function inferRoutePathFromFile(relativePath: string): string {
  const normalized = relativePath
    .replace(/^src\/app\/api\//, "/")
    .replace(/^src\/routes?\//, "/")
    .replace(/\/route\.[cm]?[jt]sx?$/, "")
    .replace(/\.[cm]?[jt]sx?$/, "")
    .replace(/\[([^\]]+)\]/g, ":$1");

  return normalizeRoutePath(normalized);
}

function dedupeFacts(facts: StaticImplementationFact[]): StaticImplementationFact[] {
  const byId = new Map<string, StaticImplementationFact>();
  for (const fact of facts) {
    byId.set(normalizeImplementationFactId(fact.id), {
      ...fact,
      id: normalizeImplementationFactId(fact.id),
      contract_ids: stableUnique(fact.contract_ids),
      scenario_ids: stableUnique(fact.scenario_ids),
      requirement_ids: stableUnique(fact.requirement_ids),
      test_ids: stableUnique(fact.test_ids),
      slice_ids: stableUnique(fact.slice_ids),
      metadata: fact.metadata ? sortMetadata(fact.metadata) : undefined,
    });
  }
  return Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeImplementationFactId(factId: string): string {
  return factId.replace(/^implementation:/, "").replace(/\s+/g, " ").trim();
}

function collectorDeclarations(): StaticCollectorDeclaration[] {
  return [
    {
      id: "p0-route-endpoint",
      priority: "P0",
      languages: ["typescript", "javascript", "java", "go"],
      frameworks: ["express", "fastify", "nextjs", "spring", "gin"],
      fact_kinds: ["route", "unresolved_surface"],
      confidence_levels: ["explicit_anchor", "stable_id", "manual_mapping", "heuristic", "unresolved"],
      failure_mode: "emit_unresolved_surface",
    },
    {
      id: "p0-db-migration-schema",
      priority: "P0",
      languages: ["sql", "typescript", "javascript"],
      frameworks: ["ddl", "migration"],
      fact_kinds: ["migration", "schema"],
      confidence_levels: ["explicit_anchor", "stable_id", "manual_mapping", "heuristic"],
      failure_mode: "advisory_only",
    },
    {
      id: "p1-test-feature-tags",
      priority: "P1",
      languages: ["typescript", "javascript", "gherkin"],
      frameworks: ["jest", "vitest", "cucumber"],
      fact_kinds: ["test"],
      confidence_levels: ["explicit_anchor", "stable_id", "manual_mapping", "heuristic"],
      failure_mode: "advisory_only",
    },
    {
      id: "p1-contract-source-adapters",
      priority: "P1",
      languages: ["graphql", "protobuf", "yaml", "json"],
      frameworks: ["openapi", "protobuf", "graphql"],
      fact_kinds: ["schema", "unresolved_surface"],
      confidence_levels: ["explicit_anchor", "stable_id", "manual_mapping", "heuristic", "unresolved"],
      failure_mode: "emit_unresolved_surface",
    },
    {
      id: "p1-type-interface-shallow",
      priority: "P1",
      languages: ["typescript", "go", "rust"],
      frameworks: [],
      fact_kinds: ["type_definition"],
      confidence_levels: ["explicit_anchor", "stable_id", "manual_mapping", "heuristic"],
      failure_mode: "advisory_only",
    },
    {
      id: "p2-package-config-context",
      priority: "P2",
      languages: ["json", "yaml", "toml", "xml"],
      frameworks: [],
      fact_kinds: ["package_script", "monorepo_manifest", "config"],
      confidence_levels: ["heuristic"],
      failure_mode: "advisory_only",
    },
  ];
}

function emptyAnchors(): AnchorSet {
  return {
    contractIds: [],
    scenarioIds: [],
    requirementIds: [],
    testIds: [],
    sliceIds: [],
  };
}

function hasAnyAnchor(anchors: Partial<AnchorSet>): boolean {
  return Boolean(
    anchors.contractIds?.length ||
    anchors.scenarioIds?.length ||
    anchors.requirementIds?.length ||
    anchors.testIds?.length ||
    anchors.sliceIds?.length
  );
}

function isGreenfieldImplementationFactKind(kind: StaticCollectorFactKind): kind is GreenfieldImplementationFactKind {
  return kind === "route" || kind === "schema" || kind === "test" || kind === "migration" || kind === "type_definition";
}

function discoverGraphqlOperationTypes(content: string): string[] {
  return stableUnique(Array.from(content.matchAll(/\btype\s+(Query|Mutation|Subscription)\b/g)).map((match) => match[1] ?? "").filter(Boolean));
}

function discoverGraphqlTypes(content: string): string[] {
  return stableUnique(Array.from(content.matchAll(/\b(?:type|interface|input|enum)\s+([A-Za-z_][\w]*)\b/g)).map((match) => match[1] ?? "").filter(Boolean));
}

function discoverOpenApiPaths(content: string): string[] {
  const paths = new Set<string>();
  for (const match of content.matchAll(/^\s{2}([/][^:\s]+)\s*:/gm)) {
    paths.add(match[1] ?? "");
  }
  for (const match of content.matchAll(/"([/][^"]+)":\s*{/g)) {
    paths.add(match[1] ?? "");
  }
  return stableUnique(Array.from(paths).filter(Boolean));
}

function codeNodeIdForStaticFact(fact: StaticImplementationFact): string {
  return `@code:${fact.path}`;
}

function reqNodeId(requirementId: string): string {
  return `@req:${requirementId}`;
}

function apiNodeId(contractId: string): string {
  return `@api:${contractId}`;
}

function bddNodeId(scenarioId: string): string {
  return `@bdd:${scenarioId}`;
}

function sliceNodeId(sliceId: string): string {
  return `@slice:${sliceId}`;
}

function testNodeId(testId: string): string {
  return `@test:${testId}`;
}

function addEdge(edges: Map<string, ContractGraphEdge>, edge: ContractGraphEdge): void {
  edges.set(edgeKey(edge), edge);
}

function summarizeContractGraph(nodes: ContractGraphNode[], edges: ContractGraphEdge[]): ContractGraph["summary"] {
  const nodeCounts = emptyNodeCounts();
  const edgeCounts = emptyEdgeCounts();
  for (const node of nodes) {
    nodeCounts[node.kind]++;
  }
  for (const edge of edges) {
    edgeCounts[edge.relation]++;
  }
  return {
    node_counts: nodeCounts,
    edge_counts: edgeCounts,
  };
}

function emptyNodeCounts(): Record<ContractGraphNodeKind, number> {
  return {
    requirement: 0,
    bounded_context: 0,
    domain_entity: 0,
    domain_event: 0,
    invariant: 0,
    api_contract: 0,
    bdd_scenario: 0,
    slice: 0,
    test: 0,
    code_fact: 0,
    migration: 0,
    review_decision: 0,
    spec_debt: 0,
    baseline: 0,
    delta: 0,
  };
}

function emptyEdgeCounts(): Record<ContractGraphEdgeRelation, number> {
  return {
    defines: 0,
    owns: 0,
    depends_on: 0,
    verifies: 0,
    covered_by: 0,
    implements: 0,
    consumes: 0,
    emits: 0,
    blocked_by: 0,
    supersedes: 0,
    deferred_by: 0,
    waived_by: 0,
    derived_from: 0,
  };
}

function stableNodes(nodes: ContractGraphNode[]): ContractGraphNode[] {
  return [...nodes].sort((left, right) => left.id.localeCompare(right.id));
}

function stableEdges(edges: ContractGraphEdge[]): ContractGraphEdge[] {
  return [...edges].sort((left, right) => edgeKey(left).localeCompare(edgeKey(right)));
}

function edgeKey(edge: { from: string; relation: string; to: string }): string {
  return `${edge.from}|${edge.relation}|${edge.to}`;
}

function safeRead(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

function sortMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, Array.isArray(value) ? stableUnknownArray(value) : value]),
  );
}

function decorateStaticMetadata(pathValue: string, metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  const advisoryOnly = !isGovernedStaticPath(pathValue);
  if (!metadata && !advisoryOnly) {
    return undefined;
  }

  return sortMetadata({
    ...(metadata ?? {}),
    ...(advisoryOnly ? {
      advisory_only: true,
      governance_scope: "repo_internal_supporting_path",
    } : {}),
  });
}

function stableUnknownArray(values: unknown[]): unknown[] {
  return [...values].sort((left, right) => String(left).localeCompare(String(right)));
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? stableUnique(value.filter((entry): entry is string => typeof entry === "string")) : [];
}
