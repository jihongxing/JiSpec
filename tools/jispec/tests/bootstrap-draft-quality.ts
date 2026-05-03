import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft } from "../bootstrap/draft";
import { renderBootstrapDraftText } from "../bootstrap/draft";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Bootstrap Draft Quality Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-bootstrap-draft-quality-"));
  const results: TestResult[] = [];

  try {
    seedRepository(tempRoot);
    const discoverResult = runBootstrapDiscover({ root: tempRoot });
    if (discoverResult.summary.routeCount === 0) {
      throw new Error("Expected seeded repository to produce route evidence.");
    }

    const draftResult = await runBootstrapDraft({ root: tempRoot });
    const domainArtifact = draftResult.draftBundle.artifacts.find((artifact) => artifact.kind === "domain");
    const apiArtifact = draftResult.draftBundle.artifacts.find((artifact) => artifact.kind === "api");
    const featureArtifact = draftResult.draftBundle.artifacts.find((artifact) => artifact.kind === "feature");

    if (!domainArtifact || !apiArtifact || !featureArtifact) {
      throw new Error("Expected domain/api/feature artifacts to exist.");
    }

    const apiSpec = JSON.parse(apiArtifact.content) as {
      api_spec?: {
        endpoints?: Array<{ path?: string; source_files?: string[]; supporting_schemas?: Array<{ path?: string }> }>;
        documents?: Array<{ path?: string }>;
        manifests?: Array<{ path?: string }>;
      };
    };

    results.push({
      name: "deterministic draft uses generation mode metadata and ranked evidence summary",
      passed:
        draftResult.generationMode === "deterministic" &&
        draftResult.providerName === "deterministic-fallback" &&
        draftResult.qualitySummary.evidenceStrength !== undefined &&
        draftResult.qualitySummary.routeSignalsUsed.length > 0 &&
        draftResult.qualitySummary.routeSignalsUsed[0]?.startsWith("POST /orders") &&
        draftResult.qualitySummary.schemaSignalsUsed.length > 0 &&
        draftResult.qualitySummary.primaryContextNames.includes("ordering") &&
        !draftResult.qualitySummary.primaryContextNames.includes("routes.ts") &&
        !draftResult.qualitySummary.primaryContextNames.includes("schemas") &&
        !draftResult.qualitySummary.primaryContextNames.includes("tests") &&
        renderBootstrapDraftText(draftResult).includes(`Next command: npm run jispec-cli -- adopt --interactive --session ${draftResult.sessionId}`),
      error: "Expected deterministic draft to expose generation metadata and ranked evidence summary.",
    });

    results.push({
      name: "API draft prioritizes real route and supporting schema evidence",
      passed:
        Array.isArray(apiSpec.api_spec?.endpoints) &&
        apiSpec.api_spec.endpoints.some((endpoint) => endpoint.path === "/orders") &&
        apiSpec.api_spec.endpoints.some((endpoint) =>
          Array.isArray(endpoint.supporting_schemas) &&
          endpoint.supporting_schemas.some((schema) => schema.path === "schemas/order.schema.json"),
        ),
      error: `Expected API draft to include /orders with supporting order schema, got ${apiArtifact.content}.`,
    });

    results.push({
      name: "domain and feature drafts carry document and test context instead of repository-wide placeholders",
      passed:
        domainArtifact.content.includes("README.md") &&
        domainArtifact.content.includes("contexts/ordering/context.yaml") &&
        featureArtifact.content.includes("/orders") &&
        featureArtifact.content.includes("tests/orders.test.ts"),
      error: "Expected domain draft to reference docs/context assets and feature draft to reference route/test evidence.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap draft quality execution",
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
  fs.writeFileSync(path.join(root, "README.md"), "# Ordering Service\n\nHandles order creation.\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "ordering-service", private: true }, null, 2), "utf-8");
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "contexts", "ordering"), { recursive: true });
  fs.writeFileSync(path.join(root, "contexts", "ordering", "context.yaml"), "name: ordering\n", "utf-8");

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes.ts"),
    'const app = { post: () => undefined, get: () => undefined };\napp.post("/orders", () => "created");\napp.get("/health", () => "ok");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "schemas", "order.schema.json"),
    JSON.stringify({ type: "object", properties: { orderId: { type: "string" } } }, null, 2),
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "tests", "orders.test.ts"), "describe('orders', () => {});\n", "utf-8");

  fs.mkdirSync(path.join(root, "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "templates", "routes.ts"),
    'const app = { get: () => undefined };\napp.get("/template-only", () => "ignore");\n',
    "utf-8",
  );
}

void main();
