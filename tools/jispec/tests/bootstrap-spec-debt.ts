import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft } from "../bootstrap/draft";
import { runBootstrapAdopt } from "../bootstrap/adopt";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Bootstrap Spec Debt Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-bootstrap-debt-"));
  const results: TestResult[] = [];

  try {
    seedRepository(tempRoot);
    runBootstrapDiscover({ root: tempRoot });
    const draftResult = await runBootstrapDraft({ root: tempRoot });
    const adoptResult = await runBootstrapAdopt({
      root: tempRoot,
      session: draftResult.sessionId,
      decisions: [
        { artifactKind: "domain", kind: "skip_as_spec_debt", note: "domain needs bounded-context naming pass" },
        { artifactKind: "api", kind: "reject" },
        { artifactKind: "feature", kind: "accept" },
      ],
    });

    const debtPath = path.join(tempRoot, ".spec", "spec-debt", draftResult.sessionId, "domain.json");
    const manifestPath = path.join(tempRoot, ".spec", "sessions", draftResult.sessionId, "manifest.json");
    const debtRecord = JSON.parse(fs.readFileSync(debtPath, "utf-8")) as {
      artifactKind?: string;
      note?: string;
      sourceFiles?: string[];
    };
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      status?: string;
      specDebtPaths?: string[];
      adoptedArtifactPaths?: string[];
      decisionLog?: Array<{ artifactKind?: string; decision?: string }>;
    };

    results.push({
      name: "skip_as_spec_debt writes a spec debt record with decision note",
      passed:
        adoptResult.specDebtFiles.includes(`.spec/spec-debt/${draftResult.sessionId}/domain.json`) &&
        debtRecord.artifactKind === "domain" &&
        debtRecord.note === "domain needs bounded-context naming pass" &&
        Array.isArray(debtRecord.sourceFiles) &&
        debtRecord.sourceFiles.length > 0,
      error: "Expected domain spec debt record to be written with note and source files.",
    });

    results.push({
      name: "session manifest records committed adoption and debt path",
      passed:
        manifest.status === "committed" &&
        Array.isArray(manifest.specDebtPaths) &&
        manifest.specDebtPaths.includes(`.spec/spec-debt/${draftResult.sessionId}/domain.json`) &&
        Array.isArray(manifest.adoptedArtifactPaths) &&
        manifest.adoptedArtifactPaths.includes(".spec/contracts/behaviors.feature"),
      error: "Expected committed manifest to include spec debt and adopted artifact paths.",
    });

    results.push({
      name: "decision log captures skip_as_spec_debt",
      passed:
        Array.isArray(manifest.decisionLog) &&
        manifest.decisionLog.some((entry) => entry.artifactKind === "domain" && entry.decision === "skip_as_spec_debt"),
      error: "Expected session decision log to include the skip_as_spec_debt decision.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap spec debt execution",
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
    "id: debt-repo\nname: Debt Repo\nai:\n  provider: mock\n",
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "controller.ts"),
    'const router = { post: () => undefined };\nrouter.post("/checkout", () => "ok");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "schemas", "checkout.schema.json"),
    JSON.stringify({ type: "object" }, null, 2),
    "utf-8",
  );
}

void main();
