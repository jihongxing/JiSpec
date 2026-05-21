import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildRetakeoverAdoptCorrectionMetrics,
  buildRetakeoverPoolMetrics,
  buildRetakeoverQualityScorecard,
  RETAKEOVER_POOL_METRICS_RELATIVE_PATH,
  RETAKEOVER_POOL_SUMMARY_RELATIVE_PATH,
  type RetakeoverFeatureRecommendation,
  type RetakeoverFixtureClass,
  type RetakeoverMetrics,
  writeRetakeoverPoolArtifacts,
} from "../bootstrap/retakeover-metrics";
import { TEST_SUITES } from "./regression-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Retakeover Realism Ladder Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("realism ladder covers five repo realism classes and satisfies correction budgets", () => {
    const pool = buildRetakeoverPoolMetrics(buildRealismFixtures());
    const ladder = pool.coverage.realismLadder;
    assert.equal(ladder.phase, "north-star-score-optimization-phase-6");
    assert.equal(ladder.ready, true);
    assert.equal(ladder.targetRealismClassCount, 5);
    assert.equal(ladder.coveredRealismClassCount, 5);
    assert.deepEqual(ladder.missingRealismClasses, []);
    assert.deepEqual(ladder.blockers, []);
    assert.ok(ladder.classes.every((entry) => entry.correctionBudgetSatisfied));
    assert.ok(ladder.classes.every((entry) => entry.metrics.stableScoredFixtureCount >= 1));
    assert.ok(ladder.scoreImpact.evidence.some((entry) => entry.includes("5/5 realism class(es)")));
  }));

  results.push(record("realism budget miss creates deterministic owner action and next command", () => {
    const pool = buildRetakeoverPoolMetrics([
      fixture("simple-budget-miss", "docs-api-schema-scattered-repo", {
        acceptedArtifacts: ["api"],
        editedArtifacts: ["domain"],
        deferredArtifacts: ["feature"],
        topEvidenceStrong: false,
        readinessCandidateCount: 16,
      }),
    ]);
    const ladder = pool.coverage.realismLadder;
    const simple = ladder.classes.find((entry) => entry.realismClass === "simple_service");
    assert.ok(simple);
    assert.equal(ladder.ready, false);
    assert.ok(simple.blockers.includes("accepted_without_edit_rate_below_budget"));
    assert.ok(simple.blockers.includes("deferred_spec_debt_rate_above_budget"));
    assert.ok(simple.blockers.includes("evidence_noise_rate_above_budget"));
    assert.equal(simple.ownerAction.owner, "takeover quality owner");
    assert.equal(simple.ownerAction.sourceArtifact, RETAKEOVER_POOL_METRICS_RELATIVE_PATH);
    assert.equal(simple.ownerAction.nextCommand, "node --import tsx ./tools/jispec/tests/retakeover-realism-ladder.ts");
    assert.ok(ladder.blockers.some((blocker) => blocker.startsWith("simple_service:")));
  }));

  results.push(record("pool artifacts and summary expose phase-6 realism ladder", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-retakeover-realism-"));
    try {
      writeRetakeoverPoolArtifacts(root, buildRealismFixtures());
      const metrics = JSON.parse(
        fs.readFileSync(path.join(root, RETAKEOVER_POOL_METRICS_RELATIVE_PATH), "utf-8"),
      ) as { coverage?: { realismLadder?: { phase?: string; ready?: boolean; classes?: unknown[] } } };
      const summary = fs.readFileSync(path.join(root, RETAKEOVER_POOL_SUMMARY_RELATIVE_PATH), "utf-8");

      assert.equal(metrics.coverage?.realismLadder?.phase, "north-star-score-optimization-phase-6");
      assert.equal(metrics.coverage?.realismLadder?.ready, true);
      assert.equal(metrics.coverage?.realismLadder?.classes?.length, 5);
      assert.match(summary, /## Realism Ladder/);
      assert.match(summary, /Phase: `north-star-score-optimization-phase-6`/);
      assert.match(summary, /`polyglot_service`/);
      assert.match(summary, /takeover quality/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("stage-6 realism ladder suite is registered in retakeover regression pool", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "retakeover-realism-ladder.ts");
    assert.ok(suite);
    assert.equal(suite.area, "retakeover-regression-pool");
    assert.equal(suite.expectedTests, 4);
    assert.equal(suite.task, "North-Star-Score-Phase-6");
  }));

  printResults(results);
}

function buildRealismFixtures(): RetakeoverMetrics[] {
  return [
    fixture("realism-simple", "docs-api-schema-scattered-repo"),
    fixture("realism-monolith", "synthetic-god-file-monolith"),
    fixture("realism-polyglot", "multi-language-monorepo-repo"),
    fixture("realism-noise", "synthetic-noise-heavy-hidden-signal"),
    fixture("realism-weak-docs", "synthetic-thin-behavior-evidence", {
      acceptedArtifacts: ["domain", "api"],
      deferredArtifacts: ["feature"],
      featureRecommendation: "defer_as_spec_debt",
    }),
  ];
}

function fixture(
  fixtureId: string,
  fixtureClass: RetakeoverFixtureClass,
  options: {
    acceptedArtifacts?: string[];
    editedArtifacts?: string[];
    deferredArtifacts?: string[];
    rejectedArtifacts?: string[];
    featureRecommendation?: RetakeoverFeatureRecommendation;
    topEvidenceStrong?: boolean;
    readinessCandidateCount?: number;
  } = {},
): RetakeoverMetrics {
  const acceptedArtifacts = options.acceptedArtifacts ?? ["domain", "api", "feature"];
  const editedArtifacts = options.editedArtifacts ?? [];
  const deferredArtifacts = options.deferredArtifacts ?? [];
  const rejectedArtifacts = options.rejectedArtifacts ?? [];
  const featureRecommendation = options.featureRecommendation ?? "accept_candidate";
  const rankedEvidence = buildRankedEvidence(fixtureId, options.topEvidenceStrong ?? true);
  const adoptCorrection = buildRetakeoverAdoptCorrectionMetrics({
    acceptedArtifacts,
    editedArtifacts,
    deferredArtifacts,
    rejectedArtifacts,
  });
  const featureContent = buildFeatureContent(featureRecommendation);

  return {
    version: 1,
    fixtureId,
    fixtureClass,
    discoverSummary: {
      selectedCount: 12,
      documentCount: 4,
      schemaCount: 3,
      routeCount: 2,
      sourceFileCount: 14,
      totalExcludedFileCount: 8,
    },
    topRankedEvidence: rankedEvidence.map((entry) => entry.path),
    draftQuality: {
      domainContextCount: 3,
      aggregateRootCount: 2,
      apiSurfaceCount: 3,
      featureRecommendation,
    },
    adoptCorrection,
    verifyVerdict: "PASS",
    verifyOk: true,
    qualityScorecard: buildRetakeoverQualityScorecard({
      rankedEvidence: {
        summary: { candidateCount: options.readinessCandidateCount ?? 12, selectedCount: 12 },
        evidence: rankedEvidence,
        excludedSummary: { totalExcludedFileCount: 8 },
      },
      featureContent,
      featureRecommendation,
      acceptedArtifacts: adoptCorrection.acceptedArtifacts,
      editedArtifacts: adoptCorrection.editedArtifacts,
      deferredArtifacts: adoptCorrection.deferredArtifacts,
      rejectedArtifacts: adoptCorrection.rejectedArtifacts,
      verifyOk: true,
    }),
  };
}

function buildRankedEvidence(
  fixtureId: string,
  strong: boolean,
): Array<{ path: string; kind: string; metadata: Record<string, unknown> }> {
  if (!strong) {
    return [
      { path: `${fixtureId}/README.md`, kind: "document", metadata: { boundarySignal: "supporting_evidence" } },
      { path: `${fixtureId}/src/helper.ts`, kind: "source", metadata: { boundarySignal: "weak_candidate" } },
      { path: `${fixtureId}/docs/notes.md`, kind: "document", metadata: { boundarySignal: "supporting_evidence" } },
    ];
  }

  return [
    { path: `${fixtureId}/docs/product.md`, kind: "document", metadata: { boundarySignal: "governance_document" } },
    { path: `${fixtureId}/contracts/openapi.yaml`, kind: "schema", metadata: { boundarySignal: "schema_truth_source" } },
    { path: `${fixtureId}/src/routes.ts`, kind: "route", metadata: { boundarySignal: "explicit_endpoint" } },
  ];
}

function buildFeatureContent(recommendation: RetakeoverFeatureRecommendation): string {
  if (recommendation === "defer_as_spec_debt") {
    return [
      "Feature: Retakeover weak behavior evidence",
      "# adoption_recommendation: defer_as_spec_debt",
      "",
      "  @behavior_needs_human_review",
      "  Scenario: Owner reviews weak behavior evidence",
      "    # recommendation: defer_as_spec_debt",
      "    Given behavior evidence is thin",
      "    When the takeover packet is reviewed",
      "    Then the feature remains explicit spec debt",
    ].join("\n");
  }

  return [
    "Feature: Retakeover stable behavior evidence",
    "# adoption_recommendation: accept_candidate",
    "",
    "  Scenario: Strong evidence supports adoption",
    "    # recommendation: accept_candidate",
    "    Given ranked evidence is strong",
    "    When the takeover packet is reviewed",
    "    Then the behavior can be adopted as an initial contract",
  ].join("\n");
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function printResults(results: TestResult[]): void {
  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      console.log(`  Error: ${result.error ?? "unknown error"}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${results.length} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
