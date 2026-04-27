# Task Pack 8: Implement FSM Usage Guide

## Overview

The Implement FSM is a budget-controlled finite state machine that automatically implements code changes by running test-driven iterations. It uses test feedback to guide implementation, detects when it's stuck, and generates handoff packets for human takeover when needed.

## Quick Start

```bash
# Basic usage - implement current change session
jispec-cli implement

# With custom test command
jispec-cli implement --test-command "npm run test:unit"

# With custom budget limits
jispec-cli implement --max-iterations 20 --max-tokens 200000 --max-cost 10.0

# JSON output for automation
jispec-cli implement --json
```

## Prerequisites

1. **Active Change Session**: Run `jispec-cli change` first to create a change session
2. **Test Command**: Have a test command that can verify your changes (default: `npm test`)
3. **Failing Tests**: Tests should fail initially (preflight check verifies this)

## Command Options

### `--session-id <id>`
Specify which change session to implement (default: active session)

```bash
jispec-cli implement --session-id abc123
```

### `--test-command <command>`
Override the test command (highest priority)

```bash
jispec-cli implement --test-command "npm run test:integration"
```

### `--max-iterations <number>`
Maximum number of implementation iterations (default: 10)

```bash
jispec-cli implement --max-iterations 20
```

### `--max-tokens <number>`
Maximum tokens to use (default: 100,000)

```bash
jispec-cli implement --max-tokens 200000
```

### `--max-cost <usd>`
Maximum cost in USD (default: $5.00)

```bash
jispec-cli implement --max-cost 10.0
```

### `--json`
Output result as JSON for automation

```bash
jispec-cli implement --json > result.json
```

## Test Command Resolution

The FSM resolves the test command using a fallback chain:

1. **Explicit option** (highest priority): `--test-command` flag
2. **Session hint**: Test command from change session's `nextCommands`
3. **package.json**: `scripts.test` field
4. **Default**: `npm test`

Example session hint:
```typescript
// Change session includes:
nextCommands: [
  { command: "npm run verify", description: "Verify changes" }
]
// FSM will use "npm run verify"
```

## Budget Control

The FSM enforces three budget limits:

- **Iterations**: Number of test-fix cycles (default: 10)
- **Tokens**: Total tokens consumed (default: 100,000)
- **Cost**: Total cost in USD (default: $5.00)

The FSM stops when ANY limit is exceeded.

### Budget Tracking

Each iteration records:
- Tokens used for code generation
- Cost in USD (based on model pricing)
- Iteration count

Example budget state:
```
Iteration 5/10
Tokens: 45,000/100,000 (45%)
Cost: $2.25/$5.00 (45%)
```

## Outcomes

### Success
Tests pass within budget limits.

```
Outcome: success
Iterations: 7
Tokens used: 65,000
Cost: $3.25
Tests passed: true
```

### Budget Exhausted
Budget limit exceeded before tests pass.

```
Outcome: budget_exhausted
Iterations: 10
Tokens used: 95,000
Cost: $4.75
Tests passed: false

Handoff packet written to: .jispec/handoff/abc123.json
```

### Stall Detected
FSM detects it's stuck and stops early.

```
Outcome: stall_detected
Iterations: 5
Tokens used: 25,000
Cost: $1.25
Tests passed: false
Stall reason: repeated_failures: same error 3 times

Handoff packet written to: .jispec/handoff/abc123.json
```

### Preflight Failed
Tests already pass (nothing to implement).

```
Outcome: preflight_failed
Iterations: 0
Tests passed: true
```

## Stall Detection

The FSM detects three types of stalls:

### 1. Repeated Failures
Same error occurs 3+ consecutive times.

**Example:**
```
Iteration 1: Error: Cannot find module 'UserService'
Iteration 2: Error: Cannot find module 'UserService'
Iteration 3: Error: Cannot find module 'UserService'
→ Stall detected: repeated_failures
```

**What to do:**
- Review the error message carefully
- Check if the approach is fundamentally wrong
- Consider a different implementation strategy

### 2. Oscillation
Same file changed 2+ times in non-consecutive iterations.

**Example:**
```
Iteration 1: Changed src/user.ts
Iteration 2: Changed src/auth.ts
Iteration 3: Changed src/user.ts (again)
→ Stall detected: oscillation
```

**What to do:**
- Review the design approach
- Files being changed back and forth indicate unclear requirements
- Consider breaking the change into smaller pieces

### 3. No Progress
5+ iterations with no new files changed.

**Example:**
```
Iteration 1-5: No files changed
→ Stall detected: no_progress
```

**What to do:**
- Expand the scope of files being considered
- Check if the FSM has access to the right files
- Consider a different approach

## Handoff Packets

When the FSM fails (budget exhausted or stall detected), it generates a handoff packet for human takeover.

### Location
```
.jispec/handoff/{sessionId}.json
```

### Contents

**Summary:**
- What worked (successful iterations)
- What failed (recent failures)
- Last error message
- Stall reason (if applicable)

**Next Steps:**
- Suggested actions based on failure type
- Files needing attention
- Test command to run manually

**Episode Memory:**
- Attempted hypotheses (what was tried)
- Rejected paths (files changed but tests still failed)

### Example Handoff Packet

```
=== Handoff Packet ===

Session: abc123
Change Intent: Add user authentication
Outcome: stall_detected
Iterations: 5
Tokens used: 25,000
Cost: $1.25

=== Summary ===

Stall Reason: repeated_failures: same error 3 times

What Worked:
  - No successful iterations

What Failed:
  - Iteration 3: Add AuthService class: Error: Cannot find module 'AuthService'
  - Iteration 4: Import AuthService in user.ts: Error: Cannot find module 'AuthService'
  - Iteration 5: Create AuthService file: Error: Cannot find module 'AuthService'

Last Error:
  Error: Cannot find module 'AuthService'

=== Next Steps ===

Suggested Actions:
  Review stall reason and break the pattern
  The same error occurred multiple times - investigate root cause
  Review rejected paths: src/auth.ts, src/user.ts
  Run tests manually: npm test
  If fixed, archive session: jispec-cli implement --archive

Files Needing Attention:
  - src/auth.ts
  - src/user.ts

Test Command: npm test

=== Attempted Hypotheses ===
  - Add AuthService class
  - Import AuthService in user.ts
  - Create AuthService file

=== Rejected Paths ===
  - src/auth.ts
  - src/user.ts
```

## Episode Memory

The FSM tracks what it tried in episode memory:

### Episodes
Each iteration creates an episode:
```typescript
{
  iteration: 3,
  hypothesis: "Add AuthService class",
  outcome: "failure",
  changedFiles: ["src/auth.ts"],
  errorMessage: "Cannot find module 'AuthService'",
  timestamp: "2026-04-27T10:15:30Z"
}
```

### Rejected Paths
Files that were changed but tests still failed:
```typescript
rejectedPaths: ["src/auth.ts", "src/user.ts"]
```

### Usage in Context
Episode memory is included in the context bundle for each iteration, helping the FSM avoid repeating failed approaches.

## Context Pruning

The FSM builds a deterministic context bundle for each iteration:

### Immutable Pack
- Change session metadata
- Lane decision
- Base ref
- Never changes during FSM run

### Working Set
- Files in the change session
- Limited to 5,000 lines total
- Prioritizes domain core files

### Failure Pack
- Last test result (if failed)
- Error message
- Limited to 1,000 lines

### Episode Memory Pack
- Recent hypotheses (last 10)
- Rejected paths
- Helps avoid repeating failures

## Integration with Change Sessions

The Implement FSM integrates with Task Pack 7 change sessions:

1. **Load Session**: Reads active change session from `.jispec/change-session.json`
2. **Use Changed Paths**: Focuses on files identified in the change session
3. **Respect Lane Decision**: Uses lane decision for context pruning
4. **Follow Next Commands**: Extracts test command from session hints

## Best Practices

### 1. Start with Good Tests
Ensure your test command:
- Runs quickly (< 30 seconds)
- Fails clearly when code is wrong
- Passes clearly when code is correct

### 2. Set Appropriate Budgets
- **Simple changes**: Default limits (10 iterations, 100k tokens, $5)
- **Complex changes**: Increase limits (20 iterations, 200k tokens, $10)
- **Exploratory work**: Lower limits to fail fast (5 iterations, 50k tokens, $2.50)

### 3. Review Handoff Packets
When the FSM fails:
- Read the handoff packet carefully
- Review attempted hypotheses
- Check rejected paths
- Follow suggested actions

### 4. Iterate on Approach
If the FSM stalls repeatedly:
- Break the change into smaller pieces
- Improve test clarity
- Add more context to the change session

### 5. Use JSON Output for Automation
```bash
# Run FSM and capture result
result=$(jispec-cli implement --json)

# Check outcome
outcome=$(echo "$result" | jq -r '.outcome')

if [ "$outcome" = "success" ]; then
  echo "Implementation succeeded!"
else
  echo "Implementation failed: $outcome"
  # Read handoff packet
  session_id=$(echo "$result" | jq -r '.sessionId')
  cat ".jispec/handoff/${session_id}.json"
fi
```

## Troubleshooting

### Tests Already Pass
```
Error: Preflight PASSED - tests already pass, nothing to implement
```

**Solution:** Ensure tests fail before running implement. The FSM needs failing tests to know what to fix.

### Test Command Not Found
```
Error: Test command failed: npm test
```

**Solution:** Verify the test command works manually. Use `--test-command` to specify a different command.

### Budget Exhausted Quickly
```
Outcome: budget_exhausted
Iterations: 2
```

**Solution:** Increase budget limits with `--max-iterations`, `--max-tokens`, or `--max-cost`.

### Repeated Stalls
```
Outcome: stall_detected
Stall reason: repeated_failures
```

**Solution:**
- Review the error message in the handoff packet
- Check if the approach is fundamentally wrong
- Break the change into smaller pieces
- Add more context to the change session

### No Files Changed
```
Stall reason: no_progress: 5 iterations with no new files changed
```

**Solution:**
- Verify the change session includes the right files
- Check if the FSM has access to necessary files
- Consider expanding the scope

## Examples

### Example 1: Simple Feature Addition

```bash
# Create change session
jispec-cli change

# User describes: "Add user profile endpoint"
# Change session created with:
# - changedPaths: ["src/routes/user.ts", "src/controllers/user.ts"]
# - nextCommands: [{ command: "npm test", description: "Run tests" }]

# Run implement
jispec-cli implement

# Output:
# Iteration 1: Add profile route... Tests FAILED
# Iteration 2: Add profile controller... Tests FAILED
# Iteration 3: Fix response format... Tests PASSED!
# Outcome: success
# Iterations: 3
# Cost: $0.15
```

### Example 2: Complex Refactoring

```bash
# Create change session
jispec-cli change

# User describes: "Refactor authentication to use JWT"
# Change session created with many files

# Run implement with higher budget
jispec-cli implement --max-iterations 20 --max-cost 10.0

# Output:
# Iteration 1-5: Various attempts...
# Iteration 6: Stall detected: oscillation
# Handoff packet written to: .jispec/handoff/abc123.json

# Review handoff packet
cat .jispec/handoff/abc123.json

# Fix manually based on suggestions
# Then archive session
jispec-cli implement --archive
```

### Example 3: Automation Pipeline

```bash
#!/bin/bash

# Create change session
jispec-cli change --auto

# Run implement with JSON output
result=$(jispec-cli implement --json)

# Parse result
outcome=$(echo "$result" | jq -r '.outcome')
iterations=$(echo "$result" | jq -r '.iterations')
cost=$(echo "$result" | jq -r '.costUSD')

# Report
echo "Outcome: $outcome"
echo "Iterations: $iterations"
echo "Cost: \$$cost"

# Handle failure
if [ "$outcome" != "success" ]; then
  session_id=$(echo "$result" | jq -r '.sessionId')
  echo "Handoff packet: .jispec/handoff/${session_id}.json"
  
  # Send notification
  notify-send "FSM Failed" "Review handoff packet for session $session_id"
fi
```

## API Reference

### Core Functions

#### `runImplement(options: ImplementRunOptions): Promise<ImplementRunResult>`

Main entry point for the Implement FSM.

**Options:**
```typescript
interface ImplementRunOptions {
  root: string;              // Project root directory
  sessionId?: string;        // Change session ID (default: active)
  testCommand?: string;      // Test command (default: resolved)
  maxIterations?: number;    // Max iterations (default: 10)
  maxTokens?: number;        // Max tokens (default: 100,000)
  maxCostUSD?: number;       // Max cost (default: $5.00)
}
```

**Result:**
```typescript
interface ImplementRunResult {
  outcome: "success" | "budget_exhausted" | "stall_detected" | "preflight_failed";
  sessionId: string;
  iterations: number;
  tokensUsed: number;
  costUSD: number;
  testsPassed: boolean;
  handoffPacket?: HandoffPacket;
  metadata: {
    startedAt: string;
    completedAt: string;
    testCommand: string;
    stallReason?: string;
    handoffPacketPath?: string;
  };
}
```

### Utility Functions

#### `resolveTestCommand(root, session, explicitCommand?): TestCommandResolution`

Resolves test command using fallback chain.

#### `generateHandoffPacket(session, result, episodeMemory, lastError): HandoffPacket`

Generates handoff packet for human takeover.

#### `buildContextBundle(root, session, testResult?, episodeMemory?): ContextBundle`

Builds deterministic context bundle for iteration.

## See Also

- [Task Pack 8 Implementation Plan](./task-pack-8-implementation-plan.md)
- [Task Pack 7: Change Command](./task-pack-7-summary.md)
- [Spec-Driven AI Pipeline Business Plan](./spec-driven-ai-pipeline-business-plan.md)
