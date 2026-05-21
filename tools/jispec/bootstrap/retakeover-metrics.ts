import fs from "node:fs";
import path from "node:path";

export type RetakeoverFixtureClass =
  | "high-noise-protocol-repo"
  | "multilingual-finance-service-repo"
  | "docs-api-schema-scattered-repo"
  | "multi-language-monorepo-repo"
  | "frontend-backend-mixed-repo"
  | "historical-debt-service-repo"
  | "synthetic-god-file-monolith"
  | "synthetic-contract-drift"
  | "synthetic-noise-heavy-hidden-signal"
  | "synthetic-thin-behavior-evidence";

export type RetakeoverFeatureRecommendation = "accept_candidate" | "defer_as_spec_debt" | "unknown";
export type RetakeoverFeatureOverclaimRisk = "low" | "medium" | "high";
export type RetakeoverVerifySafety = "non_blocking" | "blocking";
export type RetakeoverNextAction = "adoptable_initial_packet" | "owner_review_spec_debt" | "fix_blocking_verify";
export type RetakeoverAdoptCorrectionDecision = "accepted" | "edited" | "deferred" | "rejected";
export type RetakeoverRealismClass =
  | "simple_service"
  | "monolith"
  | "polyglot_service"
  | "legacy_with_generated_noise"
  | "weak_documentation";

export interface RetakeoverAdoptCorrectionDecisionCounts {
  accepted: number;
  edited: number;
  deferred: number;
  rejected: number;
}

export interface RetakeoverArtifactCorrectionLoad {
  artifactKind: string;
  decision: RetakeoverAdoptCorrectionDecision;
  correctionLoad: number;
  needsOwnerDecision: boolean;
  note?: string;
}

export interface RetakeoverAdoptCorrectionInput {
  acceptedArtifacts: string[];
  deferredArtifacts: string[];
  editedArtifacts?: string[];
  rejectedArtifacts?: string[];
  notes?: Record<string, string>;
}

export interface RetakeoverAdoptCorrectionMetrics {
  acceptedArtifacts: string[];
  editedArtifacts: string[];
  deferredArtifacts: string[];
  rejectedArtifacts: string[];
  decisionCounts: RetakeoverAdoptCorrectionDecisionCounts;
  artifactCorrectionLoad: RetakeoverArtifactCorrectionLoad[];
  correctionHotspots: string[];
  ownerReviewArtifactCount: number;
}

export interface RetakeoverQualityScorecard {
  noiseSuppressionRate: number;
  topEvidenceSignalRate: number;
  contractSignalPrecision: number;
  behaviorEvidenceStrength: number;
  adoptCorrectionLoad: number;
  humanCorrectionHotspots: string[];
  overclaimBlockRate: number;
  adoptionReadyArtifactCount: number;
  needsOwnerDecisionCount: number;
  featureOverclaimRisk: RetakeoverFeatureOverclaimRisk;
  verifySafety: RetakeoverVerifySafety;
  takeoverReadinessScore: number;
  riskNotes: string[];
  nextAction: RetakeoverNextAction;
}

export interface RetakeoverQualityScorecardInput {
  rankedEvidence?: {
    summary?: {
      candidateCount?: number;
      selectedCount?: number;
    };
    evidence?: Array<{
      path?: string;
      kind?: string;
      metadata?: Record<string, unknown>;
    }>;
    excludedSummary?: {
      totalExcludedFileCount?: number;
    };
  };
  discoverSummary?: Record<string, unknown>;
  featureContent?: string;
  featureRecommendation: RetakeoverFeatureRecommendation;
  acceptedArtifacts: string[];
  deferredArtifacts: string[];
  editedArtifacts?: string[];
  rejectedArtifacts?: string[];
  verifyOk: boolean;
}

export interface RetakeoverMetrics {
  version: 1;
  fixtureId: string;
  fixtureClass: RetakeoverFixtureClass;
  discoverSummary: Record<string, unknown>;
  topRankedEvidence: string[];
  draftQuality: {
    domainContextCount: number;
    aggregateRootCount: number;
    apiSurfaceCount: number;
    featureRecommendation: RetakeoverFeatureRecommendation;
  };
  adoptCorrection: RetakeoverAdoptCorrectionMetrics;
  verifyVerdict: string;
  verifyOk: boolean;
  qualityScorecard: RetakeoverQualityScorecard;
}

export interface RetakeoverArtifactWriteResult {
  metricsPath: string;
  summaryPath: string;
}

export interface RetakeoverPoolMetrics {
  version: 1;
  fixtureCount: number;
  fixtureClasses: RetakeoverFixtureClass[];
  verify: {
    okCount: number;
    blockingCount: number;
    verdicts: Record<string, number>;
  };
  draftQuality: {
    totalDomainContextCount: number;
    totalAggregateRootCount: number;
    totalApiSurfaceCount: number;
    featureRecommendations: Record<RetakeoverFeatureRecommendation, number>;
  };
  adoptCorrection: {
    fixturesWithDeferredArtifacts: string[];
    fixturesWithEditedArtifacts: string[];
    fixturesWithRejectedArtifacts: string[];
    deferredArtifactCount: number;
    editedArtifactCount: number;
    rejectedArtifactCount: number;
    totalCorrectionLoad: number;
    ownerReviewArtifactCount: number;
    topCorrectionHotspots: string[];
  };
  qualityScorecard: {
    averageTakeoverReadinessScore: number;
    lowestReadinessScore: number;
    averageContractSignalPrecision: number;
    averageBehaviorEvidenceStrength: number;
    averageOverclaimBlockRate: number;
    totalAdoptionReadyArtifactCount: number;
    totalNeedsOwnerDecisionCount: number;
    fixturesWithHumanCorrectionHotspots: string[];
    fixturesNeedingOwnerReview: string[];
    fixturesWithBlockingVerify: string[];
    featureOverclaimRisk: Record<RetakeoverFeatureOverclaimRisk, number>;
  };
  coverage: {
    fixtureCatalog: RetakeoverPoolFixtureCatalogEntry[];
    classCoverage: RetakeoverPoolClassCoverage;
    qualityBaseline: RetakeoverPoolQualityBaseline;
    benchmarkReadiness: RetakeoverBenchmarkReadiness;
    realismLadder: RetakeoverRealismLadder;
  };
  fixtures: RetakeoverMetrics[];
}

export interface RetakeoverPoolFixtureCatalogEntry {
  fixtureId: string;
  fixtureClass: RetakeoverFixtureClass;
  featureRecommendation: RetakeoverFeatureRecommendation;
  verifySafety: RetakeoverVerifySafety;
  ownerReviewRequired: boolean;
  artifactDecisionPaths: string[];
  coverageSignals: string[];
  topEvidenceSample: string[];
  baselineProfile: {
    takeoverReadinessScore: number;
    contractSignalPrecision: number;
    behaviorEvidenceStrength: number;
    overclaimBlockRate: number;
  };
}

export interface RetakeoverPoolClassCoverage {
  knownFixtureClassCount: number;
  coveredFixtureClassCount: number;
  coverageRate: number;
  classCounts: Record<RetakeoverFixtureClass, number>;
  missingFixtureClasses: RetakeoverFixtureClass[];
}

export interface RetakeoverPoolQualityBaseline {
  thresholds: {
    minimumTakeoverReadinessScore: number;
    minimumContractSignalPrecision: number;
    minimumBehaviorEvidenceStrength: number;
  };
  readinessScore: RetakeoverPoolBaselineMetric;
  contractSignalPrecision: RetakeoverPoolBaselineMetric;
  behaviorEvidenceStrength: RetakeoverPoolBaselineMetric;
  verifyNonBlockingRate: number;
  ownerReviewFixtureRate: number;
}

export interface RetakeoverPoolBaselineMetric {
  threshold: number;
  lowestObserved: number;
  averageObserved: number;
  fixturesBelowThreshold: string[];
}

export interface RetakeoverBenchmarkReadiness {
  phase: "north-star-score-optimization-phase-1";
  ready: boolean;
  targetFixtureCount: number;
  targetClassCoverageCount: number;
  stableScoredFixtureCount: number;
  stableScoredFixtureIds: string[];
  unstableFixtureIds: string[];
  allClassesCovered: boolean;
  allFixturesNonBlocking: boolean;
  qualityBaselineSatisfied: boolean;
  blockers: string[];
  scoreImpact: {
    dimension: "retakeover-quality";
    currentTarget: "9.2-9.5";
    evidence: string[];
  };
}

export interface RetakeoverRealismBudget {
  minimumFixtureCount: number;
  minimumStableScoredFixtureCount: number;
  minimumAcceptedWithoutEditRate: number;
  maximumEditedDraftRate: number;
  maximumDeferredSpecDebtRate: number;
  maximumFeatureOverclaimRiskRate: number;
  maximumEvidenceNoiseRate: number;
  minimumTakeoverReadinessScore: number;
}

export interface RetakeoverRealismClassEntry {
  realismClass: RetakeoverRealismClass;
  fixtureClasses: RetakeoverFixtureClass[];
  fixtureIds: string[];
  budget: RetakeoverRealismBudget;
  metrics: {
    fixtureCount: number;
    stableScoredFixtureCount: number;
    acceptedWithoutEditRate: number;
    editedDraftRate: number;
    deferredSpecDebtRate: number;
    featureOverclaimRiskRate: number;
    evidenceNoiseRate: number;
    averageTakeoverReadinessScore: number;
    lowestTakeoverReadinessScore: number;
  };
  correctionBudgetSatisfied: boolean;
  blockers: string[];
  ownerAction: {
    owner: string;
    nextCommand: string;
    sourceArtifact: string;
    reason: string;
  };
}

export interface RetakeoverRealismLadder {
  phase: "north-star-score-optimization-phase-6";
  ready: boolean;
  targetRealismClassCount: number;
  coveredRealismClassCount: number;
  missingRealismClasses: RetakeoverRealismClass[];
  classes: RetakeoverRealismClassEntry[];
  blockers: string[];
  scoreImpact: {
    dimension: "retakeover-quality";
    currentTarget: "9.5";
    evidence: string[];
  };
}

export interface RetakeoverPoolArtifactWriteResult {
  metricsPath: string;
  summaryPath: string;
}

export const RETAKEOVER_METRICS_RELATIVE_PATH = ".spec/handoffs/retakeover-metrics.json";
export const RETAKEOVER_SUMMARY_RELATIVE_PATH = ".spec/handoffs/retakeover-summary.md";
export const RETAKEOVER_POOL_METRICS_RELATIVE_PATH = ".spec/handoffs/retakeover-pool-metrics.json";
export const RETAKEOVER_POOL_SUMMARY_RELATIVE_PATH = ".spec/handoffs/retakeover-pool-summary.md";

const RETAKEOVER_FIXTURE_CLASS_CATALOG: RetakeoverFixtureClass[] = [
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

const RETAKEOVER_POOL_QUALITY_BASELINE_THRESHOLDS = {
  minimumTakeoverReadinessScore: 55,
  minimumContractSignalPrecision: 0.45,
  minimumBehaviorEvidenceStrength: 0.45,
} as const;

const RETAKEOVER_BENCHMARK_TARGETS = {
  fixtureCount: 10,
  classCoverageCount: RETAKEOVER_FIXTURE_CLASS_CATALOG.length,
} as const;

const RETAKEOVER_REALISM_CLASS_ORDER: RetakeoverRealismClass[] = [
  "simple_service",
  "monolith",
  "polyglot_service",
  "legacy_with_generated_noise",
  "weak_documentation",
];

const RETAKEOVER_REALISM_CLASS_FIXTURES: Record<RetakeoverRealismClass, RetakeoverFixtureClass[]> = {
  simple_service: [
    "docs-api-schema-scattered-repo",
    "frontend-backend-mixed-repo",
  ],
  monolith: [
    "historical-debt-service-repo",
    "synthetic-god-file-monolith",
  ],
  polyglot_service: [
    "multilingual-finance-service-repo",
    "multi-language-monorepo-repo",
  ],
  legacy_with_generated_noise: [
    "high-noise-protocol-repo",
    "synthetic-noise-heavy-hidden-signal",
  ],
  weak_documentation: [
    "synthetic-contract-drift",
    "synthetic-thin-behavior-evidence",
  ],
};

const RETAKEOVER_REALISM_BUDGETS: Record<RetakeoverRealismClass, RetakeoverRealismBudget> = {
  simple_service: {
    minimumFixtureCount: 1,
    minimumStableScoredFixtureCount: 1,
    minimumAcceptedWithoutEditRate: 0.75,
    maximumEditedDraftRate: 0.25,
    maximumDeferredSpecDebtRate: 0.25,
    maximumFeatureOverclaimRiskRate: 0,
    maximumEvidenceNoiseRate: 0.35,
    minimumTakeoverReadinessScore: 70,
  },
  monolith: {
    minimumFixtureCount: 1,
    minimumStableScoredFixtureCount: 1,
    minimumAcceptedWithoutEditRate: 0.5,
    maximumEditedDraftRate: 0.5,
    maximumDeferredSpecDebtRate: 0.5,
    maximumFeatureOverclaimRiskRate: 0.25,
    maximumEvidenceNoiseRate: 0.45,
    minimumTakeoverReadinessScore: 62,
  },
  polyglot_service: {
    minimumFixtureCount: 1,
    minimumStableScoredFixtureCount: 1,
    minimumAcceptedWithoutEditRate: 0.6,
    maximumEditedDraftRate: 0.4,
    maximumDeferredSpecDebtRate: 0.4,
    maximumFeatureOverclaimRiskRate: 0.25,
    maximumEvidenceNoiseRate: 0.4,
    minimumTakeoverReadinessScore: 65,
  },
  legacy_with_generated_noise: {
    minimumFixtureCount: 1,
    minimumStableScoredFixtureCount: 1,
    minimumAcceptedWithoutEditRate: 0.5,
    maximumEditedDraftRate: 0.5,
    maximumDeferredSpecDebtRate: 0.5,
    maximumFeatureOverclaimRiskRate: 0.25,
    maximumEvidenceNoiseRate: 0.5,
    minimumTakeoverReadinessScore: 60,
  },
  weak_documentation: {
    minimumFixtureCount: 1,
    minimumStableScoredFixtureCount: 1,
    minimumAcceptedWithoutEditRate: 0.4,
    maximumEditedDraftRate: 0.5,
    maximumDeferredSpecDebtRate: 0.75,
    maximumFeatureOverclaimRiskRate: 0.5,
    maximumEvidenceNoiseRate: 0.55,
    minimumTakeoverReadinessScore: 55,
  },
};

export function parseRetakeoverFeatureRecommendation(feature: string): RetakeoverFeatureRecommendation {
  if (feature.includes("# adoption_recommendation: accept_candidate")) {
    return "accept_candidate";
  }
  if (feature.includes("# adoption_recommendation: defer_as_spec_debt")) {
    return "defer_as_spec_debt";
  }
  return "unknown";
}

export function buildRetakeoverAdoptCorrectionMetrics(
  input: RetakeoverAdoptCorrectionInput,
): RetakeoverAdoptCorrectionMetrics {
  const editedArtifacts = uniqueSorted(input.editedArtifacts ?? []);
  const deferredArtifacts = uniqueSorted(input.deferredArtifacts);
  const rejectedArtifacts = uniqueSorted(input.rejectedArtifacts ?? []);
  const acceptedArtifacts = uniqueSorted([...input.acceptedArtifacts, ...editedArtifacts])
    .filter((artifact) => !deferredArtifacts.includes(artifact) && !rejectedArtifacts.includes(artifact));
  const artifactKinds = uniqueSorted([
    ...acceptedArtifacts,
    ...editedArtifacts,
    ...deferredArtifacts,
    ...rejectedArtifacts,
  ]);
  const artifactCorrectionLoad = artifactKinds.map((artifactKind): RetakeoverArtifactCorrectionLoad => {
    const decision = selectCorrectionDecision({
      artifactKind,
      acceptedArtifacts,
      editedArtifacts,
      deferredArtifacts,
      rejectedArtifacts,
    });
    return {
      artifactKind,
      decision,
      correctionLoad: correctionLoadForDecision(decision),
      needsOwnerDecision: decision !== "accepted",
      note: input.notes?.[artifactKind],
    };
  });
  const decisionCounts: RetakeoverAdoptCorrectionDecisionCounts = {
    accepted: artifactCorrectionLoad.filter((entry) => entry.decision === "accepted").length,
    edited: artifactCorrectionLoad.filter((entry) => entry.decision === "edited").length,
    deferred: artifactCorrectionLoad.filter((entry) => entry.decision === "deferred").length,
    rejected: artifactCorrectionLoad.filter((entry) => entry.decision === "rejected").length,
  };
  const correctionHotspots = uniqueSorted(
    artifactCorrectionLoad
      .filter((entry) => entry.decision !== "accepted")
      .flatMap((entry) => [`${entry.decision}_${entry.artifactKind}`, correctionFamilyHotspot(entry.decision)]),
  );

  return {
    acceptedArtifacts,
    editedArtifacts,
    deferredArtifacts,
    rejectedArtifacts,
    decisionCounts,
    artifactCorrectionLoad,
    correctionHotspots,
    ownerReviewArtifactCount: artifactCorrectionLoad.filter((entry) => entry.needsOwnerDecision).length,
  };
}

export function buildRetakeoverQualityScorecard(input: RetakeoverQualityScorecardInput): RetakeoverQualityScorecard {
  const rankedEvidence = input.rankedEvidence?.evidence ?? [];
  const topEvidence = rankedEvidence.slice(0, 10);
  const adoptCorrection = buildRetakeoverAdoptCorrectionMetrics({
    acceptedArtifacts: input.acceptedArtifacts,
    deferredArtifacts: input.deferredArtifacts,
    editedArtifacts: input.editedArtifacts,
    rejectedArtifacts: input.rejectedArtifacts,
  });
  const excludedCount = sanitizeCount(input.rankedEvidence?.excludedSummary?.totalExcludedFileCount);
  const candidateCount = Math.max(
    sanitizeCount(input.rankedEvidence?.summary?.candidateCount),
    sanitizeCount(input.rankedEvidence?.summary?.selectedCount),
    topEvidence.length,
  );
  const noiseSuppressionRate = excludedCount === 0
    ? 1
    : ratio(excludedCount, candidateCount + excludedCount);
  const strongTopEvidenceCount = topEvidence.filter(isStrongTakeoverSignal).length;
  const topEvidenceSignalRate = topEvidence.length > 0 ? ratio(strongTopEvidenceCount, topEvidence.length) : 0;
  const strongEvidenceCount = rankedEvidence.filter(isStrongTakeoverSignal).length;
  const contractSignalPrecision = rankedEvidence.length > 0 ? ratio(strongEvidenceCount, rankedEvidence.length) : 0;
  const artifactDecisionCount = adoptCorrection.artifactCorrectionLoad.length;
  const adoptCorrectionLoad = artifactDecisionCount > 0
    ? ratio(
        adoptCorrection.artifactCorrectionLoad.reduce((sum, entry) => sum + entry.correctionLoad, 0),
        artifactDecisionCount,
      )
    : 0;
  const featureOverclaimRisk = classifyFeatureOverclaimRisk(input);
  const featureStats = summarizeFeatureEvidence(input.featureContent ?? "");
  const behaviorEvidenceStrength = calculateBehaviorEvidenceStrength(input.featureRecommendation, featureStats);
  const overclaimBlockRate = calculateOverclaimBlockRate(input, featureStats);
  const adoptionReadyArtifactCount = calculateAdoptionReadyArtifactCount(input, featureOverclaimRisk);
  const humanCorrectionHotspots = buildHumanCorrectionHotspots({
    topEvidenceSignalRate,
    contractSignalPrecision,
    adoptCorrectionLoad,
    featureOverclaimRisk,
    featureStats,
    verifyOk: input.verifyOk,
    deferredArtifacts: adoptCorrection.deferredArtifacts,
    editedArtifacts: adoptCorrection.editedArtifacts,
    rejectedArtifacts: adoptCorrection.rejectedArtifacts,
    correctionHotspots: adoptCorrection.correctionHotspots,
  });
  const needsOwnerDecisionCount = calculateNeedsOwnerDecisionCount({
    ownerReviewArtifactCount: adoptCorrection.ownerReviewArtifactCount,
    featureOverclaimRisk,
    featureStats,
    verifyOk: input.verifyOk,
  });
  const verifySafety: RetakeoverVerifySafety = input.verifyOk ? "non_blocking" : "blocking";
  const takeoverReadinessScore = calculateTakeoverReadinessScore({
    noiseSuppressionRate,
    topEvidenceSignalRate,
    adoptCorrectionLoad,
    featureOverclaimRisk,
    verifySafety,
  });
  const riskNotes = buildRiskNotes({
    noiseSuppressionRate,
    topEvidenceSignalRate,
    adoptCorrectionLoad,
    featureOverclaimRisk,
    verifySafety,
  });
  const nextAction = selectNextAction({
    verifySafety,
    adoptCorrectionLoad,
    featureOverclaimRisk,
  });

  return {
    noiseSuppressionRate,
    topEvidenceSignalRate,
    contractSignalPrecision,
    behaviorEvidenceStrength,
    adoptCorrectionLoad,
    humanCorrectionHotspots,
    overclaimBlockRate,
    adoptionReadyArtifactCount,
    needsOwnerDecisionCount,
    featureOverclaimRisk,
    verifySafety,
    takeoverReadinessScore,
    riskNotes,
    nextAction,
  };
}

export function writeRetakeoverArtifacts(rootInput: string, metrics: RetakeoverMetrics): RetakeoverArtifactWriteResult {
  const root = path.resolve(rootInput);
  const metricsPath = path.join(root, RETAKEOVER_METRICS_RELATIVE_PATH);
  const summaryPath = path.join(root, RETAKEOVER_SUMMARY_RELATIVE_PATH);

  fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2), "utf-8");
  fs.writeFileSync(summaryPath, renderRetakeoverSummaryMarkdown(metrics), "utf-8");

  return { metricsPath, summaryPath };
}

export function buildRetakeoverPoolMetrics(fixtures: RetakeoverMetrics[]): RetakeoverPoolMetrics {
  const featureRecommendations: Record<RetakeoverFeatureRecommendation, number> = {
    accept_candidate: 0,
    defer_as_spec_debt: 0,
    unknown: 0,
  };
  const verdicts: Record<string, number> = {};
  const featureOverclaimRisk: Record<RetakeoverFeatureOverclaimRisk, number> = {
    low: 0,
    medium: 0,
    high: 0,
  };

  for (const fixture of fixtures) {
    featureRecommendations[fixture.draftQuality.featureRecommendation] += 1;
    verdicts[fixture.verifyVerdict] = (verdicts[fixture.verifyVerdict] ?? 0) + 1;
    featureOverclaimRisk[fixture.qualityScorecard.featureOverclaimRisk] += 1;
  }
  const readinessScores = fixtures.map((fixture) => fixture.qualityScorecard.takeoverReadinessScore);
  const contractSignalPrecisions = fixtures.map((fixture) => fixture.qualityScorecard.contractSignalPrecision);
  const behaviorEvidenceStrengths = fixtures.map((fixture) => fixture.qualityScorecard.behaviorEvidenceStrength);
  const overclaimBlockRates = fixtures.map((fixture) => fixture.qualityScorecard.overclaimBlockRate);
  const correctionHotspotCounts = countCorrectionHotspots(fixtures);
  const classCounts = countFixtureClasses(fixtures);
  const coveredFixtureClasses = RETAKEOVER_FIXTURE_CLASS_CATALOG.filter((fixtureClass) => classCounts[fixtureClass] > 0);
  const fixtureCatalog = fixtures.map(buildPoolFixtureCatalogEntry);
  const qualityBaseline = {
    thresholds: {
      minimumTakeoverReadinessScore: RETAKEOVER_POOL_QUALITY_BASELINE_THRESHOLDS.minimumTakeoverReadinessScore,
      minimumContractSignalPrecision: RETAKEOVER_POOL_QUALITY_BASELINE_THRESHOLDS.minimumContractSignalPrecision,
      minimumBehaviorEvidenceStrength: RETAKEOVER_POOL_QUALITY_BASELINE_THRESHOLDS.minimumBehaviorEvidenceStrength,
    },
    readinessScore: buildPoolBaselineMetric(
      fixtures,
      RETAKEOVER_POOL_QUALITY_BASELINE_THRESHOLDS.minimumTakeoverReadinessScore,
      (fixture) => fixture.qualityScorecard.takeoverReadinessScore,
    ),
    contractSignalPrecision: buildPoolBaselineMetric(
      fixtures,
      RETAKEOVER_POOL_QUALITY_BASELINE_THRESHOLDS.minimumContractSignalPrecision,
      (fixture) => fixture.qualityScorecard.contractSignalPrecision,
    ),
    behaviorEvidenceStrength: buildPoolBaselineMetric(
      fixtures,
      RETAKEOVER_POOL_QUALITY_BASELINE_THRESHOLDS.minimumBehaviorEvidenceStrength,
      (fixture) => fixture.qualityScorecard.behaviorEvidenceStrength,
    ),
    verifyNonBlockingRate: ratio(fixtures.filter((fixture) => fixture.verifyOk).length, fixtures.length),
    ownerReviewFixtureRate: ratio(
      fixtures.filter((fixture) =>
        fixture.qualityScorecard.nextAction === "owner_review_spec_debt" ||
        fixture.qualityScorecard.featureOverclaimRisk !== "low" ||
        fixture.adoptCorrection.ownerReviewArtifactCount > 0
      ).length,
      fixtures.length,
    ),
  };
  const classCoverage = {
    knownFixtureClassCount: RETAKEOVER_FIXTURE_CLASS_CATALOG.length,
    coveredFixtureClassCount: coveredFixtureClasses.length,
    coverageRate: ratio(coveredFixtureClasses.length, RETAKEOVER_FIXTURE_CLASS_CATALOG.length),
    classCounts,
    missingFixtureClasses: RETAKEOVER_FIXTURE_CLASS_CATALOG.filter((fixtureClass) => classCounts[fixtureClass] === 0),
  };
  const benchmarkReadiness = buildRetakeoverBenchmarkReadiness(fixtures, classCoverage, qualityBaseline);
  const realismLadder = buildRetakeoverRealismLadder(fixtures);

  return {
    version: 1,
    fixtureCount: fixtures.length,
    fixtureClasses: Array.from(new Set(fixtures.map((fixture) => fixture.fixtureClass))).sort(),
    verify: {
      okCount: fixtures.filter((fixture) => fixture.verifyOk).length,
      blockingCount: fixtures.filter((fixture) => !fixture.verifyOk).length,
      verdicts,
    },
    draftQuality: {
      totalDomainContextCount: fixtures.reduce((sum, fixture) => sum + fixture.draftQuality.domainContextCount, 0),
      totalAggregateRootCount: fixtures.reduce((sum, fixture) => sum + fixture.draftQuality.aggregateRootCount, 0),
      totalApiSurfaceCount: fixtures.reduce((sum, fixture) => sum + fixture.draftQuality.apiSurfaceCount, 0),
      featureRecommendations,
    },
    adoptCorrection: {
      fixturesWithDeferredArtifacts: fixtures
        .filter((fixture) => fixture.adoptCorrection.deferredArtifacts.length > 0)
        .map((fixture) => fixture.fixtureId),
      fixturesWithEditedArtifacts: fixtures
        .filter((fixture) => fixture.adoptCorrection.editedArtifacts.length > 0)
        .map((fixture) => fixture.fixtureId),
      fixturesWithRejectedArtifacts: fixtures
        .filter((fixture) => fixture.adoptCorrection.rejectedArtifacts.length > 0)
        .map((fixture) => fixture.fixtureId),
      deferredArtifactCount: fixtures.reduce((sum, fixture) => sum + fixture.adoptCorrection.deferredArtifacts.length, 0),
      editedArtifactCount: fixtures.reduce((sum, fixture) => sum + fixture.adoptCorrection.editedArtifacts.length, 0),
      rejectedArtifactCount: fixtures.reduce((sum, fixture) => sum + fixture.adoptCorrection.rejectedArtifacts.length, 0),
      totalCorrectionLoad: Number(fixtures
        .reduce(
          (sum, fixture) =>
            sum + fixture.adoptCorrection.artifactCorrectionLoad.reduce((fixtureSum, entry) => fixtureSum + entry.correctionLoad, 0),
          0,
        )
        .toFixed(2)),
      ownerReviewArtifactCount: fixtures.reduce((sum, fixture) => sum + fixture.adoptCorrection.ownerReviewArtifactCount, 0),
      topCorrectionHotspots: correctionHotspotCounts
        .slice(0, 8)
        .map(([hotspot, count]) => `${hotspot}:${count}`),
    },
    qualityScorecard: {
      averageTakeoverReadinessScore: average(readinessScores),
      lowestReadinessScore: readinessScores.length > 0 ? Math.min(...readinessScores) : 0,
      averageContractSignalPrecision: average(contractSignalPrecisions),
      averageBehaviorEvidenceStrength: average(behaviorEvidenceStrengths),
      averageOverclaimBlockRate: average(overclaimBlockRates),
      totalAdoptionReadyArtifactCount: fixtures.reduce((sum, fixture) => sum + fixture.qualityScorecard.adoptionReadyArtifactCount, 0),
      totalNeedsOwnerDecisionCount: fixtures.reduce((sum, fixture) => sum + fixture.qualityScorecard.needsOwnerDecisionCount, 0),
      fixturesWithHumanCorrectionHotspots: fixtures
        .filter((fixture) => fixture.qualityScorecard.humanCorrectionHotspots.length > 0)
        .map((fixture) => fixture.fixtureId),
      fixturesNeedingOwnerReview: fixtures
        .filter((fixture) =>
          fixture.qualityScorecard.nextAction === "owner_review_spec_debt" ||
          fixture.qualityScorecard.featureOverclaimRisk !== "low" ||
          fixture.adoptCorrection.ownerReviewArtifactCount > 0,
        )
        .map((fixture) => fixture.fixtureId),
      fixturesWithBlockingVerify: fixtures
        .filter((fixture) => fixture.qualityScorecard.verifySafety === "blocking")
        .map((fixture) => fixture.fixtureId),
      featureOverclaimRisk,
    },
    coverage: {
      fixtureCatalog,
      classCoverage,
      qualityBaseline,
      benchmarkReadiness,
      realismLadder,
    },
    fixtures,
  };
}

export function writeRetakeoverPoolArtifacts(
  rootInput: string,
  fixtures: RetakeoverMetrics[],
): RetakeoverPoolArtifactWriteResult {
  const root = path.resolve(rootInput);
  const poolMetrics = buildRetakeoverPoolMetrics(fixtures);
  const metricsPath = path.join(root, RETAKEOVER_POOL_METRICS_RELATIVE_PATH);
  const summaryPath = path.join(root, RETAKEOVER_POOL_SUMMARY_RELATIVE_PATH);

  fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
  fs.writeFileSync(metricsPath, JSON.stringify(poolMetrics, null, 2), "utf-8");
  fs.writeFileSync(summaryPath, renderRetakeoverPoolSummaryMarkdown(poolMetrics), "utf-8");

  return { metricsPath, summaryPath };
}

export function renderRetakeoverSummaryMarkdown(metrics: RetakeoverMetrics): string {
  const lines = [
    "# JiSpec Retakeover Summary",
    "",
    `Fixture: \`${metrics.fixtureId}\``,
    `Fixture class: \`${metrics.fixtureClass}\``,
    `Verify verdict: \`${metrics.verifyVerdict}\``,
    `Merge status: ${metrics.verifyOk ? "Retakeover is non-blocking." : "Retakeover is blocked until verify issues are resolved."}`,
    "",
    "## Decision",
    "",
    `- ${renderRiskDecision(metrics)}`,
    `- Draft quality: ${renderDraftQuality(metrics)}.`,
    `- Adopt correction: ${renderAdoptCorrection(metrics)}.`,
    `- Next action: \`${metrics.qualityScorecard.nextAction}\`.`,
    "",
    "## Adopt Correction Loop",
    "",
    `- Decision counts: ${renderCorrectionDecisionCounts(metrics.adoptCorrection.decisionCounts)}.`,
    `- Correction load: ${formatPercent(metrics.qualityScorecard.adoptCorrectionLoad)} across ${metrics.adoptCorrection.artifactCorrectionLoad.length} artifact decision(s).`,
    `- Owner-review artifacts: ${metrics.adoptCorrection.ownerReviewArtifactCount}.`,
    `- Correction hotspots: ${renderHotspots(metrics.adoptCorrection.correctionHotspots)}.`,
    "",
    "| Artifact | Decision | Load | Owner Review | Note |",
    "| --- | --- | --- | --- | --- |",
    ...renderArtifactCorrectionRows(metrics.adoptCorrection),
    "",
    "## Quality Scorecard",
    "",
    "| Signal | Value | Review Meaning |",
    "| --- | --- | --- |",
    ...renderFixtureScorecardRows(metrics),
    "",
    "### Risk Notes",
    "",
    ...renderRiskNoteBullets(metrics.qualityScorecard.riskNotes),
    "",
    "## Discover Ranking",
    "",
    `- Discover summary: ${renderDiscoverSummary(metrics.discoverSummary)}.`,
    ...renderTopRankedEvidence(metrics.topRankedEvidence),
    "",
    "## Review Questions",
    "",
    "- Does top ranked evidence come from product assets instead of noise?",
    "- Are domain, aggregate, API, and behavior drafts strong enough for human review?",
    "- Did adopt decisions clearly separate accepted contracts from deferred spec debt?",
    "- Is verify non-blocking after takeover?",
    "",
    "## Source Of Truth",
    "",
    `- Machine-readable metrics remain the source of truth: \`${RETAKEOVER_METRICS_RELATIVE_PATH}\`.`,
    "- This Markdown file is a human-readable companion summary, not a machine API.",
    "",
  ];

  return `${lines.join("\n")}\n`;
}

export function renderRetakeoverPoolSummaryMarkdown(pool: RetakeoverPoolMetrics): string {
  const classCoverage = pool.coverage.classCoverage;
  const qualityBaseline = pool.coverage.qualityBaseline;
  const lines = [
    "# JiSpec Retakeover Pool Summary",
    "",
    `Fixture count: ${pool.fixtureCount}`,
    `Fixture classes: ${pool.fixtureClasses.map((fixtureClass) => `\`${fixtureClass}\``).join(", ") || "none"}`,
    `Verify status: ${pool.verify.blockingCount === 0 ? "All fixtures are non-blocking." : `${pool.verify.blockingCount} fixture(s) are blocking.`}`,
    "",
    "## Decision",
    "",
    `- ${renderPoolDecision(pool)}`,
    `- Draft totals: ${pool.draftQuality.totalDomainContextCount} domain context(s), ${pool.draftQuality.totalAggregateRootCount} aggregate root(s), ${pool.draftQuality.totalApiSurfaceCount} API surface(s).`,
    `- Feature recommendations: ${renderFeatureRecommendationCounts(pool.draftQuality.featureRecommendations)}.`,
    `- Deferred artifacts: ${pool.adoptCorrection.deferredArtifactCount} across ${pool.adoptCorrection.fixturesWithDeferredArtifacts.length} fixture(s).`,
    `- Correction loop: edited=${pool.adoptCorrection.editedArtifactCount}, deferred=${pool.adoptCorrection.deferredArtifactCount}, rejected=${pool.adoptCorrection.rejectedArtifactCount}, total load=${pool.adoptCorrection.totalCorrectionLoad}, owner-review artifacts=${pool.adoptCorrection.ownerReviewArtifactCount}.`,
    `- Top correction hotspots: ${pool.adoptCorrection.topCorrectionHotspots.map((hotspot) => `\`${hotspot}\``).join(", ") || "none"}.`,
    `- Average takeover readiness score: ${pool.qualityScorecard.averageTakeoverReadinessScore}/100; lowest score: ${pool.qualityScorecard.lowestReadinessScore}/100.`,
    `- V2 signal averages: contract precision=${formatPercent(pool.qualityScorecard.averageContractSignalPrecision)}, behavior strength=${formatPercent(pool.qualityScorecard.averageBehaviorEvidenceStrength)}, overclaim blocked=${formatPercent(pool.qualityScorecard.averageOverclaimBlockRate)}.`,
    `- V2 decision load: adoption-ready artifacts=${pool.qualityScorecard.totalAdoptionReadyArtifactCount}, owner decision count=${pool.qualityScorecard.totalNeedsOwnerDecisionCount}, hotspot fixtures=${pool.qualityScorecard.fixturesWithHumanCorrectionHotspots.length}.`,
    `- Feature overclaim risk: low=${pool.qualityScorecard.featureOverclaimRisk.low}, medium=${pool.qualityScorecard.featureOverclaimRisk.medium}, high=${pool.qualityScorecard.featureOverclaimRisk.high}.`,
    `- Owner-review fixtures: ${pool.qualityScorecard.fixturesNeedingOwnerReview.map((fixture) => `\`${fixture}\``).join(", ") || "none"}.`,
    `- Class coverage: ${classCoverage.coveredFixtureClassCount}/${classCoverage.knownFixtureClassCount} fixture classes (${formatPercent(classCoverage.coverageRate)}); missing classes: ${classCoverage.missingFixtureClasses.map((fixtureClass) => `\`${fixtureClass}\``).join(", ") || "none"}.`,
    `- Quality baseline: readiness floor=${qualityBaseline.readinessScore.threshold}/100 misses=${renderFixtureIdList(qualityBaseline.readinessScore.fixturesBelowThreshold)}; contract precision floor=${formatPercent(qualityBaseline.contractSignalPrecision.threshold)} misses=${renderFixtureIdList(qualityBaseline.contractSignalPrecision.fixturesBelowThreshold)}; behavior strength floor=${formatPercent(qualityBaseline.behaviorEvidenceStrength.threshold)} misses=${renderFixtureIdList(qualityBaseline.behaviorEvidenceStrength.fixturesBelowThreshold)}.`,
    `- Coverage rates: verify non-blocking=${formatPercent(qualityBaseline.verifyNonBlockingRate)}, owner-review path=${formatPercent(qualityBaseline.ownerReviewFixtureRate)}.`,
    `- Benchmark readiness: ${pool.coverage.benchmarkReadiness.ready ? "ready" : "not ready"}; stable scored fixtures=${pool.coverage.benchmarkReadiness.stableScoredFixtureCount}/${pool.coverage.benchmarkReadiness.targetFixtureCount}; blockers=${pool.coverage.benchmarkReadiness.blockers.length > 0 ? pool.coverage.benchmarkReadiness.blockers.map((blocker) => `\`${blocker}\``).join(", ") : "none"}.`,
    `- Realism ladder: ${pool.coverage.realismLadder.ready ? "ready" : "not ready"}; covered classes=${pool.coverage.realismLadder.coveredRealismClassCount}/${pool.coverage.realismLadder.targetRealismClassCount}; blockers=${pool.coverage.realismLadder.blockers.length > 0 ? pool.coverage.realismLadder.blockers.map((blocker) => `\`${blocker}\``).join(", ") : "none"}.`,
    "",
    "## Coverage",
    "",
    `- Fixture catalog entries: ${pool.coverage.fixtureCatalog.length}.`,
    `- Missing fixture classes: ${classCoverage.missingFixtureClasses.map((fixtureClass) => `\`${fixtureClass}\``).join(", ") || "none"}.`,
    `- Baseline misses: readiness=${renderFixtureIdList(qualityBaseline.readinessScore.fixturesBelowThreshold)}, contract precision=${renderFixtureIdList(qualityBaseline.contractSignalPrecision.fixturesBelowThreshold)}, behavior strength=${renderFixtureIdList(qualityBaseline.behaviorEvidenceStrength.fixturesBelowThreshold)}.`,
    `- Benchmark phase: \`${pool.coverage.benchmarkReadiness.phase}\`.`,
    `- Benchmark score impact: ${pool.coverage.benchmarkReadiness.scoreImpact.dimension} target ${pool.coverage.benchmarkReadiness.scoreImpact.currentTarget}.`,
    "",
    "## Realism Ladder",
    "",
    `- Phase: \`${pool.coverage.realismLadder.phase}\`.`,
    `- Readiness: ${pool.coverage.realismLadder.ready ? "ready" : "not ready"}.`,
    `- Missing realism classes: ${pool.coverage.realismLadder.missingRealismClasses.map((realismClass) => `\`${realismClass}\``).join(", ") || "none"}.`,
    `- Score impact: ${pool.coverage.realismLadder.scoreImpact.dimension} target ${pool.coverage.realismLadder.scoreImpact.currentTarget}; takeover quality realism evidence is tracked per class.`,
    "",
    "| Realism Class | Fixtures | Budget Status | Metrics | Owner Action |",
    "| --- | --- | --- | --- | --- |",
    ...pool.coverage.realismLadder.classes.map(renderRealismLadderRow),
    "",
    "| Fixture | Class | Coverage Signals | Decision Paths | Baseline Profile | Top Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...pool.coverage.fixtureCatalog.map(renderPoolCoverageRow),
    "",
    "## Quality Scorecard",
    "",
    "| Fixture | Score | Verify Safety | Feature Risk | Deferred | Next Action | Risk Notes |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...pool.fixtures.map(renderPoolScorecardRow),
    "",
    "## Quality Scorecard V2",
    "",
    "| Fixture | Contract Precision | Behavior Strength | Overclaim Blocked | Adoption Ready | Owner Decisions | Hotspots |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...pool.fixtures.map(renderPoolScorecardV2Row),
    "",
    "## Correction Loop",
    "",
    "| Fixture | Accepted | Edited | Deferred | Rejected | Load | Hotspots |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...pool.fixtures.map(renderPoolCorrectionRow),
    "",
    "## Fixture Matrix",
    "",
    "| Fixture | Class | Verify | Feature | Deferred | Readiness | Risk | Top Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...pool.fixtures.map(renderPoolFixtureRow),
    "",
    "## Coverage Questions",
    "",
    "- Does the pool still cover high-noise, multilingual service, and scattered contract repository shapes?",
    "- Are all fixture takeovers non-blocking after adopt and verify?",
    "- Which fixtures need owner review because behavior evidence was deferred or weak?",
    "- Are top ranked evidence paths product assets instead of noise?",
    "",
    "## Source Of Truth",
    "",
    `- Machine-readable pool metrics remain the source of truth: \`${RETAKEOVER_POOL_METRICS_RELATIVE_PATH}\`.`,
    "- This Markdown file is a human-readable companion summary, not a machine API.",
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function renderRiskDecision(metrics: RetakeoverMetrics): string {
  if (!metrics.verifyOk) {
    return "Retakeover needs follow-up because verify is blocking.";
  }
  if (metrics.adoptCorrection.deferredArtifacts.length > 0) {
    return "Retakeover can proceed with explicit spec debt follow-up.";
  }
  if (metrics.adoptCorrection.ownerReviewArtifactCount > 0) {
    return "Retakeover can proceed with explicit human correction follow-up.";
  }
  if (metrics.draftQuality.featureRecommendation === "defer_as_spec_debt") {
    return "Retakeover can proceed, but behavior evidence should stay owner-reviewed.";
  }
  return "Retakeover can proceed as an initial adopted contract packet.";
}

function renderPoolDecision(pool: RetakeoverPoolMetrics): string {
  if (pool.verify.blockingCount > 0) {
    return "Retakeover pool needs follow-up because at least one fixture is blocking.";
  }
  if (pool.adoptCorrection.ownerReviewArtifactCount > 0 || pool.draftQuality.featureRecommendations.defer_as_spec_debt > 0) {
    return "Retakeover pool is non-blocking, with explicit owner-review, human correction, or spec-debt follow-up.";
  }
  return "Retakeover pool is non-blocking and all fixture packets are adoptable as initial contracts.";
}

function renderPoolCoverageRow(entry: RetakeoverPoolFixtureCatalogEntry): string {
  const baseline = [
    `score=${entry.baselineProfile.takeoverReadinessScore}/100`,
    `contract=${formatPercent(entry.baselineProfile.contractSignalPrecision)}`,
    `behavior=${formatPercent(entry.baselineProfile.behaviorEvidenceStrength)}`,
    `blocked=${formatPercent(entry.baselineProfile.overclaimBlockRate)}`,
  ].join(", ");

  return [
    `\`${entry.fixtureId}\``,
    `\`${entry.fixtureClass}\``,
    escapeTableCell(entry.coverageSignals.map((signal) => `\`${signal}\``).join(", ")),
    escapeTableCell(entry.artifactDecisionPaths.map((artifactPath) => `\`${artifactPath}\``).join(", ")),
    escapeTableCell(baseline),
    escapeTableCell(entry.topEvidenceSample.map((evidencePath) => `\`${evidencePath}\``).join(", ")),
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
}

function renderRealismLadderRow(entry: RetakeoverRealismClassEntry): string {
  const metrics = [
    `accepted=${formatPercent(entry.metrics.acceptedWithoutEditRate)}`,
    `edited=${formatPercent(entry.metrics.editedDraftRate)}`,
    `deferred=${formatPercent(entry.metrics.deferredSpecDebtRate)}`,
    `overclaim=${formatPercent(entry.metrics.featureOverclaimRiskRate)}`,
    `noise=${formatPercent(entry.metrics.evidenceNoiseRate)}`,
    `lowest=${entry.metrics.lowestTakeoverReadinessScore}/100`,
  ].join(", ");
  const ownerAction = [
    entry.ownerAction.owner,
    entry.ownerAction.nextCommand,
    entry.ownerAction.reason,
  ].join("; ");

  return [
    `\`${entry.realismClass}\``,
    escapeTableCell(entry.fixtureIds.map((fixtureId) => `\`${fixtureId}\``).join(", ") || "none"),
    entry.correctionBudgetSatisfied
      ? "satisfied"
      : escapeTableCell(entry.blockers.map((blocker) => `\`${blocker}\``).join(", ")),
    escapeTableCell(metrics),
    escapeTableCell(ownerAction),
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
}

function renderFeatureRecommendationCounts(counts: Record<RetakeoverFeatureRecommendation, number>): string {
  return [
    `accept_candidate=${counts.accept_candidate}`,
    `defer_as_spec_debt=${counts.defer_as_spec_debt}`,
    `unknown=${counts.unknown}`,
  ].join(", ");
}

function renderPoolFixtureRow(fixture: RetakeoverMetrics): string {
  const deferred = fixture.adoptCorrection.deferredArtifacts.length > 0
    ? fixture.adoptCorrection.deferredArtifacts.join(", ")
    : "none";
  const topEvidence = fixture.topRankedEvidence.slice(0, 3).map(escapeTableCell).join("<br>");
  return [
    `\`${fixture.fixtureId}\``,
    `\`${fixture.fixtureClass}\``,
    `\`${fixture.verifyVerdict}\`${fixture.verifyOk ? "" : " blocking"}`,
    `\`${fixture.draftQuality.featureRecommendation}\``,
    escapeTableCell(deferred),
    `${fixture.qualityScorecard.takeoverReadinessScore}/100`,
    `\`${fixture.qualityScorecard.featureOverclaimRisk}\``,
    topEvidence,
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
}

function renderFixtureScorecardRows(metrics: RetakeoverMetrics): string[] {
  const scorecard = metrics.qualityScorecard;
  return [
    renderScorecardRow("Takeover readiness", `${scorecard.takeoverReadinessScore}/100`, "Conservative aggregate score for trend review, not a standalone gate."),
    renderScorecardRow("Verify safety", `\`${scorecard.verifySafety}\``, scorecard.verifySafety === "non_blocking" ? "Adopted and deferred output does not block verify." : "Verify is blocking and must be fixed before merge."),
    renderScorecardRow("Top evidence signal", formatPercent(scorecard.topEvidenceSignalRate), "Share of top ranked evidence carrying strong boundary or contract signal."),
    renderScorecardRow("Contract signal precision", formatPercent(scorecard.contractSignalPrecision), "Share of ranked takeover evidence backed by strong deterministic contract or boundary signal."),
    renderScorecardRow("Behavior evidence strength", formatPercent(scorecard.behaviorEvidenceStrength), "Share of behavior scenarios that are strong enough to avoid owner-review fallback."),
    renderScorecardRow("Noise suppression", formatPercent(scorecard.noiseSuppressionRate), "How much noisy inventory pressure was excluded or absent from this fixture."),
    renderScorecardRow("Adopt correction load", formatPercent(scorecard.adoptCorrectionLoad), "Weighted share of artifact decisions that required edit, defer, or reject correction."),
    renderScorecardRow("Overclaim block rate", formatPercent(scorecard.overclaimBlockRate), "Whether weak behavior evidence was blocked or deferred instead of being adopted as ready."),
    renderScorecardRow("Adoption-ready artifacts", String(scorecard.adoptionReadyArtifactCount), "Artifact count that can be treated as review-ready after conservative overclaim adjustment."),
    renderScorecardRow("Owner decision count", String(scorecard.needsOwnerDecisionCount), "How many explicit owner decisions remain after takeover."),
    renderScorecardRow("Human correction hotspots", renderHotspots(scorecard.humanCorrectionHotspots), "Where reviewer correction should focus before broader adoption."),
    renderScorecardRow("Feature overclaim risk", `\`${scorecard.featureOverclaimRisk}\``, "Risk that weak behavior evidence was treated as contract-ready."),
    renderScorecardRow("Next action", `\`${scorecard.nextAction}\``, renderNextActionMeaning(scorecard.nextAction)),
  ];
}

function renderScorecardRow(signal: string, value: string, meaning: string): string {
  return [
    escapeTableCell(signal),
    value,
    escapeTableCell(meaning),
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
}

function renderPoolScorecardRow(fixture: RetakeoverMetrics): string {
  const deferred = fixture.adoptCorrection.deferredArtifacts.length > 0
    ? fixture.adoptCorrection.deferredArtifacts.join(", ")
    : "none";
  return [
    `\`${fixture.fixtureId}\``,
    `${fixture.qualityScorecard.takeoverReadinessScore}/100`,
    `\`${fixture.qualityScorecard.verifySafety}\``,
    `\`${fixture.qualityScorecard.featureOverclaimRisk}\``,
    escapeTableCell(deferred),
    `\`${fixture.qualityScorecard.nextAction}\``,
    escapeTableCell(fixture.qualityScorecard.riskNotes.join("; ")),
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
}

function renderPoolScorecardV2Row(fixture: RetakeoverMetrics): string {
  const scorecard = fixture.qualityScorecard;
  return [
    `\`${fixture.fixtureId}\``,
    formatPercent(scorecard.contractSignalPrecision),
    formatPercent(scorecard.behaviorEvidenceStrength),
    formatPercent(scorecard.overclaimBlockRate),
    String(scorecard.adoptionReadyArtifactCount),
    String(scorecard.needsOwnerDecisionCount),
    renderHotspots(scorecard.humanCorrectionHotspots),
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
}

function renderPoolCorrectionRow(fixture: RetakeoverMetrics): string {
  const correction = fixture.adoptCorrection;
  const decisionCount = correction.artifactCorrectionLoad.length;
  const load = decisionCount > 0
    ? formatPercent(correction.artifactCorrectionLoad.reduce((sum, entry) => sum + entry.correctionLoad, 0) / decisionCount)
    : "0%";
  return [
    `\`${fixture.fixtureId}\``,
    renderArtifactList(correction.acceptedArtifacts),
    renderArtifactList(correction.editedArtifacts),
    renderArtifactList(correction.deferredArtifacts),
    renderArtifactList(correction.rejectedArtifacts),
    load,
    renderHotspots(correction.correctionHotspots),
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
}

function renderNextActionMeaning(nextAction: RetakeoverNextAction): string {
  if (nextAction === "fix_blocking_verify") {
    return "Resolve deterministic verify issues before treating this takeover as mergeable.";
  }
  if (nextAction === "owner_review_spec_debt") {
    return "Proceed with explicit owner review or spec debt follow-up.";
  }
  return "Review packet is suitable as an initial adopted contract packet.";
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function renderHotspots(hotspots: string[]): string {
  return hotspots.length > 0 ? escapeTableCell(hotspots.map((hotspot) => `\`${hotspot}\``).join(", ")) : "none";
}

function renderDraftQuality(metrics: RetakeoverMetrics): string {
  const quality = metrics.draftQuality;
  return [
    `${quality.domainContextCount} domain context(s)`,
    `${quality.aggregateRootCount} aggregate root(s)`,
    `${quality.apiSurfaceCount} API surface(s)`,
    `feature recommendation \`${quality.featureRecommendation}\``,
  ].join(", ");
}

function renderAdoptCorrection(metrics: RetakeoverMetrics): string {
  const accepted = renderArtifactList(metrics.adoptCorrection.acceptedArtifacts);
  const edited = renderArtifactList(metrics.adoptCorrection.editedArtifacts);
  const deferred = renderArtifactList(metrics.adoptCorrection.deferredArtifacts);
  const rejected = renderArtifactList(metrics.adoptCorrection.rejectedArtifacts);

  return `accepted ${accepted}; edited ${edited}; deferred ${deferred}; rejected ${rejected}`;
}

function renderArtifactList(artifacts: string[]): string {
  return artifacts.length > 0 ? artifacts.map((artifact) => `\`${artifact}\``).join(", ") : "none";
}

function renderCorrectionDecisionCounts(counts: RetakeoverAdoptCorrectionDecisionCounts): string {
  return [
    `accepted=${counts.accepted}`,
    `edited=${counts.edited}`,
    `deferred=${counts.deferred}`,
    `rejected=${counts.rejected}`,
  ].join(", ");
}

function renderArtifactCorrectionRows(correction: RetakeoverAdoptCorrectionMetrics): string[] {
  if (correction.artifactCorrectionLoad.length === 0) {
    return ["| none | none | 0% | no | none |"];
  }

  return correction.artifactCorrectionLoad.map((entry) =>
    [
      `\`${entry.artifactKind}\``,
      `\`${entry.decision}\``,
      formatPercent(entry.correctionLoad),
      entry.needsOwnerDecision ? "yes" : "no",
      escapeTableCell(entry.note ?? "none"),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
  );
}

function renderDiscoverSummary(summary: Record<string, unknown>): string {
  const preferredKeys = [
    "selectedCount",
    "documentCount",
    "schemaCount",
    "routeCount",
    "sourceFileCount",
    "excludedFileCount",
    "totalExcludedFileCount",
  ];
  const fragments = preferredKeys
    .filter((key) => typeof summary[key] === "number")
    .map((key) => `${key}=${summary[key]}`);

  return fragments.length > 0 ? fragments.join(", ") : "no numeric discover counters available";
}

function renderTopRankedEvidence(topRankedEvidence: string[]): string[] {
  if (topRankedEvidence.length === 0) {
    return ["- Top ranked evidence: none."];
  }

  return [
    "- Top ranked evidence:",
    ...topRankedEvidence.slice(0, 10).map((evidence, index) => `  ${index + 1}. \`${evidence}\``),
  ];
}

function renderFixtureIdList(fixtureIds: string[]): string {
  return fixtureIds.length > 0 ? fixtureIds.map((fixtureId) => `\`${fixtureId}\``).join(", ") : "none";
}

function sanitizeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Number(Math.max(0, Math.min(1, numerator / denominator)).toFixed(4));
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) => left.localeCompare(right));
}

function selectCorrectionDecision(input: {
  artifactKind: string;
  acceptedArtifacts: string[];
  editedArtifacts: string[];
  deferredArtifacts: string[];
  rejectedArtifacts: string[];
}): RetakeoverAdoptCorrectionDecision {
  if (input.rejectedArtifacts.includes(input.artifactKind)) {
    return "rejected";
  }
  if (input.deferredArtifacts.includes(input.artifactKind)) {
    return "deferred";
  }
  if (input.editedArtifacts.includes(input.artifactKind)) {
    return "edited";
  }
  return "accepted";
}

function correctionLoadForDecision(decision: RetakeoverAdoptCorrectionDecision): number {
  if (decision === "accepted") {
    return 0;
  }
  if (decision === "edited") {
    return 0.5;
  }
  return 1;
}

function correctionFamilyHotspot(decision: RetakeoverAdoptCorrectionDecision): string {
  if (decision === "edited") {
    return "human_edit";
  }
  if (decision === "deferred") {
    return "spec_debt_defer";
  }
  if (decision === "rejected") {
    return "rejected_draft";
  }
  return "accepted";
}

function countCorrectionHotspots(fixtures: RetakeoverMetrics[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const fixture of fixtures) {
    for (const hotspot of fixture.adoptCorrection.correctionHotspots) {
      counts.set(hotspot, (counts.get(hotspot) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function countFixtureClasses(fixtures: RetakeoverMetrics[]): Record<RetakeoverFixtureClass, number> {
  const counts: Record<RetakeoverFixtureClass, number> = {
    "high-noise-protocol-repo": 0,
    "multilingual-finance-service-repo": 0,
    "docs-api-schema-scattered-repo": 0,
    "multi-language-monorepo-repo": 0,
    "frontend-backend-mixed-repo": 0,
    "historical-debt-service-repo": 0,
    "synthetic-god-file-monolith": 0,
    "synthetic-contract-drift": 0,
    "synthetic-noise-heavy-hidden-signal": 0,
    "synthetic-thin-behavior-evidence": 0,
  };
  for (const fixture of fixtures) {
    counts[fixture.fixtureClass] += 1;
  }
  return counts;
}

function buildPoolFixtureCatalogEntry(fixture: RetakeoverMetrics): RetakeoverPoolFixtureCatalogEntry {
  const ownerReviewRequired =
    fixture.qualityScorecard.nextAction === "owner_review_spec_debt" ||
    fixture.qualityScorecard.featureOverclaimRisk !== "low" ||
    fixture.adoptCorrection.ownerReviewArtifactCount > 0;

  return {
    fixtureId: fixture.fixtureId,
    fixtureClass: fixture.fixtureClass,
    featureRecommendation: fixture.draftQuality.featureRecommendation,
    verifySafety: fixture.qualityScorecard.verifySafety,
    ownerReviewRequired,
    artifactDecisionPaths: uniqueSorted(
      fixture.adoptCorrection.artifactCorrectionLoad.map((entry) => `${entry.decision}:${entry.artifactKind}`),
    ),
    coverageSignals: uniqueSorted([
      `class:${fixture.fixtureClass}`,
      `feature:${fixture.draftQuality.featureRecommendation}`,
      `verify:${fixture.qualityScorecard.verifySafety}`,
      ownerReviewRequired ? "path:owner_review" : "path:adoptable_initial_packet",
      ...fixture.adoptCorrection.artifactCorrectionLoad
        .filter((entry) => entry.decision !== "accepted")
        .map((entry) => `correction:${entry.decision}_${entry.artifactKind}`),
    ]),
    topEvidenceSample: fixture.topRankedEvidence.slice(0, 3),
    baselineProfile: {
      takeoverReadinessScore: fixture.qualityScorecard.takeoverReadinessScore,
      contractSignalPrecision: fixture.qualityScorecard.contractSignalPrecision,
      behaviorEvidenceStrength: fixture.qualityScorecard.behaviorEvidenceStrength,
      overclaimBlockRate: fixture.qualityScorecard.overclaimBlockRate,
    },
  };
}

function buildPoolBaselineMetric(
  fixtures: RetakeoverMetrics[],
  threshold: number,
  selector: (fixture: RetakeoverMetrics) => number,
): RetakeoverPoolBaselineMetric {
  const observed = fixtures.map(selector);
  return {
    threshold,
    lowestObserved: observed.length > 0 ? Number(Math.min(...observed).toFixed(2)) : 0,
    averageObserved: average(observed),
    fixturesBelowThreshold: fixtures
      .filter((fixture) => selector(fixture) < threshold)
      .map((fixture) => fixture.fixtureId),
  };
}

function buildRetakeoverBenchmarkReadiness(
  fixtures: RetakeoverMetrics[],
  classCoverage: RetakeoverPoolClassCoverage,
  qualityBaseline: RetakeoverPoolQualityBaseline,
): RetakeoverBenchmarkReadiness {
  const stableScoredFixtures = fixtures.filter(isStableScoredRetakeoverFixture);
  const stableScoredFixtureIds = stableScoredFixtures.map((fixture) => fixture.fixtureId).sort((left, right) => left.localeCompare(right));
  const unstableFixtureIds = fixtures
    .filter((fixture) => !stableScoredFixtureIds.includes(fixture.fixtureId))
    .map((fixture) => fixture.fixtureId)
    .sort((left, right) => left.localeCompare(right));
  const allClassesCovered = classCoverage.coveredFixtureClassCount >= RETAKEOVER_BENCHMARK_TARGETS.classCoverageCount;
  const allFixturesNonBlocking = fixtures.length > 0 && fixtures.every((fixture) => fixture.verifyOk);
  const qualityBaselineSatisfied =
    qualityBaseline.readinessScore.fixturesBelowThreshold.length === 0 &&
    qualityBaseline.contractSignalPrecision.fixturesBelowThreshold.length === 0 &&
    qualityBaseline.behaviorEvidenceStrength.fixturesBelowThreshold.length === 0;
  const blockers = [
    fixtures.length < RETAKEOVER_BENCHMARK_TARGETS.fixtureCount
      ? `fixture_count_below_${RETAKEOVER_BENCHMARK_TARGETS.fixtureCount}`
      : "",
    stableScoredFixtures.length < RETAKEOVER_BENCHMARK_TARGETS.fixtureCount
      ? `stable_scored_fixture_count_below_${RETAKEOVER_BENCHMARK_TARGETS.fixtureCount}`
      : "",
    allClassesCovered ? "" : "fixture_class_coverage_incomplete",
    allFixturesNonBlocking ? "" : "verify_blocking_fixture_present",
    qualityBaselineSatisfied ? "" : "quality_baseline_miss",
  ].filter((blocker) => blocker.length > 0);

  return {
    phase: "north-star-score-optimization-phase-1",
    ready: blockers.length === 0,
    targetFixtureCount: RETAKEOVER_BENCHMARK_TARGETS.fixtureCount,
    targetClassCoverageCount: RETAKEOVER_BENCHMARK_TARGETS.classCoverageCount,
    stableScoredFixtureCount: stableScoredFixtures.length,
    stableScoredFixtureIds,
    unstableFixtureIds,
    allClassesCovered,
    allFixturesNonBlocking,
    qualityBaselineSatisfied,
    blockers,
    scoreImpact: {
      dimension: "retakeover-quality",
      currentTarget: "9.2-9.5",
      evidence: [
        `${stableScoredFixtures.length}/${RETAKEOVER_BENCHMARK_TARGETS.fixtureCount} stable scored fixture(s)`,
        `${classCoverage.coveredFixtureClassCount}/${classCoverage.knownFixtureClassCount} fixture class(es) covered`,
        `verify non-blocking rate ${formatPercent(qualityBaseline.verifyNonBlockingRate)}`,
        `quality baseline ${qualityBaselineSatisfied ? "satisfied" : "missed"}`,
      ],
    },
  };
}

function buildRetakeoverRealismLadder(fixtures: RetakeoverMetrics[]): RetakeoverRealismLadder {
  const entries = RETAKEOVER_REALISM_CLASS_ORDER.map((realismClass) =>
    buildRetakeoverRealismClassEntry(realismClass, fixtures),
  );
  const missingRealismClasses = entries
    .filter((entry) => entry.metrics.fixtureCount === 0)
    .map((entry) => entry.realismClass);
  const blockers = entries.flatMap((entry) =>
    entry.blockers.map((blocker) => `${entry.realismClass}:${blocker}`),
  );
  const readyClasses = entries.filter((entry) => entry.correctionBudgetSatisfied).length;

  return {
    phase: "north-star-score-optimization-phase-6",
    ready: blockers.length === 0,
    targetRealismClassCount: RETAKEOVER_REALISM_CLASS_ORDER.length,
    coveredRealismClassCount: entries.filter((entry) => entry.metrics.fixtureCount > 0).length,
    missingRealismClasses,
    classes: entries,
    blockers,
    scoreImpact: {
      dimension: "retakeover-quality",
      currentTarget: "9.5",
      evidence: [
        `${readyClasses}/${RETAKEOVER_REALISM_CLASS_ORDER.length} realism class(es) satisfy correction budget`,
        `${fixtures.filter(isStableScoredRetakeoverFixture).length} stable scored fixture(s) feed the realism ladder`,
        `missing realism classes: ${missingRealismClasses.length === 0 ? "none" : missingRealismClasses.join(", ")}`,
        `budget blockers: ${blockers.length}`,
      ],
    },
  };
}

function buildRetakeoverRealismClassEntry(
  realismClass: RetakeoverRealismClass,
  fixtures: RetakeoverMetrics[],
): RetakeoverRealismClassEntry {
  const fixtureClasses = RETAKEOVER_REALISM_CLASS_FIXTURES[realismClass];
  const classFixtures = fixtures.filter((fixture) => fixtureClasses.includes(fixture.fixtureClass));
  const stableScoredFixtures = classFixtures.filter(isStableScoredRetakeoverFixture);
  const budget = RETAKEOVER_REALISM_BUDGETS[realismClass];
  const artifactDecisionCount = classFixtures.reduce(
    (sum, fixture) => sum + fixture.adoptCorrection.artifactCorrectionLoad.length,
    0,
  );
  const acceptedWithoutEditCount = classFixtures.reduce(
    (sum, fixture) =>
      sum + fixture.adoptCorrection.artifactCorrectionLoad.filter((entry) => entry.decision === "accepted").length,
    0,
  );
  const editedDraftCount = classFixtures.reduce(
    (sum, fixture) =>
      sum + fixture.adoptCorrection.artifactCorrectionLoad.filter((entry) => entry.decision === "edited").length,
    0,
  );
  const deferredSpecDebtCount = classFixtures.reduce(
    (sum, fixture) =>
      sum + fixture.adoptCorrection.artifactCorrectionLoad.filter((entry) => entry.decision === "deferred").length,
    0,
  );
  const featureOverclaimRiskCount = classFixtures.filter((fixture) =>
    fixture.qualityScorecard.featureOverclaimRisk !== "low",
  ).length;
  const evidenceNoiseRates = classFixtures.map((fixture) => 1 - fixture.qualityScorecard.topEvidenceSignalRate);
  const readinessScores = classFixtures.map((fixture) => fixture.qualityScorecard.takeoverReadinessScore);
  const metrics = {
    fixtureCount: classFixtures.length,
    stableScoredFixtureCount: stableScoredFixtures.length,
    acceptedWithoutEditRate: ratio(acceptedWithoutEditCount, artifactDecisionCount),
    editedDraftRate: ratio(editedDraftCount, artifactDecisionCount),
    deferredSpecDebtRate: ratio(deferredSpecDebtCount, artifactDecisionCount),
    featureOverclaimRiskRate: ratio(featureOverclaimRiskCount, classFixtures.length),
    evidenceNoiseRate: averageRatio(evidenceNoiseRates),
    averageTakeoverReadinessScore: average(readinessScores),
    lowestTakeoverReadinessScore: readinessScores.length > 0 ? Number(Math.min(...readinessScores).toFixed(2)) : 0,
  };
  const blockers = buildRealismBudgetBlockers(metrics, budget);
  const correctionBudgetSatisfied = blockers.length === 0;

  return {
    realismClass,
    fixtureClasses,
    fixtureIds: classFixtures.map((fixture) => fixture.fixtureId).sort((left, right) => left.localeCompare(right)),
    budget,
    metrics,
    correctionBudgetSatisfied,
    blockers,
    ownerAction: {
      owner: correctionBudgetSatisfied ? "repo owner / reviewer" : "takeover quality owner",
      nextCommand: correctionBudgetSatisfied
        ? "node --import tsx ./tools/jispec/tests/regression-runner.ts --area retakeover-regression-pool"
        : "node --import tsx ./tools/jispec/tests/retakeover-realism-ladder.ts",
      sourceArtifact: RETAKEOVER_POOL_METRICS_RELATIVE_PATH,
      reason: correctionBudgetSatisfied
        ? "Realism class correction budget is satisfied."
        : `Resolve realism budget blocker(s): ${blockers.join(", ")}.`,
    },
  };
}

function buildRealismBudgetBlockers(
  metrics: RetakeoverRealismClassEntry["metrics"],
  budget: RetakeoverRealismBudget,
): string[] {
  const blockers = [
    metrics.fixtureCount < budget.minimumFixtureCount ? "fixture_count_below_budget" : "",
    metrics.stableScoredFixtureCount < budget.minimumStableScoredFixtureCount ? "stable_scored_fixture_count_below_budget" : "",
    metrics.acceptedWithoutEditRate < budget.minimumAcceptedWithoutEditRate ? "accepted_without_edit_rate_below_budget" : "",
    metrics.editedDraftRate > budget.maximumEditedDraftRate ? "edited_draft_rate_above_budget" : "",
    metrics.deferredSpecDebtRate > budget.maximumDeferredSpecDebtRate ? "deferred_spec_debt_rate_above_budget" : "",
    metrics.featureOverclaimRiskRate > budget.maximumFeatureOverclaimRiskRate ? "feature_overclaim_risk_rate_above_budget" : "",
    metrics.evidenceNoiseRate > budget.maximumEvidenceNoiseRate ? "evidence_noise_rate_above_budget" : "",
    metrics.lowestTakeoverReadinessScore < budget.minimumTakeoverReadinessScore ? "takeover_readiness_below_budget" : "",
  ];
  return blockers.filter((blocker) => blocker.length > 0);
}

function isStableScoredRetakeoverFixture(fixture: RetakeoverMetrics): boolean {
  const scorecard = fixture.qualityScorecard;
  return (
    fixture.fixtureId.trim().length > 0 &&
    fixture.topRankedEvidence.length > 0 &&
    Number.isFinite(scorecard.takeoverReadinessScore) &&
    Number.isFinite(scorecard.contractSignalPrecision) &&
    Number.isFinite(scorecard.behaviorEvidenceStrength) &&
    Number.isFinite(scorecard.overclaimBlockRate) &&
    Number.isFinite(scorecard.adoptCorrectionLoad) &&
    scorecard.takeoverReadinessScore >= 0 &&
    scorecard.takeoverReadinessScore <= 100 &&
    scorecard.contractSignalPrecision >= 0 &&
    scorecard.contractSignalPrecision <= 1 &&
    scorecard.behaviorEvidenceStrength >= 0 &&
    scorecard.behaviorEvidenceStrength <= 1 &&
    scorecard.overclaimBlockRate >= 0 &&
    scorecard.overclaimBlockRate <= 1
  );
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function averageRatio(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
}

function isStrongTakeoverSignal(entry: { kind?: string; path?: string; metadata?: Record<string, unknown> }): boolean {
  const boundarySignal = typeof entry.metadata?.boundarySignal === "string" ? entry.metadata.boundarySignal : "";
  return [
    "governance_document",
    "protocol_document",
    "schema_truth_source",
    "explicit_endpoint",
    "service_entrypoint",
  ].includes(boundarySignal) || ["schema", "route"].includes(entry.kind ?? "");
}

function classifyFeatureOverclaimRisk(input: RetakeoverQualityScorecardInput): RetakeoverFeatureOverclaimRisk {
  const feature = input.featureContent ?? "";
  if (input.featureRecommendation === "defer_as_spec_debt") {
    return input.acceptedArtifacts.includes("feature") ? "high" : "low";
  }
  if (input.featureRecommendation === "unknown") {
    return "medium";
  }
  if (feature.includes("@behavior_needs_human_review")) {
    return "high";
  }
  if ((feature.match(/^  Scenario:/gm) ?? []).length === 0) {
    return "medium";
  }
  return "low";
}

interface RetakeoverFeatureEvidenceStats {
  scenarioCount: number;
  acceptCandidateScenarioCount: number;
  deferScenarioCount: number;
  humanReviewScenarioCount: number;
}

function summarizeFeatureEvidence(feature: string): RetakeoverFeatureEvidenceStats {
  return {
    scenarioCount: (feature.match(/^  Scenario:/gm) ?? []).length,
    acceptCandidateScenarioCount: (feature.match(/# recommendation: accept_candidate/g) ?? []).length,
    deferScenarioCount: (feature.match(/# recommendation: defer_as_spec_debt/g) ?? []).length,
    humanReviewScenarioCount: (feature.match(/@behavior_needs_human_review/g) ?? []).length,
  };
}

function calculateBehaviorEvidenceStrength(
  featureRecommendation: RetakeoverFeatureRecommendation,
  featureStats: RetakeoverFeatureEvidenceStats,
): number {
  if (featureStats.scenarioCount === 0) {
    return 0;
  }

  const scenarioStrength = ratio(featureStats.acceptCandidateScenarioCount, featureStats.scenarioCount);
  if (featureRecommendation === "accept_candidate") {
    return Math.max(scenarioStrength, 0.85);
  }
  if (featureRecommendation === "unknown") {
    return Number((scenarioStrength * 0.5).toFixed(4));
  }
  return scenarioStrength;
}

function calculateOverclaimBlockRate(
  input: RetakeoverQualityScorecardInput,
  featureStats: RetakeoverFeatureEvidenceStats,
): number {
  const hasOverclaimPressure =
    input.featureRecommendation !== "accept_candidate" ||
    featureStats.deferScenarioCount > 0 ||
    featureStats.humanReviewScenarioCount > 0;
  if (!hasOverclaimPressure) {
    return 1;
  }

  const featureWasDeferred = input.deferredArtifacts.includes("feature");
  const featureWasRejected = (input.rejectedArtifacts ?? []).includes("feature");
  return featureWasDeferred || featureWasRejected ? 1 : 0;
}

function calculateAdoptionReadyArtifactCount(
  input: RetakeoverQualityScorecardInput,
  featureOverclaimRisk: RetakeoverFeatureOverclaimRisk,
): number {
  const acceptedNonFeatureCount = input.acceptedArtifacts.filter((artifact) => artifact !== "feature").length;
  const acceptedFeatureIsReady =
    input.acceptedArtifacts.includes("feature") &&
    input.featureRecommendation === "accept_candidate" &&
    featureOverclaimRisk === "low";
  return acceptedNonFeatureCount + (acceptedFeatureIsReady ? 1 : 0);
}

function buildHumanCorrectionHotspots(input: {
  topEvidenceSignalRate: number;
  contractSignalPrecision: number;
  adoptCorrectionLoad: number;
  featureOverclaimRisk: RetakeoverFeatureOverclaimRisk;
  featureStats: RetakeoverFeatureEvidenceStats;
  verifyOk: boolean;
  deferredArtifacts: string[];
  editedArtifacts: string[];
  rejectedArtifacts: string[];
  correctionHotspots: string[];
}): string[] {
  const hotspots = new Set<string>(input.correctionHotspots);
  for (const artifact of input.deferredArtifacts) {
    hotspots.add(`deferred_${artifact}`);
  }
  for (const artifact of input.editedArtifacts) {
    hotspots.add(`edited_${artifact}`);
  }
  for (const artifact of input.rejectedArtifacts) {
    hotspots.add(`rejected_${artifact}`);
  }
  if (!input.verifyOk) {
    hotspots.add("blocking_verify");
  }
  if (input.topEvidenceSignalRate < 0.6 || input.contractSignalPrecision < 0.55) {
    hotspots.add("contract_signal_precision");
  }
  if (input.featureStats.humanReviewScenarioCount > 0 || input.featureStats.deferScenarioCount > 0) {
    hotspots.add("behavior_owner_review");
  }
  if (input.featureOverclaimRisk !== "low") {
    hotspots.add("feature_overclaim_risk");
  }
  if (input.adoptCorrectionLoad > 0) {
    hotspots.add("adopt_correction_load");
  }
  return [...hotspots].sort((left, right) => left.localeCompare(right));
}

function calculateNeedsOwnerDecisionCount(input: {
  ownerReviewArtifactCount: number;
  featureOverclaimRisk: RetakeoverFeatureOverclaimRisk;
  featureStats: RetakeoverFeatureEvidenceStats;
  verifyOk: boolean;
}): number {
  const ownerDecisionCandidates =
    input.ownerReviewArtifactCount +
    input.featureStats.humanReviewScenarioCount +
    (input.featureOverclaimRisk !== "low" ? 1 : 0) +
    (input.verifyOk ? 0 : 1);
  return ownerDecisionCandidates;
}

function calculateTakeoverReadinessScore(input: {
  noiseSuppressionRate: number;
  topEvidenceSignalRate: number;
  adoptCorrectionLoad: number;
  featureOverclaimRisk: RetakeoverFeatureOverclaimRisk;
  verifySafety: RetakeoverVerifySafety;
}): number {
  const featureRiskScore: Record<RetakeoverFeatureOverclaimRisk, number> = {
    low: 15,
    medium: 8,
    high: 0,
  };
  const verifyScore = input.verifySafety === "non_blocking" ? 15 : 0;
  const score =
    input.noiseSuppressionRate * 20 +
    input.topEvidenceSignalRate * 35 +
    (1 - input.adoptCorrectionLoad) * 15 +
    featureRiskScore[input.featureOverclaimRisk] +
    verifyScore;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildRiskNotes(input: {
  noiseSuppressionRate: number;
  topEvidenceSignalRate: number;
  adoptCorrectionLoad: number;
  featureOverclaimRisk: RetakeoverFeatureOverclaimRisk;
  verifySafety: RetakeoverVerifySafety;
}): string[] {
  const notes: string[] = [];
  if (input.verifySafety === "blocking") {
    notes.push("verify is blocking after takeover");
  }
  if (input.topEvidenceSignalRate < 0.6) {
    notes.push("top ranked evidence has limited strong boundary signal");
  }
  if (input.noiseSuppressionRate < 0.35) {
    notes.push("little or no noisy inventory was suppressed; confirm the fixture is not hiding dependency/build gravity");
  }
  if (input.adoptCorrectionLoad > 0) {
    notes.push("adopt deferred at least one artifact as spec debt");
  }
  if (input.featureOverclaimRisk !== "low") {
    notes.push(`feature overclaim risk is ${input.featureOverclaimRisk}`);
  }
  if (notes.length === 0) {
    notes.push("no immediate scorecard risk");
  }
  return notes;
}

function selectNextAction(input: {
  verifySafety: RetakeoverVerifySafety;
  adoptCorrectionLoad: number;
  featureOverclaimRisk: RetakeoverFeatureOverclaimRisk;
}): RetakeoverNextAction {
  if (input.verifySafety === "blocking") {
    return "fix_blocking_verify";
  }
  if (input.adoptCorrectionLoad > 0 || input.featureOverclaimRisk !== "low") {
    return "owner_review_spec_debt";
  }
  return "adoptable_initial_packet";
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function renderRiskNoteBullets(notes: string[]): string[] {
  if (notes.length === 0) {
    return ["- none"];
  }
  return notes.map((note) => `- ${note}`);
}
