import fs from "node:fs";
import path from "node:path";
import { normalizeBoundaryLabel } from "./domain-boundary-policy";
import {
  matchDomainTaxonomyServiceMapping,
  scoreDomainTaxonomyEvidence,
  type DomainTaxonomyPack,
} from "./domain-taxonomy";
import { normalizeEvidencePath, type EvidenceGraph, type EvidenceSchema } from "./evidence-graph";
import type { AggregateRootCandidate } from "./aggregate-synthesis";

export interface ProtoRpcMapping {
  operation: string;
  requestType?: string;
  responseType?: string;
  aggregateRoots: string[];
}

export interface ProtoServiceDomainMapping {
  service: string;
  boundedContext: string;
  contextLabels: string[];
  sourceFile: string;
  aggregateRoots: string[];
  operations: ProtoRpcMapping[];
  confidenceScore: number;
  provenanceNote: string;
}

export interface BuildProtoDomainMappingsOptions {
  schemas?: EvidenceSchema[];
  aggregateRoots?: AggregateRootCandidate[];
  taxonomyPacks?: DomainTaxonomyPack[];
  limit?: number;
}

interface ProtoServiceContextInference {
  boundedContext: string;
  contextLabels: string[];
  aggregateRoots: string[];
}

const GENERIC_RPC_BASE_NAMES = new Set([
  "Apply",
  "Create",
  "Delete",
  "Get",
  "List",
  "Query",
  "Run",
  "Switch",
  "Update",
]);

export function buildProtoDomainMappings(
  graph: EvidenceGraph,
  options: BuildProtoDomainMappingsOptions = {},
): ProtoServiceDomainMapping[] {
  const schemas = options.schemas ?? graph.schemas ?? [];
  const knownAggregateNames = new Set((options.aggregateRoots ?? []).map((aggregate) => aggregate.name));
  const taxonomyPacks = options.taxonomyPacks ?? [];
  const mappings: ProtoServiceDomainMapping[] = [];

  for (const schema of schemas) {
    if (schema.format !== "protobuf") {
      continue;
    }

    const content = safelyReadRepoFile(graph, schema.path);
    if (!content) {
      continue;
    }

    const declaredMessages = extractProtoMessageNames(content);
    for (const service of extractProtoServices(content)) {
      const contextInference = inferServiceContext(service.name, schema.path, content, taxonomyPacks);
      const operations = service.rpcs.map((rpc) => ({
        operation: rpc.operation,
        requestType: rpc.requestType,
        responseType: rpc.responseType,
        aggregateRoots: uniqueSorted([
          ...mapMessageTypeToAggregateRoots(rpc.requestType, knownAggregateNames, declaredMessages),
          ...mapMessageTypeToAggregateRoots(rpc.responseType, knownAggregateNames, declaredMessages),
        ]),
      }));
      const aggregateRoots = uniqueSorted([
        ...contextInference.aggregateRoots,
        ...operations.flatMap((operation) => operation.aggregateRoots),
        ...declaredMessages.filter((messageName) => messageBelongsToContext(messageName, contextInference)),
      ]);

      mappings.push({
        service: service.name,
        boundedContext: contextInference.boundedContext,
        contextLabels: contextInference.contextLabels,
        sourceFile: normalizeEvidencePath(schema.path),
        aggregateRoots,
        operations,
        confidenceScore: Number((0.78 + Math.min(operations.length * 0.04, 0.14) + Math.min(aggregateRoots.length * 0.015, 0.08)).toFixed(4)),
        provenanceNote: `Mapped protobuf service ${service.name} to ${contextInference.boundedContext} from ${schema.path}.`,
      });
    }
  }

  const limit = Math.max(1, Math.trunc(options.limit ?? 20));
  return mappings
    .sort((left, right) => {
      const confidenceDelta = right.confidenceScore - left.confidenceScore;
      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }
      return `${left.boundedContext}|${left.service}`.localeCompare(`${right.boundedContext}|${right.service}`);
    })
    .slice(0, limit);
}

export function findProtoOperationMapping(
  mappings: ProtoServiceDomainMapping[],
  service: string | undefined,
  operation: string | undefined,
): { serviceMapping: ProtoServiceDomainMapping; operationMapping?: ProtoRpcMapping } | undefined {
  if (!service) {
    return undefined;
  }

  const serviceMapping = mappings.find((mapping) => mapping.service === service);
  if (!serviceMapping) {
    return undefined;
  }

  const operationMapping = operation
    ? serviceMapping.operations.find((candidate) => candidate.operation === operation)
    : undefined;
  return { serviceMapping, operationMapping };
}

function extractProtoServices(content: string): Array<{
  name: string;
  rpcs: Array<{ operation: string; requestType?: string; responseType?: string }>;
}> {
  const services: Array<{
    name: string;
    rpcs: Array<{ operation: string; requestType?: string; responseType?: string }>;
  }> = [];
  const servicePattern = /\bservice\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\}/g;
  for (const serviceMatch of content.matchAll(servicePattern)) {
    const name = serviceMatch[1];
    const body = serviceMatch[2] ?? "";
    const rpcs: Array<{ operation: string; requestType?: string; responseType?: string }> = [];
    const rpcPattern =
      /\brpc\s+([A-Za-z_]\w*)\s*\(\s*(?:stream\s+)?([A-Za-z_]\w*)\s*\)\s+returns\s*\(\s*(?:stream\s+)?([A-Za-z_]\w*)\s*\)/g;
    for (const rpcMatch of body.matchAll(rpcPattern)) {
      rpcs.push({
        operation: rpcMatch[1],
        requestType: rpcMatch[2],
        responseType: rpcMatch[3],
      });
    }
    services.push({ name, rpcs });
  }
  return services;
}

function extractProtoMessageNames(content: string): string[] {
  return uniqueSorted([...content.matchAll(/\bmessage\s+([A-Za-z_]\w*)\s*\{/g)].map((match) => match[1]));
}

function inferServiceContext(
  serviceName: string,
  schemaPath: string,
  content: string,
  taxonomyPacks: DomainTaxonomyPack[],
): ProtoServiceContextInference {
  const serviceWords = splitPascalCase(serviceName.replace(/Service$/i, "")).join(" ");
  const pathWords = normalizeEvidencePath(schemaPath).replace(/[^a-zA-Z0-9]+/g, " ");
  const haystack = `${serviceWords} ${pathWords}`;
  const taxonomyMapping = matchDomainTaxonomyServiceMapping(haystack, taxonomyPacks);

  if (taxonomyMapping) {
    return {
      boundedContext: taxonomyMapping.boundedContext,
      contextLabels: taxonomyMapping.contextLabels.length > 0 ? taxonomyMapping.contextLabels : [taxonomyMapping.boundedContext],
      aggregateRoots: taxonomyMapping.aggregateRoots,
    };
  }

  const taxonomyBoost = scoreDomainTaxonomyEvidence(`${haystack}\n${content}`, taxonomyPacks);
  const fallback = normalizeBoundaryLabel(serviceWords || serviceName.replace(/Service$/i, ""));
  const contextLabels = taxonomyBoost.labels.length > 0 ? taxonomyBoost.labels : [fallback || "protocol"];
  return {
    boundedContext: contextLabels[0] ?? fallback ?? "protocol",
    contextLabels,
    aggregateRoots: fallback ? [toPascalCase(fallback)] : [],
  };
}

function mapMessageTypeToAggregateRoots(
  messageType: string | undefined,
  knownAggregateNames: Set<string>,
  declaredMessages: string[],
): string[] {
  if (!messageType) {
    return [];
  }

  const stripped = messageType.replace(/(?:Request|Response|Result)$/i, "");
  if (
    stripped &&
    stripped !== messageType &&
    !GENERIC_RPC_BASE_NAMES.has(stripped) &&
    (knownAggregateNames.has(stripped) || declaredMessages.includes(stripped) || looksLikeAggregateName(stripped))
  ) {
    return [stripped];
  }

  if (isProtoEnvelopeName(messageType)) {
    return [];
  }

  if (knownAggregateNames.has(messageType) || declaredMessages.includes(messageType)) {
    return [messageType];
  }

  if (looksLikeAggregateName(messageType)) {
    return [messageType];
  }

  return [];
}

function messageBelongsToContext(messageName: string, inference: ProtoServiceContextInference): boolean {
  if (isProtoEnvelopeName(messageName)) {
    return false;
  }

  if (inference.aggregateRoots.includes(messageName)) {
    return true;
  }

  const normalizedMessage = normalizeBoundaryLabel(messageName);
  return inference.contextLabels.some((contextLabel) => {
    const normalizedContext = normalizeBoundaryLabel(contextLabel);
    return normalizedMessage.includes(normalizedContext) || normalizedContext.split("-").some((part) => normalizedMessage.includes(part));
  });
}

function looksLikeAggregateName(value: string): boolean {
  if (isProtoEnvelopeName(value)) {
    return false;
  }

  const words = splitPascalCase(value);
  return words.length >= 2 || /^[A-Z][a-z0-9]{3,}$/u.test(value);
}

function isProtoEnvelopeName(value: string): boolean {
  return /(?:Request|Response|Result|Reply|Error)$/u.test(value);
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

function splitPascalCase(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/g)
    .filter(Boolean);
}

function toPascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right));
}
