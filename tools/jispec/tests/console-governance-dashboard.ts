import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { appendAuditEvent } from "../audit/event-ledger";
import {
  buildConsoleGovernanceDashboard,
  renderConsoleGovernanceDashboardText,
} from "../console/governance-dashboard";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Console Governance Dashboard Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("dashboard first screen is local governance status with missing artifacts as unknown", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-dashboard-missing-"));
    try {
      const dashboard = buildConsoleGovernanceDashboard(root);
      assert.equal(dashboard.boundary.readOnly, true);
      assert.equal(dashboard.boundary.sourceUploadRequired, false);
      assert.equal(dashboard.boundary.overridesVerify, false);
      assert.equal(dashboard.boundary.scansSourceCode, false);
      assert.equal(dashboard.boundary.firstScreen, "governance_status");
      assert.equal(dashboard.questions[0]?.id, "mergeability");
      assert.equal(dashboard.questions[0]?.status, "unknown");
      assert.equal(question(dashboard, "retakeover_pool_health").status, "unknown");
      assert.equal(question(dashboard, "global_closure_acceptance").status, "unknown");
      assert.equal(dashboard.headline.status, "unknown");
      assert.equal(dashboard.headline.mergeability.status, "unknown");
      assert.equal(dashboard.headline.risk.level, "unknown");
      assert.equal(dashboard.headline.ownerAction.owner, "repo owner");
      assert.equal(dashboard.headline.ownerAction.command, "npm run ci:verify");
      assert.match(dashboard.headline.evidence.primary, /\.jispec-ci\/verify-report\.json/);
      assert.ok(!renderConsoleGovernanceDashboardText(dashboard).includes("Artifact browser"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("dashboard answers mergeability and release drift from declared artifacts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-dashboard-blocked-"));
    try {
      writeJson(root, ".jispec-ci/verify-report.json", {
        verdict: "FAIL_BLOCKING",
        issueCount: 2,
        blockingIssueCount: 1,
        modes: {},
      });
      writeJson(root, ".spec/releases/compare/v1-to-current/compare-report.json", {
        driftSummary: {
          overallStatus: "changed",
        },
      });

      const dashboard = buildConsoleGovernanceDashboard(root);
      const mergeability = question(dashboard, "mergeability");
      const drift = question(dashboard, "contract_drift_review");
      assert.equal(dashboard.headline.status, "blocked");
      assert.equal(dashboard.headline.risk.level, "high");
      assert.match(dashboard.headline.ownerAction.command, /ci:verify/);
      assert.match(dashboard.headline.evidence.primary, /verify-report\.json/);
      assert.equal(mergeability.status, "blocked");
      assert.match(mergeability.answer, /FAIL_BLOCKING/);
      assert.equal(drift.status, "blocked");
      assert.match(drift.answer, /changed/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("dashboard surfaces waiver, spec debt, execute mediation, and audit governance attention", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-dashboard-governance-"));
    try {
      const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      writeJson(root, ".jispec-ci/verify-report.json", {
        verdict: "WARN_ADVISORY",
        issueCount: 3,
        blockingIssueCount: 0,
        modes: {
          unmatchedActiveWaiverIds: ["waiver-stale"],
        },
      });
      writeYaml(root, ".spec/policy.yaml", {
        version: 1,
        team: {
          profile: "small_team",
          owner: "platform",
          reviewers: ["reviewer"],
          required_reviewers: 1,
        },
        rules: [],
      });
      writeJson(root, ".spec/waivers/waiver-soon.json", {
        id: "waiver-soon",
        status: "active",
        owner: "contracts-team",
        reason: "Temporary exception",
        issueCode: "API_CONTRACT_INVALID_JSON",
        createdAt: "2026-05-01T00:00:00.000Z",
        expiresAt: soon,
      });
      writeYaml(root, ".spec/spec-debt/ledger.yaml", {
        version: 1,
        debts: [
          {
            id: "debt-open",
            kind: "waiver",
            status: "open",
            owner: "domain-owner",
            reason: "Thin behavior evidence",
            created_at: "2026-05-01T00:00:00.000Z",
            affected_assets: [".spec/contracts/behaviors.feature"],
            affected_contracts: ["CTR-BEHAVIOR-001"],
            repayment_hint: "Confirm behavior before release.",
          },
        ],
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
      appendAuditEvent(root, {
        type: "waiver_create",
        timestamp: "2026-05-01T00:00:00.000Z",
        actor: "reviewer",
        reason: "Approve temporary exception.",
        sourceArtifact: { kind: "verify-waiver", path: ".spec/waivers/waiver-soon.json" },
        affectedContracts: ["issue:API_CONTRACT_INVALID_JSON"],
      });
      writeJson(root, ".spec/handoffs/retakeover-pool-metrics.json", {
        fixtureCount: 2,
        coverage: {
          fixtureCatalog: [
            {
              fixtureId: "legacy-service-like",
              fixtureClass: "high-noise-protocol-repo",
              featureRecommendation: "accept_candidate",
              verifySafety: "non_blocking",
              ownerReviewRequired: true,
              artifactDecisionPaths: ["edited:domain"],
              coverageSignals: ["class:high-noise-protocol-repo", "path:owner_review"],
              topEvidenceSample: ["docs/governance/README.md"],
              baselineProfile: {
                takeoverReadinessScore: 74,
                contractSignalPrecision: 0.71,
                behaviorEvidenceStrength: 0.63,
                overclaimBlockRate: 0.92,
              },
            },
          ],
          classCoverage: {
            knownFixtureClassCount: 10,
            coveredFixtureClassCount: 2,
            coverageRate: 0.2,
            classCounts: {
              "high-noise-protocol-repo": 1,
              "multilingual-finance-service-repo": 1,
            },
            missingFixtureClasses: ["synthetic-contract-drift"],
          },
          qualityBaseline: {
            thresholds: {
              minimumTakeoverReadinessScore: 55,
              minimumContractSignalPrecision: 0.45,
              minimumBehaviorEvidenceStrength: 0.45,
            },
            readinessScore: {
              threshold: 55,
              lowestObserved: 52,
              averageObserved: 63,
              fixturesBelowThreshold: ["legacy-service-like"],
            },
            contractSignalPrecision: {
              threshold: 0.45,
              lowestObserved: 0.44,
              averageObserved: 0.58,
              fixturesBelowThreshold: ["legacy-service-like"],
            },
            behaviorEvidenceStrength: {
              threshold: 0.45,
              lowestObserved: 0.4,
              averageObserved: 0.55,
              fixturesBelowThreshold: ["legacy-service-like"],
            },
            verifyNonBlockingRate: 1,
            ownerReviewFixtureRate: 1,
          },
          realismLadder: {
            phase: "north-star-score-optimization-phase-6",
            ready: true,
            targetRealismClassCount: 5,
            coveredRealismClassCount: 5,
            missingRealismClasses: [],
            blockers: [],
          },
        },
      });
      writeJson(root, ".spec/north-star/acceptance.json", {
        schemaVersion: 1,
        kind: "jispec-north-star-acceptance",
        generatedAt: "2026-05-06T00:00:00.000Z",
        root,
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
        summary: {
          ready: true,
          scenarioCount: 15,
          passedScenarioCount: 15,
          blockingScenarioCount: 0,
        },
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

      const dashboard = buildConsoleGovernanceDashboard(root);
      assert.equal(question(dashboard, "mergeability").status, "attention");
      assert.equal(question(dashboard, "waiver_attention").status, "attention");
      assert.match(question(dashboard, "waiver_attention").answer, /expiring soon/);
      assert.equal(question(dashboard, "spec_debt_attention").status, "attention");
      assert.equal(question(dashboard, "retakeover_pool_health").status, "ok");
      assert.match(question(dashboard, "retakeover_pool_health").answer, /non-blocking/);
      assert.match(question(dashboard, "retakeover_pool_health").answer, /realism ladder is ready/);
      assert.match(question(dashboard, "retakeover_pool_health").answer, /20%/);
      assert.ok(question(dashboard, "retakeover_pool_health").evidence.some((entry) => entry.includes("Realism ladder: 5/5")));
      assert.ok(question(dashboard, "retakeover_pool_health").evidence.some((entry) => entry.includes("synthetic-contract-drift")));
      assert.equal(question(dashboard, "handoff_replay_status").status, "attention");
      assert.match(question(dashboard, "handoff_replay_status").answer, /external tool handoff/);
      assert.ok(question(dashboard, "handoff_replay_status").evidence.some((entry) => entry.includes("patch-mediation.md")));
      assert.ok(question(dashboard, "handoff_replay_status").evidence.some((entry) => entry.includes("Patch review companion")));
      assert.ok(question(dashboard, "handoff_replay_status").nextActions.some((entry) => entry.includes("handoff adapter")));
      assert.match(question(dashboard, "execute_mediation_status").answer, /post_verify/);
      assert.equal(question(dashboard, "audit_traceability").status, "ok");
      assert.match(question(dashboard, "audit_traceability").answer, /reviewer/);
      assert.equal(question(dashboard, "global_closure_acceptance").status, "ok");
      assert.match(question(dashboard, "global_closure_acceptance").answer, /15\/15/);
      assert.equal(question(dashboard, "doctor_global_readiness").status, "ok");
      assert.match(question(dashboard, "doctor_global_readiness").answer, /8\/8/);
      assert.equal(dashboard.headline.risk.level, "medium");
      assert.equal(dashboard.headline.ownerAction.owner, "contracts-team");
      assert.match(dashboard.headline.ownerAction.command, /waiver renew waiver-soon/);
      assert.ok(dashboard.headline.evidence.sources.some((source) => source.includes(".spec/waivers") || source.includes("waiver")));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("dashboard treats stale execute mediation as historical instead of attention", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-dashboard-stale-mediation-"));
    try {
      const staleCreatedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      writeJson(root, ".jispec-ci/verify-report.json", {
        verdict: "PASS",
        issueCount: 0,
        blockingIssueCount: 0,
        modes: {},
      });
      writeJson(root, ".jispec/handoff/change-stale.json", {
        outcome: "external_patch_received",
        createdAt: staleCreatedAt,
        decisionPacket: {
          stopPoint: "patch_apply",
        },
        replay: {
          replayable: true,
        },
      });
      writeJson(root, ".jispec/implement/change-stale/patch-mediation.json", {
        sessionId: "change-stale",
        currentTool: "codex",
        createdAt: staleCreatedAt,
        state: "needs_patch_rework",
        stopPoint: "patch_apply",
      });

      const dashboard = buildConsoleGovernanceDashboard(root);
      const mediation = question(dashboard, "execute_mediation_status");
      assert.equal(mediation.status, "ok");
      assert.match(mediation.answer, /historical/);
      assert.ok(mediation.evidence.some((entry) => entry.includes("Latest packet age")));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("dashboard ignores revoked waivers when computing expiring-soon attention", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-dashboard-revoked-waiver-"));
    try {
      const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      writeJson(root, ".jispec-ci/verify-report.json", {
        verdict: "PASS",
        issueCount: 0,
        blockingIssueCount: 0,
        modes: {},
      });
      writeJson(root, ".spec/waivers/waiver-revoked.json", {
        id: "waiver-revoked",
        status: "revoked",
        owner: "contracts-team",
        reason: "Temporary exception",
        issueCode: "API_CONTRACT_INVALID_JSON",
        createdAt: "2026-05-01T00:00:00.000Z",
        expiresAt: soon,
        revokedAt: "2026-05-02T00:00:00.000Z",
      });

      const dashboard = buildConsoleGovernanceDashboard(root);
      assert.equal(question(dashboard, "waiver_attention").status, "ok");
      assert.doesNotMatch(question(dashboard, "waiver_attention").answer, /expiring soon/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("dashboard treats changed release drift as reviewed once approval is satisfied", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-dashboard-release-approval-"));
    try {
      const compareReport = {
        driftSummary: {
          overallStatus: "changed",
        },
      };
      const policy = {
        version: 1,
        team: {
          profile: "small_team",
          owner: "platform",
          reviewers: ["reviewer"],
          required_reviewers: 1,
        },
        rules: [],
      };
      const policyText = yaml.dump(policy, { lineWidth: 100, noRefs: true, sortKeys: false });
      writeJson(root, ".jispec-ci/verify-report.json", {
        verdict: "PASS",
        issueCount: 0,
        blockingIssueCount: 0,
        modes: {},
      });
      writeText(root, ".spec/policy.yaml", policyText);
      writeJson(root, ".spec/releases/compare/v1-to-current/compare-report.json", compareReport);
      writeJson(root, ".spec/approvals/approval-policy.json", {
        version: 1,
        id: "approval-policy",
        status: "approved",
        subject: {
          kind: "policy_change",
          ref: ".spec/policy.yaml",
          hash: sha256(policyText),
        },
        requirement: {
          profile: "small_team",
          owner: "platform",
          reviewers: ["reviewer"],
          requiredReviewers: 1,
          ownerApprovalAllowed: true,
          contract: "reviewer_quorum_or_owner_approval",
        },
        decision: {
          actor: "reviewer",
          role: "reviewer",
          reason: "Reviewed current policy state.",
          decidedAt: "2026-05-06T00:00:00.000Z",
        },
        boundary: {
          localOnly: true,
          sourceUploadRequired: false,
          llmBlockingJudge: false,
          consoleOverridesVerify: false,
        },
      });
      writeJson(root, ".spec/approvals/approval-release.json", {
        version: 1,
        id: "approval-release",
        status: "approved",
        subject: {
          kind: "release_drift",
          ref: ".spec/releases/compare/v1-to-current/compare-report.json",
          hash: sha256(`${JSON.stringify(compareReport, null, 2)}\n`),
        },
        requirement: {
          profile: "small_team",
          owner: "platform",
          reviewers: ["reviewer"],
          requiredReviewers: 1,
          ownerApprovalAllowed: true,
          contract: "reviewer_quorum_or_owner_approval",
        },
        decision: {
          actor: "reviewer",
          role: "reviewer",
          reason: "Reviewed current release drift.",
          decidedAt: "2026-05-06T00:00:00.000Z",
        },
        boundary: {
          localOnly: true,
          sourceUploadRequired: false,
          llmBlockingJudge: false,
          consoleOverridesVerify: false,
        },
      });

      const dashboard = buildConsoleGovernanceDashboard(root);
      const drift = question(dashboard, "contract_drift_review");
      assert.equal(drift.status, "ok");
      assert.match(drift.answer, /approval is satisfied/);
      assert.ok(drift.evidence.some((entry) => entry.includes("Approval status: approval_satisfied")));
      assert.equal(dashboard.headline.status, "unknown");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("CLI exposes console dashboard as text and JSON", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-dashboard-cli-"));
    try {
      writeJson(root, ".jispec-ci/verify-report.json", {
        verdict: "PASS",
        issueCount: 0,
        blockingIssueCount: 0,
        modes: {},
      });
      const text = runCli(["console", "dashboard", "--root", root]);
      assert.equal(text.status, 0, text.stderr);
      assert.match(text.stdout, /JiSpec Governance Console/);
      assert.match(text.stdout, /Can this repo merge right now/);
      assert.match(text.stdout, /Mergeability:/);
      assert.match(text.stdout, /Risk:/);
      assert.match(text.stdout, /Owner action:/);
      assert.match(text.stdout, /Evidence source:/);
      assert.match(text.stdout, /Is the retakeover regression pool healthy/);
      assert.doesNotMatch(text.stdout, /marketing/i);
      assert.doesNotMatch(text.stdout, /file browser/i);

      const json = runCli(["console", "dashboard", "--root", root, "--json"]);
      assert.equal(json.status, 0, json.stderr);
      const payload = JSON.parse(json.stdout) as ReturnType<typeof buildConsoleGovernanceDashboard>;
      assert.equal(payload.boundary.firstScreen, "governance_status");
      assert.equal(payload.questions[0]?.id, "mergeability");
      assert.equal(payload.headline.mergeability.status, "ok");
      assert.ok(payload.headline.ownerAction.command);
      assert.ok(payload.headline.evidence.primary);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
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

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function question(dashboard: ReturnType<typeof buildConsoleGovernanceDashboard>, id: string) {
  const entry = dashboard.questions.find((item) => item.id === id);
  assert.ok(entry, `Missing question ${id}`);
  return entry;
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

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
