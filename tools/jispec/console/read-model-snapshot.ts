import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { inspectAuditLedger } from "../audit/event-ledger";
import { evaluatePolicyApprovalWorkflow } from "../policy/approval";
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

export type ConsoleSnapshotArtifactStatus = "available" | "not_available_yet" | "unreadable" | "invalid";
export type ConsoleGovernanceObjectStatus = "available" | "partial" | "not_available_yet" | "invalid";

export interface ConsoleSnapshotArtifactInstance {
  relativePath: string;
  status: Exclude<ConsoleSnapshotArtifactStatus, "not_available_yet">;
  sizeBytes?: number;
  modifiedAt?: string;
  contentHash?: string;
  data?: unknown;
  displayOnlyText?: string;
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

  if (pathPattern === ".jispec/handoff/*.json") {
    return listDirectFiles(root, ".jispec/handoff", ".json");
  }

  if (pathPattern === ".jispec/implement/<session-id>/patch-mediation.json") {
    return listNestedFiles(root, ".jispec/implement", ".json", 2)
      .filter((relativePath) => relativePath.endsWith("/patch-mediation.json"));
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
    const status = summarizeGovernanceStatus(sourceArtifacts);

    return {
      id: object.id,
      label: object.label,
      status,
      sourceArtifactIds: [...object.sourceArtifactIds],
      sourcePaths,
      missingSourceArtifactIds,
      automationInputs: object.automationInputs,
      markdownDisplayOnly: true,
      summary: buildGovernanceSummary(root, object.id, sourceArtifacts),
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
  if (id === "multi_repo_export") {
    return summarizeMultiRepoExport(sourceArtifacts);
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

  return {
    state: ledgerItems.length > 0 || bootstrapRecords.length > 0 ? "available" : "not_available_yet",
    greenfieldLedgerItems: ledgerItems.length,
    bootstrapDebtRecords: bootstrapRecords.length,
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

  return {
    state: single !== undefined || pool !== undefined || valueReport !== undefined ? "available" : "not_available_yet",
    hasSingleMetrics: single !== undefined,
    hasPoolMetrics: pool !== undefined,
    hasValueReport: valueReport !== undefined,
    singleScore: extractNestedValue(single, ["qualityScorecard", "score"]) ?? extractNestedValue(single, ["quality_scorecard", "score"]),
    poolFixtureCount: extractArrayFromRecord(pool, ["fixtures", "fixtureMetrics", "fixture_metrics"]).length,
    estimatedManualSortingMinutesSaved: headline.estimatedManualSortingMinutesSaved ?? manualSorting.estimatedMinutesSaved ?? "not_available_yet",
    blockingIssuesCaught: headline.blockingIssuesCaught ?? risks.blockingIssuesCaught ?? "not_available_yet",
    advisoryRisksSurfaced: headline.advisoryRisksSurfaced ?? risks.advisoryRisksSurfaced ?? "not_available_yet",
    executeStopsNeedingReview: headline.executeStopsNeedingReview ?? "not_available_yet",
    executeStopPoints: isRecord(execute.stopPoints) ? execute.stopPoints : {},
  };
}

function summarizeImplementationMediation(sourceArtifacts: ConsoleSnapshotArtifact[]): Record<string, unknown> {
  const handoffs = getAllData(sourceArtifacts, "implementation-handoff-packets").filter(isRecord);
  const patchRecords = getAllData(sourceArtifacts, "implementation-patch-mediation").filter(isRecord);
  const outcomes = countByStatus(handoffs.map((handoff) => String(handoff.outcome ?? "unknown")));
  const latest = handoffs.at(-1);
  const latestDecision = isRecord(latest?.decisionPacket) ? latest?.decisionPacket : undefined;
  const latestReplay = isRecord(latest?.replay) ? latest?.replay : undefined;

  return {
    state: handoffs.length > 0 || patchRecords.length > 0 ? "available" : "not_available_yet",
    handoffCount: handoffs.length,
    patchMediationCount: patchRecords.length,
    outcomes,
    latestOutcome: latest?.outcome ?? "not_available_yet",
    latestStopPoint: latestDecision?.stopPoint ?? "not_available_yet",
    latestReplayable: latestReplay?.replayable ?? false,
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
  };
}

function summarizeApprovalWorkflow(root: string): Record<string, unknown> {
  try {
    const posture = evaluatePolicyApprovalWorkflow(root);
    return {
      state: posture.summary.totalSubjects > 0 || posture.summary.approvals > 0 ? "available" : "not_available_yet",
      status: posture.status,
      profile: posture.profile,
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

function isApprovalAuditEvent(type: string): boolean {
  return [
    "adopt_accept",
    "adopt_edit",
    "review_adopt",
    "release_snapshot",
    "policy_approval_decision",
  ].includes(type);
}

function isBoundaryAuditEvent(type: string): boolean {
  return [
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
  ].includes(type);
}

function isExceptionAuditEvent(type: string): boolean {
  return [
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
