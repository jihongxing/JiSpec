import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { renderVerifyJSON, runVerify } from "../verify/verify-runner";
import { FIXED_GENERATED_AT, cleanupVerifyFixture, createVerifyFixture, getRepoRoot } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== Verify JSON Contract Tests ===\n");

  let passed = 0;
  let failed = 0;
  const root = createVerifyFixture("verify-json-contract");

  try {
    const result = await runVerify({
      root,
      generatedAt: FIXED_GENERATED_AT,
    });
    const json = renderVerifyJSON(result);

    const expected = JSON.stringify(
      {
        root,
        verdict: "PASS",
        ok: true,
        exit_code: 0,
        issue_count: 0,
        blocking_issue_count: 0,
        advisory_issue_count: 0,
        non_blocking_error_count: 0,
        sources: ["legacy-validator"],
        generated_at: FIXED_GENERATED_AT,
        issues: [],
        metadata: {
          externalGraphAdvisoryOnly: true,
          externalGraphEvidenceCount: 0,
          externalGraphExecution: {
            commandExecuted: false,
            networkUsed: false,
            sourceUploaded: false,
          },
          externalGraphImportOnly: true,
          externalGraphImportPath: ".spec/integrations/external-graph.json",
          externalGraphImportStatus: "not_available_yet",
          externalGraphWarningCount: 0,
          factsContractVersion: "1.0",
          gateCoverage: {
            artifactFreshness: [
              {
                id: "ci_report",
                nextCommand: "npm run ci:verify",
                path: ".jispec-ci/verify-report.json",
                reason: ".jispec-ci/verify-report.json has not been produced yet.",
                status: "missing",
              },
              {
                id: "policy",
                nextCommand: "npm run jispec-cli -- policy migrate",
                path: ".spec/policy.yaml",
                reason: ".spec/policy.yaml has not been produced yet.",
                status: "missing",
              },
              {
                id: "baseline",
                nextCommand: "npm run jispec-cli -- verify --write-baseline",
                path: ".spec/baselines/verify-baseline.json",
                reason: ".spec/baselines/verify-baseline.json has not been produced yet.",
                status: "missing",
              },
              {
                id: "release_compare",
                nextCommand: "npm run jispec-cli -- release compare --from <from> --to <to>",
                path: ".spec/releases/compare/<from>-to-<to>/compare-report.json",
                reason: "No release compare report is available yet.",
                status: "missing",
              },
              {
                id: "impact_graph",
                nextCommand: "npm run jispec-cli -- verify",
                path: ".spec/deltas/<changeId>/impact-graph.json",
                reason: "Impact graph is only required for Greenfield Spec Delta projects; this project uses a non-Greenfield delivery model.",
                status: "not_applicable",
              },
            ],
            issueNextActions: [],
            phase: "north-star-score-optimization-phase-5",
            policyStableFactGuard: {
              blockingRuleCount: 0,
              factsContractVersion: "1.0",
              guardedRules: [],
              nextCommand: "npm run jispec-cli -- policy migrate",
              policyPath: ".spec/policy.yaml",
              status: "not_available_yet",
              unknownFactCount: 0,
              unstableBlockingRuleCount: 0,
            },
            stackCoverage: {
              detectedCount: 0,
              fixtures: [
                {
                  evidence: [],
                  id: "node_typescript",
                  status: "not_detected",
                },
                {
                  evidence: [],
                  id: "python",
                  status: "not_detected",
                },
                {
                  evidence: [],
                  id: "go_or_java",
                  status: "not_detected",
                },
              ],
              requiredClassCoverage: ["node_typescript", "python", "go_or_java"],
            },
            status: "ok",
            topNextCommand: "npm run jispec-cli -- verify",
          },
          gateGapLedger: {
            attention: 0,
            blocking: 0,
            informational: 5,
            new: 5,
            path: ".spec/gates/gap-ledger.json",
            persistent: 0,
            phase: "north-star-score-optimization-phase-7",
            resolved: 0,
            topNextCommand: "npm run jispec-cli -- verify --write-baseline",
            total: 5,
            unresolved: 5,
            unresolvedEntryIds: [
              "artifact:baseline",
              "artifact:ci_report",
              "artifact:policy",
              "artifact:release_compare",
              "policy:stable-fact-guard",
            ],
          },
          impactAdvisoryOnly: true,
          impactGraphFreshness: "not_available_yet",
          replay: {
            commands: {
              inspectSummary: "type .spec\\handoffs\\verify-summary.md",
              rerun: "npm run jispec-cli -- verify",
            },
            inputArtifacts: [],
            nextHumanAction: "Review verify summary and continue with merge or advisory follow-up.",
            previousOutcome: "PASS",
            replayable: true,
            source: "verify",
            sourceArtifact: ".spec/contracts",
            version: 1,
          },
        },
      },
      null,
      2,
    );

    assert.equal(json, expected);
    console.log("✓ Test 1: PASS JSON output matches the stable contract snapshot");
    passed++;

    const parsed = JSON.parse(json) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed), [
      "root",
      "verdict",
      "ok",
      "exit_code",
      "issue_count",
      "blocking_issue_count",
      "advisory_issue_count",
      "non_blocking_error_count",
      "sources",
      "generated_at",
      "issues",
      "metadata",
    ]);
    assert.equal((parsed.metadata as { replay?: { source?: string } }).replay?.source, "verify");
    console.log("✓ Test 2: top-level JSON keys stay in the expected order");
    passed++;

    const repoRoot = getRepoRoot();
    const cli = spawnSync(
      process.execPath,
      ["--import", "tsx", path.join(repoRoot, "tools", "jispec", "cli.ts"), "verify", "--root", root, "--json"],
      {
        cwd: repoRoot,
        encoding: "utf-8",
      },
    );
    assert.equal(cli.status, 0);
    const cliPayload = JSON.parse(cli.stdout) as Record<string, unknown>;
    assert.equal(cliPayload.verdict, "PASS");
    const summaryPath = path.join(root, ".spec", "handoffs", "verify-summary.md");
    assert.ok(fs.existsSync(summaryPath));
    const summary = fs.readFileSync(summaryPath, "utf-8");
    assert.ok(summary.includes("# JiSpec Verify Summary"));
    assert.ok(summary.includes("Merge status: Ready to merge."));
    assert.ok(summary.includes("Machine-readable verify report remains the source of truth."));
    console.log("✓ Test 3: CLI verify --json keeps stdout machine-readable while writing the local verify summary");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(root);
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
