/**
 * Regression Test Runner
 *
 * Unified runner for all Phase 5.1 regression tests.
 * Provides consistent reporting and failure tracking.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface TestSuite {
  name: string;
  file: string;
  expectedTests: number;
}

const TEST_SUITES: TestSuite[] = [
  { name: 'Rollback Regression', file: 'rollback-regression.ts', expectedTests: 5 },
  { name: 'Semantic Validation', file: 'semantic-validation-negative.ts', expectedTests: 5 },
  { name: 'CLI Help Surface', file: 'cli-help-surface.ts', expectedTests: 3 },
  { name: 'CLI Legacy Surface Hint', file: 'cli-legacy-surface-hint.ts', expectedTests: 2 },
  { name: 'Verify Runner Pass', file: 'verify-runner-pass.ts', expectedTests: 3 },
  { name: 'Verify Runner Fail Blocking', file: 'verify-runner-fail-blocking.ts', expectedTests: 3 },
  { name: 'Verify Runner Warn Advisory', file: 'verify-runner-warn-advisory.ts', expectedTests: 3 },
  { name: 'Verify Runner Runtime Soft Fail', file: 'verify-runner-runtime-soft-fail.ts', expectedTests: 3 },
  { name: 'Verify JSON Contract', file: 'verify-json-contract.ts', expectedTests: 2 },
  { name: 'Facts Contract Roundtrip', file: 'facts-contract-roundtrip.ts', expectedTests: 3 },
  { name: 'Policy Engine Basic', file: 'policy-engine-basic.ts', expectedTests: 3 },
  { name: 'Policy Unknown Fact', file: 'policy-unknown-fact.ts', expectedTests: 3 },
  { name: 'Verify Policy Integration', file: 'verify-policy-integration.ts', expectedTests: 3 },
  { name: 'Verify Report Contract', file: 'verify-report-contract.ts', expectedTests: 3 },
  { name: 'Verify Issue Fingerprint Stability', file: 'verify-issue-fingerprint-stability.ts', expectedTests: 2 },
  { name: 'V1 Mainline Golden Path', file: 'v1-mainline-golden-path.ts', expectedTests: 4 },
  { name: 'Doctor V1 Readiness', file: 'doctor-v1-readiness.ts', expectedTests: 3 },
  { name: 'V1 Sample Repo Smoke', file: 'v1-sample-repo-smoke.ts', expectedTests: 3 },
  { name: 'Bootstrap Discover Smoke', file: 'bootstrap-discover-smoke.ts', expectedTests: 3 },
  { name: 'Bootstrap Discover Empty Repo', file: 'bootstrap-discover-empty-repo.ts', expectedTests: 2 },
  { name: 'Bootstrap Discover Signal Filtering', file: 'bootstrap-discover-signal-filtering.ts', expectedTests: 3 },
  { name: 'Bootstrap Discover Unknown Layout', file: 'bootstrap-discover-unknown-layout.ts', expectedTests: 2 },
  { name: 'Bootstrap Draft Mock', file: 'bootstrap-draft-mock.ts', expectedTests: 5 },
  { name: 'Bootstrap Draft Fallback', file: 'bootstrap-draft-fallback.ts', expectedTests: 2 },
  { name: 'Bootstrap Draft Quality', file: 'bootstrap-draft-quality.ts', expectedTests: 3 },
  { name: 'Adopt CLI Surface', file: 'adopt-cli-surface.ts', expectedTests: 3 },
  { name: 'Bootstrap Adopt Atomic', file: 'bootstrap-adopt-atomic.ts', expectedTests: 3 },
  { name: 'Bootstrap Adopt Handoff', file: 'bootstrap-adopt-handoff.ts', expectedTests: 3 },
  { name: 'Bootstrap Spec Debt', file: 'bootstrap-spec-debt.ts', expectedTests: 3 },
  { name: 'Verify Contract-Aware Core', file: 'verify-contract-aware-core.ts', expectedTests: 3 },
  { name: 'Verify Bootstrap Takeover', file: 'verify-bootstrap-takeover.ts', expectedTests: 3 },
  { name: 'Verify Baseline Hardening', file: 'verify-baseline-hardening.ts', expectedTests: 3 },
  { name: 'Verify Waiver Hardening', file: 'verify-waiver-hardening.ts', expectedTests: 3 },
  { name: 'Verify Mitigation Stacking', file: 'verify-mitigation-stacking.ts', expectedTests: 2 },
  { name: 'CI Verify Wrapper', file: 'ci-verify-wrapper.ts', expectedTests: 3 },
  { name: 'CI Summary Markdown', file: 'ci-summary-markdown.ts', expectedTests: 3 },
  { name: 'Package Script Surface', file: 'package-script-surface.ts', expectedTests: 3 },
  { name: 'Change Dual Mode', file: 'change-dual-mode.ts', expectedTests: 3 },
  { name: 'Change Mainline Hints', file: 'change-mainline-hints.ts', expectedTests: 2 },
  { name: 'Implement Mainline Lane', file: 'implement-mainline-lane.ts', expectedTests: 3 },
  { name: 'Implement Handoff Mainline', file: 'implement-handoff-mainline.ts', expectedTests: 1 },
  { name: 'Stage Runner Identity', file: 'stage-runner-identity-apply.ts', expectedTests: 8 },
  { name: 'Cache Key Spec', file: 'cache-key-spec.ts', expectedTests: 10 },
  { name: 'Cache Manifest Spec', file: 'cache-manifest-spec.ts', expectedTests: 10 },
  { name: 'Cache Integration', file: 'cache-integration.ts', expectedTests: 4 },
  { name: 'Cache Integration E2E', file: 'cache-integration-e2e.ts', expectedTests: 4 },
  { name: 'Cache Portability', file: 'cache-portability.ts', expectedTests: 1 },
  { name: 'Cache Context Input', file: 'cache-context-input.ts', expectedTests: 2 },
  { name: 'Cache Cross-Slice Context', file: 'cache-cross-slice-context.ts', expectedTests: 1 },
  { name: 'Windows-Safe Naming', file: 'windows-safe-naming.ts', expectedTests: 3 },
  { name: 'Terminal State Rerun', file: 'terminal-state-rerun.ts', expectedTests: 2 },
  { name: 'Stable Snapshot Gates', file: 'stable-snapshot-gates.ts', expectedTests: 1 },
  { name: 'Evidence Cleanup', file: 'evidence-cleanup.ts', expectedTests: 2 },
  { name: 'Distributed Scheduler MVP', file: 'distributed-scheduler-mvp.ts', expectedTests: 5 },
  { name: 'Distributed Cache MVP', file: 'distributed-cache-mvp.ts', expectedTests: 3 },
  { name: 'Distributed Cache Invalidation & Warmup', file: 'distributed-cache-invalidation-warmup.ts', expectedTests: 3 },
  { name: 'Remote Runtime MVP', file: 'remote-runtime-mvp.ts', expectedTests: 3 },
  { name: 'Resource Management', file: 'resource-management.ts', expectedTests: 3 },
  { name: 'Fault Recovery', file: 'fault-recovery.ts', expectedTests: 4 },
  { name: 'Collaboration MVP', file: 'collaboration-mvp.ts', expectedTests: 4 },
  { name: 'Conflict Resolution MVP', file: 'conflict-resolution-mvp.ts', expectedTests: 4 },
  { name: 'Collaboration Awareness MVP', file: 'collaboration-awareness-mvp.ts', expectedTests: 3 },
  { name: 'Collaboration Locking MVP', file: 'collaboration-locking-mvp.ts', expectedTests: 3 },
  { name: 'Collaboration Notifications MVP', file: 'collaboration-notifications-mvp.ts', expectedTests: 3 },
  { name: 'Collaboration Analytics MVP', file: 'collaboration-analytics-mvp.ts', expectedTests: 3 },
];

interface TestResult {
  suite: string;
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
        passed: actual === expected && expected === suite.expectedTests,
        expected: suite.expectedTests,
        actual,
      };
    }

    return {
      suite: suite.name,
      passed: false,
      expected: suite.expectedTests,
      actual: 0,
      error: 'Could not parse test output',
    };
  } catch (error: any) {
    return {
      suite: suite.name,
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
    process.stdout.write(`Running ${suite.name}... `);
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

  if (totalPassed === totalSuites) {
    console.log('\n✓ All regression tests passed!');
    process.exit(0);
  } else {
    console.log('\n✗ Some regression tests failed');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Regression runner failed:', error);
  process.exit(1);
});
