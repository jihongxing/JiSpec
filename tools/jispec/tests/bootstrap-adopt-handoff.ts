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
  console.log("=== Bootstrap Adopt Handoff Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-bootstrap-handoff-"));
  const results: TestResult[] = [];

  try {
    seedRepository(tempRoot);
    runBootstrapDiscover({ root: tempRoot });
    const draftResult = await runBootstrapDraft({ root: tempRoot });
    const adoptResult = await runBootstrapAdopt({
      root: tempRoot,
      session: draftResult.sessionId,
      decisions: [
        { artifactKind: "domain", kind: "accept" },
        { artifactKind: "api", kind: "skip_as_spec_debt", note: "api needs endpoint review" },
        { artifactKind: "feature", kind: "reject", note: "feature language can wait" },
      ],
    });

    const manifestPath = path.join(tempRoot, ".spec", "sessions", draftResult.sessionId, "manifest.json");
    const reportPath = path.join(tempRoot, ".spec", "handoffs", "bootstrap-takeover.json");
    const briefPath = path.join(tempRoot, ".spec", "handoffs", "takeover-brief.md");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      takeoverReportPath?: string;
      takeoverBriefPath?: string;
      baselineHandoff?: {
        expectedContractPaths?: string[];
        deferredSpecDebtPaths?: string[];
        rejectedArtifactKinds?: string[];
      };
      decisionLog?: Array<{ artifactKind?: string; decision?: string; targetPath?: string; edited?: boolean }>;
    };
    const report = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as {
      sessionId?: string;
      adoptedArtifactPaths?: string[];
      specDebtPaths?: string[];
      rejectedArtifactKinds?: string[];
      baselineHandoff?: {
        expectedContractPaths?: string[];
        deferredSpecDebtPaths?: string[];
        rejectedArtifactKinds?: string[];
      };
      decisions?: Array<{ artifactKind?: string; finalState?: string; targetPath?: string }>;
    };

    results.push({
      name: "adopt writes bootstrap takeover report and surfaces it on the result",
      passed:
        adoptResult.takeoverReportPath === ".spec/handoffs/bootstrap-takeover.json" &&
        fs.existsSync(reportPath) &&
        report.sessionId === draftResult.sessionId,
      error: "Expected adopt to persist a takeover report at .spec/handoffs/bootstrap-takeover.json.",
    });

    results.push({
      name: "manifest baseline handoff matches the takeover report",
      passed:
        manifest.takeoverReportPath === ".spec/handoffs/bootstrap-takeover.json" &&
        manifest.baselineHandoff?.expectedContractPaths?.includes(".spec/contracts/domain.yaml") === true &&
        manifest.baselineHandoff?.deferredSpecDebtPaths?.includes(`.spec/spec-debt/${draftResult.sessionId}/api.json`) === true &&
        manifest.baselineHandoff?.rejectedArtifactKinds?.includes("feature") === true &&
        report.baselineHandoff?.expectedContractPaths?.includes(".spec/contracts/domain.yaml") === true &&
        report.baselineHandoff?.deferredSpecDebtPaths?.includes(`.spec/spec-debt/${draftResult.sessionId}/api.json`) === true &&
        report.baselineHandoff?.rejectedArtifactKinds?.includes("feature") === true,
      error: "Expected manifest and takeover report to share the same baseline handoff summary.",
    });

    results.push({
      name: "takeover decisions preserve adopted, deferred, and rejected outcomes",
      passed:
        report.adoptedArtifactPaths?.includes(".spec/contracts/domain.yaml") === true &&
        report.specDebtPaths?.includes(`.spec/spec-debt/${draftResult.sessionId}/api.json`) === true &&
        report.rejectedArtifactKinds?.includes("feature") === true &&
        report.decisions?.some((entry) => entry.artifactKind === "api" && entry.finalState === "spec_debt") === true &&
        manifest.decisionLog?.some((entry) => entry.artifactKind === "domain" && entry.targetPath === ".spec/contracts/domain.yaml") === true,
      error: "Expected takeover report and session manifest to preserve final adoption outcomes per artifact.",
    });

    results.push({
      name: "adopt writes a takeover brief alongside the machine report",
      passed:
        adoptResult.takeoverBriefPath === ".spec/handoffs/takeover-brief.md" &&
        manifest.takeoverBriefPath === ".spec/handoffs/takeover-brief.md" &&
        fs.existsSync(briefPath) &&
        fs.readFileSync(briefPath, "utf-8").includes("Bootstrap Takeover Brief") &&
        fs.readFileSync(briefPath, "utf-8").includes(".spec/spec-debt"),
      error: "Expected adopt handoff to include a readable takeover brief next to bootstrap-takeover.json.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap adopt handoff execution",
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
    "id: handoff-repo\nname: Handoff Repo\nai:\n  provider: mock\n",
    "utf-8",
  );

  fs.writeFileSync(path.join(root, "README.md"), "# Handoff Repo\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "handoff-repo", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes.ts"),
    'const app = { post: () => undefined };\napp.post("/orders", () => "created");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.writeFileSync(path.join(root, "schemas", "order.schema.json"), JSON.stringify({ type: "object" }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "tests", "orders.test.ts"), "describe('orders', () => {});\n", "utf-8");
}

void main();
