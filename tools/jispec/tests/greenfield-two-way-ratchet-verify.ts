import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runGreenfieldInit } from "../greenfield/init";
import { runVerify } from "../verify/verify-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Greenfield Two-Way Ratchet Verify Tests ===\n");

  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-ratchet-src-"));
  const results: TestResult[] = [];

  try {
    const requirementsPath = path.join(sourceRoot, "requirements.md");
    const technicalSolutionPath = path.join(sourceRoot, "technical-solution.md");
    fs.writeFileSync(requirementsPath, buildCommerceRequirements(), "utf-8");
    fs.writeFileSync(technicalSolutionPath, buildCommerceTechnicalSolution(), "utf-8");

    results.push(await recordAsync("initialized Greenfield project passes two-way ratchet verify", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const verify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

        assert.equal(verify.verdict, "PASS");
        assert.ok(verify.sources.includes("policy-engine"));
        assert.ok(!verify.issues.some((issue) => issue.code.startsWith("GREENFIELD_")));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("code drift blocks when a governed API appears without Evidence Graph trace", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const routePath = path.join(root, "src", "routes", "refund.ts");
        fs.mkdirSync(path.dirname(routePath), { recursive: true });
        fs.writeFileSync(
          routePath,
          [
            "import { Router } from 'express';",
            "export const router = Router();",
            "router.post('/refund', (_req, res) => res.status(202).send({ ok: true }));",
          ].join("\n"),
          "utf-8",
        );

        const verify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

        assert.equal(verify.verdict, "FAIL_BLOCKING");
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_CODE_DRIFT" && issue.path === "src/routes/refund.ts"));
        assert.ok(verify.issues.some((issue) => issue.code === "POLICY_GREENFIELD_BLOCK_CODE_DRIFT" && issue.severity === "blocking"));
        assert.ok((verify.metadata?.matchedPolicyRules as string[]).includes("greenfield-block-code-drift"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("spec drift blocks when Evidence Graph expectations lose referenced assets", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        fs.rmSync(path.join(root, "contexts", "ordering", "slices", "ordering-checkout-v1", "test-spec.yaml"), { force: true });

        const verify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

        assert.equal(verify.verdict, "FAIL_BLOCKING");
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_SPEC_DRIFT_ASSET_MISSING"));
        assert.ok(verify.issues.some((issue) => issue.code === "POLICY_GREENFIELD_BLOCK_SPEC_DRIFT" && issue.severity === "blocking"));
        assert.ok((verify.metadata?.matchedPolicyRules as string[]).includes("greenfield-block-spec-drift"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("classified implementation facts stay visible without blocking the gate", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const routePath = path.join(root, "src", "routes", "refund.ts");
        fs.mkdirSync(path.dirname(routePath), { recursive: true });
        fs.writeFileSync(
          routePath,
          [
            "import { Router } from 'express';",
            "export const router = Router();",
            "router.post('/refund', (_req, res) => res.status(202).send({ ok: true }));",
          ].join("\n"),
          "utf-8",
        );
        fs.writeFileSync(
          path.join(root, ".spec", "evidence", "ratchet-classifications.yaml"),
          [
            "classifications:",
            "  - fact_id: route:POST /refund",
            "    state: experimental",
            "    reason: Refund spike is intentionally outside the current Greenfield baseline.",
            "allowed_states:",
            "  - ignored",
            "  - experimental",
            "  - intentional",
          ].join("\n"),
          "utf-8",
        );

        const verify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

        assert.equal(verify.verdict, "WARN_ADVISORY");
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_CLASSIFIED_CODE_DRIFT"));
        assert.ok(!verify.issues.some((issue) => issue.code === "GREENFIELD_CODE_DRIFT"));
        assert.ok((verify.metadata?.matchedPolicyRules as string[]).includes("greenfield-review-classified-drift"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("explicit JiSpec anchors map implementation facts without code drift", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const routePath = path.join(root, "src", "routes", "orders.ts");
        fs.mkdirSync(path.dirname(routePath), { recursive: true });
        fs.writeFileSync(
          routePath,
          [
            "import { Router } from 'express';",
            "export const router = Router();",
            "// @jispec contract CTR-ORDERING-001",
            "router.post('/orders', (_req, res) => res.status(202).send({ ok: true }));",
          ].join("\n"),
          "utf-8",
        );

        const verify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

        assert.equal(verify.verdict, "PASS");
        assert.ok(!verify.issues.some((issue) => issue.code === "GREENFIELD_CODE_DRIFT"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("dynamic implementation surfaces stay advisory and do not block as code drift", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const routePath = path.join(root, "src", "routes", "dynamic.ts");
        fs.mkdirSync(path.dirname(routePath), { recursive: true });
        fs.writeFileSync(
          routePath,
          [
            "import { Router } from 'express';",
            "export const router = Router();",
            "const dynamicPath = process.env.ORDER_PATH || '/orders';",
            "router.post(dynamicPath, (_req, res) => res.status(202).send({ ok: true }));",
          ].join("\n"),
          "utf-8",
        );

        const verify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

        assert.equal(verify.verdict, "WARN_ADVISORY");
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_UNRESOLVED_SURFACE" && issue.path === "src/routes/dynamic.ts"));
        assert.ok(!verify.issues.some((issue) => issue.code === "GREENFIELD_CODE_DRIFT"));
        assert.ok(!verify.issues.some((issue) => issue.code === "POLICY_GREENFIELD_BLOCK_CODE_DRIFT"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));
  } catch (error) {
    results.push({
      name: "greenfield two-way ratchet verify execution",
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-ratchet-"));
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

void main();
