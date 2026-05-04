import assert from "node:assert/strict";
import { renderCiSummaryMarkdown, renderCiSummaryText } from "../ci/ci-summary";
import { renderVerifySummaryMarkdown } from "../ci/verify-summary";
import type { VerifyReport } from "../ci/verify-report";

async function main(): Promise<void> {
  console.log("=== CI Summary Markdown Tests ===\n");

  let passed = 0;
  let failed = 0;

  try {
    const report: VerifyReport = {
      version: 1,
      generatedAt: "2026-04-27T00:00:00.000Z",
      verdict: "FAIL_BLOCKING",
      ok: false,
      counts: {
        total: 6,
        blocking: 2,
        advisory: 3,
        nonblockingError: 1,
      },
      issues: [
        {
          code: "SLICE_ARTIFACT_MISSING",
          severity: "blocking",
          path: "contexts/a/evidence.md",
          message: "Evidence is missing.",
          fingerprint: "a".repeat(64),
        },
        {
          code: "DOMAIN_CONTRACT_SECTION_MISSING",
          severity: "blocking",
          path: ".spec/contracts/domain.yaml",
          message: "Domain contract is missing a required section.",
          fingerprint: "b".repeat(64),
        },
        {
          code: "BOOTSTRAP_SPEC_DEBT_PENDING",
          severity: "advisory",
          path: ".spec/spec-debt/bootstrap/api.json",
          message: "Bootstrap draft deferred this contract as spec debt.",
          fingerprint: "c".repeat(64),
        },
        {
          code: "HISTORICAL_SCHEMA_MISSING",
          severity: "advisory",
          path: "schemas/order.json",
          message: "[HISTORICAL_DEBT] Schema coverage is still incomplete.",
          fingerprint: "d".repeat(64),
        },
        {
          code: "POLICY_CORE_CONTRACTS",
          severity: "advisory",
          message: "Core contracts still require review.",
          ruleId: "core-contracts",
          fingerprint: "e".repeat(64),
        },
        {
          code: "VERIFY_RUNTIME_ERROR",
          severity: "nonblocking_error",
          path: "policy-engine",
          message: "Verify source 'policy-engine' failed: timeout.",
          fingerprint: "f".repeat(64),
        },
      ],
      factsContractVersion: "1.0",
      matchedPolicyRules: ["bootstrap-debt-observe", "core-contracts"],
      modes: {
        baselineApplied: true,
        baselineMatchCount: 2,
        waiversApplied: 1,
        waiverLifecycle: {
          total: 3,
          active: 1,
          expired: 1,
          revoked: 1,
          invalid: 0,
          activeIds: ["waiver-active"],
          expiredIds: ["waiver-expired"],
          revokedIds: ["waiver-revoked"],
          invalidIds: [],
        },
        observeMode: true,
        observeBlockingDowngraded: 2,
        originalVerdict: "FAIL_BLOCKING",
        impactGraphFreshness: "fresh",
        impactGraphPath: ".spec/deltas/chg-456/impact-graph.json",
        impactReportPath: ".spec/deltas/chg-456/impact-report.md",
        verifyFocusPath: ".spec/deltas/chg-456/verify-focus.yaml",
        impactGraphImpactedFiles: [
          "contexts/a/evidence.md",
          "contexts/ordering/slices/ordering-checkout-v1/test-spec.yaml",
          "contexts/ordering/behavior/scenarios/SCN-ORDER-CHECKOUT-VALID.feature",
          "contexts/ordering/design/contracts.yaml",
        ],
        impactGraphNextReplayCommand: "npm run jispec-cli -- change \"Replay impacted verification\" --mode prompt",
        releaseCompareReportPath: ".spec/releases/compare/v1-to-current/compare-report.json",
        releaseCompareReportMarkdownPath: ".spec/releases/compare/v1-to-current/compare-report.md",
        releaseCompareOverallStatus: "changed",
        releaseCompareGlobalContextStatus: "available",
        releaseCompareAggregatePath: ".spec/console/multi-repo-governance.json",
        releaseCompareAggregateGeneratedAt: "2026-05-04T03:30:00.000Z",
        releaseCompareOwnerReviewRecommendationCount: 4,
        releaseCompareRelevantContractDriftHintCount: 2,
        releaseCompareRelevantOwnerActionCount: 1,
        releaseCompareRepresentativeArtifacts: [
          ".spec/contracts/payment.yaml",
          ".spec/contracts/cart.yaml",
        ],
        releaseCompareRepresentativeArtifact: ".spec/contracts/payment.yaml",
        releaseCompareSourceEvolutionChangeId: "change-2",
        releaseCompareSummary: "4 owner-review recommendation(s), 2 relevant contract drift hint(s), 1 owner action(s)",
        releaseCompareReplayCommand: "npm run jispec-cli -- release compare --from v1 --to current",
      },
      context: {
        repoRoot: "D:/codeSpace/JiSpec",
        repoSlug: "acme/warehouse",
        provider: "github",
        pullRequestNumber: "42",
        branch: "main",
        commitSha: "abc123",
      },
      links: {
        consoleUrl: "https://console.example.test/repos/acme%2Fwarehouse/verify",
        waiverUrl: "https://console.example.test/repos/acme%2Fwarehouse/waivers/new?pr=42",
      },
    };

    const markdown = renderCiSummaryMarkdown(report);
    assert.ok(markdown.startsWith("# ❌ JiSpec Verify: FAIL_BLOCKING"));
    assert.ok(markdown.includes("## Decision Snapshot"));
    assert.ok(markdown.includes("Current state: FAIL_BLOCKING - Blocked until blocking issues are fixed or explicitly waived."));
    assert.ok(markdown.includes("Risk: 2 blocking issue(s) must be fixed, waived, or explicitly deferred before merge."));
    assert.ok(markdown.includes("Owner: repo owner / reviewer"));
    assert.ok(markdown.includes("Evidence: `.jispec-ci/verify-report.json` or `.spec/handoffs/verify-summary.md`, facts contract `1.0`, 2 matched policy rule(s), 1 matched waiver(s), impact graph `.spec/deltas/chg-456/impact-graph.json`, impact report `.spec/deltas/chg-456/impact-report.md`, verify focus `.spec/deltas/chg-456/verify-focus.yaml`, impact freshness `fresh`, release compare `.spec/releases/compare/v1-to-current/compare-report.json` (changed, available), release aggregate `.spec/console/multi-repo-governance.json`, 4 release owner-review recommendation(s), 2 relevant release drift hint(s), 1 relevant release owner action(s)"));
    assert.ok(markdown.includes("Next command: `npm run jispec-cli -- verify` after fixing blockers or recording explicit governance decisions"));
    assert.ok(markdown.includes("Affected artifact: contexts/ordering/design/contracts.yaml (verify focus: .spec/deltas/chg-456/verify-focus.yaml)"));
    assert.ok(markdown.includes("Replay command: npm run jispec-cli -- change \"Replay impacted verification\" --mode prompt"));
    assert.ok(markdown.includes("## Release Global Context"));
    assert.ok(markdown.includes("Status: `available` (overall drift: `changed`)."));
    assert.ok(markdown.includes("Aggregate artifact: `.spec/console/multi-repo-governance.json`."));
    assert.ok(markdown.includes("Source evolution change: `change-2`."));
    assert.ok(markdown.includes("Owner-review recommendations: 4."));
    assert.ok(markdown.includes("| Blocking | 2 |"));
    assert.ok(markdown.includes("Facts contract: `1.0`"));
    assert.ok(markdown.includes("Matched policy rules: `bootstrap-debt-observe`, `core-contracts`"));
    assert.ok(markdown.includes("- Baseline applied (2 matched)"));
    assert.ok(markdown.includes("- Observe mode enabled (2 blocking downgraded)"));
    assert.ok(markdown.includes("- 1 waiver(s) matched; unmatched blockers remain blocking"));
    assert.ok(markdown.includes("- Waiver lifecycle: 1 active, 1 expired, 1 revoked, 0 invalid"));
    assert.ok(markdown.includes("## Links"));
    assert.ok(markdown.includes("[Create Waiver](https://console.example.test/repos/acme%2Fwarehouse/waivers/new?pr=42)"));
    console.log("✓ Test 1: markdown summary includes contract, policy, mitigation, and deep-link sections");
    passed++;

    const topIssueLines = markdown
      .split("\n")
      .filter((line) => line.startsWith("- ") && line.includes("**"));
    assert.equal(topIssueLines.length, 5);
    assert.ok(markdown.includes("_... and 1 more issue(s)_"));
    assert.ok(topIssueLines[0].includes("SLICE_ARTIFACT_MISSING"));
    assert.ok(topIssueLines[1].includes("DOMAIN_CONTRACT_SECTION_MISSING"));
    console.log("✓ Test 2: markdown summary caps issue highlights and keeps blocking issues first");
    passed++;

    const text = renderCiSummaryText(report);
    assert.ok(text.includes("JiSpec Verify: FAIL_BLOCKING"));
    assert.ok(text.includes("Decision Snapshot:"));
    assert.ok(text.includes("Current state: FAIL_BLOCKING - Blocked until blocking issues are fixed or explicitly waived."));
    assert.ok(text.includes("Evidence: `.jispec-ci/verify-report.json` or `.spec/handoffs/verify-summary.md`, facts contract `1.0`, 2 matched policy rule(s), 1 matched waiver(s), impact graph `.spec/deltas/chg-456/impact-graph.json`, impact report `.spec/deltas/chg-456/impact-report.md`, verify focus `.spec/deltas/chg-456/verify-focus.yaml`, impact freshness `fresh`, release compare `.spec/releases/compare/v1-to-current/compare-report.json` (changed, available), release aggregate `.spec/console/multi-repo-governance.json`, 4 release owner-review recommendation(s), 2 relevant release drift hint(s), 1 relevant release owner action(s)"));
    assert.ok(text.includes("Affected artifact: contexts/ordering/design/contracts.yaml (verify focus: .spec/deltas/chg-456/verify-focus.yaml)"));
    assert.ok(text.includes("Replay command: npm run jispec-cli -- change \"Replay impacted verification\" --mode prompt"));
    assert.ok(text.includes("Release Global Context:"));
    assert.ok(text.includes("Status: `available` (overall drift: `changed`)."));
    assert.ok(text.includes("Replay command: `npm run jispec-cli -- release compare --from v1 --to current`."));
    assert.ok(text.includes("Facts Contract: 1.0"));
    assert.ok(text.includes("Matched Policy Rules: bootstrap-debt-observe, core-contracts"));
    assert.ok(text.includes("Next Action: Fix 2 blocking issue(s) before merging."));
    assert.ok(text.includes("Console: https://console.example.test/repos/acme%2Fwarehouse/verify"));
    console.log("✓ Test 3: text summary stays concise while preserving operator-facing guidance");
    passed++;

    const verifySummary = renderVerifySummaryMarkdown(report);
    assert.ok(verifySummary.startsWith("# JiSpec Verify Summary"));
    assert.ok(verifySummary.includes("## Decision Snapshot"));
    assert.ok(verifySummary.includes("Current state: FAIL_BLOCKING - Blocked until blocking issues are fixed or explicitly waived."));
    assert.ok(verifySummary.includes("Risk: 2 blocking issue(s) must be fixed, waived, or explicitly deferred before merge."));
    assert.ok(verifySummary.includes("Evidence: `.jispec-ci/verify-report.json` or `.spec/handoffs/verify-summary.md`, facts contract `1.0`, 2 matched policy rule(s), 1 matched waiver(s), impact graph `.spec/deltas/chg-456/impact-graph.json`, impact report `.spec/deltas/chg-456/impact-report.md`, verify focus `.spec/deltas/chg-456/verify-focus.yaml`, impact freshness `fresh`, release compare `.spec/releases/compare/v1-to-current/compare-report.json` (changed, available), release aggregate `.spec/console/multi-repo-governance.json`, 4 release owner-review recommendation(s), 2 relevant release drift hint(s), 1 relevant release owner action(s)"));
    assert.ok(verifySummary.includes("Owner: repo owner / reviewer"));
    assert.ok(verifySummary.includes("Next command: `npm run jispec-cli -- verify` after fixing blockers or recording explicit governance decisions"));
    assert.ok(verifySummary.includes("Affected artifact: contexts/ordering/design/contracts.yaml (verify focus: .spec/deltas/chg-456/verify-focus.yaml)"));
    assert.ok(verifySummary.includes("Replay command: npm run jispec-cli -- change \"Replay impacted verification\" --mode prompt"));
    assert.ok(verifySummary.includes("Merge status: Blocked until blocking issues are fixed or explicitly waived."));
    assert.ok(verifySummary.includes("1 waiver(s) matched and downgraded only matching issue(s); unmatched blocking issues remain blocking."));
    assert.ok(verifySummary.includes("Waiver lifecycle: 1 active, 1 expired, 1 revoked, 0 invalid."));
    assert.ok(verifySummary.includes("## Blocking Issues"));
    assert.ok(verifySummary.includes("SLICE_ARTIFACT_MISSING"));
    assert.ok(verifySummary.includes("## Advisory And Debt"));
    assert.ok(verifySummary.includes("Known debt items: 2"));
    assert.ok(verifySummary.includes("BOOTSTRAP_SPEC_DEBT_PENDING"));
    assert.ok(verifySummary.includes("HISTORICAL_SCHEMA_MISSING"));
    assert.ok(verifySummary.includes("## Release Global Context"));
    assert.ok(verifySummary.includes("Relevant contract drift hints: 2."));
    assert.ok(verifySummary.includes("Relevant owner actions: 1."));
    assert.ok(verifySummary.includes("Owner-review recommendations: 4."));
    assert.ok(verifySummary.includes("This Markdown file is a human-readable companion summary, not a machine API."));
    console.log("✓ Test 4: verify summary answers mergeability, blockers, advisory debt, and source-of-truth boundaries");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
