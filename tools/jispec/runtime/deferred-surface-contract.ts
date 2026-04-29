export type DeferredSurfaceKind = "distributed" | "collaboration" | "presence";

export interface DeferredSurfaceContract {
  id: string;
  kind: DeferredSurfaceKind;
  status: "deferred";
  reason: string;
  allowedRegressionArea: "runtime-extended";
  allowedDoctorProfiles: ["runtime"];
  forbiddenDoctorProfiles: ["v1"];
  doesBlockV1Readiness: false;
  canOverrideVerify: false;
  productizedInV1: false;
  regressionSuites: string[];
}

export const DEFERRED_SURFACE_CONTRACT_VERSION = 1;

export const DEFERRED_SURFACE_CONTRACTS: DeferredSurfaceContract[] = [
  {
    id: "distributed-execution",
    kind: "distributed",
    status: "deferred",
    reason: "Distributed execution and remote runtime remain extended runtime experiments until the contract-aware mainline is stronger.",
    allowedRegressionArea: "runtime-extended",
    allowedDoctorProfiles: ["runtime"],
    forbiddenDoctorProfiles: ["v1"],
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
    forbiddenDoctorProfiles: ["v1"],
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
    forbiddenDoctorProfiles: ["v1"],
    doesBlockV1Readiness: false,
    canOverrideVerify: false,
    productizedInV1: false,
    regressionSuites: [
      "collaboration-awareness-mvp.ts",
    ],
  },
];

export function getDeferredSurfaceContracts(): DeferredSurfaceContract[] {
  return DEFERRED_SURFACE_CONTRACTS;
}

export function getDeferredRegressionSuites(): string[] {
  return DEFERRED_SURFACE_CONTRACTS.flatMap((surface) => surface.regressionSuites).sort((left, right) => left.localeCompare(right));
}
