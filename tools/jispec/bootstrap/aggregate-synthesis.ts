import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { normalizeBoundaryLabel, selectBusinessBoundaryLabel } from "./domain-boundary-policy";
import { getTaxonomyAggregateName, type DomainTaxonomyPack } from "./domain-taxonomy";
import {
  getEvidenceConfidenceScore,
  normalizeEvidencePath,
  type EvidenceDocument,
  type EvidenceGraph,
  type EvidenceRoute,
  type EvidenceSchema,
  type EvidenceTest,
} from "./evidence-graph";
import type { BusinessVocabularyTerm } from "./business-vocabulary";

export interface AggregateRootCandidate {
  name: string;
  sourceFiles: string[];
  confidenceScore: number;
  provenanceNote: string;
  evidence: {
    schemas: number;
    routes: number;
    tests: number;
    documents: number;
    businessVocabulary: number;
  };
}

export interface BuildAggregateRootCandidatesInput {
  schemas: EvidenceSchema[];
  routes: EvidenceRoute[];
  tests: EvidenceTest[];
  documents: EvidenceDocument[];
  businessVocabulary: BusinessVocabularyTerm[];
  taxonomyPacks?: DomainTaxonomyPack[];
  limit?: number;
}

interface AggregateAccumulator {
  name: string;
  sourceFiles: Set<string>;
  schemaCount: number;
  routeCount: number;
  testCount: number;
  documentCount: number;
  vocabularyCount: number;
  score: number;
  reasons: string[];
}

type UnknownRecord = Record<string, unknown>;

const ROUTE_ACTION_WORDS = new Set([
  "api",
  "create",
  "delete",
  "get",
  "health",
  "list",
  "login",
  "logout",
  "post",
  "put",
  "remove",
  "request",
  "requests",
  "response",
  "responses",
  "result",
  "results",
  "status",
  "update",
  "v1",
  "v2",
  "v3",
]);

const AGGREGATE_NAME_BLOCKLIST = new Set([
  "Api",
  "App",
  "Database",
  "Db",
  "Generated",
  "Login",
  "Logout",
  "Migration",
  "Route",
  "Routes",
  "Schema",
  "Server",
  "Service",
  "Test",
]);

export function buildAggregateRootCandidates(
  graph: EvidenceGraph,
  input: BuildAggregateRootCandidatesInput,
): AggregateRootCandidate[] {
  const taxonomyPacks = input.taxonomyPacks ?? [];
  const accumulators = new Map<string, AggregateAccumulator>();
  const add = (
    rawName: string,
    sourcePath: string,
    score: number,
    reason: string,
    kind: keyof AggregateRootCandidate["evidence"],
  ) => {
    const name = normalizeAggregateName(rawName);
    if (!name || AGGREGATE_NAME_BLOCKLIST.has(name)) {
      return;
    }

    if (!accumulators.has(name)) {
      accumulators.set(name, {
        name,
        sourceFiles: new Set<string>(),
        schemaCount: 0,
        routeCount: 0,
        testCount: 0,
        documentCount: 0,
        vocabularyCount: 0,
        score: 0,
        reasons: [],
      });
    }

    const accumulator = accumulators.get(name)!;
    accumulator.sourceFiles.add(normalizeEvidencePath(sourcePath));
    accumulator.score += score;
    accumulator.reasons.push(reason);

    if (kind === "schemas") {
      accumulator.schemaCount += 1;
    } else if (kind === "routes") {
      accumulator.routeCount += 1;
    } else if (kind === "tests") {
      accumulator.testCount += 1;
    } else if (kind === "documents") {
      accumulator.documentCount += 1;
    } else if (kind === "businessVocabulary") {
      accumulator.vocabularyCount += 1;
    }
  };

  for (const term of input.businessVocabulary) {
    const aggregateName = aggregateNameForLabel(term.label, taxonomyPacks);
    add(
      aggregateName,
      term.sourcePath,
      120 + Math.min(term.score / 2, 80),
      `business vocabulary '${term.phrase}' mapped to ${aggregateName}`,
      "businessVocabulary",
    );
  }

  for (const document of input.documents) {
    const content = safelyReadRepoFile(graph, document.path);
    if (!content) {
      continue;
    }
    for (const aggregateName of extractDocumentAggregateNames(content, taxonomyPacks)) {
      add(
        aggregateName,
        document.path,
        82 + getEvidenceConfidenceScore(document) * 30,
        `document noun ${aggregateName} found in ${document.path}`,
        "documents",
      );
    }
  }

  for (const schema of input.schemas) {
    for (const aggregateName of extractSchemaAggregateNames(graph, schema)) {
      add(
        aggregateName,
        schema.path,
        105 + getEvidenceConfidenceScore(schema) * 70 + schemaFormatBonus(schema),
        `${schema.format} aggregate ${aggregateName} parsed from ${schema.path}`,
        "schemas",
      );
    }
  }

  for (const route of input.routes) {
    for (const aggregateName of inferRouteAggregateNames(route, taxonomyPacks)) {
      add(
        aggregateName,
        route.sourceFiles[0] ?? route.path,
        24 + getEvidenceConfidenceScore(route) * 28,
        `route group ${route.method ?? "UNKNOWN"} ${route.path} suggested ${aggregateName}`,
        "routes",
      );
    }
  }

  for (const test of input.tests) {
    for (const aggregateName of inferPathAggregateNames(test.path, taxonomyPacks)) {
      add(
        aggregateName,
        test.path,
        36 + getEvidenceConfidenceScore(test) * 34,
        `test asset ${test.path} suggested ${aggregateName}`,
        "tests",
      );
    }
  }

  const limit = Math.max(1, Math.trunc(input.limit ?? 12));
  return [...accumulators.values()]
    .map((candidate) => {
      const strongEvidenceCount = candidate.schemaCount + candidate.vocabularyCount + candidate.documentCount + candidate.testCount;
      const evidenceScore = strongEvidenceCount > 0
        ? Math.min(candidate.score / 520, 0.48)
        : Math.min(candidate.score / 900, 0.18);
      const confidenceScore = clampScore(
        0.26 +
          evidenceScore +
          (candidate.schemaCount > 0 ? 0.14 : 0) +
          (candidate.vocabularyCount > 0 ? 0.12 : 0) +
          (candidate.documentCount > 0 ? 0.08 : 0) +
          (candidate.testCount > 0 ? 0.04 : 0) +
          (candidate.routeCount > 0 && candidate.schemaCount + candidate.vocabularyCount + candidate.documentCount > 0 ? 0.03 : 0),
      );
      const sourceFiles = [...candidate.sourceFiles].sort((left, right) => left.localeCompare(right));
      const provenanceNote = buildAggregateProvenanceNote(candidate);

      return {
        name: candidate.name,
        sourceFiles,
        confidenceScore,
        provenanceNote,
        evidence: {
          schemas: candidate.schemaCount,
          routes: candidate.routeCount,
          tests: candidate.testCount,
          documents: candidate.documentCount,
          businessVocabulary: candidate.vocabularyCount,
        },
      } satisfies AggregateRootCandidate;
    })
    .sort((left, right) => {
      const confidenceDelta = right.confidenceScore - left.confidenceScore;
      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }
      const sourceDelta = right.sourceFiles.length - left.sourceFiles.length;
      if (sourceDelta !== 0) {
        return sourceDelta;
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, limit);
}

function extractSchemaAggregateNames(graph: EvidenceGraph, schema: EvidenceSchema): string[] {
  const content = safelyReadRepoFile(graph, schema.path);
  const names = new Set<string>();

  if (schema.format === "protobuf") {
    if (content) {
      const messageNames = [...content.matchAll(/\bmessage\s+([A-Za-z_]\w*)\s*\{/g)].map((match) => match[1]);
      const messageNameSet = new Set(messageNames);
      for (const messageName of messageNames) {
        if (/(?:Request|Response|Result|Reply|Error)$/i.test(messageName)) {
          continue;
        }
        const unwrapped = messageName.replace(/(?:Request|Response|Result)$/i, "");
        if (unwrapped !== messageName && messageNameSet.has(unwrapped)) {
          continue;
        }
        names.add(messageName);
      }
    }
    const fallback = aggregateNameFromPath(schema.path);
    if (fallback && names.size === 0) {
      names.add(fallback);
    }
    return [...names];
  }

  if (schema.format === "database-schema") {
    if (content) {
      for (const match of content.matchAll(/\bmodel\s+([A-Za-z_]\w*)\s*\{/g)) {
        names.add(match[1]);
      }
      for (const match of content.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?["'`[]?([A-Za-z_][\w]*)/gi)) {
        names.add(toPascalCase(singularize(match[1])));
      }
    }
    return [...names];
  }

  if (schema.format === "openapi") {
    const parsed = parseStructuredDocument(content);
    const schemas = asRecord(asRecord(parsed)?.components)?.schemas;
    if (schemas && typeof schemas === "object") {
      for (const key of Object.keys(schemas as UnknownRecord)) {
        names.add(key);
      }
    }
    return [...names];
  }

  if (schema.format === "json-schema") {
    const parsed = parseStructuredDocument(content);
    const title = getString(asRecord(parsed)?.title);
    if (title) {
      names.add(title);
    }
    const fallback = aggregateNameFromPath(schema.path);
    if (fallback) {
      names.add(fallback);
    }
  }

  return [...names];
}

function extractDocumentAggregateNames(content: string, taxonomyPacks: DomainTaxonomyPack[]): string[] {
  const names = new Set<string>();
  const pascalPattern = /\b([A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+)\b/g;
  for (const match of content.matchAll(pascalPattern)) {
    names.add(match[1]);
  }

  for (const term of taxonomyPacks.flatMap((pack) => pack.terms)) {
    const aggregateName = term.aggregateName ?? aggregateNameForLabel(term.label, taxonomyPacks);
    const matched = term.phrases.some((phrase) => new RegExp(escapeRegExp(phrase).replace(/\s+/g, "\\s+"), "i").test(content));
    if (matched || content.includes(aggregateName)) {
      names.add(aggregateName);
    }
  }

  return [...names];
}

function inferRouteAggregateNames(route: EvidenceRoute, taxonomyPacks: DomainTaxonomyPack[]): string[] {
  const words = route.path
    .replace(/\$\{[^}]+\}/g, " ")
    .split(/[^A-Za-z0-9]+/g)
    .map((part) => normalizeBoundaryLabel(part))
    .filter((part) => part.length >= 3 && !ROUTE_ACTION_WORDS.has(part));
  const names = new Set<string>();

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const selected = selectBusinessBoundaryLabel(word);
    if (selected) {
      names.add(aggregateNameForLabel(selected, taxonomyPacks));
    }
  }

  for (const sourceFile of route.sourceFiles) {
    for (const name of inferPathAggregateNames(sourceFile, taxonomyPacks)) {
      names.add(name);
    }
  }

  return [...names];
}

function inferPathAggregateNames(repoPath: string, taxonomyPacks: DomainTaxonomyPack[] = []): string[] {
  const basename = path.posix.basename(normalizeEvidencePath(repoPath)).replace(/\.[^.]+$/g, "");
  const cleaned = basename.replace(/(?:^|[-_.])(route|routes|router|controller|controllers|service|services|handler|handlers|test|spec)$/gi, "");
  const label = selectBusinessBoundaryLabel(cleaned);
  if (!label) {
    return [];
  }
  return [aggregateNameForLabel(label, taxonomyPacks)];
}

function aggregateNameFromPath(repoPath: string): string | undefined {
  const basename = path.posix.basename(normalizeEvidencePath(repoPath)).replace(/\.[^.]+$/g, "").replace(/\.(schema|spec|test)$/g, "");
  const label = selectBusinessBoundaryLabel(basename);
  return label ? aggregateNameForLabel(label, []) : undefined;
}

function aggregateNameForLabel(label: string, taxonomyPacks: DomainTaxonomyPack[]): string {
  return getTaxonomyAggregateName(label, taxonomyPacks) ?? toPascalCase(singularize(label));
}

function buildAggregateProvenanceNote(candidate: AggregateAccumulator): string {
  const channels: string[] = [];
  if (candidate.schemaCount > 0) {
    channels.push(`${candidate.schemaCount} schema/model signal(s)`);
  }
  if (candidate.vocabularyCount > 0) {
    channels.push(`${candidate.vocabularyCount} business vocabulary signal(s)`);
  }
  if (candidate.documentCount > 0) {
    channels.push(`${candidate.documentCount} document noun signal(s)`);
  }
  if (candidate.routeCount > 0) {
    channels.push(`${candidate.routeCount} route group signal(s)`);
  }
  if (candidate.testCount > 0) {
    channels.push(`${candidate.testCount} test-name signal(s)`);
  }

  const reason = candidate.reasons[0] ?? "aggregate candidate inferred from bootstrap evidence";
  return `Synthesized from ${channels.join(", ") || "bootstrap evidence"}; strongest signal: ${reason}.`;
}

function schemaFormatBonus(schema: EvidenceSchema): number {
  if (schema.format === "protobuf") {
    return 30;
  }
  if (schema.format === "openapi") {
    return 24;
  }
  if (schema.format === "database-schema") {
    return 20;
  }
  if (schema.format === "json-schema") {
    return 16;
  }
  return 0;
}

function normalizeAggregateName(rawName: string): string | undefined {
  const cleaned = rawName.replace(/^[^A-Za-z]+|[^A-Za-z0-9]+$/g, "");
  if (!cleaned) {
    return undefined;
  }
  const name = /^[A-Z][A-Za-z0-9]+$/.test(cleaned) ? cleaned : toPascalCase(cleaned);
  return name.length >= 3 ? name : undefined;
}

function toPascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("");
}

function singularize(value: string): string {
  if (value.endsWith("ies") && value.length > 4) {
    return `${value.slice(0, -3)}y`;
  }
  if (value.endsWith("s") && value.length > 4 && !value.endsWith("ss")) {
    return value.slice(0, -1);
  }
  return value;
}

function parseStructuredDocument(content: string | undefined): unknown {
  if (!content) {
    return undefined;
  }
  try {
    return yaml.load(content);
  } catch {
    try {
      return JSON.parse(content);
    } catch {
      return undefined;
    }
  }
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function safelyReadRepoFile(graph: EvidenceGraph, repoPath: string): string | undefined {
  const absolutePath = path.resolve(graph.repoRoot, repoPath);
  try {
    if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).size > 1024 * 1024) {
      return undefined;
    }
    return fs.readFileSync(absolutePath, "utf-8");
  } catch {
    return undefined;
  }
}

function clampScore(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
