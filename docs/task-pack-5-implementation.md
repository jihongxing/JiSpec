# Task Pack 5 Implementation Summary

## Overview

Task Pack 5 implements the Facts Contract and YAML Policy DSL for the JiSpec verify system. This establishes a stable contract layer between fact producers and policy consumers, enabling rule-based governance without hardcoded logic.

## Files Created

### Facts Layer

1. **tools/jispec/facts/raw-facts.ts**
   - Defines raw facts snapshot structure
   - Provides functions to create, add, and sort raw facts
   - Raw facts are the unstable layer that can evolve

2. **tools/jispec/facts/canonical-facts.ts**
   - Defines canonical facts contract (stable interface)
   - Maps raw facts to canonical facts
   - Provides default values for missing stable facts
   - Current stable facts:
     - verify.issue_count
     - verify.blocking_issue_count
     - verify.issue_codes
     - contracts.domain.present
     - contracts.api.present
     - contracts.behavior.present
   - Beta facts (defined but may not be available):
     - api.new_endpoints
     - openapi.breaking_changes
     - bdd.missing_scenarios
     - git.changed_paths

3. **tools/jispec/facts/facts-contract.ts**
   - Manages facts contract versioning
   - Computes contract hash for compatibility checking
   - Validates policy uses only stable facts

### Policy Layer

4. **tools/jispec/policy/policy-schema.ts**
   - Defines policy DSL structure
   - Supports conditions: all, any, not, fact
   - Supports operators: ==, !=, >, >=, <, <=, contains, in
   - Supports actions: pass, warn, fail_blocking
   - Validates policy structure

5. **tools/jispec/policy/policy-loader.ts**
   - Loads policy from YAML files
   - Default path: .spec/policy.yaml
   - Validates policy on load

6. **tools/jispec/policy/policy-engine.ts**
   - Evaluates policy conditions against canonical facts
   - Converts matched rules to verify issues
   - Supports nested conditions (all/any/not)

## Files Modified

1. tools/jispec/verify/verify-runner.ts
2. tools/jispec/cli.ts

## Usage Examples

Basic verify with policy:
npm run jispec-cli -- verify --policy .spec/policy.yaml

Output facts:
npm run jispec-cli -- verify --facts-out .spec/facts/latest-canonical.json

Combined with baseline and policy:
npm run jispec-cli -- verify --baseline --policy .spec/policy.yaml

Full stack:
npm run jispec-cli -- verify --policy .spec/policy.yaml --baseline --observe

## Processing Pipeline

1. Raw Verify - Collect issues from validators
2. Build Raw Facts - Extract facts from verify result
3. Build Canonical Facts - Map to stable contract
4. Write Facts (optional) - Output to disk
5. Apply Policy (optional) - Evaluate rules and generate issues
6. Apply Waivers - Downgrade waived issues
7. Apply Baseline - Downgrade baselined issues
8. Apply Observe Mode - Downgrade blocking issues

## Key Design Principles

1. Separation of Concerns
   - Raw facts (unstable, can evolve)
   - Canonical facts (stable contract)
   - Policy (only reads canonical facts)

2. Contract Versioning
   - Facts contract has version number
   - Policy can require specific contract version

3. Stability Levels
   - stable - Guaranteed to be available
   - beta - Defined but may not be available
   - experimental - May change

4. Policy DSL
   - Declarative YAML format
   - Composable conditions
   - Clear action semantics

## Testing

Test script created at scripts/test-task-pack-5.ts
Example policy created at .spec/policy.yaml
