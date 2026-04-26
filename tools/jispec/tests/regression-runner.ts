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
  console.log('=== Phase 5.1 Regression Test Matrix ===\n');

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
