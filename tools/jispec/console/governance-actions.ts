import path from "node:path";
import { collectConsoleLocalSnapshot, type ConsoleLocalSnapshot } from "./read-model-snapshot";
import { renderHumanDecisionSnapshotText } from "../human-decision-packet";
import type { MultiRepoGovernanceAggregate } from "./multi-repo";

export type ConsoleGovernanceActionKind =
  | "migrate_policy"
  | "revoke_waiver"
  | "renew_waiver"
  | "repay_spec_debt"
  | "cancel_spec_debt"
  | "mark_spec_debt_owner_review"
  | "source_review_adopt"
  | "source_review_defer"
  | "source_review_waive"
  | "source_adopt"
  | "compare_release_drift"
  | "record_policy_approval"
  | "review_cross_repo_contract_drift";

export type ConsoleGovernanceActionStatus = "ready" | "needs_input" | "not_available";
export type ConsoleGovernanceRiskLevel = "low" | "medium" | "high" | "unknown";

export interface ConsoleGovernanceDecisionPacket {
  owner: string;
  reason: string;
  risk: {
    level: ConsoleGovernanceRiskLevel;
    summary: string;
  };
  sourceArtifacts: string[];
  affectedContracts: string[];
  recommendedCommand: string;
  commandWrites: string[];
  auditEventRequired: true;
  reviewerInstructions: string[];
}

export interface ConsoleGovernanceActionPriority {
  rank: number;
  bucket: "p0_blocking" | "p1_owner_review" | "p2_attention" | "p3_informational";
  rationale: string;
}

export interface ConsoleGovernanceActionPacket {
  id: string;
  kind: ConsoleGovernanceActionKind;
  status: ConsoleGovernanceActionStatus;
  title: string;
  owner: string;
  reason: string;
  risk: {
    level: ConsoleGovernanceRiskLevel;
    summary: string;
  };
  command: string;
  recommendedCommand: string;
  sourceObject: string;
  sourceArtifacts: string[];
  affectedContracts: string[];
  targetRefs: string[];
  commandWrites: string[];
  priority: ConsoleGovernanceActionPriority;
  decisionPacket: ConsoleGovernanceDecisionPacket;
  writesLocalArtifacts: true;
  requiresAuditEvent: true;
  replacesCliGate: false;
}

export type ConsoleGovernanceRunbookStatus = "ready" | "needs_input" | "not_available_yet";
export type ConsoleGovernanceRunbookStepStatus = "ready" | "needs_input" | "blocked" | "not_available_yet";

export interface ConsoleGovernanceRunbookStep {
  order: number;
  id: string;
  sourceActionId: string;
  title: string;
  owner: string;
  status: ConsoleGovernanceRunbookStepStatus;
  risk: ConsoleGovernanceActionPacket["risk"];
  command: string;
  expectedArtifact: string;
  expectedCompletionSignal: string;
  verificationCommand: string;
  rollbackOption: string;
  deferOption: string;
  evidenceArtifacts: string[];
  affectedContracts: string[];
  valueReportImpact: string;
}

export interface ConsoleGovernanceRunbook {
  version: 1;
  phase: "north-star-score-optimization-phase-8";
  status: ConsoleGovernanceRunbookStatus;
  title: string;
  summary: string;
  boundary: {
    readOnly: true;
    executesCommands: false;
    writesLocalArtifacts: false;
    sourceUploadRequired: false;
    replacesVerify: false;
    actionWritesMustUseLocalCli: true;
  };
  topStep?: ConsoleGovernanceRunbookStep;
  steps: ConsoleGovernanceRunbookStep[];
  valueReportImpact: {
    status: "ok" | "not_available_yet";
    summary: string;
    sourceArtifacts: string[];
    metrics: {
      estimatedManualSortingMinutesSaved: number | "not_available_yet";
      blockingIssuesCaught: number | "not_available_yet";
      advisoryRisksSurfaced: number | "not_available_yet";
      executeStopsNeedingReview: number | "not_available_yet";
    };
  };
}

export interface ConsoleGovernanceActionPlan {
  version: 1;
  root: string;
  createdAt: string;
  boundary: {
    readOnly: true;
    sourceUploadRequired: false;
    executesCommands: false;
    writesLocalArtifacts: false;
    actionWritesMustUseLocalCli: true;
  };
  runbook: ConsoleGovernanceRunbook;
  actions: ConsoleGovernanceActionPacket[];
}

export function buildConsoleGovernanceActionPlan(rootInput: string): ConsoleGovernanceActionPlan {
  const root = path.resolve(rootInput);
  const snapshot = collectConsoleLocalSnapshot(root);
  return buildConsoleGovernanceActionPlanFromSnapshot(snapshot, root);
}

export function buildConsoleGovernanceActionPlanFromSnapshot(
  snapshot: ConsoleLocalSnapshot,
  rootInput?: string,
): ConsoleGovernanceActionPlan {
  const root = path.resolve(rootInput ?? snapshot.root);
  const actions = sortGovernanceActions([
    ...buildPolicyActions(snapshot),
    ...buildWaiverActions(snapshot),
    ...buildSpecDebtActions(snapshot),
    ...buildSourceEvolutionActions(snapshot),
    ...buildReleaseDriftActions(snapshot),
    ...buildApprovalActions(snapshot),
  ]);
  return {
    version: 1,
    root,
    createdAt: new Date().toISOString(),
    boundary: {
      readOnly: true,
      sourceUploadRequired: false,
      executesCommands: false,
      writesLocalArtifacts: false,
      actionWritesMustUseLocalCli: true,
    },
    runbook: buildConsoleGovernanceRunbook(actions, snapshot),
    actions,
  };
}

export function selectPrimaryConsoleGovernanceAction(
  plan: ConsoleGovernanceActionPlan,
): ConsoleGovernanceActionPacket | undefined {
  return plan.actions.find((action) => action.status !== "not_available");
}

export function renderConsoleGovernanceActionPlanText(plan: ConsoleGovernanceActionPlan): string {
  const lines = [
    "=== JiSpec Governance Actions ===",
    "",
    `Actions: ${plan.actions.length}`,
    `Runbook: ${plan.runbook.status} - ${plan.runbook.summary}`,
    "Boundary: read-only planner; run listed CLI commands explicitly to write local artifacts.",
  ];

  if (plan.runbook.steps.length > 0) {
    lines.push("");
    lines.push("Runbook:");
    for (const step of plan.runbook.steps) {
      lines.push(`${step.order}. [${step.status.toUpperCase()}] ${step.title}`);
      lines.push(`   Owner: ${step.owner}`);
      lines.push(`   Command: ${step.command}`);
      lines.push(`   Expected artifact: ${step.expectedArtifact}`);
      lines.push(`   Verify: ${step.verificationCommand}`);
      lines.push(`   Rollback/defer: ${step.rollbackOption} / ${step.deferOption}`);
    }
  }

  if (plan.actions.length === 0) {
    lines.push("");
    lines.push("No governance actions were suggested from the declared local artifacts.");
    return lines.join("\n");
  }

  for (const action of plan.actions) {
    lines.push("");
    lines.push(`[${action.status.toUpperCase()}] ${action.title}`);
    lines.push("Decision packet:");
    lines.push(...renderHumanDecisionSnapshotText({
      currentState: `${action.status} ${action.kind}`,
      risk: `${action.risk.level} - ${action.risk.summary}`,
      evidence: action.sourceArtifacts,
      owner: action.owner,
      nextCommand: action.recommendedCommand,
      affectedArtifact: action.targetRefs[0] ?? action.sourceArtifacts[0],
    }).map((entry) => `- ${entry}`));
    lines.push(`Kind: ${action.kind}`);
    lines.push(`Priority: ${action.priority.bucket} #${action.priority.rank} - ${action.priority.rationale}`);
    lines.push(`Owner: ${action.owner}`);
    lines.push(`Reason: ${action.reason}`);
    lines.push(`Risk: ${action.risk.level} - ${action.risk.summary}`);
    lines.push(`Recommended command: ${action.recommendedCommand}`);
    if (action.targetRefs.length > 0) {
      lines.push(`Targets: ${action.targetRefs.join(", ")}`);
    }
    if (action.affectedContracts.length > 0) {
      lines.push(`Affected contracts: ${action.affectedContracts.join(", ")}`);
    }
    if (action.sourceArtifacts.length > 0) {
      lines.push(`Source artifacts: ${action.sourceArtifacts.join(", ")}`);
    }
    if (action.commandWrites.length > 0) {
      lines.push(`Writes if run: ${action.commandWrites.join(", ")}`);
    }
  }

  return lines.join("\n");
}

export function renderConsoleGovernanceActionPlanJSON(plan: ConsoleGovernanceActionPlan): string {
  return JSON.stringify(plan, null, 2);
}

export function buildCrossRepoDriftActions(
  aggregate: MultiRepoGovernanceAggregate,
): ConsoleGovernanceActionPacket[] {
  return aggregate.ownerActions.map((ownerAction) => action({
    kind: "review_cross_repo_contract_drift",
    status: ownerAction.status,
    title: `Review cross-repo drift for ${ownerAction.contractRef}`,
    reason: ownerAction.summary,
    command: ownerAction.suggestedCommand,
    owner: ownerAction.owner,
    risk: {
      level: "medium",
      summary: "Cross-repo contract drift is an owner-action hint and does not replace any single-repo verify gate.",
    },
    sourceObject: "multi_repo_export",
    sourceArtifacts: ownerAction.sourceArtifacts,
    affectedContracts: ownerAction.affectedContracts,
    targetRefs: [`cross-repo-drift:${ownerAction.upstreamRepoId}:${ownerAction.contractRef}->${ownerAction.downstreamRepoId}`],
    commandWrites: ownerAction.primaryCommand.writesLocalArtifacts,
  }));
}

function buildPolicyActions(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceActionPacket[] {
  const policy = governanceObject(snapshot, "policy_posture");
  if (!policy || policy.status === "not_available_yet" || policy.summary.state === "not_available_yet" || policy.status === "invalid") {
    return [
      action({
        kind: "migrate_policy",
        status: "ready",
        title: "Create or normalize verify policy",
        reason: "Policy posture is missing or invalid; execute-default and governance review need a local policy artifact.",
        command: "npm run jispec-cli -- policy migrate --actor <actor> --reason \"Create or normalize governance policy\"",
        owner: "policy owner",
        risk: {
          level: "high",
          summary: "Without a policy artifact, governance posture and execute-default readiness are not reviewable.",
        },
        sourceObject: "policy_posture",
        sourceArtifacts: policy?.sourcePaths.length ? policy.sourcePaths : [".spec/policy.yaml (missing or invalid)"],
        affectedContracts: [".spec/policy.yaml"],
        targetRefs: [".spec/policy.yaml"],
        commandWrites: [".spec/policy.yaml", ".spec/audit/events.jsonl"],
      }),
    ];
  }
  return [];
}

function buildWaiverActions(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceActionPacket[] {
  const waiverObject = governanceObject(snapshot, "waiver_lifecycle");
  const waivers = getAllArtifactRecords(snapshot, "verify-waivers");
  const actions: ConsoleGovernanceActionPacket[] = [];
  const unmatched = new Set(
    Array.isArray(waiverObject?.summary.unmatchedActiveIds)
      ? waiverObject?.summary.unmatchedActiveIds.map((id) => String(id))
      : [],
  );

  for (const waiver of waivers) {
    const id = stringValue(waiver.id);
    if (!id || stringValue(waiver.status) === "revoked") {
      continue;
    }

    const expired = isPastDate(stringValue(waiver.expiresAt));
    const expiringSoon = expiresWithinDays(stringValue(waiver.expiresAt), 14);
    if (expired || unmatched.has(id)) {
      actions.push(action({
        kind: "revoke_waiver",
        status: "ready",
        title: `Revoke stale waiver ${id}`,
        reason: expired ? "Waiver is expired." : "Waiver is active but unmatched in the latest verify report.",
        command: `npm run jispec-cli -- waiver revoke ${id} --actor <actor> --reason "<reason>"`,
        owner: stringValue(waiver.owner) ?? "waiver owner",
        risk: {
          level: "high",
          summary: expired
            ? "Expired waivers can hide stale exceptions if they remain active."
            : "Unmatched waivers no longer map to the latest verify issue and should not remain active silently.",
        },
        sourceObject: "waiver_lifecycle",
        sourceArtifacts: waiverObject?.sourcePaths ?? [],
        affectedContracts: affectedContractsFromWaiver(waiver),
        targetRefs: [`waiver:${id}`],
        commandWrites: [".spec/waivers/*.json", ".spec/audit/events.jsonl"],
      }));
    } else if (expiringSoon) {
      actions.push(action({
        kind: "renew_waiver",
        status: "needs_input",
        title: `Renew waiver ${id}`,
        reason: "Waiver expires soon and needs an explicit reviewed extension or revocation.",
        command: `npm run jispec-cli -- waiver renew ${id} --actor <actor> --reason "<reason>" --expires-at <iso-date>`,
        owner: stringValue(waiver.owner) ?? "waiver owner",
        risk: {
          level: "medium",
          summary: "A soon-to-expire waiver needs a reviewer decision before it becomes stale or blocks governance unexpectedly.",
        },
        sourceObject: "waiver_lifecycle",
        sourceArtifacts: waiverObject?.sourcePaths ?? [],
        affectedContracts: affectedContractsFromWaiver(waiver),
        targetRefs: [`waiver:${id}`],
        commandWrites: [".spec/waivers/*.json", ".spec/audit/events.jsonl"],
      }));
    }
  }

  return actions;
}

function buildSpecDebtActions(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceActionPacket[] {
  const specDebt = governanceObject(snapshot, "spec_debt_ledger");
  const ledger = getFirstArtifactRecord(snapshot, "greenfield-spec-debt-ledger");
  const debts = Array.isArray(ledger?.debts) ? ledger.debts.filter(isRecord) : [];
  const actions: ConsoleGovernanceActionPacket[] = [];

  for (const debt of debts) {
    const id = stringValue(debt.id);
    if (!id || stringValue(debt.status) !== "open") {
      continue;
    }

    if (isPastDate(stringValue(debt.expires_at))) {
      actions.push(action({
        kind: "repay_spec_debt",
        status: "ready",
        title: `Repay expired spec debt ${id}`,
        reason: "Open spec debt is expired and blocks release governance.",
        command: `npm run jispec-cli -- spec-debt repay ${id} --actor <actor> --reason "<reason>"`,
        owner: stringValue(debt.owner) ?? "spec debt owner",
        risk: {
          level: "high",
          summary: "Expired spec debt indicates unresolved contract work that should not pass release review silently.",
        },
        sourceObject: "spec_debt_ledger",
        sourceArtifacts: specDebt?.sourcePaths ?? [],
        affectedContracts: affectedContractsFromSpecDebt(debt),
        targetRefs: [`spec-debt:${id}`],
        commandWrites: [".spec/spec-debt/ledger.yaml", ".spec/audit/events.jsonl"],
      }));
      actions.push(action({
        kind: "cancel_spec_debt",
        status: "needs_input",
        title: `Cancel expired spec debt ${id}`,
        reason: "Use cancel only if the debt is no longer in scope and a reviewer can explain why.",
        command: `npm run jispec-cli -- spec-debt cancel ${id} --actor <actor> --reason "<reason>"`,
        owner: stringValue(debt.owner) ?? "spec debt owner",
        risk: {
          level: "medium",
          summary: "Cancelling debt removes it from active governance, so the reviewer must confirm the scope changed.",
        },
        sourceObject: "spec_debt_ledger",
        sourceArtifacts: specDebt?.sourcePaths ?? [],
        affectedContracts: affectedContractsFromSpecDebt(debt),
        targetRefs: [`spec-debt:${id}`],
        commandWrites: [".spec/spec-debt/ledger.yaml", ".spec/audit/events.jsonl"],
      }));
      continue;
    }

    actions.push(action({
      kind: "mark_spec_debt_owner_review",
      status: isRecord(debt.owner_review) ? "not_available" : "ready",
      title: `Request owner review for spec debt ${id}`,
      reason: isRecord(debt.owner_review) ? "Owner review has already been requested." : "Open spec debt needs owner review before enforcement or release.",
      command: `npm run jispec-cli -- spec-debt owner-review ${id} --actor <actor> --reason "<reason>"`,
      owner: stringValue(debt.owner) ?? "spec debt owner",
      risk: {
        level: "medium",
        summary: "Open spec debt can delay contract enforcement unless the owner decision is recorded.",
      },
      sourceObject: "spec_debt_ledger",
      sourceArtifacts: specDebt?.sourcePaths ?? [],
      affectedContracts: affectedContractsFromSpecDebt(debt),
      targetRefs: [`spec-debt:${id}`],
      commandWrites: [".spec/spec-debt/ledger.yaml", ".spec/audit/events.jsonl"],
    }));
  }

  return actions;
}

function buildSourceEvolutionActions(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceActionPacket[] {
  const sourceEvolution = governanceObject(snapshot, "source_evolution_governance");
  const summary = sourceEvolution?.summary ?? {};
  const activeChangeId = stringValue(summary.activeChangeId);
  const sourceEvolutionPath = stringValue(summary.sourceEvolutionPath);
  const sourceReviewPath = stringValue(summary.sourceReviewPath);
  const decisions = Array.isArray(summary.decisions) ? summary.decisions.filter(isRecord) : [];
  const actions: ConsoleGovernanceActionPacket[] = [];

  if (!sourceEvolution || summary.state !== "available" || !activeChangeId || activeChangeId === "not_available_yet") {
    return actions;
  }

  const proposed = decisions
    .filter((decision) => stringValue(decision.status) === "proposed")
    .sort((left, right) => sourceEvolutionDecisionPriority(left) - sourceEvolutionDecisionPriority(right));
  const primary = proposed[0];

  if (primary) {
    const itemId = stringValue(primary.itemId) ?? stringValue(primary.evolutionId) ?? "unknown-item";
    const owner = stringValue(primary.owner) ?? "source reviewer";
    const affectedContracts = affectedContractsFromSourceDecision(primary);
    const targetRef = sourceDecisionTargetRef(primary);
    const evidenceArtifacts = stableUnique([
      sourceEvolutionPath ?? ".spec/deltas/<change-id>/source-evolution.json",
      sourceReviewPath ?? ".spec/deltas/<change-id>/source-review.yaml",
      stringValue(primary.path) ?? "",
    ]);
    const severity = stringValue(primary.severity) ?? "blocking";

    actions.push(action({
      kind: "source_review_adopt",
      status: "ready",
      title: `Adopt source review item ${itemId}`,
      reason: stringValue(primary.summary) ?? "Source evolution still needs an explicit adopt decision.",
      command: `npm run jispec-cli -- source review adopt ${itemId} --change ${activeChangeId} --actor <actor>`,
      owner,
      risk: {
        level: severity === "blocking" ? "high" : "medium",
        summary: severity === "blocking"
          ? "Blocking source evolution remains proposed until a reviewer records a decision."
          : "Advisory source evolution still needs an explicit decision before the change is fully closed.",
      },
      sourceObject: "source_evolution_governance",
      sourceArtifacts: evidenceArtifacts,
      affectedContracts,
      targetRefs: [targetRef],
      commandWrites: [".spec/deltas/<change-id>/source-review.yaml", ".spec/audit/events.jsonl"],
    }));
    actions.push(action({
      kind: "source_review_defer",
      status: "needs_input",
      title: `Defer source review item ${itemId}`,
      reason: "Use defer only when a named owner will repay the requirement lifecycle follow-up.",
      command: `npm run jispec-cli -- source review defer ${itemId} --change ${activeChangeId} --actor <actor> --owner <owner> --reason "<reason>"`,
      owner,
      risk: {
        level: severity === "blocking" ? "high" : "medium",
        summary: "Deferring source evolution keeps the exception visible, but it should remain short-lived and owner-backed.",
      },
      sourceObject: "source_evolution_governance",
      sourceArtifacts: evidenceArtifacts,
      affectedContracts,
      targetRefs: [targetRef],
      commandWrites: [".spec/deltas/<change-id>/source-review.yaml", ".spec/audit/events.jsonl"],
    }));
    actions.push(action({
      kind: "source_review_waive",
      status: "needs_input",
      title: `Waive source review item ${itemId}`,
      reason: "Use waive only when the reviewer accepts a visible source evolution exception.",
      command: `npm run jispec-cli -- source review waive ${itemId} --change ${activeChangeId} --actor <actor> --owner <owner> --reason "<reason>"`,
      owner,
      risk: {
        level: severity === "blocking" ? "high" : "medium",
        summary: "Waiving source evolution records an explicit exception and should not replace eventual contract cleanup silently.",
      },
      sourceObject: "source_evolution_governance",
      sourceArtifacts: evidenceArtifacts,
      affectedContracts,
      targetRefs: [targetRef],
      commandWrites: [".spec/deltas/<change-id>/source-review.yaml", ".spec/audit/events.jsonl"],
    }));
  }

  if (summary.canAdoptSource === true) {
    actions.push(action({
      kind: "source_adopt",
      status: "ready",
      title: `Promote source evolution ${activeChangeId}`,
      reason: "All blocking source review items are reviewed; the active truth can now be promoted explicitly.",
      command: `npm run jispec-cli -- source adopt --change ${activeChangeId} --actor <actor> --reason "<reason>"`,
      owner: "source owner",
      risk: {
        level: "medium",
        summary: "Source adopt updates the active source snapshot, lifecycle registry, and current baseline together.",
      },
      sourceObject: "source_evolution_governance",
      sourceArtifacts: stableUnique([
        sourceEvolutionPath ?? ".spec/deltas/<change-id>/source-evolution.json",
        sourceReviewPath ?? ".spec/deltas/<change-id>/source-review.yaml",
        stringValue(summary.lifecyclePath) ?? ".spec/requirements/lifecycle.yaml",
      ]),
      affectedContracts: stableUnique([
        stringValue(summary.lifecyclePath) ?? ".spec/requirements/lifecycle.yaml",
        sourceEvolutionPath ?? ".spec/deltas/<change-id>/source-evolution.json",
        sourceReviewPath ?? ".spec/deltas/<change-id>/source-review.yaml",
      ]),
      targetRefs: [sourceEvolutionRepresentativeArtifact(summary)],
      commandWrites: [
        ".spec/greenfield/source-documents.active.yaml",
        ".spec/greenfield/source-documents.yaml",
        ".spec/requirements/lifecycle.yaml",
        ".spec/baselines/current.yaml",
        ".spec/audit/events.jsonl",
      ],
    }));
  }

  return actions;
}

function buildReleaseDriftActions(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceActionPacket[] {
  const drift = governanceObject(snapshot, "contract_drift");
  if (!drift || drift.status === "not_available_yet" || drift.summary.state === "not_available_yet") {
    return [
      action({
        kind: "compare_release_drift",
        status: "needs_input",
        title: "Compare release drift",
        reason: "No release compare report is available for governance review.",
        command: "npm run jispec-cli -- release compare --from <ref> --to <ref> --actor <actor> --reason \"Review release drift\"",
        owner: "release owner",
        risk: {
          level: "medium",
          summary: "Without a release compare report, contract, static collector, and policy drift are not reviewable.",
        },
        sourceObject: "contract_drift",
        sourceArtifacts: drift?.sourcePaths.length ? drift.sourcePaths : [".spec/releases/compare/<from>-to-<to>/compare-report.json (missing)"],
        affectedContracts: [".spec/releases/compare/<from>-to-<to>/compare-report.json"],
        targetRefs: [".spec/releases/compare/<from>-to-<to>/compare-report.json"],
        commandWrites: [".spec/releases/compare/", ".spec/releases/drift-trend.json", ".spec/audit/events.jsonl"],
      }),
    ];
  }
  return [];
}

function buildApprovalActions(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceActionPacket[] {
  const approval = governanceObject(snapshot, "approval_workflow");
  const summary = approval?.summary ?? {};
  const subjects = Array.isArray(summary.subjects) ? summary.subjects.filter(isRecord) : [];
  if (!approval || summary.state !== "available") {
    return [];
  }

  return subjects
    .filter((subject) => subject.status === "approval_missing" || subject.status === "approval_stale")
    .map((subject) => {
      const kind = stringValue(subject.kind) ?? "policy_change";
      const ref = stringValue(subject.ref) ?? ".spec/policy.yaml";
      const stale = subject.status === "approval_stale";
      return action({
        kind: "record_policy_approval",
        status: "needs_input",
        title: `${stale ? "Refresh" : "Record"} approval for ${kind}`,
        reason: stale
          ? "Approval exists but is stale because the subject changed or the approval expired."
          : "Approval subject is missing reviewer quorum or owner approval.",
        command: `npm run jispec-cli -- policy approval record --subject-kind ${kind} --subject-ref ${ref} --actor <actor> --role reviewer --reason "<reason>"`,
        owner: stringValue(summary.owner) ?? "approval owner",
        risk: {
          level: approvalRiskLevel(kind, stale, stringValue(summary.profile)),
          summary: stale
            ? "Stale approvals can make governance appear reviewed after the underlying artifact changed."
            : "Missing approvals leave governance decisions without the required reviewer or owner record.",
        },
        sourceObject: "approval_workflow",
        sourceArtifacts: approval.sourcePaths.length > 0 ? approval.sourcePaths : [ref],
        affectedContracts: [
          ref,
          `${kind}:${stringValue(subject.hash) ?? "unknown-hash"}`,
        ],
        targetRefs: [`${kind}:${ref}`],
        commandWrites: [".spec/approvals/*.json", ".spec/audit/events.jsonl"],
      });
    });
}

function action(
  input: Omit<
    ConsoleGovernanceActionPacket,
    "id" | "recommendedCommand" | "decisionPacket" | "writesLocalArtifacts" | "requiresAuditEvent" | "replacesCliGate"
    | "priority"
  >,
): ConsoleGovernanceActionPacket {
  const recommendedCommand = input.command;
  const priority = buildActionPriority(input);
  const decisionPacket: ConsoleGovernanceDecisionPacket = {
    owner: input.owner,
    reason: input.reason,
    risk: input.risk,
    sourceArtifacts: input.sourceArtifacts,
    affectedContracts: input.affectedContracts,
    recommendedCommand,
    commandWrites: input.commandWrites,
    auditEventRequired: true,
    reviewerInstructions: buildReviewerInstructions(input),
  };

  return {
    id: `${input.kind}:${input.targetRefs[0] ?? input.sourceObject}`,
    priority,
    recommendedCommand,
    decisionPacket,
    writesLocalArtifacts: true,
    requiresAuditEvent: true,
    replacesCliGate: false,
    ...input,
  };
}

function sortGovernanceActions(actions: ConsoleGovernanceActionPacket[]): ConsoleGovernanceActionPacket[] {
  return [...actions].sort((left, right) =>
    left.priority.rank - right.priority.rank ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id)
  );
}

function buildConsoleGovernanceRunbook(
  actions: ConsoleGovernanceActionPacket[],
  snapshot: ConsoleLocalSnapshot,
): ConsoleGovernanceRunbook {
  const steps = actions
    .filter((action) => action.status !== "not_available")
    .slice(0, 3)
    .map((action, index) => buildRunbookStep(action, index + 1, snapshot));
  const valueReportImpact = buildRunbookValueReportImpact(snapshot);
  const status: ConsoleGovernanceRunbookStatus = steps.length === 0
    ? "not_available_yet"
    : steps.some((step) => step.status === "ready")
      ? "ready"
      : "needs_input";

  return {
    version: 1,
    phase: "north-star-score-optimization-phase-8",
    status,
    title: "Console Governance Runbook",
    summary: steps.length > 0
      ? `Top ${steps.length} governance step(s) are ordered for owner execution and post-command verification.`
      : "No governance runbook steps are available from the declared local artifacts.",
    boundary: {
      readOnly: true,
      executesCommands: false,
      writesLocalArtifacts: false,
      sourceUploadRequired: false,
      replacesVerify: false,
      actionWritesMustUseLocalCli: true,
    },
    topStep: steps[0],
    steps,
    valueReportImpact,
  };
}

function buildRunbookStep(
  action: ConsoleGovernanceActionPacket,
  order: number,
  snapshot: ConsoleLocalSnapshot,
): ConsoleGovernanceRunbookStep {
  const expectedArtifact = expectedArtifactForAction(action);
  return {
    order,
    id: `runbook-step-${order}:${action.id}`,
    sourceActionId: action.id,
    title: action.title,
    owner: action.owner,
    status: runbookStepStatus(action),
    risk: action.risk,
    command: action.recommendedCommand,
    expectedArtifact,
    expectedCompletionSignal: expectedCompletionSignalForAction(action, expectedArtifact),
    verificationCommand: verificationCommandForAction(action),
    rollbackOption: rollbackOptionForAction(action),
    deferOption: deferOptionForAction(action),
    evidenceArtifacts: stableUnique([
      ...action.sourceArtifacts,
      ...sourceArtifactsForValueReport(snapshot),
    ]),
    affectedContracts: action.affectedContracts,
    valueReportImpact: valueReportImpactForAction(action, snapshot),
  };
}

function runbookStepStatus(action: ConsoleGovernanceActionPacket): ConsoleGovernanceRunbookStepStatus {
  if (action.status === "ready") {
    return "ready";
  }
  if (action.status === "needs_input") {
    return action.recommendedCommand.includes("<") ? "blocked" : "needs_input";
  }
  return "not_available_yet";
}

function expectedArtifactForAction(action: ConsoleGovernanceActionPacket): string {
  return action.commandWrites[0]
    ?? action.sourceArtifacts[0]
    ?? action.affectedContracts[0]
    ?? "not_available_yet";
}

function expectedCompletionSignalForAction(
  action: ConsoleGovernanceActionPacket,
  expectedArtifact: string,
): string {
  if (expectedArtifact === "not_available_yet") {
    return "Console could not identify a declared artifact; collect the missing local artifact before treating the step as complete.";
  }
  if (action.kind === "compare_release_drift") {
    return `A release compare report exists at ${expectedArtifact}, then Console and release drift review can read it.`;
  }
  if (action.kind === "review_cross_repo_contract_drift") {
    return `The owning repo refreshes ${expectedArtifact}, then the repo group aggregate is regenerated.`;
  }
  return `${expectedArtifact} changes locally and the follow-up verification command reports the same or lower governance risk.`;
}

function verificationCommandForAction(action: ConsoleGovernanceActionPacket): string {
  if (action.kind === "compare_release_drift") {
    return "npm run jispec-cli -- release compare --from <ref> --to <ref>";
  }
  if (action.kind === "review_cross_repo_contract_drift") {
    return "npm run jispec-cli -- console aggregate-governance --json";
  }
  if (action.kind === "source_review_adopt" || action.kind === "source_review_defer" || action.kind === "source_review_waive" || action.kind === "source_adopt") {
    return "npm run ci:verify";
  }
  if (action.kind === "record_policy_approval" || action.kind === "migrate_policy") {
    return "npm run ci:verify";
  }
  return "npm run ci:verify";
}

function rollbackOptionForAction(action: ConsoleGovernanceActionPacket): string {
  if (action.kind === "renew_waiver") {
    return "If the renewal is rejected, revoke the waiver instead and rerun verify.";
  }
  if (action.kind === "revoke_waiver") {
    return "If the exception is still required, record a reviewed renewal with a new expiration and rerun verify.";
  }
  if (action.kind === "repay_spec_debt") {
    return "If repayment is incomplete, restore the debt entry from VCS and request owner review instead.";
  }
  if (action.kind === "cancel_spec_debt") {
    return "If cancellation was premature, restore the debt entry from VCS and record owner review.";
  }
  if (action.kind === "source_review_adopt" || action.kind === "source_adopt") {
    return "If verification regresses, restore the source review or active source artifacts from VCS before rerunning verify.";
  }
  if (action.kind === "source_review_defer" || action.kind === "source_review_waive") {
    return "If the defer or waiver is rejected, restore the source review artifact from VCS and adopt the item instead.";
  }
  if (action.kind === "compare_release_drift") {
    return "If the refs are wrong, delete the generated local compare report and rerun release compare with corrected refs.";
  }
  if (action.kind === "record_policy_approval") {
    return "If the approval subject is wrong, add a fresh approval for the current subject after policy review.";
  }
  if (action.kind === "review_cross_repo_contract_drift") {
    return "If the owner action is wrong, update the repo-group declaration or the source repo export before aggregating again.";
  }
  return "If the resulting artifact is wrong, restore it from VCS and rerun the verification command.";
}

function deferOptionForAction(action: ConsoleGovernanceActionPacket): string {
  if (action.kind === "source_review_defer") {
    return action.recommendedCommand;
  }
  if (action.kind === "cancel_spec_debt") {
    return action.recommendedCommand;
  }
  if (action.kind === "renew_waiver") {
    return "Record an owner decision with a bounded expiration; otherwise revoke the waiver.";
  }
  if (action.kind === "revoke_waiver") {
    return "Defer only by renewing the waiver with explicit owner, reason, and expiration.";
  }
  if (action.kind === "repay_spec_debt" || action.kind === "mark_spec_debt_owner_review") {
    return "Record owner review with an explicit repayment owner and reason.";
  }
  if (action.kind === "review_cross_repo_contract_drift") {
    return "Assign the drift owner and re-export governance after the owning repo decides.";
  }
  return "Record an explicit owner defer decision; do not treat defer as verification success.";
}

function buildRunbookValueReportImpact(snapshot: ConsoleLocalSnapshot): ConsoleGovernanceRunbook["valueReportImpact"] {
  const takeoverQuality = governanceObject(snapshot, "takeover_quality_trend");
  const summary = takeoverQuality?.summary ?? {};
  const hasValueReport = summary.hasValueReport === true;
  const metrics = {
    estimatedManualSortingMinutesSaved: numberValue(summary.estimatedManualSortingMinutesSaved) ?? "not_available_yet" as const,
    blockingIssuesCaught: numberValue(summary.blockingIssuesCaught) ?? "not_available_yet" as const,
    advisoryRisksSurfaced: numberValue(summary.advisoryRisksSurfaced) ?? "not_available_yet" as const,
    executeStopsNeedingReview: numberValue(summary.executeStopsNeedingReview) ?? "not_available_yet" as const,
  };
  return {
    status: hasValueReport ? "ok" : "not_available_yet",
    summary: hasValueReport
      ? `Runbook is linked to local value evidence: ${metrics.estimatedManualSortingMinutesSaved} minute(s) saved, ${metrics.blockingIssuesCaught} blocking issue(s) caught, ${metrics.executeStopsNeedingReview} execute stop(s) needing review.`
      : "Runbook value impact is not available until .spec/metrics/value-report.json is materialized.",
    sourceArtifacts: sourceArtifactsForValueReport(snapshot),
    metrics,
  };
}

function valueReportImpactForAction(
  action: ConsoleGovernanceActionPacket,
  snapshot: ConsoleLocalSnapshot,
): string {
  const impact = buildRunbookValueReportImpact(snapshot);
  if (impact.status !== "ok") {
    return "Value report impact is not available yet; materialize .spec/metrics/value-report.json to connect this step to ROI and governance debt.";
  }
  if (action.risk.level === "high") {
    return `High-risk step; value report currently shows ${impact.metrics.blockingIssuesCaught} blocking issue(s) caught.`;
  }
  if (action.status === "needs_input") {
    return `Owner-review step; value report currently shows ${impact.metrics.executeStopsNeedingReview} execute stop(s) needing review.`;
  }
  return `Runbook step is tied to ${impact.metrics.estimatedManualSortingMinutesSaved} estimated manual sorting minute(s) saved.`;
}

function sourceArtifactsForValueReport(snapshot: ConsoleLocalSnapshot): string[] {
  const takeoverQuality = governanceObject(snapshot, "takeover_quality_trend");
  return takeoverQuality?.summary.hasValueReport === true
    ? [".spec/metrics/value-report.json"]
    : [];
}

function buildActionPriority(input: Pick<ConsoleGovernanceActionPacket, "kind" | "status" | "risk" | "sourceObject">): ConsoleGovernanceActionPriority {
  const riskBase: Record<ConsoleGovernanceRiskLevel, number> = {
    high: 10,
    medium: 30,
    low: 50,
    unknown: 70,
  };
  const statusOffset: Record<ConsoleGovernanceActionStatus, number> = {
    ready: 0,
    needs_input: 6,
    not_available: 24,
  };
  const kindOffset: Partial<Record<ConsoleGovernanceActionKind, number>> = {
    revoke_waiver: 0,
    repay_spec_debt: 1,
    source_review_adopt: 2,
    review_cross_repo_contract_drift: 3,
    renew_waiver: 4,
    record_policy_approval: 5,
    compare_release_drift: 6,
    source_adopt: 7,
    source_review_defer: 8,
    source_review_waive: 9,
    mark_spec_debt_owner_review: 10,
    migrate_policy: 11,
    cancel_spec_debt: 12,
  };
  const rank = riskBase[input.risk.level] + statusOffset[input.status] + (kindOffset[input.kind] ?? 20);
  const bucket: ConsoleGovernanceActionPriority["bucket"] =
    rank < 20 ? "p0_blocking" :
      rank < 40 ? "p1_owner_review" :
        rank < 65 ? "p2_attention" :
          "p3_informational";
  return {
    rank,
    bucket,
    rationale: `${input.risk.level} risk ${input.kind} action from ${input.sourceObject}; status=${input.status}`,
  };
}

function buildReviewerInstructions(input: Pick<ConsoleGovernanceActionPacket, "kind" | "status">): string[] {
  if (input.status === "not_available") {
    return ["No local write is recommended until a reviewer resolves the missing input or already-recorded state."];
  }

  if (input.kind === "renew_waiver") {
    return ["Confirm the exception is still needed.", "Set a new expiration date.", "Run the recommended local CLI command explicitly."];
  }
  if (input.kind === "revoke_waiver") {
    return ["Confirm the waiver is stale, expired, or unmatched.", "Run the recommended local CLI command explicitly.", "Rerun verify after revocation."];
  }
  if (input.kind === "source_review_adopt") {
    return ["Review the source evolution item and its lifecycle impact.", "Run the recommended local CLI command explicitly.", "Use source adopt only after the remaining blocking items are closed."];
  }
  if (input.kind === "source_review_defer") {
    return ["Name the repayment owner.", "Record a clear defer reason and optional expiration.", "Run the recommended local CLI command explicitly."];
  }
  if (input.kind === "source_review_waive") {
    return ["Confirm the exception is intentional and visible.", "Record owner and waiver reason.", "Run the recommended local CLI command explicitly."];
  }
  if (input.kind === "source_adopt") {
    return ["Confirm the reviewed change should become active truth.", "Run the recommended local CLI command explicitly.", "Rerun verify after adoption."];
  }
  if (input.kind === "repay_spec_debt") {
    return ["Confirm the contract work is complete.", "Run the recommended local CLI command explicitly.", "Rerun verify or Console dashboard."];
  }
  if (input.kind === "cancel_spec_debt") {
    return ["Confirm the debt is no longer in scope.", "Record a clear cancellation reason.", "Run the recommended local CLI command explicitly."];
  }
  if (input.kind === "mark_spec_debt_owner_review") {
    return ["Assign the business or contract owner.", "Run the recommended local CLI command explicitly.", "Do not treat owner review as repayment."];
  }
  if (input.kind === "compare_release_drift") {
    return ["Choose the release refs.", "Run the recommended local CLI command explicitly.", "Review generated drift reports before release."];
  }
  if (input.kind === "record_policy_approval") {
    return ["Review the current governance subject.", "Run the recommended local CLI command explicitly.", "Confirm the resulting approval audit event."];
  }
  if (input.kind === "review_cross_repo_contract_drift") {
    return [
      "Review upstream and downstream contract ownership.",
      "Run the suggested local command explicitly in the named repo, then re-export governance for that repo.",
      "Do not treat this action as a replacement for either repo's verify gate.",
    ];
  }
  return ["Run the recommended local CLI command explicitly.", "Review the resulting audit event."];
}

function governanceObject(snapshot: ConsoleLocalSnapshot, id: string) {
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

function affectedContractsFromWaiver(waiver: Record<string, unknown>): string[] {
  const values = [
    stringValue(waiver.issueCode) ? `issue:${stringValue(waiver.issueCode)}` : undefined,
    stringValue(waiver.issuePath) ? `path:${stringValue(waiver.issuePath)}` : undefined,
    stringValue(waiver.issueFingerprint) ? `fingerprint:${stringValue(waiver.issueFingerprint)}` : undefined,
  ].filter((value): value is string => Boolean(value));
  return values.length > 0 ? values : ["waiver:unknown-affected-contract"];
}

function affectedContractsFromSpecDebt(debt: Record<string, unknown>): string[] {
  const affectedContracts = Array.isArray(debt.affected_contracts)
    ? debt.affected_contracts.map(String)
    : [];
  const affectedAssets = Array.isArray(debt.affected_assets)
    ? debt.affected_assets.map((asset) => `asset:${String(asset)}`)
    : [];
  const values = [...affectedContracts, ...affectedAssets];
  return values.length > 0 ? values : [`spec-debt:${stringValue(debt.id) ?? "unknown"}`];
}

function approvalRiskLevel(kind: string, stale: boolean, profile: string | undefined): ConsoleGovernanceRiskLevel {
  if (stale || kind === "release_drift" || profile === "regulated") {
    return "high";
  }
  if (kind === "waiver_change" || kind === "execute_default_change") {
    return "medium";
  }
  return "medium";
}

function sourceEvolutionDecisionPriority(decision: Record<string, unknown>): number {
  const severity = stringValue(decision.severity);
  const pathValue = stringValue(decision.path) ?? "";
  if (severity === "blocking" && pathValue.includes("requirements")) {
    return 0;
  }
  if (severity === "blocking") {
    return 1;
  }
  if (pathValue.includes("technical-solution")) {
    return 2;
  }
  return 3;
}

function sourceDecisionTargetRef(decision: Record<string, unknown>): string {
  const pathValue = stringValue(decision.path) ?? "source-evolution";
  const anchor = stringValue(decision.anchorId);
  return anchor ? `${pathValue}:${anchor}` : pathValue;
}

function affectedContractsFromSourceDecision(decision: Record<string, unknown>): string[] {
  const pathValue = stringValue(decision.path);
  const anchor = stringValue(decision.anchorId);
  const mapsTo = Array.isArray(decision.mapsTo) ? decision.mapsTo.map(String) : [];
  const values = [
    pathValue ? `path:${pathValue}` : undefined,
    anchor ? `requirement:${anchor}` : undefined,
    ...mapsTo.map((value) => `successor:${value}`),
  ].filter((value): value is string => Boolean(value));
  return values.length > 0 ? values : ["source-evolution:unknown-affected-contract"];
}

function sourceEvolutionRepresentativeArtifact(summary: Record<string, unknown>): string {
  return stringValue(summary.activeRepresentativeItem)
    ?? stringValue(summary.sourceEvolutionPath)
    ?? ".spec/requirements/lifecycle.yaml";
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
