import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { inspectAuditLedger } from "../audit/event-ledger";
import { evaluatePolicyApprovalWorkflow } from "../policy/approval";
import { isBootstrapSpecDebtPending } from "../bootstrap/spec-debt";
import {
  CONSOLE_READ_MODEL_ARTIFACTS,
  CONSOLE_GOVERNANCE_OBJECTS,
  getConsoleReadModelContract,
  type ConsoleReadModelArtifact,
  type ConsoleReadModelFormat,
  type ConsoleReadModelFreshness,
  type ConsoleReadModelStability,
  type ConsoleGovernanceObjectContract,
  type ConsoleGovernanceObjectId,
} from "./read-model-contract";
import { summarizeDecisionCompanion, type DecisionCompanionSummary } from "../companion/decision-sections";

export type ConsoleSnapshotArtifactStatus = "available" | "not_available_yet" | "unreadable" | "invalid";
export type ConsoleGovernanceObjectStatus = "available" | "partial" | "not_available_yet" | "invalid";

interface ExternalToolHandoffSummary {
  required?: boolean;
  request?: string;
  allowedPaths?: unknown[];
  filesNeedingAttention?: unknown[];
}

export interface ConsoleSnapshotArtifactInstance {
  relativePath: string;
  status: Exclude<ConsoleSnapshotArtifactStatus, "not_available_yet">;
  sizeBytes?: number;
  modifiedAt?: string;
  contentHash?: string;
  data?: unknown;
  displayOnlyText?: string;
  companion?: DecisionCompanionSummary;
  error?: string;
}

export interface ConsoleSnapshotArtifact {
  id: string;
  pathPattern: string;
  producer: string;
  format: ConsoleReadModelFormat;
  stability: ConsoleReadModelStability;
  freshness: ConsoleReadModelFreshness;
  machineReadable: boolean;
  parseMarkdown: boolean;
  sourceUploadRequired: boolean;
  status: ConsoleSnapshotArtifactStatus;
  instances: ConsoleSnapshotArtifactInstance[];
  message?: string;
}

export interface ConsoleLocalSnapshot {
  version: 1;
  root: string;
  createdAt: string;
  boundary: {
    readOnly: true;
    replacesCliGate: false;
    sourceUploadRequired: false;
    localArtifactsAreSourceOfTruth: true;
    readsOnlyDeclaredJiSpecArtifacts: true;
    evaluatesPolicy: false;
    overridesVerify: false;
    synthesizesGateResults: false;
    markdownIsMachineApi: false;
  };
  artifacts: ConsoleSnapshotArtifact[];
  governance: {
    objects: ConsoleGovernanceObjectSnapshot[];
    summary: {
      totalObjects: number;
      availableObjects: number;
      partialObjects: number;
      missingObjects: number;
      invalidObjects: number;
    };
    orgOperations: ConsoleOrgOperationsSummary;
  };
  summary: {
    totalArtifacts: number;
    availableArtifacts: number;
    missingArtifacts: number;
    invalidArtifacts: number;
    unreadableArtifacts: number;
  };
}

export interface ConsoleGovernanceObjectSnapshot {
  id: ConsoleGovernanceObjectId;
  label: string;
  status: ConsoleGovernanceObjectStatus;
  sourceArtifactIds: string[];
  sourcePaths: string[];
  missingSourceArtifactIds: string[];
  automationInputs: ConsoleGovernanceObjectContract["automationInputs"];
  markdownDisplayOnly: true;
  summary: Record<string, unknown>;
  message?: string;
}

export interface ConsoleLocalSnapshotOptions {
  excludeArtifactIds?: string[];
}

export function collectConsoleLocalSnapshot(rootInput: string, options: ConsoleLocalSnapshotOptions = {}): ConsoleLocalSnapshot {
  const root = path.resolve(rootInput);
  const excludedIds = new Set(options.excludeArtifactIds ?? []);
  const artifacts = CONSOLE_READ_MODEL_ARTIFACTS
    .filter((artifact) => !excludedIds.has(artifact.id))
    .map((artifact) => readSnapshotArtifact(root, artifact));
  const governanceObjects = buildGovernanceObjects(root, artifacts);
  const governanceSummary = summarizeGovernanceObjects(governanceObjects);
  const summary = artifacts.reduce(
    (acc, artifact) => {
      acc.totalArtifacts++;
      if (artifact.status === "available") {
        acc.availableArtifacts++;
      } else if (artifact.status === "not_available_yet") {
        acc.missingArtifacts++;
      } else if (artifact.status === "invalid") {
        acc.invalidArtifacts++;
      } else if (artifact.status === "unreadable") {
        acc.unreadableArtifacts++;
      }
      return acc;
    },
    {
      totalArtifacts: 0,
      availableArtifacts: 0,
      missingArtifacts: 0,
      invalidArtifacts: 0,
      unreadableArtifacts: 0,
    },
  );

  return {
    version: 1,
    root,
    createdAt: new Date().toISOString(),
    boundary: {
      ...getConsoleReadModelContract().boundary,
      readsOnlyDeclaredJiSpecArtifacts: true,
      evaluatesPolicy: false,
      overridesVerify: false,
      synthesizesGateResults: false,
      markdownIsMachineApi: false,
    },
    artifacts,
    governance: {
      objects: governanceObjects,
      summary: governanceSummary,
      orgOperations: summarizeOrgOperations(governanceObjects),
    },
    summary,
  };
}

function readSnapshotArtifact(root: string, artifact: ConsoleReadModelArtifact): ConsoleSnapshotArtifact {
  const relativePaths = resolveArtifactRelativePaths(root, artifact.pathPattern);
  const base = {
    id: artifact.id,
    pathPattern: artifact.pathPattern,
    producer: artifact.producer,
    format: artifact.format,
    stability: artifact.stability,
    freshness: artifact.freshness,
    machineReadable: artifact.machineReadable,
    parseMarkdown: artifact.parseMarkdown,
    sourceUploadRequired: artifact.sourceUploadRequired,
  };

  if (relativePaths.length === 0) {
    return {
      ...base,
      status: "not_available_yet",
      instances: [],
      message: "Artifact not available yet. Run the producing JiSpec command to refresh it.",
    };
  }

  const instances = relativePaths.map((relativePath) => readArtifactInstance(root, relativePath, artifact));
  const status = summarizeInstanceStatuses(instances);

  return {
    ...base,
    status,
    instances,
  };
}

function resolveArtifactRelativePaths(root: string, pathPattern: string): string[] {
  if (!pathPattern.includes("*") && !pathPattern.includes("<")) {
    return fs.existsSync(path.join(root, pathPattern)) ? [pathPattern] : [];
  }

  if (pathPattern === ".spec/waivers/*.json") {
    return listDirectFiles(root, ".spec/waivers", ".json");
  }

  if (pathPattern === ".spec/approvals/*.json") {
    return listDirectFiles(root, ".spec/approvals", ".json");
  }

  if (pathPattern === ".spec/spec-debt/<session-id>/*.json") {
    return listNestedFiles(root, ".spec/spec-debt", ".json", 2)
      .filter((relativePath) => relativePath !== ".spec/spec-debt/ledger.yaml");
  }

  if (pathPattern === ".spec/ambiguity-debt/ledger.json") {
    return fs.existsSync(path.join(root, ".spec", "ambiguity-debt", "ledger.json"))
      ? [".spec/ambiguity-debt/ledger.json"]
      : [];
  }

  if (pathPattern === ".spec/deltas/<change-id>/source-evolution.json") {
    return listNestedFiles(root, ".spec/deltas", ".json", 2)
      .filter((relativePath) => relativePath.endsWith("/source-evolution.json"));
  }

  if (pathPattern === ".spec/deltas/<change-id>/source-review.yaml") {
    return listNestedFiles(root, ".spec/deltas", ".yaml", 2)
      .filter((relativePath) => relativePath.endsWith("/source-review.yaml"));
  }

  if (pathPattern === ".spec/baselines/releases/<version>.yaml") {
    return listDirectFiles(root, ".spec/baselines/releases", ".yaml");
  }

  if (pathPattern === ".spec/releases/compare/<from>-to-<to>/compare-report.json") {
    return listCompareReports(root, "compare-report.json");
  }

  if (pathPattern === ".spec/releases/compare/<from>-to-<to>/compare-report.md") {
    return listCompareReports(root, "compare-report.md");
  }

  if (pathPattern === ".spec/console/governance-snapshot.json") {
    return fs.existsSync(path.join(root, ".spec", "console", "governance-snapshot.json"))
      ? [".spec/console/governance-snapshot.json"]
      : [];
  }

  if (pathPattern === ".spec/console/governance-snapshot.md") {
    return fs.existsSync(path.join(root, ".spec", "console", "governance-snapshot.md"))
      ? [".spec/console/governance-snapshot.md"]
      : [];
  }

  if (pathPattern === ".spec/north-star/acceptance.json") {
    return fs.existsSync(path.join(root, ".spec", "north-star", "acceptance.json"))
      ? [".spec/north-star/acceptance.json"]
      : [];
  }

  if (pathPattern === ".spec/north-star/acceptance.md") {
    return fs.existsSync(path.join(root, ".spec", "north-star", "acceptance.md"))
      ? [".spec/north-star/acceptance.md"]
      : [];
  }

  if (pathPattern === ".spec/north-star/scenarios/*.json") {
    return listDirectFiles(root, ".spec/north-star/scenarios", ".json")
      .filter((relativePath) => !relativePath.endsWith("-decision.md"));
  }

  if (pathPattern === ".spec/north-star/scenarios/*-decision.md") {
    return listDirectFiles(root, ".spec/north-star/scenarios", ".md")
      .filter((relativePath) => relativePath.endsWith("-decision.md"));
  }

  if (pathPattern === ".spec/doctor/global-readiness.json") {
    return fs.existsSync(path.join(root, ".spec", "doctor", "global-readiness.json"))
      ? [".spec/doctor/global-readiness.json"]
      : [];
  }

  if (pathPattern === ".spec/operations/org-responsibility-graph.json") {
    return fs.existsSync(path.join(root, ".spec", "operations", "org-responsibility-graph.json"))
      ? [".spec/operations/org-responsibility-graph.json"]
      : [];
  }

  if (pathPattern === ".spec/operations/org-responsibility-graph.md") {
    return fs.existsSync(path.join(root, ".spec", "operations", "org-responsibility-graph.md"))
      ? [".spec/operations/org-responsibility-graph.md"]
      : [];
  }

  if (pathPattern === ".spec/operations/async-review-inbox.json") {
    return fs.existsSync(path.join(root, ".spec", "operations", "async-review-inbox.json"))
      ? [".spec/operations/async-review-inbox.json"]
      : [];
  }

  if (pathPattern === ".spec/operations/async-review-inbox.md") {
    return fs.existsSync(path.join(root, ".spec", "operations", "async-review-inbox.md"))
      ? [".spec/operations/async-review-inbox.md"]
      : [];
  }

  if (pathPattern === ".spec/operations/ops-aging-ledger.json") {
    return fs.existsSync(path.join(root, ".spec", "operations", "ops-aging-ledger.json"))
      ? [".spec/operations/ops-aging-ledger.json"]
      : [];
  }

  if (pathPattern === ".spec/operations/ops-aging-ledger.md") {
    return fs.existsSync(path.join(root, ".spec", "operations", "ops-aging-ledger.md"))
      ? [".spec/operations/ops-aging-ledger.md"]
      : [];
  }

  if (pathPattern === ".spec/operations/release-train-packet.json") {
    return fs.existsSync(path.join(root, ".spec", "operations", "release-train-packet.json"))
      ? [".spec/operations/release-train-packet.json"]
      : [];
  }

  if (pathPattern === ".spec/operations/release-train-packet.md") {
    return fs.existsSync(path.join(root, ".spec", "operations", "release-train-packet.md"))
      ? [".spec/operations/release-train-packet.md"]
      : [];
  }

  if (pathPattern === ".jispec/handoff/*.json") {
    return listDirectFiles(root, ".jispec/handoff", ".json");
  }

  if (pathPattern === ".jispec/change-session.json") {
    return fs.existsSync(path.join(root, ".jispec", "change-session.json"))
      ? [".jispec/change-session.json"]
      : [];
  }

  if (pathPattern === ".jispec/implement/<session-id>/patch-mediation.json") {
    return listNestedFiles(root, ".jispec/implement", ".json", 2)
      .filter((relativePath) => relativePath.endsWith("/patch-mediation.json"));
  }

  if (pathPattern === ".jispec/implement/<session-id>/patch-mediation.md") {
    return listNestedFiles(root, ".jispec/implement", ".md", 2)
      .filter((relativePath) => relativePath.endsWith("/patch-mediation.md"));
  }

  return [];
}

function readArtifactInstance(
  root: string,
  relativePath: string,
  artifact: ConsoleReadModelArtifact,
): ConsoleSnapshotArtifactInstance {
  const absolutePath = path.join(root, relativePath);

  try {
    const stat = fs.statSync(absolutePath);
    const content = fs.readFileSync(absolutePath, "utf-8");
    const base = {
      relativePath,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      contentHash: hashContent(content),
    };

    if (artifact.format === "markdown") {
      return {
        ...base,
        status: "available",
        displayOnlyText: content,
        companion: summarizeDecisionCompanion({ path: relativePath, text: content }),
      };
    }

    return {
      ...base,
      status: "available",
      data: parseMachineReadableArtifact(content, artifact.format),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      relativePath,
      status: isParseError(error) ? "invalid" : "unreadable",
      error: message,
    };
  }
}

function parseMachineReadableArtifact(content: string, format: ConsoleReadModelFormat): unknown {
  if (format === "json") {
    return JSON.parse(content);
  }

  if (format === "jsonl") {
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  if (format === "yaml") {
    return yaml.load(content);
  }

  if (format === "lock") {
    return content;
  }

  return undefined;
}

function summarizeInstanceStatuses(instances: ConsoleSnapshotArtifactInstance[]): ConsoleSnapshotArtifactStatus {
  if (instances.some((instance) => instance.status === "invalid")) {
    return "invalid";
  }

  if (instances.some((instance) => instance.status === "unreadable")) {
    return "unreadable";
  }

  return "available";
}

function buildGovernanceObjects(root: string, artifacts: ConsoleSnapshotArtifact[]): ConsoleGovernanceObjectSnapshot[] {
  return CONSOLE_GOVERNANCE_OBJECTS.map((object) => {
    const sourceArtifacts = object.sourceArtifactIds
      .map((id) => artifacts.find((artifact) => artifact.id === id))
      .filter((artifact): artifact is ConsoleSnapshotArtifact => Boolean(artifact));
    const sourcePaths = sourceArtifacts.flatMap((artifact) => artifact.instances.map((instance) => instance.relativePath));
    const missingSourceArtifactIds = sourceArtifacts
      .filter((artifact) => artifact.status === "not_available_yet")
      .map((artifact) => artifact.id);
    const summary = buildGovernanceSummary(root, object.id, sourceArtifacts);
    const status = overrideGovernanceStatus(object.id, summarizeGovernanceStatus(sourceArtifacts), summary);

    return {
      id: object.id,
      label: object.label,
      status,
      sourceArtifactIds: [...object.sourceArtifactIds],
      sourcePaths,
      missingSourceArtifactIds,
      automationInputs: object.automationInputs,
      markdownDisplayOnly: true,
      summary,
      message: status === "not_available_yet"
        ? "Governance object not available yet. Run the producing JiSpec command to create its source artifact."
        : undefined,
    };
  });
}

function summarizeGovernanceStatus(sourceArtifacts: ConsoleSnapshotArtifact[]): ConsoleGovernanceObjectStatus {
  if (sourceArtifacts.length === 0 || sourceArtifacts.every((artifact) => artifact.status === "not_available_yet")) {
    return "not_available_yet";
  }

  if (sourceArtifacts.some((artifact) => artifact.status === "invalid" || artifact.status === "unreadable")) {
    return "invalid";
  }

  if (sourceArtifacts.some((artifact) => artifact.status === "not_available_yet")) {
    return "partial";
  }

  return "available";
}

function summarizeGovernanceObjects(objects: ConsoleGovernanceObjectSnapshot[]): ConsoleLocalSnapshot["governance"]["summary"] {
  return objects.reduce(
    (acc, object) => {
      acc.totalObjects++;
      if (object.status === "available") {
        acc.availableObjects++;
      } else if (object.status === "partial") {
        acc.partialObjects++;
      } else if (object.status === "not_available_yet") {
        acc.missingObjects++;
      } else if (object.status === "invalid") {
        acc.invalidObjects++;
      }
      return acc;
    },
    {
      totalObjects: 0,
      availableObjects: 0,
      partialObjects: 0,
      missingObjects: 0,
      invalidObjects: 0,
    },
  );
}

function overrideGovernanceStatus(
  id: ConsoleGovernanceObjectId,
  status: ConsoleGovernanceObjectStatus,
  summary: Record<string, unknown>,
): ConsoleGovernanceObjectStatus {
  if (id === "source_evolution_governance" && summary.state === "available") {
    return "available";
  }
  return status;
}

function buildGovernanceSummary(
  root: string,
  id: ConsoleGovernanceObjectId,
  sourceArtifacts: ConsoleSnapshotArtifact[],
): Record<string, unknown> {
  if (sourceArtifacts.every((artifact) => artifact.status === "not_available_yet")) {
    return { state: "not_available_yet" };
  }

  if (id === "audit_events") {
    return summarizeAuditEvents(root, sourceArtifacts);
  }

  if (sourceArtifacts.some((artifact) => artifact.status === "invalid" || artifact.status === "unreadable")) {
    return { state: "invalid" };
  }

  if (id === "policy_posture") {
    return summarizePolicyPosture(sourceArtifacts);
  }
  if (id === "waiver_lifecycle") {
    return summarizeWaiverLifecycle(sourceArtifacts);
  }
  if (id === "spec_debt_ledger") {
    return summarizeSpecDebt(sourceArtifacts);
  }
  if (id === "ambiguity_debt_register") {
    return summarizeAmbiguityDebtRegister(sourceArtifacts);
  }
  if (id === "source_evolution_governance") {
    return summarizeSourceEvolutionGovernance(sourceArtifacts);
  }
  if (id === "contract_drift") {
    return summarizeContractDrift(sourceArtifacts);
  }
  if (id === "release_baseline") {
    return summarizeReleaseBaseline(sourceArtifacts);
  }
  if (id === "verify_trend") {
    return summarizeVerifyTrend(sourceArtifacts);
  }
  if (id === "takeover_quality_trend") {
    return summarizeTakeoverQuality(sourceArtifacts);
  }
  if (id === "implementation_mediation_outcomes") {
    return summarizeImplementationMediation(sourceArtifacts);
  }
  if (id === "implementation_workspace") {
    return summarizeImplementationWorkspace(sourceArtifacts);
  }
  if (id === "mainline_recovery_drill") {
    return summarizeMainlineRecoveryDrill(sourceArtifacts);
  }
  if (id === "multi_repo_export") {
    return summarizeMultiRepoExport(sourceArtifacts);
  }
  if (id === "global_operations_packet") {
    return summarizeGlobalOperationsPacket(sourceArtifacts);
  }
  if (id === "org_responsibility_graph") {
    return summarizeOrgResponsibilityGraph(sourceArtifacts);
  }
  if (id === "async_review_inbox") {
    return summarizeAsyncReviewInbox(sourceArtifacts);
  }
  if (id === "ops_aging_ledger") {
    return summarizeOpsAgingLedger(sourceArtifacts);
  }
  if (id === "release_train_packet") {
    return summarizeReleaseTrainPacket(sourceArtifacts);
  }
  if (id === "north_star_acceptance") {
    return summarizeNorthStarAcceptance(sourceArtifacts);
  }
  if (id === "doctor_global_readiness") {
    return summarizeDoctorGlobalReadiness(sourceArtifacts);
  }
  if (id === "approval_workflow") {
    return summarizeApprovalWorkflow(root);
  }

  return { state: "available" };
}

function summarizePolicyPosture(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const policy = getFirstData(sourceArtifacts, "verify-policy");
  if (!isRecord(policy)) {
    return { state: "not_available_yet" };
  }

  const requires = isRecord(policy.requires) ? policy.requires : {};
  const team = isRecord(policy.team) ? policy.team : {};
  const waivers = isRecord(policy.waivers) ? policy.waivers : {};
  const release = isRecord(policy.release) ? policy.release : {};
  const executeDefault = isRecord(policy.execute_default) ? policy.execute_default : {};
  const reviewers = Array.isArray(team.reviewers) ? team.reviewers : [];
  const rules = Array.isArray(policy.rules) ? policy.rules : [];

  return {
    state: "available",
    factsContract: requires.facts_contract ?? requires.factsContract ?? "not_declared",
    teamProfile: team.profile ?? "not_declared",
    owner: team.owner ?? "not_declared",
    reviewerCount: reviewers.length,
    requiredReviewers: team.required_reviewers ?? "not_declared",
    waiverRequireExpiration: waivers.require_expiration ?? "not_declared",
    waiverMaxActiveDays: waivers.max_active_days ?? "not_declared",
    releaseRequireCompare: release.require_compare ?? "not_declared",
    releaseDriftRequiresOwnerReview: release.drift_requires_owner_review ?? "not_declared",
    releaseBehaviorDriftSeverity: release.behavior_drift_severity ?? "not_declared",
    executeDefaultAllowed: executeDefault.allowed ?? "not_declared",
    executeDefaultRequireCleanVerify: executeDefault.require_clean_verify ?? "not_declared",
    ruleCount: rules.length,
  };
}

function summarizeWaiverLifecycle(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const waivers = getAllData(sourceArtifacts, "verify-waivers").filter(isRecord);
  const report = getFirstData(sourceArtifacts, "ci-verify-report");
  const counts = countByStatus(waivers.map((waiver) => String(waiver.status ?? "active")));
  const modes = isRecord(report) && isRecord(report.modes) ? report.modes : {};
  const activeWaivers = waivers.filter((waiver) => String(waiver.status ?? "active") === "active");

  return {
    state: waivers.length > 0 || isRecord(report) ? "available" : "not_available_yet",
    total: waivers.length,
    active: counts.active ?? 0,
    revoked: counts.revoked ?? 0,
    expired: counts.expired ?? 0,
    invalid: counts.invalid ?? 0,
    matchedInLatestVerify: modes.waiversApplied ?? 0,
    unmatchedActiveIds: Array.isArray(modes.unmatchedActiveWaiverIds) ? modes.unmatchedActiveWaiverIds : [],
    expiringSoonIds: activeWaivers
      .filter((waiver) => expiresWithinDays(stringValue(waiver.expiresAt) ?? stringValue(waiver.expires_at), 14))
      .map((waiver) => stringValue(waiver.id) ?? "unknown"),
    expiredIds: activeWaivers
      .filter((waiver) => isPastDate(stringValue(waiver.expiresAt) ?? stringValue(waiver.expires_at)))
      .map((waiver) => stringValue(waiver.id) ?? "unknown"),
  };
}

function summarizeSpecDebt(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const ledger = getFirstData(sourceArtifacts, "greenfield-spec-debt-ledger");
  const bootstrapRecords = getAllData(sourceArtifacts, "bootstrap-spec-debt-records");
  const ledgerItems = extractArrayFromRecord(ledger, ["items", "entries", "debts", "spec_debt"]);
  const openBootstrapDebtRecords = bootstrapRecords.filter((record) => isBootstrapSpecDebtPending(asBootstrapDebtStatusRecord(record)));

  return {
    state: ledgerItems.length > 0 || bootstrapRecords.length > 0 ? "available" : "not_available_yet",
    greenfieldLedgerItems: ledgerItems.length,
    bootstrapDebtRecords: openBootstrapDebtRecords.length,
    bootstrapDebtRecordsTotal: bootstrapRecords.length,
  };
}

export interface ConsoleOrgOperationsSummary {
  state: "ready" | "attention" | "not_available_yet";
  status: string;
  ready: boolean;
  sourceObjectIds: ConsoleGovernanceObjectId[];
  availableObjectCount: number;
  missingObjectCount: number;
  responsibility: {
    status: string;
    teamCount: number;
    repoCount: number;
    ownerActionAssignmentCount: number;
    reviewerCoverage: number;
    escalationCoverage: number;
  };
  reviews: {
    status: string;
    reviewerCount: number;
    totalItems: number;
    pending: number;
    blocked: number;
    expired: number;
    reviewersMissing: number;
  };
  sla: {
    status: string;
    totalItems: number;
    dueSoon: number;
    overdue: number;
    escalated: number;
    itemsMissingEscalationPath: number;
  };
  releaseTrain: {
    status: string;
    trainReady: boolean;
    repoCount: number;
    blockedRepoCount: number;
    ownerAssignmentCount: number;
    requiredReviewCount: number;
    safeNextCommand: string;
  };
  boundary: {
    readOnly: true;
    sourceUploadRequired: false;
    realtimeCollaborationRequired: false;
    executesCommands: false;
    replacesVerify: false;
    replacesDoctorGlobal: false;
    replacesPostReleaseGate: false;
    localArtifactsOnly: true;
  };
}

function summarizeAmbiguityDebtRegister(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  if (sourceArtifacts.some((artifact) => artifact.status === "invalid" || artifact.status === "unreadable")) {
    return { state: "invalid" };
  }

  const ledger = getFirstData(sourceArtifacts, "ambiguity-debt-ledger");
  if (!isRecord(ledger)) {
    return { state: "not_available_yet" };
  }

  const debts = Array.isArray(ledger.debts) ? ledger.debts.filter(isRecord) : [];
  const counts = countByStatus(debts.map((debt) => String(debt.status ?? "open")));
  const ownerReviewRequestedIds = stableUnique(
    debts.filter((debt) => isRecord(debt.ownerReview)).map((debt) => String(debt.id ?? "unknown")),
  );

  return {
    state: "available",
    total: debts.length,
    open: counts.open ?? 0,
    reclassified: counts.reclassified ?? 0,
    resolved: counts.resolved ?? 0,
    archived: counts.archived ?? 0,
    ownerReviewRequested: ownerReviewRequestedIds.length,
    ownerReviewRequestedIds,
    openIds: stableUnique(
      debts
        .filter((debt) => String(debt.status ?? "open") === "open")
        .map((debt) => String(debt.id ?? "unknown")),
    ),
    candidateChangeIds: stableUnique(
      debts.flatMap((debt) => Array.isArray(debt.candidateChangeIds) ? debt.candidateChangeIds.map(String) : []),
    ),
    sourceCounts: countByStatus(debts.map((debt) => String(debt.source ?? "unknown"))),
  };
}

function summarizeSourceEvolutionGovernance(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const baseline = getFirstData(sourceArtifacts, "greenfield-current-baseline");
  const lifecycle = getFirstData(sourceArtifacts, "greenfield-requirement-lifecycle");
  const sourceEvolutionInstances = getInstances(sourceArtifacts, "greenfield-source-evolution");
  const sourceReviewInstances = getInstances(sourceArtifacts, "greenfield-source-review");
  const baselineSourceEvolution = isRecord(baseline) && isRecord(baseline.source_evolution) ? baseline.source_evolution : undefined;
  const baselineRequirementLifecycle = isRecord(baseline) && isRecord(baseline.requirement_lifecycle)
    ? baseline.requirement_lifecycle
    : undefined;
  const lifecycleRequirements = isRecord(lifecycle) && Array.isArray(lifecycle.requirements)
    ? lifecycle.requirements.filter(isRecord)
    : [];
  const lifecycleDeltaCounts = countByStatus(lifecycleRequirements.map((entry) => String(entry.status ?? "active")));
  const activeSnapshotId = stringValue(extractNestedValue(baselineSourceEvolution, ["active_snapshot_id"]))
    ?? stringValue(extractNestedValue(baselineRequirementLifecycle, ["active_snapshot_id"]))
    ?? stringValue(extractNestedValue(lifecycle, ["active_snapshot_id"]))
    ?? "not_available_yet";
  const lastAdoptedSourceChange = stringValue(extractNestedValue(baselineSourceEvolution, ["last_adopted_change_id"]))
    ?? stringValue(extractNestedValue(baselineRequirementLifecycle, ["last_adopted_change_id"]))
    ?? stringValue(extractNestedValue(lifecycle, ["last_adopted_change_id"]))
    ?? "not_available_yet";
  const lifecyclePath = getInstances(sourceArtifacts, "greenfield-requirement-lifecycle")[0]?.relativePath
    ?? stringValue(extractNestedValue(baselineRequirementLifecycle, ["path"]))
    ?? ".spec/requirements/lifecycle.yaml";

  const pairs = stableUnique([
    ...sourceEvolutionInstances.map((instance) => extractChangeIdFromDeltaPath(instance.relativePath)),
    ...sourceReviewInstances.map((instance) => extractChangeIdFromDeltaPath(instance.relativePath)),
  ].filter((value): value is string => Boolean(value)))
    .map((changeId) => {
      const evolution = sourceEvolutionInstances.find((instance) => extractChangeIdFromDeltaPath(instance.relativePath) === changeId);
      const review = sourceReviewInstances.find((instance) => extractChangeIdFromDeltaPath(instance.relativePath) === changeId);
      return buildSourceEvolutionPair(changeId, evolution, review);
    })
    .filter((pair): pair is SourceEvolutionPair => Boolean(pair));
  const active = selectActiveSourceEvolutionPair(pairs);
  const activeSummary = active?.evolutionSummary;
  const activeReview = active?.reviewSummary;
  const reviewedBlocking = (activeSummary?.blockingTotal ?? 0) - (activeReview?.blockingOpen ?? 0);
  const alreadyAdoptedActiveChange = Boolean(active?.changeId && active.changeId === lastAdoptedSourceChange);
  const canAdoptSource = Boolean(
    active
    && activeSummary
    && activeReview
    && activeSummary.total > 0
    && activeReview.blockingOpen === 0
    && !alreadyAdoptedActiveChange
  );
  const currentChangeState = active
    ? activeReview && activeReview.blockingOpen > 0
      ? "review_blocked"
      : activeReview && activeReview.open > 0
        ? "review_open"
        : alreadyAdoptedActiveChange
          ? "adopted"
        : canAdoptSource
          ? "ready_for_source_adopt"
          : "reviewed"
    : "no_open_source_change";

  if (!isRecord(baseline) && !isRecord(lifecycle) && pairs.length === 0) {
    return { state: "not_available_yet" };
  }

  return {
    state: "available",
    activeChangeId: active?.changeId ?? "not_available_yet",
    currentChangeState,
    sourceEvolutionSummary: activeSummary
      ? {
          changed: activeSummary.changed,
          total: activeSummary.total,
          added: activeSummary.added,
          modified: activeSummary.modified,
          deprecated: activeSummary.deprecated,
          split: activeSummary.split,
          merged: activeSummary.merged,
          reanchored: activeSummary.reanchored,
          blocking: activeSummary.blockingTotal,
          advisory: activeSummary.advisoryTotal,
        }
      : "not_available_yet",
    openReviewItems: activeReview?.open ?? 0,
    blockingOpenReviewItems: activeReview?.blockingOpen ?? 0,
    reviewedBlockingItems: reviewedBlocking > 0 ? reviewedBlocking : 0,
    deferredItems: activeReview?.deferred ?? 0,
    waivedItems: activeReview?.waived ?? 0,
    rejectedItems: activeReview?.rejected ?? 0,
    expiredDeferredItems: activeReview?.expiredDeferred ?? 0,
    expiredWaivedItems: activeReview?.expiredWaived ?? 0,
    openReviewItemsBySeverity: activeReview?.openBySeverity ?? {},
    lifecycleDeltaCounts,
    lifecycleRequirementCount: lifecycleRequirements.length,
    activeSnapshotId,
    lastAdoptedSourceChange,
    lifecyclePath,
    sourceEvolutionPath: active?.evolutionPath ?? "not_available_yet",
    sourceReviewPath: active?.reviewPath ?? "not_available_yet",
    sourceReviewCoverage: activeReview
      ? {
          totalItems: activeReview.total,
          open: activeReview.open,
          adopted: activeReview.adopted,
          deferred: activeReview.deferred,
          waived: activeReview.waived,
          rejected: activeReview.rejected,
        }
      : "not_available_yet",
    activeRepresentativeItem: active?.representativeItem ?? "not_available_yet",
    canAdoptSource,
    pendingChanges: pairs
      .filter((pair) => pair.reviewSummary?.open || pair.reviewSummary?.expiredDeferred || pair.reviewSummary?.expiredWaived)
      .map((pair) => ({
        changeId: pair.changeId,
        openReviewItems: pair.reviewSummary?.open ?? 0,
        blockingOpenReviewItems: pair.reviewSummary?.blockingOpen ?? 0,
        sourceEvolutionPath: pair.evolutionPath,
        sourceReviewPath: pair.reviewPath,
      })),
    decisions: active?.decisions ?? [],
  };
}

function summarizeContractDrift(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const reports = getInstances(sourceArtifacts, "release-compare-report");
  const latest = reports.at(-1);
  const data = latest?.data;
  const trend = getFirstData(sourceArtifacts, "release-drift-trend");
  if (isRecord(trend)) {
    const latestTrend = isRecord(trend.latest) ? trend.latest : undefined;
    return {
      state: "available",
      reportCount: reports.length,
      trendAvailable: true,
      trendCompareCount: trend.compareCount ?? 0,
      trendChangedCompareCount: trend.changedCompareCount ?? 0,
      trendUnchangedCompareCount: trend.unchangedCompareCount ?? 0,
      trendNotTrackedCompareCount: trend.notTrackedCompareCount ?? 0,
      latestReport: latestTrend?.reportPath ?? latest?.relativePath,
      latestComparison: latestTrend
        ? {
            from: latestTrend.from ?? "not_declared",
            to: latestTrend.to ?? "not_declared",
            comparedAt: latestTrend.comparedAt ?? "not_declared",
          }
        : "not_available_yet",
      driftSummary: latestTrend
        ? {
            overallStatus: latestTrend.overallStatus ?? "not_declared",
            contractGraph: { status: latestTrend.contractGraphStatus ?? "not_declared" },
            staticCollector: { status: latestTrend.staticCollectorStatus ?? "not_declared" },
            behavior: { status: latestTrend.behaviorStatus ?? "not_declared" },
            policy: { status: latestTrend.policyStatus ?? "not_declared" },
          }
        : "not_declared",
      surfaceTrend: isRecord(trend.surfaces) ? trend.surfaces : "not_declared",
    };
  }

  return {
    state: latest ? "available" : "not_available_yet",
    reportCount: reports.length,
    trendAvailable: false,
    latestReport: latest?.relativePath,
    driftSummary: isRecord(data) ? data.driftSummary ?? data.drift_summary ?? "not_declared" : "not_declared",
  };
}

function summarizeReleaseBaseline(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const releases = getInstances(sourceArtifacts, "release-baseline");

  return {
    state: releases.length > 0 ? "available" : "not_available_yet",
    baselineCount: releases.length,
    latestBaseline: releases.at(-1)?.relativePath,
  };
}

function summarizeVerifyTrend(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const report = getFirstData(sourceArtifacts, "ci-verify-report");
  const baseline = getFirstData(sourceArtifacts, "verify-baseline");
  const counts = isRecord(report) && isRecord(report.counts) ? report.counts : {};

  return {
    state: isRecord(report) || baseline !== undefined ? "available" : "not_available_yet",
    verdict: isRecord(report) ? report.verdict ?? "not_declared" : "not_available_yet",
    issueCount: isRecord(report) ? report.issueCount ?? report.issue_count ?? counts.total ?? "not_declared" : "not_available_yet",
    blockingIssueCount: isRecord(report) ? report.blockingIssueCount ?? report.blocking_issue_count ?? counts.blocking ?? "not_declared" : "not_available_yet",
    advisoryIssueCount: isRecord(report) ? report.advisoryIssueCount ?? report.advisory_issue_count ?? counts.advisory ?? "not_declared" : "not_available_yet",
    baselinePresent: baseline !== undefined,
  };
}

function summarizeTakeoverQuality(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const single = getFirstData(sourceArtifacts, "retakeover-metrics");
  const pool = getFirstData(sourceArtifacts, "retakeover-pool-metrics");
  const valueReport = getFirstData(sourceArtifacts, "value-report");
  const headline = isRecord(valueReport) && isRecord(valueReport.headline) ? valueReport.headline : {};
  const metrics = isRecord(valueReport) && isRecord(valueReport.metrics) ? valueReport.metrics : {};
  const manualSorting = isRecord(metrics.manualSortingReduction) ? metrics.manualSortingReduction : {};
  const risks = isRecord(metrics.riskSurfacing) ? metrics.riskSurfacing : {};
  const execute = isRecord(metrics.executeMediationStopPoints) ? metrics.executeMediationStopPoints : {};
  const coverage = isRecord(pool) && isRecord(pool.coverage) ? pool.coverage : {};
  const classCoverage = isRecord(coverage.classCoverage) ? coverage.classCoverage : {};
  const qualityBaseline = isRecord(coverage.qualityBaseline) ? coverage.qualityBaseline : {};
  const realismLadder = isRecord(coverage.realismLadder) ? coverage.realismLadder : {};
  const readinessScore = isRecord(qualityBaseline.readinessScore) ? qualityBaseline.readinessScore : {};
  const contractSignalPrecision = isRecord(qualityBaseline.contractSignalPrecision)
    ? qualityBaseline.contractSignalPrecision
    : {};
  const behaviorEvidenceStrength = isRecord(qualityBaseline.behaviorEvidenceStrength)
    ? qualityBaseline.behaviorEvidenceStrength
    : {};
  const fixtureCatalog = Array.isArray(coverage.fixtureCatalog) ? coverage.fixtureCatalog.filter(isRecord) : [];

  return {
    state: single !== undefined || pool !== undefined || valueReport !== undefined ? "available" : "not_available_yet",
    hasSingleMetrics: single !== undefined,
    hasPoolMetrics: pool !== undefined,
    hasValueReport: valueReport !== undefined,
    singleScore: extractNestedValue(single, ["qualityScorecard", "score"]) ?? extractNestedValue(single, ["quality_scorecard", "score"]),
    poolFixtureCount: extractArrayFromRecord(pool, ["fixtures", "fixtureMetrics", "fixture_metrics"]).length,
    poolFixtureCatalogCount: fixtureCatalog.length,
    poolFixtureCatalog: fixtureCatalog.map((entry) => ({
      fixtureId: entry.fixtureId ?? "unknown",
      fixtureClass: entry.fixtureClass ?? "unknown",
      coverageSignals: Array.isArray(entry.coverageSignals) ? entry.coverageSignals : [],
      artifactDecisionPaths: Array.isArray(entry.artifactDecisionPaths) ? entry.artifactDecisionPaths : [],
      topEvidenceSample: Array.isArray(entry.topEvidenceSample) ? entry.topEvidenceSample : [],
    })),
    poolCoverageRate: numberValue(classCoverage.coverageRate) ?? "not_available_yet",
    poolCoveredFixtureClassCount: numberValue(classCoverage.coveredFixtureClassCount) ?? "not_available_yet",
    poolKnownFixtureClassCount: numberValue(classCoverage.knownFixtureClassCount) ?? "not_available_yet",
    poolMissingFixtureClasses: Array.isArray(classCoverage.missingFixtureClasses) ? classCoverage.missingFixtureClasses : [],
    poolReadinessThreshold: numberValue(readinessScore.threshold) ?? "not_available_yet",
    poolReadinessLowestObserved: numberValue(readinessScore.lowestObserved) ?? "not_available_yet",
    poolReadinessFixturesBelowThreshold: Array.isArray(readinessScore.fixturesBelowThreshold)
      ? readinessScore.fixturesBelowThreshold
      : [],
    poolContractPrecisionThreshold: numberValue(contractSignalPrecision.threshold) ?? "not_available_yet",
    poolContractPrecisionLowestObserved: numberValue(contractSignalPrecision.lowestObserved) ?? "not_available_yet",
    poolContractPrecisionFixturesBelowThreshold: Array.isArray(contractSignalPrecision.fixturesBelowThreshold)
      ? contractSignalPrecision.fixturesBelowThreshold
      : [],
    poolBehaviorStrengthThreshold: numberValue(behaviorEvidenceStrength.threshold) ?? "not_available_yet",
    poolBehaviorStrengthLowestObserved: numberValue(behaviorEvidenceStrength.lowestObserved) ?? "not_available_yet",
    poolBehaviorFixturesBelowThreshold: Array.isArray(behaviorEvidenceStrength.fixturesBelowThreshold)
      ? behaviorEvidenceStrength.fixturesBelowThreshold
      : [],
    poolVerifyNonBlockingRate: numberValue(qualityBaseline.verifyNonBlockingRate) ?? "not_available_yet",
    poolOwnerReviewFixtureRate: numberValue(qualityBaseline.ownerReviewFixtureRate) ?? "not_available_yet",
    realismLadderPhase: stringValue(realismLadder.phase) ?? "not_available_yet",
    realismLadderReady: typeof realismLadder.ready === "boolean" ? realismLadder.ready : "not_available_yet",
    realismLadderCoveredClassCount: numberValue(realismLadder.coveredRealismClassCount) ?? "not_available_yet",
    realismLadderTargetClassCount: numberValue(realismLadder.targetRealismClassCount) ?? "not_available_yet",
    realismLadderMissingClasses: Array.isArray(realismLadder.missingRealismClasses)
      ? realismLadder.missingRealismClasses
      : [],
    realismLadderBlockers: Array.isArray(realismLadder.blockers) ? realismLadder.blockers : [],
    estimatedManualSortingMinutesSaved: headline.estimatedManualSortingMinutesSaved ?? manualSorting.estimatedMinutesSaved ?? "not_available_yet",
    blockingIssuesCaught: headline.blockingIssuesCaught ?? risks.blockingIssuesCaught ?? "not_available_yet",
    advisoryRisksSurfaced: headline.advisoryRisksSurfaced ?? risks.advisoryRisksSurfaced ?? "not_available_yet",
    executeStopsNeedingReview: headline.executeStopsNeedingReview ?? "not_available_yet",
    executeStopPoints: isRecord(execute.stopPoints) ? execute.stopPoints : {},
  };
}

function summarizeImplementationMediation(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const handoffInstances = getInstances(sourceArtifacts, "implementation-handoff-packets");
  const patchInstances = getInstances(sourceArtifacts, "implementation-patch-mediation");
  const patchCompanionInstances = getInstances(sourceArtifacts, "implementation-patch-mediation-summary");
  const handoffs = handoffInstances.map((instance) => instance.data).filter(isRecord);
  const patchRecords = patchInstances.map((instance) => instance.data).filter(isRecord);
  const outcomes = countByStatus(handoffs.map((handoff) => String(handoff.outcome ?? "unknown")));
  const latest = handoffs.at(-1);
  const latestInstance = handoffInstances.at(-1);
  const latestPatchCompanion = patchCompanionInstances.at(-1);
  const latestDecision = isRecord(latest?.decisionPacket) ? latest?.decisionPacket : undefined;
  const latestReplay = isRecord(latest?.replay) ? latest?.replay : undefined;
  const latestObservedAt = stringValue(latest?.createdAt) ?? latestInstance?.modifiedAt ?? "not_available_yet";

  return {
    state: handoffs.length > 0 || patchRecords.length > 0 ? "available" : "not_available_yet",
    handoffCount: handoffs.length,
    patchMediationCount: patchRecords.length,
    patchMediationCompanionCount: patchCompanionInstances.length,
    outcomes,
    latestOutcome: latest?.outcome ?? "not_available_yet",
    latestStopPoint: latestDecision?.stopPoint ?? "not_available_yet",
    latestReplayable: latestReplay?.replayable ?? false,
    latestObservedAt,
    latestPatchReviewCompanionPath: latestPatchCompanion?.relativePath ?? "not_available_yet",
    latestPatchReviewCompanionSummary: latestPatchCompanion?.companion?.summary ?? "not_available_yet",
  };
}

function summarizeImplementationWorkspace(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const activeSession = getFirstData(sourceArtifacts, "active-change-session");
  const activeSessionRecord = isRecord(activeSession) ? activeSession : undefined;
  const activeSessionId = stringValue(activeSessionRecord?.id);
  const handoffInstances = getInstances(sourceArtifacts, "implementation-handoff-packets");
  const patchInstances = getInstances(sourceArtifacts, "implementation-patch-mediation");
  const patchCompanionInstances = getInstances(sourceArtifacts, "implementation-patch-mediation-summary");
  const matchingHandoffInstance = activeSessionId
    ? [...handoffInstances].reverse().find((instance) => stringValue(isRecord(instance.data) ? instance.data.sessionId : undefined) === activeSessionId)
    : handoffInstances.at(-1);
  const matchingPatchInstance = activeSessionId
    ? [...patchInstances].reverse().find((instance) => stringValue(isRecord(instance.data) ? instance.data.sessionId : undefined) === activeSessionId)
    : patchInstances.at(-1);
  const matchingPatchCompanionInstance = activeSessionId
    ? [...patchCompanionInstances].reverse().find((instance) => instance.relativePath.endsWith(`/implement/${activeSessionId}/patch-mediation.md`))
    : patchCompanionInstances.at(-1);
  const latestHandoff = isRecord(matchingHandoffInstance?.data) ? matchingHandoffInstance.data : undefined;
  const latestPatch = isRecord(matchingPatchInstance?.data) ? matchingPatchInstance.data : undefined;
  const latestPatchCompanion = matchingPatchCompanionInstance;
  const latestHandoffDecision = isRecord(latestHandoff?.decisionPacket) ? latestHandoff.decisionPacket : undefined;
  const latestExternalToolHandoff = isRecord(latestHandoffDecision?.nextActionDetail)
    ? (latestHandoffDecision.nextActionDetail as { externalToolHandoff?: ExternalToolHandoffSummary }).externalToolHandoff
    : undefined;
  const latestHandoffReplay = isRecord(latestHandoff?.replay) ? latestHandoff.replay : undefined;
  const latestPatchReplay = isRecord(latestPatch?.replay) ? latestPatch.replay : undefined;
  const activeLaneDecision = isRecord(activeSessionRecord?.laneDecision) ? activeSessionRecord.laneDecision : undefined;
  const activeChangedPaths = Array.isArray(activeSessionRecord?.changedPaths)
    ? activeSessionRecord.changedPaths
      .filter(isRecord)
      .map((entry) => stringValue(entry.path) ?? "unknown")
    : [];
  const activeNextCommands = Array.isArray(activeSessionRecord?.nextCommands)
    ? activeSessionRecord.nextCommands
      .filter(isRecord)
      .map((entry) => stringValue(entry.command) ?? "unknown")
    : [];
  const latestHandoffPath = matchingHandoffInstance?.relativePath;
  const latestPatchPath = matchingPatchInstance?.relativePath;
  const latestHandoffSessionId = stringValue(latestHandoff?.sessionId);
  const latestPatchSessionId = stringValue(latestPatch?.sessionId);
  const latestPatchStatus = stringValue(latestPatch?.status);
  const latestPatchApplied = latestPatch?.applied === true;
  const latestPatchExternalPatchPath = stringValue(latestPatch?.externalPatchPath);
  const latestPatchRetryCommand = isRecord(latestPatchReplay?.commands)
    ? stringValue(latestPatchReplay.commands.retryWithExternalPatch)
    : undefined;
  const latestPatchReviewCompanionPath = latestPatchCompanion?.relativePath;
  const latestPatchReviewCompanionSummary = latestPatchCompanion?.companion?.summary;
  const latestHandoffRestoreCommand = isRecord(latestHandoffReplay?.commands)
    ? stringValue(latestHandoffReplay.commands.restore)
    : undefined;
  const latestHandoffRetryCommand = isRecord(latestHandoffReplay?.commands)
    ? stringValue(latestHandoffReplay.commands.retryWithExternalPatch)
    : undefined;
  const latestHandoffAdapterCommand = latestHandoffPath
    ? `npm run jispec-cli -- handoff adapter --from-handoff ${latestHandoffPath} --tool codex`
    : "npm run jispec-cli -- handoff adapter --from-handoff <path-or-session> --tool codex";
  const externalToolRequired = latestExternalToolHandoff?.required === true;
  const patchNeedsAttention = latestPatchStatus === "apply_failed" || latestPatchStatus === "rejected_out_of_scope";
  const chainStatus = !activeSessionRecord
    ? "not_available_yet"
    : patchNeedsAttention
      ? "needs_patch"
      : externalToolRequired
        ? "needs_external_tool"
        : latestHandoff
          ? "ready"
          : "needs_handoff";

  return {
    state: activeSessionRecord || latestHandoff || latestPatch ? "available" : "not_available_yet",
    chainStatus,
    activeSessionId: activeSessionId ?? "not_available_yet",
    activeSessionPath: activeSessionRecord ? ".jispec/change-session.json" : "not_available_yet",
    activeSessionSummary: stringValue(activeSessionRecord?.summary) ?? "not_available_yet",
    activeSessionMode: stringValue(activeSessionRecord?.orchestrationMode) ?? "not_available_yet",
    activeSessionLane: stringValue(activeLaneDecision?.lane) ?? "not_available_yet",
    activeSessionRequestedLane: stringValue(activeLaneDecision?.requestedLane) ?? "not_available_yet",
    activeSessionAutoPromoted: activeLaneDecision?.autoPromoted === true,
    activeChangedPathCount: activeChangedPaths.length,
    activeChangedPaths,
    activeNextCommandCount: activeNextCommands.length,
    activeNextCommands,
    latestHandoffSessionId: latestHandoffSessionId ?? "not_available_yet",
    latestHandoffPath: latestHandoffPath ?? "not_available_yet",
    latestHandoffOutcome: stringValue(latestHandoff?.outcome) ?? "not_available_yet",
    latestHandoffStopPoint: stringValue(latestHandoffDecision?.stopPoint) ?? "not_available_yet",
    latestHandoffReplayable: latestHandoffReplay?.replayable === true,
    latestHandoffRestoreCommand: latestHandoffRestoreCommand ?? "not_available_yet",
    latestHandoffRetryCommand: latestHandoffRetryCommand ?? "not_available_yet",
    latestHandoffAdapterCommand,
    latestExternalToolHandoffRequired: externalToolRequired,
    latestExternalToolHandoffRequest: stringValue(latestExternalToolHandoff?.request) ?? "not_available_yet",
    latestExternalToolHandoffAllowedPaths: Array.isArray(latestExternalToolHandoff?.allowedPaths)
      ? latestExternalToolHandoff.allowedPaths.map(String)
      : [],
    latestExternalToolHandoffFilesNeedingAttention: Array.isArray(latestExternalToolHandoff?.filesNeedingAttention)
      ? latestExternalToolHandoff.filesNeedingAttention.map(String)
      : [],
    latestPatchSessionId: latestPatchSessionId ?? "not_available_yet",
    latestPatchPath: latestPatchPath ?? "not_available_yet",
    latestPatchStatus: latestPatchStatus ?? "not_available_yet",
    latestPatchApplied,
    latestPatchExternalPatchPath: latestPatchExternalPatchPath ?? "not_available_yet",
    latestPatchRetryCommand: latestPatchRetryCommand ?? "not_available_yet",
    latestPatchReviewCompanionPath: latestPatchReviewCompanionPath ?? "not_available_yet",
    latestPatchReviewCompanionSummary: latestPatchReviewCompanionSummary ?? "not_available_yet",
    chainReady: chainStatus === "ready",
  };
}

function summarizeMainlineRecoveryDrill(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const drill = getFirstData(sourceArtifacts, "mainline-recovery-drill");
  if (!isRecord(drill)) {
    return {
      state: "not_available_yet",
      status: "not_available_yet",
      stepCount: 0,
      topStepCurrentState: "not_available_yet",
      topStepExpectedNextState: "not_available_yet",
      topStepVerificationCommand: "not_available_yet",
    };
  }

  const steps = Array.isArray(drill.steps) ? drill.steps.filter(isRecord) : [];
  const topStep = steps[0];
  return {
    state: "available",
    status: stringValue(drill.status) ?? "not_available_yet",
    summary: stringValue(drill.summary) ?? "not_available_yet",
    stepCount: steps.length,
    topStepCurrentState: stringValue(topStep?.currentState) ?? "not_available_yet",
    topStepOwnerAction: stringValue(topStep?.ownerAction) ?? "not_available_yet",
    topStepCommand: stringValue(topStep?.command) ?? "not_available_yet",
    topStepExpectedNextState: stringValue(topStep?.expectedNextState) ?? "not_available_yet",
    topStepVerificationCommand: stringValue(topStep?.verificationCommand) ?? "not_available_yet",
    sourceArtifact: ".jispec/recovery/mainline-drill.json",
  };
}

function summarizeAuditEvents(root: string, sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const inspection = inspectAuditLedger(root);
  const events = inspection.events.filter(isRecord);
  const latest = events.at(-1);
  const typedEvents = events.map(auditEventType);
  const approvalEvents = events.filter((event) => isApprovalAuditEvent(auditEventType(event)));
  const boundaryEvents = events.filter((event) => isBoundaryAuditEvent(auditEventType(event)));
  const exceptionEvents = events.filter((event) => isExceptionAuditEvent(auditEventType(event)));

  return {
    state: events.length > 0 ? "available" : "not_available_yet",
    eventCount: events.length,
    integrityStatus: inspection.status,
    integrityVerifiedEventCount: inspection.verifiedEventCount,
    integrityLegacyEventCount: inspection.legacyEventCount,
    integrityParseErrorCount: inspection.parseErrorCount,
    integrityLatestSequence: inspection.latestSequence,
    integrityLatestHash: inspection.latestHash ?? "not_available_yet",
    integrityIssueCount: inspection.issues.length,
    integrityIssues: inspection.issues.slice(0, 10).map((issue) => ({
      line: issue.line,
      code: issue.code,
      message: issue.message,
    })),
    latestEventType: latest ? auditEventType(latest) : "not_available_yet",
    latestActor: latest?.actor ?? "not_available_yet",
    latestTimestamp: latest?.timestamp ?? "not_available_yet",
    latestReason: latest?.reason ?? "not_available_yet",
    latestSourceArtifact: isRecord(latest?.sourceArtifact) ? latest?.sourceArtifact.path ?? "not_declared" : "not_declared",
    latestAffectedContracts: Array.isArray(latest?.affectedContracts) ? latest?.affectedContracts : [],
    eventsByType: countByStatus(typedEvents),
    actors: stableUnique(events.map((event) => String(event.actor ?? "")).filter(Boolean)),
    approvalCount: approvalEvents.length,
    boundaryChangeCount: boundaryEvents.length,
    exceptionChangeCount: exceptionEvents.length,
  };
}

function summarizeMultiRepoExport(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const exportSnapshot = getFirstData(sourceArtifacts, "multi-repo-governance-snapshot");
  if (!isRecord(exportSnapshot)) {
    return { state: "not_available_yet" };
  }

  const sourceSnapshot = isRecord(exportSnapshot.sourceSnapshot) ? exportSnapshot.sourceSnapshot : {};
  const aggregateHints = isRecord(exportSnapshot.aggregateHints) ? exportSnapshot.aggregateHints : {};
  return {
    state: "available",
    repoId: isRecord(exportSnapshot.repo) ? exportSnapshot.repo.id ?? "not_declared" : "not_declared",
    repoName: isRecord(exportSnapshot.repo) ? exportSnapshot.repo.name ?? "not_declared" : "not_declared",
    exportedAt: exportSnapshot.exportedAt ?? "not_declared",
    artifactHash: sourceSnapshot.hash ?? "not_declared",
    artifactSummary: sourceSnapshot.artifactSummary ?? {},
    governanceSummary: sourceSnapshot.governanceSummary ?? {},
    verifyVerdict: aggregateHints.verifyVerdict ?? "not_declared",
    policyProfile: aggregateHints.policyProfile ?? "not_declared",
    openSpecDebt: aggregateHints.openSpecDebt ?? "not_declared",
    releaseDriftStatus: aggregateHints.releaseDriftStatus ?? "not_declared",
    sourceEvolutionChangeId: aggregateHints.sourceEvolutionChangeId ?? "not_declared",
    sourceEvolutionBlockingOpenItems: aggregateHints.sourceEvolutionBlockingOpenItems ?? "not_declared",
  };
}

function summarizeGlobalOperationsPacket(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const packet = getFirstData(sourceArtifacts, "global-operations-packet");
  if (!isRecord(packet)) {
    return {
      state: "not_available_yet",
      status: "not_available_yet",
      ownerActionCount: 0,
      crossRepoContractRefCount: 0,
      referencedSupportSurfaceCount: 0,
      asyncCollaborationEvidenceAvailable: 0,
    };
  }

  const promotion = isRecord(packet.promotionReadiness) ? packet.promotionReadiness : {};
  const privacy = isRecord(packet.privacyPosture) ? packet.privacyPosture : {};
  const doctorGlobal = isRecord(packet.doctorGlobalReadiness) ? packet.doctorGlobalReadiness : {};
  const asyncEvents = Array.isArray(packet.asyncCollaborationEvents) ? packet.asyncCollaborationEvents.filter(isRecord) : [];
  const referencedSupportSurfaces = Array.isArray(promotion.referencedSupportSurfaces)
    ? promotion.referencedSupportSurfaces.map(String)
    : [];
  return {
    state: "available",
    status: stringValue(packet.status) ?? "not_available_yet",
    ownerActionCount: Array.isArray(packet.ownerActionLifecycle) ? packet.ownerActionLifecycle.length : 0,
    crossRepoContractRefCount: Array.isArray(packet.crossRepoContractRefs) ? packet.crossRepoContractRefs.length : 0,
    referencedSupportSurfaceCount: referencedSupportSurfaces.length,
    referencedSupportSurfaces,
    promotionReady: promotion.ready === true,
    privacyStatus: stringValue(privacy.status) ?? "not_available_yet",
    auditEvidenceRefCount: Array.isArray(packet.auditEvidenceRefs) ? packet.auditEvidenceRefs.length : 0,
    asyncCollaborationEvidenceAvailable: asyncEvents.filter((event) => event.status === "available").length,
    asyncCollaborationEvidenceTotal: asyncEvents.length,
    doctorGlobalReady: doctorGlobal.ready === true,
    boundaryReplacesVerify: isRecord(packet.boundary) ? packet.boundary.replacesVerify === true : false,
  };
}

function summarizeOrgResponsibilityGraph(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const graph = getFirstData(sourceArtifacts, "org-responsibility-graph");
  if (!isRecord(graph)) {
    return {
      state: "not_available_yet",
      status: "not_available_yet",
      teamCount: 0,
      repoCount: 0,
      ownerActionAssignmentCount: 0,
      reviewerCoverage: 0,
      escalationCoverage: 0,
    };
  }

  const topology = isRecord(graph.orgTopology) ? graph.orgTopology : {};
  const coverage = isRecord(graph.reviewerCoverage) ? graph.reviewerCoverage : {};
  const totalOwnerActions = numberValue(coverage.totalOwnerActions) ?? 0;
  const actionsWithReviewer = numberValue(coverage.actionsWithReviewer) ?? 0;
  const actionsWithEscalation = numberValue(coverage.actionsWithEscalation) ?? 0;
  return {
    state: "available",
    status: stringValue(graph.status) ?? "not_available_yet",
    orgId: stringValue(topology.orgId) ?? "not_declared",
    teamCount: numberValue(topology.teamCount) ?? (Array.isArray(topology.teams) ? topology.teams.length : 0),
    repoCount: numberValue(topology.repoCount) ?? (Array.isArray(topology.repos) ? topology.repos.length : 0),
    responsibilityEdgeCount: Array.isArray(graph.responsibilityEdges) ? graph.responsibilityEdges.length : 0,
    ownerActionAssignmentCount: Array.isArray(graph.ownerActionAssignments) ? graph.ownerActionAssignments.length : 0,
    reviewerCoverage: totalOwnerActions === 0 ? 0 : actionsWithReviewer / totalOwnerActions,
    escalationCoverage: totalOwnerActions === 0 ? 0 : actionsWithEscalation / totalOwnerActions,
    auditEvidenceRefCount: Array.isArray(graph.auditEvidenceRefs) ? graph.auditEvidenceRefs.length : 0,
    boundaryReplacesVerify: isRecord(graph.boundary) ? graph.boundary.replacesVerify === true : false,
    sourceUploadRequired: isRecord(graph.boundary) ? graph.boundary.sourceUploadRequired === true : false,
    realtimeCollaborationRequired: isRecord(graph.boundary) ? graph.boundary.realtimeCollaborationRequired === true : false,
  };
}

function summarizeAsyncReviewInbox(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const inbox = getFirstData(sourceArtifacts, "async-review-inbox");
  if (!isRecord(inbox)) {
    return {
      state: "not_available_yet",
      status: "not_available_yet",
      reviewerCount: 0,
      totalItems: 0,
      pending: 0,
      accepted: 0,
      blocked: 0,
      expired: 0,
    };
  }

  const summary = isRecord(inbox.summary) ? inbox.summary : {};
  return {
    state: "available",
    status: stringValue(inbox.status) ?? "not_available_yet",
    reviewerCount: numberValue(summary.reviewerCount) ?? 0,
    totalItems: numberValue(summary.totalItems) ?? 0,
    pending: numberValue(summary.pending) ?? 0,
    accepted: numberValue(summary.accepted) ?? 0,
    blocked: numberValue(summary.blocked) ?? 0,
    expired: numberValue(summary.expired) ?? 0,
    reviewersMissing: numberValue(summary.reviewersMissing) ?? 0,
    escalationReadyItems: numberValue(summary.escalationReadyItems) ?? 0,
    auditEvidenceRefCount: Array.isArray(inbox.auditEvidenceRefs) ? inbox.auditEvidenceRefs.length : 0,
    boundaryReplacesVerify: isRecord(inbox.boundary) ? inbox.boundary.replacesVerify === true : false,
    sourceUploadRequired: isRecord(inbox.boundary) ? inbox.boundary.sourceUploadRequired === true : false,
    realtimeCollaborationRequired: isRecord(inbox.boundary) ? inbox.boundary.realtimeCollaborationRequired === true : false,
  };
}

function summarizeOpsAgingLedger(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const ledger = getFirstData(sourceArtifacts, "ops-aging-ledger");
  if (!isRecord(ledger)) {
    return {
      state: "not_available_yet",
      status: "not_available_yet",
      totalItems: 0,
      fresh: 0,
      dueSoon: 0,
      overdue: 0,
      escalated: 0,
    };
  }

  const summary = isRecord(ledger.summary) ? ledger.summary : {};
  return {
    state: "available",
    status: stringValue(ledger.status) ?? "not_available_yet",
    totalItems: numberValue(summary.totalItems) ?? 0,
    fresh: numberValue(summary.fresh) ?? 0,
    dueSoon: numberValue(summary.dueSoon) ?? 0,
    overdue: numberValue(summary.overdue) ?? 0,
    escalated: numberValue(summary.escalated) ?? 0,
    itemsWithEscalationPath: numberValue(summary.itemsWithEscalationPath) ?? 0,
    itemsMissingEscalationPath: numberValue(summary.itemsMissingEscalationPath) ?? 0,
    auditEvidenceRefCount: Array.isArray(ledger.auditEvidenceRefs) ? ledger.auditEvidenceRefs.length : 0,
    boundaryReplacesVerify: isRecord(ledger.boundary) ? ledger.boundary.replacesVerify === true : false,
    sourceUploadRequired: isRecord(ledger.boundary) ? ledger.boundary.sourceUploadRequired === true : false,
    realtimeCollaborationRequired: isRecord(ledger.boundary) ? ledger.boundary.realtimeCollaborationRequired === true : false,
  };
}

function summarizeReleaseTrainPacket(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const packet = getFirstData(sourceArtifacts, "release-train-packet");
  if (!isRecord(packet)) {
    return {
      state: "not_available_yet",
      status: "not_available_yet",
      trainReady: false,
      blockedRepoCount: 0,
      ownerAssignmentCount: 0,
      requiredReviewCount: 0,
    };
  }

  const train = isRecord(packet.trainReadiness) ? packet.trainReadiness : {};
  const releaseCompare = isRecord(packet.releaseCompare) ? packet.releaseCompare : {};
  return {
    state: "available",
    status: stringValue(packet.status) ?? "not_available_yet",
    trainReady: train.ready === true,
    repoCount: Array.isArray(packet.repos) ? packet.repos.length : 0,
    blockedRepoCount: numberValue(train.blockedRepoCount) ?? 0,
    ownerAssignmentCount: numberValue(train.ownerAssignmentCount) ?? 0,
    requiredReviewCount: numberValue(train.requiredReviewCount) ?? 0,
    dueSoonReviewCount: numberValue(train.dueSoonReviewCount) ?? 0,
    overdueReviewCount: numberValue(train.overdueReviewCount) ?? 0,
    escalatedReviewCount: numberValue(train.escalatedReviewCount) ?? 0,
    safeNextCommand: stringValue(train.safeNextCommand) ?? "not_available_yet",
    releaseCompareGlobalContextStatus: stringValue(releaseCompare.globalContextStatus) ?? "not_available_yet",
    auditEvidenceRefCount: Array.isArray(packet.auditEvidenceRefs) ? packet.auditEvidenceRefs.length : 0,
    boundaryReplacesVerify: isRecord(packet.boundary) ? packet.boundary.replacesVerify === true : false,
    boundaryReplacesPostReleaseGate: isRecord(packet.boundary) ? packet.boundary.replacesPostReleaseGate === true : false,
    sourceUploadRequired: isRecord(packet.boundary) ? packet.boundary.sourceUploadRequired === true : false,
    realtimeCollaborationRequired: isRecord(packet.boundary) ? packet.boundary.realtimeCollaborationRequired === true : false,
  };
}

function summarizeOrgOperations(objects: ConsoleGovernanceObjectSnapshot[]): ConsoleOrgOperationsSummary {
  const sourceObjectIds: ConsoleGovernanceObjectId[] = [
    "org_responsibility_graph",
    "async_review_inbox",
    "ops_aging_ledger",
    "release_train_packet",
  ];
  const byId = new Map(objects.map((object) => [object.id, object]));
  const orgGraph = byId.get("org_responsibility_graph");
  const inbox = byId.get("async_review_inbox");
  const aging = byId.get("ops_aging_ledger");
  const train = byId.get("release_train_packet");
  const sourceObjects = sourceObjectIds.map((id) => byId.get(id)).filter((object): object is ConsoleGovernanceObjectSnapshot => Boolean(object));
  const availableObjectCount = sourceObjects.filter((object) => object.status === "available").length;
  const missingObjectCount = sourceObjectIds.length - availableObjectCount;
  const responsibility = {
    status: stringValue(orgGraph?.summary.status) ?? "not_available_yet",
    teamCount: numberValue(orgGraph?.summary.teamCount) ?? 0,
    repoCount: numberValue(orgGraph?.summary.repoCount) ?? 0,
    ownerActionAssignmentCount: numberValue(orgGraph?.summary.ownerActionAssignmentCount) ?? 0,
    reviewerCoverage: numberValue(orgGraph?.summary.reviewerCoverage) ?? 0,
    escalationCoverage: numberValue(orgGraph?.summary.escalationCoverage) ?? 0,
  };
  const reviews = {
    status: stringValue(inbox?.summary.status) ?? "not_available_yet",
    reviewerCount: numberValue(inbox?.summary.reviewerCount) ?? 0,
    totalItems: numberValue(inbox?.summary.totalItems) ?? 0,
    pending: numberValue(inbox?.summary.pending) ?? 0,
    blocked: numberValue(inbox?.summary.blocked) ?? 0,
    expired: numberValue(inbox?.summary.expired) ?? 0,
    reviewersMissing: numberValue(inbox?.summary.reviewersMissing) ?? 0,
  };
  const sla = {
    status: stringValue(aging?.summary.status) ?? "not_available_yet",
    totalItems: numberValue(aging?.summary.totalItems) ?? 0,
    dueSoon: numberValue(aging?.summary.dueSoon) ?? 0,
    overdue: numberValue(aging?.summary.overdue) ?? 0,
    escalated: numberValue(aging?.summary.escalated) ?? 0,
    itemsMissingEscalationPath: numberValue(aging?.summary.itemsMissingEscalationPath) ?? 0,
  };
  const releaseTrain = {
    status: stringValue(train?.summary.status) ?? "not_available_yet",
    trainReady: train?.summary.trainReady === true,
    repoCount: numberValue(train?.summary.repoCount) ?? 0,
    blockedRepoCount: numberValue(train?.summary.blockedRepoCount) ?? 0,
    ownerAssignmentCount: numberValue(train?.summary.ownerAssignmentCount) ?? 0,
    requiredReviewCount: numberValue(train?.summary.requiredReviewCount) ?? 0,
    safeNextCommand: stringValue(train?.summary.safeNextCommand) ?? "not_available_yet",
  };
  const boundaryViolation = sourceObjects.some((object) =>
    object.summary.boundaryReplacesVerify === true
    || object.summary.sourceUploadRequired === true
    || object.summary.realtimeCollaborationRequired === true
    || object.summary.boundaryReplacesPostReleaseGate === true
  );
  const ready = availableObjectCount === sourceObjectIds.length
    && responsibility.status === "ready"
    && reviews.status === "ready"
    && sla.status === "ready"
    && releaseTrain.status === "ready"
    && releaseTrain.trainReady
    && reviews.reviewersMissing === 0
    && sla.itemsMissingEscalationPath === 0
    && releaseTrain.blockedRepoCount === 0
    && !boundaryViolation;
  const state = ready
    ? "ready"
    : availableObjectCount === 0
      ? "not_available_yet"
      : "attention";

  return {
    state,
    status: ready ? "ready" : state,
    ready,
    sourceObjectIds,
    availableObjectCount,
    missingObjectCount,
    responsibility,
    reviews,
    sla,
    releaseTrain,
    boundary: {
      readOnly: true,
      sourceUploadRequired: false,
      realtimeCollaborationRequired: false,
      executesCommands: false,
      replacesVerify: false,
      replacesDoctorGlobal: false,
      replacesPostReleaseGate: false,
      localArtifactsOnly: true,
    },
  };
}

function summarizeNorthStarAcceptance(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const acceptance = getFirstData(sourceArtifacts, "north-star-acceptance");
  const scenarios = getAllData(sourceArtifacts, "north-star-scenario-packets").filter(isRecord);

  if (!isRecord(acceptance)) {
    return { state: "not_available_yet" };
  }

  const summary = isRecord(acceptance.summary) ? acceptance.summary : {};
  const contract = isRecord(acceptance.contract) ? acceptance.contract : {};
  return {
    state: "available",
    ready: summary.ready ?? "not_declared",
    scenarioCount: summary.scenarioCount ?? scenarios.length ?? "not_declared",
    passedScenarioCount: summary.passedScenarioCount ?? "not_declared",
    blockingScenarioCount: summary.blockingScenarioCount ?? "not_declared",
    scenarioIds: scenarios.map((scenario) => String(scenario.id ?? scenario.scenarioId ?? "unknown")),
    scenarioStatuses: scenarios.reduce((acc, scenario) => {
      const id = String(scenario.id ?? scenario.scenarioId ?? "unknown");
      acc[id] = String(scenario.status ?? "not_declared");
      return acc;
    }, {} as Record<string, string>),
    contractVersion: contract.version ?? "not_declared",
    boundary: acceptance.boundary ?? {},
    blockers: Array.isArray(acceptance.blockers) ? acceptance.blockers.length : "not_declared",
  };
}

function summarizeDoctorGlobalReadiness(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const report = getFirstData(sourceArtifacts, "doctor-global-readiness");

  if (!isRecord(report)) {
    return { state: "not_available_yet" };
  }

  const summary = isRecord(report.readinessSummary) ? report.readinessSummary : {};
  return {
    state: "available",
    profile: String(report.profile ?? "not_declared"),
    ready: report.ready === true,
    totalChecks: report.totalChecks ?? "not_declared",
    passedChecks: report.passedChecks ?? "not_declared",
    failedChecks: report.failedChecks ?? "not_declared",
    blockerCount: summary.blockerCount ?? "not_declared",
    blockerChecks: Array.isArray(summary.blockers)
      ? summary.blockers.map((blocker) => isRecord(blocker) ? String(blocker.check ?? "unknown") : String(blocker))
      : [],
  };
}

function summarizeApprovalWorkflow(root: string): Record<string, unknown> {
  try {
    const posture = evaluatePolicyApprovalWorkflow(root);
    return {
      state: posture.summary.totalSubjects > 0 || posture.summary.approvals > 0 ? "available" : "not_available_yet",
      status: posture.status,
      profile: posture.profile,
      owner: posture.requirement.owner,
      reviewers: posture.requirement.reviewers,
      requiredReviewers: posture.requirement.requiredReviewers,
      ownerApprovalAllowed: posture.requirement.ownerApprovalAllowed,
      totalSubjects: posture.summary.totalSubjects,
      satisfied: posture.summary.satisfied,
      missing: posture.summary.missing,
      stale: posture.summary.stale,
      approvals: posture.summary.approvals,
      currentApprovals: posture.summary.currentApprovals,
      staleApprovals: posture.summary.staleApprovals,
      rejectedApprovals: posture.summary.rejectedApprovals,
      subjects: posture.subjects.map((subject) => ({
        kind: subject.subject.kind,
        ref: subject.subject.ref,
        hash: subject.subject.hash,
        status: subject.status,
        approvedReviewers: subject.approvedReviewers,
        ownerApprovedBy: subject.ownerApprovedBy,
        currentApprovalIds: subject.currentApprovalIds,
        staleApprovalIds: subject.staleApprovalIds,
        rejectedApprovalIds: subject.rejectedApprovalIds,
        missingReviewers: subject.missingReviewers,
        reason: subject.reason,
      })),
      boundary: posture.boundary,
    };
  } catch (error) {
    return {
      state: "invalid",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function auditEventType(event: unknown): string {
  if (!isRecord(event)) {
    return "unknown";
  }
  return String(event.type ?? event.event ?? "unknown");
}

function getInstances(artifacts: ConsoleSnapshotArtifact[], id: string): ConsoleSnapshotArtifactInstance[] {
  return artifacts.find((artifact) => artifact.id === id)?.instances.filter((instance) => instance.status === "available") ?? [];
}

function getFirstData(artifacts: ConsoleSnapshotArtifact[], id: string): unknown {
  return getInstances(artifacts, id)[0]?.data;
}

function getAllData(artifacts: ConsoleSnapshotArtifact[], id: string): unknown[] {
  return getInstances(artifacts, id).map((instance) => instance.data);
}

function countByStatus(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function extractArrayFromRecord(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (!isRecord(value)) {
    return [];
  }
  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
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

function asBootstrapDebtStatusRecord(value: unknown): { status?: string } | undefined {
  return isRecord(value) ? { status: stringValue(value.status) } : undefined;
}

function expiresWithinDays(value: string | undefined, days: number): boolean {
  if (!value) {
    return false;
  }
  const expires = new Date(value).getTime();
  if (Number.isNaN(expires)) {
    return false;
  }
  const now = Date.now();
  return expires >= now && expires <= now + days * 24 * 60 * 60 * 1000;
}

function isPastDate(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const time = new Date(value).getTime();
  return !Number.isNaN(time) && time < Date.now();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isApprovalAuditEvent(type: string): boolean {
  return [
    "source_review_adopt",
    "source_adopt",
    "adopt_accept",
    "adopt_edit",
    "review_adopt",
    "release_snapshot",
    "policy_approval_decision",
  ].includes(type);
}

function isBoundaryAuditEvent(type: string): boolean {
  return [
    "source_refresh",
    "source_review_adopt",
    "source_review_reject",
    "source_adopt",
    "adopt_accept",
    "adopt_edit",
    "adopt_reject",
    "review_adopt",
    "review_reject",
    "policy_migrate",
    "policy_change",
    "default_mode_set",
    "default_mode_reset",
    "release_snapshot",
    "release_compare",
    "ambiguity_debt_open",
    "ambiguity_debt_owner_review",
    "ambiguity_debt_reclassify",
    "ambiguity_debt_resolve",
    "ambiguity_debt_archive",
  ].includes(type);
}

function isExceptionAuditEvent(type: string): boolean {
  return [
    "source_review_defer",
    "source_review_waive",
    "adopt_defer",
    "review_defer",
    "review_waive",
    "waiver_create",
    "waiver_revoke",
    "waiver_expire",
    "waiver_renew",
    "spec_debt_repay",
    "spec_debt_cancel",
    "spec_debt_owner_review",
  ].includes(type);
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

interface SourceEvolutionDecisionSummary {
  itemId: string;
  evolutionId: string;
  summary: string;
  severity: string;
  status: string;
  sourceDocument: string;
  path: string;
  anchorId?: string;
  owner?: string;
  deferExpiresAt?: string;
  waiverExpiresAt?: string;
  mapsTo: string[];
}

interface SourceEvolutionReviewSummary {
  total: number;
  open: number;
  blockingOpen: number;
  adopted: number;
  deferred: number;
  waived: number;
  rejected: number;
  expiredDeferred: number;
  expiredWaived: number;
  openBySeverity: Record<string, number>;
}

interface SourceEvolutionDiffSummary {
  changed: boolean;
  total: number;
  added: number;
  modified: number;
  deprecated: number;
  split: number;
  merged: number;
  reanchored: number;
  blockingTotal: number;
  advisoryTotal: number;
}

interface SourceEvolutionPair {
  changeId: string;
  evolutionPath?: string;
  reviewPath?: string;
  evolutionSummary?: SourceEvolutionDiffSummary;
  reviewSummary?: SourceEvolutionReviewSummary;
  representativeItem?: string;
  decisions: SourceEvolutionDecisionSummary[];
}

function buildSourceEvolutionPair(
  changeId: string,
  evolution: ConsoleSnapshotArtifactInstance | undefined,
  review: ConsoleSnapshotArtifactInstance | undefined,
): SourceEvolutionPair {
  const evolutionData = isRecord(evolution?.data) ? evolution.data : undefined;
  const reviewData = isRecord(review?.data) ? review.data : undefined;
  const evolutionItems = Array.isArray(evolutionData?.items) ? evolutionData.items.filter(isRecord) : [];
  const reviewItems = Array.isArray(reviewData?.items) ? reviewData.items.filter(isRecord) : [];
  const decisions = evolutionItems.map((item) => toSourceEvolutionDecisionSummary(item, reviewItems));
  const diffSummary = isRecord(evolutionData?.summary)
    ? {
        changed: evolutionData.summary.changed === true,
        total: numberValue(evolutionData.summary.total) ?? evolutionItems.length,
        added: numberValue(evolutionData.summary.added) ?? 0,
        modified: numberValue(evolutionData.summary.modified) ?? 0,
        deprecated: numberValue(evolutionData.summary.deprecated) ?? 0,
        split: numberValue(evolutionData.summary.split) ?? 0,
        merged: numberValue(evolutionData.summary.merged) ?? 0,
        reanchored: numberValue(evolutionData.summary.reanchored) ?? 0,
        blockingTotal: decisions.filter((item) => item.severity === "blocking").length,
        advisoryTotal: decisions.filter((item) => item.severity !== "blocking").length,
      }
    : undefined;

  const reviewSummary = decisions.reduce<SourceEvolutionReviewSummary>(
    (acc, decision) => {
      acc.total++;
      if (decision.status === "proposed") {
        acc.open++;
        acc.openBySeverity[decision.severity] = (acc.openBySeverity[decision.severity] ?? 0) + 1;
        if (decision.severity === "blocking") {
          acc.blockingOpen++;
        }
      } else if (decision.status === "adopted") {
        acc.adopted++;
      } else if (decision.status === "deferred") {
        acc.deferred++;
        if (isPastDate(decision.deferExpiresAt)) {
          acc.expiredDeferred++;
        }
      } else if (decision.status === "waived") {
        acc.waived++;
        if (isPastDate(decision.waiverExpiresAt)) {
          acc.expiredWaived++;
        }
      } else if (decision.status === "rejected") {
        acc.rejected++;
      }
      return acc;
    },
    {
      total: 0,
      open: 0,
      blockingOpen: 0,
      adopted: 0,
      deferred: 0,
      waived: 0,
      rejected: 0,
      expiredDeferred: 0,
      expiredWaived: 0,
      openBySeverity: {},
    },
  );

  return {
    changeId,
    evolutionPath: evolution?.relativePath,
    reviewPath: review?.relativePath,
    evolutionSummary: diffSummary,
    reviewSummary,
    representativeItem: selectRepresentativeSourceEvolutionArtifact(decisions),
    decisions,
  };
}

function toSourceEvolutionDecisionSummary(
  item: Record<string, unknown>,
  reviewItems: Record<string, unknown>[],
): SourceEvolutionDecisionSummary {
  const evolutionId = stringValue(item.evolution_id) ?? "unknown-evolution";
  const review = reviewItems.find((entry) => stringValue(entry.evolution_id) === evolutionId);
  const deferRecord = isRecord(review?.defer_record) ? review.defer_record : undefined;
  const waiverRecord = isRecord(review?.waiver_record) ? review.waiver_record : undefined;
  return {
    itemId: stringValue(review?.item_id) ?? evolutionId,
    evolutionId,
    summary: stringValue(review?.summary) ?? stringValue(item.summary) ?? "source evolution item",
    severity: stringValue(review?.severity) ?? stringValue(item.severity) ?? "blocking",
    status: stringValue(review?.status) ?? "proposed",
    sourceDocument: stringValue(review?.source_document) ?? stringValue(item.source_document) ?? "requirements",
    path: stringValue(review?.source_document) === "technical_solution"
      ? stringValue(item.path) ?? "docs/input/technical-solution.md"
      : stringValue(item.path) ?? "docs/input/requirements.md",
    anchorId: stringValue(review?.anchor_id) ?? stringValue(item.anchor_id),
    owner: stringValue(review?.owner)
      ?? stringValue(extractNestedValue(deferRecord, ["owner"]))
      ?? stringValue(extractNestedValue(waiverRecord, ["owner"])),
    deferExpiresAt: stringValue(extractNestedValue(deferRecord, ["expires_at"])),
    waiverExpiresAt: stringValue(extractNestedValue(waiverRecord, ["expires_at"])),
    mapsTo: Array.isArray(review?.maps_to)
      ? review.maps_to.map(String)
      : Array.isArray(item.successor_ids)
        ? item.successor_ids.map(String)
        : [],
  };
}

function selectActiveSourceEvolutionPair(pairs: SourceEvolutionPair[]): SourceEvolutionPair | undefined {
  return [...pairs].sort((left, right) => {
    const leftPriority = sourceEvolutionPairPriority(left);
    const rightPriority = sourceEvolutionPairPriority(right);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return right.changeId.localeCompare(left.changeId);
  })[0];
}

function sourceEvolutionPairPriority(pair: SourceEvolutionPair): number {
  const summary = pair.reviewSummary;
  if (!summary) {
    return 5;
  }
  if (summary.expiredDeferred > 0 || summary.expiredWaived > 0) {
    return 0;
  }
  if (summary.blockingOpen > 0) {
    return 1;
  }
  if (summary.open > 0) {
    return 2;
  }
  if ((pair.evolutionSummary?.total ?? 0) > 0) {
    return 3;
  }
  return 4;
}

function extractChangeIdFromDeltaPath(relativePath: string): string | undefined {
  const match = relativePath.match(/^\.spec\/deltas\/([^/]+)\//);
  return match?.[1];
}

function selectRepresentativeSourceEvolutionArtifact(decisions: SourceEvolutionDecisionSummary[]): string | undefined {
  const selected = [...decisions].sort((left, right) => {
    const priority = representativeSourceEvolutionDecisionPriority(left) - representativeSourceEvolutionDecisionPriority(right);
    if (priority !== 0) {
      return priority;
    }
    return `${left.path}|${left.anchorId ?? left.evolutionId}`.localeCompare(`${right.path}|${right.anchorId ?? right.evolutionId}`);
  })[0];
  if (!selected) {
    return undefined;
  }
  return selected.anchorId ? `${selected.path}:${selected.anchorId}` : selected.path;
}

function representativeSourceEvolutionDecisionPriority(decision: SourceEvolutionDecisionSummary): number {
  if (decision.path.includes("/contracts/") || decision.path.includes("contract")) {
    return 0;
  }
  if (decision.path.includes("/design/") || decision.path.includes("technical-solution")) {
    return 1;
  }
  if (decision.path.includes("/behavior/") || decision.path.endsWith(".feature")) {
    return 2;
  }
  if (decision.path.includes("/tests/") || decision.path.endsWith(".spec.ts") || decision.path.endsWith(".test.ts")) {
    return 3;
  }
  if (decision.sourceDocument === "requirements") {
    return 4;
  }
  return 5;
}

function listDirectFiles(root: string, relativeDir: string, extension: string): string[] {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  return fs.readdirSync(absoluteDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => normalizeRelativePath(path.posix.join(relativeDir, entry.name)))
    .sort((left, right) => left.localeCompare(right));
}

function listNestedFiles(root: string, relativeDir: string, extension: string, maxDepth: number): string[] {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir) || maxDepth < 1) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const childRelativePath = normalizeRelativePath(path.posix.join(relativeDir, entry.name));
    const childAbsolutePath = path.join(root, childRelativePath);
    if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(childRelativePath);
    } else if (entry.isDirectory() && maxDepth > 1) {
      files.push(...listNestedFiles(root, childRelativePath, extension, maxDepth - 1));
    } else if (entry.isDirectory() && maxDepth === 1) {
      for (const child of fs.readdirSync(childAbsolutePath, { withFileTypes: true })) {
        if (child.isFile() && child.name.endsWith(extension)) {
          files.push(normalizeRelativePath(path.posix.join(childRelativePath, child.name)));
        }
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function listCompareReports(root: string, filename: string): string[] {
  const compareRoot = path.join(root, ".spec", "releases", "compare");
  if (!fs.existsSync(compareRoot)) {
    return [];
  }

  return fs.readdirSync(compareRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => normalizeRelativePath(path.posix.join(".spec/releases/compare", entry.name, filename)))
    .filter((relativePath) => fs.existsSync(path.join(root, relativePath)))
    .sort((left, right) => left.localeCompare(right));
}

function normalizeRelativePath(candidate: string): string {
  return candidate.replace(/\\/g, "/");
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function isParseError(error: unknown): boolean {
  return error instanceof SyntaxError || error instanceof yaml.YAMLException;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
