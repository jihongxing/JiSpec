import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { renderCiSummaryMarkdown, renderCiSummaryText } from "../ci/ci-summary";
import { buildVerifyReport } from "../ci/verify-report";
import { renderVerifySummaryMarkdown } from "../ci/verify-summary";
import { runGreenfieldInit } from "../greenfield/init";
import { loadVerifyPolicy } from "../policy/policy-loader";
import { runVerify } from "../verify/verify-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface ProjectYaml {
  global_gates?: string[];
}

interface BaselineYaml {
  verify_policy?: {
    path?: string;
    rule_ids?: string[];
    facts_contract?: string;
  };
  ci_gate?: {
    provider?: string;
    workflow?: string;
    local_command?: string;
  };
  assets?: string[];
}

async function main(): Promise<void> {
  console.log("=== Greenfield Verify Policy And CI Gate Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-gate-"));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-gate-src-"));
  const results: TestResult[] = [];

  try {
    const requirementsPath = path.join(sourceRoot, "requirements.md");
    const technicalSolutionPath = path.join(sourceRoot, "technical-solution.md");
    fs.writeFileSync(requirementsPath, buildCommerceRequirements(), "utf-8");
    fs.writeFileSync(technicalSolutionPath, buildCommerceTechnicalSolution(), "utf-8");

    const initResult = runGreenfieldInit({
      root,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });

    const policyPath = path.join(root, ".spec", "policy.yaml");
    const workflowPath = path.join(root, ".github", "workflows", "jispec-verify.yml");
    const gateReadmePath = path.join(root, ".spec", "ci", "verify-gate.md");
    const workflow = fs.readFileSync(workflowPath, "utf-8");
    const gateReadme = fs.readFileSync(gateReadmePath, "utf-8");
    const project = yaml.load(fs.readFileSync(path.join(root, "jiproject", "project.yaml"), "utf-8")) as ProjectYaml;
    const baseline = yaml.load(
      fs.readFileSync(path.join(root, ".spec", "baselines", "current.yaml"), "utf-8"),
    ) as BaselineYaml;
    const policy = loadVerifyPolicy(root);

    results.push({
      name: "initializer writes verify policy, CI workflow, and runtime support assets",
      passed:
        initResult.status === "input_contract_ready" &&
        initResult.nextTask === "greenfield-initialization-mvp-complete" &&
        fs.existsSync(policyPath) &&
        fs.existsSync(workflowPath) &&
        fs.existsSync(gateReadmePath) &&
        fs.existsSync(path.join(root, "schemas", "project.schema.json")) &&
        fs.existsSync(path.join(root, "schemas", "slice.schema.json")) &&
        fs.existsSync(path.join(root, "agents", "agents.yaml")) &&
        initResult.writtenFiles.some((filePath) => filePath.endsWith(".spec/policy.yaml")) &&
        initResult.writtenFiles.some((filePath) => filePath.endsWith(".github/workflows/jispec-verify.yml")),
      error: `Expected verify gate assets, got result=${JSON.stringify(initResult)}.`,
    });

    results.push({
      name: "policy is pinned to facts contract and uses Greenfield gate rules",
      passed:
        policy?.version === 1 &&
        policy.requires?.facts_contract === "1.0" &&
        policy.greenfield?.review_gate?.low_confidence_blocks === true &&
        policy.greenfield?.review_gate?.conflict_blocks === true &&
        policy.greenfield?.review_gate?.deferred_or_waived_severity === "advisory" &&
        policy.rules.some(
          (rule) =>
            rule.id === "greenfield-no-blocking-verify-issues" &&
            rule.action === "fail_blocking" &&
            rule.enabled === true,
        ) &&
        policy.rules.some(
          (rule) =>
            rule.id === "greenfield-review-advisory-verify-issues" &&
            rule.action === "warn" &&
            rule.enabled === true,
        ),
      error: `Expected Greenfield verify policy rules, got ${JSON.stringify(policy)}.`,
    });

    results.push({
      name: "project and baseline record verify gate defaults",
      passed:
        project.global_gates?.includes("verify_policy_ready") === true &&
        project.global_gates?.includes("ci_verify_gate") === true &&
        baseline.verify_policy?.path === ".spec/policy.yaml" &&
        baseline.verify_policy?.rule_ids?.includes("greenfield-no-blocking-verify-issues") === true &&
        baseline.verify_policy?.facts_contract === "1.0" &&
        baseline.ci_gate?.provider === "github-actions" &&
        baseline.ci_gate?.workflow === ".github/workflows/jispec-verify.yml" &&
        baseline.assets?.includes(".spec/policy.yaml") === true &&
        baseline.assets?.includes(".github/workflows/jispec-verify.yml") === true &&
        baseline.assets?.includes("schemas/project.schema.json") === true,
      error: `Expected project and baseline gate metadata, got project=${JSON.stringify(project)}, baseline=${JSON.stringify(baseline)}.`,
    });

    results.push({
      name: "generated CI workflow and gate readme expose runnable verify commands",
      passed:
        workflow.includes("name: JiSpec Verify") &&
        workflow.includes("npx --yes jispec verify --root . --policy .spec/policy.yaml --baseline") &&
        workflow.includes("npm run ci:verify -- --root .") &&
        gateReadme.includes("jispec-cli verify --root . --policy .spec/policy.yaml") &&
        gateReadme.includes("greenfield-no-blocking-verify-issues"),
      error: `Expected runnable CI gate docs, got workflow=${workflow}, readme=${gateReadme}.`,
    });

    const passingVerify = await runVerify({
      root,
      generatedAt: "2026-04-29T00:00:00.000Z",
    });
    const policyContent = fs.readFileSync(policyPath, "utf-8");
    const recordPath = path.join(root, ".spec", "greenfield", "review-pack", "review-record.yaml");
    const reviewRecord = yaml.load(fs.readFileSync(recordPath, "utf-8")) as {
      decisions?: Array<{ decision_id?: string; confidence?: string; status?: string; blocking?: boolean }>;
    };
    const catalogDecision = reviewRecord.decisions?.find((decision) => decision.decision_id === "REV-DOMAIN-CATALOG");
    if (catalogDecision) {
      catalogDecision.confidence = "low";
      catalogDecision.status = "proposed";
      catalogDecision.blocking = false;
    }
    fs.writeFileSync(recordPath, yaml.dump(reviewRecord, { lineWidth: 100, noRefs: true, sortKeys: false }), "utf-8");
    fs.writeFileSync(
      policyPath,
      policyContent
        .replace("low_confidence_blocks: true", "low_confidence_blocks: false")
        .replace("domain_context: true", "domain_context: false"),
      "utf-8",
    );
    const lowConfidenceAllowedVerify = await runVerify({
      root,
      generatedAt: "2026-04-29T00:00:00.000Z",
    });
    fs.writeFileSync(policyPath, policyContent, "utf-8");
    if (catalogDecision) {
      catalogDecision.confidence = "high";
      catalogDecision.status = "proposed";
      catalogDecision.blocking = false;
    }
    fs.writeFileSync(recordPath, yaml.dump(reviewRecord, { lineWidth: 100, noRefs: true, sortKeys: false }), "utf-8");
    const contractDecision = reviewRecord.decisions?.find((decision) => decision.decision_id === "REV-CONTRACT-CTR-ORDERING-001");
    if (contractDecision) {
      contractDecision.confidence = "low";
      contractDecision.status = "proposed";
      contractDecision.blocking = false;
    }
    fs.writeFileSync(recordPath, yaml.dump(reviewRecord, { lineWidth: 100, noRefs: true, sortKeys: false }), "utf-8");
    fs.writeFileSync(policyPath, policyContent.replace("contract: true", "contract: false"), "utf-8");
    const contractLowConfidenceAllowedVerify = await runVerify({
      root,
      generatedAt: "2026-04-29T00:00:00.000Z",
    });
    fs.writeFileSync(policyPath, policyContent, "utf-8");
    if (contractDecision) {
      contractDecision.confidence = "high";
      contractDecision.status = "proposed";
      contractDecision.blocking = false;
    }
    fs.writeFileSync(recordPath, yaml.dump(reviewRecord, { lineWidth: 100, noRefs: true, sortKeys: false }), "utf-8");
    const sliceTestSpecPath = path.join(
      root,
      "contexts",
      "ordering",
      "slices",
      "ordering-checkout-v1",
      "test-spec.yaml",
    );
    fs.rmSync(sliceTestSpecPath, { force: true });
    const failingVerify = await runVerify({
      root,
      generatedAt: "2026-04-29T00:00:00.000Z",
    });

    results.push({
      name: "generated repository passes verify until a gated slice artifact is removed",
      passed:
        passingVerify.verdict === "PASS" &&
        lowConfidenceAllowedVerify.verdict === "PASS" &&
        contractLowConfidenceAllowedVerify.verdict === "PASS" &&
        !lowConfidenceAllowedVerify.issues.some((issue) => issue.code === "GREENFIELD_REVIEW_ITEM_LOW_CONFIDENCE_UNADOPTED") &&
        !contractLowConfidenceAllowedVerify.issues.some((issue) => issue.code === "GREENFIELD_REVIEW_ITEM_LOW_CONFIDENCE_UNADOPTED") &&
        passingVerify.metadata?.policyPath === ".spec/policy.yaml" &&
        failingVerify.verdict === "FAIL_BLOCKING" &&
        failingVerify.exitCode === 1 &&
        Array.isArray(failingVerify.metadata?.matchedPolicyRules) &&
        (failingVerify.metadata?.matchedPolicyRules as string[]).includes("greenfield-no-blocking-verify-issues") &&
        failingVerify.issues.some((issue) => issue.code === "SLICE_ARTIFACT_MISSING") &&
        failingVerify.issues.some((issue) => issue.code === "POLICY_GREENFIELD_NO_BLOCKING_VERIFY_ISSUES"),
      error: `Expected verify pass then policy-gated fail, got pass=${JSON.stringify(passingVerify)}, low=${JSON.stringify(lowConfidenceAllowedVerify)}, contractLow=${JSON.stringify(contractLowConfidenceAllowedVerify)}, fail=${JSON.stringify(failingVerify)}.`, 
    });

    const failingReport = buildVerifyReport(failingVerify, {
      repoRoot: root,
      provider: "local",
    });
    const verifySummary = renderVerifySummaryMarkdown(failingReport);
    const ciSummary = renderCiSummaryMarkdown(failingReport);
    const ciText = renderCiSummaryText(failingReport);

    results.push({
      name: "Greenfield verify and CI summaries use the shared control-context language",
      passed:
        verifySummary.includes("## Greenfield Control Context") &&
        verifySummary.includes("Uses the same verify decision model as takeover") &&
        verifySummary.includes("Review gate:") &&
        verifySummary.includes("Contract graph / spec delta:") &&
        verifySummary.includes("Implementation facts ratchet:") &&
        verifySummary.includes("Spec debt:") &&
        verifySummary.includes("Policy overlay:") &&
        verifySummary.includes("`greenfield-no-blocking-verify-issues`") &&
        verifySummary.includes("This Markdown file is a human-readable companion summary, not a machine API.") &&
        ciSummary.includes("## Decision Snapshot") &&
        ciSummary.includes("Current state:") &&
        ciSummary.includes("Risk:") &&
        ciSummary.includes("Evidence:") &&
        ciSummary.includes("Owner:") &&
        ciSummary.includes("Next command:") &&
        ciSummary.includes("## Greenfield Control Context") &&
        ciSummary.includes("Contract graph / spec delta:") &&
        ciSummary.includes("Next action vocabulary stays shared with verify summary") &&
        ciText.includes("Decision Snapshot:") &&
        ciText.includes("Current state:") &&
        ciText.includes("Greenfield Control Context:") &&
        ciText.includes("Contract graph / spec delta:"),
      error: `Expected aligned Greenfield summary language, got verify=${verifySummary}, ci=${ciSummary}, text=${ciText}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "greenfield verify policy and CI gate execution",
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
