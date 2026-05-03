import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildCanonicalFacts, getCanonicalFactDefinitions } from "../facts/canonical-facts";
import {
  importExternalGraphArtifact,
  normalizeExternalGraphEvidence,
} from "../integrations/external-graph-import";
import { buildPrivacyReport } from "../privacy/redaction";
import { runVerify } from "../verify/verify-runner";
import { buildRegressionMatrixManifest, TEST_SUITES } from "./regression-runner";
import { cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== P9 External Graph Import Only Tests ===\n");
  const results: TestResult[] = [];

  results.push(record("import-only mode records no command execution, network, or source upload", () => {
    const root = createFixtureRoot();
    try {
      const artifactPath = writeExternalGraph(root, {
        provider: "graphify",
        generatedAt: "2026-05-02T00:00:00.000Z",
        nodes: [{ id: "contract:payment", kind: "contract", label: "payment" }],
        edges: [],
      });

      const result = importExternalGraphArtifact({ root, mode: "import-only", sourcePath: artifactPath });
      assert.equal(result.mode, "import-only");
      assert.equal(result.status, "available");
      assert.equal(result.execution.commandExecuted, false);
      assert.equal(result.execution.networkUsed, false);
      assert.equal(result.execution.sourceUploaded, false);
    } finally {
      cleanupFixture(root);
    }
  }));

  results.push(record("normalized evidence includes provider, source, freshness, provenance, and advisory posture", () => {
    const evidence = normalizeExternalGraphEvidence({
      provider: "gitnexus",
      generatedAt: "2026-05-02T00:00:00.000Z",
      sourcePath: ".spec/integrations/gitnexus-graph.json",
      nodes: [{ id: "file:src/payment.ts", kind: "file", label: "src/payment.ts" }],
      edges: [],
      now: new Date("2026-05-02T01:00:00.000Z"),
    });

    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].provider, "gitnexus");
    assert.equal(evidence[0].generatedAt, "2026-05-02T00:00:00.000Z");
    assert.equal(evidence[0].sourcePath, ".spec/integrations/gitnexus-graph.json");
    assert.equal(evidence[0].freshness, "fresh");
    assert.equal(evidence[0].provenance.label, "external_import");
    assert.equal(evidence[0].provenance.descriptor.ownerReviewPosture, "required");
    assert.equal(evidence[0].advisoryOnly, true);
    assert.equal(evidence[0].blockingEligible, false);
  }));

  results.push(await recordAsync("verify converts invalid external graph imports into advisory-only warning context", async () => {
    const root = createVerifyFixture("p9-external-graph-invalid");
    try {
      const artifactPath = writeText(root, ".spec/integrations/external-graph.json", JSON.stringify({
        provider: "graphify",
        generatedAt: "bad-date",
        nodes: [{ id: "n1", kind: "contract" }],
        edges: [],
      }, null, 2));

      const importResult = importExternalGraphArtifact({ root, mode: "import-only", sourcePath: artifactPath });
      assert.equal(importResult.status, "invalid");
      assert.ok(importResult.warnings.some((warning) => warning.kind === "invalid_external_graph_artifact"));
      assert.equal(importResult.verifyInterruption, false);
      assert.equal(importResult.evidence.length, 0);

      const result = await runVerify({ root, generatedAt: "2026-05-02T00:00:00.000Z" });
      const issue = result.issues.find((candidate) => candidate.code === "INVALID_EXTERNAL_GRAPH_ARTIFACT");
      assert.ok(issue);
      assert.equal(issue?.severity, "advisory");
      assert.equal(issue?.kind, "runtime_error");
      assert.equal(result.blockingIssueCount, 0);
      assert.equal(result.exitCode, 0);
      assert.equal(result.metadata?.externalGraphImportStatus, "invalid");
      assert.equal(result.metadata?.externalGraphAdvisoryOnly, true);
    } finally {
      cleanupVerifyFixture(root);
    }
  }));

  results.push(await recordAsync("valid imports surface normalized evidence as an advisory canonical fact", async () => {
    const root = createVerifyFixture("p9-external-graph-facts");
    try {
      writeExternalGraph(root, {
        provider: "gitnexus",
        generatedAt: "2026-05-02T00:00:00.000Z",
        nodes: [{ id: "contract:billing", kind: "contract", label: "billing" }],
        edges: [],
      });

      const factsOutPath = ".spec/facts/p9-external-graph-facts.json";
      await runVerify({
        root,
        generatedAt: "2026-05-02T00:00:00.000Z",
        factsOutPath,
      });

      const definitions = getCanonicalFactDefinitions();
      const definition = definitions.find((candidate) => candidate.key === "externalGraph.normalizedEvidence");
      assert.equal(definition?.stability, "advisory");

      const snapshot = JSON.parse(fs.readFileSync(path.join(root, factsOutPath), "utf-8")) as ReturnType<typeof buildCanonicalFacts>;
      const evidence = snapshot.facts["externalGraph.normalizedEvidence"] as Array<{ provider: string; advisoryOnly: boolean; blockingEligible: boolean }>;
      assert.equal(Array.isArray(evidence), true);
      assert.equal(evidence[0]?.provider, "gitnexus");
      assert.equal(evidence[0]?.advisoryOnly, true);
      assert.equal(evidence[0]?.blockingEligible, false);
    } finally {
      cleanupVerifyFixture(root);
    }
  }));

  results.push(record("privacy classification forces review for external graph summaries and normalized evidence", () => {
    const root = createFixtureRoot();
    try {
      writeText(root, ".spec/handoffs/external-graph-summary.md", "# External Graph Summary\n\nNo secrets here.\n");
      writeText(root, ".spec/facts/external-graphs/normalized-evidence.json", JSON.stringify({
        provider: "graphify",
        evidence: [],
      }, null, 2));

      const result = buildPrivacyReport({
        root,
        generatedAt: "2026-05-02T00:00:00.000Z",
      });
      const byPath = new Map(result.report.artifacts.map((artifact) => [artifact.path, artifact]));

      assert.equal(byPath.get(".spec/handoffs/external-graph-summary.md")?.shareDecision, "review_before_sharing");
      assert.equal(byPath.get(".spec/facts/external-graphs/normalized-evidence.json")?.shareDecision, "review_before_sharing");
    } finally {
      cleanupFixture(root);
    }
  }));

  results.push(record("P9-T6 suite is registered in verify-ci-gates", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p9-external-graph-import-only.ts");
    assert.ok(suite);
    assert.equal(suite.area, "verify-ci-gates");
    assert.equal(suite.expectedTests, 6);
    assert.equal(suite.task, "P9-T6");

    const manifest = buildRegressionMatrixManifest();
    assert.equal(manifest.totalSuites, 138);
    assert.equal(manifest.totalExpectedTests, 619);
  }));

  report(results);
}

function createFixtureRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-external-graph-"));
}

function writeExternalGraph(root: string, value: unknown): string {
  const artifactPath = path.join(root, ".spec", "integrations", "external-graph.json");
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, JSON.stringify(value, null, 2), "utf-8");
  return artifactPath;
}

function writeText(root: string, relativePath: string, content: string): string {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
  return target;
}

function cleanupFixture(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    console.log(`✓ ${name}`);
    return { name, passed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ ${name}: ${message}`);
    return { name, passed: false, error: message };
  }
}

async function recordAsync(name: string, fn: () => Promise<void>): Promise<TestResult> {
  try {
    await fn();
    console.log(`✓ ${name}`);
    return { name, passed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ ${name}: ${message}`);
    return { name, passed: false, error: message };
  }
}

function report(results: TestResult[]): void {
  const passed = results.filter((result) => result.passed).length;
  console.log(`\n${passed}/${results.length} tests passed`);
  if (passed !== results.length) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
