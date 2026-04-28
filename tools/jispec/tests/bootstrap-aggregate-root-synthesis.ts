import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft } from "../bootstrap/draft";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface DomainDraft {
  domain?: {
    aggregate_roots?: DraftAggregateRoot[];
  };
}

interface DraftAggregateRoot {
  name?: string;
  source_files?: string[];
  confidence_score?: number;
  provenance_note?: string;
  evidence?: {
    schemas?: number;
    routes?: number;
    tests?: number;
    documents?: number;
    business_vocabulary?: number;
  };
}

async function main(): Promise<void> {
  console.log("=== Bootstrap Aggregate Root Synthesis Test ===\n");

  const financeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-aggregate-finance-"));
  const gatewayRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-aggregate-gateway-"));
  const results: TestResult[] = [];

  try {
    seedFinanceRepository(financeRoot);
    seedGatewayRepository(gatewayRoot);

    const financeDraft = await discoverAndDraftDomain(financeRoot);
    const gatewayDraft = await discoverAndDraftDomain(gatewayRoot);
    const financeAggregates = financeDraft.domain?.aggregate_roots ?? [];
    const gatewayAggregates = gatewayDraft.domain?.aggregate_roots ?? [];
    const financeNames = financeAggregates.map((aggregate) => aggregate.name).filter(Boolean) as string[];
    const gatewayNames = gatewayAggregates.map((aggregate) => aggregate.name).filter(Boolean) as string[];

    results.push({
      name: "finance fixture synthesizes expected aggregate roots",
      passed: containsAll(financeNames, [
        "Portfolio",
        "GovernanceDecision",
        "WithdrawalRequest",
        "AlphaLedger",
        "BrokerSyncRun",
      ]),
      error: `Expected finance aggregate roots, got ${JSON.stringify(financeAggregates)}.`,
    });

    results.push({
      name: "gateway/proto fixture synthesizes expected aggregate roots",
      passed: containsAll(gatewayNames, [
        "Gateway",
        "Cell",
        "Session",
        "BillingAccount",
        "ControlCommand",
      ]),
      error: `Expected gateway aggregate roots, got ${JSON.stringify(gatewayAggregates)}.`,
    });

    results.push({
      name: "aggregate candidates carry source files, confidence, provenance, and evidence counts",
      passed:
        [...financeAggregates, ...gatewayAggregates]
          .filter((aggregate) =>
            ["Portfolio", "GovernanceDecision", "Gateway", "ControlCommand"].includes(aggregate.name ?? ""),
          )
          .every((aggregate) =>
            Array.isArray(aggregate.source_files) &&
            aggregate.source_files.length > 0 &&
            typeof aggregate.confidence_score === "number" &&
            aggregate.confidence_score >= 0.65 &&
            typeof aggregate.provenance_note === "string" &&
            aggregate.provenance_note.includes("Synthesized from") &&
            aggregate.evidence &&
            ((aggregate.evidence.schemas ?? 0) + (aggregate.evidence.business_vocabulary ?? 0) + (aggregate.evidence.documents ?? 0) > 0),
          ),
      error: `Expected aggregate metadata to be populated, finance=${JSON.stringify(financeAggregates)}, gateway=${JSON.stringify(gatewayAggregates)}.`,
    });

    const financeIndex = indexByName(financeAggregates);
    const deposit = financeIndex.get("Deposit");
    const acceptedFinanceRoots = ["Portfolio", "GovernanceDecision", "WithdrawalRequest", "AlphaLedger", "BrokerSyncRun"]
      .map((name) => financeIndex.get(name))
      .filter((aggregate): aggregate is DraftAggregateRoot => Boolean(aggregate));

    results.push({
      name: "aggregate roots do not rely on route count alone",
      passed:
        acceptedFinanceRoots.length === 5 &&
        acceptedFinanceRoots.every((aggregate) => (aggregate.confidence_score ?? 0) >= 0.7) &&
        (!deposit || acceptedFinanceRoots.every((aggregate) => (aggregate.confidence_score ?? 0) > (deposit.confidence_score ?? 0))),
      error: `Expected schema/document/vocabulary aggregates to outrank route-only Deposit, roots=${JSON.stringify(financeAggregates)}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap aggregate root synthesis execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(financeRoot, { recursive: true, force: true });
    fs.rmSync(gatewayRoot, { recursive: true, force: true });
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

async function discoverAndDraftDomain(root: string): Promise<DomainDraft> {
  runBootstrapDiscover({ root });
  const draftResult = await runBootstrapDraft({ root });
  const domainArtifact = draftResult.draftBundle.artifacts.find((artifact) => artifact.kind === "domain");
  if (!domainArtifact) {
    throw new Error("Expected domain artifact to exist.");
  }
  return yaml.load(domainArtifact.content) as DomainDraft;
}

function seedFinanceRepository(root: string): void {
  writeProject(root, ["finance-portfolio"]);
  fs.writeFileSync(
    path.join(root, "README.md"),
    [
      "# 投资组合治理",
      "",
      "投资组合由 Portfolio 管理，策略审批会形成 GovernanceDecision。",
      "券商同步以 BrokerSyncRun 为一次执行边界，Alpha账本记录策略实验。",
      "提现流程通过 WithdrawalRequest 管理申请状态。",
    ].join("\n"),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "finance-aggregates", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "database"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "database", "schema.prisma"),
    [
      "model Portfolio { id String @id }",
      "model GovernanceDecision { id String @id }",
      "model AlphaLedger { id String @id }",
      "model WithdrawalRequest { id String @id }",
      "",
    ].join("\n"),
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "db", "migrations"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "db", "migrations", "20240101_create_broker_sync_runs.sql"),
    "create table broker_sync_runs(id text primary key);\n",
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "src", "routes"), { recursive: true });
  for (let index = 0; index < 10; index += 1) {
    fs.writeFileSync(
      path.join(root, "src", "routes", `deposit-${index}.ts`),
      `const app = { post: () => undefined };\napp.post("/deposit/${index}", () => "ok");\n`,
      "utf-8",
    );
  }
}

function seedGatewayRepository(root: string): void {
  writeProject(root, ["network-gateway", "saas-control-plane"]);
  fs.writeFileSync(
    path.join(root, "README.md"),
    [
      "# Gateway Control Plane",
      "",
      "Gateway coordinates Cell placement, Session recovery, BillingAccount state, and ControlCommand delivery.",
    ].join("\n"),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "gateway-aggregates", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "api", "proto"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "api", "proto", "gateway.proto"),
    [
      'syntax = "proto3";',
      "service Gateway { rpc Switch(ControlCommand) returns (Session); }",
      "message Gateway { string id = 1; }",
      "message Cell { string id = 1; }",
      "message Session { string id = 1; }",
      "message BillingAccount { string id = 1; }",
      "message ControlCommand { string id = 1; }",
      "",
    ].join("\n"),
    "utf-8",
  );

  fs.writeFileSync(
    path.join(root, "openapi.yaml"),
    [
      "openapi: 3.0.0",
      "info:",
      "  title: Gateway Control",
      "  version: 1.0.0",
      "paths: {}",
      "components:",
      "  schemas:",
      "    BillingAccount:",
      "      type: object",
      "    ControlCommand:",
      "      type: object",
      "",
    ].join("\n"),
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "src", "routes"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes", "session-routes.ts"),
    'const app = { post: () => undefined };\napp.post("/gateway/sessions/recover", () => "ok");\n',
    "utf-8",
  );
}

function writeProject(root: string, packs: string[]): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    yaml.dump({
      id: "aggregate-fixture",
      name: "Aggregate Fixture",
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

function containsAll(values: string[], expected: string[]): boolean {
  return expected.every((value) => values.includes(value));
}

function indexByName(aggregates: DraftAggregateRoot[]): Map<string, DraftAggregateRoot> {
  return new Map(aggregates.filter((aggregate) => aggregate.name).map((aggregate) => [aggregate.name!, aggregate]));
}

void main();
