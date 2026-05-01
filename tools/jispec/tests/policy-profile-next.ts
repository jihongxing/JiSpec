import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { collectConsoleLocalSnapshot } from "../console/read-model-snapshot";
import { migrateVerifyPolicy } from "../policy/migrate-policy";
import { isPolicySchemaError, validateVerifyPolicy, type TeamPolicyProfileName } from "../policy/policy-schema";

interface ProfileExpectation {
  requiredReviewers: number;
  waiverRequireExpiration: boolean;
  releaseRequireCompare: boolean;
  executeRequireCleanVerify: boolean;
}

async function main(): Promise<void> {
  console.log("=== Policy Profile Next Tests ===\n");

  let passed = 0;
  let failed = 0;

  function record(name: string, fn: () => void): void {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`✗ ${name}`);
      console.log(`  Error: ${message}`);
      failed++;
    }
  }

  record("policy migrate applies distinct solo, small_team, and regulated profile defaults", () => {
    const expectations: Record<TeamPolicyProfileName, ProfileExpectation> = {
      solo: {
        requiredReviewers: 0,
        waiverRequireExpiration: false,
        releaseRequireCompare: false,
        executeRequireCleanVerify: false,
      },
      small_team: {
        requiredReviewers: 1,
        waiverRequireExpiration: true,
        releaseRequireCompare: true,
        executeRequireCleanVerify: false,
      },
      regulated: {
        requiredReviewers: 2,
        waiverRequireExpiration: true,
        releaseRequireCompare: true,
        executeRequireCleanVerify: true,
      },
    };

    for (const [profile, expected] of Object.entries(expectations) as Array<[TeamPolicyProfileName, ProfileExpectation]>) {
      const fixtureRoot = createFixtureRoot(`jispec-policy-profile-${profile}-`);
      try {
        const result = migrateVerifyPolicy(fixtureRoot, undefined, {
          profile,
          actor: "policy-profile-test",
          reason: "Exercise profile defaults.",
        });
        assert.equal(result.created, true);
        assert.equal(result.policy.team?.profile, profile);
        assert.equal(result.policy.team?.required_reviewers, expected.requiredReviewers);
        assert.equal(result.policy.waivers?.require_expiration, expected.waiverRequireExpiration);
        assert.equal(result.policy.release?.require_compare, expected.releaseRequireCompare);
        assert.equal(result.policy.execute_default?.require_clean_verify, expected.executeRequireCleanVerify);
      } finally {
        removeFixtureRoot(fixtureRoot);
      }
    }
  });

  record("policy schema accepts profile governance sections and rejects unknown nested keys", () => {
    const policy = validateVerifyPolicy({
      version: 1,
      team: {
        profile: "regulated",
        owner: "security",
        reviewers: ["qa", "compliance"],
        required_reviewers: 2,
      },
      waivers: {
        require_owner: true,
        require_reason: true,
        require_expiration: true,
        max_active_days: 30,
        expiring_soon_days: 7,
        unmatched_active_severity: "blocking",
      },
      release: {
        require_snapshot: true,
        require_compare: true,
        drift_requires_owner_review: true,
        policy_drift_severity: "blocking",
        static_collector_drift_severity: "advisory",
        contract_graph_drift_severity: "blocking",
      },
      execute_default: {
        allowed: true,
        require_policy: true,
        require_clear_adopt_boundary: true,
        require_clean_verify: true,
        max_cost_usd: 3,
        max_iterations: 6,
      },
      rules: [],
    });
    assert.equal(policy.team?.profile, "regulated");
    assert.equal(policy.execute_default?.require_clean_verify, true);

    assert.throws(
      () => validateVerifyPolicy({
        version: 1,
        waivers: {
          surprise: true,
        },
        rules: [],
      }),
      (error: unknown) =>
        isPolicySchemaError(error) &&
        error.code === "POLICY_UNKNOWN_KEY" &&
        error.key === "waivers.surprise",
    );
  });

  record("policy migrate normalizes deprecated profile policy keys without making them verify blockers", () => {
    const fixtureRoot = createFixtureRoot("jispec-policy-profile-deprecated-");
    try {
      writeText(fixtureRoot, ".spec/policy.yaml", [
        "version: 1",
        "team_profile: solo",
        "waiver_policy:",
        "  require_expiration: true",
        "release_policy:",
        "  require_compare: true",
        "executeDefault:",
        "  require_clean_verify: true",
        "rules: []",
        "",
      ].join("\n"));

      const result = migrateVerifyPolicy(fixtureRoot, undefined, {
        actor: "policy-profile-test",
        reason: "Normalize deprecated policy keys.",
      });
      const migrated = yaml.load(fs.readFileSync(path.join(fixtureRoot, ".spec", "policy.yaml"), "utf-8")) as Record<string, unknown>;

      assert.equal(result.policy.team?.profile, "solo");
      assert.equal(result.policy.waivers?.require_expiration, true);
      assert.equal(result.policy.release?.require_compare, true);
      assert.equal(result.policy.execute_default?.require_clean_verify, true);
      assert.equal("team_profile" in migrated, false);
      assert.equal("waiver_policy" in migrated, false);
      assert.equal("release_policy" in migrated, false);
      assert.equal("executeDefault" in migrated, false);
      assert.ok(result.changes.some((change) => change.includes("team_profile")));
      assert.ok(result.changes.some((change) => change.includes("waiver_policy")));
      assert.ok(result.changes.some((change) => change.includes("release_policy")));
      assert.ok(result.changes.some((change) => change.includes("executeDefault")));
    } finally {
      removeFixtureRoot(fixtureRoot);
    }
  });

  record("Console policy posture exposes next-round profile governance fields", () => {
    const fixtureRoot = createFixtureRoot("jispec-policy-profile-console-");
    try {
      writeText(fixtureRoot, ".spec/policy.yaml", [
        "version: 1",
        "requires:",
        "  facts_contract: '1.0'",
        "team:",
        "  profile: regulated",
        "  owner: governance",
        "  reviewers: [qa, compliance]",
        "  required_reviewers: 2",
        "waivers:",
        "  require_expiration: true",
        "  max_active_days: 30",
        "release:",
        "  require_compare: true",
        "  drift_requires_owner_review: true",
        "execute_default:",
        "  allowed: true",
        "  require_clean_verify: true",
        "rules: []",
        "",
      ].join("\n"));

      const snapshot = collectConsoleLocalSnapshot(fixtureRoot);
      const policy = snapshot.governance.objects.find((object) => object.id === "policy_posture");
      assert.equal(policy?.status, "available");
      assert.equal(policy?.summary.requiredReviewers, 2);
      assert.equal(policy?.summary.waiverRequireExpiration, true);
      assert.equal(policy?.summary.waiverMaxActiveDays, 30);
      assert.equal(policy?.summary.releaseRequireCompare, true);
      assert.equal(policy?.summary.releaseDriftRequiresOwnerReview, true);
      assert.equal(policy?.summary.executeDefaultAllowed, true);
      assert.equal(policy?.summary.executeDefaultRequireCleanVerify, true);
    } finally {
      removeFixtureRoot(fixtureRoot);
    }
  });

  record("policy migrate CLI accepts explicit profile selection", () => {
    const fixtureRoot = createFixtureRoot("jispec-policy-profile-cli-");
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    try {
      const output = execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "./tools/jispec/cli.ts",
          "policy",
          "migrate",
          "--root",
          fixtureRoot,
          "--profile",
          "regulated",
          "--json",
        ],
        {
          cwd: repoRoot,
          encoding: "utf-8",
        },
      );
      const result = JSON.parse(output) as { policy?: { team?: { profile?: string; required_reviewers?: number } } };
      assert.equal(result.policy?.team?.profile, "regulated");
      assert.equal(result.policy?.team?.required_reviewers, 2);
    } finally {
      removeFixtureRoot(fixtureRoot);
    }
  });

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

function createFixtureRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeFixtureRoot(fixtureRoot: string): void {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
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
