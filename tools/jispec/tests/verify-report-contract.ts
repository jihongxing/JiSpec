import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildCiOutputDir,
  buildVerifyReport,
  detectCiProvider,
  renderVerifyReportJSON,
  resolveVerifyArtifactPaths,
  selectHighlightedIssues,
} from "../ci/verify-report";
import { renderVerifySummaryMarkdown } from "../ci/verify-summary";
import { renderHumanDecisionSnapshot, renderHumanDecisionSnapshotText } from "../human-decision-packet";
import { createVerifyRunResult, type VerifyIssue } from "../verify/verdict";

const FIXED_GENERATED_AT = "2026-04-27T00:00:00.000Z";

async function main(): Promise<void> {
  console.log("=== Verify Report Contract Tests ===\n");

  let passed = 0;
  let failed = 0;

  const issues: VerifyIssue[] = [
    {
      kind: "unsupported",
      severity: "advisory",
      code: "BOOTSTRAP_SPEC_DEBT_PENDING",
      path: ".spec/spec-debt/bootstrap/api.json",
      message: "Bootstrap draft deferred this contract as spec debt.",
    },
    {
      kind: "missing_file",
      severity: "blocking",
      code: "SLICE_ARTIFACT_MISSING",
      path: "contexts/ordering/slices/ordering-checkout-v1/evidence.md",
      message: "Required slice evidence is missing.",
      details: {
        owner: "checkout-team",
      },
    },
    {
      kind: "runtime_error",
      severity: "nonblocking_error",
      code: "VERIFY_RUNTIME_ERROR",
      path: "policy-engine",
      message: "Verify source 'policy-engine' failed: timeout.",
    },
  ];

  const result = createVerifyRunResult("D:/codeSpace/JiSpec", issues, {
    sources: ["legacy-validator", "bootstrap-takeover", "policy-engine"],
    generatedAt: FIXED_GENERATED_AT,
  });
  result.metadata = {
    factsContractVersion: "1.0",
    matchedPolicyRules: ["bootstrap-debt-observe", "core-contracts"],
    baselineApplied: true,
    baselineMatchCount: 1,
    waiversApplied: 2,
    waiverLifecycle: {
      total: 3,
      active: 2,
      expired: 1,
      revoked: 0,
      invalid: 0,
      activeIds: ["waiver-active-a", "waiver-active-b"],
      expiredIds: ["waiver-expired"],
      revokedIds: [],
      invalidIds: [],
    },
    observeMode: true,
    observeBlockingDowngraded: 1,
    originalVerdict: "FAIL_BLOCKING",
    impactGraphFreshness: "fresh",
    impactGraphPath: ".spec/deltas/chg-123/impact-graph.json",
    impactReportPath: ".spec/deltas/chg-123/impact-report.md",
    verifyFocusPath: ".spec/deltas/chg-123/verify-focus.yaml",
    impactGraphImpactedFiles: [
      "contexts/ordering/slices/ordering-checkout-v1/evidence.md",
      "contexts/ordering/design/contracts.yaml",
      "contexts/ordering/behavior/scenarios/SCN-ORDER-CHECKOUT-OUT-OF-STOCK.feature",
      "contexts/ordering/slices/ordering-checkout-v1/test-spec.yaml",
    ],
    impactGraphNextReplayCommand: "npm run jispec-cli -- change \"Retry contract sync\" --mode prompt",
  };

  const originalConsoleBase = process.env.JISPEC_CONSOLE_BASE_URL;
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-verify-report-contract-"));
  writeJson(fixtureRoot, ".spec/releases/drift-trend.json", {
    schemaVersion: 1,
    generatedAt: "2026-05-04T04:00:00.000Z",
    latest: {
      from: "v1",
      to: "current",
      reportPath: ".spec/releases/compare/v1-to-current/compare-report.json",
      markdownPath: ".spec/releases/compare/v1-to-current/compare-report.md",
      overallStatus: "changed",
    },
    comparisons: [],
    surfaces: {
      contractGraph: {},
      staticCollector: {},
      behavior: {},
      policy: {},
    },
  });
  writeJson(fixtureRoot, ".spec/releases/compare/v1-to-current/compare-report.json", {
    from: "v1",
    to: "current",
    compareReportMarkdownPath: ".spec/releases/compare/v1-to-current/compare-report.md",
    driftSummary: {
      overallStatus: "changed",
    },
    globalContext: {
      status: "available",
      summary: "global closure context available",
      details: {
        aggregatePath: ".spec/console/multi-repo-governance.json",
        aggregateGeneratedAt: "2026-05-04T03:30:00.000Z",
        representativeArtifacts: [".spec/contracts/payment.yaml", ".spec/contracts/cart.yaml"],
        relevantContractDriftHints: [{ id: "hint:1" }, { id: "hint:2" }],
        relevantOwnerActions: [{ id: "owner-action:1" }],
        ownerReviewRecommendations: [{ id: "owner-review:1" }, { id: "owner-review:2" }],
        repoPosture: {
          sourceEvolutionChangeId: "change-9",
        },
      },
    },
    replay: {
      commands: {
        rerun: "npm run jispec-cli -- release compare --from v1 --to current",
      },
    },
  });
  writeText(fixtureRoot, ".spec/releases/compare/v1-to-current/compare-report.md", "# compare\n");

  try {
    process.env.JISPEC_CONSOLE_BASE_URL = "https://console.example.test/";

    const report = buildVerifyReport(result, {
      repoRoot: fixtureRoot,
      repoSlug: "acme/warehouse",
      provider: "github",
      pullRequestNumber: "42",
      branch: "main",
      commitSha: "abc123",
    });

    const json = renderVerifyReportJSON(report);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    assert.deepEqual(Object.keys(parsed), [
      "version",
      "generatedAt",
      "verdict",
      "ok",
      "counts",
      "issues",
      "factsContractVersion",
      "matchedPolicyRules",
      "modes",
      "context",
      "links",
    ]);
    assert.equal(report.factsContractVersion, "1.0");
    assert.deepEqual(report.matchedPolicyRules, ["bootstrap-debt-observe", "core-contracts"]);
    assert.equal(report.links?.consoleUrl, "https://console.example.test/repos/acme%2Fwarehouse/verify");
    assert.equal(report.links?.waiverUrl, "https://console.example.test/repos/acme%2Fwarehouse/waivers/new?pr=42");
    assert.equal(report.issues[0].fingerprint?.length, 64);
    assert.equal(report.modes?.releaseCompareReportPath, ".spec/releases/compare/v1-to-current/compare-report.json");
    assert.equal(report.modes?.releaseCompareOverallStatus, "changed");
    assert.equal(report.modes?.releaseCompareGlobalContextStatus, "available");
    assert.equal(report.modes?.releaseCompareAggregatePath, ".spec/console/multi-repo-governance.json");
    assert.equal(report.modes?.releaseCompareOwnerReviewRecommendationCount, 2);
    assert.equal(report.modes?.releaseCompareRelevantContractDriftHintCount, 2);
    assert.equal(report.modes?.releaseCompareRelevantOwnerActionCount, 1);
    console.log("✓ Test 1: verify report preserves stable top-level JSON shape and CI deep links");
    passed++;

    assert.deepEqual(
      report.counts,
      {
        total: 3,
        blocking: 1,
        advisory: 1,
        nonblockingError: 1,
      },
    );
    assert.deepEqual(
      report.issues.map((issue) => issue.code),
      ["SLICE_ARTIFACT_MISSING", "BOOTSTRAP_SPEC_DEBT_PENDING", "VERIFY_RUNTIME_ERROR"],
    );
    assert.deepEqual(
      selectHighlightedIssues(report, 2).map((issue) => issue.code),
      ["SLICE_ARTIFACT_MISSING", "BOOTSTRAP_SPEC_DEBT_PENDING"],
    );
    console.log("✓ Test 2: counts and highlighted issue ordering follow verify severity priority");
    passed++;

    assert.equal(detectCiProvider({ GITHUB_ACTIONS: "true" } as NodeJS.ProcessEnv), "github");
    assert.equal(detectCiProvider({ GITLAB_CI: "true" } as NodeJS.ProcessEnv), "gitlab");
    assert.equal(detectCiProvider({ JENKINS_HOME: "C:/jenkins" } as NodeJS.ProcessEnv), "jenkins");
    assert.equal(detectCiProvider({} as NodeJS.ProcessEnv), "local");
    const outputDir = buildCiOutputDir("D:/repo").replace(/\\/g, "/");
    const artifactPaths = resolveVerifyArtifactPaths("D:/repo");
    assert.equal(outputDir, "D:/repo/.jispec-ci");
    assert.equal(artifactPaths.verifySummaryPath.replace(/\\/g, "/"), "D:/repo/.jispec-ci/verify-summary.md");
    console.log("✓ Test 3: CI provider detection and output path resolution stay deterministic");
    passed++;

    const summary = renderVerifySummaryMarkdown(report);
    assert.ok(summary.includes("Verdict: `FAIL_BLOCKING`"));
    assert.ok(summary.includes("## Decision Snapshot"));
    assert.ok(summary.includes("Current state: FAIL_BLOCKING - Blocked until blocking issues are fixed or explicitly waived."));
    assert.ok(summary.includes("Owner: repo owner / reviewer"));
    assert.ok(summary.includes("impact graph `.spec/deltas/chg-123/impact-graph.json`"));
    assert.ok(summary.includes("impact report `.spec/deltas/chg-123/impact-report.md`"));
    assert.ok(summary.includes("verify focus `.spec/deltas/chg-123/verify-focus.yaml`"));
    assert.ok(summary.includes("impact freshness `fresh`"));
    assert.ok(summary.includes("release compare `.spec/releases/compare/v1-to-current/compare-report.json` (changed, available)"));
    assert.ok(summary.includes("release aggregate `.spec/console/multi-repo-governance.json`"));
    assert.ok(summary.includes("2 release owner-review recommendation(s)"));
    assert.ok(summary.includes("2 relevant release drift hint(s)"));
    assert.ok(summary.includes("1 relevant release owner action(s)"));
    assert.ok(summary.includes("## Release Global Context"));
    assert.ok(summary.includes("Status: `available` (overall drift: `changed`)."));
    assert.ok(summary.includes("Source evolution change: `change-9`."));
    assert.ok(summary.includes("Replay command: `npm run jispec-cli -- release compare --from v1 --to current`."));
    assert.ok(summary.includes("Next command: `npm run jispec-cli -- verify` after fixing blockers or recording explicit governance decisions"));
    assert.ok(summary.includes("Affected artifact: contexts/ordering/design/contracts.yaml (verify focus: .spec/deltas/chg-123/verify-focus.yaml)"));
    assert.ok(summary.includes("Replay command: npm run jispec-cli -- change \"Retry contract sync\" --mode prompt"));
    assert.ok(summary.includes("Merge status: Blocked until blocking issues are fixed or explicitly waived."));
    assert.ok(summary.includes("2 waiver(s) matched and downgraded only matching issue(s); unmatched blocking issues remain blocking."));
    assert.ok(summary.includes("Waiver lifecycle: 2 active, 1 expired, 0 revoked, 0 invalid."));
    assert.ok(summary.includes("Known debt items: 1"));
    assert.ok(summary.includes("This Markdown file is a human-readable companion summary, not a machine API."));
    const snapshot = {
      currentState: "FAIL_BLOCKING - Blocked until blocking issues are fixed or explicitly waived.",
      risk: "2 blocking issue(s) must be fixed, waived, or explicitly deferred before merge.",
      evidence: [
        "`.jispec-ci/verify-report.json` or `.spec/handoffs/verify-summary.md`",
        "facts contract `1.0`",
        "2 matched policy rule(s)",
        "1 matched waiver(s)",
        "impact graph `.spec/deltas/chg-123/impact-graph.json`",
        "impact report `.spec/deltas/chg-123/impact-report.md`",
        "verify focus `.spec/deltas/chg-123/verify-focus.yaml`",
        "impact freshness `fresh`",
        "release compare `.spec/releases/compare/v1-to-current/compare-report.json` (changed, available)",
        "release aggregate `.spec/console/multi-repo-governance.json`",
        "2 release owner-review recommendation(s)",
        "2 relevant release drift hint(s)",
        "1 relevant release owner action(s)",
      ],
      owner: "repo owner / reviewer",
      nextCommand: "`npm run jispec-cli -- verify` after fixing blockers or recording explicit governance decisions",
      affectedArtifact: "contexts/ordering/design/contracts.yaml (verify focus: .spec/deltas/chg-123/verify-focus.yaml)",
      replayCommand: "npm run jispec-cli -- change \"Retry contract sync\" --mode prompt",
    };
    assert.deepEqual(
      renderHumanDecisionSnapshot(snapshot)
        .filter((line) => line.startsWith("- "))
        .map((line) => line.replace(/^-\s*/, "")),
      renderHumanDecisionSnapshotText(snapshot),
    );
    console.log("✓ Test 4: verify summary has a stable human-readable decision shape");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    if (originalConsoleBase === undefined) {
      delete process.env.JISPEC_CONSOLE_BASE_URL;
    } else {
      process.env.JISPEC_CONSOLE_BASE_URL = originalConsoleBase;
    }
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
