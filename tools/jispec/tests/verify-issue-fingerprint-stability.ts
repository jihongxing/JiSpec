import assert from "node:assert/strict";
import { computeIssueFingerprint, issueMatchesCodeAndPath } from "../verify/issue-fingerprint";

async function main(): Promise<void> {
  console.log("=== Verify Issue Fingerprint Stability Tests ===\n");

  let passed = 0;
  let failed = 0;

  try {
    const canonicalIssue = {
      kind: "schema" as const,
      severity: "blocking" as const,
      code: "API_CONTRACT_INVALID_JSON",
      path: ".spec\\contracts\\api_spec.json",
      message: "API contract is not valid JSON.\r\n",
    };

    const normalizedIssue = {
      ...canonicalIssue,
      path: ".spec/contracts/api_spec.json",
      message: "API contract is not valid JSON.",
    };

    const prefixedVariants = [
      "[BASELINED] API contract is not valid JSON.",
      "[OBSERVE] API contract is not valid JSON.",
      "[WAIVED by contracts-team] API contract is not valid JSON.",
      "[HISTORICAL_DEBT] API contract is not valid JSON.",
    ];

    const canonicalFingerprint = computeIssueFingerprint(canonicalIssue);
    assert.equal(canonicalFingerprint, computeIssueFingerprint(normalizedIssue));
    for (const variant of prefixedVariants) {
      assert.equal(
        canonicalFingerprint,
        computeIssueFingerprint({ ...normalizedIssue, message: variant }),
      );
    }
    console.log("✓ Test 1: fingerprints stay stable across slash, whitespace, and mitigation-prefix normalization");
    passed++;

    assert.equal(issueMatchesCodeAndPath(normalizedIssue, "API_CONTRACT_INVALID_JSON", ".spec\\contracts\\api_spec.json"), true);
    assert.equal(issueMatchesCodeAndPath(normalizedIssue, "OTHER_CODE", ".spec/contracts/api_spec.json"), false);
    console.log("✓ Test 2: code/path waiver matching stays stable across path separator normalization");
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
