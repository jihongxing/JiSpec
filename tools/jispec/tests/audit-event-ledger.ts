import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { appendAuditEvent, inspectAuditLedger, readAuditEvents } from "../audit/event-ledger";
import { runBootstrapAdopt } from "../bootstrap/adopt";
import { setChangeDefaultMode } from "../change/default-mode-command";
import type { ChangeSession } from "../change/change-session";
import { collectConsoleLocalSnapshot } from "../console/read-model-snapshot";
import { mediateExternalPatch } from "../implement/patch-mediation";
import { migrateVerifyPolicy } from "../policy/migrate-policy";
import { compareReleaseBaselines, createReleaseSnapshot } from "../release/baseline-snapshot";
import { updateGreenfieldSpecDebtStatus, writeGreenfieldSpecDebtRecord } from "../greenfield/spec-debt-ledger";
import { createWaiver, recordExpiredWaiverAuditEvents, revokeWaiver } from "../verify/waiver-store";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Audit Event Ledger Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("append/read keeps local JSONL audit event contract", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-audit-ledger-"));
    try {
      appendAuditEvent(root, {
        type: "policy_change",
        actor: "platform-lead",
        reason: "Tighten policy before execute default.",
        timestamp: "2026-05-01T00:00:00.000Z",
        sourceArtifact: {
          kind: "verify-policy",
          path: ".spec/policy.yaml",
        },
        affectedContracts: [".spec/policy.yaml", ".spec/contracts/domain.yaml"],
      });
      const events = readAuditEvents(root);
      assert.equal(events.length, 1);
      assert.equal(events[0]?.version, 1);
      assert.equal(events[0]?.sequence, 1);
      assert.equal(events[0]?.type, "policy_change");
      assert.equal(events[0]?.actor, "platform-lead");
      assert.equal(events[0]?.reason, "Tighten policy before execute default.");
      assert.deepEqual(events[0]?.affectedContracts, [".spec/contracts/domain.yaml", ".spec/policy.yaml"]);
      assert.equal(events[0]?.previousHash, null);
      assert.equal(typeof events[0]?.eventHash, "string");
      assert.equal(events[0]?.eventHash.length, 64);
      assert.equal(events[0]?.signature?.algorithm, "reserved-none");
      const integrity = inspectAuditLedger(root);
      assert.equal(integrity.status, "verified");
      assert.equal(integrity.verifiedEventCount, 1);
      assert.equal(integrity.latestHash, events[0]?.eventHash);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("audit integrity reports legacy, damaged, and out-of-order ledger warnings", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-audit-integrity-"));
    try {
      appendAuditEvent(root, {
        type: "policy_change",
        actor: "platform-lead",
        reason: "Initial policy change.",
        timestamp: "2026-05-02T00:00:00.000Z",
        sourceArtifact: { kind: "verify-policy", path: ".spec/policy.yaml" },
      });
      appendAuditEvent(root, {
        type: "policy_change",
        actor: "platform-lead",
        reason: "Second policy change.",
        timestamp: "2026-05-01T00:00:00.000Z",
        sourceArtifact: { kind: "verify-policy", path: ".spec/policy.yaml" },
      });
      const ledgerPath = path.join(root, ".spec", "audit", "events.jsonl");
      const lines = fs.readFileSync(ledgerPath, "utf-8").trim().split(/\r?\n/);
      const first = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
      first.reason = "Tampered after append.";
      fs.writeFileSync(ledgerPath, `${JSON.stringify(first)}\n${lines[1]}\n{not-json}\n`, "utf-8");

      const integrity = inspectAuditLedger(root);
      assert.equal(integrity.status, "invalid");
      assert.ok(integrity.issues.some((issue) => issue.code === "AUDIT_EVENT_HASH_MISMATCH"));
      assert.ok(integrity.issues.some((issue) => issue.code === "AUDIT_EVENT_TIMESTAMP_OUT_OF_ORDER"));
      assert.ok(integrity.issues.some((issue) => issue.code === "AUDIT_EVENT_UNPARSEABLE"));

      const snapshot = collectConsoleLocalSnapshot(root);
      const audit = snapshot.governance.objects.find((object) => object.id === "audit_events");
      assert.equal(audit?.status, "invalid");
      assert.equal(audit?.summary.integrityStatus, "invalid");
      assert.ok((audit?.summary.integrityIssueCount as number) >= 3);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("governance commands append actor, reason, source artifact, and affected contract", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-audit-governance-"));
    try {
      writeProject(root);
      migrateVerifyPolicy(root, undefined, {
        actor: "policy-owner",
        reason: "Initialize local policy posture.",
      });
      setChangeDefaultMode({
        root,
        mode: "prompt",
        actor: "platform-lead",
        reason: "Keep prompt while auditing execute default.",
      });
      const created = createWaiver(root, {
        code: "API_CONTRACT_INVALID_JSON",
        path: ".spec/contracts/api_spec.json",
        owner: "contracts-team",
        actor: "reviewer",
        reason: "Legacy API contract is being normalized.",
      });
      revokeWaiver(root, created.waiver.id, {
        revokedBy: "reviewer",
        reason: "Legacy API contract is fixed.",
      });
      createWaiver(root, {
        code: "FEATURE_CONTRACT_SCENARIOS_MISSING",
        owner: "contracts-team",
        reason: "Temporary behavior gap.",
        expiresAt: "2020-01-01T00:00:00.000Z",
      });
      recordExpiredWaiverAuditEvents(root, {
        now: new Date("2026-05-01T00:00:00.000Z"),
        actor: "reviewer",
        reason: "Record expired waiver for governance review.",
      });
      writeGreenfieldSpecDebtRecord(root, {
        id: "debt-audit",
        kind: "waiver",
        owner: "contracts-team",
        reason: "Known contract debt.",
        createdAt: "2026-05-01T00:00:00.000Z",
        affectedAssets: [".spec/contracts/behaviors.feature"],
        affectedContracts: ["CTR-AUDIT-001"],
        repaymentHint: "Repay before V2 baseline.",
      });
      updateGreenfieldSpecDebtStatus(root, {
        id: "debt-audit",
        status: "repaid",
        actor: "contracts-team",
        reason: "Behavior contract is now covered.",
      });
      writeGreenfieldSpecDebtRecord(root, {
        id: "debt-cancel-audit",
        kind: "defer",
        owner: "contracts-team",
        reason: "Candidate debt opened during triage.",
        createdAt: "2026-05-01T00:00:00.000Z",
        affectedAssets: [".spec/contracts/domain.yaml"],
        affectedContracts: ["CTR-AUDIT-002"],
        repaymentHint: "Confirm whether this is still relevant.",
      });
      updateGreenfieldSpecDebtStatus(root, {
        id: "debt-cancel-audit",
        status: "cancelled",
        actor: "contracts-team",
        reason: "Debt is no longer relevant after owner review.",
      });

      const events = readAuditEvents(root);
      assert.deepEqual(events.map((event) => event.type), [
        "policy_migrate",
        "default_mode_set",
        "waiver_create",
        "waiver_revoke",
        "waiver_create",
        "waiver_expire",
        "spec_debt_repay",
        "spec_debt_cancel",
      ]);
      assert.ok(events.every((event) => event.actor && event.reason && event.sourceArtifact.path));
      assert.ok(events.find((event) => event.type === "waiver_create")?.affectedContracts.includes("issue:API_CONTRACT_INVALID_JSON"));
      assert.ok(events.find((event) => event.type === "default_mode_set")?.affectedContracts.includes("change.default_mode"));
      assert.ok(events.find((event) => event.type === "waiver_expire")?.details?.waiverId);
      assert.ok(events.find((event) => event.type === "spec_debt_repay")?.affectedContracts.includes("CTR-AUDIT-001"));
      assert.ok(events.find((event) => event.type === "spec_debt_cancel")?.affectedContracts.includes("CTR-AUDIT-002"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(await recordAsync("bootstrap adopt emits accept, edit, reject, and defer audit decisions", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-audit-adopt-"));
    try {
      seedDraftSession(root, "audit-session");
      await runBootstrapAdopt({
        root,
        session: "audit-session",
        actor: "takeover-lead",
        reason: "Curate takeover draft contracts.",
        decisions: [
          { artifactKind: "domain", kind: "edit", editedContent: "contexts:\n  - name: checkout\n" },
          { artifactKind: "api", kind: "reject", note: "API routes need owner correction." },
          { artifactKind: "feature", kind: "skip_as_spec_debt", note: "Behavior evidence is thin." },
        ],
      });
      seedDraftSession(root, "audit-session-accept");
      await runBootstrapAdopt({
        root,
        session: "audit-session-accept",
        actor: "takeover-lead",
        decisions: [
          { artifactKind: "domain", kind: "accept" },
          { artifactKind: "api", kind: "reject" },
          { artifactKind: "feature", kind: "reject" },
        ],
      });
      const types = readAuditEvents(root).map((event) => event.type);
      assert.ok(types.includes("adopt_accept"));
      assert.ok(types.includes("adopt_edit"));
      assert.ok(types.includes("adopt_reject"));
      assert.ok(types.includes("adopt_defer"));
      assert.ok(readAuditEvents(root).every((event) => event.actor === "takeover-lead"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("release and external patch intake events are available to Console governance snapshot", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-audit-console-"));
    try {
      seedCurrentBaseline(root);
      createReleaseSnapshot({
        root,
        version: "v1",
        frozenAt: "2026-05-01T00:00:00.000Z",
        actor: "release-manager",
        reason: "Freeze V1 baseline for governance.",
      });
      compareReleaseBaselines({
        root,
        from: "v1",
        to: "current",
        actor: "release-manager",
        reason: "Check current drift after V1.",
      });
      const patchPath = path.join(root, "change.patch");
      fs.writeFileSync(patchPath, [
        "diff --git a/src/outside.ts b/src/outside.ts",
        "new file mode 100644",
        "index 0000000..1111111",
        "--- /dev/null",
        "+++ b/src/outside.ts",
        "@@ -0,0 +1 @@",
        "+export const outside = true;",
        "",
      ].join("\n"), "utf-8");
      mediateExternalPatch(root, createChangeSession(), patchPath);

      const snapshot = collectConsoleLocalSnapshot(root);
      const audit = snapshot.governance.objects.find((object) => object.id === "audit_events");
      assert.equal(audit?.status, "available");
      assert.equal(audit?.summary.eventCount, 3);
      assert.equal(audit?.summary.latestEventType, "external_patch_intake");
      assert.equal(typeof audit?.summary.latestActor, "string");
      assert.notEqual(audit?.summary.latestActor, "");
      assert.equal((audit?.summary.eventsByType as Record<string, number>).release_snapshot, 1);
      assert.equal((audit?.summary.eventsByType as Record<string, number>).release_compare, 1);
      assert.equal((audit?.summary.eventsByType as Record<string, number>).external_patch_intake, 1);
      assert.ok((audit?.summary.boundaryChangeCount as number) >= 2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  let passed = 0;
  let failed = 0;
  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
      failed++;
    }
  }

  console.log(`\n${passed}/${results.length} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function recordAsync(name: string, fn: () => Promise<void>): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function writeProject(root: string): void {
  const projectPath = path.join(root, "jiproject", "project.yaml");
  fs.mkdirSync(path.dirname(projectPath), { recursive: true });
  fs.writeFileSync(projectPath, yaml.dump({ id: "audit-fixture", name: "Audit Fixture" }), "utf-8");
}

function seedDraftSession(root: string, sessionId: string): void {
  const sessionRoot = path.join(root, ".spec", "sessions", sessionId);
  fs.mkdirSync(path.join(sessionRoot, "drafts"), { recursive: true });
  fs.writeFileSync(path.join(sessionRoot, "drafts", "domain.yaml"), "contexts:\n  - name: ordering\n", "utf-8");
  fs.writeFileSync(path.join(sessionRoot, "drafts", "api_spec.json"), JSON.stringify({ openapi: "3.1.0" }, null, 2), "utf-8");
  fs.writeFileSync(path.join(sessionRoot, "drafts", "behaviors.feature"), "Feature: Checkout\n  Scenario: Pay\n    Given a cart\n", "utf-8");
  fs.writeFileSync(
    path.join(sessionRoot, "manifest.json"),
    JSON.stringify({
      sessionId,
      repoRoot: root,
      sourceEvidenceGraphPath: ".spec/facts/bootstrap/evidence-graph.json",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      status: "drafted",
      artifactPaths: [
        "drafts/domain.yaml",
        "drafts/api_spec.json",
        "drafts/behaviors.feature",
      ],
      artifacts: [
        descriptor("domain", "drafts/domain.yaml"),
        descriptor("api", "drafts/api_spec.json"),
        descriptor("feature", "drafts/behaviors.feature"),
      ],
    }, null, 2),
    "utf-8",
  );
}

function descriptor(kind: "domain" | "api" | "feature", relativePath: string): Record<string, unknown> {
  return {
    kind,
    relativePath,
    sourceFiles: [`src/${kind}.ts`],
    confidenceScore: 0.8,
    provenanceNote: `${kind} evidence`,
  };
}

function seedCurrentBaseline(root: string): void {
  const baselinePath = path.join(root, ".spec", "baselines", "current.yaml");
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(
    baselinePath,
    yaml.dump({
      baseline_id: "current",
      project_id: "audit-project",
      requirement_ids: ["REQ-1"],
      contexts: ["ordering"],
      contracts: ["CTR-ORDERING-001"],
      scenarios: [],
      slices: [],
      assets: [".spec/contracts/domain.yaml"],
    }, { lineWidth: 100, noRefs: true, sortKeys: false }),
    "utf-8",
  );
}

function createChangeSession(): ChangeSession {
  return {
    id: "change-audit",
    createdAt: "2026-05-01T00:00:00.000Z",
    summary: "Audit rejected patch",
    orchestrationMode: "execute",
    laneDecision: {
      lane: "fast",
      reasons: ["test"],
      autoPromoted: false,
    },
    changedPaths: [
      {
        path: "src/allowed.ts",
        kind: "unknown",
      },
    ],
    nextCommands: [],
  };
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
