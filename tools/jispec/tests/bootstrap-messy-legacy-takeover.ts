import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runBootstrapAdopt } from "../bootstrap/adopt";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft, type BootstrapDraftResult } from "../bootstrap/draft";
import type { BootstrapDiscoverResult } from "../bootstrap/evidence-graph";
import type { AdoptionRankedEvidence } from "../bootstrap/evidence-ranking";
import {
  buildRetakeoverAdoptCorrectionMetrics,
  buildRetakeoverQualityScorecard,
  parseRetakeoverFeatureRecommendation,
  RETAKEOVER_METRICS_RELATIVE_PATH,
  RETAKEOVER_POOL_METRICS_RELATIVE_PATH,
  RETAKEOVER_POOL_SUMMARY_RELATIVE_PATH,
  RETAKEOVER_SUMMARY_RELATIVE_PATH,
  type RetakeoverFixtureClass,
  type RetakeoverMetrics,
  writeRetakeoverArtifacts,
  writeRetakeoverPoolArtifacts,
} from "../bootstrap/retakeover-metrics";
import { runVerify } from "../verify/verify-runner";
import type { VerifyRunResult } from "../verify/verdict";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface DomainDraft {
  domain?: {
    primary_contexts?: string[];
    areas?: Array<{ name?: string; source_files?: string[] }>;
    aggregate_roots?: Array<{ name?: string; source_files?: string[] }>;
    business_vocabulary?: Array<{ label?: string; phrase?: string; source_path?: string }>;
  };
}

interface ApiDraft {
  api_spec?: {
    surface_summary?: Record<string, number>;
    surfaces?: ApiSurfaceDraft[];
  };
}

interface ApiSurfaceDraft {
  surface_kind?: string;
  operation?: string;
  method?: string;
  path?: string;
  bounded_context?: string;
}

interface MessyTakeoverResult {
  discover: BootstrapDiscoverResult;
  draft: BootstrapDraftResult;
  domain: DomainDraft;
  api: ApiDraft;
  feature: string;
  ranked: AdoptionRankedEvidence;
  brief: string;
  retakeoverSummary: string;
  verify: VerifyRunResult;
  metrics: RetakeoverMetrics;
}

interface MessyFixtureOptions {
  fixtureId: string;
  fixtureClass: RetakeoverFixtureClass;
  featureDecision: "accept" | "skip_as_spec_debt";
}

async function main(): Promise<void> {
  console.log("=== Bootstrap Synthetic Messy Legacy Takeover Stress Test ===\n");

  const godFileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-messy-god-file-"));
  const driftRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-messy-contract-drift-"));
  const hiddenSignalRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-messy-hidden-signal-"));
  const thinBehaviorRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-messy-thin-behavior-"));
  const poolRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-messy-pool-"));
  const results: TestResult[] = [];

  try {
    seedGodFileMonolith(godFileRoot);
    seedContractDriftRepository(driftRoot);
    seedNoiseHeavyHiddenSignalRepository(hiddenSignalRoot);
    seedThinBehaviorEvidenceRepository(thinBehaviorRoot);

    const godFile = await runMessyTakeover(godFileRoot, {
      fixtureId: "god-file-monolith-like",
      fixtureClass: "synthetic-god-file-monolith",
      featureDecision: "skip_as_spec_debt",
    });
    const drift = await runMessyTakeover(driftRoot, {
      fixtureId: "contract-drift-like",
      fixtureClass: "synthetic-contract-drift",
      featureDecision: "skip_as_spec_debt",
    });
    const hiddenSignal = await runMessyTakeover(hiddenSignalRoot, {
      fixtureId: "noise-heavy-hidden-signal-like",
      fixtureClass: "synthetic-noise-heavy-hidden-signal",
      featureDecision: "skip_as_spec_debt",
    });
    const thinBehavior = await runMessyTakeover(thinBehaviorRoot, {
      fixtureId: "thin-behavior-evidence-like",
      fixtureClass: "synthetic-thin-behavior-evidence",
      featureDecision: "skip_as_spec_debt",
    });

    writeRetakeoverPoolArtifacts(poolRoot, [godFile.metrics, drift.metrics, hiddenSignal.metrics, thinBehavior.metrics]);
    const poolMetrics = JSON.parse(
      fs.readFileSync(path.join(poolRoot, RETAKEOVER_POOL_METRICS_RELATIVE_PATH), "utf-8"),
    ) as {
      fixtureCount?: number;
      fixtureClasses?: string[];
      verify?: { okCount?: number; blockingCount?: number };
      draftQuality?: { featureRecommendations?: Record<string, number> };
      adoptCorrection?: {
        fixturesWithDeferredArtifacts?: string[];
        fixturesWithEditedArtifacts?: string[];
        fixturesWithRejectedArtifacts?: string[];
        deferredArtifactCount?: number;
        editedArtifactCount?: number;
        rejectedArtifactCount?: number;
        totalCorrectionLoad?: number;
        ownerReviewArtifactCount?: number;
        topCorrectionHotspots?: string[];
      };
      qualityScorecard?: {
        averageTakeoverReadinessScore?: number;
        lowestReadinessScore?: number;
        averageContractSignalPrecision?: number;
        averageBehaviorEvidenceStrength?: number;
        averageOverclaimBlockRate?: number;
        totalAdoptionReadyArtifactCount?: number;
        totalNeedsOwnerDecisionCount?: number;
        fixturesWithHumanCorrectionHotspots?: string[];
        fixturesNeedingOwnerReview?: string[];
        fixturesWithBlockingVerify?: string[];
        featureOverclaimRisk?: Record<string, number>;
      };
    };
    const poolSummary = fs.readFileSync(path.join(poolRoot, RETAKEOVER_POOL_SUMMARY_RELATIVE_PATH), "utf-8");

    const godFileContexts = collectDomainNames(godFile.domain);
    const godFileAggregates = collectAggregateNames(godFile.domain);
    results.push({
      name: "god-file monolith remains conservative and routes behavior to owner review",
      passed:
        containsAny(godFileContexts, ["order", "payment", "inventory", "customer", "reporting"]) &&
        containsAny(godFileAggregates, ["Order", "Payment", "InventoryItem", "CustomerAccount", "Report"]) &&
        godFileContexts.length <= 8 &&
        !containsAny(godFileContexts, ["server", "handler", "utils", "misc", "data"]) &&
        (godFile.api.api_spec?.surface_summary?.explicit_endpoint ?? 0) >= 3 &&
        godFile.feature.includes("# adoption_recommendation: defer_as_spec_debt") &&
        godFile.feature.includes("@behavior_needs_human_review") &&
        countScenarios(godFile.feature) <= 3 &&
        godFile.metrics.qualityScorecard.verifySafety === "non_blocking" &&
        godFile.metrics.qualityScorecard.featureOverclaimRisk === "low" &&
        godFile.metrics.qualityScorecard.nextAction === "owner_review_spec_debt" &&
        godFile.metrics.qualityScorecard.takeoverReadinessScore > 0 &&
        godFile.brief.includes("Recommendation: `defer_as_spec_debt`"),
      error: `Expected god-file fixture to infer a small reviewable packet, not a clean overclaimed model. contexts=${JSON.stringify(godFileContexts)}, aggregates=${JSON.stringify(godFileAggregates)}, feature=\n${godFile.feature}`,
    });

    const driftRankedPaths = drift.ranked.evidence.map((entry) => entry.path);
    const driftSourceFiles = drift.ranked.evidence.flatMap((entry) => entry.sourceFiles);
    const driftSurfacePaths = (drift.api.api_spec?.surfaces ?? []).map((surface) => surface.path).filter((value): value is string => Boolean(value));
    results.push({
      name: "contract drift keeps docs, OpenAPI, schema, and implementation evidence visible together",
      passed:
        containsAll(driftRankedPaths.slice(0, 15), [
          "README.md",
          "docs/openapi/openapi.yaml",
          "schemas/cart-checkout.schema.json",
          "/order/submit",
        ]) &&
        driftSourceFiles.includes("src/routes/order-submit.ts") &&
        containsAll(driftSurfacePaths, ["/api/v1/cart/checkout", "/order/submit"]) &&
        drift.feature.includes("# adoption_recommendation: defer_as_spec_debt") &&
        drift.brief.includes("owner confirms the tagged behavior scenarios") &&
        drift.metrics.qualityScorecard.topEvidenceSignalRate >= 0.5 &&
        drift.metrics.qualityScorecard.featureOverclaimRisk === "low" &&
        drift.metrics.adoptCorrection.deferredArtifacts.includes("feature"),
      error: `Expected contract drift fixture to keep conflicting contract sources reviewable. ranked=${JSON.stringify(drift.ranked.evidence)}, sources=${JSON.stringify(driftSourceFiles)}, surfaces=${JSON.stringify(driftSurfacePaths)}, brief=\n${drift.brief}`,
    });

    const hiddenRankedPaths = hiddenSignal.ranked.evidence.map((entry) => entry.path);
    const hiddenRules = excludedRuleIds(hiddenSignal.ranked);
    results.push({
      name: "noise-heavy fixture suppresses dependency/build/generated gravity and keeps hidden product signals reviewable",
      passed:
        hiddenSignal.ranked.excludedSummary.totalExcludedFileCount >= 24 &&
        containsAll(hiddenRules, ["build-output", "dependency-bundle", "generated-bundle"]) &&
        !containsPathFragment(hiddenRankedPaths, ["vendor/", "dist/", ".cache/", "coverage/", "generated/"]) &&
        containsAll(hiddenRankedPaths.slice(0, 12), [
          "services/checkout/docs/checkout-flow.md",
          "services/checkout/contracts/openapi.yaml",
          "services/checkout/contracts/order.schema.json",
        ]) &&
        hiddenSignal.feature.includes("# recommendation: accept_candidate") &&
        hiddenSignal.feature.includes("# adoption_recommendation: defer_as_spec_debt") &&
        hiddenSignal.metrics.qualityScorecard.noiseSuppressionRate >= 0.5 &&
        hiddenSignal.metrics.qualityScorecard.nextAction === "owner_review_spec_debt" &&
        hiddenSignal.metrics.adoptCorrection.deferredArtifacts.includes("feature"),
      error: `Expected hidden-signal fixture to suppress noise, show corroborated scenarios, and defer weaker generic behavior. ranked=${JSON.stringify(hiddenSignal.ranked.evidence)}, excluded=${JSON.stringify(hiddenSignal.ranked.excludedSummary)}, feature=\n${hiddenSignal.feature}`,
    });

    const thinScenarioCount = countScenarios(thinBehavior.feature);
    results.push({
      name: "thin behavior fixture defers behavior without blocking takeover verify",
      passed:
        thinScenarioCount > 0 &&
        thinScenarioCount <= 3 &&
        thinBehavior.feature.includes("# adoption_recommendation: defer_as_spec_debt") &&
        thinBehavior.feature.includes("@behavior_needs_human_review") &&
        thinBehavior.brief.includes("Recommendation: `defer_as_spec_debt`") &&
        thinBehavior.brief.includes(".spec/spec-debt/") &&
        thinBehavior.metrics.adoptCorrection.deferredArtifacts.includes("feature") &&
        thinBehavior.metrics.qualityScorecard.featureOverclaimRisk === "low" &&
        thinBehavior.metrics.qualityScorecard.verifySafety === "non_blocking" &&
        thinBehavior.verify.ok,
      error: `Expected thin behavior to become explicit spec debt while verify stays non-blocking. scenarios=${thinScenarioCount}, verify=${JSON.stringify(thinBehavior.verify)}, feature=\n${thinBehavior.feature}`,
    });

    results.push({
      name: "synthetic messy legacy stress writes per-fixture summaries and pool-level decision packet",
      passed:
        [godFile, drift, hiddenSignal, thinBehavior].every((result) =>
          fs.existsSync(path.join(result.discover.graph.repoRoot, RETAKEOVER_METRICS_RELATIVE_PATH)) &&
          fs.existsSync(path.join(result.discover.graph.repoRoot, RETAKEOVER_SUMMARY_RELATIVE_PATH)) &&
          result.retakeoverSummary.includes("# JiSpec Retakeover Summary") &&
          result.retakeoverSummary.includes("## Review Questions") &&
          result.retakeoverSummary.includes("## Adopt Correction Loop") &&
          result.retakeoverSummary.includes("| Artifact | Decision | Load | Owner Review | Note |") &&
          result.retakeoverSummary.includes("## Quality Scorecard") &&
          result.retakeoverSummary.includes("| Signal | Value | Review Meaning |") &&
          result.retakeoverSummary.includes("Takeover readiness") &&
          result.retakeoverSummary.includes("Verify safety") &&
          result.retakeoverSummary.includes("Contract signal precision") &&
          result.retakeoverSummary.includes("Behavior evidence strength") &&
          result.retakeoverSummary.includes("Overclaim block rate") &&
          result.retakeoverSummary.includes("Owner decision count") &&
          result.retakeoverSummary.includes("Feature overclaim risk") &&
          result.retakeoverSummary.includes("Next action:") &&
          result.metrics.verifyOk,
        ) &&
        poolMetrics.fixtureCount === 4 &&
        poolMetrics.verify?.okCount === 4 &&
        poolMetrics.verify?.blockingCount === 0 &&
        (poolMetrics.draftQuality?.featureRecommendations?.defer_as_spec_debt ?? 0) === 4 &&
        poolMetrics.adoptCorrection?.deferredArtifactCount === 4 &&
        poolMetrics.adoptCorrection?.editedArtifactCount === 0 &&
        poolMetrics.adoptCorrection?.rejectedArtifactCount === 0 &&
        poolMetrics.adoptCorrection?.ownerReviewArtifactCount === 4 &&
        poolMetrics.adoptCorrection?.totalCorrectionLoad === 4 &&
        poolMetrics.adoptCorrection?.topCorrectionHotspots?.some((hotspot) => hotspot.startsWith("deferred_feature:")) === true &&
        typeof poolMetrics.qualityScorecard?.averageTakeoverReadinessScore === "number" &&
        typeof poolMetrics.qualityScorecard?.averageContractSignalPrecision === "number" &&
        typeof poolMetrics.qualityScorecard?.averageBehaviorEvidenceStrength === "number" &&
        typeof poolMetrics.qualityScorecard?.averageOverclaimBlockRate === "number" &&
        typeof poolMetrics.qualityScorecard?.totalAdoptionReadyArtifactCount === "number" &&
        typeof poolMetrics.qualityScorecard?.totalNeedsOwnerDecisionCount === "number" &&
        poolMetrics.qualityScorecard.averageTakeoverReadinessScore > 0 &&
        poolMetrics.qualityScorecard.averageContractSignalPrecision > 0 &&
        poolMetrics.qualityScorecard.totalNeedsOwnerDecisionCount > 0 &&
        poolMetrics.qualityScorecard.fixturesWithHumanCorrectionHotspots?.length === 4 &&
        poolMetrics.qualityScorecard.fixturesNeedingOwnerReview?.length === 4 &&
        poolMetrics.qualityScorecard.fixturesWithBlockingVerify?.length === 0 &&
        poolMetrics.qualityScorecard.featureOverclaimRisk?.low === 4 &&
        containsAll(poolMetrics.fixtureClasses ?? [], [
          "synthetic-contract-drift",
          "synthetic-god-file-monolith",
          "synthetic-noise-heavy-hidden-signal",
          "synthetic-thin-behavior-evidence",
        ]) &&
        poolSummary.includes("# JiSpec Retakeover Pool Summary") &&
        poolSummary.includes("Fixture count: 4") &&
        poolSummary.includes("All fixtures are non-blocking") &&
        poolSummary.includes("Average takeover readiness score:") &&
        poolSummary.includes("V2 signal averages:") &&
        poolSummary.includes("V2 decision load:") &&
        poolSummary.includes("Correction loop:") &&
        poolSummary.includes("Top correction hotspots:") &&
        poolSummary.includes("Owner-review fixtures:") &&
        poolSummary.includes("## Quality Scorecard") &&
        poolSummary.includes("| Fixture | Score | Verify Safety | Feature Risk | Deferred | Next Action | Risk Notes |") &&
        poolSummary.includes("## Quality Scorecard V2") &&
        poolSummary.includes("| Fixture | Contract Precision | Behavior Strength | Overclaim Blocked | Adoption Ready | Owner Decisions | Hotspots |") &&
        poolSummary.includes("## Correction Loop") &&
        poolSummary.includes("| Fixture | Accepted | Edited | Deferred | Rejected | Load | Hotspots |") &&
        poolSummary.includes("`owner_review_spec_debt`") &&
        poolSummary.includes("`god-file-monolith-like`") &&
        poolSummary.includes("`contract-drift-like`") &&
        poolSummary.includes("`noise-heavy-hidden-signal-like`") &&
        poolSummary.includes("`thin-behavior-evidence-like`") &&
        poolSummary.includes(RETAKEOVER_POOL_METRICS_RELATIVE_PATH),
      error: `Expected messy legacy pool summaries and metrics. metrics=${JSON.stringify(poolMetrics, null, 2)}\nsummary=\n${poolSummary}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap synthetic messy legacy takeover stress execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(godFileRoot, { recursive: true, force: true });
    fs.rmSync(driftRoot, { recursive: true, force: true });
    fs.rmSync(hiddenSignalRoot, { recursive: true, force: true });
    fs.rmSync(thinBehaviorRoot, { recursive: true, force: true });
    fs.rmSync(poolRoot, { recursive: true, force: true });
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

async function runMessyTakeover(root: string, options: MessyFixtureOptions): Promise<MessyTakeoverResult> {
  const discover = runBootstrapDiscover({ root });
  const draft = await runBootstrapDraft({ root });
  const domainArtifact = draft.draftBundle.artifacts.find((artifact) => artifact.kind === "domain");
  const apiArtifact = draft.draftBundle.artifacts.find((artifact) => artifact.kind === "api");
  const featureArtifact = draft.draftBundle.artifacts.find((artifact) => artifact.kind === "feature");
  if (!domainArtifact || !apiArtifact || !featureArtifact) {
    throw new Error("Expected domain, API, and feature draft artifacts.");
  }

  await runBootstrapAdopt({
    root,
    session: draft.sessionId,
    decisions: [
      { artifactKind: "domain", kind: "accept" },
      { artifactKind: "api", kind: "accept" },
      {
        artifactKind: "feature",
        kind: options.featureDecision,
        note: options.featureDecision === "skip_as_spec_debt" ? "synthetic messy legacy behavior needs owner confirmation" : undefined,
      },
    ],
  });

  const domain = yaml.load(domainArtifact.content) as DomainDraft;
  const api = JSON.parse(apiArtifact.content) as ApiDraft;
  const feature = featureArtifact.content;
  const ranked = readRankedEvidence(root);
  const brief = fs.readFileSync(path.join(root, ".spec", "handoffs", "takeover-brief.md"), "utf-8");
  const verify = await runVerify({ root, useBaseline: true, applyWaivers: true });
  const metrics = writeMessyRetakeoverMetrics(root, options, {
    discover,
    domain,
    api,
    feature,
    ranked,
    verify,
  });
  const retakeoverSummary = fs.readFileSync(path.join(root, RETAKEOVER_SUMMARY_RELATIVE_PATH), "utf-8");

  return {
    discover,
    draft,
    domain,
    api,
    feature,
    ranked,
    brief,
    retakeoverSummary,
    verify,
    metrics,
  };
}

function writeMessyRetakeoverMetrics(
  root: string,
  options: MessyFixtureOptions,
  result: {
    discover: BootstrapDiscoverResult;
    domain: DomainDraft;
    api: ApiDraft;
    feature: string;
    ranked: AdoptionRankedEvidence;
    verify: VerifyRunResult;
  },
): RetakeoverMetrics {
  const acceptedArtifacts = ["domain", "api"];
  const deferredArtifacts: string[] = [];

  if (options.featureDecision === "skip_as_spec_debt") {
    deferredArtifacts.push("feature");
  } else {
    acceptedArtifacts.push("feature");
  }
  const adoptCorrection = buildRetakeoverAdoptCorrectionMetrics({
    acceptedArtifacts,
    deferredArtifacts,
    notes: options.featureDecision === "skip_as_spec_debt"
      ? { feature: "synthetic messy legacy behavior needs owner confirmation" }
      : undefined,
  });

  const metrics: RetakeoverMetrics = {
    version: 1,
    fixtureId: options.fixtureId,
    fixtureClass: options.fixtureClass,
    discoverSummary: result.discover.summary as unknown as Record<string, unknown>,
    topRankedEvidence: result.ranked.evidence.slice(0, 10).map((entry) => entry.path),
    draftQuality: {
      domainContextCount: collectDomainNames(result.domain).length,
      aggregateRootCount: collectAggregateNames(result.domain).length,
      apiSurfaceCount: result.api.api_spec?.surfaces?.length ?? 0,
      featureRecommendation: parseRetakeoverFeatureRecommendation(result.feature),
    },
    adoptCorrection,
    verifyVerdict: result.verify.verdict,
    verifyOk: result.verify.ok,
    qualityScorecard: buildRetakeoverQualityScorecard({
      rankedEvidence: result.ranked,
      discoverSummary: result.discover.summary as unknown as Record<string, unknown>,
      featureContent: result.feature,
      featureRecommendation: parseRetakeoverFeatureRecommendation(result.feature),
      acceptedArtifacts: adoptCorrection.acceptedArtifacts,
      deferredArtifacts: adoptCorrection.deferredArtifacts,
      editedArtifacts: adoptCorrection.editedArtifacts,
      rejectedArtifacts: adoptCorrection.rejectedArtifacts,
      verifyOk: result.verify.ok,
    }),
  };

  writeRetakeoverArtifacts(root, metrics);
  return metrics;
}

function seedGodFileMonolith(root: string): void {
  writeProject(root, "god-file-monolith-like", {
    packs: [],
    customPacks: [
      {
        id: "synthetic-commerce",
        title: "Synthetic Commerce",
        terms: [
          { label: "order", phrases: ["order", "checkout", "fulfillment"], weight: 120, aggregate_name: "Order" },
          { label: "payment", phrases: ["payment", "capture", "refund"], weight: 112, aggregate_name: "Payment" },
          { label: "inventory", phrases: ["inventory", "stock", "warehouse"], weight: 108, aggregate_name: "InventoryItem" },
          { label: "customer", phrases: ["customer", "account", "profile"], weight: 104, aggregate_name: "CustomerAccount" },
          { label: "reporting", phrases: ["reporting", "report", "export"], weight: 98, aggregate_name: "Report" },
        ],
        path_hints: [
          { label: "order", patterns: ["order", "checkout"], boost: 18 },
          { label: "payment", patterns: ["payment", "refund"], boost: 16 },
          { label: "inventory", patterns: ["inventory", "stock"], boost: 14 },
          { label: "customer", patterns: ["customer"], boost: 12 },
        ],
      },
    ],
  });
  writeText(
    root,
    "README.md",
    [
      "# Legacy Commerce Admin",
      "",
      "One old server file handles order intake, payment capture, inventory reservation, customer notes, and reporting exports.",
      "Nobody trusts the function names; owner review is required before behavior is treated as a contract.",
    ].join("\n"),
  );
  writeText(
    root,
    "src/server.js",
    [
      "const app = { get: () => undefined, post: () => undefined };",
      "function doThing(x) { return x; }",
      "function handleData(input) { return doThing(input); }",
      "app.post('/orders/submit', (req, res) => handleData(req));",
      "app.post('/payments/capture', (req, res) => handleData(req));",
      "app.post('/inventory/reserve', (req, res) => handleData(req));",
      "app.get('/customers/:id', (req, res) => handleData(req));",
      "app.get('/reports/daily', (req, res) => handleData(req));",
      "function process2() { return ['orders', 'payments', 'inventory', 'customers', 'reports']; }",
      "module.exports = { doThing, handleData, process2 };",
      "",
    ].join("\n"),
  );
  writeText(root, "src/utils/misc.js", "export function misc(value) { return value; }\n");
}

function seedContractDriftRepository(root: string): void {
  writeProject(root, "contract-drift-like", {
    packs: [],
    customPacks: [
      {
        id: "synthetic-checkout",
        title: "Synthetic Checkout",
        terms: [
          { label: "checkout", phrases: ["checkout", "cart checkout", "order submit"], weight: 120, aggregate_name: "Checkout" },
          { label: "order", phrases: ["order", "submitted order"], weight: 110, aggregate_name: "Order" },
        ],
        path_hints: [
          { label: "checkout", patterns: ["checkout", "cart"], boost: 18 },
          { label: "order", patterns: ["order"], boost: 12 },
        ],
      },
    ],
  });
  writeText(
    root,
    "README.md",
    [
      "# Checkout Service",
      "",
      "Public docs still tell integrators to call POST /checkout for cart checkout.",
      "Owner review must reconcile the legacy route and generated contract before adoption.",
    ].join("\n"),
  );
  writeText(
    root,
    "docs/openapi/openapi.yaml",
    [
      "openapi: 3.0.3",
      "info:",
      "  title: Checkout API",
      "  version: 0.1.0",
      "paths:",
      "  /api/v1/cart/checkout:",
      "    post:",
      "      operationId: checkoutCart",
      "      responses:",
      "        '200':",
      "          description: accepted",
      "",
    ].join("\n"),
  );
  writeText(
    root,
    "schemas/cart-checkout.schema.json",
    JSON.stringify(
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        title: "CartCheckoutCommand",
        type: "object",
        properties: {
          basket_id: { type: "string" },
          requested_total: { type: "number" },
        },
      },
      null,
      2,
    ),
  );
  writeText(
    root,
    "src/routes/order-submit.ts",
    [
      "const router = { post: () => undefined };",
      'router.post("/order/submit", async () => ({ accepted: true }));',
      "export default router;",
      "",
    ].join("\n"),
  );
}

function seedNoiseHeavyHiddenSignalRepository(root: string): void {
  writeProject(root, "noise-heavy-hidden-signal-like", {
    packs: [],
    customPacks: [
      {
        id: "synthetic-fulfillment",
        title: "Synthetic Fulfillment",
        terms: [
          {
            label: "checkout",
            phrases: ["checkout", "checkout flow", "cart checkout"],
            weight: 122,
            aggregate_name: "Checkout",
            scenario: {
              scenarioName: "Checkout flow preserves reservation and payment evidence",
              given: "a cart is ready for checkout",
              when: "checkout is submitted through the service boundary",
              then: "reservation and payment evidence remain reviewable",
            },
          },
          {
            label: "order",
            phrases: ["order", "order reservation"],
            weight: 110,
            aggregate_name: "Order",
            scenario: {
              scenarioName: "Order reservation is recorded before fulfillment",
              given: "inventory is available for a requested item",
              when: "the order reservation is accepted",
              then: "fulfillment can trace the reservation decision",
            },
          },
        ],
        path_hints: [
          { label: "checkout", patterns: ["checkout"], boost: 18 },
          { label: "order", patterns: ["order"], boost: 12 },
        ],
      },
    ],
  });
  writeText(root, "README.md", "# Hidden Checkout Signals\n\nThe real service evidence is buried under service-local contracts.\n");
  writeText(
    root,
    "services/checkout/docs/checkout-flow.md",
    [
      "# Checkout Flow",
      "",
      "Checkout flow coordinates cart checkout, order reservation, and payment evidence.",
      "The route, OpenAPI contract, schema, and test are the intended takeover anchors.",
    ].join("\n"),
  );
  writeText(
    root,
    "services/checkout/contracts/openapi.yaml",
    [
      "openapi: 3.0.3",
      "info:",
      "  title: Checkout API",
      "  version: 0.1.0",
      "paths:",
      "  /checkout/submit:",
      "    post:",
      "      operationId: submitCheckout",
      "      responses:",
      "        '200':",
      "          description: accepted",
      "",
    ].join("\n"),
  );
  writeText(
    root,
    "services/checkout/contracts/order.schema.json",
    JSON.stringify({ title: "OrderReservation", type: "object", properties: { order_id: { type: "string" } } }, null, 2),
  );
  writeText(
    root,
    "services/checkout/src/routes.ts",
    [
      "const app = { post: () => undefined };",
      'app.post("/checkout/submit", () => ({ accepted: true }));',
      "",
    ].join("\n"),
  );
  writeText(root, "services/checkout/tests/checkout.test.ts", "describe('checkout flow preserves reservation and payment evidence', () => {});\n");

  for (let index = 0; index < 6; index += 1) {
    writeText(root, `vendor/pkg${index}/README.md`, "# vendored package\n");
    writeText(root, `dist/chunk${index}.bundle.js`, "function bundled(){return true;}\n");
    writeText(root, `.cache/tool/${index}.json`, JSON.stringify({ cached: true }));
    writeText(root, `coverage/html/${index}.html`, "<html></html>\n");
    writeText(root, `generated/api/client${index}.ts`, "export const generated = true;\n");
  }
}

function seedThinBehaviorEvidenceRepository(root: string): void {
  writeProject(root, "thin-behavior-evidence-like", {
    packs: [],
    customPacks: [
      {
        id: "synthetic-support",
        title: "Synthetic Support",
        terms: [
          { label: "ticket", phrases: ["ticket", "case"], weight: 112, aggregate_name: "SupportTicket" },
          { label: "escalation", phrases: ["escalation", "manual review"], weight: 106, aggregate_name: "Escalation" },
        ],
        path_hints: [
          { label: "ticket", patterns: ["ticket"], boost: 16 },
          { label: "escalation", patterns: ["escalation"], boost: 14 },
        ],
      },
    ],
  });
  writeText(root, "README.md", "# Support Intake\n\nRoutes and schemas exist, but behavior evidence is intentionally thin.\n");
  writeText(
    root,
    "schemas/ticket.schema.json",
    JSON.stringify({ title: "SupportTicket", type: "object", properties: { ticket_id: { type: "string" } } }, null, 2),
  );
  writeText(
    root,
    "src/routes/tickets.ts",
    [
      "const app = { get: () => undefined, post: () => undefined };",
      'app.post("/tickets", () => ({ accepted: true }));',
      'app.post("/tickets/:id/escalate", () => ({ accepted: true }));',
      "",
    ].join("\n"),
  );
}

function writeProject(
  root: string,
  id: string,
  taxonomy: {
    packs: string[];
    customPacks: Array<Record<string, unknown>>;
  },
): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    yaml.dump({
      id,
      name: id,
      version: "0.1.0",
      delivery_model: "bootstrap-takeover",
      domain_taxonomy: {
        packs: taxonomy.packs,
        custom_packs: taxonomy.customPacks,
      },
      source_documents: {
        requirements: "README.md",
        technical_solution: "README.md",
      },
      global_gates: ["contracts_validated"],
    }),
    "utf-8",
  );
}

function writeText(root: string, repoPath: string, content: string): void {
  const absolutePath = path.join(root, repoPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf-8");
}

function readRankedEvidence(root: string): AdoptionRankedEvidence {
  return JSON.parse(
    fs.readFileSync(path.join(root, ".spec", "facts", "bootstrap", "adoption-ranked-evidence.json"), "utf-8"),
  ) as AdoptionRankedEvidence;
}

function collectDomainNames(domain: DomainDraft): string[] {
  return unique([
    ...(domain.domain?.primary_contexts ?? []),
    ...(domain.domain?.areas ?? []).map((area) => area.name).filter((name): name is string => Boolean(name)),
  ]);
}

function collectAggregateNames(domain: DomainDraft): string[] {
  return unique((domain.domain?.aggregate_roots ?? []).map((aggregate) => aggregate.name).filter((name): name is string => Boolean(name)));
}

function excludedRuleIds(ranked: AdoptionRankedEvidence): string[] {
  return ranked.excludedSummary.rules.map((rule) => rule.ruleId);
}

function countScenarios(feature: string): number {
  return (feature.match(/^  Scenario:/gm) ?? []).length;
}

function containsAll(values: string[], expected: string[]): boolean {
  return expected.every((value) => values.includes(value));
}

function containsAny(values: string[], expected: string[]): boolean {
  return expected.some((value) => values.includes(value));
}

function containsPathFragment(values: string[], fragments: string[]): boolean {
  return values.some((value) => fragments.some((fragment) => value.includes(fragment)));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right));
}

void main();
