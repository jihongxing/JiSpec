# P10 Agent Discipline Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a deterministic Agent Discipline Layer so JiSpec can record, check, summarize, audit, and replay how AI or external coding tools move through plan, implementation, debugging, and completion evidence before code is treated as deliverable.

**Architecture:** Add a focused `tools/jispec/discipline/` module that owns schemas, artifact paths, phase transitions, test strategy checks, debug packets, completion evidence, and review discipline summaries. Integrate it lightly into the existing `change -> implement -> verify -> ci:verify` path: `implement` writes discipline artifacts, `handoff` renders them, `verify` reads them as deterministic process evidence, CI links to the summary, privacy scans them, and the regression matrix tracks them.

**Tech Stack:** TypeScript, Node.js `fs/path`, existing JiSpec JSON artifact conventions, existing `runVerify`, `runImplement`, `writeHandoffPacket`, audit ledger, privacy redaction, and custom fixture tests under `tools/jispec/tests/`.

---

## Delivery Status

Status: completed on 2026-05-03.

Implemented Tasks 1-10. Final gate results:

- Targeted P10 suites passed: `agent-discipline-artifacts.ts` 10/10, `agent-discipline-implement.ts` 4/4, `agent-discipline-verify-ci.ts` 3/3.
- Affected suites passed: `implement-patch-mediation.ts` 4/4, `implement-handoff-mainline.ts` 1/1, `verify-runner-warn-advisory.ts` 3/3, `ci-summary-markdown.ts` 4/4, `privacy-redaction.ts` 7/7, `regression-matrix-contract.ts` 5/5.
- Main gates passed: `npm run typecheck`, `npm run verify`, `npm run ci:verify`, `npm run pilot:ready`.
- Final repository `verify` and `ci:verify` verdict: `WARN_ADVISORY` with only existing `BOOTSTRAP_SPEC_DEBT_PENDING` advisory debt.
- Pilot ready gate: 7/7 passed.
- Regression manifest: 134 suites / 599 expected tests, `consistency.valid = true`, with all three P10 suites registered under `change-implement`.

## Scope

This plan implements the seven capabilities defined in `docs/superpowers/superpowers-discipline-layer.md`:

- hard phase gates
- TDD / test strategy discipline
- systematic debugging
- verification before completion
- truth source discipline
- work isolation
- review discipline

The implementation must preserve these existing authority boundaries:

- `verify` and `ci:verify` remain the merge gate.
- JiSpec still does not generate business code.
- External coding tool output still returns through `implement --external-patch`.
- Markdown remains a human companion; JSON remains the machine contract.
- Missing discipline artifacts must not crash existing verify runs.

## File Structure

Create:

- `schemas/agent-discipline.schema.json`
  Stable JSON schema for the discipline session, report, debug packet, completion evidence, and review discipline sections.

- `tools/jispec/discipline/types.ts`
  Shared TypeScript types for discipline phases, modes, statuses, test strategy, truth sources, debug packet, completion evidence, and review discipline.

- `tools/jispec/discipline/paths.ts`
  Pure path helpers for `.jispec/agent-run/<session-id>/...` artifacts.

- `tools/jispec/discipline/artifacts.ts`
  Read/write helpers for discipline JSON artifacts and summary Markdown.

- `tools/jispec/discipline/completion-evidence.ts`
  Converts `ImplementRunResult`, patch mediation state, post-verify state, and commands into completion evidence.

- `tools/jispec/discipline/phase-gate.ts`
  Validates phase order, strict/fast posture, and allowed transitions.

- `tools/jispec/discipline/test-strategy.ts`
  Builds and validates test strategy posture from change session, lane, changed paths, and configured test command.

- `tools/jispec/discipline/debug-packet.ts`
  Builds failure/debug packets from stop points, failed commands, patch mediation failures, test failures, and verify blockers.

- `tools/jispec/discipline/review-discipline.ts`
  Builds review discipline summaries for handoff/companion output.

- `tools/jispec/verify/agent-discipline-collector.ts`
  Verify supplemental collector that reads discipline artifacts and emits deterministic process issues. In `strict_gate` mode, incomplete completion evidence, failed phase/test strategy checks, and unexpected paths are blocking. In `fast_advisory` mode, the same issues remain advisory.

- `tools/jispec/tests/agent-discipline-artifacts.ts`
  Unit-style fixture tests for schema shape, path helpers, artifact writing, and Markdown summary rendering.

- `tools/jispec/tests/agent-discipline-implement.ts`
  Integration tests covering `runImplement` discipline artifacts across success, failed tests, out-of-scope patch, and verify-blocked outcomes.

- `tools/jispec/tests/agent-discipline-verify-ci.ts`
  Integration tests covering strict blocking discipline behavior, fast advisory discipline behavior, and CI summary links.

Modify:

- `tools/jispec/implement/implement-runner.ts`
  Create/update discipline session artifacts during preflight, patch mediation, failure, completion, and post-verify.

- `tools/jispec/implement/handoff-packet.ts`
  Add discipline summary and review discipline sections to handoff JSON and formatted text for outcomes that already produce handoff packets. Successful `patch_verified` and `preflight_passed` outcomes expose discipline paths through `renderImplementText` / `renderImplementJSON`, but do not need a new handoff packet just to show discipline evidence.

- `tools/jispec/implement/patch-mediation.ts`
  No P10 code change is expected unless tests expose a missing field. Existing scope/touched path evidence from `PatchMediationArtifact` should be consumed by the new discipline module.

- `tools/jispec/verify/verify-runner.ts`
  Register the discipline collector as a normal supplemental collector that emits blocking issues only for strict discipline failures and advisory issues for fast discipline findings.

- `tools/jispec/ci/verify-report.ts`
  Add optional discipline context paths to verify report modes/metadata without changing the report version.

- `tools/jispec/ci/verify-summary.ts`
  Link discipline summary in the human-readable verify summary when present.

- `tools/jispec/audit/event-ledger.ts`
  Add an `agent_discipline_recorded` event type so process-discipline artifacts are append-only audit evidence.

- `tools/jispec/privacy/redaction.ts`
  Categorize `.jispec/agent-run/` as handoff/process evidence and require review before sharing if debug or command output is present.

- `tools/jispec/tests/regression-runner.ts`
  Register P10 regression suites under `change-implement`.

- `tools/jispec/tests/regression-matrix-contract.ts`
  Update expected `change-implement` suite counts.

- `docs/superpowers/superpowers-discipline-layer.md`
  Add a short “implementation status / artifact contract” section after code lands.

- `docs/v1-mainline-stable-contract.md`
  Add discipline artifact paths as V1-compatible extension artifacts, not new merge gates.

- `README.zh-CN.md` and `README.md`
  Add one concise paragraph: JiSpec now records process discipline evidence for AI/external implementation attempts.

## Task 1: Discipline Schema And Types

**Files:**

- Create: `schemas/agent-discipline.schema.json`
- Create: `tools/jispec/discipline/types.ts`
- Create: `tools/jispec/discipline/paths.ts`
- Test: `tools/jispec/tests/agent-discipline-artifacts.ts`

- [x] **Step 1: Write failing type/path tests**

Add the first path-helper test case to `tools/jispec/tests/agent-discipline-artifacts.ts`:

```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolveAgentRunDir, resolveCompletionEvidencePath, resolveDisciplineReportPath } from "../discipline/paths";
import { cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== Agent Discipline Artifact Tests ===\n");
  let passed = 0;
  let failed = 0;

  const root = createVerifyFixture("agent-discipline-artifacts");
  try {
    assert.equal(resolveAgentRunDir(root, "change-1"), path.join(root, ".jispec", "agent-run", "change-1"));
    assert.equal(resolveCompletionEvidencePath(root, "change-1"), path.join(root, ".jispec", "agent-run", "change-1", "completion-evidence.json"));
    assert.equal(resolveDisciplineReportPath(root, "change-1"), path.join(root, ".jispec", "agent-run", "change-1", "discipline-report.json"));
    assert.equal(fs.existsSync(path.join(root, ".jispec", "agent-run")), false);
    console.log("✓ Test 1: path helpers resolve stable agent-run artifact paths without creating directories");
    passed++;
  } catch (error) {
    console.error(`✗ Test 1 failed: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  } finally {
    cleanupVerifyFixture(root);
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [x] **Step 2: Run the failing test**

Run:

```bash
node --import tsx ./tools/jispec/tests/agent-discipline-artifacts.ts
```

Expected: fail because `../discipline/paths` does not exist.

- [x] **Step 3: Add `types.ts`**

Create `tools/jispec/discipline/types.ts`:

```ts
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
```

- [x] **Step 4: Add path helpers**

Create `tools/jispec/discipline/paths.ts`:

```ts
import path from "node:path";

export function resolveAgentRunDir(root: string, sessionId: string): string {
  return path.join(root, ".jispec", "agent-run", sessionId);
}

export function resolveAgentRunSessionPath(root: string, sessionId: string): string {
  return path.join(resolveAgentRunDir(root, sessionId), "session.json");
}

export function resolveDisciplineReportPath(root: string, sessionId: string): string {
  return path.join(resolveAgentRunDir(root, sessionId), "discipline-report.json");
}

export function resolveDisciplineSummaryPath(root: string, sessionId: string): string {
  return path.join(resolveAgentRunDir(root, sessionId), "discipline-summary.md");
}

export function resolveCompletionEvidencePath(root: string, sessionId: string): string {
  return path.join(resolveAgentRunDir(root, sessionId), "completion-evidence.json");
}

export function resolveDebugPacketPath(root: string, sessionId: string): string {
  return path.join(resolveAgentRunDir(root, sessionId), "debug-packet.json");
}

export function resolveDebugPacketMarkdownPath(root: string, sessionId: string): string {
  return path.join(resolveAgentRunDir(root, sessionId), "debug-packet.md");
}

export function toRepoRelativePath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).replace(/\\/g, "/");
}
```

- [x] **Step 5: Add JSON schema**

Create `schemas/agent-discipline.schema.json` with top-level definitions for `AgentRunSession`, `CompletionEvidence`, `DebugPacket`, `ReviewDiscipline`, and `DisciplineReport`. Keep the schema strict enough to catch missing `schemaVersion`, `kind`, `sessionId`, `generatedAt`, and `truthSources`, while allowing future fields through `"additionalProperties": true` at nested object boundaries.

Use this top-level structure:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jispec.dev/schemas/agent-discipline.schema.json",
  "title": "JiSpec Agent Discipline Artifacts",
  "oneOf": [
    { "$ref": "#/$defs/AgentRunSession" },
    { "$ref": "#/$defs/CompletionEvidence" },
    { "$ref": "#/$defs/DebugPacket" },
    { "$ref": "#/$defs/ReviewDiscipline" },
    { "$ref": "#/$defs/DisciplineReport" }
  ],
  "$defs": {
    "TruthSource": {
      "type": "object",
      "required": ["path", "provenance", "note"],
      "properties": {
        "path": { "type": "string" },
        "provenance": { "enum": ["EXTRACTED", "INFERRED", "AMBIGUOUS", "OWNER_REVIEW", "UNKNOWN"] },
        "note": { "type": "string" }
      },
      "additionalProperties": false
    },
    "CommandEvidence": {
      "type": "object",
      "required": ["command", "exitCode", "ranAt", "evidenceKind", "summary"],
      "properties": {
        "command": { "type": "string" },
        "exitCode": { "type": ["integer", "null"] },
        "ranAt": { "type": "string" },
        "evidenceKind": { "enum": ["test", "typecheck", "verify", "scope_check", "patch_apply", "owner_review"] },
        "summary": { "type": "string" }
      },
      "additionalProperties": true
    },
    "TestStrategy": {
      "type": "object",
      "required": ["command", "scope", "expectedSignal", "whySufficient", "deterministic", "ownerReviewRequired"],
      "properties": {
        "command": { "type": "string" },
        "scope": { "enum": ["docs_only", "contract_critical", "mixed", "unknown"] },
        "expectedSignal": { "type": "string" },
        "whySufficient": { "type": "string" },
        "deterministic": { "type": "boolean" },
        "ownerReviewRequired": { "type": "boolean" }
      },
      "additionalProperties": true
    },
    "PhaseTransition": {
      "type": "object",
      "required": ["phase", "status", "actor", "timestamp", "sourceCommand", "truthSources"],
      "properties": {
        "phase": { "enum": ["intent", "design", "plan", "implement", "debug", "verify", "handoff"] },
        "status": { "enum": ["passed", "failed", "not_run", "not_applicable"] },
        "actor": { "type": "string" },
        "timestamp": { "type": "string" },
        "sourceCommand": { "type": "string" },
        "truthSources": { "type": "array", "items": { "$ref": "#/$defs/TruthSource" } }
      },
      "additionalProperties": true
    },
    "ReportPhaseGate": {
      "type": "object",
      "required": ["status", "issues"],
      "properties": {
        "status": { "enum": ["passed", "failed", "not_run", "not_applicable"] },
        "issues": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": true
    },
    "ReportTestStrategy": {
      "type": "object",
      "required": ["status", "ownerReviewRequired"],
      "properties": {
        "status": { "enum": ["passed", "failed", "not_run", "not_applicable"] },
        "ownerReviewRequired": { "type": "boolean" },
        "command": { "type": "string" }
      },
      "additionalProperties": true
    },
    "ReportCompletion": {
      "type": "object",
      "required": ["status", "missingEvidence"],
      "properties": {
        "status": { "enum": ["incomplete", "ready_for_verify", "verified", "verified_with_advisory", "blocked", "owner_review_required"] },
        "missingEvidence": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": true
    },
    "ReportIsolation": {
      "type": "object",
      "required": ["allowedPaths", "touchedPaths", "unexpectedPaths"],
      "properties": {
        "allowedPaths": { "type": "array", "items": { "type": "string" } },
        "touchedPaths": { "type": "array", "items": { "type": "string" } },
        "unexpectedPaths": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": true
    },
    "ReportArtifacts": {
      "type": "object",
      "required": ["sessionPath"],
      "properties": {
        "sessionPath": { "type": "string" },
        "completionEvidencePath": { "type": "string" },
        "debugPacketPath": { "type": "string" },
        "debugPacketMarkdownPath": { "type": "string" },
        "summaryPath": { "type": "string" }
      },
      "additionalProperties": true
    },
    "AgentRunSession": {
      "type": "object",
      "required": ["schemaVersion", "kind", "sessionId", "generatedAt", "mode", "currentPhase", "transitions", "allowedPaths", "touchedPaths", "unexpectedPaths", "truthSources"],
      "properties": {
        "schemaVersion": { "const": 1 },
        "kind": { "const": "jispec-agent-discipline-session" },
        "sessionId": { "type": "string" },
        "generatedAt": { "type": "string" },
        "mode": { "enum": ["strict_gate", "fast_advisory"] },
        "currentPhase": { "enum": ["intent", "design", "plan", "implement", "debug", "verify", "handoff"] },
        "transitions": { "type": "array", "items": { "$ref": "#/$defs/PhaseTransition" } },
        "allowedPaths": { "type": "array", "items": { "type": "string" } },
        "touchedPaths": { "type": "array", "items": { "type": "string" } },
        "unexpectedPaths": { "type": "array", "items": { "type": "string" } },
        "testStrategy": { "$ref": "#/$defs/TestStrategy" },
        "truthSources": { "type": "array", "items": { "$ref": "#/$defs/TruthSource" } }
      },
      "additionalProperties": true
    },
    "CompletionEvidence": {
      "type": "object",
      "required": ["schemaVersion", "kind", "sessionId", "generatedAt", "status", "commands", "missingEvidence", "truthSources"],
      "properties": {
        "schemaVersion": { "const": 1 },
        "kind": { "const": "jispec-agent-completion-evidence" },
        "sessionId": { "type": "string" },
        "generatedAt": { "type": "string" },
        "status": { "enum": ["incomplete", "ready_for_verify", "verified", "verified_with_advisory", "blocked", "owner_review_required"] },
        "commands": { "type": "array", "items": { "$ref": "#/$defs/CommandEvidence" } },
        "missingEvidence": { "type": "array", "items": { "type": "string" } },
        "truthSources": { "type": "array", "items": { "$ref": "#/$defs/TruthSource" } }
      },
      "additionalProperties": true
    },
    "DebugPacket": {
      "type": "object",
      "required": ["schemaVersion", "kind", "sessionId", "generatedAt", "stopPoint", "failingCheck", "minimalReproductionCommand", "observedEvidence", "currentHypothesis", "filesLikelyInvolved", "repeatedFailureCount", "nextAllowedAction", "retryCommand", "truthSources"],
      "properties": {
        "schemaVersion": { "const": 1 },
        "kind": { "const": "jispec-agent-debug-packet" },
        "sessionId": { "type": "string" },
        "generatedAt": { "type": "string" },
        "stopPoint": { "type": "string" },
        "failingCheck": { "type": "string" },
        "minimalReproductionCommand": { "type": "string" },
        "observedEvidence": { "type": "array", "items": { "type": "string" } },
        "currentHypothesis": { "type": "string" },
        "filesLikelyInvolved": { "type": "array", "items": { "type": "string" } },
        "repeatedFailureCount": { "type": "integer", "minimum": 0 },
        "nextAllowedAction": { "type": "string" },
        "retryCommand": { "type": "string" },
        "truthSources": { "type": "array", "items": { "$ref": "#/$defs/TruthSource" } }
      },
      "additionalProperties": true
    },
    "ReviewDiscipline": {
      "type": "object",
      "required": ["schemaVersion", "kind", "sessionId", "purpose", "impactedContracts", "verificationCommands", "uncoveredRisks", "advisoryItems", "ownerDecisions", "nextReviewerAction", "truthSources"],
      "properties": {
        "schemaVersion": { "const": 1 },
        "kind": { "const": "jispec-agent-review-discipline" },
        "sessionId": { "type": "string" },
        "purpose": { "type": "string" },
        "impactedContracts": { "type": "array", "items": { "type": "string" } },
        "verificationCommands": { "type": "array", "items": { "type": "string" } },
        "uncoveredRisks": { "type": "array", "items": { "type": "string" } },
        "advisoryItems": { "type": "array", "items": { "type": "string" } },
        "ownerDecisions": { "type": "array", "items": { "type": "string" } },
        "nextReviewerAction": { "type": "string" },
        "truthSources": { "type": "array", "items": { "$ref": "#/$defs/TruthSource" } }
      },
      "additionalProperties": true
    },
    "DisciplineReport": {
      "type": "object",
      "required": ["schemaVersion", "kind", "sessionId", "generatedAt", "mode", "phaseGate", "testStrategy", "completion", "isolation", "artifacts", "truthSources"],
      "properties": {
        "schemaVersion": { "const": 1 },
        "kind": { "const": "jispec-agent-discipline-report" },
        "sessionId": { "type": "string" },
        "generatedAt": { "type": "string" },
        "mode": { "enum": ["strict_gate", "fast_advisory"] },
        "phaseGate": { "$ref": "#/$defs/ReportPhaseGate" },
        "testStrategy": { "$ref": "#/$defs/ReportTestStrategy" },
        "completion": { "$ref": "#/$defs/ReportCompletion" },
        "isolation": { "$ref": "#/$defs/ReportIsolation" },
        "artifacts": { "$ref": "#/$defs/ReportArtifacts" },
        "truthSources": { "type": "array", "items": { "$ref": "#/$defs/TruthSource" } }
      },
      "additionalProperties": true
    }
  }
}
```

- [x] **Step 6: Run test and typecheck**

Run:

```bash
node --import tsx ./tools/jispec/tests/agent-discipline-artifacts.ts
npm run typecheck
```

Expected: artifact path test passes and typecheck exits `0`.

- [x] **Step 7: Commit**

```bash
git add schemas/agent-discipline.schema.json tools/jispec/discipline/types.ts tools/jispec/discipline/paths.ts tools/jispec/tests/agent-discipline-artifacts.ts
git commit -m "feat: add agent discipline artifact contract"
```

## Task 2: Artifact Writers And Markdown Summary

**Files:**

- Create: `tools/jispec/discipline/artifacts.ts`
- Modify: `tools/jispec/tests/agent-discipline-artifacts.ts`

- [x] **Step 1: Extend failing tests**

Append a second test case to `agent-discipline-artifacts.ts` that writes a minimal `AgentRunSession`, `CompletionEvidence`, and `DisciplineReport`, then asserts:

- JSON files exist.
- `discipline-summary.md` exists.
- summary says Markdown is not a machine API.
- summary includes completion status and next action.

Use this assertion block:

```ts
const summary = fs.readFileSync(path.join(root, ".jispec", "agent-run", "change-1", "discipline-summary.md"), "utf-8");
assert.match(summary, /Agent Discipline Summary/);
assert.match(summary, /Completion: verified/);
assert.match(summary, /This Markdown file is a human-readable companion/);
```

- [x] **Step 2: Run failing test**

Run:

```bash
node --import tsx ./tools/jispec/tests/agent-discipline-artifacts.ts
```

Expected: fail because `artifacts.ts` does not exist.

- [x] **Step 3: Implement artifact helpers**

Create `tools/jispec/discipline/artifacts.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { readChangeSession } from "../change/change-session";
import type { AgentRunSession, CompletionEvidence, DebugPacket, DisciplineReport } from "./types";
import {
  resolveAgentRunSessionPath,
  resolveCompletionEvidencePath,
  resolveDebugPacketMarkdownPath,
  resolveDebugPacketPath,
  resolveDisciplineReportPath,
  resolveDisciplineSummaryPath,
  toRepoRelativePath,
} from "./paths";

function writeJson(root: string, absolutePath: string, value: unknown): string {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  return toRepoRelativePath(root, absolutePath);
}

export function writeAgentRunSession(root: string, session: AgentRunSession): string {
  return writeJson(root, resolveAgentRunSessionPath(root, session.sessionId), session);
}

export function writeCompletionEvidence(root: string, evidence: CompletionEvidence): string {
  return writeJson(root, resolveCompletionEvidencePath(root, evidence.sessionId), evidence);
}

export function writeDebugPacket(root: string, packet: DebugPacket): { jsonPath: string; markdownPath: string } {
  const jsonPath = writeJson(root, resolveDebugPacketPath(root, packet.sessionId), packet);
  const markdownAbsolutePath = resolveDebugPacketMarkdownPath(root, packet.sessionId);
  fs.mkdirSync(path.dirname(markdownAbsolutePath), { recursive: true });
  fs.writeFileSync(markdownAbsolutePath, renderDebugPacketMarkdown(packet), "utf-8");
  return {
    jsonPath,
    markdownPath: toRepoRelativePath(root, markdownAbsolutePath),
  };
}

export function writeDisciplineReport(root: string, report: DisciplineReport): string {
  return writeJson(root, resolveDisciplineReportPath(root, report.sessionId), report);
}

export function writeDisciplineSummary(root: string, report: DisciplineReport): string {
  const summaryPath = resolveDisciplineSummaryPath(root, report.sessionId);
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, renderDisciplineSummary(report), "utf-8");
  return toRepoRelativePath(root, summaryPath);
}

export function readDisciplineReport(root: string, sessionId: string): DisciplineReport | null {
  const reportPath = resolveDisciplineReportPath(root, sessionId);
  if (!fs.existsSync(reportPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(reportPath, "utf-8")) as DisciplineReport;
}

export function findLatestDisciplineReport(root: string, sessionId?: string): { path: string; report: DisciplineReport } | null {
  const preferredSessionId = sessionId ?? readChangeSession(root)?.id;
  if (preferredSessionId) {
    const preferredPath = resolveDisciplineReportPath(root, preferredSessionId);
    if (fs.existsSync(preferredPath)) {
      return {
        path: toRepoRelativePath(root, preferredPath),
        report: JSON.parse(fs.readFileSync(preferredPath, "utf-8")) as DisciplineReport,
      };
    }
  }

  const runRoot = path.join(root, ".jispec", "agent-run");
  if (!fs.existsSync(runRoot)) {
    return null;
  }
  const candidates = fs.readdirSync(runRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(runRoot, entry.name, "discipline-report.json"))
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => ({
      path: toRepoRelativePath(root, candidate),
      report: JSON.parse(fs.readFileSync(candidate, "utf-8")) as DisciplineReport,
    }))
    .sort((left, right) =>
      compareString(right.report.generatedAt, left.report.generatedAt) ||
      compareString(right.report.sessionId, left.report.sessionId) ||
      compareString(right.path, left.path)
    );
  const latest = candidates[0];
  if (!latest) {
    return null;
  }
  return latest;
}

function compareString(left: string, right: string): number {
  return left.localeCompare(right);
}

export function renderDisciplineSummary(report: DisciplineReport): string {
  const lines = [
    "# Agent Discipline Summary",
    "",
    `Session: ${report.sessionId}`,
    `Mode: ${report.mode}`,
    `Phase gate: ${report.phaseGate.status}`,
    `Test strategy: ${report.testStrategy.status}${report.testStrategy.command ? ` via ${report.testStrategy.command}` : ""}`,
    `Completion: ${report.completion.status}`,
    `Allowed paths: ${report.isolation.allowedPaths.join(", ") || "none"}`,
    `Touched paths: ${report.isolation.touchedPaths.join(", ") || "none"}`,
    `Unexpected paths: ${report.isolation.unexpectedPaths.join(", ") || "none"}`,
    "",
    "## Missing Evidence",
    ...renderList(report.completion.missingEvidence),
    "",
    "## Truth Sources",
    ...renderList(report.truthSources.map((source) => `${source.path} [${source.provenance}] ${source.note}`)),
    "",
    "This Markdown file is a human-readable companion summary, not a machine API. Read `discipline-report.json` for automation.",
    "",
  ];
  return `${lines.join("\n")}`;
}

function renderDebugPacketMarkdown(packet: DebugPacket): string {
  const lines = [
    "# Agent Debug Packet",
    "",
    `Session: ${packet.sessionId}`,
    `Stop point: ${packet.stopPoint}`,
    `Failing check: ${packet.failingCheck}`,
    `Failed command: ${packet.failedCommand ?? "not recorded"}`,
    `Minimal reproduction: ${packet.minimalReproductionCommand}`,
    `Hypothesis: ${packet.currentHypothesis}`,
    `Retry command: ${packet.retryCommand}`,
    "",
    "## Observed Evidence",
    ...renderList(packet.observedEvidence),
    "",
    "## Files Likely Involved",
    ...renderList(packet.filesLikelyInvolved),
    "",
  ];
  return `${lines.join("\n")}`;
}

function renderList(values: string[]): string[] {
  return values.length > 0 ? values.map((value) => `- ${value}`) : ["- none"];
}
```

- [x] **Step 4: Run tests**

Run:

```bash
node --import tsx ./tools/jispec/tests/agent-discipline-artifacts.ts
npm run typecheck
```

Expected: artifact writer tests pass and typecheck exits `0`.

- [x] **Step 5: Commit**

```bash
git add tools/jispec/discipline/artifacts.ts tools/jispec/tests/agent-discipline-artifacts.ts
git commit -m "feat: write agent discipline artifacts"
```

## Task 3: Completion Evidence Builder

**Files:**

- Create: `tools/jispec/discipline/completion-evidence.ts`
- Modify: `tools/jispec/tests/agent-discipline-artifacts.ts`

- [x] **Step 1: Write failing completion evidence tests**

Add tests that build completion evidence for:

- `patch_verified` with post-verify `PASS` becomes `verified`.
- `patch_verified` with post-verify `WARN_ADVISORY` becomes `verified_with_advisory`.
- `verify_blocked` becomes `blocked`.
- missing post-verify becomes `ready_for_verify` with `verify result missing` in `missingEvidence`.

The test should call `buildCompletionEvidence` with object literals cast as `ImplementRunResult` instead of running `runImplement`. Include the minimum fields required by `buildCompletionEvidence`: `outcome`, `sessionId`, `testsPassed`, `metadata`, optional `postVerify`, and optional `patchMediation`.

- [x] **Step 2: Run failing test**

Run:

```bash
node --import tsx ./tools/jispec/tests/agent-discipline-artifacts.ts
```

Expected: fail because `completion-evidence.ts` does not exist.

- [x] **Step 3: Implement builder**

Create `tools/jispec/discipline/completion-evidence.ts`:

```ts
import path from "node:path";
import type { ImplementRunResult } from "../implement/implement-runner";
import type { CompletionEvidence, CompletionEvidenceStatus, DisciplineCommandEvidence, DisciplineTruthSource } from "./types";

export function buildCompletionEvidence(result: ImplementRunResult, generatedAt = new Date().toISOString(), root?: string): CompletionEvidence {
  const commands: DisciplineCommandEvidence[] = [];
  const truthSources: DisciplineTruthSource[] = [];

  if (result.metadata.testCommand) {
    commands.push({
      command: result.metadata.testCommand,
      exitCode: result.testsPassed === undefined ? null : result.testsPassed ? 0 : 1,
      ranAt: generatedAt,
      evidenceKind: "test",
      summary: result.testsPassed ? "Mediated test command passed." : "Mediated test command did not pass.",
    });
  }

  if (result.postVerify?.command) {
    commands.push({
      command: result.postVerify.command,
      exitCode: result.postVerify.exitCode,
      ranAt: generatedAt,
      evidenceKind: "verify",
      summary: `Post-implement verify returned ${result.postVerify.verdict}.`,
    });
  }

  if (result.metadata.handoffPacketPath) {
    truthSources.push({
      path: normalizeArtifactPath(result.metadata.handoffPacketPath, root),
      provenance: "EXTRACTED",
      note: "Implementation handoff packet generated by JiSpec.",
    });
  }
  if (result.metadata.patchMediationPath) {
    truthSources.push({
      path: normalizeArtifactPath(result.metadata.patchMediationPath, root),
      provenance: "EXTRACTED",
      note: "Patch mediation artifact generated by JiSpec.",
    });
  }

  const missingEvidence = computeMissingEvidence(result);

  return {
    schemaVersion: 1,
    kind: "jispec-agent-completion-evidence",
    sessionId: result.sessionId,
    generatedAt,
    status: computeCompletionStatus(result, missingEvidence),
    commands,
    verifyCommand: result.postVerify?.command ?? result.metadata.verifyCommand,
    verifyVerdict: result.postVerify?.verdict,
    missingEvidence,
    truthSources,
  };
}

function normalizeArtifactPath(artifactPath: string, root?: string): string {
  if (!root) {
    return artifactPath.replace(/\\/g, "/");
  }
  return path.isAbsolute(artifactPath)
    ? path.relative(root, artifactPath).replace(/\\/g, "/")
    : artifactPath.replace(/\\/g, "/");
}

function computeCompletionStatus(result: ImplementRunResult, missingEvidence: string[]): CompletionEvidenceStatus {
  if (result.outcome === "patch_rejected_out_of_scope" || result.outcome === "verify_blocked") {
    return "blocked";
  }
  if (result.outcome === "external_patch_received" && result.testsPassed === false) {
    return "blocked";
  }
  if (result.outcome === "budget_exhausted" || result.outcome === "stall_detected") {
    return "owner_review_required";
  }
  if (!result.postVerify) {
    return missingEvidence.length > 0 ? "ready_for_verify" : "incomplete";
  }
  if (!result.postVerify.ok) {
    return "blocked";
  }
  return result.postVerify.advisoryIssueCount > 0 ? "verified_with_advisory" : "verified";
}

function computeMissingEvidence(result: ImplementRunResult): string[] {
  const missing: string[] = [];
  if (!result.metadata.testCommand) {
    missing.push("test command missing");
  }
  if (!result.postVerify) {
    missing.push("verify result missing");
  }
  return missing;
}
```

- [x] **Step 4: Run tests**

Run:

```bash
node --import tsx ./tools/jispec/tests/agent-discipline-artifacts.ts
npm run typecheck
```

Expected: all artifact/completion tests pass and typecheck exits `0`.

- [x] **Step 5: Commit**

```bash
git add tools/jispec/discipline/completion-evidence.ts tools/jispec/tests/agent-discipline-artifacts.ts
git commit -m "feat: build completion evidence"
```

## Task 4: Phase Gate And Test Strategy

**Files:**

- Create: `tools/jispec/discipline/phase-gate.ts`
- Create: `tools/jispec/discipline/test-strategy.ts`
- Modify: `tools/jispec/tests/agent-discipline-artifacts.ts`

- [x] **Step 1: Write failing tests**

Add tests for:

- strict mode with `intent -> implement -> handoff` returns issues for missing plan and missing verify phase.
- fast mode without a plan returns a passed phase gate and is represented by `mode = "fast_advisory"` in the report.
- docs-only change can use `npm run jispec-cli -- verify --fast`.
- contract-critical change requires deterministic command.

- [x] **Step 2: Implement phase gate**

Create `tools/jispec/discipline/phase-gate.ts`:

```ts
import type { AgentRunSession, DisciplineCheckStatus, DisciplinePhase } from "./types";

const PHASE_ORDER: DisciplinePhase[] = ["intent", "design", "plan", "implement", "debug", "verify", "handoff"];

export function validatePhaseGate(session: AgentRunSession): { status: DisciplineCheckStatus; issues: string[] } {
  const issues: string[] = [];
  let previousIndex = -1;

  for (const transition of session.transitions) {
    const currentIndex = PHASE_ORDER.indexOf(transition.phase);
    if (currentIndex < previousIndex) {
      issues.push(`phase_order_invalid: ${transition.phase} appears after a later phase`);
    }
    previousIndex = Math.max(previousIndex, currentIndex);
  }

  const phases = new Set(session.transitions.map((transition) => transition.phase));
  if (session.mode === "strict_gate" && phases.has("implement") && !phases.has("plan")) {
    issues.push("strict implementation requires plan phase evidence");
  }
  if (phases.has("handoff") && !phases.has("verify")) {
    issues.push("handoff phase requires verify phase evidence");
  }

  return {
    status: issues.length === 0 ? "passed" : "failed",
    issues,
  };
}
```

- [x] **Step 3: Implement test strategy builder**

Create `tools/jispec/discipline/test-strategy.ts`:

```ts
import type { ChangeSession } from "../change/change-session";
import type { TestStrategy } from "./types";

export function buildTestStrategy(session: ChangeSession, testCommand: string | undefined, fast: boolean): TestStrategy {
  const scope = inferScope(session);
  const command = testCommand ?? (fast ? "npm run jispec-cli -- verify --fast" : "npm run verify");
  const ownerReviewRequired = scope === "unknown" || command.trim().length === 0;

  return {
    command,
    scope,
    expectedSignal: scope === "docs_only"
      ? "Verify remains non-blocking after docs-only change."
      : "Contract-critical verification remains non-blocking after implementation.",
    whySufficient: scope === "docs_only"
      ? "Docs-only changes can use fast verify plus normal review because no adopted contract asset is changed."
      : "The command is deterministic and runs through JiSpec verification for governed paths.",
    deterministic: command.trim().length > 0 && !ownerReviewRequired,
    ownerReviewRequired,
  };
}

export function validateTestStrategy(strategy: TestStrategy): { status: "passed" | "failed"; issues: string[] } {
  const issues: string[] = [];
  if (strategy.command.trim().length === 0) {
    issues.push("test strategy command missing");
  }
  if (!strategy.deterministic && !strategy.ownerReviewRequired) {
    issues.push("non-deterministic test strategy must require owner review");
  }
  if (strategy.scope === "contract_critical" && !strategy.deterministic) {
    issues.push("contract-critical change requires deterministic verification");
  }
  return {
    status: issues.length === 0 ? "passed" : "failed",
    issues,
  };
}

function inferScope(session: ChangeSession): TestStrategy["scope"] {
  if (session.changedPaths.length === 0) {
    return "unknown";
  }
  const kinds = new Set(session.changedPaths.map((entry) => entry.kind));
  if (kinds.size === 1 && kinds.has("docs_only")) {
    return "docs_only";
  }
  if ([...kinds].some((kind) =>
    kind === "domain_core" ||
    kind === "contract" ||
    kind === "api_surface" ||
    kind === "behavior_surface" ||
    kind === "test_only"
  )) {
    return "contract_critical";
  }
  return "mixed";
}
```

- [x] **Step 4: Run tests**

Run:

```bash
node --import tsx ./tools/jispec/tests/agent-discipline-artifacts.ts
npm run typecheck
```

Expected: phase and test strategy tests pass.

- [x] **Step 5: Commit**

```bash
git add tools/jispec/discipline/phase-gate.ts tools/jispec/discipline/test-strategy.ts tools/jispec/tests/agent-discipline-artifacts.ts
git commit -m "feat: validate agent discipline phase and test strategy"
```

## Task 5: Integrate Discipline Artifacts Into Implement Runner

**Files:**

- Modify: `tools/jispec/implement/implement-runner.ts`
- Modify: `tools/jispec/audit/event-ledger.ts`
- Modify: `tools/jispec/tests/audit-event-ledger.ts`
- Create: `tools/jispec/tests/agent-discipline-implement.ts`

- [x] **Step 1: Write failing implement integration tests**

Create `tools/jispec/tests/agent-discipline-implement.ts` with four scenarios copied in style from `implement-patch-mediation.ts`:

- docs-only patch verified writes `session.json`, `completion-evidence.json`, `discipline-report.json`, and `discipline-summary.md`.
- failing mediated test writes `completion-evidence.json` with `status = "blocked"` and a discipline report with `completion.status = "blocked"`.
- out-of-scope patch records `unexpectedPaths`.
- strict code patch includes deterministic test strategy and `strict_gate` mode.
- every implementation attempt writes an append-only `agent_discipline_recorded` audit event that references the discipline report.

Use these core assertions in each scenario:

```ts
assert.ok(fs.existsSync(path.join(fixture, ".jispec", "agent-run", sessionId, "session.json")));
assert.ok(fs.existsSync(path.join(fixture, ".jispec", "agent-run", sessionId, "completion-evidence.json")));
assert.ok(fs.existsSync(path.join(fixture, ".jispec", "agent-run", sessionId, "discipline-report.json")));
assert.ok(fs.existsSync(path.join(fixture, ".jispec", "agent-run", sessionId, "discipline-summary.md")));
```

- [x] **Step 2: Run failing test**

Run:

```bash
node --import tsx ./tools/jispec/tests/agent-discipline-implement.ts
```

Expected: fail because `runImplement` does not write agent-run artifacts yet.

- [x] **Step 3: Add discipline imports and metadata**

In `tools/jispec/implement/implement-runner.ts`, import:

```ts
import { buildCompletionEvidence } from "../discipline/completion-evidence";
import { buildTestStrategy, validateTestStrategy } from "../discipline/test-strategy";
import { validatePhaseGate } from "../discipline/phase-gate";
import { appendAuditEvent } from "../audit/event-ledger";
import {
  writeAgentRunSession,
  writeCompletionEvidence,
  writeDisciplineReport,
  writeDisciplineSummary,
} from "../discipline/artifacts";
import type { AgentRunSession, DisciplineReport } from "../discipline/types";
```

Extend `ImplementRunResult["metadata"]` with:

```ts
agentDiscipline?: {
  sessionPath?: string;
  completionEvidencePath?: string;
  disciplineReportPath?: string;
  disciplineSummaryPath?: string;
  debugPacketPath?: string;
  debugPacketMarkdownPath?: string;
};
```

- [x] **Step 4: Create session builder helper**

Before adding the helper, extend `AuditEventType` in `tools/jispec/audit/event-ledger.ts`:

```ts
  | "external_patch_intake"
  | "agent_discipline_recorded"
  | "external_tool_run_requested"
```

Extend the first `tools/jispec/tests/audit-event-ledger.ts` append/read test in-place, without increasing the suite's expected test count, to append one `agent_discipline_recorded` event with `sourceArtifact.kind = "agent-discipline-report"` and `sourceArtifact.path = ".jispec/agent-run/change-1/discipline-report.json"`. Assert the event type, normalized source path, and representative `details.sessionId` survive `readAuditEvents` / `inspectAuditLedger`.

Add a local helper near other private functions in `implement-runner.ts`:

```ts
function buildAgentRunSession(root: string, result: ImplementRunResult, session: ChangeSession, generatedAt: string): AgentRunSession {
  const touchedPaths = result.patchMediation?.touchedPaths ?? [];
  const allowedPaths = result.patchMediation?.allowedPaths ?? session.changedPaths.map((entry) => entry.path).sort((left, right) => left.localeCompare(right));
  const unexpectedPaths = result.patchMediation?.violations
    .map((violation) => violation.match(/out-of-scope path:\s*(.+)$/)?.[1])
    .filter((entry): entry is string => Boolean(entry))
    ?? touchedPaths.filter((entry) => !isPathAllowed(entry, allowedPaths));
  const testStrategy = buildTestStrategy(session, result.metadata.testCommand, result.lane === "fast");
  const mode = result.lane === "fast" ? "fast_advisory" : "strict_gate";

  return {
    schemaVersion: 1,
    kind: "jispec-agent-discipline-session",
    sessionId: result.sessionId,
    generatedAt,
    mode,
    currentPhase: result.postVerify ? "handoff" : result.testsPassed ? "implement" : "debug",
    transitions: [
      {
        phase: "intent",
        status: "passed",
        actor: "jispec-change",
        timestamp: session.createdAt,
        sourceCommand: "npm run jispec-cli -- change",
        truthSources: [{ path: ".jispec/change-session.json", provenance: "EXTRACTED", note: "Active change session." }],
      },
      {
        phase: "plan",
        status: mode === "strict_gate" ? "passed" : "not_applicable",
        actor: "jispec-implement",
        timestamp: generatedAt,
        sourceCommand: "npm run jispec-cli -- implement",
        truthSources: [{ path: ".jispec/change-session.json", provenance: "EXTRACTED", note: "Change session lane and scope." }],
      },
      {
        phase: "implement",
        status: result.patchMediation?.status === "rejected_out_of_scope" ? "failed" : "passed",
        actor: "external_patch_author",
        timestamp: generatedAt,
        sourceCommand: result.metadata.externalPatchPath ? `npm run jispec-cli -- implement --external-patch ${result.metadata.externalPatchPath}` : "npm run jispec-cli -- implement",
        truthSources: result.metadata.patchMediationPath
          ? [{ path: normalizeArtifactPath(root, result.metadata.patchMediationPath), provenance: "EXTRACTED", note: "Patch mediation artifact." }]
          : [],
      },
      {
        phase: result.postVerify ? "verify" : "debug",
        status: result.postVerify?.ok ? "passed" : result.outcome === "patch_verified" ? "passed" : "failed",
        actor: result.postVerify ? "verify_gate" : "jispec-implement",
        timestamp: generatedAt,
        sourceCommand: result.postVerify?.command ?? result.metadata.testCommand ?? "not recorded",
        truthSources: result.metadata.handoffPacketPath
          ? [{ path: normalizeArtifactPath(root, result.metadata.handoffPacketPath), provenance: "EXTRACTED", note: "Implementation handoff." }]
          : [],
      },
    ],
    allowedPaths,
    touchedPaths,
    unexpectedPaths,
    testStrategy,
    truthSources: [
      { path: ".jispec/change-session.json", provenance: "EXTRACTED", note: "Change session scope and lane." },
    ],
  };
}

function isPathAllowed(touchedPath: string, allowedPaths: string[]): boolean {
  const normalizedTouched = touchedPath.replace(/\\/g, "/");
  return allowedPaths.some((allowedPath) => {
    const normalizedAllowed = allowedPath.replace(/\\/g, "/").replace(/\/+$/g, "");
    return normalizedTouched === normalizedAllowed || normalizedTouched.startsWith(`${normalizedAllowed}/`);
  });
}

function normalizeArtifactPath(root: string, artifactPath: string): string {
  return path.isAbsolute(artifactPath)
    ? path.relative(root, artifactPath).replace(/\\/g, "/")
    : artifactPath.replace(/\\/g, "/");
}
```

- [x] **Step 5: Write artifacts after `decisionPacket` is built**

Immediately after `result.decisionPacket = buildImplementationDecisionPacket(result, session);`, call:

```ts
writeAgentDisciplineArtifacts(root, result, session);
```

This must run for every outcome, including successful `patch_verified` and `preflight_passed` outcomes that do not write handoff packets.

Add this helper:

```ts
function writeAgentDisciplineArtifacts(root: string, result: ImplementRunResult, session: ChangeSession): void {
  const generatedAt = new Date().toISOString();
  const agentSession = buildAgentRunSession(root, result, session, generatedAt);
  const phaseGate = validatePhaseGate(agentSession);
  const testStrategyResult = validateTestStrategy(agentSession.testStrategy!);
  const completionEvidence = buildCompletionEvidence(result, generatedAt, root);
  const sessionPath = writeAgentRunSession(root, agentSession);
  const completionEvidencePath = writeCompletionEvidence(root, completionEvidence);

  const report: DisciplineReport = {
    schemaVersion: 1,
    kind: "jispec-agent-discipline-report",
    sessionId: result.sessionId,
    generatedAt,
    mode: agentSession.mode,
    phaseGate,
    testStrategy: {
      status: testStrategyResult.status,
      ownerReviewRequired: agentSession.testStrategy?.ownerReviewRequired ?? true,
      command: agentSession.testStrategy?.command,
    },
    completion: {
      status: completionEvidence.status,
      missingEvidence: completionEvidence.missingEvidence,
    },
    isolation: {
      allowedPaths: agentSession.allowedPaths,
      touchedPaths: agentSession.touchedPaths,
      unexpectedPaths: agentSession.unexpectedPaths,
    },
    artifacts: {
      sessionPath,
      completionEvidencePath,
      summaryPath: `.jispec/agent-run/${result.sessionId}/discipline-summary.md`,
    },
    truthSources: completionEvidence.truthSources,
  };

  const disciplineReportPath = writeDisciplineReport(root, report);
  const disciplineSummaryPath = writeDisciplineSummary(root, report);
  appendAuditEvent(root, {
    type: "agent_discipline_recorded",
    reason: `Agent discipline recorded ${completionEvidence.status} for change session ${result.sessionId}.`,
    sourceArtifact: {
      kind: "agent-discipline-report",
      path: disciplineReportPath,
    },
    affectedContracts: session.impactSummary && !Array.isArray(session.impactSummary)
      ? session.impactSummary.impactedContracts
      : [],
    details: {
      sessionId: result.sessionId,
      mode: report.mode,
      completionStatus: completionEvidence.status,
      phaseGateStatus: phaseGate.status,
      testStrategyStatus: testStrategyResult.status,
      unexpectedPaths: report.isolation.unexpectedPaths,
      artifacts: {
        sessionPath,
        completionEvidencePath,
        disciplineReportPath,
        disciplineSummaryPath,
      },
    },
  });
  result.metadata.agentDiscipline = {
    sessionPath,
    completionEvidencePath,
    disciplineReportPath,
    disciplineSummaryPath,
  };
}
```

Also extend `renderImplementText` so every outcome, including successful outcomes without a handoff packet, exposes the artifact paths:

```ts
if (result.metadata.agentDiscipline) {
  lines.push("");
  lines.push("Agent discipline:");
  lines.push(`  Report: ${result.metadata.agentDiscipline.disciplineReportPath ?? "not_available_yet"}`);
  lines.push(`  Summary: ${result.metadata.agentDiscipline.disciplineSummaryPath ?? "not_available_yet"}`);
  lines.push(`  Completion evidence: ${result.metadata.agentDiscipline.completionEvidencePath ?? "not_available_yet"}`);
  if (result.metadata.agentDiscipline.debugPacketPath) {
    lines.push(`  Debug packet: ${result.metadata.agentDiscipline.debugPacketPath}`);
  }
  if (result.metadata.agentDiscipline.debugPacketMarkdownPath) {
    lines.push(`  Debug summary: ${result.metadata.agentDiscipline.debugPacketMarkdownPath}`);
  }
}
```

- [x] **Step 6: Run implement discipline tests**

Run:

```bash
node --import tsx ./tools/jispec/tests/agent-discipline-implement.ts
node --import tsx ./tools/jispec/tests/implement-patch-mediation.ts
node --import tsx ./tools/jispec/tests/audit-event-ledger.ts
npm run typecheck
```

Expected: new tests pass, existing patch mediation tests still pass, and the audit ledger suite accepts the new event type.

- [x] **Step 7: Commit**

```bash
git add tools/jispec/implement/implement-runner.ts tools/jispec/audit/event-ledger.ts tools/jispec/tests/audit-event-ledger.ts tools/jispec/tests/agent-discipline-implement.ts
git commit -m "feat: emit agent discipline artifacts from implement"
```

## Task 6: Debug Packet Builder

**Files:**

- Create: `tools/jispec/discipline/debug-packet.ts`
- Modify: `tools/jispec/implement/implement-runner.ts`
- Modify: `tools/jispec/tests/agent-discipline-implement.ts`

- [x] **Step 1: Add debug-specific test assertions**

In the failing-test scenario in `agent-discipline-implement.ts`, assert:

```ts
const debugPacket = JSON.parse(fs.readFileSync(path.join(fixture, ".jispec", "agent-run", "change-failing-patch", "debug-packet.json"), "utf-8"));
assert.equal(debugPacket.kind, "jispec-agent-debug-packet");
assert.equal(debugPacket.stopPoint, "test");
assert.equal(debugPacket.failingCheck, "tests");
assert.match(debugPacket.minimalReproductionCommand, /node -e/);
assert.ok(debugPacket.observedEvidence.some((entry: string) => entry.includes("mediated test")));
```

- [x] **Step 2: Implement shared debug builder**

Create `tools/jispec/discipline/debug-packet.ts`:

```ts
import path from "node:path";
import type { ImplementRunResult } from "../implement/implement-runner";
import type { DebugPacket } from "./types";

export function buildDebugPacketFromImplementResult(result: ImplementRunResult, generatedAt = new Date().toISOString(), root?: string): DebugPacket {
  const stopPoint = result.decisionPacket?.stopPoint ?? inferStopPoint(result);
  const failingCheck = result.decisionPacket?.nextActionDetail.failedCheck ?? inferFailedCheck(result);
  const retryCommand = result.decisionPacket?.nextActionDetail.command
    ?? `npm run jispec-cli -- implement --session-id ${result.sessionId} --external-patch <path>`;
  const failedCommand = failingCheck === "verify"
    ? result.postVerify?.command
    : result.metadata.testCommand;

  return {
    schemaVersion: 1,
    kind: "jispec-agent-debug-packet",
    sessionId: result.sessionId,
    generatedAt,
    stopPoint,
    failedCommand,
    exitCode: inferExitCode(result),
    failingCheck,
    minimalReproductionCommand: failedCommand ?? retryCommand,
    observedEvidence: buildObservedEvidence(result),
    currentHypothesis: buildHypothesis(result, failingCheck),
    filesLikelyInvolved: result.patchMediation?.touchedPaths ?? result.handoffPacket?.nextSteps.filesNeedingAttention ?? [],
    repeatedFailureCount: 1,
    nextAllowedAction: result.decisionPacket?.nextAction ?? "Review the failed implementation attempt and submit a corrected patch.",
    retryCommand,
    truthSources: [
      ...(result.metadata.patchMediationPath ? [{ path: normalizeArtifactPath(result.metadata.patchMediationPath, root), provenance: "EXTRACTED" as const, note: "Patch mediation failure evidence." }] : []),
      ...(result.metadata.handoffPacketPath ? [{ path: normalizeArtifactPath(result.metadata.handoffPacketPath, root), provenance: "EXTRACTED" as const, note: "Implementation handoff evidence." }] : []),
    ],
  };
}

function normalizeArtifactPath(artifactPath: string, root?: string): string {
  if (!root) {
    return artifactPath.replace(/\\/g, "/");
  }
  return path.isAbsolute(artifactPath)
    ? path.relative(root, artifactPath).replace(/\\/g, "/")
    : artifactPath.replace(/\\/g, "/");
}

function inferStopPoint(result: ImplementRunResult): string {
  if (result.outcome === "patch_rejected_out_of_scope") {
    return "scope_check";
  }
  if (result.outcome === "verify_blocked") {
    return "post_verify";
  }
  return result.testsPassed === false ? "test" : "preflight";
}

function inferFailedCheck(result: ImplementRunResult): string {
  if (result.outcome === "patch_rejected_out_of_scope") {
    return "scope_check";
  }
  if (result.outcome === "verify_blocked") {
    return "verify";
  }
  return result.testsPassed === false ? "tests" : "unknown";
}

function inferExitCode(result: ImplementRunResult): number | null {
  if (result.outcome === "verify_blocked") {
    return result.postVerify?.exitCode ?? 1;
  }
  if (result.testsPassed === false) {
    return 1;
  }
  return null;
}

function buildObservedEvidence(result: ImplementRunResult): string[] {
  const evidence: string[] = [];
  if (result.patchMediation?.violations.length) {
    evidence.push(...result.patchMediation.violations);
  }
  if (result.patchMediation?.test?.errorMessage) {
    evidence.push(result.patchMediation.test.errorMessage);
  }
  if (result.postVerify?.verdict) {
    evidence.push(`post-verify verdict: ${result.postVerify.verdict}`);
  }
  return evidence.length > 0 ? evidence : ["No detailed failure output was recorded."];
}

function buildHypothesis(result: ImplementRunResult, failingCheck: string): string {
  if (failingCheck === "scope_check") {
    return "The patch touched paths outside the active change session scope.";
  }
  if (failingCheck === "tests") {
    return "The patch applied, but the mediated test command did not pass.";
  }
  if (failingCheck === "verify") {
    return "Tests passed, but deterministic verify reported blocking issues.";
  }
  return `Implementation outcome ${result.outcome} requires owner review.`;
}
```

- [x] **Step 3: Integrate debug packet writer**

In `implement-runner.ts`, import:

```ts
import { buildDebugPacketFromImplementResult } from "../discipline/debug-packet";
import { writeDebugPacket } from "../discipline/artifacts";
```

If `writeDebugPacket` is already imported from `../discipline/artifacts` because the import block was consolidated, add it to that existing import block instead of adding a second import.

Inside `writeAgentDisciplineArtifacts`, after completion evidence is built and before `const report: DisciplineReport = { ... }`, add:

```ts
  let debugPacketPath: string | undefined;
  let debugPacketMarkdownPath: string | undefined;
  if (completionEvidence.status === "blocked" || result.outcome === "external_patch_received" || result.outcome === "patch_rejected_out_of_scope") {
    const debug = buildDebugPacketFromImplementResult(result, generatedAt, root);
    const debugPacket = writeDebugPacket(root, debug);
    debugPacketPath = debugPacket.jsonPath;
    debugPacketMarkdownPath = debugPacket.markdownPath;
  }
```

Then include `debugPacketPath` and `debugPacketMarkdownPath` inside `report.artifacts` and `result.metadata.agentDiscipline`.

- [x] **Step 4: Run tests**

Run:

```bash
node --import tsx ./tools/jispec/tests/agent-discipline-implement.ts
node --import tsx ./tools/jispec/tests/implement-patch-mediation.ts
npm run typecheck
```

Expected: debug packet assertions pass.

- [x] **Step 5: Commit**

```bash
git add tools/jispec/discipline/debug-packet.ts tools/jispec/implement/implement-runner.ts tools/jispec/tests/agent-discipline-implement.ts
git commit -m "feat: record systematic debug packets"
```

## Task 7: Handoff And Review Discipline Integration

**Files:**

- Create: `tools/jispec/discipline/review-discipline.ts`
- Modify: `tools/jispec/implement/handoff-packet.ts`
- Modify: `tools/jispec/implement/implement-runner.ts`
- Modify: `tools/jispec/tests/implement-handoff-mainline.ts`
- Modify: `tools/jispec/tests/agent-discipline-implement.ts`

- [x] **Step 1: Write failing handoff assertions**

Update handoff tests for an outcome that already writes a handoff packet, such as failed mediated tests or out-of-scope patch, to assert:

```ts
assert.ok(result.handoffPacket?.discipline);
assert.match(formatHandoffPacket(result.handoffPacket!), /Agent discipline:/);
assert.match(formatHandoffPacket(result.handoffPacket!), /Review discipline:/);
```

- [x] **Step 2: Implement review discipline builder**

Create `tools/jispec/discipline/review-discipline.ts`:

```ts
import type { HandoffPacket } from "../implement/handoff-packet";
import type { ReviewDiscipline } from "./types";

export function buildReviewDiscipline(packet: HandoffPacket): ReviewDiscipline {
  return {
    schemaVersion: 1,
    kind: "jispec-agent-review-discipline",
    sessionId: packet.sessionId,
    purpose: `${packet.changeIntent}: ${packet.decisionPacket.summary}`,
    impactedContracts: packet.contractContext.adoptedContractPaths,
    verificationCommands: [packet.nextSteps.verifyCommand],
    uncoveredRisks: packet.decisionPacket.mergeable ? [] : [packet.decisionPacket.summary],
    advisoryItems: packet.decisionPacket.verify.status === "passed" && packet.decisionPacket.verify.verdict === "WARN_ADVISORY"
      ? ["Post-implement verify passed with advisory follow-up."]
      : [],
    ownerDecisions: packet.decisionPacket.nextActionDetail.owner === "reviewer"
      ? ["Reviewer may proceed after normal review and CI verify."]
      : [`${packet.decisionPacket.nextActionDetail.owner} must handle ${packet.decisionPacket.nextActionDetail.type}.`],
    nextReviewerAction: packet.decisionPacket.nextAction,
    truthSources: [
      { path: `.jispec/handoff/${packet.sessionId}.json`, provenance: "EXTRACTED", note: "Implementation handoff packet." },
    ],
  };
}
```

- [x] **Step 3: Extend handoff packet contract**

In `handoff-packet.ts`, add optional fields to `HandoffPacket`:

```ts
  discipline?: {
    sessionPath?: string;
    completionEvidencePath?: string;
    disciplineReportPath?: string;
    disciplineSummaryPath?: string;
    debugPacketPath?: string;
    debugPacketMarkdownPath?: string;
  };
  reviewDiscipline?: ReviewDiscipline;
```

Import `ReviewDiscipline` from `../discipline/types`.

- [x] **Step 4: Attach discipline metadata before writing handoff JSON**

Task 5 writes `result.metadata.agentDiscipline` immediately after `decisionPacket` is built and before handoff generation. Update the existing `shouldWriteHandoffPacket(result)` branch so the handoff object receives that metadata before `writeHandoffPacket` serializes JSON.

Preferred order:

1. Build `decisionPacket`.
2. Write discipline artifacts and populate `result.metadata.agentDiscipline`.
3. When `shouldWriteHandoffPacket(result)` is true, build the handoff object in memory.
4. Attach `handoffPacket.discipline = result.metadata.agentDiscipline`.
5. Attach `handoffPacket.reviewDiscipline = buildReviewDiscipline(handoffPacket)`.
6. Write handoff JSON.

Successful `patch_verified` and `preflight_passed` outcomes do not call `writeHandoffPacket`; they still expose discipline evidence through `result.metadata.agentDiscipline` and `renderImplementText`.

- [x] **Step 5: Render sections**

In `formatHandoffPacket`, add:

```ts
  if (packet.discipline) {
    lines.push("");
    lines.push("Agent discipline:");
    lines.push(`  Report: ${packet.discipline.disciplineReportPath ?? "not_available_yet"}`);
    lines.push(`  Summary: ${packet.discipline.disciplineSummaryPath ?? "not_available_yet"}`);
    lines.push(`  Completion evidence: ${packet.discipline.completionEvidencePath ?? "not_available_yet"}`);
    if (packet.discipline.debugPacketPath) {
      lines.push(`  Debug packet: ${packet.discipline.debugPacketPath}`);
    }
    if (packet.discipline.debugPacketMarkdownPath) {
      lines.push(`  Debug summary: ${packet.discipline.debugPacketMarkdownPath}`);
    }
  }
  if (packet.reviewDiscipline) {
    lines.push("");
    lines.push("Review discipline:");
    lines.push(`  Purpose: ${packet.reviewDiscipline.purpose}`);
    lines.push(`  Verification: ${packet.reviewDiscipline.verificationCommands.join(", ") || "none"}`);
    lines.push(`  Next reviewer action: ${packet.reviewDiscipline.nextReviewerAction}`);
  }
```

- [x] **Step 6: Run tests**

Run:

```bash
node --import tsx ./tools/jispec/tests/agent-discipline-implement.ts
node --import tsx ./tools/jispec/tests/implement-handoff-mainline.ts
node --import tsx ./tools/jispec/tests/implement-patch-mediation.ts
npm run typecheck
```

Expected: handoff output includes discipline paths, existing handoff behavior still passes.

- [x] **Step 7: Commit**

```bash
git add tools/jispec/discipline/review-discipline.ts tools/jispec/implement/handoff-packet.ts tools/jispec/implement/implement-runner.ts tools/jispec/tests/implement-handoff-mainline.ts tools/jispec/tests/agent-discipline-implement.ts
git commit -m "feat: add review discipline to implementation handoffs"
```

## Task 8: Verify And CI Discipline Consumption

**Files:**

- Create: `tools/jispec/verify/agent-discipline-collector.ts`
- Modify: `tools/jispec/verify/verify-runner.ts`
- Modify: `tools/jispec/ci/verify-report.ts`
- Modify: `tools/jispec/ci/verify-summary.ts`
- Create: `tools/jispec/tests/agent-discipline-verify-ci.ts`

- [x] **Step 1: Write failing verify/CI tests**

Create fixture tests that:

- write `.jispec/agent-run/change-1/discipline-report.json` with `mode = "strict_gate"` and `completion.status = "blocked"`.
- run `runVerify`.
- assert verify returns `FAIL_BLOCKING` with code `AGENT_DISCIPLINE_INCOMPLETE`.
- write a second `.jispec/agent-run/change-fast/discipline-report.json` fixture with `mode = "fast_advisory"` and `completion.status = "blocked"`, then assert the issue is advisory and the verdict is `WARN_ADVISORY`.
- build CI verify report and assert `modes.agentDiscipline.latestReportPath` is present.
- render verify summary and assert discipline summary path is linked.

Use separate temp fixture roots for the strict and fast verdict cases. Inside the strict test group, also write two reports plus an active change session and assert `findLatestDisciplineReport` prefers the active session report, then falls back to `generatedAt/sessionId/path` ordering. Do not rely on filesystem modification time, and keep this suite at three reported tests total.

- [x] **Step 2: Implement collector**

Create `tools/jispec/verify/agent-discipline-collector.ts`:

```ts
import type { VerifyIssue } from "./verdict";
import type { VerifyRunOptions, VerifySupplementalCollector } from "./verify-runner";
import { findLatestDisciplineReport } from "../discipline/artifacts";

export const agentDisciplineCollector: VerifySupplementalCollector = {
  source: "agent-discipline",
  collect(root: string, _options: VerifyRunOptions): VerifyIssue[] {
    const latest = findLatestDisciplineReport(root);
    if (!latest) {
      return [];
    }
    const issues: VerifyIssue[] = [];
    const report = latest.report;
    if (report.phaseGate.status === "failed") {
      issues.push(toIssue(report, "AGENT_DISCIPLINE_PHASE_GATE", latest.path, `Agent discipline phase gate has ${report.phaseGate.issues.length} issue(s).`));
    }
    if (report.testStrategy.status === "failed" || report.testStrategy.ownerReviewRequired) {
      issues.push(toIssue(report, "AGENT_DISCIPLINE_TEST_STRATEGY", latest.path, "Agent discipline test strategy needs deterministic verification or owner review."));
    }
    if (report.completion.status === "blocked" || report.completion.status === "incomplete" || report.completion.status === "owner_review_required") {
      issues.push(toIssue(report, "AGENT_DISCIPLINE_INCOMPLETE", latest.path, `Agent discipline completion is ${report.completion.status}.`));
    }
    if (report.isolation.unexpectedPaths.length > 0) {
      issues.push(toIssue(report, "AGENT_DISCIPLINE_SCOPE", latest.path, `Agent discipline recorded unexpected paths: ${report.isolation.unexpectedPaths.join(", ")}.`));
    }
    return issues;
  },
};

function toIssue(report: { mode: "strict_gate" | "fast_advisory" }, code: string, path: string, message: string): VerifyIssue {
  return {
    code,
    severity: report.mode === "strict_gate" ? "blocking" : "advisory",
    kind: "unsupported",
    path,
    message,
    details: {
      source: "agent-discipline",
      disciplineMode: report.mode,
      blockingAuthority: report.mode === "strict_gate"
        ? "Strict agent discipline failures block through deterministic verify."
        : "Fast advisory discipline findings do not block merge by themselves.",
    },
  };
}
```

- [x] **Step 3: Register collector**

In `verify-runner.ts`, import:

```ts
import { agentDisciplineCollector } from "./agent-discipline-collector";
```

Add it to `DEFAULT_SUPPLEMENTAL_COLLECTORS` before the existing `contract-assets` collector:

```ts
const DEFAULT_SUPPLEMENTAL_COLLECTORS: VerifySupplementalCollector[] = [
  agentDisciplineCollector,
  {
    source: "contract-assets",
    collect(root) {
      return collectContractAssetIssues(root);
    },
  },
  // keep the rest of the existing collectors in their current order
];
```

Do not change `collectSupplementalIssues`; it should continue to combine `...DEFAULT_SUPPLEMENTAL_COLLECTORS` with `options.supplementalCollectors`.

- [x] **Step 4: Add CI report context**

In `verify-report.ts`, import `findLatestDisciplineReport`. In `buildVerifyReport`, add to `modes`:

```ts
const latestDiscipline = findLatestDisciplineReport(context.repoRoot);
const modes = {
  ...(result.metadata ?? {}),
  ...(latestDiscipline ? {
    agentDiscipline: {
      latestReportPath: latestDiscipline.path,
      completionStatus: latestDiscipline.report.completion.status,
      mode: latestDiscipline.report.mode,
    },
  } : {}),
};
```

Then set `modes` in the return object to this local `modes`.

- [x] **Step 5: Link summary**

In `verify-summary.ts`, include discipline evidence in `renderVerifyDecisionEvidence`:

```ts
const agentDiscipline = report.modes?.agentDiscipline as { latestReportPath?: string; completionStatus?: string } | undefined;
if (agentDiscipline?.latestReportPath) {
  evidence.push(`Agent discipline: \`${agentDiscipline.latestReportPath}\` (${agentDiscipline.completionStatus ?? "unknown"})`);
}
```

- [x] **Step 6: Run tests**

Run:

```bash
node --import tsx ./tools/jispec/tests/agent-discipline-verify-ci.ts
node --import tsx ./tools/jispec/tests/verify-runner-warn-advisory.ts
node --import tsx ./tools/jispec/tests/ci-summary-markdown.ts
npm run typecheck
```

Expected: strict discipline failures become blocking verify issues, fast advisory discipline failures remain advisory, CI summary links the report, and existing verify behavior remains stable when no discipline report is present.

- [x] **Step 7: Commit**

```bash
git add tools/jispec/verify/agent-discipline-collector.ts tools/jispec/verify/verify-runner.ts tools/jispec/ci/verify-report.ts tools/jispec/ci/verify-summary.ts tools/jispec/tests/agent-discipline-verify-ci.ts
git commit -m "feat: surface agent discipline in verify and ci"
```

## Task 9: Privacy, Regression Matrix, And Documentation

**Files:**

- Modify: `tools/jispec/privacy/redaction.ts`
- Modify: `tools/jispec/tests/privacy-redaction.ts`
- Modify: `tools/jispec/tests/regression-runner.ts`
- Modify: `tools/jispec/tests/regression-matrix-contract.ts`
- Modify: `docs/superpowers/superpowers-discipline-layer.md`
- Modify: `docs/v1-mainline-stable-contract.md`
- Modify: `README.zh-CN.md`
- Modify: `README.md`

- [x] **Step 1: Add privacy test fixture**

In `privacy-redaction.ts` test file, add a case that writes:

```text
.jispec/agent-run/change-1/debug-packet.md
.jispec/agent-run/change-1/discipline-report.json
```

with a fake `sk-test12345678901234567890` token and asserts:

- category is `handoff`
- `shareDecision` is `review_before_sharing`
- redacted view exists

- [x] **Step 2: Update privacy categorization**

In `tools/jispec/privacy/redaction.ts`, update `categorizeArtifact`:

```ts
if (relativePath.startsWith(".jispec/agent-run/")) {
  return "handoff";
}
```

Update `requiresReviewBeforeSharing`:

```ts
if (normalized.startsWith(".jispec/agent-run/") && (normalized.includes("debug-packet") || normalized.includes("completion-evidence"))) {
  return true;
}
```

- [x] **Step 3: Register regression suites**

In `tools/jispec/tests/regression-runner.ts`, add under `change-implement`:

```ts
changeImplement({ name: 'P10 Agent Discipline Artifacts', file: 'agent-discipline-artifacts.ts', expectedTests: 10, task: 'P10-T1/P10-T2/P10-T3/P10-T4' }),
changeImplement({ name: 'P10 Agent Discipline Implement', file: 'agent-discipline-implement.ts', expectedTests: 4, task: 'P10-T5/P10-T6/P10-T7' }),
changeImplement({ name: 'P10 Agent Discipline Verify CI', file: 'agent-discipline-verify-ci.ts', expectedTests: 3, task: 'P10-T8' }),
```

Each P10 test file must print the registered number of passing tests: `10`, `4`, and `3` respectively. The privacy coverage is added to the existing `privacy-redaction.ts` suite, so update `Privacy Redaction` from `expectedTests: 6` to `expectedTests: 7`.

- [x] **Step 4: Update regression matrix contract**

In `tools/jispec/tests/regression-matrix-contract.ts`, update the frozen totals exactly:

- `manifest.totalSuites`: `131 -> 134`
- `manifest.totalExpectedTests`: `581 -> 599`
- `change-implement.suiteCount`: `8 -> 11`
- `change-implement.expectedTests`: `33 -> 50`
- `runtime-extended.suiteCount`: remains `43`
- `runtime-extended.expectedTests`: `187 -> 188`

- [x] **Step 5: Update docs**

Add a short implementation status section to `docs/superpowers/superpowers-discipline-layer.md`:

```md
## P10 Implementation Contract

Agent Discipline Layer writes process artifacts under `.jispec/agent-run/<session-id>/`.
These artifacts record phase, test strategy, debug, completion, truth-source, isolation, and review discipline evidence.
They are process evidence consumed by `verify`; strict discipline failures block through `verify`, while fast advisory discipline findings remain advisory. They do not replace `verify`, `ci:verify`, policy, baseline, waiver, audit, or replay.
```

Add to `docs/v1-mainline-stable-contract.md` under key files:

```md
| `.jispec/agent-run/<session-id>/session.json` | `implement` 后 | AI/external implementation process session；记录 phase、scope、test strategy 和 truth sources |
| `.jispec/agent-run/<session-id>/completion-evidence.json` | `implement` 后 | 完成前验证证据；记录真实 test/verify 命令和缺失证据 |
| `.jispec/agent-run/<session-id>/discipline-report.json` | `implement` 后 | Agent Discipline Layer 机器摘要；供 verify/CI/Console 读取 |
| `.jispec/agent-run/<session-id>/discipline-summary.md` | `implement` 后 | 人类可读过程纪律摘要，不是机器 API |
| `.jispec/agent-run/<session-id>/debug-packet.json` | implementation stop point 失败时 | 系统化调试证据；记录复现命令、失败点、下一步 |
```

Add one paragraph to both READMEs:

```md
JiSpec also records Agent Discipline evidence for AI or external coding tool attempts. The artifacts under `.jispec/agent-run/<session-id>/` show whether the work followed phase, scope, test strategy, debug, completion, and review discipline. They make "done" evidence-based, while `verify` and `ci:verify` remain the deterministic delivery gate.
```

Use the Chinese equivalent in `README.zh-CN.md`.

- [x] **Step 6: Run tests**

Run:

```bash
node --import tsx ./tools/jispec/tests/privacy-redaction.ts
node --import tsx ./tools/jispec/tests/regression-matrix-contract.ts
node --import tsx ./tools/jispec/tests/regression-runner.ts --manifest-json
npm run typecheck
```

Expected: privacy covers agent-run artifacts; regression manifest remains valid.

- [x] **Step 7: Commit**

```bash
git add tools/jispec/privacy/redaction.ts tools/jispec/tests/privacy-redaction.ts tools/jispec/tests/regression-runner.ts tools/jispec/tests/regression-matrix-contract.ts docs/superpowers/superpowers-discipline-layer.md docs/v1-mainline-stable-contract.md README.zh-CN.md README.md
git commit -m "docs: document agent discipline delivery contract"
```

## Task 10: Final Gate And Pilot Check

**Files:**

- No new source files.
- Verify all files modified by Tasks 1-9.

- [x] **Step 1: Run targeted P10 suites**

Run:

```bash
node --import tsx ./tools/jispec/tests/agent-discipline-artifacts.ts
node --import tsx ./tools/jispec/tests/agent-discipline-implement.ts
node --import tsx ./tools/jispec/tests/agent-discipline-verify-ci.ts
```

Expected: all suites print full pass counts.

- [x] **Step 2: Run existing affected suites**

Run:

```bash
node --import tsx ./tools/jispec/tests/implement-patch-mediation.ts
node --import tsx ./tools/jispec/tests/implement-handoff-mainline.ts
node --import tsx ./tools/jispec/tests/verify-runner-warn-advisory.ts
node --import tsx ./tools/jispec/tests/ci-summary-markdown.ts
node --import tsx ./tools/jispec/tests/privacy-redaction.ts
node --import tsx ./tools/jispec/tests/regression-matrix-contract.ts
```

Expected: all affected suites pass.

- [x] **Step 3: Run main gates**

Run:

```bash
npm run typecheck
npm run verify
npm run ci:verify
npm run pilot:ready
```

Expected:

- typecheck exits `0`
- verify exits `0`; `WARN_ADVISORY` is acceptable only for existing advisory debt
- ci:verify exits `0`
- pilot ready gate passes 7/7

- [x] **Step 4: Run regression manifest**

Run:

```bash
node --import tsx ./tools/jispec/tests/regression-runner.ts --manifest-json
```

Expected:

- `consistency.valid` is `true`
- `change-implement` includes the three P10 suites

- [x] **Step 5: Final commit**

If Task 10 required fixes:

```bash
git add <changed-files>
git commit -m "test: verify agent discipline layer"
```

If no fixes were needed, no commit is required for this task.

## Acceptance Criteria

P10 is accepted when:

- `implement` writes `.jispec/agent-run/<session-id>/session.json`.
- `implement` writes `.jispec/agent-run/<session-id>/completion-evidence.json`.
- `implement` writes `.jispec/agent-run/<session-id>/discipline-report.json`.
- `implement` writes `.jispec/agent-run/<session-id>/discipline-summary.md`.
- Failed implementation stop points write `.jispec/agent-run/<session-id>/debug-packet.json` and `.md`.
- Handoff JSON and formatted handoff text include agent discipline and review discipline sections.
- `verify` reads latest discipline report and emits blocking process issues for strict incomplete, blocked, owner-review, phase, test strategy, or isolation problems.
- `verify` keeps fast advisory discipline findings advisory.
- `ci:verify` links the latest discipline report when present.
- Privacy scan includes `.jispec/agent-run/` artifacts and redacts secrets.
- Regression matrix registers P10 suites.
- Existing `verify`, `ci:verify`, policy, baseline, waiver, audit, and replay semantics remain authoritative.

## Out Of Scope

- Do not make JiSpec generate business code.
- Do not add a remote service.
- Do not upload source.
- Do not make discipline Markdown a machine API.
- Do not make inferred LLM claims blocking.
- Do not replace external patch mediation.
- Do not make missing discipline artifacts fail old repositories during normal `verify`.

## Implementation Notes

- Keep all paths repo-relative inside JSON artifacts unless existing APIs require absolute paths.
- Keep summaries short. They are reviewer aids, not logs.
- Treat strict discipline failures as blocking in P10 because a recorded failed discipline artifact means the implementation cannot be considered deliverable. Keep fast advisory discipline findings advisory so small fast-lane work can surface process gaps without breaking old workflows.
- Prefer additive optional fields on existing handoff/report interfaces.
- Preserve existing tests before broadening behavior.
