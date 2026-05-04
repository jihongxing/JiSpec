import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main as runCliMain } from "../cli";
import { runChangeCommand } from "../change/change-command";
import { runGreenfieldSourceDiff } from "../greenfield/source-diff";
import { runGreenfieldInit } from "../greenfield/init";
import { runGreenfieldSourceRefresh } from "../greenfield/source-refresh";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== P11 Source Diff Tests ===\n");

  const results: TestResult[] = [];

  try {
    const textRoot = createFixtureRoot("jispec-p11-source-diff-text-");
    initializeGreenfieldProject(textRoot);
    const textChange = await runChangeCommand({
      root: textRoot,
      summary: "Expand checkout validation source contract",
      mode: "prompt",
      changeType: "modify",
      contextId: "ordering",
    });
    fs.writeFileSync(
      path.join(textRoot, "docs", "input", "requirements.md"),
      [
        "# Commerce Platform Requirements",
        "",
        "## Objective",
        "",
        "Build a commerce platform.",
        "",
        "## Users / Actors",
        "",
        "- Shopper",
        "",
        "## Core Journeys",
        "",
        "- Shopper checks out a cart.",
        "",
        "## Functional Requirements",
        "",
        "### REQ-ORD-001",
        "",
        "A shopper must submit an order.",
        "",
        "### REQ-ORD-002",
        "",
        "Checkout must reject unavailable or recalled items.",
        "",
        "### REQ-ORD-999",
        "",
        "Refund intake must be tracked.",
        "",
        "## Non-Functional Requirements",
        "",
        "- Checkout should be responsive.",
        "",
        "## Out Of Scope",
        "",
        "- Chargebacks.",
        "",
        "## Acceptance Signals",
        "",
        "- Order created.",
      ].join("\n"),
      "utf-8",
    );
    runGreenfieldSourceRefresh({
      root: textRoot,
      change: textChange.session.specDelta?.changeId,
    });
    const textCli = await runCliAndCapture([
      "node",
      "jispec-cli",
      "source",
      "diff",
      "--root",
      textRoot,
      "--change",
      textChange.session.specDelta?.changeId ?? "latest",
    ]);
    results.push(record("CLI source diff text groups lifecycle sections and next commands", () => {
      assert.equal(textCli.code, 0, textCli.stderr);
      assert.match(textCli.stdout, /Greenfield Source Diff/);
      assert.match(textCli.stdout, /Added: 1/);
      assert.match(textCli.stdout, /Modified: 1/);
      assert.match(textCli.stdout, /REQ-ORD-999 \[proposed, blocking\]/);
      assert.match(textCli.stdout, /REQ-ORD-002 \[proposed, blocking\]/);
      assert.match(textCli.stdout, /jispec-cli source review adopt <itemId>/);
      assert.match(textCli.stdout, /jispec-cli source adopt/);
    }));

    const jsonCli = await runCliAndCapture([
      "node",
      "jispec-cli",
      "source",
      "diff",
      "--root",
      textRoot,
      "--change",
      textChange.session.specDelta?.changeId ?? "latest",
      "--json",
    ]);
    const jsonPayload = JSON.parse(jsonCli.stdout) as {
      changed?: boolean;
      counts?: Record<string, number>;
      sections?: Array<{ kind?: string; count?: number; items?: Array<{ anchorId?: string; effectiveStatus?: string }> }>;
      activeSnapshotPath?: string;
      proposedSnapshotPath?: string;
      nextCommands?: string[];
    };
    results.push(record("CLI source diff JSON exposes stable paths, counts, sections, and actions", () => {
      assert.equal(jsonCli.code, 0, jsonCli.stderr);
      assert.equal(jsonPayload.changed, true);
      assert.equal(jsonPayload.counts?.added, 1);
      assert.equal(jsonPayload.counts?.modified, 1);
      assert.ok(jsonPayload.activeSnapshotPath?.endsWith("/.spec/greenfield/source-documents.active.yaml"));
      assert.ok(jsonPayload.proposedSnapshotPath?.endsWith("/source-documents.proposed.yaml"));
      const addedSection = jsonPayload.sections?.find((section) => section.kind === "added");
      const modifiedSection = jsonPayload.sections?.find((section) => section.kind === "modified");
      assert.equal(addedSection?.count, 1);
      assert.equal(modifiedSection?.count, 1);
      assert.equal(addedSection?.items?.[0]?.anchorId, "REQ-ORD-999");
      assert.equal(modifiedSection?.items?.[0]?.effectiveStatus, "proposed");
      assert.ok(jsonPayload.nextCommands?.some((command) => command.includes("source review waive <itemId>")));
    }));
    fs.rmSync(textRoot, { recursive: true, force: true });

    const splitRoot = createFixtureRoot("jispec-p11-source-diff-split-");
    initializeGreenfieldProject(splitRoot);
    const splitChange = await runChangeCommand({
      root: splitRoot,
      summary: "Split checkout validation requirement",
      mode: "prompt",
      changeType: "redesign",
      contextId: "ordering",
    });
    fs.writeFileSync(
      path.join(splitRoot, "docs", "input", "requirements.md"),
      buildRequirements({
        functionalRequirements: [
          ["REQ-ORD-001", "A shopper must submit an order."],
          ["REQ-ORD-010", "Checkout must reject unavailable items."],
          ["REQ-ORD-011", "Checkout must reject recalled items."],
        ],
      }),
      "utf-8",
    );
    runGreenfieldSourceRefresh({
      root: splitRoot,
      change: splitChange.session.specDelta?.changeId,
    });
    const splitResult = runGreenfieldSourceDiff(splitRoot, splitChange.session.specDelta?.changeId);
    results.push(record("source diff groups split evolution with successor mapping", () => {
      const splitSection = splitResult.sections.find((section) => section.kind === "split");
      assert.equal(splitResult.counts.split, 1);
      assert.equal(splitSection?.count, 1);
      assert.match(splitSection?.items?.[0]?.subject ?? "", /REQ-ORD-002 -> REQ-ORD-010, REQ-ORD-011/);
      assert.deepEqual(splitSection?.items?.[0]?.successorIds, ["REQ-ORD-010", "REQ-ORD-011"]);
    }));
    fs.rmSync(splitRoot, { recursive: true, force: true });

    const mergedRoot = createFixtureRoot("jispec-p11-source-diff-merged-");
    initializeGreenfieldProject(mergedRoot, {
      functionalRequirements: [
        ["REQ-ORD-001", "A shopper must submit an order."],
        ["REQ-ORD-003", "Checkout must reject unavailable items."],
        ["REQ-ORD-004", "Checkout must reject recalled items."],
      ],
    });
    const mergedChange = await runChangeCommand({
      root: mergedRoot,
      summary: "Merge checkout rejection requirements",
      mode: "prompt",
      changeType: "redesign",
      contextId: "ordering",
    });
    fs.writeFileSync(
      path.join(mergedRoot, "docs", "input", "requirements.md"),
      buildRequirements({
        functionalRequirements: [
          ["REQ-ORD-001", "A shopper must submit an order."],
          ["REQ-ORD-020", "Checkout must reject unavailable or recalled items."],
        ],
      }),
      "utf-8",
    );
    runGreenfieldSourceRefresh({
      root: mergedRoot,
      change: mergedChange.session.specDelta?.changeId,
    });
    const mergedResult = runGreenfieldSourceDiff(mergedRoot, mergedChange.session.specDelta?.changeId);
    results.push(record("source diff groups merged evolution with predecessor mapping", () => {
      const mergedSection = mergedResult.sections.find((section) => section.kind === "merged");
      assert.equal(mergedResult.counts.merged, 1);
      assert.equal(mergedSection?.count, 1);
      assert.match(mergedSection?.items?.[0]?.subject ?? "", /REQ-ORD-003, REQ-ORD-004 -> REQ-ORD-020/);
      assert.deepEqual(mergedSection?.items?.[0]?.predecessorIds, ["REQ-ORD-003", "REQ-ORD-004"]);
    }));
    fs.rmSync(mergedRoot, { recursive: true, force: true });

    const reanchoredRoot = createFixtureRoot("jispec-p11-source-diff-reanchored-");
    initializeGreenfieldProject(reanchoredRoot);
    const reanchoredChange = await runChangeCommand({
      root: reanchoredRoot,
      summary: "Rename technical headings without semantic change",
      mode: "prompt",
      changeType: "modify",
      contextId: "ordering",
    });
    fs.writeFileSync(
      path.join(reanchoredRoot, "docs", "input", "technical-solution.md"),
      fs.readFileSync(path.join(reanchoredRoot, "docs", "input", "technical-solution.md"), "utf-8")
        .replace("## Architecture Direction", "## Bounded Context Hypothesis")
        .replace("## Integration Boundaries", "## Integration Rule")
        .replace("## Operational Constraints", "## Constraints"),
      "utf-8",
    );
    runGreenfieldSourceRefresh({
      root: reanchoredRoot,
      change: reanchoredChange.session.specDelta?.changeId,
    });
    const reanchoredResult = runGreenfieldSourceDiff(reanchoredRoot, reanchoredChange.session.specDelta?.changeId);
    results.push(record("source diff keeps layout-only reanchoring advisory and grouped separately", () => {
      const reanchoredSection = reanchoredResult.sections.find((section) => section.kind === "reanchored");
      assert.ok((reanchoredSection?.count ?? 0) > 0);
      assert.ok(reanchoredSection?.items.every((item) => item.severity === "advisory"));
      assert.equal(reanchoredResult.blockingOpenCount, 0);
    }));
    fs.rmSync(reanchoredRoot, { recursive: true, force: true });

    const unchangedRoot = createFixtureRoot("jispec-p11-source-diff-unchanged-");
    initializeGreenfieldProject(unchangedRoot);
    const unchangedChange = await runChangeCommand({
      root: unchangedRoot,
      summary: "Review unchanged source state",
      mode: "prompt",
      changeType: "modify",
      contextId: "ordering",
    });
    runGreenfieldSourceRefresh({
      root: unchangedRoot,
      change: unchangedChange.session.specDelta?.changeId,
    });
    const unchangedResult = runGreenfieldSourceDiff(unchangedRoot, unchangedChange.session.specDelta?.changeId);
    results.push(record("source diff reports unchanged source snapshots without synthetic items", () => {
      assert.equal(unchangedResult.changed, false);
      assert.equal(unchangedResult.total, 0);
      assert.ok(unchangedResult.sections.every((section) => section.count === 0));
    }));
    fs.rmSync(unchangedRoot, { recursive: true, force: true });
  } catch (error) {
    results.push({
      name: "p11 source diff execution",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
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

function record(name: string, run: () => void): TestResult {
  try {
    run();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function createFixtureRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function initializeGreenfieldProject(
  root: string,
  options?: {
    functionalRequirements?: Array<[string, string]>;
  },
): void {
  const requirementsPath = path.join(root, "requirements.md");
  const technicalSolutionPath = path.join(root, "technical-solution.md");
  fs.writeFileSync(requirementsPath, buildRequirements(options), "utf-8");
  fs.writeFileSync(technicalSolutionPath, buildTechnicalSolution(), "utf-8");
  runGreenfieldInit({
    root,
    requirements: requirementsPath,
    technicalSolution: technicalSolutionPath,
  });
}

function buildRequirements(options?: { functionalRequirements?: Array<[string, string]> }): string {
  const functionalRequirements = options?.functionalRequirements ?? [
    ["REQ-ORD-001", "A shopper must submit an order."],
    ["REQ-ORD-002", "Checkout must reject unavailable items."],
  ];

  return [
    "# Commerce Platform Requirements",
    "",
    "## Objective",
    "",
    "Build a commerce platform.",
    "",
    "## Users / Actors",
    "",
    "- Shopper",
    "",
    "## Core Journeys",
    "",
    "- Shopper checks out a cart.",
    "",
    "## Functional Requirements",
    "",
    ...functionalRequirements.flatMap(([id, statement]) => [
      `### ${id}`,
      "",
      statement,
      "",
    ]),
    "## Non-Functional Requirements",
    "",
    "- Checkout should be responsive.",
    "",
    "## Out Of Scope",
    "",
    "- Refunds.",
    "",
    "## Acceptance Signals",
    "",
    "- Order created.",
  ].join("\n");
}

function buildTechnicalSolution(): string {
  return [
    "# Commerce Platform Technical Solution",
    "",
    "## Architecture Direction",
    "",
    "Use bounded contexts.",
    "",
    "## Bounded Context Hypothesis",
    "",
    "- ordering",
    "",
    "## Integration Boundaries",
    "",
    "No direct writes across boundaries.",
    "",
    "## Data Ownership",
    "",
    "Ordering owns orders.",
    "",
    "## Testing Strategy",
    "",
    "Use unit and contract tests.",
    "",
    "## Operational Constraints",
    "",
    "Keep synchronous checkout responsive.",
  ].join("\n");
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

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
