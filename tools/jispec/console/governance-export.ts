import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { collectConsoleLocalSnapshot, type ConsoleGovernanceObjectSnapshot } from "./read-model-snapshot";
import { redactJsonForSharing } from "../privacy/redaction";

export interface ConsoleGovernanceExportOptions {
  root: string;
  outPath?: string;
  repoId?: string;
  repoName?: string;
  exportedAt?: string;
}

export interface MultiRepoGovernanceSnapshot {
  schemaVersion: 1;
  kind: "jispec-multi-repo-governance-snapshot";
  exportedAt: string;
  repo: {
    id: string;
    name: string;
    root: string;
  };
  boundary: {
    localOnly: true;
    readOnlySnapshot: true;
    sourceUploadRequired: false;
    scansSourceCode: false;
    runsVerify: false;
    replacesCliGate: false;
    markdownIsMachineApi: false;
  };
  sourceSnapshot: {
    createdAt: string;
    artifactSummary: Record<string, unknown>;
    governanceSummary: Record<string, unknown>;
    hash: string;
  };
  contract?: {
    snapshotContractVersion: 1;
    compatibleAggregateVersion: 1;
    missingSemantics: {
      unavailableValue: "not_available_yet";
      missingSnapshotReason: "snapshot_not_found";
    };
  };
  aggregateHints: {
    verifyVerdict: unknown;
    policyProfile: unknown;
    policyOwner: unknown;
    activeWaivers: unknown;
    expiringSoonWaivers: unknown;
    expiredWaivers: unknown;
    unmatchedActiveWaivers: unknown;
    openSpecDebt: unknown;
    bootstrapSpecDebt: unknown;
    releaseDriftStatus: unknown;
    releaseDriftTrendComparisons: unknown;
    approvalWorkflowStatus: unknown;
    latestAuditActor: unknown;
    contractRefs?: unknown;
  };
  privacy?: {
    redactionApplied: true;
    findingCount: number;
    findingTypes: string[];
    reportPath: string;
  };
  governanceObjects: Array<Pick<
    ConsoleGovernanceObjectSnapshot,
    "id" | "label" | "status" | "sourceArtifactIds" | "sourcePaths" | "missingSourceArtifactIds" | "summary"
  >>;
}

export interface ConsoleGovernanceExportResult {
  root: string;
  snapshotPath: string;
  summaryPath: string;
  snapshot: MultiRepoGovernanceSnapshot;
}

const DEFAULT_EXPORT_PATH = ".spec/console/governance-snapshot.json";

export function exportConsoleGovernanceSnapshot(options: ConsoleGovernanceExportOptions): ConsoleGovernanceExportResult {
  const root = path.resolve(options.root);
  const outPath = resolveExportPath(root, options.outPath);
  const summaryPath = outPath.replace(/\.json$/i, ".md");
  const localSnapshot = collectConsoleLocalSnapshot(root, {
    excludeArtifactIds: ["multi-repo-governance-snapshot", "multi-repo-governance-summary"],
  });
  const governanceObjects = localSnapshot.governance.objects.map((object) => ({
    id: object.id,
    label: object.label,
    status: object.status,
    sourceArtifactIds: object.sourceArtifactIds,
    sourcePaths: object.sourcePaths,
    missingSourceArtifactIds: object.missingSourceArtifactIds,
    summary: object.summary,
  }));
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const snapshot: Omit<MultiRepoGovernanceSnapshot, "privacy"> = {
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-snapshot",
    exportedAt,
    repo: {
      id: options.repoId ?? defaultRepoId(root),
      name: options.repoName ?? path.basename(root),
      root: normalizePath(root),
    },
    boundary: {
      localOnly: true,
      readOnlySnapshot: true,
      sourceUploadRequired: false,
      scansSourceCode: false,
      runsVerify: false,
      replacesCliGate: false,
      markdownIsMachineApi: false,
    },
    sourceSnapshot: {
      createdAt: localSnapshot.createdAt,
      artifactSummary: localSnapshot.summary,
      governanceSummary: localSnapshot.governance.summary,
      hash: hashValue({
        artifactSummary: localSnapshot.summary,
        governanceSummary: localSnapshot.governance.summary,
        governanceObjects,
      }),
    },
    contract: {
      snapshotContractVersion: 1,
      compatibleAggregateVersion: 1,
      missingSemantics: {
        unavailableValue: "not_available_yet",
        missingSnapshotReason: "snapshot_not_found",
      },
    },
    aggregateHints: buildAggregateHints(governanceObjects),
    governanceObjects,
  };
  const redacted = redactJsonForSharing(snapshot);
  const exportedSnapshot: MultiRepoGovernanceSnapshot = {
    ...redacted.value,
    privacy: {
      redactionApplied: true,
      findingCount: redacted.findings.length,
      findingTypes: Array.from(new Set(redacted.findings.map((finding) => finding.type))).sort((left, right) => left.localeCompare(right)),
      reportPath: ".spec/privacy/privacy-report.json",
    },
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(exportedSnapshot, null, 2)}\n`, "utf-8");
  fs.writeFileSync(summaryPath, renderConsoleGovernanceExportText(exportedSnapshot), "utf-8");

  return {
    root: normalizePath(root),
    snapshotPath: normalizePath(outPath),
    summaryPath: normalizePath(summaryPath),
    snapshot: exportedSnapshot,
  };
}

export function renderConsoleGovernanceExportText(snapshot: MultiRepoGovernanceSnapshot): string {
  const lines = [
    "# JiSpec Multi-Repo Governance Snapshot",
    "",
    `Repo: ${snapshot.repo.name} (${snapshot.repo.id})`,
    `Exported at: ${snapshot.exportedAt}`,
    `Governance objects: ${snapshot.sourceSnapshot.governanceSummary.totalObjects ?? "unknown"}`,
    `Available objects: ${snapshot.sourceSnapshot.governanceSummary.availableObjects ?? "unknown"}`,
    `Partial objects: ${snapshot.sourceSnapshot.governanceSummary.partialObjects ?? "unknown"}`,
    `Missing objects: ${snapshot.sourceSnapshot.governanceSummary.missingObjects ?? "unknown"}`,
    `Snapshot contract: ${snapshot.contract?.snapshotContractVersion ?? "legacy"}`,
    "",
    "## Aggregate Hints",
    "",
    `- Verify verdict: ${String(snapshot.aggregateHints.verifyVerdict ?? "not_available_yet")}`,
    `- Policy profile: ${String(snapshot.aggregateHints.policyProfile ?? "not_available_yet")}`,
    `- Active waivers: ${String(snapshot.aggregateHints.activeWaivers ?? "not_available_yet")}`,
    `- Expiring soon waivers: ${formatList(snapshot.aggregateHints.expiringSoonWaivers)}`,
    `- Open spec debt: ${String(snapshot.aggregateHints.openSpecDebt ?? "not_available_yet")}`,
    `- Release drift: ${String(snapshot.aggregateHints.releaseDriftStatus ?? "not_available_yet")}`,
    `- Privacy redactions: ${snapshot.privacy?.findingCount ?? 0}`,
    "",
    "## Boundary",
    "",
    "- Local read-only export over declared JiSpec artifacts.",
    "- Does not upload source, scan source, run verify, replace CI, or parse Markdown as machine data.",
    "",
  ];

  return lines.join("\n");
}

export function renderConsoleGovernanceExportJSON(result: ConsoleGovernanceExportResult): string {
  return JSON.stringify(result, null, 2);
}

function buildAggregateHints(
  governanceObjects: MultiRepoGovernanceSnapshot["governanceObjects"],
): MultiRepoGovernanceSnapshot["aggregateHints"] {
  const policy = governanceObject(governanceObjects, "policy_posture");
  const waivers = governanceObject(governanceObjects, "waiver_lifecycle");
  const debt = governanceObject(governanceObjects, "spec_debt_ledger");
  const drift = governanceObject(governanceObjects, "contract_drift");
  const verify = governanceObject(governanceObjects, "verify_trend");
  const audit = governanceObject(governanceObjects, "audit_events");
  const approval = governanceObject(governanceObjects, "approval_workflow");

  return {
    verifyVerdict: verify?.summary.verdict ?? "not_available_yet",
    policyProfile: policy?.summary.teamProfile ?? "not_available_yet",
    policyOwner: policy?.summary.owner ?? "not_available_yet",
    activeWaivers: waivers?.summary.active ?? "not_available_yet",
    expiringSoonWaivers: waivers?.summary.expiringSoonIds ?? [],
    expiredWaivers: waivers?.summary.expiredIds ?? [],
    unmatchedActiveWaivers: waivers?.summary.unmatchedActiveIds ?? [],
    openSpecDebt: debt?.summary.greenfieldLedgerItems ?? "not_available_yet",
    bootstrapSpecDebt: debt?.summary.bootstrapDebtRecords ?? "not_available_yet",
    releaseDriftStatus: extractNestedValue(drift?.summary.driftSummary, ["overallStatus"]) ?? "not_available_yet",
    releaseDriftTrendComparisons: drift?.summary.trendCompareCount ?? "not_available_yet",
    approvalWorkflowStatus: approval?.summary.status ?? "not_available_yet",
    latestAuditActor: audit?.summary.latestActor ?? "not_available_yet",
  };
}

function governanceObject(
  governanceObjects: MultiRepoGovernanceSnapshot["governanceObjects"],
  id: string,
): MultiRepoGovernanceSnapshot["governanceObjects"][number] | undefined {
  return governanceObjects.find((object) => object.id === id);
}

function extractNestedValue(value: unknown, pathSegments: string[]): unknown {
  let current = value;
  for (const segment of pathSegments) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function formatList(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(String).join(", ") : "none";
  }
  return String(value ?? "not_available_yet");
}

function resolveExportPath(root: string, outPath?: string): string {
  if (!outPath) {
    return path.join(root, DEFAULT_EXPORT_PATH);
  }
  return path.isAbsolute(outPath) ? outPath : path.join(root, outPath);
}

function defaultRepoId(root: string): string {
  return path.basename(root).trim() || "repo";
}

function hashValue(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(sortObject(value))).digest("hex");
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortObject(entry)]),
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
