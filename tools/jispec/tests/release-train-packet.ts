import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendAuditEvent } from "../audit/event-ledger";
import { collectConsoleLocalSnapshot } from "../console/read-model-snapshot";
import { Doctor } from "../doctor";
import { buildNorthStarAcceptance } from "../north-star/acceptance";
import { writeGlobalOperationsPacket } from "../operations/global-operations-packet";
import { writeOrgResponsibilityGraph } from "../operations/org-responsibility-graph";
import { writeAsyncReviewInbox } from "../operations/async-review-inbox";
import { writeOpsAgingLedger } from "../operations/ops-aging-ledger";
import {
  buildReleaseTrainPacket,
  writeReleaseTrainPacket,
} from "../operations/release-train-packet";
import { TEST_SUITES } from "./regression-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Release Train Packet Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("builder emits ready release train coordination packet", () => {
    withFixture("release-train-ready-", (root) => {
      writeReadyFixture(root);
      const packet = buildReleaseTrainPacket(root);

      assert.equal(packet.kind, "jispec-release-train-packet");
      assert.equal(packet.status, "ready");
      assert.equal(packet.sourceAggregate.promotionReady, true);
      assert.equal(packet.releaseCompare.globalContextStatus, "available");
      assert.equal(packet.trainReadiness.ready, true);
      assert.equal(packet.trainReadiness.blockedRepoCount, 0);
      assert.equal(packet.trainReadiness.ownerAssignmentCount, 1);
      assert.equal(packet.trainReadiness.requiredReviewCount, 2);
      assert.match(packet.trainReadiness.safeNextCommand, /jispec-cli -- change/);
      assert.deepEqual(packet.blockers, []);
    });
  }));

  results.push(record("builder blocks missing coordination inputs with explicit blocker codes", () => {
    withFixture("release-train-blocked-", (root) => {
      const packet = buildReleaseTrainPacket(root);

      assert.equal(packet.status, "blocked");
      assert.ok(packet.blockers.includes("multi_repo_aggregate_missing"));
      assert.ok(packet.blockers.includes("release_compare_missing"));
      assert.ok(packet.blockers.includes("org_responsibility_graph_not_ready"));
      assert.ok(packet.blockers.includes("ops_aging_ledger_not_ready"));
      assert.ok(packet.blockers.includes("owner_assignments_missing"));
      assert.ok(packet.blockers.includes("required_reviews_missing"));
    });
  }));

  results.push(record("writer materializes JSON and Markdown companion without release execution", () => {
    withFixture("release-train-write-", (root) => {
      writeReadyFixture(root);
      const result = writeReleaseTrainPacket(root);

      assert.equal(result.packetPath, ".spec/operations/release-train-packet.json");
      assert.equal(result.summaryPath, ".spec/operations/release-train-packet.md");
      assert.equal(fs.existsSync(path.join(root, result.packetPath)), true);
      assert.equal(fs.existsSync(path.join(root, result.summaryPath)), true);
      const saved = JSON.parse(fs.readFileSync(path.join(root, result.packetPath), "utf-8")) as { boundary?: { executesCommands?: boolean; replacesPostReleaseGate?: boolean; sourceUploadRequired?: boolean } };
      const markdown = fs.readFileSync(path.join(root, result.summaryPath), "utf-8");
      assert.equal(saved.boundary?.executesCommands, false);
      assert.equal(saved.boundary?.replacesPostReleaseGate, false);
      assert.equal(saved.boundary?.sourceUploadRequired, false);
      assert.match(markdown, /Release Train Packet/);
    });
  }));

  results.push(await recordAsync("doctor global and CLI expose release train readiness and write packet", async () => {
    const root = createRepoBackedFixture("jispec-release-train-doctor-");
    try {
      writeReadyFixture(root);
      writeReleaseTrainPacket(root);
      const report = await new Doctor(root).checkGlobalReadiness();
      assert.ok(report.checks.some((check) => check.name === "Release Train Packet Readiness"));
      assert.match(Doctor.formatText(report), /Release Train Packet Readiness/);

      const cli = runCli(["doctor", "global", "--root", root, "--write-release-train", "--json"]);
      assert.ok([0, 1].includes(cli.status ?? -1), `${cli.stderr}\n${cli.stdout}`);
      const payload = JSON.parse(cli.stdout) as { releaseTrainPacketWrite?: { packetPath?: string; packet?: { kind?: string } } };
      assert.equal(payload.releaseTrainPacketWrite?.packetPath, ".spec/operations/release-train-packet.json");
      assert.equal(payload.releaseTrainPacketWrite?.packet?.kind, "jispec-release-train-packet");
      assert.equal(fs.existsSync(path.join(root, ".spec", "operations", "release-train-packet.json")), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("Console and North Star acceptance reference release train evidence", () => {
    withFixture("release-train-console-", (root) => {
      writeReadyFixture(root);
      writeReleaseTrainPacket(root);

      const snapshot = collectConsoleLocalSnapshot(root);
      const object = snapshot.governance.objects.find((candidate) => candidate.id === "release_train_packet");
      assert.ok(object);
      assert.equal(object.status, "available");
      assert.equal(object.summary.status, "ready");
      assert.equal(object.summary.trainReady, true);
      assert.equal(object.summary.requiredReviewCount, 2);
      assert.equal(object.summary.boundaryReplacesPostReleaseGate, false);

      const acceptance = buildNorthStarAcceptance({ root, generatedAt: "2026-05-22T00:00:00.000Z" });
      const scenario = acceptance.scenarios.find((candidate) => candidate.id === "release_train_packet");
      assert.ok(scenario);
      assert.equal(scenario.status, "passed");
      assert.equal(scenario.evidence?.releaseTrainPacketStatus, "ready");
      assert.equal(scenario.evidence?.releaseTrainRequiredReviewCount, 2);
      assert.equal(scenario.evidence?.releaseTrainBoundaryReplacesPostReleaseGate, false);
    });
  }));

  results.push(record("phase-14 suite is registered in runtime-extended matrix", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "release-train-packet.ts");
    assert.ok(suite);
    assert.equal(suite.area, "runtime-extended");
    assert.equal(suite.expectedTests, 6);
    assert.equal(suite.task, "North-Star-Score-Phase-14");
  }));

  await printResults(results);
}

function withFixture(prefix: string, run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `jispec-${prefix}`));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function createRepoBackedFixture(prefix: string): string {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const fixtureRoot = fs.mkdtempSync(path.join(repoRoot, prefix));
  for (const entry of ["tools", "scripts", "agents", "contexts", "docs", "jiproject", "schemas"] as const) {
    fs.cpSync(path.join(repoRoot, entry), path.join(fixtureRoot, entry), { recursive: true, dereference: true });
  }
  fs.copyFileSync(path.join(repoRoot, "package.json"), path.join(fixtureRoot, "package.json"));
  fs.copyFileSync(path.join(repoRoot, "tsconfig.json"), path.join(fixtureRoot, "tsconfig.json"));
  return fixtureRoot;
}

function writeReadyFixture(root: string): void {
  writeJson(root, "package.json", {
    scripts: { jispec: "jispec", "ci:verify": "jispec verify", "post-release:gate": "jispec post-release:gate" },
  });
  writeJson(root, ".spec/privacy/privacy-report.json", {
    kind: "jispec-privacy-report",
    summary: { highSeverityFindingCount: 0 },
  });
  writeJson(root, ".spec/doctor/global-readiness.json", {
    profile: "global",
    ready: true,
    readinessSummary: { profile: "global", ready: true, blockerCount: 0, blockers: [] },
    checks: [],
  });
  writeReadyAuditLedger(root);
  writeJson(root, ".spec/console/multi-repo-governance.json", readyAggregate(root));
  writeJson(root, ".spec/operations/org-topology.json", {
    kind: "jispec-org-topology",
    orgId: "acme-platform",
    teams: [
      { id: "platform", name: "Platform", owner: "platform-lead", reviewers: ["alice", "bob"], escalation: ["director-eng"] },
      { id: "payments-team", name: "Payments", owner: "payments-lead", reviewers: ["pay-reviewer"], escalation: ["director-eng"] },
    ],
    repoAssignments: [
      { repoId: "orders", teamId: "platform" },
      { repoId: "payments", teamId: "payments-team" },
    ],
  });
  writeGlobalOperationsPacket(root, ".spec/operations/global-operations-packet.json", {
    doctorGlobalReport: {
      profile: "global",
      ready: true,
      readinessSummary: { profile: "global", ready: true, blockerCount: 0, blockers: [] },
      checks: [],
    },
  });
  writeOrgResponsibilityGraph(root);
  writeAsyncReviewInbox(root);
  writeOpsAgingLedger(root);
  writeNorthStarSupportArtifacts(root);
}

function readyAggregate(root: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-aggregate",
    generatedAt: "2026-05-22T00:00:00.000Z",
    root: normalize(root),
    promotionReadiness: {
      phase: "north-star-score-optimization-phase-2",
      ready: true,
      checklist: [
        { id: "repo_group_configured", status: "pass" },
        { id: "cross_repo_contract_refs", status: "pass" },
        { id: "owner_action_lifecycle", status: "pass" },
        { id: "promotion_candidate_boundary", status: "pass" },
        { id: "north_star_acceptance_coverage", status: "pass" },
      ],
      blockers: [],
    },
    repoGroup: {
      status: "available",
      sourcePath: ".spec/console/repo-group.yaml",
      repos: [
        { id: "payments", role: "upstream", owner: "payments-team", snapshotStatus: "available", upstreamContractRefs: [], downstreamContractRefs: [".spec/contracts/orders.yaml"] },
        { id: "orders", role: "downstream", owner: "platform", snapshotStatus: "available", upstreamContractRefs: [".spec/contracts/orders.yaml"], downstreamContractRefs: [] },
      ],
    },
    contractDriftHints: [
      {
        upstreamRepoId: "payments",
        downstreamRepoId: "orders",
        contractRef: ".spec/contracts/orders.yaml",
        ownerActionId: "owner-action:orders:.spec/contracts/orders.yaml",
        evidence: { downstreamSourceEvolutionChangeId: "change-1" },
      },
    ],
    ownerActions: [
      {
        id: "owner-action:orders:.spec/contracts/orders.yaml",
        status: "ready",
        owner: "platform",
        repoId: "orders",
        primaryCommand: { command: "npm run jispec-cli -- change --root ." },
        followupCommands: [],
        affectedContracts: [".spec/contracts/orders.yaml"],
      },
    ],
  };
}

function writeNorthStarSupportArtifacts(root: string): void {
  writeJson(root, ".spec/handoffs/bootstrap-takeover.json", { status: "committed" });
  writeText(root, ".spec/greenfield/initialization-summary.md", "# Greenfield summary\n");
  writeJson(root, ".jispec/change-session.json", { id: "change-1", orchestrationMode: "execute" });
  writeJson(root, ".jispec/implement/change-1/patch-mediation.json", { externalPatchControlled: true });
  writeJson(root, ".spec/waivers/W-1.json", { id: "W-1", status: "active" });
  writeJson(root, ".jispec-ci/verify-report.json", { verdict: "PASS", ok: true });
  writeJson(root, ".spec/pilot/package.json", { kind: "jispec-pilot-product-package" });
  writeText(root, ".spec/baselines/current.yaml", [
    "version: 1",
    "requirement_lifecycle:",
    "  path: .spec/requirements/lifecycle.yaml",
    "  registry_version: 2",
    "  active_snapshot_id: snapshot-ordering-v2",
    "  last_adopted_change_id: change-1",
    "source_evolution:",
    "  source_evolution_path: .spec/deltas/change-1/source-evolution.json",
    "  source_review_path: .spec/deltas/change-1/source-review.yaml",
    "  last_adopted_change_id: change-1",
  ].join("\n"));
  writeText(root, ".spec/requirements/lifecycle.yaml", "version: 1\nregistry_version: 2\nrequirements: []\n");
  writeJson(root, ".spec/deltas/change-1/source-evolution.json", {
    version: 1,
    summary: { changed: true, total: 1, modified: 1 },
    items: [{ evolution_id: "modified:req-1", severity: "blocking", anchor_id: "REQ-1" }],
  });
  writeText(root, ".spec/deltas/change-1/source-review.yaml", [
    "version: 1",
    "change_id: change-1",
    "items:",
    "  - item_id: modified:req-1",
    "    evolution_id: modified:req-1",
    "    status: adopted",
    "    severity: blocking",
    "    review_history:",
    "      - action: defer",
    "        actor: architect",
    "      - action: adopt",
    "        actor: architect",
  ].join("\n"));
  writeJson(root, ".spec/releases/drift-trend.json", { latest: { reportPath: ".spec/releases/compare/v1-to-current/compare-report.json", overallStatus: "changed" }, compareCount: 1 });
  writeJson(root, ".spec/releases/compare/v1-to-current/compare-report.json", {
    driftSummary: { overallStatus: "changed" },
    globalContext: {
      kind: "release_compare_global_context",
      status: "available",
      details: {
        aggregatePath: ".spec/console/multi-repo-governance.json",
        lifecycleRegistryDelta: { toPath: ".spec/requirements/lifecycle.yaml", toVersion: 2, changed: true },
        sourceEvolutionArtifacts: {
          toSourceEvolutionPath: ".spec/deltas/change-1/source-evolution.json",
          toSourceReviewPath: ".spec/deltas/change-1/source-review.yaml",
          toActiveSnapshotId: "snapshot-ordering-v2",
          toLastAdoptedChangeId: "change-1",
        },
        relevantContractDriftHints: [{ id: "hint:1" }],
        relevantOwnerActions: [{ id: "owner-action:1" }],
        ownerReviewRecommendations: [{ id: "owner-review:1" }],
      },
    },
  });
}

function writeReadyAuditLedger(root: string): void {
  for (const event of [
    ["policy_approval_decision", ".spec/approvals/policy.json", ".spec/policy.yaml"],
    ["waiver_renew", ".spec/waivers/W-1.json", ".spec/policy.yaml"],
    ["spec_debt_repay", ".spec/spec-debt/ledger.yaml", ".spec/requirements/lifecycle.yaml"],
    ["release_compare", ".spec/releases/compare/v1-to-current/compare-report.json", ".spec/contracts/orders.yaml"],
    ["source_adopt", ".spec/deltas/change-1/source-review.yaml", ".spec/requirements/lifecycle.yaml"],
  ] as const) {
    appendAuditEvent(root, {
      type: event[0],
      actor: "stage-14-test",
      sourceArtifact: { kind: path.extname(event[1]).slice(1) || "artifact", path: event[1] },
      affectedContracts: [event[2]],
    });
  }
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
}

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const cliPath = path.join(repoRoot, "tools", "jispec", "cli.ts");
  const result = spawnSync(process.execPath, ["--import", "tsx", cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function recordAsync(name: string, fn: () => Promise<void>): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function printResults(results: TestResult[]): Promise<void> {
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

function normalize(value: string): string {
  return value.replace(/\\/g, "/");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
