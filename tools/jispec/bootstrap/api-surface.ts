import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import {
  getEvidenceConfidenceScore,
  normalizeEvidencePath,
  type EvidenceGraph,
  type EvidenceRoute,
  type EvidenceSchema,
  type EvidenceSourceFile,
} from "./evidence-graph";
import { buildProtoDomainMappings, findProtoOperationMapping } from "./proto-domain-mapping";
import type { DomainTaxonomyPack } from "./domain-taxonomy";

export type ApiSurfaceKind =
  | "explicit_endpoint"
  | "openapi_contract"
  | "protobuf_service"
  | "typed_handler_inference"
  | "module_surface_inference"
  | "weak_candidate";

export interface ApiSurfaceSupportingSchema {
  path: string;
  format: EvidenceSchema["format"];
  confidence_score: number;
}

export interface ApiSurface {
  id: string;
  surface_kind: ApiSurfaceKind;
  source_files: string[];
  confidence_score: number;
  provenance_note: string;
  method?: string;
  path?: string;
  candidate_path?: string;
  operation?: string;
  service?: string;
  bounded_context?: string;
  context_labels?: string[];
  aggregate_roots?: string[];
  proto_operation?: {
    service: string;
    rpc?: string;
    request_type?: string;
    response_type?: string;
  };
  request_type?: string;
  response_type?: string;
  supporting_schemas?: ApiSurfaceSupportingSchema[];
}

export interface BuildApiSurfacesOptions {
  schemas?: EvidenceSchema[];
  taxonomyPacks?: DomainTaxonomyPack[];
  limit?: number;
}

type UnknownRecord = Record<string, unknown>;

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head", "trace"]);
const MODULE_SURFACE_CATEGORIES = new Set<EvidenceSourceFile["category"]>([
  "controller",
  "service",
  "route",
  "interface",
  "trait",
  "entrypoint",
  "sdk",
]);

const SURFACE_KIND_PRIORITY: Record<ApiSurfaceKind, number> = {
  openapi_contract: 600,
  protobuf_service: 560,
  explicit_endpoint: 500,
  typed_handler_inference: 430,
  module_surface_inference: 320,
  weak_candidate: 100,
};

export function buildApiSurfaces(graph: EvidenceGraph, options: BuildApiSurfacesOptions = {}): ApiSurface[] {
  const schemas = options.schemas ?? graph.schemas ?? [];
  const surfaces: ApiSurface[] = [];

  for (const schema of schemas) {
    if (schema.format === "openapi") {
      surfaces.push(...openApiSchemaToSurfaces(graph, schema));
    } else if (schema.format === "protobuf") {
      surfaces.push(...protobufSchemaToSurfaces(graph, schema));
    }
  }

  for (const route of graph.routes ?? []) {
    if (route.path.startsWith("/") && route.method && route.signal !== "route_candidate") {
      surfaces.push(explicitRouteToSurface(route, schemas));
    } else {
      surfaces.push(weakRouteCandidateToSurface(route));
    }
  }

  const typedSurfaces = collectTypedHandlerSurfaces(graph, schemas);
  surfaces.push(...typedSurfaces);

  const alreadyClassifiedSourceFiles = new Set(
    surfaces.flatMap((surface) => surface.source_files).map((sourceFile) => normalizeEvidencePath(sourceFile)),
  );
  for (const sourceFile of graph.sourceFiles ?? []) {
    if (!MODULE_SURFACE_CATEGORIES.has(sourceFile.category) || alreadyClassifiedSourceFiles.has(sourceFile.path)) {
      continue;
    }
    surfaces.push(moduleSourceToSurface(sourceFile, schemas));
  }

  const annotatedSurfaces = annotateProtoBackedSurfaces(graph, schemas, surfaces, options.taxonomyPacks ?? []);
  const limit = Math.max(1, Math.trunc(options.limit ?? 32));
  return dedupeAndSortSurfaces(annotatedSurfaces).slice(0, limit);
}

function annotateProtoBackedSurfaces(
  graph: EvidenceGraph,
  schemas: EvidenceSchema[],
  surfaces: ApiSurface[],
  taxonomyPacks: DomainTaxonomyPack[],
): ApiSurface[] {
  const mappings = buildProtoDomainMappings(graph, { schemas, taxonomyPacks, limit: 32 });
  if (mappings.length === 0) {
    return surfaces;
  }

  return surfaces.map((surface) => {
    if (surface.surface_kind !== "protobuf_service") {
      return surface;
    }

    const match = findProtoOperationMapping(mappings, surface.service, surface.operation);
    if (!match) {
      return surface;
    }

    const aggregateRoots = [
      ...match.serviceMapping.aggregateRoots,
      ...(match.operationMapping?.aggregateRoots ?? []),
    ];
    return {
      ...surface,
      bounded_context: match.serviceMapping.boundedContext,
      context_labels: match.serviceMapping.contextLabels,
      aggregate_roots: normalizeStringList(aggregateRoots),
      proto_operation: {
        service: match.serviceMapping.service,
        rpc: match.operationMapping?.operation ?? surface.operation,
        request_type: match.operationMapping?.requestType ?? surface.request_type,
        response_type: match.operationMapping?.responseType ?? surface.response_type,
      },
      provenance_note: `${surface.provenance_note} Mapped to ${match.serviceMapping.boundedContext}.`,
    };
  });
}

function openApiSchemaToSurfaces(graph: EvidenceGraph, schema: EvidenceSchema): ApiSurface[] {
  const content = safelyReadRepoFile(graph, schema.path);
  const parsed = parseStructuredDocument(content);
  const paths = asRecord(asRecord(parsed)?.paths);

  if (!paths || Object.keys(paths).length === 0) {
    return [
      {
        id: `openapi-contract-${slugify(schema.path)}`,
        surface_kind: "openapi_contract",
        source_files: [schema.path],
        confidence_score: clampScore(0.72 + getEvidenceConfidenceScore(schema) * 0.24),
        provenance_note: schema.provenanceNote || `Detected OpenAPI contract asset at ${schema.path}.`,
        operation: inferOperationNameFromPath(schema.path),
        supporting_schemas: [schemaToSupportingSchema(schema)],
      },
    ];
  }

  const surfaces: ApiSurface[] = [];
  for (const [routePath, pathItem] of Object.entries(paths)) {
    if (!routePath.startsWith("/")) {
      continue;
    }
    const operations = asRecord(pathItem);
    if (!operations) {
      continue;
    }

    for (const [rawMethod, operationValue] of Object.entries(operations)) {
      const method = rawMethod.toLowerCase();
      if (!HTTP_METHODS.has(method)) {
        continue;
      }

      const operation = asRecord(operationValue);
      const operationId = getString(operation?.operationId) ?? getString(operation?.summary);
      surfaces.push({
        id: `openapi-${method}-${slugify(routePath) || "root"}`,
        surface_kind: "openapi_contract",
        method: method.toUpperCase(),
        path: routePath,
        operation: operationId ?? `${method.toUpperCase()} ${routePath}`,
        request_type: extractOpenApiRequestType(operation),
        response_type: extractOpenApiResponseType(operation),
        source_files: [schema.path],
        confidence_score: clampScore(0.74 + getEvidenceConfidenceScore(schema) * 0.24),
        provenance_note: schema.provenanceNote || `Parsed ${method.toUpperCase()} ${routePath} from OpenAPI contract ${schema.path}.`,
        supporting_schemas: [schemaToSupportingSchema(schema)],
      });
    }
  }

  if (surfaces.length > 0) {
    return surfaces;
  }

  return [
    {
      id: `openapi-contract-${slugify(schema.path)}`,
      surface_kind: "openapi_contract",
      source_files: [schema.path],
      confidence_score: clampScore(0.68 + getEvidenceConfidenceScore(schema) * 0.24),
      provenance_note: `OpenAPI contract ${schema.path} was detected, but no concrete path operations were parsed.`,
      operation: inferOperationNameFromPath(schema.path),
      supporting_schemas: [schemaToSupportingSchema(schema)],
    },
  ];
}

function protobufSchemaToSurfaces(graph: EvidenceGraph, schema: EvidenceSchema): ApiSurface[] {
  const content = safelyReadRepoFile(graph, schema.path);
  if (!content) {
    return [
      {
        id: `protobuf-contract-${slugify(schema.path)}`,
        surface_kind: "protobuf_service",
        source_files: [schema.path],
        confidence_score: clampScore(0.68 + getEvidenceConfidenceScore(schema) * 0.24),
        provenance_note: schema.provenanceNote || `Detected protobuf contract asset at ${schema.path}.`,
        operation: inferOperationNameFromPath(schema.path),
        supporting_schemas: [schemaToSupportingSchema(schema)],
      },
    ];
  }

  const surfaces: ApiSurface[] = [];
  const servicePattern = /\bservice\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\}/g;
  for (const serviceMatch of content.matchAll(servicePattern)) {
    const service = serviceMatch[1];
    const body = serviceMatch[2] ?? "";
    const rpcPattern =
      /\brpc\s+([A-Za-z_]\w*)\s*\(\s*(?:stream\s+)?([A-Za-z_]\w*)\s*\)\s+returns\s*\(\s*(?:stream\s+)?([A-Za-z_]\w*)\s*\)/g;

    for (const rpcMatch of body.matchAll(rpcPattern)) {
      const rpcName = rpcMatch[1];
      const requestType = rpcMatch[2];
      const responseType = rpcMatch[3];
      surfaces.push({
        id: `protobuf-${slugify(service)}-${slugify(rpcName)}`,
        surface_kind: "protobuf_service",
        service,
        operation: rpcName,
        request_type: requestType,
        response_type: responseType,
        source_files: [schema.path],
        confidence_score: clampScore(0.73 + getEvidenceConfidenceScore(schema) * 0.24),
        provenance_note: schema.provenanceNote || `Parsed ${service}.${rpcName} from protobuf service contract ${schema.path}.`,
        supporting_schemas: [schemaToSupportingSchema(schema)],
      });
    }
  }

  if (surfaces.length > 0) {
    return surfaces;
  }

  return [
    {
      id: `protobuf-contract-${slugify(schema.path)}`,
      surface_kind: "protobuf_service",
      source_files: [schema.path],
      confidence_score: clampScore(0.67 + getEvidenceConfidenceScore(schema) * 0.22),
      provenance_note: `Protobuf contract ${schema.path} was detected, but no service RPC was parsed.`,
      operation: inferOperationNameFromPath(schema.path),
      supporting_schemas: [schemaToSupportingSchema(schema)],
    },
  ];
}

function explicitRouteToSurface(route: EvidenceRoute, schemas: EvidenceSchema[]): ApiSurface {
  const supportingSchemas = selectSupportingSchemas(`${route.path} ${route.method ?? ""}`, schemas);
  return {
    id: `${(route.method ?? "unknown").toLowerCase()}-${slugify(route.path) || "root"}`,
    surface_kind: "explicit_endpoint",
    method: route.method ?? "UNKNOWN",
    path: route.path,
    source_files: normalizeSourceFiles([
      ...route.sourceFiles,
      ...supportingSchemas.map((schema) => schema.path),
    ]),
    confidence_score: clampScore(0.54 + getEvidenceConfidenceScore(route) * 0.38),
    provenance_note: route.provenanceNote || `Detected explicit HTTP endpoint in ${joinSourceFiles(route.sourceFiles)}.`,
    supporting_schemas: supportingSchemas.map(schemaToSupportingSchema),
  };
}

function weakRouteCandidateToSurface(route: EvidenceRoute): ApiSurface {
  const sourceFiles = normalizeSourceFiles(route.sourceFiles.length > 0 ? route.sourceFiles : [route.path]);
  return {
    id: `weak-route-candidate-${slugify(sourceFiles[0] ?? route.path) || "surface"}`,
    surface_kind: "weak_candidate",
    candidate_path: route.path,
    method: "UNKNOWN",
    source_files: sourceFiles,
    confidence_score: clampScore(0.2 + getEvidenceConfidenceScore(route) * 0.44),
    provenance_note:
      route.provenanceNote ||
      `Route-like source was discovered in ${joinSourceFiles(sourceFiles)}, but no concrete endpoint signature was found.`,
  };
}

function collectTypedHandlerSurfaces(graph: EvidenceGraph, schemas: EvidenceSchema[]): ApiSurface[] {
  const surfaces: ApiSurface[] = [];

  for (const sourceFile of graph.sourceFiles ?? []) {
    if (!isTypedHandlerCandidate(sourceFile)) {
      continue;
    }

    const content = safelyReadRepoFile(graph, sourceFile.path);
    if (!content) {
      continue;
    }

    const extension = path.posix.extname(sourceFile.path.toLowerCase());
    const signatures =
      extension === ".go"
        ? extractGoTypedHandlers(content)
        : extension === ".rs"
          ? extractRustTypedHandlers(content)
          : [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(extension)
            ? extractTypeScriptTypedHandlers(content)
            : [];

    for (const signature of signatures) {
      const supportingSchemas = selectSupportingSchemas(
        `${sourceFile.path} ${signature.name} ${signature.requestType ?? ""} ${signature.responseType ?? ""}`,
        schemas,
      );
      surfaces.push({
        id: `typed-${slugify(sourceFile.path)}-${slugify(signature.name)}`,
        surface_kind: "typed_handler_inference",
        operation: signature.name,
        request_type: signature.requestType,
        response_type: signature.responseType,
        source_files: normalizeSourceFiles([
          sourceFile.path,
          ...supportingSchemas.map((schema) => schema.path),
        ]),
        confidence_score: clampScore(handlerBaseConfidence(sourceFile.category) + signature.strength * 0.18),
        provenance_note: `Inferred typed handler surface ${signature.name} from ${sourceFile.category} source ${sourceFile.path}.`,
        supporting_schemas: supportingSchemas.map(schemaToSupportingSchema),
      });
    }
  }

  return surfaces;
}

function moduleSourceToSurface(sourceFile: EvidenceSourceFile, schemas: EvidenceSchema[]): ApiSurface {
  const supportingSchemas = selectSupportingSchemas(sourceFile.path, schemas);
  return {
    id: `module-${slugify(sourceFile.path) || "surface"}`,
    surface_kind: "module_surface_inference",
    operation: inferOperationNameFromPath(sourceFile.path),
    source_files: normalizeSourceFiles([
      sourceFile.path,
      ...supportingSchemas.map((schema) => schema.path),
    ]),
    confidence_score: moduleSurfaceConfidence(sourceFile.category),
    provenance_note: `Inferred module-level API surface from ${sourceFile.category} source ${sourceFile.path}; review before adopting as an endpoint contract.`,
    supporting_schemas: supportingSchemas.map(schemaToSupportingSchema),
  };
}

interface TypedHandlerSignature {
  name: string;
  requestType?: string;
  responseType?: string;
  strength: number;
}

function extractGoTypedHandlers(content: string): TypedHandlerSignature[] {
  const signatures: TypedHandlerSignature[] = [];
  const functionPattern =
    /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:\(([^)]*)\)|([A-Za-z_][\w.\[\]*]*))?/g;
  for (const match of content.matchAll(functionPattern)) {
    const signature = buildTypedSignature(match[1], match[2], match[3] ?? match[4], "go");
    if (signature) {
      signatures.push(signature);
    }
  }

  const interfaceMethodPattern =
    /^\s*([A-Za-z_]\w*)\s*\(([^)]*(?:Context|Request|Response|http\.)[^)]*)\)\s*(?:\(([^)]*)\)|([A-Za-z_][\w.\[\]*]*))?/gm;
  for (const match of content.matchAll(interfaceMethodPattern)) {
    const signature = buildTypedSignature(match[1], match[2], match[3] ?? match[4], "go");
    if (signature) {
      signatures.push(signature);
    }
  }

  return uniqueSignatures(signatures);
}

function extractRustTypedHandlers(content: string): TypedHandlerSignature[] {
  const signatures: TypedHandlerSignature[] = [];
  const functionPattern =
    /\bpub\s+(?:async\s+)?fn\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:->\s*([^{;]+))?/g;
  for (const match of content.matchAll(functionPattern)) {
    const signature = buildTypedSignature(match[1], match[2], match[3], "rust");
    if (signature) {
      signatures.push(signature);
    }
  }

  return uniqueSignatures(signatures);
}

function extractTypeScriptTypedHandlers(content: string): TypedHandlerSignature[] {
  const signatures: TypedHandlerSignature[] = [];
  const functionPattern =
    /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?::\s*([^{;]+))?/g;
  for (const match of content.matchAll(functionPattern)) {
    const signature = buildTypedSignature(match[1], match[2], match[3], "typescript");
    if (signature) {
      signatures.push(signature);
    }
  }

  const arrowPattern =
    /\b(?:export\s+)?const\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*([^=]+?))?\s*=>/g;
  for (const match of content.matchAll(arrowPattern)) {
    const signature = buildTypedSignature(match[1], match[2], match[3], "typescript");
    if (signature) {
      signatures.push(signature);
    }
  }

  const methodPattern =
    /^\s*(?:public\s+|protected\s+)?(?:async\s+)?([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?::\s*([^{;]+))?\s*\{/gm;
  for (const match of content.matchAll(methodPattern)) {
    const signature = buildTypedSignature(match[1], match[2], match[3], "typescript");
    if (signature) {
      signatures.push(signature);
    }
  }

  return uniqueSignatures(signatures);
}

function buildTypedSignature(
  name: string | undefined,
  params: string | undefined,
  returns: string | undefined,
  language: "go" | "rust" | "typescript",
): TypedHandlerSignature | undefined {
  if (!name || !params) {
    return undefined;
  }

  const signatureText = `${name} ${params} ${returns ?? ""}`;
  if (!hasTypedHandlerSignal(signatureText)) {
    return undefined;
  }

  const requestType = extractRequestType(params, language);
  const responseType = returns ? cleanTypeExpression(returns) : extractResponseType(params, language);

  return {
    name,
    requestType,
    responseType,
    strength: typedSignalStrength(signatureText, requestType, responseType),
  };
}

function hasTypedHandlerSignal(signatureText: string): boolean {
  return /\b(Request|Response|DTO|Dto|Command|Query|Context|FastifyRequest|Express\.Request|http\.Request|ResponseWriter|Json<|Request<|Response<|ctx|req|res)\b/.test(
    signatureText,
  );
}

function typedSignalStrength(signatureText: string, requestType?: string, responseType?: string): number {
  let strength = 0.5;
  if (requestType) {
    strength += 0.18;
  }
  if (responseType) {
    strength += 0.16;
  }
  if (/\b(Request|Command|Query|DTO|Dto)\b/.test(signatureText)) {
    strength += 0.08;
  }
  if (/\b(Response|Result|Reply)\b/.test(signatureText)) {
    strength += 0.08;
  }
  return Math.min(1, strength);
}

function extractRequestType(params: string, language: "go" | "rust" | "typescript"): string | undefined {
  const normalized = params.replace(/\s+/g, " ").trim();
  const candidates =
    language === "typescript"
      ? [
          /:\s*([A-Za-z_][\w.]*Request[A-Za-z0-9_<>.]*)/,
          /:\s*(FastifyRequest|Express\.Request|Request<[^>]+>|[A-Za-z_][\w.]*Command[A-Za-z0-9_<>.]*)/,
        ]
      : language === "rust"
        ? [
            /\bJson<\s*([A-Za-z_]\w*)\s*>/,
            /\b([A-Za-z_]\w*(?:Request|Command|Query))\b/,
          ]
        : [
            /\b\*?http\.Request\b/,
            /\bcontext\.Context\b/,
            /\b\*?([A-Za-z_]\w*(?:Request|Command|Query))\b/,
          ];

  for (const pattern of candidates) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return cleanTypeExpression(match[1]);
    }
    if (match?.[0] === "http.Request" || match?.[0] === "*http.Request") {
      return "http.Request";
    }
    if (match?.[0] === "context.Context") {
      return "context.Context";
    }
  }

  return undefined;
}

function extractResponseType(params: string, language: "go" | "rust" | "typescript"): string | undefined {
  if (language !== "go") {
    return undefined;
  }

  if (/\bhttp\.ResponseWriter\b/.test(params)) {
    return "http.ResponseWriter";
  }

  return undefined;
}

function cleanTypeExpression(input: string): string {
  return input
    .replace(/\s+/g, " ")
    .replace(/[,;{].*$/g, "")
    .replace(/\berror\b/g, "")
    .replace(/^\*+/, "")
    .trim();
}

function uniqueSignatures(signatures: TypedHandlerSignature[]): TypedHandlerSignature[] {
  const byKey = new Map<string, TypedHandlerSignature>();
  for (const signature of signatures) {
    const key = `${signature.name}|${signature.requestType ?? ""}|${signature.responseType ?? ""}`;
    const existing = byKey.get(key);
    if (!existing || signature.strength > existing.strength) {
      byKey.set(key, signature);
    }
  }
  return [...byKey.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function isTypedHandlerCandidate(sourceFile: EvidenceSourceFile): boolean {
  const extension = path.posix.extname(sourceFile.path.toLowerCase());
  if (![".go", ".rs", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
    return false;
  }

  return MODULE_SURFACE_CATEGORIES.has(sourceFile.category);
}

function handlerBaseConfidence(category: EvidenceSourceFile["category"]): number {
  switch (category) {
    case "interface":
    case "trait":
      return 0.66;
    case "controller":
    case "route":
      return 0.62;
    case "service":
      return 0.6;
    case "entrypoint":
      return 0.57;
    case "sdk":
      return 0.54;
    default:
      return 0.52;
  }
}

function moduleSurfaceConfidence(category: EvidenceSourceFile["category"]): number {
  switch (category) {
    case "interface":
    case "trait":
      return 0.66;
    case "entrypoint":
      return 0.61;
    case "sdk":
      return 0.58;
    case "controller":
      return 0.56;
    case "service":
      return 0.54;
    case "route":
      return 0.5;
    default:
      return 0.46;
  }
}

function selectSupportingSchemas(seed: string, schemas: EvidenceSchema[]): EvidenceSchema[] {
  const words = expandKeywords(extractKeywords(seed));
  if (words.length === 0) {
    return [];
  }

  return schemas
    .filter((schema) => {
      if (schema.format === "openapi" || schema.format === "protobuf") {
        return false;
      }
      const schemaPath = schema.path.toLowerCase();
      return words.some((word) => schemaPath.includes(word));
    })
    .sort((left, right) => {
      const confidenceDelta = getEvidenceConfidenceScore(right) - getEvidenceConfidenceScore(left);
      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }
      return left.path.localeCompare(right.path);
    })
    .slice(0, 3);
}

function extractKeywords(input: string): string[] {
  return [
    ...new Set(
      input
        .toLowerCase()
        .replace(/\$\{[^}]+\}/g, " ")
        .split(/[^a-z0-9]+/)
        .filter((part) => part.length >= 3 && !["api", "src", "app", "the", "and", "for", "with"].includes(part)),
    ),
  ];
}

function expandKeywords(words: string[]): string[] {
  const expanded = new Set<string>();
  for (const word of words) {
    expanded.add(word);
    if (word.endsWith("ies") && word.length > 4) {
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

function schemaToSupportingSchema(schema: EvidenceSchema): ApiSurfaceSupportingSchema {
  return {
    path: schema.path,
    format: schema.format,
    confidence_score: getEvidenceConfidenceScore(schema),
  };
}

function parseStructuredDocument(content: string | undefined): unknown {
  if (!content) {
    return undefined;
  }

  try {
    return yaml.load(content);
  } catch {
    return undefined;
  }
}

function extractOpenApiRequestType(operation: UnknownRecord | undefined): string | undefined {
  const requestBody = asRecord(operation?.requestBody);
  const content = asRecord(requestBody?.content);
  const contentEntry = firstRecordValue(content);
  const schema = asRecord(contentEntry?.schema);
  return extractSchemaTypeName(schema);
}

function extractOpenApiResponseType(operation: UnknownRecord | undefined): string | undefined {
  const responses = asRecord(operation?.responses);
  if (!responses) {
    return undefined;
  }

  for (const status of ["200", "201", "202", "204", "default"]) {
    const response = asRecord(responses[status]);
    const content = asRecord(response?.content);
    const contentEntry = firstRecordValue(content);
    const schema = asRecord(contentEntry?.schema);
    const typeName = extractSchemaTypeName(schema);
    if (typeName) {
      return typeName;
    }
  }

  return undefined;
}

function extractSchemaTypeName(schema: UnknownRecord | undefined): string | undefined {
  if (!schema) {
    return undefined;
  }

  const ref = getString(schema.$ref);
  if (ref) {
    return ref.split("/").filter(Boolean).at(-1);
  }

  const type = getString(schema.type);
  if (type === "array") {
    const itemType = extractSchemaTypeName(asRecord(schema.items));
    return itemType ? `${itemType}[]` : "array";
  }

  return type;
}

function firstRecordValue(record: UnknownRecord | undefined): UnknownRecord | undefined {
  if (!record) {
    return undefined;
  }

  for (const value of Object.values(record)) {
    const candidate = asRecord(value);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function safelyReadRepoFile(graph: EvidenceGraph, repoPath: string): string | undefined {
  try {
    return fs.readFileSync(path.resolve(graph.repoRoot, normalizeEvidencePath(repoPath)), "utf-8");
  } catch {
    return undefined;
  }
}

function dedupeAndSortSurfaces(surfaces: ApiSurface[]): ApiSurface[] {
  const byKey = new Map<string, ApiSurface>();
  for (const surface of surfaces) {
    const key = surfaceKey(surface);
    const existing = byKey.get(key);
    if (!existing || compareSurface(surface, existing) < 0) {
      byKey.set(key, normalizeSurface(surface));
    }
  }

  return [...byKey.values()].sort(compareSurface);
}

function surfaceKey(surface: ApiSurface): string {
  if (surface.method && surface.path) {
    return `${surface.surface_kind}:${surface.method.toUpperCase()}:${surface.path}`;
  }

  if (surface.service && surface.operation) {
    return `${surface.surface_kind}:${surface.service}:${surface.operation}`;
  }

  return `${surface.surface_kind}:${surface.operation ?? surface.candidate_path ?? surface.id}:${surface.source_files.join(",")}`;
}

function compareSurface(left: ApiSurface, right: ApiSurface): number {
  const priorityDelta = SURFACE_KIND_PRIORITY[right.surface_kind] - SURFACE_KIND_PRIORITY[left.surface_kind];
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const confidenceDelta = right.confidence_score - left.confidence_score;
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }

  return left.id.localeCompare(right.id);
}

function normalizeSurface(surface: ApiSurface): ApiSurface {
  const supportingSchemas = surface.supporting_schemas ?? [];
  return {
    ...surface,
    id: surface.id,
    source_files: normalizeSourceFiles(surface.source_files),
    confidence_score: clampScore(surface.confidence_score),
    context_labels: surface.context_labels ? normalizeStringList(surface.context_labels) : undefined,
    aggregate_roots: surface.aggregate_roots ? normalizeStringList(surface.aggregate_roots) : undefined,
    supporting_schemas: supportingSchemas.length > 0
      ? [...supportingSchemas].sort((left, right) => left.path.localeCompare(right.path))
      : undefined,
  };
}

function normalizeStringList(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right));
}

function normalizeSourceFiles(sourceFiles: string[]): string[] {
  return [...new Set(sourceFiles.map((sourceFile) => normalizeEvidencePath(sourceFile)))]
    .filter((sourceFile) => sourceFile.length > 0)
    .sort((left, right) => left.localeCompare(right));
}

function joinSourceFiles(sourceFiles: string[]): string {
  return normalizeSourceFiles(sourceFiles).join(", ");
}

function inferOperationNameFromPath(repoPath: string): string {
  return path.posix
    .basename(normalizeEvidencePath(repoPath))
    .replace(/\.[^.]+$/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim() || "module surface";
}

function slugify(input: string): string {
  return input
    .replace(/\$\{[^}]+\}/g, "param")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}
