import fs from "node:fs";
import path from "node:path";
import {
  getEvidenceConfidenceScore,
  normalizeEvidencePath,
  type EvidenceGraph,
  type EvidenceManifest,
  type EvidenceSchema,
  type EvidenceTest,
} from "./evidence-graph";

export type ContractSourceAdapterId =
  | "openapi"
  | "protobuf"
  | "graphql"
  | "db_migration"
  | "test_framework"
  | "monorepo_manifest";

export type ContractSourceEvidenceStrength =
  | "contract_truth_source"
  | "implementation_trace"
  | "supporting"
  | "owner_review"
  | "spec_debt_candidate";

export type ContractSourceAdoptionDisposition =
  | "candidate_contract"
  | "supporting_only"
  | "owner_review"
  | "spec_debt_candidate";

export interface ContractSourceAdapterEvidence {
  adapter_id: ContractSourceAdapterId;
  source_kind: string;
  path: string;
  confidence_score: number;
  strength: ContractSourceEvidenceStrength;
  adoption_disposition: ContractSourceAdoptionDisposition;
  deterministic: true;
  llm_blocking_gate: false;
  enters: {
    adoption_ranking: boolean;
    contract_graph: boolean;
    verify_facts: boolean;
  };
  metadata?: Record<string, unknown>;
}

export interface ContractSourceAdapterSummary {
  evidence_count: number;
  candidate_contract_count: number;
  owner_review_count: number;
  spec_debt_candidate_count: number;
  supporting_only_count: number;
}

export interface ContractSourceAdapterReport {
  version: 1;
  report_kind: "deterministic-contract-source-adapters";
  repo_root: string;
  generated_at: string;
  adapters: Array<{
    id: ContractSourceAdapterId;
    deterministic: true;
    llm_blocking_gate: false;
    evidence_count: number;
  }>;
  summary: ContractSourceAdapterSummary;
  evidence: ContractSourceAdapterEvidence[];
}

const ADAPTER_IDS: ContractSourceAdapterId[] = [
  "openapi",
  "protobuf",
  "graphql",
  "db_migration",
  "test_framework",
  "monorepo_manifest",
];

const MONOREPO_MANIFEST_KINDS = new Set<EvidenceManifest["kind"]>([
  "pnpm-workspace",
  "nx",
  "turbo",
  "lerna",
  "rush",
]);

export function buildContractSourceAdapterReport(graph: EvidenceGraph): ContractSourceAdapterReport {
  const evidence = [
    ...collectSchemaAdapterEvidence(graph),
    ...collectMigrationAdapterEvidence(graph),
    ...collectTestAdapterEvidence(graph),
    ...collectMonorepoManifestEvidence(graph),
  ].sort((left, right) =>
    `${left.adapter_id}|${left.path}|${left.source_kind}`.localeCompare(`${right.adapter_id}|${right.path}|${right.source_kind}`),
  );

  return {
    version: 1,
    report_kind: "deterministic-contract-source-adapters",
    repo_root: normalizeEvidencePath(graph.repoRoot),
    generated_at: graph.generatedAt,
    adapters: ADAPTER_IDS.map((id) => ({
      id,
      deterministic: true,
      llm_blocking_gate: false,
      evidence_count: evidence.filter((entry) => entry.adapter_id === id).length,
    })),
    summary: summarizeAdapterEvidence(evidence),
    evidence,
  };
}

export function renderContractSourceAdapterLines(report: ContractSourceAdapterReport, limit = 8): string[] {
  return report.evidence.slice(0, limit).map((entry) =>
    `${entry.adapter_id} ${entry.path} (${Math.round(entry.confidence_score * 100)}%): ${entry.adoption_disposition}`,
  );
}

function collectSchemaAdapterEvidence(graph: EvidenceGraph): ContractSourceAdapterEvidence[] {
  const entries: ContractSourceAdapterEvidence[] = [];
  for (const schema of graph.schemas ?? []) {
    const adapterId = adapterIdForSchema(schema);
    if (!adapterId) {
      continue;
    }
    const confidence = getEvidenceConfidenceScore(schema);
    entries.push({
      adapter_id: adapterId,
      source_kind: schema.format,
      path: schema.path,
      confidence_score: confidence,
      strength: confidence >= 0.9 ? "contract_truth_source" : "owner_review",
      adoption_disposition: confidence >= 0.9 ? "candidate_contract" : "owner_review",
      deterministic: true,
      llm_blocking_gate: false,
      enters: {
        adoption_ranking: true,
        contract_graph: true,
        verify_facts: true,
      },
      metadata: {
        signal: schema.signal,
        provenance_note: schema.provenanceNote,
      },
    });
  }
  return entries;
}

function collectMigrationAdapterEvidence(graph: EvidenceGraph): ContractSourceAdapterEvidence[] {
  return (graph.migrations ?? []).map((migration) => ({
    adapter_id: "db_migration" as const,
    source_kind: "migration",
    path: migration.path,
    confidence_score: getEvidenceConfidenceScore(migration),
    strength: "implementation_trace" as const,
    adoption_disposition: "supporting_only" as const,
    deterministic: true as const,
    llm_blocking_gate: false as const,
    enters: {
      adoption_ranking: true,
      contract_graph: true,
      verify_facts: true,
    },
    metadata: {
      signal: migration.signal,
      tool_hint: migration.toolHint,
      provenance_note: migration.provenanceNote,
    },
  }));
}

function collectTestAdapterEvidence(graph: EvidenceGraph): ContractSourceAdapterEvidence[] {
  return (graph.tests ?? []).map((test) => ({
    adapter_id: "test_framework" as const,
    source_kind: test.frameworkHint ?? "unknown",
    path: test.path,
    confidence_score: getEvidenceConfidenceScore(test),
    strength: testStrength(test),
    adoption_disposition: test.frameworkHint === "gherkin" || test.frameworkHint === "jispec" ? "owner_review" as const : "supporting_only" as const,
    deterministic: true as const,
    llm_blocking_gate: false as const,
    enters: {
      adoption_ranking: true,
      contract_graph: true,
      verify_facts: true,
    },
    metadata: {
      signal: test.signal,
      framework_hint: test.frameworkHint,
      provenance_note: test.provenanceNote,
    },
  }));
}

function collectMonorepoManifestEvidence(graph: EvidenceGraph): ContractSourceAdapterEvidence[] {
  const entries: ContractSourceAdapterEvidence[] = [];
  for (const manifest of graph.manifests ?? []) {
    const monorepoSignal = monorepoSignalForManifest(graph.repoRoot, manifest);
    if (!monorepoSignal) {
      continue;
    }
    entries.push({
      adapter_id: "monorepo_manifest",
      source_kind: monorepoSignal.kind,
      path: manifest.path,
      confidence_score: monorepoSignal.confidence,
      strength: "supporting",
      adoption_disposition: "supporting_only",
      deterministic: true,
      llm_blocking_gate: false,
      enters: {
        adoption_ranking: true,
        contract_graph: false,
        verify_facts: true,
      },
      metadata: {
        manifest_kind: manifest.kind,
        signal: monorepoSignal.signal,
        provenance_note: manifest.provenanceNote,
      },
    });
  }
  return entries;
}

function adapterIdForSchema(schema: EvidenceSchema): ContractSourceAdapterId | undefined {
  if (schema.format === "openapi") {
    return "openapi";
  }
  if (schema.format === "protobuf") {
    return "protobuf";
  }
  if (schema.format === "graphql") {
    return "graphql";
  }
  if (schema.format === "database-schema") {
    return "db_migration";
  }
  return undefined;
}

function testStrength(test: EvidenceTest): ContractSourceEvidenceStrength {
  if (test.frameworkHint === "gherkin" || test.frameworkHint === "jispec") {
    return "owner_review";
  }
  return "supporting";
}

function monorepoSignalForManifest(
  repoRoot: string,
  manifest: EvidenceManifest,
): { kind: string; signal: string; confidence: number } | undefined {
  if (MONOREPO_MANIFEST_KINDS.has(manifest.kind)) {
    return { kind: manifest.kind, signal: "workspace_manifest", confidence: getEvidenceConfidenceScore(manifest) };
  }
  if (manifest.kind !== "package-json") {
    return undefined;
  }

  const resolved = path.join(repoRoot, manifest.path);
  try {
    const parsed = JSON.parse(fs.readFileSync(resolved, "utf-8")) as { workspaces?: unknown };
    if (Array.isArray(parsed.workspaces)) {
      return { kind: "package-json-workspaces", signal: "package_workspaces", confidence: 0.94 };
    }
    if (isRecord(parsed.workspaces) && Array.isArray(parsed.workspaces.packages)) {
      return { kind: "package-json-workspaces", signal: "package_workspaces", confidence: 0.94 };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function summarizeAdapterEvidence(evidence: ContractSourceAdapterEvidence[]): ContractSourceAdapterSummary {
  return {
    evidence_count: evidence.length,
    candidate_contract_count: evidence.filter((entry) => entry.adoption_disposition === "candidate_contract").length,
    owner_review_count: evidence.filter((entry) => entry.adoption_disposition === "owner_review").length,
    spec_debt_candidate_count: evidence.filter((entry) => entry.adoption_disposition === "spec_debt_candidate").length,
    supporting_only_count: evidence.filter((entry) => entry.adoption_disposition === "supporting_only").length,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
