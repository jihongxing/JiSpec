import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBootstrapDiscover } from "../bootstrap/discover";
import type { AdoptionRankedEvidence } from "../bootstrap/evidence-ranking";
import type { ContractSourceAdapterReport } from "../bootstrap/contract-source-adapters";
import {
  augmentContractGraphWithStaticFacts,
  collectStaticImplementationFacts,
} from "../greenfield/static-collector";
import type { ContractGraph } from "../greenfield/contract-graph";
import { collectGreenfieldRatchetIssues } from "../verify/greenfield-ratchet-collector";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== Contract Source Adapters Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-contract-source-adapters-"));
  const results: TestResult[] = [];

  try {
    writeFixture(root);
    const discover = runBootstrapDiscover({ root });
    const bootstrapDir = path.join(root, ".spec", "facts", "bootstrap");
    const adapterPath = path.join(bootstrapDir, "contract-source-adapters.json");
    const rankedPath = path.join(bootstrapDir, "adoption-ranked-evidence.json");
    const report = JSON.parse(fs.readFileSync(adapterPath, "utf-8")) as ContractSourceAdapterReport;
    const ranked = JSON.parse(fs.readFileSync(rankedPath, "utf-8")) as AdoptionRankedEvidence;
    const staticManifest = collectStaticImplementationFacts(root, { generatedAt: "2026-05-02T00:00:00.000Z" });

    results.push(record("bootstrap writes deterministic adapter evidence for contract source families", () => {
      assert.ok(discover.writtenFiles.some((filePath) => filePath.endsWith(".spec/facts/bootstrap/contract-source-adapters.json")));
      assert.equal(report.report_kind, "deterministic-contract-source-adapters");
      assert.ok(report.evidence.every((entry) => entry.deterministic === true && entry.llm_blocking_gate === false));
      for (const adapterId of ["openapi", "protobuf", "graphql", "db_migration", "test_framework", "monorepo_manifest"]) {
        assert.ok(report.adapters.some((adapter) => adapter.id === adapterId && adapter.evidence_count > 0), `missing ${adapterId}`);
      }
    }));

    results.push(record("adapter evidence improves adoption ranking without promoting weak route noise", () => {
      const topPaths = ranked.evidence.slice(0, 6).map((entry) => entry.path);
      assert.ok(topPaths.includes("api/openapi.yaml"));
      assert.ok(topPaths.includes("api/proto/orders.proto"));
      assert.ok(topPaths.includes("api/graphql/schema.graphql"));
      assert.ok(ranked.evidence.some((entry) =>
        entry.path === "api/graphql/schema.graphql" &&
        entry.metadata?.contractSourceAdapter === "graphql" &&
        entry.metadata?.boundarySignal === "schema_truth_source"
      ));
      assert.ok(!ranked.evidence.slice(0, 6).some((entry) => entry.path === "src/routes/weak-route.ts"));
    }));

    results.push(record("static collector feeds adapter schema facts into the contract graph when explicitly anchored", () => {
      const graph = augmentContractGraphWithStaticFacts(emptyContractGraph(), staticManifest.facts);
      assert.ok(staticManifest.facts.some((fact) =>
        fact.id === "schema:api/openapi.yaml" &&
        fact.metadata?.adapter_id === "openapi" &&
        fact.contract_ids.includes("CTR-ORDERING-001")
      ));
      assert.ok(graph.nodes.some((node) => node.id === "@code:api/openapi.yaml" && node.kind === "code_fact"));
      assert.ok(graph.edges.some((edge) =>
        edge.from === "@api:CTR-ORDERING-001" &&
        edge.to === "@code:api/openapi.yaml" &&
        edge.relation === "implements"
      ));
    }));

    results.push(record("weak GraphQL source evidence stays owner-review unresolved instead of adopted contract", () => {
      writeMinimalGreenfieldGraph(root);
      const issues = collectGreenfieldRatchetIssues(root);
      assert.ok(staticManifest.unresolved_surfaces.some((surface) =>
        surface.id === "unresolved_surface:graphql:src/graphql/resolver.ts" &&
        surface.metadata?.adapter_id === "graphql"
      ));
      assert.ok(!staticManifest.facts.some((fact) => fact.id === "schema:src/graphql/resolver.ts"));
      assert.ok(issues.some((issue) =>
        issue.code === "GREENFIELD_UNRESOLVED_SURFACE" &&
        issue.path === "src/graphql/resolver.ts" &&
        issueDetailsMetadata(issue.details).adapter_id === "graphql"
      ));
    }));

    results.push(record("multi-language monorepo fixture keeps strong contracts ahead of topology support", () => {
      const candidateContracts = report.evidence.filter((entry) => entry.adoption_disposition === "candidate_contract");
      const monorepoEntries = report.evidence.filter((entry) => entry.adapter_id === "monorepo_manifest");
      assert.ok(candidateContracts.some((entry) => entry.path === "api/openapi.yaml"));
      assert.ok(candidateContracts.some((entry) => entry.path === "api/proto/orders.proto"));
      assert.ok(candidateContracts.some((entry) => entry.path === "api/graphql/schema.graphql"));
      assert.ok(monorepoEntries.length >= 1);
      assert.ok(monorepoEntries.every((entry) => entry.adoption_disposition === "supporting_only"));
      assert.ok(ranked.evidence.some((entry) => entry.path === "services/go/go.mod"));
      assert.ok(!ranked.evidence.some((entry) => entry.path.includes("vendor/")));
    }));
  } catch (error) {
    results.push({
      name: "contract source adapters execution",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
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

function issueDetailsMetadata(details: unknown): Record<string, unknown> {
  if (!details || typeof details !== "object" || !("metadata" in details)) {
    return {};
  }
  const metadata = (details as { metadata?: unknown }).metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function writeFixture(root: string): void {
  writeFile(root, "package.json", JSON.stringify({
    name: "contract-source-adapter-fixture",
    private: true,
    workspaces: ["apps/*", "packages/*"],
  }, null, 2));
  writeFile(root, "pnpm-workspace.yaml", "packages:\n  - apps/*\n  - packages/*");
  writeFile(root, "api/openapi.yaml", [
    "# @jispec contract CTR-ORDERING-001",
    "openapi: 3.0.0",
    "paths:",
    "  /orders:",
    "    post:",
    "      responses:",
    "        '202':",
    "          description: accepted",
  ].join("\n"));
  writeFile(root, "api/proto/orders.proto", [
    'syntax = "proto3";',
    "// @jispec contract CTR-ORDERING-001",
    "service OrderService { rpc CreateOrder (CreateOrderRequest) returns (CreateOrderResponse); }",
    "message CreateOrderRequest { string id = 1; }",
    "message CreateOrderResponse { string id = 1; }",
  ].join("\n"));
  writeFile(root, "api/graphql/schema.graphql", [
    "# @jispec contract CTR-ORDERING-001",
    "type Query { order(id: ID!): Order }",
    "type Mutation { createOrder(input: CreateOrderInput!): Order }",
    "type Order { id: ID! total: Float! }",
    "input CreateOrderInput { id: ID! }",
  ].join("\n"));
  writeFile(root, "db/migrations/202605020001_create_orders.sql", [
    "-- @jispec requirement REQ-ORDERING-001",
    "create table orders (id text primary key, total numeric not null);",
  ].join("\n"));
  writeFile(root, "tests/orders.feature", [
    "Feature: Ordering",
    "  Scenario: accepted order",
    "    Given a valid cart",
    "    When the shopper checks out",
    "    Then the order is accepted",
  ].join("\n"));
  writeFile(root, "src/routes/weak-route.ts", "export const routeName = 'orders';");
  writeFile(root, "src/graphql/resolver.ts", [
    "import { gql } from 'graphql-tag';",
    "export const typeDefs = gql`type Query { order(id: ID!): Order }`;",
    "export const resolvers = { Query: { order: () => null } };",
  ].join("\n"));
  writeFile(root, "services/go/go.mod", "module example.com/orders");
  writeFile(root, "services/go/main.go", "package main\nfunc main() {}");
  writeFile(root, "services/rust/Cargo.toml", "[package]\nname = \"orders\"\nversion = \"0.1.0\"");
  writeFile(root, "services/rust/src/lib.rs", "pub trait OrderPort { fn submit(&self); }");
  writeFile(root, "services/python/pyproject.toml", "[project]\nname = \"orders-python\"");
  writeFile(root, "vendor/mirror/openapi.yaml", "openapi: 3.0.0");
}

function writeMinimalGreenfieldGraph(root: string): void {
  writeFile(root, ".spec/evidence/evidence-graph.json", JSON.stringify({
    schemaVersion: 1,
    generatedAt: "2026-05-02T00:00:00.000Z",
    graphKind: "greenfield-initialization",
    nodes: [],
    edges: [],
    implementationFacts: [],
    summary: {
      nodeCounts: {},
      edgeCounts: {},
      requirementCoverage: {
        total: 0,
        withScenario: 0,
        withContract: 0,
        withSlice: 0,
        withTest: 0,
        uncovered: [],
      },
    },
    warnings: [],
  }, null, 2));
}

function emptyContractGraph(): ContractGraph {
  return {
    schema_version: 1,
    graph_kind: "deterministic-contract-graph",
    generated_at: "2026-05-02T00:00:00.000Z",
    nodes: [{
      id: "@api:CTR-ORDERING-001",
      kind: "api_contract",
      label: "CTR-ORDERING-001",
    }],
    edges: [],
    summary: {
      node_counts: {
        requirement: 0,
        bounded_context: 0,
        domain_entity: 0,
        domain_event: 0,
        invariant: 0,
        api_contract: 1,
        bdd_scenario: 0,
        slice: 0,
        test: 0,
        code_fact: 0,
        migration: 0,
        review_decision: 0,
        spec_debt: 0,
        baseline: 0,
        delta: 0,
      },
      edge_counts: {
        defines: 0,
        owns: 0,
        depends_on: 0,
        verifies: 0,
        covered_by: 0,
        implements: 0,
        consumes: 0,
        emits: 0,
        blocked_by: 0,
        supersedes: 0,
        deferred_by: 0,
        waived_by: 0,
        derived_from: 0,
      },
    },
    warnings: [],
  };
}

function writeFile(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${content}\n`, "utf-8");
}

function record(name: string, run: () => void): TestResult {
  try {
    run();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

main();
