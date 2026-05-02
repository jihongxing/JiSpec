import path from "node:path";
import { collectConsoleLocalSnapshot, type ConsoleLocalSnapshot } from "./read-model-snapshot";
import { renderHumanDecisionSnapshotText } from "../human-decision-packet";

export type ConsoleGovernanceActionKind =
  | "migrate_policy"
  | "revoke_waiver"
  | "renew_waiver"
  | "repay_spec_debt"
  | "cancel_spec_debt"
  | "mark_spec_debt_owner_review"
  | "compare_release_drift"
  | "record_policy_approval";

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
  decisionPacket: ConsoleGovernanceDecisionPacket;
  writesLocalArtifacts: true;
  requiresAuditEvent: true;
  replacesCliGate: false;
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
    actions: [
      ...buildPolicyActions(snapshot),
      ...buildWaiverActions(snapshot),
      ...buildSpecDebtActions(snapshot),
      ...buildReleaseDriftActions(snapshot),
      ...buildApprovalActions(snapshot),
    ],
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
    "Boundary: read-only planner; run listed CLI commands explicitly to write local artifacts.",
  ];

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
    }).map((entry) => `- ${entry}`));
    lines.push(`Kind: ${action.kind}`);
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
  >,
): ConsoleGovernanceActionPacket {
  const recommendedCommand = input.command;
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
    recommendedCommand,
    decisionPacket,
    writesLocalArtifacts: true,
    requiresAuditEvent: true,
    replacesCliGate: false,
    ...input,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
