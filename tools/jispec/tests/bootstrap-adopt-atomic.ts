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
  console.log("=== Bootstrap Adopt Atomic Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-bootstrap-adopt-"));
  const results: TestResult[] = [];

  try {
    seedRepository(tempRoot);
    runBootstrapDiscover({ root: tempRoot });
    const draftResult = await runBootstrapDraft({ root: tempRoot });

    const existingContractsDir = path.join(tempRoot, ".spec", "contracts");
    fs.mkdirSync(existingContractsDir, { recursive: true });
    fs.writeFileSync(path.join(existingContractsDir, "domain.yaml"), "preexisting: true\n", "utf-8");

    let failureCaptured = false;
    try {
      await runBootstrapAdopt({
        root: tempRoot,
        session: draftResult.sessionId,
        decisions: [
          { artifactKind: "domain", kind: "accept" },
          { artifactKind: "api", kind: "skip_as_spec_debt", note: "needs manual review" },
          { artifactKind: "feature", kind: "reject" },
        ],
        testFailAfterOperation: 1,
      });
    } catch {
      failureCaptured = true;
    }

    const domainAfterFailure = fs.readFileSync(path.join(existingContractsDir, "domain.yaml"), "utf-8");
    const debtAfterFailure = path.join(tempRoot, ".spec", "spec-debt", draftResult.sessionId, "api.json");

    results.push({
      name: "injected adopt failure restores prior contracts and leaves no spec debt half-write",
      passed: failureCaptured && domainAfterFailure === "preexisting: true\n" && !fs.existsSync(debtAfterFailure),
      error: "Expected adopt rollback to restore preexisting contracts and prevent partial spec debt writes.",
    });

    const successResult = await runBootstrapAdopt({
      root: tempRoot,
      session: draftResult.sessionId,
      decisions: [
        { artifactKind: "domain", kind: "accept" },
        { artifactKind: "api", kind: "skip_as_spec_debt", note: "needs manual review" },
        { artifactKind: "feature", kind: "edit", editedContent: "Feature: Edited\n\n  Scenario: Edited\n    Given edited content\n    When adopted\n    Then it is saved\n" },
      ],
    });

    results.push({
      name: "successful adopt writes contracts and spec debt records",
      passed:
        successResult.status === "committed" &&
        fs.existsSync(path.join(tempRoot, ".spec", "contracts", "domain.yaml")) &&
        fs.existsSync(path.join(tempRoot, ".spec", "contracts", "behaviors.feature")) &&
        fs.existsSync(path.join(tempRoot, ".spec", "spec-debt", draftResult.sessionId, "api.json")),
      error: "Expected committed adopt run to materialize contracts and spec debt outputs.",
    });

    results.push({
      name: "edited adopt content reaches the visible contract asset",
      passed: fs.readFileSync(path.join(tempRoot, ".spec", "contracts", "behaviors.feature"), "utf-8").includes("Feature: Edited"),
      error: "Expected edited feature content to be written to .spec/contracts/behaviors.feature.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap adopt execution",
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
    "id: adopt-repo\nname: Adopt Repo\nai:\n  provider: mock\n",
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes.ts"),
    'const app = { get: () => undefined };\napp.get("/items", () => "ok");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "tests", "items.test.ts"), "describe('items', () => {});\n", "utf-8");
}

void main();
