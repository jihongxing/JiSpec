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
    areas?: Array<{ name?: string; source_files?: string[]; provenance_note?: string }>;
    aggregate_roots?: Array<{ name?: string; source_files?: string[] }>;
    proto_service_mappings?: ProtoServiceMappingDraft[];
  };
}

interface ApiDraft {
  api_spec?: {
    surfaces?: ApiSurfaceDraft[];
    proto_service_mappings?: ProtoServiceMappingDraft[];
  };
}

interface ProtoServiceMappingDraft {
  service?: string;
  bounded_context?: string;
  context_labels?: string[];
  aggregate_roots?: string[];
  source_file?: string;
  operations?: Array<{
    operation?: string;
    request_type?: string;
    response_type?: string;
    aggregate_roots?: string[];
  }>;
}

interface ApiSurfaceDraft {
  surface_kind?: string;
  service?: string;
  operation?: string;
  bounded_context?: string;
  context_labels?: string[];
  aggregate_roots?: string[];
  proto_operation?: {
    service?: string;
    rpc?: string;
    request_type?: string;
    response_type?: string;
  };
}

async function main(): Promise<void> {
  console.log("=== Bootstrap Proto Domain Mapping Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-proto-domain-"));
  const results: TestResult[] = [];

  try {
    seedRepository(tempRoot);
    runBootstrapDiscover({ root: tempRoot });
    const draftResult = await runBootstrapDraft({ root: tempRoot });
    const domainArtifact = draftResult.draftBundle.artifacts.find((artifact) => artifact.kind === "domain");
    const apiArtifact = draftResult.draftBundle.artifacts.find((artifact) => artifact.kind === "api");
    const featureArtifact = draftResult.draftBundle.artifacts.find((artifact) => artifact.kind === "feature");
    if (!domainArtifact || !apiArtifact || !featureArtifact) {
      throw new Error("Expected domain, API, and feature artifacts to exist.");
    }

    const domainDraft = yaml.load(domainArtifact.content) as DomainDraft;
    const apiDraft = JSON.parse(apiArtifact.content) as ApiDraft;
    const mappings = domainDraft.domain?.proto_service_mappings ?? [];
    const areas = new Set((domainDraft.domain?.areas ?? []).map((area) => area.name));
    const aggregateNames = new Set((domainDraft.domain?.aggregate_roots ?? []).map((aggregate) => aggregate.name));
    const apiMappings = apiDraft.api_spec?.proto_service_mappings ?? [];
    const apiSurfaces = apiDraft.api_spec?.surfaces ?? [];
    const featureContent = featureArtifact.content.toLowerCase();

    results.push({
      name: "BillingService contributes billing/account boundary and aggregate roots",
      passed:
        hasMapping(mappings, "BillingService", "billing-account", ["BillingAccount"]) &&
        (areas.has("billing-account") || (domainDraft.domain?.primary_contexts ?? []).includes("billing-account")) &&
        aggregateNames.has("BillingAccount"),
      error: `Expected BillingService billing-account mapping and BillingAccount aggregate, got domain=${domainArtifact.content}.`,
    });

    results.push({
      name: "GatewayService contributes gateway/control-plane boundary",
      passed:
        hasMapping(mappings, "GatewayService", "gateway-control-plane", ["Gateway", "ControlCommand"]) &&
        areas.has("gateway") &&
        areas.has("control-plane") &&
        apiSurfaces.some((surface) =>
          surface.surface_kind === "protobuf_service" &&
          surface.service === "GatewayService" &&
          surface.bounded_context === "gateway-control-plane" &&
          surface.context_labels?.includes("gateway") &&
          surface.context_labels?.includes("control-plane"),
        ),
      error: `Expected GatewayService gateway/control-plane mapping, domain=${domainArtifact.content}, api=${apiArtifact.content}.`,
    });

    results.push({
      name: "CellService contributes cell/runtime boundary",
      passed:
        hasMapping(mappings, "CellService", "cell-runtime", ["Cell", "Session"]) &&
        (areas.has("cell-runtime") || (domainDraft.domain?.primary_contexts ?? []).includes("cell-runtime")) &&
        aggregateNames.has("Cell") &&
        aggregateNames.has("Session"),
      error: `Expected CellService cell-runtime mapping, got domain=${domainArtifact.content}.`,
    });

    results.push({
      name: "domain, API, and feature drafts use consistent proto-backed names",
      passed:
        sameMappingContexts(mappings, apiMappings) &&
        apiSurfaces.every((surface) =>
          surface.surface_kind !== "protobuf_service" ||
          Boolean(surface.bounded_context && surface.aggregate_roots && surface.proto_operation?.service),
        ) &&
        featureContent.includes("billing account") &&
        featureContent.includes("cell runtime") &&
        featureContent.includes("gateway"),
      error: `Expected consistent proto naming across drafts, domain=${domainArtifact.content}, api=${apiArtifact.content}, feature=${featureArtifact.content}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap proto domain mapping execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
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

function seedRepository(root: string): void {
  writeProject(root, ["network-gateway", "saas-control-plane"]);
  fs.writeFileSync(
    path.join(root, "README.md"),
    [
      "# ReMirage Protocol Control",
      "",
      "Gateway control plane coordinates Cell runtime placement, Session recovery, and BillingAccount state.",
    ].join("\n"),
    "utf-8",
  );
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "proto-domain-mapping", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "api", "proto"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "api", "proto", "remirage-control.proto"),
    [
      'syntax = "proto3";',
      "service BillingService {",
      "  rpc LoadAccount(BillingAccountRequest) returns (BillingAccountResponse);",
      "}",
      "service GatewayService {",
      "  rpc ApplyCommand(ControlCommand) returns (Gateway);",
      "}",
      "service CellService {",
      "  rpc RecoverSession(CellSessionRequest) returns (Session);",
      "}",
      "message BillingAccount { string id = 1; }",
      "message BillingAccountRequest { string id = 1; }",
      "message BillingAccountResponse { BillingAccount account = 1; }",
      "message Gateway { string id = 1; }",
      "message ControlCommand { string id = 1; }",
      "message Cell { string id = 1; }",
      "message CellSessionRequest { string id = 1; }",
      "message Session { string id = 1; }",
      "",
    ].join("\n"),
    "utf-8",
  );
}

function writeProject(root: string, packs: string[]): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    yaml.dump({
      id: "proto-domain-mapping",
      name: "Proto Domain Mapping",
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

function hasMapping(mappings: ProtoServiceMappingDraft[], service: string, boundedContext: string, aggregateRoots: string[]): boolean {
  return mappings.some((mapping) =>
    mapping.service === service &&
    mapping.bounded_context === boundedContext &&
    aggregateRoots.every((aggregateRoot) => mapping.aggregate_roots?.includes(aggregateRoot)),
  );
}

function sameMappingContexts(domainMappings: ProtoServiceMappingDraft[], apiMappings: ProtoServiceMappingDraft[]): boolean {
  const apiByService = new Map(apiMappings.map((mapping) => [mapping.service, mapping.bounded_context]));
  return domainMappings.every((mapping) => apiByService.get(mapping.service) === mapping.bounded_context);
}

void main();
