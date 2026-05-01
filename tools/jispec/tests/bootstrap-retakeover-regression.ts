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
    proto_service_mappings?: ProtoServiceMappingDraft[];
    business_vocabulary?: Array<{ label?: string; phrase?: string; source_path?: string }>;
  };
}

interface ApiDraft {
  api_spec?: {
    surface_summary?: Record<string, number>;
    surfaces?: ApiSurfaceDraft[];
    proto_service_mappings?: ProtoServiceMappingDraft[];
  };
}

interface ApiSurfaceDraft {
  surface_kind?: string;
  service?: string;
  operation?: string;
  bounded_context?: string;
  context_labels?: string[];
  aggregate_roots?: string[];
  method?: string;
  path?: string;
}

interface ProtoServiceMappingDraft {
  service?: string;
  bounded_context?: string;
  context_labels?: string[];
  aggregate_roots?: string[];
}

interface RetakeoverResult {
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

interface RetakeoverFixtureOptions {
  fixtureId: string;
  fixtureClass: RetakeoverFixtureClass;
  domainDecision?: "accept" | "edit";
  apiDecision?: "accept";
  featureDecision: "accept" | "skip_as_spec_debt" | "reject";
}

async function main(): Promise<void> {
  console.log("=== Bootstrap Real-Retakeover Regression Fixtures Test ===\n");

  const remirageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-retakeover-remirage-"));
  const breathRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-retakeover-breath-"));
  const scatteredRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-retakeover-scattered-"));
  const monorepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-retakeover-monorepo-"));
  const fullstackRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-retakeover-fullstack-"));
  const debtRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-retakeover-debt-"));
  const poolRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-retakeover-pool-"));
  const results: TestResult[] = [];

  try {
    seedReMirageLikeRepository(remirageRoot);
    seedBreathofEarthLikeRepository(breathRoot);
    seedScatteredContractsRepository(scatteredRoot);
    seedMultiLanguageMonorepoRepository(monorepoRoot);
    seedFrontendBackendMixedRepository(fullstackRoot);
    seedHistoricalDebtServiceRepository(debtRoot);

    const remirage = await runRetakeover(remirageRoot, {
      fixtureId: "remirage-like",
      fixtureClass: "high-noise-protocol-repo",
      domainDecision: "edit",
      featureDecision: "accept",
    });
    const breath = await runRetakeover(breathRoot, {
      fixtureId: "breathofearth-like",
      fixtureClass: "multilingual-finance-service-repo",
      featureDecision: "skip_as_spec_debt",
    });
    const scattered = await runRetakeover(scatteredRoot, {
      fixtureId: "scattered-contracts-like",
      fixtureClass: "docs-api-schema-scattered-repo",
      featureDecision: "accept",
    });
    const monorepo = await runRetakeover(monorepoRoot, {
      fixtureId: "retail-ops-monorepo-like",
      fixtureClass: "multi-language-monorepo-repo",
      featureDecision: "reject",
    });
    const fullstack = await runRetakeover(fullstackRoot, {
      fixtureId: "member-portal-fullstack-like",
      fixtureClass: "frontend-backend-mixed-repo",
      featureDecision: "skip_as_spec_debt",
    });
    const debt = await runRetakeover(debtRoot, {
      fixtureId: "legacy-saas-debt-like",
      fixtureClass: "historical-debt-service-repo",
      featureDecision: "skip_as_spec_debt",
    });
    const allFixtures = [remirage, breath, scattered, monorepo, fullstack, debt];
    writeRetakeoverPoolArtifacts(poolRoot, allFixtures.map((fixture) => fixture.metrics));
    const poolMetrics = JSON.parse(
      fs.readFileSync(path.join(poolRoot, RETAKEOVER_POOL_METRICS_RELATIVE_PATH), "utf-8"),
    ) as {
      fixtureCount?: number;
      fixtureClasses?: string[];
      verify?: { okCount?: number; blockingCount?: number; verdicts?: Record<string, number> };
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

    const remirageRankedPaths = remirage.ranked.evidence.map((entry) => entry.path);
    const remirageExcludedRules = excludedRuleIds(remirage.ranked);
    const remirageContexts = collectDomainNames(remirage.domain);
    const remirageAggregates = collectAggregateNames(remirage.domain);
    const remirageSurfaces = remirage.api.api_spec?.surfaces ?? [];

    results.push({
      name: "ReMirage-like fixture excludes audit/dependency gravity and promotes protocol evidence",
      passed:
        remirage.ranked.excludedSummary.totalExcludedFileCount >= 8 &&
        containsAll(remirageExcludedRules, ["audit-artifact", "dependency-bundle"]) &&
        !containsPathFragment(remirageRankedPaths, ["artifacts/", ".pydeps/", "vendor/", "node_modules/"]) &&
        containsAll(remirageRankedPaths.slice(0, 8), [
          "docs/governance/README.md",
          "docs/protocols/README.md",
          "mirage-os/api/proto/gateway.proto",
        ]) &&
        containsAny(remirageRankedPaths.slice(0, 10), [
          "mirage-os/api/proto/billing.proto",
          "mirage-os/api/proto/cell.proto",
          "mirage-proto/control_command.proto",
        ]),
      error: `Expected ReMirage-like ranked evidence to suppress noisy mirrors and promote protocol docs/schemas. ranked=${JSON.stringify(remirage.ranked.evidence)}, excluded=${JSON.stringify(remirage.ranked.excludedSummary)}.`,
    });

    results.push({
      name: "ReMirage-like fixture maps proto services into domain and API contracts",
      passed:
        containsAll(remirageContexts, ["gateway", "control-plane", "protocol"]) &&
        containsAll(remirageAggregates, ["Gateway", "ControlCommand", "BillingAccount", "Cell", "Session"]) &&
        (remirage.api.api_spec?.surface_summary?.protobuf_service ?? 0) >= 3 &&
        hasProtoSurface(remirageSurfaces, "GatewayService", "gateway-control-plane", ["Gateway", "ControlCommand"]) &&
        hasProtoSurface(remirageSurfaces, "BillingService", "billing-account", ["BillingAccount"]) &&
        hasProtoSurface(remirageSurfaces, "CellService", "cell-runtime", ["Cell", "Session"]),
      error: `Expected proto-backed domain/API mapping. contexts=${JSON.stringify(remirageContexts)}, aggregates=${JSON.stringify(remirageAggregates)}, api=${JSON.stringify(remirage.api)}.`,
    });

    results.push({
      name: "ReMirage-like feature and takeover brief are adoptable decision packets",
      passed:
        remirage.feature.includes("# adoption_recommendation: accept_candidate") &&
        remirage.feature.includes("Scenario: Gateway strategy switch preserves transport continuity") &&
        remirage.feature.includes("Scenario: Protocol contract keeps producer and consumer behavior aligned") &&
        remirage.feature.includes("protobuf service mapping anchors the boundary") &&
        !remirage.feature.includes("@behavior_needs_human_review") &&
        remirage.brief.includes("Recommendation: `accept_candidate`") &&
        remirage.brief.includes("Feature draft can be adopted as an initial behavior contract") &&
        remirage.brief.includes("No draft artifacts were deferred as spec debt"),
      error: `Expected ReMirage-like feature/brief to pass confidence gate.\nFeature:\n${remirage.feature}\nBrief:\n${remirage.brief}`,
    });

    const breathRankedPaths = breath.ranked.evidence.map((entry) => entry.path);
    const breathExcludedRules = excludedRuleIds(breath.ranked);
    const breathContexts = collectDomainNames(breath.domain);
    const breathAggregates = collectAggregateNames(breath.domain);
    const breathVocabulary = (breath.domain.domain?.business_vocabulary ?? []).map((entry) => entry.label).filter((label): label is string => Boolean(label));
    const breathSurfaces = breath.api.api_spec?.surfaces ?? [];

    results.push({
      name: "BreathofEarth-like fixture excludes Python cache noise and promotes schema plus Chinese docs",
      passed:
        breath.ranked.excludedSummary.totalExcludedFileCount >= 3 &&
        breathExcludedRules.includes("python-cache-or-env") &&
        !containsPathFragment(breathRankedPaths, [".pytest_cache/", ".ruff_cache/", "__pycache__/"]) &&
        containsAll(breathRankedPaths.slice(0, 15), [
          "db/schema_governance.sql",
          "db/schema_broker_sync.sql",
          "docs/finance-overview.md",
        ]) &&
        containsAny(breathRankedPaths.slice(0, 15), [
          "db/schema_alpha.sql",
          "db/schema_shadow_run.sql",
          "docs/system-design.md",
        ]),
      error: `Expected BreathofEarth-like ranked evidence to suppress caches and promote schemas/docs. ranked=${JSON.stringify(breath.ranked.evidence)}, excluded=${JSON.stringify(breath.ranked.excludedSummary)}.`,
    });

    results.push({
      name: "BreathofEarth-like domain draft captures finance/governance vocabulary and aggregate roots",
      passed:
        containsAll(breathContexts, ["portfolio", "governance", "ledger"]) &&
        containsAny(breathContexts, ["broker-sync", "alpha-ledger", "reporting", "withdrawal"]) &&
        containsAll(breathVocabulary, ["portfolio", "governance", "broker-sync", "alpha-ledger", "reporting"]) &&
        containsAll(breathAggregates, ["Portfolio", "GovernanceDecision", "Ledger", "BrokerSyncRun", "AlphaLedger"]),
      error: `Expected finance/governance vocabulary and aggregates. contexts=${JSON.stringify(breathContexts)}, vocabulary=${JSON.stringify(breathVocabulary)}, aggregates=${JSON.stringify(breathAggregates)}.`,
    });

    results.push({
      name: "BreathofEarth-like API, feature gate, and takeover brief remain owner-reviewable",
      passed:
        (breath.api.api_spec?.surface_summary?.explicit_endpoint ?? 0) >= 2 &&
        breathSurfaces.some((surface) => surface.surface_kind === "explicit_endpoint" && surface.path === "/portfolio/rebalance") &&
        breathSurfaces.some((surface) => surface.surface_kind === "explicit_endpoint" && surface.path === "/ledger/entries") &&
        breath.feature.includes("Feature: Bootstrap discovered behaviors") &&
        breath.feature.includes("Scenario:") &&
        breath.feature.includes("# adoption_recommendation: defer_as_spec_debt") &&
        breath.feature.includes("@behavior_needs_human_review") &&
        breath.brief.includes("Recommendation: `defer_as_spec_debt`") &&
        breath.brief.includes("owner confirms the tagged behavior scenarios") &&
        breath.brief.includes(".spec/spec-debt/"),
      error: `Expected BreathofEarth-like API surfaces and reviewable feature gate.\nAPI=${JSON.stringify(breath.api)}\nFeature:\n${breath.feature}\nBrief:\n${breath.brief}`,
    });

    const scatteredRankedPaths = scattered.ranked.evidence.map((entry) => entry.path);
    const scatteredContexts = collectDomainNames(scattered.domain);
    const scatteredAggregates = collectAggregateNames(scattered.domain);
    const scatteredSurfaces = scattered.api.api_spec?.surfaces ?? [];

    results.push({
      name: "Scattered contracts fixture promotes docs, OpenAPI, JSON schemas, and explicit endpoints together",
      passed:
        scattered.ranked.summary.selectedCount >= 8 &&
        scattered.discover.summary.documentCount >= 3 &&
        scattered.discover.summary.schemaCount >= 3 &&
        scattered.discover.summary.routeCount >= 2 &&
        containsAll(scatteredRankedPaths.slice(0, 15), [
          "docs/product/portfolio-control.md",
          "services/api/openapi/openapi.yaml",
          "packages/contracts/schemas/portfolio-command.schema.json",
        ]) &&
        containsAny(scatteredRankedPaths.slice(0, 15), [
          "services/node/src/routes/portfolio.ts",
          "services/python/api/ledger_routes.py",
          "/portfolio/rebalance",
        ]),
      error: `Expected scattered fixture to promote distributed docs/API/schema evidence. summary=${JSON.stringify(scattered.discover.summary)}, ranked=${JSON.stringify(scattered.ranked.evidence)}.`,
    });

    results.push({
      name: "Scattered contracts fixture joins dispersed assets into finance governance contracts",
      passed:
        containsAll(scatteredContexts, ["portfolio", "governance", "ledger"]) &&
        containsAll(scatteredAggregates, ["Portfolio", "GovernanceDecision", "Ledger"]) &&
        (scattered.api.api_spec?.surface_summary?.openapi_contract ?? 0) >= 1 &&
        (scattered.api.api_spec?.surface_summary?.explicit_endpoint ?? 0) >= 2 &&
        scatteredSurfaces.some((surface) =>
          surface.surface_kind === "openapi_contract" &&
          surface.path === "/portfolio/rebalance" &&
          surface.operation === "rebalancePortfolio",
        ) &&
        scatteredSurfaces.some((surface) =>
          surface.surface_kind === "explicit_endpoint" &&
          surface.path === "/ledger/entries",
        ),
      error: `Expected scattered fixture to synthesize finance/governance contracts. contexts=${JSON.stringify(scatteredContexts)}, aggregates=${JSON.stringify(scatteredAggregates)}, api=${JSON.stringify(scattered.api)}.`,
    });

    const monorepoRankedPaths = monorepo.ranked.evidence.map((entry) => entry.path);
    const monorepoContexts = collectDomainNames(monorepo.domain);
    const monorepoAggregates = collectAggregateNames(monorepo.domain);
    const monorepoSurfaces = monorepo.api.api_spec?.surfaces ?? [];

    results.push({
      name: "Multi-language monorepo fixture promotes service-local contracts without letting build outputs dominate",
      passed:
        monorepo.ranked.excludedSummary.totalExcludedFileCount >= 6 &&
        !containsPathFragment(monorepoRankedPaths, ["target/", ".gradle/", "build/", "coverage/", "generated/"]) &&
        containsAll(monorepoRankedPaths.slice(0, 15), [
          "docs/architecture/service-map.md",
          "services/orders/contracts/openapi.yaml",
          "services/inventory/proto/inventory.proto",
          "packages/contracts/schemas/fulfillment-task.schema.json",
        ]) &&
        containsAll(monorepoContexts, ["order", "inventory", "fulfillment"]) &&
        containsAll(monorepoAggregates, ["Order", "InventoryItem", "FulfillmentTask"]) &&
        (monorepo.api.api_spec?.surface_summary?.openapi_contract ?? 0) >= 1 &&
        (monorepo.api.api_spec?.surface_summary?.protobuf_service ?? 0) >= 1 &&
        monorepoSurfaces.some((surface) => surface.surface_kind === "explicit_endpoint" && surface.path === "/orders/:id/ship"),
      error: `Expected multi-language monorepo fixture to connect service docs/contracts/proto/handlers. ranked=${JSON.stringify(monorepo.ranked.evidence)}, contexts=${JSON.stringify(monorepoContexts)}, aggregates=${JSON.stringify(monorepoAggregates)}, api=${JSON.stringify(monorepo.api)}.`,
    });

    const fullstackRankedPaths = fullstack.ranked.evidence.map((entry) => entry.path);
    const fullstackContexts = collectDomainNames(fullstack.domain);
    const fullstackAggregates = collectAggregateNames(fullstack.domain);
    const fullstackSurfaces = fullstack.api.api_spec?.surfaces ?? [];
    const fullstackSourceFiles = fullstack.discover.graph.sourceFiles.map((sourceFile) => sourceFile.path);

    results.push({
      name: "Frontend-backend mixed fixture links user journeys, UI routes, API contracts, and backend handlers",
      passed:
        containsAll(fullstackRankedPaths.slice(0, 15), [
          "docs/product/member-journeys.md",
          "services/api/openapi/openapi.yaml",
          "packages/contracts/schemas/plan-change.schema.json",
        ]) &&
        fullstackSourceFiles.includes("apps/web/src/routes/plan-change.tsx") &&
        containsAll(fullstackContexts, ["membership", "billing", "notification"]) &&
        containsAll(fullstackAggregates, ["Membership", "BillingAccount", "Notification"]) &&
        fullstackSurfaces.some((surface) => surface.surface_kind === "openapi_contract" && surface.path === "/members/{memberId}/plan") &&
        fullstackSurfaces.some((surface) => surface.surface_kind === "explicit_endpoint" && surface.path === "/members/:id/plan") &&
        fullstack.feature.includes("# adoption_recommendation: defer_as_spec_debt") &&
        fullstack.feature.includes("@behavior_needs_human_review") &&
        fullstack.metrics.adoptCorrection.deferredArtifacts.includes("feature") &&
        fullstack.metrics.qualityScorecard.nextAction === "owner_review_spec_debt",
      error: `Expected fullstack fixture to join product journey, UI, API, and backend evidence while keeping behavior owner-reviewed. ranked=${JSON.stringify(fullstack.ranked.evidence)}, sourceFiles=${JSON.stringify(fullstackSourceFiles)}, contexts=${JSON.stringify(fullstackContexts)}, aggregates=${JSON.stringify(fullstackAggregates)}, api=${JSON.stringify(fullstack.api)}, feature=\n${fullstack.feature}`,
    });

    const debtRankedPaths = debt.ranked.evidence.map((entry) => entry.path);
    const debtContexts = collectDomainNames(debt.domain);
    const debtAggregates = collectAggregateNames(debt.domain);
    const debtSurfaces = debt.api.api_spec?.surfaces ?? [];

    results.push({
      name: "Historical debt fixture keeps migrated and legacy boundaries reviewable without overclaiming behavior",
      passed:
        containsAll(debtRankedPaths.slice(0, 15), [
          "docs/debt/spec-debt-ledger.md",
          "docs/contracts/subscription-lifecycle.md",
          "api/openapi/openapi.yaml",
          "/legacy/subscriptions/:id/renew",
        ]) &&
        containsAll(debtContexts, ["subscription", "invoice", "entitlement"]) &&
        containsAll(debtAggregates, ["Subscription", "Invoice", "Entitlement"]) &&
        debtSurfaces.some((surface) => surface.surface_kind === "openapi_contract" && surface.path === "/subscriptions/{id}/renew") &&
        debtSurfaces.some((surface) => surface.surface_kind === "explicit_endpoint" && surface.path === "/legacy/subscriptions/:id/renew") &&
        debt.feature.includes("# adoption_recommendation: defer_as_spec_debt") &&
        debt.feature.includes("@behavior_needs_human_review") &&
        debt.brief.includes("Recommendation: `defer_as_spec_debt`") &&
        debt.metrics.adoptCorrection.deferredArtifacts.includes("feature") &&
        debt.metrics.qualityScorecard.nextAction === "owner_review_spec_debt",
      error: `Expected historical debt fixture to expose migrated/legacy boundaries and defer weak behavior. ranked=${JSON.stringify(debt.ranked.evidence)}, contexts=${JSON.stringify(debtContexts)}, aggregates=${JSON.stringify(debtAggregates)}, api=${JSON.stringify(debt.api)}, feature=\n${debt.feature}`,
    });

    results.push({
      name: "Retakeover pool records ranking, draft quality, adopt corrections, and verify verdict per fixture",
      passed:
        allFixtures.every((result) =>
          result.metrics.version === 1 &&
          result.metrics.topRankedEvidence.length > 0 &&
          result.metrics.draftQuality.domainContextCount > 0 &&
          result.metrics.draftQuality.apiSurfaceCount > 0 &&
          result.metrics.verifyOk &&
          result.metrics.qualityScorecard.verifySafety === "non_blocking" &&
          result.metrics.qualityScorecard.takeoverReadinessScore > 0 &&
          result.metrics.qualityScorecard.topEvidenceSignalRate >= 0.5 &&
          result.metrics.qualityScorecard.contractSignalPrecision >= 0.4 &&
          result.metrics.qualityScorecard.behaviorEvidenceStrength >= 0 &&
          result.metrics.qualityScorecard.overclaimBlockRate >= 0 &&
          result.metrics.qualityScorecard.adoptionReadyArtifactCount >= 2 &&
          result.metrics.qualityScorecard.needsOwnerDecisionCount >= 0 &&
          Array.isArray(result.metrics.qualityScorecard.humanCorrectionHotspots) &&
          result.metrics.qualityScorecard.riskNotes.length > 0 &&
          fs.existsSync(path.join(result.discover.graph.repoRoot, RETAKEOVER_METRICS_RELATIVE_PATH)),
        ) &&
        remirage.metrics.fixtureClass === "high-noise-protocol-repo" &&
        breath.metrics.fixtureClass === "multilingual-finance-service-repo" &&
        scattered.metrics.fixtureClass === "docs-api-schema-scattered-repo" &&
        monorepo.metrics.fixtureClass === "multi-language-monorepo-repo" &&
        fullstack.metrics.fixtureClass === "frontend-backend-mixed-repo" &&
        debt.metrics.fixtureClass === "historical-debt-service-repo" &&
        remirage.metrics.qualityScorecard.featureOverclaimRisk === "low" &&
        remirage.metrics.qualityScorecard.nextAction === "owner_review_spec_debt" &&
        breath.metrics.qualityScorecard.nextAction === "owner_review_spec_debt" &&
        scattered.metrics.qualityScorecard.featureOverclaimRisk === "high" &&
        scattered.metrics.qualityScorecard.nextAction === "owner_review_spec_debt" &&
        monorepo.metrics.qualityScorecard.nextAction === "owner_review_spec_debt" &&
        fullstack.metrics.qualityScorecard.nextAction === "owner_review_spec_debt" &&
        debt.metrics.qualityScorecard.nextAction === "owner_review_spec_debt" &&
        breath.metrics.adoptCorrection.deferredArtifacts.includes("feature") &&
        remirage.metrics.adoptCorrection.editedArtifacts.includes("domain") &&
        remirage.metrics.adoptCorrection.correctionHotspots.includes("edited_domain") &&
        remirage.metrics.adoptCorrection.acceptedArtifacts.includes("feature") &&
        scattered.metrics.adoptCorrection.acceptedArtifacts.includes("feature") &&
        monorepo.metrics.adoptCorrection.rejectedArtifacts.includes("feature") &&
        fullstack.metrics.adoptCorrection.deferredArtifacts.includes("feature") &&
        debt.metrics.adoptCorrection.deferredArtifacts.includes("feature"),
      error: `Expected each retakeover fixture to record metrics. metrics=${JSON.stringify(allFixtures.map((fixture) => fixture.metrics), null, 2)}.`,
    });

    results.push({
      name: "Retakeover pool writes human-readable summary companion artifacts",
      passed:
        allFixtures.every((result) =>
          fs.existsSync(path.join(result.discover.graph.repoRoot, RETAKEOVER_SUMMARY_RELATIVE_PATH)) &&
          result.retakeoverSummary.includes("# JiSpec Retakeover Summary") &&
          result.retakeoverSummary.includes(`Fixture: \`${result.metrics.fixtureId}\``) &&
          result.retakeoverSummary.includes(`Fixture class: \`${result.metrics.fixtureClass}\``) &&
          result.retakeoverSummary.includes("## Decision") &&
          result.retakeoverSummary.includes("## Discover Ranking") &&
          result.retakeoverSummary.includes("## Review Questions") &&
          result.retakeoverSummary.includes("Top ranked evidence:") &&
          result.retakeoverSummary.includes("Draft quality:") &&
          result.retakeoverSummary.includes("Adopt correction:") &&
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
          result.retakeoverSummary.includes("### Risk Notes") &&
          result.retakeoverSummary.includes("Next action:") &&
          result.retakeoverSummary.includes(`Verify verdict: \`${result.metrics.verifyVerdict}\``) &&
          result.retakeoverSummary.includes(RETAKEOVER_METRICS_RELATIVE_PATH) &&
          result.retakeoverSummary.includes("not a machine API"),
        ) &&
        breath.retakeoverSummary.includes("explicit spec debt follow-up") &&
        remirage.retakeoverSummary.includes("edited_domain") &&
        scattered.retakeoverSummary.includes("initial adopted contract packet") &&
        debt.retakeoverSummary.includes("explicit spec debt follow-up"),
      error: `Expected retakeover summaries to be human decision packets. summaries=${JSON.stringify(allFixtures.map((fixture) => fixture.retakeoverSummary), null, 2)}.`,
    });

    results.push({
      name: "Retakeover pool covers the expanded P0-T1 real-like fixture classes",
      passed:
        new Set(allFixtures.map((fixture) => fixture.metrics.fixtureClass)).size === 6 &&
        containsAll(
          allFixtures.map((fixture) => fixture.metrics.fixtureClass),
          [
            "high-noise-protocol-repo",
            "multilingual-finance-service-repo",
            "docs-api-schema-scattered-repo",
            "multi-language-monorepo-repo",
            "frontend-backend-mixed-repo",
            "historical-debt-service-repo",
          ],
        ),
      error: `Expected P0-T1 fixture pool to cover high-noise, multilingual, scattered docs/API/schema, monorepo, fullstack, and historical debt classes. metrics=${JSON.stringify(allFixtures.map((fixture) => fixture.metrics))}.`,
    });

    results.push({
      name: "Retakeover pool writes aggregate metrics and a human-readable pool summary",
      passed:
        fs.existsSync(path.join(poolRoot, RETAKEOVER_POOL_METRICS_RELATIVE_PATH)) &&
        fs.existsSync(path.join(poolRoot, RETAKEOVER_POOL_SUMMARY_RELATIVE_PATH)) &&
        poolMetrics.fixtureCount === 6 &&
        poolMetrics.verify?.okCount === 6 &&
        poolMetrics.verify?.blockingCount === 0 &&
        poolMetrics.draftQuality?.featureRecommendations?.accept_candidate === 2 &&
        poolMetrics.draftQuality?.featureRecommendations?.defer_as_spec_debt === 4 &&
        poolMetrics.adoptCorrection?.fixturesWithDeferredArtifacts?.includes("breathofearth-like") === true &&
        poolMetrics.adoptCorrection?.fixturesWithDeferredArtifacts?.includes("member-portal-fullstack-like") === true &&
        poolMetrics.adoptCorrection?.fixturesWithDeferredArtifacts?.includes("legacy-saas-debt-like") === true &&
        poolMetrics.adoptCorrection?.fixturesWithEditedArtifacts?.includes("remirage-like") === true &&
        poolMetrics.adoptCorrection?.fixturesWithRejectedArtifacts?.includes("retail-ops-monorepo-like") === true &&
        poolMetrics.adoptCorrection?.deferredArtifactCount === 3 &&
        poolMetrics.adoptCorrection?.editedArtifactCount === 1 &&
        poolMetrics.adoptCorrection?.rejectedArtifactCount === 1 &&
        poolMetrics.adoptCorrection?.ownerReviewArtifactCount === 5 &&
        typeof poolMetrics.adoptCorrection?.totalCorrectionLoad === "number" &&
        poolMetrics.adoptCorrection?.topCorrectionHotspots?.some((hotspot) => hotspot.startsWith("deferred_feature:")) === true &&
        poolMetrics.adoptCorrection?.topCorrectionHotspots?.some((hotspot) => hotspot.startsWith("edited_domain:")) === true &&
        poolMetrics.adoptCorrection?.topCorrectionHotspots?.some((hotspot) => hotspot.startsWith("rejected_feature:")) === true &&
        typeof poolMetrics.qualityScorecard?.averageTakeoverReadinessScore === "number" &&
        typeof poolMetrics.qualityScorecard?.lowestReadinessScore === "number" &&
        typeof poolMetrics.qualityScorecard?.averageContractSignalPrecision === "number" &&
        typeof poolMetrics.qualityScorecard?.averageBehaviorEvidenceStrength === "number" &&
        typeof poolMetrics.qualityScorecard?.averageOverclaimBlockRate === "number" &&
        typeof poolMetrics.qualityScorecard?.totalAdoptionReadyArtifactCount === "number" &&
        typeof poolMetrics.qualityScorecard?.totalNeedsOwnerDecisionCount === "number" &&
        poolMetrics.qualityScorecard.averageTakeoverReadinessScore > 0 &&
        poolMetrics.qualityScorecard.averageContractSignalPrecision > 0 &&
        poolMetrics.qualityScorecard.averageBehaviorEvidenceStrength > 0 &&
        poolMetrics.qualityScorecard.totalAdoptionReadyArtifactCount >= 12 &&
        poolMetrics.qualityScorecard.totalNeedsOwnerDecisionCount > 0 &&
        poolMetrics.qualityScorecard.fixturesWithHumanCorrectionHotspots?.includes("retail-ops-monorepo-like") === true &&
        poolMetrics.qualityScorecard.fixturesNeedingOwnerReview?.includes("remirage-like") === true &&
        poolMetrics.qualityScorecard.fixturesNeedingOwnerReview?.includes("breathofearth-like") === true &&
        poolMetrics.qualityScorecard.fixturesNeedingOwnerReview?.includes("scattered-contracts-like") === true &&
        poolMetrics.qualityScorecard.fixturesNeedingOwnerReview?.includes("retail-ops-monorepo-like") === true &&
        poolMetrics.qualityScorecard.fixturesNeedingOwnerReview?.includes("member-portal-fullstack-like") === true &&
        poolMetrics.qualityScorecard.fixturesNeedingOwnerReview?.includes("legacy-saas-debt-like") === true &&
        poolMetrics.qualityScorecard.fixturesWithBlockingVerify?.length === 0 &&
        poolMetrics.qualityScorecard.featureOverclaimRisk?.low === 5 &&
        poolMetrics.qualityScorecard.featureOverclaimRisk?.high === 1 &&
        containsAll(poolMetrics.fixtureClasses ?? [], [
          "high-noise-protocol-repo",
          "multilingual-finance-service-repo",
          "docs-api-schema-scattered-repo",
          "multi-language-monorepo-repo",
          "frontend-backend-mixed-repo",
          "historical-debt-service-repo",
        ]) &&
        poolSummary.includes("# JiSpec Retakeover Pool Summary") &&
        poolSummary.includes("Fixture count: 6") &&
        poolSummary.includes("All fixtures are non-blocking") &&
        poolSummary.includes("Retakeover pool is non-blocking, with explicit owner-review, human correction, or spec-debt follow-up") &&
        poolSummary.includes("Average takeover readiness score:") &&
        poolSummary.includes("V2 signal averages:") &&
        poolSummary.includes("V2 decision load:") &&
        poolSummary.includes("Correction loop:") &&
        poolSummary.includes("Top correction hotspots:") &&
        poolSummary.includes("Feature overclaim risk:") &&
        poolSummary.includes("Owner-review fixtures:") &&
        poolSummary.includes("## Quality Scorecard") &&
        poolSummary.includes("| Fixture | Score | Verify Safety | Feature Risk | Deferred | Next Action | Risk Notes |") &&
        poolSummary.includes("## Quality Scorecard V2") &&
        poolSummary.includes("| Fixture | Contract Precision | Behavior Strength | Overclaim Blocked | Adoption Ready | Owner Decisions | Hotspots |") &&
        poolSummary.includes("## Correction Loop") &&
        poolSummary.includes("| Fixture | Accepted | Edited | Deferred | Rejected | Load | Hotspots |") &&
        poolSummary.includes("`owner_review_spec_debt`") &&
        poolSummary.includes("`edited_domain`") &&
        poolSummary.includes("`rejected_feature`") &&
        poolSummary.includes("## Fixture Matrix") &&
        poolSummary.includes("`remirage-like`") &&
        poolSummary.includes("`breathofearth-like`") &&
        poolSummary.includes("`scattered-contracts-like`") &&
        poolSummary.includes("`retail-ops-monorepo-like`") &&
        poolSummary.includes("`member-portal-fullstack-like`") &&
        poolSummary.includes("`legacy-saas-debt-like`") &&
        poolSummary.includes("docs/governance/README.md") &&
        poolSummary.includes("db/schema_portfolio.sql") &&
        poolSummary.includes("docs/contracts/governance.md") &&
        poolSummary.includes("services/orders/contracts/openapi.yaml") &&
        poolSummary.includes("docs/product/member-journeys.md") &&
        poolSummary.includes("docs/contracts/subscription-lifecycle.md") &&
        poolSummary.includes(RETAKEOVER_POOL_METRICS_RELATIVE_PATH) &&
        poolSummary.includes("not a machine API"),
      error: `Expected aggregate retakeover pool metrics and summary. metrics=${JSON.stringify(poolMetrics, null, 2)}\nsummary=\n${poolSummary}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap real-retakeover regression execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(remirageRoot, { recursive: true, force: true });
    fs.rmSync(breathRoot, { recursive: true, force: true });
    fs.rmSync(scatteredRoot, { recursive: true, force: true });
    fs.rmSync(monorepoRoot, { recursive: true, force: true });
    fs.rmSync(fullstackRoot, { recursive: true, force: true });
    fs.rmSync(debtRoot, { recursive: true, force: true });
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

async function runRetakeover(
  root: string,
  options: RetakeoverFixtureOptions,
): Promise<RetakeoverResult> {
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
      {
        artifactKind: "domain",
        kind: options.domainDecision ?? "accept",
        editedContent: options.domainDecision === "edit"
          ? `${domainArtifact.content.trimEnd()}\nreview_notes:\n  - reviewer tightened takeover domain naming before adoption\n`
          : undefined,
        note: options.domainDecision === "edit" ? "domain naming tightened by reviewer" : undefined,
      },
      { artifactKind: "api", kind: options.apiDecision ?? "accept" },
      {
        artifactKind: "feature",
        kind: options.featureDecision,
        note: options.featureDecision === "skip_as_spec_debt"
          ? "feature behavior needs owner confirmation"
          : options.featureDecision === "reject"
            ? "feature draft was too speculative for adoption"
            : undefined,
      },
    ],
  });

  const domain = yaml.load(domainArtifact.content) as DomainDraft;
  const api = JSON.parse(apiArtifact.content) as ApiDraft;
  const feature = featureArtifact.content;
  const ranked = readRankedEvidence(root);
  const brief = fs.readFileSync(path.join(root, ".spec", "handoffs", "takeover-brief.md"), "utf-8");
  const verify = await runVerify({ root, useBaseline: true, applyWaivers: true });
  const metrics = writeRetakeoverMetrics(root, options, {
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

function seedReMirageLikeRepository(root: string): void {
  writeProject(root, "remirage-retakeover", ["network-gateway", "saas-control-plane", "finance-portfolio"]);
  fs.writeFileSync(
    path.join(root, "README.md"),
    [
      "# Mirage Control Fabric",
      "",
      "Gateway control plane policy rollout is protocol-backed.",
      "Governance approval keeps operator changes auditable before fleet rollout.",
    ].join("\n"),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "remirage-retakeover", private: true }, null, 2), "utf-8");

  writeText(root, "docs/governance/README.md", "# Governance\n\nGovernance approval and audit trail protect policy rollout decisions.\n");
  writeText(root, "docs/protocols/README.md", "# Protocols\n\nWire protocol and tunnel protocol contracts define service compatibility.\n");
  writeText(root, "docs/gateway/README.md", "# Gateway\n\nGateway strategy switch preserves transport continuity during edge ingress changes.\n");
  writeText(root, "docs/runtime/sessions.md", "# Session Runtime\n\nFailover session handoff and connection recovery are runtime guarantees.\n");
  writeText(root, "docs/billing/README.md", "# Billing\n\nBilling account operations are exposed through protobuf services.\n");

  writeText(
    root,
    "mirage-os/api/proto/gateway.proto",
    [
      'syntax = "proto3";',
      "service GatewayService {",
      "  rpc Switch(ControlCommand) returns (Gateway);",
      "}",
      "message Gateway { string id = 1; }",
      "message ControlCommand { string id = 1; }",
      "",
    ].join("\n"),
  );
  writeText(
    root,
    "mirage-os/api/proto/cell.proto",
    [
      'syntax = "proto3";',
      "service CellService {",
      "  rpc RecoverSession(CellSessionRequest) returns (Session);",
      "}",
      "message Cell { string id = 1; }",
      "message CellSessionRequest { string id = 1; }",
      "message Session { string id = 1; }",
      "",
    ].join("\n"),
  );
  writeText(
    root,
    "mirage-os/api/proto/billing.proto",
    [
      'syntax = "proto3";',
      "service BillingService {",
      "  rpc LoadAccount(BillingAccountRequest) returns (BillingAccountResponse);",
      "}",
      "message BillingAccount { string id = 1; }",
      "message BillingAccountRequest { string id = 1; }",
      "message BillingAccountResponse { BillingAccount account = 1; }",
      "",
    ].join("\n"),
  );
  writeText(
    root,
    "mirage-proto/control_command.proto",
    [
      'syntax = "proto3";',
      "message ControlCommand { string id = 1; }",
      "message GatewayPolicy { string id = 1; }",
      "",
    ].join("\n"),
  );

  writeText(root, "src/routes/health.ts", 'const app = { get: () => undefined };\napp.get("/health", () => "ok");\n');
  writeText(root, "tests/gateway.test.ts", "describe('gateway strategy switch protocol contract', () => {});\n");
  writeText(root, "tests/cell.test.ts", "describe('cell session recovery', () => {});\n");
  writeText(root, "tests/billing.test.ts", "describe('billing account protobuf mapping', () => {});\n");

  for (let index = 0; index < 6; index += 1) {
    writeText(root, `artifacts/dpi-audit/.pydeps/pkg${index}/pyproject.toml`, `[project]\nname = "mirrored-${index}"\n`);
    writeText(root, `artifacts/dpi-audit/.pydeps/pkg${index}/README.md`, "# Mirrored dependency\n");
  }
  writeText(root, "vendor/mirrored/package.json", JSON.stringify({ name: "vendored-mirror" }, null, 2));
  writeText(root, "node_modules/example/README.md", "# Installed dependency\n");
  writeText(root, "dist/runtime.bundle.js", "function bundled(){return true;}\n");
}

function seedBreathofEarthLikeRepository(root: string): void {
  writeBreathProject(root);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "breathofearth-retakeover", private: true }, null, 2), "utf-8");
  fs.writeFileSync(
    path.join(root, "README.md"),
    [
      "# 家庭资产控制台",
      "",
      "投资组合治理、策略审批、券商同步、Alpha账本、报表和对账留痕需要负责人确认。",
      "系统围绕持仓、再平衡、资金台账和风险边界组织接管。",
    ].join("\n"),
    "utf-8",
  );
  writeText(
    root,
    "docs/finance-overview.md",
    [
      "# 投资组合治理",
      "",
      "家庭资产和投资组合需要策略审批、风控治理与审计留痕。",
      "券商同步负责把 broker sync 快照转换成可审计的 portfolio 状态。",
    ].join("\n"),
  );
  writeText(
    root,
    "docs/system-design.md",
    [
      "# 系统设计",
      "",
      "Alpha账本记录策略实验收益，报表中心输出 reconciliation report。",
      "提现流程需要 GovernanceDecision 审批后写入 Ledger。",
    ].join("\n"),
  );
  writeText(
    root,
    "docs/shadow-run/README.md",
    [
      "# Shadow Run",
      "",
      "Shadow run results are reviewed manually before promotion.",
      "This boundary intentionally lacks a configured taxonomy scenario so the confidence gate keeps owner review visible.",
    ].join("\n"),
  );

  writeText(root, "db/schema_governance.sql", "create table governance_decisions(id text primary key);\n");
  writeText(root, "db/schema_broker_sync.sql", "create table broker_sync_runs(id text primary key);\n");
  writeText(root, "db/schema_alpha.sql", "create table alpha_ledgers(id text primary key);\n");
  writeText(root, "db/schema_shadow_run.sql", "create table shadow_runs(id text primary key);\n");
  writeText(root, "db/schema_portfolio.sql", "create table portfolios(id text primary key);\ncreate table ledgers(id text primary key);\n");

  writeText(
    root,
    "api/routes/portfolio_routes.py",
    [
      'app.post("/portfolio/rebalance")(lambda: {"ok": True})',
      'app.get("/ledger/entries")(lambda: [])',
      'app.post("/withdrawals/request")(lambda: {"ok": True})',
      "",
    ].join("\n"),
  );
  for (let index = 0; index < 5; index += 1) {
    writeText(root, `api/routes/deposit_${index}.py`, `app.post("/deposit/${index}")(lambda: {"ok": True})\n`);
  }
  for (let index = 0; index < 3; index += 1) {
    writeText(root, `api/routes/shadow_run_${index}.py`, `app.post("/shadow-runs/${index}")(lambda: {"ok": True})\n`);
  }

  writeText(root, ".pytest_cache/README.md", "# Pytest cache\n");
  writeText(root, ".pytest_cache/v/cache/nodeids", "[]\n");
  writeText(root, ".ruff_cache/content.json", "{}\n");
  writeText(root, "src/__pycache__/routes.cpython-311.pyc", "binary\n");
}

function seedScatteredContractsRepository(root: string): void {
  writeProject(root, "scattered-contracts-retakeover", ["finance-portfolio", "saas-control-plane"]);
  fs.writeFileSync(
    path.join(root, "README.md"),
    [
      "# Portfolio Control Platform",
      "",
      "Portfolio rebalance, governance approval, ledger entries, and reporting workflows are split across service folders.",
      "The takeover must connect product docs, API contracts, JSON schemas, and handlers instead of relying on one perfect source tree.",
    ].join("\n"),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "scattered-contracts-retakeover", private: true }, null, 2), "utf-8");
  writeText(root, "go.mod", "module example.com/scattered-contracts\n\ngo 1.22\n");

  writeText(
    root,
    "docs/product/portfolio-control.md",
    [
      "# Portfolio Control",
      "",
      "Portfolio rebalance requests require governance approval before ledger entries are committed.",
      "Risk governance and reporting evidence must stay connected to each rebalance decision.",
    ].join("\n"),
  );
  writeText(
    root,
    "docs/architecture/service-map.md",
    [
      "# Service Map",
      "",
      "The Node service accepts portfolio commands, the Python API exposes ledger entries, and the Go worker records reporting snapshots.",
    ].join("\n"),
  );
  writeText(
    root,
    "docs/contracts/governance.md",
    [
      "# Governance Contract",
      "",
      "GovernanceDecision records owner approval, approval memo, risk limit, and audit trail provenance.",
    ].join("\n"),
  );

  writeText(
    root,
    "services/api/openapi/openapi.yaml",
    [
      "openapi: 3.0.0",
      "info:",
      "  title: Portfolio Control",
      "  version: 1.0.0",
      "paths:",
      "  /portfolio/rebalance:",
      "    post:",
      "      operationId: rebalancePortfolio",
      "      requestBody:",
      "        content:",
      "          application/json:",
      "            schema:",
      "              $ref: '#/components/schemas/PortfolioCommand'",
      "      responses:",
      "        '202':",
      "          description: accepted",
      "          content:",
      "            application/json:",
      "              schema:",
      "                $ref: '#/components/schemas/GovernanceDecision'",
      "components:",
      "  schemas:",
      "    PortfolioCommand:",
      "      type: object",
      "    GovernanceDecision:",
      "      type: object",
      "",
    ].join("\n"),
  );
  writeText(
    root,
    "packages/contracts/schemas/portfolio-command.schema.json",
    JSON.stringify({
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      title: "PortfolioCommand",
      type: "object",
      properties: {
        portfolioId: { type: "string" },
        rebalanceReason: { type: "string" },
        riskLimit: { type: "string" },
      },
    }, null, 2),
  );
  writeText(
    root,
    "packages/contracts/schemas/governance-decision.schema.json",
    JSON.stringify({
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      title: "GovernanceDecision",
      type: "object",
      properties: {
        approvalMemo: { type: "string" },
        auditTrailId: { type: "string" },
      },
    }, null, 2),
  );
  writeText(
    root,
    "services/python/schemas/ledger-entry.schema.json",
    JSON.stringify({
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      title: "LedgerEntry",
      type: "object",
      properties: {
        ledgerId: { type: "string" },
        amount: { type: "number" },
      },
    }, null, 2),
  );

  writeText(
    root,
    "services/node/src/routes/portfolio.ts",
    [
      "const app = { post: () => undefined, get: () => undefined };",
      'app.post("/portfolio/rebalance", () => ({ status: "accepted" }));',
      'app.get("/portfolio/:id/reporting", () => ({ status: "ready" }));',
      "",
    ].join("\n"),
  );
  writeText(
    root,
    "services/python/api/ledger_routes.py",
    [
      'app.get("/ledger/entries")(lambda: [])',
      'app.post("/governance/approvals")(lambda: {"ok": True})',
      "",
    ].join("\n"),
  );
  writeText(
    root,
    "services/go/cmd/reporting/main.go",
    [
      "package main",
      "",
      "type ReportingSnapshot struct {",
      "  PortfolioID string",
      "  LedgerID string",
      "}",
      "",
      "func main() {}",
      "",
    ].join("\n"),
  );
  writeText(root, "tests/portfolio-control.test.ts", "describe('portfolio rebalance governance ledger reporting', () => {});\n");
  writeText(root, "services/python/tests/test_ledger.py", "def test_ledger_entries_are_auditable():\n    assert True\n");
}

function seedMultiLanguageMonorepoRepository(root: string): void {
  writeCustomTaxonomyProject(root, "retail-ops-monorepo-retakeover", [
    {
      id: "retail-ops",
      title: "Retail Operations",
      terms: [
        {
          label: "order",
          phrases: ["order", "order intake", "ship order", "order shipment"],
          weight: 128,
          aggregate_name: "Order",
          scenario: {
            scenarioName: "Order shipment preserves reservation evidence",
            given: "an accepted order has inventory reserved",
            when: "shipment is requested through the order boundary",
            then: "reservation and fulfillment evidence remain traceable",
          },
        },
        {
          label: "inventory",
          phrases: ["inventory", "stock", "reservation", "inventory item"],
          weight: 122,
          aggregate_name: "InventoryItem",
          scenario: {
            scenarioName: "Inventory reservation protects available stock",
            given: "stock is available for an order",
            when: "inventory is reserved",
            then: "available quantity reflects the reservation before fulfillment",
          },
        },
        {
          label: "fulfillment",
          phrases: ["fulfillment", "pick pack ship", "shipment", "fulfillment task"],
          weight: 118,
          aggregate_name: "FulfillmentTask",
          scenario: {
            scenarioName: "Fulfillment task follows order and inventory decisions",
            given: "an order and inventory reservation are accepted",
            when: "a fulfillment task is created",
            then: "the task references both order and reservation evidence",
          },
        },
      ],
      path_hints: [
        { label: "order", patterns: ["orders", "order"], boost: 20 },
        { label: "inventory", patterns: ["inventory", "stock"], boost: 18 },
        { label: "fulfillment", patterns: ["fulfillment", "shipment", "ship"], boost: 18 },
      ],
    },
  ]);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "retail-ops-monorepo", private: true, workspaces: ["services/*", "packages/*"] }, null, 2), "utf-8");
  writeText(root, "go.mod", "module example.com/retail-ops\n\ngo 1.22\n");
  writeText(
    root,
    "README.md",
    [
      "# Retail Operations Monorepo",
      "",
      "Orders, inventory, and fulfillment live in separate services and languages.",
      "The takeover should connect service-local contracts instead of treating build output as product evidence.",
    ].join("\n"),
  );
  writeText(
    root,
    "docs/architecture/service-map.md",
    [
      "# Service Map",
      "",
      "The TypeScript order service accepts shipment commands.",
      "The Go inventory service exposes reservation protocol contracts.",
      "The Python fulfillment service owns pick-pack-ship tasks.",
    ].join("\n"),
  );
  writeText(
    root,
    "services/orders/contracts/openapi.yaml",
    [
      "openapi: 3.0.3",
      "info:",
      "  title: Orders API",
      "  version: 1.0.0",
      "paths:",
      "  /orders/{id}/ship:",
      "    post:",
      "      operationId: shipOrder",
      "      responses:",
      "        '202':",
      "          description: accepted",
      "",
    ].join("\n"),
  );
  writeText(
    root,
    "services/inventory/proto/inventory.proto",
    [
      'syntax = "proto3";',
      "service InventoryService {",
      "  rpc ReserveStock(InventoryReservation) returns (InventoryItem);",
      "}",
      "message InventoryReservation { string id = 1; }",
      "message InventoryItem { string sku = 1; }",
      "",
    ].join("\n"),
  );
  writeText(
    root,
    "packages/contracts/schemas/fulfillment-task.schema.json",
    JSON.stringify({
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      title: "FulfillmentTask",
      type: "object",
      properties: {
        orderId: { type: "string" },
        reservationId: { type: "string" },
      },
    }, null, 2),
  );
  writeText(
    root,
    "services/orders/src/routes.ts",
    [
      "const app = { post: () => undefined };",
      'app.post("/orders/:id/ship", () => ({ accepted: true }));',
      "",
    ].join("\n"),
  );
  writeText(root, "services/fulfillment/app/routes.py", 'app.post("/fulfillment/tasks")(lambda: {"ok": True})\n');
  writeText(root, "services/orders/tests/order-shipment.test.ts", "describe('order shipment preserves reservation evidence', () => {});\n");
  writeText(root, "services/inventory/tests/reservation_test.go", "package tests\n\nfunc TestInventoryReservation(t *testing.T) {}\n");
  for (let index = 0; index < 3; index += 1) {
    writeText(root, `services/orders/build/chunk${index}.js`, "function buildOutput(){return true;}\n");
    writeText(root, `services/inventory/target/pkg${index}/README.md`, "# build output\n");
    writeText(root, `.gradle/caches/modules-${index}.bin`, "cache\n");
    writeText(root, `coverage/orders/${index}.html`, "<html></html>\n");
    writeText(root, `generated/clients/order-client-${index}.ts`, "export const generated = true;\n");
  }
}

function seedFrontendBackendMixedRepository(root: string): void {
  writeCustomTaxonomyProject(root, "member-portal-fullstack-retakeover", [
    {
      id: "membership-portal",
      title: "Membership Portal",
      terms: [
        {
          label: "membership",
          phrases: ["membership", "member", "plan change", "member plan"],
          weight: 126,
          aggregate_name: "Membership",
          scenario: {
            scenarioName: "Member plan change stays aligned across UI and API",
            given: "a member is eligible to change plan",
            when: "the plan change is submitted from the portal",
            then: "the API records the membership change with a reviewable result",
          },
        },
        {
          label: "billing",
          phrases: ["billing", "billing account", "invoice preview", "proration"],
          weight: 116,
          aggregate_name: "BillingAccount",
          scenario: {
            scenarioName: "Billing preview accompanies a plan change",
            given: "a member selects a new plan",
            when: "the portal requests a billing preview",
            then: "the displayed charge matches the API preview contract",
          },
        },
        {
          label: "notification",
          phrases: ["notification", "email confirmation", "member notice"],
          weight: 102,
          aggregate_name: "Notification",
          scenario: {
            scenarioName: "Notification follows accepted membership change",
            given: "a membership plan change is accepted",
            when: "confirmation is sent",
            then: "the notification references the accepted plan change",
          },
        },
      ],
      path_hints: [
        { label: "membership", patterns: ["member", "membership", "plan"], boost: 20 },
        { label: "billing", patterns: ["billing", "invoice"], boost: 16 },
        { label: "notification", patterns: ["notification", "email"], boost: 12 },
      ],
    },
  ]);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "member-portal-fullstack", private: true }, null, 2), "utf-8");
  writeText(
    root,
    "README.md",
    [
      "# Member Portal",
      "",
      "Plan changes pass through a React route, backend API contract, billing preview, and notification handoff.",
    ].join("\n"),
  );
  writeText(
    root,
    "docs/product/member-journeys.md",
    [
      "# Member Journeys",
      "",
      "Members change plans in the portal, review billing impact, and receive notification after acceptance.",
      "The UI route, API contract, backend handler, and E2E journey should stay connected during takeover.",
    ].join("\n"),
  );
  writeText(
    root,
    "apps/web/src/routes/plan-change.tsx",
    [
      "export function PlanChangeRoute() {",
      "  return <form data-testid=\"member-plan-change\">Change plan</form>;",
      "}",
      "",
    ].join("\n"),
  );
  writeText(
    root,
    "services/api/openapi/openapi.yaml",
    [
      "openapi: 3.0.3",
      "info:",
      "  title: Member API",
      "  version: 1.0.0",
      "paths:",
      "  /members/{memberId}/plan:",
      "    post:",
      "      operationId: changeMemberPlan",
      "      responses:",
      "        '200':",
      "          description: changed",
      "",
    ].join("\n"),
  );
  writeText(
    root,
    "packages/contracts/schemas/plan-change.schema.json",
    JSON.stringify({
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      title: "PlanChangeRequest",
      type: "object",
      properties: {
        memberId: { type: "string" },
        targetPlan: { type: "string" },
        billingPreviewId: { type: "string" },
      },
    }, null, 2),
  );
  writeText(
    root,
    "services/api/src/member-routes.ts",
    [
      "const app = { post: () => undefined };",
      'app.post("/members/:id/plan", () => ({ changed: true }));',
      'app.post("/members/:id/billing-preview", () => ({ amount: 10 }));',
      "",
    ].join("\n"),
  );
  writeText(root, "apps/web/tests/member-plan-change.spec.ts", "test('member plan change stays aligned across ui and api', async () => {});\n");
}

function seedHistoricalDebtServiceRepository(root: string): void {
  writeCustomTaxonomyProject(root, "legacy-saas-debt-retakeover", [
    {
      id: "legacy-subscription",
      title: "Legacy Subscription",
      terms: [
        { label: "subscription", phrases: ["subscription", "renewal", "subscription lifecycle"], weight: 124, aggregate_name: "Subscription" },
        { label: "invoice", phrases: ["invoice", "invoice adjustment", "billing migration"], weight: 112, aggregate_name: "Invoice" },
        { label: "entitlement", phrases: ["entitlement", "seat limit", "access grant"], weight: 108, aggregate_name: "Entitlement" },
      ],
      path_hints: [
        { label: "subscription", patterns: ["subscription", "renew"], boost: 20 },
        { label: "invoice", patterns: ["invoice", "billing"], boost: 16 },
        { label: "entitlement", patterns: ["entitlement", "seat"], boost: 14 },
      ],
    },
  ]);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "legacy-saas-debt", private: true }, null, 2), "utf-8");
  writeText(
    root,
    "README.md",
    [
      "# Legacy SaaS Billing",
      "",
      "Subscription renewal has a migrated v2 API and an old Ruby route still used by enterprise accounts.",
      "Feature behavior must stay owner-reviewed until renewal, invoice, and entitlement debt is reconciled.",
    ].join("\n"),
  );
  writeText(
    root,
    "docs/debt/spec-debt-ledger.md",
    [
      "# Spec Debt Ledger",
      "",
      "Subscription renewal behavior differs between the legacy route and the v2 API.",
      "Invoice adjustment and entitlement grants require owner review before adoption.",
    ].join("\n"),
  );
  writeText(
    root,
    "docs/contracts/subscription-lifecycle.md",
    [
      "# Subscription Lifecycle",
      "",
      "Subscription renewal updates invoice state and entitlement seat limits.",
      "Legacy enterprise accounts still follow the old route until migration completes.",
    ].join("\n"),
  );
  writeText(
    root,
    "api/openapi/openapi.yaml",
    [
      "openapi: 3.0.3",
      "info:",
      "  title: Subscription V2",
      "  version: 2.0.0",
      "paths:",
      "  /subscriptions/{id}/renew:",
      "    post:",
      "      operationId: renewSubscription",
      "      responses:",
      "        '202':",
      "          description: accepted",
      "",
    ].join("\n"),
  );
  writeText(
    root,
    "schemas/subscription-renewal.schema.json",
    JSON.stringify({
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      title: "SubscriptionRenewal",
      type: "object",
      properties: {
        subscriptionId: { type: "string" },
        invoiceAdjustmentId: { type: "string" },
        entitlementGrantId: { type: "string" },
      },
    }, null, 2),
  );
  writeText(
    root,
    "legacy/routes/subscription_renewal.rb",
    [
      "post '/legacy/subscriptions/:id/renew' do",
      "  { ok: true }.to_json",
      "end",
      "",
    ].join("\n"),
  );
  writeText(
    root,
    "legacy/routes/subscription-renewal.ts",
    [
      "const app = { post: () => undefined };",
      'app.post("/legacy/subscriptions/:id/renew", () => ({ ok: true }));',
      "",
    ].join("\n"),
  );
  writeText(root, "migrations/20240101_subscription_renewal.sql", "create table subscription_renewals(id text primary key);\ncreate table invoices(id text primary key);\ncreate table entitlements(id text primary key);\n");
  writeText(root, "tmp/cache/old-renewal.json", "{}\n");
  writeText(root, "vendor/billing/README.md", "# vendored billing helper\n");
}

function writeRetakeoverMetrics(
  root: string,
  options: RetakeoverFixtureOptions,
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
  const editedArtifacts: string[] = [];
  const deferredArtifacts: string[] = [];
  const rejectedArtifacts: string[] = [];
  const notes: Record<string, string> = {};

  if (options.domainDecision === "edit") {
    editedArtifacts.push("domain");
    notes.domain = "domain naming tightened by reviewer";
  }

  if (options.featureDecision === "skip_as_spec_debt") {
    deferredArtifacts.push("feature");
    notes.feature = "feature behavior needs owner confirmation";
  } else if (options.featureDecision === "reject") {
    rejectedArtifacts.push("feature");
    notes.feature = "feature draft was too speculative for adoption";
  } else {
    acceptedArtifacts.push("feature");
  }
  const adoptCorrection = buildRetakeoverAdoptCorrectionMetrics({
    acceptedArtifacts,
    editedArtifacts,
    deferredArtifacts,
    rejectedArtifacts,
    notes,
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
    adoptCorrection: {
      ...adoptCorrection,
    },
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

function writeBreathProject(root: string): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    yaml.dump({
      id: "breathofearth-retakeover",
      name: "breathofearth-retakeover",
      version: "0.1.0",
      delivery_model: "bootstrap-takeover",
      domain_taxonomy: {
        packs: ["finance-portfolio"],
        custom_packs: [
          {
            id: "finance-shadow-review",
            title: "Finance Shadow Review",
            terms: [
              {
                label: "shadow-run",
                phrases: ["shadow run", "shadow runs"],
                weight: 200,
                aggregate_name: "ShadowRun",
              },
            ],
            path_hints: [
              {
                label: "shadow-run",
                patterns: ["shadow-run", "shadow_run", "shadow-runs"],
                boost: 24,
              },
            ],
          },
        ],
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

function writeCustomTaxonomyProject(root: string, id: string, customPacks: Array<Record<string, unknown>>): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    yaml.dump({
      id,
      name: id,
      version: "0.1.0",
      delivery_model: "bootstrap-takeover",
      domain_taxonomy: {
        packs: [],
        custom_packs: customPacks,
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

function writeProject(root: string, id: string, packs: string[]): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    yaml.dump({
      id,
      name: id,
      version: "0.1.0",
      delivery_model: "bootstrap-takeover",
      domain_taxonomy: { packs },
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
    ...(domain.domain?.proto_service_mappings ?? []).flatMap((mapping) => mapping.context_labels ?? []),
  ]);
}

function collectAggregateNames(domain: DomainDraft): string[] {
  return unique([
    ...(domain.domain?.aggregate_roots ?? []).map((aggregate) => aggregate.name).filter((name): name is string => Boolean(name)),
    ...(domain.domain?.proto_service_mappings ?? []).flatMap((mapping) => mapping.aggregate_roots ?? []),
  ]);
}

function hasProtoSurface(
  surfaces: ApiSurfaceDraft[],
  service: string,
  boundedContext: string,
  aggregateRoots: string[],
): boolean {
  return surfaces.some((surface) =>
    surface.surface_kind === "protobuf_service" &&
    surface.service === service &&
    surface.bounded_context === boundedContext &&
    aggregateRoots.every((aggregateRoot) => surface.aggregate_roots?.includes(aggregateRoot)),
  );
}

function excludedRuleIds(ranked: AdoptionRankedEvidence): string[] {
  return ranked.excludedSummary.rules.map((rule) => rule.ruleId);
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
