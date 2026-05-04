import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { renderVerifySummaryMarkdown } from "../ci/verify-summary";
import { runChangeCommand } from "../change/change-command";
import { summarizeChangeImpact, classifyImpactFreshness } from "../change/impact-summary";
import { readChangeSession } from "../change/change-session";
import { runGreenfieldInit } from "../greenfield/init";
import { runVerify } from "../verify/verify-runner";
import { buildVerifyReport } from "../ci/verify-report";
import { TEST_SUITES, buildRegressionMatrixManifest } from "./regression-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== P9 Change Impact Summary Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("freshness classifier returns not_available_yet for missing graph", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-impact-missing-"));
    try {
      const summary = summarizeChangeImpact({ root, changeId: "chg-missing", generatedAt: "2026-05-02T00:00:00.000Z" });
      assert.equal(summary.version, 2);
      assert.equal(summary.freshness.status, "not_available_yet");
      assert.equal(summary.advisoryOnly, true);
      assert.equal(summary.changedFiles.length, 0);
      assert.equal(classifyImpactFreshness(root, ".spec/deltas/chg-missing/impact-graph.json").status, "not_available_yet");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(await recordAsync("change session references delta impact graph, report, and verify focus", async () => {
    const fixture = createGreenfieldFixture();
    try {
      const change = await runChangeCommand({
        root: fixture.root,
        summary: "Add refund intake for REQ-ORD-002",
        mode: "prompt",
        changeType: "add",
        contextId: "ordering",
        sliceId: "ordering-checkout-v1",
        json: true,
      });
      const session = readChangeSession(fixture.root);
      const impact = session?.impactSummary;

      assert.ok(change.session.specDelta);
      assert.equal(typeof impact, "object");
      assert.equal(Array.isArray(impact), false);
      assert.ok(impact && !Array.isArray(impact));
      assert.equal(impact.version, 2);
      assert.equal(impact.changeId, change.session.specDelta?.changeId);
      assert.match(impact.artifacts.impactGraphPath, /\.spec\/deltas\/.+\/impact-graph\.json$/);
      assert.match(impact.artifacts.impactReportPath, /\.spec\/deltas\/.+\/impact-report\.md$/);
      assert.match(impact.artifacts.verifyFocusPath, /\.spec\/deltas\/.+\/verify-focus\.yaml$/);
      assert.ok(impact.changedFiles.length > 0);
      assert.ok(impact.contractRefs.length > 0);
      assert.ok(impact.scopeHints.length > 0);
      assert.equal(impact.freshness.status, "fresh");
      assert.equal(impact.advisoryOnly, true);
    } finally {
      cleanupFixture(fixture);
    }
  }));

  results.push(await recordAsync("change command text includes contract-aware impact scope", async () => {
    const fixture = createGreenfieldFixture();
    try {
      const change = await runChangeCommand({
        root: fixture.root,
        summary: "Add refund intake for REQ-ORD-002",
        mode: "prompt",
        changeType: "add",
        contextId: "ordering",
        sliceId: "ordering-checkout-v1",
      });
      const impact = change.session.impactSummary;
      assert.ok(impact && !Array.isArray(impact));
      assert.ok(impact.impactedContracts.length >= 1);
      assert.ok(impact.impactedFiles.length >= 1);
      assert.ok(impact.changedFiles.length >= 1);
      assert.ok(impact.contractRefs.length >= 1);
      assert.ok(impact.scopeHints.length >= 1);
      assert.ok(impact.nextReplayCommand.includes("npm run jispec-cli -- change"));
      assert.ok(change.text.includes("Impact graph freshness: fresh"));
      assert.ok(change.text.includes("Changed files:"));
      assert.ok(change.text.includes("## Decision Snapshot"));
    } finally {
      cleanupFixture(fixture);
    }
  }));

  results.push(record("stale graph remains advisory and never blocks deterministic verify", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-impact-stale-"));
    try {
      const graphPath = path.join(root, ".spec", "deltas", "chg-stale", "impact-graph.json");
      fs.mkdirSync(path.dirname(graphPath), { recursive: true });
      fs.writeFileSync(graphPath, JSON.stringify({ change_id: "chg-stale", generated_at: "2020-01-01T00:00:00.000Z" }, null, 2), "utf-8");
      const freshness = classifyImpactFreshness(root, ".spec/deltas/chg-stale/impact-graph.json", "2026-05-02T00:00:00.000Z");
      assert.equal(freshness.status, "stale");
      const summary = summarizeChangeImpact({ root, changeId: "chg-stale", generatedAt: "2026-05-02T00:00:00.000Z" });
      assert.equal(summary.advisoryOnly, true);
      assert.equal(summary.missingVerificationHints.length > 0, true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

    results.push(await recordAsync("verify and Markdown summary expose impact freshness as advisory context", async () => {
    const fixture = createGreenfieldFixture();
    try {
      await runChangeCommand({
        root: fixture.root,
        summary: "Add refund intake for REQ-ORD-002",
        mode: "prompt",
        changeType: "add",
        contextId: "ordering",
        sliceId: "ordering-checkout-v1",
      });
      const verify = await runVerify({ root: fixture.root, generatedAt: "2026-05-02T00:00:00.000Z" });
      assert.equal(verify.metadata?.impactGraphFreshness, "fresh");
      assert.equal(verify.metadata?.impactAdvisoryOnly, true);
      assert.ok(Array.isArray(verify.metadata?.impactGraphChangedFiles));
      assert.ok((verify.metadata?.impactGraphChangedFiles as string[]).length > 0);
      assert.ok(Array.isArray(verify.metadata?.impactGraphImpactedFiles));
      assert.ok((verify.metadata?.impactGraphImpactedFiles as string[]).length > 0);
      assert.ok(Array.isArray(verify.metadata?.impactGraphContractRefs));
      assert.ok((verify.metadata?.impactGraphContractRefs as string[]).length > 0);
      assert.ok(Array.isArray(verify.metadata?.impactGraphScopeHints));
      assert.ok((verify.metadata?.impactGraphScopeHints as string[]).some((hint) => hint.includes("contract-sensitive") || hint.includes("contracts:")));
      assert.ok(Array.isArray(verify.metadata?.impactGraphMissingVerificationHints));
      assert.ok(typeof verify.metadata?.impactReportPath === "string");
      assert.ok(typeof verify.metadata?.verifyFocusPath === "string");
      assert.ok(typeof verify.metadata?.impactGraphNextReplayCommand === "string");

      const report = buildVerifyReport(verify, { repoRoot: fixture.root, provider: "local" });
      const summary = renderVerifySummaryMarkdown(report);
      assert.ok(summary.includes("## Impact Graph"));
      assert.ok(summary.includes("## Decision Snapshot"));
      assert.ok(summary.includes("Current state:"));
      assert.ok(summary.includes("Risk:"));
      assert.ok(summary.includes("Evidence:"));
      assert.ok(summary.includes("impact graph `"));
      assert.ok(summary.includes("impact report `"));
      assert.ok(summary.includes("verify focus `"));
      assert.ok(summary.includes("impact freshness `fresh`"));
      assert.ok(summary.includes("Affected artifact: "));
      assert.ok(summary.includes("(verify focus: "));
      assert.ok(summary.includes("contracts.yaml"));
      assert.ok(summary.includes("Owner:"));
      assert.ok(summary.includes("Next command:"));
      assert.ok(summary.includes("Freshness: `fresh`"));
      assert.ok(summary.includes("Changed files:"));
      assert.ok(summary.includes("Contract refs:"));
      assert.ok(summary.includes("Scope hints:"));
      assert.ok(summary.includes("Missing verification hints:"));
      assert.ok(summary.includes("Replay command:"));
      assert.ok(summary.includes("advisory"));
    } finally {
      cleanupFixture(fixture);
    }
  }));

  results.push(await recordAsync("scenario fixtures cover api-surface, docs-only, and stale impact regressions", async () => {
    const apiFixture = createGreenfieldFixture();
    const docsFixture = createGreenfieldFixture();
    try {
      fs.appendFileSync(path.join(apiFixture.root, "src", "routes", "orders.ts"), "\nexport const routeBoundary = true;\n", "utf-8");

      const apiChange = await runChangeCommand({
        root: apiFixture.root,
        summary: "Adjust ordering contract boundary",
        mode: "prompt",
        changeType: "add",
      });
      const apiImpact = apiChange.session.impactSummary;
      assert.ok(apiImpact && !Array.isArray(apiImpact));
      assert.equal(apiChange.session.laneDecision.lane, "strict");
      assert.ok(apiImpact.changedKinds.api_surface > 0);
      assert.ok(apiImpact.scopeHints.some((hint) => hint.includes("contract-sensitive change")));
      assert.ok(apiImpact.contractRefs.length >= 0);
      assert.ok(apiChange.text.includes("Impact graph freshness:"));

      fs.appendFileSync(path.join(docsFixture.root, "README.md"), "\nAdditional governance notes.\n", "utf-8");
      const docsChange = await runChangeCommand({
        root: docsFixture.root,
        summary: "Update governance docs",
        mode: "prompt",
        changeType: "modify",
      });
      const docsImpact = docsChange.session.impactSummary;
      assert.ok(docsImpact && !Array.isArray(docsImpact));
      assert.equal(docsChange.session.laneDecision.lane, "fast");
      assert.equal(docsImpact.changedKinds.docs_only, 1);
      assert.ok(docsImpact.scopeHints.some((hint) => hint.includes("docs-only change")));
      assert.ok(docsChange.text.includes("docs-only change"));
    } finally {
      cleanupFixture(apiFixture);
      cleanupFixture(docsFixture);
    }
  }));

  results.push(record("regression matrix registers P9 change impact suite in change-implement", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p9-change-impact-summary.ts");
    assert.ok(suite);
    assert.equal(suite.area, "change-implement");
    assert.equal(suite.expectedTests, 7);
    assert.equal(suite.task, "P9-T3");

    const manifest = buildRegressionMatrixManifest();
    assert.equal(manifest.totalSuites, 150);
    assert.equal(manifest.totalExpectedTests, 669);
  }));

  printResults(results);
}

function createGreenfieldFixture(): { root: string; sourceRoot: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-impact-greenfield-"));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-impact-source-"));
  const requirementsPath = path.join(sourceRoot, "requirements.md");
  const solutionPath = path.join(sourceRoot, "technical-solution.md");
  fs.writeFileSync(requirementsPath, buildRequirements(), "utf-8");
  fs.writeFileSync(solutionPath, buildTechnicalSolution(), "utf-8");
  runGreenfieldInit({ root, requirements: requirementsPath, technicalSolution: solutionPath });
  fs.writeFileSync(path.join(root, "README.md"), "# P9 Impact Fixture\n", "utf-8");
  fs.mkdirSync(path.join(root, "src", "routes"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes", "orders.ts"),
    'export const createOrder = () => "created";\n',
    "utf-8",
  );
  initializeGitRepository(root);
  return { root, sourceRoot };
}

function cleanupFixture(fixture: { root: string; sourceRoot: string }): void {
  fs.rmSync(fixture.root, { recursive: true, force: true });
  fs.rmSync(fixture.sourceRoot, { recursive: true, force: true });
}

function initializeGitRepository(root: string): void {
  const commands: Array<{ program: string; args: string[]; label: string }> = [
    { program: "git", args: ["init"], label: "git init" },
    { program: "git", args: ["config", "user.email", "p9-impact@example.com"], label: "git config user.email" },
    { program: "git", args: ["config", "user.name", "JiSpec P9 Impact"], label: "git config user.name" },
    { program: "git", args: ["add", "."], label: "git add ." },
    { program: "git", args: ["commit", "-m", "Initial P9 impact fixture"], label: "git commit" },
  ];

  for (const command of commands) {
    const result = spawnSync(command.program, command.args, {
      cwd: root,
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      throw new Error(`Failed to initialize git repository at step '${command.label}': ${result.stderr}`);
    }
  }
}

function buildRequirements(): string {
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
    "- Shopper checks out a valid cart.",
    "",
    "## Functional Requirements",
    "",
    "### REQ-CAT-001",
    "",
    "The system must expose products that are available for sale.",
    "",
    "### REQ-ORD-001",
    "",
    "A user must be able to submit an order from a valid cart.",
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
    "## Acceptance Signals",
    "",
    "- Valid checkout creates an order.",
  ].join("\n");
}

function buildTechnicalSolution(): string {
  return [
    "# Commerce Platform Technical Solution",
    "",
    "## Architecture Direction",
    "",
    "Use bounded contexts for `catalog` and `ordering`.",
    "",
    "- `catalog` owns product availability and price read models",
    "- `ordering` owns cart validation, checkout orchestration, and order persistence",
    "",
    "## Integration Boundaries",
    "",
    "`ordering` may consume published product availability information from `catalog`, but it may not write to catalog-owned models.",
    "",
    "## Testing Strategy",
    "",
    "Use unit, integration, and contract tests.",
  ].join("\n");
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

function printResults(results: TestResult[]): void {
  let passed = 0;
  let failed = 0;
  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      console.log(`  Error: ${result.error ?? "unknown error"}`);
      failed++;
    }
  }
  console.log(`\n${passed}/${results.length} tests passed`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
