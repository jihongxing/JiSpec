import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft } from "../bootstrap/draft";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Bootstrap Draft Mock Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-bootstrap-draft-"));
  const results: TestResult[] = [];

  try {
    seedRepository(tempRoot);

    const discoverResult = runBootstrapDiscover({ root: tempRoot });
    if (discoverResult.summary.sourceFileCount === 0) {
      throw new Error("Expected seeded repository to produce source evidence.");
    }

    const first = await runBootstrapDraft({ root: tempRoot });
    const second = await runBootstrapDraft({ root: tempRoot, session: "latest", writeFile: false });
    const manifestPath = path.join(tempRoot, ".spec", "sessions", first.sessionId, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      providerName?: string;
      generationMode?: string;
      sourceEvidenceGeneratedAt?: string;
      qualitySummary?: {
        routeSignalsUsed?: string[];
        schemaSignalsUsed?: string[];
        primaryContextNames?: string[];
        evidenceStrength?: string;
      };
    };

    results.push({
      name: "draft writes manifest and three draft artifacts",
      passed:
        first.writtenFiles.some((filePath) => filePath.endsWith("/manifest.json")) &&
        first.writtenFiles.some((filePath) => filePath.endsWith("/drafts/domain.yaml")) &&
        first.writtenFiles.some((filePath) => filePath.endsWith("/drafts/api_spec.json")) &&
        first.writtenFiles.some((filePath) => filePath.endsWith("/drafts/behaviors.feature")),
      error: `Expected draft outputs in written files, got ${JSON.stringify(first.writtenFiles)}.`,
    });

    results.push({
      name: "draft artifacts include provenance metadata",
      passed: first.draftBundle.artifacts.every(
        (artifact) =>
          artifact.sourceFiles.length > 0 &&
          artifact.confidenceScore >= 0 &&
          artifact.confidenceScore <= 1 &&
          artifact.provenanceNote.length > 0,
      ),
      error: "Expected every draft artifact to include sourceFiles, confidenceScore, and provenanceNote.",
    });

    results.push({
      name: "repeat draft on latest session is stable in no-write mode",
      passed:
        JSON.stringify(first.draftBundle.artifacts) === JSON.stringify(second.draftBundle.artifacts) &&
        second.writtenFiles.length === 0,
      error: "Expected no-write latest-session draft to reproduce the same artifacts without writing files.",
    });

    results.push({
      name: "provider-backed draft persists manifest quality summary and generation metadata",
      passed:
        first.generationMode === "provider" &&
        manifest.providerName === "mock" &&
        manifest.generationMode === "provider" &&
        typeof manifest.sourceEvidenceGeneratedAt === "string" &&
        Array.isArray(manifest.qualitySummary?.routeSignalsUsed) &&
        manifest.qualitySummary.routeSignalsUsed.length > 0 &&
        Array.isArray(manifest.qualitySummary?.schemaSignalsUsed) &&
        manifest.qualitySummary.schemaSignalsUsed.length > 0 &&
        typeof manifest.qualitySummary?.evidenceStrength === "string",
      error: "Expected manifest to persist provider metadata and ranked evidence quality summary.",
    });

    const apiArtifact = first.draftBundle.artifacts.find((artifact) => artifact.kind === "api");
    const featureArtifact = first.draftBundle.artifacts.find((artifact) => artifact.kind === "feature");

    results.push({
      name: "mock provider follows ranked bootstrap evidence instead of flat repository order",
      passed:
        typeof apiArtifact?.content === "string" &&
        apiArtifact.content.includes("\"path\": \"/orders\"") &&
        apiArtifact.content.includes("supporting_schemas") &&
        typeof featureArtifact?.content === "string" &&
        featureArtifact.content.includes("POST /orders") &&
        featureArtifact.content.includes("tests/orders.test.ts"),
      error: "Expected mock provider draft to prioritize ranked route/schema/test evidence.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap draft execution",
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
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    "id: test-repo\nname: Test Repo\nai:\n  provider: mock\n",
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes.ts"),
    'const app = { get: () => undefined, post: () => undefined };\napp.get("/health", () => "ok");\napp.post("/orders", () => "created");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "schemas", "order.schema.json"),
    JSON.stringify({ type: "object", properties: { id: { type: "string" } } }, null, 2),
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "tests", "orders.test.ts"), "describe('orders', () => {});\n", "utf-8");
}

void main();
