import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectStaticImplementationFacts } from "../greenfield/static-collector";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Greenfield Static Collector Pipeline Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-static-collector-"));
  const results: TestResult[] = [];

  try {
    writeFixture(root);
    const manifest = collectStaticImplementationFacts(root, { generatedAt: "2026-04-29T00:00:00.000Z" });

    results.push(record("collector emits a deterministic manifest and declarations", () => {
      assert.equal(manifest.schema_version, 1);
      assert.equal(manifest.manifest_kind, "deterministic-static-collector");
      assert.equal(manifest.generated_at, "2026-04-29T00:00:00.000Z");
      assert.ok(manifest.collectors.some((collector) => collector.id === "p0-route-endpoint"));
      assert.ok(manifest.collectors.some((collector) => collector.id === "p0-db-migration-schema"));
    }));

    results.push(record("P0 collectors extract route, migration, and schema facts", () => {
      assert.ok(manifest.facts.some((fact) =>
        fact.id === "route:POST /orders" &&
        fact.kind === "route" &&
        fact.path === "src/routes/orders.ts" &&
        fact.confidence === "explicit_anchor" &&
        fact.contract_ids.includes("CTR-ORDERING-001")
      ));
      assert.ok(manifest.facts.some((fact) =>
        fact.id === "migration:db/migrations/202604290001_create_orders.sql" &&
        fact.kind === "migration" &&
        fact.requirement_ids.includes("REQ-ORD-001")
      ));
      assert.ok(manifest.facts.some((fact) =>
        fact.id === "schema:orders" &&
        fact.kind === "schema" &&
        Array.isArray(fact.metadata?.columns) &&
        (fact.metadata?.columns as string[]).includes("id")
      ));
    }));

    results.push(record("P1 collectors extract explicit test tags and shallow type signatures", () => {
      assert.ok(manifest.facts.some((fact) =>
        fact.id === "test:tests/orders.test.ts" &&
        fact.kind === "test" &&
        fact.scenario_ids.includes("SCN-ORDER-CHECKOUT-VALID")
      ));
      assert.ok(manifest.facts.some((fact) =>
        fact.id === "type_definition:src/domain/order.ts:Order" &&
        fact.kind === "type_definition" &&
        Array.isArray(fact.metadata?.first_level_fields) &&
        (fact.metadata?.first_level_fields as string[]).includes("total")
      ));
    }));

    results.push(record("dynamic routes produce unresolved surfaces instead of blocking graph facts", () => {
      assert.ok(manifest.unresolved_surfaces.some((surface) =>
        surface.id === "unresolved_surface:route:src/routes/dynamic.ts:POST:dynamicPath" &&
        surface.kind === "unresolved_surface" &&
        surface.confidence === "unresolved"
      ));
      assert.ok(!manifest.facts.some((fact) => fact.id.includes("dynamicPath") && fact.kind === "route"));
    }));

    results.push(record("P2 package scripts are advisory context only", () => {
      assert.ok(manifest.facts.some((fact) =>
        fact.id === "package_script:verify" &&
        fact.kind === "package_script" &&
        fact.confidence === "heuristic" &&
        fact.metadata?.advisory_only === true
      ));
    }));

    results.push(record("repo-internal fixtures are marked advisory-only and stay outside governed scope", () => {
      assert.ok(manifest.facts.some((fact) =>
        fact.id === "route:POST /fixture" &&
        fact.path === "tools/jispec/tests/runtime-fixture.ts" &&
        fact.metadata?.advisory_only === true
      ));
      assert.ok(manifest.facts.some((fact) =>
        fact.id === "route:POST /example-orders" &&
        fact.path === "examples/minimal/src/routes.ts" &&
        fact.metadata?.advisory_only === true
      ));
      assert.ok(manifest.unresolved_surfaces.some((surface) =>
        surface.id === "unresolved_surface:graphql:tools/jispec/runtime-graphql.ts" &&
        surface.metadata?.advisory_only === true
      ));
    }));
  } catch (error) {
    results.push({
      name: "greenfield static collector pipeline execution",
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

function writeFixture(root: string): void {
  writeFile(root, "src/routes/orders.ts", [
    "import { Router } from 'express';",
    "export const router = Router();",
    "// @jispec contract CTR-ORDERING-001",
    "router.post('/orders', (_req, res) => res.status(202).send({ ok: true }));",
  ].join("\n"));

  writeFile(root, "src/routes/dynamic.ts", [
    "import { Router } from 'express';",
    "export const router = Router();",
    "const dynamicPath = process.env.ORDER_PATH || '/orders';",
    "router.post(dynamicPath, (_req, res) => res.status(202).send({ ok: true }));",
  ].join("\n"));

  writeFile(root, "db/migrations/202604290001_create_orders.sql", [
    "-- @jispec requirement REQ-ORD-001",
    "create table orders (",
    "  id text primary key,",
    "  total numeric not null,",
    "  customer_id text,",
    "  foreign key (customer_id) references customers(id)",
    ");",
  ].join("\n"));

  writeFile(root, "src/domain/order.ts", [
    "// @jispec contract CTR-ORDERING-001",
    "export interface Order {",
    "  id: string;",
    "  total: number;",
    "}",
  ].join("\n"));

  writeFile(root, "tests/orders.test.ts", [
    "// @jispec scenario SCN-ORDER-CHECKOUT-VALID",
    "test('SCN-ORDER-CHECKOUT-VALID creates an order', () => {",
    "  expect(true).toBe(true);",
    "});",
  ].join("\n"));

  writeFile(root, "package.json", JSON.stringify({
    scripts: {
      verify: "jispec verify",
    },
  }, null, 2));

  writeFile(root, "tools/jispec/tests/runtime-fixture.ts", [
    "import { Router } from 'express';",
    "export const router = Router();",
    "router.post('/fixture', (_req, res) => res.status(202).send({ ok: true }));",
  ].join("\n"));

  writeFile(root, "tools/jispec/runtime-graphql.ts", [
    "const typeDefs = `type Query { ping: String }`;",
    "export { typeDefs };",
  ].join("\n"));

  writeFile(root, "examples/minimal/src/routes.ts", [
    "import { Router } from 'express';",
    "export const router = Router();",
    "router.post('/example-orders', (_req, res) => res.status(202).send({ ok: true }));",
  ].join("\n"));
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

void main();
