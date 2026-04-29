import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createFactsContract } from "../facts/facts-contract";
import { migrateVerifyPolicy } from "../policy/migrate-policy";
import { loadVerifyPolicy } from "../policy/policy-loader";
import {
  isPolicySchemaError,
  validatePolicyAgainstFactsContract,
  validateVerifyPolicy,
  type VerifyPolicy,
} from "../policy/policy-schema";
import { cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== Policy Unknown Fact Tests ===\n");

  let passed = 0;
  let failed = 0;
  const fixtureRoot = createVerifyFixture("policy-unknown-fact");

  try {
    const unknownFactPolicy: VerifyPolicy = {
      version: 1,
      requires: { facts_contract: "1.0" },
      rules: [
        {
          id: "requires-mystery-signal",
          enabled: true,
          action: "warn",
          message: "Mystery signal fired",
          when: {
            fact: "mystery.signal",
            op: "==",
            value: true,
          },
        },
      ],
    };

    const validation = validatePolicyAgainstFactsContract(unknownFactPolicy, createFactsContract());
    assert.equal(validation.valid, false);
    assert.equal(validation.issues[0]?.code, "POLICY_UNKNOWN_FACT");
    assert.deepEqual(validation.issues[0]?.factKeys, ["mystery.signal"]);
    console.log("✓ Test 1: policy validation rejects unknown fact references before evaluation");
    passed++;

    assert.throws(
      () => validateVerifyPolicy({ version: 1, mystery: true, rules: [] }),
      (error) => isPolicySchemaError(error) && error.code === "POLICY_UNKNOWN_KEY" && error.key === "mystery",
    );
    console.log("✓ Test 2: policy schema rejects unknown top-level keys with a stable code");
    passed++;

    const migration = migrateVerifyPolicy(fixtureRoot);
    assert.equal(migration.created, true);
    assert.ok(fs.existsSync(path.join(fixtureRoot, ".spec", "policy.yaml")));
    assert.equal(migration.policy.requires?.facts_contract, "1.0");
    assert.equal(migration.policy.team?.profile, "small_team");
    assert.equal(migration.policy.team?.owner, "unassigned");
    assert.ok(migration.policy.rules.length > 0);
    console.log("✓ Test 3: policy migration scaffolds a starter policy with team profile and facts contract");
    passed++;

    const loadedPolicy = loadVerifyPolicy(fixtureRoot);
    assert.ok(loadedPolicy);
    assert.equal(loadedPolicy?.version, 1);
    assert.equal(loadedPolicy?.requires?.facts_contract, "1.0");
    console.log("✓ Test 4: migrated policy round-trips through the YAML loader");
    passed++;

    fs.writeFileSync(
      path.join(fixtureRoot, ".spec", "policy.yaml"),
      [
        "version: 1",
        'facts_contract: "0.9"',
        "team_profile: solo",
        "rules: []",
      ].join("\n"),
      "utf-8",
    );
    const deprecatedMigration = migrateVerifyPolicy(fixtureRoot);
    assert.equal(deprecatedMigration.created, false);
    assert.equal(deprecatedMigration.updated, true);
    assert.equal(deprecatedMigration.policy.requires?.facts_contract, "1.0");
    assert.equal(deprecatedMigration.policy.team?.profile, "solo");
    assert.ok(deprecatedMigration.changes.includes("Migrated deprecated facts_contract to requires.facts_contract"));
    assert.ok(deprecatedMigration.changes.includes("Migrated deprecated team_profile to team.profile"));
    console.log("✓ Test 5: policy migration normalizes deprecated keys before validation");
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
