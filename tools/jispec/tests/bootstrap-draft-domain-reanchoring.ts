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
    primary_contexts?: string[];
    domain_story?: string[];
    areas?: Array<{ name?: string; provenance_note?: string; source_files?: string[] }>;
  };
}

async function main(): Promise<void> {
  console.log("=== Bootstrap Draft Domain Re-Anchoring Test ===\n");

  const results: TestResult[] = [];
  const ledgerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-domain-ledger-"));
  const gatewayRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-domain-gateway-"));

  try {
    seedLedgerRepository(ledgerRoot);
    seedGatewayRepository(gatewayRoot);

    const ledgerDraft = await discoverAndDraftDomain(ledgerRoot);
    const gatewayDraft = await discoverAndDraftDomain(gatewayRoot);

    const ledgerContexts = ledgerDraft.domain?.primary_contexts ?? [];
    const ledgerAreaNames = new Set((ledgerDraft.domain?.areas ?? []).map((area) => area.name));
    const gatewayContexts = gatewayDraft.domain?.primary_contexts ?? [];
    const gatewayAreaNames = new Set((gatewayDraft.domain?.areas ?? []).map((area) => area.name));

    results.push({
      name: "ledger-style repository re-anchors around business boundaries",
      passed:
        containsAny(ledgerContexts, ["portfolio", "governance", "ledger", "reporting", "withdrawal"]) &&
        ledgerAreaNames.has("portfolio") &&
        ledgerAreaNames.has("governance") &&
        ledgerAreaNames.has("ledger") &&
        ledgerAreaNames.has("reporting"),
      error: `Expected portfolio/governance/ledger/reporting boundaries, got contexts=${JSON.stringify(ledgerContexts)}, areas=${JSON.stringify([...ledgerAreaNames])}.`,
    });

    results.push({
      name: "gateway-style repository re-anchors around control plane and protocol surfaces",
      passed:
        gatewayContexts.includes("control-plane") &&
        gatewayAreaNames.has("gateway") &&
        gatewayAreaNames.has("protocol") &&
        gatewayAreaNames.has("client"),
      error: `Expected control-plane/gateway/protocol/client boundaries, got contexts=${JSON.stringify(gatewayContexts)}, areas=${JSON.stringify([...gatewayAreaNames])}.`,
    });

    results.push({
      name: "generic lifecycle and implementation words do not become primary contexts",
      passed:
        ![...ledgerContexts, ...gatewayContexts].some((name) =>
          ["init", "create", "update", "delete", "report", "route", "api", "handler", "main", "src"].includes(name),
        ),
      error: `Expected generic names to be blocked, got ledger=${JSON.stringify(ledgerContexts)}, gateway=${JSON.stringify(gatewayContexts)}.`,
    });

    results.push({
      name: "domain story explains boundaries rather than only strongest route",
      passed:
        (ledgerDraft.domain?.domain_story ?? []).some((line) => line.includes("Primary takeover boundaries")) &&
        (ledgerDraft.domain?.domain_story ?? []).some((line) => line.includes("strongest domain boundary")),
      error: `Expected boundary-oriented domain story, got ${JSON.stringify(ledgerDraft.domain?.domain_story)}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap draft domain re-anchoring execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(ledgerRoot, { recursive: true, force: true });
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

function seedLedgerRepository(root: string): void {
  writeProject(root, ["finance-portfolio"]);
  fs.writeFileSync(path.join(root, "README.md"), "# Portfolio Control\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "ledger-domain", private: true }, null, 2), "utf-8");

  for (const doc of ["portfolio", "governance", "reporting"]) {
    fs.mkdirSync(path.join(root, "docs", doc), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", doc, "README.md"), `# ${doc}\n`, "utf-8");
  }

  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.writeFileSync(path.join(root, "schemas", "ledger.schema.json"), JSON.stringify({ type: "object" }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "src", "routes"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes", "withdrawal-routes.ts"),
    'const app = { post: () => undefined };\napp.post("/withdrawals/request", () => "ok");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "src", "create"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "create", "init.ts"), "export const init = true;\n", "utf-8");
}

function seedGatewayRepository(root: string): void {
  writeProject(root, ["network-gateway"]);
  fs.writeFileSync(path.join(root, "README.md"), "# Control Plane Gateway\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "gateway-domain", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "docs", "governance"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "governance", "README.md"), "# Control Plane Governance\n", "utf-8");
  fs.mkdirSync(path.join(root, "docs", "control-plane"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "control-plane", "README.md"), "# Control Plane\n", "utf-8");
  fs.mkdirSync(path.join(root, "docs", "protocols"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "protocols", "README.md"), "# Gateway Protocols\n", "utf-8");

  fs.mkdirSync(path.join(root, "api", "proto"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "api", "proto", "gateway.proto"),
    'syntax = "proto3";\nservice Gateway { rpc Switch(SwitchRequest) returns (SwitchResult); }\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "sdk"), { recursive: true });
  fs.writeFileSync(path.join(root, "sdk", "client.ts"), "export class AccessClient {}\n", "utf-8");

  fs.mkdirSync(path.join(root, "src", "main"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "main", "handler.ts"), "export const handler = true;\n", "utf-8");
}

function writeProject(root: string, packs: string[]): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    yaml.dump({
      id: "domain-reanchoring",
      name: "Domain Reanchoring",
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

function containsAny(values: string[], expected: string[]): boolean {
  return expected.some((value) => values.includes(value));
}

void main();
