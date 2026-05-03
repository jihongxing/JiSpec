export type DisciplinePhase =
  | "intent"
  | "design"
  | "plan"
  | "implement"
  | "debug"
  | "verify"
  | "handoff";

export type DisciplineMode = "strict_gate" | "fast_advisory";

export type DisciplineProvenance =
  | "EXTRACTED"
  | "INFERRED"
  | "AMBIGUOUS"
  | "OWNER_REVIEW"
  | "UNKNOWN";

export type CompletionEvidenceStatus =
  | "incomplete"
  | "ready_for_verify"
  | "verified"
  | "verified_with_advisory"
  | "blocked"
  | "owner_review_required";

export type DisciplineCheckStatus = "passed" | "failed" | "not_run" | "not_applicable";

export interface DisciplineTruthSource {
  path: string;
  provenance: DisciplineProvenance;
  note: string;
}

export interface DisciplineCommandEvidence {
  command: string;
  exitCode: number | null;
  ranAt: string;
  evidenceKind: "test" | "typecheck" | "verify" | "scope_check" | "patch_apply" | "owner_review";
  summary: string;
}

export interface TestStrategy {
  command: string;
  scope: "docs_only" | "contract_critical" | "mixed" | "unknown";
  expectedSignal: string;
  whySufficient: string;
  deterministic: boolean;
  ownerReviewRequired: boolean;
}

export interface PhaseTransition {
  phase: DisciplinePhase;
  status: DisciplineCheckStatus;
  actor: string;
  timestamp: string;
  sourceCommand: string;
  truthSources: DisciplineTruthSource[];
}

export interface AgentRunSession {
  schemaVersion: 1;
  kind: "jispec-agent-discipline-session";
  sessionId: string;
  generatedAt: string;
  mode: DisciplineMode;
  currentPhase: DisciplinePhase;
  transitions: PhaseTransition[];
  allowedPaths: string[];
  touchedPaths: string[];
  unexpectedPaths: string[];
  testStrategy?: TestStrategy;
  truthSources: DisciplineTruthSource[];
}

export interface CompletionEvidence {
  schemaVersion: 1;
  kind: "jispec-agent-completion-evidence";
  sessionId: string;
  generatedAt: string;
  status: CompletionEvidenceStatus;
  commands: DisciplineCommandEvidence[];
  verifyCommand?: string;
  verifyVerdict?: string;
  missingEvidence: string[];
  truthSources: DisciplineTruthSource[];
}

export interface DebugPacket {
  schemaVersion: 1;
  kind: "jispec-agent-debug-packet";
  sessionId: string;
  generatedAt: string;
  stopPoint: string;
  failedCommand?: string;
  exitCode?: number | null;
  failingCheck: string;
  minimalReproductionCommand: string;
  observedEvidence: string[];
  currentHypothesis: string;
  filesLikelyInvolved: string[];
  repeatedFailureCount: number;
  nextAllowedAction: string;
  retryCommand: string;
  truthSources: DisciplineTruthSource[];
}

export interface ReviewDiscipline {
  schemaVersion: 1;
  kind: "jispec-agent-review-discipline";
  sessionId: string;
  purpose: string;
  impactedContracts: string[];
  verificationCommands: string[];
  uncoveredRisks: string[];
  advisoryItems: string[];
  ownerDecisions: string[];
  nextReviewerAction: string;
  truthSources: DisciplineTruthSource[];
}

export interface DisciplineReport {
  schemaVersion: 1;
  kind: "jispec-agent-discipline-report";
  sessionId: string;
  generatedAt: string;
  mode: DisciplineMode;
  phaseGate: {
    status: DisciplineCheckStatus;
    issues: string[];
  };
  testStrategy: {
    status: DisciplineCheckStatus;
    ownerReviewRequired: boolean;
    command?: string;
  };
  completion: {
    status: CompletionEvidenceStatus;
    missingEvidence: string[];
  };
  isolation: {
    allowedPaths: string[];
    touchedPaths: string[];
    unexpectedPaths: string[];
  };
  artifacts: {
    sessionPath: string;
    completionEvidencePath?: string;
    debugPacketPath?: string;
    debugPacketMarkdownPath?: string;
    summaryPath?: string;
  };
  truthSources: DisciplineTruthSource[];
}
