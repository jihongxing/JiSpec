import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { runBootstrapAdopt } from "../tools/jispec/bootstrap/adopt";
import { runBootstrapDiscover } from "../tools/jispec/bootstrap/discover";
import { runBootstrapDraft } from "../tools/jispec/bootstrap/draft";
import type { AdoptionRankedEvidence } from "../tools/jispec/bootstrap/evidence-ranking";
import {
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
} from "../tools/jispec/bootstrap/retakeover-metrics";
import { runVerify } from "../tools/jispec/verify/verify-runner";

interface DemoOptions {
  root: string;
  force: boolean;
  json: boolean;
}

interface FixtureDefinition {
  id: string;
  fixtureClass: RetakeoverFixtureClass;
  description: string;
  featureDecision: "accept" | "skip_as_spec_debt";
  seed(root: string): void;
}

interface DemoFixtureReport {
  id: string;
  root: string;
  fixtureClass: RetakeoverFixtureClass;
  description: string;
  sessionId: string;
  decision: string;
  verifyVerdict: string;
  verifyOk: boolean;
  takeoverReadinessScore: number;
  featureOverclaimRisk: string;
  nextAction: string;
  topEvidence: string[];
  domainContexts: string[];
  aggregateRoots: string[];
  apiSurfaces: string[];
  humanReadable: string[];
  machineReadable: string[];
}

interface DomainDraft {
  domain?: {
    primary_contexts?: string[];
    areas?: Array<{ name?: string }>;
    aggregate_roots?: Array<{ name?: string }>;
  };
}

interface ApiDraft {
  api_spec?: {
    surfaces?: Array<{ method?: string; path?: string; service?: string; operation?: string }>;
  };
}

interface TaxonomyTermInput {
  label: string;
  phrases: string[];
  aggregate_name: string;
  scenario?: {
    scenarioName: string;
    given: string;
    when: string;
    then: string;
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  prepareDemoRoot(options.root, options.force);

  const reports: DemoFixtureReport[] = [];
  const metrics: RetakeoverMetrics[] = [];

  for (const fixture of fixtures()) {
    const fixtureRoot = path.join(options.root, fixture.id);
    fs.mkdirSync(fixtureRoot, { recursive: true });
    fixture.seed(fixtureRoot);
    const result = await runFixtureTakeover(fixtureRoot, fixture);
    reports.push(result.report);
    metrics.push(result.metrics);
  }

  writeRetakeoverPoolArtifacts(options.root, metrics);
  const summaryPath = path.join(options.root, "messy-legacy-takeover-demo-summary.md");
  fs.writeFileSync(summaryPath, renderDemoSummary(options.root, reports), "utf-8");

  const payload = {
    root: normalizePath(options.root),
    summaryPath: normalizePath(path.relative(options.root, summaryPath)),
    pool: {
      humanReadable: RETAKEOVER_POOL_SUMMARY_RELATIVE_PATH,
      machineReadable: RETAKEOVER_POOL_METRICS_RELATIVE_PATH,
    },
    fixtures: reports,
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(renderConsoleReport(options.root, reports, summaryPath));
}

function parseArgs(argv: string[]): DemoOptions {
  const repoRoot = path.resolve(__dirname, "..");
  const options: DemoOptions = {
    root: path.join(repoRoot, ".tmp", "messy-legacy-takeover-demo"),
    force: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--root" && next) {
      options.root = path.resolve(next);
      index += 1;
    } else if (arg.startsWith("--root=")) {
      options.root = path.resolve(arg.slice("--root=".length));
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--json") {
      options.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function prepareDemoRoot(rootInput: string, force: boolean): void {
  const root = path.resolve(rootInput);
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) {
    if (!force) {
      throw new Error(`Target directory is not empty: ${root}. Re-run with --force to reset this demo directory.`);
    }
    assertSafeDemoRoot(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
  fs.mkdirSync(root, { recursive: true });
}

function assertSafeDemoRoot(root: string): void {
  const repoTmp = path.join(path.resolve(__dirname, ".."), ".tmp");
  const relative = path.relative(repoTmp, root);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !path.basename(root).includes("messy-legacy")) {
    throw new Error(`Refusing to reset non-demo directory: ${root}`);
  }
}

async function runFixtureTakeover(
  root: string,
  fixture: FixtureDefinition,
): Promise<{ report: DemoFixtureReport; metrics: RetakeoverMetrics }> {
  const discover = runBootstrapDiscover({ root });
  const draft = await runBootstrapDraft({ root });
  await runBootstrapAdopt({
    root,
    session: draft.sessionId,
    decisions: [
      { artifactKind: "domain", kind: "accept" },
      { artifactKind: "api", kind: "accept" },
      {
        artifactKind: "feature",
        kind: fixture.featureDecision,
        note: fixture.featureDecision === "skip_as_spec_debt" ? "messy legacy behavior needs owner confirmation" : undefined,
      },
    ],
  });

  const domainArtifact = draft.draftBundle.artifacts.find((artifact) => artifact.kind === "domain");
  const apiArtifact = draft.draftBundle.artifacts.find((artifact) => artifact.kind === "api");
  const featureArtifact = draft.draftBundle.artifacts.find((artifact) => artifact.kind === "feature");
  if (!domainArtifact || !apiArtifact || !featureArtifact) {
    throw new Error(`Missing draft artifacts for ${fixture.id}`);
  }

  const domain = yaml.load(domainArtifact.content) as DomainDraft;
  const api = JSON.parse(apiArtifact.content) as ApiDraft;
  const ranked = readRankedEvidence(root);
  const verify = await runVerify({ root, useBaseline: true, applyWaivers: true });
  const metrics: RetakeoverMetrics = {
    version: 1,
    fixtureId: fixture.id,
    fixtureClass: fixture.fixtureClass,
    discoverSummary: discover.summary as unknown as Record<string, unknown>,
    topRankedEvidence: ranked.evidence.slice(0, 10).map((entry) => entry.path),
    draftQuality: {
      domainContextCount: collectDomainNames(domain).length,
      aggregateRootCount: collectAggregateNames(domain).length,
      apiSurfaceCount: api.api_spec?.surfaces?.length ?? 0,
      featureRecommendation: parseRetakeoverFeatureRecommendation(featureArtifact.content),
    },
    adoptCorrection: {
      acceptedArtifacts: fixture.featureDecision === "accept" ? ["domain", "api", "feature"] : ["domain", "api"],
      deferredArtifacts: fixture.featureDecision === "skip_as_spec_debt" ? ["feature"] : [],
    },
    verifyVerdict: verify.verdict,
    verifyOk: verify.ok,
    qualityScorecard: buildRetakeoverQualityScorecard({
      rankedEvidence: ranked,
      discoverSummary: discover.summary as unknown as Record<string, unknown>,
      featureContent: featureArtifact.content,
      featureRecommendation: parseRetakeoverFeatureRecommendation(featureArtifact.content),
      acceptedArtifacts: fixture.featureDecision === "accept" ? ["domain", "api", "feature"] : ["domain", "api"],
      deferredArtifacts: fixture.featureDecision === "skip_as_spec_debt" ? ["feature"] : [],
      verifyOk: verify.ok,
    }),
  };
  writeRetakeoverArtifacts(root, metrics);

  const report: DemoFixtureReport = {
    id: fixture.id,
    root: normalizePath(root),
    fixtureClass: fixture.fixtureClass,
    description: fixture.description,
    sessionId: draft.sessionId,
    decision: metrics.draftQuality.featureRecommendation,
    verifyVerdict: verify.verdict,
    verifyOk: verify.ok,
    takeoverReadinessScore: metrics.qualityScorecard.takeoverReadinessScore,
    featureOverclaimRisk: metrics.qualityScorecard.featureOverclaimRisk,
    nextAction: metrics.qualityScorecard.nextAction,
    topEvidence: metrics.topRankedEvidence.slice(0, 5),
    domainContexts: collectDomainNames(domain),
    aggregateRoots: collectAggregateNames(domain),
    apiSurfaces: collectApiSurfaces(api),
    humanReadable: [
      ".spec/handoffs/takeover-brief.md",
      RETAKEOVER_SUMMARY_RELATIVE_PATH,
      `.spec/sessions/${draft.sessionId}/drafts/behaviors.feature`,
    ],
    machineReadable: [
      ".spec/contracts/domain.yaml",
      ".spec/contracts/api_spec.json",
      ".spec/handoffs/bootstrap-takeover.json",
      ".spec/facts/bootstrap/adoption-ranked-evidence.json",
      RETAKEOVER_METRICS_RELATIVE_PATH,
      `.spec/spec-debt/${draft.sessionId}/feature.json`,
    ],
  };

  return { report, metrics };
}

function fixtures(): FixtureDefinition[] {
  return [
    {
      id: "god-file-monolith-like",
      fixtureClass: "synthetic-god-file-monolith",
      description: "One large server file mixes order, payment, inventory, customer, and report behavior with bad names.",
      featureDecision: "skip_as_spec_debt",
      seed: seedGodFileMonolith,
    },
    {
      id: "contract-drift-like",
      fixtureClass: "synthetic-contract-drift",
      description: "README, OpenAPI, JSON schema, and route code disagree about the checkout contract.",
      featureDecision: "skip_as_spec_debt",
      seed: seedContractDrift,
    },
    {
      id: "noise-heavy-hidden-signal-like",
      fixtureClass: "synthetic-noise-heavy-hidden-signal",
      description: "Product contracts are buried below vendor, build, cache, coverage, and generated-code noise.",
      featureDecision: "skip_as_spec_debt",
      seed: seedNoiseHeavyHiddenSignal,
    },
    {
      id: "thin-behavior-evidence-like",
      fixtureClass: "synthetic-thin-behavior-evidence",
      description: "Routes and schemas exist, but behavior evidence is too thin for enforcement without owner review.",
      featureDecision: "skip_as_spec_debt",
      seed: seedThinBehavior,
    },
  ];
}

function seedGodFileMonolith(root: string): void {
  writeProject(root, "god-file-monolith-like", [
    { label: "order", phrases: ["order", "checkout", "fulfillment"], aggregate_name: "Order" },
    { label: "payment", phrases: ["payment", "capture", "refund"], aggregate_name: "Payment" },
    { label: "inventory", phrases: ["inventory", "stock", "warehouse"], aggregate_name: "InventoryItem" },
    { label: "customer", phrases: ["customer", "account", "profile"], aggregate_name: "CustomerAccount" },
    { label: "reporting", phrases: ["reporting", "report", "export"], aggregate_name: "Report" },
  ]);
  writeText(root, "README.md", "# Legacy Commerce Admin\n\nOne old server file handles order intake, payment capture, inventory reservation, customer notes, and reporting exports. Owner review is required before behavior is treated as a contract.\n");
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
      "",
    ].join("\n"),
  );
}

function seedContractDrift(root: string): void {
  writeProject(root, "contract-drift-like", [
    { label: "checkout", phrases: ["checkout", "cart checkout", "order submit"], aggregate_name: "Checkout" },
    { label: "order", phrases: ["order", "submitted order"], aggregate_name: "Order" },
  ]);
  writeText(root, "README.md", "# Checkout Service\n\nPublic docs tell integrators to call POST /checkout, while implementation and generated contracts drifted.\n");
  writeText(root, "docs/openapi/openapi.yaml", "openapi: 3.0.3\ninfo:\n  title: Checkout API\n  version: 0.1.0\npaths:\n  /api/v1/cart/checkout:\n    post:\n      operationId: checkoutCart\n      responses:\n        '200':\n          description: accepted\n");
  writeText(root, "schemas/cart-checkout.schema.json", JSON.stringify({ title: "CartCheckoutCommand", type: "object", properties: { basket_id: { type: "string" } } }, null, 2));
  writeText(root, "src/routes/order-submit.ts", 'const router = { post: () => undefined };\nrouter.post("/order/submit", async () => ({ accepted: true }));\n');
}

function seedNoiseHeavyHiddenSignal(root: string): void {
  writeProject(root, "noise-heavy-hidden-signal-like", [
    {
      label: "checkout",
      phrases: ["checkout", "checkout flow", "cart checkout"],
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
      aggregate_name: "Order",
      scenario: {
        scenarioName: "Order reservation is recorded before fulfillment",
        given: "inventory is available for a requested item",
        when: "the order reservation is accepted",
        then: "fulfillment can trace the reservation decision",
      },
    },
  ]);
  writeText(root, "README.md", "# Hidden Checkout Signals\n\nThe real service evidence is buried under service-local contracts.\n");
  writeText(root, "services/checkout/docs/checkout-flow.md", "# Checkout Flow\n\nCheckout flow coordinates cart checkout, order reservation, and payment evidence.\n");
  writeText(root, "services/checkout/contracts/openapi.yaml", "openapi: 3.0.3\ninfo:\n  title: Checkout API\n  version: 0.1.0\npaths:\n  /checkout/submit:\n    post:\n      operationId: submitCheckout\n      responses:\n        '200':\n          description: accepted\n");
  writeText(root, "services/checkout/contracts/order.schema.json", JSON.stringify({ title: "OrderReservation", type: "object", properties: { order_id: { type: "string" } } }, null, 2));
  writeText(root, "services/checkout/src/routes.ts", 'const app = { post: () => undefined };\napp.post("/checkout/submit", () => ({ accepted: true }));\n');
  writeText(root, "services/checkout/tests/checkout.test.ts", "describe('checkout flow preserves reservation and payment evidence', () => {});\n");
  for (let index = 0; index < 6; index += 1) {
    writeText(root, `vendor/pkg${index}/README.md`, "# vendored package\n");
    writeText(root, `dist/chunk${index}.bundle.js`, "function bundled(){return true;}\n");
    writeText(root, `.cache/tool/${index}.json`, JSON.stringify({ cached: true }));
    writeText(root, `coverage/html/${index}.html`, "<html></html>\n");
    writeText(root, `generated/api/client${index}.ts`, "export const generated = true;\n");
  }
}

function seedThinBehavior(root: string): void {
  writeProject(root, "thin-behavior-evidence-like", [
    { label: "ticket", phrases: ["ticket", "case"], aggregate_name: "SupportTicket" },
    { label: "escalation", phrases: ["escalation", "manual review"], aggregate_name: "Escalation" },
  ]);
  writeText(root, "README.md", "# Support Intake\n\nRoutes and schemas exist, but behavior evidence is intentionally thin.\n");
  writeText(root, "schemas/ticket.schema.json", JSON.stringify({ title: "SupportTicket", type: "object", properties: { ticket_id: { type: "string" } } }, null, 2));
  writeText(root, "src/routes/tickets.ts", 'const app = { post: () => undefined };\napp.post("/tickets", () => ({ accepted: true }));\napp.post("/tickets/:id/escalate", () => ({ accepted: true }));\n');
}

function writeProject(root: string, id: string, terms: TaxonomyTermInput[]): void {
  const normalizedTerms = terms.map((term, index) => ({ weight: 120 - index * 4, ...term }));
  const pathHints = normalizedTerms.map((term) => ({
    label: term.label,
    patterns: [String(term.label)],
    boost: 14,
  }));
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
        custom_packs: [
          {
            id: `${id}-taxonomy`,
            title: id,
            terms: normalizedTerms,
            path_hints: pathHints,
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

function collectApiSurfaces(api: ApiDraft): string[] {
  return (api.api_spec?.surfaces ?? []).map((surface) => {
    if (surface.method && surface.path) {
      return `${surface.method} ${surface.path}`;
    }
    if (surface.path) {
      return surface.path;
    }
    return surface.service ?? surface.operation ?? "unknown";
  });
}

function renderDemoSummary(root: string, reports: DemoFixtureReport[]): string {
  const lines = [
    "# 合成屎山旧项目接管 Demo",
    "",
    "这份 demo 会保留 N9 回归测试平时只写在临时目录里的 takeover 产物。",
    "它的目的不是证明 JiSpec 已经能无偏差理解任意旧系统，而是让你直接检查：面对保守接管时，JiSpec 给人类 reviewer 看什么、给机器流程吃什么。",
    "",
    "## Pool 级产物",
    "",
    `- 人类可读汇总：\`${RETAKEOVER_POOL_SUMMARY_RELATIVE_PATH}\``,
    `- 机器可读指标：\`${RETAKEOVER_POOL_METRICS_RELATIVE_PATH}\``,
    "",
    "## Fixture 输出",
    "",
    "| Fixture | 接管决策 | Score | Risk | Next action | Verify | 最高优先级证据 | 人类可读产物 | 机器可读契约 / 事实 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...reports.map((report) =>
      [
        `\`${report.id}\``,
        `\`${report.decision}\``,
        `${report.takeoverReadinessScore}/100`,
        `\`${report.featureOverclaimRisk}\``,
        `\`${report.nextAction}\``,
        `\`${report.verifyVerdict}\``,
        report.topEvidence.slice(0, 3).map((item) => `\`${item}\``).join("<br>"),
        report.humanReadable.map((item) => `\`${report.id}/${item}\``).join("<br>"),
        report.machineReadable.map((item) => `\`${report.id}/${item}\``).join("<br>"),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    ),
    "",
    "## 如何理解这些结果",
    "",
    "- `defer_as_spec_debt` 表示 JiSpec 生成了接管候选，但行为语义还需要 owner 确认，暂不作为强制 gate。",
    "- `takeover-brief.md` 和 `retakeover-summary.md` 是人类 reviewer 的入口。",
    "- `domain.yaml`、`api_spec.json`、`adoption-ranked-evidence.json` 和 `bootstrap-takeover.json` 是机器流程可以继续消费的契约和事实。",
    "- `feature.json` 位于 `.spec/spec-debt/` 下，表示行为证据薄弱或存在冲突，需要后续确认。",
    "",
    "## 工作区",
    "",
    `根目录：\`${normalizePath(root)}\``,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function renderConsoleReport(root: string, reports: DemoFixtureReport[], summaryPath: string): string {
  const lines = [
    "Synthetic messy legacy takeover demo",
    `Root: ${normalizePath(root)}`,
    `Summary: ${normalizePath(summaryPath)}`,
    "",
    "Fixture decisions:",
    ...reports.map((report) => `- ${report.id}: ${report.decision}, score=${report.takeoverReadinessScore}/100, risk=${report.featureOverclaimRisk}, next=${report.nextAction}, verify=${report.verifyVerdict}, top=${report.topEvidence.slice(0, 2).join(", ")}`),
    "",
    "Open these first:",
    `- ${normalizePath(path.join(root, "messy-legacy-takeover-demo-summary.md"))}`,
    `- ${normalizePath(path.join(root, RETAKEOVER_POOL_SUMMARY_RELATIVE_PATH))}`,
  ];
  return lines.join("\n");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right));
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Messy legacy takeover demo failed: ${message}`);
  process.exit(1);
});
