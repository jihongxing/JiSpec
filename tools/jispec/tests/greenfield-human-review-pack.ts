import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runGreenfieldInit } from "../greenfield/init";
import { runVerify } from "../verify/verify-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface ReviewRecord {
  decisions?: Array<{
    decision_id?: string;
    decision_type?: string;
    confidence?: string;
    status?: string;
    blocking?: boolean;
    conflicts?: string[];
    evidence_refs?: Array<{
      ref?: string;
      path?: string;
      line?: number;
      paragraph_id?: string;
      checksum?: string;
      excerpt?: string;
    }>;
  }>;
}

interface BaselineYaml {
  review_pack?: {
    path?: string;
    decisions?: string[];
  };
  ai_implement_handoff?: {
    path?: string;
    target_slice?: string;
    dirty_subgraph_nodes?: string[];
    contract_focus?: string[];
    test_focus?: string[];
  };
  assets?: string[];
}

async function main(): Promise<void> {
  console.log("=== Greenfield Human Review Pack Tests ===\n");

  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-review-src-"));
  const results: TestResult[] = [];

  try {
    const requirementsPath = path.join(sourceRoot, "requirements.md");
    const technicalSolutionPath = path.join(sourceRoot, "technical-solution.md");
    fs.writeFileSync(requirementsPath, buildCommerceRequirements(), "utf-8");
    fs.writeFileSync(technicalSolutionPath, buildCommerceTechnicalSolution(), "utf-8");

    results.push(await recordAsync("initializer writes a human review pack and review record", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const executiveSummaryPath = path.join(root, ".spec", "greenfield", "review-pack", "executive-summary.md");
        const domainReviewPath = path.join(root, ".spec", "greenfield", "review-pack", "domain-review.md");
        const contractReviewPath = path.join(root, ".spec", "greenfield", "review-pack", "contract-review.md");
        const behaviorReviewPath = path.join(root, ".spec", "greenfield", "review-pack", "behavior-review.md");
        const sliceReviewPath = path.join(root, ".spec", "greenfield", "review-pack", "slice-plan-review.md");
        const openDecisionsPath = path.join(root, ".spec", "greenfield", "review-pack", "open-decisions.md");
        const reviewRecordPath = path.join(root, ".spec", "greenfield", "review-pack", "review-record.yaml");
        const handoffPath = path.join(root, ".spec", "greenfield", "ai-implement-handoff.md");
        const executiveSummary = fs.readFileSync(executiveSummaryPath, "utf-8");
        const handoff = fs.readFileSync(handoffPath, "utf-8");
        const record = yaml.load(fs.readFileSync(reviewRecordPath, "utf-8")) as ReviewRecord;
        const baseline = yaml.load(fs.readFileSync(path.join(root, ".spec", "baselines", "current.yaml"), "utf-8")) as BaselineYaml;
        const summary = fs.readFileSync(path.join(root, ".spec", "greenfield", "initialization-summary.md"), "utf-8");
        const catalogDecision = record.decisions?.find((decision) => decision.decision_id === "REV-DOMAIN-CATALOG");
        const reqEvidence = catalogDecision?.evidence_refs?.find((ref) => ref.ref === "REQ-CAT-001");

        assert.ok(fs.existsSync(executiveSummaryPath));
        assert.ok(fs.existsSync(domainReviewPath));
        assert.ok(fs.existsSync(contractReviewPath));
        assert.ok(fs.existsSync(behaviorReviewPath));
        assert.ok(fs.existsSync(sliceReviewPath));
        assert.ok(fs.existsSync(openDecisionsPath));
        assert.ok(fs.existsSync(reviewRecordPath));
        assert.ok(fs.existsSync(handoffPath));
        assert.ok(record.decisions?.some((decision) => decision.decision_id === "REV-DOMAIN-CATALOG"));
        assert.equal(reqEvidence?.path, "docs/input/requirements.md");
        assert.equal(reqEvidence?.paragraph_id, "req-req-cat-001");
        assert.equal(typeof reqEvidence?.line, "number");
        assert.equal(typeof reqEvidence?.checksum, "string");
        assert.ok(reqEvidence?.excerpt?.includes("REQ-CAT-001"));
        assert.ok(record.decisions?.some((decision) => decision.decision_id === "REV-DOMAIN-EXCLUDED-REFUNDS"));
        assert.ok(record.decisions?.some((decision) => decision.decision_type === "contract"));
        assert.ok(record.decisions?.some((decision) => decision.decision_type === "behavior"));
        assert.ok(record.decisions?.some((decision) =>
          decision.decision_id === "REV-BEHAVIOR-SCN-ORDER-TECHNICAL-BOUNDARY" &&
          decision.confidence === "medium" &&
          decision.blocking === false,
        ));
        assert.ok(record.decisions?.some((decision) => decision.decision_type === "slice_plan"));
        assert.equal(baseline.review_pack?.path, ".spec/greenfield/review-pack/review-record.yaml");
        assert.equal(baseline.ai_implement_handoff?.path, ".spec/greenfield/ai-implement-handoff.md");
        assert.equal(baseline.ai_implement_handoff?.target_slice, "catalog-product-availability-v1");
        assert.ok(baseline.ai_implement_handoff?.dirty_subgraph_nodes?.includes("@slice:catalog-product-availability-v1"));
        assert.ok(baseline.ai_implement_handoff?.contract_focus?.includes("CTR-CATALOG-001"));
        assert.ok(baseline.review_pack?.decisions?.includes("REV-DOMAIN-CATALOG"));
        assert.ok(baseline.assets?.includes(".spec/greenfield/review-pack/review-record.yaml"));
        assert.ok(baseline.assets?.includes(".spec/greenfield/ai-implement-handoff.md"));
        assert.match(summary, /## Initialization Review Pack/);
        assert.match(summary, /## AI Implement Handoff/);
        assert.match(executiveSummary, /## Decision Snapshot/);
        assert.match(executiveSummary, /## Review Gate/);
        assert.match(executiveSummary, /Disposition:/);
        assert.match(handoff, /Blocking review decisions:/);
        assert.match(fs.readFileSync(domainReviewPath, "utf-8"), /Rejected alternatives/);
        assert.match(fs.readFileSync(contractReviewPath, "utf-8"), /Evidence:/);
        assert.match(fs.readFileSync(handoffPath, "utf-8"), /## Dirty Subgraph/);
        assert.match(fs.readFileSync(handoffPath, "utf-8"), /CTR-CATALOG-001/);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("strong input review pack does not break the initialized verify gate", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const verify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

        assert.equal(verify.verdict, "PASS");
        assert.equal(verify.issueCount, 0);
        assert.equal(verify.metadata?.policyPath, ".spec/policy.yaml");
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("low-confidence proposed review items block implementation through policy facts", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const recordPath = path.join(root, ".spec", "greenfield", "review-pack", "review-record.yaml");
        const record = yaml.load(fs.readFileSync(recordPath, "utf-8")) as ReviewRecord;
        const targetDecision = record.decisions?.find((decision) => decision.decision_id === "REV-DOMAIN-CATALOG");
        assert.ok(targetDecision);
        targetDecision.confidence = "low";
        targetDecision.status = "proposed";
        targetDecision.blocking = true;
        fs.writeFileSync(recordPath, yaml.dump(record, { lineWidth: 100, noRefs: true, sortKeys: false }), "utf-8");

        const verify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

        assert.equal(verify.verdict, "FAIL_BLOCKING");
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_REVIEW_ITEM_UNRESOLVED_BLOCKING"));
        assert.ok(verify.issues.some((issue) => issue.code === "POLICY_GREENFIELD_BLOCK_UNRESOLVED_REVIEW_ITEMS"));
        assert.ok((verify.metadata?.matchedPolicyRules as string[]).includes("greenfield-block-unresolved-review-items"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("rejected review decisions block until regeneration or correction delta", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const recordPath = path.join(root, ".spec", "greenfield", "review-pack", "review-record.yaml");
        const record = yaml.load(fs.readFileSync(recordPath, "utf-8")) as ReviewRecord;
        const targetDecision = record.decisions?.find((decision) => decision.decision_id === "REV-CONTRACT-CTR-ORDERING-001");
        assert.ok(targetDecision);
        targetDecision.status = "rejected";
        fs.writeFileSync(recordPath, yaml.dump(record, { lineWidth: 100, noRefs: true, sortKeys: false }), "utf-8");

        const verify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

        assert.equal(verify.verdict, "FAIL_BLOCKING");
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_REVIEW_ITEM_REJECTED"));
        assert.ok(verify.issues.some((issue) => issue.code === "POLICY_GREENFIELD_BLOCK_REJECTED_REVIEW_ITEMS"));
        assert.ok((verify.metadata?.matchedPolicyRules as string[]).includes("greenfield-block-rejected-review-items"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("decision conflicts are visible in the review pack and block implementation", async () => {
      const conflictSourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-review-conflict-src-"));
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-review-conflict-"));
      try {
        const conflictRequirementsPath = path.join(conflictSourceRoot, "requirements.md");
        const conflictTechnicalSolutionPath = path.join(conflictSourceRoot, "technical-solution.md");
        fs.writeFileSync(conflictRequirementsPath, buildLowLatencyRequirements(), "utf-8");
        fs.writeFileSync(conflictTechnicalSolutionPath, buildHighLatencyTechnicalSolution(), "utf-8");

        const init = runGreenfieldInit({
          root,
          requirements: conflictRequirementsPath,
          technicalSolution: conflictTechnicalSolutionPath,
        });
        assert.equal(init.status, "input_contract_ready");

        const recordPath = path.join(root, ".spec", "greenfield", "review-pack", "review-record.yaml");
        const record = yaml.load(fs.readFileSync(recordPath, "utf-8")) as ReviewRecord;
        const framingDecision = record.decisions?.find((decision) => decision.decision_id === "REV-FRAMING-001");
        const openDecisions = fs.readFileSync(path.join(root, ".spec", "greenfield", "review-pack", "open-decisions.md"), "utf-8");
        const verify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

        assert.ok((framingDecision?.conflicts?.length ?? 0) > 0);
        assert.match(openDecisions, /high-latency|async-only|synchronous/i);
        assert.equal(verify.verdict, "FAIL_BLOCKING");
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_REVIEW_ITEM_UNRESOLVED_BLOCKING"));
        assert.ok((verify.metadata?.matchedPolicyRules as string[]).includes("greenfield-block-unresolved-review-items"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(conflictSourceRoot, { recursive: true, force: true });
      }
    }));
  } catch (error) {
    results.push({
      name: "greenfield human review pack execution",
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-review-"));
  const init = runGreenfieldInit({
    root,
    requirements: requirementsPath,
    technicalSolution: technicalSolutionPath,
  });

  assert.equal(init.status, "input_contract_ready");
  assert.equal(init.nextTask, "greenfield-initialization-mvp-complete");
  return root;
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

function buildLowLatencyRequirements(): string {
  return [
    "# Commerce Platform Requirements",
    "",
    "## Objective",
    "",
    "Build a commerce checkout flow that supports synchronous low latency checkout decisions.",
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
    "A shopper must be able to submit an order from a valid cart.",
    "",
    "### REQ-ORD-002",
    "",
    "Checkout must reject unavailable items.",
    "",
    "## Non-Functional Requirements",
    "",
    "- Checkout must respond with low latency for synchronous interaction.",
    "",
    "## Acceptance Signals",
    "",
    "- Valid checkout creates an order.",
  ].join("\n");
}

function buildHighLatencyTechnicalSolution(): string {
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
    "`ordering` consumes catalog availability through a high latency batch feed and async only updates.",
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
  ].join("\n");
}

void main();
