import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as yaml from "js-yaml";
import { runChangeCommand } from "../change/change-command";
import { runGreenfieldInit } from "../greenfield/init";
import { compareReleaseBaselines, createReleaseSnapshot } from "../release/baseline-snapshot";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface BaselineYaml {
  release_version?: string;
  frozen_at?: string;
  source_baseline?: string;
  contract_graph?: {
    graph_kind?: string;
    graph_path?: string;
    lock_path?: string;
    root_hash?: string;
    graph_hash?: string;
    node_counts?: Record<string, number>;
    edge_counts?: Record<string, number>;
    critical_node_ids?: string[];
  };
  static_collector_manifest?: {
    manifest_kind?: string;
    manifest_path?: string;
    fact_count?: number;
    unresolved_surface_count?: number;
  };
  policy_snapshot?: {
    policy_kind?: string;
    path?: string;
    available?: boolean;
    content_hash?: string;
    facts_contract?: string;
    rule_ids?: string[];
  };
  requirement_ids?: string[];
  slices?: string[];
  assets?: string[];
  applied_deltas?: string[];
}

interface ContractGraphJson {
  nodes?: Array<{ id?: string; label?: string; source_id?: string; path?: string }>;
}

interface StaticCollectorManifestJson {
  facts?: Array<{ id?: string; kind?: string; path?: string; contract_ids?: string[]; confidence?: string }>;
  unresolved_surfaces?: Array<{ id?: string }>;
}

interface ContractGraphLockJson {
  graph_kind?: string;
  generated_at?: string;
  root_hash?: string;
  graph_hash?: string;
  node_hashes?: Record<string, string>;
  edge_hashes?: Record<string, string>;
  closure_hashes?: Record<string, string>;
  critical_node_ids?: string[];
}

async function main(): Promise<void> {
  console.log("=== Greenfield Baseline Snapshot Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-baseline-"));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-baseline-src-"));
  const results: TestResult[] = [];

  try {
    const requirementsPath = path.join(sourceRoot, "requirements.md");
    const technicalSolutionPath = path.join(sourceRoot, "technical-solution.md");
    fs.writeFileSync(requirementsPath, buildCommerceRequirements(), "utf-8");
    fs.writeFileSync(technicalSolutionPath, buildCommerceTechnicalSolution(), "utf-8");

    const init = runGreenfieldInit({
      root,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });
    const currentBaselinePath = path.join(root, ".spec", "baselines", "current.yaml");
    const currentBaseline = yaml.load(fs.readFileSync(currentBaselinePath, "utf-8")) as BaselineYaml;
    const anchoredRoutePath = path.join(root, "src", "routes", "orders.ts");
    fs.mkdirSync(path.dirname(anchoredRoutePath), { recursive: true });
    fs.writeFileSync(
      anchoredRoutePath,
      [
        "import { Router } from 'express';",
        "export const router = Router();",
        "// @jispec contract CTR-ORDERING-001",
        "router.post('/orders', (_req, res) => res.status(202).send({ ok: true }));",
      ].join("\n"),
      "utf-8",
    );

    results.push(record("initializer creates current baseline for release snapshots", () => {
      assert.equal(init.status, "input_contract_ready");
      assert.equal(init.nextTask, "greenfield-initialization-mvp-complete");
      assert.ok(fs.existsSync(currentBaselinePath));
      assert.equal(currentBaseline.requirement_ids?.includes("REQ-ORD-001"), true);
      assert.equal(currentBaseline.slices?.includes("ordering-checkout-v1"), true);
    }));

    const snapshot = createReleaseSnapshot({
      root,
      version: "v1",
      frozenAt: "2026-04-29T00:00:00.000Z",
    });
    const releaseBaseline = yaml.load(fs.readFileSync(snapshot.releaseBaselinePath, "utf-8")) as BaselineYaml;
    const releaseSummary = fs.readFileSync(snapshot.releaseSummaryPath, "utf-8");
    const releaseGraphPath = path.join(root, releaseBaseline.contract_graph?.graph_path ?? "");
    const releaseGraphLockPath = path.join(root, releaseBaseline.contract_graph?.lock_path ?? "");
    const staticCollectorManifestPath = path.join(root, releaseBaseline.static_collector_manifest?.manifest_path ?? "");
    const releaseGraph = JSON.parse(fs.readFileSync(releaseGraphPath, "utf-8")) as ContractGraphJson;
    const releaseGraphLock = JSON.parse(fs.readFileSync(releaseGraphLockPath, "utf-8")) as ContractGraphLockJson;
    const staticCollectorManifest = JSON.parse(fs.readFileSync(staticCollectorManifestPath, "utf-8")) as StaticCollectorManifestJson;

    results.push(record("release snapshot freezes current baseline and writes release summary", () => {
      assert.equal(snapshot.created, true);
      assert.equal(snapshot.overwritten, false);
      assert.equal(snapshot.version, "v1");
      assert.equal(releaseBaseline.release_version, "v1");
      assert.equal(releaseBaseline.frozen_at, "2026-04-29T00:00:00.000Z");
      assert.equal(releaseBaseline.source_baseline, ".spec/baselines/current.yaml");
      assert.deepEqual(releaseBaseline.requirement_ids, currentBaseline.requirement_ids);
      assert.equal(releaseBaseline.contract_graph?.graph_kind, "merkle-contract-dag");
      assert.equal(releaseBaseline.contract_graph?.graph_path, ".spec/releases/v1/contract-graph.json");
      assert.equal(releaseBaseline.contract_graph?.lock_path, ".spec/releases/v1/contract-graph.lock");
      assert.equal(releaseBaseline.contract_graph?.root_hash, releaseGraphLock.root_hash);
      assert.equal(typeof releaseBaseline.contract_graph?.graph_hash, "string");
      assert.equal(releaseBaseline.contract_graph?.node_counts?.requirement, 5);
      assert.equal(releaseBaseline.contract_graph?.node_counts?.code_fact, 1);
      assert.ok(releaseBaseline.contract_graph?.critical_node_ids?.includes("@api:CTR-ORDERING-001"));
      assert.ok(releaseBaseline.contract_graph?.critical_node_ids?.includes("@code:src/routes/orders.ts"));
      assert.equal(releaseBaseline.static_collector_manifest?.manifest_kind, "deterministic-static-collector");
      assert.equal(releaseBaseline.static_collector_manifest?.manifest_path, ".spec/releases/v1/static-collector-manifest.json");
      assert.ok((releaseBaseline.static_collector_manifest?.fact_count ?? 0) >= 1);
      assert.equal(releaseBaseline.policy_snapshot?.policy_kind, "verify-policy");
      assert.equal(releaseBaseline.policy_snapshot?.path, ".spec/policy.yaml");
      assert.equal(releaseBaseline.policy_snapshot?.available, true);
      assert.equal(releaseBaseline.policy_snapshot?.facts_contract, "1.0");
      assert.ok(releaseBaseline.policy_snapshot?.rule_ids?.includes("greenfield-no-blocking-verify-issues"));
      assert.equal(typeof releaseBaseline.policy_snapshot?.content_hash, "string");
      assert.equal(snapshot.summary.contractGraph.status, "tracked");
      assert.equal(snapshot.summary.staticCollector.status, "tracked");
      assert.equal(snapshot.summary.policy.status, "tracked");
      assert.ok(fs.existsSync(releaseGraphPath));
      assert.ok(fs.existsSync(releaseGraphLockPath));
      assert.ok(fs.existsSync(staticCollectorManifestPath));
      assert.ok(releaseGraph.nodes?.some((node) => node.id === "@code:src/routes/orders.ts" && node.source_id === "route:POST /orders"));
      assert.equal(releaseGraphLock.graph_kind, "merkle-contract-dag");
      assert.equal(typeof releaseGraphLock.root_hash, "string");
      assert.equal(typeof releaseGraphLock.node_hashes?.["@api:CTR-ORDERING-001"], "string");
      assert.equal(typeof releaseGraphLock.edge_hashes?.["@api:CTR-ORDERING-001|verifies|@bdd:SCN-ORDER-CHECKOUT-VALID"], "string");
      assert.equal(typeof releaseGraphLock.node_hashes?.["@code:src/routes/orders.ts"], "string");
      assert.equal(typeof releaseGraphLock.edge_hashes?.["@api:CTR-ORDERING-001|implements|@code:src/routes/orders.ts"], "string");
      assert.equal(typeof releaseGraphLock.closure_hashes?.["@req:REQ-ORD-001"], "string");
      assert.ok(staticCollectorManifest.facts?.some((fact) =>
        fact.id === "route:POST /orders" &&
        fact.kind === "route" &&
        fact.path === "src/routes/orders.ts" &&
        fact.confidence === "explicit_anchor" &&
        fact.contract_ids?.includes("CTR-ORDERING-001")
      ));
      assert.match(releaseSummary, /# Release v1 Baseline/);
      assert.match(releaseSummary, /## Baseline Summary/);
      assert.match(releaseSummary, /## Contract Graph/);
      assert.match(releaseSummary, /## Static Collector/);
      assert.match(releaseSummary, /ordering-checkout-v1/);
    }));

    const protectedSnapshot = createReleaseSnapshot({ root, version: "v1" });
    const protectedBaseline = yaml.load(fs.readFileSync(protectedSnapshot.releaseBaselinePath, "utf-8")) as BaselineYaml;
    const protectedGraphLock = JSON.parse(fs.readFileSync(releaseGraphLockPath, "utf-8")) as ContractGraphLockJson;
    results.push(record("release snapshot protects existing frozen baselines unless forced", () => {
      assert.equal(protectedSnapshot.created, false);
      assert.equal(protectedSnapshot.overwritten, false);
      assert.equal(protectedBaseline.frozen_at, "2026-04-29T00:00:00.000Z");
      assert.equal(protectedGraphLock.generated_at, "2026-04-29T00:00:00.000Z");
    }));

    const identicalCompare = compareReleaseBaselines({ root, from: "v1", to: "current" });
    results.push(record("release compare reports v1 and current as identical before baseline changes", () => {
      assert.equal(identicalCompare.identical, true);
      assert.equal(identicalCompare.graphDiff.available, true);
      assert.equal(identicalCompare.graphDiff.identical, true);
      assert.equal(identicalCompare.driftSummary.overallStatus, "unchanged");
      assert.equal(identicalCompare.driftSummary.contractGraph.status, "unchanged");
      assert.equal(identicalCompare.driftSummary.staticCollector.status, "unchanged");
      assert.equal(identicalCompare.driftSummary.policy.status, "unchanged");
      assert.ok(fs.existsSync(identicalCompare.compareReportJsonPath));
      assert.ok(fs.existsSync(identicalCompare.compareReportMarkdownPath));
      assert.ok(identicalCompare.diffs.every((diff) => diff.added.length === 0 && diff.removed.length === 0));
    }));

    const currentGraphPath = path.join(root, ".spec", "evidence", "contract-graph.json");
    const currentGraphBefore = fs.readFileSync(currentGraphPath, "utf-8");
    const currentGraph = JSON.parse(currentGraphBefore) as ContractGraphJson;
    const apiNode = currentGraph.nodes?.find((node) => node.id === "@api:CTR-ORDERING-001");
    assert.ok(apiNode);
    apiNode.label = "CheckoutRequestV2";
    fs.writeFileSync(currentGraphPath, `${JSON.stringify(currentGraph, null, 2)}\n`, "utf-8");
    const merkleCompare = compareReleaseBaselines({ root, from: "v1", to: "current" });
    fs.writeFileSync(currentGraphPath, currentGraphBefore, "utf-8");

    results.push(record("release compare locates Merkle Contract DAG node and closure changes", () => {
      assert.equal(merkleCompare.identical, false);
      assert.equal(merkleCompare.graphDiff.available, true);
      assert.equal(merkleCompare.graphDiff.identical, false);
      assert.notEqual(merkleCompare.graphDiff.fromRootHash, merkleCompare.graphDiff.toRootHash);
      assert.ok(merkleCompare.graphDiff.changedNodeContent.includes("@api:CTR-ORDERING-001"));
      assert.ok(merkleCompare.graphDiff.affectedClosureNodes.includes("@api:CTR-ORDERING-001"));
      assert.ok(merkleCompare.graphDiff.affectedClosureNodes.includes("@req:REQ-ORD-001"));
      assert.equal(merkleCompare.driftSummary.contractGraph.kind, "contract_graph_drift");
      assert.equal(merkleCompare.driftSummary.contractGraph.status, "changed");
      assert.equal(merkleCompare.driftSummary.staticCollector.status, "unchanged");
      assert.equal(merkleCompare.driftSummary.policy.status, "unchanged");
      assert.match(fs.readFileSync(merkleCompare.compareReportMarkdownPath, "utf-8"), /## Drift Summary/);
      assert.match(fs.readFileSync(merkleCompare.compareReportMarkdownPath, "utf-8"), /Contract graph drift: changed/);
      assert.match(fs.readFileSync(merkleCompare.compareReportMarkdownPath, "utf-8"), /Changed node content/);
      assert.match(fs.readFileSync(merkleCompare.compareReportJsonPath, "utf-8"), /"driftSummary"/);
      assert.match(fs.readFileSync(merkleCompare.compareReportJsonPath, "utf-8"), /"changedNodeContent"/);
    }));

    const policyPath = path.join(root, ".spec", "policy.yaml");
    const originalPolicy = fs.readFileSync(policyPath, "utf-8");
    fs.writeFileSync(
      policyPath,
      originalPolicy.replace("greenfield-no-blocking-verify-issues", "greenfield-no-blocking-verify-issues-v2"),
      "utf-8",
    );
    const policyOnlyCompare = compareReleaseBaselines({ root, from: "v1", to: "current" });
    fs.writeFileSync(policyPath, originalPolicy, "utf-8");

    results.push(record("release compare marks policy-only drift as non-identical", () => {
      assert.equal(policyOnlyCompare.identical, false);
      assert.equal(policyOnlyCompare.driftSummary.contractGraph.status, "unchanged");
      assert.equal(policyOnlyCompare.driftSummary.staticCollector.status, "unchanged");
      assert.equal(policyOnlyCompare.driftSummary.policy.status, "changed");
    }));

    const additionalRoutePath = path.join(root, "src", "routes", "refunds.ts");
    fs.writeFileSync(
      additionalRoutePath,
      [
        "import { Router } from 'express';",
        "export const router = Router();",
        "router.post('/refunds', (_req, res) => res.status(202).send({ ok: true }));",
      ].join("\n"),
      "utf-8",
    );
    fs.writeFileSync(
      policyPath,
      originalPolicy.replace("greenfield-no-blocking-verify-issues", "greenfield-no-blocking-verify-issues-v2"),
      "utf-8",
    );
    const governanceCompare = compareReleaseBaselines({ root, from: "v1", to: "current" });
    fs.rmSync(additionalRoutePath, { force: true });
    fs.writeFileSync(policyPath, originalPolicy, "utf-8");

    results.push(record("release compare distinguishes static collector and policy drift", () => {
      assert.equal(governanceCompare.driftSummary.overallStatus, "changed");
      assert.equal(governanceCompare.driftSummary.staticCollector.kind, "static_collector_drift");
      assert.equal(governanceCompare.driftSummary.staticCollector.status, "changed");
      assert.equal(governanceCompare.driftSummary.policy.kind, "policy_drift");
      assert.equal(governanceCompare.driftSummary.policy.status, "changed");
      assert.notDeepEqual(
        governanceCompare.driftSummary.policy.details.from_rule_ids,
        governanceCompare.driftSummary.policy.details.to_rule_ids,
      );
      const markdown = fs.readFileSync(governanceCompare.compareReportMarkdownPath, "utf-8");
      assert.match(markdown, /Static collector drift: changed/);
      assert.match(markdown, /Policy drift: changed/);
    }));

    const change = await runChangeCommand({
      root,
      summary: "V2: add REQ-ORD-005 refund request intake",
      mode: "prompt",
      changeType: "add",
      contextId: "ordering",
      sliceId: "ordering-checkout-v1",
    });
    const evolvedBaseline: BaselineYaml = {
      ...currentBaseline,
      requirement_ids: [...(currentBaseline.requirement_ids ?? []), "REQ-ORD-005"],
      applied_deltas: [change.session.specDelta?.changeId ?? "missing-change-id"],
    };
    fs.writeFileSync(currentBaselinePath, yaml.dump(evolvedBaseline, { lineWidth: 100, noRefs: true }), "utf-8");
    const diffCompare = compareReleaseBaselines({ root, from: "v1", to: "current" });
    const requirementDiff = diffCompare.diffs.find((diff) => diff.field === "requirement_ids");

    results.push(record("release compare shows changes between frozen v1 and evolved current baseline", () => {
      assert.equal(diffCompare.identical, false);
      assert.deepEqual(requirementDiff?.added, ["REQ-ORD-005"]);
      assert.deepEqual(requirementDiff?.removed, []);
    }));

    const cliRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-baseline-cli-"));
    runGreenfieldInit({
      root: cliRoot,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });
    const cliSnapshot = runCli(["release", "snapshot", "--root", cliRoot, "--version", "v1", "--json"]);
    const cliSnapshotPayload = JSON.parse(cliSnapshot.stdout) as {
      version?: string;
      releaseBaselinePath?: string;
      contractGraphPath?: string;
      contractGraphLockPath?: string;
      contractGraphRootHash?: string;
    };
    const cliCompare = runCli(["release", "compare", "--root", cliRoot, "--from", "v1", "--to", "current", "--json"]);
    const cliComparePayload = JSON.parse(cliCompare.stdout) as {
      identical?: boolean;
      compareReportJsonPath?: string;
      compareReportMarkdownPath?: string;
      graphDiff?: { identical?: boolean };
    };

    results.push(record("CLI exposes release snapshot and compare commands", () => {
      assert.equal(cliSnapshot.status, 0);
      assert.equal(cliSnapshotPayload.version, "v1");
      assert.ok(fs.existsSync(cliSnapshotPayload.releaseBaselinePath ?? ""));
      assert.ok(fs.existsSync(cliSnapshotPayload.contractGraphPath ?? ""));
      assert.ok(fs.existsSync(cliSnapshotPayload.contractGraphLockPath ?? ""));
      assert.equal(typeof cliSnapshotPayload.contractGraphRootHash, "string");
      assert.equal(cliCompare.status, 0);
      assert.equal(cliComparePayload.identical, true);
      assert.ok(fs.existsSync(cliComparePayload.compareReportJsonPath ?? ""));
      assert.ok(fs.existsSync(cliComparePayload.compareReportMarkdownPath ?? ""));
      assert.equal(cliComparePayload.graphDiff?.identical, true);
    }));
    fs.rmSync(cliRoot, { recursive: true, force: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "greenfield baseline snapshot execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
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

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "tools", "jispec", "cli.ts"), ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function record(name: string, run: () => void): TestResult {
  try {
    run();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildCommerceRequirements(): string {
  return [
    "# Commerce Platform Requirements",
    "",
    "## Objective",
    "",
    "Build a commerce platform that supports product browsing, cart validation, checkout, and order creation.",
    "",
    "## Users / Actors",
    "",
    "- Shopper",
    "",
    "## Core Journeys",
    "",
    "- Shopper checks out a valid cart.",
    "",
    "## Functional Requirements",
    "",
    "### REQ-CAT-001",
    "",
    "The system must expose products that are available for sale.",
    "",
    "### REQ-ORD-001",
    "",
    "A user must be able to submit an order from a valid cart.",
    "",
    "### REQ-ORD-002",
    "",
    "Checkout must reject carts with unavailable items.",
    "",
    "### REQ-ORD-003",
    "",
    "An order must not be created unless the cart total is calculable and stock validation passes.",
    "",
    "### REQ-ORD-004",
    "",
    "The system must emit a domain event when an order is created successfully.",
    "",
    "## Non-Functional Requirements",
    "",
    "- Validation logic must be testable in isolation.",
    "",
    "## Out Of Scope",
    "",
    "- Refunds.",
    "",
    "## Acceptance Signals",
    "",
    "- Valid checkout creates an order.",
  ].join("\n");
}

function buildCommerceTechnicalSolution(): string {
  return [
    "# Commerce Platform Technical Solution",
    "",
    "## Architecture Direction",
    "",
    "Use bounded contexts for `catalog` and `ordering`.",
    "",
    "- `catalog` owns product availability and price read models",
    "- `ordering` owns cart validation, checkout orchestration, and order persistence",
    "",
    "## Integration Boundaries",
    "",
    "`ordering` may consume published product availability information from `catalog`, but it may not write to catalog-owned models.",
    "",
    "## Data Ownership",
    "",
    "Each bounded context owns persistence.",
    "",
    "## Testing Strategy",
    "",
    "Use unit, integration, and contract tests.",
    "",
    "## Operational Constraints",
    "",
    "No direct table sharing between bounded contexts.",
    "",
    "## Risks And Open Decisions",
    "",
    "Payment is deferred.",
  ].join("\n");
}

void main();
