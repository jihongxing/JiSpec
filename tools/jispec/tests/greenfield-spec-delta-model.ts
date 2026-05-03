import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as yaml from "js-yaml";
import { runGreenfieldInit } from "../greenfield/init";
import { runChangeCommand } from "../change/change-command";
import { clearChangeSession, readChangeSession } from "../change/change-session";
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
    const sourceEvolution = JSON.parse(fs.readFileSync(specDelta?.sourceEvolutionPath ?? "", "utf-8")) as {
      summary?: {
        modified?: number;
      };
      items?: Array<{
        evolution_kind?: string;
        anchor_id?: string;
      }>;
    };
    const sourceEvolutionMarkdown = fs.readFileSync(specDelta?.sourceEvolutionSummaryPath ?? "", "utf-8");
    const activeSession = readChangeSession(root);

    results.push(record("change creates a proposed Spec Delta workspace for Greenfield projects", () => {
      assert.ok(specDelta);
      assert.match(specDelta.changeId, /^chg-\d{8}-\d{6}-v2-add-req-ord-005-refund-request-intake-[a-f0-9]{8}$/);
      assert.ok(fs.existsSync(path.join(root, ".spec", "deltas", specDelta.changeId, "delta.yaml")));
      assert.ok(fs.existsSync(path.join(root, ".spec", "deltas", specDelta.changeId, "impact-report.md")));
      assert.ok(fs.existsSync(path.join(root, ".spec", "deltas", specDelta.changeId, "ai-implement-handoff.md")));
      assert.ok(fs.existsSync(path.join(root, ".spec", "deltas", specDelta.changeId, "adoption-record.yaml")));
      assert.ok(fs.existsSync(path.join(root, ".spec", "deltas", specDelta.changeId, "source-evolution.json")));
      assert.ok(fs.existsSync(path.join(root, ".spec", "deltas", specDelta.changeId, "source-evolution.md")));
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
      assert.match(sourceEvolutionMarkdown, /# Source Evolution/);
      assert.match(change.text, /Spec Delta:/);
      assert.match(change.text, /AI handoff:/);
      assert.ok(change.session.nextCommands.some((hint) => hint.command.includes(`/source-evolution.md`) || hint.command.includes("\\source-evolution.md")));
      assert.ok(change.session.nextCommands.some((hint) => hint.command.includes(`/ai-implement-handoff.md`) || hint.command.includes("\\ai-implement-handoff.md")));
      assert.ok(change.session.nextCommands.some((hint) => hint.command.includes(`/delta.yaml`) || hint.command.includes("\\delta.yaml")));
      const impactSummary = change.session.impactSummary;
      assert.ok(impactSummary && !Array.isArray(impactSummary));
      assert.equal(impactSummary.advisoryOnly, true);
      assert.match(impactSummary.artifacts.impactGraphPath, /impact-graph\.json$/);
      assert.match(change.text, /Impact graph freshness:/);
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
    clearChangeSession(driftRoot);
    const undeclaredVerify = await runVerify({ root: driftRoot, generatedAt: "2026-04-29T00:00:00.000Z" });
    const driftDirtyReport = fs.readFileSync(driftChange.session.specDelta?.dirtyReportPath ?? "", "utf-8");
    const driftSourceEvolution = JSON.parse(fs.readFileSync(driftChange.session.specDelta?.sourceEvolutionPath ?? "", "utf-8")) as {
      items?: Array<{ evolution_kind?: string; anchor_id?: string }>;
    };
    results.push(record("source evolution verify distinguishes declared review debt from undeclared workspace drift", () => {
      assert.ok(driftVerify.issues.some((issue) => issue.code === "GREENFIELD_PROVENANCE_ANCHOR_DRIFT"));
      assert.ok(driftVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_EVOLUTION_UNREVIEWED"));
      assert.equal(driftVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_EVOLUTION_UNDECLARED"), false);
      assert.ok(undeclaredVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_EVOLUTION_UNDECLARED"));
      assert.equal(undeclaredVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_EVOLUTION_UNREVIEWED"), false);
      assert.ok(driftSourceEvolution.items?.some((item) => item.evolution_kind === "modified" && item.anchor_id === "REQ-ORD-002"));
      assert.match(driftDirtyReport, /Source evolution modified requires governance/);
      assert.match(driftDirtyReport, /source-evolution:modified:REQ-ORD-002/);
    }));
    fs.rmSync(driftRoot, { recursive: true, force: true });

    const aliasRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-delta-alias-"));
    runGreenfieldInit({
      root: aliasRoot,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });
    const aliasTechnicalPath = path.join(aliasRoot, "docs", "input", "technical-solution.md");
    fs.writeFileSync(
      aliasTechnicalPath,
      fs.readFileSync(aliasTechnicalPath, "utf-8")
        .replace("## Architecture Direction", "## Bounded Context Hypothesis")
        .replace("## Integration Boundaries", "## Integration Rule")
        .replace("## Operational Constraints", "## Constraints"),
      "utf-8",
    );
    const aliasVerify = await runVerify({ root: aliasRoot, generatedAt: "2026-04-29T00:00:00.000Z" });
    results.push(record("semantic heading aliases downgrade layout-only provenance drift to advisory", () => {
      assert.equal(aliasVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_LAYOUT_DRIFT" && issue.severity === "blocking"), false);
      assert.equal(aliasVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_LAYOUT_DRIFT" && issue.severity === "advisory"), true);
      assert.equal(aliasVerify.issues.some((issue) => issue.code === "GREENFIELD_PROVENANCE_ANCHOR_DRIFT" && issue.severity === "blocking"), false);
      assert.equal(aliasVerify.issues.some((issue) => issue.code === "GREENFIELD_PROVENANCE_ANCHOR_DRIFT" && issue.severity === "advisory"), true);
    }));
    fs.rmSync(aliasRoot, { recursive: true, force: true });

    const policyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-delta-policy-"));
    runGreenfieldInit({
      root: policyRoot,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });
    fs.writeFileSync(
      path.join(policyRoot, "docs", "input", "requirements.md"),
      [
        "# Commerce Platform Requirements",
        "",
        "## Objective",
        "",
        "Build a commerce platform that supports product browsing, cart validation, checkout, and order creation.",
        "",
        "## Core Requirements",
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
        "- Checkout response time should be acceptable for synchronous user interaction.",
        "- Validation logic must be testable in isolation.",
        "- Context boundaries should avoid direct persistence coupling.",
      ].join("\n"),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(policyRoot, "docs", "input", "technical-solution.md"),
      [
        "# Commerce Platform Technical Solution",
        "",
        "## Architecture Direction",
        "",
        "Use bounded contexts for `catalog` and `ordering`.",
        "",
        "- `catalog` owns product availability and price read models",
        "- `ordering` owns cart validation, checkout orchestration, and order persistence",
        "",
        "## Integration Rule",
        "",
        "`ordering` may consume published product availability information from `catalog`, but it may not write to catalog-owned models.",
        "",
        "## Checkout Flow",
        "",
        "1. Receive checkout request with cart identifier.",
        "2. Load cart and cart items.",
        "3. Validate product availability.",
        "4. Calculate order total.",
        "5. Persist order.",
        "6. Emit `OrderCreated`.",
        "",
        "## Testing Strategy",
        "",
        "- Unit tests for validation and calculation logic",
        "- Integration tests for checkout application service",
        "- Contract tests for upstream availability data assumptions",
        "",
        "## Constraints",
        "",
        "- No direct table sharing between bounded contexts",
        "- Domain invariants must be explicit in context artifacts",
        "- All delivery must be traceable to requirements and tests",
      ].join("\n"),
      "utf-8",
    );
    const policyVerify = await runVerify({ root: policyRoot, generatedAt: "2026-04-29T00:00:00.000Z" });
    results.push(record("supporting heading removal stays advisory under the provenance contract", () => {
      assert.equal(policyVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_LAYOUT_DRIFT" && issue.severity === "blocking"), false);
      assert.equal(policyVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_LAYOUT_DRIFT" && issue.severity === "advisory"), true);
      assert.equal(policyVerify.issues.some((issue) => issue.code === "GREENFIELD_PROVENANCE_ANCHOR_DRIFT" && issue.severity === "blocking"), false);
      assert.equal(policyVerify.issues.some((issue) => issue.code === "GREENFIELD_PROVENANCE_ANCHOR_DRIFT" && issue.severity === "advisory"), true);
    }));
    fs.rmSync(policyRoot, { recursive: true, force: true });
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
