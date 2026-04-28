import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runBootstrapAdopt } from "../bootstrap/adopt";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft, type BootstrapDraftResult } from "../bootstrap/draft";
import type { BootstrapDiscoverResult } from "../bootstrap/evidence-graph";
import type { AdoptionRankedEvidence } from "../bootstrap/evidence-ranking";

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
}

async function main(): Promise<void> {
  console.log("=== Bootstrap Real-Retakeover Regression Fixtures Test ===\n");

  const remirageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-retakeover-remirage-"));
  const breathRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-retakeover-breath-"));
  const results: TestResult[] = [];

  try {
    seedReMirageLikeRepository(remirageRoot);
    seedBreathofEarthLikeRepository(breathRoot);

    const remirage = await runRetakeover(remirageRoot, "accept");
    const breath = await runRetakeover(breathRoot, "skip_as_spec_debt");

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
        containsAll(breathRankedPaths.slice(0, 10), [
          "db/schema_governance.sql",
          "db/schema_broker_sync.sql",
          "docs/finance-overview.md",
        ]) &&
        containsAny(breathRankedPaths.slice(0, 10), [
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
  featureDecision: "accept" | "skip_as_spec_debt",
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
      { artifactKind: "domain", kind: "accept" },
      { artifactKind: "api", kind: "accept" },
      {
        artifactKind: "feature",
        kind: featureDecision,
        note: featureDecision === "skip_as_spec_debt" ? "feature behavior needs owner confirmation" : undefined,
      },
    ],
  });

  return {
    discover,
    draft,
    domain: yaml.load(domainArtifact.content) as DomainDraft,
    api: JSON.parse(apiArtifact.content) as ApiDraft,
    feature: featureArtifact.content,
    ranked: readRankedEvidence(root),
    brief: fs.readFileSync(path.join(root, ".spec", "handoffs", "takeover-brief.md"), "utf-8"),
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
