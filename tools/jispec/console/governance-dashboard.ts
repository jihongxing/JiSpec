import path from "node:path";
import {
  buildConsoleGovernanceActionPlanFromSnapshot,
  selectPrimaryConsoleGovernanceAction,
  type ConsoleGovernanceActionPacket,
  type ConsoleGovernanceActionPlan,
  type ConsoleGovernanceActionStatus,
  type ConsoleGovernanceRiskLevel,
} from "./governance-actions";
import {
  collectConsoleLocalSnapshot,
  type ConsoleGovernanceObjectSnapshot,
  type ConsoleLocalSnapshot,
} from "./read-model-snapshot";

export type ConsoleGovernanceQuestionId =
  | "mergeability"
  | "waiver_attention"
  | "spec_debt_attention"
  | "contract_drift_review"
  | "execute_mediation_status"
  | "approval_workflow_status"
  | "audit_traceability";

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
    buildWaiverQuestion(snapshot),
    buildSpecDebtQuestion(snapshot),
    buildContractDriftQuestion(snapshot),
    buildImplementationQuestion(snapshot),
    buildApprovalQuestion(snapshot),
    buildAuditQuestion(snapshot),
  ];
  const headline = buildHeadline(questions, actionPlan);

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
    `Mergeability: ${dashboard.headline.mergeability.answer}`,
    `Risk: ${dashboard.headline.risk.level} - ${dashboard.headline.risk.summary}`,
    `Owner action: ${dashboard.headline.ownerAction.owner} - ${dashboard.headline.ownerAction.summary}`,
    `Recommended command: ${dashboard.headline.ownerAction.command}`,
    `Evidence source: ${dashboard.headline.source}`,
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
      summary: `${blocked.length} governance question(s) are blocked; start with mergeability and release drift.`,
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
    contract_drift: "contract_drift_review",
    implementation_mediation_outcomes: "execute_mediation_status",
    approval_workflow: "approval_workflow_status",
    audit_events: "audit_traceability",
    verify_trend: "mergeability",
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
  if (id === "spec_debt_attention") {
    return "spec debt owner";
  }
  if (id === "contract_drift_review") {
    return "release owner";
  }
  if (id === "execute_mediation_status") {
    return "implementation owner";
  }
  if (id === "approval_workflow_status") {
    return "policy owner";
  }
  if (id === "audit_traceability") {
    return "governance owner";
  }
  return "repo owner";
}

function fallbackCommandForQuestion(question: ConsoleGovernanceDashboardQuestion): string {
  if (question.id === "mergeability") {
    return "npm run ci:verify";
  }
  if (question.id === "contract_drift_review") {
    return "npm run jispec-cli -- release compare --from <ref> --to <ref>";
  }
  if (question.id === "execute_mediation_status") {
    return "npm run jispec-cli -- implement --from-handoff <path>";
  }
  if (question.id === "approval_workflow_status") {
    return "npm run jispec-cli -- policy approval record --subject-kind <kind> --actor <name> --role reviewer --reason <reason>";
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
  const expiringSoon = waivers.filter((entry) => expiresWithinDays(stringValue(entry.expiresAt), 14));
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

function buildContractDriftQuestion(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceDashboardQuestion {
  const drift = governanceObject(snapshot, "contract_drift");
  const summary = drift?.summary ?? {};
  const driftSummary = isRecord(summary.driftSummary) ? summary.driftSummary : undefined;
  const overall = stringValue(driftSummary?.overallStatus ?? driftSummary?.overall_status);
  const latestReport = stringValue(summary.latestReport);
  const trendCompareCount = numberValue(summary.trendCompareCount);
  const trendChangedCompareCount = numberValue(summary.trendChangedCompareCount);

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
  const replayable = summary.latestReplayable === true;
  const handoffCount = numberValue(summary.handoffCount) ?? 0;

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
    return question({
      id: "execute_mediation_status",
      label: "Where did execute mediation last stop?",
      status: "attention",
      answer: `Latest execute mediation stopped at ${latestStopPoint ?? "unknown"} with outcome ${latestOutcome}.`,
      evidence: [`Handoff packets: ${handoffCount}`, `Replayable: ${replayable ? "yes" : "no"}`],
      nextActions: [replayable ? "Resume with npm run jispec-cli -- implement --from-handoff <path>." : "Open the latest handoff packet and follow its next action."],
    });
  }

  return question({
    id: "execute_mediation_status",
    label: "Where did execute mediation last stop?",
    status: "ok",
    answer: `Latest execute mediation outcome is ${latestOutcome ?? "available"} with no attention state detected.`,
    evidence: [`Handoff packets: ${handoffCount}`],
    nextActions: [],
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
