import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runGreenfieldInit } from "../greenfield/init";
import {
  loadGreenfieldSpecDebtLedger,
  summarizeGreenfieldSpecDebt,
  writeGreenfieldSpecDebtRecord,
} from "../greenfield/spec-debt-ledger";
import { createReleaseSnapshot } from "../release/baseline-snapshot";
import { runVerify } from "../verify/verify-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface BaselineYaml {
  assets?: string[];
}

async function main(): Promise<void> {
  console.log("=== Greenfield Spec Debt Ledger Tests ===\n");

  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-debt-src-"));
  const results: TestResult[] = [];

  try {
    const requirementsPath = path.join(sourceRoot, "requirements.md");
    const technicalSolutionPath = path.join(sourceRoot, "technical-solution.md");
    fs.writeFileSync(requirementsPath, buildCommerceRequirements(), "utf-8");
    fs.writeFileSync(technicalSolutionPath, buildCommerceTechnicalSolution(), "utf-8");

    results.push(await recordAsync("initializer creates an empty spec debt ledger and completes the MVP task plan", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        const ledgerPath = path.join(root, ".spec", "spec-debt", "ledger.yaml");
        const ledger = loadGreenfieldSpecDebtLedger(root);
        const baseline = yaml.load(fs.readFileSync(path.join(root, ".spec", "baselines", "current.yaml"), "utf-8")) as BaselineYaml;
        const summary = fs.readFileSync(path.join(root, ".spec", "greenfield", "initialization-summary.md"), "utf-8");
        const verify = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

        assert.ok(fs.existsSync(ledgerPath));
        assert.deepEqual(ledger.debts, []);
        assert.ok(baseline.assets?.includes(".spec/spec-debt/ledger.yaml"));
        assert.match(summary, /## Spec Debt/);
        assert.match(summary, /Open debts: 0/);
        assert.equal(verify.verdict, "PASS");
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("open spec debt is visible as advisory verify debt", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        writeGreenfieldSpecDebtRecord(root, {
          id: "debt-refund-contract-deferred",
          kind: "defer",
          owner: "tl-ordering",
          reason: "Refund contract is deferred until payment boundary is clarified.",
          createdAt: "2026-04-29T00:00:00.000Z",
          expiresAt: "2026-05-30T00:00:00.000Z",
          affectedAssets: ["contexts/ordering/design/contracts.yaml"],
          affectedRequirements: ["REQ-ORD-005"],
          affectedContracts: ["CTR-ORDERING-001"],
          affectedSlices: ["ordering-checkout-v1"],
          repaymentHint: "Adopt refund contract delta and add behavior coverage before V2 baseline.",
          source: { type: "spec_delta", ref: "chg-refund" },
        });

        const ledger = loadGreenfieldSpecDebtLedger(root);
        const debtSummary = summarizeGreenfieldSpecDebt(root, new Date("2026-04-30T00:00:00.000Z"));
        const verify = await runVerify({ root, generatedAt: "2026-04-30T00:00:00.000Z" });

        assert.equal(ledger.debts[0]?.owner, "tl-ordering");
        assert.equal(ledger.debts[0]?.repayment_hint.includes("Adopt refund contract delta"), true);
        assert.equal(debtSummary.open, 1);
        assert.equal(debtSummary.expired, 0);
        assert.equal(verify.verdict, "WARN_ADVISORY");
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_SPEC_DEBT_OPEN"));
        assert.ok((verify.metadata?.matchedPolicyRules as string[]).includes("greenfield-review-open-spec-debt"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("expired spec debt blocks the Greenfield verify gate", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        writeGreenfieldSpecDebtRecord(root, {
          id: "debt-expired-waiver",
          kind: "waiver",
          owner: "tl-ordering",
          reason: "Temporary waiver for missing refund scenario expired.",
          createdAt: "2026-04-01T00:00:00.000Z",
          expiresAt: "2026-04-02T00:00:00.000Z",
          affectedAssets: ["contexts/ordering/behavior/scenarios/SCN-ORDER-CHECKOUT-VALID.feature"],
          affectedScenarios: ["SCN-ORDER-CHECKOUT-VALID"],
          repaymentHint: "Create the missing scenario or cancel the waiver with a reviewed decision.",
          source: { type: "waiver", ref: "waiver-refund-scenario" },
        });

        const verify = await runVerify({ root, generatedAt: "2026-04-30T00:00:00.000Z" });

        assert.equal(verify.verdict, "FAIL_BLOCKING");
        assert.ok(verify.issues.some((issue) => issue.code === "GREENFIELD_SPEC_DEBT_EXPIRED"));
        assert.ok(verify.issues.some((issue) => issue.code === "POLICY_GREENFIELD_BLOCK_EXPIRED_SPEC_DEBT"));
        assert.ok((verify.metadata?.matchedPolicyRules as string[]).includes("greenfield-block-expired-spec-debt"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));

    results.push(await recordAsync("release summary lists current spec debt", async () => {
      const root = createInitializedRoot(requirementsPath, technicalSolutionPath);
      try {
        writeGreenfieldSpecDebtRecord(root, {
          id: "debt-classified-refund-spike",
          kind: "classified_drift",
          owner: "tl-ordering",
          reason: "Refund route spike is classified outside the current baseline.",
          createdAt: "2026-04-29T00:00:00.000Z",
          expiresAt: "2026-05-10T00:00:00.000Z",
          affectedAssets: ["src/routes/refund.ts"],
          repaymentHint: "Either adopt the refund route into Evidence Graph or remove the spike.",
          source: { type: "ratchet_classification", ref: "route:POST /refund" },
        });

        const snapshot = createReleaseSnapshot({
          root,
          version: "v1-debt",
          frozenAt: "2026-04-29T00:00:00.000Z",
        });
        const releaseSummary = fs.readFileSync(snapshot.releaseSummaryPath, "utf-8");

        assert.match(releaseSummary, /## Spec Debt/);
        assert.match(releaseSummary, /Open: 1/);
        assert.match(releaseSummary, /debt-classified-refund-spike/);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));
  } catch (error) {
    results.push({
      name: "greenfield spec debt ledger execution",
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-debt-"));
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
