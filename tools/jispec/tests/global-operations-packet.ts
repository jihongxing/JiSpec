import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendAuditEvent } from "../audit/event-ledger";
import {
  buildGlobalOperationsPacket,
  writeGlobalOperationsPacket,
} from "../operations/global-operations-packet";
import { collectConsoleLocalSnapshot } from "../console/read-model-snapshot";
import { buildNorthStarAcceptance } from "../north-star/acceptance";
import { TEST_SUITES } from "./regression-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Global Operations Packet Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("builder emits ready local-first operations packet from closure artifacts", () => {
    withFixture("global-ops-ready-", (root) => {
      writeReadyGlobalOperationsFixture(root);

      const packet = buildGlobalOperationsPacket(root);
      assert.equal(packet.kind, "jispec-global-operations-packet");
      assert.equal(packet.status, "ready");
      assert.equal(packet.boundary.localOnly, true);
      assert.equal(packet.boundary.sourceUploadRequired, false);
      assert.equal(packet.boundary.realtimeCollaborationRequired, false);
      assert.equal(packet.boundary.executesCommands, false);
      assert.equal(packet.boundary.replacesVerify, false);
      assert.equal(packet.boundary.deferredSurfacesDiagnosticOnly, true);
      assert.equal(packet.repoGroupTopology.repoCount, 2);
      assert.equal(packet.crossRepoContractRefs.length, 1);
      assert.equal(packet.ownerActionLifecycle.length, 1);
      assert.equal(packet.promotionReadiness.ready, true);
      assert.equal(packet.privacyPosture.status, "available");
      assert.equal(packet.auditEvidenceRefs.length, 5);
      assert.equal(packet.asyncCollaborationEvents.filter((event) => event.status === "available").length, 5);
      assert.match(packet.verifyBoundaryStatement, /does not run verify/i);
      assert.deepEqual(packet.blockers, []);
    });
  }));

  results.push(record("builder blocks weak or missing operations inputs with explicit blocker codes", () => {
    withFixture("global-ops-blocked-", (root) => {
      writeJson(root, ".spec/privacy/privacy-report.json", {
        kind: "jispec-privacy-report",
        summary: { highSeverityFindingCount: 1 },
      });

      const packet = buildGlobalOperationsPacket(root);
      assert.equal(packet.status, "blocked");
      assert.ok(packet.blockers.includes("multi_repo_aggregate_missing"));
      assert.ok(packet.blockers.includes("promotion_readiness_incomplete"));
      assert.ok(packet.blockers.includes("privacy_high_severity_findings"));
      assert.ok(packet.blockers.includes("doctor_global_readiness_missing"));
      assert.ok(packet.blockers.includes("audit_evidence_missing"));
      assert.ok(packet.blockers.includes("async_collaboration_audit_events_incomplete"));
    });
  }));

  results.push(record("writer materializes JSON and Markdown companion without executing commands", () => {
    withFixture("global-ops-write-", (root) => {
      writeReadyGlobalOperationsFixture(root);
      const result = writeGlobalOperationsPacket(root);

      assert.equal(result.packetPath, ".spec/operations/global-operations-packet.json");
      assert.equal(result.summaryPath, ".spec/operations/global-operations-packet.md");
      assert.equal(fs.existsSync(path.join(root, result.packetPath)), true);
      assert.equal(fs.existsSync(path.join(root, result.summaryPath)), true);
      const saved = JSON.parse(fs.readFileSync(path.join(root, result.packetPath), "utf-8")) as { status?: string; boundary?: { executesCommands?: boolean } };
      const markdown = fs.readFileSync(path.join(root, result.summaryPath), "utf-8");
      assert.equal(saved.status, "ready");
      assert.equal(saved.boundary?.executesCommands, false);
      assert.match(markdown, /Deferred collaboration surfaces remain diagnostic-only/);
    });
  }));

  results.push(record("doctor global exposes operations readiness and CLI writes packet after report", () => {
    const root = createRepoBackedFixture("jispec-global-ops-doctor-");
    try {
      writeReadyGlobalOperationsFixture(root);

      const cli = runCli(["doctor", "global", "--root", root, "--write-operations", "--json"]);
      assert.ok([0, 1].includes(cli.status ?? -1), `${cli.stderr}\n${cli.stdout}`);
      const payload = JSON.parse(cli.stdout) as {
        profile?: string;
        ready?: boolean;
        checks?: Array<{ name?: string; globalOperationsPacket?: { status?: string } }>;
        globalOperationsWrite?: { packetPath?: string; packet?: { status?: string; doctorGlobalReadiness?: { ready?: boolean } } };
      };
      assert.equal(payload.profile, "global");
      assert.equal(payload.globalOperationsWrite?.packetPath, ".spec/operations/global-operations-packet.json");
      assert.equal(payload.globalOperationsWrite?.packet?.status, "blocked");
      assert.equal(payload.globalOperationsWrite?.packet?.doctorGlobalReadiness?.ready, payload.ready);
      assert.equal(fs.existsSync(path.join(root, ".spec", "doctor", "global-readiness.json")), true);
      assert.equal(fs.existsSync(path.join(root, ".spec", "operations", "global-operations-packet.json")), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("Console and North Star acceptance reference operations packet boundary evidence", () => {
    withFixture("global-ops-console-", (root) => {
      writeReadyGlobalOperationsFixture(root);
      writeGlobalOperationsPacket(root);

      const snapshot = collectConsoleLocalSnapshot(root);
      const object = snapshot.governance.objects.find((candidate) => candidate.id === "global_operations_packet");
      assert.ok(object);
      assert.equal(object.status, "available");
      assert.equal(object.summary.status, "ready");
      assert.equal(object.summary.ownerActionCount, 1);
      assert.equal(object.summary.asyncCollaborationEvidenceAvailable, 5);
      assert.equal(object.summary.boundaryReplacesVerify, false);

      const acceptance = buildNorthStarAcceptance({ root, generatedAt: "2026-05-22T00:00:00.000Z" });
      const scenario = acceptance.scenarios.find((candidate) => candidate.id === "global_operations_packet");
      assert.ok(scenario);
      assert.equal(scenario.status, "passed");
      assert.equal(scenario.evidence?.globalOperationsPacketStatus, "ready");
      assert.equal(scenario.evidence?.globalOperationsDeferredSurfacesDiagnosticOnly, true);
      assert.equal(scenario.evidence?.globalOperationsRealtimeCollaborationRequired, false);
    });
  }));

  results.push(record("phase-10 suite is registered in runtime-extended matrix", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "global-operations-packet.ts");
    assert.ok(suite);
    assert.equal(suite.area, "runtime-extended");
    assert.equal(suite.expectedTests, 6);
    assert.equal(suite.task, "North-Star-Score-Phase-10");
  }));

  printResults(results);
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

function writeReadyGlobalOperationsFixture(root: string): void {
  writePackage(root);
  writeJson(root, ".spec/console/multi-repo-governance.json", readyAggregate(root));
  writeJson(root, ".spec/privacy/privacy-report.json", {
    kind: "jispec-privacy-report",
    summary: { highSeverityFindingCount: 0, findingCount: 0 },
  });
  writeJson(root, ".spec/doctor/global-readiness.json", {
    profile: "global",
    ready: true,
    readinessSummary: { profile: "global", ready: true, blockerCount: 0, blockers: [] },
    checks: [],
  });
  writeNorthStarSupportArtifacts(root);
  writeReadyAuditLedger(root);
  writeGlobalOperationsPacket(root, ".spec/operations/global-operations-packet.json", {
    doctorGlobalReport: {
      profile: "global",
      ready: true,
      readinessSummary: { profile: "global", ready: true, blockerCount: 0, blockers: [] },
      checks: [],
    },
  });
  writeJson(root, ".spec/north-star/acceptance.json", {
    schemaVersion: 1,
    kind: "jispec-north-star-acceptance",
    generatedAt: "2026-05-22T00:00:00.000Z",
    root: normalize(root),
    contract: {
      version: 1,
      scenarioSuite: "north-star-acceptance",
      sourcePlan: "docs/architecture/north-star-acceptance.md",
    },
    boundary: {
      localOnly: true,
      sourceUploadRequired: false,
      llmBlockingDecisionSource: false,
      deterministicLocalArtifactsOnly: true,
      replacesVerify: false,
      replacesDoctorV1: false,
      replacesDoctorRuntime: false,
      replacesDoctorPilot: false,
      replacesPostReleaseGate: false,
    },
    summary: { ready: true, scenarioCount: 18, passedScenarioCount: 18, blockingScenarioCount: 0 },
    proofClaims: {
      verifiable: true,
      auditable: true,
      blockable: true,
      replayable: true,
      localFirst: true,
      externalToolsControlled: true,
    },
    scenarios: [],
    blockers: [],
    requiredExternalGates: [],
  });
}

function writePackage(root: string): void {
  writeJson(root, "package.json", {
    scripts: {
      jispec: "jispec",
      "ci:verify": "jispec verify",
      "post-release:gate": "jispec post-release:gate",
    },
  });
}

function readyAggregate(root: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-aggregate",
    generatedAt: "2026-05-22T00:00:00.000Z",
    root: normalize(root),
    boundary: {
      localOnly: true,
      readOnlyAggregate: true,
      consumesExportedSnapshotsOnly: true,
      sourceUploadRequired: false,
      scansSourceCode: false,
      runsVerify: false,
      replacesCliGate: false,
      markdownIsMachineApi: false,
    },
    inputs: {
      snapshotPaths: [".spec/console/governance-snapshot.json"],
      directoryPaths: [],
      loadedSnapshots: 2,
      missingSnapshots: 0,
    },
    summary: {
      repoCount: 2,
      missingSnapshotCount: 0,
      contractDriftHintCount: 1,
      ownerActionCount: 1,
    },
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
        {
          id: "payments",
          role: "upstream",
          owner: "payments-team",
          snapshotStatus: "available",
          upstreamContractRefs: [],
          downstreamContractRefs: [".spec/contracts/orders.yaml"],
        },
        {
          id: "orders",
          role: "downstream",
          owner: "platform",
          snapshotStatus: "available",
          upstreamContractRefs: [".spec/contracts/orders.yaml"],
          downstreamContractRefs: [],
        },
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
        followupCommands: [{ command: "npm run ci:verify" }],
        affectedContracts: [".spec/contracts/orders.yaml"],
      },
    ],
    singleRepoGateReplacement: false,
  };
}

function writeNorthStarSupportArtifacts(root: string): void {
  writeJson(root, ".spec/handoffs/bootstrap-takeover.json", {
    status: "committed",
    adoptedArtifactPaths: [".spec/baselines/current.yaml"],
  });
  writeText(root, ".spec/greenfield/initialization-summary.md", "# Greenfield summary\n");
  writeJson(root, ".jispec/change-session.json", {
    id: "change-1",
    summary: "Refresh cross-repo contract",
    orchestrationMode: "execute",
    laneDecision: { lane: "strict", reasons: ["contract drift"], autoPromoted: false },
    changedPaths: [{ path: ".spec/contracts/orders.yaml", kind: "contract" }],
    nextCommands: [{ command: "npm run jispec-cli -- verify", description: "Verify the change." }],
  });
  writeJson(root, ".jispec/implement/change-1/patch-mediation.json", { externalPatchControlled: true });
  writeJson(root, ".spec/waivers/W-1.json", { id: "W-1", status: "active" });
  writeJson(root, ".jispec-ci/verify-report.json", { verdict: "PASS", ok: true });
  writeJson(root, ".spec/pilot/package.json", { kind: "jispec-pilot-product-package" });
  writeText(root, ".spec/baselines/current.yaml", [
    "version: 1",
    "source_snapshot:",
    "  active_snapshot_id: snapshot-ordering-v2",
    "  lifecycle_registry_path: .spec/requirements/lifecycle.yaml",
    "  lifecycle_registry_version: 2",
    "  last_adopted_change_id: change-1",
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
  writeText(root, ".spec/requirements/lifecycle.yaml", [
    "version: 1",
    "registry_version: 2",
    "active_snapshot_id: snapshot-ordering-v2",
    "last_adopted_change_id: change-1",
    "requirements: []",
  ].join("\n"));
  writeJson(root, ".spec/deltas/change-1/source-evolution.json", {
    version: 1,
    summary: { changed: true, total: 1, modified: 1 },
    items: [{ evolution_id: "modified:req-1", evolution_kind: "modified", severity: "blocking", anchor_id: "REQ-1" }],
  });
  writeText(root, ".spec/deltas/change-1/source-review.yaml", [
    "version: 1",
    "change_id: change-1",
    "source_evolution_path: .spec/deltas/change-1/source-evolution.json",
    "items:",
    "  - item_id: modified:req-1",
    "    evolution_id: modified:req-1",
    "    anchor_id: REQ-1",
    "    evolution_kind: modified",
    "    source_document: requirements",
    "    severity: blocking",
    "    status: adopted",
    "    summary: Requirement changed.",
    "    review_history:",
    "      - action: defer",
    "        actor: architect",
    "        reason: wait for sync",
    "        timestamp: 2026-05-21T00:00:00.000Z",
    "      - action: adopt",
    "        actor: architect",
    "        reason: repaid",
    "        timestamp: 2026-05-22T00:00:00.000Z",
  ].join("\n"));
  writeJson(root, ".spec/console/governance-snapshot.json", {
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-snapshot",
    exportedAt: "2026-05-22T00:00:00.000Z",
    repo: { id: "orders", name: "Orders", root: normalize(root) },
    boundary: {
      localOnly: true,
      readOnlySnapshot: true,
      sourceUploadRequired: false,
      scansSourceCode: false,
      runsVerify: false,
      replacesCliGate: false,
      markdownIsMachineApi: false,
    },
    contract: {
      snapshotContractVersion: 1,
      compatibleAggregateVersion: 1,
      missingSemantics: {
        unavailableValue: "not_available_yet",
        missingSnapshotReason: "snapshot_not_found",
      },
    },
    sourceSnapshot: { artifactSummary: { totalArtifacts: 4 }, governanceSummary: { totalObjects: 4 }, hash: "hash-orders" },
    aggregateHints: {
      verifyVerdict: "PASS",
      policyProfile: "small_team",
      policyOwner: "platform",
      activeWaivers: 0,
      openSpecDebt: 0,
      sourceEvolutionChangeId: "change-1",
      sourceEvolutionBlockingOpenItems: 0,
      sourceEvolutionRepresentativeArtifact: "REQ-1",
      lastAdoptedSourceChange: "change-1",
      releaseDriftStatus: "changed",
      releaseDriftTrendComparisons: 1,
    },
    governanceObjects: [],
  });
  writeJson(root, ".spec/releases/drift-trend.json", {
    latest: { reportPath: ".spec/releases/compare/v1-to-current/compare-report.json", overallStatus: "changed" },
    compareCount: 1,
  });
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
      actor: "stage-10-test",
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

function printResults(results: TestResult[]): void {
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
