import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as yaml from "js-yaml";
import { runGreenfieldInit } from "../greenfield/init";
import { runChangeCommand } from "../change/change-command";
import { readChangeSession } from "../change/change-session";
import { runVerify } from "../verify/verify-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface DeltaYaml {
  change_id?: string;
  summary?: string;
  change_type?: string;
  state?: string;
  baseline?: {
    before?: string;
    after?: string | null;
  };
  references?: {
    requirement_ids?: string[];
    contexts?: string[];
    contracts?: string[];
    scenarios?: string[];
    slices?: string[];
    tests?: string[];
  };
  guardrails?: {
    adopt_required?: boolean;
    active_baseline_mutated?: boolean;
  };
}

interface AdoptionRecordYaml {
  change_id?: string;
  status?: string;
  baseline_before?: string;
  baseline_after?: string | null;
  guardrails?: {
    active_baseline_mutated?: boolean;
    adopt_required?: boolean;
  };
}

async function main(): Promise<void> {
  console.log("=== Greenfield Spec Delta Model Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-delta-"));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-delta-src-"));
  const results: TestResult[] = [];

  try {
    const requirementsPath = path.join(sourceRoot, "requirements.md");
    const technicalSolutionPath = path.join(sourceRoot, "technical-solution.md");
    fs.writeFileSync(requirementsPath, buildCommerceRequirements(), "utf-8");
    fs.writeFileSync(technicalSolutionPath, buildCommerceTechnicalSolution(), "utf-8");

    runGreenfieldInit({
      root,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });
    const baselinePath = path.join(root, ".spec", "baselines", "current.yaml");
    const baselineBefore = fs.readFileSync(baselinePath, "utf-8");

    const change = await runChangeCommand({
      root,
      summary: "V2: add REQ-ORD-005 refund request intake",
      mode: "prompt",
      changeType: "add",
      contextId: "ordering",
      sliceId: "ordering-checkout-v1",
      json: true,
    });
    const specDelta = change.session.specDelta;
    const delta = yaml.load(fs.readFileSync(specDelta?.deltaPath ?? "", "utf-8")) as DeltaYaml;
    const adoption = yaml.load(fs.readFileSync(specDelta?.adoptionRecordPath ?? "", "utf-8")) as AdoptionRecordYaml;
    const impactReport = fs.readFileSync(specDelta?.impactReportPath ?? "", "utf-8");
    const handoff = fs.readFileSync(specDelta?.handoffPath ?? "", "utf-8");
    const activeSession = readChangeSession(root);

    results.push(record("change creates a proposed Spec Delta workspace for Greenfield projects", () => {
      assert.ok(specDelta);
      assert.match(specDelta.changeId, /^chg-\d{8}-\d{6}-v2-add-req-ord-005-refund-request-intake-[a-f0-9]{8}$/);
      assert.ok(fs.existsSync(path.join(root, ".spec", "deltas", specDelta.changeId, "delta.yaml")));
      assert.ok(fs.existsSync(path.join(root, ".spec", "deltas", specDelta.changeId, "impact-report.md")));
      assert.ok(fs.existsSync(path.join(root, ".spec", "deltas", specDelta.changeId, "ai-implement-handoff.md")));
      assert.ok(fs.existsSync(path.join(root, ".spec", "deltas", specDelta.changeId, "adoption-record.yaml")));
      assert.equal(change.session.specDelta?.changeId, specDelta.changeId);
      assert.equal(activeSession?.specDelta?.changeId, specDelta.changeId);
    }));

    results.push(record("delta records change type, requirement references, and affected assets", () => {
      assert.equal(delta.change_id, specDelta?.changeId);
      assert.equal(delta.summary, "V2: add REQ-ORD-005 refund request intake");
      assert.equal(delta.change_type, "add");
      assert.equal(delta.state, "proposed");
      assert.equal(delta.references?.requirement_ids?.includes("REQ-ORD-005"), true);
      assert.equal(delta.references?.contexts?.[0], "ordering");
      assert.equal(delta.references?.contracts?.includes("CTR-ORDERING-001"), true);
      assert.equal(delta.references?.scenarios?.includes("SCN-ORDER-CHECKOUT-VALID"), true);
      assert.equal(delta.references?.slices?.[0], "ordering-checkout-v1");
      assert.equal(delta.references?.tests?.includes("TEST-ORDER-CHECKOUT-VALID-INTEGRATION"), true);
    }));

    results.push(record("delta guardrails require explicit adoption and preserve active baseline", () => {
      assert.equal(delta.baseline?.before, ".spec/baselines/current.yaml");
      assert.equal(delta.baseline?.after, null);
      assert.equal(delta.guardrails?.adopt_required, true);
      assert.equal(delta.guardrails?.active_baseline_mutated, false);
      assert.equal(adoption.status, "pending");
      assert.equal(adoption.baseline_before, ".spec/baselines/current.yaml");
      assert.equal(adoption.baseline_after, null);
      assert.equal(adoption.guardrails?.active_baseline_mutated, false);
      assert.equal(fs.readFileSync(baselinePath, "utf-8"), baselineBefore);
    }));

    results.push(record("impact report and command hints make the delta reviewable", () => {
      assert.match(impactReport, /# Impact Report:/);
      assert.match(impactReport, /Active baseline is not changed/);
      assert.match(handoff, /# AI Implement Handoff:/);
      assert.match(handoff, /## Dirty Subgraph/);
      assert.match(handoff, /Do not mutate `.spec\/baselines\/current.yaml`/);
      assert.match(change.text, /Spec Delta:/);
      assert.match(change.text, /AI handoff:/);
      assert.ok(change.session.nextCommands.some((hint) => hint.command.includes(`/ai-implement-handoff.md`) || hint.command.includes("\\ai-implement-handoff.md")));
      assert.ok(change.session.nextCommands.some((hint) => hint.command.includes(`/delta.yaml`) || hint.command.includes("\\delta.yaml")));
      assert.ok(change.session.impactSummary?.some((line) => line.includes("Active baseline remains unchanged")));
    }));

    const cliRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-delta-cli-"));
    runGreenfieldInit({
      root: cliRoot,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });
    const cli = runCli([
      "change",
      "Fix REQ-ORD-002 unavailable item rejection",
      "--root",
      cliRoot,
      "--change-type",
      "fix",
      "--context",
      "ordering",
      "--json",
    ]);
    const cliPayload = JSON.parse(cli.stdout) as { changeType?: string; specDelta?: { changeId?: string; deltaPath?: string; handoffPath?: string } };
    results.push(record("CLI change exposes Spec Delta fields in JSON output", () => {
      assert.equal(cli.status, 0);
      assert.equal(cliPayload.changeType, "fix");
      assert.ok(cliPayload.specDelta?.changeId);
      assert.ok(cliPayload.specDelta?.deltaPath?.endsWith("/delta.yaml"));
      assert.ok(cliPayload.specDelta?.handoffPath?.endsWith("/ai-implement-handoff.md"));
      assert.ok(fs.existsSync(cliPayload.specDelta?.deltaPath ?? ""));
    }));
    fs.rmSync(cliRoot, { recursive: true, force: true });

    const driftRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-delta-drift-"));
    runGreenfieldInit({
      root: driftRoot,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });
    const copiedRequirementsPath = path.join(driftRoot, "docs", "input", "requirements.md");
    fs.writeFileSync(
      copiedRequirementsPath,
      fs.readFileSync(copiedRequirementsPath, "utf-8").replace(
        "Checkout must reject carts with unavailable items.",
        "Checkout must reject carts with unavailable, recalled, or blocked items.",
      ),
      "utf-8",
    );
    const driftChange = await runChangeCommand({
      root: driftRoot,
      summary: "Fix REQ-ORD-002 unavailable item rejection",
      mode: "prompt",
      changeType: "fix",
      contextId: "ordering",
    });
    const driftVerify = await runVerify({ root: driftRoot, generatedAt: "2026-04-29T00:00:00.000Z" });
    const driftDirtyReport = fs.readFileSync(driftChange.session.specDelta?.dirtyReportPath ?? "", "utf-8");
    results.push(record("source provenance drift is reported by verify and pulled into dirty handoff", () => {
      assert.ok(driftVerify.issues.some((issue) => issue.code === "GREENFIELD_PROVENANCE_ANCHOR_DRIFT"));
      assert.match(driftDirtyReport, /Provenance anchor REQ-ORD-002/);
      assert.match(driftDirtyReport, /provenance:REQ-ORD-002/);
    }));
    fs.rmSync(driftRoot, { recursive: true, force: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "greenfield spec delta model execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
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

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "tools", "jispec", "cli.ts"), ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
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
    "## Non-Functional Requirements",
    "",
    "- Validation logic must be testable in isolation.",
    "",
    "## Out Of Scope",
    "",
    "- Refunds.",
    "",
    "## Acceptance Signals",
    "",
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
    "- `catalog` owns product availability and price read models",
    "- `ordering` owns cart validation, checkout orchestration, and order persistence",
    "",
    "## Integration Boundaries",
    "",
    "`ordering` may consume published product availability information from `catalog`, but it may not write to catalog-owned models.",
    "",
    "## Data Ownership",
    "",
    "Each bounded context owns persistence.",
    "",
    "## Testing Strategy",
    "",
    "Use unit, integration, and contract tests.",
    "",
    "## Operational Constraints",
    "",
    "No direct table sharing between bounded contexts.",
    "",
    "## Risks And Open Decisions",
    "",
    "Payment is deferred.",
  ].join("\n");
}

void main();
