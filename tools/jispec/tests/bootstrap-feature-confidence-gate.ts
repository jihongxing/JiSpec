import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft, type BootstrapDraftResult } from "../bootstrap/draft";
import { runBootstrapAdopt } from "../bootstrap/adopt";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Bootstrap Feature Confidence Gate Test ===\n");

  const routeOnlyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-feature-gate-route-"));
  const remirageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-feature-gate-remirage-"));
  const thinFinanceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-feature-gate-finance-"));
  const noisyRouteRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-feature-gate-noisy-"));
  const results: TestResult[] = [];

  try {
    seedRouteOnlyRepository(routeOnlyRoot);
    seedRemirageLikeRepository(remirageRoot);
    seedThinFinanceRepository(thinFinanceRoot);
    seedNoisyRouteRepository(noisyRouteRoot);

    const routeOnlyDraft = await discoverAndDraft(routeOnlyRoot);
    const remirageDraft = await discoverAndDraft(remirageRoot);
    const thinFinanceDraft = await discoverAndDraft(thinFinanceRoot);
    const noisyRouteDraft = await discoverAndDraft(noisyRouteRoot);

    results.push({
      name: "route-only fixtures produce human-review scenarios and deferred recommendations",
      passed:
        routeOnlyDraft.feature.includes("@behavior_needs_human_review") &&
        routeOnlyDraft.feature.includes("# evidence_level: weak") &&
        routeOnlyDraft.feature.includes('# evidence_kinds: ["route"]') &&
        routeOnlyDraft.feature.includes("# adoption_recommendation: defer_as_spec_debt") &&
        routeOnlyDraft.feature.includes("# recommendation: defer_as_spec_debt") &&
        routeOnlyDraft.feature.includes("route-only behavior lacks contract, document, proto, aggregate, or test corroboration"),
      error: `Expected route-only behavior to be gated, got:\n${routeOnlyDraft.feature}`,
    });

    results.push({
      name: "ReMirage-like gateway and proto scenarios are adopt candidates",
      passed:
        remirageDraft.feature.includes("# adoption_recommendation: accept_candidate") &&
        remirageDraft.feature.includes("Scenario: Control plane applies a policy change safely") &&
        remirageDraft.feature.includes("Scenario: Gateway strategy switch preserves transport continuity") &&
        remirageDraft.feature.includes("# evidence_level: strong") &&
        remirageDraft.feature.includes('"proto"') &&
        remirageDraft.feature.includes("protobuf service mapping anchors the boundary") &&
        !remirageDraft.feature.includes("@behavior_needs_human_review"),
      error: `Expected ReMirage-like feature draft to pass the confidence gate, got:\n${remirageDraft.feature}`,
    });

    const remirageBrief = await adoptAndReadBrief(remirageRoot, remirageDraft.result.sessionId, "accept");
    results.push({
      name: "takeover brief recommends accepting feature artifacts when scenarios pass",
      passed:
        remirageBrief.includes("## Feature Confidence Gate") &&
        remirageBrief.includes("Recommendation: `accept_candidate`") &&
        remirageBrief.includes("Feature draft can be adopted as an initial behavior contract") &&
        remirageBrief.includes("Scenario recommendations:"),
      error: `Expected takeover brief to recommend feature adoption, got:\n${remirageBrief}`,
    });

    const thinFinanceBrief = await adoptAndReadBrief(thinFinanceRoot, thinFinanceDraft.result.sessionId, "skip_as_spec_debt");
    results.push({
      name: "BreathofEarth-like thin behavior remains spec debt until owner confirmation",
      passed:
        thinFinanceDraft.feature.includes("# adoption_recommendation: defer_as_spec_debt") &&
        thinFinanceDraft.feature.includes("@behavior_needs_human_review") &&
        thinFinanceDraft.feature.includes("# evidence_level: partial") &&
        thinFinanceBrief.includes("Recommendation: `defer_as_spec_debt`") &&
        thinFinanceBrief.includes("owner confirms the tagged behavior scenarios") &&
        thinFinanceBrief.includes("human-review"),
      error: `Expected thin finance behavior to remain spec debt.\nFeature:\n${thinFinanceDraft.feature}\nBrief:\n${thinFinanceBrief}`,
    });

    const noisyScenarioCount = countScenarios(noisyRouteDraft.feature);
    results.push({
      name: "high-noise route-only repositories keep feature output small and review-gated",
      passed:
        noisyScenarioCount > 0 &&
        noisyScenarioCount <= 3 &&
        noisyRouteDraft.feature.includes("# adoption_recommendation: defer_as_spec_debt") &&
        noisyRouteDraft.feature.includes("@behavior_needs_human_review") &&
        !noisyRouteDraft.feature.includes("# adoption_recommendation: accept_candidate"),
      error: `Expected noisy route-only feature draft to stay small and deferred, got ${noisyScenarioCount} scenarios:\n${noisyRouteDraft.feature}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap feature confidence gate execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(routeOnlyRoot, { recursive: true, force: true });
    fs.rmSync(remirageRoot, { recursive: true, force: true });
    fs.rmSync(thinFinanceRoot, { recursive: true, force: true });
    fs.rmSync(noisyRouteRoot, { recursive: true, force: true });
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

async function discoverAndDraft(root: string): Promise<{ result: BootstrapDraftResult; feature: string }> {
  runBootstrapDiscover({ root });
  const result = await runBootstrapDraft({ root });
  const feature = result.draftBundle.artifacts.find((artifact) => artifact.kind === "feature")?.content;
  if (!feature) {
    throw new Error("Expected feature artifact to exist.");
  }
  return { result, feature };
}

async function adoptAndReadBrief(
  root: string,
  sessionId: string,
  featureDecision: "accept" | "skip_as_spec_debt",
): Promise<string> {
  await runBootstrapAdopt({
    root,
    session: sessionId,
    decisions: [
      { artifactKind: "domain", kind: "accept" },
      { artifactKind: "api", kind: "accept" },
      {
        artifactKind: "feature",
        kind: featureDecision,
        note: featureDecision === "skip_as_spec_debt" ? "behavior needs owner confirmation" : undefined,
      },
    ],
  });
  return fs.readFileSync(path.join(root, ".spec", "handoffs", "takeover-brief.md"), "utf-8");
}

function seedRouteOnlyRepository(root: string): void {
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "route-only", private: true }, null, 2), "utf-8");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "orders-routes.ts"),
    'const app = { post: () => undefined };\napp.post("/orders", () => "created");\n',
    "utf-8",
  );
}

function seedNoisyRouteRepository(root: string): void {
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "noisy-route-only", private: true }, null, 2), "utf-8");
  fs.mkdirSync(path.join(root, "src", "routes"), { recursive: true });

  const routeNames = [
    "orders",
    "payments",
    "refunds",
    "shipments",
    "invoices",
    "customers",
    "coupons",
    "notifications",
  ];
  for (const routeName of routeNames) {
    fs.writeFileSync(
      path.join(root, "src", "routes", `${routeName}-routes.ts`),
      [
        "const app = { get: () => undefined, post: () => undefined };",
        `app.get("/${routeName}", () => []);`,
        `app.post("/${routeName}", () => "ok");`,
      ].join("\n"),
      "utf-8",
    );
  }
}

function seedRemirageLikeRepository(root: string): void {
  writeProject(root, ["network-gateway", "saas-control-plane"]);
  fs.writeFileSync(path.join(root, "README.md"), "# Gateway Control Plane\n\nGateway strategy and control-plane policy changes are protocol-backed.\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "remirage-like", private: true }, null, 2), "utf-8");

  for (const doc of ["control-plane", "protocols", "gateway", "client"]) {
    fs.mkdirSync(path.join(root, "docs", doc), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", doc, "README.md"), `# ${doc}\n\nProtocol-backed ${doc} behavior.\n`, "utf-8");
  }

  fs.mkdirSync(path.join(root, "api", "proto"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "api", "proto", "gateway.proto"),
    [
      'syntax = "proto3";',
      "service GatewayService { rpc Switch(SwitchRequest) returns (SwitchResult); }",
      "service CellService { rpc Apply(CellCommandRequest) returns (CellCommandResult); }",
      "service BillingService { rpc UpdateAccount(BillingAccountRequest) returns (BillingAccountResult); }",
      "message SwitchRequest {}",
      "message SwitchResult {}",
      "message CellCommandRequest {}",
      "message CellCommandResult {}",
      "message BillingAccountRequest {}",
      "message BillingAccountResult {}",
    ].join("\n"),
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "src", "routes"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes", "gateway-routes.ts"),
    'const app = { post: () => undefined };\napp.post("/gateway/switch", () => "ok");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "tests", "gateway.test.ts"), "describe('gateway strategy switch', () => {});\n", "utf-8");
}

function seedThinFinanceRepository(root: string): void {
  writeProject(root, ["finance-portfolio"]);
  fs.writeFileSync(
    path.join(root, "README.md"),
    "# 家庭资产控制台\n\n投资组合治理、券商同步、Alpha 账本和报表留痕需要负责人确认。\n",
    "utf-8",
  );
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "thin-finance", private: true }, null, 2), "utf-8");
  fs.mkdirSync(path.join(root, "api", "routes"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "api", "routes", "portfolio_routes.py"),
    'app.post("/portfolio/rebalance")(lambda: {"ok": True})\napp.get("/ledger/entries")(lambda: [])\n',
    "utf-8",
  );
}

function writeProject(root: string, packs: string[]): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    yaml.dump({
      id: "feature-confidence",
      name: "Feature Confidence",
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

function countScenarios(content: string): number {
  return content.split(/\r?\n/).filter((line) => line.trim().startsWith("Scenario:")).length;
}

void main();
