import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft } from "../bootstrap/draft";
import type { ApiSurface, ApiSurfaceKind } from "../bootstrap/api-surface";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface ApiDraft {
  api_spec?: {
    surface_summary?: Record<ApiSurfaceKind, number>;
    surfaces?: ApiSurface[];
    endpoints?: ApiSurface[];
  };
}

async function main(): Promise<void> {
  console.log("=== Bootstrap API Surface Classification Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-api-surface-"));
  const results: TestResult[] = [];

  try {
    seedRepository(tempRoot);
    const discoverResult = runBootstrapDiscover({ root: tempRoot });
    if (discoverResult.summary.routeCount < 2 || discoverResult.summary.schemaCount < 2) {
      throw new Error(`Expected seeded API repo to produce route and schema evidence, got ${JSON.stringify(discoverResult.summary)}.`);
    }

    const draftResult = await runBootstrapDraft({ root: tempRoot });
    const apiArtifact = draftResult.draftBundle.artifacts.find((artifact) => artifact.kind === "api");
    if (!apiArtifact) {
      throw new Error("Expected API artifact to exist.");
    }

    const apiDraft = JSON.parse(apiArtifact.content) as ApiDraft;
    const surfaces = apiDraft.api_spec?.surfaces ?? [];
    const endpoints = apiDraft.api_spec?.endpoints ?? [];

    results.push({
      name: "API draft exposes classified surfaces and keeps endpoint compatibility",
      passed:
        surfaces.length >= 6 &&
        endpoints.length === surfaces.length &&
        surfaces.every((surface) =>
          isSurfaceKind(surface.surface_kind) &&
          typeof surface.confidence_score === "number" &&
          surface.confidence_score > 0 &&
          Array.isArray(surface.source_files) &&
          surface.source_files.length > 0 &&
          typeof surface.provenance_note === "string" &&
          surface.provenance_note.length > 0,
        ),
      error: `Expected every API surface to carry kind/confidence/provenance/source files, got ${apiArtifact.content}.`,
    });

    results.push({
      name: "OpenAPI contracts are parsed as first-class API surfaces",
      passed:
        surfaces.some((surface) =>
          surface.surface_kind === "openapi_contract" &&
          surface.method === "POST" &&
          surface.path === "/payments" &&
          surface.operation === "createPayment" &&
          surface.request_type === "PaymentRequest" &&
          surface.response_type === "PaymentResult",
        ) &&
        (apiDraft.api_spec?.surface_summary?.openapi_contract ?? 0) >= 1,
      error: `Expected parsed OpenAPI payment surface, got ${apiArtifact.content}.`,
    });

    results.push({
      name: "Protobuf services are classified above route guesses",
      passed:
        surfaces.some((surface) =>
          surface.surface_kind === "protobuf_service" &&
          surface.service === "Gateway" &&
          surface.operation === "Switch" &&
          surface.request_type === "SwitchRequest" &&
          surface.response_type === "SwitchResult",
        ) &&
        firstIndexOfKind(surfaces, "protobuf_service") < firstIndexOfKind(surfaces, "explicit_endpoint") &&
        firstIndexOfKind(surfaces, "openapi_contract") < firstIndexOfKind(surfaces, "weak_candidate"),
      error: `Expected protobuf and OpenAPI contract surfaces to outrank route guesses, got ${apiArtifact.content}.`,
    });

    results.push({
      name: "Protobuf API surfaces carry bounded context and aggregate mapping",
      passed:
        surfaces.some((surface) =>
          surface.surface_kind === "protobuf_service" &&
          surface.service === "Gateway" &&
          surface.operation === "Switch" &&
          surface.bounded_context === "gateway-control-plane" &&
          surface.context_labels?.includes("gateway") &&
          surface.context_labels?.includes("control-plane") &&
          surface.aggregate_roots?.includes("Gateway") &&
          surface.proto_operation?.service === "Gateway",
        ),
      error: `Expected protobuf surface to carry domain mapping, got ${apiArtifact.content}.`,
    });

    results.push({
      name: "Typed handlers and module surfaces are distinguished from endpoints",
      passed:
        surfaces.some((surface) =>
          surface.surface_kind === "typed_handler_inference" &&
          surface.operation === "CreateRefund" &&
          surface.request_type === "http.Request" &&
          surface.response_type === "http.ResponseWriter",
        ) &&
        surfaces.some((surface) =>
          surface.surface_kind === "module_surface_inference" &&
          surface.source_files.includes("src/services/billing-service.ts") &&
          !surface.path &&
          !surface.method,
        ),
      error: `Expected typed handler and module surface inference, got ${apiArtifact.content}.`,
    });

    results.push({
      name: "Explicit endpoints and weak route candidates are not conflated",
      passed:
        surfaces.some((surface) =>
          surface.surface_kind === "explicit_endpoint" &&
          surface.method === "POST" &&
          surface.path === "/orders" &&
          surface.supporting_schemas?.some((schema) => schema.path === "schemas/order.schema.json"),
        ) &&
        surfaces.some((surface) =>
          surface.surface_kind === "weak_candidate" &&
          surface.candidate_path === "src/controllers/unknown-controller.ts" &&
          !surface.path,
        ),
      error: `Expected explicit endpoint and weak candidate to remain separate, got ${apiArtifact.content}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap API surface classification execution",
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
  fs.writeFileSync(path.join(root, "README.md"), "# API Surface Classification\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "api-surface-classification", private: true }, null, 2), "utf-8");

  fs.writeFileSync(
    path.join(root, "openapi.yaml"),
    [
      "openapi: 3.0.0",
      "info:",
      "  title: Payments",
      "  version: 1.0.0",
      "paths:",
      "  /payments:",
      "    post:",
      "      operationId: createPayment",
      "      requestBody:",
      "        content:",
      "          application/json:",
      "            schema:",
      "              $ref: '#/components/schemas/PaymentRequest'",
      "      responses:",
      "        '201':",
      "          description: created",
      "          content:",
      "            application/json:",
      "              schema:",
      "                $ref: '#/components/schemas/PaymentResult'",
      "components:",
      "  schemas:",
      "    PaymentRequest:",
      "      type: object",
      "    PaymentResult:",
      "      type: object",
      "",
    ].join("\n"),
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "api", "proto"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "api", "proto", "gateway.proto"),
    'syntax = "proto3";\nservice Gateway { rpc Switch(SwitchRequest) returns (SwitchResult); }\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "schemas", "order.schema.json"),
    JSON.stringify({ type: "object", properties: { orderId: { type: "string" } } }, null, 2),
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "src", "routes"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes", "orders-routes.ts"),
    'const app = { post: () => undefined };\napp.post("/orders", () => "created");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "src", "controllers"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "controllers", "unknown-controller.ts"),
    "export const unknownController = { mount() { return true; } };\n",
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "internal", "handlers"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "internal", "handlers", "refund-controller.go"),
    'package handlers\n\nimport "net/http"\n\nfunc CreateRefund(w http.ResponseWriter, r *http.Request) {}\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "src", "services"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "services", "billing-service.ts"),
    "export class BillingService { reconcile() { return true; } }\n",
    "utf-8",
  );
}

function writeProject(root: string, packs: string[]): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    yaml.dump({
      id: "api-surface-classification",
      name: "API Surface Classification",
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

function isSurfaceKind(value: unknown): value is ApiSurfaceKind {
  return (
    value === "explicit_endpoint" ||
    value === "openapi_contract" ||
    value === "protobuf_service" ||
    value === "typed_handler_inference" ||
    value === "module_surface_inference" ||
    value === "weak_candidate"
  );
}

function firstIndexOfKind(surfaces: ApiSurface[], kind: ApiSurfaceKind): number {
  const index = surfaces.findIndex((surface) => surface.surface_kind === kind);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

void main();
