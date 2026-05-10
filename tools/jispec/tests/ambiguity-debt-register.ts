import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readAuditEvents } from "../audit/event-ledger";
import { collectConsoleLocalSnapshot } from "../console/read-model-snapshot";
import { normalizeMutationBoundary } from "../change/mutation-boundary-model";
import { runChangeCommand } from "../change/change-command";
import {
  archiveAmbiguityDebt,
  listAmbiguityDebtRecords,
  recordAmbiguityDebtFromMutationBoundary,
  reclassifyAmbiguityDebt,
  requestAmbiguityDebtOwnerReview,
  resolveAmbiguityDebt,
  summarizeAmbiguityDebtPrior,
  writeAmbiguityDebtLedger,
  type AmbiguityDebtRegistrationResult,
} from "../change/ambiguity-debt-register";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Ambiguity Debt Register Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("register open creates ledger record and audit event", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-ambiguity-debt-open-"));
    try {
      const boundary = buildUnmappedBoundary("Ambiguous external update needs review");
      const result = recordAmbiguityDebtFromMutationBoundary(root, boundary, {
        actor: "codex",
        owner: "platform-lead",
      });
      assert.ok(result);
      assert.equal(result?.summary.action, "created");
      assert.equal(result?.record.status, "open");
      assert.match(result?.summary.ledgerPath ?? "", /^\.spec\/ambiguity-debt\/ledger\.json$/);
      assert.equal(fs.existsSync(path.join(root, ".spec", "ambiguity-debt", "ledger.json")), true);
      assert.equal(listAmbiguityDebtRecords(root).length, 1);
      assert.equal(listAmbiguityDebtRecords(root)[0]?.owner, "platform-lead");
      assert.ok(listAmbiguityDebtRecords(root)[0]?.nextReview);
      const events = readAuditEvents(root);
      assert.equal(events.at(-1)?.type, "ambiguity_debt_open");
      assert.equal(events.at(-1)?.details?.action, "created");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("ambiguity debt prior feeds later mutation normalization", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-ambiguity-debt-prior-"));
    try {
      writeAmbiguityDebtLedger(root, {
        version: 1,
        debts: [
          {
            id: "ambiguity-debt-seed",
            createdAt: "2026-05-10T00:00:00.000Z",
            mutationId: "mutation-seed",
            status: "open",
            owner: "platform-lead",
            reason: "Ambiguous external update needs review",
            confidence: 0.55,
            nextReview: "2026-05-17T00:00:00.000Z",
            source: "ide_patch",
            candidateChangeIds: ["chg-20260510-order-update"],
            lineage: [],
            summary: "Ambiguous external update needs review",
          },
        ],
      });

      const input = {
        source: "ide_patch" as const,
        summary: "Ambiguous external update needs review",
        touchedPaths: ["scratch/ambiguous.dat"],
        facts: ["needs review"],
        history: [],
        payload: {
          source: "ide_patch",
          summary: "Ambiguous external update needs review",
        },
        observedAt: "2026-05-10T00:00:00.000Z",
      };

      const prior = summarizeAmbiguityDebtPrior(root, input);
      assert.ok(prior);
      assert.equal(prior?.matchedDebtIds[0], "ambiguity-debt-seed");
      assert.ok(prior?.matchedCandidateChangeIds.includes("chg-20260510-order-update"));
      assert.ok(prior?.confidenceBoost > 0);

      const projected = normalizeMutationBoundary({
        ...input,
        ambiguityDebtPrior: prior,
      });
      assert.equal(projected.classification, "derived_change");
      assert.ok(projected.candidateChangeIds.includes("chg-20260510-order-update"));
      assert.ok(projected.reasons.some((reason) => reason.includes("ambiguity debt prior matched")));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("owner review adds review metadata without closing the debt", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-ambiguity-debt-review-"));
    try {
      const result = seedAmbiguityDebt(root);
      const reviewed = requestAmbiguityDebtOwnerReview(root, result.record.id, {
        actor: "platform-lead",
        reason: "Owner review requested before adoption.",
        requestedAt: "2026-05-11T00:00:00.000Z",
        nextReview: "2026-05-18T00:00:00.000Z",
      });
      assert.equal(reviewed.status, "open");
      assert.equal(reviewed.ownerReview?.requestedBy, "platform-lead");
      assert.equal(reviewed.ownerReview?.reason, "Owner review requested before adoption.");
      assert.equal(reviewed.nextReview, "2026-05-18T00:00:00.000Z");
      const events = readAuditEvents(root);
      assert.equal(events.at(-1)?.type, "ambiguity_debt_owner_review");
      assert.equal(events.at(-1)?.details?.debtId, result.record.id);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("reclassify resolve and archive transitions remain auditable", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-ambiguity-debt-lifecycle-"));
    try {
      const result = seedAmbiguityDebt(root);
      const reclassified = reclassifyAmbiguityDebt(root, result.record.id, {
        actor: "platform-lead",
        reason: "Canonical change found after review.",
        reclassifiedAt: "2026-05-12T00:00:00.000Z",
        candidateChangeIds: ["change-1"],
      });
      assert.equal(reclassified.status, "reclassified");
      assert.deepEqual(reclassified.candidateChangeIds, ["change-1"]);

      const resolved = resolveAmbiguityDebt(root, result.record.id, {
        actor: "platform-lead",
        reason: "The change has been adopted elsewhere.",
        resolvedAt: "2026-05-13T00:00:00.000Z",
      });
      assert.equal(resolved.status, "resolved");
      assert.equal(resolved.resolution?.outcome, "resolved");

      const archived = archiveAmbiguityDebt(root, result.record.id, {
        actor: "platform-lead",
        reason: "Archive after resolution.",
        archivedAt: "2026-05-14T00:00:00.000Z",
      });
      assert.equal(archived.status, "archived");
      assert.equal(archived.resolution?.outcome, "archived");

      const events = readAuditEvents(root).map((event) => event.type);
      assert.deepEqual(events, [
        "ambiguity_debt_open",
        "ambiguity_debt_reclassify",
        "ambiguity_debt_resolve",
        "ambiguity_debt_archive",
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("upserting the same mutation keeps a single register entry", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-ambiguity-debt-upsert-"));
    try {
      const boundary = buildUnmappedBoundary("Ambiguous patch needs review");
      const first = recordAmbiguityDebtFromMutationBoundary(root, boundary, {
        actor: "codex",
        owner: "platform-lead",
      });
      const second = recordAmbiguityDebtFromMutationBoundary(root, boundary, {
        actor: "codex",
        owner: "platform-lead-2",
      });
      assert.equal(first?.summary.action, "created");
      assert.equal(second?.summary.action, "updated");
      assert.equal(first?.summary.debtId, second?.summary.debtId);
      assert.equal(listAmbiguityDebtRecords(root).length, 1);
      assert.equal(listAmbiguityDebtRecords(root)[0]?.owner, "platform-lead-2");
      assert.equal(readAuditEvents(root).at(-1)?.details?.action, "updated");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(await recordAsync("change command writes ambiguity debt and Console can read it", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-ambiguity-debt-change-"));
    try {
      seedGitRepository(root);

      const change = await runChange(root);
      assert.equal(change.session.ambiguityDebt?.action, "created");
      assert.equal(change.session.ambiguityDebt?.status, "open");
      assert.match(change.text, /Ambiguity Debt:/);
      assert.match(change.text, /open ambiguity debt/i);

      const snapshot = collectConsoleLocalSnapshot(root);
      assert.equal(snapshot.artifacts.find((artifact) => artifact.id === "ambiguity-debt-ledger")?.status, "available");
      assert.equal(snapshot.artifacts.find((artifact) => artifact.id === "ambiguity-debt-ledger")?.instances[0]?.relativePath, ".spec/ambiguity-debt/ledger.json");
      const governance = snapshot.governance.objects.find((object) => object.id === "ambiguity_debt_register");
      assert.equal(governance?.status, "available");
      assert.equal(governance?.summary.total, 1);
      assert.equal(governance?.summary.open, 1);
      assert.equal(governance?.summary.ownerReviewRequested, 0);
      assert.equal((governance?.summary.sourceCounts as Record<string, number> | undefined)?.git_diff, 1);
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

function buildUnmappedBoundary(summary: string) {
  return normalizeMutationBoundary({
    source: "external_patch",
    summary,
    touchedPaths: ["scratch/ambiguous.dat"],
    facts: ["external patch requires review", "needs review"],
    history: [],
    payload: {
      source: "external_patch",
      summary,
    },
    observedAt: "2026-05-10T00:00:00.000Z",
  });
}

function seedAmbiguityDebt(root: string): AmbiguityDebtRegistrationResult {
  const boundary = buildUnmappedBoundary("Ambiguous external update needs review");
  const result = recordAmbiguityDebtFromMutationBoundary(root, boundary, {
    actor: "codex",
    owner: "platform-lead",
  });
  assert.ok(result);
  return result;
}

function seedGitRepository(root: string): void {
  fs.mkdirSync(path.join(root, "scratch"), { recursive: true });
  fs.writeFileSync(path.join(root, "scratch", "ambiguous.dat"), "baseline\n", "utf-8");

  const commands: Array<{ args: string[]; label: string }> = [
    { args: ["init"], label: "git init" },
    { args: ["config", "user.email", "ambiguity@example.com"], label: "git config user.email" },
    { args: ["config", "user.name", "JiSpec Ambiguity"], label: "git config user.name" },
    { args: ["add", "."], label: "git add ." },
    { args: ["commit", "-m", "baseline"], label: "git commit" },
  ];

  for (const command of commands) {
    const result = spawnSync("git", command.args, {
      cwd: root,
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      throw new Error(`Failed to initialize git repository at ${command.label}: ${result.stderr}`);
    }
  }
}

function runChange(root: string) {
  return runChangeCommand({
    root,
    summary: "Ambiguous external update needs review",
    mode: "prompt",
    json: true,
    baseRef: "HEAD",
  });
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
