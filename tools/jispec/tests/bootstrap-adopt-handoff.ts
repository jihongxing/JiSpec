import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft } from "../bootstrap/draft";
import { renderBootstrapAdoptText, runBootstrapAdopt } from "../bootstrap/adopt";
import { createReleaseSnapshot } from "../release/baseline-snapshot";

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
        {
          artifactKind: "domain",
          kind: "edit",
          editedContent: "contexts:\n  - name: edited-handoff-domain\n",
          note: "domain re-anchored by reviewer",
        },
        { artifactKind: "api", kind: "skip_as_spec_debt", note: "api needs endpoint review" },
        { artifactKind: "feature", kind: "reject", note: "feature language can wait" },
      ],
    });

    const manifestPath = path.join(tempRoot, ".spec", "sessions", draftResult.sessionId, "manifest.json");
    const reportPath = path.join(tempRoot, ".spec", "handoffs", "bootstrap-takeover.json");
    const briefPath = path.join(tempRoot, ".spec", "handoffs", "takeover-brief.md");
    const adoptSummaryPath = path.join(tempRoot, ".spec", "handoffs", "adopt-summary.md");
    const currentBaselinePath = path.join(tempRoot, ".spec", "baselines", "current.yaml");
    const contractGraphPath = path.join(tempRoot, ".spec", "evidence", "contract-graph.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      takeoverReportPath?: string;
      takeoverBriefPath?: string;
      adoptSummaryPath?: string;
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
      decisions?: Array<{ artifactKind?: string; finalState?: string; targetPath?: string; edited?: boolean; note?: string }>;
    };
    const adoptSummary = fs.existsSync(adoptSummaryPath) ? fs.readFileSync(adoptSummaryPath, "utf-8") : "";
    const adoptText = renderBootstrapAdoptText(adoptResult);

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
        report.decisions?.some((entry) => entry.artifactKind === "domain" && entry.edited === true) === true &&
        manifest.decisionLog?.some((entry) => entry.artifactKind === "domain" && entry.targetPath === ".spec/contracts/domain.yaml" && entry.edited === true) === true,
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

    results.push({
      name: "adopt writes a compact summary for accepted, edited, rejected, and deferred decisions",
      passed:
        adoptResult.adoptSummaryPath === ".spec/handoffs/adopt-summary.md" &&
        manifest.adoptSummaryPath === ".spec/handoffs/adopt-summary.md" &&
        fs.existsSync(adoptSummaryPath) &&
        adoptSummary.includes("# Bootstrap Adopt Summary") &&
        adoptSummary.includes("## Decision Snapshot") &&
        adoptSummary.includes("Current state:") &&
        adoptSummary.includes("Risk: Correction load") &&
        adoptSummary.includes("Evidence:") &&
        adoptSummary.includes("Owner: reviewer") &&
        adoptSummary.includes("Next command: `npm run jispec-cli -- verify`") &&
        adoptSummary.includes("This Markdown file is a human-readable companion summary, not a machine API.") &&
        adoptSummary.includes(".spec/contracts/domain.yaml") &&
        adoptSummary.includes("edited before adoption") &&
        adoptSummary.includes("domain re-anchored by reviewer") &&
        adoptSummary.includes(`.spec/spec-debt/${draftResult.sessionId}/api.json`) &&
        adoptSummary.includes("api needs endpoint review") &&
        adoptSummary.includes("`feature`") &&
        adoptSummary.includes("feature language can wait") &&
        adoptSummary.includes("npm run jispec-cli -- verify") &&
        adoptText.includes("Adopt summary: .spec/handoffs/adopt-summary.md"),
      error: "Expected adopt summary to capture human review decisions and the next verify step.",
    });

    const currentBaseline = yaml.load(fs.readFileSync(currentBaselinePath, "utf-8")) as {
      entry_model?: string;
      status?: string;
      source_takeover?: { path?: string; session_id?: string };
      contracts?: string[];
      assets?: string[];
      change_mainline_handoff?: { path?: string; status?: string; next_commands?: string[] };
    };
    const contractGraph = JSON.parse(fs.readFileSync(contractGraphPath, "utf-8")) as {
      graph_kind?: string;
      nodes?: Array<{ id?: string; kind?: string; path?: string }>;
      edges?: Array<{ from?: string; to?: string; relation?: string }>;
    };
    results.push({
      name: "legacy adopt writes the same current baseline and contract graph entry as Greenfield init",
      passed:
        fs.existsSync(currentBaselinePath) &&
        fs.existsSync(contractGraphPath) &&
        currentBaseline.entry_model === "legacy_takeover" &&
        currentBaseline.status === "adopted" &&
        currentBaseline.source_takeover?.path === ".spec/handoffs/bootstrap-takeover.json" &&
        currentBaseline.source_takeover?.session_id === draftResult.sessionId &&
        currentBaseline.contracts?.includes(".spec/contracts/domain.yaml") === true &&
        currentBaseline.assets?.includes(".spec/handoffs/bootstrap-takeover.json") === true &&
        currentBaseline.assets?.includes(".spec/evidence/contract-graph.json") === true &&
        currentBaseline.change_mainline_handoff?.status === "ready" &&
        currentBaseline.change_mainline_handoff?.next_commands?.includes("npm run jispec-cli -- change <summary> --mode execute") === true &&
        contractGraph.graph_kind === "deterministic-contract-graph" &&
        contractGraph.nodes?.some((node) => node.id === "@baseline:legacy-takeover" && node.kind === "baseline") === true &&
        contractGraph.nodes?.some((node) => node.id === "@contract:.spec/contracts/domain.yaml" && node.path === ".spec/contracts/domain.yaml") === true &&
        contractGraph.edges?.some((edge) => edge.from === "@baseline:legacy-takeover" && edge.to === "@contract:.spec/contracts/domain.yaml" && edge.relation === "defines") === true,
      error: "Expected legacy adopt to materialize a Greenfield-compatible current baseline and deterministic contract graph.",
    });

    const releaseSnapshot = createReleaseSnapshot({
      root: tempRoot,
      version: "legacy-v1",
      frozenAt: "2026-05-02T00:00:00.000Z",
    });
    const releaseBaseline = yaml.load(fs.readFileSync(releaseSnapshot.releaseBaselinePath, "utf-8")) as {
      contract_graph?: { graph_kind?: string; graph_path?: string; root_hash?: string };
      source_baseline?: string;
      contracts?: string[];
    };
    results.push({
      name: "release snapshot freezes legacy takeover through the same contract graph surface",
      passed:
        releaseSnapshot.version === "legacy-v1" &&
        releaseBaseline.source_baseline === ".spec/baselines/current.yaml" &&
        releaseBaseline.contract_graph?.graph_kind === "merkle-contract-dag" &&
        releaseBaseline.contract_graph?.graph_path === ".spec/releases/legacy-v1/contract-graph.json" &&
        typeof releaseBaseline.contract_graph?.root_hash === "string" &&
        releaseBaseline.contracts?.includes(".spec/contracts/domain.yaml") === true,
      error: "Expected release snapshot to cover a legacy takeover baseline with a Merkle contract graph.",
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
