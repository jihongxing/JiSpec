# Task Pack 7 Implementation Summary

## Overview

Task Pack 7 implements the Change Command and Fast Lane functionality for the JiSpec verify system. This enables developers to record change intent, automatically classify changes as fast or strict lane, and run lightweight verification for safe changes while maintaining strict verification for critical paths.

## Files Created

### Change Management Layer

1. **tools/jispec/change/git-diff-classifier.ts**
   - Classifies changed paths from git diff
   - Functions: getChangedPaths, classifyPath, classifyGitDiff
   - Classification rules: contract, domain_core, api_surface, behavior_surface, test_only, docs_only, config, unknown
   - Fast lane eligibility: Only docs_only and test_only changes

2. **tools/jispec/change/lane-decision.ts**
   - Computes lane decision from git diff classification
   - Functions: computeLaneDecision, renderLaneDecisionText
   - Decision logic: auto-promotion from fast to strict when needed

3. **tools/jispec/change/change-session.ts**
   - Manages change session persistence
   - Functions: writeChangeSession, readChangeSession, archiveChangeSession, clearChangeSession, generateSessionId
   - Session storage: .jispec/change-session.json (active), .jispec/change-sessions/ (archived)

4. **tools/jispec/change/change-command.ts**
   - Main change command implementation
   - Functions: runChangeCommand, renderChangeCommandText, renderChangeCommandJSON
   - Workflow: classify diff → compute lane → build hints → persist session → render output

## Files Modified

1. **tools/jispec/verify/verify-runner.ts**
   - Added fast flag to VerifyRunOptions
   - Added checkFastLaneEligibility function
   - Refactored runVerify to handle fast lane with auto-promotion

2. **tools/jispec/cli.ts**
   - Added change command with options: summary, lane, slice, context, base-ref, json
   - Added --fast flag to verify command
   - Registered change command in buildProgram

## Usage Examples

Change command:
```bash
npm run jispec-cli -- change "Add order refund feature"
npm run jispec-cli -- change "Fix typo in README" --lane fast
```

Fast lane verify:
```bash
npm run jispec-cli -- verify --fast
```

## Key Design Principles

1. Conservative Fast Lane - Only docs and tests eligible
2. Auto-Promotion Safety - System can override user request
3. Local vs CI Separation - Fast lane for local only, CI runs full verify
4. Session Persistence - Active and archived sessions
5. Deterministic Classification - Path-based rules, no AST

## Testing

Test script: scripts/test-task-pack-7.ts
Tests: path classification, git diff, lane decision, change command, session persistence, auto-promotion

## Integration

Builds on Task Packs 4, 5, 6. Complete pipeline: Change Intent → Lane Decision → Verify → Facts → Policy → Waivers → Baseline → Observe → Report → CI Output
