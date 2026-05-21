import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildRetakeoverAdoptCorrectionMetrics,
  buildRetakeoverPoolMetrics,
  buildRetakeoverQualityScorecard,
  type RetakeoverFixtureClass,
  type RetakeoverMetrics,
  writeRetakeoverPoolArtifacts,
  RETAKEOVER_POOL_METRICS_RELATIVE_PATH,
  RETAKEOVER_POOL_SUMMARY_RELATIVE_PATH,
} from "../bootstrap/retakeover-metrics";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Retakeover Benchmark Pool Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-retakeover-benchmark-"));
  const results: TestResult[] = [];

  try {
    const fixtures = buildBenchmarkFixtures();
    const poolMetrics = buildRetakeoverPoolMetrics(fixtures);
    writeRetakeoverPoolArtifacts(root, fixtures);
    const poolSummary = fs.readFileSync(path.join(root, RETAKEOVER_POOL_SUMMARY_RELATIVE_PATH), "utf-8");
    const writtenMetrics = JSON.parse(fs.readFileSync(path.join(root, RETAKEOVER_POOL_METRICS_RELATIVE_PATH), "utf-8")) as {
      fixtureCount?: number;
      coverage?: { benchmarkReadiness?: { ready?: boolean; stableScoredFixtureCount?: number; blockers?: string[] } };
    };

    results.push({
      name: "benchmark pool reaches the phase-1 10-fixture target with stable scoring",
      passed:
        poolMetrics.fixtureCount === 10 &&
        poolMetrics.coverage.benchmarkReadiness.ready === true &&
        poolMetrics.coverage.benchmarkReadiness.stableScoredFixtureCount === 10 &&
        poolMetrics.coverage.benchmarkReadiness.blockers.length === 0 &&
        poolMetrics.coverage.classCoverage.coveredFixtureClassCount === 10 &&
        poolMetrics.coverage.classCoverage.missingFixtureClasses.length === 0 &&
        poolMetrics.coverage.qualityBaseline.readinessScore.fixturesBelowThreshold.length === 0 &&
        poolMetrics.coverage.qualityBaseline.contractSignalPrecision.fixturesBelowThreshold.length === 0 &&
        poolMetrics.coverage.qualityBaseline.behaviorEvidenceStrength.fixturesBelowThreshold.length === 0 &&
        poolMetrics.coverage.qualityBaseline.verifyNonBlockingRate === 1 &&
        poolMetrics.coverage.qualityBaseline.ownerReviewFixtureRate === 0 &&
        poolMetrics.verify.okCount === 10 &&
        poolMetrics.verify.blockingCount === 0 &&
        poolMetrics.qualityScorecard.lowestReadinessScore >= 70 &&
        poolMetrics.qualityScorecard.averageTakeoverReadinessScore >= 75 &&
        poolMetrics.qualityScorecard.averageContractSignalPrecision >= 0.65 &&
        poolMetrics.qualityScorecard.averageBehaviorEvidenceStrength >= 0.65 &&
        poolMetrics.qualityScorecard.averageOverclaimBlockRate === 1 &&
        poolMetrics.qualityScorecard.totalNeedsOwnerDecisionCount === 0 &&
        writtenMetrics.fixtureCount === 10 &&
        writtenMetrics.coverage?.benchmarkReadiness?.ready === true &&
        writtenMetrics.coverage?.benchmarkReadiness?.stableScoredFixtureCount === 10 &&
        poolSummary.includes("Benchmark readiness: ready") &&
        poolSummary.includes("stable scored fixtures=10/10") &&
        poolSummary.includes("Fixture classes:") &&
        poolSummary.includes("`high-noise-protocol-repo`") &&
        poolSummary.includes("`multilingual-finance-service-repo`") &&
        poolSummary.includes("`synthetic-thin-behavior-evidence`") &&
        poolSummary.includes("Benchmark phase: `north-star-score-optimization-phase-1`") &&
        poolSummary.includes("## Quality Scorecard V2"),
      error: `Expected benchmark pool readiness and summary. metrics=${JSON.stringify(poolMetrics, null, 2)}\nsummary=\n${poolSummary}`,
    });

    results.push({
      name: "benchmark pool captures all 10 fixture classes and no missing coverage",
      passed:
        poolMetrics.coverage.classCoverage.knownFixtureClassCount === 10 &&
        poolMetrics.coverage.classCoverage.coveredFixtureClassCount === 10 &&
        poolMetrics.coverage.classCoverage.coverageRate === 1 &&
        poolMetrics.coverage.classCoverage.missingFixtureClasses.length === 0 &&
        poolMetrics.coverage.fixtureCatalog.length === 10 &&
        poolMetrics.coverage.fixtureCatalog.every((entry) => entry.ownerReviewRequired === false) &&
        poolMetrics.coverage.fixtureCatalog.some((entry) => entry.fixtureId === "benchmark-1") &&
        poolMetrics.coverage.fixtureCatalog.some((entry) => entry.fixtureClass === "synthetic-noise-heavy-hidden-signal") &&
        poolMetrics.coverage.benchmarkReadiness.allClassesCovered === true &&
        poolMetrics.coverage.benchmarkReadiness.allFixturesNonBlocking === true &&
        poolMetrics.coverage.benchmarkReadiness.qualityBaselineSatisfied === true &&
        poolMetrics.coverage.benchmarkReadiness.scoreImpact.evidence.some((entry) => entry.includes("10/10 stable scored fixture(s)")),
      error: `Expected complete class coverage and readiness evidence. coverage=${JSON.stringify(poolMetrics.coverage, null, 2)}`,
    });

    results.push({
      name: "benchmark fixtures remain stable-scored and representative",
      passed:
        poolMetrics.fixtures.every((fixture) => fixture.qualityScorecard.takeoverReadinessScore >= 70) &&
        poolMetrics.fixtures.every((fixture) => fixture.qualityScorecard.contractSignalPrecision >= 0.65) &&
        poolMetrics.fixtures.every((fixture) => fixture.qualityScorecard.behaviorEvidenceStrength >= 0.65) &&
        poolMetrics.fixtures.every((fixture) => fixture.qualityScorecard.verifySafety === "non_blocking") &&
        poolMetrics.fixtures.every((fixture) => fixture.qualityScorecard.featureOverclaimRisk === "low") &&
        poolMetrics.fixtures.every((fixture) => fixture.qualityScorecard.nextAction === "adoptable_initial_packet"),
      error: `Expected stable-scored benchmark fixtures. fixtures=${JSON.stringify(poolMetrics.fixtures, null, 2)}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "retakeover benchmark pool execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  let passed = 0;
  let failed = 0;
  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
      failed++;
    }
  }

  console.log(`\n${passed}/${results.length} tests passed`);
  if (failed > 0) {
    process.exit(1);
  }
}

function buildBenchmarkFixtures(): RetakeoverMetrics[] {
  const classes: RetakeoverFixtureClass[] = [
    "high-noise-protocol-repo",
    "multilingual-finance-service-repo",
    "docs-api-schema-scattered-repo",
    "multi-language-monorepo-repo",
    "frontend-backend-mixed-repo",
    "historical-debt-service-repo",
    "synthetic-god-file-monolith",
    "synthetic-contract-drift",
    "synthetic-noise-heavy-hidden-signal",
    "synthetic-thin-behavior-evidence",
  ];

  return classes.map((fixtureClass, index) => {
    const fixtureId = `benchmark-${index + 1}`;
    const featureRecommendation: RetakeoverMetrics["draftQuality"]["featureRecommendation"] = "accept_candidate";
    const featureContent = [
      "Feature: Benchmark takeover packet",
      "",
      "  Scenario: Stable behavior evidence supports the takeover packet",
      "    Given the ranked evidence is strong",
      "    When the reviewer adopts the packet",
      "    Then the fixture remains non-blocking",
      "",
      "  Scenario: Contract signal stays grounded in boundary evidence",
      "    Given the repository has clear boundary artifacts",
      "    When the draft is reviewed",
      "    Then the adoption packet stays reviewable",
    ].join("\n");
    const rankedEvidence = [
      {
        path: `${fixtureId}/docs/README.md`,
        kind: "document",
        metadata: { boundarySignal: "governance_document" },
      },
      {
        path: `${fixtureId}/contracts/openapi.yaml`,
        kind: "schema",
        metadata: { boundarySignal: "schema_truth_source" },
      },
      {
        path: `${fixtureId}/src/routes.ts`,
        kind: "route",
        metadata: { boundarySignal: "explicit_endpoint" },
      },
    ];
    const adoptCorrection = buildRetakeoverAdoptCorrectionMetrics({
      acceptedArtifacts: ["domain", "api", "feature"],
      deferredArtifacts: [],
    });

    return {
      version: 1,
      fixtureId,
      fixtureClass,
      discoverSummary: {
        selectedCount: 12,
        documentCount: 4,
        schemaCount: 3,
        routeCount: 2,
        sourceFileCount: 15,
        excludedFileCount: 6,
        totalExcludedFileCount: 9,
      },
      topRankedEvidence: rankedEvidence.map((entry) => entry.path),
      draftQuality: {
        domainContextCount: 3 + (index % 2),
        aggregateRootCount: 2 + (index % 2),
        apiSurfaceCount: 3,
        featureRecommendation,
      },
      adoptCorrection,
      verifyVerdict: "PASS",
      verifyOk: true,
      qualityScorecard: buildRetakeoverQualityScorecard({
        rankedEvidence: {
          summary: { candidateCount: 12, selectedCount: 12 },
          evidence: rankedEvidence,
          excludedSummary: { totalExcludedFileCount: 9 },
        },
        discoverSummary: {
          selectedCount: 12,
          documentCount: 4,
          schemaCount: 3,
          routeCount: 2,
          sourceFileCount: 15,
          excludedFileCount: 6,
          totalExcludedFileCount: 9,
        },
        featureContent,
        featureRecommendation,
        acceptedArtifacts: ["domain", "api", "feature"],
        deferredArtifacts: [],
        verifyOk: true,
      }),
    };
  });
}

void main();
