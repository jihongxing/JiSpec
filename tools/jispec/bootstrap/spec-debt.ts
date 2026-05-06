import fs from "node:fs";
import path from "node:path";
import { normalizeEvidencePath } from "./evidence-graph";
import type { DraftArtifact, DraftArtifactKind } from "./draft";

export type BootstrapSpecDebtStatus = "pending" | "owner_review_requested" | "repaid" | "cancelled";

export interface SpecDebtRecord {
  id?: string;
  sessionId: string;
  artifactKind: DraftArtifactKind;
  createdAt: string;
  draftRelativePath: string;
  sourceFiles: string[];
  confidenceScore: number;
  provenanceNote: string;
  draftContent: string;
  note?: string;
  status?: BootstrapSpecDebtStatus;
  updatedAt?: string;
  ownerReview?: {
    requestedAt: string;
    requestedBy: string;
    reason: string;
  };
  resolution?: {
    status: Extract<BootstrapSpecDebtStatus, "repaid" | "cancelled">;
    resolvedAt: string;
    resolvedBy: string;
    reason: string;
  };
}

export function createSpecDebtRecord(
  sessionId: string,
  artifact: DraftArtifact,
  note?: string,
): SpecDebtRecord {
  return {
    id: buildBootstrapSpecDebtId(sessionId, artifact.kind),
    sessionId,
    artifactKind: artifact.kind,
    createdAt: new Date().toISOString(),
    draftRelativePath: artifact.relativePath,
    sourceFiles: [...artifact.sourceFiles].sort((left, right) => left.localeCompare(right)),
    confidenceScore: artifact.confidenceScore,
    provenanceNote: artifact.provenanceNote,
    draftContent: artifact.content,
    note,
    status: "pending",
  };
}

export function writeSpecDebtRecord(baseDirectory: string, record: SpecDebtRecord): string {
  const resolvedBaseDirectory = path.resolve(baseDirectory);
  fs.mkdirSync(resolvedBaseDirectory, { recursive: true });
  const recordPath = path.join(resolvedBaseDirectory, `${record.artifactKind}.json`);
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  return normalizeEvidencePath(recordPath);
}

export function readBootstrapSpecDebtRecord(rootInput: string, relativePath: string): SpecDebtRecord | undefined {
  const root = path.resolve(rootInput);
  const recordPath = path.join(root, relativePath);
  if (!fs.existsSync(recordPath)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(recordPath, "utf-8")) as Partial<SpecDebtRecord>;
    return normalizeBootstrapSpecDebtRecord(parsed, relativePath);
  } catch {
    return undefined;
  }
}

export function countPendingBootstrapSpecDebtPaths(rootInput: string, relativePaths: string[]): number {
  return relativePaths.filter((relativePath) => isBootstrapSpecDebtPending(readBootstrapSpecDebtRecord(rootInput, relativePath))).length;
}

export function isBootstrapSpecDebtPending(record: { status?: string } | undefined): boolean {
  if (!record) {
    return true;
  }
  return record.status !== "repaid" && record.status !== "cancelled";
}

export function buildBootstrapSpecDebtId(sessionId: string, artifactKind: DraftArtifactKind): string {
  return `${sessionId}:${artifactKind}`;
}

function normalizeBootstrapSpecDebtRecord(
  record: Partial<SpecDebtRecord>,
  relativePath: string,
): SpecDebtRecord | undefined {
  if (!record.sessionId || !record.artifactKind || !record.createdAt || !record.draftRelativePath || !record.draftContent) {
    return undefined;
  }

  return {
    id: typeof record.id === "string" && record.id.trim().length > 0
      ? record.id
      : buildBootstrapSpecDebtId(record.sessionId, record.artifactKind),
    sessionId: record.sessionId,
    artifactKind: record.artifactKind,
    createdAt: record.createdAt,
    draftRelativePath: record.draftRelativePath,
    sourceFiles: Array.isArray(record.sourceFiles) ? record.sourceFiles.filter((entry): entry is string => typeof entry === "string") : [],
    confidenceScore: typeof record.confidenceScore === "number" ? record.confidenceScore : 0,
    provenanceNote: typeof record.provenanceNote === "string" ? record.provenanceNote : `bootstrap spec debt from ${normalizeEvidencePath(relativePath)}`,
    draftContent: record.draftContent,
    note: typeof record.note === "string" ? record.note : undefined,
    status: normalizeBootstrapSpecDebtStatus(record.status),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
    ownerReview: isBootstrapOwnerReview(record.ownerReview) ? record.ownerReview : undefined,
    resolution: isBootstrapResolution(record.resolution) ? record.resolution : undefined,
  };
}

function normalizeBootstrapSpecDebtStatus(status: unknown): BootstrapSpecDebtStatus {
  return status === "owner_review_requested" || status === "repaid" || status === "cancelled" ? status : "pending";
}

function isBootstrapOwnerReview(value: unknown): value is NonNullable<SpecDebtRecord["ownerReview"]> {
  return isRecord(value)
    && typeof value.requestedAt === "string"
    && typeof value.requestedBy === "string"
    && typeof value.reason === "string";
}

function isBootstrapResolution(value: unknown): value is NonNullable<SpecDebtRecord["resolution"]> {
  return isRecord(value)
    && (value.status === "repaid" || value.status === "cancelled")
    && typeof value.resolvedAt === "string"
    && typeof value.resolvedBy === "string"
    && typeof value.reason === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
