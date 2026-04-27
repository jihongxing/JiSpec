import assert from "node:assert/strict";
import { createFactsContract } from "../facts/facts-contract";
import type { CanonicalFactsSnapshot } from "../facts/canonical-facts";
import { evaluateVerifyPolicy } from "../policy/policy-engine";
import { validatePolicyAgainstFactsContract, type VerifyPolicy } from "../policy/policy-schema";

function createFacts(overrides: Record<string, unknown> = {}): CanonicalFactsSnapshot {
  return {
    generatedAt: "2026-04-27T00:00:00.000Z",
    repoRoot: "/tmp/jispec-policy",
    contractVersion: "1.0",
    facts: {
      "verify.issue_count": 5,
      "verify.blocking_issue_count": 2,
      "verify.issue_codes": ["DOMAIN_CONTRACT_SECTION_MISSING", "SLICE_ARTIFACT_MISSING"],
      "verify.contract_issue_count": 1,
      "contracts.domain.present": false,
      "contracts.api.present": true,
      "contracts.behavior.present": false,
      "bootstrap.takeover.present": true,
      ...overrides,
    },
    warnings: [],
  };
}

async function main(): Promise<void> {
  console.log("=== Policy Engine Basic Tests ===\n");

  let passed = 0;
  let failed = 0;

  try {
    const policy: VerifyPolicy = {
      version: 1,
      requires: { facts_contract: "1.0" },
      rules: [
        {
          id: "no-blocking-issues",
          enabled: true,
          action: "fail_blocking",
          message: "Repository has blocking verify issues",
          when: {
            fact: "verify.blocking_issue_count",
            op: ">",
            value: 0,
          },
        },
        {
          id: "missing-domain-contract",
          enabled: true,
          action: "warn",
          message: "Domain contract is missing",
          when: {
            not: {
              fact: "contracts.domain.present",
              op: "==",
              value: true,
            },
          },
        },
      ],
    };

    const evaluation = evaluateVerifyPolicy(policy, createFacts());
    assert.deepEqual(
      evaluation.matchedRules.map((rule) => rule.ruleId),
      ["no-blocking-issues", "missing-domain-contract"],
    );
    assert.equal(evaluation.generatedIssues[0]?.severity, "blocking");
    assert.equal(evaluation.generatedIssues[1]?.severity, "advisory");
    console.log("✓ Test 1: policy evaluation maps matched rules into verify-native blocking and advisory issues");
    passed++;

    const nestedPolicy: VerifyPolicy = {
      version: 1,
      rules: [
        {
          id: "needs-core-contracts",
          enabled: true,
          action: "warn",
          message: "Core contracts are incomplete",
          when: {
            any: [
              {
                all: [
                  {
                    fact: "contracts.domain.present",
                    op: "==",
                    value: false,
                  },
                  {
                    fact: "verify.issue_codes",
                    op: "contains",
                    value: "DOMAIN_CONTRACT_SECTION_MISSING",
                  },
                ],
              },
              {
                fact: "contracts.behavior.present",
                op: "==",
                value: false,
              },
            ],
          },
        },
      ],
    };

    const nestedEvaluation = evaluateVerifyPolicy(nestedPolicy, createFacts());
    assert.deepEqual(nestedEvaluation.matchedRules.map((rule) => rule.ruleId), ["needs-core-contracts"]);
    assert.equal(nestedEvaluation.warnings.length, 0);
    console.log("✓ Test 2: nested all/any/not policy conditions evaluate deterministically against canonical facts");
    passed++;

    const invalidBlockingPolicy: VerifyPolicy = {
      version: 1,
      requires: { facts_contract: "1.0" },
      rules: [
        {
          id: "bootstrap-required",
          enabled: true,
          action: "fail_blocking",
          message: "Bootstrap takeover must be present",
          when: {
            fact: "bootstrap.takeover.present",
            op: "==",
            value: true,
          },
        },
      ],
    };

    const validation = validatePolicyAgainstFactsContract(invalidBlockingPolicy, createFactsContract());
    assert.equal(validation.valid, false);
    assert.equal(validation.issues[0]?.code, "POLICY_BLOCKING_RULE_USES_UNSTABLE_FACT");
    console.log("✓ Test 3: blocking policy rules are restricted to stable facts from the facts contract");
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
