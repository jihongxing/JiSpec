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
  console.log("=== Bootstrap Draft Fallback Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-bootstrap-draft-fallback-"));
  const results: TestResult[] = [];

  try {
    seedRepository(tempRoot);
    runBootstrapDiscover({ root: tempRoot });
    const draftResult = await runBootstrapDraft({ root: tempRoot });
    const manifestPath = path.join(tempRoot, ".spec", "sessions", draftResult.sessionId, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      providerName?: string;
      generationMode?: string;
      warnings?: string[];
    };

    results.push({
      name: "unavailable provider falls back to deterministic generation without breaking the draft flow",
      passed:
        draftResult.providerName === "deterministic-fallback" &&
        draftResult.generationMode === "provider-fallback" &&
        draftResult.draftBundle.artifacts.length === 3 &&
        draftResult.draftBundle.warnings.some((warning) => warning.includes("unavailable")),
      error: `Expected provider fallback with warnings, got ${JSON.stringify(draftResult, null, 2)}.`,
    });

    results.push({
      name: "fallback metadata is persisted to the draft session manifest",
      passed:
        manifest.providerName === "deterministic-fallback" &&
        manifest.generationMode === "provider-fallback" &&
        Array.isArray(manifest.warnings) &&
        manifest.warnings.some((warning) => warning.includes("unavailable")),
      error: "Expected session manifest to persist fallback provider metadata and warnings.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap draft fallback execution",
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
    "id: fallback-repo\nname: Fallback Repo\nai:\n  provider: command\n  command:\n    executable: definitely-not-a-real-command\n",
    "utf-8",
  );

  fs.writeFileSync(path.join(root, "README.md"), "# Fallback Repo\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fallback-repo", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes.ts"),
    'const app = { get: () => undefined };\napp.get("/health", () => "ok");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.writeFileSync(path.join(root, "schemas", "health.schema.json"), JSON.stringify({ type: "object" }, null, 2), "utf-8");
}

void main();
