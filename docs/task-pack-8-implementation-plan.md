# Task Pack 8 Implementation Plan

## Overview

This document provides a detailed implementation plan for Task Pack 8: Implement FSM. The plan is organized into 4 phases over 4 weeks, with clear deliverables and testing requirements for each phase.

## Phase 1: Core FSM (Week 1)

### Objectives
- Establish basic FSM iteration loop
- Implement budget controller with iteration tracking
- Create simple context pruning
- Integrate with Task Pack 7 change session

### Files to Create

1. **tools/jispec/implement/budget-controller.ts**
   - BudgetLimits interface
   - BudgetState interface
   - BudgetController class with canContinue(), recordIteration(), getState()
   - Default limits: 10 iterations, 100k tokens, $5.00

2. **tools/jispec/implement/context-pruning.ts**
   - ContextBundle interface
   - buildContextBundle() function
   - Simple implementation: include all changed files, last test output
   - No episode memory yet (Phase 2)

3. **tools/jispec/implement/implement-runner.ts**
   - ImplementRunOptions interface
   - ImplementRunResult interface
   - runImplement() function with basic loop:
     - Load change session
     - Resolve test command
     - Run preflight test
     - Initialize budget controller
     - Iteration loop: build context → generate code → run tests → check budget
     - Return result

4. **tools/jispec/implement/test-runner.ts**
   - TestResult interface
   - runTestCommand() function
   - Parse test output for pass/fail
   - Capture stdout/stderr

### Testing
- Unit tests for BudgetController
- Unit tests for context pruning
- Integration test: Run 1 iteration and verify budget tracking
- Integration test: Stop after max iterations

### Deliverables
- ✅ Basic FSM runs 1 iteration
- ✅ Budget controller tracks iterations
- ✅ Context bundle includes changed files and test output
- ✅ Integration with change session works

## Phase 2: Stall Detection (Week 2)

### Objectives
- Implement stall detection rules
- Add episode memory tracking
- Enhance context pruning with episode memory
- Stop early when AI is stuck

### Files to Create

1. **tools/jispec/implement/episode-memory.ts**
   - EpisodeMemory interface
   - Episode interface (hypothesis, outcome, changedFiles)
   - addEpisode() function
   - getRecentHypotheses() function
   - getRejectedPaths() function

2. **tools/jispec/implement/stall-detector.ts**
   - StallCheckResult interface
   - StallDetector class
   - recordIteration() method
   - checkStall() method with rules:
     - Repeated failures: 3 consecutive failures with same error
     - Oscillation: Same file changed back/forth 2+ times
     - No progress: 5 iterations with no new files

### Files to Modify

1. **tools/jispec/implement/context-pruning.ts**
   - Add episodeMemory to ContextBundle
   - Include last 5 hypotheses
   - Include rejected paths

2. **tools/jispec/implement/implement-runner.ts**
   - Initialize StallDetector
   - Initialize EpisodeMemory
   - Check stall after each iteration
   - Stop if stalled
   - Update episode memory after each iteration

### Testing
- Unit tests for StallDetector (all 3 stall types)
- Unit tests for EpisodeMemory
- Integration test: Detect repeated failures
- Integration test: Detect oscillation
- Integration test: Detect no progress

### Deliverables
- ✅ Stall detector identifies repeated failures
- ✅ Stall detector identifies oscillation
- ✅ Stall detector identifies no progress
- ✅ Episode memory tracks hypotheses and rejected paths
- ✅ FSM stops early when stalled

## Phase 3: Handoff Packet (Week 3)

### Objectives
- Generate actionable handoff packet
- Persist handoff packet to disk
- Provide clear next steps for human

### Files to Create

1. **tools/jispec/implement/handoff-packet.ts**
   - HandoffPacket interface
   - generateHandoffPacket() function
   - writeHandoffPacket() function
   - readHandoffPacket() function
   - Storage: .jispec/handoff/{sessionId}.json

### Files to Modify

1. **tools/jispec/implement/implement-runner.ts**
   - Generate handoff packet on budget exhausted
   - Generate handoff packet on stall detected
   - Write handoff packet to disk
   - Include handoff packet in result

### Testing
- Unit tests for handoff packet generation
- Integration test: Generate handoff on budget exhausted
- Integration test: Generate handoff on stall detected
- Verify handoff packet contains actionable information

### Deliverables
- ✅ Handoff packet generated on failure
- ✅ Handoff packet persisted to disk
- ✅ Handoff packet includes what worked, what failed, next steps
- ✅ Handoff packet includes episode memory

## Phase 4: Polish & Integration (Week 4)

### Objectives
- CLI integration
- Test command resolution
- Documentation
- End-to-end testing

### Files to Create

1. **tools/jispec/implement/test-command-resolver.ts**
   - resolveTestCommand() function
   - Resolution order: explicit option → session hint → package.json → default
   - runPreflightTest() function

2. **scripts/test-task-pack-8.ts**
   - Comprehensive test script
   - Test all scenarios: success, budget exhausted, stall detected
   - Test all stall types
   - Test handoff packet generation

3. **docs/task-pack-8-usage.md**
   - Usage examples
   - CLI options
   - Troubleshooting guide

### Files to Modify

1. **tools/jispec/cli.ts**
   - Add implement command
   - Options: session-id, test-command, max-iterations, max-tokens, max-cost, json
   - Register implement command

2. **tools/jispec/implement/implement-runner.ts**
   - Use test-command-resolver
   - Add JSON output option
   - Add verbose logging option

### Testing
- End-to-end test: Simple feature (success)
- End-to-end test: Complex feature (budget exhausted)
- End-to-end test: Oscillating changes (stall detected)
- CLI integration test

### Deliverables
- ✅ CLI command: `jispec-cli implement`
- ✅ Test command resolution works
- ✅ Documentation complete
- ✅ All end-to-end tests pass

## Implementation Checklist

### Week 1: Core FSM
- [ ] Create budget-controller.ts
- [ ] Create context-pruning.ts (simple version)
- [ ] Create test-runner.ts
- [ ] Create implement-runner.ts (basic loop)
- [ ] Write unit tests for budget controller
- [ ] Write integration tests for basic FSM
- [ ] Verify integration with change session

### Week 2: Stall Detection
- [ ] Create episode-memory.ts
- [ ] Create stall-detector.ts
- [ ] Enhance context-pruning.ts with episode memory
- [ ] Update implement-runner.ts with stall detection
- [ ] Write unit tests for stall detector
- [ ] Write unit tests for episode memory
- [ ] Write integration tests for all stall types

### Week 3: Handoff Packet
- [ ] Create handoff-packet.ts
- [ ] Update implement-runner.ts to generate handoff
- [ ] Write unit tests for handoff generation
- [ ] Write integration tests for handoff scenarios
- [ ] Verify handoff packet is actionable

### Week 4: Polish & Integration
- [ ] Create test-command-resolver.ts
- [ ] Update cli.ts with implement command
- [ ] Create test-task-pack-8.ts
- [ ] Create task-pack-8-usage.md
- [ ] Write end-to-end tests
- [ ] Run full test suite
- [ ] Update main documentation

## Testing Strategy

### Unit Tests (Per Module)
- budget-controller: Budget tracking, limits, state
- context-pruning: Context bundle construction
- episode-memory: Episode tracking, retrieval
- stall-detector: All stall detection rules
- handoff-packet: Packet generation, persistence
- test-command-resolver: Resolution order, preflight

### Integration Tests (Per Phase)
- Phase 1: Basic FSM iteration loop
- Phase 2: Stall detection in FSM
- Phase 3: Handoff packet generation
- Phase 4: CLI integration

### End-to-End Tests (Full Workflow)
- Success scenario: Simple feature passes tests within budget
- Budget exhausted: Complex feature exceeds iteration limit
- Stall detected: Oscillating changes trigger early stop
- Preflight failure: Tests already pass, nothing to implement

## Success Metrics

### Code Quality
- All modules have >80% test coverage
- All unit tests pass
- All integration tests pass
- All end-to-end tests pass

### Functionality
- FSM completes success scenario in <5 iterations
- Budget controller enforces all limits correctly
- Stall detector catches all stall types
- Handoff packet provides actionable next steps

### Integration
- Works seamlessly with Task Pack 7 change session
- CLI command is intuitive and well-documented
- Error messages are clear and helpful

## Risk Mitigation

### Risk 1: LLM Code Generation Quality
- **Mitigation**: Start with simple test cases
- **Fallback**: Handoff packet provides human takeover path

### Risk 2: Test Command Variability
- **Mitigation**: Test command resolver with fallback chain
- **Fallback**: Allow explicit test command override

### Risk 3: Context Size Explosion
- **Mitigation**: Strict context pruning rules (max 5000 lines)
- **Fallback**: Truncate if exceeds limit

### Risk 4: Budget Estimation Accuracy
- **Mitigation**: Conservative default limits
- **Fallback**: Allow user to override limits

## Post-Implementation Tasks

After Task Pack 8 is complete:

1. **Documentation**
   - Update main README with implement command
   - Add implement workflow to architecture docs
   - Create troubleshooting guide

2. **Integration Testing**
   - Test with real-world features
   - Gather feedback on handoff packet quality
   - Tune stall detection thresholds

3. **Performance Optimization**
   - Profile context building time
   - Optimize test command execution
   - Cache unchanged file contents

4. **Future Enhancements** (Task Pack 9+)
   - Slice-aware implementation
   - Multi-agent collaboration
   - Impact analysis integration
   - Dynamic budget adjustment

## Appendix: File Structure

```
tools/jispec/implement/
├── implement-runner.ts          # Main orchestrator (Phase 1, 2, 3, 4)
├── budget-controller.ts         # Budget tracking (Phase 1)
├── context-pruning.ts           # Context builder (Phase 1, 2)
├── test-runner.ts               # Test execution (Phase 1)
├── episode-memory.ts            # Episode tracking (Phase 2)
├── stall-detector.ts            # Stall detection (Phase 2)
├── handoff-packet.ts            # Handoff generation (Phase 3)
└── test-command-resolver.ts     # Test command resolution (Phase 4)

scripts/
└── test-task-pack-8.ts          # Test script (Phase 4)

docs/
├── task-pack-8-design.md        # Design document
├── task-pack-8-implementation-plan.md  # This document
└── task-pack-8-usage.md         # Usage guide (Phase 4)

.jispec/
├── change-session.json          # Active change session (Task Pack 7)
└── handoff/                     # Handoff packets (Phase 3)
    └── {sessionId}.json
```

## Appendix: Dependencies

### Task Pack 7 Dependencies
- ChangeSession interface
- readChangeSession() function
- Change session storage format

### External Dependencies
- Node.js child_process for test execution
- TypeScript for type safety
- Existing test infrastructure

### No New External Packages
- Use only Node.js built-ins
- No new npm dependencies
- Keep implementation lightweight
