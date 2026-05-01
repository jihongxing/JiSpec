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

async function main(): Promise<void> {
  console.log("=== Bootstrap Draft Feature Scenarios Test ===\n");

  const ledgerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-feature-ledger-"));
  const gatewayRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-feature-gateway-"));
  const thinRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-feature-thin-"));
  const results: TestResult[] = [];

  try {
    seedLedgerRepository(ledgerRoot);
    seedGatewayRepository(gatewayRoot);
    seedThinRouteRepository(thinRoot);

    const ledgerFeature = await discoverAndDraftFeature(ledgerRoot);
    const gatewayFeature = await discoverAndDraftFeature(gatewayRoot);
    const thinFeature = await discoverAndDraftFeature(thinRoot);

    results.push({
      name: "ledger feature draft uses business scenarios instead of route review",
      passed:
        ledgerFeature.includes("Scenario: Withdrawal request is approved, executed, and recorded") &&
        ledgerFeature.includes("Given a withdrawal request is pending manual approval") &&
        ledgerFeature.includes("When an authorized operator approves and records the execution") &&
        ledgerFeature.includes("Then the ledger and audit trail preserve the approved withdrawal outcome") &&
        ledgerFeature.includes('supporting API evidence includes "POST /withdrawals/request"') &&
        ledgerFeature.includes("# adoption_recommendation: accept_candidate") &&
        ledgerFeature.includes("# recommendation: accept_candidate") &&
        ledgerFeature.includes("# evidence_level: strong") &&
        ledgerFeature.includes('"document"') &&
        ledgerFeature.includes('"schema"') &&
        ledgerFeature.includes('"test"') &&
        ledgerFeature.includes("# confidence_reasons:") &&
        !ledgerFeature.includes("remains reviewable during the first adoption loop"),
      error: `Expected ledger behavior scenario, got:\n${ledgerFeature}`,
    });

    results.push({
      name: "gateway feature draft creates control-plane and gateway recovery stories",
      passed:
        gatewayFeature.includes("Scenario: Control plane applies a policy change safely") &&
        gatewayFeature.includes("Scenario: Gateway strategy switch preserves transport continuity") &&
        gatewayFeature.includes("Scenario: Client session recovers after access disruption") &&
        gatewayFeature.includes("Given a gateway is serving traffic under an active strategy") &&
        gatewayFeature.includes("Then the gateway applies the new strategy without losing recovery evidence") &&
        gatewayFeature.includes("# recommendation: accept_candidate") &&
        gatewayFeature.includes("# evidence_level: partial") &&
        gatewayFeature.includes('"document"') &&
        gatewayFeature.includes('"proto"') &&
        gatewayFeature.includes('"schema"') &&
        gatewayFeature.includes("protobuf service mapping anchors the boundary"),
      error: `Expected gateway/control/client behavior scenarios, got:\n${gatewayFeature}`,
    });

    results.push({
      name: "thin route-only evidence is marked for human review",
      passed:
        thinFeature.includes("@behavior_needs_human_review") &&
        thinFeature.includes("# evidence_level: weak") &&
        thinFeature.includes('# evidence_kinds: ["route"]') &&
        thinFeature.includes("# adoption_recommendation: defer_as_spec_debt") &&
        thinFeature.includes("# recommendation: defer_as_spec_debt") &&
        thinFeature.includes("route-only behavior lacks contract, document, proto, aggregate, or test corroboration") &&
        thinFeature.includes("behavior_needs_human_review remains open") &&
        thinFeature.includes("Scenario: Order behavior is confirmed before enforcement") &&
        !thinFeature.includes("GET /orders remains reviewable") &&
        !thinFeature.includes("POST /orders remains reviewable"),
      error: `Expected thin behavior draft to be explicit human-review candidate, got:\n${thinFeature}`,
    });

    results.push({
      name: "all generated scenarios use Given/When/Then structure",
      passed:
        countOccurrences(ledgerFeature, "  Scenario:") >= 1 &&
        countOccurrences(ledgerFeature, "    Given ") >= countOccurrences(ledgerFeature, "  Scenario:") &&
        countOccurrences(ledgerFeature, "    When ") >= countOccurrences(ledgerFeature, "  Scenario:") &&
        countOccurrences(ledgerFeature, "    Then ") >= countOccurrences(ledgerFeature, "  Scenario:") &&
        countOccurrences(gatewayFeature, "    Given ") >= countOccurrences(gatewayFeature, "  Scenario:") &&
        countOccurrences(gatewayFeature, "    When ") >= countOccurrences(gatewayFeature, "  Scenario:") &&
        countOccurrences(gatewayFeature, "    Then ") >= countOccurrences(gatewayFeature, "  Scenario:"),
      error: `Expected every scenario to include Given/When/Then.\nLedger:\n${ledgerFeature}\nGateway:\n${gatewayFeature}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap draft feature scenario execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(ledgerRoot, { recursive: true, force: true });
    fs.rmSync(gatewayRoot, { recursive: true, force: true });
    fs.rmSync(thinRoot, { recursive: true, force: true });
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

async function discoverAndDraftFeature(root: string): Promise<string> {
  runBootstrapDiscover({ root });
  const draftResult = await runBootstrapDraft({ root });
  const featureArtifact = draftResult.draftBundle.artifacts.find((artifact) => artifact.kind === "feature");
  if (!featureArtifact) {
    throw new Error("Expected feature artifact to exist.");
  }
  return featureArtifact.content;
}

function seedLedgerRepository(root: string): void {
  writeProject(root, ["finance-portfolio"]);
  fs.writeFileSync(path.join(root, "README.md"), "# Portfolio Control\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "feature-ledger", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "docs", "withdrawal"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "withdrawal", "README.md"), "# Withdrawal approval\n", "utf-8");
  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.writeFileSync(path.join(root, "schemas", "ledger.schema.json"), JSON.stringify({ type: "object" }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "src", "routes"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes", "withdrawal-routes.ts"),
    'const app = { post: () => undefined };\napp.post("/withdrawals/request", () => "ok");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "tests", "withdrawal.test.ts"), "describe('withdrawal approval', () => {});\n", "utf-8");
}

function seedGatewayRepository(root: string): void {
  writeProject(root, ["network-gateway"]);
  fs.writeFileSync(path.join(root, "README.md"), "# Control Plane Gateway\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "feature-gateway", private: true }, null, 2), "utf-8");

  for (const doc of ["control-plane", "protocols", "client"]) {
    fs.mkdirSync(path.join(root, "docs", doc), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", doc, "README.md"), `# ${doc}\n`, "utf-8");
  }

  fs.mkdirSync(path.join(root, "api", "proto"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "api", "proto", "gateway.proto"),
    'syntax = "proto3";\nservice Gateway { rpc Switch(SwitchRequest) returns (SwitchResult); }\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "sdk"), { recursive: true });
  fs.writeFileSync(path.join(root, "sdk", "client.ts"), "export class AccessClient {}\n", "utf-8");
}

function seedThinRouteRepository(root: string): void {
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "feature-thin", private: true }, null, 2), "utf-8");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "orders-routes.ts"),
    'const app = { post: () => undefined };\napp.post("/orders", () => "created");\n',
    "utf-8",
  );
}

function writeProject(root: string, packs: string[]): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    yaml.dump({
      id: "feature-scenarios",
      name: "Feature Scenarios",
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

function countOccurrences(input: string, pattern: string): number {
  return input.split(pattern).length - 1;
}

void main();
