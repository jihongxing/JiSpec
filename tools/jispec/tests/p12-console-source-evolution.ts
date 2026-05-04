import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { buildConsoleGovernanceActionPlan } from "../console/governance-actions";
import { buildConsoleGovernanceDashboard } from "../console/governance-dashboard";
import { exportConsoleGovernanceSnapshot } from "../console/governance-export";
import { collectConsoleLocalSnapshot } from "../console/read-model-snapshot";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== P12 Console Source Evolution Tests ===\n");

  const results: TestResult[] = [];

  runCase(results, "snapshot exposes source evolution governance summary from declared artifacts", () => {
    withFixture((root) => {
      writeSourceEvolutionFixture(root, { status: "proposed" });
      const snapshot = collectConsoleLocalSnapshot(root);
      const sourceEvolution = snapshot.governance.objects.find((object) => object.id === "source_evolution_governance");
      assert.ok(sourceEvolution);
      assert.equal(sourceEvolution.status, "available");
      assert.equal(sourceEvolution.summary.activeChangeId, "chg-source-1");
      assert.equal(sourceEvolution.summary.blockingOpenReviewItems, 1);
      assert.equal(sourceEvolution.summary.openReviewItems, 1);
      assert.equal(sourceEvolution.summary.lastAdoptedSourceChange, "chg-source-0");
      assert.equal((sourceEvolution.summary.lifecycleDeltaCounts as Record<string, unknown>).modified, 1);
      assert.equal(sourceEvolution.summary.sourceEvolutionPath, ".spec/deltas/chg-source-1/source-evolution.json");
      assert.equal(sourceEvolution.summary.sourceReviewPath, ".spec/deltas/chg-source-1/source-review.yaml");
    });
  });

  runCase(results, "dashboard and action plan turn open source evolution into explicit owner commands", () => {
    withFixture((root) => {
      writeSourceEvolutionFixture(root, { status: "proposed" });
      const dashboard = buildConsoleGovernanceDashboard(root);
      const question = dashboard.questions.find((entry) => entry.id === "source_evolution_progress");
      assert.ok(question);
      assert.equal(question.status, "blocked");
      assert.match(question.answer, /blocking review item/);

      const plan = buildConsoleGovernanceActionPlan(root);
      const adopt = plan.actions.find((action) => action.kind === "source_review_adopt");
      const defer = plan.actions.find((action) => action.kind === "source_review_defer");
      const waive = plan.actions.find((action) => action.kind === "source_review_waive");
      assert.ok(adopt);
      assert.ok(defer);
      assert.ok(waive);
      assert.ok(adopt.recommendedCommand.includes("source review adopt modified:req-order-1"));
      assert.ok(defer.recommendedCommand.includes("source review defer modified:req-order-1"));
      assert.ok(waive.recommendedCommand.includes("source review waive modified:req-order-1"));
      assert.equal(adopt.sourceObject, "source_evolution_governance");
      assert.ok(adopt.decisionPacket.sourceArtifacts.some((artifact) => artifact.includes("source-review.yaml")));
    });
  });

  runCase(results, "fully reviewed source evolution becomes ready for source adopt", () => {
    withFixture((root) => {
      writeSourceEvolutionFixture(root, { status: "adopted" });
      const dashboard = buildConsoleGovernanceDashboard(root);
      const question = dashboard.questions.find((entry) => entry.id === "source_evolution_progress");
      assert.ok(question);
      assert.equal(question.status, "attention");
      assert.match(question.answer, /ready for source adopt/);

      const plan = buildConsoleGovernanceActionPlan(root);
      const sourceAdopt = plan.actions.find((action) => action.kind === "source_adopt");
      assert.ok(sourceAdopt);
      assert.equal(sourceAdopt.status, "ready");
      assert.ok(sourceAdopt.recommendedCommand.includes("source adopt --change chg-source-1"));
      assert.ok(sourceAdopt.commandWrites.includes(".spec/requirements/lifecycle.yaml"));
      assert.ok(sourceAdopt.commandWrites.includes(".spec/baselines/current.yaml"));
    });
  });

  runCase(results, "export snapshot carries source evolution aggregate hints", () => {
    withFixture((root) => {
      writeSourceEvolutionFixture(root, { status: "adopted" });
      const exported = exportConsoleGovernanceSnapshot({ root });
      assert.equal(exported.snapshot.aggregateHints.sourceEvolutionChangeId, "chg-source-1");
      assert.equal(exported.snapshot.aggregateHints.sourceEvolutionBlockingOpenItems, 0);
      assert.equal(exported.snapshot.aggregateHints.lastAdoptedSourceChange, "chg-source-0");
      assert.equal(
        (exported.snapshot.aggregateHints.lifecycleDeltaCounts as Record<string, unknown>).modified,
        1,
      );
    });
  });

  summarize(results);
}

function runCase(results: TestResult[], name: string, run: () => void): void {
  try {
    run();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function summarize(results: TestResult[]): void {
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

function withFixture(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p12-console-source-evolution-"));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeSourceEvolutionFixture(root: string, options: { status: "proposed" | "adopted" }): void {
  writeJson(root, ".jispec-ci/verify-report.json", {
    verdict: "PASS",
    issueCount: 0,
    blockingIssueCount: 0,
    advisoryIssueCount: 0,
    counts: {
      total: 0,
      blocking: 0,
      advisory: 0,
    },
  });
  writeYaml(root, ".spec/policy.yaml", {
    version: 1,
    team: {
      profile: "small_team",
      owner: "platform",
      reviewers: ["architect"],
      required_reviewers: 1,
    },
    rules: [],
  });
  writeYaml(root, ".spec/baselines/current.yaml", {
    version: 1,
    source_evolution: {
      source_evolution_path: ".spec/deltas/chg-source-0/source-evolution.json",
      source_review_path: ".spec/deltas/chg-source-0/source-review.yaml",
      last_adopted_change_id: "chg-source-0",
    },
    requirement_lifecycle: {
      path: ".spec/requirements/lifecycle.yaml",
      registry_version: 4,
      last_adopted_change_id: "chg-source-0",
    },
  });
  writeYaml(root, ".spec/requirements/lifecycle.yaml", {
    version: 1,
    registry_version: 4,
    generated_at: "2026-05-04T00:00:00.000Z",
    last_adopted_change_id: "chg-source-0",
    requirements: [
      {
        id: "REQ-ORDER-001",
        status: "modified",
        supersedes: [],
        replaced_by: [],
        merged_from: [],
      },
      {
        id: "REQ-ORDER-010",
        status: "active",
        supersedes: [],
        replaced_by: [],
        merged_from: [],
      },
    ],
  });
  writeJson(root, ".spec/deltas/chg-source-1/source-evolution.json", {
    version: 1,
    generated_at: "2026-05-04T00:00:00.000Z",
    summary: {
      changed: true,
      total: 1,
      added: 0,
      modified: 1,
      deprecated: 0,
      split: 0,
      merged: 0,
      reanchored: 0,
    },
    items: [
      {
        evolution_id: "modified:req-order-1",
        evolution_kind: "modified",
        source_document: "requirements",
        severity: "blocking",
        path: "docs/input/requirements.md",
        anchor_id: "REQ-ORDER-001",
        summary: "Requirement REQ-ORDER-001 changed semantic content.",
      },
    ],
  });
  writeYaml(root, ".spec/deltas/chg-source-1/source-review.yaml", {
    version: 1,
    change_id: "chg-source-1",
    generated_at: "2026-05-04T00:00:00.000Z",
    updated_at: "2026-05-04T00:00:00.000Z",
    source_evolution_path: ".spec/deltas/chg-source-1/source-evolution.json",
    items: [
      {
        item_id: "modified:req-order-1",
        evolution_id: "modified:req-order-1",
        anchor_id: "REQ-ORDER-001",
        evolution_kind: "modified",
        source_document: "requirements",
        severity: "blocking",
        status: options.status,
        summary: "Requirement REQ-ORDER-001 changed semantic content.",
      },
    ],
  });
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeYaml(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, yaml.dump(value, { lineWidth: 100, noRefs: true, sortKeys: false }));
}

function writeText(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
}

main();
