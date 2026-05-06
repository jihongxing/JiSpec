import assert from "node:assert/strict";
import {
  applyPolicyPresetOverrides,
  getPolicyPreset,
  listPolicyPresets,
  materializePolicyPreset,
  type PolicyPresetId,
} from "../policy/policy-presets";
import { createStarterVerifyPolicy } from "../policy/migrate-policy";
import { validateVerifyPolicy } from "../policy/policy-schema";

async function main(): Promise<void> {
  console.log("=== Policy Preset Tests ===\n");

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

  record("preset registry exposes stable ids, base profiles, and usage metadata", () => {
    const presets = listPolicyPresets();
    const ids = presets.map((preset) => preset.id);
    assert.deepEqual(ids, [
      "fintech",
      "startup-fast-iteration",
      "sox-compliance",
      "saas-default",
      "open-source-maintainer",
    ] satisfies PolicyPresetId[]);
    for (const preset of presets) {
      assert.ok(["solo", "small_team", "regulated"].includes(preset.baseProfile));
      assert.ok(preset.label.length > 0);
      assert.ok(preset.description.length > 0);
      assert.ok(preset.useCases.length >= 2);
    }
  });

  record("every preset materializes into a valid policy without changing the stable profile contract", () => {
    for (const preset of listPolicyPresets()) {
      const policy = materializePolicyPreset(preset.id);
      assert.equal(policy.version, 1);
      assert.equal(policy.team?.profile, preset.baseProfile);
      assert.ok(policy.requires?.facts_contract);
      assert.equal(policy.team?.owner, "unassigned");
      assert.deepEqual(policy.team?.reviewers, []);
      assert.ok(policy.rules.length >= 4);
      validateVerifyPolicy(policy);
    }
  });

  record("preset overrides layer on top of starter policy instead of replacing the whole policy", () => {
    const base = createStarterVerifyPolicy("small_team");
    const startup = getPolicyPreset("startup-fast-iteration");
    const merged = applyPolicyPresetOverrides(base, startup);

    assert.equal(merged.team?.profile, "small_team");
    assert.equal(merged.waivers?.require_expiration, false);
    assert.equal(merged.release?.require_compare, false);
    assert.equal(merged.execute_default?.max_cost_usd, 10);
    assert.ok(merged.rules.some((rule) => rule.id === "require-domain-contract"));
  });

  record("fintech and sox presets tighten regulated posture in distinct ways", () => {
    const fintech = materializePolicyPreset("fintech");
    const sox = materializePolicyPreset("sox-compliance");

    assert.equal(fintech.team?.profile, "regulated");
    assert.equal(fintech.waivers?.max_active_days, 21);
    assert.equal(fintech.execute_default?.allowed, true);
    assert.equal(fintech.execute_default?.max_cost_usd, 2);

    assert.equal(sox.team?.profile, "regulated");
    assert.equal(sox.waivers?.max_active_days, 14);
    assert.equal(sox.execute_default?.allowed, false);
    assert.equal(sox.execute_default?.max_cost_usd, 3);
    assert.equal(sox.release?.static_collector_drift_severity, "blocking");
  });

  record("open-source preset adds greenfield review posture without inventing a new profile", () => {
    const preset = getPolicyPreset("open-source-maintainer");
    const policy = materializePolicyPreset("open-source-maintainer");

    assert.equal(preset.baseProfile, "small_team");
    assert.equal(policy.team?.profile, "small_team");
    assert.equal(policy.greenfield?.review_gate?.low_confidence_blocks, true);
    assert.equal(policy.greenfield?.review_gate?.conflict_blocks, true);
    assert.equal(policy.greenfield?.review_gate?.deferred_or_waived_severity, "advisory");
  });

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
