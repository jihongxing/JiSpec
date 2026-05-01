import path from "node:path";
import { collectConsoleLocalSnapshot, type ConsoleLocalSnapshot } from "./read-model-snapshot";

export type ConsoleGovernanceActionKind =
  | "migrate_policy"
  | "revoke_waiver"
  | "renew_waiver"
  | "repay_spec_debt"
  | "mark_spec_debt_owner_review"
  | "compare_release_drift";

export type ConsoleGovernanceActionStatus = "ready" | "needs_input" | "not_available";

export interface ConsoleGovernanceActionPacket {
  id: string;
  kind: ConsoleGovernanceActionKind;
  status: ConsoleGovernanceActionStatus;
  title: string;
  reason: string;
  command: string;
  sourceObject: string;
  sourceArtifacts: string[];
  targetRefs: string[];
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
    ],
  };
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
    lines.push(`Kind: ${action.kind}`);
    lines.push(`Reason: ${action.reason}`);
    lines.push(`Command: ${action.command}`);
    if (action.targetRefs.length > 0) {
      lines.push(`Targets: ${action.targetRefs.join(", ")}`);
    }
    if (action.sourceArtifacts.length > 0) {
      lines.push(`Source artifacts: ${action.sourceArtifacts.join(", ")}`);
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
        sourceObject: "policy_posture",
        sourceArtifacts: policy?.sourcePaths ?? [],
        targetRefs: [".spec/policy.yaml"],
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
        sourceObject: "waiver_lifecycle",
        sourceArtifacts: waiverObject?.sourcePaths ?? [],
        targetRefs: [`waiver:${id}`],
      }));
    } else if (expiringSoon) {
      actions.push(action({
        kind: "renew_waiver",
        status: "needs_input",
        title: `Renew waiver ${id}`,
        reason: "Waiver expires soon and needs an explicit reviewed extension or revocation.",
        command: `npm run jispec-cli -- waiver renew ${id} --actor <actor> --reason "<reason>" --expires-at <iso-date>`,
        sourceObject: "waiver_lifecycle",
        sourceArtifacts: waiverObject?.sourcePaths ?? [],
        targetRefs: [`waiver:${id}`],
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
        title: `Repay or cancel expired spec debt ${id}`,
        reason: "Open spec debt is expired and blocks release governance.",
        command: `npm run jispec-cli -- spec-debt repay ${id} --actor <actor> --reason "<reason>"`,
        sourceObject: "spec_debt_ledger",
        sourceArtifacts: specDebt?.sourcePaths ?? [],
        targetRefs: [`spec-debt:${id}`],
      }));
      continue;
    }

    actions.push(action({
      kind: "mark_spec_debt_owner_review",
      status: isRecord(debt.owner_review) ? "not_available" : "ready",
      title: `Request owner review for spec debt ${id}`,
      reason: isRecord(debt.owner_review) ? "Owner review has already been requested." : "Open spec debt needs owner review before enforcement or release.",
      command: `npm run jispec-cli -- spec-debt owner-review ${id} --actor <actor> --reason "<reason>"`,
      sourceObject: "spec_debt_ledger",
      sourceArtifacts: specDebt?.sourcePaths ?? [],
      targetRefs: [`spec-debt:${id}`],
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
        sourceObject: "contract_drift",
        sourceArtifacts: drift?.sourcePaths ?? [],
        targetRefs: [".spec/releases/compare/<from>-to-<to>/compare-report.json"],
      }),
    ];
  }
  return [];
}

function action(input: Omit<ConsoleGovernanceActionPacket, "id" | "writesLocalArtifacts" | "requiresAuditEvent" | "replacesCliGate">): ConsoleGovernanceActionPacket {
  return {
    id: `${input.kind}:${input.targetRefs[0] ?? input.sourceObject}`,
    writesLocalArtifacts: true,
    requiresAuditEvent: true,
    replacesCliGate: false,
    ...input,
  };
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
