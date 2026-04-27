import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runVerify } from "../verify/verify-runner";
import { FIXED_GENERATED_AT, cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== Verify Policy Integration Tests ===\n");

  let passed = 0;
  let failed = 0;
  const fixtureRoot = createVerifyFixture("verify-policy-integration");

  try {
    const policyPath = path.join(fixtureRoot, ".spec", "policy.yaml");
    fs.mkdirSync(path.dirname(policyPath), { recursive: true });
    fs.writeFileSync(
      policyPath,
      [
        "version: 1",
        "requires:",
        '  facts_contract: "1.0"',
        "rules:",
        "  - id: require-domain-contract",
        "    enabled: true",
        "    action: warn",
        '    message: "Domain contract is missing"',
        "    when:",
        "      not:",
        '        fact: contracts.domain.present',
        '        op: "=="',
        "        value: true",
      ].join("\n"),
      "utf-8",
    );

    const autoLoadedResult = await runVerify({
      root: fixtureRoot,
      generatedAt: FIXED_GENERATED_AT,
    });

    assert.equal(autoLoadedResult.verdict, "WARN_ADVISORY");
    assert.ok(autoLoadedResult.sources.includes("policy-engine"));
    assert.equal(autoLoadedResult.metadata?.policyPath, ".spec/policy.yaml");
    assert.deepEqual(autoLoadedResult.metadata?.matchedPolicyRules, ["require-domain-contract"]);
    assert.ok(autoLoadedResult.issues.some((issue) => issue.code === "POLICY_REQUIRE_DOMAIN_CONTRACT"));
    console.log("✓ Test 1: verify auto-loads .spec/policy.yaml and reports matched policy rules in the stable verify contract");
    passed++;

    fs.writeFileSync(
      policyPath,
      [
        "version: 1",
        "requires:",
        '  facts_contract: "1.0"',
        "rules:",
        "  - id: bootstrap-required",
        "    enabled: true",
        "    action: fail_blocking",
        '    message: "Bootstrap takeover is required"',
        "    when:",
        '      fact: bootstrap.takeover.present',
        '      op: "=="',
        "      value: true",
      ].join("\n"),
      "utf-8",
    );

    const invalidPolicyResult = await runVerify({
      root: fixtureRoot,
      generatedAt: FIXED_GENERATED_AT,
    });

    assert.equal(invalidPolicyResult.verdict, "ERROR_NONBLOCKING");
    assert.equal(invalidPolicyResult.nonBlockingErrorCount, 1);
    assert.ok(
      invalidPolicyResult.issues.some(
        (issue) =>
          issue.code === "POLICY_BLOCKING_RULE_USES_UNSTABLE_FACT" &&
          issue.severity === "nonblocking_error",
      ),
    );
    console.log("✓ Test 2: invalid blocking policy usage degrades into a soft verify error instead of silently gating on unstable facts");
    passed++;

    const missingPolicyResult = await runVerify({
      root: fixtureRoot,
      generatedAt: FIXED_GENERATED_AT,
      policyPath: ".spec/does-not-exist.yaml",
    });

    assert.equal(missingPolicyResult.verdict, "ERROR_NONBLOCKING");
    assert.ok(
      missingPolicyResult.issues.some(
        (issue) =>
          issue.code === "POLICY_FILE_NOT_FOUND" &&
          issue.path === ".spec/does-not-exist.yaml",
      ),
    );
    console.log("✓ Test 3: explicit policy paths fail soft when the requested policy file is missing");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(fixtureRoot);
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
