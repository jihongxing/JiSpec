import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { collectConsoleLocalSnapshot } from "../console/read-model-snapshot";
import type { ContractGraph } from "../greenfield/contract-graph";
import { compareReleaseBaselines, type ReleaseDriftTrendSummary } from "../release/baseline-snapshot";
import { writeMerkleContractDagArtifacts } from "../release/merkle-contract-dag";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Release Drift Trend Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("release compare refreshes a trend summary across multiple comparisons", () => {
    const root = createReleaseTrendFixture();
    try {
      const first = compareReleaseBaselines({
        root,
        from: "v1",
        to: "v2",
        comparedAt: "2026-05-01T01:00:00.000Z",
      });
      const second = compareReleaseBaselines({
        root,
        from: "v2",
        to: "v3",
        comparedAt: "2026-05-01T02:00:00.000Z",
      });
      const trend = readTrend(second.driftTrendJsonPath);

      assert.ok(fs.existsSync(first.driftTrendJsonPath));
      assert.ok(fs.existsSync(second.driftTrendMarkdownPath));
      assert.equal(trend.compareCount, 2);
      assert.equal(trend.changedCompareCount, 2);
      assert.equal(trend.latest?.from, "v2");
      assert.equal(trend.latest?.to, "v3");
      assert.match(fs.readFileSync(second.compareReportMarkdownPath, "utf-8"), /## Drift Trend/);
      assert.match(fs.readFileSync(second.driftTrendMarkdownPath, "utf-8"), /# Release Drift Trend/);
    } finally {
      removeFixtureRoot(root);
    }
  }));

  results.push(record("trend splits contract graph, static collector, and policy drift histories", () => {
    const root = createReleaseTrendFixture();
    try {
      const first = compareReleaseBaselines({
        root,
        from: "v1",
        to: "v2",
        comparedAt: "2026-05-01T01:00:00.000Z",
      });
      const second = compareReleaseBaselines({
        root,
        from: "v2",
        to: "v3",
        comparedAt: "2026-05-01T02:00:00.000Z",
      });
      const trend = second.driftTrend;

      assert.equal(first.driftSummary.contractGraph.status, "changed");
      assert.equal(first.driftSummary.staticCollector.status, "changed");
      assert.equal(first.driftSummary.policy.status, "unchanged");
      assert.equal(second.driftSummary.contractGraph.status, "unchanged");
      assert.equal(second.driftSummary.staticCollector.status, "unchanged");
      assert.equal(second.driftSummary.policy.status, "changed");
      assert.equal(trend.surfaces.contractGraph.changed, 1);
      assert.equal(trend.surfaces.staticCollector.changed, 1);
      assert.equal(trend.surfaces.policy.changed, 1);
      assert.equal(trend.surfaces.contractGraph.unchanged, 1);
      assert.equal(trend.surfaces.policy.unchanged, 1);
    } finally {
      removeFixtureRoot(root);
    }
  }));

  results.push(record("Console contract drift summary reads release drift trend history", () => {
    const root = createReleaseTrendFixture();
    try {
      compareReleaseBaselines({
        root,
        from: "v1",
        to: "v2",
        comparedAt: "2026-05-01T01:00:00.000Z",
      });
      compareReleaseBaselines({
        root,
        from: "v2",
        to: "v3",
        comparedAt: "2026-05-01T02:00:00.000Z",
      });

      const snapshot = collectConsoleLocalSnapshot(root);
      const drift = snapshot.governance.objects.find((object) => object.id === "contract_drift");
      assert.equal(drift?.status, "available");
      assert.equal(drift?.summary.trendAvailable, true);
      assert.equal(drift?.summary.trendCompareCount, 2);
      assert.equal(drift?.summary.trendChangedCompareCount, 2);
      assert.deepEqual(drift?.summary.latestComparison, {
        from: "v2",
        to: "v3",
        comparedAt: "2026-05-01T02:00:00.000Z",
      });
      assert.equal((drift?.summary.driftSummary as Record<string, unknown>).overallStatus, "changed");
    } finally {
      removeFixtureRoot(root);
    }
  }));

  results.push(record("CLI release compare returns trend artifact paths", () => {
    const root = createReleaseTrendFixture();
    try {
      const result = runCli(["release", "compare", "--root", root, "--from", "v1", "--to", "v2", "--json"]);
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout) as {
        driftTrendJsonPath?: string;
        driftTrendMarkdownPath?: string;
        driftTrend?: { compareCount?: number };
      };
      assert.ok(fs.existsSync(payload.driftTrendJsonPath ?? ""));
      assert.ok(fs.existsSync(payload.driftTrendMarkdownPath ?? ""));
      assert.equal(payload.driftTrend?.compareCount, 1);
    } finally {
      removeFixtureRoot(root);
    }
  }));

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

function createReleaseTrendFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-release-drift-trend-"));
  writeRelease(root, "v1", {
    graphLabel: "Checkout contract",
    staticFactCount: 1,
    policyContentHash: "policy-v1",
    policyRuleIds: ["no-blocking"],
  });
  writeRelease(root, "v2", {
    graphLabel: "Checkout contract v2",
    staticFactCount: 2,
    policyContentHash: "policy-v1",
    policyRuleIds: ["no-blocking"],
  });
  writeRelease(root, "v3", {
    graphLabel: "Checkout contract v2",
    staticFactCount: 2,
    policyContentHash: "policy-v3",
    policyRuleIds: ["no-blocking", "require-owner-review"],
  });
  return root;
}

function writeRelease(
  root: string,
  version: string,
  options: {
    graphLabel: string;
    staticFactCount: number;
    policyContentHash: string;
    policyRuleIds: string[];
  },
): void {
  const graphArtifacts = writeMerkleContractDagArtifacts({
    root,
    version,
    graph: createGraph(options.graphLabel),
    generatedAt: `2026-05-01T00:00:00.000Z`,
  });
  const baselinePath = path.join(root, ".spec", "baselines", "releases", `${version}.yaml`);
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(
    baselinePath,
    yaml.dump({
      release_version: version,
      frozen_at: "2026-05-01T00:00:00.000Z",
      requirement_ids: ["REQ-1"],
      contexts: ["ordering"],
      contracts: ["CTR-ORDERING"],
      scenarios: [],
      slices: [],
      assets: [],
      contract_graph: {
        graph_kind: "merkle-contract-dag",
        graph_path: normalizeRelative(root, graphArtifacts.graphPath),
        lock_path: normalizeRelative(root, graphArtifacts.lockPath),
        root_hash: graphArtifacts.lock.root_hash,
        graph_hash: graphArtifacts.lock.graph_hash,
        node_counts: graphArtifacts.lock.node_counts,
        edge_counts: graphArtifacts.lock.edge_counts,
      },
      static_collector_manifest: {
        manifest_kind: "deterministic-static-collector",
        fact_count: options.staticFactCount,
        unresolved_surface_count: 0,
      },
      policy_snapshot: {
        policy_kind: "verify-policy",
        path: ".spec/policy.yaml",
        available: true,
        content_hash: options.policyContentHash,
        facts_contract: "1.0",
        rule_ids: options.policyRuleIds,
      },
    }, { lineWidth: 100, noRefs: true, sortKeys: false }),
    "utf-8",
  );
}

function createGraph(label: string): ContractGraph {
  return {
    schema_version: 1,
    graph_kind: "deterministic-contract-graph",
    generated_at: "2026-05-01T00:00:00.000Z",
    nodes: [
      {
        id: "@req:REQ-1",
        kind: "requirement",
        label: "Checkout requirement",
        requirement_ids: ["REQ-1"],
      },
      {
        id: "@api:CTR-ORDERING",
        kind: "api_contract",
        label,
        requirement_ids: ["REQ-1"],
      },
    ],
    edges: [
      {
        from: "@req:REQ-1",
        to: "@api:CTR-ORDERING",
        relation: "defines",
        source: "explicit_anchor",
      },
    ],
    summary: {
      node_counts: {
        requirement: 1,
        bounded_context: 0,
        domain_entity: 0,
        domain_event: 0,
        invariant: 0,
        api_contract: 1,
        bdd_scenario: 0,
        slice: 0,
        test: 0,
        code_fact: 0,
        migration: 0,
        review_decision: 0,
        spec_debt: 0,
        baseline: 0,
        delta: 0,
      },
      edge_counts: {
        defines: 1,
        owns: 0,
        depends_on: 0,
        verifies: 0,
        covered_by: 0,
        implements: 0,
        consumes: 0,
        emits: 0,
        blocked_by: 0,
        supersedes: 0,
        deferred_by: 0,
        waived_by: 0,
        derived_from: 0,
      },
    },
    warnings: [],
  };
}

function readTrend(filePath: string): ReleaseDriftTrendSummary {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ReleaseDriftTrendSummary;
}

function normalizeRelative(root: string, filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function removeFixtureRoot(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const cliPath = path.join(repoRoot, "tools", "jispec", "cli.ts");
  const result = spawnSync(process.execPath, ["--import", "tsx", cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
