import fs from "node:fs";
import path from "node:path";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft } from "../bootstrap/draft";
import { runBootstrapAdopt } from "../bootstrap/adopt";
import { runVerify } from "../verify/verify-runner";
import { cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Verify Bootstrap Takeover Test ===\n");

  const tempRoot = createVerifyFixture("verify-bootstrap-takeover");
  const results: TestResult[] = [];

  try {
    seedRepository(tempRoot);
    runBootstrapDiscover({ root: tempRoot });
    const draftResult = await runBootstrapDraft({ root: tempRoot });
    await runBootstrapAdopt({
      root: tempRoot,
      session: draftResult.sessionId,
      decisions: [
        { artifactKind: "domain", kind: "accept" },
        { artifactKind: "api", kind: "skip_as_spec_debt", note: "legacy API still needs manual endpoint review" },
        { artifactKind: "feature", kind: "reject" },
      ],
    });

    const factsPath = ".spec/facts/verify/bootstrap-takeover-facts.json";
    const advisoryResult = await runVerify({
      root: tempRoot,
      factsOutPath: factsPath,
    });
    const facts = JSON.parse(fs.readFileSync(path.join(tempRoot, factsPath), "utf-8")) as {
      facts?: Record<string, unknown>;
    };

    results.push({
      name: "verify treats bootstrap spec debt as advisory while keeping adopted contracts in scope",
      passed:
        advisoryResult.verdict === "WARN_ADVISORY" &&
        advisoryResult.sources.includes("bootstrap-takeover") &&
        advisoryResult.issues.some(
          (issue) =>
            issue.code === "BOOTSTRAP_SPEC_DEBT_PENDING" &&
            issue.severity === "advisory" &&
            issue.path === `.spec/spec-debt/${draftResult.sessionId}/api.json`,
        ),
      error: "Expected verify to surface deferred bootstrap debt as an advisory issue from the bootstrap-takeover source.",
    });

    results.push({
      name: "verify facts snapshot includes bootstrap takeover and contract coverage facts",
      passed:
        facts.facts?.["bootstrap.takeover.present"] === true &&
        facts.facts?.["bootstrap.adopted_contract_count"] === 1 &&
        facts.facts?.["bootstrap.spec_debt_count"] === 1 &&
        facts.facts?.["contracts.domain.present"] === true &&
        facts.facts?.["contracts.api.present"] === false &&
        facts.facts?.["contracts.behavior.present"] === false,
      error: "Expected verify facts snapshot to expose takeover and contract presence data.",
    });

    fs.rmSync(path.join(tempRoot, ".spec", "contracts", "domain.yaml"), { force: true });
    const blockingResult = await runVerify({ root: tempRoot });

    results.push({
      name: "verify fails blocking when an adopted bootstrap contract disappears after takeover",
      passed:
        blockingResult.verdict === "FAIL_BLOCKING" &&
        blockingResult.issues.some(
          (issue) =>
            issue.code === "BOOTSTRAP_CONTRACT_MISSING" &&
            issue.severity === "blocking" &&
            issue.path === ".spec/contracts/domain.yaml",
        ),
      error: "Expected verify to block when an adopted bootstrap contract is missing from .spec/contracts.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "verify bootstrap takeover execution",
      passed: false,
      error: message,
    });
  } finally {
    cleanupVerifyFixture(tempRoot);
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
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "verify-takeover", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes.ts"),
    'const app = { get: () => undefined, post: () => undefined };\napp.post("/orders", () => "created");\napp.get("/health", () => "ok");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.writeFileSync(path.join(root, "schemas", "order.schema.json"), JSON.stringify({ type: "object" }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "tests", "orders.test.ts"), "describe('orders', () => {});\n", "utf-8");
}

void main();
