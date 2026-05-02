import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { writeChangeSession, type ChangeSession } from "../change/change-session";
import { mediateExternalPatch } from "../implement/patch-mediation";
import { compareReleaseBaselines, createReleaseSnapshot } from "../release/baseline-snapshot";
import { runBootstrapAdopt } from "../bootstrap/adopt";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft } from "../bootstrap/draft";
import { renderVerifyJSON, runVerify } from "../verify/verify-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface ReplayMetadata {
  version?: number;
  replayable?: boolean;
  sourceSession?: string;
  sourceArtifact?: string;
  inputArtifacts?: string[];
  commands?: Record<string, string>;
  actor?: string;
  reason?: string;
  previousOutcome?: string;
  nextHumanAction?: string;
}

async function main(): Promise<void> {
  console.log("=== Replay Provenance Baseline Test ===\n");

  const bootstrapRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-replay-bootstrap-"));
  const releaseRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-replay-release-"));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-replay-source-"));
  const results: TestResult[] = [];

  try {
    seedBootstrapRepository(bootstrapRoot);
    runBootstrapDiscover({ root: bootstrapRoot });
    const draft = await runBootstrapDraft({ root: bootstrapRoot });
    await runBootstrapAdopt({
      root: bootstrapRoot,
      session: draft.sessionId,
      actor: "codex",
      reason: "M5-T5 replay provenance smoke",
      decisions: [
        { artifactKind: "domain", kind: "accept" },
        { artifactKind: "api", kind: "skip_as_spec_debt", note: "api owner review pending" },
        { artifactKind: "feature", kind: "reject", note: "behavior rewrite later" },
      ],
    });

    const takeover = readJson<{ replay?: ReplayMetadata }>(path.join(bootstrapRoot, ".spec", "handoffs", "bootstrap-takeover.json"));
    const manifest = readJson<{ replay?: ReplayMetadata }>(path.join(bootstrapRoot, ".spec", "sessions", draft.sessionId, "manifest.json"));
    const adoptSummary = fs.readFileSync(path.join(bootstrapRoot, ".spec", "handoffs", "adopt-summary.md"), "utf-8");

    results.push(record("bootstrap adopt artifacts carry replay provenance", () => {
      assert.equal(takeover.replay?.version, 1);
      assert.equal(takeover.replay?.replayable, true);
      assert.equal(takeover.replay?.sourceSession, draft.sessionId);
      assert.equal(takeover.replay?.sourceArtifact, `.spec/sessions/${draft.sessionId}/manifest.json`);
      assert.ok(takeover.replay?.inputArtifacts?.includes(".spec/facts/bootstrap/evidence-graph.json"));
      assert.ok(takeover.replay?.commands?.rerun.includes("jispec-cli -- adopt"));
      assert.equal(takeover.replay?.actor, "codex");
      assert.equal(takeover.replay?.reason, "M5-T5 replay provenance smoke");
      assert.equal(takeover.replay?.previousOutcome, "drafted");
      assert.ok(takeover.replay?.nextHumanAction?.includes("verify"));
      assert.equal(manifest.replay?.sourceSession, draft.sessionId);
      assert.match(adoptSummary, /## Replay \/ Provenance/);
      assert.match(adoptSummary, /M5-T5 replay provenance smoke/);
      assert.match(adoptSummary, /npm run jispec-cli -- verify/);
    }));

    const verify = await runVerify({
      root: bootstrapRoot,
      generatedAt: "2026-05-02T00:00:00.000Z",
    });
    const verifyPayload = JSON.parse(renderVerifyJSON(verify)) as { metadata?: { replay?: ReplayMetadata } };
    results.push(record("verify JSON exposes replay metadata and next human action", () => {
      assert.equal(verifyPayload.metadata?.replay?.version, 1);
      assert.equal(verifyPayload.metadata?.replay?.sourceArtifact, ".spec/handoffs/bootstrap-takeover.json");
      assert.ok(verifyPayload.metadata?.replay?.inputArtifacts?.includes(".spec/contracts/domain.yaml"));
      assert.ok(verifyPayload.metadata?.replay?.commands?.rerun.includes("jispec-cli -- verify"));
      assert.ok(verifyPayload.metadata?.replay?.nextHumanAction);
    }));

    const session: ChangeSession = {
      id: "change-replay",
      createdAt: "2026-05-02T00:00:00.000Z",
      summary: "Replay patch mediation",
      laneDecision: {
        lane: "fast",
        reasons: ["test fixture"],
        autoPromoted: false,
      },
      changedPaths: [{ path: "src/allowed.ts", kind: "unknown" }],
      baseRef: "HEAD",
      nextCommands: [{ command: "npm run jispec-cli -- implement --from-handoff .jispec/handoff/change-replay.json", description: "Replay handoff" }],
    };
    writeChangeSession(bootstrapRoot, session);
    const patchPath = writePatch(bootstrapRoot, "out-of-scope.patch", [
      "diff --git a/src/outside.ts b/src/outside.ts",
      "new file mode 100644",
      "index 0000000..1111111",
      "--- /dev/null",
      "+++ b/src/outside.ts",
      "@@ -0,0 +1 @@",
      "+export const outside = true;",
    ]);
    const mediation = mediateExternalPatch(bootstrapRoot, session, patchPath);
    results.push(record("patch mediation failures include replay and next human action", () => {
      assert.equal(mediation.artifact.status, "rejected_out_of_scope");
      assert.equal(mediation.artifact.replay?.sourceSession, "change-replay");
      assert.ok(mediation.artifact.replay?.inputArtifacts?.includes("src/allowed.ts"));
      assert.ok(mediation.artifact.replay?.commands?.retryWithExternalPatch.includes("--external-patch <path>"));
      assert.ok(mediation.artifact.replay?.nextHumanAction?.includes("scope"));
    }));

    seedReleaseInputs(releaseRoot, sourceRoot);
    const snapshot = createReleaseSnapshot({
      root: releaseRoot,
      version: "v1",
      frozenAt: "2026-05-02T00:00:00.000Z",
      actor: "codex",
      reason: "M5-T5 release replay smoke",
    });
    const releaseBaseline = yaml.load(fs.readFileSync(snapshot.releaseBaselinePath, "utf-8")) as { replay?: ReplayMetadata };
    const releaseSummary = fs.readFileSync(snapshot.releaseSummaryPath, "utf-8");
    const compare = compareReleaseBaselines({
      root: releaseRoot,
      from: "v1",
      to: "current",
      comparedAt: "2026-05-02T00:10:00.000Z",
      actor: "codex",
      reason: "M5-T5 release compare replay smoke",
    });
    const compareReport = readJson<{ replay?: ReplayMetadata }>(compare.compareReportJsonPath);
    const compareMarkdown = fs.readFileSync(compare.compareReportMarkdownPath, "utf-8");

    results.push(record("release snapshot and compare artifacts carry replay provenance", () => {
      assert.equal(releaseBaseline.replay?.version, 1);
      assert.equal(releaseBaseline.replay?.sourceArtifact, ".spec/baselines/current.yaml");
      assert.ok(releaseBaseline.replay?.inputArtifacts?.includes(".spec/baselines/current.yaml"));
      assert.ok(releaseBaseline.replay?.commands?.rerun.includes("release snapshot"));
      assert.equal(releaseBaseline.replay?.actor, "codex");
      assert.equal(releaseBaseline.replay?.reason, "M5-T5 release replay smoke");
      assert.match(releaseSummary, /## Replay \/ Provenance/);
      assert.equal(compareReport.replay?.version, 1);
      assert.ok(compareReport.replay?.inputArtifacts?.includes(".spec/baselines/releases/v1.yaml"));
      assert.ok(compareReport.replay?.commands?.rerun.includes("release compare"));
      assert.equal(compareReport.replay?.actor, "codex");
      assert.equal(compareReport.replay?.reason, "M5-T5 release compare replay smoke");
      assert.match(compareMarkdown, /## Replay \/ Provenance/);
    }));
  } catch (error) {
    results.push({
      name: "replay provenance baseline execution",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    fs.rmSync(bootstrapRoot, { recursive: true, force: true });
    fs.rmSync(releaseRoot, { recursive: true, force: true });
    fs.rmSync(sourceRoot, { recursive: true, force: true });
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

function record(name: string, run: () => void): TestResult {
  try {
    run();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function seedBootstrapRepository(root: string): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(path.join(root, "jiproject", "project.yaml"), "id: replay-bootstrap\nname: Replay Bootstrap\nai:\n  provider: mock\n", "utf-8");
  fs.writeFileSync(path.join(root, "README.md"), "# Replay Bootstrap\n\nOrders flow through contracts.\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "replay-bootstrap", private: true }, null, 2), "utf-8");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "orders.ts"), 'const app = { post: () => undefined };\napp.post("/orders", () => "ok");\n', "utf-8");
}

function seedReleaseInputs(root: string, _sourceRoot: string): void {
  fs.mkdirSync(path.join(root, ".spec", "baselines"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".spec", "baselines", "current.yaml"),
    yaml.dump({
      baseline_id: "baseline-replay",
      project_id: "release-replay",
      project_name: "Release Replay",
      requirement_ids: ["REQ-REL-001"],
      contexts: ["release"],
      contracts: ["CTR-REL-001"],
      scenarios: ["SCN-REL-001"],
      slices: ["release-replay-v1"],
      assets: ["src/release.ts"],
    }, { lineWidth: 100, noRefs: true }),
    "utf-8",
  );
  fs.mkdirSync(path.join(root, ".spec"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".spec", "policy.yaml"),
    yaml.dump({
      version: 1,
      profile: "small_team",
      facts_contract: "1.0",
      rules: [
        {
          id: "release-replay-policy",
          fact: "verify.blocking_issue_count",
          op: "equals",
          value: 0,
          severity: "blocking",
        },
      ],
    }, { lineWidth: 100, noRefs: true }),
    "utf-8",
  );
}

function writePatch(root: string, name: string, lines: string[]): string {
  const patchDir = path.join(root, ".jispec", "patches");
  fs.mkdirSync(patchDir, { recursive: true });
  const patchPath = path.join(patchDir, name);
  fs.writeFileSync(patchPath, `${lines.join("\n")}\n`, "utf-8");
  return patchPath;
}

void main();
