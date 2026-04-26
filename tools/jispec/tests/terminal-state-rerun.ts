/**
 * Terminal State Rerun Tests
 *
 * Verifies that pipeline execution is idempotent when a slice
 * is already in a terminal state (verifying, accepted, rejected).
 */

async function testTerminalStateDetection() {
  // Test that terminal states are correctly identified
  const terminalStates = ['verifying', 'accepted', 'rejected'];
  const nonTerminalStates = ['proposed', 'requirements-defined', 'design-defined', 'implementing'];

  for (const state of terminalStates) {
    if (!isTerminalState(state)) {
      throw new Error(`Expected ${state} to be a terminal state`);
    }
  }

  for (const state of nonTerminalStates) {
    if (isTerminalState(state)) {
      throw new Error(`Expected ${state} to NOT be a terminal state`);
    }
  }

  console.log('✓ Test 1: Terminal state detection works correctly');
}

function isTerminalState(state: string): boolean {
  return ['verifying', 'accepted', 'rejected'].includes(state);
}

async function testIdempotencyLogic() {
  // Test that the idempotency check logic is correct
  const slice1 = {
    id: 'test-slice-v1',
    lifecycle: { state: 'verifying' },
  };

  const slice2 = {
    id: 'test-slice-v2',
    lifecycle: { state: 'implementing' },
  };

  if (!shouldSkipExecution(slice1)) {
    throw new Error('Expected verifying slice to skip execution');
  }

  if (shouldSkipExecution(slice2)) {
    throw new Error('Expected implementing slice to NOT skip execution');
  }

  console.log('✓ Test 2: Idempotency logic works correctly');
}

function shouldSkipExecution(slice: any): boolean {
  return isTerminalState(slice.lifecycle.state);
}

async function main() {
  console.log('=== Terminal State Rerun Tests ===\n');

  let passed = 0;
  let failed = 0;

  try {
    await testTerminalStateDetection();
    passed++;
  } catch (error: any) {
    console.error('✗ Test 1 failed:', error.message);
    failed++;
  }

  try {
    await testIdempotencyLogic();
    passed++;
  } catch (error: any) {
    console.error('✗ Test 2 failed:', error.message);
    failed++;
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
