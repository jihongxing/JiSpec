export type FeatureRecommendation = "accept_candidate" | "defer_as_spec_debt";
export type BehaviorEvidenceLevel = "strong" | "partial" | "weak" | "unsupported";

export interface FeatureScenarioConfidenceInput {
  boundaryName: string;
  confidenceScore: number;
  evidenceStrength: "strong" | "moderate" | "thin";
  evidenceCoverage: number;
  relatedRoute?: string;
  relatedTestCount: number;
  relatedSchemaCount: number;
  relatedDocumentCount: number;
  relatedProtoServiceCount: number;
  relatedAggregateRootCount: number;
  genericBehaviorTemplate: boolean;
  behaviorEvidenceLevel?: BehaviorEvidenceLevel;
}

export interface FeatureScenarioConfidenceAssessment {
  humanReviewRequired: boolean;
  recommendation: FeatureRecommendation;
  confidenceReasons: string[];
}

export interface ParsedFeatureScenarioConfidence {
  scenarioName: string;
  recommendation: FeatureRecommendation;
  confidenceScore?: number;
  confidenceReasons: string[];
  humanReviewRequired: boolean;
}

export interface ParsedFeatureConfidenceSummary {
  recommendation: FeatureRecommendation;
  confidenceReasons: string[];
  scenarios: ParsedFeatureScenarioConfidence[];
  acceptCandidateCount: number;
  deferredScenarioCount: number;
  humanReviewScenarioCount: number;
  averageConfidenceScore?: number;
}

const ACCEPT_CONFIDENCE_THRESHOLD = 0.68;

const GENERIC_BOUNDARY_NAMES = new Set([
  "api",
  "app",
  "bootstrap",
  "controller",
  "database",
  "handler",
  "migration",
  "route",
  "routes",
  "server",
  "service",
  "src",
  "test",
  "tests",
]);

export function assessFeatureScenarioConfidence(
  input: FeatureScenarioConfidenceInput,
): FeatureScenarioConfidenceAssessment {
  const confidenceReasons: string[] = [];
  const normalizedBoundary = normalizeBoundaryName(input.boundaryName);
  const routeOnlyEvidence =
    Boolean(input.relatedRoute) &&
    input.relatedTestCount === 0 &&
    input.relatedSchemaCount === 0 &&
    input.relatedDocumentCount === 0 &&
    input.relatedProtoServiceCount === 0 &&
    input.relatedAggregateRootCount === 0;
  const genericBoundary = GENERIC_BOUNDARY_NAMES.has(normalizedBoundary);
  const strongScenarioCorroboration =
    input.confidenceScore >= 0.72 &&
    (
      (input.relatedProtoServiceCount > 0 &&
        input.relatedSchemaCount + input.relatedDocumentCount + input.relatedAggregateRootCount + input.relatedTestCount > 0) ||
      (input.relatedDocumentCount > 0 && input.relatedSchemaCount + input.relatedTestCount > 0) ||
      (input.relatedTestCount > 0 && input.relatedAggregateRootCount > 0)
    );
  const lacksExecutableBehaviorAnchor =
    !strongScenarioCorroboration &&
    input.relatedTestCount === 0 &&
    input.relatedProtoServiceCount === 0 &&
    input.relatedDocumentCount === 0;

  if (input.evidenceStrength === "thin") {
    confidenceReasons.push("repository evidence strength is thin");
  } else {
    confidenceReasons.push(`repository evidence strength is ${input.evidenceStrength}`);
  }

  if (input.behaviorEvidenceLevel) {
    confidenceReasons.push(`behavior evidence level is ${input.behaviorEvidenceLevel}`);
  }

  if (input.relatedDocumentCount > 0) {
    confidenceReasons.push("document evidence anchors the business behavior");
  }

  if (input.relatedSchemaCount > 0) {
    confidenceReasons.push("schema or API contract evidence corroborates the behavior");
  }

  if (input.relatedProtoServiceCount > 0) {
    confidenceReasons.push("protobuf service mapping anchors the boundary");
  }

  if (input.relatedAggregateRootCount > 0) {
    confidenceReasons.push("aggregate-root evidence links behavior to a business object");
  }

  if (input.relatedTestCount > 0) {
    confidenceReasons.push("test evidence names the behavior boundary");
  }

  if (input.relatedRoute) {
    confidenceReasons.push("route evidence is used only as supporting context");
  }

  if (strongScenarioCorroboration) {
    confidenceReasons.push("scenario has enough corroborating evidence for initial adoption");
  }

  if (input.behaviorEvidenceLevel === "strong") {
    confidenceReasons.push("behavior evidence is cross-corroborated across implementation and contract signals");
  } else if (input.behaviorEvidenceLevel === "partial") {
    confidenceReasons.push("behavior evidence is partial and should stay reviewable");
  } else if (input.behaviorEvidenceLevel === "weak") {
    confidenceReasons.push("behavior evidence is weak and needs owner confirmation");
  } else if (input.behaviorEvidenceLevel === "unsupported") {
    confidenceReasons.push("behavior evidence is unsupported beyond inferred boundary naming");
  }

  if (routeOnlyEvidence) {
    confidenceReasons.push("route-only behavior lacks contract, document, proto, aggregate, or test corroboration");
  }

  if (lacksExecutableBehaviorAnchor) {
    confidenceReasons.push("behavior lacks test or protocol service corroboration");
  }

  if (input.evidenceCoverage === 0) {
    confidenceReasons.push("no direct behavior evidence supports this boundary");
  }

  if (input.genericBehaviorTemplate || genericBoundary) {
    confidenceReasons.push("generic behavior template requires owner confirmation");
  }

  if (input.confidenceScore < ACCEPT_CONFIDENCE_THRESHOLD) {
    confidenceReasons.push(`scenario confidence is below ${Math.round(ACCEPT_CONFIDENCE_THRESHOLD * 100)}%`);
  }

  const humanReviewRequired =
    (input.evidenceStrength === "thin" && !strongScenarioCorroboration) ||
    input.evidenceCoverage === 0 ||
    routeOnlyEvidence ||
    lacksExecutableBehaviorAnchor ||
    input.genericBehaviorTemplate ||
    genericBoundary ||
    input.behaviorEvidenceLevel === "weak" ||
    input.behaviorEvidenceLevel === "unsupported" ||
    input.confidenceScore < 0.58;
  const recommendation: FeatureRecommendation =
    humanReviewRequired || input.confidenceScore < ACCEPT_CONFIDENCE_THRESHOLD
      ? "defer_as_spec_debt"
      : "accept_candidate";

  return {
    humanReviewRequired,
    recommendation,
    confidenceReasons: uniqueSorted(confidenceReasons),
  };
}

export function summarizeFeatureScenarioConfidence(input: {
  scenarios: Array<{
    recommendation: FeatureRecommendation;
    confidenceScore: number;
    confidenceReasons: string[];
    humanReviewRequired: boolean;
  }>;
  evidenceStrength: "strong" | "moderate" | "thin";
}): Pick<
  ParsedFeatureConfidenceSummary,
  | "recommendation"
  | "confidenceReasons"
  | "acceptCandidateCount"
  | "deferredScenarioCount"
  | "humanReviewScenarioCount"
  | "averageConfidenceScore"
> {
  const scenarios = input.scenarios;
  const acceptCandidateCount = scenarios.filter((scenario) => scenario.recommendation === "accept_candidate").length;
  const deferredScenarioCount = scenarios.length - acceptCandidateCount;
  const humanReviewScenarioCount = scenarios.filter((scenario) => scenario.humanReviewRequired).length;
  const averageConfidenceScore =
    scenarios.length > 0
      ? Number((scenarios.reduce((sum, scenario) => sum + scenario.confidenceScore, 0) / scenarios.length).toFixed(2))
      : undefined;
  const recommendation: FeatureRecommendation =
    shouldAcceptFeatureArtifact({
      evidenceStrength: input.evidenceStrength,
      acceptCandidateCount,
      deferredScenarioCount,
      humanReviewScenarioCount,
      averageConfidenceScore,
    })
      ? "accept_candidate"
      : "defer_as_spec_debt";
  const confidenceReasons: string[] = [];

  if (recommendation === "accept_candidate" && deferredScenarioCount === 0 && humanReviewScenarioCount === 0) {
    confidenceReasons.push("all scenarios passed the confidence gate");
  } else if (recommendation === "accept_candidate") {
    confidenceReasons.push("strong scenarios passed while tagged scenarios remain review warnings");
  } else if (scenarios.length === 0) {
    confidenceReasons.push("no feature scenarios were available for confidence assessment");
  } else {
    confidenceReasons.push("one or more scenarios need owner confirmation before enforcement");
  }

  if (input.evidenceStrength === "thin") {
    confidenceReasons.push("repository evidence strength is thin");
  }

  if (humanReviewScenarioCount > 0) {
    confidenceReasons.push(`${humanReviewScenarioCount} scenario(s) carry @behavior_needs_human_review`);
  }

  if (deferredScenarioCount > 0) {
    confidenceReasons.push(`${deferredScenarioCount} scenario(s) are deferred as spec debt`);
  }

  if (averageConfidenceScore !== undefined) {
    confidenceReasons.push(`average scenario confidence is ${Math.round(averageConfidenceScore * 100)}%`);
  }

  return {
    recommendation,
    confidenceReasons: uniqueSorted(confidenceReasons),
    acceptCandidateCount,
    deferredScenarioCount,
    humanReviewScenarioCount,
    averageConfidenceScore,
  };
}

function shouldAcceptFeatureArtifact(input: {
  evidenceStrength: "strong" | "moderate" | "thin";
  acceptCandidateCount: number;
  deferredScenarioCount: number;
  humanReviewScenarioCount: number;
  averageConfidenceScore?: number;
}): boolean {
  const average = input.averageConfidenceScore ?? 0;
  if (input.acceptCandidateCount === 0 || average < ACCEPT_CONFIDENCE_THRESHOLD) {
    return false;
  }

  if (input.deferredScenarioCount === 0 && input.humanReviewScenarioCount === 0) {
    return true;
  }

  return (
    input.evidenceStrength === "strong" &&
    input.acceptCandidateCount >= Math.max(2, input.deferredScenarioCount * 2)
  );
}

export function parseFeatureConfidenceFromGherkin(content: string | undefined): ParsedFeatureConfidenceSummary {
  if (!content) {
    return emptyParsedFeatureConfidence();
  }

  const lines = content.split(/\r?\n/);
  const scenarios: ParsedFeatureScenarioConfidence[] = [];
  let artifactRecommendation: FeatureRecommendation | undefined;
  let artifactReasons: string[] = [];
  let pendingConfidenceScore: number | undefined;
  let pendingRecommendation: FeatureRecommendation | undefined;
  let pendingReasons: string[] = [];
  let pendingHumanReview = false;

  const flushScenario = (scenarioName: string) => {
    scenarios.push({
      scenarioName,
      recommendation: pendingRecommendation ?? (pendingHumanReview ? "defer_as_spec_debt" : "accept_candidate"),
      confidenceScore: pendingConfidenceScore,
      confidenceReasons: [...pendingReasons],
      humanReviewRequired: pendingHumanReview,
    });
    pendingConfidenceScore = undefined;
    pendingRecommendation = undefined;
    pendingReasons = [];
    pendingHumanReview = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# adoption_recommendation:")) {
      artifactRecommendation = normalizeRecommendation(trimmed.slice("# adoption_recommendation:".length).trim());
      continue;
    }
    if (trimmed.startsWith("# confidence_reasons:")) {
      const parsedReasons = parseJsonStringArray(trimmed.slice("# confidence_reasons:".length).trim());
      if (scenarios.length === 0 && !pendingRecommendation && pendingConfidenceScore === undefined) {
        artifactReasons = parsedReasons;
      } else {
        pendingReasons = parsedReasons;
      }
      continue;
    }
    if (trimmed.startsWith("# recommendation:")) {
      pendingRecommendation = normalizeRecommendation(trimmed.slice("# recommendation:".length).trim());
      continue;
    }
    if (trimmed.startsWith("# confidence_score:")) {
      const value = Number(trimmed.slice("# confidence_score:".length).trim());
      pendingConfidenceScore = Number.isFinite(value) ? value : undefined;
      continue;
    }
    if (trimmed === "@behavior_needs_human_review") {
      pendingHumanReview = true;
      continue;
    }
    if (trimmed.startsWith("Scenario:")) {
      flushScenario(trimmed.slice("Scenario:".length).trim());
    }
  }

  const parsedSummary = summarizeFeatureScenarioConfidence({
    scenarios: scenarios.map((scenario) => ({
      recommendation: scenario.recommendation,
      confidenceScore: scenario.confidenceScore ?? 0,
      confidenceReasons: scenario.confidenceReasons,
      humanReviewRequired: scenario.humanReviewRequired,
    })),
    evidenceStrength: artifactReasons.some((reason) => reason.includes("thin")) ? "thin" : "moderate",
  });

  return {
    recommendation: artifactRecommendation ?? parsedSummary.recommendation,
    confidenceReasons: artifactReasons.length > 0 ? artifactReasons : parsedSummary.confidenceReasons,
    scenarios,
    acceptCandidateCount: parsedSummary.acceptCandidateCount,
    deferredScenarioCount: parsedSummary.deferredScenarioCount,
    humanReviewScenarioCount: parsedSummary.humanReviewScenarioCount,
    averageConfidenceScore: parsedSummary.averageConfidenceScore,
  };
}

function emptyParsedFeatureConfidence(): ParsedFeatureConfidenceSummary {
  return {
    recommendation: "defer_as_spec_debt",
    confidenceReasons: ["no feature artifact was available for confidence assessment"],
    scenarios: [],
    acceptCandidateCount: 0,
    deferredScenarioCount: 0,
    humanReviewScenarioCount: 0,
  };
}

function normalizeRecommendation(value: string): FeatureRecommendation | undefined {
  return value === "accept_candidate" || value === "defer_as_spec_debt" ? value : undefined;
}

function parseJsonStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function normalizeBoundaryName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort((left, right) => left.localeCompare(right));
}
