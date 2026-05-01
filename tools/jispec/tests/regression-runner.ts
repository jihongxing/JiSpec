/**
 * Regression Test Runner
 *
 * Unified runner for the V1 and extended regression matrix.
 * Groups suites by product area so bootstrap takeover hardening can be
 * tracked separately from verify/CI, change/implement, and runtime surfaces.
 */

import * as path from 'path';
import { execSync } from 'child_process';

interface TestSuite {
  name: string;
  file: string;
  expectedTests: number;
  area: RegressionArea;
  task?: string;
}

type RegressionArea =
  | 'core-mainline'
  | 'bootstrap-takeover-hardening'
  | 'retakeover-regression-pool'
  | 'verify-ci-gates'
  | 'change-implement'
  | 'runtime-extended';

type TestSuiteInput = Omit<TestSuite, 'area'>;

function core(suite: TestSuiteInput): TestSuite {
  return { area: 'core-mainline', ...suite };
}

function bootstrap(suite: TestSuiteInput): TestSuite {
  return { area: 'bootstrap-takeover-hardening', ...suite };
}

function retakeover(suite: TestSuiteInput): TestSuite {
  return { area: 'retakeover-regression-pool', ...suite };
}

function gates(suite: TestSuiteInput): TestSuite {
  return { area: 'verify-ci-gates', ...suite };
}

function changeImplement(suite: TestSuiteInput): TestSuite {
  return { area: 'change-implement', ...suite };
}

function runtime(suite: TestSuiteInput): TestSuite {
  return { area: 'runtime-extended', ...suite };
}

const TEST_SUITES: TestSuite[] = [
  core({ name: 'Rollback Regression', file: 'rollback-regression.ts', expectedTests: 5 }),
  core({ name: 'Semantic Validation', file: 'semantic-validation-negative.ts', expectedTests: 5 }),
  core({ name: 'CLI Help Surface', file: 'cli-help-surface.ts', expectedTests: 3 }),
  core({ name: 'CLI Legacy Surface Hint', file: 'cli-legacy-surface-hint.ts', expectedTests: 2 }),
  core({ name: 'Greenfield Command Surface', file: 'greenfield-command-surface.ts', expectedTests: 3 }),
  core({ name: 'Greenfield Source Document Loader', file: 'greenfield-source-document-loader.ts', expectedTests: 5 }),
  core({ name: 'Greenfield Project Asset Writer', file: 'greenfield-project-asset-writer.ts', expectedTests: 5 }),
  core({ name: 'Greenfield Domain And Context Draft', file: 'greenfield-domain-context-draft.ts', expectedTests: 5 }),
  core({ name: 'Greenfield API Contract Draft', file: 'greenfield-api-contract-draft.ts', expectedTests: 6 }),
  core({ name: 'Greenfield Behavior Scenario Draft', file: 'greenfield-behavior-scenario-draft.ts', expectedTests: 5 }),
  core({ name: 'Greenfield Initial Slice Queue', file: 'greenfield-initial-slice-queue.ts', expectedTests: 5, task: 'P3-T1' }),
  core({ name: 'Greenfield Verify Policy And CI Gate', file: 'greenfield-verify-policy-ci-gate.ts', expectedTests: 6, task: 'P3-T2' }),
  core({ name: 'Greenfield Empty Directory Acceptance Demo', file: 'greenfield-empty-directory-acceptance-demo.ts', expectedTests: 6, task: 'P3-T1' }),
  core({ name: 'Greenfield Spec Delta Model', file: 'greenfield-spec-delta-model.ts', expectedTests: 6 }),
  core({ name: 'Greenfield Baseline Snapshot', file: 'greenfield-baseline-snapshot.ts', expectedTests: 9, task: 'P2-T5' }),
  core({ name: 'Greenfield Evidence Graph', file: 'greenfield-evidence-graph.ts', expectedTests: 6 }),
  core({ name: 'Greenfield Two-Way Ratchet Verify', file: 'greenfield-two-way-ratchet-verify.ts', expectedTests: 6 }),
  core({ name: 'Greenfield Blast Radius Tracking', file: 'greenfield-blast-radius-tracking.ts', expectedTests: 5 }),
  core({ name: 'Greenfield Spec Debt Ledger', file: 'greenfield-spec-debt-ledger.ts', expectedTests: 4 }),
  core({ name: 'Greenfield Deterministic Contract Graph', file: 'greenfield-deterministic-contract-graph.ts', expectedTests: 5 }),
  core({ name: 'Verify Runner Pass', file: 'verify-runner-pass.ts', expectedTests: 3 }),
  core({ name: 'Verify Runner Fail Blocking', file: 'verify-runner-fail-blocking.ts', expectedTests: 3 }),
  core({ name: 'Verify Runner Warn Advisory', file: 'verify-runner-warn-advisory.ts', expectedTests: 3 }),
  core({ name: 'Verify Runner Runtime Soft Fail', file: 'verify-runner-runtime-soft-fail.ts', expectedTests: 3 }),
  core({ name: 'Verify JSON Contract', file: 'verify-json-contract.ts', expectedTests: 3, task: 'P1-T5' }),
  core({ name: 'Facts Contract Roundtrip', file: 'facts-contract-roundtrip.ts', expectedTests: 3 }),
  core({ name: 'Policy Engine Basic', file: 'policy-engine-basic.ts', expectedTests: 4, task: 'P2-T6' }),
  core({ name: 'Policy Unknown Fact', file: 'policy-unknown-fact.ts', expectedTests: 5, task: 'P2-T6' }),
  core({ name: 'Verify Policy Integration', file: 'verify-policy-integration.ts', expectedTests: 5, task: 'P2-T6' }),
  core({ name: 'Verify Report Contract', file: 'verify-report-contract.ts', expectedTests: 4, task: 'P1-T5' }),
  core({ name: 'Verify Issue Fingerprint Stability', file: 'verify-issue-fingerprint-stability.ts', expectedTests: 2 }),
  core({ name: 'V1 Mainline Golden Path', file: 'v1-mainline-golden-path.ts', expectedTests: 4 }),
  core({ name: 'Doctor V1 Readiness', file: 'doctor-v1-readiness.ts', expectedTests: 7, task: 'P2-T3/N6' }),
  core({ name: 'V1 Sample Repo Smoke', file: 'v1-sample-repo-smoke.ts', expectedTests: 3 }),
  bootstrap({ name: 'Bootstrap Discover Smoke', file: 'bootstrap-discover-smoke.ts', expectedTests: 4, task: 'P1-T6' }),
  bootstrap({ name: 'Bootstrap Discover Empty Repo', file: 'bootstrap-discover-empty-repo.ts', expectedTests: 2 }),
  bootstrap({ name: 'Bootstrap Discover Signal Filtering', file: 'bootstrap-discover-signal-filtering.ts', expectedTests: 3 }),
  bootstrap({ name: 'Bootstrap Discover Exclusion Policy', file: 'bootstrap-discover-exclusion-policy.ts', expectedTests: 4, task: 'P1-T1' }),
  bootstrap({ name: 'Bootstrap Adoption Ranked Evidence', file: 'bootstrap-adoption-ranked-evidence.ts', expectedTests: 5, task: 'Task 2/P1-T6' }),
  bootstrap({ name: 'Bootstrap Evidence Ranking Score', file: 'bootstrap-evidence-ranking-score.ts', expectedTests: 4, task: 'P1-T2' }),
  bootstrap({ name: 'Bootstrap Discover Unknown Layout', file: 'bootstrap-discover-unknown-layout.ts', expectedTests: 2 }),
  bootstrap({ name: 'Bootstrap Draft Mock', file: 'bootstrap-draft-mock.ts', expectedTests: 7, task: 'Task 9' }),
  bootstrap({ name: 'Bootstrap Draft Fallback', file: 'bootstrap-draft-fallback.ts', expectedTests: 2 }),
  bootstrap({ name: 'Bootstrap Draft Quality', file: 'bootstrap-draft-quality.ts', expectedTests: 3 }),
  bootstrap({ name: 'Bootstrap Draft Ranked Evidence Context', file: 'bootstrap-draft-ranked-evidence-context.ts', expectedTests: 3, task: 'Task 2' }),
  bootstrap({ name: 'Bootstrap Draft Domain Re-Anchoring', file: 'bootstrap-draft-domain-reanchoring.ts', expectedTests: 4, task: 'Task 4' }),
  bootstrap({ name: 'Bootstrap Technical Boundary Suppression', file: 'bootstrap-technical-boundary-suppression.ts', expectedTests: 5, task: 'Task 13' }),
  bootstrap({ name: 'Bootstrap Domain Multilingual Vocabulary', file: 'bootstrap-domain-multilingual-vocabulary.ts', expectedTests: 4, task: 'Task 11' }),
  bootstrap({ name: 'Bootstrap Aggregate Root Synthesis', file: 'bootstrap-aggregate-root-synthesis.ts', expectedTests: 4, task: 'Task 12' }),
  bootstrap({ name: 'Bootstrap Domain Taxonomy Packs', file: 'bootstrap-domain-taxonomy-packs.ts', expectedTests: 5, task: 'Task 16' }),
  bootstrap({ name: 'Bootstrap Domain Generality Audit', file: 'bootstrap-domain-generality-audit.ts', expectedTests: 2, task: 'Task 16' }),
  bootstrap({ name: 'Bootstrap Draft Feature Scenarios', file: 'bootstrap-draft-feature-scenarios.ts', expectedTests: 4, task: 'Task 5' }),
  bootstrap({ name: 'Bootstrap Feature Confidence Gate', file: 'bootstrap-feature-confidence-gate.ts', expectedTests: 5, task: 'P1-T3' }),
  bootstrap({ name: 'Bootstrap API Surface Classification', file: 'bootstrap-api-surface-classification.ts', expectedTests: 6, task: 'Task 6/14' }),
  bootstrap({ name: 'Bootstrap Proto Domain Mapping', file: 'bootstrap-proto-domain-mapping.ts', expectedTests: 4, task: 'Task 14' }),
  bootstrap({ name: 'Bootstrap Init Project', file: 'bootstrap-init-project.ts', expectedTests: 4, task: 'Task 8' }),
  retakeover({ name: 'Bootstrap Real Retakeover Regression Fixtures', file: 'bootstrap-retakeover-regression.ts', expectedTests: 12, task: 'P0-T2/N8' }),
  bootstrap({ name: 'Adopt CLI Surface', file: 'adopt-cli-surface.ts', expectedTests: 3 }),
  bootstrap({ name: 'Bootstrap Adopt Atomic', file: 'bootstrap-adopt-atomic.ts', expectedTests: 3 }),
  bootstrap({ name: 'Bootstrap Adopt Handoff', file: 'bootstrap-adopt-handoff.ts', expectedTests: 5, task: 'Task 7/P1-T4' }),
  bootstrap({ name: 'Bootstrap Spec Debt', file: 'bootstrap-spec-debt.ts', expectedTests: 3 }),
  bootstrap({ name: 'Bootstrap Takeover Brief', file: 'bootstrap-takeover-brief.ts', expectedTests: 4, task: 'Task 7/17' }),
  retakeover({ name: 'Bootstrap Synthetic Messy Legacy Takeover Stress', file: 'bootstrap-messy-legacy-takeover.ts', expectedTests: 5, task: 'N9' }),
  gates({ name: 'Verify Contract-Aware Core', file: 'verify-contract-aware-core.ts', expectedTests: 3 }),
  gates({ name: 'Verify Bootstrap Takeover', file: 'verify-bootstrap-takeover.ts', expectedTests: 3 }),
  gates({ name: 'Verify Baseline Hardening', file: 'verify-baseline-hardening.ts', expectedTests: 3 }),
  gates({ name: 'Verify Waiver Hardening', file: 'verify-waiver-hardening.ts', expectedTests: 4, task: 'P2-T4' }),
  gates({ name: 'Verify Mitigation Stacking', file: 'verify-mitigation-stacking.ts', expectedTests: 2 }),
  gates({ name: 'CI Verify Wrapper', file: 'ci-verify-wrapper.ts', expectedTests: 3 }),
  gates({ name: 'CI Summary Markdown', file: 'ci-summary-markdown.ts', expectedTests: 4, task: 'P1-T5' }),
  gates({ name: 'Package Script Surface', file: 'package-script-surface.ts', expectedTests: 3 }),
  changeImplement({ name: 'Change Dual Mode', file: 'change-dual-mode.ts', expectedTests: 5, task: 'P2-T3' }),
  changeImplement({ name: 'Change Default Mode Config', file: 'change-default-mode-config.ts', expectedTests: 7, task: 'N7' }),
  changeImplement({ name: 'Change Mainline Hints', file: 'change-mainline-hints.ts', expectedTests: 2 }),
  changeImplement({ name: 'Implement Mainline Lane', file: 'implement-mainline-lane.ts', expectedTests: 3 }),
  changeImplement({ name: 'Implement Handoff Mainline', file: 'implement-handoff-mainline.ts', expectedTests: 1 }),
  changeImplement({ name: 'Implement Patch Mediation', file: 'implement-patch-mediation.ts', expectedTests: 4, task: 'P2-T1' }),
  runtime({ name: 'Stage Runner Identity', file: 'stage-runner-identity-apply.ts', expectedTests: 8 }),
  runtime({ name: 'Cache Key Spec', file: 'cache-key-spec.ts', expectedTests: 10 }),
  runtime({ name: 'Cache Manifest Spec', file: 'cache-manifest-spec.ts', expectedTests: 10 }),
  runtime({ name: 'Cache Integration', file: 'cache-integration.ts', expectedTests: 4 }),
  runtime({ name: 'Cache Integration E2E', file: 'cache-integration-e2e.ts', expectedTests: 4 }),
  runtime({ name: 'Cache Portability', file: 'cache-portability.ts', expectedTests: 1 }),
  runtime({ name: 'Cache Context Input', file: 'cache-context-input.ts', expectedTests: 2 }),
  runtime({ name: 'Cache Cross-Slice Context', file: 'cache-cross-slice-context.ts', expectedTests: 1 }),
  runtime({ name: 'Windows-Safe Naming', file: 'windows-safe-naming.ts', expectedTests: 3 }),
  runtime({ name: 'Terminal State Rerun', file: 'terminal-state-rerun.ts', expectedTests: 2 }),
  runtime({ name: 'Stable Snapshot Gates', file: 'stable-snapshot-gates.ts', expectedTests: 1 }),
  runtime({ name: 'Evidence Cleanup', file: 'evidence-cleanup.ts', expectedTests: 2 }),
  runtime({ name: 'Distributed Scheduler MVP', file: 'distributed-scheduler-mvp.ts', expectedTests: 5 }),
  runtime({ name: 'Distributed Cache MVP', file: 'distributed-cache-mvp.ts', expectedTests: 3 }),
  runtime({ name: 'Distributed Cache Invalidation & Warmup', file: 'distributed-cache-invalidation-warmup.ts', expectedTests: 3 }),
  runtime({ name: 'Remote Runtime MVP', file: 'remote-runtime-mvp.ts', expectedTests: 3 }),
  runtime({ name: 'Resource Management', file: 'resource-management.ts', expectedTests: 3 }),
  runtime({ name: 'Fault Recovery', file: 'fault-recovery.ts', expectedTests: 4 }),
  runtime({ name: 'Collaboration MVP', file: 'collaboration-mvp.ts', expectedTests: 4 }),
  runtime({ name: 'Conflict Resolution MVP', file: 'conflict-resolution-mvp.ts', expectedTests: 4 }),
  runtime({ name: 'Collaboration Awareness MVP', file: 'collaboration-awareness-mvp.ts', expectedTests: 3 }),
  runtime({ name: 'Collaboration Locking MVP', file: 'collaboration-locking-mvp.ts', expectedTests: 3 }),
  runtime({ name: 'Collaboration Notifications MVP', file: 'collaboration-notifications-mvp.ts', expectedTests: 3 }),
  runtime({ name: 'Collaboration Analytics MVP', file: 'collaboration-analytics-mvp.ts', expectedTests: 3 }),
  runtime({ name: 'Console Read Model Contract', file: 'console-read-model-contract.ts', expectedTests: 8, task: 'T3.1' }),
  runtime({ name: 'Collaboration Surface Freeze', file: 'collaboration-surface-freeze.ts', expectedTests: 4, task: 'P4-T2' }),
];

interface TestResult {
  suite: string;
  area: RegressionArea;
  task?: string;
  passed: boolean;
  expected: number;
  actual: number;
  error?: string;
}

async function runTestSuite(suite: TestSuite): Promise<TestResult> {
  const testPath = path.join(__dirname, suite.file);

  try {
    const output = execSync(`npx tsx ${testPath}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      cwd: path.join(__dirname, '..', '..', '..'),  // Run from project root
    });

    // Parse output for test count - try multiple patterns
    let match = output.match(/(\d+)\/(\d+)/);
    if (!match) {
      // Try "X passed, Y failed" pattern
      match = output.match(/(\d+) passed, (\d+) failed/);
      if (match) {
        const passed = parseInt(match[1], 10);
        const failed = parseInt(match[2], 10);
        const actual = passed;
        const expected = passed + failed;

        return {
          suite: suite.name,
          area: suite.area,
          task: suite.task,
          passed: failed === 0 && expected === suite.expectedTests,
          expected: suite.expectedTests,
          actual,
        };
      }
    }
    if (!match) {
      // Try "Passed: X\nFailed: Y" pattern
      const passedMatch = output.match(/Passed: (\d+)/);
      const failedMatch = output.match(/Failed: (\d+)/);
      if (passedMatch && failedMatch) {
        const passed = parseInt(passedMatch[1], 10);
        const failed = parseInt(failedMatch[1], 10);
        const actual = passed;
        const expected = passed + failed;

        return {
          suite: suite.name,
          area: suite.area,
          task: suite.task,
          passed: failed === 0 && expected === suite.expectedTests,
          expected: suite.expectedTests,
          actual,
        };
      }
    }
    if (!match) {
      // Try alternative pattern: "X tests passed"
      match = output.match(/(\d+)\/(\d+) tests passed/);
    }
    if (!match) {
      // Try another pattern: "All X tests passed"
      match = output.match(/All (\d+) tests passed/);
      if (match) {
        const count = parseInt(match[1], 10);
        return {
          suite: suite.name,
          area: suite.area,
          task: suite.task,
          passed: count === suite.expectedTests,
          expected: suite.expectedTests,
          actual: count,
        };
      }
    }

    if (match) {
      const actual = parseInt(match[1], 10);
      const expected = parseInt(match[2], 10);

      return {
        suite: suite.name,
        area: suite.area,
        task: suite.task,
        passed: actual === expected && expected === suite.expectedTests,
        expected: suite.expectedTests,
        actual,
      };
    }

    return {
      suite: suite.name,
      area: suite.area,
      task: suite.task,
      passed: false,
      expected: suite.expectedTests,
      actual: 0,
      error: 'Could not parse test output',
    };
  } catch (error: any) {
    return {
      suite: suite.name,
      area: suite.area,
      task: suite.task,
      passed: false,
      expected: suite.expectedTests,
      actual: 0,
      error: error.message,
    };
  }
}

async function main() {
  console.log('=== JiSpec Unified Regression Test Matrix ===\n');

  const results: TestResult[] = [];

  for (const suite of TEST_SUITES) {
    const taskSuffix = suite.task ? ` ${suite.task}` : '';
    process.stdout.write(`Running [${suite.area}${taskSuffix}] ${suite.name}... `);
    const result = await runTestSuite(suite);
    results.push(result);

    if (result.passed) {
      console.log(`✓ ${result.actual}/${result.expected}`);
    } else {
      console.log(`✗ ${result.actual}/${result.expected}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
    }
  }

  console.log('\n=== Summary ===');
  const totalPassed = results.filter(r => r.passed).length;
  const totalSuites = results.length;
  const totalTests = results.reduce((sum, r) => sum + r.actual, 0);
  const totalExpected = results.reduce((sum, r) => sum + r.expected, 0);

  console.log(`Suites: ${totalPassed}/${totalSuites} passed`);
  console.log(`Tests: ${totalTests}/${totalExpected} passed`);
  printAreaSummary(results);

  if (totalPassed === totalSuites) {
    console.log('\n✓ All regression tests passed!');
    process.exit(0);
  } else {
    console.log('\n✗ Some regression tests failed');
    process.exit(1);
  }
}

function printAreaSummary(results: TestResult[]): void {
  console.log('\n=== Matrix By Area ===');
  const areaOrder: RegressionArea[] = [
    'core-mainline',
    'bootstrap-takeover-hardening',
    'retakeover-regression-pool',
    'verify-ci-gates',
    'change-implement',
    'runtime-extended',
  ];

  for (const area of areaOrder) {
    const areaResults = results.filter((result) => result.area === area);
    if (areaResults.length === 0) {
      continue;
    }

    const passedSuites = areaResults.filter((result) => result.passed).length;
    const actualTests = areaResults.reduce((sum, result) => sum + result.actual, 0);
    const expectedTests = areaResults.reduce((sum, result) => sum + result.expected, 0);
    console.log(`${area}: ${passedSuites}/${areaResults.length} suites, ${actualTests}/${expectedTests} tests`);
  }
}

main().catch(error => {
  console.error('Regression runner failed:', error);
  process.exit(1);
});
