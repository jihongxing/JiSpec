import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft } from "../bootstrap/draft";
import { runBootstrapAdopt } from "../bootstrap/adopt";
import { runVerify } from "../verify/verify-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Verify Contract-Aware Core Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-verify-contract-aware-"));
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
        { artifactKind: "api", kind: "skip_as_spec_debt", note: "old API surface not fully normalized yet" },
        { artifactKind: "feature", kind: "reject" },
      ],
    });

    const factsPath = ".spec/facts/verify/contract-aware-facts.json";
    const advisoryResult = await runVerify({
      root: tempRoot,
      generatedAt: "2026-04-27T00:00:00.000Z",
      factsOutPath: factsPath,
    });
    const facts = JSON.parse(fs.readFileSync(path.join(tempRoot, factsPath), "utf-8")) as {
      facts?: Record<string, unknown>;
    };

    results.push({
      name: "bootstrap takeover downgrades legacy whole-repo debt to advisory by default",
      passed:
        advisoryResult.verdict === "WARN_ADVISORY" &&
        advisoryResult.blockingIssueCount === 0 &&
        advisoryResult.issues.some(
          (issue) =>
            issue.code === "HISTORICAL_SCHEMA_MISSING" &&
            issue.severity === "advisory" &&
            issue.message.startsWith("[HISTORICAL_DEBT]"),
        ) &&
        advisoryResult.issues.some(
          (issue) =>
            issue.code === "BOOTSTRAP_SPEC_DEBT_PENDING" &&
            issue.severity === "advisory",
        ),
      error: "Expected bootstrap takeover to keep historical repo debt advisory instead of failing the first verify run.",
    });

    results.push({
      name: "contract-aware facts expose adopted contract scope and downgraded historical debt count",
      passed:
        advisoryResult.sources.includes("bootstrap-takeover") &&
        facts.facts?.["bootstrap.takeover.present"] === true &&
        facts.facts?.["bootstrap.adopted_contract_count"] === 1 &&
        facts.facts?.["bootstrap.spec_debt_count"] === 1 &&
        typeof facts.facts?.["bootstrap.historical_debt_issue_count"] === "number" &&
        Number(facts.facts?.["bootstrap.historical_debt_issue_count"]) > 0 &&
        facts.facts?.["verify.contract_issue_count"] === 0,
      error: "Expected verify facts to expose adopted contract scope and downgraded historical debt counts.",
    });

    fs.writeFileSync(path.join(tempRoot, ".spec", "contracts", "domain.yaml"), "metadata:\n  source_files:\n    - broken\n", "utf-8");
    const blockingResult = await runVerify({ root: tempRoot });

    results.push({
      name: "contract-aware collector blocks when an adopted contract becomes structurally invalid",
      passed:
        blockingResult.verdict === "FAIL_BLOCKING" &&
        blockingResult.sources.includes("contract-assets") &&
        blockingResult.issues.some(
          (issue) =>
            issue.code === "DOMAIN_CONTRACT_SECTION_MISSING" &&
            issue.severity === "blocking" &&
            issue.path === ".spec/contracts/domain.yaml",
        ),
      error: "Expected invalid adopted contract assets to fail verify through the contract-aware collector.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "verify contract-aware core execution",
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
    "id: contract-aware-repo\nname: Contract Aware Repo\nai:\n  provider: mock\n",
    "utf-8",
  );

  fs.writeFileSync(path.join(root, "README.md"), "# Contract Aware Repo\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "contract-aware-repo", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes.ts"),
    'const app = { post: () => undefined };\napp.post("/orders", () => "created");\n',
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
