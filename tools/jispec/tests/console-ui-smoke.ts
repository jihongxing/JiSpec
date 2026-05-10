import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as yaml from "js-yaml";
import {
  buildLocalConsoleUiModel,
  renderLocalConsoleUiHtml,
  writeLocalConsoleUi,
} from "../console/ui/static-dashboard";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== Console UI Smoke Tests ===\n");

  const results: TestResult[] = [];

  runCase(results, "local UI model is read-only and first screen is governance status", () => {
    withFixture((root) => {
      writeGovernanceFixture(root);
      const model = buildLocalConsoleUiModel({ root });

      assert.equal(model.boundary.readOnly, true);
      assert.equal(model.boundary.offlineCapable, true);
      assert.equal(model.boundary.sourceUploadRequired, false);
      assert.equal(model.boundary.overridesVerify, false);
      assert.equal(model.boundary.scansSourceCode, false);
      assert.equal(model.boundary.executesCommands, false);
      assert.equal(model.boundary.firstScreen, "governance_status");
      assert.equal(model.dashboard.boundary.firstScreen, "governance_status");
      assert.equal(model.dashboard.questions[0]?.id, "mergeability");
    });
  });

  runCase(results, "HTML renders governance objects, questions, actions, and boundary without source upload claims", () => {
    withFixture((root) => {
      writeGovernanceFixture(root);
      const html = renderLocalConsoleUiHtml(buildLocalConsoleUiModel({ root }));

      assert.match(html, /JiSpec Console/);
      assert.match(html, /Governance Questions/);
      assert.match(html, /Can this repo merge right now/);
      assert.match(html, /Mergeability/);
      assert.match(html, /Owner action/);
      assert.match(html, /Evidence source/);
      assert.match(html, /Policy posture/i);
      assert.match(html, /Waiver lifecycle/i);
      assert.match(html, /Spec debt ledger/i);
      assert.match(html, /Source evolution governance/i);
      assert.match(html, /Contract drift/i);
      assert.match(html, /Release baseline/i);
      assert.match(html, /Verify trend/i);
      assert.match(html, /Takeover quality trend/i);
      assert.match(html, /Is the retakeover regression pool healthy/);
      assert.match(html, /Missing Fixture Classes/);
      assert.match(html, /Quality Baseline/);
      assert.match(html, /Fixture Drill-Down/);
      assert.match(html, /class="pill blocked">blocked 1<\/span>/);
      assert.match(html, /class="pill attention">attention 0<\/span>/);
      assert.match(html, /class="pill ok">ok 1<\/span>/);
      assert.match(html, /Takeover readiness/);
      assert.match(html, /Contract precision/);
      assert.match(html, /Behavior strength/);
      assert.match(html, /Broader closure/);
      assert.match(html, /doctor_global_readiness/);
      assert.match(html, /orders-like/);
      assert.match(html, /steady-api/);
      assert.match(html, /class:frontend-backend-mixed-repo/);
      assert.match(html, /docs\/product\/member-journeys\.md/);
      assert.match(html, /synthetic-contract-drift/);
      const attentionIndex = html.indexOf("orders-like");
      const healthyIndex = html.indexOf("steady-api");
      assert.notEqual(attentionIndex, -1);
      assert.notEqual(healthyIndex, -1);
      assert.ok(attentionIndex < healthyIndex, "fixtures with baseline misses should render before healthy fixtures");
      assert.match(html, /Implementation mediation outcomes/i);
      assert.match(html, /How do I hand off or replay this change\?/i);
      assert.match(html, /Replay Chain/);
      assert.match(html, /handoff adapter/);
      assert.match(html, /implement --from-handoff/);
      assert.match(html, /Change Workspace/);
      assert.match(html, /Current change session/);
      assert.match(html, /Active Change/);
      assert.match(html, /Session Mode/);
      assert.match(html, /Lane/);
      assert.match(html, /Changed Paths/);
      assert.match(html, /Next Commands/);
      assert.match(html, /Mediation Status/);
      assert.match(html, /Replay Chain/);
      assert.match(html, /data-copy-command/);
      assert.match(html, /workspace-actions/);
      assert.match(html, /Patch Review Companion/);
      assert.match(html, /patch-mediation\.md/);
      assert.match(html, /Patch mediation companion for session change-1/);
      assert.match(html, /Audit events/i);
      assert.match(html, /Suggested Local Commands/);
      assert.match(html, /The UI does not execute commands/);
      assert.match(html, /Owner/);
      assert.match(html, /Risk/);
      assert.match(html, /Affected/);
      assert.match(html, /Source/);
      assert.match(html, /Copy/);
      assert.match(html, /actionDecisionPackets/);
      assert.match(html, /domain-owner/);
      assert.match(html, /spec-debt owner-review debt-1/);
      assert.match(html, /Source upload[\s\S]*no/);
      assert.doesNotMatch(html, /marketing/i);
      assert.doesNotMatch(html, /file browser/i);
    });
  });

  runCase(results, "writer creates a static HTML artifact under .spec console UI", () => {
    withFixture((root) => {
      writeGovernanceFixture(root);
      const result = writeLocalConsoleUi({ root });

      assert.equal(result.relativeOutPath, ".spec/console/ui/index.html");
      assert.ok(result.bytesWritten > 1000);
      assert.ok(fs.existsSync(path.join(root, ".spec", "console", "ui", "index.html")));
      const html = fs.readFileSync(path.join(root, result.relativeOutPath), "utf-8");
      assert.match(html, /application\/json/);
      assert.match(html, /"firstScreen":"governance_status"/);
      assert.match(html, /"actionDecisionPackets":/);
    });
  });

  runCase(results, "CLI writes UI and emits JSON summary without running verify", () => {
    withFixture((root) => {
      writeGovernanceFixture(root);
      const cli = runCli(["console", "ui", "--root", root, "--json"]);

      assert.equal(cli.status, 0, cli.stderr);
      const payload = JSON.parse(cli.stdout) as {
        relativeOutPath?: string;
        boundary?: { readOnly?: boolean; executesCommands?: boolean; overridesVerify?: boolean };
        headline?: {
          status?: string;
          mergeability?: { status?: string };
          ownerAction?: { owner?: string; command?: string };
          evidence?: { primary?: string };
        };
      };
      assert.equal(payload.relativeOutPath, ".spec/console/ui/index.html");
      assert.equal(payload.boundary?.readOnly, true);
      assert.equal(payload.boundary?.executesCommands, false);
      assert.equal(payload.boundary?.overridesVerify, false);
      assert.ok(payload.headline?.status);
      assert.ok(payload.headline?.mergeability?.status);
      assert.ok(payload.headline?.ownerAction?.command);
      assert.ok(payload.headline?.evidence?.primary);
      assert.ok(fs.existsSync(path.join(root, ".spec", "console", "ui", "index.html")));
    });
  });

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

function runCase(results: TestResult[], name: string, run: () => void): void {
  try {
    run();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function withFixture(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-ui-"));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeGovernanceFixture(root: string): void {
  writeJson(root, ".jispec-ci/verify-report.json", {
    verdict: "WARN_ADVISORY",
    issueCount: 1,
    blockingIssueCount: 0,
    advisoryIssueCount: 1,
    counts: {
      total: 1,
      blocking: 0,
      advisory: 1,
    },
    modes: {},
  });
  writeYaml(root, ".spec/policy.yaml", {
    version: 1,
    requires: { facts_contract: "1.0" },
    team: { profile: "small_team", owner: "platform", reviewers: ["reviewer"] },
    rules: [],
  });
  writeJson(root, ".spec/waivers/waiver-1.json", {
    id: "waiver-1",
    status: "active",
    owner: "platform",
    reason: "temporary advisory",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  writeYaml(root, ".spec/spec-debt/ledger.yaml", {
    version: 1,
    debts: [
      {
        id: "debt-1",
        status: "open",
        owner: "domain-owner",
        reason: "review behavior wording",
      },
    ],
  });
  writeYaml(root, ".spec/baselines/current.yaml", {
    version: 1,
    source_evolution: {
      last_adopted_change_id: "chg-0",
    },
    requirement_lifecycle: {
      path: ".spec/requirements/lifecycle.yaml",
      last_adopted_change_id: "chg-0",
    },
  });
  writeYaml(root, ".spec/requirements/lifecycle.yaml", {
    version: 1,
    registry_version: 2,
    generated_at: "2026-05-01T00:00:00.000Z",
    last_adopted_change_id: "chg-0",
    requirements: [
      {
        id: "REQ-ORDER-001",
        status: "active",
        supersedes: [],
        replaced_by: [],
        merged_from: [],
      },
    ],
  });
  writeYaml(root, ".spec/baselines/releases/v1.yaml", {
    version: "v1",
  });
  writeJson(root, ".spec/releases/compare/v1-to-current/compare-report.json", {
    driftSummary: {
      overallStatus: "unchanged",
    },
  });
  writeJson(root, ".spec/releases/drift-trend.json", {
    compareCount: 1,
    changedCompareCount: 0,
    unchangedCompareCount: 1,
    latest: {
      reportPath: ".spec/releases/compare/v1-to-current/compare-report.json",
      overallStatus: "unchanged",
      contractGraphStatus: "unchanged",
      staticCollectorStatus: "unchanged",
      policyStatus: "unchanged",
    },
  });
  writeJson(root, ".spec/handoffs/retakeover-metrics.json", {
    qualityScorecard: {
      score: 0.82,
    },
  });
  writeJson(root, ".spec/handoffs/retakeover-pool-metrics.json", {
    fixtureCount: 2,
    coverage: {
      fixtureCatalog: [
        {
          fixtureId: "orders-like",
          fixtureClass: "frontend-backend-mixed-repo",
          featureRecommendation: "accept_candidate",
          verifySafety: "non_blocking",
          ownerReviewRequired: true,
          artifactDecisionPaths: ["edited:domain"],
          coverageSignals: ["class:frontend-backend-mixed-repo", "path:owner_review"],
          topEvidenceSample: ["docs/product/member-journeys.md"],
          baselineProfile: {
            takeoverReadinessScore: 64,
            contractSignalPrecision: 0.58,
            behaviorEvidenceStrength: 0.52,
            overclaimBlockRate: 0.91,
          },
        },
        {
          fixtureId: "steady-api",
          fixtureClass: "service-api-repo",
          featureRecommendation: "accept_candidate",
          verifySafety: "non_blocking",
          ownerReviewRequired: false,
          artifactDecisionPaths: ["edited:api"],
          coverageSignals: ["class:service-api-repo", "path:verify_safe"],
          topEvidenceSample: ["openapi/service.yaml"],
          baselineProfile: {
            takeoverReadinessScore: 78,
            contractSignalPrecision: 0.73,
            behaviorEvidenceStrength: 0.69,
            overclaimBlockRate: 0.95,
          },
        },
      ],
      classCoverage: {
        knownFixtureClassCount: 10,
        coveredFixtureClassCount: 2,
        coverageRate: 0.2,
        classCounts: {
          "frontend-backend-mixed-repo": 1,
          "historical-debt-service-repo": 1,
        },
        missingFixtureClasses: ["synthetic-contract-drift"],
      },
      qualityBaseline: {
        readinessScore: {
          threshold: 55,
          lowestObserved: 52,
          averageObserved: 61,
          fixturesBelowThreshold: ["orders-like"],
        },
        contractSignalPrecision: {
          threshold: 0.45,
          lowestObserved: 0.44,
          averageObserved: 0.57,
          fixturesBelowThreshold: ["orders-like"],
        },
        behaviorEvidenceStrength: {
          threshold: 0.45,
          lowestObserved: 0.4,
          averageObserved: 0.5,
          fixturesBelowThreshold: ["orders-like"],
        },
        verifyNonBlockingRate: 1,
        ownerReviewFixtureRate: 1,
      },
    },
  });
  writeJson(root, ".jispec/handoff/change-1.json", {
    sessionId: "change-1",
    changeIntent: "Repair implementation replay flow",
    outcome: "verify_blocked",
    decisionPacket: {
      stopPoint: "post_verify",
      nextActionDetail: {
        externalToolHandoff: {
          required: true,
          request: "Use the focused handoff to repair the replay chain and return a patch through JiSpec.",
          allowedPaths: ["src/domain/order.ts"],
          filesNeedingAttention: ["src/domain/order.ts"],
          testCommand: "npm run test",
          verifyCommand: "npm run verify",
        },
      },
    },
    replay: {
      replayable: true,
      commands: {
        restore: "npm run jispec-cli -- implement --from-handoff .jispec/handoff/change-1.json",
        retryWithExternalPatch: "npm run jispec-cli -- implement --from-handoff .jispec/handoff/change-1.json --external-patch <path>",
        rerunVerify: "npm run verify",
      },
    },
  });
  writeJson(root, ".jispec/change-session.json", {
    id: "change-1",
    summary: "Repair implementation replay flow",
    orchestrationMode: "execute",
    laneDecision: {
      lane: "strict",
      requestedLane: "strict",
      autoPromoted: false,
      reasons: ["change touches implementation code"],
    },
    changedPaths: [
      {
        path: "src/domain/order.ts",
        kind: "source",
      },
    ],
    nextCommands: [
      {
        command: "npm run jispec-cli -- handoff adapter --from-handoff .jispec/handoff/change-1.json --tool codex",
        description: "Generate the external tool request.",
      },
      {
        command: "npm run jispec-cli -- implement --from-handoff .jispec/handoff/change-1.json --external-patch <path>",
        description: "Return the external patch through JiSpec.",
      },
    ],
  });
  writeJson(root, ".jispec/implement/change-1/patch-mediation.json", {
    version: 1,
    sessionId: "change-1",
    createdAt: "2026-05-01T00:00:00.000Z",
    completedAt: "2026-05-01T00:00:05.000Z",
    externalPatchPath: ".jispec/patches/change-1.patch",
    status: "accepted",
    touchedPaths: ["src/domain/order.ts"],
    allowedPaths: ["src/domain/order.ts"],
    violations: [],
    applied: true,
    replay: {
      version: 1,
      replayable: true,
      source: "patch_mediation",
      sourceSession: "change-1",
      sourceArtifact: ".jispec/implement/change-1/patch-mediation.json",
      inputArtifacts: [".jispec/patches/change-1.patch", "src/domain/order.ts"],
      commands: {
        retryWithExternalPatch: "npm run jispec-cli -- implement --from-handoff .jispec/handoff/change-1.json --external-patch <path>",
        inspectHandoff: "npm run jispec-cli -- handoff adapter --from-handoff .jispec/handoff/change-1.json --tool codex",
      },
      previousOutcome: "accepted",
      nextHumanAction: "The patch is accepted into the workspace; review the companion summary, then run the mediated test and verify commands before merge.",
    },
  });
  writeText(root, ".jispec/implement/change-1/patch-mediation.md", [
    "## 判断对象",
    "- Patch mediation companion for session change-1",
    "- Truth sources:",
    "  - .jispec/implement/change-1/patch-mediation.json",
    "",
    "## 最强证据",
    "- Status: accepted",
    "- Applied: yes",
    "",
    "## 推断证据",
    "- Replay outcome: verify_blocked",
    "",
    "## 冲突/drift",
    "- none",
    "",
    "## 影响契约/测试",
    "- Touched paths: src/domain/order.ts",
    "",
    "## 下一步",
    "- Review the patch mediation companion before merge.",
  ].join("\n"));
  writeJson(root, ".spec/doctor/global-readiness.json", {
    profile: "global",
    ready: true,
    totalChecks: 8,
    passedChecks: 8,
    failedChecks: 0,
    readinessSummary: {
      profile: "global",
      ready: true,
      blockerCount: 0,
      blockers: [],
    },
    checks: [],
  });
  writeText(root, ".spec/audit/events.jsonl", `${JSON.stringify({
    version: 1,
    id: "audit-1",
    type: "policy_migrate",
    timestamp: "2026-05-01T00:00:00.000Z",
    actor: "platform",
    reason: "Initialize policy.",
    sourceArtifact: { kind: "policy", path: ".spec/policy.yaml" },
    affectedContracts: [],
  })}\n`);
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeYaml(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, yaml.dump(value, { lineWidth: 100, noRefs: true, sortKeys: false }));
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

main();
