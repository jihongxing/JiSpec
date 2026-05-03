import assert from "node:assert/strict";
import { buildCanonicalFacts } from "../facts/canonical-facts";
import { createFactsContract, checkFactsContractCompatibility, computeFactsContractHash } from "../facts/facts-contract";
import { addRawFact, addRawFactWarning, createRawFactsSnapshot } from "../facts/raw-facts";

async function main(): Promise<void> {
  console.log("=== Facts Contract Roundtrip Tests ===\n");

  let passed = 0;
  let failed = 0;

  try {
    const contract = createFactsContract();
    const recomputedHash = computeFactsContractHash({
      version: contract.version,
      facts: contract.facts,
    });

    assert.equal(contract.contractHash, recomputedHash);
    assert.equal(contract.version, "1.0");
    console.log("✓ Test 1: facts contract materializes with a stable version and deterministic hash");
    passed++;

    const raw = createRawFactsSnapshot("/tmp/jispec-facts");
    addRawFact(raw, "verify.issue_count", 3, "test");
    addRawFact(raw, "contracts.domain.present", true, "test");
    addRawFact(raw, "bootstrap.takeover.present", true, "test");
    addRawFact(raw, "unknown.signal", "ignored", "test");
    addRawFactWarning(raw, "collector emitted an unsupported signal");

    const canonical = buildCanonicalFacts(raw);
    assert.equal(canonical.contractVersion, "1.0");
    assert.equal(canonical.facts["verify.issue_count"], 3);
    assert.equal(canonical.facts["contracts.domain.present"], true);
    assert.equal(canonical.facts["contracts.behavior.deferred"], false);
    assert.equal(canonical.facts["verify.blocking_issue_count"], 0);
    assert.deepEqual(canonical.facts["verify.issue_codes"], []);
    assert.ok(
      canonical.warnings.some((warning) => warning.includes("Unknown fact key: unknown.signal")),
    );
    console.log("✓ Test 2: canonical facts preserve known signals, backfill stable defaults, and warn on unknown raw facts");
    passed++;

    const compatible = checkFactsContractCompatibility("1.0", contract.version);
    const incompatible = checkFactsContractCompatibility("2.0", contract.version);
    assert.equal(compatible.compatible, true);
    assert.equal(incompatible.compatible, false);
    assert.match(incompatible.reason ?? "", /required 2\.0, actual 1\.0/);
    console.log("✓ Test 3: facts contract compatibility stays explicit and rejects mismatched versions");
    passed++;

    assert.ok(contract.facts.some((fact) => fact.key === "contracts.behavior.deferred" && fact.stability === "stable"));
    console.log("✓ Test 4: facts contract exposes deferred behavior debt as a stable policy fact");
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
