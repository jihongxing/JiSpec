# Task Pack 8: Implement FSM Design Document

## Executive Summary

Task Pack 8 implements a budget-controlled finite state machine (FSM) for AI-driven code implementation. The system takes a change intent, generates code iteratively, runs tests, and either succeeds within budget or hands off to a human with an actionable summary.

**Core Principles:**
- Budget-controlled: Hard limits on iterations, tokens, and cost
- Stall-aware: Detects when AI is stuck and stops early
- Context-deterministic: Builds minimal, reproducible context for each iteration
- Human-handoff ready: Produces actionable summaries when AI fails
- Test-driven: Uses existing test commands as success criteria

**Key Capabilities:**
- Automatic code generation with test feedback loop
- Budget tracking (iterations, tokens, cost)
- Stall detection (repeated failures, oscillation, no progress)
- Context pruning (immutable pack, working set, failure pack, episode memory)
- Handoff packet generation for human takeover

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Implement Command                        │
│  (jispec-cli implement "Add order refund feature")          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Implement Runner                           │
│  - Load change session                                       │
│  - Resolve test command                                      │
│  - Initialize budget controller                              │
│  - Run FSM iteration loop                                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    FSM Iteration Loop                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. Check Budget (iterations, tokens, cost)           │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                        │
│                     ▼                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 2. Build Context (pruning + episode memory)          │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                        │
│                     ▼                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 3. Generate Code (LLM call with context)             │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                        │
│                     ▼                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 4. Run Tests (test command from session)             │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                        │
│                     ▼                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 5. Check Stall (repeated failures, oscillation)      │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                        │
│                     ▼                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 6. Update Episode Memory (hypothesis, outcome)       │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                        │
│                     ▼                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Decision: Success / Continue / Stop                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Outcome Handler                           │
│  - Success: Archive session, report metrics                 │
│  - Budget exhausted: Generate handoff packet                │
│  - Stall detected: Generate handoff packet                  │
└─────────────────────────────────────────────────────────────┘
```

## Module Specifications

### 1. implement-runner.ts

Main orchestrator for the implement FSM.

```typescript
export interface ImplementRunOptions {
  root: string;
  sessionId?: string;        // Optional: resume existing session
  testCommand?: string;      // Optional: override test command
  maxIterations?: number;    // Default: 10
  maxTokens?: number;        // Default: 100000
  maxCostUSD?: number;       // Default: 5.00
}

export interface ImplementRunResult {
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
  };
}

export async function runImplement(options: ImplementRunOptions): Promise<ImplementRunResult>;
```

**Workflow:**
1. Load or create change session
2. Resolve test command (from session, options, or default)
3. Run preflight test (must fail initially)
4. Initialize budget controller
5. Run FSM iteration loop
6. Handle outcome (success, budget exhausted, stall detected)

### 2. context-pruning.ts

Builds deterministic context bundles for each iteration.

```typescript
export interface ContextBundle {
  immutablePack: {
    changeIntent: string;
    testCommand: string;
    changedPaths: string[];
    laneDecision: string;
  };
  workingSet: {
    files: Array<{ path: string; content: string }>;
    totalLines: number;
  };
  failurePack: {
    lastTestOutput: string;
    lastErrorMessage?: string;
  };
  episodeMemory: {
    attemptedHypotheses: string[];
    rejectedPaths: string[];
  };
}

export function buildContextBundle(
  session: ChangeSession,
  lastTestResult: TestResult,
  episodeMemory: EpisodeMemory,
): ContextBundle;
```

**Context Pruning Rules:**
- Immutable pack: Never changes, always included
- Working set: Only changed files + direct dependencies (max 5000 lines)
- Failure pack: Last test output only (max 1000 lines)
- Episode memory: Last 5 hypotheses + rejected paths

### 3. budget-controller.ts

Tracks iterations, tokens, and cost with hard limits.

```typescript
export interface BudgetLimits {
  maxIterations: number;
  maxTokens: number;
  maxCostUSD: number;
}

export interface BudgetState {
  iterations: number;
  tokensUsed: number;
  costUSD: number;
}

export class BudgetController {
  constructor(limits: BudgetLimits);
  
  canContinue(): boolean;
  recordIteration(tokensUsed: number, costUSD: number): void;
  getState(): BudgetState;
  getRemainingBudget(): { iterations: number; tokens: number; costUSD: number };
}
```

**Budget Limits (First Version):**
- Max iterations: 10
- Max tokens: 100,000
- Max cost: $5.00 USD

### 4. stall-detector.ts

Detects when AI is stuck and should stop.

```typescript
export interface StallCheckResult {
  isStalled: boolean;
  reason?: "repeated_failures" | "oscillation" | "no_progress";
  details?: string;
}

export class StallDetector {
  recordIteration(testPassed: boolean, changedFiles: string[]): void;
  checkStall(): StallCheckResult;
}
```

**Stall Detection Rules:**
- Repeated failures: 3 consecutive test failures with same error
- Oscillation: Same file changed back and forth 2+ times
- No progress: 5 iterations with no new files changed

### 5. handoff-packet.ts

Creates actionable summary for human takeover.

```typescript
export interface HandoffPacket {
  sessionId: string;
  changeIntent: string;
  outcome: "budget_exhausted" | "stall_detected";
  iterations: number;
  tokensUsed: number;
  costUSD: number;
  
  summary: {
    whatWorked: string[];
    whatFailed: string[];
    lastError: string;
    stallReason?: string;
  };
  
  nextSteps: {
    suggestedActions: string[];
    filesNeedingAttention: string[];
    testCommand: string;
  };
  
  episodeMemory: {
    attemptedHypotheses: string[];
    rejectedPaths: string[];
  };
}

export function generateHandoffPacket(
  session: ChangeSession,
  result: ImplementRunResult,
  episodeMemory: EpisodeMemory,
): HandoffPacket;
```

## Integration with Task Pack 7

Task Pack 8 builds on Task Pack 7's change session:

```typescript
// Task Pack 7 creates change session
const changeResult = runChangeCommand({
  root: ".",
  summary: "Add order refund feature",
  lane: "auto",
});

// Task Pack 8 uses change session
const implementResult = await runImplement({
  root: ".",
  sessionId: changeResult.session.id,
});
```

**Integration Points:**
1. Change session provides: intent, lane decision, changed paths, test command hint
2. Implement FSM uses: intent for context, test command for success criteria
3. Both share: session ID, base ref, slice ID

## Test Command Resolution

The implement FSM needs a test command to verify success. Resolution order:

1. Explicit option: `--test-command "npm test"`
2. Change session hint: `session.nextCommands[0].command`
3. Package.json script: `npm test` if exists
4. Default: `npm test`

**Preflight Check:**
- Run test command before starting FSM
- Must fail initially (otherwise nothing to implement)
- If passes: return `preflight_failed` outcome

## Usage Examples

### Example 1: Success within budget

```bash
$ npm run jispec-cli -- change "Add order refund feature"
=== Change Session Created ===
ID: cs_20260427_143022_a1b2c3
Summary: Add order refund feature
Lane: strict (auto-promoted)
Next:
- jispec-cli verify
- jispec-cli implement

$ npm run jispec-cli -- implement
=== Implement FSM Started ===
Session: cs_20260427_143022_a1b2c3
Test command: npm test
Budget: 10 iterations, 100k tokens, $5.00

Iteration 1: Generating code...
  Changed: src/domain/order.ts, src/routes/orders.ts
  Running tests... FAILED
  Error: RefundService not found

Iteration 2: Generating code...
  Changed: src/services/refund-service.ts
  Running tests... FAILED
  Error: Missing refund validation

Iteration 3: Generating code...
  Changed: src/domain/order.ts
  Running tests... PASSED

=== Implement FSM Completed ===
Outcome: success
Iterations: 3
Tokens used: 12,450
Cost: $0.62
Tests passed: true
```

### Example 2: Budget exhausted

```bash
$ npm run jispec-cli -- implement
=== Implement FSM Started ===
Session: cs_20260427_143022_a1b2c3
Test command: npm test
Budget: 10 iterations, 100k tokens, $5.00

Iteration 1-10: [... repeated failures ...]

=== Implement FSM Stopped ===
Outcome: budget_exhausted
Iterations: 10
Tokens used: 98,234
Cost: $4.91
Tests passed: false

Handoff packet written to: .jispec/handoff/cs_20260427_143022_a1b2c3.json

Summary:
- Attempted 10 iterations without success
- Last error: RefundService validation logic incorrect
- Files needing attention: src/services/refund-service.ts

Next steps:
1. Review handoff packet for attempted hypotheses
2. Manually fix RefundService validation logic
3. Run: npm test
4. If fixed, archive session: jispec-cli implement --archive
```

### Example 3: Stall detected

```bash
$ npm run jispec-cli -- implement
=== Implement FSM Started ===
Session: cs_20260427_143022_a1b2c3
Test command: npm test
Budget: 10 iterations, 100k tokens, $5.00

Iteration 1-5: [... oscillating changes ...]

=== Implement FSM Stopped ===
Outcome: stall_detected
Reason: oscillation
Iterations: 5
Tokens used: 45,123
Cost: $2.26
Tests passed: false

Handoff packet written to: .jispec/handoff/cs_20260427_143022_a1b2c3.json

Summary:
- Detected oscillation: src/domain/order.ts changed back and forth 3 times
- AI is stuck in a loop, manual intervention needed

Next steps:
1. Review handoff packet for oscillation pattern
2. Manually resolve the design conflict
3. Run: npm test
4. If fixed, archive session: jispec-cli implement --archive
```

## Implementation Phases

### Phase 1: Core FSM (Week 1)
- implement-runner.ts: Basic iteration loop
- context-pruning.ts: Simple context builder
- budget-controller.ts: Iteration and token tracking
- Test: Can run 1 iteration and stop

### Phase 2: Stall Detection (Week 2)
- stall-detector.ts: Repeated failures and oscillation
- Episode memory: Track hypotheses and rejected paths
- Test: Detects stall and stops early

### Phase 3: Handoff Packet (Week 3)
- handoff-packet.ts: Generate actionable summary
- Integration with change session
- Test: Produces useful handoff for human

### Phase 4: Polish & Integration (Week 4)
- CLI integration: `jispec-cli implement`
- Test command resolution
- Documentation and examples
- End-to-end testing

## Testing Strategy

### Unit Tests
- context-pruning: Context bundle construction
- budget-controller: Budget tracking and limits
- stall-detector: Stall detection rules
- handoff-packet: Packet generation

### Integration Tests
- implement-runner: Full FSM workflow
- Test command resolution
- Change session integration

### End-to-End Tests
- Success scenario: Simple feature implementation
- Budget exhausted scenario: Complex feature
- Stall detected scenario: Oscillating changes

## Success Criteria

Task Pack 8 is complete when:

1. ✅ Implement command runs FSM iteration loop
2. ✅ Budget controller enforces hard limits
3. ✅ Stall detector stops early when stuck
4. ✅ Context pruning builds deterministic bundles
5. ✅ Handoff packet provides actionable summary
6. ✅ Integration with Task Pack 7 change session
7. ✅ Test command resolution works
8. ✅ End-to-end tests pass for all scenarios

## Non-Goals (First Version)

- ❌ Slice-aware implementation (future: Task Pack 9)
- ❌ Multi-agent collaboration (future: Task Pack 10)
- ❌ Impact analysis integration (future: Task Pack 11)
- ❌ AST-based context pruning (use simple path-based)
- ❌ Dynamic budget adjustment (use fixed limits)
- ❌ LLM model selection (use default model)

## File Structure

```
tools/jispec/implement/
├── implement-runner.ts       # Main orchestrator
├── context-pruning.ts        # Context bundle builder
├── budget-controller.ts      # Budget tracking
├── stall-detector.ts         # Stall detection
├── handoff-packet.ts         # Handoff packet generation
└── episode-memory.ts         # Episode memory tracking

scripts/
└── test-task-pack-8.ts       # Test script

docs/
└── task-pack-8-design.md     # This document
```

## Next Steps

After design approval:

1. Create file structure
2. Implement Phase 1 (Core FSM)
3. Write unit tests
4. Implement Phase 2 (Stall Detection)
5. Implement Phase 3 (Handoff Packet)
6. Implement Phase 4 (Polish & Integration)
7. Write end-to-end tests
8. Update documentation
