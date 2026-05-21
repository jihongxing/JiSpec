import path from "node:path";
import {
  buildConsoleGovernanceActionPlanFromSnapshot,
  selectPrimaryConsoleGovernanceAction,
  type ConsoleGovernanceActionPacket,
  type ConsoleGovernanceActionPlan,
  type ConsoleGovernanceActionStatus,
  type ConsoleGovernanceRunbook,
  type ConsoleGovernanceRiskLevel,
} from "./governance-actions";
import {
  collectConsoleLocalSnapshot,
  type ConsoleGovernanceObjectSnapshot,
  type ConsoleLocalSnapshot,
} from "./read-model-snapshot";
import type { MultiRepoGovernanceAggregate } from "./multi-repo";

export type ConsoleGovernanceQuestionId =
  | "mergeability"
  | "source_evolution_progress"
  | "waiver_attention"
  | "spec_debt_attention"
  | "retakeover_pool_health"
  | "contract_drift_review"
  | "execute_mediation_status"
  | "handoff_replay_status"
  | "approval_workflow_status"
  | "audit_traceability"
  | "global_closure_acceptance"
  | "doctor_global_readiness";

export type ConsoleGovernanceStatus = "ok" | "attention" | "blocked" | "unknown";

export interface ConsoleGovernanceDashboardHeadline {
  status: ConsoleGovernanceStatus;
  title: string;
  summary: string;
  source: string;
  mergeability: {
    status: ConsoleGovernanceStatus;
    answer: string;
    evidence: string[];
  };
  risk: {
    level: ConsoleGovernanceRiskLevel;
    summary: string;
  };
  ownerAction: {
    status: ConsoleGovernanceActionStatus | "not_available";
    owner: string;
    summary: string;
    command: string;
    sourceArtifacts: string[];
  };
  evidence: {
    primary: string;
    sources: string[];
  };
}

export interface ConsoleGovernanceDashboardQuestion {
  id: ConsoleGovernanceQuestionId;
  label: string;
  status: ConsoleGovernanceStatus;
  answer: string;
  evidence: string[];
  nextActions: string[];
}

export interface ConsoleGovernanceDecisionDeck {
  mergeability: {
    status: ConsoleGovernanceStatus;
    answer: string;
    evidence: string[];
  };
  topRisk: {
    level: ConsoleGovernanceRiskLevel;
    summary: string;
  };
  owner: {
    name: string;
    actionStatus: ConsoleGovernanceActionStatus | "not_available";
    actionSummary: string;
  };
  nextCommand: string;
  evidence: {
    primary: string;
    sources: string[];
  };
  valueReport: {
    status: ConsoleGovernanceStatus;
    answer: string;
    metrics: {
      estimatedManualSortingMinutesSaved: number | "not_available_yet";
      blockingIssuesCaught: number | "not_available_yet";
      advisoryRisksSurfaced: number | "not_available_yet";
      executeStopsNeedingReview: number | "not_available_yet";
    };
    sourceArtifacts: string[];
  };
  runbook: {
    status: ConsoleGovernanceRunbook["status"];
    summary: string;
    topStep?: ConsoleGovernanceRunbook["topStep"];
    stepCount: number;
    valueReportImpact: ConsoleGovernanceRunbook["valueReportImpact"];
  };
}

export interface ConsoleGovernanceDashboard {
  version: 1;
  root: string;
  createdAt: string;
  boundary: {
    readOnly: true;
    replacesCliGate: false;
    sourceUploadRequired: false;
    overridesVerify: false;
    scansSourceCode: false;
    firstScreen: "governance_status";
  };
  headline: ConsoleGovernanceDashboardHeadline;
  decisionDeck: ConsoleGovernanceDecisionDeck;
  questions: ConsoleGovernanceDashboardQuestion[];
  snapshot: {
    createdAt: string;
    artifactSummary: ConsoleLocalSnapshot["summary"];
    governanceSummary: ConsoleLocalSnapshot["governance"]["summary"];
  };
}

export function buildConsoleGovernanceDashboard(rootInput: string): ConsoleGovernanceDashboard {
  const root = path.resolve(rootInput);
  const snapshot = collectConsoleLocalSnapshot(root);
  const actionPlan = buildConsoleGovernanceActionPlanFromSnapshot(snapshot, root);
  return buildConsoleGovernanceDashboardFromSnapshot(snapshot, actionPlan);
}

export function buildConsoleGovernanceDashboardFromSnapshot(
  snapshot: ConsoleLocalSnapshot,
  actionPlan: ConsoleGovernanceActionPlan = buildConsoleGovernanceActionPlanFromSnapshot(snapshot),
): ConsoleGovernanceDashboard {
  const questions = [
    buildMergeabilityQuestion(snapshot),
    buildSourceEvolutionQuestion(snapshot),
    buildWaiverQuestion(snapshot),
    buildSpecDebtQuestion(snapshot),
    buildRetakeoverPoolQuestion(snapshot),
    buildContractDriftQuestion(snapshot),
    buildImplementationQuestion(snapshot),
    buildHandoffReplayQuestion(snapshot),
    buildApprovalQuestion(snapshot),
    buildAuditQuestion(snapshot),
    buildGlobalClosureAcceptanceQuestion(snapshot),
    buildDoctorGlobalReadinessQuestion(snapshot),
  ];
  const headline = buildHeadline(questions, actionPlan);
  const decisionDeck = buildDecisionDeck(snapshot, headline, actionPlan);

  return {
    version: 1,
    root: snapshot.root,
    createdAt: new Date().toISOString(),
    boundary: {
      readOnly: true,
      replacesCliGate: false,
      sourceUploadRequired: false,
      overridesVerify: false,
      scansSourceCode: false,
      firstScreen: "governance_status",
    },
    headline,
    decisionDeck,
    questions,
    snapshot: {
      createdAt: snapshot.createdAt,
      artifactSummary: snapshot.summary,
      governanceSummary: snapshot.governance.summary,
    },
  };
}

export function renderConsoleGovernanceDashboardText(dashboard: ConsoleGovernanceDashboard): string {
  const lines = [
    "=== JiSpec Governance Console ===",
    "",
    `Status: ${dashboard.headline.status.toUpperCase()}`,
    dashboard.headline.title,
    dashboard.headline.summary,
    "",
    "Decision Deck:",
    `Mergeability: ${dashboard.headline.mergeability.answer}`,
    `Risk: ${dashboard.headline.risk.level} - ${dashboard.headline.risk.summary}`,
    `Owner action: ${dashboard.headline.ownerAction.owner} - ${dashboard.headline.ownerAction.summary}`,
    `Recommended command: ${dashboard.headline.ownerAction.command}`,
    `Top runbook: ${dashboard.decisionDeck.runbook.topStep ? `${dashboard.decisionDeck.runbook.topStep.owner} - ${dashboard.decisionDeck.runbook.topStep.command}` : dashboard.decisionDeck.runbook.summary}`,
    `Evidence source: ${dashboard.headline.source}`,
    `Value report: ${dashboard.decisionDeck.valueReport.answer}`,
    "",
    "Governance Questions:",
  ];

  for (const question of dashboard.questions) {
    lines.push("");
    lines.push(`[${question.status.toUpperCase()}] ${question.label}`);
    lines.push(`Answer: ${question.answer}`);
    if (question.evidence.length > 0) {
      lines.push("Evidence:");
      for (const evidence of question.evidence) {
        lines.push(`- ${evidence}`);
      }
    }
    if (question.nextActions.length > 0) {
      lines.push("Next actions:");
      for (const nextAction of question.nextActions) {
        lines.push(`- ${nextAction}`);
      }
    }
  }

  lines.push("");
  lines.push("Boundary:");
  lines.push("- Local read-only dashboard over declared JiSpec artifacts.");
  lines.push("- Does not upload source, run verify, override CI, or synthesize missing gate results.");

  return lines.join("\n");
}

export function renderConsoleGovernanceDashboardJSON(dashboard: ConsoleGovernanceDashboard): string {
  return JSON.stringify(dashboard, null, 2);
}

export function buildCrossRepoDriftDashboardSummary(
  aggregate: MultiRepoGovernanceAggregate,
): ConsoleGovernanceDashboardQuestion {
  if (aggregate.contractDriftHints.length === 0) {
    return question({
      id: "contract_drift_review",
      label: "Which cross-repo contract drift needs owner review?",
      status: "ok",
      answer: "No cross-repo contract drift hints were found in the multi-repo aggregate.",
      evidence: [".spec/console/multi-repo-governance.json"],
      nextActions: [],
    });
  }

  return question({
    id: "contract_drift_review",
    label: "Which cross-repo contract drift needs owner review?",
    status: "attention",
    answer: `${aggregate.contractDriftHints.length} cross-repo contract drift hint(s) need owner review.`,
    evidence: aggregate.contractDriftHints.slice(0, 5).map((hint) =>
      `${hint.upstreamRepoId} -> ${hint.downstreamRepoId}: ${hint.contractRef}`,
    ),
    nextActions: (aggregate.ownerActions.length > 0 ? aggregate.ownerActions : aggregate.contractDriftHints)
      .slice(0, 5)
      .map((entry) => entry.suggestedCommand),
  });
}

function buildHeadline(
  questions: ConsoleGovernanceDashboardQuestion[],
  actionPlan: ConsoleGovernanceActionPlan | undefined,
): ConsoleGovernanceDashboard["headline"] {
  const mergeability = questions.find((question) => question.id === "mergeability");
  const blocked = questions.filter((question) => question.status === "blocked");
  const attention = questions.filter((question) => question.status === "attention");
  const unknown = questions.filter((question) => question.status === "unknown");
  const primaryAction = actionPlan ? selectPrimaryConsoleGovernanceAction(actionPlan) : undefined;
  const riskSelection = buildHeadlineRisk(questions, blocked, attention, unknown, primaryAction);
  const risk = riskSelection.risk;
  const mergeabilityNeedsRefresh = mergeability?.status === "blocked" || mergeability?.status === "unknown";
  const ownerAction = buildHeadlineOwnerAction(questions, mergeabilityNeedsRefresh ? undefined : primaryAction);
  const evidence = buildHeadlineEvidence(mergeability, riskSelection.sourceQuestion, ownerAction);
  const mergeabilitySignal = {
    status: mergeability?.status ?? "unknown",
    answer: mergeability?.answer ?? "No mergeability question is available.",
    evidence: mergeability?.evidence ?? [],
  };

  if (blocked.length > 0) {
    return {
      status: "blocked",
      title: "Governance is blocked.",
      summary: `${blocked.length} governance question(s) are blocked; start with mergeability and source evolution governance.`,
      source: evidence.primary,
      mergeability: mergeabilitySignal,
      risk,
      ownerAction,
      evidence,
    };
  }

  if (attention.length > 0) {
    return {
      status: "attention",
      title: "Governance needs attention.",
      summary: `${attention.length} governance question(s) need owner review before treating the repo as clean.`,
      source: evidence.primary,
      mergeability: mergeabilitySignal,
      risk,
      ownerAction,
      evidence,
    };
  }

  if (unknown.length > 0) {
    return {
      status: "unknown",
      title: "Governance state is incomplete.",
      summary: `${unknown.length} governance question(s) are waiting for local JiSpec artifacts.`,
      source: evidence.primary,
      mergeability: mergeabilitySignal,
      risk,
      ownerAction,
      evidence,
    };
  }

  return {
    status: "ok",
    title: "Governance is clear.",
    summary: "No blocking, advisory, drift, waiver, spec debt, mediation, or audit attention was found in the declared artifacts.",
    source: evidence.primary,
    mergeability: mergeabilitySignal,
    risk,
    ownerAction,
    evidence,
  };
}

function buildHeadlineRisk(
  questions: ConsoleGovernanceDashboardQuestion[],
  blocked: ConsoleGovernanceDashboardQuestion[],
  attention: ConsoleGovernanceDashboardQuestion[],
  unknown: ConsoleGovernanceDashboardQuestion[],
  primaryAction: ConsoleGovernanceActionPacket | undefined,
): {
  risk: ConsoleGovernanceDashboardHeadline["risk"];
  sourceQuestion?: ConsoleGovernanceDashboardQuestion;
} {
  const sourceQuestion = blocked[0] ?? attention[0] ?? unknown[0];

  if (blocked.length > 0) {
    return {
      risk: {
        level: "high",
        summary: `${sourceQuestion.label}: ${sourceQuestion.answer}`,
      },
      sourceQuestion,
    };
  }

  if (attention.length > 0) {
    if (primaryAction) {
      return {
        risk: {
          level: primaryAction.risk.level === "unknown" ? "medium" : primaryAction.risk.level,
          summary: `${primaryAction.title}: ${primaryAction.risk.summary}`,
        },
        sourceQuestion: questionForActionSourceObject(questions, primaryAction.sourceObject) ?? sourceQuestion,
      };
    }

    return {
      risk: {
        level: "medium",
        summary: `${sourceQuestion.label}: ${sourceQuestion.answer}`,
      },
      sourceQuestion,
    };
  }

  if (unknown.length > 0) {
    return {
      risk: {
        level: "unknown",
        summary: `${unknown.length} governance question(s) still need local artifacts before risk can be fully assessed.`,
      },
      sourceQuestion,
    };
  }

  return {
    risk: {
      level: "low",
      summary: "No blocking or attention risk was found in the declared artifacts.",
    },
  };
}

function questionForActionSourceObject(
  questions: ConsoleGovernanceDashboardQuestion[],
  sourceObject: string,
): ConsoleGovernanceDashboardQuestion | undefined {
  const questionIdBySourceObject: Partial<Record<string, ConsoleGovernanceQuestionId>> = {
    waiver_lifecycle: "waiver_attention",
    spec_debt_ledger: "spec_debt_attention",
    source_evolution_governance: "source_evolution_progress",
    contract_drift: "contract_drift_review",
    implementation_mediation_outcomes: "execute_mediation_status",
    implementation_workspace: "handoff_replay_status",
    approval_workflow: "approval_workflow_status",
    audit_events: "audit_traceability",
    verify_trend: "mergeability",
    north_star_acceptance: "global_closure_acceptance",
    doctor_global_readiness: "doctor_global_readiness",
  };
  const questionId = questionIdBySourceObject[sourceObject];
  return questionId ? questions.find((question) => question.id === questionId) : undefined;
}

function buildHeadlineOwnerAction(
  questions: ConsoleGovernanceDashboardQuestion[],
  primaryAction: ConsoleGovernanceActionPacket | undefined,
): ConsoleGovernanceDashboardHeadline["ownerAction"] {
  if (primaryAction) {
    return {
      status: primaryAction.status,
      owner: primaryAction.owner,
      summary: primaryAction.reason,
      command: primaryAction.recommendedCommand,
      sourceArtifacts: primaryAction.sourceArtifacts,
    };
  }

  const question = questions.find((entry) => entry.status !== "ok" && entry.nextActions.length > 0)
    ?? questions.find((entry) => entry.nextActions.length > 0);

  if (question) {
    return {
      status: "needs_input",
      owner: ownerForQuestion(question.id),
      summary: question.nextActions[0] ?? "Review the governance question and produce the missing local artifact.",
      command: fallbackCommandForQuestion(question),
      sourceArtifacts: question.evidence,
    };
  }

  return {
    status: "not_available",
    owner: "repo owner",
    summary: "No owner action is suggested from the declared artifacts.",
    command: "none",
    sourceArtifacts: [],
  };
}

function buildHeadlineEvidence(
  mergeability: ConsoleGovernanceDashboardQuestion | undefined,
  riskQuestion: ConsoleGovernanceDashboardQuestion | undefined,
  ownerAction: ConsoleGovernanceDashboardHeadline["ownerAction"],
): ConsoleGovernanceDashboardHeadline["evidence"] {
  const sources = stableUnique([
    ...ownerAction.sourceArtifacts,
    ...(riskQuestion?.evidence ?? []),
    ...(mergeability?.evidence ?? []),
  ]);
  const primary = sources[0] ?? "declared JiSpec artifacts";
  return {
    primary,
    sources: sources.length > 0 ? sources : [primary],
  };
}

function ownerForQuestion(id: ConsoleGovernanceQuestionId): string {
  if (id === "waiver_attention") {
    return "waiver owner";
  }
  if (id === "source_evolution_progress") {
    return "source reviewer";
  }
  if (id === "spec_debt_attention") {
    return "spec debt owner";
  }
  if (id === "retakeover_pool_health") {
    return "discover owner";
  }
  if (id === "contract_drift_review") {
    return "release owner";
  }
  if (id === "execute_mediation_status") {
    return "implementation owner";
  }
  if (id === "handoff_replay_status") {
    return "implementation owner";
  }
  if (id === "approval_workflow_status") {
    return "policy owner";
  }
  if (id === "audit_traceability") {
    return "governance owner";
  }
  if (id === "global_closure_acceptance") {
    return "global closure owner";
  }
  if (id === "doctor_global_readiness") {
    return "global closure owner";
  }
  return "repo owner";
}

function buildDecisionDeck(
  snapshot: ConsoleLocalSnapshot,
  headline: ConsoleGovernanceDashboardHeadline,
  actionPlan: ConsoleGovernanceActionPlan,
): ConsoleGovernanceDecisionDeck {
  const takeoverQuality = governanceObject(snapshot, "takeover_quality_trend");
  const summary = takeoverQuality?.summary ?? {};
  const hasValueReport = summary.hasValueReport === true;
  const valueMetrics = {
    estimatedManualSortingMinutesSaved: numberValue(summary.estimatedManualSortingMinutesSaved) ?? "not_available_yet" as const,
    blockingIssuesCaught: numberValue(summary.blockingIssuesCaught) ?? "not_available_yet" as const,
    advisoryRisksSurfaced: numberValue(summary.advisoryRisksSurfaced) ?? "not_available_yet" as const,
    executeStopsNeedingReview: numberValue(summary.executeStopsNeedingReview) ?? "not_available_yet" as const,
  };
  return {
    mergeability: {
      status: headline.mergeability.status,
      answer: headline.mergeability.answer,
      evidence: headline.mergeability.evidence,
    },
    topRisk: headline.risk,
    owner: {
      name: headline.ownerAction.owner,
      actionStatus: headline.ownerAction.status,
      actionSummary: headline.ownerAction.summary,
    },
    nextCommand: headline.ownerAction.command,
    evidence: headline.evidence,
    valueReport: {
      status: hasValueReport ? "ok" : "unknown",
      answer: hasValueReport
        ? `Value report available: ${valueMetrics.estimatedManualSortingMinutesSaved} minute(s) saved, ${valueMetrics.blockingIssuesCaught} blocking issue(s) caught, ${valueMetrics.executeStopsNeedingReview} execute stop(s) needing review.`
        : "Value report is not available yet; run metrics value-report to materialize the local ROI view.",
      metrics: valueMetrics,
      sourceArtifacts: hasValueReport ? [".spec/metrics/value-report.json"] : ["Missing .spec/metrics/value-report.json"],
    },
    runbook: {
      status: actionPlan.runbook.status,
      summary: actionPlan.runbook.summary,
      topStep: actionPlan.runbook.topStep,
      stepCount: actionPlan.runbook.steps.length,
      valueReportImpact: actionPlan.runbook.valueReportImpact,
    },
  };
}

function fallbackCommandForQuestion(question: ConsoleGovernanceDashboardQuestion): string {
  if (question.id === "mergeability") {
    return "npm run ci:verify";
  }
  if (question.id === "source_evolution_progress") {
    return "npm run jispec-cli -- source review list --change <change-id>";
  }
  if (question.id === "contract_drift_review") {
    return "npm run jispec-cli -- release compare --from <ref> --to <ref>";
  }
  if (question.id === "retakeover_pool_health") {
    return "node --import tsx ./tools/jispec/tests/bootstrap-retakeover-regression.ts";
  }
  if (question.id === "execute_mediation_status") {
    return "npm run jispec-cli -- implement --from-handoff <path>";
  }
  if (question.id === "handoff_replay_status") {
    return "npm run jispec-cli -- handoff adapter --from-handoff <path-or-session> --tool codex";
  }
  if (question.id === "approval_workflow_status") {
    return "npm run jispec-cli -- policy approval record --subject-kind <kind> --actor <name> --role reviewer --reason <reason>";
  }
  if (question.id === "global_closure_acceptance") {
    return "npm run jispec-cli -- north-star acceptance --json";
  }
  if (question.id === "doctor_global_readiness") {
    return "npm run jispec-cli -- doctor global --out .spec/doctor/global-readiness.json --json";
  }
  return question.nextActions[0] ?? "not_available_yet";
}

function buildMergeabilityQuestion(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceDashboardQuestion {
  const verify = governanceObject(snapshot, "verify_trend");
  const summary = verify?.summary ?? {};
  const verdict = stringValue(summary.verdict);
  const blocking = numberValue(summary.blockingIssueCount);
  const advisory = numberValue(summary.advisoryIssueCount) ?? numberValue(summary.issueCount);

  if (!verify || summary.state === "not_available_yet" || verdict === "not_available_yet") {
    return question({
      id: "mergeability",
      label: "Can this repo merge right now?",
      status: "unknown",
      answer: "No current verify report is available, so Console cannot answer mergeability.",
      evidence: ["Missing .jispec-ci/verify-report.json"],
      nextActions: ["Run npm run ci:verify or npm run jispec-cli -- verify --json to refresh the local verify artifacts."],
    });
  }

  if (blocking !== undefined && blocking > 0) {
    return question({
      id: "mergeability",
      label: "Can this repo merge right now?",
      status: "blocked",
      answer: `No. Latest verify verdict is ${verdict} with ${blocking} blocking issue(s).`,
      evidence: [`Verify verdict from .jispec-ci/verify-report.json: ${verdict}`],
      nextActions: ["Fix blocking verify issues, then rerun npm run ci:verify."],
    });
  }

  if (verdict === "FAIL_BLOCKING") {
    return question({
      id: "mergeability",
      label: "Can this repo merge right now?",
      status: "blocked",
      answer: "No. Latest verify verdict is FAIL_BLOCKING.",
      evidence: ["Verify verdict from .jispec-ci/verify-report.json: FAIL_BLOCKING"],
      nextActions: ["Fix blocking verify issues, then rerun npm run ci:verify."],
    });
  }

  if (verdict === "WARN_ADVISORY" || (advisory !== undefined && advisory > 0)) {
    return question({
      id: "mergeability",
      label: "Can this repo merge right now?",
      status: "attention",
      answer: `Yes, with advisory governance debt. Latest verify verdict is ${verdict}.`,
      evidence: [`Verify report shows ${blocking ?? 0} blocking and ${advisory ?? "unknown"} advisory issue(s).`],
      nextActions: ["Review advisory issues, waivers, and spec debt before merging high-risk changes."],
    });
  }

  return question({
    id: "mergeability",
    label: "Can this repo merge right now?",
    status: "ok",
    answer: `Yes. Latest verify verdict is ${verdict}.`,
    evidence: [`Verify verdict from .jispec-ci/verify-report.json: ${verdict}`],
    nextActions: [],
  });
}

function buildWaiverQuestion(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceDashboardQuestion {
  const waiver = governanceObject(snapshot, "waiver_lifecycle");
  const summary = waiver?.summary ?? {};
  const waivers = getAllArtifactRecords(snapshot, "verify-waivers");
  const activeWaivers = waivers.filter((entry) => stringValue(entry.status) === "active");
  const expiringSoon = activeWaivers.filter((entry) => expiresWithinDays(stringValue(entry.expiresAt), 14));
  const expired = numberValue(summary.expired) ?? 0;
  const revoked = numberValue(summary.revoked) ?? 0;
  const unmatched = Array.isArray(summary.unmatchedActiveIds) ? summary.unmatchedActiveIds : [];
  const active = numberValue(summary.active) ?? 0;

  if (!waiver || summary.state === "not_available_yet") {
    return question({
      id: "waiver_attention",
      label: "Which waivers need attention?",
      status: "unknown",
      answer: "No waiver lifecycle artifact is available yet.",
      evidence: ["Missing .spec/waivers/*.json and/or latest verify report waiver metadata"],
      nextActions: ["Create waivers through npm run jispec-cli -- waiver create only when a reviewed exception is needed."],
    });
  }

  if (expired > 0 || expiringSoon.length > 0 || unmatched.length > 0) {
    return question({
      id: "waiver_attention",
      label: "Which waivers need attention?",
      status: expired > 0 ? "blocked" : "attention",
      answer: `${expired} expired, ${expiringSoon.length} expiring soon, ${unmatched.length} unmatched active waiver(s).`,
      evidence: [
        `Waiver lifecycle: active=${active}, revoked=${revoked}, expired=${expired}`,
        ...expiringSoon.map((entry) => `Expiring soon: ${stringValue(entry.id) ?? "unknown"} at ${stringValue(entry.expiresAt)}`),
        ...unmatched.map((id) => `Unmatched active waiver: ${String(id)}`),
      ],
      nextActions: ["Revoke stale waivers or renew them through an explicit audited CLI path."],
    });
  }

  return question({
    id: "waiver_attention",
    label: "Which waivers need attention?",
    status: "ok",
    answer: `${active} active waiver(s), with no expired, expiring-soon, or unmatched active waiver signal in the declared artifacts.`,
    evidence: [`Waiver lifecycle: active=${active}, revoked=${revoked}, expired=${expired}`],
    nextActions: [],
  });
}

function buildSourceEvolutionQuestion(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceDashboardQuestion {
  const sourceEvolution = governanceObject(snapshot, "source_evolution_governance");
  const summary = sourceEvolution?.summary ?? {};
  const activeChangeId = stringValue(summary.activeChangeId);
  const state = stringValue(summary.currentChangeState);
  const blockingOpen = numberValue(summary.blockingOpenReviewItems) ?? 0;
  const open = numberValue(summary.openReviewItems) ?? 0;
  const expiredDeferred = numberValue(summary.expiredDeferredItems) ?? 0;
  const expiredWaived = numberValue(summary.expiredWaivedItems) ?? 0;
  const lastAdopted = stringValue(summary.lastAdoptedSourceChange);
  const representative = stringValue(summary.activeRepresentativeItem);
  const canAdoptSource = summary.canAdoptSource === true;

  if (!sourceEvolution || summary.state === "not_available_yet") {
    return question({
      id: "source_evolution_progress",
      label: "Is source evolution blocking progress?",
      status: "unknown",
      answer: "No source evolution governance artifact is available yet.",
      evidence: ["Missing current baseline, lifecycle registry, or source evolution review artifacts"],
      nextActions: ["Run npm run jispec-cli -- source refresh after opening a change when requirements evolve."],
    });
  }

  if (!activeChangeId || activeChangeId === "not_available_yet") {
    return question({
      id: "source_evolution_progress",
      label: "Is source evolution blocking progress?",
      status: "ok",
      answer: `No open source evolution change is waiting for review. Last adopted change is ${lastAdopted ?? "not available"} .`,
      evidence: [
        `Lifecycle registry: ${stringValue(summary.lifecyclePath) ?? ".spec/requirements/lifecycle.yaml"}`,
        `Last adopted source change: ${lastAdopted ?? "not_available_yet"}`,
      ],
      nextActions: [],
    });
  }

  if (expiredDeferred > 0 || expiredWaived > 0) {
    return question({
      id: "source_evolution_progress",
      label: "Is source evolution blocking progress?",
      status: "blocked",
      answer: `Yes. Source evolution ${activeChangeId} has ${expiredDeferred + expiredWaived} expired defer/waive decision(s).`,
      evidence: [
        `Change ${activeChangeId}: expired deferred=${expiredDeferred}, expired waived=${expiredWaived}`,
        representative ? `Affected artifact: ${representative}` : "",
      ],
      nextActions: ["Refresh the expired source review decision, then rerun source adopt if the change is ready."],
    });
  }

  if (blockingOpen > 0) {
    return question({
      id: "source_evolution_progress",
      label: "Is source evolution blocking progress?",
      status: "blocked",
      answer: `Yes. Source evolution ${activeChangeId} still has ${blockingOpen} blocking review item(s) open.`,
      evidence: [
        `Open source review items: ${open}`,
        `Blocking open review items: ${blockingOpen}`,
        representative ? `Affected artifact: ${representative}` : "",
      ],
      nextActions: ["Run source review adopt, defer, or waive for the blocking item before treating the change as active truth."],
    });
  }

  if (open > 0 || state === "review_open") {
    return question({
      id: "source_evolution_progress",
      label: "Is source evolution blocking progress?",
      status: "attention",
      answer: `Source evolution ${activeChangeId} still has ${open} open review item(s).`,
      evidence: [
        `Review state: ${state ?? "review_open"}`,
        representative ? `Affected artifact: ${representative}` : "",
      ],
      nextActions: ["Finish the remaining source review decisions, then decide whether to promote the change with source adopt."],
    });
  }

  if (canAdoptSource) {
    return question({
      id: "source_evolution_progress",
      label: "Is source evolution blocking progress?",
      status: "attention",
      answer: `Source evolution ${activeChangeId} is fully reviewed and ready for source adopt.`,
      evidence: [
        `Source evolution path: ${stringValue(summary.sourceEvolutionPath) ?? "not_available_yet"}`,
        `Source review path: ${stringValue(summary.sourceReviewPath) ?? "not_available_yet"}`,
        representative ? `Affected artifact: ${representative}` : "",
      ],
      nextActions: ["Run npm run jispec-cli -- source adopt --change <change-id> once the reviewer is ready to promote the active truth."],
    });
  }

  if (state === "adopted") {
    return question({
      id: "source_evolution_progress",
      label: "Is source evolution blocking progress?",
      status: "ok",
      answer: `Source evolution ${activeChangeId} is already adopted into active truth.`,
      evidence: [
        `Review state: ${state}`,
        `Last adopted source change: ${lastAdopted ?? "not_available_yet"}`,
        representative ? `Affected artifact: ${representative}` : "",
      ],
      nextActions: [],
    });
  }

  return question({
    id: "source_evolution_progress",
    label: "Is source evolution blocking progress?",
    status: "ok",
    answer: `Source evolution ${activeChangeId} is reviewed with no blocking review posture detected.`,
    evidence: [
      `Review state: ${state ?? "reviewed"}`,
      representative ? `Affected artifact: ${representative}` : "",
    ],
    nextActions: [],
  });
}

function buildSpecDebtQuestion(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceDashboardQuestion {
  const specDebt = governanceObject(snapshot, "spec_debt_ledger");
  const ledger = getFirstArtifactRecord(snapshot, "greenfield-spec-debt-ledger");
  const debts = Array.isArray(ledger?.debts) ? ledger.debts.filter(isRecord) : [];
  const open = debts.filter((entry) => stringValue(entry.status) === "open");
  const expired = open.filter((entry) => isPastDate(stringValue(entry.expires_at)));
  const bootstrapDebt = numberValue(specDebt?.summary.bootstrapDebtRecords) ?? 0;

  if (!specDebt || specDebt.summary.state === "not_available_yet") {
    return question({
      id: "spec_debt_attention",
      label: "Which spec debt blocks takeover or release?",
      status: "unknown",
      answer: "No spec debt ledger or bootstrap debt records are available yet.",
      evidence: ["Missing .spec/spec-debt/ledger.yaml and .spec/spec-debt/<session-id>/*.json"],
      nextActions: ["Run takeover/adopt or Greenfield review workflows to produce explicit spec debt records."],
    });
  }

  if (expired.length > 0) {
    return question({
      id: "spec_debt_attention",
      label: "Which spec debt blocks takeover or release?",
      status: "blocked",
      answer: `${expired.length} open spec debt record(s) are expired and should block release governance.`,
      evidence: expired.map((entry) => `Expired debt: ${stringValue(entry.id) ?? "unknown"} owned by ${stringValue(entry.owner) ?? "unknown"}`),
      nextActions: ["Repay or cancel expired spec debt through an audited local CLI path."],
    });
  }

  if (open.length > 0 || bootstrapDebt > 0) {
    return question({
      id: "spec_debt_attention",
      label: "Which spec debt blocks takeover or release?",
      status: "attention",
      answer: `${open.length} open Greenfield debt record(s) and ${bootstrapDebt} bootstrap debt record(s) need owner review.`,
      evidence: [
        ...open.slice(0, 5).map((entry) => `Open debt: ${stringValue(entry.id) ?? "unknown"} owned by ${stringValue(entry.owner) ?? "unknown"}`),
        `Bootstrap takeover debt records: ${bootstrapDebt}`,
      ],
      nextActions: ["Assign owner review for open debt before enforcing the full contract set."],
    });
  }

  return question({
    id: "spec_debt_attention",
    label: "Which spec debt blocks takeover or release?",
    status: "ok",
    answer: "No open or expired spec debt was found in the declared artifacts.",
    evidence: ["Spec debt ledger is available and has no open debt records."],
    nextActions: [],
  });
}

function buildRetakeoverPoolQuestion(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceDashboardQuestion {
  const takeoverTrend = governanceObject(snapshot, "takeover_quality_trend");
  const summary = takeoverTrend?.summary ?? {};
  const hasPoolMetrics = summary.hasPoolMetrics === true;
  const fixtureCount = numberValue(summary.poolFixtureCount) ?? 0;
  const catalogCount = numberValue(summary.poolFixtureCatalogCount) ?? 0;
  const coverageRate = numberValue(summary.poolCoverageRate);
  const coveredClasses = numberValue(summary.poolCoveredFixtureClassCount);
  const knownClasses = numberValue(summary.poolKnownFixtureClassCount);
  const missingClasses = Array.isArray(summary.poolMissingFixtureClasses)
    ? summary.poolMissingFixtureClasses.map(String)
    : [];
  const readinessThreshold = numberValue(summary.poolReadinessThreshold);
  const readinessMisses = Array.isArray(summary.poolReadinessFixturesBelowThreshold)
    ? summary.poolReadinessFixturesBelowThreshold.map(String)
    : [];
  const precisionThreshold = numberValue(summary.poolContractPrecisionThreshold);
  const precisionMisses = Array.isArray(summary.poolContractPrecisionFixturesBelowThreshold)
    ? summary.poolContractPrecisionFixturesBelowThreshold.map(String)
    : [];
  const behaviorThreshold = numberValue(summary.poolBehaviorStrengthThreshold);
  const behaviorMisses = Array.isArray(summary.poolBehaviorFixturesBelowThreshold)
    ? summary.poolBehaviorFixturesBelowThreshold.map(String)
    : [];
  const verifyNonBlockingRate = numberValue(summary.poolVerifyNonBlockingRate);
  const ownerReviewFixtureRate = numberValue(summary.poolOwnerReviewFixtureRate);
  const realismLadderReady = summary.realismLadderReady;
  const realismCoveredClasses = numberValue(summary.realismLadderCoveredClassCount);
  const realismTargetClasses = numberValue(summary.realismLadderTargetClassCount);
  const realismBlockers = Array.isArray(summary.realismLadderBlockers)
    ? summary.realismLadderBlockers.map(String)
    : [];
  const realismMissingClasses = Array.isArray(summary.realismLadderMissingClasses)
    ? summary.realismLadderMissingClasses.map(String)
    : [];
  const baselineMissCount = readinessMisses.length + precisionMisses.length + behaviorMisses.length;

  if (!takeoverTrend || summary.state === "not_available_yet" || !hasPoolMetrics) {
    return question({
      id: "retakeover_pool_health",
      label: "Is the retakeover regression pool healthy?",
      status: "unknown",
      answer: "Retakeover pool metrics are not available yet.",
      evidence: ["Missing .spec/handoffs/retakeover-pool-metrics.json"],
      nextActions: [
        "Run node --import tsx ./tools/jispec/tests/bootstrap-retakeover-regression.ts to refresh pool metrics.",
      ],
    });
  }

  return question({
    id: "retakeover_pool_health",
    label: "Is the retakeover regression pool healthy?",
    status: realismBlockers.length > 0 || realismLadderReady === false ? "attention" : "ok",
    answer: `Pool metrics are available and non-blocking; coverage is ${formatPercent(coverageRate)}; realism ladder is ${realismLadderReady === true ? "ready" : "not ready"}.`,
    evidence: [
      `Fixture catalog: ${catalogCount} entry(ies); pooled fixtures: ${fixtureCount}`,
      `Class coverage: ${coveredClasses ?? "unknown"}/${knownClasses ?? "unknown"}`,
      ...(realismCoveredClasses !== undefined || realismTargetClasses !== undefined
        ? [`Realism ladder: ${realismCoveredClasses ?? "unknown"}/${realismTargetClasses ?? "unknown"} class(es)`]
        : []),
      ...(readinessThreshold !== undefined ? [`Readiness floor: ${readinessThreshold}/100`] : []),
      ...(precisionThreshold !== undefined ? [`Contract precision floor: ${formatPercent(precisionThreshold)}`] : []),
      ...(behaviorThreshold !== undefined ? [`Behavior strength floor: ${formatPercent(behaviorThreshold)}`] : []),
      ...(verifyNonBlockingRate !== undefined ? [`Verify non-blocking rate: ${formatPercent(verifyNonBlockingRate)}`] : []),
      ...(ownerReviewFixtureRate !== undefined ? [`Owner-review fixture rate: ${formatPercent(ownerReviewFixtureRate)}`] : []),
      ...(missingClasses.length > 0 ? [`Missing fixture classes: ${missingClasses.join(", ")}`] : []),
      ...(readinessMisses.length > 0 ? [`Readiness misses: ${readinessMisses.join(", ")}`] : []),
      ...(precisionMisses.length > 0 ? [`Contract precision misses: ${precisionMisses.join(", ")}`] : []),
      ...(behaviorMisses.length > 0 ? [`Behavior strength misses: ${behaviorMisses.join(", ")}`] : []),
      ...(realismMissingClasses.length > 0 ? [`Missing realism classes: ${realismMissingClasses.join(", ")}`] : []),
      ...(realismBlockers.length > 0 ? [`Realism budget blockers: ${realismBlockers.join(", ")}`] : []),
    ],
    nextActions: realismBlockers.length > 0
      ? ["Run node --import tsx ./tools/jispec/tests/retakeover-realism-ladder.ts and reduce correction budget misses."]
      : [],
  });
}

function buildContractDriftQuestion(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceDashboardQuestion {
  const drift = governanceObject(snapshot, "contract_drift");
  const summary = drift?.summary ?? {};
  const driftSummary = isRecord(summary.driftSummary) ? summary.driftSummary : undefined;
  const overall = stringValue(driftSummary?.overallStatus ?? driftSummary?.overall_status);
  const latestReport = stringValue(summary.latestReport);
  const trendCompareCount = numberValue(summary.trendCompareCount);
  const trendChangedCompareCount = numberValue(summary.trendChangedCompareCount);
  const approvalWorkflow = governanceObject(snapshot, "approval_workflow");
  const approvalSummary = approvalWorkflow?.summary ?? {};
  const approvalSubjects = Array.isArray(approvalSummary.subjects)
    ? approvalSummary.subjects.filter(isRecord)
    : [];
  const releaseDriftApproval = approvalSubjects.find((subject) =>
    stringValue(subject.kind) === "release_drift"
    && stringValue(subject.ref) === latestReport
  );
  const releaseDriftApprovalStatus = stringValue(releaseDriftApproval?.status);

  if (!drift || summary.state === "not_available_yet") {
    return question({
      id: "contract_drift_review",
      label: "Which contract drift needs owner review?",
      status: "unknown",
      answer: "No release compare report is available yet.",
      evidence: ["Missing .spec/releases/compare/<from>-to-<to>/compare-report.json"],
      nextActions: ["Run npm run jispec-cli -- release compare --from <ref> --to <ref> before release governance."],
    });
  }

  if (overall === "changed") {
    if (releaseDriftApprovalStatus === "approval_satisfied") {
      return question({
        id: "contract_drift_review",
        label: "Which contract drift needs owner review?",
        status: "ok",
        answer: "Latest release compare reports changed drift, and the current release-drift approval is satisfied.",
        evidence: [
          `Latest compare report: ${latestReport ?? "unknown"}`,
          `Drift status: ${overall}`,
          `Trend: ${trendChangedCompareCount ?? "unknown"} changed of ${trendCompareCount ?? "unknown"} comparison(s)`,
          `Approval status: ${releaseDriftApprovalStatus}`,
        ],
        nextActions: [],
      });
    }

    return question({
      id: "contract_drift_review",
      label: "Which contract drift needs owner review?",
      status: "blocked",
      answer: "Latest release compare reports changed contract, behavior, static collector, or policy drift.",
      evidence: [
        `Latest compare report: ${latestReport ?? "unknown"}`,
        `Drift status: ${overall}`,
        `Trend: ${trendChangedCompareCount ?? "unknown"} changed of ${trendCompareCount ?? "unknown"} comparison(s)`,
      ],
      nextActions: ["Route the compare report to the contract owner before release."],
    });
  }

  return question({
    id: "contract_drift_review",
    label: "Which contract drift needs owner review?",
    status: "ok",
    answer: `Latest release drift status is ${overall ?? "not declared"}.`,
    evidence: [
      `Latest compare report: ${latestReport ?? "unknown"}`,
      `Trend comparisons: ${trendCompareCount ?? "not available"}`,
    ],
    nextActions: [],
  });
}

function buildImplementationQuestion(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceDashboardQuestion {
  const implementation = governanceObject(snapshot, "implementation_mediation_outcomes");
  const summary = implementation?.summary ?? {};
  const latestOutcome = stringValue(summary.latestOutcome);
  const latestStopPoint = stringValue(summary.latestStopPoint);
  const latestPatchReviewCompanionPath = stringValue(summary.latestPatchReviewCompanionPath);
  const latestPatchReviewCompanionSummary = stringValue(summary.latestPatchReviewCompanionSummary);
  const replayable = summary.latestReplayable === true;
  const handoffCount = numberValue(summary.handoffCount) ?? 0;
  const latestObservedAt = stringValue(summary.latestObservedAt);
  const latestAgeHours = ageInHours(latestObservedAt);
  const isHistorical = latestAgeHours !== undefined && latestAgeHours > 72;

  if (!implementation || summary.state === "not_available_yet") {
    return question({
      id: "execute_mediation_status",
      label: "Where did execute mediation last stop?",
      status: "unknown",
      answer: "No implementation handoff or patch mediation artifact is available yet.",
      evidence: ["Missing .jispec/handoff/*.json and .jispec/implement/<session-id>/patch-mediation.json"],
      nextActions: ["Run npm run jispec-cli -- implement after opening an execute-mode change session."],
    });
  }

  if (latestOutcome && !["preflight_passed", "ready_to_merge", "not_available_yet"].includes(latestOutcome)) {
    if (isHistorical) {
      return question({
        id: "execute_mediation_status",
        label: "Where did execute mediation last stop?",
        status: "ok",
        answer: `Latest execute mediation is historical (${formatAge(latestAgeHours)} old) at ${latestStopPoint ?? "unknown"} with outcome ${latestOutcome}.`,
        evidence: [
          `Handoff packets: ${handoffCount}`,
          `Replayable: ${replayable ? "yes" : "no"}`,
          ...(latestPatchReviewCompanionPath && latestPatchReviewCompanionPath !== "not_available_yet" ? [`Patch review companion: ${latestPatchReviewCompanionPath}`] : []),
          ...(latestPatchReviewCompanionSummary && latestPatchReviewCompanionSummary !== "not_available_yet" ? [`Companion summary: ${latestPatchReviewCompanionSummary}`] : []),
          `Latest packet age: ${formatAge(latestAgeHours)}`,
        ],
        nextActions: [],
      });
    }

    return question({
      id: "execute_mediation_status",
      label: "Where did execute mediation last stop?",
      status: "attention",
      answer: `Latest execute mediation stopped at ${latestStopPoint ?? "unknown"} with outcome ${latestOutcome}.`,
      evidence: [
        `Handoff packets: ${handoffCount}`,
        `Replayable: ${replayable ? "yes" : "no"}`,
        ...(latestPatchReviewCompanionPath && latestPatchReviewCompanionPath !== "not_available_yet" ? [`Patch review companion: ${latestPatchReviewCompanionPath}`] : []),
        ...(latestPatchReviewCompanionSummary && latestPatchReviewCompanionSummary !== "not_available_yet" ? [`Companion summary: ${latestPatchReviewCompanionSummary}`] : []),
        ...(latestAgeHours !== undefined ? [`Latest packet age: ${formatAge(latestAgeHours)}`] : []),
      ],
      nextActions: [replayable ? "Resume with npm run jispec-cli -- implement --from-handoff <path>." : "Open the latest handoff packet and follow its next action."],
    });
  }

  return question({
    id: "execute_mediation_status",
    label: "Where did execute mediation last stop?",
    status: "ok",
    answer: latestOutcome
      ? `Latest execute mediation outcome is ${latestOutcome} with no attention state detected.`
      : "No attention state is detected for execute mediation.",
    evidence: [
      `Handoff packets: ${handoffCount}`,
      ...(latestPatchReviewCompanionPath && latestPatchReviewCompanionPath !== "not_available_yet" ? [`Patch review companion: ${latestPatchReviewCompanionPath}`] : []),
      ...(latestPatchReviewCompanionSummary && latestPatchReviewCompanionSummary !== "not_available_yet" ? [`Companion summary: ${latestPatchReviewCompanionSummary}`] : []),
      ...(latestAgeHours !== undefined ? [`Latest packet age: ${formatAge(latestAgeHours)}`] : []),
    ],
    nextActions: [],
  });
}

function buildHandoffReplayQuestion(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceDashboardQuestion {
  const workspace = governanceObject(snapshot, "implementation_workspace");
  const summary = workspace?.summary ?? {};
  const state = stringValue(summary.state);
  const chainStatus = stringValue(summary.chainStatus);
  const activeSessionId = stringValue(summary.activeSessionId);
  const activeSessionPath = stringValue(summary.activeSessionPath);
  const activeSummary = stringValue(summary.activeSessionSummary);
  const activeMode = stringValue(summary.activeSessionMode);
  const activeLane = stringValue(summary.activeSessionLane);
  const activeChangedPathCount = numberValue(summary.activeChangedPathCount);
  const activeChangedPaths = Array.isArray(summary.activeChangedPaths)
    ? summary.activeChangedPaths.filter(isString).slice(0, 5)
    : [];
  const activeNextCommands = Array.isArray(summary.activeNextCommands)
    ? summary.activeNextCommands.filter(isString)
    : [];
  const latestHandoffPath = stringValue(summary.latestHandoffPath);
  const latestHandoffSessionId = stringValue(summary.latestHandoffSessionId);
  const latestHandoffOutcome = stringValue(summary.latestHandoffOutcome);
  const latestHandoffStopPoint = stringValue(summary.latestHandoffStopPoint);
  const latestHandoffReplayable = summary.latestHandoffReplayable === true;
  const latestHandoffRestoreCommand = stringValue(summary.latestHandoffRestoreCommand);
  const latestHandoffRetryCommand = stringValue(summary.latestHandoffRetryCommand);
  const latestHandoffAdapterCommand = stringValue(summary.latestHandoffAdapterCommand);
  const latestExternalToolHandoffRequired = summary.latestExternalToolHandoffRequired === true;
  const latestExternalToolRequest = stringValue(summary.latestExternalToolHandoffRequest);
  const latestExternalToolAllowedPaths = Array.isArray(summary.latestExternalToolHandoffAllowedPaths)
    ? summary.latestExternalToolHandoffAllowedPaths.filter(isString)
    : [];
  const latestExternalToolAttentionFiles = Array.isArray(summary.latestExternalToolHandoffFilesNeedingAttention)
    ? summary.latestExternalToolHandoffFilesNeedingAttention.filter(isString)
    : [];
  const latestPatchPath = stringValue(summary.latestPatchPath);
  const latestPatchStatus = stringValue(summary.latestPatchStatus);
  const latestPatchApplied = summary.latestPatchApplied === true;
  const latestPatchExternalPath = stringValue(summary.latestPatchExternalPatchPath);
  const latestPatchRetryCommand = stringValue(summary.latestPatchRetryCommand);
  const latestPatchReviewCompanionPath = stringValue(summary.latestPatchReviewCompanionPath);
  const latestPatchReviewCompanionSummary = stringValue(summary.latestPatchReviewCompanionSummary);
  const chainReady = summary.chainReady === true;

  if (!workspace || state === "not_available_yet") {
    return question({
      id: "handoff_replay_status",
      label: "How do I hand off or replay this change?",
      status: "unknown",
      answer: "No active change session is available yet, so the handoff/replay chain cannot be assembled.",
      evidence: ["Missing .jispec/change-session.json"],
      nextActions: [
        "Open a change session first, then run npm run jispec-cli -- implement to materialize a replayable handoff packet.",
      ],
    });
  }

  if (latestPatchStatus === "apply_failed" || latestPatchStatus === "rejected_out_of_scope") {
    return question({
      id: "handoff_replay_status",
      label: "How do I hand off or replay this change?",
      status: "attention",
      answer: `The current workspace needs a patch refresh: latest patch status is ${latestPatchStatus}.`,
      evidence: [
        `Active session: ${activeSessionPath ?? ".jispec/change-session.json"}`,
        `Handoff packet: ${latestHandoffPath ?? "not_available_yet"}`,
        `Patch mediation: ${latestPatchPath ?? "not_available_yet"}`,
        ...(latestPatchReviewCompanionPath && latestPatchReviewCompanionPath !== "not_available_yet" ? [`Patch review companion: ${latestPatchReviewCompanionPath}`] : []),
        `Latest patch: ${latestPatchExternalPath ?? "not_available_yet"}`,
      ],
      nextActions: [
        latestHandoffRetryCommand ?? "npm run jispec-cli -- implement --from-handoff <path> --external-patch <path>",
        latestHandoffRestoreCommand ?? "npm run jispec-cli -- implement --from-handoff <path>",
      ],
    });
  }

  if (latestExternalToolHandoffRequired || !latestHandoffReplayable) {
    return question({
      id: "handoff_replay_status",
      label: "How do I hand off or replay this change?",
      status: "attention",
      answer: latestExternalToolHandoffRequired
        ? `Active session ${activeSessionId ?? "unknown"} is ready for an external tool handoff, and the replay chain should return through JiSpec mediation.`
        : `Active session ${activeSessionId ?? "unknown"} has a workspace record, but the latest handoff is not yet replayable.`,
      evidence: [
        `Active session: ${activeSessionId ?? "not_available_yet"}`,
        `Latest handoff: ${latestHandoffSessionId ?? "not_available_yet"} (${latestHandoffOutcome ?? "not_available_yet"} at ${latestHandoffStopPoint ?? "unknown"})`,
        `Replayable: ${latestHandoffReplayable ? "yes" : "no"}`,
        ...(latestPatchReviewCompanionPath && latestPatchReviewCompanionPath !== "not_available_yet" ? [`Patch review companion: ${latestPatchReviewCompanionPath}`] : []),
        ...(latestPatchReviewCompanionSummary && latestPatchReviewCompanionSummary !== "not_available_yet" ? [`Companion summary: ${latestPatchReviewCompanionSummary}`] : []),
        ...(latestExternalToolHandoffRequired ? [`External tool request: ${latestExternalToolRequest ?? "not_available_yet"}`] : []),
        ...(latestExternalToolAllowedPaths.length > 0 ? [`Allowed paths: ${latestExternalToolAllowedPaths.slice(0, 5).join(", ")}`] : []),
      ],
      nextActions: [
        latestHandoffAdapterCommand ?? "npm run jispec-cli -- handoff adapter --from-handoff <path-or-session> --tool codex",
        latestHandoffRestoreCommand ?? "npm run jispec-cli -- implement --from-handoff <path>",
        latestHandoffRetryCommand ?? "npm run jispec-cli -- implement --from-handoff <path> --external-patch <path>",
      ],
    });
  }

  return question({
    id: "handoff_replay_status",
    label: "How do I hand off or replay this change?",
    status: chainReady ? "ok" : "attention",
    answer: chainReady
      ? `The current workspace is replayable: active session ${activeSessionId ?? "unknown"} is wired to a replayable handoff chain.`
      : `Active session ${activeSessionId ?? "unknown"} is available, but the replay chain still needs attention.`,
    evidence: [
      `Active session: ${activeSessionId ?? "not_available_yet"}`,
      `Session mode: ${activeMode ?? "not_available_yet"}`,
      `Session summary: ${activeSummary ?? "not_available_yet"}`,
      `Lane: ${activeLane ?? "not_available_yet"}${summary.activeSessionAutoPromoted === true ? " (auto-promoted)" : ""}`,
      `Changed paths: ${activeChangedPathCount ?? 0}`,
      ...activeChangedPaths.slice(0, 3).map((item) => `Changed path: ${item}`),
      `Latest handoff: ${latestHandoffPath ?? "not_available_yet"}`,
      `Patch status: ${latestPatchStatus ?? "not_available_yet"}${latestPatchApplied ? " (applied)" : ""}`,
      ...(latestPatchReviewCompanionPath && latestPatchReviewCompanionPath !== "not_available_yet" ? [`Patch review companion: ${latestPatchReviewCompanionPath}`] : []),
      ...(latestPatchReviewCompanionSummary && latestPatchReviewCompanionSummary !== "not_available_yet" ? [`Companion summary: ${latestPatchReviewCompanionSummary}`] : []),
    ],
    nextActions: [
      latestHandoffAdapterCommand ?? "npm run jispec-cli -- handoff adapter --from-handoff <path-or-session> --tool codex",
      latestHandoffRestoreCommand ?? "npm run jispec-cli -- implement --from-handoff <path>",
      latestHandoffRetryCommand ?? "npm run jispec-cli -- implement --from-handoff <path> --external-patch <path>",
    ].concat(
      activeNextCommands.slice(0, 2),
    ),
  });
}

function buildApprovalQuestion(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceDashboardQuestion {
  const approval = governanceObject(snapshot, "approval_workflow");
  const summary = approval?.summary ?? {};
  const status = stringValue(summary.status);
  const subjects = Array.isArray(summary.subjects) ? summary.subjects.filter(isRecord) : [];
  const missing = numberValue(summary.missing) ?? 0;
  const stale = numberValue(summary.stale) ?? 0;
  const satisfied = numberValue(summary.satisfied) ?? 0;
  const totalSubjects = numberValue(summary.totalSubjects) ?? 0;

  if (!approval || summary.state === "not_available_yet") {
    return question({
      id: "approval_workflow_status",
      label: "Are policy approvals satisfied?",
      status: "unknown",
      answer: "No policy approval workflow artifact or policy subject is available yet.",
      evidence: ["Missing .spec/policy.yaml and/or .spec/approvals/*.json"],
      nextActions: ["Run npm run jispec-cli -- policy migrate, then record approvals through policy approval record when governance changes need review."],
    });
  }

  if (summary.state === "invalid") {
    return question({
      id: "approval_workflow_status",
      label: "Are policy approvals satisfied?",
      status: "attention",
      answer: `Approval workflow could not be evaluated: ${stringValue(summary.error) ?? "invalid approval artifacts"}.`,
      evidence: ["Approval workflow is based only on local structured artifacts."],
      nextActions: ["Review .spec/approvals/*.json and .spec/policy.yaml before relying on approval posture."],
    });
  }

  if (status === "approval_stale" || stale > 0) {
    return question({
      id: "approval_workflow_status",
      label: "Are policy approvals satisfied?",
      status: "attention",
      answer: `${stale} approval subject(s) have stale approvals; ${missing} subject(s) are still missing approval.`,
      evidence: [
        `Approval profile: ${String(summary.profile ?? "not_declared")}`,
        `Subjects: ${totalSubjects}, satisfied=${satisfied}, stale=${stale}, missing=${missing}`,
        ...subjects
          .filter((subject) => subject.status === "approval_stale")
          .slice(0, 3)
          .map((subject) => `Stale approval: ${String(subject.kind)} ${String(subject.ref)}`),
      ],
      nextActions: ["Record a fresh local approval after reviewing the current policy, waiver, release drift, or execute-default subject."],
    });
  }

  if (status === "approval_missing" || missing > 0) {
    return question({
      id: "approval_workflow_status",
      label: "Are policy approvals satisfied?",
      status: "attention",
      answer: `${missing} approval subject(s) are missing reviewer quorum or owner approval.`,
      evidence: [
        `Approval profile: ${String(summary.profile ?? "not_declared")}`,
        `Requirement: ${String(summary.requiredReviewers ?? "unknown")} reviewer(s) or owner approval`,
        ...subjects
          .filter((subject) => subject.status === "approval_missing")
          .slice(0, 3)
          .map((subject) => `Missing approval: ${String(subject.kind)} ${String(subject.ref)}`),
      ],
      nextActions: ["Run npm run jispec-cli -- policy approval record --subject-kind <kind> --actor <name> --role reviewer --reason <reason>."],
    });
  }

  return question({
    id: "approval_workflow_status",
    label: "Are policy approvals satisfied?",
    status: "ok",
    answer: `Approval workflow is satisfied for ${satisfied} subject(s).`,
    evidence: [
      `Approval profile: ${String(summary.profile ?? "not_declared")}`,
      `Current approvals: ${String(summary.currentApprovals ?? 0)}`,
    ],
    nextActions: [],
  });
}

function buildAuditQuestion(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceDashboardQuestion {
  const audit = governanceObject(snapshot, "audit_events");
  const summary = audit?.summary ?? {};
  const latestActor = stringValue(summary.latestActor);
  const latestType = stringValue(summary.latestEventType);
  const latestTimestamp = stringValue(summary.latestTimestamp);
  const latestReason = stringValue(summary.latestReason);
  const eventCount = numberValue(summary.eventCount) ?? 0;
  const integrityStatus = stringValue(summary.integrityStatus);
  const integrityIssueCount = numberValue(summary.integrityIssueCount) ?? 0;
  const integrityIssues = Array.isArray(summary.integrityIssues) ? summary.integrityIssues : [];

  if (!audit || summary.state === "not_available_yet") {
    return question({
      id: "audit_traceability",
      label: "Who approved the latest exception or boundary change?",
      status: "unknown",
      answer: "No audit event ledger is available yet.",
      evidence: ["Missing .spec/audit/events.jsonl"],
      nextActions: ["Use governance commands that write audit events before relying on Console traceability."],
    });
  }

  if (integrityStatus === "warning" || integrityStatus === "invalid") {
    return question({
      id: "audit_traceability",
      label: "Who approved the latest exception or boundary change?",
      status: "attention",
      answer: `Audit ledger integrity is ${integrityStatus}; review the ledger before relying on traceability.`,
      evidence: [
        `Audit events: ${eventCount}`,
        `Integrity issues: ${integrityIssueCount}`,
        ...integrityIssues.slice(0, 3).map((issue) => isRecord(issue)
          ? `Line ${String(issue.line ?? "unknown")}: ${String(issue.code ?? "unknown")}`
          : String(issue)),
      ],
      nextActions: ["Review .spec/audit/events.jsonl and append new governance actions only after the integrity warning is understood."],
    });
  }

  return question({
    id: "audit_traceability",
    label: "Who approved the latest exception or boundary change?",
    status: "ok",
    answer: `${latestActor ?? "unknown"} recorded ${latestType ?? "unknown"} at ${latestTimestamp ?? "unknown"}.`,
    evidence: [
      `Audit events: ${eventCount}`,
      `Integrity: ${integrityStatus ?? "not_available_yet"}`,
      `Latest reason: ${latestReason ?? "not declared"}`,
      `Latest source artifact: ${stringValue(summary.latestSourceArtifact) ?? "not declared"}`,
    ],
    nextActions: [],
  });
}

function buildGlobalClosureAcceptanceQuestion(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceDashboardQuestion {
  const acceptance = governanceObject(snapshot, "north_star_acceptance");
  const summary = acceptance?.summary ?? {};
  const ready = summary.ready === true;
  const scenarioCount = numberValue(summary.scenarioCount);
  const passedScenarioCount = numberValue(summary.passedScenarioCount);
  const blockingScenarioCount = numberValue(summary.blockingScenarioCount);

  if (!acceptance || summary.state === "not_available_yet") {
    return question({
      id: "global_closure_acceptance",
      label: "Is the terminal North Star acceptance ready?",
      status: "unknown",
      answer: "The terminal North Star acceptance package is not available yet.",
      evidence: ["Missing .spec/north-star/acceptance.json"],
      nextActions: ["Run npm run jispec-cli -- north-star acceptance --json to materialize the final local acceptance package."],
    });
  }

  if (!ready || (blockingScenarioCount ?? 0) > 0) {
    return question({
      id: "global_closure_acceptance",
      label: "Is the terminal North Star acceptance ready?",
      status: "blocked",
      answer: `No. ${blockingScenarioCount ?? "unknown"} blocking scenario(s) remain in the terminal acceptance package.`,
      evidence: [
        `North Star acceptance: ${passedScenarioCount ?? "not_available_yet"}/${scenarioCount ?? "not_available_yet"} scenarios passed`,
        `Blocking scenarios: ${blockingScenarioCount ?? "not_available_yet"}`,
      ],
      nextActions: [
        "Review .spec/north-star/acceptance.md and the scenario decision packets, then rerun npm run jispec-cli -- north-star acceptance --json.",
      ],
    });
  }

  return question({
    id: "global_closure_acceptance",
    label: "Is the terminal North Star acceptance ready?",
    status: "ok",
    answer: `Yes. The terminal acceptance package is ready with ${passedScenarioCount ?? "not_available_yet"}/${scenarioCount ?? "not_available_yet"} scenarios passed.`,
    evidence: [
      ".spec/north-star/acceptance.json",
      `Blocking scenarios: ${blockingScenarioCount ?? 0}`,
    ],
    nextActions: [],
  });
}

function buildDoctorGlobalReadinessQuestion(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceDashboardQuestion {
  const readiness = governanceObject(snapshot, "doctor_global_readiness");
  const summary = readiness?.summary ?? {};
  const ready = summary.ready === true;
  const blockerCount = numberValue(summary.blockerCount);
  const totalChecks = numberValue(summary.totalChecks);
  const passedChecks = numberValue(summary.passedChecks);
  const profile = stringValue(summary.profile);

  if (!readiness || summary.state === "not_available_yet") {
    return question({
      id: "doctor_global_readiness",
      label: "Is broader closure-loop readiness written down?",
      status: "unknown",
      answer: "The reusable doctor global readiness report is not available yet.",
      evidence: ["Missing .spec/doctor/global-readiness.json"],
      nextActions: ["Run npm run jispec-cli -- doctor global --out .spec/doctor/global-readiness.json --json to materialize the broader closure readiness report."],
    });
  }

  if (!ready || (blockerCount ?? 0) > 0) {
    return question({
      id: "doctor_global_readiness",
      label: "Is broader closure-loop readiness written down?",
      status: "blocked",
      answer: `No. Doctor global profile ${profile ?? "not_available_yet"} still reports ${blockerCount ?? "unknown"} blocker(s).`,
      evidence: [
        `.spec/doctor/global-readiness.json`,
        `Checks passed: ${passedChecks ?? "not_available_yet"}/${totalChecks ?? "not_available_yet"}`,
        `Blocking checks: ${blockerCount ?? "not_available_yet"}`,
      ],
      nextActions: ["Fix the broader closure blockers, then rerun npm run jispec-cli -- doctor global --out .spec/doctor/global-readiness.json --json."],
    });
  }

  return question({
    id: "doctor_global_readiness",
    label: "Is broader closure-loop readiness written down?",
    status: "ok",
    answer: `Yes. Doctor global profile ${profile ?? "not_available_yet"} is ready with ${passedChecks ?? "not_available_yet"}/${totalChecks ?? "not_available_yet"} checks passed.`,
    evidence: [
      ".spec/doctor/global-readiness.json",
      `Blocking checks: ${blockerCount ?? 0}`,
    ],
    nextActions: [],
  });
}

function question(input: ConsoleGovernanceDashboardQuestion): ConsoleGovernanceDashboardQuestion {
  return {
    ...input,
    evidence: input.evidence.filter(Boolean),
    nextActions: input.nextActions.filter(Boolean),
  };
}

function governanceObject(snapshot: ConsoleLocalSnapshot, id: string): ConsoleGovernanceObjectSnapshot | undefined {
  return snapshot.governance.objects.find((object) => object.id === id);
}

function getFirstArtifactRecord(snapshot: ConsoleLocalSnapshot, id: string): Record<string, unknown> | undefined {
  return getAllArtifactRecords(snapshot, id)[0];
}

function getAllArtifactRecords(snapshot: ConsoleLocalSnapshot, id: string): Record<string, unknown>[] {
  const artifact = snapshot.artifacts.find((entry) => entry.id === id);
  return artifact?.instances
    .filter((instance) => instance.status === "available")
    .flatMap((instance) => Array.isArray(instance.data) ? instance.data : [instance.data])
    .filter(isRecord) ?? [];
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

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function ageInHours(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return Math.max(0, (Date.now() - parsed) / (60 * 60 * 1000));
}

function formatAge(hours: number | undefined): string {
  if (hours === undefined) {
    return "unknown age";
  }
  if (hours >= 48) {
    return `${Math.round(hours / 24)} day(s)`;
  }
  return `${Math.max(1, Math.round(hours))} hour(s)`;
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "unknown" : `${Math.round(value * 100)}%`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
