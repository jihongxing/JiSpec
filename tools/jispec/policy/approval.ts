import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { appendAuditEvent, inferAuditActor, normalizeAuditPath } from "../audit/event-ledger";
import { loadVerifyPolicy } from "./policy-loader";
import type { TeamPolicyProfile, TeamPolicyProfileName, VerifyPolicy } from "./policy-schema";

export const APPROVAL_RECORDS_RELATIVE_DIR = ".spec/approvals";
export const APPROVAL_RECORDS_PATH_PATTERN = ".spec/approvals/*.json";

export type ApprovalSubjectKind =
  | "policy_change"
  | "waiver_change"
  | "release_drift"
  | "execute_default_change"
  | "pilot_risk_acceptance";

export type ApprovalDecisionStatus = "approved" | "rejected";
export type ApprovalActorRole = "owner" | "reviewer";
export type ApprovalWorkflowStatus = "approval_missing" | "approval_stale" | "approval_satisfied";

export interface ApprovalSubjectRef {
  kind: ApprovalSubjectKind;
  ref: string;
  hash: string;
}

export interface ApprovalRequirement {
  profile: TeamPolicyProfileName;
  owner: string;
  reviewers: string[];
  requiredReviewers: number;
  ownerApprovalAllowed: true;
  contract: "reviewer_quorum_or_owner_approval";
}

export interface PolicyApprovalRecord {
  version: 1;
  id: string;
  status: ApprovalDecisionStatus;
  subject: ApprovalSubjectRef;
  requirement: ApprovalRequirement;
  decision: {
    actor: string;
    role: ApprovalActorRole;
    reason: string;
    decidedAt: string;
    expiresAt?: string;
  };
  boundary: {
    localOnly: true;
    sourceUploadRequired: false;
    llmBlockingJudge: false;
    consoleOverridesVerify: false;
  };
}

export interface PolicyApprovalRecordInput {
  subjectKind: ApprovalSubjectKind;
  subjectRef?: string;
  actor?: string;
  role?: ApprovalActorRole;
  status?: ApprovalDecisionStatus;
  reason: string;
  decidedAt?: string;
  expiresAt?: string;
  id?: string;
}

export interface PolicyApprovalRecordResult {
  root: string;
  recordPath: string;
  approval: PolicyApprovalRecord;
}

export interface ApprovalSubjectEvaluation {
  subject: ApprovalSubjectRef;
  requirement: ApprovalRequirement;
  status: ApprovalWorkflowStatus;
  approvedReviewers: string[];
  ownerApprovedBy: string | null;
  currentApprovalIds: string[];
  staleApprovalIds: string[];
  rejectedApprovalIds: string[];
  missingReviewers: number;
  reason: string;
}

export interface PolicyApprovalWorkflowPosture {
  version: 1;
  root: string;
  generatedAt: string;
  boundary: {
    localOnly: true;
    sourceUploadRequired: false;
    llmBlockingJudge: false;
    consoleOverridesVerify: false;
    replacesVerify: false;
  };
  profile: TeamPolicyProfileName;
  requirement: ApprovalRequirement;
  status: ApprovalWorkflowStatus;
  subjects: ApprovalSubjectEvaluation[];
  summary: {
    totalSubjects: number;
    satisfied: number;
    missing: number;
    stale: number;
    approvals: number;
    currentApprovals: number;
    staleApprovals: number;
    rejectedApprovals: number;
  };
}

export function recordPolicyApproval(
  rootInput: string,
  input: PolicyApprovalRecordInput,
): PolicyApprovalRecordResult {
  const root = path.resolve(rootInput);
  if (!input.reason || !input.reason.trim()) {
    throw new Error("Approval reason is required.");
  }
  validateSubjectKind(input.subjectKind);
  validateDecisionStatus(input.status ?? "approved");
  validateActorRole(input.role ?? "reviewer");

  const policy = loadVerifyPolicy(root);
  const requirement = buildApprovalRequirement(policy?.team);
  const subject = resolveApprovalSubject(root, input.subjectKind, input.subjectRef);
  const actor = normalizeText(input.actor) ?? inferAuditActor();
  const decidedAt = input.decidedAt ?? new Date().toISOString();
  validateIsoDate(decidedAt, "decidedAt");
  if (input.expiresAt !== undefined) {
    validateIsoDate(input.expiresAt, "expiresAt");
  }

  const approval: PolicyApprovalRecord = {
    version: 1,
    id: input.id ? sanitizeId(input.id) : `approval-${crypto.randomUUID()}`,
    status: input.status ?? "approved",
    subject,
    requirement,
    decision: {
      actor,
      role: input.role ?? "reviewer",
      reason: input.reason.trim(),
      decidedAt,
      expiresAt: normalizeText(input.expiresAt),
    },
    boundary: {
      localOnly: true,
      sourceUploadRequired: false,
      llmBlockingJudge: false,
      consoleOverridesVerify: false,
    },
  };

  const recordPath = path.join(root, APPROVAL_RECORDS_RELATIVE_DIR, `${approval.id}.json`);
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, `${JSON.stringify(approval, null, 2)}\n`, "utf-8");

  appendAuditEvent(root, {
    type: "policy_approval_decision",
    actor,
    reason: approval.decision.reason,
    sourceArtifact: {
      kind: "policy-approval",
      path: recordPath,
    },
    affectedContracts: [
      subject.ref,
      `${subject.kind}:${subject.hash}`,
      `approval_profile:${requirement.profile}`,
    ],
    details: {
      approvalId: approval.id,
      subject: approval.subject,
      status: approval.status,
      role: approval.decision.role,
      requirement: approval.requirement,
      boundary: approval.boundary,
    },
  });

  return {
    root,
    recordPath,
    approval,
  };
}

export function evaluatePolicyApprovalWorkflow(rootInput: string): PolicyApprovalWorkflowPosture {
  const root = path.resolve(rootInput);
  const policy = loadVerifyPolicy(root);
  const requirement = buildApprovalRequirement(policy?.team);
  const approvals = readPolicyApprovals(root);
  const subjects = discoverApprovalSubjects(root, policy)
    .map((subject) => evaluateApprovalSubject(subject, requirement, approvals));
  const summary = summarizeSubjects(subjects, approvals);

  return {
    version: 1,
    root,
    generatedAt: new Date().toISOString(),
    boundary: {
      localOnly: true,
      sourceUploadRequired: false,
      llmBlockingJudge: false,
      consoleOverridesVerify: false,
      replacesVerify: false,
    },
    profile: requirement.profile,
    requirement,
    status: subjects.length === 0
      ? "approval_missing"
      : subjects.some((subject) => subject.status === "approval_missing")
        ? "approval_missing"
        : subjects.some((subject) => subject.status === "approval_stale")
          ? "approval_stale"
          : "approval_satisfied",
    subjects,
    summary,
  };
}

export function readPolicyApprovals(rootInput: string): PolicyApprovalRecord[] {
  const root = path.resolve(rootInput);
  const dir = path.join(root, APPROVAL_RECORDS_RELATIVE_DIR);
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(dir, entry.name))
    .sort((left, right) => left.localeCompare(right))
    .map((approvalPath) => validateApprovalRecord(JSON.parse(fs.readFileSync(approvalPath, "utf-8"))));
}

export function renderPolicyApprovalWorkflowText(posture: PolicyApprovalWorkflowPosture): string {
  const lines = [
    "Policy approval workflow",
    `Status: ${posture.status}`,
    `Profile: ${posture.profile}`,
    `Requirement: ${posture.requirement.requiredReviewers} reviewer(s) or owner approval`,
    `Subjects: ${posture.summary.totalSubjects}`,
    `Approvals: ${posture.summary.approvals}`,
  ];

  for (const subject of posture.subjects) {
    lines.push("");
    lines.push(`- ${subject.subject.kind}: ${subject.subject.ref}`);
    lines.push(`  Status: ${subject.status}`);
    lines.push(`  Reason: ${subject.reason}`);
    lines.push(`  Owner approval: ${subject.ownerApprovedBy ?? "none"}`);
    lines.push(`  Reviewers: ${subject.approvedReviewers.length > 0 ? subject.approvedReviewers.join(", ") : "none"}`);
  }

  lines.push("");
  lines.push("Boundary: local structured approvals only; no source upload, no LLM blocking judge, no Console override of verify.");
  return lines.join("\n");
}

export function renderPolicyApprovalWorkflowJSON(posture: PolicyApprovalWorkflowPosture): string {
  return JSON.stringify(posture, null, 2);
}

export function buildApprovalRequirement(team?: TeamPolicyProfile): ApprovalRequirement {
  const profile = team?.profile ?? "small_team";
  const defaultReviewers = profile === "solo" ? 0 : profile === "regulated" ? 2 : 1;
  return {
    profile,
    owner: normalizeText(team?.owner) ?? "unassigned",
    reviewers: stableUnique(Array.isArray(team?.reviewers) ? team.reviewers : []),
    requiredReviewers: typeof team?.required_reviewers === "number" ? team.required_reviewers : defaultReviewers,
    ownerApprovalAllowed: true,
    contract: "reviewer_quorum_or_owner_approval",
  };
}

function discoverApprovalSubjects(root: string, policy: VerifyPolicy | null): ApprovalSubjectRef[] {
  if (!policy) {
    return [];
  }

  const subjects: ApprovalSubjectRef[] = [
    resolveApprovalSubject(root, "policy_change", ".spec/policy.yaml"),
  ];

  if (policy.execute_default !== undefined) {
    subjects.push(resolveApprovalSubject(root, "execute_default_change", ".spec/policy.yaml"));
  }

  for (const waiverPath of listDirectFiles(root, ".spec/waivers", ".json")) {
    subjects.push(resolveApprovalSubject(root, "waiver_change", waiverPath));
  }

  const latestReleaseCompare = latestReleaseCompareReport(root);
  if (latestReleaseCompare) {
    subjects.push(resolveApprovalSubject(root, "release_drift", latestReleaseCompare));
  }
  if (requiresPilotRiskAcceptance(root)) {
    subjects.push(resolveApprovalSubject(root, "pilot_risk_acceptance", ".spec/privacy/privacy-report.json"));
  }

  return dedupeSubjects(subjects);
}

function evaluateApprovalSubject(
  subject: ApprovalSubjectRef,
  requirement: ApprovalRequirement,
  approvals: PolicyApprovalRecord[],
): ApprovalSubjectEvaluation {
  const related = approvals.filter((approval) =>
    approval.subject.kind === subject.kind &&
    normalizePath(approval.subject.ref) === normalizePath(subject.ref)
  );
  const rejected = related.filter((approval) => approval.status === "rejected");
  const stale = related.filter((approval) => approval.status === "approved" && isApprovalStale(approval, subject));
  const current = related.filter((approval) => approval.status === "approved" && !isApprovalStale(approval, subject));
  const ownerApproval = current.find((approval) => approval.decision.role === "owner");
  const reviewerApprovals = stableUnique(current
    .filter((approval) => approval.decision.role === "reviewer")
    .map((approval) => approval.decision.actor));
  const missingReviewers = Math.max(0, requirement.requiredReviewers - reviewerApprovals.length);
  const satisfied = Boolean(ownerApproval) || reviewerApprovals.length >= requirement.requiredReviewers;

  return {
    subject,
    requirement,
    status: satisfied ? "approval_satisfied" : stale.length > 0 ? "approval_stale" : "approval_missing",
    approvedReviewers: reviewerApprovals,
    ownerApprovedBy: ownerApproval?.decision.actor ?? null,
    currentApprovalIds: current.map((approval) => approval.id),
    staleApprovalIds: stale.map((approval) => approval.id),
    rejectedApprovalIds: rejected.map((approval) => approval.id),
    missingReviewers,
    reason: satisfied
      ? "Approval requirement is satisfied by reviewer quorum or owner approval."
      : stale.length > 0
        ? "Existing approval is expired or no longer matches the current subject hash."
        : `Missing ${missingReviewers} reviewer approval(s) or owner approval.`,
  };
}

function resolveApprovalSubject(root: string, kind: ApprovalSubjectKind, ref?: string): ApprovalSubjectRef {
  validateSubjectKind(kind);
  const subjectRef = normalizePath(ref ?? defaultSubjectRef(root, kind));
  const absolute = path.isAbsolute(subjectRef) ? subjectRef : path.join(root, subjectRef);
  const hash = fs.existsSync(absolute) && fs.statSync(absolute).isFile()
    ? hashContent(fs.readFileSync(absolute))
    : `missing:${subjectRef}`;

  return {
    kind,
    ref: normalizeAuditPath(root, subjectRef),
    hash,
  };
}

function defaultSubjectRef(root: string, kind: ApprovalSubjectKind): string {
  if (kind === "release_drift") {
    return latestReleaseCompareReport(root) ?? ".spec/releases/compare";
  }
  if (kind === "pilot_risk_acceptance") {
    return ".spec/privacy/privacy-report.json";
  }
  if (kind === "waiver_change") {
    return ".spec/waivers";
  }
  return ".spec/policy.yaml";
}

function summarizeSubjects(
  subjects: ApprovalSubjectEvaluation[],
  approvals: PolicyApprovalRecord[],
): PolicyApprovalWorkflowPosture["summary"] {
  return {
    totalSubjects: subjects.length,
    satisfied: subjects.filter((subject) => subject.status === "approval_satisfied").length,
    missing: subjects.filter((subject) => subject.status === "approval_missing").length,
    stale: subjects.filter((subject) => subject.status === "approval_stale").length,
    approvals: approvals.length,
    currentApprovals: subjects.reduce((sum, subject) => sum + subject.currentApprovalIds.length, 0),
    staleApprovals: subjects.reduce((sum, subject) => sum + subject.staleApprovalIds.length, 0),
    rejectedApprovals: subjects.reduce((sum, subject) => sum + subject.rejectedApprovalIds.length, 0),
  };
}

function validateApprovalRecord(value: unknown): PolicyApprovalRecord {
  if (!isRecord(value)) {
    throw new Error("Approval record must be a JSON object.");
  }
  if (value.version !== 1) {
    throw new Error("Approval record version must be 1.");
  }
  if (!isRecord(value.subject)) {
    throw new Error("Approval record subject is required.");
  }
  validateSubjectKind(value.subject.kind);
  validateDecisionStatus(value.status);
  if (!isRecord(value.decision)) {
    throw new Error("Approval record decision is required.");
  }
  validateActorRole(value.decision.role);
  if (!isRecord(value.requirement)) {
    throw new Error("Approval record requirement is required.");
  }
  if (!isRecord(value.boundary) || value.boundary.llmBlockingJudge !== false || value.boundary.sourceUploadRequired !== false) {
    throw new Error("Approval record boundary must keep local-only non-LLM gate semantics.");
  }
  return value as unknown as PolicyApprovalRecord;
}

function isApprovalStale(approval: PolicyApprovalRecord, currentSubject: ApprovalSubjectRef): boolean {
  if (approval.subject.hash !== currentSubject.hash) {
    return true;
  }
  const expiresAt = normalizeText(approval.decision.expiresAt);
  if (!expiresAt) {
    return false;
  }
  const time = new Date(expiresAt).getTime();
  return !Number.isNaN(time) && time < Date.now();
}

function latestReleaseCompareReport(root: string): string | undefined {
  const compareRoot = path.join(root, ".spec", "releases", "compare");
  if (!fs.existsSync(compareRoot)) {
    return undefined;
  }
  return fs.readdirSync(compareRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => normalizePath(path.posix.join(".spec/releases/compare", entry.name, "compare-report.json")))
    .filter((relativePath) => fs.existsSync(path.join(root, relativePath)))
    .sort((left, right) => left.localeCompare(right))
    .at(-1);
}

function requiresPilotRiskAcceptance(root: string): boolean {
  const privacyReportPath = path.join(root, ".spec", "privacy", "privacy-report.json");
  if (!fs.existsSync(privacyReportPath)) {
    return false;
  }
  try {
    const report = JSON.parse(fs.readFileSync(privacyReportPath, "utf-8")) as unknown;
    if (!isRecord(report) || !isRecord(report.summary)) {
      return false;
    }
    return numericValue(report.summary.highSeverityFindingCount) > 0 ||
      numericValue(report.summary.reviewBeforeSharingArtifactCount) > 0;
  } catch {
    return true;
  }
}

function numericValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function listDirectFiles(root: string, relativeDir: string, extension: string): string[] {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }
  return fs.readdirSync(absoluteDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => normalizePath(path.posix.join(relativeDir, entry.name)))
    .sort((left, right) => left.localeCompare(right));
}

function dedupeSubjects(subjects: ApprovalSubjectRef[]): ApprovalSubjectRef[] {
  const seen = new Set<string>();
  return subjects.filter((subject) => {
    const key = `${subject.kind}:${subject.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function validateSubjectKind(value: unknown): asserts value is ApprovalSubjectKind {
  if (!["policy_change", "waiver_change", "release_drift", "execute_default_change", "pilot_risk_acceptance"].includes(String(value))) {
    throw new Error("Approval subject kind must be policy_change, waiver_change, release_drift, execute_default_change, or pilot_risk_acceptance.");
  }
}

function validateDecisionStatus(value: unknown): asserts value is ApprovalDecisionStatus {
  if (!["approved", "rejected"].includes(String(value))) {
    throw new Error("Approval status must be approved or rejected.");
  }
}

function validateActorRole(value: unknown): asserts value is ApprovalActorRole {
  if (!["owner", "reviewer"].includes(String(value))) {
    throw new Error("Approval role must be owner or reviewer.");
  }
}

function validateIsoDate(value: string, label: string): void {
  if (Number.isNaN(new Date(value).getTime())) {
    throw new Error(`Approval ${label} must be a valid ISO date.`);
  }
}

function sanitizeId(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
  if (!normalized) {
    throw new Error("Approval id must contain at least one safe filename character.");
  }
  return normalized;
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right));
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function hashContent(content: Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
