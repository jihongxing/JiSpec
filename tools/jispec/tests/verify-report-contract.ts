import assert from "node:assert/strict";
import {
  buildCiOutputDir,
  buildVerifyReport,
  detectCiProvider,
  renderVerifyReportJSON,
  resolveVerifyArtifactPaths,
  selectHighlightedIssues,
} from "../ci/verify-report";
import { renderVerifySummaryMarkdown } from "../ci/verify-summary";
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
  };

  const originalConsoleBase = process.env.JISPEC_CONSOLE_BASE_URL;

  try {
    process.env.JISPEC_CONSOLE_BASE_URL = "https://console.example.test/";

    const report = buildVerifyReport(result, {
      repoRoot: "D:/codeSpace/JiSpec",
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
    assert.ok(summary.includes("Merge status: Blocked until blocking issues are fixed or explicitly waived."));
    assert.ok(summary.includes("2 waiver(s) matched and downgraded only matching issue(s); unmatched blocking issues remain blocking."));
    assert.ok(summary.includes("Waiver lifecycle: 2 active, 1 expired, 0 revoked, 0 invalid."));
    assert.ok(summary.includes("Known debt items: 1"));
    assert.ok(summary.includes("This Markdown file is a human-readable companion summary, not a machine API."));
    console.log("✓ Test 4: verify summary has a stable human-readable decision shape");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
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

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
