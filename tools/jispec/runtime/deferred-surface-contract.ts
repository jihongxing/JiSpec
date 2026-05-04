import fs from "node:fs";
import path from "node:path";

export type DeferredSurfaceKind = "distributed" | "collaboration" | "presence";

export type DeferredSurfacePromotionRequirementId =
  | "stable_machine_artifacts"
  | "audit_evidence"
  | "owner_and_next_command"
  | "cannot_override_verify"
  | "dedicated_acceptance_scenarios"
  | "deterministic_local_first_behavior";

export type DeferredSurfacePromotionCandidateId =
  | "console_governance_export"
  | "multi_repo_governance_aggregate";

export interface DeferredSurfaceContract {
  id: string;
  kind: DeferredSurfaceKind;
  status: "deferred";
  reason: string;
  allowedRegressionArea: "runtime-extended";
  allowedDoctorProfiles: ["runtime"];
  forbiddenDoctorProfiles: ["v1", "pilot", "global"];
  doesBlockV1Readiness: false;
  canOverrideVerify: false;
  productizedInV1: false;
  regressionSuites: string[];
}

export interface DeferredSurfacePromotionRequirement {
  id: DeferredSurfacePromotionRequirementId;
  description: string;
  machineVerifiableIntent: string;
}

export interface DeferredSurfacePromotionCandidate {
  id: DeferredSurfacePromotionCandidateId;
  status: "promotion_candidate";
  currentRole: "support_surface";
  targetRole: "required_global_closure_surface";
  owner: string;
  nextCommand: string;
  machineArtifacts: string[];
  auditEvidence: string[];
  acceptanceScenarios: string[];
  localFirst: true;
  cannotOverrideVerify: true;
  deterministicArtifactsOnly: true;
  rationale: string;
}

export type DeferredSurfacePromotionArtifactHealthStatus =
  | "declared_contract_only"
  | "artifact_missing"
  | "artifact_unreadable"
  | "artifact_healthy";

export interface DeferredSurfacePromotionArtifactHealth {
  path: string;
  status: DeferredSurfacePromotionArtifactHealthStatus;
  detail: string;
}

export interface DeferredSurfacePromotionCandidateHealth {
  id: DeferredSurfacePromotionCandidateId;
  status: DeferredSurfacePromotionArtifactHealthStatus;
  summary: string;
  machineArtifacts: DeferredSurfacePromotionArtifactHealth[];
  auditEvidence: DeferredSurfacePromotionArtifactHealth[];
}

export interface DeferredSurfacePromotionReadiness {
  contractVersion: number;
  ready: boolean;
  candidates: DeferredSurfacePromotionCandidateHealth[];
}

export interface DeferredSurfacePromotionContract {
  schemaVersion: 1;
  contractVersion: 3;
  status: "explicit_promotion_required";
  promotionRequirements: DeferredSurfacePromotionRequirement[];
  initialPromotionCandidates: DeferredSurfacePromotionCandidate[];
  explicitlyDeferredSurfaces: Array<{
    id: string;
    label: string;
    status: "deferred";
    reason: string;
  }>;
  boundary: {
    verifyRemainsPrimaryGate: true;
    ciVerifyRemainsPrimaryGate: true;
    supportSurfacesCannotBecomeAccidentalBlockers: true;
    promotionRequiresDedicatedAcceptanceCoverage: true;
    promotionRequiresDeterministicLocalArtifacts: true;
  };
}

export const DEFERRED_SURFACE_CONTRACT_VERSION = 3;

export const DEFERRED_SURFACE_CONTRACTS: DeferredSurfaceContract[] = [
  {
    id: "distributed-execution",
    kind: "distributed",
    status: "deferred",
    reason: "Distributed execution and remote runtime remain extended runtime experiments until the contract-aware mainline is stronger.",
    allowedRegressionArea: "runtime-extended",
    allowedDoctorProfiles: ["runtime"],
    forbiddenDoctorProfiles: ["v1", "pilot", "global"],
    doesBlockV1Readiness: false,
    canOverrideVerify: false,
    productizedInV1: false,
    regressionSuites: [
      "distributed-scheduler-mvp.ts",
      "distributed-cache-mvp.ts",
      "distributed-cache-invalidation-warmup.ts",
      "remote-runtime-mvp.ts",
    ],
  },
  {
    id: "collaboration-workspace",
    kind: "collaboration",
    status: "deferred",
    reason: "Collaboration, conflict resolution, locking, notifications, and analytics are not V1 mainline readiness gates.",
    allowedRegressionArea: "runtime-extended",
    allowedDoctorProfiles: ["runtime"],
    forbiddenDoctorProfiles: ["v1", "pilot", "global"],
    doesBlockV1Readiness: false,
    canOverrideVerify: false,
    productizedInV1: false,
    regressionSuites: [
      "collaboration-mvp.ts",
      "conflict-resolution-mvp.ts",
      "collaboration-locking-mvp.ts",
      "collaboration-notifications-mvp.ts",
      "collaboration-analytics-mvp.ts",
    ],
  },
  {
    id: "presence-awareness",
    kind: "presence",
    status: "deferred",
    reason: "Presence and awareness signals may support a future workspace, but cannot affect local verify or V1 readiness.",
    allowedRegressionArea: "runtime-extended",
    allowedDoctorProfiles: ["runtime"],
    forbiddenDoctorProfiles: ["v1", "pilot", "global"],
    doesBlockV1Readiness: false,
    canOverrideVerify: false,
    productizedInV1: false,
    regressionSuites: [
      "collaboration-awareness-mvp.ts",
    ],
  },
];

export const DEFERRED_SURFACE_PROMOTION_CONTRACT: DeferredSurfacePromotionContract = {
  schemaVersion: 1,
  contractVersion: DEFERRED_SURFACE_CONTRACT_VERSION,
  status: "explicit_promotion_required",
  promotionRequirements: [
    {
      id: "stable_machine_artifacts",
      description: "A promotable support surface must publish stable machine-readable artifacts.",
      machineVerifiableIntent: "Machine artifacts are explicit, stable, and suitable for deterministic consumption.",
    },
    {
      id: "audit_evidence",
      description: "Meaningful actions must record audit evidence before the surface can gate broader closure.",
      machineVerifiableIntent: "Audit events or equivalent action trails exist for the promoted surface.",
    },
    {
      id: "owner_and_next_command",
      description: "Promotion requires explicit owner-action and next-command semantics.",
      machineVerifiableIntent: "The surface can tell a human who owns the next move and how to execute it.",
    },
    {
      id: "cannot_override_verify",
      description: "No promoted support surface may override verify or ci:verify.",
      machineVerifiableIntent: "The surface stays additive around the primary verification gates.",
    },
    {
      id: "dedicated_acceptance_scenarios",
      description: "Promotion requires dedicated North Star acceptance scenarios.",
      machineVerifiableIntent: "Acceptance coverage proves the surface inside the global closure loop.",
    },
    {
      id: "deterministic_local_first_behavior",
      description: "Promotion requires deterministic local-first behavior.",
      machineVerifiableIntent: "The surface remains local-first and does not depend on hidden remote synthesis.",
    },
  ],
  initialPromotionCandidates: [
    {
      id: "console_governance_export",
      status: "promotion_candidate",
      currentRole: "support_surface",
      targetRole: "required_global_closure_surface",
      owner: "Console Governance Owner",
      nextCommand: "npm run jispec -- console export-governance --root . --json",
      machineArtifacts: [".spec/console/governance-snapshot.json"],
      auditEvidence: [".spec/audit/events.jsonl"],
      acceptanceScenarios: ["console_source_evolution", "doctor_global_health"],
      localFirst: true,
      cannotOverrideVerify: true,
      deterministicArtifactsOnly: true,
      rationale: "Console governance export already emits a stable local snapshot that global closure consumes without rescanning source.",
    },
    {
      id: "multi_repo_governance_aggregate",
      status: "promotion_candidate",
      currentRole: "support_surface",
      targetRole: "required_global_closure_surface",
      owner: "Console Governance Owner",
      nextCommand: "npm run jispec -- console aggregate-governance --dir <path> --root . --json",
      machineArtifacts: [".spec/console/multi-repo-governance.json"],
      auditEvidence: [".spec/console/multi-repo-governance.json", ".spec/audit/events.jsonl"],
      acceptanceScenarios: ["multi_repo_owner_action", "release_compare_global_context", "doctor_global_health"],
      localFirst: true,
      cannotOverrideVerify: true,
      deterministicArtifactsOnly: true,
      rationale: "The aggregate already turns exported local snapshots into explicit drift hints and owner actions without becoming a hidden gate.",
    },
  ],
  explicitlyDeferredSurfaces: [
    {
      id: "collaboration-workspace",
      label: "Collaboration workspace",
      status: "deferred",
      reason: "Collaboration remains a support surface until it earns deterministic artifacts and dedicated global-closure acceptance.",
    },
    {
      id: "presence-awareness",
      label: "Presence awareness",
      status: "deferred",
      reason: "Presence signals remain soft hints and cannot become accidental blockers.",
    },
    {
      id: "distributed-execution",
      label: "Distributed execution",
      status: "deferred",
      reason: "Distributed execution remains runtime-only until it can preserve local-first determinism.",
    },
    {
      id: "notifications",
      label: "Notifications",
      status: "deferred",
      reason: "Notifications remain supportive workflow signals, not readiness gates.",
    },
    {
      id: "conflict-resolution",
      label: "Conflict resolution",
      status: "deferred",
      reason: "Conflict resolution remains part of the collaboration workspace support plane until promotion is explicitly proven.",
    },
  ],
  boundary: {
    verifyRemainsPrimaryGate: true,
    ciVerifyRemainsPrimaryGate: true,
    supportSurfacesCannotBecomeAccidentalBlockers: true,
    promotionRequiresDedicatedAcceptanceCoverage: true,
    promotionRequiresDeterministicLocalArtifacts: true,
  },
};

export function getDeferredSurfaceContracts(): DeferredSurfaceContract[] {
  return DEFERRED_SURFACE_CONTRACTS;
}

export function getDeferredRegressionSuites(): string[] {
  return DEFERRED_SURFACE_CONTRACTS.flatMap((surface) => surface.regressionSuites).sort((left, right) => left.localeCompare(right));
}

export function getDeferredSurfacePromotionContract(): DeferredSurfacePromotionContract {
  return DEFERRED_SURFACE_PROMOTION_CONTRACT;
}

export function getDeferredSurfacePromotionCandidateIds(): DeferredSurfacePromotionCandidateId[] {
  return DEFERRED_SURFACE_PROMOTION_CONTRACT.initialPromotionCandidates
    .map((candidate) => candidate.id)
    .sort((left, right) => left.localeCompare(right));
}

export function assessDeferredSurfacePromotionReadiness(rootInput: string): DeferredSurfacePromotionReadiness {
  const root = path.resolve(rootInput);
  const candidates = DEFERRED_SURFACE_PROMOTION_CONTRACT.initialPromotionCandidates.map((candidate) =>
    assessDeferredSurfacePromotionCandidateHealth(root, candidate)
  );
  return {
    contractVersion: DEFERRED_SURFACE_PROMOTION_CONTRACT.contractVersion,
    ready: candidates.every((candidate) => candidate.status === "artifact_healthy"),
    candidates,
  };
}

export function assessDeferredSurfacePromotionCandidateHealth(
  rootInput: string,
  candidate: DeferredSurfacePromotionCandidate,
): DeferredSurfacePromotionCandidateHealth {
  const root = path.resolve(rootInput);
  const machineArtifacts = candidate.machineArtifacts.map((artifactPath) => assessPromotionArtifact(root, artifactPath));
  const hasHealthyMachineArtifact = machineArtifacts.some((artifact) => artifact.status === "artifact_healthy");
  const auditEvidence = candidate.auditEvidence.map((artifactPath) =>
    hasHealthyMachineArtifact
      ? assessPromotionArtifact(root, artifactPath)
      : {
          path: artifactPath,
          status: "declared_contract_only" as const,
          detail: "Primary machine artifact is not materialized yet, so audit evidence remains declared-only.",
        }
  );
  const status = summarizeCandidateHealth(machineArtifacts, auditEvidence);

  return {
    id: candidate.id,
    status,
    summary: summarizeCandidateHealthText(status),
    machineArtifacts,
    auditEvidence,
  };
}

function summarizeCandidateHealth(
  machineArtifacts: DeferredSurfacePromotionArtifactHealth[],
  auditEvidence: DeferredSurfacePromotionArtifactHealth[],
): DeferredSurfacePromotionArtifactHealthStatus {
  const allArtifacts = [...machineArtifacts, ...auditEvidence];
  if (allArtifacts.some((artifact) => artifact.status === "artifact_unreadable")) {
    return "artifact_unreadable";
  }
  const machineMaterialized = machineArtifacts.some((artifact) => artifact.status === "artifact_healthy");
  if (!machineMaterialized && machineArtifacts.every((artifact) => artifact.status === "artifact_missing")) {
    return "declared_contract_only";
  }
  if (allArtifacts.some((artifact) => artifact.status === "artifact_missing")) {
    return "artifact_missing";
  }
  if (allArtifacts.some((artifact) => artifact.status === "declared_contract_only")) {
    return "declared_contract_only";
  }
  return "artifact_healthy";
}

function summarizeCandidateHealthText(status: DeferredSurfacePromotionArtifactHealthStatus): string {
  switch (status) {
    case "declared_contract_only":
      return "Declared contract exists, but the promotable surface has not materialized its supporting artifacts yet.";
    case "artifact_missing":
      return "Primary artifacts exist, but required audit evidence is still missing.";
    case "artifact_unreadable":
      return "Required artifacts exist, but at least one machine artifact or audit evidence file is unreadable.";
    case "artifact_healthy":
      return "Machine artifacts and audit evidence are present and readable.";
  }
}

function assessPromotionArtifact(
  root: string,
  artifactPath: string,
): DeferredSurfacePromotionArtifactHealth {
  const resolvedPath = path.join(root, artifactPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      path: artifactPath,
      status: "artifact_missing",
      detail: "Artifact file does not exist.",
    };
  }

  try {
    const content = fs.readFileSync(resolvedPath, "utf-8");
    if (artifactPath.endsWith(".json")) {
      JSON.parse(content);
    } else if (artifactPath.endsWith(".jsonl")) {
      const lines = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
      if (lines.length === 0) {
        throw new Error("JSONL artifact has no records.");
      }
      for (const line of lines) {
        const parsed = JSON.parse(line);
        if (!isRecord(parsed)) {
          throw new Error("JSONL artifact contains a non-object record.");
        }
      }
    } else if (content.trim().length === 0) {
      throw new Error("Artifact file is empty.");
    }
  } catch (error) {
    return {
      path: artifactPath,
      status: "artifact_unreadable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    path: artifactPath,
    status: "artifact_healthy",
    detail: "Artifact is present and readable.",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
