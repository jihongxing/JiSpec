import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { main as runCliMain } from "../cli";
import { runGreenfieldInit } from "../greenfield/init";
import {
  runGreenfieldReviewBrief,
  runGreenfieldReviewList,
  runGreenfieldReviewTransition,
} from "../greenfield/review-workflow";
import { runVerify } from "../verify/verify-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface ReviewRecord {
  gate?: {
    status?: string;
  };
  decisions?: Array<{
    decision_id?: string;
    decision_type?: string;
    confidence?: string;
    status?: string;
    blocking?: boolean;
    review_history?: Array<{ action?: string; actor?: string; reason?: string }>;
    correction?: {
      correction_path?: string;
      delta_path?: string;
    };
    defer_record?: {
      owner?: string;
      open_decision_path?: string;
    };
    waiver_record?: {
      debt_id?: string;
      ledger_path?: string;
    };
  }>;
}

async function main(): Promise<void> {
  console.log("=== Greenfield Review Adopt Workflow Tests ===\n");

  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-review-workflow-src-"));
  const results: TestResult[] = [];

  try {
    const requirementsPath = path.join(sourceRoot, "requirements.md");
    const technicalSolutionPath = path.join(sourceRoot, "technical-solution.md");
    fs.writeFileSync(requirementsPath, buildCommerceRequirements(), "utf-8");
    fs.writeFileSync(technicalSolutionPath, buildCommerceTechnicalSolution(), "utf-8");

    results.push(await recordAsync("review list groups generated decisions for human triage", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const list = runGreenfieldReviewList(root);
        const cli = await runCliAndCapture(["node", "jispec-cli", "review", "list", "--root", root]);

        assert.equal(list.total > 10, true);
        assert.ok(list.groups.advisory.some((decision) => decision.decision_id === "REV-DOMAIN-ORDERING"));
        assert.equal(cli.code, 0);
        assert.match(cli.stdout, /Greenfield Review Decisions/);
        assert.match(cli.stdout, /Advisory/);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("review adopt records human metadata and clears low-confidence gate", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        mutateDecision(root, "REV-DOMAIN-CATALOG", (decision) => {
          decision.confidence = "low";
          decision.status = "proposed";
        });
        const before = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });
        const adopt = runGreenfieldReviewTransition({
          root,
          decisionId: "REV-DOMAIN-CATALOG",
          action: "adopt",
          actor: "architect",
          reason: "Catalog boundary is explicitly supported by REQ-CAT-001.",
          now: "2026-04-29T00:00:00.000Z",
        });
        const after = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });
        const record = loadReviewRecord(root);
        const decision = record.decisions?.find((entry) => entry.decision_id === "REV-DOMAIN-CATALOG");

        assert.equal(before.verdict, "FAIL_BLOCKING");
        assert.equal(adopt.decision.status, "adopted");
        assert.equal(decision?.review_history?.[0]?.actor, "architect");
        assert.equal(record.gate?.status, "review_ready");
        assert.equal(after.verdict, "PASS");
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("review reject creates correction delta and keeps verify blocking", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const reject = runGreenfieldReviewTransition({
          root,
          decisionId: "REV-CONTRACT-CTR-ORDERING-001",
          action: "reject",
          actor: "architect",
          reason: "Checkout payload shape is unclear.",
          now: "2026-04-29T00:00:00.000Z",
        });
        const record = loadReviewRecord(root);
        const decision = record.decisions?.find((entry) => entry.decision_id === "REV-CONTRACT-CTR-ORDERING-001");
        const verify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

        assert.equal(reject.decision.status, "rejected");
        assert.ok(reject.correction?.correction_path);
        assert.ok(reject.correction?.delta_path);
        assert.ok(fs.existsSync(path.join(root, reject.correction?.correction_path ?? "")));
        assert.ok(fs.existsSync(path.join(root, reject.correction?.delta_path ?? "")));
        assert.equal(decision?.correction?.delta_path, reject.correction?.delta_path);
        assert.equal(record.gate?.status, "blocked_on_human_review");
        assert.equal(verify.verdict, "FAIL_BLOCKING");
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_REVIEW_ITEM_REJECTED"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("review defer writes open decision and remains visible without blocking", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const deferred = runGreenfieldReviewTransition({
          root,
          decisionId: "REV-OPEN-003",
          action: "defer",
          actor: "architect",
          owner: "tl-ordering",
          reason: "Availability read mode will be decided before V1 implementation.",
          expiresAt: "2026-05-30T00:00:00.000Z",
          now: "2026-04-29T00:00:00.000Z",
        });
        const reviewOpenDecision = fs.readFileSync(path.join(root, ".spec", "greenfield", "review-pack", "open-decisions.md"), "utf-8");
        const verify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

        assert.equal(deferred.decision.status, "deferred");
        assert.equal(deferred.openDecisionPath, ".spec/greenfield/review-pack/open-decisions.md");
        assert.match(reviewOpenDecision, /REV-OPEN-003/);
        assert.equal(verify.verdict, "WARN_ADVISORY");
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_REVIEW_ITEM_DEFERRED_OR_WAIVED"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("review waive writes spec debt and remains visible in verify", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const waived = runGreenfieldReviewTransition({
          root,
          decisionId: "REV-OPEN-004",
          action: "waive",
          actor: "architect",
          owner: "tl-ordering",
          reason: "Event transport is outside V1 implementation scope.",
          expiresAt: "2026-05-30T00:00:00.000Z",
          now: "2026-04-29T00:00:00.000Z",
        });
        const ledger = fs.readFileSync(path.join(root, ".spec", "spec-debt", "ledger.yaml"), "utf-8");
        const verify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

        assert.equal(waived.decision.status, "waived");
        assert.equal(waived.specDebt?.id, "debt-review-rev-open-004");
        assert.match(ledger, /debt-review-rev-open-004/);
        assert.equal(verify.verdict, "WARN_ADVISORY");
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_SPEC_DEBT_OPEN"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("expired review defer is controlled by review gate expiry policy", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const deferred = runGreenfieldReviewTransition({
          root,
          decisionId: "REV-OPEN-003",
          action: "defer",
          actor: "architect",
          owner: "tl-ordering",
          reason: "Availability read mode will be decided before V1 implementation.",
          expiresAt: "2000-01-01T00:00:00.000Z",
          now: "2026-04-29T00:00:00.000Z",
        });
        const verify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

        assert.equal(deferred.decision.status, "deferred");
        assert.equal(verify.verdict, "FAIL_BLOCKING");
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_REVIEW_ITEM_EXPIRED_DEFER_OR_WAIVE"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("review brief generates Chinese and English human reports", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const zh = runGreenfieldReviewBrief({ root, lang: "zh-CN" });
        const en = runGreenfieldReviewBrief({ root, lang: "en-US" });
        const cli = await runCliAndCapture(["node", "jispec-cli", "review", "brief", "--root", root, "--lang", "zh-CN"]);

        assert.ok(fs.existsSync(zh.outputPath));
        assert.ok(fs.existsSync(en.outputPath));
        assert.match(fs.readFileSync(zh.outputPath, "utf-8"), /初始化人类审查报告/);
        assert.match(fs.readFileSync(en.outputPath, "utf-8"), /Human Review Brief/);
        assert.equal(cli.code, 0);
        assert.match(cli.stdout, /Greenfield human review brief written/);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("wrong-thing review signals catch uncovered requirements, unexplained contexts, CRUD contracts, and missing failure paths", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const baselineVerify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });
        assert.ok(!baselineVerify.issues.some((issue) => issue.code === "GREENFIELD_REVIEW_SIGNAL_CONTEXT_UNEXPLAINED"));

        const graphPath = path.join(root, ".spec", "evidence", "evidence-graph.json");
        const graph = JSON.parse(fs.readFileSync(graphPath, "utf-8")) as {
          summary?: { requirementCoverage?: { uncovered?: string[] } };
        };
        graph.summary ??= {};
        graph.summary.requirementCoverage ??= {};
        graph.summary.requirementCoverage.uncovered = ["REQ-ORD-999"];
        fs.writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf-8");

        fs.appendFileSync(
          path.join(root, "docs", "input", "technical-solution.md"),
          "\n## Additional Boundary\nUse bounded contexts for `billing`.\n",
          "utf-8",
        );

        const contractsPath = path.join(root, "contexts", "ordering", "design", "contracts.yaml");
        const contracts = yaml.load(fs.readFileSync(contractsPath, "utf-8")) as { contracts?: unknown[] };
        contracts.contracts = [
          ...(Array.isArray(contracts.contracts) ? contracts.contracts : []),
          {
            id: "CTR-ORDERING-999",
            name: "CreateRecord",
            direction: "inbound",
            source_confidence: "inferred",
            source_requirement_ids: [],
            open_questions: [],
            fields: [{ name: "id", type: "string", required: true }],
          },
        ];
        fs.writeFileSync(contractsPath, yaml.dump(contracts, { lineWidth: 100, noRefs: true, sortKeys: false }), "utf-8");

        const failureScenario = path.join(
          root,
          "contexts",
          "ordering",
          "behavior",
          "scenarios",
          "SCN-ORDER-CHECKOUT-OUT-OF-STOCK.feature",
        );
        fs.rmSync(failureScenario, { force: true });

        const validScenario = path.join(
          root,
          "contexts",
          "ordering",
          "behavior",
          "scenarios",
          "SCN-ORDER-CHECKOUT-VALID.feature",
        );
        fs.writeFileSync(
          validScenario,
          fs.readFileSync(validScenario, "utf-8")
            .replace(/all items marked sellable/g, "all items ready")
            .replace(/no order is created/g, "the workflow completes"),
          "utf-8",
        );

        const verify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

        assert.equal(verify.verdict, "FAIL_BLOCKING");
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_REVIEW_SIGNAL_REQUIREMENT_UNCOVERED"));
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_REVIEW_SIGNAL_CONTEXT_UNEXPLAINED"));
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_REVIEW_SIGNAL_CRUD_CONTRACT"));
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_REVIEW_SIGNAL_FAILURE_PATH_MISSING"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));
  } catch (error) {
    results.push({
      name: "greenfield review adopt workflow execution",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }

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

function createInitializedRoot(requirementsPath: string, technicalSolutionPath: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-review-workflow-"));
  const init = runGreenfieldInit({
    root,
    requirements: requirementsPath,
    technicalSolution: technicalSolutionPath,
  });

  assert.equal(init.status, "input_contract_ready");
  return root;
}

function loadReviewRecord(root: string): ReviewRecord {
  return yaml.load(
    fs.readFileSync(path.join(root, ".spec", "greenfield", "review-pack", "review-record.yaml"), "utf-8"),
  ) as ReviewRecord;
}

function mutateDecision(root: string, decisionId: string, mutate: (decision: NonNullable<ReviewRecord["decisions"]>[number]) => void): void {
  const recordPath = path.join(root, ".spec", "greenfield", "review-pack", "review-record.yaml");
  const record = yaml.load(fs.readFileSync(recordPath, "utf-8")) as ReviewRecord;
  const decision = record.decisions?.find((entry) => entry.decision_id === decisionId);
  assert.ok(decision);
  mutate(decision);
  fs.writeFileSync(recordPath, yaml.dump(record, { lineWidth: 100, noRefs: true, sortKeys: false }), "utf-8");
}

async function runCliAndCapture(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const previousLog = console.log;
  const previousError = console.error;
  const previousExitCode = process.exitCode;
  const stdout: string[] = [];
  const stderr: string[] = [];

  console.log = (message?: unknown, ...optional: unknown[]) => {
    stdout.push([message, ...optional].map(String).join(" "));
  };
  console.error = (message?: unknown, ...optional: unknown[]) => {
    stderr.push([message, ...optional].map(String).join(" "));
  };
  process.exitCode = undefined;

  try {
    const code = await runCliMain(argv);
    return {
      code,
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  } finally {
    console.log = previousLog;
    console.error = previousError;
    process.exitCode = previousExitCode;
  }
}

async function recordAsync(name: string, run: () => Promise<void>): Promise<TestResult> {
  try {
    await run();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildCommerceRequirements(): string {
  return [
    "# Commerce Platform Requirements",
    "",
    "## Objective",
    "",
    "Build a commerce platform that supports product browsing, cart validation, checkout, and order creation.",
    "",
    "## Users / Actors",
    "",
    "- Shopper",
    "",
    "## Core Journeys",
    "",
    "- Shopper browses available products.",
    "- Shopper checks out a valid cart.",
    "- Shopper receives a clear rejection when a cart contains unavailable items.",
    "",
    "## Functional Requirements",
    "",
    "### REQ-CAT-001",
    "",
    "The system must expose products that are available for sale.",
    "",
    "### REQ-ORD-001",
    "",
    "A shopper must be able to submit an order from a valid cart.",
    "",
    "### REQ-ORD-002",
    "",
    "Checkout must reject carts with unavailable items.",
    "",
    "### REQ-ORD-003",
    "",
    "An order must not be created unless the cart total is calculable and stock validation passes.",
    "",
    "### REQ-ORD-004",
    "",
    "The system must emit a domain event when an order is created successfully.",
    "",
    "## Non-Functional Requirements",
    "",
    "- Checkout validation must be testable without external payment infrastructure.",
    "",
    "## Out Of Scope",
    "",
    "- Refunds.",
    "- Payment capture.",
    "- Shipment orchestration.",
    "",
    "## Acceptance Signals",
    "",
    "- Available products appear in the product browsing flow.",
    "- Valid checkout creates an order.",
  ].join("\n");
}

function buildCommerceTechnicalSolution(): string {
  return [
    "# Commerce Platform Technical Solution",
    "",
    "## Architecture Direction",
    "",
    "Use bounded contexts for `catalog` and `ordering`.",
    "",
    "- `catalog` owns product availability and price read models.",
    "- `ordering` owns cart validation, checkout orchestration, and order persistence.",
    "",
    "## Bounded Context Hypothesis",
    "",
    "- `catalog`",
    "- `ordering`",
    "",
    "## Integration Boundaries",
    "",
    "`ordering` may consume published product availability information from `catalog`, but it may not write to catalog-owned models.",
    "",
    "## Data Ownership",
    "",
    "Each bounded context owns persistence and publishes integration contracts instead of sharing tables.",
    "",
    "## Testing Strategy",
    "",
    "Use unit tests for domain rules, integration tests for checkout flow, and contract tests for catalog availability consumption.",
    "",
    "## Operational Constraints",
    "",
    "No direct table sharing between bounded contexts.",
    "",
    "## Risks And Open Decisions",
    "",
    "- Payment is deferred.",
  ].join("\n");
}

void main();
